---
name: okf-maintain
description: Use after changing or learning something about a codebase that has an okf/ knowledge bundle, so the bundle doesn't go stale. Fires when your edits touch code an existing OKF concept documents, or when you discover a fact a concept should record.
---

Keep an existing **OKF bundle** current so it doesn't rot. This skill handles both reactive upkeep of existing files and the automatic authoring of new concept files when new significant components, schemas, or modules are introduced to the codebase. (For specific frontmatter/conformance rules, follow the `okf` skill, which is the single source of truth for how a concept is written).

1. **Guard: confirm a bundle exists.** Look for an `okf/` directory at the repo root (or the bundle root this repo uses). If there is none, stop — there is nothing to maintain.
   - Done when you have the bundle root, or have stopped.

2. **Identify affected and missing concepts.** Map what changed (files edited/created, features added, facts learned) to the concept file(s) that cover it. Check `index.md` if present. If your changes introduced a new significant database schema/collection, API route module, frontend dashboard page, or core system component not yet covered in the bundle, identify it as a new concept that must be created.
   - Done when you have the list of concepts to update and new concepts to create, or have confirmed none apply (then stop).

3. **Update and/or create concepts.** Edit existing affected concepts to match reality. If you identified missing concepts in Step 2, author new concept files for them. In both cases: set or refresh the `timestamp` (run `date -u +%Y-%m-%dT%H:%M:%SZ`), cross-link related concepts, and follow the `okf` skill guidelines for frontmatter and structure.
   - Done when every affected concept reflects the change and all new concepts are authored.

4. **Update reserved files.** Append a dated line to `log.md` describing the changes and additions. If you added a new concept, add it to `index.md`.
   - Done when `log.md` records the change and `index.md` lists any new concept — for each reserved file the bundle uses.

5. **Conformance gate.** Verify the bundle still conforms, per the `okf` skill.
   - Done when every non-reserved `.md` has parseable frontmatter with a non-empty `type`.
