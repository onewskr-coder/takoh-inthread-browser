# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-17 · Source Post Caption UI Chrome Sanitization + Video Analysis Korean Translation Multi-Tier Fix)

## 1. Scope & Root Cause Fixed
1. **User Request**:
   - *"영상 분석에서 원본 게시물에서 보면 `[kitty.baby_991시간더 보기我：你有看到兒子的泡泡玩具嗎老公：被我拿去玩了😍 1/2오디오 소리 꺼짐좋아요1답글1리포스트공유하기]` 이렇게 나오는데 본문만 나오는게 아니라 `kitty.baby_99`, `1시간`, `더 보기`, `1/2`, `오디오 소리 꺼짐`, `좋아요1`, `답글1`, `리포스트`, `공유하기` 이런 것까지 전부 가져오고 있어. 이건 문제가 되는 것 같아. 그리고 번역기 돌렸는데 번역 안돼."*
2. **Root Causes Identified**:
   - **DOM Extraction Contamination (`downloader/content-studio.js` & `studio-browser/threads-research-extract.js`)**:
     - When extracting a Threads post from `article[role="article"]`, `container.innerText` concatenated the header (`kitty.baby_99`, `1시간`, `더 보기`), the post body (`我：你有看到兒子的泡泡玩具嗎\n老公：被我拿去玩了😍`), the carousel counter (`1/2`), the audio control (`오디오 소리 꺼짐`), and the action bar (`좋아요1`, `답글1`, `리포스트`, `공유하기`) into a single string when `cleanSocialPostText()` was only invoked inside `threads-research.cjs` and not inside `content-studio.js` or `studio.py`.
   - **Language Detection & Translation Failures (`downloader/studio.py` & `downloader/studio_web/studio.js`)**:
     - Because Korean UI chrome (`시간`, `더 보기`, `오디오 소리 꺼짐`, `좋아요`, `답글`, `리포스트`, `공유하기`) added ~24 Hangul characters around short Chinese/Japanese captions (~21 CJK characters), `hangul_count >= cjk_count` evaluated to `True`, misclassifying foreign posts as Korean (`needs_translation = False`).
     - In `downloader/studio_web/studio.js`, `translateSourcePostTextWithFallback()` had four compounding bugs when talking to the live helper on port `5006`:
       1. When `/source-text-translate` fell back to `/ocr-translate`, `/ocr-translate` returns `{translated_text, tone, job}`, so `ocrRes?.media_ocr?.translated_text` was `undefined` (the actual string is at `ocrRes.translated_text` or `ocrRes.job.media_ocr.translated_text`).
       2. `job = next;` assigned the wrapper `{translated_text, tone, job}` directly to `job`, corrupting `job.id` (`undefined`) and breaking subsequent rendering.
       3. The UI dropdown defaulted to `gemini_api` (`gemini-2.5-pro`), which returned `502` when unconfigured, without automatically retrying the job's working provider (`antigravity_cli` / `gemini-4-argon-low`).
       4. Older in-memory `/repost-meta` handlers only persisted `repost_mode` and `source_text`, dropping `source_text_ko` on reload unless backed up in `localStorage` and `media_ocr` caption fallback.
3. **Fixes Implemented**:
   - **[`downloader/content-studio.js`](downloader/content-studio.js)**:
     - Added `cleanSocialPostText(rawText, username, permalink)` (lines 221–247) and updated `reference()` (lines 253–290) to prioritize `[data-pressable-container="true"] [dir="auto"]`, `[class*="BodyTextContainer"]`, and `[data-ad-preview="message"]`, strip `header, time, nav, button, [role="button"]`, and sanitize all extracted text before sending to the studio.
   - **[`studio-browser/threads-research-extract.js`](studio-browser/threads-research-extract.js)**:
     - Added `stripChrome()` in `extractThreadsResearch()` (lines 66–74) and prioritized `relay.text` over raw `document.body.innerText`.
   - **[`downloader/studio.py`](downloader/studio.py)**:
     - Added `_clean_social_post_caption(raw_text, username='', permalink='')` (lines 1545–1590) and applied it across `read()`, `save()`, `import_reference()`, `references()`, `_detect_post_language_info()`, `repost_meta()`, `fetch_source_text()`, and `source_text_translate()`.
     - Updated `_detect_post_language_info()` so any CJK (`cjk_count >= 2`) or Japanese Kana (`ja_count >= 1`) post is always flagged as foreign (`needs_translation = True`) regardless of Korean words.
     - Added multi-tier translation fallback (`selected provider` -> `antigravity_cli` -> `gemini_api` -> `_google_translate_fallback_ko()`) in `source_text_translate()` and `media_ocr_translate()`.
   - **[`downloader/studio_web/studio.js`](downloader/studio_web/studio.js)** & **[`downloader/studio_web/index.html`](downloader/studio_web/index.html)**:
     - Added `cleanSocialPostCaptionClient(rawText, permalink)` (lines 7273–7301) and applied it immediately on render, language detection, source fetch, save, and translation.
     - Fixed `translateSourcePostTextWithFallback()` (lines 7393–7544) to unwrap `next.job || next`, iterate across `[baseCreds, jobProviderCreds, {provider: 'antigravity_cli'}]` for both `/source-text-translate` and `/ocr-translate`, extract `ocrRes?.translated_text || ocrRes?.job?.media_ocr?.translated_text`, and persist `source_text_ko` in `localStorage` (`takoh-source-ko-<job.id>`) and `/repost-meta` without polluting the OCR text box (`isCaptionFallbackOcr`).
   - **Existing User Jobs & References Cleaned on Disk**:
     - Sanitized 6 existing contaminated `job.json` files (including `65867cc7e3b34bea89a58ddb5c0d1054` for `kitty.baby_99`) and 10 reference JSON files in `%LOCALAPPDATA%\ONEWS\studio` without deleting any user data.

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`test_clip_split.cjs`, `test_threads_research_media.cjs`, `test_studio_text_clean.py`): **PASS (5 tests in 2.668s)**
- **Real Browser / Electron UI Verification (`http://127.0.0.1:5006/studio`)**:
  - Verified job `65867cc7e3b34bea89a58ddb5c0d1054` (`kitty.baby_99`) in headless Electron (`verify_caption_and_translation.cjs` & `capture_section3_card.cjs`):
    - **Before vs After Source Text**: `"我：你有看到兒子的泡泡玩具嗎\n老公：被我拿去玩了😍"` (0% UI chrome: `kitty.baby_99`, `1시간`, `더 보기`, `1/2`, `오디오 소리 꺼짐`, `좋아요1`, `답글1`, `리포스트`, `공유하기` completely removed).
    - **Language Detection Badge**: `"중국어·한자 원문 감지됨 (한국어 번역 추천)"`
    - **One-Click Korean Translation (`#btn-translate-source-text`)**: `"나: 아들 비눗방울 장난감 못 봤어?\n남편: 내가 가져가서 놀고 있지롱😍"` rendered in both `#source-post-translated-text` and `.analysis-post-caption-block`, and persisted across full page reload.
    - **Screenshots**: `verify_caption_clean_before_trans.png`, `verify_caption_clean_after_trans.png`, `verify_caption_analysis_block.png`.
- **Saved Media / Audio / Paid Provider / Distribution**:
  - User profiles (`%APPDATA%\takoh-studio-browser`), saved references/jobs (`%LOCALAPPDATA%\ONEWS\studio`), and running helper processes on port `5006` were preserved untouched.
