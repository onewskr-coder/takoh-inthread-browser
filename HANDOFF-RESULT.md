# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-17 · Fix Cropped Photos Inside Carousel Boxes [Uncropped `contain` Default + Blurred Box Backdrop + Fit Toggle] + Ctrl+Z/Ctrl+Y Shortcuts & Magnetic Centering)

## 1. Scope & Root Cause Fixed
1. **Why Photos Appeared Cropped Inside Carousel Frame Boxes**:
   - In [`downloader/studio_web/studio.css`](downloader/studio_web/studio.css) (`.canva-photo-frame-box #wb-active-slide-big-img.canva-clean-bg-img`), `object-fit: cover !important` was previously hard-coded, and in [`downloader/studio_web/studio.js`](downloader/studio_web/studio.js) (`renderCanvaSlideObjectsToDataUrl`), `baseScale = Math.max(fw/iw, fh/ih)` was used unconditionally.
   - Because vertical `9:16` or `4:5` video frames / photos were placed inside horizontal or compact template frame boxes (e.g., `h: 31%–54%`), `cover` scaled the image to the box width and sliced off the top and bottom of the subject.
   - In addition, [`downloader/studio.py`](downloader/studio.py) (`_save_custom_slide_image` and `_prepare_slide_source_frame`) previously ran `ImageOps.fit(..., (1080, 1350))`, force-cropping custom uploaded/pasted photos on disk before they reached the canvas.
2. **Fixes Implemented**:
   - **[`downloader/studio_web/studio.js`](downloader/studio_web/studio.js)** & **[`downloader/studio_web/studio.css`](downloader/studio_web/studio.css)**:
     - **Uncropped `contain` Default for Boxed Templates + Soft Blurred Backdrop**:
       - Boxed templates (`photoFrame` smaller than full-bleed `100% × 100%`) now default to `fit = 'contain'` (`사진 전체 맞춤 (잘림 없음)`), showing 100% of the photo from top to bottom without cutting off the subject.
       - Added a soft blurred backdrop layer (`.canva-photo-box-blur-backdrop` in DOM and `ctx.filter = 'blur(20px) brightness(0.52)'` in `renderCanvaSlideObjectsToDataUrl`) inside the photo frame box so any side margins around a vertical or horizontal photo are filled with a natural ambient blur rather than empty holes.
     - **1-Click Fit Mode Toggle (`사진 전체 맞춤 (잘림 없음)` vs `박스 꽉 채우기`) & Zoom-Out (`40%–220%`)**:
       - Added `#btn-canva-bg-fit-toggle` on the floating canvas toolbar and `#btn-canva-fit-contain` / `#btn-canva-fit-cover` in the right-hand photo inspector (`② 초고속 영상 캡처 · 배경 사진`).
       - Extended the zoom slider range down to `40%` (`min="40"`, `max="220"`) so users can also freely zoom out or zoom in at any time.
   - **[`downloader/studio.py`](downloader/studio.py)**:
     - Updated `_save_custom_slide_image` and `_prepare_slide_source_frame` to use aspect-preserving `im_rgb.thumbnail((1440, 1920), Image.Resampling.LANCZOS)` instead of `ImageOps.fit`, preserving the full uncropped image when uploading or pasting custom photos.
   - **Carousel Keyboard Shortcuts (`Ctrl+Z` Undo, `Ctrl+Y` Redo) & Magnetic Background Photo Centering (`X=0%, Y=0%`)**:
     - Preserved and verified full `Ctrl+Z` / `Ctrl+Y` undo-redo history and `±2.6%` magnetic center snapping (`#canva-bg-snap-line-x`, `#canva-bg-snap-line-y`, `#canva-bg-snap-badge`).

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`test_clip_split.cjs`, `test_threads_research_media.cjs`, `test_studio_text_clean.py`): **PASS**
- **Real Browser / Electron UI Verification**:
  - Verified in headless Electron (`verify_uncropped_photo_box.cjs` -> `verify_uncropped_photo_box.json` & `verify_uncropped_photo_box_body03.png`):
    - Confirmed `preset: "cover_02_magazine"`, `computedObjectFit: "contain"`, `hasIsFitContainClass: true`, `hasBlurBackdrop: true`, `fitToggleBtnText: "사진 전체 맞춤 (잘림없음)"`, and `fitContainBtnActive: true`.
    - Visually confirmed in `verify_uncropped_photo_box_body03.png` that the entire subject (from the red cherry ornament at the top to the bottom of the tree) is 100% visible inside the gold-bordered photo box without top/bottom cropping, with a soft blurred ambient backdrop filling the sides of the frame.
- **Saved Media / Audio / Paid Provider / Distribution**:
  - User profiles (`%APPDATA%\takoh-studio-browser`), saved references/jobs (`%LOCALAPPDATA%\ONEWS\studio`), and running helper processes on port `5006` were preserved untouched.
