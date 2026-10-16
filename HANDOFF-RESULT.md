# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-16 · On-Demand Subtitle-Erase Mask Box, Dashboard `escapeHtml` Fix, & 02-A Multi-Text Layers)

## 1. Scope & Completed Improvements
1. **On-Demand Subtitle-Erase Mask Region (`자막 지우기 마스크 영역 — 필요할 때만 켜고 끄기`)**:
   - Updated [`syncDraggableOverlayCanvas()`](downloader/studio_web/studio.js) in [`downloader/studio_web/studio.js`](downloader/studio_web/studio.js) so `#drag-mask-box` is hidden by default across `01 영상·소재 분석` and `02-A › ① 텍스트 편집창`, and only appears when the user explicitly turns on `#toggle-mask-box` or selects a non-`none` erase mode while inside `02-A › ② 자막 지우기 · 마스크 · 화면 확대`.
   - Added a floating `×` close button (`#btn-close-mask-box`) directly on `#drag-mask-box` on the preview canvas and a **`마스크 끄기`** button (`#btn-disable-mask-box`) in STEP B of Tab 2 ([`downloader/studio_web/index.html`](downloader/studio_web/index.html), [`downloader/studio_web/studio.css`](downloader/studio_web/studio.css), [`downloader/studio_web/studio.js`](downloader/studio_web/studio.js)). Clicking either immediately hides the mask box and resets `text-erase-mode` to `'none'` (`원본 유지`).
   - Selecting `원본 유지` (`eraseModePick="none"`) or switching away from the `erase` tab automatically unchecks `#toggle-mask-box` so the mask box never lingers or blocks text layers on the preview canvas.
2. **Dashboard Project Open `ReferenceError: escapeHtml is not defined` Fix**:
   - Defined top-level [`escapeHtml(s)`](downloader/studio_web/studio.js) helper in [`downloader/studio_web/studio.js`](downloader/studio_web/studio.js) and bumped asset cache-buster query string (`?v=20261016c`) in [`downloader/studio_web/index.html`](downloader/studio_web/index.html).
3. **Dynamic Multi-Text Layer Management & Preset Style Text Preservation (`02-A 미디어 편집`)**:
   - Replaced fixed top/bottom slots with dynamic multi-text layers (`+ 텍스트 추가`, click-to-edit on canvas, `선택 삭제`, `전부 삭제`), and prevented `사전 설정 스타일` clicks from overwriting the active text layer's text.

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`5 tests`): **PASS**
- **Real Browser / Electron UI Verification**:
  - Verified in headless Electron against `http://127.0.0.1:5006/studio`:
    - `hiddenOnTextTab: true` (mask box is hidden by default on `① 텍스트 편집창` and `01 영상·소재 분석`)
    - `visibleWhenEnabledOnEraseTab: true` (mask box appears when choosing an erase mode in `② 자막 지우기 · 마스크 · 화면 확대`)
    - `hiddenAfterCloseBtn: true`, `modeAfterCloseBtn: "none"` (clicking `×` on the mask box or `마스크 끄기` immediately hides the mask box and switches to `원본 유지`)
- **Saved Media / Audio / Paid Provider / Distribution**:
  - Existing user profiles, cookies, saved references, jobs, and running helper processes on port `5006` were preserved untouched. No EXE/ZIP build was performed.
