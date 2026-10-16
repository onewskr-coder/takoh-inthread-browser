# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-17 · Threads Video + Image Combo Post `바로 제작` & URL Acquire Fix)

## 1. Scope & Root Cause Fixed
1. **Why Threads Post `https://www.threads.com/share/GtSU_lk7n/` (`@rirafifo80/post/Dej3T4eiVse`) Previously Loaded as Image Only**:
   - The Threads post is a 2-item mixed carousel (**1st item: Video**, **2nd item: Image**).
   - In the Threads feed DOM, the `<video>` element uses a `blob:` source while its poster/cover image (`t51.71878-15` / `efg` `video_default_cover_frame`) and the 2nd slide image (`t51.82787-15`) are rendered as standard `<img>` tags.
   - Previously, `extractReferenceFromCard()` in [`downloader/content-studio.js`](downloader/content-studio.js) saw `videoUrls.length === 0` (because `blob:` was skipped) and `imageUrls.length > 0`, so it classified `mediaKind = 'image'` and passed `kind: 'image'` with the cover frame URL as `media_url` when clicking **`바로 제작`**.
2. **Fixes Implemented (`1순위 메인 영상 + 2순위 동반 이미지 2개 모두 진행`)**:
   - **[`downloader/content-studio.js`](downloader/content-studio.js)**:
     - Added `isVideoCoverFrameImageUrl()` to detect and exclude Threads/Instagram video cover-frame images (`/t51.71878-15/` and base64 `efg` `video_default_cover_frame`) from `imageUrls`, while marking `hasVideoElement = true` so mixed/video cards set `mediaKind = 'video'`.
     - Added `findVideoUrlFromReactFiberLocal()` and `enrichReferenceWithMainWorldVideos()` so clicking **`수집`** or **`바로 제작`** queries the main-world React fiber / performance buffer (`content-meta-main.js`) to attach the actual `.mp4` CDN URL before sending to Studio.
   - **[`downloader/studio.py`](downloader/studio.py)**:
     - Added `_is_threads_video_cover_frame()` and `_canonical_media_asset_key()`.
     - Updated `_scrape_threads_post_metadata()`, `_enrich_repost_job()`, and `acquire()` so Threads posts containing both video and image(s) always prioritize the `.mp4` video as **1순위 메인 영상** (`target_kind = 'video'`, `media_url = req_video_urls[0]`), filter out the video cover frame from `image_urls`, deduplicate resolution variants, and store the companion image(s) as **2순위 동반 이미지** in `job.attachments`.
   - **[`downloader/studio_web/index.html`](downloader/studio_web/index.html), [`downloader/studio_web/studio.js`](downloader/studio_web/studio.js), [`downloader/studio_web/studio.css`](downloader/studio_web/studio.css)**:
     - Added `isThreadsVideoCoverFrameUrl()`, `cleanAndDeduplicateCompanionImageUrls()`, and `normalizeAcquiredComboJob()` in `studio.js`.
     - Updated `native-create-direct` (`바로 제작`), Reference Library selection, and URL fetch handlers so mixed video+image posts always acquire/normalize with the video as primary (`kind: 'video'`) and companion image(s) in `attachments`, and automatically set `#upload-format` to `'combo'` (`영상 + 이미지 함께 올리기`).
     - Added `#player-companion-media-bar` (`renderPlayerCompanionMediaBar()`) directly beneath the left video preview player so **both** the **1순위 · 메인 영상** and **2순위 · 동반 이미지** are immediately visible with thumbnails and quick actions (`크게 보기`, `캐러셀 카드로 편집`, `묶음 순서·구성 편집`).

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`5 tests`): **PASS**
- **Real Browser / Electron UI Verification**:
  - Verified in headless Electron against `http://127.0.0.1:5006/studio` (`verify_threads_combo.cjs` -> `verify_threads_combo.json`):
    - `meta`: `"[영상] AQPEWX7L...mp4 · 13.6초 · 720×960 · 음성 트랙 있음 · 추가 첨부 1개"`
    - `previewHidden`: `false` (13.6s video player active in left preview)
    - `companionHidden`: `false` (`원본 쓰레드 게시물 구성 (영상 + 이미지 모두 불러옴) · 총 2개`)
    - `companionChips`: `["1순위 · 메인 영상 (13.6초) 현재 좌측 플레이어에서 재생·편집 중", "2순위 · 동반 이미지 #1 원본 게시물 두 번째 미디어 · 함께 게시됨 크게 보기 캐러셀 카드로 편집"]`
    - `uploadFormat`: `"combo"`
    - Screenshot saved to `verify_threads_combo_bundle.png`.
- **Saved Media / Audio / Paid Provider / Distribution**:
  - Updated cached reference `10007ef7b31a84c97121f612432d84c39d50ce551bd162f7eacc1707b6601f82.json` and cached job `64c195863c774ecea5fb6eac5dcd3a01/job.json` so re-clicking the existing card immediately loads the 13.6s video + 1 companion image without losing any user data. Running helper processes on port `5006` were preserved untouched.
