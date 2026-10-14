# Current state — 2026-10-14

## Architecture

- `studio-browser`: Electron 44 app with `BaseWindow`/`WebContentsView`, shared persistent site session (`persist:sites`), browser tabs, production UI, native download tracker (`trackSiteDownloads` / `studioListDownloads` / `studioGetDownload`), and direct human-touch Threads upload manager (`threads-upload.cjs`).
- `downloader`: Flask helper (`app.py`, `studio.py`), downloader site modules (`content-*.js`), studio API/UI (`studio_web/`), persistent SQLite discovery catalogue (`studio_catalogue.py`), Gemini/Antigravity grounding & redirect resolution (`studio_gemini_discovery.py`), AI/edit/affiliate integrations, and automated tests.
- `reference-studio`: existing extension/dashboard source; retained as related source, not the primary dedicated-browser entry point.
- App helper: `127.0.0.1:5006`. Existing Chrome helper: `5005`. Keep ownership separate.
- `HelperManager.resolvePythonPath()` resolves `TAKOH_PYTHON`, bundled `runtime/python/python.exe`, `.venv/Scripts/python.exe`, and standard Python 3.11/3.12 paths.

## Evidence and limitations

- **Graceful Shutdown & Restart Verified**: Closing the Electron window runs `shutdown.cjs` → `attemptGracefulQuit` (`GET /studio/busy-status` → `POST /studio/shutdown`) → `persistence.flush()` → `will-quit`, cleanly terminating the Electron process and its owned `5006` helper without leaving stale `app-profile.lock` files. Subsequent relaunch via `start-browser.bat` succeeds without single-instance block.
- **Session Persistence**: Persistent SQLite cookie store (`%APPDATA%\takoh-studio-browser\Partitions\sites\Network\Cookies`) preserves 157+ cookies across restarts (`.threads.com`, `.instagram.com`, `.pinterest.com`). Distinguished in `HANDOFF-RESULT.md` between verified cookie DB persistence + Threads live logged-in UI vs per-tab live visual switching for every secondary platform.
- **Direct Human-Touch Threads Upload (No Official Threads Graph API)**: Implemented in `downloader/studio-upload.js` (`humanPause`, `humanClick`, `humanFill`) and `studio-browser/threads-upload.cjs` (`createThreadsUploadManager` with persistent `upload-queue.json`, immediate & scheduled upload, first-comment affiliate disclosure posting, and `running` → `uncertain` recovery guard). Official API publishing UI is hidden in favor of human-touch browser upload.
- **Discovery Catalogue & Antigravity Grounding Redirect Resolution**:
  - `studio_gemini_discovery.py` extracts grounding sources from both `stream-json` events and local CLI session transcripts (`antigravity_transcript_sources`) and resolves `vertexaisearch.cloud.google.com/grounding-api-redirect/...` links (`resolve_grounding_redirects`) to canonical YouTube Shorts/watch URLs.
  - Verified end-to-end with preserved Antigravity response (`eee8ef48fc97478494dccbe30888994e`, 0 repeated search calls): 27 unique video IDs resolved → 1 YouTube `videos.list` call (1 quota unit, HTTP 200) → 27 videos persisted into `discovery-catalogue.sqlite3` (899 total videos, 363 channels) → live `GET http://127.0.0.1:5006/studio/discovery?provider=antigravity_search...` returns 13 qualified shopping shorts with 29 grounding sources.
- **Native Studio Bridge**: Bridges helper references, completed browser downloads (`studioListDownloads`, `studioGetDownload`), and native human-touch Threads upload actions (`studioQueueUpload`, `studioUploadStatus`, `studioCancelUpload`).
- **Automated Test Suites**:
  - Python unit tests (`python -m unittest discover -s downloader -p "test_*.py"`): 128 tests passing (`OK`).
  - JS / Electron CJS unit & DOM regression suites (`downloader/test_*.js` + `studio-browser/test_*.cjs`): 22 suites passing (`PASS`).

## Development launch

Install Node dependencies in `studio-browser` with `npm ci`, then run `start-browser.bat` or `npm start`. Install `downloader/requirements.txt` in a virtual environment.

FFmpeg can be supplied locally through existing binary discovery (`run_ffmpeg` hides Windows consoles, bounds concurrency to 2, and caches failures). Do not commit executables. Inspect `app.py` configuration before using an isolated port/data directory. Tests must not read/write production data.

Production data normally lives in `%LOCALAPPDATA%/ONEWS/studio`; Electron profile in `%APPDATA%/takoh-studio-browser`. These folders are excluded from source transfer.

