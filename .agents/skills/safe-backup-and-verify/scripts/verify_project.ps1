$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $RepoRoot

Write-Output "=== [1/4] Checking Node.js / Electron JS & CJS Syntax ==="
$JsFiles = @(
  "studio-browser\main.cjs",
  "studio-browser\preload.cjs",
  "studio-browser\site-preload.cjs",
  "studio-browser\threads-research.cjs",
  "studio-browser\threads-research-extract.js",
  "studio-browser\threads-research-frontier.cjs",
  "studio-browser\threads-research-media.cjs",
  "studio-browser\threads-upload.cjs",
  "downloader\content-studio.js",
  "downloader\content-threads.js",
  "downloader\studio_web\studio.js",
  "downloader\studio_web\workspace.js",
  "downloader\studio_web\threads-research-ui.js"
)
foreach ($f in $JsFiles) {
  if (Test-Path $f) {
    node --check $f
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $f" }
  }
}
Write-Output "  -> All JS/CJS files passed syntax check."

Write-Output "=== [2/4] Checking Python Syntax Compilation ==="
python -m py_compile downloader/app.py downloader/studio.py downloader/studio_text_clean.py downloader/studio_catalogue.py
if ($LASTEXITCODE -ne 0) { throw "Python syntax check failed." }
Write-Output "  -> All Python modules passed py_compile."

Write-Output "=== [3/4] Running Core Node & Python Unit Tests ==="
node studio-browser/test_clip_split.cjs
if ($LASTEXITCODE -ne 0) { throw "test_clip_split.cjs failed." }

node studio-browser/test_threads_research_media.cjs
if ($LASTEXITCODE -ne 0) { throw "test_threads_research_media.cjs failed." }

python -m unittest discover -s downloader -p "test_studio_text_clean.py"
if ($LASTEXITCODE -ne 0) { throw "test_studio_text_clean.py failed." }

Write-Output "=== [4/4] All Project Health & Regression Checks PASSED ==="
