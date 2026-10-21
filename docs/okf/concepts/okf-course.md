---
type: Concept
title: OKF Academy Interactive Course
description: Self-contained interactive web academy and 7-module curriculum teaching OKF v0.2, trust tiers, provenance, attested computations, and the Knowledge Loop.
resource: file:///D:/projects/okf-skills/course.html
tags: [course, academy, education, onboarding, v0.2, curriculum]
status: stable
stale_after: 2027-12-31T23:59:59Z
generated:
  by: Antigravity/4.0
  at: 2026-10-21T13:30:00.000Z
verified:
  - by: okf-lint/1.6.0
    at: 2026-10-21T13:30:05.000Z
sources:
  - id: course-web-app
    title: Interactive OKF Academy Web Application
    path: course.html
  - id: course-syllabus
    title: OKF Academy 7-Module Markdown Syllabus
    path: docs/course/README.md
---

# Overview
The [OKF Academy Interactive Course](/concepts/okf-course.md) provides a progressive educational track (**Beginner → Architect**) teaching software engineers, tech leads, and AI agent builders how to adopt and operate the [Open Knowledge Format (OKF) Specification v0.2](/concepts/okf-specification.md) across the [Knowledge Loop Lifecycle](/concepts/knowledge-loop.md)[^course-web-app][^course-syllabus].

# Dual-Surface Architecture
1. **Interactive Web Application (`course.html`)**: A zero-dependency browser application matching the [Interactive Simulator & Playbook](/concepts/interactive-simulator.md) design system[^course-web-app]. Features `localStorage` progress tracking, a side-by-side **OKF v0.1 vs. v0.2 Diff & Problem-Solver Explorer**, an interactive **Trust Tier State Machine Simulator**, copyable CLI Lab cards, Agent Tutor prompts, and module quizzes.
2. **Markdown Curriculum & Practice Sandbox (`docs/course/`)**: Seven comprehensive Markdown modules (`01` through `07`) accompanied by an isolated practice sandbox (`docs/course/sandbox/`) containing legacy v0.1, expired (`stale_after`), and v0.2 `Attested Computation` fixtures[^course-syllabus].

# Related Concepts
- [OKF Specification v0.2](/concepts/okf-specification.md)
- [The Knowledge Loop Lifecycle](/concepts/knowledge-loop.md)
- [Interactive Simulator & Playbook](/concepts/interactive-simulator.md)
- [OKF Upgrade Skill](/concepts/okf-upgrade-skill.md)
- [OKF Prune Skill](/concepts/okf-prune-skill.md)

[^course-web-app]: Implemented in `course.html` at the repository root.
[^course-syllabus]: Documented in `docs/course/README.md` and modules `01` through `07`.
