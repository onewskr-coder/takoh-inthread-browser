# 버튼 위치 개선 — 3.1.9 (2026-10-08)

기존 다운로드 오버레이를 Threads, Instagram, Facebook, TikTok, YouTube Shorts, X, Pinterest, Douyin, Xiaohongshu, Naver Clip/review, Coupang review/gallery, Reddit, 1688의 실제 미디어 요소에 연결했다. YouTube 일반 영상의 기본 액션 바 버튼 및 쿠팡 갤러리의 전체 선택/ZIP 도구는 원래 도구 영역을 유지한다.

공통 배치는 보이는 미디어와 스크롤/클리핑 경계의 교집합을 사용한다. 상단 왼쪽을 우선하며, 네이티브 버튼/선택 상자 또는 다른 다운로드 그룹과 겹치면 상단 오른쪽 또는 다음 상단 행을 선택한다. 너비 240px 미만에서는 텍스트를 접고 아이콘·툴팁·접근성 이름을 유지한다. 화면 밖, 제거된 미디어 및 충분한 공간이 없는 카드에서는 버튼을 숨긴다. 원래 플랫폼 컨테이너를 유지해 중복 주입 검사와 다운로드 추출 경로를 보존한다.

## 확인된 증거

- 실제 Threads 피드: 가로 갤러리 사진의 DOM 경계 측정. Pinterest 상세: video와 재생/음소거/최대화 등 UI 확인. 이번 확인 브라우저에는 TAKOH 확장이 로드되지 않았으므로 설치 확장의 변경 결과는 아니다.
- 로컬 Chromium 브라우저: 실제 content-core.js/content.css로 닫기 버튼 회피, 좁은 영상 아이콘, 캐러셀 클리핑, 큰 게시물 내부 영상 기준 배치를 렌더링하고 좌표/스크린샷 확인. `scratch/overlay_positions_3.1.9.png`.
- `test_overlay_positions.js`: 네 가지 오버레이 계열의 좌표 기준, 네이티브 조작 버튼 회피, 작은 영역, 화면 밖, fixed 컨트롤, 미디어 제거 검증.
- core, Threads feed/click, review media, Pinterest, content image 회귀 테스트 통과 및 전체 content script JavaScript 문법 검사 통과.

## 실사이트 검증의 제한

- Instagram, X, Facebook, Naver Clip: 현재 브라우저에서 로그인 필요.
- Reddit: 사람 확인 화면. TikTok: 대기 화면.
- YouTube, Douyin, Xiaohongshu, Coupang 상품 페이지: 접근 상태 확인. 설치 확장 버튼의 위치/클릭은 미검증.
- Smartstore 및 1688: 브라우저 접근 정책으로 차단. 우회하지 않았다.
- 접근 검사 기록: `scratch/overlay_live_access_3.1.9.json`.

이번 변경은 버튼 위치와 실제 버튼 클릭 처리이다. 전 플랫폼의 파일 다운로드·음성 포함·원본 일치 성공을 입증하는 검증은 아니다.
