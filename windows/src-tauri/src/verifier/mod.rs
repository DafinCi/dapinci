// Phase 2: Tier 0 Deterministic Verification Engine (`verifier/mod.rs`).
//
// Sequential Fail-Fast Pipeline:
//   - Stage 1 (`ratchet`): ~15ms In-Memory Lint Ratchet & Anti-Cheat
//   - Stage 2 (`runner`): Isolated Incremental Typecheck (`--target-dir target/dapinci-verify`)
//   - Stage 3 (`runner`): Smart Scoped / Full Test Runner
//   - Live Trigger (`watcher`): 1.5s Debounced Filtered File Watcher

pub mod detector;
pub mod ratchet;
pub mod runner;
pub mod watcher;

pub use runner::{
    run_verification_pipeline, StageResult, StageStatus, TriggerSource, VerificationResult,
    VerificationStartedEvent,
};

