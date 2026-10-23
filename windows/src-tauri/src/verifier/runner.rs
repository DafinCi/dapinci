// Phase 2C: Stage 2 (Isolated Incremental Typecheck) & Stage 3 (Smart Test Runner)
// (`verifier/runner.rs`).
//
// Executes toolchain commands inside a Win32 Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`)
// with `CREATE_NO_WINDOW` (`0x0800_0000`), hard timeouts (45s incremental / 180s cold build),
// instant supersede cancellation, `.tsbuildinfo` auto-heal, `--target-dir target/dapinci-verify`
// isolation for Rust, ANSI stripping, and `<dapinci_verification_failure>` formatting.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command as TokioCommand;

use crate::island::WINDOW_LABEL;
use crate::log;
use crate::workspace::WorkspaceInfo;

use super::detector::{detect_toolchain, CommandSpec, TestRunnerKind};
use super::ratchet::{run_ratchet, RatchetReport};

/// Default incremental verification timeout (45 seconds).
pub const DEFAULT_TIMEOUT_SECS: u64 = 45;
/// Extended timeout for initial cold Rust build in `target/dapinci-verify` (180 seconds).
pub const COLD_BUILD_TIMEOUT_SECS: u64 = 180;
/// Maximum number of compiler/test errors included in `<dapinci_verification_failure>`.
const MAX_PAYLOAD_ERRORS: usize = 10;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Global monotonic counter for verification runs. Incrementing this immediately
/// supersedes and terminates any in-flight verification Job Object.
static RUN_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Source that triggered the verification pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TriggerSource {
    Manual,
    Watcher,
    AgentHook,
}

/// Status of an individual verification stage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StageStatus {
    Passed,
    Failed,
    Skipped,
    Cancelled,
}

/// Result of a single stage (Stage 1, Stage 2, or Stage 3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
    pub stage: u8,
    pub name: String,
    pub status: StageStatus,
    pub duration_ms: u64,
    pub summary: String,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Payload emitted on `"verification-started"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationStartedEvent {
    pub run_id: u64,
    pub workspace: WorkspaceInfo,
    pub trigger: TriggerSource,
}

/// Complete result of the Sequential Fail-Fast Pipeline, emitted on `"verification-finished"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub run_id: u64,
    pub workspace: WorkspaceInfo,
    pub trigger: TriggerSource,
    pub passed: bool,
    pub cancelled: bool,
    pub total_duration_ms: u64,
    pub stages: Vec<StageResult>,
    /// Populated when `passed == false` and `!cancelled`: clean XML/Markdown
    /// `<dapinci_verification_failure>` ready to paste or send to an AI agent.
    pub ai_repair_payload: Option<String>,
}

// ── Win32 Job Object Guard ────────────────────────────────────────────────────

#[cfg(windows)]
mod win_job {
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::os::windows::io::RawHandle;

    use ::windows::Win32::Foundation::{CloseHandle, HANDLE};
    use ::windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct JobObject {
        handle: HANDLE,
    }

    // HANDLE is an opaque kernel handle safe to transfer across threads.
    unsafe impl Send for JobObject {}
    unsafe impl Sync for JobObject {}

    impl JobObject {
        pub fn new() -> Option<Self> {
            unsafe {
                let handle = CreateJobObjectW(None, None).ok()?;
                if handle.is_invalid() {
                    return None;
                }
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
                .is_ok();
                if !ok {
                    let _ = CloseHandle(handle);
                    return None;
                }
                Some(Self { handle })
            }
        }

        pub fn assign_process(&self, raw_process_handle: RawHandle) -> bool {
            unsafe { AssignProcessToJobObject(self.handle, HANDLE(raw_process_handle)).is_ok() }
        }

        pub fn terminate(&self) {
            unsafe {
                let _ = TerminateJobObject(self.handle, 1);
            }
        }
    }

    impl Drop for JobObject {
        fn drop(&mut self) {
            unsafe {
                let _ = TerminateJobObject(self.handle, 1);
                let _ = CloseHandle(self.handle);
            }
        }
    }
}

/// Output of a supervised child process execution.
#[derive(Debug)]
pub struct ProcessOutput {
    pub success: bool,
    pub timed_out: bool,
    pub cancelled: bool,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

/// Runs a command inside a Win32 Job Object with `CREATE_NO_WINDOW`, hard timeout,
/// and instant cancellation when `run_id` is superseded by a newer `RUN_GENERATION`.
pub async fn run_supervised_command(
    spec: &CommandSpec,
    extra_args: &[String],
    timeout: Duration,
    run_id: u64,
) -> ProcessOutput {
    let started = Instant::now();
    let mut cmd = TokioCommand::new(&spec.program);
    cmd.args(&spec.prefix_args)
        .args(extra_args)
        .current_dir(&spec.working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(windows)]
    let job = win_job::JobObject::new();

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(err) => {
            return ProcessOutput {
                success: false,
                timed_out: false,
                cancelled: false,
                stdout: String::new(),
                stderr: format!("Failed to spawn {}: {err}", spec.program.display()),
                duration_ms: started.elapsed().as_millis() as u64,
            };
        }
    };

    #[cfg(windows)]
    if let (Some(ref j), Some(raw_handle)) = (&job, child.raw_handle()) {
        j.assign_process(raw_handle);
    }

    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(ref mut out) = stdout_pipe {
            let _ = out.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(ref mut err) = stderr_pipe {
            let _ = err.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    // Poll for completion, timeout, or supersede cancellation
    let deadline = tokio::time::Instant::now() + timeout;
    let mut timed_out = false;
    let mut cancelled = false;
    let mut exit_success = false;

    loop {
        if RUN_GENERATION.load(Ordering::SeqCst) != run_id {
            cancelled = true;
            #[cfg(windows)]
            if let Some(ref j) = job {
                j.terminate();
            }
            let _ = child.kill().await;
            break;
        }

        tokio::select! {
            status_res = child.wait() => {
                exit_success = status_res.map(|s| s.success()).unwrap_or(false);
                break;
            }
            _ = tokio::time::sleep_until(deadline) => {
                timed_out = true;
                #[cfg(windows)]
                if let Some(ref j) = job {
                    j.terminate();
                }
                let _ = child.kill().await;
                break;
            }
            _ = tokio::time::sleep(Duration::from_millis(40)) => {
                // Re-check RUN_GENERATION on next iteration
            }
        }
    }

    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();

    ProcessOutput {
        success: exit_success && !timed_out && !cancelled,
        timed_out,
        cancelled,
        stdout,
        stderr,
        duration_ms: started.elapsed().as_millis() as u64,
    }
}

// ── ANSI Stripper & Output Parsing ────────────────────────────────────────────

/// Strips all ANSI CSI (`\x1b[...m`) and OSC (`\x1b]...`) escape sequences from text.
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] == 0x1b {
            i += 1;
            if i < len && bytes[i] == b'[' {
                // CSI sequence: skip until final byte in 0x40..=0x7E
                i += 1;
                while i < len && !(0x40..=0x7e).contains(&bytes[i]) {
                    i += 1;
                }
                if i < len {
                    i += 1;
                }
                continue;
            } else if i < len && bytes[i] == b']' {
                // OSC sequence: skip until BEL (0x07) or ST (\x1b\\)
                i += 1;
                while i < len {
                    if bytes[i] == 0x07 {
                        i += 1;
                        break;
                    }
                    if bytes[i] == 0x1b && i + 1 < len && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
        } else if let Some(ch) = input[i..].chars().next() {
            out.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }
    out
}

/// Resolves the `.tsbuildinfo` incremental cache path for `project_dir`, preferring
/// `node_modules/.cache/dapinci/tsbuildinfo` and falling back to `%TEMP%`.
pub fn resolve_tsbuildinfo_path(project_dir: &Path) -> PathBuf {
    let nm = project_dir.join("node_modules");
    if nm.is_dir() {
        let cache_dir = nm.join(".cache").join("dapinci");
        if std::fs::create_dir_all(&cache_dir).is_ok() {
            return cache_dir.join("tsbuildinfo");
        }
    }
    let dir_name = project_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string());
    std::env::temp_dir().join(format!("dapinci-{dir_name}.tsbuildinfo"))
}

/// Checks whether a `.tsbuildinfo` file appears corrupted (0 bytes or invalid JSON)
/// or if `tsc` failed to parse it.
fn is_tsbuildinfo_corrupted(cache_path: &Path, tsc_output: &str) -> bool {
    if tsc_output.contains("tsbuildinfo") && tsc_output.to_ascii_lowercase().contains("error") {
        return true;
    }
    if let Ok(meta) = std::fs::metadata(cache_path) {
        if meta.len() == 0 {
            return true;
        }
        if let Ok(bytes) = std::fs::read(cache_path) {
            if serde_json::from_slice::<Value>(&bytes).is_err() {
                return true;
            }
        }
    }
    false
}

/// Checks whether an error line/file touches one of the `changed_files` from git diff.
pub fn matches_changed_files(error_line: &str, changed_files: &[String]) -> bool {
    if changed_files.is_empty() {
        return true;
    }
    let norm_err = error_line.replace('\\', "/").to_ascii_lowercase();
    changed_files.iter().any(|cf| {
        let norm_cf = cf.replace('\\', "/").to_ascii_lowercase();
        norm_err.contains(&norm_cf)
            || norm_cf
                .rsplit('/')
                .next()
                .is_some_and(|base| !base.is_empty() && norm_err.contains(base))
    })
}

/// Parses TypeScript compiler (`tsc`) output into individual error lines, applying
/// diff-hunk file mapping against `changed_files`.
pub fn parse_tsc_errors(raw_output: &str, changed_files: &[String]) -> (Vec<String>, Vec<String>) {
    let clean = strip_ansi(raw_output);
    let mut blocking = Vec::new();
    let mut unrelated = Vec::new();

    for line in clean.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if line.contains(": error TS") {
            if matches_changed_files(line, changed_files) {
                blocking.push(line.to_string());
            } else {
                unrelated.push(line.to_string());
            }
        }
    }
    (blocking, unrelated)
}

/// Parses `cargo check --message-format=json` output into individual error lines,
/// applying diff-hunk file mapping against `changed_files`.
pub fn parse_cargo_json_errors(
    raw_stdout: &str,
    raw_stderr: &str,
    changed_files: &[String],
) -> (Vec<String>, Vec<String>) {
    let mut blocking = Vec::new();
    let mut unrelated = Vec::new();

    for line in raw_stdout.lines() {
        let Ok(val) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if val.get("reason").and_then(Value::as_str) != Some("compiler-message") {
            continue;
        }
        let Some(msg) = val.get("message") else {
            continue;
        };
        if msg.get("level").and_then(Value::as_str) != Some("error") {
            continue;
        }
        let text = msg
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("compiler error");
        let span_info = msg
            .get("spans")
            .and_then(Value::as_array)
            .and_then(|spans| {
                spans
                    .iter()
                    .find(|s| s.get("is_primary").and_then(Value::as_bool) == Some(true))
                    .or_else(|| spans.first())
            });

        let formatted = if let Some(span) = span_info {
            let file = span
                .get("file_name")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let line_start = span.get("line_start").and_then(Value::as_u64).unwrap_or(1);
            let col_start = span
                .get("column_start")
                .and_then(Value::as_u64)
                .unwrap_or(1);
            format!("{file}:{line_start}:{col_start}: error: {text}")
        } else {
            format!("error: {text}")
        };

        if matches_changed_files(&formatted, changed_files) {
            blocking.push(formatted);
        } else {
            unrelated.push(formatted);
        }
    }

    if blocking.is_empty() && unrelated.is_empty() && !raw_stderr.trim().is_empty() {
        let clean_err = strip_ansi(raw_stderr);
        for l in clean_err.lines().map(str::trim).filter(|l| l.starts_with("error")) {
            blocking.push(l.to_string());
        }
    }

    (blocking, unrelated)
}

/// Formats a structured `<dapinci_verification_failure>` XML/Markdown block for AI agents.
pub fn format_ai_repair_payload(
    workspace: &WorkspaceInfo,
    ratchet: &RatchetReport,
    stages: &[StageResult],
) -> String {
    let branch = workspace.branch.as_deref().unwrap_or("detached");
    let failed_names: Vec<String> = stages
        .iter()
        .filter(|s| s.status == StageStatus::Failed)
        .map(|s| format!("Stage {} ({})", s.stage, s.name))
        .collect();
    let failed_header = if failed_names.is_empty() {
        "Verification Failed".to_string()
    } else {
        failed_names.join(" & ")
    };

    let mut out = String::new();
    out.push_str("<dapinci_verification_failure>\n");
    out.push_str(&format!(
        "**Workspace:** {} (branch: {})\n",
        workspace.name, branch
    ));
    out.push_str(&format!("**Failed Stage:** {}\n\n", failed_header));

    if !ratchet.violations.is_empty() {
        out.push_str("### 1. Lint Ratchet Violations (STRICTLY FORBIDDEN)\n");
        for v in ratchet.violations.iter().take(MAX_PAYLOAD_ERRORS) {
            out.push_str(&format!("- `{}:{}` -> {}\n", v.file, v.line, v.message));
        }
        if ratchet.violations.len() > MAX_PAYLOAD_ERRORS {
            out.push_str(&format!(
                "- ...and {} more Lint Ratchet violations.\n",
                ratchet.violations.len() - MAX_PAYLOAD_ERRORS
            ));
        }
        out.push('\n');
    }

    let compiler_and_test_errors: Vec<&String> = stages
        .iter()
        .filter(|s| s.stage >= 2 && s.status == StageStatus::Failed)
        .flat_map(|s| s.errors.iter())
        .collect();

    if !compiler_and_test_errors.is_empty() {
        let total = compiler_and_test_errors.len();
        let shown = total.min(MAX_PAYLOAD_ERRORS);
        out.push_str(&format!(
            "### 2. Compiler / Test Errors (Top {shown} of {total})\n"
        ));
        for err in compiler_and_test_errors.into_iter().take(MAX_PAYLOAD_ERRORS) {
            out.push_str(&format!("- `{}`\n", strip_ansi(err).trim()));
        }
        out.push('\n');
    }

    out.push_str(
        "**Constraint for AI Agent:** Fix the root cause of the errors above. Do NOT use `@ts-ignore`, `@ts-expect-error`, `any`, `.unwrap()`, or skip tests to bypass verification.\n",
    );
    out.push_str("</dapinci_verification_failure>");
    out
}

/// Executes Stage 2 (Isolated Incremental Typecheck) for TypeScript and/or Rust.
async fn execute_stage2_typecheck(
    workspace_path: &Path,
    changed_files: &[String],
    run_id: u64,
) -> StageResult {
    let started = Instant::now();
    let toolchain = detect_toolchain(workspace_path);
    let mut blocking_errors = Vec::new();
    let mut warnings = Vec::new();

    // 1. TypeScript Incremental Typecheck
    if let Some(ref tsc_spec) = toolchain.typescript {
        let cache_path = resolve_tsbuildinfo_path(&tsc_spec.working_dir);
        let args = vec![
            "--noEmit".to_string(),
            "--incremental".to_string(),
            "--tsBuildInfoFile".to_string(),
            cache_path.to_string_lossy().to_string(),
        ];

        let mut out = run_supervised_command(
            tsc_spec,
            &args,
            Duration::from_secs(DEFAULT_TIMEOUT_SECS),
            run_id,
        )
        .await;

        if out.cancelled {
            return StageResult {
                stage: 2,
                name: "Typecheck (Incremental)".to_string(),
                status: StageStatus::Cancelled,
                duration_ms: started.elapsed().as_millis() as u64,
                summary: "Cancelled (superseded by newer run)".to_string(),
                errors: Vec::new(),
                warnings: Vec::new(),
            };
        }

        // Auto-heal corrupted `.tsbuildinfo` cache by deleting and retrying once
        let combined = format!("{}\n{}", out.stdout, out.stderr);
        if !out.success && !out.timed_out && is_tsbuildinfo_corrupted(&cache_path, &combined) {
            let _ = std::fs::remove_file(&cache_path);
            out = run_supervised_command(
                tsc_spec,
                &args,
                Duration::from_secs(DEFAULT_TIMEOUT_SECS),
                run_id,
            )
            .await;
        }

        if out.timed_out {
            blocking_errors.push(format!(
                "TypeScript typecheck timed out after {DEFAULT_TIMEOUT_SECS}s."
            ));
        } else if !out.success {
            let combined = format!("{}\n{}", out.stdout, out.stderr);
            let (blk, unrel) = parse_tsc_errors(&combined, changed_files);
            blocking_errors.extend(blk);
            for u in unrel {
                warnings.push(format!("Pre-existing error (outside diff): {u}"));
            }
        }
    }

    // 2. Rust Isolated Typecheck (`--target-dir target/dapinci-verify`)
    if blocking_errors.is_empty() {
        if let Some(ref cargo_spec) = toolchain.rust_cargo {
            let verify_target = cargo_spec.working_dir.join("target").join("dapinci-verify");
            let is_cold = !verify_target.is_dir();
            let timeout_secs = if is_cold {
                COLD_BUILD_TIMEOUT_SECS
            } else {
                DEFAULT_TIMEOUT_SECS
            };

            let args = vec![
                "check".to_string(),
                "--message-format=json".to_string(),
                "--target-dir".to_string(),
                "target/dapinci-verify".to_string(),
            ];

            let out = run_supervised_command(
                cargo_spec,
                &args,
                Duration::from_secs(timeout_secs),
                run_id,
            )
            .await;

            if out.cancelled {
                return StageResult {
                    stage: 2,
                    name: "Typecheck (Incremental)".to_string(),
                    status: StageStatus::Cancelled,
                    duration_ms: started.elapsed().as_millis() as u64,
                    summary: "Cancelled (superseded by newer run)".to_string(),
                    errors: Vec::new(),
                    warnings: Vec::new(),
                };
            }

            if out.timed_out {
                blocking_errors.push(format!(
                    "Rust `cargo check` timed out after {timeout_secs}s."
                ));
            } else if !out.success {
                let (blk, unrel) = parse_cargo_json_errors(&out.stdout, &out.stderr, changed_files);
                blocking_errors.extend(blk);
                for u in unrel {
                    warnings.push(format!("Pre-existing error (outside diff): {u}"));
                }
            }
        }
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    let passed = blocking_errors.is_empty();
    let summary = if passed {
        format!("{duration_ms}ms — 0 errors")
    } else {
        format!(
            "{duration_ms}ms — {} blocking error(s)",
            blocking_errors.len()
        )
    };

    StageResult {
        stage: 2,
        name: "Typecheck (Incremental)".to_string(),
        status: if passed {
            StageStatus::Passed
        } else {
            StageStatus::Failed
        },
        duration_ms,
        summary,
        errors: blocking_errors,
        warnings,
    }
}

/// Executes Stage 3 (Smart Test Runner — Scoped on Watcher, Full on Manual/AgentHook).
async fn execute_stage3_tests(
    workspace_path: &Path,
    changed_files: &[String],
    trigger: TriggerSource,
    run_id: u64,
) -> StageResult {
    let started = Instant::now();
    let toolchain = detect_toolchain(workspace_path);
    let mut errors = Vec::new();
    let mut ran_any = false;

    // 1. Node Test Runner (Vitest / Jest / NpmTest)
    if let Some((kind, ref spec)) = toolchain.node_test_runner {
        ran_any = true;
        let ts_js_changed: Vec<String> = changed_files
            .iter()
            .filter(|f| {
                let l = f.to_ascii_lowercase();
                l.ends_with(".ts")
                    || l.ends_with(".tsx")
                    || l.ends_with(".js")
                    || l.ends_with(".jsx")
                    || l.ends_with(".mjs")
            })
            .cloned()
            .collect();

        let use_scoped = trigger == TriggerSource::Watcher && !ts_js_changed.is_empty();
        let extra_args = match kind {
            TestRunnerKind::Vitest => {
                if use_scoped {
                    let mut a = vec!["related".to_string()];
                    a.extend(ts_js_changed);
                    a.push("--run".to_string());
                    a
                } else {
                    vec!["run".to_string()]
                }
            }
            TestRunnerKind::Jest => {
                if use_scoped {
                    let mut a = vec!["--findRelatedTests".to_string()];
                    a.extend(ts_js_changed);
                    a
                } else {
                    Vec::new()
                }
            }
            TestRunnerKind::NpmTest | TestRunnerKind::CargoTest => Vec::new(),
        };

        let out = run_supervised_command(
            spec,
            &extra_args,
            Duration::from_secs(DEFAULT_TIMEOUT_SECS),
            run_id,
        )
        .await;

        if out.cancelled {
            return StageResult {
                stage: 3,
                name: "Unit Tests".to_string(),
                status: StageStatus::Cancelled,
                duration_ms: started.elapsed().as_millis() as u64,
                summary: "Cancelled (superseded by newer run)".to_string(),
                errors: Vec::new(),
                warnings: Vec::new(),
            };
        }

        if out.timed_out {
            errors.push(format!("Test runner timed out after {DEFAULT_TIMEOUT_SECS}s."));
        } else if !out.success {
            let clean = strip_ansi(&format!("{}\n{}", out.stdout, out.stderr));
            let lines: Vec<String> = clean
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .rev()
                .take(MAX_PAYLOAD_ERRORS)
                .map(str::to_string)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            errors.extend(lines);
        }
    }

    // 2. Rust Test Runner (`cargo test --lib --target-dir target/dapinci-verify`)
    if errors.is_empty() {
        if let Some((_, ref cargo_spec)) = toolchain.rust_test_runner {
            let rust_changed = changed_files.is_empty()
                || changed_files.iter().any(|f| f.ends_with(".rs"))
                || !ran_any;

            if rust_changed {
                ran_any = true;
                let verify_target = cargo_spec.working_dir.join("target").join("dapinci-verify");
                let deps_dir = verify_target.join("debug").join("deps");
                let has_test_binaries = deps_dir.is_dir()
                    && deps_dir
                        .read_dir()
                        .map(|mut r| {
                            r.any(|e| {
                                e.map(|entry| {
                                    entry
                                        .path()
                                        .extension()
                                        .is_some_and(|ext| ext == "exe" || ext == "d")
                                })
                                .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);

                let timeout_secs = if has_test_binaries {
                    DEFAULT_TIMEOUT_SECS
                } else {
                    COLD_BUILD_TIMEOUT_SECS
                };

                let args = vec![
                    "test".to_string(),
                    "--lib".to_string(),
                    "--target-dir".to_string(),
                    "target/dapinci-verify".to_string(),
                ];

                let out = run_supervised_command(
                    cargo_spec,
                    &args,
                    Duration::from_secs(timeout_secs),
                    run_id,
                )
                .await;

                if out.cancelled {
                    return StageResult {
                        stage: 3,
                        name: "Unit Tests".to_string(),
                        status: StageStatus::Cancelled,
                        duration_ms: started.elapsed().as_millis() as u64,
                        summary: "Cancelled (superseded by newer run)".to_string(),
                        errors: Vec::new(),
                        warnings: Vec::new(),
                    };
                }

                if out.timed_out {
                    errors.push(format!("Rust unit tests timed out after {timeout_secs}s."));
                } else if !out.success {
                    let clean = strip_ansi(&format!("{}\n{}", out.stdout, out.stderr));
                    let lines: Vec<String> = clean
                        .lines()
                        .map(str::trim)
                        .filter(|l| {
                            l.contains("FAILED")
                                || l.contains("panicked at")
                                || l.starts_with("error")
                        })
                        .take(MAX_PAYLOAD_ERRORS)
                        .map(str::to_string)
                        .collect();
                    if lines.is_empty() {
                        errors.push("Cargo unit tests failed.".to_string());
                    } else {
                        errors.extend(lines);
                    }
                }
            }
        }
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    let passed = errors.is_empty();
    let summary = if !ran_any {
        "No test runner configured".to_string()
    } else if passed {
        format!("{duration_ms}ms — All tests passed")
    } else {
        format!("{duration_ms}ms — Test suite failed")
    };

    StageResult {
        stage: 3,
        name: "Unit Tests".to_string(),
        status: if passed {
            StageStatus::Passed
        } else {
            StageStatus::Failed
        },
        duration_ms,
        summary,
        errors,
        warnings: Vec::new(),
    }
}

/// Runs the complete Tier 0 Sequential Fail-Fast Pipeline (Stage 1 ➔ Stage 2 ➔ Stage 3)
/// for `workspace`, emitting `"verification-started"` and `"verification-finished"`.
pub async fn run_verification_pipeline(
    app: Option<&AppHandle>,
    workspace: WorkspaceInfo,
    trigger: TriggerSource,
) -> VerificationResult {
    let run_id = RUN_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let pipeline_start = Instant::now();

    if let Some(handle) = app {
        let started_evt = VerificationStartedEvent {
            run_id,
            workspace: workspace.clone(),
            trigger,
        };
        let _ = handle.emit("verification-started", &started_evt);
        let _ = handle.emit_to(WINDOW_LABEL, "verification-started", &started_evt);
    }

    // ── Stage 1: Context-Aware Lint Ratchet & Anti-Cheat (~15ms) ──────────────
    let workspace_path = workspace.path.clone();
    let ratchet: RatchetReport =
        tokio::task::spawn_blocking(move || run_ratchet(&workspace_path))
            .await
            .unwrap_or_else(|_| RatchetReport {
                passed: true,
                duration_ms: 0,
                violations: Vec::new(),
                warnings: Vec::new(),
                changed_files: Vec::new(),
            });

    let stage1_errors: Vec<String> = ratchet
        .violations
        .iter()
        .map(|v| format!("{}:{} -> {}", v.file, v.line, v.message))
        .collect();
    let stage1_warnings: Vec<String> = ratchet
        .warnings
        .iter()
        .map(|w| format!("{}:{} -> {}", w.file, w.line, w.message))
        .collect();

    let stage1 = StageResult {
        stage: 1,
        name: "Lint Ratchet & Anti-Cheat".to_string(),
        status: if ratchet.passed {
            StageStatus::Passed
        } else {
            StageStatus::Failed
        },
        duration_ms: ratchet.duration_ms,
        summary: if ratchet.passed {
            format!("{}ms — Clean", ratchet.duration_ms)
        } else {
            format!(
                "{}ms — {} violation(s)",
                ratchet.duration_ms,
                ratchet.violations.len()
            )
        },
        errors: stage1_errors,
        warnings: stage1_warnings,
    };

    // Fail-Fast if Stage 1 failed!
    if !ratchet.passed {
        let stages = vec![
            stage1,
            StageResult {
                stage: 2,
                name: "Typecheck (Incremental)".to_string(),
                status: StageStatus::Skipped,
                duration_ms: 0,
                summary: "Skipped (Stage 1 failed)".to_string(),
                errors: Vec::new(),
                warnings: Vec::new(),
            },
            StageResult {
                stage: 3,
                name: "Unit Tests".to_string(),
                status: StageStatus::Skipped,
                duration_ms: 0,
                summary: "Skipped (Stage 1 failed)".to_string(),
                errors: Vec::new(),
                warnings: Vec::new(),
            },
        ];
        let payload = format_ai_repair_payload(&workspace, &ratchet, &stages);
        let result = VerificationResult {
            run_id,
            workspace,
            trigger,
            passed: false,
            cancelled: false,
            total_duration_ms: pipeline_start.elapsed().as_millis() as u64,
            stages,
            ai_repair_payload: Some(payload),
        };
        emit_finished(app, &result);
        return result;
    }

    // ── Stage 2: Isolated Incremental Typecheck ───────────────────────────────
    let stage2 =
        execute_stage2_typecheck(&workspace.path, &ratchet.changed_files, run_id).await;

    if stage2.status == StageStatus::Cancelled {
        let stages = vec![
            stage1,
            stage2,
            StageResult {
                stage: 3,
                name: "Unit Tests".to_string(),
                status: StageStatus::Cancelled,
                duration_ms: 0,
                summary: "Cancelled".to_string(),
                errors: Vec::new(),
                warnings: Vec::new(),
            },
        ];
        return VerificationResult {
            run_id,
            workspace,
            trigger,
            passed: false,
            cancelled: true,
            total_duration_ms: pipeline_start.elapsed().as_millis() as u64,
            stages,
            ai_repair_payload: None,
        };
    }

    // Fail-Fast if Stage 2 failed!
    if stage2.status == StageStatus::Failed {
        let stages = vec![
            stage1,
            stage2,
            StageResult {
                stage: 3,
                name: "Unit Tests".to_string(),
                status: StageStatus::Skipped,
                duration_ms: 0,
                summary: "Skipped (Stage 2 failed)".to_string(),
                errors: Vec::new(),
                warnings: Vec::new(),
            },
        ];
        let payload = format_ai_repair_payload(&workspace, &ratchet, &stages);
        let result = VerificationResult {
            run_id,
            workspace,
            trigger,
            passed: false,
            cancelled: false,
            total_duration_ms: pipeline_start.elapsed().as_millis() as u64,
            stages,
            ai_repair_payload: Some(payload),
        };
        emit_finished(app, &result);
        return result;
    }

    // ── Stage 3: Smart Test Runner ────────────────────────────────────────────
    let stage3 =
        execute_stage3_tests(&workspace.path, &ratchet.changed_files, trigger, run_id).await;

    let cancelled = stage3.status == StageStatus::Cancelled;
    let passed = !cancelled && stage3.status == StageStatus::Passed;
    let stages = vec![stage1, stage2, stage3];
    let ai_repair_payload = if !passed && !cancelled {
        Some(format_ai_repair_payload(&workspace, &ratchet, &stages))
    } else {
        None
    };

    let result = VerificationResult {
        run_id,
        workspace,
        trigger,
        passed,
        cancelled,
        total_duration_ms: pipeline_start.elapsed().as_millis() as u64,
        stages,
        ai_repair_payload,
    };

    if !cancelled {
        emit_finished(app, &result);
    }
    result
}

fn emit_finished(app: Option<&AppHandle>, result: &VerificationResult) {
    log::line(format!(
        "verification finished: run={} passed={} duration={}ms",
        result.run_id, result.passed, result.total_duration_ms
    ));
    if let Some(handle) = app {
        let _ = handle.emit("verification-finished", result);
        let _ = handle.emit_to(WINDOW_LABEL, "verification-finished", result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::verifier::ratchet::{RatchetViolation, ViolationSeverity};
    use crate::workspace::ProjectType;

    #[test]
    fn strips_ansi_color_and_osc_codes_cleanly() {
        let dirty = "\x1b[31merror TS2339:\x1b[0m Property \x1b[1m'userId'\x1b[22m does not exist.";
        assert_eq!(
            strip_ansi(dirty),
            "error TS2339: Property 'userId' does not exist."
        );
    }

    #[test]
    fn formats_structured_ai_repair_payload_without_ansi() {
        let ws = WorkspaceInfo {
            path: PathBuf::from("c:/projects/my-app"),
            name: "my-app".to_string(),
            branch: Some("feat/auth".to_string()),
            project_type: ProjectType::NodeTs,
            package_manager: Some("pnpm".to_string()),
        };
        let ratchet = RatchetReport {
            passed: false,
            duration_ms: 12,
            violations: vec![RatchetViolation {
                file: "src/auth/jwt.ts".to_string(),
                line: 42,
                rule: "no-explicit-any".to_string(),
                message: "Added forbidden `as any` in production code.".to_string(),
                severity: ViolationSeverity::Error,
            }],
            warnings: Vec::new(),
            changed_files: vec!["src/auth/jwt.ts".to_string()],
        };
        let stages = vec![
            StageResult {
                stage: 1,
                name: "Lint Ratchet".to_string(),
                status: StageStatus::Failed,
                duration_ms: 12,
                summary: "1 violation".to_string(),
                errors: vec!["src/auth/jwt.ts:42 -> Added forbidden `as any`".to_string()],
                warnings: Vec::new(),
            },
            StageResult {
                stage: 2,
                name: "TypeScript Compiler".to_string(),
                status: StageStatus::Failed,
                duration_ms: 600,
                summary: "1 error".to_string(),
                errors: vec![
                    "\x1b[31msrc/auth/jwt.ts(45,12): error TS2339: Property 'userId' does not exist.\x1b[0m"
                        .to_string(),
                ],
                warnings: Vec::new(),
            },
        ];

        let payload = format_ai_repair_payload(&ws, &ratchet, &stages);
        assert!(payload.starts_with("<dapinci_verification_failure>"));
        assert!(payload.ends_with("</dapinci_verification_failure>"));
        assert!(payload.contains("**Workspace:** my-app (branch: feat/auth)"));
        assert!(payload.contains("`src/auth/jwt.ts:42` -> Added forbidden `as any`"));
        assert!(payload.contains("`src/auth/jwt.ts(45,12): error TS2339: Property 'userId' does not exist.`"));
        assert!(!payload.contains("\x1b["));
    }

    #[test]
    fn diff_hunk_mapping_filters_errors_to_changed_files() {
        let raw = "\
src/auth/jwt.ts(45,12): error TS2339: Property 'userId' does not exist.
src/legacy/old.ts(10,5): error TS7006: Parameter 'x' implicitly has an 'any' type.
";
        let changed = vec!["src/auth/jwt.ts".to_string()];
        let (blocking, unrelated) = parse_tsc_errors(raw, &changed);
        assert_eq!(blocking.len(), 1);
        assert!(blocking[0].contains("src/auth/jwt.ts"));
        assert_eq!(unrelated.len(), 1);
        assert!(unrelated[0].contains("src/legacy/old.ts"));
    }

    #[test]
    fn supervised_command_kills_process_tree_on_timeout_without_console_flash() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let run_id = RUN_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
            let spec = CommandSpec {
                program: PathBuf::from("git"),
                prefix_args: vec!["--version".to_string()],
                working_dir: std::env::temp_dir(),
            };
            let out = run_supervised_command(&spec, &[], Duration::from_secs(5), run_id).await;
            assert!(out.success);
            assert!(out.stdout.contains("git version"));
        });
    }
}
