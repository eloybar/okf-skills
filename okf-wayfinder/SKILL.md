---
name: okf-wayfinder
description: Guide users in establishing and documenting new concepts in their OKF bundle through interactive, context-aware interviews.
version: 1.8.0
---

# `okf-wayfinder` Workflow

Guide the developer through creating a brand new, fully conforming OKF v0.2 concept file using a mix of automated codebase telemetry and brief interactive questions.

> **Model-Tier Steering:** Use the **High** reasoning setting of the active model during initial bundle bootstrapping and interactive concept discovery interviews. Once the architecture and implementation plan are laid out, switch back to the **Medium** setting of the same model for implementation and routine upkeep.

## Steps

1. **Locate the Bundle & Scan Registry**
   - Check `/docs/okf` or `/okf` for the bundle root. If none exists, ask if you should initialize a new one. If initializing, create the root `index.md` containing `okf_version: 0.2` in its frontmatter, create `log.md`, and create or update the appropriate root-level agent steering file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, or `GEMINI.md`) as detailed in Step 5 of the core `okf` skill to guide future agents.
   - Scan existing concepts to extract defined `types`, `tags`, existing `concepts` (with their `markdownLink` paths), bundle `layoutMode` (`flat` vs `nested`) and `subdirectories`, and untracked workspace files (`frontier` and clustered `frontierGroups`). This prevents vocabulary fragmentation and surfaces undocumented modules.
   - Run the utility script:
     ```bash
     node <path-to-skill-directory>/scripts/wayfinder_taxonomy.js [--bundle <path>]
     ```

2. **Categorize the Concept & Propose Clustered Frontier Candidates**
   - Read the `frontierGroups` (clustered module candidates with a `primaryCandidate`, `companionFiles`, and `suggestedType`) and `frontier` returned by the taxonomy script.
   - Propose undocumented module groups or files directly to the user (e.g., *"I see these undocumented modules/files in the workspace. Would you like to create a concept for one of them, or document a different concept?"*).
   - Use the host environment's structured question tool when available (`ask_question` in Antigravity, `AskUserQuestion` in Claude Code) or fall back to a concise plain-text menu to select the concept `type` (highlighting existing bundle types alongside standard OKF types: `Concept`, `Skill`, `Utility`, `Playbook`, `Decision`, `Attested Computation`).
   - Ensure that all links between concepts use descriptive name labels from `concepts[].markdownLink` (e.g., `[Label](/concepts/target.md)`) rather than bare filenames or URLs.

3. **Autogenerate a Telemetry Draft (If Applicable)**
   - If the concept maps to one or more workspace files (e.g., a controller, SQL migration, skill, or deploy script), inspect the primary file with the telemetry flag and read relevant source files:
     ```bash
     node <path-to-skill-directory>/scripts/wayfinder_taxonomy.js --inspect <file-path> [--bundle <path>]
     ```
   - Use the telemetry output (`exportedSymbols`, `localImports`, `relatedConcepts`, and `git.lastModified` / `git.primaryAuthors`) to pre-populate:
     - Primary asset binding in `resource:` (`file:///...`) and companion module files in `sources:` so that all files in the module graduate out of `## Not yet specified` in `index.md`.
     - Candidate inline cross-links using `relatedConcepts[].markdownLink`.
     - Suggested failover/review owners from `git.primaryAuthors`.

4. **Conduct the Focus Interview (Type-Aware)**
   - Ask **at most 3 targeted questions** (using structured question tools where appropriate) to extract tribal knowledge that static code analysis cannot infer, tailored to the chosen `type`:
     - **Service / Subsystem / Concept:** *"What are the SLA expectations, critical failure modes, or non-obvious architectural constraints?"*
     - **Database / Data Model:** *"What is the data retention/partitioning policy, and who owns upstream ingestion?"*
     - **Playbook / Operations:** *"What triggers this runbook, who is the escalation contact if it fails, and when should it be re-verified (`stale_after`, e.g., 90 or 180 days)?"*
     - **Decision (ADR):** *"What problem context forced this decision, what alternatives were rejected, and what are the trade-offs?"*
     - **Attested Computation:** *"What is the execution `runtime` (e.g., `bigquery`, `postgres`, `python`, `dbt`), what typed `parameters` are required, and which scripts act as `executor` and `attester`?"*

5. **Draft, Attest Human Verification, and Sync Lifecycle**
   - Compile the inputs into a clean `.md` concept file placed according to `layoutMode` and existing `subdirectories` (see **Directory Organization & Scaling**).
   - Populate OKF v0.2 frontmatter:
     - Required `type`, plus `title`, `description`, `resource`, `tags`, `status: stable`, and `sources` (binding all companion files).
     - `generated: { by: <producer>/<version>, at: <UTC-ISO-timestamp> }`.
     - **Human-Reviewed Trust Attestation (`verified`):** Present the draft to the developer for confirmation. Because `okf-wayfinder` is an interactive human-in-the-loop interview, once the developer approves the concept, record their sign-off in `verified:` (using `git.suggestedVerifierActor` or `human:<id>`):
       ```yaml
       verified:
         - by: human:<developer-id>
           at: <UTC-ISO-timestamp>
       ```
       This immediately graduates the concept from `unverified` to the **`human-reviewed`** trust tier.
     - If `type: Attested Computation`, include `runtime` (required), `parameters`, `computation` (or an inline `# Computation` section), `executor`, and `attester`.
     - If time-sensitive (e.g., `Playbook`, `Decision`, SLA contract), set `stale_after` to an ISO 8601 UTC expiration timestamp.
   - Add the concept to `index.md` and record a summary in `log.md` under a `## YYYY-MM-DD` date heading.
   - **Automated Post-Authoring Verification:** Run `okf-maintain` and `okf-lint --drift` to graduate bound files out of `## Not yet specified` in `index.md`, rebuild `viz.html`, and verify 0 errors and 0 warnings:
     ```bash
     node okf-maintain/scripts/maintain.js
     node okf-lint/scripts/lint.js --drift
     ```

## Directory Organization & Scaling

To prevent catalog clutter as the number of concepts increases, adhere to the following organization guidelines:
- **Preserve Existing Bundle Conventions:** First check `subdirectories` returned by `wayfinder_taxonomy.js` (such as `/concepts/` in skill/reference bundles) and follow the bundle's established folder structure.
- **Flat Layout (< 10 concepts and no subdirectories):** Keep concepts at the root (`/okf/*.md`) for simpler cross-linking.
- **Nested Layout (>= 10 concepts):** Organize concepts into standard logical subdirectories:
  - `/concepts/` — General domain concepts, specifications, and skill/reference catalogs.
  - `/subsystems/` — Core software modules, services, and API route logic.
  - `/data/` — Database schemas, entity models, and cache configurations.
  - `/operations/` — Deployment scripts, CI/CD, and quality assurance/testing setups.
  - `/playbooks/` — Common procedures, runbooks, and recovery checklists.
