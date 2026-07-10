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
if ($Agent -and $Agent -notin @("Antigravity", "Claude", "All")) {
    throw "Invalid Agent: $Agent. Must be 'Antigravity', 'Claude', or 'All'."
}

# Define default paths
$Paths = @{
    "Antigravity" = "$HOME\.gemini\config\skills"
    "Claude"      = "$HOME\.claude\skills"
    "Universal"   = "$HOME\.agents\skills"
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     OKF Skills Manager for Windows       " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Select the Agent
if (-not $Agent) {
    Write-Host "Select the target AI Agent environment:" -ForegroundColor Yellow
    Write-Host "1) All Agents (Antigravity, Claude, and general agents) [Default]"
    Write-Host "2) Google Antigravity CLI (agy)"
    Write-Host "3) Claude Code"
    
    $choice = Read-Host "Enter choice [1-3]"
    if ($choice -eq "2") {
        $Agent = "Antigravity"
    } elseif ($choice -eq "3") {
        $Agent = "Claude"
    } else {
        $Agent = "All" # Default
    }
}

if ($Agent -eq "All") {
    $TargetDirs = @($Paths["Antigravity"], $Paths["Claude"], $Paths["Universal"])
    Write-Host "Targeting: All Agents (Antigravity, Claude, and general agents)" -ForegroundColor Green
} else {
    $TargetDirs = @($Paths[$Agent])
    $TargetDir = $Paths[$Agent]
    Write-Host "Targeting: $Agent ($TargetDir)" -ForegroundColor Green
}

# 2. Perform the Action
foreach ($TargetDir in $TargetDirs) {
    if ($Action -eq "Remove") {
        Write-Host "Removing OKF skills from $TargetDir..." -ForegroundColor Yellow
        $skills = @("okf", "okf-maintain", "okf-visualize")
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
            $skills = @("okf", "okf-maintain", "okf-visualize")
            foreach ($skill in $skills) {
                $srcPath = Join-Path $srcDir $skill
                Copy-Item -Path $srcPath -Destination $TargetDir -Recurse -Force
                Write-Host "[+] Copied $skill" -ForegroundColor Green
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
            $skills = @("okf", "okf-maintain", "okf-visualize")
            foreach ($skill in $skills) {
                $srcPath = Join-Path $extractedRoot $skill
                Copy-Item -Path $srcPath -Destination $TargetDir -Recurse -Force
                Write-Host "[+] Installed $skill" -ForegroundColor Green
            }

            # Cleanup
            Remove-Item -Path $tempZip, $tempFolder -Recurse -Force
        }
    }
}

Write-Host "Operation complete!" -ForegroundColor Green
