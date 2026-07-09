# install.ps1 - Installer/Updater/Remover for OKF Skills on Windows PowerShell
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Install", "Update", "Remove")]
    [string]$Action = "Install",

    [Parameter(Mandatory=$false)]
    [ValidateSet("Antigravity", "Claude")]
    [string]$Agent
)

$ErrorActionPreference = "Stop"

# Define default paths
$Paths = @{
    "Antigravity" = "$HOME\.gemini\config\skills"
    "Claude"      = "$HOME\.claude\skills"
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     OKF Skills Manager for Windows       " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Select the Agent
if (-not $Agent) {
    Write-Host "Select the target AI Agent environment:" -ForegroundColor Yellow
    Write-Host "1) Google Antigravity CLI (agy)"
    Write-Host "2) Claude Code"
    
    $choice = Read-Host "Enter choice [1-2]"
    if ($choice -eq "2") {
        $Agent = "Claude"
    } else {
        $Agent = "Antigravity" # Default
    }
}

$TargetDir = $Paths[$Agent]
Write-Host "Targeting: $Agent ($TargetDir)" -ForegroundColor Green

# 2. Perform the Action
if ($Action -eq "Remove") {
    Write-Host "Removing OKF skills from $TargetDir..." -ForegroundColor Yellow
    $skills = @("okf", "okf-maintain", "okf-visualize")
    foreach ($skill in $skills) {
        $skillPath = Join-Path $TargetDir $skill
        if (Test-Path $skillPath) {
            Remove-Item -Path $skillPath -Recurse -Force
            Write-Host "✔ Removed $skill" -ForegroundColor Green
        } else {
            Write-Host "ℹ $skill was not installed" -ForegroundColor Gray
        }
    }
    Write-Host "Removal complete!" -ForegroundColor Green
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
        Write-Host "ℹ Installing from local repository..." -ForegroundColor Gray
        $srcDir = Split-Path $scriptPath
        $skills = @("okf", "okf-maintain", "okf-visualize")
        foreach ($skill in $skills) {
            $srcPath = Join-Path $srcDir $skill
            $destPath = Join-Path $TargetDir $skill
            Copy-Item -Path $srcPath -Destination $TargetDir -Recurse -Force
            Write-Host "✔ Copied $skill" -ForegroundColor Green
        }
    } else {
        Write-Host "ℹ Downloading latest version from GitHub..." -ForegroundColor Gray
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
            Write-Host "✔ Installed $skill" -ForegroundColor Green
        }

        # Cleanup
        Remove-Item -Path $tempZip, $tempFolder -Recurse -Force
    }

    Write-Host "Installation/Update complete!" -ForegroundColor Green
}
