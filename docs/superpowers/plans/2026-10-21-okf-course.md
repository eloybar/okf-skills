# OKF Interactive Academy & Markdown Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete OKF Interactive Web Academy (`course.html`), the 7-module Markdown curriculum (`docs/course/`), an isolated CLI lab sandbox (`docs/course/sandbox/`), and OKF bundle self-documentation (`docs/okf/concepts/okf-course.md`).

**Architecture:** Dual-surface synchronized educational platform inside `okf-skills`. `course.html` provides a zero-dependency interactive web app (matching `index.html`'s design tokens) with `localStorage` progress tracking, a live OKF v0.1 vs. v0.2 Diff & Problem-Solver Explorer, a Trust Tier State Machine Simulator, copyable CLI lab cards, Agent Tutor prompts, and interactive module quizzes. `docs/course/` provides the canonical Markdown lessons and a safe `docs/course/sandbox/` bundle for hands-on CLI exercises.

**Tech Stack:** Zero-dependency HTML5, CSS3, vanilla JavaScript (browser), Markdown with YAML frontmatter (OKF v0.2), Node.js built-in `assert`/`fs`/`path` for verification tests.

**Spec:** `docs/superpowers/specs/2026-10-21-okf-course-design.md`

## Global Constraints

- Zero external npm dependencies in `package.json`.
- `docs/` is ignored by `okf-maintain/scripts/maintain.js` workspace frontier scanning; all Markdown curriculum and sandbox files MUST reside under `docs/course/`.
- `course.html` at the repository root MUST be documented by `docs/okf/concepts/okf-course.md` with `resource: file:///D:/projects/okf-skills/course.html` and linked in `docs/okf/index.md`.
- All OKF checks (`npm test`, `npm run okf:maintain`, `npm run okf:lint:drift`) MUST pass with 0 errors and 0 warnings before completion.

---

### Task 1: Practice Sandbox Bundle (`docs/course/sandbox/`) & Course Verification Script

**Files:**
- Create: `docs/course/sandbox/index.md`
- Create: `docs/course/sandbox/log.md`
- Create: `docs/course/sandbox/concepts/legacy-payment-service.md`
- Create: `docs/course/sandbox/concepts/expired-auth-flow.md`
- Create: `docs/course/sandbox/concepts/revenue-mrr-metric.md`
- Create: `scripts/test-course.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `okf-query/scripts/query.js`, `okf-lint/scripts/lint.js`, `okf-prune/scripts/prune.js`
- Produces: `docs/course/sandbox/` fixtures and `scripts/test-course.js` verifying sandbox queries, course markdown files, and `course.html` interactive elements.

- [ ] **Step 1: Write the failing course verification test (`scripts/test-course.js`)**

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert').strict;

const rootDir = path.resolve(__dirname, '..');
const sandboxDir = path.join(rootDir, 'docs', 'course', 'sandbox');

console.log('Running OKF Course & Sandbox verification tests...');

// 1. Verify sandbox bundle fixtures exist
const requiredSandboxFiles = [
  'index.md',
  'log.md',
  'concepts/legacy-payment-service.md',
  'concepts/expired-auth-flow.md',
  'concepts/revenue-mrr-metric.md'
];

for (const rel of requiredSandboxFiles) {
  const full = path.join(sandboxDir, rel);
  assert.ok(fs.existsSync(full), `Missing sandbox fixture: ${rel}`);
}

// 2. Verify okf-query works against sandbox Attested Computation
const queryOut = execSync(
  `node okf-query/scripts/query.js --bundle docs/course/sandbox --search "MRR"`,
  { cwd: rootDir }
).toString();
assert.ok(queryOut.includes('Monthly Recurring Revenue (MRR)'), 'Sandbox query should return MRR Attested Computation');
assert.ok(queryOut.includes('human-reviewed'), 'MRR concept in sandbox should have human-reviewed trust tier');

// 3. Verify okf-prune --dry-run detects expired-auth-flow.md without deleting it
const pruneOut = execSync(
  `node okf-prune/scripts/prune.js --bundle docs/course/sandbox --dry-run --json`,
  { cwd: rootDir }
).toString();
const pruneJson = JSON.parse(pruneOut);
assert.ok(pruneJson.candidates.some(c => c.file.includes('expired-auth-flow.md')), 'Prune dry-run should detect expired-auth-flow.md');
assert.ok(fs.existsSync(path.join(sandboxDir, 'concepts', 'expired-auth-flow.md')), 'Dry-run must not delete sandbox file');

console.log('✓ Sandbox fixtures and CLI lab targets verified.');
```

- [ ] **Step 2: Run `node scripts/test-course.js` to verify it fails**

Run: `node scripts/test-course.js`
Expected: FAIL with `Missing sandbox fixture: index.md`

- [ ] **Step 3: Create the sandbox bundle fixtures in `docs/course/sandbox/`**

Create `docs/course/sandbox/index.md`, `docs/course/sandbox/log.md`, `docs/course/sandbox/concepts/legacy-payment-service.md` (demonstrating v0.1 legacy `timestamp` and inline `# Citations`), `docs/course/sandbox/concepts/expired-auth-flow.md` (demonstrating `stale_after: 2025-01-01T00:00:00Z` for `okf-prune --dry-run`), and `docs/course/sandbox/concepts/revenue-mrr-metric.md` (demonstrating a complete v0.2 `Attested Computation` with `human-reviewed` trust tier and `sources` footnotes).

- [ ] **Step 4: Run `node scripts/test-course.js` to verify it passes**

Run: `node scripts/test-course.js`
Expected: PASS (`✓ Sandbox fixtures and CLI lab targets verified.`)

- [ ] **Step 5: Commit Task 1**

```bash
git add docs/course/sandbox scripts/test-course.js
git commit -m "feat(course): add CLI practice sandbox bundle and verification script"
```

---

### Task 2: Markdown Curriculum Syllabus & Modules 1–3 (`docs/course/`)

**Files:**
- Create: `docs/course/README.md`
- Create: `docs/course/01-why-okf-and-codebase-amnesia.md`
- Create: `docs/course/02-concept-anatomy-and-wayfinder.md`
- Create: `docs/course/03-okf-v02-trust-provenance-and-attestation.md`
- Modify: `scripts/test-course.js`

**Interfaces:**
- Consumes: `docs/course/sandbox/` fixtures
- Produces: Syllabus and Modules 1–3 Markdown files covering OKF fundamentals, Wayfinder onboarding, and the deep-dive into OKF v0.2 improvements.

- [ ] **Step 1: Extend `scripts/test-course.js` to assert syllabus and Modules 1–3 exist and contain required sections**

Add checks in `scripts/test-course.js` for `docs/course/README.md`, `01-why-okf-and-codebase-amnesia.md`, `02-concept-anatomy-and-wayfinder.md`, and `03-okf-v02-trust-provenance-and-attestation.md` (including `sources`, `generated`, `verified`, `stale_after`, `Attested Computation`, and `okf-upgrade`).

- [ ] **Step 2: Run `node scripts/test-course.js` to verify it fails**

Run: `node scripts/test-course.js`
Expected: FAIL with missing course module files

- [ ] **Step 3: Write `docs/course/README.md` and Modules 1–3**

Author complete, richly detailed lessons with Mermaid diagrams, v0.1 vs. v0.2 comparison tables, hands-on CLI labs targeting `docs/course/sandbox/`, Agent Tutor prompts, and checkpoint questions.

- [ ] **Step 4: Run `node scripts/test-course.js` to verify it passes**

Run: `node scripts/test-course.js`
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add docs/course/README.md docs/course/01-why-okf-and-codebase-amnesia.md docs/course/02-concept-anatomy-and-wayfinder.md docs/course/03-okf-v02-trust-provenance-and-attestation.md scripts/test-course.js
git commit -m "docs(course): add syllabus and modules 1-3 covering OKF foundations and v0.2"
```

---

### Task 3: Markdown Curriculum Modules 4–7 (`docs/course/`)

**Files:**
- Create: `docs/course/04-steering-gates-and-context-injection.md`
- Create: `docs/course/05-autonomous-upkeep-drift-and-visualization.md`
- Create: `docs/course/06-pruning-hygiene-and-ci-gates.md`
- Create: `docs/course/07-capstone-self-documenting-repo.md`
- Modify: `scripts/test-course.js`

**Interfaces:**
- Consumes: `docs/course/README.md`, `docs/course/sandbox/`
- Produces: Complete 7-module Markdown curriculum (`04` through `07`).

- [ ] **Step 1: Extend `scripts/test-course.js` to assert Modules 4–7 exist and contain labs, tutor prompts, and quizzes**

- [ ] **Step 2: Run `node scripts/test-course.js` to verify it fails**

Run: `node scripts/test-course.js`
Expected: FAIL with missing Module 4–7 files

- [ ] **Step 3: Write Modules 4–7 (`04` through `07`)**

Author complete lessons for Steering Gates & Context Injection (`AGENTS.md` + `okf-query`), Autonomous Upkeep & Drift Detection (`okf-maintain`, `okf-lint --drift`, `okf-visualize`), Knowledge Hygiene & CI Gates (`okf-prune` + GitHub Actions), and the Architect Capstone.

- [ ] **Step 4: Run `node scripts/test-course.js` to verify it passes**

Run: `node scripts/test-course.js`
Expected: PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add docs/course/04-steering-gates-and-context-injection.md docs/course/05-autonomous-upkeep-drift-and-visualization.md docs/course/06-pruning-hygiene-and-ci-gates.md docs/course/07-capstone-self-documenting-repo.md scripts/test-course.js
git commit -m "docs(course): add modules 4-7 covering steering, drift upkeep, pruning, and capstone"
```

---

### Task 4: Interactive Web Academy (`course.html`) & Integration Links (`index.html`, `README.md`, `/docs/okf`)

**Files:**
- Create: `course.html`
- Create: `docs/okf/concepts/okf-course.md`
- Modify: `docs/okf/index.md`
- Modify: `index.html`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `scripts/test-course.js`

**Interfaces:**
- Consumes: `docs/course/` curriculum content, `index.html` design tokens
- Produces: Self-contained `course.html` interactive web app, updated navigation CTAs in `index.html` and `README.md`, and synchronized OKF bundle concept `docs/okf/concepts/okf-course.md`.

- [ ] **Step 1: Extend `scripts/test-course.js` to verify `course.html`, `index.html` link, `README.md` section, and `docs/okf/concepts/okf-course.md`**

- [ ] **Step 2: Run `node scripts/test-course.js` to verify it fails**

Run: `node scripts/test-course.js`
Expected: FAIL (`course.html` does not exist)

- [ ] **Step 3: Create `course.html`, `docs/okf/concepts/okf-course.md`, and update `index.html`, `README.md`, `docs/okf/index.md`, and `package.json`**

Build `course.html` with:
- Sidebar curriculum navigation across all 7 modules + `localStorage` progress bar
- Module 3 Interactive v0.1 vs. v0.2 Diff & Problem-Solver Explorer (4 tabs)
- Module 3 Interactive Trust Tier State Machine Simulator (`unverified` / `machine-confirmed` / `human-reviewed`)
- Copyable CLI Lab Runner cards with expandable terminal output previews
- Copyable "Practice with Your AI Agent" Tutor prompts per module
- Interactive multiple-choice quizzes per module with immediate feedback and completion badges

- [ ] **Step 4: Run `npm run okf:maintain`, `npm run okf:lint:drift`, and `npm test` to verify everything passes with 0 errors and 0 warnings**

Run: `node scripts/test-course.js; npm run okf:maintain; npm run okf:lint:drift; npm test`
Expected: PASS with 0 errors and 0 warnings

- [ ] **Step 5: Commit Task 4**

```bash
git add course.html index.html README.md package.json scripts/test-course.js docs/okf/
git commit -m "feat(course): launch interactive OKF Academy web app and register OKF concept"
```
