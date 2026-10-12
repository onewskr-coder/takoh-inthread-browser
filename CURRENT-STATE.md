# Current state — 2026-10-12

## Architecture

- studio-browser: Electron 44 app with BaseWindow/WebContentsView, shared persistent site session, browser tabs and production UI.
- downloader: Flask helper, downloader site modules, studio API/UI, AI/edit/affiliate integrations and tests.
- reference-studio: existing extension/dashboard source; retained as related source, not the primary dedicated-browser entry point.
- App helper: 127.0.0.1:5006. Existing Chrome helper: 5005. Keep ownership separate.
- Current development relies on local Python 3.11 and FFmpeg. Self-contained distribution is not complete.

## Evidence and limitations

- Real Threads video collection reached helper references and production cards. Video had no poster; a bounded own-video thumbnail fallback was added and fixture-tested. A preview was generated from the captured source and cached manually for that single card; this does not prove generic UI thumbnail acquisition end to end.
- Recent thumbnail FFmpeg commands were visibly spawning consoles. run_ffmpeg now hides Windows consoles, bounds concurrent processes to 2, serializes same-file generation and caches failures for 5 minutes. Two focused thumbnail tests passed. User-approved helper restart returned HTTP 200 while the browser process remained alive. Visual recurrence remains unverified.
- Threads login survived recent normal restarts. All three platform login/restart combinations are not fully verified. Do not promise sessions never expire.
- Duplicate profile lock and single-instance guard exist. Auto restart is disabled after earlier login loss concerns.
- Native studio bridge reads helper references; download history bridging and native upload actions are incomplete. Remote download initiation is not full download status/history integration.
- Original preparation, exact downloaded file/audio, and multi-platform full flow remain unverified.
- Google embedded OAuth restrictions remain; do not spoof or bypass them.
- Desktop capture tooling previously produced suspected overlay windows; avoid repeating that capture path until independently checked.

## Development launch

Install Node dependencies in studio-browser with npm ci, then run start-browser.bat or npm start. Install downloader/requirements.txt in a virtual environment. HelperManager currently locates Python via LOCALAPPDATA/Programs/Python/Python311/python.exe; inspect and configure runtime detection before claiming another machine can run it.

FFmpeg can be supplied locally through existing binary discovery. Do not commit executables. Inspect app.py configuration before using an isolated port/data directory. Tests must not read/write production data.

Production data normally lives in %LOCALAPPDATA%/ONEWS/studio; Electron profile in %APPDATA%/takoh-studio-browser. These folders are excluded from source transfer. Do not infer production path from a sandbox's substituted LOCALAPPDATA.

## First acceptance gate

Complete G1-G3 using new selected content on Threads, Instagram and Pinterest: UI collection → exact playable source → thumbnail library → source preparation → restart/reuse. Record per-platform failures and partial evidence. See DEVELOPMENT-GOALS.md for later scope.
