# HANDOFF-RESULT

## Summary of Implemented Changes (1:1 Canva Card News Layouts & 6 Viral Korean Video Hook Templates)

### 1. Variable-Weight Korean Typography & Specialized Display Font Engine (`downloader/studio_text_clean.py`)
- **`_load_korean_font(size_px, bold=True, style='sans')`**:
  - Supports **Variable Font `wght` axis** on `NotoSansKR-VF.ttf` (`sans_thin=250`, `sans_light=300`, `sans_regular=400`, `sans_medium=500`, `sans_bold=700`, `sans_black=900`) and `NotoSerifKR-VF.ttf` (`serif_light=300`, `serif=600`, `serif_bold=750`, `serif_black=900`) via `font.set_variation_by_axes([wght])`.
  - Supports **Korean Brush / Calligraphy (`brush_kr`)** using `HMKMMAG.TTF` (매직체/붓글씨) and `H2GSRB.TTF` for the torn-paper travel collage card (`warm_luxury`).
  - Supports **Heavy Korean Viral Display (`heavy_kr`)** using `H2GTRE.TTF` (HY견고딕) and `NotoSansKR-VF.ttf` (900 Black) for Korean Reels/Shorts/Threads viral video hooks.
  - Supports **High-Contrast English Didone Serif (`serif_en`, `serif_en_regular`)** (`BOD_B.TTF`, `BOD_R.TTF`, `georgiab.ttf`) and **Condensed Geometric Sans (`condensed_en`)** (`bahnschrift.ttf`, `impact.ttf`).

### 2. 1:1 Pixel-Faithful Canva Card News Layouts (`_render_canva_editorial_card_pil` in `downloader/studio_text_clean.py`)
Rebuilt all 8 layouts in `CAROUSEL_DESIGN_THEMES` to match the exact typography, font weights, proportions, and layout compositions of the 8 Canva Korean reference cards:
1. **`editorial_dark` (시네마 별점 리뷰 — `라라나 영화처럼`)**:
   - Top-center dark rounded pill (`#18181c`) with coral-orange `movie review` text (`#f26d3d`), `NotoSansKR` 900 Black headline (`width * 0.088`), 5 gold vector stars (`★★★★★`), and 2 clean regular body lines.
2. **`magazine_gradient` (뉴욕 포스터 세리프 — `New York / 화려한 도시 속으로 | 뉴욕 여행`)**:
   - Top `@reallygreatsite` + horizontal rule (`y = 7.8%`), giant Title-Case `Bodoni MT` (`New York`, `width * 0.168`), and bottom horizontal rule block (`y = 78%..84.5%`) with mixed-weight `Light 300 | Bold 800` Korean headline + 2 centered sub-lines.
3. **`clean_white` (프레임 티켓 매거진 — `한국인을 위한 한국여행 / FLY TO SEOUL`)**:
   - Blurred full-bleed photo backdrop + centered white rounded card (`64% × 84%`), inner rounded photo (`padding 4.5%`, `height 61%`) with top-left white Korean title (`한국인을 위한 / 한국여행`), and bottom `FLY TO` + giant condensed `SEOUL` + 2 Korean sub-lines.
4. **`highlight_hook` (다이어고널 훅 썸네일 — `심플하고 깔끔한 / 카드뉴스 썸네일`)**:
   - Top photo + bottom translucent dark gray-olive band (`y = 58%..100%`), `심플하지만 강력한!!` kicker, Line 1 `NotoSansKR` 850 ExtraBold (`심플하고 깔끔한`) + Line 2 `NotoSansKR` 300 Light (`카드뉴스 썸네일`), bottom-left neon-lime hashtag pills (`#깔끔한`, `#썸네일`), and bottom-right `자세히보기 ›`.
5. **`mint_modern` (워크스페이스 큐레이션 — `Curator Pick / 집중과 영감을 위한 / 워크스페이스`)**:
   - Top-left white pill (`Curator Pick`), thin Korean sub-header (`집중과 영감을 위한`, weight 300) + giant heavy header (`워크스페이스`, weight 900), bottom-left 2-line caption, and bottom-right solid white circle with black `»`.
6. **`warm_luxury` (폴라로이드 스크랩북 — `후지산을 만나는 / 최고의 열차 여행.`)**:
   - Full-bleed photo on the right + procedural torn cream paper edge on the left (`x ≈ 28%`) + 2 horizontal torn paper strips with Korean brush calligraphy (`HMKMMAG.TTF`) + 2 tilted mini Polaroids at the bottom (`-9°` and `+7°`).
7. **`neon_pop` (SNS 베스트 후기창 — `구매 고객 후기 / BEST ★★★★★`)**:
   - Blurred background + stacked macOS review window (`구매 고객 후기` + traffic-light dots + search icon), dark circular user avatar silhouette + `★★★★★` + blue `BEST` pill + `차*정  10.01 작성` + gray option line + 4-line review paragraph + 3 square product thumbnails at the bottom.
8. **`minimal_outline` (감성 명조 에디토리얼 — `여기가 피크닉 맛집!! / 봄에 꼭 가야하는 / 피크닉 명소 / TOP 3`)**:
   - Top-left `NotoSerifKR` Bold kicker (`여기가 피크닉 맛집!!`) + 3-line large serif headline (`봄에 꼭 가야하는 / 피크닉 명소 / TOP 3`, `width * 0.088`) with tight vertical leading and warm drop shadow.

### 3. 6 Korean Viral Video Hook Templates (`VIDEO_HOOK_TEMPLATES` & `_render_video_hook_template_layer` in `downloader/studio_text_clean.py`)
Modeled directly after the 5 uploaded Korean Reels/Shorts/Threads viral video screenshots + 1 editorial badge hook, rendered as high-resolution transparent PNG layers and composited onto videos via FFmpeg (`clean_and_overlay_video`) or images (`clean_and_overlay_image`):
1. **`reels_giant_yellow_impact` (초대형 옐로우 임팩트 — `밭일하시는 부모님 / 이거면 끝`)**:
   - Line 1 white heavy text (`width * 0.095`) with thick black stroke + Line 2 ultra-giant bright yellow (`#FFEA18`, `width * 0.148`) with heavy black stroke and drop shadow.
2. **`reels_rounded_black` (둥근 블랙 카드 훅 — `장 볼때 누구나 / 한번쯤 하는 고민`)**:
   - Centered pitch-black rounded rectangle card (`radius=34`) with 2 lines of bold white Korean text (`width * 0.072`).
3. **`reels_top_banner_pink` (상단 블랙바 + 핑크 하이라이트 — `일본에서 산 껌통안에 / 종이가 들어있는 이유?!`)**:
   - Full-width solid black top header bar (`y = 0..23%`) with Line 1 white bold text + Line 2 black text inside a pastel pink (`#EAB0D5`) highlight bar.
4. **`reels_3d_pop_shadow` (3D 입체 팝업 외곽선 — `물집 때문에 / 힐 포기할 뻔...`)**:
   - Upward-tilted (`3.5°`) heavy white text (`width * 0.096`) with multi-layer 3D extruded black outline shadow.
5. **`reels_neon_green_glow` (네온그린 글로우 훅 — `손에 안 묻는 / 구리스 스프레이`)**:
   - Line 1 white heavy text + Line 2 vivid neon green (`#52FF5C`) with heavy black stroke and soft outer green glow.
6. **`reels_editorial_split` (매거진 배지 + 2단 훅)**:
   - Top yellow pill badge (`추천 꿀템`) + Line 1 white bold text + Line 2 yellow text inside a dark rounded box with yellow border.

### 4. Studio UI & Interactive Preview (`downloader/studio_web/index.html`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`)
- Added the 6-card `.video-hook-template-grid` gallery to `02 미디어·캐러셀 편집 스튜디오 -> 🔤 타이틀·자막 디자인 합성`.
- Clicking any `.video-hook-chip` selects the template, snaps the Y coordinate to its optimal safe-zone position, auto-fills a 2-line viral hook (`Line 1 | Line 2`) if empty, and updates the live draggable preview on `#player-overlay-canvas`.
- Synced `.video-hook-chip` dataset attribute checks (`data-video-hook` and `data-video-hook-tpl`) in `downloader/studio_web/studio.js`.

### 5. Source Hub Sub-Navigation & Global Button Group Spacing Audit (`downloader/studio_web/studio.css`)
- **Fixed `🔍 레퍼런스·영상소스` Sub-Nav (`#source-hub-subnav`)**:
  - Resolved class name mismatch where `index.html` used `.source-hub-label`, `.source-hub-pills`, and `.source-subtab-btn` while `studio.css` only targeted `.source-hub-badge` and `.source-subtabs`.
  - All 4 category pills (`📌 수집·보관 레퍼런스`, `🔥 쇼핑 쇼츠·트렌드 발굴`, `🧵 쓰레드 인기상품 탐색`, `📥 내 PC·다운로드 폴더`) now render as pill-shaped buttons (`border-radius: 999px`) with a `10px` flex gap, clear white inactive states (`#ffffff` bg, `#2c4a38` text, `#c5d8cc` border), and dark-green active highlight (`#1e4d35` bg, `#ffffff` text).
- **Audited & Fixed All Button Containers Across All Workspaces**:
  - Added explicit `display: flex; align-items: center; gap: 10px; flex-wrap: wrap` and margin resets to `.header-right-actions`, `.heading-actions`, `.create-top-actions`, `.create-top-bar`, `.intel-bar-actions`, `.publish-final-actions`, `.publish-final-step`, `.research-duplicates > div`, `.ref-collection-tabs` (`gap: 8px`), `.storyboard-order-btns` (`gap: 5px`), and `.storyboard-fields-row` (`gap: 6px`).

### 6. Draggable Title & Subtitle Overlay Box Shape Lock (`downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`)
- **Root Cause**:
  - `.draggable-overlay-chip` previously had `position: absolute; left: X%; transform: translate(-50%, -50%); max-width: 88%` without `width: max-content`. In CSS layout, an absolutely-positioned element with `left: X%` and `width: auto` has its shrink-to-fit available width constrained by `(100% - X%)` of the parent container (`#player-overlay-canvas`). Dragging the title box toward the right (`X > 50%`) caused the browser to compress its width and wrap the text into a narrow vertical column.
- **Fix**:
  - Added `width: max-content; max-width: min(88%, 460px); min-width: 140px; box-sizing: border-box` to `.draggable-overlay-chip` and `white-space: nowrap` to `.drag-chip-badge` in `downloader/studio_web/studio.css` so the box width and line-breaks stay 100% constant regardless of `left`/`top` position.
  - Updated `syncDraggableOverlayCanvas()` and `bindDraggableChip()` in `downloader/studio_web/studio.js` to preserve the initial pointer grab offset (`grabOffsetX`, `grabOffsetY`) and dynamically clamp `(minX..maxX, minY..maxY)` by half of the box's rendered dimensions (`bRect.width / 2`, `bRect.height / 2`) so the box never clips outside `#player-overlay-canvas`.

### 7. Native Aspect-Ratio Player Stage & Safe-Zone Guide Alignment (`downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`)
- **Root Cause**:
  - `.analysis-player-frame` previously forced `width: 100%; max-height: 360px` and `.analysis-player-frame video` had `width: 100%; max-height: 356px` (and `440px` in `#create-workspace`). Inside the wide left column (`~600px` wide), this turned the `<video>` element box into a wide 16:9 rectangle with huge empty black sidebars on the left and right while vertical videos (e.g., `702×1062` / `9:16`) were squished vertically in the center (`~235px × 356px`). Furthermore, `#player-overlay-canvas` (`position: absolute; inset: 0`) stretched across the empty black sidebars instead of matching the actual video frame.
- **Fix**:
  - Updated `#create-workspace .analysis-player-frame, .analysis-player-frame` in `downloader/studio_web/studio.css` to `width: fit-content !important; max-width: 100% !important; margin: 0 auto !important; min-height: 0 !important; max-height: none !important;`.
  - Updated `#create-workspace .analysis-player-frame :is(video,#image-preview,img):not([hidden])` to `width: auto !important; max-width: 100% !important; height: auto !important; max-height: 680px !important; object-fit: contain !important; display: block !important;` (and preserved `[hidden] { display: none !important; }`).
  - Updated `render()` in `downloader/studio_web/studio.js` to dynamically set `stageFrame.style.aspectRatio = "${mw} / ${mh}"` from `job.media.width` and `job.media.height`, and attached `onloadedmetadata` / `onload` listeners on `#preview` and `#image-preview` to re-sync `syncDraggableOverlayCanvas()`.

### 8. Separated Media Editing Studio (`02-A`) & Carousel/News Card Dedicated Studio (`02-B`) + Cover/Body/CTA Role Templates (`downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/workspace.js`, `downloader/studio_web/studio.js`, `downloader/studio_web/studio.css`)
- **Role-Differentiated Carousel Templates (`cover` / `body` / `cta`)**:
  - Upgraded `_render_canva_editorial_card_pil`, `draw_korean_overlay_pil`, and `clean_and_overlay_image` in `downloader/studio_text_clean.py` to support explicit or automatic `slide_role` (`cover`, `body`, `cta`):
    - **Slide 1 (`cover` — ★ 메인 표지)**: Full-bleed high-impact editorial cover poster with theme-specific typography (`editorial_dark`, `magazine_gradient`, `clean_white`, `highlight_hook`, `mint_modern`, `warm_luxury`, `neon_pop`, `minimal_outline`).
    - **Slides 2..N-1 (`body` — 📌 본문 포인트)**: Top 54% scene frame + bottom 46% structured editorial card with `POINT 01..N` pill badge, vertical accent bar, bold point headline, divider line, 3-line detailed explanation, and `다음 포인트 (i/N) →` swipe indicator.
    - **Final Slide (`cta` — 🎯 마지막 요약·CTA)**: Rounded summary frame + top circular/rounded photo + `SUMMARY & CHECKLIST` pill + centered conclusion headline + `✓` checklist bullet lines + bottom high-contrast CTA button (`더 많은 추천 정보 · 첫 댓글 링크 확인 →` / `저장해 두고 필요할 때 바로 꺼내보세요 ★`).
  - Updated `/jobs/<job_id>/carousel-generate`, `/jobs/<job_id>/carousel-slide-update`, and `/jobs/<job_id>/carousel-slide-action` in `downloader/studio.py` to persist `role` and `template` per slide and allow changing any slide's role (`cover` / `body` / `cta`) or theme individually.
- **Complete Studio Separation (`02-A 🎬 미디어(영상) 편집` vs `02-B 📰 캐러셀·뉴스카드 편집`)**:
  - Expanded `.production-steps` to 5 independent stages (`01 영상·소재 분석`, `02-A 🎬 미디어(영상) 편집`, `02-B 📰 캐러셀·뉴스카드 편집`, `03 대본·게시문`, `04 상품·제휴 링크`).
  - Added **Post-Analysis Track Chooser (`#post-analysis-mode-chooser`)** in `01 영상·소재 분석` so right after source analysis, the user can choose between `🎬 02-A 미디어(영상) 편집 스튜디오` and `📰 02-B 캐러셀·뉴스카드 전용 스튜디오`.
  - Added `📰 캐러셀편집` quick action button to every project card in the dashboard (`repeat(5, 1fr)`).
- **Direct Interactive Slide Workbench (`#carousel-active-workbench`) in `02-B 캐러셀·뉴스카드 스튜디오`**:
  - Split-view live workbench with a large 4:5 active slide canvas on the left (`◀ 이전` / `다음 ▶` navigation, `-0.5초` / `+0.5초` / `📹 좌측 영상 현재 시점 캡처` frame controls) and a direct inspector on the right:
    - Per-slide Role selector (`★ 메인 표지 (Cover)` / `📌 본문 포인트 (Body)` / `🎯 마지막 요약·CTA (Ending)`) + 1-click role copy presets (`표지 훅 자동채움`, `본문 포인트 폼`, `요약·CTA 폼`).
    - Per-slide Theme selector (override any individual slide among the 8 Canva themes).
    - Direct Headline input (`[형광펜 박스]` / `*포인트 색상*` 1-click wrap buttons), Subcopy textarea, Badge input, and `✦ 슬라이드 #N 변경사항 즉시 합성` button.
  - Added `📰 슬라이드교체` buttons on extracted video frames so clicking a frame immediately swaps the active slide's background scene.

### 9. Browser Top Toolbar `네이버 클립` Tab Target URL (`studio-browser/main.cjs`, `studio-browser/test_clip_split.cjs`)
- Updated `sites.naver_clip` in `studio-browser/main.cjs` from `https://m.naver.com/shorts/` to `https://m.naver.com/` so clicking the top **네이버 클립** (`data-site="naver_clip"`) tab in the browser opens `https://m.naver.com/` directly.
- Updated `studio-browser/test_clip_split.cjs` to assert `naver_clip:'https://m.naver.com/'` and `navigation.siteKey('https://m.naver.com/') === 'naver_clip'`.

### 10. 8-Direction Title/Subtitle Box Resize, Font Family & `px` Font Size, Video Timeline Scrubber Capture, Removal of Black `cover_box`, `F5` Reload State Persistence, and `Ctrl+Z` Undo (`downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`, `downloader/studio_web/workspace.js`)
1. **8-Direction Box Resize & Clean Badge Behavior (`#drag-title-box` & `#drag-subtitle-box`)**:
   - Added 8 directional resize handles (`n`, `s`, `w`, `e`, `nw`, `ne`, `sw`, `se`) to `#drag-title-box` and `#drag-subtitle-box` plus width/height sliders (`#overlay-title-box-w`, `#overlay-title-box-h`, `#btn-reset-title-box-dim`), keeping drag-move separate from box width/height resizing and passing `title_box_w`, `title_box_h`, `overlay_box_w`, `overlay_box_h` to the Pillow/FFmpeg backend.
   - When `#overlay-title-badge` (`상단 소제목 배지 (선택)`) is empty, `#drag-title-kicker` (and `#drag-sub-kicker`) are completely hidden (`hidden=true`, `textContent=''`) instead of displaying fallback helper text (`상단/시작 타이틀 · 드래그 이동 / 테두리 크기조절`), and `#btn-fill-hook-title` no longer auto-fills `#overlay-title-badge` unless typed by the user.
2. **Font Family (`#overlay-title-font`, `#overlay-font`) & `px` Font Size (`#overlay-title-size`, `#overlay-size`)**:
   - Added font family selectors (`heavy_kr`, `sans`, `serif`, `batang_kr`, `brush_kr`, `gungseo_kr`) and replaced the legacy `%` `<select>` with `px` number inputs (`#overlay-title-size` default `54px`, `#overlay-size` default `42px`, plus `-4`/`+4` stepper buttons) that dynamically scale both the live preview (`resolvePreviewFontSizePx` in `studio.js`) and the rendered Pillow/FFmpeg output (`_resolve_font_px` & `_load_korean_font` in `studio_text_clean.py`).
3. **Thin Interactive Video Timeline Scrubber & Exact Timestamp Capture (`#video-timeline-scrubber-bar`)**:
   - Added `#video-timeline-scrubber-bar` (`#timeline-scrubber-range`, `#timeline-scrubber-time`, `#btn-capture-scrubber-bundle`, `#btn-capture-scrubber-carousel`) directly below `#frames` and added `action == 'capture_time'` in `attachments_config_route` (`studio.py`) to extract the exact frame via FFmpeg and attach it as a companion image (`bundle-img-<stamp>.jpg`) and timeline frame (`companion-cap-<stamp>.jpg`).
4. **Removed Opaque Black Subtitle Cover Box (`cover_box`)**:
   - Removed the `cover_box` option from `#text-erase-mode` in `index.html`, removed the FFmpeg black `drawbox` branch in `studio.py`, and neutralized black box painting in `clean_and_overlay_image` (`studio_text_clean.py`).
5. **F5 Page Reload State Persistence (`takoh-active-job-id`, `takoh-active-stage`, `takoh-active-edit-tab`, `takoh-job-draft-<jobId>`)**:
   - Persisted active job ID, active production stage, active edit tab, and unsaved per-job editor drafts in `localStorage` and restored them in `refreshJobs()` (`studio.js`) and boot initialization (`workspace.js`).
6. **`Ctrl+Z` / `Cmd+Z` Undo Stack (`#btn-overlay-undo`)**:
   - Added an up-to-40-step undo history stack (`pushEditorUndoSnapshot`, `performEditorUndo`) bound to `Ctrl+Z` / `Cmd+Z` and the `#btn-overlay-undo` button in `.player-canvas-toolbar-right`.

### 11. Carousel Studio (`02-B`) UX Optimization, 8 Distinct `body` Slide Architectural Layouts, and Emoji-Free Pro Monochrome UI (`downloader/studio_text_clean.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.js`, `downloader/studio_web/workspace.js`, `downloader/studio_web/studio.css`)
1. **Carousel Studio (`02-B`) UX & Extracted Frame Button Fix**:
   - Reorganized `#stage-carousel-panel` (`downloader/studio_web/index.html`) so `#carousel-slides-wrap` (compact horizontal storyboard filmstrip `#carousel-slides-preview` + split-view `#carousel-active-workbench`) sits immediately below `.carousel-template-picker`, while `<details id="carousel-batch-setup-drawer">` sits below as a clean collapsible drawer.
   - Added an empty-state workbench (`carousel-empty-workbench`) when no slides exist yet with 1-click auto-fill & generate buttons, and wired instant `onchange` handlers on `#wb-active-role-select` and `#wb-active-tpl-select` in `renderCarouselPreview()` (`downloader/studio_web/studio.js`).
   - Fixed the vertical character wrapping (`슬\n라\n이\n드\n교\n체`) on `#frames` thumbnail cards by replacing the narrow side-by-side button row with `.frame-action-stack` (`flex-direction: column`, `width: 100%`, `white-space: nowrap`, `minmax(108px, 1fr)`) displaying full-width horizontal buttons (`+ 첨부 추가` and `슬라이드 배경`).
2. **8 Distinct Architectural Layouts for `body` Slides (`_render_canva_editorial_card_pil` in `downloader/studio_text_clean.py`)**:
   - Replaced the single generic `eff_role == 'body'` split card with 8 genuinely distinct architectural layouts matching each theme:
     1. `editorial_dark`: **시네마 스플릿 프레임** (Top 56% widescreen photo + coral divider + bottom solid dark split column with giant `01` index on the left and 2-tier copy on the right).
     2. `magazine_gradient`: **보그/뉴욕 매거진 비대칭 에디토리얼** (Top-left `EDITORIAL FEATURE` & giant serif `01` + top-right framed vertical photo + bottom full-width editorial spread between gold rules).
     3. `clean_white`: **모던 화이트 갤러리 시트** (Off-white paper canvas + top `STEP 01` rule + centered rounded photo frame + bottom left-aligned headline, accent bar, and body copy).
     4. `highlight_hook`: **상단 다크 헤드라인 배너 + 하단 플로팅 캡션** (Top 31% dark header with neon-lime badge & headline + bottom 69% photo with floating dark caption box).
     5. `mint_modern`: **모던 큐레이션 북 레이아웃** (Dark slate canvas + top `CURATION NOTE · 01` header + centered rounded photo + bottom quote-style vertical white left rule & copy).
     6. `warm_luxury`: **폴라로이드 & 모눈 저널 노트** (Warm cream graph-paper grid + white Polaroid frame with masking tape accent at top center + serif journal note below).
     7. `neon_pop`: **모던 인사이트 윈도우 카드** (Blurred photo background + crisp white UI window frame with top header bar, embedded rounded photo, and structured copy).
     8. `minimal_outline`: **풀블리드 명조 에세이 포스터** (Full-bleed photo with smooth dark bottom scrim, fine editorial frame border, serif `01.` index + short gold rule + large serif headline & subcopy).
3. **Emoji Removal & Restrained Pro Studio Monochrome UI (`#0f172a` / `#1e293b` / `#334155` / `#f8fafc`)**:
   - Removed decorative emojis across `downloader/studio_web/index.html`, `downloader/studio_web/studio.js`, and `downloader/studio_web/workspace.js`.
   - Unified the color palette in `downloader/studio_web/studio.css` into a restrained slate/charcoal desktop editing environment, replacing rainbow badges, neon borders, and multi-colored pastel gradients.

### 12. Threads Shopping Account & Video Reference Discovery Upgrade (`downloader/content-studio.js`, `studio-browser/toolbar.html`, `downloader/studio_web/index.html`, `studio-browser/threads-research-extract.js`, `studio-browser/threads-research.cjs`, `downloader/studio_web/threads-research-ui.js`, `downloader/studio_web/workspace.js`, `studio-browser/main.cjs`)
1. **Clarified "제품 찾기" Button & Workspace Naming**:
   - Renamed the in-feed Threads post button in `downloader/content-studio.js` from `제품 찾기` to **`동일·연관 쇼핑계정 찾기`** (`title="이 영상과 동일·유사한 영상을 올리는 쇼핑 콘텐츠 계정 및 연관 게시물 탐색"`).
   - Renamed the sidebar/sub-tab items in `studio-browser/toolbar.html` and `downloader/studio_web/index.html` to **`쓰레드 쇼핑계정·영상 탐색`** and updated the workspace heading to **`Threads 동일·연관 쇼핑계정 및 영상 레퍼런스 탐색`**.
2. **Thorough Media, View Count (`views`), and Engagement Reaction (`likes`, `replies`, `reposts`, `quotes`) Collection**:
   - Upgraded `extractThreadsResearch` (`studio-browser/threads-research-extract.js`) to parse both embedded Relay/SSR JSON scripts (`<script type="application/json">`, extracting `impression_count`, `view_count`, `play_count`, `like_count`, `direct_reply_count`, `repost_count`, `quote_count`, `video_versions`, `image_versions2`, `carousel_media`) and visible DOM badges/buttons/spans.
   - Removed the `.slice(0, 8)` preview generation cap in `studio-browser/threads-research.cjs` so every collected post gets its `media_preview` prepared, and added `deepInspectPost()` during `capture` (`deep: true`), `audit-media`, and `sync-accounts` to visit post detail views and guarantee view counts, reactions, and media assets are populated.
3. **Daily Account Feed Auto-Refresh & 1-Click Sync (`sync-accounts`, `set-account-sync`)**:
   - Added `account_sync` tracking (`auto_daily`, `last_daily_run`, per-account `last_synced_at`, `last_added`) in `ResearchStore` (`studio-browser/threads-research.cjs`), a background daily scheduler (`syncCollectedAccounts({onlyDue: true})`), a batch **`[수집 계정 신규 콘텐츠 지금 일괄 갱신]`** button, and per-account **`[지금 갱신]`** buttons in `#threads-research`.
4. **Optional Read-Only Threads API Collector (`save-api-token`, `api-keyword-collect`)**:
   - Added strictly read-only Meta Threads Graph API (`GET https://graph.threads.net/v1.0/keyword_search`) support in `studio-browser/threads-research.cjs` (`threads-api-collector.json`, `mode: 'read_only_collection'`) and an in-UI configuration panel explaining why daily third-party account feed & view-count syncing works 100% via the built-in browser collector without requiring an API key, while allowing optional read-only API keyword collection.

### 13. Project Essential Development & Agentic Workflow Setup (`GEMINI.md`, `.agents/skills/`, `downloader/requirements.txt`, `studio-browser/package.json`, `.gitignore`, `.editorconfig`, `.env.example`)
1. **Always-On Workspace Rule (`GEMINI.md`)**:
   - Created root `GEMINI.md` enforcing port ownership (`5006` vs `5005`), user data/cookie/secret protection, Pro Studio monochrome UI rules (no decorative emojis, restrained `#0f172a`/`#1e293b`/`#334155`/`#f8fafc` palette), `02-A` / `02-B` studio separation, and the pre-update backup & verification workflow.
2. **Project-Specific Agent Skills (`.agents/skills/`)**:
   - `.agents/skills/takoh-studio-dev/SKILL.md`: Component map and development runbook for `02-A` video editing, `02-B` Canva carousel workbench, and Threads shopping account/video research.
   - `.agents/skills/safe-backup-and-verify/SKILL.md` + executable PowerShell scripts:
     - `.agents/skills/safe-backup-and-verify/scripts/backup_snapshot.ps1`: Automatically snapshots 16 core files into `.backups/<timestamp>-<label>/` before major updates.
     - `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`: Runs syntax checks (`node --check` on 13 JS/CJS files, `python -m py_compile` on core Python modules) and executes unit test suites in one command.
3. **Dependency & Repository Hygiene Fixes**:
   - Updated `downloader/requirements.txt` to include `Pillow>=10.2.0`, `numpy>=1.26.0`, and `opencv-python-headless>=4.9.0.80` (used by `studio_text_clean.py`).
   - Updated `studio-browser/package.json` with `jsdom` devDependency and expanded `npm run check` / `npm test` scripts.
   - Fixed `.gitignore` so `downloader/test_*.py`, `downloader/test_*.js`, and `studio-browser/test_*.cjs` are tracked properly while `.backups/` and `.scratch/` are ignored.
   - Created `.editorconfig` (UTF-8, consistent indentation) and `.env.example` (safe environment variable template).

### 14. Reference Library (`수집·보관 레퍼런스`) Immediate Thumbnail Rendering & Pre-Warming Pipeline (`downloader/studio.py`, `downloader/studio_web/studio.js`, `downloader/content-studio.js`, `studio-browser/threads-research.cjs`)
1. **Root Causes Identified**:
   - **Synchronous On-Demand FFmpeg Bottleneck (`/references/<id>/thumbnail`)**: Previously, thumbnails were never prepared when a reference was imported (`/references/import`). Instead, when the user opened `수집·보관 레퍼런스`, dozens of cards simultaneously requested `/studio/references/<id>/thumbnail`, each downloading the remote image/video and spawning an FFmpeg subprocess behind a `_ffmpeg_slots = BoundedSemaphore(2)` lock.
   - **Video-Only Threads Posts & Expired CDN Signatures**: When a Threads post had a `<video>` without a `poster` attribute, `thumbnailUrl` was saved as `""`, forcing the backend to download up to 64MB of remote `.mp4` video just to extract 1 frame—or failing outright if the CDN signature expired or if the post was initially collected before its media finished loading (`already_saved` previously ignored newly discovered media on re-import).
   - **Global `Cache-Control: no-store` Override**: `private_studio()` in `studio.py` overwrote `send_file(..., max_age=3600)` with `Cache-Control: no-store` on every `/studio/*` response, forcing the browser to re-fetch every thumbnail on every tab switch.
   - **No Automatic Client Fallback & Hidden-Tab Lazy Loading**: `refreshReferences()` in `studio.js` only tried `ref.previewUrl` once (`onerror` immediately hid the `<img>` without falling back to `thumbnailDataUrl` / `thumbnailUrl` / `poster` / `imageUrls[0]`), and set `loading="lazy"` on all cards while `#reference-workspace` was hidden at boot.
2. **Fixes Implemented**:
   - **Live Canvas Snapshot (`thumbnailDataUrl`) at Collection Time**: Updated `reference()` in `downloader/content-studio.js` to capture a lightweight JPEG data URL (`canvas.toDataURL('image/jpeg', 0.78)`) directly from the live `<video>` or `<img>` DOM element in the browser, and updated `studio-browser/threads-research.cjs` (`action === 'reference'`) to pass `thumbnailDataUrl: p.media_preview?.data_url || ''`.
   - **Background Thumbnail Pre-Warming & JPEG Fast-Path (`downloader/studio.py`)**: Added `_warm_reference_thumbnail_async()` in `import_reference` so the local thumbnail cache (`reference-thumbnails/<id>.jpg`) is populated in the background immediately upon collection; added a direct write fast-path for `thumbnailDataUrl` and standard JPEGs (`\xff\xd8\xff`) so FFmpeg is not spawned unnecessarily; and updated `import_reference` to merge newly discovered `thumbnailUrl` / `poster` / `thumbnailDataUrl` / `imageUrls` / `videoUrls` when an existing reference is re-collected.
   - **Browser Cache Preservation & Multi-Stage Client Fallback (`downloader/studio.py`, `downloader/studio_web/studio.js`)**: Exempted `GET .../thumbnail` responses from `Cache-Control: no-store` in `private_studio()`, set `loading="eager"` on the first 16 cards in `refreshReferences()`, and added automatic cascading fallback across `[ref.thumbnailDataUrl, ref.previewUrl, ref.thumbnailUrl, ref.poster, ref.imageUrls?.[0]]`.

### 15. NLE Filmstrip/Waveform Timeline Scrubber, Stage-Scoped Carousel Replace Buttons, Proportional Font Scaling on Box Resize, Font Size Range Sliders, and Wide `01` / `02-A` / `02-B` Studio Layout (`downloader/studio_web/index.html`, `downloader/studio_web/workspace.js`, `downloader/studio_web/studio.js`, `downloader/studio_web/studio.css`)
1. **NLE Filmstrip + Audio Waveform Timeline Scrubber (`#video-timeline-scrubber-bar`)**:
   - Redesigned `#video-timeline-scrubber-bar` into a dark NLE video clip timeline (`#nle-clip-track`) featuring:
     - Top dark-teal clip header bar showing the clip filename (`#scrubber-clip-name`), `HH:MM:SS:FF` frame timecode (`#scrubber-clip-timecode`), and current/total seconds badge (`#timeline-scrubber-time`).
     - Continuous 16-cell horizontal thumbnail filmstrip (`#scrubber-filmstrip-row`) populated from extracted frames.
     - Audio waveform canvas (`#scrubber-waveform-canvas`) with teal vertical waveform bars and orange peak indicator dots.
     - Vertical white playhead cursor (`#scrubber-playhead-line` with top cap) synchronized with `#timeline-scrubber-range` and `<video id="preview">` playback.
2. **Stage-Scoped `[현재 시점으로 캐러셀 슬라이드 배경 교체]` Button (`02-B` Only)**:
   - Updated `selectStage(name)` in `downloader/studio_web/workspace.js` and CSS rules in `downloader/studio_web/studio.css` (`body:not([data-active-stage="carousel"]) #btn-capture-scrubber-carousel` and `.frame-replace-slide-btn`) so the carousel background replacement buttons appear **exclusively** in `02-B 캐러셀·뉴스카드 편집` (`stage === 'carousel'`) and remain hidden in `01 영상·소재 분석` and `02-A 미디어(영상) 편집`.
3. **Proportional Font Size Scaling When Expanding/Resizing Overlay Boxes**:
   - Updated `bindDraggableChip()` and the `#overlay-title-box-w` slider handler in `downloader/studio_web/studio.js` so dragging any of the 8 resize handles on `#drag-title-box` or `#drag-subtitle-box` (or adjusting box width) scales `#overlay-title-size` (`18px`–`140px`) and `#overlay-size` (`18px`–`110px`) proportionally (`Math.round(startFontSize * scaleRatio)`), keeping text size naturally matched to the box size.
4. **Fixed Title Font Size Scaling Ceiling & Added Font Size Range Sliders**:
   - Fixed `resolvePreviewFontSizePx()` in `downloader/studio_web/studio.js`, which previously capped preview font size at `54px` (`Math.min(54, ...)`), preventing title font sizes above ~64px from visually growing on the preview canvas. Raised the preview ceiling to `96px` and applied `basePx` directly to `#drag-title-text`.
   - Added smooth range sliders (`#overlay-title-size-range` and `#overlay-size-range`) alongside the number inputs (`#overlay-title-size` and `#overlay-size`) and `-4`/`+4` step buttons with two-way synchronization and undo history support.
5. **Wide Full-Width Studio Layout for `01`, `02-A`, `02-B` & Enlarged Carousel Active Slide Preview**:
   - Scoped the left `실시간 미리보기 (모바일 게시 화면)` panel (`.content-live-preview`) so it is hidden during `01 영상·소재 분석` (`analysis`), `02-A 미디어(영상) 편집` (`editing`), and `02-B 캐러셀·뉴스카드 편집` (`carousel`), and shown **only** in `03 대본·게시문` (`writing`), `04 상품·제휴 링크` (`product`), and `게시·예약` (`publish`).
   - Restored a spacious 2-column side-by-side workspace layout in `01`, `02-A`, and `02-B` (`minmax(430px, 46%) minmax(480px, 54%)`), and enlarged the `02-B` active slide preview canvas (`.wb-canvas-frame` in `.carousel-wb-grid`) to **`410px × 513px`** (more than 2× the previous width).

### 16. 25+ Korean Typography Catalog, Custom Font Upload (`.ttf`/`.otf`/`.ttc`), Box Corner Radius (`0~80px`), 2-Layer Double-Stroke Text Outline (`0~24px`), and `01 영상·소재 분석` Pre-Analysis AI Model Selector & Guided UX (`downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`, `downloader/test_studio_text_clean.py`)
1. **25+ Korean Fonts Across 5 Categories & Bundled Open-Source Display Fonts (`downloader/fonts/`, `downloader/studio_text_clean.py`)**:
   - Downloaded and bundled 9 popular open-source Korean viral/display fonts in `downloader/fonts/` (`BlackHanSans-Regular.ttf`, `GasoekOne-Regular.ttf`, `DoHyeon-Regular.ttf`, `Jua-Regular.ttf`, `BagelFatOne-Regular.ttf`, `GowunDodum-Regular.ttf`, `GowunBatang-Bold.ttf`, `Orbit-Regular.ttf`, `NanumPenScript-Regular.ttf`) alongside `NotoSansKR-VF.ttf`, `NotoSerifKR-VF.ttf`, and Windows Korean system fonts (`H2GTRE.TTF`, `H2HDRM.TTF`, `H2PORL.TTF`, `H2GSRB.TTF`, `HMKMMAG.TTF`, `HMFMOLD.TTF`, `malgunbd.ttf`), providing **25 categorized font options** across Title (`#overlay-title-font`), Subtitle (`#overlay-font`), Carousel Global (`#carousel-font`), and Carousel Active Slide Workbench (`#wb-active-font-select`).
   - Added `@font-face` rules (`StudioFont_*`) in `downloader/studio_web/studio.css` and `resolveCssFontFamily()` in `downloader/studio_web/studio.js` so the live preview canvas immediately reflects the selected font.
2. **User Custom Font Upload (`.ttf` / `.otf` / `.ttc`)**:
   - Added `/studio/fonts`, `/studio/fonts/upload`, `/studio/fonts/<font_key>`, and `/studio/fonts/file/<font_key>` in `downloader/studio.py` storing user-uploaded fonts safely in `%LOCALAPPDATA%\ONEWS\studio\custom-fonts\`.
   - Added **`[+ 내 폰트 추가 (.ttf/.otf)]`** buttons (`triggerCustomFontUpload`) next to Title, Subtitle, Carousel Global, and Carousel Slide font selectors that upload the font, inject a dynamic `@font-face` (`CustomFont_<key>`), and select it across all font dropdowns.
3. **Adjustable Box Corner Radius (`모서리 둥글기 0~80px`)**:
   - Added synchronized range slider + number input controls for Title Box Corner Radius (`#overlay-title-box-radius-range` / `#overlay-title-box-radius`, default `18px`) and Subtitle Box Corner Radius (`#overlay-box-radius-range` / `#overlay-box-radius`, default `22px`).
   - Wired `title_box_radius` and `overlay_box_radius` into both the live preview (`titleBox.style.borderRadius`, `subBox.style.borderRadius`) and the Pillow backend (`_render_video_hook_template_layer`, `_render_editorial_subtitle_card_pil`, `draw_korean_overlay_pil`, `clean_and_overlay_video`).
4. **2-Layer Double-Stroke Text Outline (`1차 안쪽 테두리` + `2중 바깥 테두리` Thickness `0~24px` & Color Pickers)**:
   - Added `_draw_double_stroke_text()` and `_parse_color_rgba()` in `downloader/studio_text_clean.py` so when `double_stroke_width > 0`, Pillow renders the outer 2nd border at `stroke_width + double_stroke_width` first, then the inner 1st border at `stroke_width`, and finally the fill text across all video hook templates, subtitle cards, and all 8 Canva carousel themes (`cover`, `body`, `cta`).
   - Added `buildLiveDoubleStrokeTextShadow()` in `downloader/studio_web/studio.js` for real-time multi-ring CSS `text-shadow` preview on `#drag-title-text` and `#drag-subtitle-text`.
5. **`01 영상·소재 분석` Pre-Analysis AI Engine & Model Selector Bar (`STEP 0`) + Intuitive Step-by-Step UX**:
   - Added **`#analysis-ai-model-bar` (`STEP 0 · 분석 전 AI 엔진 및 모델 선택`)** at the top of `01 영상·소재 분석` with:
     - **1. AI 연결 방식 (`#analysis-ai-provider`)**: `Gemini API`, `Antigravity 구독 CLI`, `OpenAI API`, `Codex 구독 CLI`, `KIE AI API`.
     - **2. 분석 AI 모델 선택 (`#analysis-model-choice` + `#analysis-model-custom`)**: Dynamically populated with all models for the chosen provider (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.8-flash`, `gpt-4.1`, etc.) and capability tags (`[음성+프레임]` vs `[프레임만]`), bidirectionally synced with the `analysis` task route and global AI settings.
     - **Connection Readiness Badge (`#analysis-ai-conn-badge`)** + **`[AI 키·계정 설정 ↗]`** quick button + **Scope Badge (`#analysis-model-scope-badge`)**.
    - Added a **3-Step Progress Overview Bar (`#analysis-progress-overview`)** and reorganized the analysis tools into clear **STEP 1 (AI 장면·음성 심층 분석)**, **STEP 2 (화면 속 글자 OCR 및 한국어 번역)**, **STEP 3 (원본 게시물 본문 확인)** cards with live completion badges (`✓ 분석 완료` / `분석 대기`), followed by **STEP 4 (`#post-analysis-mode-chooser`: `02-A 미디어 편집` vs `02-B 캐러셀 제작`)** at the bottom.

### 17. `02-B 캐러셀·뉴스카드 편집` Pre-Production AI Model Selector Bar (`STEP 0`) & Auto-Populated 3-Part Story (`01 표지` · `02~N-1 본문` · `마지막장 요약·CTA`) from Video Analysis (`downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`, `downloader/studio_web/workspace.js`, `downloader/test_studio.py`)
1. **Pre-Production AI Engine & Model Selector Bar (`#carousel-ai-model-bar` in `02-B 캐러셀 편집`)**:
   - Added `#carousel-ai-model-bar` (`STEP 0 · 캐러셀 제작 전 AI 엔진 및 모델 선택`) at the very top of `#stage-carousel-panel` with:
     - **1. AI 연결 방식 (`#carousel-ai-provider`)**: `Gemini API`, `Antigravity 구독 CLI`, `OpenAI API`, `Codex 구독 CLI`, `KIE AI API`.
     - **2. 캐러셀 대본·생성 AI 모델 선택 (`#carousel-model-choice` + `#carousel-model-custom`)**: Dynamically populated with all models for the chosen provider, bidirectionally synchronized with `01 영상·소재 분석` (`#analysis-ai-model-bar`) and global AI settings via `syncAnalysisBarUi()`.
     - **1-Click Action Buttons**: **`[선택 AI로 표지·본문·마지막장 재작성]`** (`#btn-ai-compose-carousel-story`, calling `POST /studio/jobs/<job_id>/carousel-story-draft` with the selected AI model) and **`[분석 자료로 즉시 자동 채우기]`** (`#btn-autofill-carousel-texts`).
2. **Always-Visible 3-Part Story Plan Editor (`#carousel-story-plan-panel`) & Auto-Population from Video Analysis**:
   - Added `#carousel-story-plan-panel` (`영상 소재 분석 기반 [표지 · 본문 · 마지막장] 자동 구성 대본`) directly above the 8-theme layout picker with 3 dedicated, clearly labeled editors:
     1. **`01 표지 (Cover · 첫 장 훅)` (`#carousel-cover-title`)**: Hook headline + subcopy (`헤드라인 | 보조카피`).
     2. **`02~N-1 본문 (Body · 핵심 포인트)` (`#carousel-body-texts`)**: Problem empathy -> core feature -> real-use detail points (`한 줄에 1장씩`).
     3. **`N 마지막장 (CTA · 핵심 요약·결론)` (`#carousel-cta-text`)**: Final summary & CTA (`[상품/핵심 요약] ... | 보조 설명`).
   - Added `ensureCarouselStoryAutoPopulated(force)` in `downloader/studio_web/studio.js` and triggered it automatically in `render()`, on `selectStage('carousel')` (`downloader/studio_web/workspace.js`), and on `#carousel-count` changes so that as soon as video material analysis is available, **Cover**, **Body**, and **Last Slide (CTA)** are automatically populated without manual typing.
3. **Backend AI Story Synthesis & Deterministic 3-Role Harvesting (`downloader/studio.py`)**:
   - Enhanced `_build_fallback_carousel_texts()` so Slide 1 is structured as the **Main Cover**, Slides `2..count-1` as **Body Points**, and Slide `count` (`count >= 3`) as the **Final Summary / CTA Slide**.
   - Added `_generate_ai_carousel_story_slides()` and `POST /studio/jobs/<job_id>/carousel-story-draft` to synthesize structured `cover`, `body`, and `cta` slides (including recommended frame timestamps) using the user's selected AI provider/model, and wired `POST /studio/jobs/<job_id>/carousel-generate` to apply AI story copy and timestamps when generating the carousel set.
4. **Compact Left Preview Column (`280px` Player / `310px` Column) Across `01 영상·소재 분석`, `02-A 미디어(영상) 편집`, and `02-B 캐러셀·뉴스카드 편집` (`downloader/studio_web/studio.css`)**:
   - Narrowed `.analysis-workspace-grid` in `01`, `02-A`, and `02-B` to `grid-template-columns: minmax(260px, 310px) minmax(0, 1fr) !important` (`playerColWidth: 310px`, `playerFrameWidth: 280px`, `max-height: 410px`) and narrowed `.carousel-wb-grid` active slide preview to `minmax(230px, 280px) minmax(0, 1fr)` (`wbCanvasWidth: 280px`), expanding the right-hand editing workbench to `1162px+`.

### 19. `02-A 미디어(영상) 편집` — Subtitle Erase (Blur / Cover / Complete AI Inpaint), Interactive Mask Box, and Video Zoom (`downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`, `downloader/test_studio.py`)
1. **Subtitle Erase Modes (`#text-erase-mode` & `.erase-mode-chip-group` in `STEP A`)**:
   - **원본 유지 (`none` / `keep`)**: Preserves original video/image frame and composites only the new Korean title/subtitle.
   - **흐림 (블러 · `blur_subtitles` / `blur_mask`)**: Applies Gaussian blur (on images) or FFmpeg `delogo` regional blur (on videos) over the subtitle/watermark mask region.
   - **덮어씌우기 (`cover_subtitles` / `cover_mask`)**: Draws a solid/translucent mask box with customizable color (`#erase-mask-color`) and opacity (`#erase-mask-opacity`, `20% ~ 100%`) via Pillow rounded rectangle (on images) or FFmpeg `drawbox=t=fill` (on videos).
   - **완전 삭제 (`auto_subtitles` / `auto_text` / `local_fill`)**: Uses RapidOCR + Telea/Navier-Stokes & Optical-Flow temporal inpainting (`clean_text_video` / `clean_and_overlay_image`) to erase original foreign subtitles or watermarks completely.
2. **Interactive Draggable & 8-Direction Resizable Mask Region (`#drag-mask-box` in `STEP B`)**:
   - Added `#drag-mask-box` inside `#player-overlay-canvas` with 8 directional resize handles (`n, s, w, e, nw, ne, sw, se`), live visual feedback (backdrop blur for `blur_subtitles`, colored cover box for `cover_subtitles`, striped target zone for `auto_subtitles`/`local_fill`), quick mask presets (`하단 자막줄 맞춤`, `하단 2줄 와이드`, `상단 워터마크`, `우측 하단 로고`, `중앙 배너 가림`), and `X / Y / W / H (%)` coordinate inputs (`#mask-x`, `#mask-y`, `#mask-w`, `#mask-h`).
3. **Video / Image Zoom Scale & Focus (`STEP C`)**:
   - Added `100% ~ 160%` zoom slider & number input (`#video-zoom-scale-range`, `#video-zoom-scale`), quick zoom preset buttons (`100% 원본`, `108% 미세 크롭`, `116% 테두리·로고 컷`, `128% 자막·여백 컷`, `140% 클로즈업`), and focus center inputs (`#video-zoom-focus-x`, `#video-zoom-focus-y`).
   - Previews zoom in real time on `#preview` / `#image-preview` via CSS `transform: scale(...)` and `transform-origin`, and renders permanently via OpenCV cubic crop/resize (for images) or FFmpeg `scale` + `crop` filterchain (for videos).

### 21. `02-B 캐러셀·뉴스카드 편집` — 1st-Slide 90% Viral Hook Formula Engine & Structured Bottom Slide Workbench (`사진 수정 [이미지 추가 · Ctrl+V 복사 붙여넣기]` + `제목` + `부제목` + `본문 텍스트 추가`) (`downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.js`, `downloader/studio_web/studio.css`, `downloader/test_studio.py`)
1. **1st-Slide (Cover) 90% Viral Hook Formula Engine (`COVER_HOOK_FORMULAS` / `formatCoverHookByFormula`)**:
   - Added 5 one-click Cover Hook Formula chips (`data-cover-hook-formula`) in both the top `#carousel-story-plan-panel` (`#carousel-cover-hook-formula-bar`) and the bottom active slide workbench (`.wb-cover-hook-box`):
     - `question` (**질문형 후킹**): 호기심·공감 유발 질문으로 스와이프 유도 (`아직도 [키워드] 그냥 고르세요?` / `혹시 [키워드] 아직도 그대로 쓰세요?`)
     - `number` (**숫자·공식형 후킹**): 구체적 수치·법칙으로 신뢰도·클릭률 상승 (`잘 고르는 [키워드] 핵심 공식 N가지` / `90%가 놓치는 [키워드] 핵심 공식 N가지`)
     - `twist` (**반전·통념파괴형**): 고정관념을 깨는 반전 문장으로 시선 고정 (`다 똑같다는 [키워드]의 의외의 반전`)
     - `loss_aversion` (**손실회피·비교형**): 모르면 손해 보는 핵심 체크 포인트 강조 (`모르면 나만 손해 보는 [키워드] 체크리스트`)
     - `direct_rule` (**단도직입·비결형**): 잘 터지는 핵심 공식·결론을 직관적으로 제시 (`잘 터지는 [키워드] 핵심 비결 총정리` + `잘 되는 캐러셀에는 공식이 있습니다!`)
   - Supported `hook_formula` in `/jobs/<job_id>/carousel-story-draft`, `/jobs/<job_id>/carousel-generate`, and `/jobs/<job_id>/carousel-slide-update` (both AI generation prompt and deterministic fallback).
2. **Canva-Style Bottom Storyboard Filmstrip + Structured 4-Step Slide Workbench (`#carousel-slides-wrap` / `renderCarouselPreview()`)**:
   - Added a Canva-style `[+ 슬라이드 추가]` card (`.carousel-storyboard-add-card`) at the end of the horizontal slide filmstrip (`#carousel-slides-preview`).
   - Rebuilt the active slide workbench (`#carousel-active-workbench`) into a clear, step-by-step editor:
     - **1. 사진 수정 (`이미지 추가 · 복사 붙여넣기 · 장면 캡처`)**:
       - **`+ 이미지 파일 추가/교체`** & **`+ 새 슬라이드로 사진 추가`** (`#carousel-slide-photo-input` file picker + drag-and-drop onto `.wb-canvas-frame`).
       - **`클립보드 이미지 붙여넣기 (Ctrl+V)`**: Clicking the button or pressing `Ctrl+V` anywhere in `02-B 캐러셀·뉴스카드 편집` reads the image from the clipboard, converts it to `image_data_url`, crops it to the carousel aspect ratio (`4:5` / `1:1` / `9:16`) via `_save_custom_slide_image_from_data_url` in `downloader/studio.py`, and immediately updates the active slide's photo (with a 1-click restore button to revert to the video/original frame).
       - **`-0.5초` / `+0.5초` / `현재 영상 시점 캡처`** video frame controls.
     - **첫 장(표지)이 90% — 바이럴 후킹 공식 원클릭 적용 바**: Instant 1-click conversion of the slide's Title & Subtitle into Question / Number / Twist / Loss-Aversion / Direct-Secret hook formats.
     - **2. 제목 (`#wb-active-head-input`)**: Main headline input with `+ [박스 강조]` and `+ *색상 강조*` syntax buttons.
      - **3. 부제목 (`#wb-active-subtitle-input`)**: 2nd-tier hook subcopy / core summary line (e.g., `"잘 되는 캐러셀에는 공식이 있습니다!"`).
      - **4. 본문 텍스트 추가 (`#wb-active-body-input`)**: Multi-line additional body copy / bullet points with `+ 체크포인트 줄 추가` and `본문 비우기` buttons, rendered across all 8 Canva themes via multi-line `sub_text` support in `_render_canva_editorial_card_pil` (`downloader/studio_text_clean.py`).

### 22. `01 영상·소재 분석` & `02-A 미디어(영상) 편집` — Click-to-Edit Unified Text Inspector (`#capcut-text-inspector`) & 11-Feature Typography Engine (`downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.js`, `downloader/studio_web/studio.css`, `downloader/test_studio_text_clean.py`, `downloader/test_studio.py`)
1. **Click-to-Edit Interactive Canvas & Unified Text Inspector (`#capcut-text-inspector`)**:
   - Clicking any text layer on the video preview canvas (`#drag-title-box` or `#drag-subtitle-box`), clicking the preview quick-select buttons (`#btn-canvas-select-title` / `#btn-canvas-select-sub`), or clicking the inspector layer pills (`#inspector-tab-title` / `#inspector-tab-subtitle`) highlights the active layer on the canvas (`.active-selected-layer`), opens `02-A 미디어(영상) 편집 -> ① 텍스트 편집창 (클릭·실시간 수정)`, and populates `#capcut-text-inspector` for that layer (`activeTextLayer = 'title' | 'subtitle'`).
   - Separated `02-A 미디어(영상) 편집` into 4 clean, focused tabs (`data-edit-tab`):
     1. `① 텍스트 편집창 (클릭·실시간 수정)` (`#media-text-editor` / `#capcut-text-inspector`)
     2. `② 자막 지우기 · 마스크 · 화면 확대` (`#video-erase-mask-zoom-pane`)
     3. `③ 3초 후킹 · 인트로 연출` (`#hook-analysis-panel`)
     4. `④ 쓰레드 미디어 묶음 (영상+이미지)` (`#media-bundle-panel`)
2. **11 Core Typography Features (Live Preview + Pillow/FFmpeg Backend Rendering)**:
   - **① 텍스트 수정 (`#inspector-text-input`, `#inspector-badge-input`)**: Multi-line / `|` 2-tier text input + `+ [형광펜 박스]` + `+ *색상 강조*` + `분석·OCR 문구 자동 채우기`.
   - **② 사전 설정 스타일 (`[data-inspector-preset]`)**: 8 one-click presets (`초대형 옐로우`, `둥근 블랙 카드`, `상단 헤더바(블랙+핑크띠)`, `3D 입체 외곽선`, `형광 그린 글로우`, `매거진 배지+다크박스`, `화이트 카드`, `투명 외곽선`).
   - **③ 글꼴 (`#inspector-font-select`)**: 25 categorized Korean fonts + `+ 내 폰트(.ttf/.otf)` upload.
   - **④ 패턴 (`#inspector-btn-bold`, `#inspector-btn-italic`, `#inspector-btn-underline`)**: Bold (`wght` axis / stroke boost), Italic (Pillow affine shear transform `_apply_layer_italic_and_opacity` & CSS `font-style: italic`), and Underline (Pillow underline draw & CSS `text-decoration: underline`).
   - **⑤ 정렬 (`[data-inspector-align="left|center|right"]`)**: Left, Center, and Right alignment inside the text box in both live preview and Pillow rendering (`_render_video_hook_template_layer` & `render_overlay_rgba_layer`).
   - **⑥ 글꼴 크기 (`#inspector-font-size-range`, `#inspector-font-size`)**: `18px ~ 140px` slider and numeric input.
   - **⑦ 확대 배율 (`#inspector-scale-pct-range`, `#inspector-scale-pct`)**: `50% ~ 200%` layer scale multiplier (`scale_pct`).
   - **⑧ 불투명도 (`#inspector-opacity-range`, `#inspector-opacity`)**: `15% ~ 100%` layer alpha multiplier (`opacity`).
   - **⑨ 문자간격 · 자간 (`#inspector-letter-spacing-range`, `#inspector-letter-spacing`)**: `-4px ~ +24px` character-by-character spacing (`_measure_spaced_text` & `_draw_double_stroke_text`).
   - **⑩ 줄간격 · 행간 (`#inspector-line-spacing-range`, `#inspector-line-spacing`)**: `0.85 ~ 2.20` line spacing multiplier (`line_spacing`).
   - **⑪ 색상 & ⑫ 획 · 2중 테두리**: Custom text hex color (`#inspector-text-color` + 6 quick color swatches), background box toggle/color/opacity (`#inspector-bg-enabled`, `#inspector-bg-color`, `#inspector-bg-opacity`), 1st inner stroke (`#inspector-stroke-width`, `#inspector-stroke-color`), and 2nd outer double stroke (`#inspector-double-stroke-width`, `#inspector-double-stroke-color`).

---

## Verification Evidence (Separated by Category)

### Static / Unit Verification
- `powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/backup_snapshot.ps1 -Label "before_capcut_style_text_inspector_and_analysis_edit_ux"` -> **PASS (`[BACKUP OK] Copied 16 core files to .backups/20261016-164409-before_capcut_style_text_inspector_and_analysis_edit_ux`)**.
- `powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/verify_project.ps1` -> **PASS (`All JS/CJS files passed syntax check`, `All Python modules passed py_compile`, `Ran 5 tests in 3.720s - OK`, `All Project Health & Regression Checks PASSED`)**.
- `python -m unittest test_studio.StudioTests.test_video_text_inspector_11_typography_parameters_persist_and_render` (in `downloader/`) -> **PASS (`Ran 1 test in 3.099s - OK`)**.
- `python -m unittest test_studio_text_clean.TextCleanTests.test_capcut_11_typography_features_render_in_pillow` (in `downloader/`) -> **PASS (`OK`)**.
- `powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/backup_snapshot.ps1 -Label "before_carousel_workbench_image_paste_and_cover_hook_formulas"` -> **PASS (`[BACKUP OK] Copied 16 core files to .backups/20261016-161159-before_carousel_workbench_image_paste_and_cover_hook_formulas`)**.
- `python -m unittest -v test_studio -k "test_carousel"` (in `downloader/`) -> **PASS (`Ran 3 tests in 9.241s - OK`, including `test_carousel_cover_hook_formulas_and_slide_photo_paste_and_3tier_text`, `test_carousel_story_draft_and_3part_cover_body_cta_generation`, and `test_carousel_and_media_text_edit_erase_mode_none_preserves_original_frame`)**.
- `python -m unittest test_studio.StudioTests.test_video_subtitle_erase_modes_blur_cover_inpaint_mask_and_zoom test_studio.StudioTests.test_carousel_and_media_text_edit_erase_mode_none_preserves_original_frame` (in `downloader/`) -> **PASS (`Ran 2 tests in 8.001s - OK`)**.
- `python -m unittest discover -s downloader -p "test_studio.py" -k "test_carousel_story_draft_and_3part_cover_body_cta_generation"` -> **PASS (`Ran 1 test in 1.618s - OK`)**.
- `python -m unittest discover -s downloader -p "test_studio_text_clean.py"` -> **PASS (`Ran 5 tests in 3.720s - OK`, including `test_capcut_11_typography_features_render_in_pillow` and `test_expanded_korean_fonts_double_stroke_and_box_radius`)**.
- `node --check` on `studio-browser/threads-research-extract.js`, `studio-browser/threads-research.cjs`, `downloader/studio_web/threads-research-ui.js`, `downloader/studio_web/workspace.js`, `downloader/studio_web/studio.js`, `downloader/content-studio.js`, `studio-browser/main.cjs` -> **PASS**.
- `node studio-browser/test_threads_research_media.cjs` -> **PASS (`media gate, pending previews, reply exclusion, exact/visual grouping, highest-view representative, separate override, distinct carousel protection`)**.
- `node verify_threads_research_upgrade.cjs` -> **PASS (`deep metrics/media capture, daily account sync + detail view enrichment, and read-only API token store`)**.
- `node studio-browser/test_clip_split.cjs` -> **PASS (`Clip discovery and creator tabs separated; uploads use creator; profile/viewer stays discovery`)**.
- `python -m unittest discover -s downloader -p "test_studio.py" -k "test_magazine_carousel_8_themes_slide_actions_and_video_png_overlay" -v` -> **PASS (`OK` in 8.95s)**.

### Real Browser & Rendered Showcase Verification
- **`02-A 미디어(영상) 편집` — Click-to-Edit Unified Text Inspector (`#capcut-text-inspector`: Layer Switcher, Text Input, 8 Preset Styles, 25 Fonts + Custom Font, Pattern `[B 굵게 / I 기울임 / U 밑줄]`, Alignment `[좌측 / 가운데 / 우측]`, Font Size `px`, Scale `%`, Opacity `%`, Letter Spacing `px`, Line Spacing, Color Swatches & Background Box, and 1st/2nd Double Stroke)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02a_capcut_text_inspector_title.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02a_capcut_text_inspector_subtitle.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02a_tab2_erase_mask_zoom.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_01_analysis_step123_clean.png`
- **`02-B 캐러셀·뉴스카드 편집` — 1st-Slide 90% Cover Hook Formula Bar (`질문형`, `숫자·공식형`, `반전·통념파괴형`, `손실회피·비교형`, `단도직입·비결형`), Canva-Style `+ 슬라이드 추가` Storyboard Filmstrip, and Structured Bottom Slide Workbench (`1. 사진 수정 [이미지 추가 · Ctrl+V 복사 붙여넣기]`, `첫 장 90% 후킹 공식`, `2. 제목`, `3. 부제목`, `4. 본문 텍스트 추가`)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02b_cover_hook_formulas_top.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02b_bottom_workbench_photo_title_subtitle_body.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02b_workbench_4steps_detail.png`
- **`02-A 미디어(영상) 편집` — Subtitle Erase Modes (`원본 유지`, `흐림(블러)`, `덮어씌우기`, `완전 삭제`), Interactive Mask Region (`STEP B`), and Video Zoom (`STEP C` `116% 확대`)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02a_erase_mask_zoom_blur.png`
- **Compact Preview Width (`310px` Left Column / `280px` Player & Slide Canvas / `1162px` Right Workbench) Across `01 영상·소재 분석`, `02-A 미디어 편집`, and `02-B 캐러셀 편집`**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_narrow_preview_01_analysis.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_narrow_preview_02a_editing.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_narrow_preview_02b_carousel.png`
- **`02-B 캐러셀·뉴스카드 편집` Pre-Production AI Engine/Model Selector Bar (`STEP 0` `Gemini API / gemini-2.5-flash`) & Auto-Populated 3-Part Story Panel (`01 표지`, `02~03 본문`, `04 마지막장 CTA` automatically filled from video analysis)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02b_carousel_ai_story_auto_top.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02b_carousel_ai_story_and_workbench.png`
- **`01 영상·소재 분석` Guided Workflow & Pre-Analysis AI Engine/Model Selector Bar (`STEP 0` Provider/Model Selector `Gemini API / gemini-2.5-pro`, Scope Pill `음성(내레이션) + 영상 프레임 통합 분석`, 3-Step Overview Strip, and `STEP 1`~`STEP 4` Cards)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_01_analysis_ai_model_bar_ux.png`
- **`02-A` Media Editing Studio (25+ Categorized Korean Fonts + `[+ 내 폰트 추가 (.ttf/.otf)]`, Box Corner Radius Sliders `34px`/`42px`, and 1st/2nd Double-Stroke Outline Sliders & Color Pickers with Live Preview)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_fonts_radius_double_stroke_02a.png`
- **`02-B` Carousel Studio Workbench (Per-Slide Font Selector + `[+ 내 폰트]` Upload + 1st/2nd Double-Stroke Sliders & Color Pickers)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_fonts_double_stroke_02b_workbench.png`
- **Wide `02-A` Media Editing Studio (NLE Filmstrip/Waveform Scrubber `00:00:04:14`, Carousel Replace Button Hidden, Title Font Size Slider `54px -> 92px` Scaling Preview from `25.5px -> 43.4px`, and Mobile Live Preview Hidden)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_wide_02a_nle_and_font_slider.png`
- **Wide `02-B` Carousel Studio (Large `410px × 513px` Active Slide Preview Canvas, NLE Scrubber with `[현재 시점으로 캐러셀 슬라이드 배경 교체]` Button Visible, and Mobile Live Preview Hidden)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_wide_02b_large_carousel_preview.png`
- **`03 대본·게시문` Stage (Left `실시간 미리보기 모바일 게시 화면` Automatically Shown)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_03_writing_with_mobile_preview.png`
- **Threads Shopping Account & Video Reference Discovery UI (Clarified Naming, Media + Views/Likes/Replies/Reposts Cards, Daily Account Sync Controls, and Read-Only Threads API Collector)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_threads_research_accounts_and_api_ui.png`
- **8 Distinct `body` Slide Architectural Layouts Showcase (`editorial_dark`, `magazine_gradient`, `clean_white`, `highlight_hook`, `mint_modern`, `warm_luxury`, `neon_pop`, `minimal_outline`)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_8_distinct_body_layouts_showcase.png`
- **Pro Studio Monochrome UI, Fixed Horizontal Frame Buttons (`+ 첨부 추가` / `슬라이드 배경`), and Optimized `02-B` Carousel Workbench UX**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_fixed_frames_buttons_and_pro_ui.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_pro_carousel_workbench_ux.png`
- **8-Direction Title Box Resize, Font Family (`brush_kr` / `serif`), `px` Font Size (`68px` / `48px`), Scrubber Frame Capture (`1.40s`), `Ctrl+Z` Undo, and `F5` Reload State Preservation**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_title_box_resize_font_px_and_scrubber.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_after_f5_reload_preserved.png`
- **Cover (`메인 표지`) vs Body (`본문 포인트`) vs CTA (`마지막 요약·전환`) Role Comparison Showcase**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_carousel_cover_body_cta_roles_showcase.png`
- **Separated Studios Live Browser Verification (`01` Dual Track Chooser, `02-A` Media Editing Studio, `02-B` Carousel Workbench & Storyboard Deck)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_stage01_dual_track_chooser.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_stage02a_media_editing_studio.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_stage02b_carousel_workbench_cover.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_stage02b_carousel_workbench_body_and_deck.png`
- **Native Aspect-Ratio Player Stage & Safe-Zone Guide Alignment (`702×1062` vertical video rendered at `366px × 554px`, matching `#analysis-player-stage` `368px × 557px` with zero sidebars)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_vertical_player_native_ratio_safezone.png`
- **Draggable Title & Subtitle Overlay Box Shape Stability (`322.4px × 101.9px` invariant across center, right, left, and bottom positions)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_drag_title_box_center_fixed.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_drag_title_box_right_edge_fixed.png`
- **Source Hub Sub-Navigation & Global Button Spacing Audit (`AUDIT ISSUES FOUND: 0` across all 9 workspaces)**:
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_source_subnav_buttons_spaced.png`
  - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_create_top_actions_spaced.png`
- **Tight Text Box Padding (`박스 테두리·폰트 사이 간격 축소`) & Optional Background Box Checkbox (`배경 박스 사용` 체크/해제)**:
  - `downloader/studio_text_clean.py`, `downloader/studio_web/index.html`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`
  - Reduced live preview chip padding (`4px 10px 5px`) and normalized legacy default `box_w=84` to `0` (`자동 fit-content`) so short text like `"왜 안넘어져?"` wraps tightly (`154px × 84px` instead of stretching across `84%` of the frame).
  - Reduced Pillow/FFmpeg box padding (`pad_x = max(14, int(f_px * 0.34))`, `pad_y = max(9, int(f_px * 0.22))`) and added `_draw_optional_box_for_text` so checking `배경 박스 사용` draws a tight-fitting background card on any preset, and unchecking `배경 박스 사용` (`overlay_bg=False`) renders a 100% transparent background with only the text and 1st/2nd stroke outlines (`146px × 79px`, `.no-bg-box`).
  - Screenshots:
    - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02a_tight_box_checked.png`
    - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_02a_tight_box_unchecked.png`
- **All 25 Korean Studio Fonts Full WebFont (`@font-face`) & Backend Pillow Resolution Fix (`글꼴 25종 전체 실시간 미리보기·입력창·렌더링 완벽 적용`)**:
  - `downloader/studio_text_clean.py`, `downloader/studio.py`, `downloader/studio_web/studio.css`, `downloader/studio_web/studio.js`
  - Fixed broken inline HTML `style="...font-family:..."` quote escaping in `syncDraggableOverlayCanvas()` (`tFontCss.replace(/"/g, "'")`) where double quotes inside `CSS_FONT_MAP` prematurely closed the inline `style` attribute on `#drag-title-text` inner `<div>` elements.
  - Mapped all 25 UI font keys (`heavy_kr`, `black_han_sans`, `gasoek_one`, `do_hyeon`, `jua`, `bagel_fat_one`, `hy_headline`, `hy_gothic_extra`, `pyeongchang_peace_bold`, `sans`, `gowun_dodum`, `orbit`, `malgun_regular`, `gulim_clean`, `serif`, `batang_kr`, `hy_myeongjo_extra`, `hy_sin_myeongjo`, `brush_kr`, `gungseo_kr`, `hy_gungseo_bold`, `magic_kr`, `hy_mokgak`, `yet_hangul`, `pyeongchang_regular`) to distinct TTF/TTC font files in both `STUDIO_FONT_CATALOG` / `_load_korean_font()` and `@font-face` (`StudioFont_<key>`) with `document.fonts.check` returning `true` for all 25 fonts.
  - Applied live font family styling to `#inspector-font-select`, `#inspector-text-input`, and `02-B` `#wb-active-font-select` / `#wb-active-text-input` so the user immediately sees the chosen font in the selector, text input box, and video/carousel canvas.
  - Screenshots:
    - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_font_01_bagel_fat_one.png`
    - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_font_02_brush_nanum_pen.png`
    - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_font_03_hy_myeongjo_extra.png`
    - `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_font_04_gasoek_one.png`
- **8 Canva 1:1 Card News Layouts Showcase**:
  `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_8_canva_editorial_layouts_showcase.png`
- **6 Korean Viral Video Hook Templates Showcase**:
  `C:\Users\hynihk\.gemini\antigravity\brain\1c9155c0-dfe9-4a1f-9388-40354814a3c7\screenshots\verify_6_video_hook_templates_showcase.png`

