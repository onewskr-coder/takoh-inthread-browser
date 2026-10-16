# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-16 · Scrubber Frame Capture Fix, Tab 4 Threads Media Bundle Large Cards, & On-Demand Mask Box)

## 1. Scope & Completed Improvements
1. **`현재 시점 캡처 · 동반 이미지 추가` (`#btn-capture-scrubber-bundle` & `#btn-bundle-capture-now`) Fix**:
   - **Root Cause**: The running helper server on port `5006` (started earlier at `10:06:26`) was running an in-memory version of `attachments-config` before `action == 'capture_time'` was loaded, so `POST /studio/jobs/<id>/attachments-config` with `action: "capture_time"` returned HTTP 200 without adding the captured frame. In addition, the user was scrolled down at the timeline scrubber and received no inline visual confirmation next to the button.
   - **Solution** ([`downloader/studio_web/studio.js`](downloader/studio_web/studio.js), [`downloader/studio_web/index.html`](downloader/studio_web/index.html), [`downloader/studio_web/studio.css`](downloader/studio_web/studio.css)):
     - Implemented [`captureCurrentVideoMomentToBundle()`](downloader/studio_web/studio.js) which first calls `action: 'capture_time'` and, if the running helper process did not add the attachment (stale in-memory route), automatically falls back to extracting the exact timestamp frame via the server's active FFmpeg frame extractor and registering it via `action: 'add_frame'` without requiring a server restart or killing port `5006`.
     - Added an inline status badge (`#scrubber-capture-status`) directly inside `.scrubber-action-row` (`✓ 2.92초 장면 캡처 완료 · 동반 이미지 #N 추가됨`), a **`+ 현재 시점 캡처 추가`** button (`#btn-bundle-capture-now`) inside Tab 4 (`④ 쓰레드 미디어 묶음`), and automatic switching to the `bundle` tab when capturing in `02-A 미디어 편집`.
2. **Tab 4 Threads Media Bundle (`④ 쓰레드 미디어 묶음 (영상+이미지)`) Large Card Layout & Unclipped Preview**:
   - Widened `.attachments-grid` to `repeat(auto-fill, minmax(230px, 1fr))` (`256px × 357px` per card) with `aspect-ratio: auto !important; overflow: visible !important;`, `210px` uncropped media preview frames (`object-fit: contain`), top rank/type badges, and full metadata.
3. **On-Demand Subtitle-Erase Mask Region & Multi-Text Layers**:
   - Made `#drag-mask-box` strictly on-demand with direct `×` close and `마스크 끄기` controls, fixed `escapeHtml`, and added multi-text layer management.

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`5 tests`): **PASS**
- **Real Browser / Electron UI Verification**:
  - Verified in headless Electron against `http://127.0.0.1:5006/studio` (`verify_capture_scrubber.cjs`):
    - Setting scrubber to `2.92s` and clicking `#btn-capture-scrubber-bundle` increased bundle cards (`attBefore: 3` → `attAfter: 4`) and extracted frames (`framesBefore: 6` → `framesAfter: 7`), displayed `✓ 2.92초 장면 캡처 완료 · 동반 이미지 #3 추가됨`, and switched to Tab 4 (`④ 쓰레드 미디어 묶음`).
    - Screenshot saved to `verify_scrubber_capture_to_bundle.png`.
- **Saved Media / Audio / Paid Provider / Distribution**:
  - Existing user profiles, cookies, saved references, jobs, and running helper processes on port `5006` were preserved untouched. No EXE/ZIP build was performed.
