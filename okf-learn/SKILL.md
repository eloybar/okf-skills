---
name: okf-learn
description: Use when evaluating agent or skill performance after a coding session, when the pre-completion maintain nudge reports session telemetry anomalies, or when the user asks to learn from a conversation, fix query misses, or improve OKF concepts and skills.
version: 1.8.2
---

# `okf-learn` Workflow

Close the self-improvement feedback loop across coding sessions by auditing passive CLI telemetry (`~/.okf/telemetry.jsonl`), cross-repo skill learning notes (`~/.okf/skill-learnings.jsonl`), and conversation transcripts (`transcript.jsonl`), distilling qualitative engineering lessons, and automatically remediating project bundle or `okf-skills` source code gaps.

## When to Invoke (`Agent-Invoked` vs. `Centralized Skill Evolution`)

1. **Conditional Agent-Invocation (Any Project Repo):**
   - Triggered automatically during the Pre-Completion Verification Gate when `node okf-maintain/scripts/maintain.js` prints `💡 [OKF Self-Improvement] Session telemetry recorded ... — invoke okf-learn`.
   - **Action:** Run `node okf-learn/scripts/learn.js --bind <missed-file> --concept <concept-rel-path>` to fix project-level `query_miss` gaps immediately, or run `node okf-learn/scripts/learn.js --note "<finding>" --skill <skill-name>` if the friction requires a code/prompt change in `okf-skills`.
2. **Centralized Skill Evolution (Inside the `okf-skills` Repo):**
   - Triggered when the user runs `/okf-learn` or asks to evaluate/improve OKF skills from inside `okf-skills`.
   - **Smart `--latest` & `--recent` Multi-Runtime Discovery:** Because transcripts (Antigravity `~/.gemini/antigravity-cli/brain/` and Claude Code `~/.claude/projects/<slug>/<session-id>.jsonl` / `$CLAUDE_CONFIG_DIR/projects/`) and telemetry (`~/.okf/`) are stored globally in `$HOME`, running `learn.js --latest --recent 5` inside `okf-skills` automatically skips short `<6` step meta-sessions (like a freshly opened `/okf-learn` chat), auto-detects the transcript format (`antigravity` or `claude-code`), and evaluates the most recent substantive coding session(s) from any repository on the machine alongside `~/.okf/skill-learnings.jsonl`.

## Usage

> **Path Resolution:** When running outside the `okf-skills` repository, use the installed skills base path configured in the workspace's `AGENTS.md` (on Windows PowerShell, use `$HOME/...` or `C:/Users/<user>/...` rather than `~/`, as `node.exe` does not expand `~`).

```bash
# 1. Evaluate the most recent substantive coding session & passive telemetry
node okf-learn/scripts/learn.js --latest [--recent 5] [--bundle <path>]
npm run okf:learn -- --latest --recent 5

# 2. Evaluate a specific conversation ID (human-readable or JSON)
node okf-learn/scripts/learn.js <conversation-id> [--brain-dir <path>]
node okf-learn/scripts/learn.js <conversation-id> --json

# 3. Auto-bind a missed or newly discovered workspace file into a concept's sources:
node okf-learn/scripts/learn.js --bind <file-path> --concept <concept-rel-path> [--bundle <path>]

# 4. Queue a cross-repo skill improvement note from any project session:
node okf-learn/scripts/learn.js --note "<description of skill bug or ranking gap>" --skill <okf-query|okf-maintain|...> [--category <cat>]

# 5. Clear queued skill notes or reset the full telemetry + notes log:
node okf-learn/scripts/learn.js --clear-notes
node okf-learn/scripts/learn.js --reset
```

## Quick Reference

| Command / Flag | Action | Modifies Files? |
|---|---|---|
| `--latest` (or no args) | Evaluates the most recent substantive (`>=6` step) conversation transcript + `~/.okf/telemetry.jsonl` + `~/.okf/skill-learnings.jsonl` | No |
| `--recent [N]` | Summarizes the last `N` (default `5`) substantive coding sessions across all workspaces (`inferredWorkspace`, gate score, friction) | No |
| `<conversation-id>` | Evaluates a specific conversation transcript + telemetry | No |
| `--bind <file> --concept <md>` | Adds `<file>` to `<md>`'s `sources:` frontmatter (if not already bound) and refreshes `generated.at` | Yes (concept file) |
| `--note "<msg>" [--skill <name>]` | Appends a cross-repo skill improvement item to `~/.okf/skill-learnings.jsonl` | Yes (`skill-learnings.jsonl`) |
| `--clear-notes` | Clears `~/.okf/skill-learnings.jsonl` after skill improvements are applied | Yes (`skill-learnings.jsonl`) |
| `--reset` | Clears `~/.okf/telemetry.jsonl` and `~/.okf/skill-learnings.jsonl`, and records a `resetAt` watermark in `~/.okf/learn-state.json` so subsequent audits ignore pre-reset sessions and pre-reset steps in continued sessions | Yes (telemetry, notes & state) |
| `--json` | Emits structured JSON report (`conversation`, `recentSessions`, `telemetry`, `skillLearningsQueue`, `learningSignals`, `recommendations`) | Same as mode |

## 4-Step Retrospective Playbook

1. **Run the Session & Telemetry Audit**
   - Execute `node okf-learn/scripts/learn.js --latest --json` to focus on the last substantive session (or pass `--recent 5` only when explicitly auditing multi-session trends).
   - Inspect `conversation.friction`, `telemetry`, `skillLearningsQueue`, `learningSignals`, and `recommendations`.

2. **Extract Qualitative Engineering Lessons**
   - Review `learningSignals.userCorrections` and `friction.toolErrors` from the report.
   - Identify durable domain rules, third-party format quirks, platform constraints, or workflow corrections that surfaced during debugging or user feedback.

3. **Remediate Bundle or Skill Source Code Gaps**
   - **In a Project Workspace (Bundle Remediation):**
     - Bind missed paths in `friction.queryMisses` or `telemetry.queryMisses` using `node okf-learn/scripts/learn.js --bind <file> --concept <concept>`.
     - Split any concept in `learningSignals.oversizedConcepts` (`>12KB`) or `friction.contextBloat` into focused sub-concepts.
     - If you discover a limitation in an OKF CLI script or `SKILL.md` while working in another repo, queue it via `node okf-learn/scripts/learn.js --note "<message>" --skill <skill-name>`.
   - **In the `okf-skills` Repository (Skill Source Evolution):**
     - Implement code/prompt fixes for `skillLearningsQueue`, `telemetry` anomalies, and `recentSessions` friction directly in `okf-*/scripts/*.js` and `okf-*/SKILL.md`.
     - Add regression tests to `scripts/test-lifecycle.js`.
     - **Sanitize Test Fixtures & Changelog Entries (MANDATORY):** Never copy real project names, client/company identifiers, OS usernames, private LAN IPs (`192.168.x.x`), machine-specific drive URIs (`file:///<Drive>:/...`), or real session UUIDs from audited transcripts into `scripts/test-*.js`, `docs/okf/log.md`, or `docs/okf/concepts/`. Always anonymize them into generic fixtures (`webapp`, `GatewayService`, `Acme`, `jdoe`, `192.0.2.10`, `00000000-0000-4000-8000-000000000001`). This is enforced automatically by `scripts/sync-skills.js --check` during `npm test`.

4. **Verify, Commit via Git PR Workflow, Deploy & Reset**
   - Run `node okf-maintain/scripts/maintain.js` and `node okf-lint/scripts/lint.js --drift` (must report 0 errors and 0 warnings).
   - When modifying `okf-skills`, run `npm test`, follow the Git PR workflow (`git checkout -b feat/...`, commit, `git push -u origin HEAD`, `gh pr create`, `gh pr merge --rebase --delete-branch`, `git checkout main && git pull --ff-only`), deploy updated skills to all local agent directories via `node okf-maintain/scripts/maintain.js --upgrade --skills`, and reset processed telemetry, notes, and the session history watermark via `node okf-learn/scripts/learn.js --reset`.
