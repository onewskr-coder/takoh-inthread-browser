param(
  [string]$Label = "snapshot"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$SafeLabel = ($Label -replace '[^a-zA-Z0-9_-]', '_')
$DestDir = Join-Path $RepoRoot ".backups\$Stamp-$SafeLabel"

$CoreFiles = @(
  "downloader\studio.py",
  "downloader\studio_text_clean.py",
  "downloader\content-studio.js",
  "downloader\content-threads.js",
  "downloader\studio_web\index.html",
  "downloader\studio_web\studio.css",
  "downloader\studio_web\studio.js",
  "downloader\studio_web\workspace.js",
  "downloader\studio_web\threads-research-ui.js",
  "studio-browser\main.cjs",
  "studio-browser\toolbar.html",
  "studio-browser\toolbar.js",
  "studio-browser\threads-research.cjs",
  "studio-browser\threads-research-extract.js",
  "studio-browser\threads-research-frontier.cjs",
  "studio-browser\threads-research-media.cjs"
)

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$Copied = 0
foreach ($RelPath in $CoreFiles) {
  $Src = Join-Path $RepoRoot $RelPath
  if (Test-Path $Src) {
    $Target = Join-Path $DestDir $RelPath
    $TargetParent = Split-Path -Parent $Target
    New-Item -ItemType Directory -Force -Path $TargetParent | Out-Null
    Copy-Item -Path $Src -Destination $Target -Force
    $Copied++
  }
}

Write-Output "[BACKUP OK] Copied $Copied core files to $DestDir"
