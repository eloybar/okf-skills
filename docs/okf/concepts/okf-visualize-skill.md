---
type: Skill
title: OKF Visualize Skill
description: Generates an interactive Cytoscape.js HTML graph visualization showing concepts and their relationships.
resource: okf-visualize/SKILL.md
tags: [visualization, graph, network]
generated:
  by: Antigravity/4.0
  at: 2026-11-02T17:38:56.619Z
sources:
  - okf-visualize/scripts/visualize.js
  - okf-visualize/static/viz.css
  - okf-visualize/static/viz.js
---

# Overview
The `okf-visualize` skill parses the active concepts in the OKF bundle, extracts their frontmatter metadata and internal markdown links, builds a concept network graph, and compiles it into a self-contained interactive `viz.html` page.

# Architecture & Script
- **Script**: Located at [visualize.js](/okf-visualize/scripts/visualize.js).
- **Templates**: Located under [templates/viz.html](/okf-visualize/templates/viz.html).
- **Workflow**:
  1. Walks the bundle directory (skipping `index.md`, `log.md`, and `archive/`) to read active concepts.
  2. Extracts YAML frontmatter (including OKF v0.2 `generated`, `verified`, `sources` strings & objects, `usage_window`, and `Attested Computation` fields `runtime`, `parameters`, `computation`, `executor`, `attester`) and internal links across Markdown body, `sources`, `computation`, `executor.resource`, and `attester.resource`.
  3. Builds Cytoscape.js nodes (colored by `type` across standard and architectural taxonomy types) and edges (`links` and `derived-from`).
  4. Injects CSS, JS, and bundle JSON into the HTML template, rendering rich provenance, credibility signals (`usage_count`, `last_modified`), and Attested Computation metadata in the interactive sidebar.
  5. Outputs `viz.html` to the bundle root and copies it to the active conversation's artifact directory for easy rendering in the agent chat interface.
