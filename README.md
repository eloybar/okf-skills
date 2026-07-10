# The Self-Documenting Codebase (OKF Skills)

> **Live Interactive Visualizer & Token Simulator:** [👉 Visit the Interactive OKF Playbook & Simulator](https://eloybar.github.io/okf-skills/)

Integrating Open Knowledge Format (OKF) specifications with LLM skills constructs an adaptable, zero-rot knowledge ecosystem for brownfield and greenfield repositories. 

---

## 🔄 The Knowledge Loop Lifecycle

The self-documenting codebase runs on a closed-loop system of continuous concept mapping, steering, and verification:

```mermaid
graph TD
    A[01. OKF Specification] --> B[02. Initial Bundle]
    B --> C[03. AGENTS.md Setup]
    C --> D[04. Model-Invoked Maintenance]
    D -->|Autonomous Upkeep| B
    D --> E[05. Interactive Visualization]
    E -->|HITL Refinement| B
```

### 1. OKF Specification
Establishes typed Markdown concepts to store codebase architecture, core domain models, and solutions.
* **Component**: [okf/SKILL.md](file:///D:/projects/okf-skills/okf/SKILL.md)

### 2. Initial Bundle Creation
Builds the first set of concepts under `./okf` or `./docs/solutions` to document the codebase's architecture and lessons learned.
* **Component**: [okf/SKILL.md](file:///D:/projects/okf-skills/okf/SKILL.md)

### 3. AGENTS.md Steering Notice
Informs incoming LLM agents (like Antigravity or Claude Code) that the repository has a structured knowledge base, providing instructions on how to use it.
* **Component**: `AGENTS.md` (root directory configuration)

### 4. Model-Invoked Maintenance
Automatically runs post-edit checks to verify that modifications to files don't render documentation out of date. 
* **Component**: [okf-maintain/SKILL.md](file:///D:/projects/okf-skills/okf-maintain/SKILL.md)

### 5. Interactive Visualization
Generates dynamic Cytoscape.js HTML graph visualizations of concepts, dependencies, and connections.
* **Component**: [okf-visualize/SKILL.md](file:///D:/projects/okf-skills/okf-visualize/SKILL.md)

---

## ⚡ Why This Approach is Effective

* **Eliminating the "Cold Start":** When a new developer or agent joins a project, they do not need to spend hours manually reading files to construct a mental model.
* **Adaptive Context Scaling:** Rather than providing a raw dump of files, agents ingest only the relevant concept bundles.
* **Zero Documentation Rot:** By hooking into the agent's edit lifecycle, concepts are kept fresh with every commit.

---

## 📥 Installation & Setup

You can install, update, or remove these skills using any of the following methods:

### Method 1: Local Script Installer (Recommended)
This is the simplest and most robust method. It works locally, has no external dependencies, and is immune to network or copy-paste line-wrapping errors.

1. **Clone the repository and run the installer**:
   * **Windows (PowerShell)**:
     ```powershell
     git clone https://github.com/eloybar/okf-skills.git; cd okf-skills; .\install.ps1
     ```
   * **macOS / Linux (Bash)**:
     ```bash
     git clone https://github.com/eloybar/okf-skills.git && cd okf-skills && ./install.sh
     ```

2. **Clean up the clone** (Optional — the installer copies the skills to your global agent path, so you can delete the repository folder afterward):
   * *Windows*: `cd ..; Remove-Item -Path okf-skills -Recurse -Force`
   * *macOS/Linux*: `cd .. && rm -rf okf-skills`

* **To Update**: Navigate to your cloned `okf-skills` folder, pull changes, and run the script again:
  * *Windows*: `git pull; .\install.ps1`
  * *macOS/Linux*: `git pull && ./install.sh`
* **To Remove**: Run the installer with the remove action:
  * *Windows*: `.\install.ps1 -Action Remove`
  * *macOS/Linux*: `./install.sh --action Remove`

---

### Method 2: Using the `skills` CLI
If you want to install the skills **locally inside a specific project workspace** (rather than globally), and your agent environment supports the `npx skills` tool:

* **To Install / Update**:
  ```bash
  npx skills add eloybar/okf-skills
  ```
* **To Check for Updates**:
  ```bash
  npx skills check
  ```
* **To Update Specific Skills**:
  ```bash
  npx skills update okf okf-maintain okf-visualize
  ```
* **To Remove**:
  ```bash
  npx skills remove okf okf-maintain okf-visualize
  ```

> [!TIP]
> **Node.js Requirement:** The `npx skills` tool requires Node.js v16+ (v18+ or v20+ recommended). If you get an `Unexpected token import` or `ERR_REQUIRE_ESM` error, either upgrade Node.js or use **Method 1** above.

> [!IMPORTANT]
> **CLI Global Limitation:** The `skills` CLI does not support installing Markdown/PromptScript skills globally; running it with `-g` or `--global` will fail with a `PromptScript does not support global skill installation` error.
> 
> To use these skills globally across all folders, use **Method 1 (Local Script)**.

> [!NOTE]
> **Common Agent Skills Directories:**
> * **Google Antigravity / Gemini CLI**: `~/.gemini/config/skills`
> * **Claude Code**: `~/.claude/skills`
> * **Hermes**: `~/.hermes/skills`
> * **Codex**: `~/.codex/skills`

----

## 🚀 Quick Start (OKF in Action)

Once you have installed the skills, here is how you use them in your development workflow:

### Scenario A: Greenfield Project (Bootstrapping New Repositories)
If you are starting a fresh project and want to lay down solid agent-steering guidelines from Day 1:

1. **Launch your agent** in the project directory:
   ```bash
   # Run the startup command for your preferred agent CLI:
   agy      # Google Antigravity
   claude   # Claude Code
   pi       # Pi
   hermes   # Hermes
   codex    # Codex
   ```
2. **Bootstrap the OKF bundle**: Ask the agent to initialize OKF:
   > "initialize OKF" (or run the `/okf` custom command)
3. **What happens**:
   * The agent automatically creates an `okf/` folder at the root.
   * It populates it with standard index and log files.
   * It writes a root-level `AGENTS.md` file directing all future agent sessions to read and maintain the OKF bundle.
   * It begins drafting initial concept files describing the starting code architecture.

---

### Scenario B: Brownfield Project (Maintaining Existing Codebases)
If you have an existing codebase and are making changes (like refactoring a module, adding a database table, or introducing a service):

1. **Work on your task** as usual using the agent:
   > "add a new checkouts database table and API endpoint"
2. **Automated Upkeep (No manual action required)**:
   * Because the root-level `AGENTS.md` directs all future agent sessions to read and maintain the OKF bundle, the agent will **automatically run the upkeep pipeline** (`okf-maintain` skill) as part of finishing its task.
   * The agent scans your codebase modifications, detects that the checkout database structure and API endpoint were added, and automatically generates or updates the concept files (e.g. `okf/tables/checkouts.md`).
   * It automatically updates the global `okf/index.md` index and appends an entry to `okf/log.md`.
   * Your codebase and its agent-navigable documentation remain in perfect, automated sync without you ever having to ask!

----

## 🛠️ Repository Contents

This repository implements the above pipeline via the following custom agent skills:

* **[okf/](file:///D:/projects/okf-skills/okf/)**: Handles creation and structure of Open Knowledge Format (OKF) bundles.
* **[okf-maintain/](file:///D:/projects/okf-skills/okf-maintain/)**: Runs validation after changes to keep concepts updated.
* **[okf-visualize/](file:///D:/projects/okf-skills/okf-visualize/)**: Generates the interactive Cytoscape graphs.
* **[okf_thought_process.html](file:///D:/projects/okf-skills/okf_thought_process.html)**: The original visual brief and token simulator.



---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](file:///D:/projects/okf-skills/LICENSE) file for details.

