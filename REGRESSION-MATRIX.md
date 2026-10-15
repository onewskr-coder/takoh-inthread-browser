# 회귀 검증 매트릭스 (REGRESSION-MATRIX.md)

작성일: 2026-10-15 (한국시간)  
기준 커밋: `55cd118`  
검증 상태: **전체 139개 Python 테스트 100% 통과 + Node.js 5개 회귀 스위트 100% PASS**

---

## 1. 현재 실행 경로 표

| 구성요소 | 역할 | 실제 경로 / 포트 | 검증 상태 |
|---|---|---|---|
| **실행 스크립트** | 단일 진입점 | `start-browser.bat` | [R] 검증 완료 |
| **Electron Main** | 데스크톱 셸 | `studio-browser/main.cjs` | [S, U] 구문/종료 테스트 PASS |
| **도우미 매니저** | 백엔드 라이프사이클 관리 | `studio-browser/helper-manager.cjs` | [U] `spawnedByMe` 포트 5006 통제 PASS |
| **도우미 백엔드** | Python Flask 앱 | `downloader/app.py` (포트 5006) | [U] 139개 테스트 PASS |
| **기존 Chrome 도우미** | 별도 확장 연동 | 포트 5005 | **소유권 분리 보존** |
| **스튜디오 프론트** | 제작/발견 웹 UI | `downloader/studio_web/` | [S, U] 구문/JSDOM PASS |
| **사용자 영구 데이터** | SQLite 및 자격증명 | `%LOCALAPPDATA%\ONEWS\studio\` | [R] 무손실 보존 확인 |
| **브라우저 프로필** | 쿠키 및 캐시 | `%APPDATA%\takoh-studio-browser` | [U] 쿠키 플러시 검증 PASS |

---

## 2. 유지할 핵심 동작 및 검증 결과

| 분류 | 기능 ID | 유지해야 할 동작 설명 | 검증 스위트 | 상태 |
|---|---|---|---|---|
| **실행** | RUN-01 | `start-browser.bat` 1회 실행으로 브라우저와 도우미 5006 정상 연결 | `test_shutdown.cjs` | **PASS** |
| **실행** | RUN-02 | 창 닫기 시 쿠키 플러시 및 잔여 PID 없이 완전 종료 | `test_shutdown.cjs` | **PASS** |
| **수집** | COL-01 | Threads, Instagram, Pinterest 콘텐츠 수집 및 중복 방지 | `test_studio_reference_flow.js` | **PASS** |
| **수집** | COL-02 | 채널별 숏폼 수집 (180초 이하, 조회수 내림차순, 중복 방지) | `test_discovery_features.py` | **PASS** |
| **보관** | ARC-01 | 수집 레퍼런스와 독립 보관함(`saved-references`) 분리 보존 | `test_discovery_features.py` | **PASS** |
| **보관** | ARC-02 | 레퍼런스 개별 삭제 및 전체 삭제 시 보관함/원본 보존 | `test_studio_reference_flow.js` | **PASS** |
| **분석** | ANL-01 | FFmpeg 기반 영상 6개 대표 프레임 및 음성 추출 | `test_studio.py` | **PASS** |
| **분석** | ANL-02 | 관찰 근거 기반 프레임 분석 및 대본 생성 연결 | `test_studio.py` | **PASS** |
| **상품** | PRD-01 | SerpAPI 쇼핑 검색 및 쿠팡 HMAC 딥링크 생성 | `test_studio_integrations.py` | **PASS** |
| **상품** | PRD-02 | 상품 저장 시 작성 중인 초안(Draft) 보존 | `test_studio.py` | **PASS** |
| **게시** | PUB-01 | 다중 미디어 개수·크기·존재 사전 검증 (누락 시 차단) | `test_threads_upload.cjs` | **PASS** |
| **게시** | PUB-02 | 게시 완료 및 첫댓글 부모 관계 엄격 검증 | `test_studio_upload_verification.js` | **PASS** |
| **설정** | SET-01 | 카드 기반 API 설정, KIE 연동 및 DPAPI 암호화 보관 | `test_studio_kie_dom.js` | **PASS** |

---

## 3. 전체 테스트 현황 (139개 Python 테스트 전수 통과)

| 테스트 파일 | 테스트 개수 | 결과 | 비고 |
|---|---|---|---|
| `downloader/test_studio.py` | 44개 | **44 통과 (OK)** | 영상 분석, 초안, 제휴, 게시 준비 회귀 통과 |
| `downloader/test_discovery_features.py` | 19개 | **19 통과 (OK)** | 캐시 v5 일치, 채널 숏폼 수집, SerpAPI 회귀 통과 |
| `downloader/test_discovery_filter_repair.py` | 9개 | **9 통과 (OK)** | 쇼핑 쇼츠 태그/카테고리/성장률 통과 |
| `downloader/test_gemini_discovery.py` | 8개 | **8 통과 (OK)** | Antigravity 스트림 델타 누적/모의 이벤트 통과 |
| `downloader/test_studio_ai.py` | 16개 | **16 통과 (OK)** | 다중 모델 및 스타일 영속성 통과 |
| `downloader/test_studio_integrations.py` | 14개 | **14 통과 (OK)** | 쿠팡 검색 정밀 쿼리 및 HMAC 서명 통과 |
| `downloader/test_studio_writing.py` | 29개 | **29 통과 (OK)** | JSON 추출 및 대본 프롬프트 감사 통과 |
| **합계** | **139개** | **139개 통과 (100%)** | **Ran 139 tests in 85.190s, OK** |
