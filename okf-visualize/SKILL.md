---
name: okf-visualize
description: Generate and display an interactive Cytoscape.js HTML graph visualization for an OKF knowledge bundle. Use when the user asks to visualize, graph, view, or render an OKF bundle.
---

# Visualizing OKF Bundles

Generate a self-contained interactive Cytoscape.js HTML visualization of an Open Knowledge Format (OKF) bundle, and copy it to the active conversation's artifact directory so the user can open the interactive graph.

## Workflow

1. **Locate the OKF bundle.** Find the directory containing the OKF concepts. Look for a directory containing `index.md`, `log.md`, or markdown files with `type:` frontmatter.
   * **Done when**: You have the absolute path to the bundle directory (e.g., `file:///<artifact-directory-path>/knowledge-catalog/okf/bundles/ga4`).

2. **Run the visualization command.** Generate the `viz.html` file using the custom Node.js visualization script.
   * Run the command (resolving the path to this skill's folder):
     ```powershell
     node <path-to-skill-directory>/scripts/visualize.js --bundle <absolute-path-to-bundle> --out <absolute-path-to-bundle>/viz.html
     ```
   * **Done when**: The command finishes successfully and `viz.html` exists inside the bundle directory.

3. **Copy to the active artifact directory.** Copy the generated `viz.html` file to the active conversation's artifact directory so it can be previewed/rendered in the chat UI.
   * Locate the conversation's artifact directory (usually matching `<appDataDir>\brain\<conversation-id>`).
   * Copy the file (e.g., using `Copy-Item` in PowerShell):
     ```powershell
     Copy-Item -Path "<absolute-path-to-bundle>/viz.html" -Destination "<artifact-directory-path>/viz.html"
     ```
   * **Done when**: `viz.html` is successfully copied to the artifact directory.

4. **Share the interactive visualization.** Inform the user that the visualization has been compiled and copy-pasted to the artifacts folder. Provide a clickable absolute file link using the `file://` scheme to let them open it directly in their browser.
   * **Done when**: You output the clickable markdown link, e.g. `[Interactive Visualization](file:///<artifact-directory-path>/viz.html)`.

## Troubleshooting & Technical Implementation Notes

If you modify or update the visualization script at `scripts/visualize.js`, note these critical rules to prevent regressions:

- **Absolute Link Resolution**: OKF bundles use absolute links (starting with `/` like `[auth](/backend/auth.md)`). The link extractor resolves these relative to the bundle root (e.g. `path.join(bundleRootResolved, target)`) rather than ignoring them or throwing resolution errors.
- **Regex Replacement Safety**: When injecting CSS, JS, and JSON data into the HTML template, do NOT pass raw strings to `.replace()`. Because Markdown and JSON strings can contain backticks and dollar signs (which JavaScript interprets as special replacement patterns like `$&` or `$``), always use a function returning the replacement string:
  ```javascript
  template.replace('__BUNDLE_DATA__', () => JSON.stringify(graph));
  ```
