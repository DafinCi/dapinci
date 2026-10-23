// Phase 2A: Toolchain & Direct Binary Resolver (`verifier/detector.rs`).
//
// Resolves direct binary paths (`node.exe` + `./node_modules/typescript/bin/tsc`,
// `./node_modules/.bin/tsc.cmd`, `cargo.exe`) and detects test runners
// (`Vitest`, `Jest`, `NpmTest`, `CargoTest`) without `npx` overhead.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::platform;
use crate::workspace::{clean_absolute_path, detect_node_package_manager};

/// Executable invocation specification ready for `Command::new(&spec.program)`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    pub program: PathBuf,
    pub prefix_args: Vec<String>,
    pub working_dir: PathBuf,
}

/// Detected test runner framework.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TestRunnerKind {
    Vitest,
    Jest,
    NpmTest,
    CargoTest,
}

/// Complete toolchain resolution for a workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedToolchain {
    /// Root directory of the workspace.
    pub workspace_dir: PathBuf,
    /// Direct TypeScript compiler command (`node.exe .../tsc` or `tsc.cmd`), if TS is used.
    pub typescript: Option<CommandSpec>,
    /// Direct Cargo binary and manifest directory, if Rust is used.
    pub rust_cargo: Option<CommandSpec>,
    /// Detected Node test runner, if any.
    pub node_test_runner: Option<(TestRunnerKind, CommandSpec)>,
    /// Detected Rust test runner (`cargo test --lib`), if any.
    pub rust_test_runner: Option<(TestRunnerKind, CommandSpec)>,
}

/// Finds `node.exe` (Windows) or `node` (Unix) on PATH or well-known install locations.
pub fn find_node_binary() -> Option<PathBuf> {
    if let Some(p) = platform::find_on_path("node") {
        return Some(p);
    }
    #[cfg(windows)]
    {
        let mut candidates = Vec::new();
        if let Some(pf) = std::env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(pf).join("nodejs").join("node.exe"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let local = PathBuf::from(local);
            candidates.push(local.join("Volta").join("bin").join("node.exe"));
            candidates.push(local.join("fnm_multishells").join("node.exe"));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            candidates.push(PathBuf::from(appdata).join("nvm").join("node.exe"));
        }
        for c in candidates {
            if c.is_file() {
                return Some(c);
            }
        }
    }
    None
}

/// Finds `cargo.exe` (Windows) or `cargo` (Unix) on PATH or `~/.cargo/bin`.
pub fn find_cargo_binary() -> Option<PathBuf> {
    if let Some(p) = platform::find_on_path("cargo") {
        return Some(p);
    }
    let home = platform::home_dir();
    #[cfg(windows)]
    let candidate = home.join(".cargo").join("bin").join("cargo.exe");
    #[cfg(not(windows))]
    let candidate = home.join(".cargo").join("bin").join("cargo");

    candidate.is_file().then_some(candidate)
}

/// Searches `dir` and up to 2 ancestor directories (for monorepo hoisted `node_modules`)
/// for a relative path inside `node_modules`.
fn find_in_node_modules(dir: &Path, rel_inside_nm: &str) -> Option<PathBuf> {
    let mut cursor = Some(dir);
    for _ in 0..3 {
        let Some(curr) = cursor else { break };
        let candidate = curr.join("node_modules").join(rel_inside_nm);
        if candidate.is_file() {
            return Some(candidate);
        }
        cursor = curr.parent();
    }
    None
}

/// Resolves the TypeScript compiler in `dir` (preferring `node.exe` + `typescript/bin/tsc`
/// to avoid `.cmd` shell wrapper overhead, with fallback to `.bin/tsc.cmd` or `.bin/tsc`).
pub fn resolve_tsc_in_dir(dir: &Path, node_bin: Option<&Path>) -> Option<CommandSpec> {
    let has_tsconfig = dir.join("tsconfig.json").is_file();
    let js_tsc = find_in_node_modules(dir, "typescript/bin/tsc")
        .or_else(|| find_in_node_modules(dir, "typescript/lib/tsc.js"));

    if let Some(tsc_script) = js_tsc {
        if let Some(node) = node_bin {
            return Some(CommandSpec {
                program: node.to_path_buf(),
                prefix_args: vec![tsc_script.to_string_lossy().to_string()],
                working_dir: dir.to_path_buf(),
            });
        }
    }

    #[cfg(windows)]
    let bin_rel = ".bin/tsc.cmd";
    #[cfg(not(windows))]
    let bin_rel = ".bin/tsc";

    if let Some(bin_path) = find_in_node_modules(dir, bin_rel) {
        return Some(CommandSpec {
            program: bin_path,
            prefix_args: Vec::new(),
            working_dir: dir.to_path_buf(),
        });
    }

    // Even if `node_modules` is only present via unix shim in tests, check `.bin/tsc`
    if let Some(bin_path) = find_in_node_modules(dir, ".bin/tsc") {
        return Some(CommandSpec {
            program: bin_path,
            prefix_args: Vec::new(),
            working_dir: dir.to_path_buf(),
        });
    }

    // If `tsconfig.json` exists and global `tsc` is on PATH, use it as last fallback
    if has_tsconfig {
        if let Some(global_tsc) = platform::find_on_path("tsc") {
            return Some(CommandSpec {
                program: global_tsc,
                prefix_args: Vec::new(),
                working_dir: dir.to_path_buf(),
            });
        }
    }

    None
}

/// Detects the Node test runner (`Vitest`, `Jest`, or `NpmTest`) from `package.json`
/// and `node_modules` in `dir`.
pub fn detect_node_test_runner(
    dir: &Path,
    node_bin: Option<&Path>,
) -> Option<(TestRunnerKind, CommandSpec)> {
    let pkg_path = dir.join("package.json");
    let pkg_json: Value = std::fs::read_to_string(&pkg_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())?;

    let has_dep = |name: &str| -> bool {
        pkg_json
            .get("devDependencies")
            .and_then(|d| d.get(name))
            .is_some()
            || pkg_json
                .get("dependencies")
                .and_then(|d| d.get(name))
                .is_some()
    };

    let test_script = pkg_json
        .get("scripts")
        .and_then(|s| s.get("test"))
        .and_then(Value::as_str)
        .unwrap_or_default();

    // 1. Vitest
    if has_dep("vitest")
        || test_script.contains("vitest")
        || find_in_node_modules(dir, "vitest/vitest.mjs").is_some()
        || find_in_node_modules(dir, ".bin/vitest.cmd").is_some()
        || find_in_node_modules(dir, ".bin/vitest").is_some()
    {
        if let (Some(node), Some(script)) =
            (node_bin, find_in_node_modules(dir, "vitest/vitest.mjs"))
        {
            return Some((
                TestRunnerKind::Vitest,
                CommandSpec {
                    program: node.to_path_buf(),
                    prefix_args: vec![script.to_string_lossy().to_string()],
                    working_dir: dir.to_path_buf(),
                },
            ));
        }
        #[cfg(windows)]
        let vitest_bin = find_in_node_modules(dir, ".bin/vitest.cmd")
            .or_else(|| find_in_node_modules(dir, ".bin/vitest"));
        #[cfg(not(windows))]
        let vitest_bin = find_in_node_modules(dir, ".bin/vitest");

        if let Some(bin) = vitest_bin {
            return Some((
                TestRunnerKind::Vitest,
                CommandSpec {
                    program: bin,
                    prefix_args: Vec::new(),
                    working_dir: dir.to_path_buf(),
                },
            ));
        }
        let pm = detect_node_package_manager(dir);
        return Some((
            TestRunnerKind::Vitest,
            CommandSpec {
                program: platform::find_on_path(&pm).unwrap_or_else(|| PathBuf::from(&pm)),
                prefix_args: vec!["exec".to_string(), "vitest".to_string()],
                working_dir: dir.to_path_buf(),
            },
        ));
    }

    // 2. Jest
    if has_dep("jest")
        || test_script.contains("jest")
        || find_in_node_modules(dir, "jest/bin/jest.js").is_some()
        || find_in_node_modules(dir, ".bin/jest.cmd").is_some()
        || find_in_node_modules(dir, ".bin/jest").is_some()
    {
        if let (Some(node), Some(script)) = (node_bin, find_in_node_modules(dir, "jest/bin/jest.js"))
        {
            return Some((
                TestRunnerKind::Jest,
                CommandSpec {
                    program: node.to_path_buf(),
                    prefix_args: vec![script.to_string_lossy().to_string()],
                    working_dir: dir.to_path_buf(),
                },
            ));
        }
        #[cfg(windows)]
        let jest_bin = find_in_node_modules(dir, ".bin/jest.cmd")
            .or_else(|| find_in_node_modules(dir, ".bin/jest"));
        #[cfg(not(windows))]
        let jest_bin = find_in_node_modules(dir, ".bin/jest");

        if let Some(bin) = jest_bin {
            return Some((
                TestRunnerKind::Jest,
                CommandSpec {
                    program: bin,
                    prefix_args: Vec::new(),
                    working_dir: dir.to_path_buf(),
                },
            ));
        }
        let pm = detect_node_package_manager(dir);
        return Some((
            TestRunnerKind::Jest,
            CommandSpec {
                program: platform::find_on_path(&pm).unwrap_or_else(|| PathBuf::from(&pm)),
                prefix_args: vec!["exec".to_string(), "jest".to_string()],
                working_dir: dir.to_path_buf(),
            },
        ));
    }

    // 3. Generic `npm test` (if a real test script is configured)
    if !test_script.is_empty() && !test_script.contains("no test specified") {
        let pm = detect_node_package_manager(dir);
        let pm_bin = platform::find_on_path(&pm).unwrap_or_else(|| PathBuf::from(pm));
        return Some((
            TestRunnerKind::NpmTest,
            CommandSpec {
                program: pm_bin,
                prefix_args: vec!["test".to_string()],
                working_dir: dir.to_path_buf(),
            },
        ));
    }

    None
}

/// Locates the directory containing `Cargo.toml` (checking `dir`, `dir/src-tauri`,
/// `dir/windows`, or immediate subdirectories).
pub fn find_rust_manifest_dir(dir: &Path) -> Option<PathBuf> {
    if dir.join("Cargo.toml").is_file() {
        return Some(dir.to_path_buf());
    }
    for sub in ["src-tauri", "windows", "rust", "core", "backend"] {
        let candidate = dir.join(sub);
        if candidate.join("Cargo.toml").is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Locates the directory containing `package.json` (checking `dir` or `dir/windows`, `dir/app`, etc.).
pub fn find_node_manifest_dir(dir: &Path) -> Option<PathBuf> {
    if dir.join("package.json").is_file() {
        return Some(dir.to_path_buf());
    }
    for sub in ["windows", "app", "web", "frontend", "client"] {
        let candidate = dir.join(sub);
        if candidate.join("package.json").is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Detects all available toolchains and test runners for `workspace_path`.
pub fn detect_toolchain(workspace_path: &Path) -> DetectedToolchain {
    let root = clean_absolute_path(workspace_path);
    let node_bin = find_node_binary();

    let node_dir = find_node_manifest_dir(&root);
    let typescript = node_dir
        .as_deref()
        .and_then(|d| resolve_tsc_in_dir(d, node_bin.as_deref()));
    let node_test_runner = node_dir
        .as_deref()
        .and_then(|d| detect_node_test_runner(d, node_bin.as_deref()));

    let rust_dir = find_rust_manifest_dir(&root);
    let cargo_bin = find_cargo_binary().unwrap_or_else(|| PathBuf::from("cargo"));
    let rust_cargo = rust_dir.as_ref().map(|d| CommandSpec {
        program: cargo_bin.clone(),
        prefix_args: Vec::new(),
        working_dir: d.clone(),
    });
    let rust_test_runner = rust_dir.map(|d| {
        (
            TestRunnerKind::CargoTest,
            CommandSpec {
                program: cargo_bin,
                prefix_args: Vec::new(),
                working_dir: d,
            },
        )
    });

    DetectedToolchain {
        workspace_dir: root,
        typescript,
        rust_cargo,
        node_test_runner,
        rust_test_runner,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_direct_node_tsc_script_and_vitest() {
        let tmp = std::env::temp_dir().join(format!("dapinci-det-ts-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let tsc_dir = tmp.join("node_modules").join("typescript").join("bin");
        let vitest_dir = tmp.join("node_modules").join("vitest");
        std::fs::create_dir_all(&tsc_dir).unwrap();
        std::fs::create_dir_all(&vitest_dir).unwrap();

        std::fs::write(tsc_dir.join("tsc"), "// tsc entry").unwrap();
        std::fs::write(vitest_dir.join("vitest.mjs"), "// vitest entry").unwrap();
        std::fs::write(tmp.join("tsconfig.json"), "{}").unwrap();
        std::fs::write(
            tmp.join("package.json"),
            r#"{"name":"app","devDependencies":{"vitest":"^1.0.0","typescript":"^5.0.0"}}"#,
        )
        .unwrap();

        let fake_node = PathBuf::from("node");
        let tsc_spec = resolve_tsc_in_dir(&tmp, Some(&fake_node)).expect("tsc resolved");
        assert_eq!(tsc_spec.program, fake_node);
        assert!(tsc_spec.prefix_args[0].ends_with("tsc"));

        let (runner_kind, runner_spec) =
            detect_node_test_runner(&tmp, Some(&fake_node)).expect("vitest resolved");
        assert_eq!(runner_kind, TestRunnerKind::Vitest);
        assert_eq!(runner_spec.program, fake_node);
        assert!(runner_spec.prefix_args[0].ends_with("vitest.mjs"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolves_jest_and_npm_test_fallback() {
        let tmp = std::env::temp_dir().join(format!("dapinci-det-jest-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(
            tmp.join("package.json"),
            r#"{"name":"jest-app","devDependencies":{"jest":"^29.0.0"}}"#,
        )
        .unwrap();

        let (kind, _) = detect_node_test_runner(&tmp, None).expect("jest detected");
        assert_eq!(kind, TestRunnerKind::Jest);

        std::fs::write(
            tmp.join("package.json"),
            r#"{"name":"node-test-app","scripts":{"test":"node --test tests/*.mjs"}}"#,
        )
        .unwrap();
        let (kind2, _) = detect_node_test_runner(&tmp, None).expect("npm test detected");
        assert_eq!(kind2, TestRunnerKind::NpmTest);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn detects_hybrid_monorepo_rust_and_node_toolchains() {
        let tmp = std::env::temp_dir().join(format!("dapinci-det-hybrid-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let win_dir = tmp.join("windows");
        std::fs::create_dir_all(&win_dir).unwrap();
        std::fs::write(win_dir.join("Cargo.toml"), "[workspace]\nmembers = []").unwrap();
        std::fs::write(
            win_dir.join("package.json"),
            r#"{"scripts":{"test":"node --test"}}"#,
        )
        .unwrap();

        let detected = detect_toolchain(&tmp);
        assert!(detected.rust_cargo.is_some());
        assert_eq!(detected.rust_cargo.unwrap().working_dir, clean_absolute_path(&win_dir));
        assert!(detected.node_test_runner.is_some());

        let _ = std::fs::remove_dir_all(&tmp);
    }
}

