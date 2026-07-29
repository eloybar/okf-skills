# Agent Steering & Knowledge Guidelines

Welcome! This codebase is designed as a **self-documenting repository** powered by the **Open Knowledge Format (OKF)**.

## 📂 Knowledge Bundle / OKF
An OKF knowledge bundle is located in the `/docs/okf` directory. This bundle describes the core concepts, skills, and architecture of the OKF system implemented here.

### 1. Verification and Synchronization on Startup
On startup, before making any modifications to the codebase:
- Check `git status` and recent commits for any code files modified *after* the `timestamp` in their corresponding concept files.
- Run the `okf-maintain` skill to detect and sync any concept drift.

### 2. Locating the OKF Bundle
- Always locate and use `/docs/okf` relative to the workspace root to check and maintain the bundle.

### 3. Reading and Navigating Concepts
- Read the [Index File](/docs/okf/index.md) and relevant concept files in that directory before making modifications to understand the architecture, design choices, and vocabulary.

### 4. Post-Edit Upkeep
- After making any edits to the codebase, run the `okf-maintain` skill (or local equivalent) on the `/docs/okf` bundle to update corresponding concept files, index entries, and the change history log. This ensures the documentation never rots.
