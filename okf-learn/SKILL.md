---
name: okf-learn
description: Use when evaluating agent or skill performance after a coding session, when the pre-completion maintain nudge reports session telemetry anomalies, or when the user asks to learn from a conversation, fix query misses, or improve OKF concepts and skills.
version: 1.8.2
---

# `okf-learn` Workflow

Close the self-improvement feedback loop after coding sessions by auditing passive CLI telemetry (`~/.okf/telemetry.jsonl`) and conversation transcripts (`transcript.jsonl`), distilling qualitative engineering lessons, and automatically remediating bundle or skill gaps.

## Overview

While `okf-maintain` handles fast mechanical post-edit synchronization, `okf-learn` performs **retrospective self-improvement**:
- Audits **OKF Steering Gate compliance** (session-start `okf-lint --drift`, pre-work `okf-query`, `OKF Check` citations, and pre-completion `okf-maintain`).
- Detects **quantitative friction** across the session: `query_miss` events, `fallback_used` rescues, `>40KB` `context_bloat` truncations, backgrounded slow commands, and `edit_file` target-not-found errors.
- Extracts **qualitative learning signals**: user corrections/redirections in the transcript, unbound edited workspace files, and oversized concepts (`>12KB`).
- Remediates bundle gaps automatically (e.g., binding missed or newly edited files into concept `sources:` via `--bind`).

## Usage

```bash
# 1. Evaluate the most recent conversation & passive telemetry
node okf-learn/scripts/learn.js --latest [--bundle <path>]
npm run okf:learn -- --latest

# 2. Evaluate a specific conversation ID (human-readable or JSON)
node okf-learn/scripts/learn.js <conversation-id> [--brain-dir <path>]
node okf-learn/scripts/learn.js <conversation-id> --json

# 3. Auto-bind a missed or newly discovered workspace file into a concept's sources:
node okf-learn/scripts/learn.js --bind <file-path> --concept <concept-rel-path> [--bundle <path>]

# 4. Reset the passive telemetry log (~/.okf/telemetry.jsonl)
node okf-learn/scripts/learn.js --reset
```

## Quick Reference

| Command / Flag | Action | Modifies Files? |
|---|---|---|
| `--latest` (or no args) | Evaluates the most recent conversation transcript + `~/.okf/telemetry.jsonl` | No |
| `<conversation-id>` | Evaluates a specific conversation transcript + `~/.okf/telemetry.jsonl` | No |
| `--bind <file> --concept <md>` | Adds `<file>` to `<md>`'s `sources:` frontmatter (if not already bound) and refreshes `generated.at` | Yes |
| `--reset` | Clears `~/.okf/telemetry.jsonl` | Yes (telemetry log) |
| `--json` | Emits structured JSON report (`conversation`, `telemetry`, `learningSignals`, `recommendations`) | Same as mode |

## 4-Step Retrospective Playbook

1. **Run the Session & Telemetry Audit**
   - Execute `node okf-learn/scripts/learn.js --latest --json` (or pass the target `<conversation-id>`).
   - Inspect `conversation.friction`, `telemetry`, `learningSignals`, and `recommendations`.

2. **Extract Qualitative Engineering Lessons**
   - Review `learningSignals.userCorrections` and `friction.toolErrors` from the report.
   - Identify any durable domain rules, third-party format quirks, platform constraints, or workflow corrections that surfaced during debugging or user feedback.

3. **Remediate Project Bundle Gaps**
   - **Fix Query Misses & Unbound Files:** For any path in `friction.queryMisses`, `telemetry.queryMisses`, or `learningSignals.unboundEditedFiles`, bind it to the appropriate concept using:
     ```bash
     node okf-learn/scripts/learn.js --bind <missed-or-edited-path> --concept <concept-rel-path>
     ```
     *(Or invoke `okf-wayfinder` if a net-new concept is warranted).*
   - **Fix Context Bloat:** For any concept listed in `learningSignals.oversizedConcepts` (`>12KB`) or `friction.contextBloat`, split the concept into focused sub-concepts or narrow overly broad `sources:` bindings.
   - **Codify Lessons:** Record durable constraints discovered in Step 2 into the relevant concept body and append a dated entry to `log.md`.

4. **Verify & Synchronize**
   - Run `node okf-maintain/scripts/maintain.js` and `node okf-lint/scripts/lint.js --drift` (must report 0 errors and 0 warnings).
   - If you also updated an OKF skill inside `okf-skills`, propagate it to all local agent environments via `node okf-upgrade/scripts/upgrade.js --skills`.
