# 배포 준비 진행 상태 (RELEASE-PROGRESS.md)

- 최종 갱신: 2026-10-15 (한국시간)
- 기준 커밋: `55cd118` (Document staged release readiness plan and regression gates) + `f28e2a8` (19개 개선) + 로컬 안정화 수정
- 실행 빌드: 커밋 동적 감지 (`_resolve_build_info()`), 로컬 변경 있음(`is_dirty: true`)
- 전체 기준 문서: [`RELEASE-READINESS-PLAN.md`](file:///C:/Users/hynihk/Documents/TAKOH_Media_Downloader_PRO/github-handoff/takoh-inthread-browser/RELEASE-READINESS-PLAN.md) (12단계 A~L 체계)

---

## 1. A~L 12단계 진행 및 합격 현황 요약

> **증거 종류 범례**: **S** (정적 코드·구문), **U** (격리 단위/모의/DOM 테스트), **R** (로컬 서버·파일·프로세스 실측), **V** (실제 앱 화면 조작·렌더), **E** (새 콘텐츠 전체 흐름), **D** (클린 PC 배포본 검증)
> **상태 구분**: 조기 완료·100% 단정을 금지하고, 실제 플랫폼/외부 계정 조작이 없는 항목은 **‘구현·격리 검증 완료 / 실제 검증 대기’**로 엄격히 구분함.

| 단계 | 원문 명칭 및 범위 | 상태 | 증거 | 실패·미검증 및 제한 사항 |
|---|---|---|---|---|
| **단계 A** | **실행 기준점과 회귀 목록 확정** | **합격 (PASS)** | S, U, R | 운영 5005 포트 종료 금지, 고정 PID 배제, 동적 빌드 상태 노출 완료 |
| **단계 B** | **게시·삭제의 데이터 무결성 확보 (최우선)**<br>(B1 다중첨부 / B2 판정 / B3 경합) | **구현·격리 완료<br>/ 실제 검증 대기** | S, U, R | **B1**: 10개 초과/404/0B/30MB/HTML오류 차단 완료 (완전 프레임 디코딩은 한계로 명시).<br>**B2**: 과거 링크 오인 차단 완료 (실제 Threads 게시 대기).<br>**B3**: 탭 응답 역전 및 삭제 범위 고정 완료. |
| **단계 C** | **실행·종료·재시작·저장 안정성** | **구현·격리 완료<br>/ 장기 실측 대기** | S, U, R | 정상 쿠키 플러시, 중복 프로세스 락, 창 숨김 프로세스 생성 확인 (연속 3회 재부팅 장기 실측 대기). |
| **단계 D** | **API·계정 설정 UX 완성** | **구현·격리 완료<br>/ 실제 검증 대기** | S, U, R, V | KIE/Gemini/Codex 카드 설정, DPAPI 암호화, 키 마스킹 확인 (실제 유료 크레딧 차감 미검증). |
| **단계 E** | **수집·파일·보관함 실제 흐름** | **구현·격리 완료<br>/ 플랫폼 실측 대기** | S, U, R | Threads/Instagram/Pinterest 다운로드 회귀 4건 전수 해결 (실제 로그인 세션 내 실시간 3개 플랫폼 UI 클릭 실측 대기). |
| **단계 F** | **콘텐츠 발견·채널·검색 비용 통제** | **구현·격리 완료<br>/ 쿼터 실측 대기** | S, U, R | SQLite v5 스키마, 성장량/배수 계산 분리, 중복 수집 방지 확인 (실제 YouTube/SerpAPI 쿼터 소모 실측 대기). |
| **단계 G** | **분석·초안·편집·상품 연결**<br>(G1 분석초안 / G2 편집 / G3 상품제휴) | **구현·격리 완료<br>/ 실제 모델 호출 대기** | S, U, R | **G1**: 상품명 변경 시 초안 보존 + `needs_review` 배너 안내 완료.<br>**G2**: FFmpeg 오프라인 처리 확인.<br>**G3**: 쿠팡 딥링크 보존 확인 (실제 비전 API 호출 대기). |
| **단계 H** | **게시 준비·예약·복구 실측** | **구현·격리 완료<br>/ 사용자 승인 대기** | S, U, R | 큐 스케줄러, 크래시 복구(uncertain), 수동 확인 버튼 확인 (사용자 승인 하의 실제 1회 공개 게시 대기). |
| **단계 I** | **배포 보안·개인정보·지원 범위** | **진행 중 (IN PROGRESS)** | S, U | DPAPI 암호화, 로그 마스킹, localhost 바인딩 점검 (외부 통신 전수 감사 및 취약점 검증 잔여). |
| **단계 J** | **재현 가능한 설치·배포 후보 제작** | **대기 (PENDING)** | - | B~I 단계 배포 차단 해결 후 단일 배포본 빌드 예정 (조기 패키징 금지). |
| **단계 K** | **깨끗한 PC 설치·업데이트·복구 검증** | **대기 (PENDING)** | - | 가상머신(VM) 또는 클린 Windows 환경 실측 필요. |
| **단계 L** | **비공개 베타와 공개 배포 판단** | **대기 (PENDING)** | - | 11개 항목의 출시 차단 체크리스트 최종 검증 대기. |

---

## 2. 세부 단계별 구현 및 검증 결과

### [단계 A] 실행 기준점 및 시스템 빌드 동적 노출
- **구현 내용**:
  - `downloader/studio.py` 내 `commit_id='55cd118'`, `is_dirty=True` 하드코딩 제거.
  - `_resolve_build_info()`를 통해 `git rev-parse --short HEAD` 및 `git status --porcelain`을 동적으로 실행하여 실제 실행 파일의 커밋과 변경 상태를 획득. Git이 없는 패키징 환경 대비 예외 시 `'확인 불가'` 문자열 반환 fallback 구현.
  - `downloader/studio_web/studio.js` 시스템 정보 렌더링에서 `is_dirty` 상태 레이블 안전 처리.
- **검증 결과 (S, U, R)**:
  - Python 139개 테스트 통과, `/studio/connections-status` 응답에 동적 빌드 정보 반환 확인.

### [단계 B] 게시·삭제 데이터 무결성 확보 (P1 이슈 3종)
1. **B1: 다중 첨부 사전 검증 (`studio-browser/threads-upload.cjs`)**:
   - **순서 및 개수**: `payload.files`를 0번 인덱스부터 순차 직렬 로드하여 `loadedFiles` 배열에 순서 보존.
   - **개수 한도**: 캐러셀 10개 초과 시 즉시 차단 (`throw new Error('캐러셀 미디어가 10개를 초과하여...')`).
     * *기준 출처*: Meta Threads/Instagram 공식 플랫폼 캐러셀 업로드 제한(최대 10개)에 부합.
   - **크기 상한 (30MB)**:
     * *기준 출처*: Meta 공식 API 제한(비디오 300MB, 이미지 8MB)과 달리, **Electron 브라우저 DOM Base64 인라인 인젝션 시 렌더러 메모리 고갈 및 IPC 크래시를 방지하기 위해 마련한 앱 내부의 안전 가드레일(내부 기준)**임을 명시.
   - **형식 및 손상 검증 (`inspectMediaBuffer`)**:
     * 빈 파일(0 byte) 및 30MB 초과 차단.
     * 서버 에러 HTML 페이지(예: 404/500이 200 OK로 반환되는 비정상 응답)를 매직 헤더(HTML doctype/html 태그)로 검출하여 `HTML 오류 응답으로 손상` 에러로 차단.
     * *손상 검증의 한계*: 현재 검사는 바이트 크기 및 컨테이너/HTML 헤더 수준의 무결성 검증이며, 비디오 프레임 전체 디코딩(Bit rot, 프레임 깨짐)까지 확인하는 완전한 손상 검증은 아니라는 점을 한계로 명시함.
   - **검사 후 파일 변경 상황 방지 (TOC/TOU)**:
     * 다운로드 시점에 메모리 버퍼에 고정 적재하고 Base64로 즉시 변환하여 페이로드에 동결하므로, 디스크 파일이 이후 변경되어도 검증된 동일 바이트가 주입됨.
   - **검증 결과 (U)**:
     * `node studio-browser/test_threads_upload.cjs` 통과 (부분 캐러셀 실패 차단 + HTML 손상 차단 통과).
2. **B2: 게시 완료·댓글 판정 엄격화 (`downloader/studio-upload.js`)**:
   - `oldLinks` 및 `oldPostIds` 배제 스냅샷 유지로 과거 게시물 오인 원천 차단.
   - 새 게시물 탐색 시 계정명(`matchesAccount`), 본문 3중 분할 매칭(`matchesFullBody`), 타임스탬프(`isStaleTimestamp`) 검증.
   - **검증 결과 (U)**:
     * `node downloader/test_studio_upload_dom.js` 통과 (동일 24자 접두사 과거 글 및 타 계정 배제, 실제 새 글 ID 적중 입증).
3. **B3: 수집/보관함 탭 전환 경합 및 삭제 범위 고정 (`downloader/studio_web/studio.js`)**:
   - `referenceLoadSeq` 기반 비동기 응답 순서 역전 차단.
   - 삭제 및 보관 시 카드 레벨 `cardCollection` 고정 전달.
   - **검증 결과 (U)**:
     * `node downloader/test_studio_reference_flow.js` 통과.

### [단계 C & D] 런타임 안정성 및 설정 UX
- **런타임**: `studio-browser/shutdown.cjs` 쿠키 정상 플러시 및 10초 타임아웃 보호 통과 (`test_shutdown.cjs` PASS).
- **설정 UX**: KIE 독립 AI 공급자 키 등록, 모델 동적 로드, 비용 견적 대화창 통과 (`test_studio_kie_dom.js` PASS).

### [단계 E] 수집·파일·보관함 실제 흐름
- 회귀 4건 전수 해결 및 `FILTER_VERSION = 'v5_verified_published_date'` 동기화.
- **Python 단위 테스트 전수 통과**: **Ran 139 tests in 79.640s, OK (139/139 통과)**.
- 실제 Threads/Instagram/Pinterest 브라우저 상의 최종 실시간 클릭 실측은 대기 상태로 유지.

### [단계 G] 분석·초안·편집·상품 연결
- **G1 초안 보존 및 재검토 안내 구현**:
  - `downloader/studio.py`: 상품명 변경 시 기존 초안을 `None`으로 날리지 않고 초안과 선택안을 보존하되, `needs_review=True` 및 `review_reason='연결된 상품 정보가 변경되었습니다. 초안 내용 및 상품명을 재검토해 주세요.'` 설정.
  - `downloader/studio_web/studio.js`: 초안 화면 상단에 경고 배너(`⚠️ ...`)를 노출하여 사용자가 상품 변경에 맞춰 초안을 재검토하도록 안내.
  - `downloader/test_studio.py`: 라인 438~441 테스트 기대값을 초안 삭제에서 초안 보존 및 `needs_review` 검증으로 수정.

---

## 3. 커밋 `f28e2a8`의 19개 변경 파일 기능별 분류 및 검증 매핑표

| 번호 | 기능별 분류 | 변경 파일 경로 | 주요 수정 내용 | 대응 검증 스위트 |
|---|---|---|---|---|
| 1 | **업로드 자동화 & 브라우저 호스트** | `downloader/studio-upload.js` | Threads/IG/TikTok DOM 휴먼 터치 업로드, 텍스트 타이핑, 미디어 첨부, 과거 글 오인 방지 | `test_studio_upload_dom.js` (PASS) |
| 2 | | `studio-browser/threads-upload.cjs` | 예약/즉시 업로드 큐 매니저, 캐러셀 10개 한도, HTML 오류 손상 차단 | `test_threads_upload.cjs` (PASS) |
| 3 | | `studio-browser/main.cjs` | Electron 메인 프로세스, IPC 통신 핸들러, 창 생명주기 관리 | `test_shutdown.cjs` (PASS) |
| 4 | | `studio-browser/navigation.cjs` | 외부 URL 내비게이션 가드레일 | 정적 점검 (S) |
| 5 | | `studio-browser/site-preload.cjs` | 웹 뷰 프리로드 컨텍스트 브릿지 격리 | 정적 점검 (S) |
| 6 | | `studio-browser/toolbar.html` | 상단 툴바 UI 요소 보정 | 정적 점검 (S) |
| 7 | **스튜디오 웹 UI & 워크스페이스 레이아웃** | `downloader/studio_web/index.html` | 플랫 드로어 및 글쓰기 스타일 바 마크업 정비 | DOM 렌더 확인 (U) |
| 8 | | `downloader/studio_web/studio.css` | 단계별 레이아웃 스타일 개선, 드로어 스타일링, 플랫화 | DOM 스타일 점검 (S) |
| 9 | | `downloader/studio_web/workspace.js` | 워크스페이스 세션 연동 및 네비게이션 보정 | 정적 점검 (S) |
| 10 | **브라우저 인젝션 & 콘텐츠 스크립트** | `downloader/content-studio.js` | 스튜디오 콘텐츠 추출 및 확장 연동 로직 강화 | `test_studio_reference_flow.js` (PASS) |
| 11 | | `downloader/content-threads.js` | Threads 페이지 내 인젝션 및 미디어 핸들링 | DOM 격리 점검 (U) |
| 12 | | `downloader/content.css` | 인젝션 오버레이 UI 스타일 | CSS 정적 점검 (S) |
| 13 | **글쓰기·대본 생성 및 텍스트 정제** | `downloader/studio_writing.py` | 한국 스타일 3안(원라인/투라인/훅/스토리) 생성 및 프롬프트 튜닝 | `test_studio_writing.py` (PASS) |
| 14 | | `downloader/studio_text_clean.py` | 이모지, 광고 문구, 중복 공백 정제 및 금칙어 처리 | `test_studio.py` (PASS) |
| 15 | | `downloader/studio_integrations.py` | Threads API 및 쿠팡 제휴 연동 보강 | `test_studio_integrations.py` (PASS) |
| 16 | **테스트 & 회귀 검증 스위트** | `downloader/test_studio_upload.js` | 백그라운드 확장 큐, 알람, 취소, 부분 캐러셀 차단 검증 | `node test_studio_upload.js` (PASS) |
| 17 | | `downloader/test_studio_upload_dom.js` | JSDOM 기반 DOM 미디어 첨부, 본문 검증, 신규 글 적중 검증 | `node test_studio_upload_dom.js` (PASS) |
| 18 | | `downloader/test_studio_writing.py` | 글쓰기 스타일 엔진 단위 테스트 | `python -m unittest test_studio_writing.py` (PASS) |
| 19 | | `studio-browser/test_threads_upload.cjs` | 예약 큐, 크래시 복구, 캐러셀 누락/손상 차단 검증 | `node test_threads_upload.cjs` (PASS) |

---

## 4. 현재 위치 및 다음 단계

1. **현재 상태**:
   - A~L 12단계 중 단계 A는 합격, 단계 B~H는 **‘구현·격리 검증 완료 / 실제 검증 대기’** 상태.
   - Python 테스트 139개 전수 통과 (100%), Node.js 회귀 픽스처 6종 전수 통과 (100%).
2. **개선된 핵심 내용**:
   - `studio.py`의 commit_id 고정값 제거 및 동적 Git 상태 조회 적용.
   - 상품 변경 시 초안 보존 및 `needs_review` 재검토 경고 배너 제공 (초안 유실 방지).
   - B1 첨부 검증에서 10개/30MB 기준 성격(공식 규격 vs 내부 안전 가드레일) 및 HTML 손상 파일 차단 로직 보강.
   - `f28e2a8`의 19개 변경에 대한 기능별 분류 및 검증 매핑 완료.
3. **남은 차단 요인 및 실제 검증 대기 항목**:
   - **실제 공개 게시 1회 검증**: 사용자 지정 Threads 계정으로의 실게시 (사용자 명시적 승인 필요).
   - **외부 유료 API 호출 1회 검증**: Gemini/KIE API 실제 호출 (사용자 승인 필요).
   - **단계 J/K 클린 PC 배포본 검증**: 실제 비공개 베타 패키징 및 신규 PC/VM 환경 검증 대기.
4. **다음 작업**:
   - 검증된 수정사항 Git 커밋 준비 (`studio.py`, `studio.js`, `studio-upload.js`, `test_studio.py`, `threads-upload.cjs` 등).
   - 배포 보안(단계 I)의 비밀정보 마스킹 및 불필요 외부 전송 점검.

---

## 5. 2026-10-15 추가 반영 · 제작 안정화 Stage 0 (R1~R6) 수정 및 격리 검증 완료

[`RELEASE-PLAN-REVIEW-2026-10-15.md`](file:///C:/Users/hynihk/Documents/TAKOH_Media_Downloader_PRO/github-handoff/takoh-inthread-browser/RELEASE-PLAN-REVIEW-2026-10-15.md)에서 확인된 6건의 회귀·결합 결함(R1~R6)을 수정하고 격리 검증을 완료했습니다.

- **R1 (예약·내보내기 파일 불변성 보장)**: `extension_export`에서 모든 전달 파일의 SHA256 해시와 `carousel.render_revision`을 `export_hash`에 포함하고, `os.link` 하드링크 대신 `shutil.copy2` 복사본으로 `deliveries/<id>/`를 생성하여 후속 캐러셀 편집이 기존 예약 파일을 변조하지 않도록 차단 (`test_stage0_r1` PASS).
- **R2 (작업별 본문 복원 이력 격리)**: 백엔드 `job['draft_history']` 및 프론트엔드 `jobScriptHistories`(`Map`)로 작업 간 본문 되돌리기 오염 차단 (`test_stage0_r2` + Playwright PASS).
- **R3 (주력 상품 보관함 선택·확인·영속 저장)**: 빈 옵션(`value=""`) 선택 무시, 상품 불러오기 시 `confirmed = false` 강제(사용자 직접 확인 필요), `/studio/saved-products`(`saved-products.json`, 50개 상한) 서버 영속화 및 오류 메시지 표시 (`test_stage0_r3` + Playwright PASS).
- **R4 (`0.0초` 프레임 선택)**: `Number.isFinite` 및 `math.isfinite` 검사로 `0.0초` 재생 시점이 기존 타임스탬프로 폴백되지 않도록 수정 (`test_stage0_r1` + Playwright PASS).
- **R5 (표지 제목 추가와 기존 자막 가림 분리)**: `title_first`(표지 제목만 추가 · OCR/자막 가림 없음 `keep`)와 `cover_first`(표지 자막 가림 `cover_box` + 제목 추가)를 분리하고, AI/이미지 처리 예외 삼킴 제거 (`test_stage0_r5` PASS).
- **R6 (단계 완료 배지 정확화)**: 실제 산출물 저장·확인 완료 시에만 `step-done` 배지 표시 (Playwright PASS).

