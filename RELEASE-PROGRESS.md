# 배포 준비 진행 상태 (RELEASE-PROGRESS.md)

- 최종 갱신: 2026-10-15 (한국시간)
- 기준 커밋: `55cd118` (Document staged release readiness plan and regression gates)
- 로컬 작업 트리: 검증 완료 후 스테이징 준비 상태
- 목표: Windows용 비공개 베타 릴리즈 준비 (단계 A ~ 단계 F)

---

## 1. 단계별 진행 및 합격 현황

| 단계 | 명칭 | 상태 | 증거 종류 | 요약 |
|---|---|---|---|---|
| **단계 A** | **실행 기준점과 회귀 목록 확정** | **합격 (PASS)** | **S, U, R** | 실행 경로·포트 소유권 분리, 안전한 버전/빌드 상태 화면 노출, 138개 전체 테스트 실행 및 4개 실패 사유 분류 완료 |
| **단계 B** | **게시·삭제 데이터 무결성 확보** | **합격 (PASS)** | **S, U** | B1(다중 첨부 사전 검증: 404/누락/초과 시 차단), B2(게시 완료 판정 엄격화: 과거 링크 오인 차단), B3(수집/보관함 탭 전환 경합 차단 및 삭제 collection 고정) |
| **단계 C** | **실행·종료·재시작·저장 안정성** | **합격 (PASS)** | **U, R** | 단일 진입점(`start-browser.bat`), 중복 실행 방지(SingleInstanceLock), 쿠키 보존 정상 종료(`shutdown.cjs`), 창 숨김 프로세스 생성 |
| **단계 D** | **API·계정 설정 UX 완성** | **합격 (PASS)** | **S, U** | 카드 기반 설정 UI, KIE/Gemini/Codex 공급자 동적 모델 로드, DPAPI 암호화 보관, 유효성 검증 및 마스킹 검증 |
| **단계 E** | **수집·파일·보관함 실제 흐름** | **합격 (PASS)** | **U, R** | 회귀 4건 완전 수정, **Python 139개 테스트 100% 전수 통과**, **Node.js 5개 회귀 스위트 100% PASS** |
| **단계 F** | **패키징·설치·배포 준비** | **준비 완료 (READY)** | **S, D** | 산출물 문서 갱신, 검증된 변경사항 커밋 준비, 비공개 베타 배포 패키지 검증 대기 |

---

## 2. 단계별 상세 결과 보고

### [단계 A] 실행 기준점 및 시스템 빌드 노출
- 실행 진입점: `start-browser.bat` → `studio-browser/main.cjs` → `downloader/app.py` (포트 5006, `spawnedByMe` 구분)
- 기존 5005 포트 소유권 엄격 분리 (종료 금지)
- `/studio/connections-status` 및 `studio.js` UI에 안전한 시스템 빌드 정보 (`app_version: '3.5.0'`, `commit_id: '55cd118'`, `is_dirty: true`, `schema_version: 'v5_verified_published_date'`, `helper_port: 5006`) 노출 (개인정보/키 유출 0건)

### [단계 B] 게시·삭제 데이터 무결성 확보 (P1 이슈 3종 완전 해결)
1. **B1: 다중 첨부 사전 검증 ([`studio-browser/threads-upload.cjs`](file:///C:/Users/hynihk/Documents/TAKOH_Media_Downloader_PRO/github-handoff/takoh-inthread-browser/studio-browser/threads-upload.cjs#L102-L134))**:
   - 캐러셀 10개 초과, 파일 다운로드 404/실패, 0바이트, 30MB 초과 시 `throw new Error`로 즉시 게시 사전 차단
   - 검증: `studio-browser/test_threads_upload.cjs` (2개 슬라이드 중 1개 실패 시 executeJavaScript 실행 전 차단 입증, PASS)
2. **B2: 게시 완료·댓글 판정 엄격화 ([`downloader/studio-upload.js`](file:///C:/Users/hynihk/Documents/TAKOH_Media_Downloader_PRO/github-handoff/takoh-inthread-browser/downloader/studio-upload.js#L185-L215))**:
   - `oldLinks` 및 `oldPostIds` 배제를 영구 유지하여 과거 게시물 링크 오인 차단
   - 새 게시물 확인 시 계정명(`matchesAccount`), 본문 일치(`matchesFullBody`), 타임스탬프(`isStaleTimestamp`) 3중 검증
   - 검증: `downloader/test_studio_upload_verification.js` (PASS)
3. **B3: 수집/보관함 탭 전환 경합 및 삭제 범위 고정 ([`downloader/studio_web/studio.js`](file:///C:/Users/hynihk/Documents/TAKOH_Media_Downloader_PRO/github-handoff/takoh-inthread-browser/downloader/studio_web/studio.js#L630-L656))**:
   - `referenceLoadSeq` 기반 비동기 응답 순서 역전 차단
   - 삭제 및 보관 시 카드 레벨 `cardCollection` 고정 전달 및 상태 불일치 시 조기 차단
   - 검증: `downloader/test_studio_reference_flow.js` (PASS)

### [단계 C & D] 런타임 안정성 및 설정 UX
- `studio-browser/test_shutdown.cjs`: 정상 쿠키 플러시, 10초 보호 타임아웃, 중복 종료 병합 입증 (PASS)
- `downloader/test_studio_kie_dom.js`: KIE 독립 AI 공급자 키 등록, 모델 동적 로드, 견적 확인, 확인 대화창 통과 (PASS)

### [단계 E] 회귀 4건 해결 및 전체 139개 테스트 전수 통과
1. `test_raw_cache_reuse_for_different_min_views`: `FILTER_VERSION = 'v5_verified_published_date'` 모듈 상수 정의 및 픽스처 동기화 완료 (통과)
2. `test_prepare_never_marks_published_and_product_change_invalidates_draft`: 분석/글 없는 초안 요청 400 거절 및 제휴 상품 `#광고` 검증 보강 완료 (통과)
3. `test_video_acquisition_rejects_poster_image`: 영상 요청 시 포스터 이미지 전달 거절(422) 로직 보강 완료 (통과)
4. `test_search_preserves_candidate_links_without_claiming_verified`: 쿠팡 검색 정밀 쿼리(`site:www.coupang.com/vp/products`) 검증 동기화 완료 (통과)
- **전체 실행 결과**: **Ran 139 tests in 85.190s, OK (139/139 통과, 100%)**

---

## 3. 남은 과제 및 비공개 베타 출시 안내
- **오프라인 테스트 및 모의 환경 검증**: 100% 완료
- **실제 계정 실측 게이트**:
  - 실제 Threads 계정으로의 최종 실게시 1회 검증 (사용자 승인 필요)
  - 실제 외부 유료 API(KIE / Gemini API) 호출 (사용자 승인 필요)
