# GEMINI.md — 타코 · 인스레드 치트키 (TAKOH Studio Browser) 필수 개발 규칙

이 파일은 Antigravity / Gemini / Codex 에이전트가 이 프로젝트에서 작업할 때 **항상 자동으로 로드하는 최상위 개발 규칙(Workspace Rule)**입니다.

## 1. 아키텍처 및 프로세스 소유권 원칙
- **전용 브라우저 (`studio-browser/`)**: Electron 기반 앱 (`main.cjs`, `preload.cjs`, `site-preload.cjs`, `threads-research.cjs`, `threads-upload.cjs`).
- **로컬 도우미 서버 (`downloader/`)**: Flask 기반 백엔드 (`app.py`, `studio.py`, `studio_text_clean.py`) 및 프론트엔드 워크벤치 (`studio_web/index.html`, `studio_web/studio.js`, `studio_web/workspace.js`, `studio_web/studio.css`).
- **포트 분리**:
  - 전용 브라우저 앱 도우미 포트: **`127.0.0.1:5006`**
  - 기존 Chrome 확장 도우미 포트: **`127.0.0.1:5005`**
  - 사용자의 명시적 승인 없이 실행 중인 `5005` / `5006` 프로세스를 강제 종료(`taskkill` / `Stop-Process`)하지 마세요.
- **소스 개발 우선**: 일상적인 코드 수정 후 매번 `EXE`나 `ZIP` 배포본을 빌드하지 마세요. 소스 실행(`start-browser.bat` 또는 `npm start`)과 단위·브라우저 검증을 사용합니다.

## 2. 사용자 데이터·세션·보안 보존 원칙 (절대 위반 금지)
- `%APPDATA%\takoh-studio-browser` (로그인 세션·쿠키) 및 `%LOCALAPPDATA%\ONEWS\studio` (수집 레퍼런스, 작업물, API 키, 설정) 데이터를 절대 삭제하거나 초기화하지 마세요.
- API 키, 액세스 토큰, 쿠키, `.env`, 개인 게시물 데이터는 절대 Git에 커밋하지 마세요.
- 단위 테스트나 검증 스크립트는 반드시 임시 격리 폴더(`os.tmpdir()` / `tempfile.mkdtemp()`)를 사용해야 합니다.

## 3. UI / UX 및 디자인 시스템 원칙 (Pro Studio Monochrome)
- **이모지 사용 금지**: UI 버튼, 탭, 배지, 라벨에 장식용 이모지(🎬, 🔥, 🧵, 📌 등)를 넣지 마세요.
- **절제된 전문가용 다크·슬레이트 팔레트**:
  - 주요 색상: `#0f172a` (딥 슬레이트), `#1e293b` (슬레이트 서피스), `#334155` (보더), `#f8fafc` (텍스트).
  - AI가 만든 듯한 알록달록한 무지개색/파스텔/네온 그라데이션 남발을 금지합니다.
- **02-A / 02-B 스튜디오 분리 유지**:
  - `02-A 미디어(영상) 편집`과 `02-B 캐러셀·뉴스카드 편집`은 독립된 워크스페이스 단계로 유지합니다.
  - 캐러셀 본문(`body`) 슬라이드는 8종 테마별로 고유한 레이아웃 구조를 유지해야 합니다.

## 4. 백업 · 수정 · 검증 · 기록 표준 절차
1. 핵심 파일(`studio.py`, `studio_text_clean.py`, `studio.js`, `workspace.js`, `threads-research.cjs`)을 대규모로 수정하기 전에는 `.agents/skills/safe-backup-and-verify/scripts/backup_snapshot.ps1`로 백업 스냅샷을 남기세요.
2. 코드 수정 후에는 반드시 구문 검사(`node --check`, `python -m py_compile`)와 관련 단위 테스트를 실행하세요.
3. 작업이 끝나면 `HANDOFF-RESULT.md`에 변경 파일, 해결 내용, 정적/단위 테스트 결과, 실제 브라우저 검증 증거를 구분하여 기록하세요.
