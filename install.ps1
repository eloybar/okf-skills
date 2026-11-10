# install.ps1 - Installer/Updater/Remover for OKF Skills on Windows PowerShell
param(
    [Parameter(Mandatory=$false)]
    [string]$Action = "Install",

    [Parameter(Mandatory=$false)]
    [string]$Agent,

    [Parameter(Mandatory=$false)]
    [switch]$NoSync
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
    if ([Console]::IsInputRedirected) {
        $Agent = "All"
        Write-Host "[i] Non-interactive session detected; defaulting to All Agents." -ForegroundColor Gray
    } else {
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

# 2. Resolve source once before iterating target directories
$SourceRoot = $null
$TempZip = $null
$TempFolder = $null

try {
    if ($Action -ne "Remove") {
        $scriptPath = $MyInvocation.MyCommand.Path
        $scriptDir = if ($scriptPath) { Split-Path $scriptPath } else { $null }
        $isLocal = $scriptDir -and (Test-Path (Join-Path $scriptDir "okf\SKILL.md")) -and (Test-Path (Join-Path $scriptDir "okf-maintain\SKILL.md"))

        if ($isLocal) {
            if (-not $NoSync -and (Test-Path (Join-Path $scriptDir ".git\HEAD")) -and (Get-Command git -ErrorAction SilentlyContinue)) {
                $prevEap = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                try {
                    $curBranch = (git -C $scriptDir rev-parse --abbrev-ref HEAD 2>$null)
                    $dirtyStatus = (git -C $scriptDir status --porcelain 2>$null)
                    if (($curBranch -in @("main", "master", "HEAD")) -and (-not $dirtyStatus)) {
                        Write-Host "[i] Syncing local okf-skills clone with origin/main..." -ForegroundColor Gray
                        $oldHead = (git -C $scriptDir rev-parse HEAD 2>$null)
                        git -C $scriptDir fetch origin main --quiet 2>$null
                        if ($LASTEXITCODE -eq 0) {
                            git -C $scriptDir reset --hard origin/main --quiet 2>$null
                            $newHead = (git -C $scriptDir rev-parse HEAD 2>$null)
                            if ($oldHead -and $newHead -and ($oldHead -ne $newHead)) {
                                $ErrorActionPreference = $prevEap
                                & $scriptPath -Action $Action -Agent $Agent -NoSync
                                exit $LASTEXITCODE
                            }
                        }
                    }
                } finally {
                    $ErrorActionPreference = $prevEap
                }
            }
            $SourceRoot = $scriptDir
            Write-Host "[i] Installing from local repository ($SourceRoot)..." -ForegroundColor Gray
        } else {
            Write-Host "[i] Downloading latest version from GitHub..." -ForegroundColor Gray
            $TempZip = [System.IO.Path]::GetTempFileName() + ".zip"
            $TempFolder = Join-Path $env:TEMP ("okf-skills-temp-" + [Guid]::NewGuid().ToString("N"))

            Invoke-RestMethod -Uri "https://github.com/eloybar/okf-skills/archive/refs/heads/main.zip" -OutFile $TempZip
            Expand-Archive -Path $TempZip -DestinationPath $TempFolder -Force
            $SourceRoot = Join-Path $TempFolder "okf-skills-main"
        }
    }

    # 3. Perform the Action
    foreach ($TargetDir in $TargetDirs) {
        if ($Action -eq "Remove") {
            Write-Host "Removing OKF skills from $TargetDir..." -ForegroundColor Yellow
            $skills = @("okf", "okf-maintain", "okf-visualize", "okf-wayfinder", "okf-lint", "okf-query", "okf-learn", "okf-upgrade", "okf-prune", "okf-skills")
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
            Write-Host "Installing/Updating OKF skills in $TargetDir..." -ForegroundColor Yellow
            if (-not (Test-Path $TargetDir)) {
                New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
            }

            $skills = @("okf", "okf-maintain", "okf-visualize", "okf-wayfinder", "okf-lint", "okf-query", "okf-learn")
            foreach ($skill in $skills) {
                $srcPath = Join-Path $SourceRoot $skill
                $destPath = Join-Path $TargetDir $skill
                if (Test-Path $destPath) { Remove-Item -Path $destPath -Recurse -Force }
                Copy-Item -Path $srcPath -Destination $destPath -Recurse -Force
                Write-Host "[+] Installed $skill" -ForegroundColor Green
            }
            foreach ($legacy in @("okf-upgrade", "okf-prune", "okf-skills")) {
                $legacyPath = Join-Path $TargetDir $legacy
                if (Test-Path $legacyPath) { Remove-Item -Path $legacyPath -Recurse -Force }
            }
        }
    }
} finally {
    if ($TempZip -and (Test-Path $TempZip)) { Remove-Item -Path $TempZip -Force -ErrorAction SilentlyContinue }
    if ($TempFolder -and (Test-Path $TempFolder)) { Remove-Item -Path $TempFolder -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host "Operation complete!" -ForegroundColor Green
