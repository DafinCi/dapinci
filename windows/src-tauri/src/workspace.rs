// Phase 1: CLI Workspace Binding & Monorepo/Subfolder Discovery.
//
// Binds DapinCi to a target development workspace (`dapinci .` or
// `dapinci path/to/project`) via the existing single-instance IPC callback,
// resolving monorepo subdirectories, git branch, project type, and package manager.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::island::WINDOW_LABEL;
use crate::log;
use crate::platform;

/// Detected primary project ecosystem in the workspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectType {
    NodeTs,
    Rust,
    Unknown,
}

impl Default for ProjectType {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Snapshot of the currently bound workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    /// Absolute path to the resolved project directory (may be an immediate
    /// monorepo subfolder if the root had no manifest).
    pub path: PathBuf,
    /// Display name of the repository or workspace folder.
    pub name: String,
    /// Active git branch name (or short SHA if detached).
    pub branch: Option<String>,
    /// Primary project type (`nodeTs`, `rust`, `unknown`).
    pub project_type: ProjectType,
    /// Detected package manager (`pnpm`, `npm`, `yarn`, `bun`, `cargo`).
    pub package_manager: Option<String>,
}

/// Thread-safe workspace state managed by Tauri.
#[derive(Default)]
pub struct WorkspaceState {
    inner: Mutex<Option<WorkspaceInfo>>,
}

impl WorkspaceState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn get(&self) -> Option<WorkspaceInfo> {
        self.inner.lock().ok().and_then(|guard| guard.clone())
    }

    pub fn set(&self, info: WorkspaceInfo) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = Some(info);
        }
    }
}

/// Normalizes a path into an absolute, verbatim-free (`\\?\` stripped) `PathBuf`.
pub fn clean_absolute_path(path: &Path) -> PathBuf {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .unwrap_or_else(|_| path.to_path_buf())
    };
    let canon = std::fs::canonicalize(&abs).unwrap_or(abs);
    #[cfg(windows)]
    {
        let s = canon.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{stripped}"));
        }
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    canon
}

/// Inspects a single directory (non-recursively) to see if it hosts a Node/TS or Rust manifest.
fn classify_dir(dir: &Path) -> Option<(ProjectType, Option<String>)> {
    let has_pkg_json = dir.join("package.json").is_file();
    let has_cargo = dir.join("Cargo.toml").is_file();

    if has_pkg_json {
        let pm = detect_node_package_manager(dir);
        return Some((ProjectType::NodeTs, Some(pm)));
    }
    if has_cargo {
        return Some((ProjectType::Rust, Some("cargo".to_string())));
    }
    None
}

/// Detects the Node package manager from lockfiles in `dir` or its immediate parent.
pub fn detect_node_package_manager(dir: &Path) -> String {
    for check_dir in [Some(dir), dir.parent()].into_iter().flatten() {
        if check_dir.join("pnpm-lock.yaml").is_file() || check_dir.join("pnpm-workspace.yaml").is_file() {
            return "pnpm".to_string();
        }
        if check_dir.join("bun.lockb").is_file() || check_dir.join("bun.lock").is_file() {
            return "bun".to_string();
        }
        if check_dir.join("yarn.lock").is_file() {
            return "yarn".to_string();
        }
        if check_dir.join("package-lock.json").is_file() {
            return "npm".to_string();
        }
    }
    "npm".to_string()
}

/// Priority order for immediate subdirectory discovery in monorepos / hybrid repos
/// (e.g. DapinCi itself has its code under `windows/`).
const PRIORITY_SUBDIRS: &[&str] = &[
    "windows",
    "src-tauri",
    "app",
    "web",
    "frontend",
    "client",
    "backend",
    "server",
    "core",
];

/// Discovers the effective project directory and its project type.
/// If `root` does not directly contain `package.json` or `Cargo.toml`, scans
/// immediate subdirectories (1 level deep).
pub fn discover_project_dir(root: &Path) -> (PathBuf, ProjectType, Option<String>) {
    let root = clean_absolute_path(root);
    if let Some((pt, pm)) = classify_dir(&root) {
        return (root, pt, pm);
    }

    // 1. Check well-known priority subdirectories first.
    for &sub in PRIORITY_SUBDIRS {
        let candidate = root.join(sub);
        if candidate.is_dir() {
            if let Some((pt, pm)) = classify_dir(&candidate) {
                return (clean_absolute_path(&candidate), pt, pm);
            }
        }
    }

    // 2. Scan remaining immediate subdirectories in deterministic alphabetical order.
    if let Ok(entries) = std::fs::read_dir(&root) {
        let mut subdirs: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.is_dir()
                    && p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|name| {
                            !name.starts_with('.')
                                && name != "node_modules"
                                && name != "target"
                                && name != "dist"
                                && name != "plans"
                        })
            })
            .collect();
        subdirs.sort();

        for candidate in subdirs {
            if let Some((pt, pm)) = classify_dir(&candidate) {
                return (clean_absolute_path(&candidate), pt, pm);
            }
        }
    }

    (root, ProjectType::Unknown, None)
}

/// Resolves the active Git branch for `dir` without flashing a console window.
/// Reads `.git/HEAD` directly in-memory first (~0.05ms), falling back to `git`.
pub fn detect_git_branch(dir: &Path) -> Option<String> {
    // Walk up ancestors to find `.git`
    let mut cursor = Some(dir);
    while let Some(current) = cursor {
        let dot_git = current.join(".git");
        let head_path = if dot_git.is_dir() {
            Some(dot_git.join("HEAD"))
        } else if dot_git.is_file() {
            // Worktree or submodule `.git` file pointing to `gitdir: ...`
            std::fs::read_to_string(&dot_git)
                .ok()
                .and_then(|content| {
                    content
                        .lines()
                        .find_map(|l| l.strip_prefix("gitdir:"))
                        .map(str::trim)
                        .map(|rel| current.join(rel).join("HEAD"))
                })
        } else {
            None
        };

        if let Some(head_file) = head_path {
            if let Ok(head_text) = std::fs::read_to_string(&head_file) {
                let trimmed = head_text.trim();
                if let Some(reference) = trimmed.strip_prefix("ref: refs/heads/") {
                    if !reference.is_empty() {
                        return Some(reference.to_string());
                    }
                } else if trimmed.len() >= 7 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Some(trimmed[..7].to_string());
                }
            }
        }
        cursor = current.parent();
    }

    // Fallback to `git rev-parse --abbrev-ref HEAD` with CREATE_NO_WINDOW
    let mut cmd = Command::new("git");
    cmd.args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(dir);
    let output = platform::no_console(&mut cmd).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!branch.is_empty()).then_some(branch)
}

/// Builds a `WorkspaceInfo` from a target directory path, applying monorepo
/// subfolder discovery and git branch resolution.
pub fn resolve_workspace(target_path: &Path) -> Option<WorkspaceInfo> {
    if !target_path.exists() {
        return None;
    }
    let base_dir = if target_path.is_file() {
        target_path.parent()?
    } else {
        target_path
    };
    let clean_base = clean_absolute_path(base_dir);
    if !clean_base.is_dir() {
        return None;
    }

    let (project_path, project_type, package_manager) = discover_project_dir(&clean_base);
    let branch = detect_git_branch(&project_path).or_else(|| detect_git_branch(&clean_base));

    // Prefer the top-level bound folder name (e.g. `dapinci` when binding `c:\projects\dapinci`
    // even if manifest is in `windows/`), falling back to `project_path` folder name.
    let name = clean_base
        .file_name()
        .or_else(|| project_path.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());

    Some(WorkspaceInfo {
        path: project_path,
        name,
        branch,
        project_type,
        package_manager,
    })
}

/// Extracts a workspace path from single-instance `argv` and `cwd`.
pub fn path_from_cli(argv: &[String], cwd: &str) -> Option<PathBuf> {
    let cwd_path = if cwd.trim().is_empty() {
        std::env::current_dir().ok()
    } else {
        Some(PathBuf::from(cwd))
    };

    // Look for an explicit positional path argument after argv[0]
    let mut skip_next = false;
    for arg in argv.iter().skip(1) {
        if skip_next {
            skip_next = false;
            continue;
        }
        if arg == "--shortcut" || arg == "--agent" {
            skip_next = true;
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        let candidate = Path::new(arg);
        let resolved = if candidate.is_absolute() {
            candidate.to_path_buf()
        } else if let Some(base) = &cwd_path {
            base.join(candidate)
        } else {
            candidate.to_path_buf()
        };
        if resolved.exists() {
            return Some(clean_absolute_path(&resolved));
        }
    }

    // If invoked without positional args, bind `cwd` if it is a recognizable project
    if let Some(base) = cwd_path {
        if base.is_dir() {
            let (_, pt, _) = discover_project_dir(&base);
            if pt != ProjectType::Unknown || base.join(".git").exists() {
                return Some(clean_absolute_path(&base));
            }
        }
    }

    None
}

/// Binds DapinCi to `target_path`, updates `Shared.workspace`, starts the
/// filtered file watcher, and emits `"workspace-changed"`.
pub fn bind_workspace(app: &AppHandle, target_path: &Path) -> Option<WorkspaceInfo> {
    let info = resolve_workspace(target_path)?;
    log::line(format!(
        "workspace bound: {} ({:?}, branch={:?}) at {}",
        info.name,
        info.project_type,
        info.branch,
        info.path.display()
    ));

    if let Some(shared) = app.try_state::<crate::Shared>() {
        shared.workspace.set(info.clone());
    }
    if let Some(ws_state) = app.try_state::<WorkspaceState>() {
        ws_state.set(info.clone());
    }

    // Start or retarget the filtered live file watcher for this workspace if verification is enabled.
    let enabled = app
        .try_state::<crate::Shared>()
        .and_then(|s| s.settings.lock().ok().map(|m| m.verification_enabled))
        .unwrap_or(false);
    if enabled {
        crate::verifier::watcher::watch_workspace(app.clone(), info.path.clone());
    } else {
        crate::verifier::watcher::stop_watching();
    }

    let _ = app.emit("workspace-changed", &info);
    let _ = app.emit_to(WINDOW_LABEL, "workspace-changed", &info);
    Some(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_direct_node_and_rust_projects() {
        let tmp = std::env::temp_dir().join(format!("dapinci-ws-direct-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("package.json"), r#"{"name":"demo"}"#).unwrap();
        std::fs::write(tmp.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'").unwrap();

        let info = resolve_workspace(&tmp).expect("should resolve");
        assert_eq!(info.project_type, ProjectType::NodeTs);
        assert_eq!(info.package_manager.as_deref(), Some("pnpm"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn discovers_monorepo_subfolder_when_root_has_no_manifest() {
        let tmp = std::env::temp_dir().join(format!("dapinci-ws-mono-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let win_sub = tmp.join("windows");
        std::fs::create_dir_all(&win_sub).unwrap();
        std::fs::write(win_sub.join("Cargo.toml"), "[package]\nname = \"sub\"").unwrap();

        let info = resolve_workspace(&tmp).expect("should resolve monorepo subfolder");
        assert_eq!(info.project_type, ProjectType::Rust);
        assert_eq!(info.package_manager.as_deref(), Some("cargo"));
        assert!(info.path.ends_with("windows"));
        assert!(info.name.contains("dapinci-ws-mono-"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn reads_git_branch_from_dot_git_head_in_memory() {
        let tmp = std::env::temp_dir().join(format!("dapinci-ws-git-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let git_dir = tmp.join(".git");
        std::fs::create_dir_all(&git_dir).unwrap();
        std::fs::write(git_dir.join("HEAD"), "ref: refs/heads/feat/verifier\n").unwrap();
        std::fs::write(tmp.join("Cargo.toml"), "[package]\nname = \"demo\"").unwrap();

        let info = resolve_workspace(&tmp).expect("should resolve");
        assert_eq!(info.branch.as_deref(), Some("feat/verifier"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn parses_dot_and_relative_paths_from_cli_argv() {
        let tmp = std::env::temp_dir().join(format!("dapinci-ws-cli-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("package.json"), "{}").unwrap();

        let cwd_str = tmp.to_string_lossy().to_string();
        let argv = vec!["dapinci.exe".to_string(), ".".to_string()];
        let resolved = path_from_cli(&argv, &cwd_str).expect("resolved '.'");
        assert_eq!(resolved, clean_absolute_path(&tmp));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}

