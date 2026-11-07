# install.ps1 - Installer/Updater/Remover for OKF Skills on Windows PowerShell
param(
    [Parameter(Mandatory=$false)]
    [string]$Action = "Install",

    [Parameter(Mandatory=$false)]
    [string]$Agent
)

$ErrorActionPreference = "Stop"

# Validate inputs manually to avoid iex metadata validation errors
if ($Action -notin @("Install", "Update", "Remove")) {
    throw "Invalid Action: $Action. Must be 'Install', 'Update', or 'Remove'."
}
if ($Agent -and $Agent -notin @("Antigravity", "Claude", "Codex", "All")) {
    throw "Invalid Agent: $Agent. Must be 'Antigravity', 'Claude', 'Codex', or 'All'."
}

# Define default paths
$Paths = @{
    "Antigravity" = "$HOME\.gemini\config\skills"
    "Claude"      = "$HOME\.claude\skills"
    "Codex"       = "$HOME\.codex\skills"
    "Universal"   = "$HOME\.agents\skills"
}

# Discover all Claude profile skill directories ($HOME\.claude\skills, $HOME\.claude-*\skills, and $env:CLAUDE_CONFIG_DIR\skills)
$ClaudeSkillDirs = [System.Collections.Generic.List[string]]::new()
$ClaudeSkillDirs.Add($Paths["Claude"])
if ($env:CLAUDE_CONFIG_DIR) {
    $envClaudeSkills = Join-Path $env:CLAUDE_CONFIG_DIR "skills"
    if (-not $ClaudeSkillDirs.Contains($envClaudeSkills)) {
        $ClaudeSkillDirs.Add($envClaudeSkills)
    }
}
Get-ChildItem -Path $HOME -Directory -Filter ".claude-*" -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $profSkills = Join-Path $_.FullName "skills"
    if (-not $ClaudeSkillDirs.Contains($profSkills)) {
        $ClaudeSkillDirs.Add($profSkills)
    }
}

# Discover all Codex profile skill directories ($HOME\.codex\skills, $HOME\.codex-*\skills, and $env:CODEX_HOME\skills)
$CodexSkillDirs = [System.Collections.Generic.List[string]]::new()
$CodexSkillDirs.Add($Paths["Codex"])
if ($env:CODEX_HOME) {
    $envCodexSkills = Join-Path $env:CODEX_HOME "skills"
    if (-not $CodexSkillDirs.Contains($envCodexSkills)) {
        $CodexSkillDirs.Add($envCodexSkills)
    }
}
Get-ChildItem -Path $HOME -Directory -Filter ".codex-*" -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $profSkills = Join-Path $_.FullName "skills"
    if (-not $CodexSkillDirs.Contains($profSkills)) {
        $CodexSkillDirs.Add($profSkills)
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     OKF Skills Manager for Windows       " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Select the Agent
if (-not $Agent) {
    Write-Host "Select the target AI Agent environment:" -ForegroundColor Yellow
    Write-Host "1) All Agents (Antigravity, Claude, Codex, and general agents) [Default]"
    Write-Host "2) Google Antigravity CLI (agy)"
    Write-Host "3) Claude Code"
    Write-Host "4) OpenAI Codex CLI"
    
    $choice = Read-Host "Enter choice [1-4]"
    if ($choice -eq "2") {
        $Agent = "Antigravity"
    } elseif ($choice -eq "3") {
        $Agent = "Claude"
    } elseif ($choice -eq "4") {
        $Agent = "Codex"
    } else {
        $Agent = "All" # Default
    }
}

if ($Agent -eq "All") {
    $TargetDirs = @($Paths["Antigravity"]) + @($ClaudeSkillDirs) + @($CodexSkillDirs) + @($Paths["Universal"])
    Write-Host "Targeting: All Agents (Antigravity, Claude profiles, Codex profiles, and general agents)" -ForegroundColor Green
} elseif ($Agent -eq "Claude") {
    $TargetDirs = @($ClaudeSkillDirs)
    Write-Host "Targeting: Claude Code ($($TargetDirs -join ', '))" -ForegroundColor Green
} elseif ($Agent -eq "Codex") {
    $TargetDirs = @($CodexSkillDirs)
    Write-Host "Targeting: OpenAI Codex CLI ($($TargetDirs -join ', '))" -ForegroundColor Green
} else {
    $TargetDirs = @($Paths[$Agent])
    $TargetDir = $Paths[$Agent]
    Write-Host "Targeting: $Agent ($TargetDir)" -ForegroundColor Green
}

# 2. Perform the Action
foreach ($TargetDir in $TargetDirs) {
    if ($Action -eq "Remove") {
        Write-Host "Removing OKF skills from $TargetDir..." -ForegroundColor Yellow
        $skills = @("okf", "okf-maintain", "okf-visualize", "okf-wayfinder", "okf-lint", "okf-query", "okf-learn", "okf-upgrade", "okf-prune")
        foreach ($skill in $skills) {
            $skillPath = Join-Path $TargetDir $skill
            if (Test-Path $skillPath) {
                Remove-Item -Path $skillPath -Recurse -Force
                Write-Host "[+] Removed $skill" -ForegroundColor Green
            } else {
                Write-Host "[i] $skill was not installed" -ForegroundColor Gray
            }
        }
    } else {
        # Install or Update (both perform the same download & overwrite action)
        Write-Host "Installing/Updating OKF skills in $TargetDir..." -ForegroundColor Yellow

        # Ensure target directory exists
        if (-not (Test-Path $TargetDir)) {
            New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
        }

        # Determine if we are running from a local clone or from the web
        $scriptPath = $MyInvocation.MyCommand.Path
        $isLocal = $scriptPath -and (Test-Path (Join-Path (Split-Path $scriptPath) "okf"))

        if ($isLocal) {
            Write-Host "[i] Installing from local repository..." -ForegroundColor Gray
            $srcDir = Split-Path $scriptPath
            $skills = @("okf", "okf-maintain", "okf-visualize", "okf-wayfinder", "okf-lint", "okf-query", "okf-learn")
            foreach ($skill in $skills) {
                $srcPath = Join-Path $srcDir $skill
                Copy-Item -Path $srcPath -Destination $TargetDir -Recurse -Force
                Write-Host "[+] Copied $skill" -ForegroundColor Green
            }
            foreach ($legacy in @("okf-upgrade", "okf-prune")) {
                $legacyPath = Join-Path $TargetDir $legacy
                if (Test-Path $legacyPath) { Remove-Item -Path $legacyPath -Recurse -Force }
            }
        } else {
            Write-Host "[i] Downloading latest version from GitHub..." -ForegroundColor Gray
            $tempZip = [System.IO.Path]::GetTempFileName() + ".zip"
            $tempFolder = Join-Path $env:TEMP "okf-skills-temp"

            # Download zip
            Invoke-RestMethod -Uri "https://github.com/eloybar/okf-skills/archive/refs/heads/main.zip" -OutFile $tempZip
            
            # Extract zip
            if (Test-Path $tempFolder) { Remove-Item -Path $tempFolder -Recurse -Force }
            Expand-Archive -Path $tempZip -DestinationPath $tempFolder -Force

            # Copy skills
            $extractedRoot = Join-Path $tempFolder "okf-skills-main"
            $skills = @("okf", "okf-maintain", "okf-visualize", "okf-wayfinder", "okf-lint", "okf-query", "okf-learn")
            foreach ($skill in $skills) {
                $srcPath = Join-Path $extractedRoot $skill
                Copy-Item -Path $srcPath -Destination $TargetDir -Recurse -Force
                Write-Host "[+] Installed $skill" -ForegroundColor Green
            }
            foreach ($legacy in @("okf-upgrade", "okf-prune")) {
                $legacyPath = Join-Path $TargetDir $legacy
                if (Test-Path $legacyPath) { Remove-Item -Path $legacyPath -Recurse -Force }
            }

            # Cleanup
            Remove-Item -Path $tempZip, $tempFolder -Recurse -Force
        }
    }
}

Write-Host "Operation complete!" -ForegroundColor Green
