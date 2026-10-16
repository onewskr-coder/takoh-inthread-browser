---
name: takoh-studio-dev
description: >-
  Standard development, verification, and UI/UX workflow for TAKOH Media Downloader PRO
  & In-Thread Studio Browser (02-A video editing, 02-B Canva carousel studio, and Threads
  shopping account/video research). Activate when modifying studio_web, studio_text_clean.py,
  studio.py, or studio-browser files.
---

# TAKOH Studio & Browser Development Skill

Use this skill whenever developing, debugging, or verifying features in `downloader/` or `studio-browser/`.

## 1. Pre-Flight Checklist
1. Read `AGENTS.md`, `GEMINI.md`, and `CURRENT-STATE.md`.
2. Before major edits, create a timestamped backup snapshot of target files:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/backup_snapshot.ps1
   ```
3. Check that existing helper port `5006` (and `5005`) are respected—never kill a running helper process without user approval.

## 2. Component Map
- **02-A Video & Hook Overlay Studio**:
  - Backend: `downloader/studio_text_clean.py` (`VIDEO_HOOK_TEMPLATES`, `_render_video_hook_template_layer`, `clean_and_overlay_video`) & `downloader/studio.py`.
  - Frontend: `downloader/studio_web/index.html` (`#stage-editing-panel`), `downloader/studio_web/studio.js` (`syncDraggableOverlayCanvas`, `bindDraggableChip`, `pushEditorUndoSnapshot`), `downloader/studio_web/studio.css`.
- **02-B Magazine Carousel & Card News Studio**:
  - Backend: `downloader/studio_text_clean.py` (`CAROUSEL_DESIGN_THEMES`, `_render_canva_editorial_card_pil` with distinct `cover`, `body`, and `cta` architectural layouts per theme).
  - Frontend: `downloader/studio_web/index.html` (`#stage-carousel-panel`, `#carousel-active-workbench`), `downloader/studio_web/studio.js` (`renderCarouselPreview`, `openCarouselSlideWorkbench`).
- **Threads Shopping Account & Video Reference Research**:
  - In-page button (`동일·연관 쇼핑계정 찾기`): `downloader/content-studio.js`.
  - Extractor & Store: `studio-browser/threads-research-extract.js`, `studio-browser/threads-research.cjs`, `studio-browser/threads-research-frontier.cjs`, `studio-browser/threads-research-media.cjs`.
  - Studio UI: `downloader/studio_web/threads-research-ui.js` and `downloader/studio_web/workspace.js` (keep both in sync!).

## 3. Verification Commands
Run the unified health check script after every change:
```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/verify_project.ps1
```
Or run individual checks:
- **JS/CJS Syntax**:
  `node --check downloader/studio_web/studio.js`
  `node --check downloader/studio_web/workspace.js`
  `node --check downloader/studio_web/threads-research-ui.js`
  `node --check studio-browser/threads-research.cjs`
  `node --check studio-browser/main.cjs`
- **Python Unit Tests**:
  `python -m unittest discover -s downloader -p "test_studio_text_clean.py"`
- **Node Unit Tests**:
  `node studio-browser/test_clip_split.cjs`
  `node studio-browser/test_threads_research_media.cjs`
