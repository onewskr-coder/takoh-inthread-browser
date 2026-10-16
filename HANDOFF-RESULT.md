# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-17 · Coupang Review, Naver SmartStore & Naver Clip Video/Image Download & Studio Creation Restore)

## 1. Scope & Root Cause Fixed
1. **Why Coupang Review, Naver SmartStore, and Naver Clip Video/Image Download Buttons Were Missing in the Dedicated Studio Browser**:
   - **`trusted(url)` in [`studio-browser/native-media.cjs`](studio-browser/native-media.cjs)** previously allowed only `threads.com`, `threads.net`, `instagram.com`, and `pinterest.com`. Because `naver.com` and `coupang.com` returned `false`, `main.cjs` never injected `content.css` or any downloader scripts on Naver Clip, Naver SmartStore, or Coupang pages.
   - **Module filename mismatch in [`studio-browser/native-media.cjs`](studio-browser/native-media.cjs)**: `navigation.siteKey()` returned `'naver_clip'` (with an underscore), whereas the actual script in `downloader/` is named `content-naver-clip.js` (with a hyphen), causing `fs.readFileSync('content-naver_clip.js')` to fail with `ENOENT`.
   - **Missing Top Bar & Studio UI Entry Points**: [`studio-browser/toolbar.html`](studio-browser/toolbar.html) only had `네이버 클립` and lacked dedicated tabs for **`쿠팡 리뷰`** and **`스마트스토어`**, and [`downloader/studio_web/index.html`](downloader/studio_web/index.html) did not surface quick-launch buttons for them.

2. **Fixes Implemented**:
   - **[`studio-browser/native-media.cjs`](studio-browser/native-media.cjs)**:
     - Added `naver.com`, `coupang.com`, `coupangcdn.com`, `pinterest.co.kr`, `tiktok.com`, `facebook.com`, `youtube.com`, `youtu.be`, `twitter.com`, `x.com`, and `reddit.com` to `trusted(url)`.
     - Added `SITE_MODULE_MAP = { naver_clip: 'content-naver-clip.js', smartstore: 'content-naver-clip.js', coupang: 'content-coupang.js' }` inside `injection(site)` so Naver Clip, Naver SmartStore, and Coupang load their exact downloader modules cleanly.
   - **[`studio-browser/navigation.cjs`](studio-browser/navigation.cjs)** & **[`studio-browser/main.cjs`](studio-browser/main.cjs)**:
     - Added `coupang` (`/(^|\.)coupang\.com$/`) and `smartstore` (`/(^|\.)(smartstore|shopping|brand)\.naver\.com$/`) to `platform(value)` and `siteKey(value)`.
     - Added `smartstore: 'https://shopping.naver.com/'` and `coupang: 'https://www.coupang.com/'` to `sites`, plus `studioOpenPlatform` mappings (`coupang`, `smartstore`, `naver_explore`).
     - Added `webRequest.onBeforeSendHeaders` in `trackSiteDownloads()` so media downloads from `*.coupangcdn.com`, `*.pstatic.net`, `*.naver.net`, and `*.rmcnmv.naver.com` automatically include the required `Referer` header.
     - Added `did-navigate-in-page` listener alongside `dom-ready` so SPA transitions on Naver Clip / SmartStore / Coupang re-verify content script injection.
   - **[`studio-browser/toolbar.html`](studio-browser/toolbar.html)**:
     - Added **`쿠팡 리뷰`** (`data-site="coupang"`) and **`스마트스토어`** (`data-site="smartstore"`) tabs right next to **`네이버 클립`** (`data-site="naver_clip"`) in the top browser bar.
     - Removed decorative emojis per workspace rule.
   - **[`downloader/content-studio.js`](downloader/content-studio.js)** & **[`downloader/content-naver-clip.js`](downloader/content-naver-clip.js)**:
     - Wrapped the Naver Clip / SmartStore video download button in `.threads-download-btn-container` and anchored `directBtn` (`바로 제작`) alongside `button` (`수집`) so **`[다운로드] [수집] [바로 제작]`** sit side-by-side cleanly on video players.
     - Added `convertCoupangPosterOrUrlToMp4()` and `resolveNaverOrCoupangVideoUrl()` inside `enrichReferenceWithMainWorldVideos()` so clicking **`수집`** or **`바로 제작`** on Coupang review videos, Naver SmartStore review videos, or Naver Clip videos resolves the direct `.mp4` URL (via Coupang poster/resource conversion or Naver `apis.naver.com/rmcnmv` VOD play API).
   - **[`downloader/studio.py`](downloader/studio.py)**, **[`downloader/app.py`](downloader/app.py)**, & **[`downloader/content-core.js`](downloader/content-core.js)**:
     - Added `Referer` headers for Coupang and Naver CDN URLs in `safe_fetch_stream()` (`studio.py`) and `download_zip_endpoint()` (`app.py`).
     - Added Naver Clip / Shorts `creatorhub-api.naver.com` + `apis.naver.com/rmcnmv` direct `.mp4` resolution in `acquire()` (`studio.py`) so pasting a Naver Clip URL (`https://m.naver.com/shorts/?mediaId=...` or `https://clip.naver.com/...`) into the Studio URL bar acquires the `.mp4` video directly.
     - Updated `triggerZipDownload()` in `content-core.js` to try `127.0.0.1:5006/download_zip` first (dedicated browser helper) with fallback to `127.0.0.1:5005/download_zip`.
   - **[`downloader/studio_web/index.html`](downloader/studio_web/index.html)** & **[`downloader/studio_web/studio.js`](downloader/studio_web/studio.js)**:
     - Added quick-launch buttons (`쿠팡 리뷰 영상 열기`, `스마트스토어 리뷰 열기`, `네이버 클립 영상 열기`) in the Production Dashboard (`제작 대시보드`), Studio Top Bar (`콘텐츠 제작 스튜디오`), and Analysis Empty State (`영상소재분석`), and updated URL input placeholders.

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`test_clip_split.cjs`, `test_threads_research_logic.cjs`, `test_naver_navigation.cjs`, `5 Python unit tests`): **PASS**
- **Real Browser / Electron UI Verification**:
  - Verified in headless Electron (`verify_coupang_smartstore_naverclip.cjs` -> `verify_coupang_smartstore_naverclip.json`):
    - Top Browser Bar (`toolbar.html`): Verified `쿠팡 리뷰`, `스마트스토어`, and `네이버 클립` buttons (`verify_browser_toolbar_platforms.png`).
    - Studio Dashboard (`http://127.0.0.1:5006/studio`): Verified `쿠팡 리뷰 영상 열기`, `스마트스토어 리뷰 열기`, `네이버 클립 영상 열기` buttons and updated URL input placeholders (`verify_studio_dashboard_platforms.png`).
    - Coupang Review DOM (`www.coupang.com`): Verified `[Video] [수집] [바로 제작]` and `[Image] [수집] [바로 제작]` overlay buttons (`verify_coupang_review_buttons.png`).
    - Naver SmartStore Review DOM (`smartstore.naver.com`): Verified `[다운로드] [수집] [바로 제작]` and `[Image] [수집] [바로 제작]` overlay buttons (`verify_smartstore_review_buttons.png`).
    - Naver Clip DOM (`m.naver.com/shorts`): Verified `[다운로드] [수집] [바로 제작]` overlay buttons (`verify_naverclip_buttons.png`).
- **Saved Media / Audio / Paid Provider / Distribution**:
  - User profiles (`%APPDATA%\takoh-studio-browser`), saved references/jobs (`%LOCALAPPDATA%\ONEWS\studio`), and running helper processes on port `5006` were preserved untouched.
