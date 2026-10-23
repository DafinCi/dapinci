// Phase 2D: Filtered File Watcher (`verifier/watcher.rs`).
//
// Uses `notify` with a 1.5-second debounce, strict source extension whitelist
// (`.ts`, `.tsx`, `.js`, `.jsx`, `.rs`, `.py`, `.go`), build/cache folder
// blacklist (`.git`, `node_modules`, `target`, `dist`, `.cache`, `.tsbuildinfo`),
// and `suppress(true/false)` to freeze live triggers while an AI agent is mid-edit.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

use crate::log;

use super::runner::{run_verification_pipeline, TriggerSource};

/// Debounce window before triggering verification after a file save (1.5 seconds).
pub const DEBOUNCE_DURATION: Duration = Duration::from_millis(1500);

/// Whitelisted source file extensions (case-insensitive, without leading dot).
pub const WHITELISTED_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "rs", "py", "go"];

/// Blacklisted folder or file names that must never trigger verification.
pub const BLACKLISTED_SEGMENTS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".cache",
    ".tsbuildinfo",
];

static SUPPRESSED: AtomicBool = AtomicBool::new(false);
static WATCHER_EPOCH: AtomicU64 = AtomicU64::new(0);
static ACTIVE_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

/// Freezes (`true`) or resumes (`false`) the live file watcher (e.g. while an AI
/// coding agent is actively executing tools).
pub fn suppress(paused: bool) {
    SUPPRESSED.store(paused, Ordering::SeqCst);
}

/// Returns `true` if the live file watcher is currently suppressed.
pub fn is_suppressed() -> bool {
    SUPPRESSED.load(Ordering::SeqCst)
}

/// Cancels and drops the active background file watcher so zero watcher threads or handles remain active.
pub fn stop_watching() {
    WATCHER_EPOCH.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut slot) = ACTIVE_WATCHER.lock() {
        *slot = None;
    }
}

/// Pure filter predicate: returns `true` iff `path` has a whitelisted source
/// extension and none of its path components match the blacklist.
pub fn should_trigger_for_path(path: &Path) -> bool {
    // 1. Check every path component and file name against the blacklist
    for comp in path.components() {
        let seg = comp.as_os_str().to_string_lossy();
        let seg_lower = seg.to_ascii_lowercase();
        if BLACKLISTED_SEGMENTS
            .iter()
            .any(|b| seg_lower == *b || seg_lower.ends_with(".tsbuildinfo"))
        {
            return false;
        }
    }

    // 2. Check file extension against the whitelist
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    let ext_lower = ext.to_ascii_lowercase();
    WHITELISTED_EXTENSIONS.contains(&ext_lower.as_str())
}

/// Starts (or replaces) the background `notify` watcher for `workspace_path`.
pub fn watch_workspace(app: AppHandle, workspace_path: PathBuf) {
    let epoch = WATCHER_EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
    let (tx, mut rx) = mpsc::unbounded_channel::<PathBuf>();

    let watcher_res = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if is_suppressed() {
                return;
            }
            if let Ok(event) = res {
                // Only react to create, modify, or remove events
                if !(event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove()) {
                    return;
                }
                for path in event.paths {
                    if should_trigger_for_path(&path) {
                        let _ = tx.send(path);
                        break;
                    }
                }
            }
        },
        Config::default(),
    );

    let mut watcher = match watcher_res {
        Ok(w) => w,
        Err(err) => {
            log::line(format!("failed to create file watcher: {err}"));
            return;
        }
    };

    if let Err(err) = watcher.watch(&workspace_path, RecursiveMode::Recursive) {
        log::line(format!(
            "failed to watch workspace {}: {err}",
            workspace_path.display()
        ));
        return;
    }

    if let Ok(mut slot) = ACTIVE_WATCHER.lock() {
        *slot = Some(watcher);
    }

    // Spawn 1.5s debounce loop on the Tauri async runtime
    tauri::async_runtime::spawn(async move {
        while rx.recv().await.is_some() {
            if WATCHER_EPOCH.load(Ordering::SeqCst) != epoch {
                break;
            }
            if is_suppressed() {
                continue;
            }

            // Drain any rapid consecutive file events until 1.5s of quiet elapses
            let mut channel_closed = false;
            loop {
                let sleep_fut = tokio::time::sleep(DEBOUNCE_DURATION);
                tokio::pin!(sleep_fut);
                tokio::select! {
                    maybe_more = rx.recv() => {
                        if maybe_more.is_none() {
                            channel_closed = true;
                            break;
                        }
                    }
                    _ = &mut sleep_fut => {
                        break;
                    }
                }
            }

            if channel_closed {
                break;
            }
            if WATCHER_EPOCH.load(Ordering::SeqCst) != epoch || is_suppressed() {
                continue;
            }

            let Some(shared) = app.try_state::<crate::Shared>() else {
                continue;
            };
            let enabled = shared
                .settings
                .lock()
                .map(|s| s.verification_enabled)
                .unwrap_or(false);
            if !enabled {
                continue;
            }
            let Some(ws_info) = shared.workspace.get() else {
                continue;
            };

            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ =
                    run_verification_pipeline(Some(&app_clone), ws_info, TriggerSource::Watcher)
                        .await;
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelists_source_extensions_and_blocks_blacklisted_folders() {
        assert!(should_trigger_for_path(Path::new(
            "c:/projects/app/src/index.ts"
        )));
        assert!(should_trigger_for_path(Path::new(
            "c:/projects/app/src/App.tsx"
        )));
        assert!(should_trigger_for_path(Path::new(
            "c:/projects/app/src/main.rs"
        )));
        assert!(should_trigger_for_path(Path::new(
            "c:/projects/app/script.py"
        )));
        assert!(should_trigger_for_path(Path::new(
            "c:/projects/app/main.go"
        )));

        // Non-whitelisted extensions must be ignored
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/README.md"
        )));
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/package.json"
        )));

        // Blacklisted directories & files must never trigger (zero infinite loop!)
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/node_modules/pkg/index.ts"
        )));
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/target/dapinci-verify/debug/build/out.rs"
        )));
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/dist/bundle.js"
        )));
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/.git/hooks/pre-commit.py"
        )));
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/.cache/dapinci/tsbuildinfo"
        )));
        assert!(!should_trigger_for_path(Path::new(
            "c:/projects/app/tsconfig.tsbuildinfo"
        )));
    }

    #[test]
    fn suppression_toggle_works_atomically() {
        suppress(true);
        assert!(is_suppressed());
        suppress(false);
        assert!(!is_suppressed());
    }
}

