# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-17 · Original Post Title/Caption/Body Integrated Analysis & Natural Korean Translation)

## 1. Scope & Root Cause Fixed
1. **Why Video Material Analysis (`영상소재분석`) Only Used Video Frames & Audio Previously**:
   - Previously, `analyze(job_id)` (`/studio/jobs/<job_id>/analyze`) in [`downloader/studio.py`](downloader/studio.py) only sent extracted video frames (`job['frames']`) and audio (`audio.mp3`) to the AI model, without passing `job['source_text']` (the original post's title, description/caption, and body text).
   - In addition, `_scrape_threads_post_metadata(url_str)` only scraped Threads `/embed` pages, so Instagram and YouTube/Shorts URLs resolved via `direct_candidate` fast-stream download did not always populate `source_text` with both `[제목]` and `[설명·본문]`.
   - Finally, when the original post on Threads, Instagram, or YouTube was written in **Japanese (`ja`)** or **English (`en`)**, there was no dedicated language detection or natural Korean translation workflow in `영상소재분석` (`#source-text-card` and `#analysis`).

2. **Fixes Implemented**:
   - **[`downloader/studio.py`](downloader/studio.py)**:
     - **Multi-Platform Post Title & Description/Caption Scraper (`_scrape_threads_post_metadata`)**:
       - Extended `_scrape_threads_post_metadata(url_str)` to extract `[제목]` and `[설명·본문]` from **YouTube / Shorts** (`youtube.com/oembed` title + page `og:title` + `shortDescription` / `og:description`), **Instagram** (`/p/<shortcode>/embed/captioned/` `Caption` block + cleaned `og:description` stripping `"X likes, Y comments - user:"` prefix), and **Threads** (`/embed` `BodyTextContainer` + `og:title` + `og:description`).
       - Updated `acquire()` so Threads, Instagram, YouTube/Shorts, and TikTok URLs automatically populate `source_text` (combining both `title` and `description` when `yt_dlp` extracts `info_dict`).
     - **Foreign Language Detection & Dedicated Endpoints (`/fetch-source-text`, `/source-text-translate`, `/repost-meta`)**:
       - Added `_detect_post_language_info(text_str)` to detect Japanese (`[\u3040-\u30ff]`), English, Chinese, and Korean captions (`code`, `label`, `is_foreign`).
       - Added `POST /studio/jobs/<job_id>/fetch-source-text` to pull or refresh the original post's title, description/caption, and body from `job.get('source')` at any time.
       - Added `POST /studio/jobs/<job_id>/source-text-translate` to translate Japanese, English, or other foreign original post titles/captions into natural Korean (`natural` 구어체 기본 번역, `hook` 쓰레드·릴스 후킹형 초월번역, `summary` 핵심 셀링포인트 요약 번역) and store in `job['source_text_ko']`.
       - Updated `POST /studio/jobs/<job_id>/repost-meta` to persist both `source_text` and `source_text_ko` along with `source_lang`.
     - **Integrated AI Scene + Audio + Original Post Title/Caption Analysis (`/jobs/<job_id>/analyze`)**:
       - Added `source_translation` (`STRING`) to `ANALYSIS_SCHEMA` and `validate_analysis()`.
       - Updated `analyze(job_id)` to accept `source_text`, auto-scrape `job.get('source')` if empty, include the original post's title/description/body in the AI analysis prompt alongside video frames and audio, return `source_translation` (natural Korean translation when the original post is in Japanese/English), save `job['source_text_ko']`, and update `scope.description` to `... + 원본 게시물 제목·본문 통합 분석`.
       - Updated `_extract_rich_carousel_materials(job)` and `draft(job_id)` so 02-B carousel generation and 03 3-variant Korean script generation reference both the original post caption and its natural Korean translation.
   - **[`downloader/studio_web/index.html`](downloader/studio_web/index.html)**, **[`downloader/studio_web/studio.js`](downloader/studio_web/studio.js)**, & **[`downloader/studio_web/studio.css`](downloader/studio_web/studio.css)**:
     - Updated `항목 1` to **`AI 장면·음성(내레이션) + 원본 제목·본문 통합 분석`** and `항목 3` (`#source-text-card`) to **`원본 게시물 제목 · 설명(캡션) · 본문 확인 및 한국어 자연 번역`**.
     - Added real-time language detection badge (`#badge-source-lang`: `일본어 원문 감지됨 (한국어 번역 추천)`, `영어 원문 감지됨 (한국어 번역 추천)`, `한국어 본문`), **`원본 링크에서 제목·본문 불러오기`** (`#btn-fetch-source-caption`), side-by-side **`원본 게시물 제목·설명(캡션)·본문`** (`#source-post-text`) and **`한국어 자연 번역·핵심 정리 본문`** (`#source-post-translated-text`) textareas, translation tone selector (`#source-translate-tone`), **`일본어·영어 원문 → 한국어 자연 번역`** (`#btn-translate-source-text`), **`번역문을 메인 본문으로 적용`** (`#btn-apply-translated-to-source`), and 1-click send buttons to **02-A 영상 자막** (`#btn-send-caption-to-editor`) and **02-B 캐러셀 대본** (`#btn-send-caption-to-carousel`).
     - Added `.analysis-post-caption-block` inside `#analysis` so the AI analysis report displays the referenced original post title/caption and its Korean translation right above the timeline observations.
     - Updated `extractBestHookLines()` so `source_text_ko` / `source_translation` is prioritized over raw foreign text when auto-filling 02-A subtitles and 02-B carousel storyboards.
     - Included automatic fallback in `studio.js` (`translateSourcePostTextWithFallback`, `fetchSourcePostCaptionWithFallback`) so translation and caption fetching work immediately against the already-running port `5006` helper process without requiring a process kill/restart.

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`test_clip_split.cjs`, `test_threads_research_media.cjs`, `test_studio_text_clean.py`): **PASS**
  - Ran `test_post_caption_and_translation.py` (isolated `tempfile.mkdtemp()`):
    - Verified `validate_analysis()` with `source_translation`, and `/studio/jobs/<job_id>/repost-meta` persistence & language detection for Japanese (`ja`), English (`en`), and Korean (`ko`) posts: **PASS**
- **Real Browser / Electron UI Verification**:
  - Verified in headless Electron (`verify_post_caption_translation.cjs` -> `verify_post_caption_translation.json`):
    - Verified light mode (`verify_post_caption_translation_light.png`) and dark mode (`verify_post_caption_translation_dark.png`) rendering of `항목 1 (AI 장면·음성 + 원본 제목·본문 분석)`, `항목 3 (원본 제목·설명(캡션)·본문 및 한국어 번역)`, language detection badge (`일본어 원문 감지됨 (한국어 번역 추천)`), side-by-side original/translated textareas, `.analysis-post-caption-block`, and Korean hook extraction (`extractBestHookLines()`).
- **Saved Media / Audio / Paid Provider / Distribution**:
  - User profiles (`%APPDATA%\takoh-studio-browser`), saved references/jobs (`%LOCALAPPDATA%\ONEWS\studio`), and running helper processes on port `5006` were preserved untouched.
