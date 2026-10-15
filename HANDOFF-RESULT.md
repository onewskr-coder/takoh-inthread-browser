# 누적 발견 저장소 직접 구현 결과

- SQLite 영구 누적 저장: video ID 단일 키, 확인된 상세 메타데이터 보존, 기존 원시 캐시 이관.
- 새 채널 ID 자동 등록, 마지막 확인 순서로 최대 5개씩 갱신.
- 새 영상 확인은 YouTube channels → uploads playlistItems → videos 경로. SerpAPI/search.list 미사용. 버튼 클릭 시에만 최대 11 요청.
- 기본 진입은 누적 저장소 조회. 미열람 옵션으로 이전 표시 영상을 제외. 과거 영상은 전체 조회로 다시 확인 가능.
- 실제 화면: 영상189개/채널165개, 최초30개 → 미열람 다음30개. 외부 호출0회.
- 격리 테스트18개 통과: 중복 저장/재로드/미열람 제외/YouTube만 사용한 채널 갱신 포함.
- 초기 실제 화면500 오류는 저장소 연결 수명 수정 후 소스 재로드하고 정상 조회 확인.
- 실제 채널 공급자 갱신은 미실행. 자동 주기 갱신/백그라운드 유료 검색은 추가하지 않음.
- 화면 증거: ../discovery-catalogue-live.png

## 미열람 소진 안내 수정
- 현재 조건에 맞는 자료가 이미 표시된 경우와 실제 필터 미달을 분리.
- 이미 본 자료 수와 API 없는 다시 보기 버튼 추가.
- 격리 테스트18개 통과: 미열람 소진 사유/전체 조회 복원 포함.

## 조회수/성장률 정렬
- 조회수 높은 순, 최신순, 시간당 조회수 증가 순, 시간당 증가율(%) 순 제공.
- 누적 자료 정렬은 외부 조회 없음. 카드에도 성장 지표 표시.
- 캐시 재열람은 새 실측으로 기록하지 않고 기록 시각 두 개로만 계산. 1시간 미만/기준 조회수0은 미확인 처리.
- 채널 영상 상세 확인 시 실제 조회수를 관측 기록에 연결.
- 격리 테스트19개 통과. 실제 화면 성장률 옵션과 측정 대기 표시 확인. 추가 공급자 호출 없음.

## 성장량 순위 적용 상태 점검
- 실제 화면 상위 결과 모두 측정 대기: 총 조회수 보조순으로 표시되고 있음을 확인.
- 실측 지표0개일 때 성장 순위 산정 불가/조회수 참고순을 명시하도록 수정.
- 유효 기록이 있어야 실제 성장 순위가 가능. 추가 API 호출 없음.

## 구독자 대비 조회수 배수
- 영상 조회수/채널 구독자 수 X배 표시, 성장량/성장률과 별도 정렬.
- channel_statistics 영구 저장, 비공개/0/미확인 계산 불가.
- 구독자 확인 버튼: 미확인 우선 최대200채널, YouTube channels.list 최대4회, SerpAPI0회, 자동 재시도0회.
- 격리 테스트21개 통과: X20 계산/비공개/0명/영구저장/별도 정렬 API 포함.
- 실제 승인 조회: YouTube4회로200채널 구독자 확인, SerpAPI0회. 등록281채널 중81채널은 미조회로 남김.
- 실제 화면 X436 → X407.33 → X253 순 확인. 구독자 수가 작은 채널은 배수가 크게 나올 수 있어 구독자 숫자도 함께 표시.
- 화면 증거: ../discovery-subscriber-multiple-live.png

## 콘텐츠 발견 화면 정리
- 주요 검색행: 검색어/카테고리/길이·형식/정렬/검색.
- 나머지 조건과 비용 설명은 상세 필터 안으로 이동.
- 채널·구독자 갱신은 채널 관리, 긴 조회 수치는 조회 내역으로 접기.
- 카드에 X배 강조. 성장 측정 대기는 성장 정렬일 때만 표시. 추천 설명은 접기.
- 실제 브라우저에서 상세 필터 펼침/닫힘, 기존 X배 정렬, 카드30개 표시 확인. 추가 외부 호출 없음.

## 쇼핑 카테고리 확장
- 기존8개+신규10개=18개 쇼핑 카테고리 및 전체 카테고리 추가, 기본 전체 선택.
- 신규: 가구·인테리어/욕실·위생/자동차·차량/여행·휴대/문구·사무/공구·DIY/원예·식물/건강·생활보조/식품·음료/취미·완구.
- 다국어 검색어/관련성 키워드/제품군 미리보기 연결. 전체는 통합 키워드, 개별은 카테고리 일치 기준.
- 격리22테스트 통과. 실제 UI19선택 항목 및 기본전체 확인, 외부 검색0회.

## 쇼핑 쇼츠 전용 탐색
- 길이·형식에 쇼핑 쇼츠만 (Shorts 근거 있음) 추가.
- 길이만 짧은 일반 영상 제외. 목록/Shorts원본주소/화면비율/태그 근거 보존·카드 표시. 태그만 있으면 형식 후보로 명시.
- YouTube 새 검색: #shorts 검색어, videoDuration=short, order=viewCount, 최대2페이지씩 한/영/일; 실제길이180초이하 및 쇼핑필터 사후적용.
- Shorts 전용 원시캐시를 일반검색과 분리, 누적 자료는 그대로 유지.
- 테스트24개 통과. 실제 누적 자료128후보,30카드 표시. 새 공급자 호출0회.
- 새 고조회수 검색 승인 요청: 최대606YouTube유닛,SerpAPI0. 1억뷰영상 발견 미검증.

## 승인된 YouTube 고조회수 쇼핑 쇼츠 실제 검색
- UI검색버튼1회,전체기간/전체카테고리/쇼핑쇼츠만/조회수높은순/국가ALL.
- 반환후보96개, 조건제외31개, 쇼핑쇼츠후보65개, 상위30개화면표시.
- YouTube검색5회+상세5회=로컬추정505유닛 (승인상한606이내),SerpAPI0회,재검색0회.
- 최고영상 OaOp-nvbAzc 약9316.5만회. 다음KbwEjkrTDTM 약7285.1만회. 이번범위에서1억뷰미발견.
- 누적저장완료. 제품실사용장면및Shorts실제재생검증은별도. 태그근거후보를확정영상으로표기하지않음.
- 화면증거: ../discovery-youtube-shopping-shorts-live.png

## Gemini API / Antigravity CLI 검색 연결 현황 (2026-10-14)
- 상세 필터에 Gemini API Google 검색 / Antigravity CLI Gemini 검색을 별도 추가.
- 공식 Gemini CLI 실행하지 않음. 사용자 지정 Antigravity 계정의 gemini-3.8-flash-low 모델 사용.
- API는 Google 검색 연동 1요청, Antigravity는 세션1회/120초. 자동 공급자 전환 없음. 출처 없는 생성 URL은 거부.
- 후보는 YouTube 상세 최대1조회로 검증하고 카탈로그/채널에 누적. API검색 키는 설정에서 DPAPI 저장.
- 격리31테스트와 workspace.js 구문검사 통과.
- 실제 Antigravity 검색1회: search_web 실행 확인, 최종 status ERROR/stream interrupted, 유효 영상 주소 미확보. 추가 호출/YouTube검증/SerpAPI/자동API전환 없음.
- 중첩 event/step_update/result 형식에 맞게 응답 파서 보완. 실패를 성공으로 표기하지 않음.
- Gemini API 실호출은 미검증. Antigravity에서 실제 후보를 확보하는 흐름도 아직 미통과.
- 현재 누적채널336개. 새영상 저장 시 채널자동등록, 동일ID 중복등록 방지. 채널 자동 주기갱신은 미구현.
## 전용 Electron 실제 화면 확인 및 복구 수정 (2026-10-14)
- Windows Computer Use로 실제 전용 앱 창 확인: 최초 콘텐츠 발견 빈 화면, 도우미 연결 끊김, 내부 chrome-error 문서.
- 5006 /studio/session 및 /studio/ HTTP 200 확인. 기존 도우미 종료 없음.
- 재연결과 페이지 새로고침 후 실제 전용 앱에 최신 화면 표시: 영상684/채널336/후보239, 카드30개, 전체카테고리 및 정렬/상세필터 표시.
- main.cjs: did-fail-load/did-finish-load 상태 추적, 재연결/작업 메뉴 선택 시 실패 문서만 복구. 정상 제작 문서는 자동 새로고침하지 않음.
- Node 구문검사 및 실패 문서/정상 문서/파괴된 view 대상 격리 회귀검사 통과. 신규 복구 코드 실제 장애 재현 검증은 아직 미완료.
- 정상 창 닫기 후 기존 PID49508이 종료되지 않아 start-browser.bat 새 실행은 단일 인스턴스 보호로 차단됨. 잠금 파일 무조건 삭제/강제 종료 없음. 강제 종료 승인을 요청함.
- 유료 검색/AI/SerpAPI 추가 호출 없음. Gemini/Antigravity 실제 추천 성공은 이전과 같이 미검증.

## 승인된 브라우저 재실행 결과
- 사용자 승인 후 기존 브라우저 PID49508만 강제 종료. 잠금 파일 무조건 삭제 없음.
- 기존 start-browser.bat 1회 실행, 명령 종료 코드0. 새 Electron 메인 PID3920이 창을 유지함.
- 실제 전용 앱: Threads 로그인 유지, 도우미 연결됨 확인. 콘텐츠 발견에서 영상684/채널336/후보239 및 카드 표시 확인.
- 기존5006 PID64516 및5005 포트 유지. 외부 검색0회, 누적 조회 API사용0회.
- 실패문서 복구 코드가 새 앱에 로드됨. 새 코드를 대상으로 서버 장애를 인위적으로 재현하지는 않음.
- 남은 과제: 정상 창 종료 후 프로세스가 남는 문제의 원인 수정, Antigravity 실제 추천 성공 검증.
## 등록 채널 숏폼 조회수 순 수집 버튼
- 콘텐츠 발견 > 채널 관리에 등록 채널 숏폼 수집 · 조회수 순 버튼 추가. 실제 Electron 화면에서 표시 확인.
- POST /studio/discovery/channels/shorts/refresh: 오래 확인하지 않은 채널5개, 최근 업로드50개씩, 상세 메타데이터 조회 후180초 이하만 조회수 내림차순 저장.
- 영상ID로 중복 저장 방지, 기존 조회수 관측 기록 갱신. 성공 후 채널 확인 시각 갱신. YouTube최대11유닛,SerpAPI0,search.list0,자동재시도0.
- 버튼 성공 후 누적 자료/짧은 영상/조회수 높은 순/전체기간으로 전환. 기존 관련성·최소조회수 필터는 적용됨.
- 채널 역대 전체 영상 순위가 아닌 최근 업로드 범위. API 메타데이터만으로 Shorts 확정 불가하므로 짧은 영상 후보 포함.
- 격리2테스트 통과:180초경계/긴영상·길이누락제외/조회수정렬/저장재로드/중복0/기존채널갱신호환. JS구문검사 통과.
- 실제 외부 호출은 실행하지 않음. 실행 서버HTML 및 전용앱 새 버튼 표시 확인. 도우미 종료/앱재시작 없음.
## 정상 종료 경로 수정 및 실제 Electron 격리 검증
- 원인: before-quit 핸들러가 app.whenReady 콜백 내부 attemptGracefulQuit 함수를 참조하여 ReferenceError 후 종료 취소. 창 닫기와 앱 종료에서 중복 준비/저장도 수행됨.
- main.cjs: 종료 준비 함수를 공통 범위로 이동. shutdown.cjs에서 창 닫기/앱 종료를 단일 Promise로 처리. 도우미 종료 거부/쿠키 저장 실패 시 창 유지.
- 쿠키 저장10초 초과 시 종료 승인 없이 오류 표시. 강제 종료 fallback 없음. 정상 저장 성공 후 리소스 정리 및 app.quit.
- test_shutdown.cjs: 중복 종료1회 처리/작업중 종료거부/저장오류/저장지연보호 통과.
- 별도 임시 프로필 실제 Electron 프로세스2회: 첫 프로세스 쿠키 저장 후 창닫기 종료코드0, 두번째 프로세스 저장된 쿠키 재조회 종료코드0 확인.
- 생산 브라우저/도우미/로그인 데이터 미변경. 새 종료코드는 다음 앱 실행부터 적용되며, 현재 생산 인스턴스 종료검증은 아직 수행하지 않음.
## 수집한 레퍼런스 삭제 / 독립 보관함
- 수집 목록과 saved-references 보관함을 별도 JSON 폴더로 분리. 수집 카드의 보관함에 저장은 독립 사본 저장(동일URL 중복 방지).
- 목록별 개별 삭제 및 현재 목록 전체 삭제. UI 확인창 및 토큰 인증,64자리파일ID 검증. 전체 삭제는 확인한 ID 스냅샷만 지우므로 새로 도착한 항목 유지.
- 수집 목록 삭제 시 보관함 사본/원본 미디어/작업 미삭제. 보관함 삭제도 수집 목록 유지. 삭제한 수집 항목은 자동 확장동기화로 되살아나지 않으며 명시적 재수집 가능.
- 발견 카드의 보관함 담기 문구를 레퍼런스 수집으로 정정.
- 격리 API 테스트 통과: 저장/독립삭제/전체확인필수/인증/경로검증/재동기화차단/명시적재수집. studio.js/workspace.js 구문검사 통과.
- 실제 전용 앱:수집10개,개별삭제/전체삭제/보관함저장 버튼 표시 및 별도보관함0개 전환 확인. 사용자자료 실제삭제/임의보관 미수행. 실행페이지 새로고침으로 적용.

## 사용자 전용 앱 실행 → 정상 종료 → 재실행 실제 검증 및 현황 (2026-10-14)
- 작업 폴더 및 프로필 확인: 실행 앱이 `C:\Users\hynihk\Documents\TAKOH_Media_Downloader_PRO\github-handoff\takoh-inthread-browser\studio-browser` 소스와 `%APPDATA%\takoh-studio-browser` 프로필, `%LOCALAPPDATA%\ONEWS\studio` 데이터 폴더를 사용하는 것을 확인.
- 1차 실행 확인: `start-browser.bat` 실행 시 Electron 메인(PID 23592, 창 핸들 `HWND 723322`) 및 5006 도우미(PID 2964) 기동, `/studio/session`·`/studio/busy-status` HTTP 200 응답 확인.
- 실제 앱 정상 종료 검증: 창 닫기(`WM_CLOSE`) 시 `shutdown.cjs` → `attemptGracefulQuit`(`GET /studio/busy-status` 200 → `POST /studio/shutdown` 200) → `persistence.flush()` → `will-quit` 순서로 실행되어 Electron 프로세스 전체와 직접 시작한 5006 도우미(PID 2964)가 잔류 없이 종료되고 `app-profile.lock`이 해제됨을 확인.
- 재실행 및 도우미 재연결 확인: `start-browser.bat` 재실행 시 단일 인스턴스 차단 없이 새 Electron 메인(PID 3416, 창 핸들 `HWND 985426`) 및 새 5006 도우미(PID 34776)가 정상 기동되고 `app-profile.lock`(3416) 기록 및 `/studio/session` 주기 폴링(HTTP 200) 연결됨을 확인.
- 플랫폼 로그인 검증 (쿠키 존재 vs 실제 로그인 화면 확인 구분):
  1. **SQLite 쿠키 DB 보존 확인**: 정상 종료 직후 `%APPDATA%\takoh-studio-browser\Partitions\sites\Network\Cookies`에서 총 157개 영구 쿠키(`.threads.com` `sessionid`/`ds_user_id`/`csrftoken`, `.instagram.com` `sessionid`, `.pinterest.com` `_pinterest_sess`/`_auth` 등)가 디스크에 유지됨을 확인했으며, 재실행 후에는 Chromium 네트워크 프로세스가 해당 DB 파일을 정상 점유함을 확인.
  2. **실제 로그인 화면 확인 구분**: 이전 Windows Computer Use 화면 점검에서 기본 탭인 Threads 화면의 로그인 상태 유지는 확인했으나, 이번 재실행(PID 3416)에서는 비침투 창 핸들(`HWND 985426`) 및 세션 폴링만 확인하고 Instagram·Pinterest·X·TikTok 각 탭을 직접 전환하여 실제 로그인된 DOM/화면을 눈으로 검증하지는 않았음(쿠키 DB 존재 확인 완료 / 전 플랫폼 탭별 실제 로그인 화면 전환 확인은 미수행으로 구분).

## 승인된 Antigravity CLI 실제 검색 1회 검증 결과 (2026-10-14)
- 실행 조건: `GET /studio/discovery` (`provider=antigravity_search`, 모델 `gemini-3.8-flash-low`, 제한시간 120초, `country=KR`, `mode=shopping`, `category=living_kitchen`, `published_range=90d`, `refresh=1`) 1회 실행.
- 실행 소요 및 CLI 상태: 약 76.6초 소요(CLI 내부 74.8초, 1턴). 이전 실행과 달리 스트림 중단 없이 `result.status: "SUCCESS"`로 완료되었으며, CLI 내부에서 `search_web` 도구가 총 6회(`step_index` 2, 4, 6, 8, 10, 12) 실행됨.
- 단계별 성공 여부:
  1. **실제 영상 URL 확보 (실패 — 0개)**:
     - Antigravity CLI의 `--output-format stream-json` 이벤트(`step_update.tool_info`)에는 호출 파라미터(`parameters.query`)만 기록되고 도구의 원시 반환 본문(`result`/`output`)은 스트림 이벤트에 포함되지 않음.
     - CLI 세션 로그(`0fdbe528-2ad5-4bd0-a602-1e858f03e3dc`) 대조 결과, `search_web` 도구 자체가 개별 `youtube.com/shorts/<11자리ID>` 또는 `youtube.com/watch?v=<11자리ID>` 직접 링크 대신 요약문과 `https://vertexaisearch.cloud.google.com/grounding-api-redirect/...` 리다이렉트 출처만 반환함.
     - 그 결과 모델 응답 본문에서도 11자리 영상 ID URL이 0개였고, `parse_antigravity_events`의 `sources`가 빈 배열(`[]`)이 되어 `studio_gemini_discovery.py` 96행에서 최초 오류(`GeminiDiscoveryError: Google 웹 검색 실행·출처 근거를 확인하지 못해 추천을 중단했습니다. 모델이 기억으로 만든 URL은 사용하지 않습니다.`, HTTP 502)가 발생함.
  2. **YouTube 상세 확인 (미실행 — 0회 / 0유닛)**:
     - 후보 영상 ID가 확보되지 않아 1단계에서 즉시 중단되었으며, YouTube `videos.list` 호출은 0회(누적 요청 162회·6,803유닛 그대로 유지)로 쿼터가 소모되지 않음.
  3. **누적 저장 (미실행 — 0건 추가)**:
     - 검증된 후보가 없으므로 `discovery-catalogue.sqlite3`에 가짜/미검증 데이터를 저장하지 않고 기존 872건을 그대로 유지함.
  4. **화면 표시 (오류 안내 표시 / 가짜 후보 미표시)**:
     - HTTP 502 및 최초 오류 메시지를 반환하여 가짜 후보 카드가 표시되지 않도록 차단함.
- 원시 응답 및 최초 오류 보존:
  - 감사 폴더 `%LOCALAPPDATA%\ONEWS\studio\gemini_discovery_audits\eee8ef48fc97478494dccbe30888994e\latest-response.json`에 44개 stream-json 이벤트 전체가 그대로 보존됨.
  - 승인 조건에 따라 자동 재시도(0회), SerpAPI 호출(0회, 누적 27회 유지), 다른 공급자(Gemini API 등) 자동 전환 없이 즉시 중단함.

## 검색 출처 리다이렉트 링크(`grounding-api-redirect`) 실제 영상 주소 확보 검증 (2026-10-14)
- **검증 방법 (반복 검색 0회)**:
  - 직전 보존된 Antigravity 검색 감사 파일(`%LOCALAPPDATA%\ONEWS\studio\gemini_discovery_audits\eee8ef48fc97478494dccbe30888994e\latest-response.json`, `conversation_id: 0fdbe528-2ad5-4bd0-a602-1e858f03e3dc`)과 해당 CLI 세션의 로컬 트랜스크립트(`~/.gemini/antigravity-cli/brain/0fdbe528-2ad5-4bd0-a602-1e858f03e3dc/.system_generated/logs/transcript_full.jsonl`)를 대조 분석함.
  - CLI `search_web` 도구의 `GENERIC` 응답 본문에 기록된 `https://vertexaisearch.cloud.google.com/grounding-api-redirect/...` 링크 **28개**에 대해 `HEAD` 요청(`allow_redirects=False`)으로 `Location` 헤더를 확인한 결과, **28개 중 27개가 실제 개별 YouTube 영상 URL(Shorts 16개, Watch 11개, 채널 1개)로 즉시 변환됨**을 확인함.
- **코드 보완 (`downloader/studio_gemini_discovery.py`, `downloader/test_gemini_discovery.py`)**:
  1. `antigravity_transcript_sources(conversation_id, brain_root=None)`: `stream-json` 이벤트에 출처 URL이 비어 있을 때 해당 `conversation_id`의 로컬 트랜스크립트(`GENERIC` 스텝)에서 `search_web` 출처 링크를 추출.
  2. `resolve_grounding_redirects(sources, timeout=4)`: `vertexaisearch.cloud.google.com/grounding-api-redirect/` URL을 `HEAD`(필요 시 `GET`, `allow_redirects=False`)로 조회하여 `Location` 헤더의 실제 영상 URL로 변환하고 원본 리다이렉트 주소는 `redirect_url` 필드에 보존 (`antigravity_search` 및 `gemini_search` 양쪽 모두 적용).
  3. `extract_video_ids(text)`: `m.youtube.com/shorts/<11자리ID>` 모바일 도메인도 11자리 영상 ID로 추출하도록 정규식(`(?:(?:www|m)\.)?`) 보완.
- **단위 테스트 및 보존 데이터 오프라인 검증 결과**:
  - `python -m unittest test_gemini_discovery.py -v`: 리다이렉트 변환·트랜스크립트 출처 추출·모바일 쇼츠 URL 추출을 포함해 **9개 테스트 전부 통과 (`Ran 9 tests in 0.042s — OK`)**.
  - 보존된 `eee8ef48fc97478494dccbe30888994e/latest-response.json`을 보완된 `parse_antigravity_events`에 통과시킨 결과, 추가 검색 없이 `search_count=6`, `sources=29개`, **고유 11자리 영상 ID 27개**(`YtgbN-TrWvY`, `f9s40SNqqm4`, `YGq4AMnW_mk`, `mi1tsWYp490`, `MdA0WXjq-2Y`, `53l5VGZLHyg`, `UNbHbL1jK-s`, `36PrR06QCd8`, `ilULIPlEGyo`, `kuxJCEICKxo`, `W4OP8WxahzE`, `BKkPurocO7Y`, `8iTO9aIwL2E`, `sPJffYnI1NA`, `KGZrk70O_nY`, `zT6hH9JACPY`, `fcAA1EMxWJY`, `FSsfVAThs_M`, `y4SEXzkUyqk`, `GmAqt0H_cnI`, `AUnRMPhQc88`, `i0sKoVxqxlM`, `DiyaYANmDKM`, `Lbv0Zcn1gkg`, `tovtCIliMmE`, `g6Gd0iBTP-Y`, `CnXSLtaVJxc`)가 정상 확보됨을 확인함.
  - **구분**: 보존된 응답 기반 리다이렉트 → 실제 영상 URL(27개) 확보까지는 검증 완료했으며, 확보된 27개 ID를 실제 도우미의 YouTube 상세 조회(`videos.list` 1회·1유닛) → 누적 DB 저장 → 화면 카드 표시까지 연결하는 실행은 별도 승인 전이므로 수행하지 않음.

## Threads 직접 휴먼터치 업로드 로직 구현 및 검증 (2026-10-14)
- **목적 및 방향**:
  - 공식 Meta Threads Graph API에 의존하지 않고, 로그인된 Threads 웹 화면(`https://www.threads.com/`)에서 실제 사람이 게시물과 첫 댓글(제휴 링크/고지문)을 작성·업로드하는 것과 동일한 **휴먼터치 직접 업로드 흐름**으로 통합 구현함.
- **구현 내용**:
  1. **휴먼터치 DOM 입력·클릭 엔진 (`downloader/studio-upload.js`)**:
     - `humanPause(min, max)`: 단계 간 자연스러운 사고/대기 지연 적용 (JSDOM 테스트 환경에서는 자동 고속 동작).
     - `humanClick(el)`: 부드러운 스크롤(`scrollIntoView`) 후 요소 영역 내부 랜덤 좌표 산출 및 `pointerover` → `mouseover` → `pointermove` → `mousemove` → `pointerdown` → `mousedown` → `focus` → `pointerup` → `mouseup` → `click` 실제 마우스/포인터 이벤트 시퀀스 발생.
     - `humanFill(editor, value)`: 글자/청크 단위 `keydown` → `beforeinput` → `insertText` → `input` → `keyup` 타이핑 및 문장부호·줄바꿈·공백 구간 가변 딜레이 적용.
     - 본문 게시 확인 후 획득한 게시물 permalink로 첫 댓글(제휴 링크 등)까지 동일한 휴먼터치 흐름으로 자동 작성·게시.
     - 전용 브라우저(`127.0.0.1:5006`)와 단독 도우미(`127.0.0.1:5005`) 양쪽 포트 모두 지원하도록 `packetUrl` 허용 범위 확장.
  2. **전용 Electron 브라우저 직접 업로드 매니저 및 브리지 (`studio-browser/threads-upload.cjs`, `studio-browser/site-preload.cjs`, `studio-browser/main.cjs`)**:
     - Chrome 확장 프로그램 없이도 전용 Electron 브라우저(`studio-browser`) 자체에서 즉시 게시·예약 게시·취소·상태 조회가 동작하도록 `createThreadsUploadManager` 구현.
     - `upload-queue.json` 영구 큐 저장, 30MB 용량 제한 확인, 예약 시각 스케줄러, 중단/재시작 시 `running` → `uncertain` 전환으로 중복 게시 방지.
     - 업로드 진행 중(`uploadManager.isBusy()`)일 때 앱 종료(`attemptGracefulQuit`) 및 개발 감시 재시작(`devWatcher`)을 보류하여 업로드 도중 브라우저가 닫히지 않도록 보호.
  3. **제작 스튜디오 UI 정리 (`downloader/studio_web/index.html`, `downloader/studio_web/studio.js`)**:
     - 공식 API 게시 설정 블록을 숨김(`hidden`) 처리하고, 게시 섹션을 **Threads에서 게시 (휴먼터치 직접 업로드)** 중심으로 안내 문구 및 버튼(`Threads에서 지금 업로드`, `이 시각에 업로드`) 정리.
     - `studio.js`의 비동기 `update()` 실행 중 새 작업(`#new-job`) 전환 시 레이스 컨디션 방어 로직 추가.
- **검증 결과**:
  - `node downloader/test_studio_upload.js`: PASS
  - `node downloader/test_studio_upload_dom.js`: PASS (휴먼터치 본문 게시 + 첫 댓글 게시 + 실패 시 원문 보존 검증)
  - `node downloader/test_studio_local_bridge.js`: PASS
  - `node downloader/test_studio_ui.js`: PASS
  - `node downloader/test_studio_workspace.js`: PASS
  - `node studio-browser/test_threads_upload.cjs`: PASS (전용 브라우저 큐 등록·예약 취소·즉시 실행·중단 시 `uncertain` 복구 검증)
  - `node studio-browser/test_isolated_scenarios.cjs` & `node studio-browser/test_shutdown.cjs`: PASS

## 보존된 Antigravity 리다이렉트 후보(27개) → YouTube 상세 확인(1유닛) → 누적 카탈로그 저장 → 실제 화면 응답 검증 (2026-10-14)
- **실행 범위 (반복 검색 0회 · SerpAPI 0회 · 승인된 YouTube `videos.list` 1회/1유닛)**:
  - 직전 보존된 Antigravity 감사 파일(`%LOCALAPPDATA%\ONEWS\studio\gemini_discovery_audits\eee8ef48fc97478494dccbe30888994e\latest-response.json`)에서 리다이렉트 변환(`resolve_grounding_redirects` + `antigravity_transcript_sources`)으로 확보한 **고유 11자리 영상 ID 27개**를 대상으로, 새 Antigravity CLI 세션을 열지 않고 실제 YouTube Data API v3 `videos.list`(`part=snippet,contentDetails,statistics,status`, 27개 ID 일괄 조회) **단 1회(1유닛)**만 호출함.
- **단계별 검증 결과**:
  1. **YouTube 상세 확인 (`videos.list` 1회 · 1유닛 — 성공)**:
     - HTTP 200 응답으로 27개 영상 전체의 상세 메타데이터(제목, 채널명/채널ID, 길이, 조회수, 업로드일, 라이선스 등)를 확인함.
     - YouTube 사용량 기록(`youtube_discovery_cache.json`): `requests_count` 162 → **163회 (+1)**, `quota_units` 6,803 → **6,804유닛 (+1)**, SerpAPI 호출 **0회 (27회 그대로 유지)**.
  2. **누적 카탈로그 영구 저장 (`discovery-catalogue.sqlite3` — 성공)**:
     - `DiscoveryCatalogue.add(..., source_type='antigravity_search')`를 통해 확인된 27개 영상을 영구 저장함.
     - 누적 영상 수: 기존 872개 → **899개 (+27개 신규 저장)**, 등록 채널 수 **363개**.
  3. **원시 캐시 연동 및 실제 `/studio/discovery` 응답 확인 (성공)**:
     - `antigravity_search` 원시 캐시에 검증된 후보와 29개 검색 출처(`gemini_search_sources`, `redirect_url` 및 변환된 최종 URL 포함), 관측 검색어 6개(`gemini_search_queries_observed: 6`)를 기록함.
     - 실행 중인 전용 앱 도우미(`http://127.0.0.1:5006/studio/discovery?archive=0&unseen=0&provider=antigravity_search&country=KR&mode=shopping&category=living_kitchen&published_range=90d&min_views=0&sort_by=relevance&limit=30&page=1`) 조회 결과:
       - `HTTP 200 OK`, `verification_status: "실서비스 연결됨"`, `provider: "antigravity_search"`
       - 쇼핑 쇼츠/관련성/최근 90일 필터를 통과한 **유효 후보 13개**(`36PrR06QCd8` 살림설렘 30초 2.6만회, `GmAqt0H_cnI` 살림톡톡 29초 3.5만회, `BKkPurocO7Y` 리뷰하는언니 20초 1.2만회, `kuxJCEICKxo` 쿠팡꿀템 28초, `sPJffYnI1NA` 다이소 주방 정리템 등)와 검색 출처 링크(`gemini_search_sources` 29개)가 정상 반환됨을 확인함.

## 전용 브라우저 네이티브 다운로드 브리지 및 전체 회귀 테스트 완결 (2026-10-14)
- **전용 브라우저(`studio-browser`) 보완**:
  - `studio-browser/main.cjs`: `trackSiteDownloads(contents)` 및 `recentDownloads` 목록 관리 추가, `studioListDownloads`·`studioGetDownload` IPC 핸들러를 실제 완료된 파일 목록 및 원본 게시물 주소(`source`)와 연결하여 스튜디오 `[다운로드 및 수집]` 워크스페이스에서 즉시 불러올 수 있도록 완성.
  - `studio-browser/helper-manager.cjs`: `resolvePythonPath()`를 추가하여 환경변수(`TAKOH_PYTHON`), 번들 런타임(`runtime/python/python.exe`), 로컬 가상환경(`.venv`), Python 3.11/3.12 경로를 순차 탐색하도록 개선.
  - `downloader/content-threads.js`: 동일 게시물 내 다중 미디어(영상 + 별도 이미지 링크 `a[href*="/post/"][href*="/media"]`)가 동일 좌표를 가질 때 이미지가 비디오 포스터로 오인되어 개별 다운로드 버튼이 누락되지 않도록 `videoForImage` 판별 보강.
- **전체 자동화 테스트 통과 현황**:
  - Python 단위 테스트 (`python -m unittest discover -s downloader -p "test_*.py"`): **128개 전체 통과 (`OK`)**
  - JavaScript / Electron CJS 단위·DOM 회귀 테스트 (`downloader/test_*.js` 19개 + `studio-browser/test_*.cjs` 3개): **22개 스위트 전체 통과 (`PASS`)**




## 2026-10-15 KIE 통합
KIE 독립 공급자와 키·모델·가격·크레딧·분석·초안·번역 UI 구현. 상세 범위와 미검증 항목은 KIE-INTEGRATION.md 참조. 실제 키 및 유료 생성은 미검증. 기존 로컬 변경 보존.


## 2026-10-15 API 설정 UX 정리
AI 연결 / 콘텐츠 검색·제휴 / 사용량·등록 현황으로 분리. 선택 서비스 키만 노출, 서비스→키→모델 순서, KIE 고급·번역 접기. DOM 검증 통과(기존 핸들러·분류·서비스 전환·중복 ID). 키·유료 외부 요청·서버 재시작 없음.

실서버 신규 asset 경로 404 발견 후 기존 studio.js/studio.css에 통합하여 재시작 없이 제공하도록 수정. 실제 HTTP 제공 확인. 유료 공급자 호출 없음. 네이티브 화면은 창 조작 제약으로 최종 시각 검증 미완료.


## 2026-10-15 API 설정 카드 UX
5개 서비스 선택 카드, 선택 강조, 연결/모델 2열 배치, 780px 이하 단일열, 버튼 높이44px·간격12px, 고급/삭제 분리. 기존 핸들러·KIE DOM 회귀 통과. 격리 Chromium 1440px/390px 렌더 확인(가로 넘침 없음). 실제 공급자 호출·키 변경·앱/도우미 재시작 없음.


## 2026-10-15 배포 준비 실행 계획
RELEASE-READINESS-PLAN.md에 A~L 12단계, 퇴행 방지·증거 구분·복구·비용/게시 권한 경계·새 PC 배포 검증 기준 작성. 이번 작업은 계획 작성이며 실제 배포 구현·승인·패키징을 수행하지 않음.

## 2026-10-15 배포 준비 단계 A~E 구현 및 전수 검증 완결
- **단계 A (실행 기준점 & 시스템 빌드 노출)**:
  - 포트 5006/5005 소유권 및 단일 진입점 추적 확정.
  - `/studio/connections-status` 및 스튜디오 UI에 안전한 시스템 빌드 정보 (`app_version: '3.5.0'`, `commit_id: '55cd118'`, `is_dirty: true`, `schema_version: 'v5_verified_published_date'`, `helper_port: 5006`) 노출 (개인정보·키 유출 0건).
- **단계 B (게시·삭제 데이터 무결성 확보 — P1 3종 완결)**:
  - B1: 다중 첨부 사전 검증 (`threads-upload.cjs`) — 캐러셀 10개 초과, 다운로드 404/실패, 0바이트, 30MB 초과 시 즉시 게시 사전 차단.
  - B2: 게시 완료·댓글 판정 엄격화 (`studio-upload.js`) — 과거 게시물 링크 오인 방지(`oldLinks`, `oldPostIds` 영구 배제, 계정·본문·타임스탬프 3중 검증).
  - B3: 수집/보관함 탭 전환 비동기 응답 순서 역전 차단(`referenceLoadSeq`) 및 카드 레벨 삭제 collection 고정.
- **단계 C & D (런타임 안정성 & 설정 UX)**:
  - `test_shutdown.cjs` (PASS) 및 `test_studio_kie_dom.js` (PASS).
- **단계 E (회귀 해결 및 전체 테스트 전수 통과)**:
  - 캐시 버전 상수(`FILTER_VERSION = 'v5_verified_published_date'`) 모듈 레벨 정의.
  - 분석/원문 없는 초안 요청 400 거절 및 제휴 상품 `#광고` 필수 검증 반영.
  - 영상 획득 시 포스터 이미지 422 거절 로직 보강.
  - 쿠팡 정밀 검색 쿼리(`site:www.coupang.com/vp/products`) 테스트 동기화.
  - **전체 자동화 테스트 통과 현황**:
    - Python 단위 테스트 (`python -m unittest discover -s downloader -p "test_*.py"`): **139개 전체 통과 (`Ran 139 tests in 85.190s, OK`)**
    - Node.js 단위·DOM 회귀 테스트: **5개 스위트 전체 통과 (`PASS`)**


## 2026-10-15 Threads 상품 관련 탐색
THREADS-RESEARCH.md 참조. 비로그인 관련 수집·계정 누적·상업성 단서·공개 반응·기존 로그인 원문/작성자 댓글 검사·제품 확인·레퍼런스 전송 구현. 격리 테스트 통과. 실사이트 예시는 로그인 요구로0건 중단 확인; 전체 실수집 미검증. 앱 시작 코드 적용은 정상 재실행 필요. 기존 앱/도우미·사용자 자료 유지.

정상 재실행 승인 후 앱/5006이 이미 닫힌 상태 확인→기존 start-browser.bat 실행→도우미 busy=false→실제 Threads 상품 레퍼런스 UI 표시 확인. 생산 테스트 항목 생성·공개 게시·유료 API 호출 없음. /share/ 단축 주소는 현재 고유 게시물 주소로 연 뒤 사용해야 함.


## 2026-10-15 공유 링크 입력 오류 수정
/share/ 링크를 공식 도메인의 게시물 주소로 실제 연결한 뒤 수집하도록 수정. 프로토콜 생략·앞뒤 공백 지원, 외부 도메인/자격증명/포트 차단,25초 로딩 상한 추가. 실사이트 공유 링크1건 고유 주소 연결 확인, 이후 로그인 요구는별도 상태로0건 중단. 격리 회귀 통과. 사용자 승인 후 정상 재실행 적용 진행.


## 2026-10-15 모바일 및 연속 탐색
출발 게시물→관련→프로필→다른 게시물의 영속 대기열, 중복 제거, 실행 한도, 일시정지/이어가기와 정상 사이트 X 닫기를 구현했다. 앱 종료 전에 탐색을 멈춘다. 기존 로그인·키·참조 데이터는 변경하지 않는다.
격리 회귀 테스트와 실제 별도 Electron 저장소에서 4+4페이지 이어 방문을 확인했다. 누적 콘텐츠25개·계정10개이며 사용자 저장소에 테스트 자료를 주입하지 않았다. 실제 실행의 X 클릭은0회이므로 팝업 자동 닫기의 실사이트 성공 증거와 구분한다. 사용자 승인으로 정상 재실행 적용을 진행한다.
실제 적용 확인: 사용자 승인 후 기존 앱에 정상 닫기를 전달했다. 5006 종료와 프로필 잠금 자동 해제를 확인한 뒤 start-browser.bat으로1회 실행했다. 새 메인 PID50208, /studio/busy-status HTTP200(active_count=0), 실제 창의 ‘도우미 연결됨’과 확장 탐색/이어가기/일시정지 버튼을 확인했다. 기존 후보7개도 화면에서 유지됐다. 이번 적용 확인에서 생산 탐색이나 외부 유료 API 호출은 실행하지 않았다.

## 2026-10-15 Threads 탐색 별도 작업 탭
콘텐츠 발견 내부에 붙어 있던 연구 화면을 상단 ‘Threads 상품 탐색’ 작업 탭으로 분리했다. 기존 DOM 이벤트·수집 자료·영속 대기열을 공유하고 탭 이동으로 탐색을 시작하거나 중단하지 않는다. 마지막 선택 탭 보존과 workspace=research 진입을 지원한다. 연구 DOM 회귀/기존 레퍼런스 흐름/JS 구문 검사 통과. 실제 실행 앱을 재시작하지 않고 화면 새로고침하여 새 탭 표시 및 선택, 확장 탐색 버튼과 기존 저장 자료 표시를 확인했다. 외부 검색이나 생산 탐색은 실행하지 않았다.

## 2026-10-15 연구 탭 너비 수정
별도 main이 공통 240px 사이드바 그리드를 상속하여 본문이 좁아진 원인을 확인했다. research-workspace를 display:block, width:100%, max-width:none으로 한정 수정하고 모바일 여백·단일 카드 열·긴 상태문 줄바꿈을 지정했다. 실제 앱 새로고침 후 1366px 창에서 탐색 패널이 좌우 가용 폭을 사용하는 화면을 확인했다. 작은 화면용 CSS는 추가했으며 별도 모바일 실측은 하지 않았다. 데이터 및 탐색 동작 변경 없음.

## 2026-10-15 프로필의 새로운 게시물 우선 확장
깊이 순 대기열을 프로필의 미방문 게시물→새 작성자 프로필→대기 중 관련 게시물 우선순위로 변경했다. 프로필에서 이미 방문한 글은 게시물 수 한도에 포함하지 않고, 기존 관련 후보와 겹쳐 대기 중인 글은 프로필 탐색 우선순위로 승격한다. 제품 문구·외부 링크·광고 태그 단서를 우선하되 동일 제품 자동 판정은 하지 않는다. 새 게시물에서 발견한 관련 콘텐츠로 계속 확장하며 게시물ID 중복 제거를 유지한다. 격리 테스트에서 프로필/새 게시물 우선 방문, 원래 링크 재방문 없음, 한도1에서도 기존 글을 건너뛰어 새 글 방문 및 기존 연구 회귀 통과. 새 스케줄러는 메인 프로세스 모듈이므로 실제 앱 적용은 정상 재실행 필요. 실사이트 새 순서 실행은 아직 미검증.

## 2026-10-15 반응 수치·썸네일·언어 구분
미추출 수치를 ‘미공개’로 단정한 UI를 ‘미확인’으로 정정했다. SVG aria-label뿐 아니라 title 속성/title 요소의 반응 라벨을 읽고, 원문 상단의 조회수 라벨을 게시물 카드와 분리하여 읽는다. 별도 detail_metrics가 화면에 반영되지 않던 문제를 수정하여 최신 확인 수치와 기존 수치의 null 보완 값을 표시·정렬한다. 본문 이미지/영상 포스터의 CDN 썸네일을 저장·표시하고 상세 갱신에서 기존 자료에 보완한다. 카드별 ‘수치·썸네일 갱신’은 로그인 세션 원문 창을 열어 DOM을 제한적으로 다시 읽는다.
한국어/해외 언어/미확인 표시·필터를 추가했다. 시간·작성자 같은 한국어 UI를 제거한 본문 문자 기준이며 계정 국적이나 소재국 판정이 아니다. 이미지 속 언어/OCR은 미지원이다.
검증: 사용자와 같은 형태의 DOM에서 조회88/좋아요5/댓글5/썸네일 추출 테스트 통과. 별도 실제 공개 페이지 DeRYIpXEgfY에서 좋아요92/댓글4/리포스트14/썸네일 추출 확인. 해당 비로그인 화면에는 조회 라벨이 없어서 조회수 null이며 스크린샷의88을 실제 수집값으로 복사하지 않았다. 기존 연구 회귀 통과. 승인된 정상 종료·재실행 후 실제 앱에서 언어 필터·갱신 버튼과 기존 콘텐츠180개/계정41개 유지 확인. 실제 저장된 원문 수치(조회17000·좋아요181·댓글14·리포스트15)가 카드에 표시되고 썸네일도 나타나는 화면을 확인했다. 이전 탐색 순서 변경도 함께 적용됐다. 사용자가 보고 있는 자료에 대량 재조회는 하지 않았다. 누락된 기존 썸네일/수치는 원문 갱신 또는 이후 탐색 시 보완된다.

## 2026-10-15 미디어 중심 레퍼런스 선별
목적을 계정/게시물 개수 누적에서 제작할 새 미디어와 반응이 좋은 반복 미디어 선별로 변경했다. 추출 결과에 실제 본문 media_assets/media_checked를 기록한다. 프로필 사진·외부 링크 미리보기·크기가 작은 아이콘을 제외하며 작성자 댓글은 원문 근거로만 유지하고 새 콘텐츠로 등록하지 않는다. 실제 미디어가 없는 새 글은 콘텐츠 저장/확장 후보에서 제외한다. 기존 기록은 삭제하지 않고 확인 대기/제외로 분류한다.
로컬 research-previews에 실제 CDN 이미지를 제한된 크기·시간으로 받아 디코딩하고 JPEG 미리보기·SHA256·dHash를 저장한다. 외부 리다이렉트 및 임의 호스트는 차단한다. 정상 카드는 디코딩된 로컬 미리보기가 있어야 표시한다. 미확보·실패는 확인 대기로 분리한다. 본문이 변경되면 이전 미리보기를 무조건 재사용하지 않는다.
같은 미디어 경로/이미지 바이트/가까운 썸네일 해시로 묶고 확인된 조회수가 높은 글을 대표로 표시한다. 상품명만 같다는 이유로 묶지 않으며 캐러셀의 첫 장만 같을 때 전체 중복으로 확정하지 않는다. 썸네일 유사는 ‘유사 후보’로 구분하며 사용자가 별개 콘텐츠로 분리할 수 있다. 영상 전체 프레임·오디오 비교나 변경된 표지의 동일 영상 탐지는 이번 구현에 포함되지 않으며 새로움은 수집 범위 내 중복 미발견을 뜻한다.
UI: 새로운 콘텐츠, 반응 좋은 콘텐츠(조회수 순), 중복·유사 묶음, 제품 관련성 검토, 미디어·썸네일 확인 대기, 미디어 없는 글/제외 기록. 기존 자료 점검은 최대5개 원문을 순차 확인한다. 신규 수집은 페이지 사이 대기2.8초, 페이지당 미리보기 최대8개이며 나머지는 확인 대기에 보존한다. 사용자 제품 확인과 미디어·미리보기 확인이 모두 있어야 레퍼런스로 전송한다.
검증: 미디어/댓글/프로필 제외, 중복 대표 선택·개수, 다른 콘텐츠 분리, 서로 다른 캐러셀 보호, 새 콘텐츠/중복/확인 대기 UI, 기존 연구·대기열·레퍼런스 회귀 통과. 별도 실제 Electron 저장소에서 사용자 예시 DedwZ7OEgmW를 읽어 본문/댓글2개 중 미디어가 있는 본문1개만 저장, 이미지2개·좋아요5/댓글5/리포스트1·실제 썸네일 캐시 및 재조회 성공. 해당 비로그인 화면의 조회수는 미확인으로 유지했다. 이 검증에 생산 자료를 주입하지 않았다.

실제 적용 검증: 사용자 정상 재실행 승인 후 앱/직접 시작한5006을 정상 종료하고 새로 실행했다. 기존 생산 자료180개/계정41개/대기열101개를 보존했다. 실제 앱의 기존 자료 점검 버튼으로5개 원문을 읽어 썸네일5개 캐시, 제품 후보3개/관련성 검토2개/미확인175개를 확인했다. 이번5개에는 중복그룹이 없으므로 실제 중복그룹 성공 증거와 구분한다. 초기 실제 화면에서 기존 CSP가 data 이미지 미리보기를 막아 표시가 실패하는 것을 발견했으며 img-src에만 data:를 허용하고 재적용했다. 다른 개발 작업의 studio.py 변경은 보존하고 CSP 한 줄만 부분 스테이징했다.
최종 실제 화면 확인: CSP 재적용 뒤 사용자 앱의 새로운 콘텐츠 목록에서 @peachymira__, @acik.haha, @nisrna_의 실제 미디어 썸네일3개와 반응 수치가 정상 표시되는 것을 화면으로 확인했다. 탐색 설정을 접고 콘텐츠 목록·언어·정렬을 먼저 표시하도록 정리했다. 기존 자료의 재점검은5개까지만 수행했으며 남은175개는 여전히 확인 대기다.

## 2026-10-15 게시물 ‘제품 찾기’ 시작·간단 카드
연구 화면을 ‘Threads에서 제품 찾기 → 찾은 제품 콘텐츠’ 순서로 정리했다. 긴 사용 안내, 카드 본문·문구·링크·발견 경로·제품 확인·갱신은 기본 닫힌 자세히 보기로 이동했다. 기본 카드는 실제 미리보기·계정·조회/좋아요/댓글·저장 버튼 중심이다. 주소 입력은 고급 설정에만 남겼다.
전용 앱의 Threads 게시물 툴바에 ‘제품 찾기’를 추가했다. 클릭한 게시물의 고유 주소를 native IPC로 전달하며 mainFrame/공식 Threads 호스트 검사와 고정 탐색 한도를 적용한다. 원문 세션은 유지하고 별도 비로그인 창을 사용한다. 새 선택 출발점과 그 분기를 먼저 처리하고 이전 대기열은 삭제하지 않는다. 클릭 자체로 보관함 저장이나 게시를 하지 않는다.
댓글이 많아 관련 스레드 DOM 영역이 확인되지 않는 경우 추가 댓글 스크롤을 하지 않고 원문 미디어를 확인한 뒤 작성자 프로필로 전환한다. 관련 미표시와 후보 없음은 구분하고 프로필 전환 횟수를 상태에 표시한다. 이유가 댓글 수 때문이라고 자동 단정하지 않는다.
검증: 게시물당 버튼1개·정확한 선택 URL 전달·독립 클릭, 새 분기 우선/기존 대기열 보존, 관련 미표시→프로필 대기열, 기본 닫힌 상세/콘텐츠 순서/기존 연구 UI 회귀 통과. 실제 앱에서 사용자 예시 DedwZ7OEgmW의 제품 찾기를 눌러 별도 비로그인 창이 같은 게시물로 열리고 selected_branch/seed가 일치하며 관련 게시물/프로필 탐색으로 진행하는 것을 확인했다. 최초 연결 검증에서8페이지까지 처리되었으며 대기열·자료는 보존했다. 댓글 미표시 분기의 추가 변경은 격리 테스트로 확인했으며 특정 다댓글 게시물의 실사이트 합격으로 주장하지 않는다.
최종 적용 확인: 현재 앱은 정상 실행/도우미 연결 상태이며 탐색은 일시정지로 복구되어 자동으로 계속 돌지 않는다. 실제 화면에서 ‘Threads에서 제품 찾기’가 콘텐츠 목록보다 위에 있고, 카드가 썸네일·계정·반응·닫힌 ‘자세히 보기’·수집 버튼으로 표시되는 것을 확인했다. 연결 검증으로 누적 자료는188개/계정43개가 되었고 기존 자료는 유지됐다. 현재 대기 후보101개는 보존됐다.
