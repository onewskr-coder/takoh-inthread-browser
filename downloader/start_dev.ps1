$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$candidates = @()
if ($env:TAKOH_PYTHON) { $candidates += $env:TAKOH_PYTHON }
$candidates += (Join-Path $PSScriptRoot '.venv\Scripts\python.exe')
$candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe')
$pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pythonCommand) { $candidates += $pythonCommand.Source }
$selectedPython = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try {
        & $candidate -c 'import flask, flask_cors, yt_dlp, requests' 2>$null
        if ($LASTEXITCODE -eq 0) { $selectedPython = $candidate; break }
    } catch { continue }
}
if (-not $selectedPython) {
    Write-Host 'No usable Python environment. Set TAKOH_PYTHON to a Python with requirements.txt installed.'
    exit 1
}
Write-Host "Source folder: $PSScriptRoot"
Write-Host "Python: $selectedPython"
& $selectedPython (Join-Path $PSScriptRoot 'dev_server.py') @args
exit $LASTEXITCODE
