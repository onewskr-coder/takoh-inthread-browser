# 인스레드 치트키 by TAKOH 3.5.3

Gemini CLI 구독 연결을 Antigravity CLI(agy)로 변경했습니다. 이전 gemini_cli 선택값과 사용자 모델 등록 정보를 새 공급자로 연결합니다. API 키 연결은 별도로 유지합니다.

- agy.exe를 PATH 또는 LOCALAPPDATA/agy/bin에서 찾습니다.
- 로그인 창은 agy를 실행합니다. 계정 로그인 확인과 모델 갱신은 agy models로 확인합니다.
- 이미지 프레임은 격리된 작업 폴더에 전달하고 plan 모드로 JSON 응답을 받습니다. SUCCESS 상태의 완전한 결과만 저장합니다. API 자동 전환과 자동 재시도는 없습니다.
- Antigravity 경로는 프레임 분석만 수행하며 음성 미분석을 명시합니다. 음성이 필요한 경우 Gemini API 연결을 사용합니다.

검증: Python 52개, JavaScript 13개 테스트 통과. 설치된 Antigravity CLI 1.2.17에서 계정 모델 목록 14개를 조회했습니다. Gemini 3.8 Flash Medium으로 합성 빨간색 이미지를 실제 분석해 빨간색 JSON 결과를 확인했습니다.

사용: 새 배포본으로 도우미와 확장을 갱신하고 제작 화면에서 Antigravity CLI를 선택하세요. CLI 설치·로그인 확인 또는 계정 모델 목록 갱신을 누른 뒤 모델을 선택합니다. 로그인이 필요하면 공식 CLI 로그인 창 열기에서 Google 계정으로 로그인하세요.
