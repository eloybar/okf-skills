#!/usr/bin/env bash
# install.sh - Installer/Updater/Remover for OKF Skills on macOS and Linux

set -e

ACTION="Install"
AGENT=""
NO_SYNC=0

print_help() {
    cat <<'EOF'
OKF Skills Installer & Updater (macOS / Linux)

Usage:
  bash ./install.sh [options]
  curl -fsSL https://raw.githubusercontent.com/eloybar/okf-skills/main/install.sh | bash

Options:
  -a, --agent <name>    Target agent: All, Antigravity, Claude, or Codex (default: interactive, or All when piped)
      --action <mode>   Install, Update, or Remove (default: Install)
      --no-sync         Skip automatic git fetch/reset when running from a local okf-skills clone
  -h, --help            Show this help message and exit
EOF
}

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --action) ACTION="$2"; shift ;;
        -a|--agent) AGENT="$2"; shift ;;
        --no-sync|--offline) NO_SYNC=1 ;;
        -h|--help) print_help; exit 0 ;;
        *) echo "Unknown parameter: $1"; print_help; exit 1 ;;
    esac
    shift
done

# Define default paths
ANTIGRAVITY_PATH="$HOME/.gemini/config/skills"
CLAUDE_PATH="$HOME/.claude/skills"
CODEX_PATH="$HOME/.codex/skills"
UNIVERSAL_PATH="$HOME/.agents/skills"

# Discover all Claude profile skill directories ($HOME/.claude/skills, $HOME/.claude-*/skills, and $CLAUDE_CONFIG_DIR/skills)
CLAUDE_DIRS=("$CLAUDE_PATH")
if [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$CLAUDE_CONFIG_DIR/skills" != "$CLAUDE_PATH" ]; then
    CLAUDE_DIRS+=("$CLAUDE_CONFIG_DIR/skills")
fi
for prof_dir in "$HOME"/.claude-*; do
    if [ -d "$prof_dir" ]; then
        prof_skills="$prof_dir/skills"
        already_in=0
        for existing in "${CLAUDE_DIRS[@]}"; do
            if [ "$existing" = "$prof_skills" ]; then
                already_in=1
                break
            fi
        done
        if [ "$already_in" -eq 0 ]; then
            CLAUDE_DIRS+=("$prof_skills")
        fi
    fi
done

# Discover all Codex profile skill directories ($HOME/.codex/skills, $HOME/.codex-*/skills, and $CODEX_HOME/skills)
CODEX_DIRS=("$CODEX_PATH")
if [ -n "${CODEX_HOME:-}" ] && [ "$CODEX_HOME/skills" != "$CODEX_PATH" ]; then
    CODEX_DIRS+=("$CODEX_HOME/skills")
fi
for prof_dir in "$HOME"/.codex-*; do
    if [ -d "$prof_dir" ]; then
        prof_skills="$prof_dir/skills"
        already_in=0
        for existing in "${CODEX_DIRS[@]}"; do
            if [ "$existing" = "$prof_skills" ]; then
                already_in=1
                break
            fi
        done
        if [ "$already_in" -eq 0 ]; then
            CODEX_DIRS+=("$prof_skills")
        fi
    fi
done

echo -e "\033[0;36m==========================================\033[0m"
echo -e "\033[0;36m     OKF Skills Manager for Unix (Bash)   \033[0m"
echo -e "\033[0;36m==========================================\033[0m"

# 1. Select the Agent (pipe-safe when stdin is non-interactive, e.g. curl ... | bash)
if [ -z "$AGENT" ]; then
    if [ -t 0 ]; then
        echo -e "\033[0;33mSelect the target AI Agent environment:\033[0m"
        echo "1) All Agents (Antigravity, Claude, Codex, and general agents) [Default]"
        echo "2) Google Antigravity CLI (agy)"
        echo "3) Claude Code"
        echo "4) OpenAI Codex CLI"
        choice=""
        read -r -p "Enter choice [1-4]: " choice || choice="1"
        if [ "$choice" = "2" ]; then
            AGENT="Antigravity"
        elif [ "$choice" = "3" ]; then
            AGENT="Claude"
        elif [ "$choice" = "4" ]; then
            AGENT="Codex"
        else
            AGENT="All"
        fi
    else
        AGENT="All"
        echo -e "\033[0;90mℹ Non-interactive shell detected — defaulting to All Agents.\033[0m"
    fi
else
    if [ "$AGENT" = "Claude" ] || [ "$AGENT" = "claude" ]; then
        AGENT="Claude"
    elif [ "$AGENT" = "Codex" ] || [ "$AGENT" = "codex" ]; then
        AGENT="Codex"
    elif [ "$AGENT" = "All" ] || [ "$AGENT" = "all" ]; then
        AGENT="All"
    else
        AGENT="Antigravity"
    fi
fi

# 2. Resolve source repository once (before iterating TARGET_DIRS) when Installing/Updating
SOURCE_ROOT=""
TEMP_DIR=""
cleanup_temp() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup_temp EXIT

if [ "$ACTION" != "Remove" ] && [ "$ACTION" != "remove" ]; then
    SCRIPT_DIR=""
    if [ -n "${BASH_SOURCE[0]:-}" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd || true)"
    fi

    # Require okf/SKILL.md and okf-maintain/SKILL.md so workspaces with an okf/ bundle are never mistaken for okf-skills
    if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/okf/SKILL.md" ] && [ -f "$SCRIPT_DIR/okf-maintain/SKILL.md" ]; then
        # Auto-sync clean local clone to origin/main using fetch + reset --hard (divergent-branch safe)
        if [ "$NO_SYNC" -eq 0 ] && [ -z "${OKF_INSTALLER_SYNCED:-}" ] && [ -f "$SCRIPT_DIR/.git/HEAD" ] && command -v git >/dev/null 2>&1; then
            CUR_BRANCH="$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
            DIRTY_STATUS="$(git -C "$SCRIPT_DIR" status --porcelain 2>/dev/null || true)"
            if { [ "$CUR_BRANCH" = "main" ] || [ "$CUR_BRANCH" = "master" ] || [ "$CUR_BRANCH" = "HEAD" ]; } && [ -z "$DIRTY_STATUS" ]; then
                echo -e "\033[0;90mℹ Syncing local okf-skills clone with origin/main...\033[0m"
                OLD_HEAD="$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || true)"
                if git -C "$SCRIPT_DIR" fetch origin main --quiet 2>/dev/null && git -C "$SCRIPT_DIR" reset --hard origin/main --quiet 2>/dev/null; then
                    NEW_HEAD="$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || true)"
                    if [ -n "$NEW_HEAD" ] && [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
                        echo -e "\033[0;32m✔ Updated local clone to $NEW_HEAD; reloading installer...\033[0m"
                        OKF_INSTALLER_SYNCED=1 exec bash "$SCRIPT_DIR/install.sh" --action "$ACTION" --agent "$AGENT" --no-sync
                    fi
                fi
            fi
        fi
        SOURCE_ROOT="$SCRIPT_DIR"
        echo -e "\033[0;90mℹ Installing from local repository ($SOURCE_ROOT)...\033[0m"
    else
        echo -e "\033[0;90mℹ Downloading latest version from GitHub...\033[0m"
        TEMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'okf-skills-temp')"
        ARCHIVE_URL="${OKF_SKILLS_ARCHIVE_URL:-https://github.com/eloybar/okf-skills/archive/refs/heads/main.tar.gz}"
        REPO_URL="${OKF_SKILLS_REPO_URL:-https://github.com/eloybar/okf-skills.git}"

        if command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1 && curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$TEMP_DIR" 2>/dev/null; then
            SOURCE_ROOT="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        elif command -v git >/dev/null 2>&1; then
            git clone --depth 1 "$REPO_URL" "$TEMP_DIR/okf-skills-main" --quiet
            SOURCE_ROOT="$TEMP_DIR/okf-skills-main"
        else
            echo "Error: Either (curl + tar) or git is required to download okf-skills." >&2
            exit 1
        fi
    fi
fi

TARGET_DIRS=()
if [ "$AGENT" = "All" ]; then
    TARGET_DIRS+=("$ANTIGRAVITY_PATH" "${CLAUDE_DIRS[@]}" "${CODEX_DIRS[@]}" "$UNIVERSAL_PATH")
    echo -e "\033[0;32mTargeting: All Agents (Antigravity, Claude profiles, Codex profiles, and general agents)\033[0m"
elif [ "$AGENT" = "Claude" ]; then
    TARGET_DIRS+=("${CLAUDE_DIRS[@]}")
    echo -e "\033[0;32mTargeting: Claude Code (${CLAUDE_DIRS[*]})\033[0m"
elif [ "$AGENT" = "Codex" ]; then
    TARGET_DIRS+=("${CODEX_DIRS[@]}")
    echo -e "\033[0;32mTargeting: OpenAI Codex CLI (${CODEX_DIRS[*]})\033[0m"
else
    TARGET_DIRS+=("$ANTIGRAVITY_PATH")
    echo -e "\033[0;32mTargeting: Google Antigravity CLI ($ANTIGRAVITY_PATH)\033[0m"
fi

# 3. Perform the Action
INSTALL_SKILLS=("okf" "okf-maintain" "okf-visualize" "okf-wayfinder" "okf-lint" "okf-query" "okf-learn")
REMOVE_SKILLS=("okf" "okf-maintain" "okf-visualize" "okf-wayfinder" "okf-lint" "okf-query" "okf-upgrade" "okf-prune" "okf-learn" "okf-skills")

for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    if [ "$ACTION" = "Remove" ] || [ "$ACTION" = "remove" ]; then
        echo -e "\033[0;33mRemoving OKF skills from $TARGET_DIR...\033[0m"
        for skill in "${REMOVE_SKILLS[@]}"; do
            SKILL_PATH="$TARGET_DIR/$skill"
            if [ -d "$SKILL_PATH" ] || [ -L "$SKILL_PATH" ]; then
                rm -rf "$SKILL_PATH"
                echo -e "\033[0;32m✔ Removed $skill\033[0m"
            else
                echo -e "\033[0;90mℹ $skill was not installed\033[0m"
            fi
        done
    else
        echo -e "\033[0;33mInstalling/Updating OKF skills in $TARGET_DIR...\033[0m"
        mkdir -p "$TARGET_DIR"
        for skill in "${INSTALL_SKILLS[@]}"; do
            DEST_PATH="$TARGET_DIR/$skill"
            rm -rf "$DEST_PATH"
            cp -r "$SOURCE_ROOT/$skill" "$DEST_PATH"
        done
        rm -rf "$TARGET_DIR/okf-upgrade" "$TARGET_DIR/okf-prune" "$TARGET_DIR/okf-skills"
        echo -e "\033[0;32m✔ Installed okf, okf-maintain, okf-visualize, okf-wayfinder, okf-lint, okf-query, and okf-learn in $TARGET_DIR\033[0m"
    fi
done

echo -e "\033[0;32mOperation complete!\033[0m"
