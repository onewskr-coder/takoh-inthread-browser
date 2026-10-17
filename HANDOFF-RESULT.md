# HANDOFF-RESULT.md — Latest Bounded Task Summary (2026-10-17 · 22 Authentic Korean News-Card Main Cover Templates Overhaul + Large Clean Canvas Preview + Anti-Truncation Headline Formatter)

## 1. Scope & Root Cause Fixed
1. **User Request**:
   - *"메인표지 템플릿이 내가 준 소스가 정말 많은데, 하나의 이미지에 다양한 메인표지 디자인이 들어있는걸 구현해줘야지. 정말 간단한한 것만 해주면 어떻게 지금 되어있는건 5번을 제외하고 1~4번은 숏폼 영상용 템플릿이고 뉴스카드 템플릿이 아니야. 정말 모르겠으면 서칭해서 찾아서 만들어줘. 20개 넘게 만들어줘도 되니까 천천히 신경써서 만들어줘. 지금 더 이상해졌잖아. 너무 작아서 확인이 안되는거야?"*
2. **Root Causes Identified**:
   - Previously, `cover_02`..`cover_04` used short-form video overlay layouts (giant yellow/pink text bars) rather than the Korean Canva/MiriCanvas news-card cover designs shown in the user's two uploaded multi-card reference grids (`media_1792207646111_e27201b9.jpg` and `media_1792207646122_0cb266db.jpg`).
   - Hard character slicing of raw video transcripts left dangling mid-sentence fragments like `"위에 그냥 두자니 지저분하고 매번 서랍에"` or `"식탁 위에 그냥"` on the cover headline.
   - The center preview card had a persistent bright blue selection rectangle + 6 resize handles + `×` delete button drawn over the headline even when not hovering/dragging, and the center preview frame needed to be larger and unobstructed.
3. **Fixes Implemented**:
   - **[`downloader/studio_web/studio.js`](downloader/studio_web/studio.js)**:
     - Replaced the old short-form video covers and expanded `COVER_PRESET_IDS` from 5 to **22 authentic Korean News-Card Main Cover Templates (`cover_01` ~ `cover_22`, total 37 templates across Cover 22 · Body 10 · CTA 5)** modeled 1:1 after the user's two reference grids:
       1. `cover_01_cinema` — 무비 리뷰 시네마 (`movie review` 코랄 배지 + 볼드 화이트 제목 + 별점 5개)
       2. `cover_02_magazine` — 민트 화살표 카페 썸네일 (`FOR SOCIAL MEDIA` + `*민트 화살표 1열 →*` + 화이트 대형 2열 + 하단 라인)
       3. `cover_03_top_hook` — 코스 배지 로컬 감성 스팟 (상단 화이트 라운드 코스 캡슐 + 하단 좌측 화이트 2단 볼드 훅)
       4. `cover_04_gallery_ticket` — 에디토리얼 프레임 데일리 꿀팁 (화이트 외곽 보더 프레임 + 카테고리 태그 + 좌측 타이틀 + `|` 수직 요약바)
       5. `cover_05_review_window` — 구매 고객 별점 후기 윈도우 (`● ● ● 구매 고객 후기` 화이트 브라우저 창 + 별점 5개 `[BEST]` + 상세 리뷰 카드 + 하단 3칸 미니 썸네일)
       6. `cover_06_clean_purple_badge` — 퍼플 캡슐 배지 & 노하우 (`@studio.official` + 퍼플 라운드 배지 + 2줄 화이트 타이틀)
       7. `cover_07_dark_header_band` — 상하 다크 밴드 뉴스레터 (`뉴스레터 VOL.1` 상단 다크 헤더 + 중앙 와이드 사진 + 하단 다크 시트 + `@studio.official →` 캡슐)
       8. `cover_08_diagonal_navy_sheet` — 하단 다크시트 비주얼 카드뉴스 (상단 58% 사진 + 하단 44% 다크 시트 + 골드 바 + 영문 키커 & 2줄 화이트 타이틀)
       9. `cover_09_blue_gradient_3d` — 블루 그라데이션 3D 썸네일 (로열블루 배경 + 화이트 이너 프레임 + 말풍선 배지 + 중앙 라임/화이트 타이틀 + 하단 `자세히보기 →` 캡슐 버튼)
       10. `cover_10_frosted_bottom_tags` — 반투명 다크카드 & 라임 해시태그 (상단 65% 사진 + 하단 반투명 차콜 오버레이 + 2줄 화이트 타이틀 + 형광 라임 `#핵심요약 #실사용검증` 캡슐)
       11. `cover_11_editorial_news_bracket` — `[NEWS]` 매거진 브래킷 & 블랙 라벨 (상단 `[ NEWS ]` 헤더 & 구분선 + 하단 블랙 캡슐 배지 + 2줄 화이트 타이틀)
       12. `cover_12_workspace_pick_arrow` — 화이트 픽 배지 & 워크스페이스 (상단 화이트 캡슐 `Editor Pick` + 상단 2줄 화이트 타이틀 + 하단 요약 & 원형 `≫` 버튼)
       13. `cover_13_2x2_grid_collage` — `NEW DROP` 감성 그리드 & 크림 하단바 (2×2 매거진 십자 그리드 라인 + 상단 중앙 `NEW DROP` 타이틀 + 하단 크림 베이지 요약바)
       14. `cover_14_vertical_line_picnic` — 좌측 수직선 & 옐로우 `TOP 3` (상단 좌측 화이트 수직 보더 바 + 키커 + 옐로우/화이트 3줄 대형 `TOP 3` 타이틀)
       15. `cover_15_arched_window_travel` — 다크 라운드 창문 프레임 (`BEST 3`) (다크 차콜 매트 배경 + 골드 보더 라운드 창문 액자 + 레드 포인트 배지 + 중앙 2줄 타이틀 + 해시태그 바)
       16. `cover_16_white_poster_circle` — 화이트 포스터 & 레드 서클 (`JAPAN` 스타일) (화이트 포스터 지면 + 상단 초대형 네이비 타이틀 + 레드 원형 포인트 + 중앙 라운드 사진 + 하단 요약 박스)
       17. `cover_17_split_selfcare_pill` — 상하 분할 프레임 & 중앙 화이트 캡슐 (`Self care` 스타일) (상하 사진 분할선 + 정중앙 화이트 타원 캡슐 타이틀 + 다크 서브 캡슐)
       18. `cover_18_luxury_popup_serif` — 럭셔리 세리프 포스터 (`POP-UP STORE` 스타일) (`1st Special Edition` + 중앙 대형 타이틀 + 상하 라인 사이 `BEST PICK · 100% VERIFIED` + 요약)
       19. `cover_19_bottom_3hashtags_dark` — 다크 감성 & 하단 3대 해시태그 칩 (중앙 좌측 대형 3줄 화이트 타이틀 + 설명 문구 + 하단 화이트 해시태그 바)
       20. `cover_20_minimal_white_bookmark` — 미니멀 화이트 북마크 & 우측 하단 액자 (클린 오프화이트 지면 + 상단 좌측 다크 북마크 아이콘 + 3줄 차콜 타이포 + 우측 하단 미니 사진 액자)
       21. `cover_21_white_ticket_card` — 화이트 보더 티켓 액자 (`FLY TO SEOUL` 스타일) (블러 배경 + 중앙 화이트 라운드 티켓 카드 + 상단 티켓 내부 사진 & 훅 + 하단 블루 타이틀)
       22. `cover_22_notebook_torn_memo` — 스프링 노트 하이라이트 `BEST 5` (모눈/파스텔 배경 + 상단 라운드 사진 + 하단 화이트 줄노트 메모지 카드 + 핀 배지 + 옐로우 형광펜 박스 타이틀)
     - Added `stripDanglingKoreanEnding`, `formatTwoLineNewsCardHeadline`, `formatThreeLineNewsCardHeadline`, and `_rawSubtitleBase` preservation so cover headlines never break mid-sentence.
   - **[`downloader/studio_web/studio.css`](downloader/studio_web/studio.css)**:
     - Enlarged `.carousel-wb-preview-col .wb-large-center-frame` (`max-width: min(100%, 640px)`, `max-height: 800px`) and `.canva-tpl20-grid` (`max-height: 300px`).
     - Hid the selection border/handles on `.canva-object-node.is-selected-object` until hovered or dragged so the live stage preview always looks clean and unobstructed.

## 2. Verification Evidence (Separated by Category)
- **Static & Unit Tests**:
  - Ran `.agents/skills/safe-backup-and-verify/scripts/verify_project.ps1`:
    - Node/Electron JS & CJS syntax checks (`node --check`): **PASS**
    - Python syntax compilation (`py_compile`): **PASS**
    - Core Node & Python unit tests (`test_clip_split.cjs`, `test_threads_research_media.cjs`, `test_studio_text_clean.py`): **PASS (5 tests in 4.176s)**
- **Real Browser / Electron UI & High-Res 1080×1350 Card Verification**:
  - Rendered all 22 Main Cover templates (`cover_01`..`cover_22`) in headless Electron (`verify_22_covers.cjs`) and visually inspected the full-resolution contact sheets (`verify_22_covers_sheet1.jpg`, `verify_22_covers_sheet2.jpg`), individual 1080×1350 cover exports (`verify_22_single_cover_*.jpg`), and close-up stage screenshot (`verify_22_covers_stage_closeup.png`).
- **Saved Media / Audio / Paid Provider / Distribution**:
  - User profiles (`%APPDATA%\takoh-studio-browser`), saved references/jobs (`%LOCALAPPDATA%\ONEWS\studio`), and running helper processes on port `5006` were preserved untouched.
