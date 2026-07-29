---
type: Skill
title: OKF Visualize Skill
description: Generates an interactive Cytoscape.js HTML graph visualization showing concepts and their relationships.
resource: file:///D:/projects/okf-skills/okf-visualize/SKILL.md
tags: [visualization, graph, network]
timestamp: 2026-07-29T20:54:39Z
---

# Overview
The `okf-visualize` skill parses the concepts in the OKF bundle, extracts their frontmatter metadata and internal markdown links, builds a concept network graph, and compiles it into a self-contained interactive `viz.html` page.

# Architecture & Script
- **Script**: Located at [visualize.js](/okf-visualize/scripts/visualize.js).
- **Templates**: Located under [templates/viz.html](/okf-visualize/templates/viz.html).
- **Workflow**:
  1. Walks the bundle directory (skipping `index.md` and `log.md`) to read concepts.
  2. Extracts YAML frontmatter and internal links (`[Label](/path/to/target.md)`).
  3. Builds Cytoscape.js nodes (colored by `type`) and edges.
  4. Injects CSS, JS, and bundle JSON into the HTML template.
  5. Outputs `viz.html` to the bundle root and copies it to the active conversation's artifact directory for easy rendering in the agent chat interface.
