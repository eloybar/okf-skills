# OKF Interactive Academy & Markdown Curriculum — Design Specification

- **Date:** 2026-10-21
- **Status:** Approved
- **Target Repository:** `okf-skills` (`D:\projects\okf-skills`)
- **Primary Deliverables:** `course.html`, `docs/course/` (7 modules + syllabus + sandbox), `docs/okf/concepts/okf-course.md`, and entry point updates in `index.html` and `README.md`.

---

## 1. Purpose & Goals

Create a comprehensive, progressive educational course (**Beginner → Architect**) inside `okf-skills` that teaches software engineers, tech leads, and AI agent builders:
1. **What the Open Knowledge Format (OKF) is** and the core problems it solves (codebase amnesia, cold-start exploration tax, context window bloat, and documentation rot).
2. **Core OKF concepts and processes** across the 10-step **Closed-Loop Agentic Knowledge Pipeline** (`okf`, `okf-wayfinder`, `AGENTS.md`, `okf-query`, `okf-maintain`, `okf-lint`, `okf-visualize`, `okf-upgrade`, `okf-prune`).
3. **Incremental improvements and the OKF v0.2 paradigm shift**, specifically addressing the four major problems solved by v0.2:
   - **Hallucinated / Uncited Claims** → Solved via structured frontmatter `sources`, credibility signals (`author`, `usage_count`, `last_modified`, `usage_window`), and inline markdown footnotes (`[^id]`).
   - **Blind Trust in Agent-Authored Docs** → Solved via structured actor provenance (`generated: { by, at }`), independent verification arrays (`verified: [{ by, at }]`), and deterministic **Trust Tiers** (`unverified`, `machine-confirmed`, `human-reviewed`).
   - **Silent Time-Based Obsolescence** → Solved via explicit lifecycle state (`status: draft | stable | deprecated`) and time-bounded freshness (`stale_after` ISO 8601 UTC expiration).
   - **Ambiguous Business & Analytical Metrics** → Solved via `type: Attested Computation` concepts that bind `runtime`, typed `parameters`, `# Computation` blocks, `executor`, and `attester` contracts.

---

## 2. Architecture & File Layout

Because `okf-maintain/scripts/maintain.js` excludes `docs/` from unindexed workspace frontier scanning while tracking root files, placing the web application at `course.html` and the Markdown curriculum + sandbox under `docs/course/` integrates cleanly with the repository's self-documenting lifecycle and GitHub Pages deployment (`https://eloybar.github.io/okf-skills/course.html`).

```text
okf-skills/
├── course.html                                            # Self-contained interactive Web Academy (HTML/CSS/JS)
├── index.html                                             # Updated with prominent "Launch OKF Academy Course" CTA
├── README.md                                              # Updated with OKF Course section & syllabus links
├── docs/
│   ├── okf/
│   │   └── concepts/
│   │       └── okf-course.md                              # OKF v0.2 concept documenting course.html & curriculum
│   └── course/
│       ├── README.md                                      # Course Overview, Syllabus, and CLI Lab Setup
│       ├── 01-why-okf-and-codebase-amnesia.md             # Module 1: Problem statement, principles, token economics
│       ├── 02-concept-anatomy-and-wayfinder.md            # Module 2: Bundle anatomy, scaling, okf & okf-wayfinder
│       ├── 03-okf-v02-trust-provenance-and-attestation.md # Module 3: Deep dive into OKF v0.2 & okf-upgrade
│       ├── 04-steering-gates-and-context-injection.md     # Module 4: AGENTS.md gates & okf-query retrieval
│       ├── 05-autonomous-upkeep-drift-and-visualization.md# Module 5: okf-maintain, okf-lint --drift, okf-visualize
│       ├── 06-pruning-hygiene-and-ci-gates.md             # Module 6: okf-prune garbage collection & CI workflows
│       ├── 07-capstone-self-documenting-repo.md           # Module 7: End-to-end rollout playbook & assessment
│       └── sandbox/                                       # Isolated practice bundle for CLI hands-on labs
│           ├── index.md
│           ├── log.md
│           └── concepts/
│               ├── legacy-payment-service.md              # v0.1 format fixture for okf-upgrade exercises
│               ├── expired-auth-flow.md                   # Expired stale_after fixture for okf-prune exercises
│               └── revenue-mrr-metric.md                  # v0.2 Attested Computation fixture for query/lint labs
```

---

## 3. Curriculum & Module Specifications

### Module 1: The Crisis of Codebase Amnesia & Why OKF Exists (`01-why-okf-and-codebase-amnesia.md`)
- **Level:** Beginner
- **Topics:**
  - The dual crisis of human onboarding and AI agent "cold starts" in brownfield codebases.
  - Why traditional wikis rot and why naive RAG / brute-force `grep` wastes 60–80% of context tokens.
  - The 4 Core OKF Principles: **Readable**, **Parseable**, **Diffable**, **Portable**.
  - Progressive disclosure via `index.md` and chronological auditing via `log.md`.
- **Hands-On Lab:** Inspect `/docs/okf/index.md` vs. raw workspace exploration and compare token footprints.
- **Quiz:** 3 checkpoint questions on OKF principles, reserved files, and progressive disclosure.

### Module 2: Anatomy of an OKF Concept & Guided Onboarding (`02-concept-anatomy-and-wayfinder.md`)
- **Level:** Beginner → Intermediate
- **Topics:**
  - Reserved files (`index.md`, `log.md`) vs. Concept files (`type` requirement, recommended frontmatter).
  - Building an untyped dependency graph with bundle-relative absolute links (`/concepts/...`).
  - Directory scaling rules: Flat layout (< 10 concepts) vs. categorized subdirectories (≥ 10 concepts) and automatic link refactoring.
  - Overcoming "blank page syndrome" with `okf-wayfinder` (`wayfinder_taxonomy.js`) to interview engineers and map the `## Not yet specified` frontier.
- **Hands-On Lab:** Run `node okf-wayfinder/scripts/wayfinder_taxonomy.js` and author a new concept in `docs/course/sandbox/`.
- **Quiz:** 3 checkpoint questions on link resolution, scaling thresholds, and Wayfinder taxonomy discovery.

### Module 3: What Changed in OKF v0.2 & The Problems It Solves (`03-okf-v02-trust-provenance-and-attestation.md`)
- **Level:** Intermediate *(Core Focus Module)*
- **Topics:**
  1. **From Uncited Prose to Verifiable Provenance (`sources` & `[^id]`):**
     - Why v0.1 inline `# Citations` failed automated validation.
     - How v0.2 `sources` binds `id`, `title`, `url`/`path`, `usage_window`, and `credibility` (`author`, `usage_count`, `last_modified`) to inline `[^id]` footnotes.
  2. **From Single Timestamp to Actor Identity & Trust Tiers (`generated` & `verified`):**
     - Why a bare `timestamp` couldn't tell you *who* wrote a claim or whether a human ever checked it.
     - Actor URI conventions: `<producer>/<version>`, `human:<id>`, `process:<id>`.
     - How the 3 **Trust Tiers** (`unverified`, `machine-confirmed`, `human-reviewed`) are computed and why `verified[].at >= generated.at` is required to prevent stale sign-offs.
  3. **From Git-Only Drift to Lifecycle & Time-Bounded Freshness (`status` & `stale_after`):**
     - Why some architectural truths expire even when code doesn't change (SLAs, vendor contracts, quarterly roadmaps).
     - Using `status` (`draft`, `stable`, `deprecated`) and `stale_after` (ISO 8601 UTC instant).
  4. **From Prose Metric Definitions to `Attested Computation`:**
     - Preventing metric drift across data/backend teams by binding `runtime`, typed `parameters`, `# Computation` code, `executor`, and `attester`.
  5. **Automated Migration (`okf-upgrade`):**
     - Upgrading legacy v0.1 bundles (`timestamp` → `generated`, `# Citations` → `sources` + footnotes, `okf_version: "0.2"`) with `node okf-upgrade/scripts/upgrade.js`.
- **Hands-On Lab:** Inspect `docs/course/sandbox/concepts/legacy-payment-service.md`, preview upgrade changes, inspect `revenue-mrr-metric.md`, and verify trust tiers.
- **Quiz:** 4 checkpoint questions covering trust tier rules, provenance footnotes, `stale_after`, and `Attested Computation`.

### Module 4: Closing the Loop — Steering Gates & Context Injection (`04-steering-gates-and-context-injection.md`)
- **Level:** Intermediate
- **Topics:**
  - Why documentation fails without behavioural enforcement in coding agents.
  - Anatomy of the `AGENTS.md` / `CLAUDE.md` steering specification (`okf-steering-version: 1.6.0`).
  - The **Pre-Work Grounding Gate**: Mandatory keyword search (`--search`), target file retrieval (`--file`), and explicit Grounding Citations before touching code.
  - How `okf-query` ranks and formats `=== OKF CONTEXT BLOCK ===` output, including v0.2 Trust Tiers, Status, and Provenance sources.
- **Hands-On Lab:** Run `node okf-query/scripts/query.js --search` and `--file` against both the main repo and `docs/course/sandbox`.
- **Quiz:** 3 checkpoint questions on steering gates and query modes.

### Module 5: Autonomous Upkeep, Drift Detection & Graph Visualization (`05-autonomous-upkeep-drift-and-visualization.md`)
- **Level:** Advanced
- **Topics:**
  - The **Pre-Completion Verification Gate**: Why agents must run `okf-maintain` and `okf-lint --drift` before ending a turn.
  - How `okf-maintain` automates mechanical upkeep: Git timestamp comparison, auto-healing steering files, updating `## Not yet specified` in `index.md`, appending to `log.md`, and regenerating `viz.html`.
  - How `okf-lint` validates v0.2 schema conformance, internal links, footnote references, `stale_after` expiration, steering file health, and git commit drift (`--drift`).
  - Human-in-the-Loop auditing with `okf-visualize` (Cytoscape.js interactive dependency graph).
- **Hands-On Lab:** Run `node okf-lint/scripts/lint.js --bundle docs/course/sandbox` and `node okf-maintain/scripts/maintain.js --check`.
- **Quiz:** 3 checkpoint questions on git drift detection, `maintain.js` automation, and graph auditing.

### Module 6: Knowledge Hygiene at Scale — Pruning & CI Quality Gates (`06-pruning-hygiene-and-ci-gates.md`)
- **Level:** Advanced → Architect
- **Topics:**
  - The 4 classes of knowledge decay in large repos: **Expired** (`stale_after` passed), **Deprecated** (`status: deprecated`), **Ghost Resources** (target `resource` file deleted), and **Orphaned Concepts** (unindexed & unlinked).
  - Running `okf-prune` in `--check`, `--dry-run`, `--auto` (archive to `.archive/`), and `--delete` modes while automatically cleaning dangling links in surviving files.
  - Enforcing the Knowledge Loop in CI/CD via GitHub Actions (`.github/workflows/okf-test.yml`) using `--json` outputs.
- **Hands-On Lab:** Run `node okf-prune/scripts/prune.js --bundle docs/course/sandbox --dry-run` to detect `expired-auth-flow.md` without mutating the repo.
- **Quiz:** 3 checkpoint questions on pruning categories, archive vs. delete, and CI gates.

### Module 7: Capstone — Bootstrapping a Self-Documenting Repository End-to-End (`07-capstone-self-documenting-repo.md`)
- **Level:** Architect
- **Topics:**
  - Step-by-step rollout playbook for Greenfield vs. Brownfield repositories.
  - Team governance: When to require `human-reviewed` vs. `machine-confirmed` trust tiers, and how to use `stale_after` for high-churn subsystems.
  - Full Capstone Checklist & Final Interactive Course Assessment.

---

## 4. Interactive Web Application Architecture (`course.html`)

- **Zero External Dependencies:** Pure HTML5, CSS3 (matching `index.html` design tokens), and vanilla JavaScript.
- **Core UI Components:**
  1. **Sticky Sidebar Navigation & Progress Tracker:** Lists all 7 modules, estimated reading/lab time, difficulty badge (`Beginner`, `Intermediate`, `Advanced`, `Architect`), and completion checkmarks persisted in `localStorage`.
  2. **Interactive OKF v0.1 vs. v0.2 Diff & Problem Explorer (in Module 3):**
     - 4 selectable tabs (*Provenance & Citations*, *Actor Identity & Trust Tiers*, *Lifecycle & Expiration*, *Attested Computations*).
     - Shows "The v0.1 Problem", "The v0.2 Solution", and a side-by-side syntax-highlighted YAML/Markdown comparison.
  3. **Interactive Trust Tier Simulator (in Module 3):**
     - Allows learners to toggle `generated.by` and add/remove `verified` entries (`agent`, `human:alice`, outdated timestamp vs. fresh timestamp) to see the resulting Trust Tier badge (`unverified`, `machine-confirmed`, `human-reviewed`) and linter verdict live.
  4. **Hands-On CLI Lab Runner Cards:**
     - One-click "Copy Command" button for every lab step, plus an expandable "View Expected Terminal Output" drawer so browser-only learners can follow along.
  5. **"Practice with Your AI Agent" Prompt Cards:**
     - One-click copyable prompt per module tailored for Antigravity, Claude Code, or Cursor.
  6. **Interactive Module Quizzes:**
     - Multiple-choice questions at the end of each module with immediate visual feedback, explanation callouts, and automatic module completion marking in `localStorage`.

---

## 5. Testing, Verification & OKF Alignment

1. **Non-Destructive Sandbox:** All commands in `docs/course/sandbox/` use `--check` or `--dry-run` by default in automated checks so the repository working tree remains clean.
2. **OKF Self-Documentation:** Create `docs/okf/concepts/okf-course.md` (with `resource: file:///D:/projects/okf-skills/course.html`, `type: Concept`, `status: stable`, `generated`, `verified`, and `sources`) and link it in `docs/okf/index.md`.
3. **Verification Gates:** Run `npm test`, `npm run okf:maintain`, and `npm run okf:lint:drift` to guarantee 0 errors and 0 warnings.
