// Phase 2B: Stage 1 Context-Aware Lint Ratchet & Anti-Cheat (`verifier/ratchet.rs`).
//
// Scans in-memory `git diff HEAD` AND untracked files (`git ls-files --others --exclude-standard`)
// in ~15ms without invoking a compiler. Separates production (`src/`) rules from
// unit test (`tests/`, `*.test.*`, `#[cfg(test)]`) rules, strips comments and string
// literals to prevent false positives, and tracks assertion regressions.

use std::collections::HashSet;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::platform;

/// Severity of a Stage 1 finding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViolationSeverity {
    Error,
    Warning,
}

/// A single Stage 1 Lint Ratchet or Anti-Cheat violation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatchetViolation {
    pub file: String,
    pub line: usize,
    pub rule: String,
    pub message: String,
    pub severity: ViolationSeverity,
}

/// Complete output of Stage 1.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatchetReport {
    pub passed: bool,
    pub duration_ms: u64,
    pub violations: Vec<RatchetViolation>,
    pub warnings: Vec<RatchetViolation>,
    pub changed_files: Vec<String>,
}

/// Persistent lexical state carried across lines in a file or diff hunk.
#[derive(Debug, Default, Clone, Copy)]
pub struct LexicalState {
    pub in_block_comment: bool,
    pub in_string: Option<u8>,
    pub in_raw_string_hashes: Option<usize>,
}

/// Output of scanning a single line through the lexical filter.
#[derive(Debug, Default)]
pub struct LexicalLine {
    /// Code tokens with string contents and comments removed.
    pub code_only: String,
    /// Extracted comment text (outside string literals), used for `@ts-ignore` checks.
    pub comments_only: String,
}

/// Strips string literals (`"..."`, `'...'`, `` `...` ``, Rust `r#"..."#`, including
/// multi-line strings) and separates comments (`// ...`, `/* ... */`) from code tokens.
pub fn scan_lexical_line(line: &str, state: &mut LexicalState) -> LexicalLine {
    let mut code = String::with_capacity(line.len());
    let mut comments = String::new();
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if state.in_block_comment {
            if i + 1 < len && bytes[i] == b'*' && bytes[i + 1] == b'/' {
                state.in_block_comment = false;
                comments.push(' ');
                i += 2;
            } else {
                comments.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }

        if let Some(hashes) = state.in_raw_string_hashes {
            if bytes[i] == b'"' && has_n_hashes(bytes, i + 1, hashes) {
                state.in_raw_string_hashes = None;
                code.push('"');
                i += 1 + hashes;
            } else {
                i += 1;
            }
            continue;
        }

        if let Some(quote) = state.in_string {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == quote {
                state.in_string = None;
                code.push(quote as char);
            }
            i += 1;
            continue;
        }

        // Start of line comment `//`
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            comments.push_str(&line[i + 2..]);
            break;
        }

        // Start of block comment `/*`
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            state.in_block_comment = true;
            i += 2;
            continue;
        }

        // Rust raw string literal: `r"..."`, `r#"..."#`, `br"..."`, `br#"..."#`
        if bytes[i] == b'r' && (i == 0 || !is_ident_char(bytes[i - 1]) || bytes[i - 1] == b'b') {
            let mut hashes = 0;
            while i + 1 + hashes < len && bytes[i + 1 + hashes] == b'#' {
                hashes += 1;
            }
            if i + 1 + hashes < len && bytes[i + 1 + hashes] == b'"' {
                code.push('"');
                i += 2 + hashes;
                let mut closed = false;
                while i < len {
                    if bytes[i] == b'"' && has_n_hashes(bytes, i + 1, hashes) {
                        code.push('"');
                        i += 1 + hashes;
                        closed = true;
                        break;
                    }
                    i += 1;
                }
                if !closed {
                    state.in_raw_string_hashes = Some(hashes);
                }
                continue;
            }
        }

        // Normal string or template literal (`"`, `'`, `` ` ``)
        let b = bytes[i];
        if b == b'"' || b == b'\'' || b == b'`' {
            // In Rust, `'a` can be a lifetime rather than a char literal if not closed by `'`
            if b == b'\'' && is_rust_lifetime(bytes, i) {
                code.push('\'');
                i += 1;
                continue;
            }
            let quote = b;
            code.push(quote as char);
            i += 1;
            let mut closed = false;
            while i < len {
                if bytes[i] == b'\\' {
                    i += 2;
                    continue;
                }
                if bytes[i] == quote {
                    code.push(quote as char);
                    i += 1;
                    closed = true;
                    break;
                }
                i += 1;
            }
            // Double-quoted or backtick strings that didn't close on this line continue onto the next line
            if !closed && (quote == b'"' || quote == b'`') {
                state.in_string = Some(quote);
            }
            continue;
        }

        code.push(b as char);
        i += 1;
    }

    LexicalLine {
        code_only: code,
        comments_only: comments,
    }
}

fn has_n_hashes(bytes: &[u8], start: usize, hashes: usize) -> bool {
    if start + hashes > bytes.len() {
        return false;
    }
    bytes[start..start + hashes].iter().all(|&b| b == b'#')
}

/// Checks if a single quote at `idx` looks like a Rust lifetime (`'a`, `'static`, `'_`)
/// rather than a character/string literal (`'x'`).
fn is_rust_lifetime(bytes: &[u8], idx: usize) -> bool {
    if idx + 1 >= bytes.len() {
        return true;
    }
    let next = bytes[idx + 1];
    if !(next.is_ascii_alphabetic() || next == b'_') {
        return false;
    }
    if idx + 2 < bytes.len() && bytes[idx + 2] == b'\'' {
        return false;
    }
    let mut j = idx + 1;
    while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_') {
        j += 1;
    }
    j >= bytes.len() || bytes[j] != b'\''
}

/// Classifies whether a relative file path is a unit/integration test file.
pub fn is_test_file_path(path: &str) -> bool {
    let norm = path.replace('\\', "/");
    let lower = norm.to_ascii_lowercase();

    if lower.starts_with("tests/")
        || lower.starts_with("test/")
        || lower.starts_with("__tests__/")
        || lower.contains("/tests/")
        || lower.contains("/test/")
        || lower.contains("/__tests__/")
    {
        return true;
    }

    let file_name = lower.rsplit('/').next().unwrap_or(&lower);
    file_name.contains(".test.")
        || file_name.contains(".spec.")
        || file_name.ends_with("_test.rs")
        || file_name.ends_with("_test.go")
        || file_name.starts_with("test_")
}

fn is_ts_or_js_file(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".ts")
        || lower.ends_with(".tsx")
        || lower.ends_with(".js")
        || lower.ends_with(".jsx")
        || lower.ends_with(".mjs")
        || lower.ends_with(".cjs")
}

fn is_rust_file(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".rs")
}

fn is_watched_source_file(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    is_ts_or_js_file(&lower)
        || is_rust_file(&lower)
        || lower.ends_with(".py")
        || lower.ends_with(".go")
}

/// Checks if `code` contains an explicit TypeScript `any` type (`: any`, `as any`, `<any>`)
/// or double cast (`unknown as <Type>`).
fn detect_ts_any_or_double_cast(code: &str) -> Option<(&'static str, &'static str)> {
    // 1. Check `as any`
    if contains_token_sequence(code, "as", "any") {
        return Some((
            "no-explicit-any",
            "Added forbidden `as any` cast in production code.",
        ));
    }

    // 2. Check `: any` (e.g. `x: any`, `): any`, `x?: any`, `: any[]`)
    if has_colon_any(code) {
        return Some((
            "no-explicit-any",
            "Added forbidden explicit `: any` type in production code.",
        ));
    }

    // 3. Check `unknown as <Type>` double cast
    if has_unknown_as_cast(code) {
        return Some((
            "no-double-cast",
            "Added forbidden `unknown as T` type bypass in production code.",
        ));
    }

    None
}

fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn contains_token_sequence(code: &str, first: &str, second: &str) -> bool {
    let bytes = code.as_bytes();
    let f_bytes = first.as_bytes();
    let s_bytes = second.as_bytes();
    if bytes.len() < f_bytes.len() + 1 + s_bytes.len() {
        return false;
    }

    let mut i = 0;
    while i + f_bytes.len() <= bytes.len() {
        if &bytes[i..i + f_bytes.len()] == f_bytes {
            let prev_ok = i == 0 || !is_ident_char(bytes[i - 1]);
            let after_f = i + f_bytes.len();
            if prev_ok && after_f < bytes.len() && bytes[after_f].is_ascii_whitespace() {
                let mut j = after_f;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j + s_bytes.len() <= bytes.len() && &bytes[j..j + s_bytes.len()] == s_bytes {
                    let after_s = j + s_bytes.len();
                    let next_ok = after_s == bytes.len() || !is_ident_char(bytes[after_s]);
                    if next_ok {
                        return true;
                    }
                }
            }
        }
        i += 1;
    }
    false
}

fn has_colon_any(code: &str) -> bool {
    let bytes = code.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b':' {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if j + 3 <= bytes.len() && &bytes[j..j + 3] == b"any" {
                let after = j + 3;
                if after == bytes.len() || !is_ident_char(bytes[after]) {
                    return true;
                }
            }
        }
        i += 1;
    }
    false
}

fn has_unknown_as_cast(code: &str) -> bool {
    let bytes = code.as_bytes();
    let pat = b"unknown";
    let mut i = 0;
    while i + pat.len() <= bytes.len() {
        if &bytes[i..i + pat.len()] == pat {
            let prev_ok = i == 0 || !is_ident_char(bytes[i - 1]);
            let mut j = i + pat.len();
            while j < bytes.len() && (bytes[j].is_ascii_whitespace() || bytes[j] == b')') {
                j += 1;
            }
            if prev_ok && j + 2 <= bytes.len() && &bytes[j..j + 2] == b"as" {
                let after_as = j + 2;
                if after_as < bytes.len() && bytes[after_as].is_ascii_whitespace() {
                    let mut k = after_as;
                    while k < bytes.len() && bytes[k].is_ascii_whitespace() {
                        k += 1;
                    }
                    if k < bytes.len() && is_ident_char(bytes[k]) {
                        return true;
                    }
                }
            }
        }
        i += 1;
    }
    false
}

/// Checks if `code` contains an empty `catch` block (`catch (e) {}` or `catch {}`).
pub fn has_hollow_catch(code: &str) -> bool {
    let bytes = code.as_bytes();
    let pat = b"catch";
    let mut i = 0;
    while i + pat.len() <= bytes.len() {
        if &bytes[i..i + pat.len()] == pat {
            let prev_ok = i == 0 || !is_ident_char(bytes[i - 1]);
            let after = i + pat.len();
            let next_ok = after == bytes.len() || !is_ident_char(bytes[after]);
            if prev_ok && next_ok {
                let mut j = after;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'(' {
                    j += 1;
                    while j < bytes.len() && bytes[j] != b')' {
                        j += 1;
                    }
                    if j < bytes.len() && bytes[j] == b')' {
                        j += 1;
                    }
                }
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'{' {
                    j += 1;
                    while j < bytes.len() && (bytes[j].is_ascii_whitespace() || bytes[j] == b';') {
                        j += 1;
                    }
                    if j < bytes.len() && bytes[j] == b'}' {
                        return true;
                    }
                }
            }
        }
        i += 1;
    }
    false
}

/// Checks if a test line contains forbidden test-skipping constructs.
fn detect_test_skip(code: &str, is_rust: bool) -> Option<(&'static str, &'static str)> {
    if is_rust {
        if code.contains("#[ignore") {
            return Some((
                "no-test-skip",
                "Added `#[ignore]` to skip unit test.",
            ));
        }
        return None;
    }

    for pattern in [
        "it.skip(",
        "it.skip.",
        "test.skip(",
        "test.skip.",
        "describe.skip(",
        "describe.skip.",
        "suite.skip(",
        "it.todo(",
        "test.todo(",
        "describe.todo(",
        ".skip(",
    ] {
        if code.contains(pattern) {
            return Some((
                "no-test-skip",
                "Added `.skip` or `.todo` to bypass unit test.",
            ));
        }
    }

    for prefix in ["xit(", "xtest(", "xdescribe("] {
        if contains_standalone_call(code, prefix) {
            return Some((
                "no-test-skip",
                "Added disabled test (`xit`/`xdescribe`/`xtest`) to bypass unit test.",
            ));
        }
    }

    None
}

fn contains_standalone_call(code: &str, call_prefix: &str) -> bool {
    let bytes = code.as_bytes();
    let pat = call_prefix.as_bytes();
    let mut i = 0;
    while i + pat.len() <= bytes.len() {
        if &bytes[i..i + pat.len()] == pat {
            let prev_ok = i == 0 || !is_ident_char(bytes[i - 1]);
            if prev_ok {
                return true;
            }
        }
        i += 1;
    }
    false
}

/// Checks whether a line of code in a test file contains an assertion.
fn is_assertion_line(code: &str) -> bool {
    code.contains("expect(")
        || code.contains("assert!(")
        || code.contains("assert_eq!(")
        || code.contains("assert_ne!(")
        || code.contains("assert.")
        || code.contains("assertStrictEqual(")
        || code.contains("assertDeepEqual(")
}

/// Inspects a single added line of code (already split into `LexicalLine`).
fn check_added_line(
    file: &str,
    line_no: usize,
    lex: &LexicalLine,
    in_test_context: bool,
    violations: &mut Vec<RatchetViolation>,
) {
    let code = lex.code_only.trim();
    let comments = lex.comments_only.trim();

    if in_test_context {
        if let Some((rule, msg)) = detect_test_skip(code, is_rust_file(file)) {
            violations.push(RatchetViolation {
                file: file.to_string(),
                line: line_no,
                rule: rule.to_string(),
                message: msg.to_string(),
                severity: ViolationSeverity::Error,
            });
        }
        return;
    }

    // Production rules (`src/` or non-test files)
    if is_ts_or_js_file(file) {
        for directive in ["@ts-ignore", "@ts-nocheck", "@ts-expect-error"] {
            if comments.contains(directive) {
                violations.push(RatchetViolation {
                    file: file.to_string(),
                    line: line_no,
                    rule: "no-ts-suppression".to_string(),
                    message: format!("Added forbidden `{directive}` in production code."),
                    severity: ViolationSeverity::Error,
                });
            }
        }

        if let Some((rule, msg)) = detect_ts_any_or_double_cast(code) {
            violations.push(RatchetViolation {
                file: file.to_string(),
                line: line_no,
                rule: rule.to_string(),
                message: msg.to_string(),
                severity: ViolationSeverity::Error,
            });
        }

        if has_hollow_catch(code) {
            violations.push(RatchetViolation {
                file: file.to_string(),
                line: line_no,
                rule: "no-hollow-catch".to_string(),
                message: "Added empty `catch` block that swallows errors silently.".to_string(),
                severity: ViolationSeverity::Error,
            });
        }
    }

    if is_rust_file(file) {
        if code.contains(".unwrap()") {
            violations.push(RatchetViolation {
                file: file.to_string(),
                line: line_no,
                rule: "no-unwrap-in-prod".to_string(),
                message: "Added forbidden `.unwrap()` in Rust production code.".to_string(),
                severity: ViolationSeverity::Error,
            });
        }
        if code.contains(".expect(") {
            violations.push(RatchetViolation {
                file: file.to_string(),
                line: line_no,
                rule: "no-expect-in-prod".to_string(),
                message: "Added forbidden `.expect()` in Rust production code.".to_string(),
                severity: ViolationSeverity::Error,
            });
        }
    }
}

/// Finds the 1-indexed line number where `#[cfg(test)]` begins in a Rust source text.
pub fn find_cfg_test_start_line(content: &str) -> Option<usize> {
    let mut state = LexicalState::default();
    for (idx, line) in content.lines().enumerate() {
        let lex = scan_lexical_line(line, &mut state);
        if lex.code_only.contains("#[cfg(test)]") {
            return Some(idx + 1);
        }
    }
    None
}

/// Parses a unified `git diff` string and untracked `(rel_path, content)` pairs
/// in memory, applying all Stage 1 Lint Ratchet and Anti-Cheat rules.
pub fn analyze_diff_and_untracked(
    diff_text: &str,
    untracked_files: &[(String, String)],
    workspace_root: Option<&Path>,
) -> RatchetReport {
    let started = Instant::now();
    let mut violations = Vec::new();
    let mut warnings = Vec::new();
    let mut changed_set = HashSet::new();

    let mut current_file: Option<String> = None;
    let mut current_line_no: usize = 0;
    let mut lex_state = LexicalState::default();
    let mut current_file_is_test = false;
    let mut rust_cfg_test_line: Option<usize> = None;
    let mut hunk_in_cfg_test = false;

    // Multi-line hollow catch accumulator for the current hunk
    let mut pending_catch_line: Option<(usize, String)> = None;

    // Assertion delta tracking per test file
    let mut removed_assertions: usize = 0;
    let mut added_assertions: usize = 0;
    let mut assertion_line_marker: usize = 1;

    let flush_test_deltas = |file: &Option<String>,
                             is_test: bool,
                             removed: &mut usize,
                             added: &mut usize,
                             marker: usize,
                             violations: &mut Vec<RatchetViolation>,
                             warnings: &mut Vec<RatchetViolation>| {
        if let Some(f) = file {
            if is_test && *removed > 0 {
                if *removed > *added {
                    violations.push(RatchetViolation {
                        file: f.clone(),
                        line: marker,
                        rule: "assertion-deleted".to_string(),
                        message: format!(
                            "Removed {} test assertion(s) without replacement (added {}).",
                            *removed, *added
                        ),
                        severity: ViolationSeverity::Error,
                    });
                } else {
                    warnings.push(RatchetViolation {
                        file: f.clone(),
                        line: marker,
                        rule: "assertion-modified".to_string(),
                        message: "⚠️ Test Expectations Modified! Review test diff carefully."
                            .to_string(),
                        severity: ViolationSeverity::Warning,
                    });
                }
            }
        }
        *removed = 0;
        *added = 0;
    };

    for raw_line in diff_text.lines() {
        if let Some(rest) = raw_line.strip_prefix("+++ b/") {
            flush_test_deltas(
                &current_file,
                current_file_is_test,
                &mut removed_assertions,
                &mut added_assertions,
                assertion_line_marker,
                &mut violations,
                &mut warnings,
            );
            let file_path = rest.trim().to_string();
            if is_watched_source_file(&file_path) {
                changed_set.insert(file_path.clone());
                current_file_is_test = is_test_file_path(&file_path);
                rust_cfg_test_line = if is_rust_file(&file_path) {
                    workspace_root
                        .and_then(|root| std::fs::read_to_string(root.join(&file_path)).ok())
                        .and_then(|text| find_cfg_test_start_line(&text))
                } else {
                    None
                };
                current_file = Some(file_path);
            } else {
                current_file = None;
            }
            lex_state = LexicalState::default();
            hunk_in_cfg_test = false;
            pending_catch_line = None;
            continue;
        }

        if raw_line.starts_with("--- ") || raw_line.starts_with("diff --git ") {
            continue;
        }

        if let Some(hunk) = raw_line.strip_prefix("@@ ") {
            lex_state = LexicalState::default();
            pending_catch_line = None;
            if let Some((coords, tail)) = hunk.split_once(" @@") {
                current_line_no = parse_hunk_new_start(coords).unwrap_or(1);
                if tail.contains("mod tests") || tail.contains("#[cfg(test)]") {
                    hunk_in_cfg_test = true;
                }
            }
            continue;
        }

        let Some(ref file) = current_file else {
            continue;
        };

        if let Some(removed) = raw_line.strip_prefix('-') {
            let mut tmp_state = LexicalState::default();
            let lex = scan_lexical_line(removed, &mut tmp_state);
            let in_test = current_file_is_test
                || hunk_in_cfg_test
                || rust_cfg_test_line.is_some_and(|start| current_line_no >= start);
            if in_test && is_assertion_line(&lex.code_only) {
                if removed_assertions == 0 {
                    assertion_line_marker = current_line_no;
                }
                removed_assertions += 1;
            }
            continue;
        }

        if let Some(added) = raw_line.strip_prefix('+') {
            let lex = scan_lexical_line(added, &mut lex_state);
            if is_rust_file(file) && lex.code_only.contains("#[cfg(test)]") {
                hunk_in_cfg_test = true;
            }
            let in_test = current_file_is_test
                || hunk_in_cfg_test
                || rust_cfg_test_line.is_some_and(|start| current_line_no >= start);

            if in_test && is_assertion_line(&lex.code_only) {
                added_assertions += 1;
            }

            // Multi-line hollow catch check (e.g. `catch (e) {\n}`)
            if !in_test && is_ts_or_js_file(file) {
                if let Some((catch_start_line, ref mut acc)) = pending_catch_line {
                    acc.push(' ');
                    acc.push_str(&lex.code_only);
                    if has_hollow_catch(acc) {
                        violations.push(RatchetViolation {
                            file: file.clone(),
                            line: catch_start_line,
                            rule: "no-hollow-catch".to_string(),
                            message: "Added empty `catch` block that swallows errors silently."
                                .to_string(),
                            severity: ViolationSeverity::Error,
                        });
                        pending_catch_line = None;
                    } else if acc.contains('}') {
                        pending_catch_line = None;
                    }
                } else if lex.code_only.contains("catch")
                    && !has_hollow_catch(&lex.code_only)
                    && !lex.code_only.contains('}')
                {
                    pending_catch_line = Some((current_line_no, lex.code_only.clone()));
                }
            }

            check_added_line(file, current_line_no, &lex, in_test, &mut violations);
            current_line_no += 1;
            continue;
        }

        // Context line (` `)
        if raw_line.starts_with(' ') {
            if is_rust_file(file) && raw_line.contains("#[cfg(test)]") {
                hunk_in_cfg_test = true;
            }
            pending_catch_line = None;
            current_line_no += 1;
        }
    }

    flush_test_deltas(
        &current_file,
        current_file_is_test,
        &mut removed_assertions,
        &mut added_assertions,
        assertion_line_marker,
        &mut violations,
        &mut warnings,
    );

    // Scan untracked files completely
    for (file_path, content) in untracked_files {
        if !is_watched_source_file(file_path) {
            continue;
        }
        changed_set.insert(file_path.clone());
        let file_is_test = is_test_file_path(file_path);
        let mut state = LexicalState::default();
        let mut in_cfg_test = false;
        let mut pending_catch: Option<(usize, String)> = None;

        for (idx, line) in content.lines().enumerate() {
            let line_no = idx + 1;
            let lex = scan_lexical_line(line, &mut state);
            if is_rust_file(file_path) && lex.code_only.contains("#[cfg(test)]") {
                in_cfg_test = true;
            }
            let in_test = file_is_test || in_cfg_test;

            if !in_test && is_ts_or_js_file(file_path) {
                if let Some((catch_start, ref mut acc)) = pending_catch {
                    acc.push(' ');
                    acc.push_str(&lex.code_only);
                    if has_hollow_catch(acc) {
                        violations.push(RatchetViolation {
                            file: file_path.clone(),
                            line: catch_start,
                            rule: "no-hollow-catch".to_string(),
                            message: "Added empty `catch` block that swallows errors silently."
                                .to_string(),
                            severity: ViolationSeverity::Error,
                        });
                        pending_catch = None;
                    } else if acc.contains('}') {
                        pending_catch = None;
                    }
                } else if lex.code_only.contains("catch")
                    && !has_hollow_catch(&lex.code_only)
                    && !lex.code_only.contains('}')
                {
                    pending_catch = Some((line_no, lex.code_only.clone()));
                }
            }

            check_added_line(file_path, line_no, &lex, in_test, &mut violations);
        }
    }

    let mut changed_files: Vec<String> = changed_set.into_iter().collect();
    changed_files.sort();

    let duration_ms = started.elapsed().as_millis() as u64;
    RatchetReport {
        passed: violations.is_empty(),
        duration_ms,
        violations,
        warnings,
        changed_files,
    }
}

/// Parses `+start` from a unified diff header coordinate string `-a,b +start,count`.
fn parse_hunk_new_start(coords: &str) -> Option<usize> {
    let plus_part = coords.split_whitespace().find(|p| p.starts_with('+'))?;
    let num_str = plus_part
        .trim_start_matches('+')
        .split(',')
        .next()
        .unwrap_or("1");
    num_str.parse::<usize>().ok()
}

/// Executes Stage 1 on a live repository directory (`git diff HEAD` + untracked files).
pub fn run_ratchet(workspace_path: &Path) -> RatchetReport {
    let started = Instant::now();

    // 1. Run `git diff HEAD --relative --unified=0` (fallback to `git diff` if unborn HEAD)
    let diff_text = run_git_diff(workspace_path).unwrap_or_default();

    // 2. Collect untracked files via `git ls-files --others --exclude-standard`
    let untracked = collect_untracked_files(workspace_path);

    let mut report = analyze_diff_and_untracked(&diff_text, &untracked, Some(workspace_path));
    report.duration_ms = started.elapsed().as_millis() as u64;
    report
}

fn run_git_diff(workspace_path: &Path) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff", "HEAD", "--relative", "--unified=0", "--no-color"])
        .current_dir(workspace_path);
    if let Ok(out) = platform::no_console(&mut cmd).output() {
        if out.status.success() {
            return Some(String::from_utf8_lossy(&out.stdout).to_string());
        }
    }
    let mut fallback = Command::new("git");
    fallback
        .args(["diff", "--relative", "--unified=0", "--no-color"])
        .current_dir(workspace_path);
    let out = platform::no_console(&mut fallback).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

fn collect_untracked_files(workspace_path: &Path) -> Vec<(String, String)> {
    let mut cmd = Command::new("git");
    cmd.args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(workspace_path);
    let Ok(out) = platform::no_console(&mut cmd).output() else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }

    let list = String::from_utf8_lossy(&out.stdout);
    let mut files = Vec::new();
    for rel in list.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if !is_watched_source_file(rel) {
            continue;
        }
        let full = workspace_path.join(rel);
        // Cap untracked file read to 512 KB to keep Stage 1 under ~15ms
        if let Ok(meta) = std::fs::metadata(&full) {
            if meta.is_file() && meta.len() <= 512 * 1024 {
                if let Ok(content) = std::fs::read_to_string(&full) {
                    files.push((rel.to_string(), content));
                }
            }
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_ts_ignore_any_and_hollow_catch_in_src_files() {
        let diff = "\
diff --git a/src/auth/jwt.ts b/src/auth/jwt.ts
--- a/src/auth/jwt.ts
+++ b/src/auth/jwt.ts
@@ -10,0 +11,4 @@
+// @ts-ignore
+const payload = token as any;
+const cast = raw as unknown as User;
+try { verify(); } catch (e) { /* swallowed */ }
";
        let report = analyze_diff_and_untracked(diff, &[], None);
        assert!(!report.passed);
        assert_eq!(report.violations.len(), 4);
        assert_eq!(report.violations[0].rule, "no-ts-suppression");
        assert_eq!(report.violations[1].rule, "no-explicit-any");
        assert_eq!(report.violations[2].rule, "no-double-cast");
        assert_eq!(report.violations[3].rule, "no-hollow-catch");
    }

    #[test]
    fn blocks_unwrap_in_rust_src_but_allows_in_cfg_test_and_test_files() {
        let diff = "\
diff --git a/src/service.rs b/src/service.rs
--- a/src/service.rs
+++ b/src/service.rs
@@ -12,0 +13,1 @@
+    let val = opt.unwrap();
@@ -80,0 +82,3 @@ mod tests
+    #[cfg(test)]
+    fn my_test() {
+        let v = opt.unwrap();
+    }
diff --git a/tests/integration.rs b/tests/integration.rs
--- a/tests/integration.rs
+++ b/tests/integration.rs
@@ -1,0 +2,1 @@
+    let ok = res.unwrap();
";
        let report = analyze_diff_and_untracked(diff, &[], None);
        assert!(!report.passed);
        assert_eq!(report.violations.len(), 1);
        assert_eq!(report.violations[0].file, "src/service.rs");
        assert_eq!(report.violations[0].line, 13);
        assert_eq!(report.violations[0].rule, "no-unwrap-in-prod");
    }

    #[test]
    fn blocks_test_skipping_and_assertion_deletion_in_tests() {
        let diff = "\
diff --git a/src/auth/jwt.test.ts b/src/auth/jwt.test.ts
--- a/src/auth/jwt.test.ts
+++ b/src/auth/jwt.test.ts
@@ -15,2 +15,1 @@
-  expect(res.status).toBe(200);
-  expect(res.user).toBeDefined();
+  it.skip('should validate token', () => {});
";
        let report = analyze_diff_and_untracked(diff, &[], None);
        assert!(!report.passed);
        assert!(report.violations.iter().any(|v| v.rule == "no-test-skip"));
        assert!(report.violations.iter().any(|v| v.rule == "assertion-deleted"));
    }

    #[test]
    fn lexical_filter_ignores_comments_and_string_literals() {
        let diff = "\
diff --git a/src/clean.ts b/src/clean.ts
--- a/src/clean.ts
+++ b/src/clean.ts
@@ -1,0 +2,3 @@
+// Do not use as any or .unwrap() or catch (e) {} here!
+const msg = \"// @ts-ignore as any .unwrap() it.skip('x')\";
+const template = `value: any`;
";
        let report = analyze_diff_and_untracked(diff, &[], None);
        assert!(
            report.passed,
            "expected 0 violations, got: {:?}",
            report.violations
        );
    }

    #[test]
    fn scans_untracked_new_files_for_violations() {
        let untracked = vec![(
            "src/new_helper.ts".to_string(),
            "// @ts-nocheck\nexport const x: any = 42;\n".to_string(),
        )];
        let report = analyze_diff_and_untracked("", &untracked, None);
        assert!(!report.passed);
        assert_eq!(report.violations.len(), 2);
        assert_eq!(report.violations[0].rule, "no-ts-suppression");
        assert_eq!(report.violations[1].rule, "no-explicit-any");
    }

    #[test]
    fn dogfoods_dapinci_repo_with_zero_ratchet_violations() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let report = run_ratchet(manifest_dir);
        assert!(
            report.passed,
            "DapinCi dogfooding failed Stage 1 Lint Ratchet: {:?}",
            report.violations
        );
    }
}

