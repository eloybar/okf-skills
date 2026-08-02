# Agent Steering & Knowledge Guidelines

Welcome! This codebase is designed as a **self-documenting repository** powered by the **Open Knowledge Format (OKF)**.

## 📂 Knowledge Bundle / OKF
An OKF knowledge bundle is located in the `/docs/okf` directory. This bundle describes the core concepts, skills, and architecture of the OKF system implemented here.

### 1. Verification and Synchronization on Startup
On startup, before making any modifications to the codebase:
- Run the `okf-lint --drift` skill to detect and inspect any unsynchronized concept drift.
- Run the `okf-maintain` skill to fix/sync any flagged concept drift.

### 2. Locating the OKF Bundle
- Always locate and use `/docs/okf` relative to the workspace root to check and maintain the bundle.

### 3. Context Grounding & Retrieval
- **Grounding Initial Questions**: Before answering any initial user questions about the codebase, system behavior, or design on session startup, first attempt to ground your answer in the OKF bundle. Run the `okf-query --search <keywords>` skill with relevant query terms or check the [Index File](/docs/okf/index.md) to find documentation and concepts explaining the subject.
- **Retrieval before Edits**: Before analyzing or modifying any specific file, run the `okf-query --file <file-path>` skill to retrieve and inject relevant design guidelines, SLAs, and dependencies directly into your context.

### 4. Post-Edit Upkeep & Conformance
- After making edits, run the `okf-maintain` skill to update the relevant concept files, frontmatter timestamps, index entries, and `log.md`.
- Run the `okf-lint` skill to guarantee that all markdown links are intact and all concept structures conform before completing the task.
