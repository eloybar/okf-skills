---
type: Playbook
title: Development Workflow
description: Recommended git contribution process for okf-skills.
resource: file:///D:/projects/okf-skills/README.md
tags: [workflow, git, contribution]
generated:
  by: agent:Antigravity/3.5-Flash
  at: 2026-08-24T18:51:02Z
---

# Overview
This playbook outlines the standard git and release workflow for contributors to the `okf-skills` repository. Following these steps ensures code quality, clean history, and repository hygiene.

# Workflow Steps

1. **Commit a change**
   - Stage your files using `git add` and commit them with a descriptive message.
   - Follow standard conventional commit format where applicable.

2. **Create a Pull Request**
   - Push your branch to the remote repository.
   - Open a Pull Request (PR) on GitHub against the target branch (`main`).
   - Fill out the PR description template and verify all CI tests pass.

3. **Rebase and Merge**
   - Once approved and CI is green, use the **Rebase and Merge** strategy.
   - This keeps the git history linear and avoids unnecessary merge commits.

4. **Delete the Remote Branch**
   - Immediately delete the remote branch after the merge is successful to keep the remote clean.
