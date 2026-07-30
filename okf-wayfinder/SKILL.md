---
name: okf-wayfinder
description: Guide users in establishing and documenting new concepts in their OKF bundle through interactive, context-aware interviews.
version: 1.2.0
---

# `okf-wayfinder` Workflow

Guide the developer through creating a brand new, fully conforming OKF concept file using a mix of codebase telemetry and brief interactive questions.

## Steps

1. **Locate the Bundle & Scan Registry**
   - Check `/docs/okf` or `/okf` for the bundle root. If none exists, ask if you should initialize a new one.
   - Scan existing concepts to extract the list of defined `types`, `tags`, and any untracked workspace files (`frontier`). This prevents vocabulary fragmentation and identifies undocumented files.
   - Run the utility script:
     ```powershell
     node <path-to-skill-directory>/scripts/wayfinder_taxonomy.js
     ```

2. **Categorize the Concept & Propose Frontier Files**
   - Read the `frontier` (untracked files) list returned by the taxonomy script.
   - Propose these undocumented files directly to the user (e.g., *"I see these workspace files are undocumented. Would you like to create a concept for one of them?"*).
   - Display existing types (including standard types: `Concept`, `Skill`, `Utility`, `Decision`) and ask:
     > "Select the concept type:
     > 1) Concept [existing]
     > 2) Skill [existing]
     > 3) Utility [existing]
     > 4) Decision (Architectural Decision Record/Rationale)
     > 5) [Custom type...]"
   - Ensure that any links between concepts use descriptive name labels (e.g., `[Label](/concepts/target.md)`) rather than bare filenames or URLs.

3. **Autogenerate a Telemetry Draft (If Applicable)**
   - If the concept relates to an existing file in the workspace (e.g., a controller, SQL migration file, or deploy script), read the file first.
   - Generate a draft concept containing code definitions, resources, and dependencies.

4. **Conduct the Focus Interview**
   - Ask **at most 3 targeted questions** to extract tribal knowledge that code analysis cannot discover (e.g., SLA guarantees, business constraints, external contact points, or common failure modes).
   - *Example for a Playbook:* "What triggers this playbook, and who should be contacted if it fails?"
   - *Example for a Database:* "What is the data retention policy, and who owns the upstream ingestion?"

5. **Draft and Verify Conformance**
   - Compile the inputs into a clean `.md` concept file with a valid YAML frontmatter block.
   - Ensure the `timestamp` is set to the current UTC date and time.
   - Add the concept to `index.md` and log the change in `log.md`.
