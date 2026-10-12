#!/bin/bash

# Clear terminal screen
clear

echo "============================================================"
echo "     TAKOH Media Downloader PRO - 로컬 도우미 서버 (Mac/Linux)"
echo "============================================================"
echo ""
echo "이 프로그램은 사용자 Mac/Linux에서 직접 유튜브 우회 다운로드 API를 가동하여"
echo "구글의 데이터센터 IP 차단 정책을 안전하게 우회합니다."
echo ""

# 1. Python3 설치 여부 확인
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[에러] 시스템에 Python3가 설치되어 있지 않습니다."
    echo "https://www.python.org/downloads/ 에서 macOS용 Python을 설치해 주세요."
    exit 1
fi

# Python 버전 체크 (3.x 이상인지)
PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(sys.version_info[0])')
if [ "$PYTHON_VERSION" -ne 3 ]; then
    echo "[에러] Python 3 버전이 필요합니다."
    exit 1
fi

echo "[정보] Python 감지 성공 ($PYTHON_CMD). 로컬 가상환경을 구성하고 패키지를 설치합니다..."
echo ""

# 2. 가상환경 탐색 (.venv, venv 양쪽 호환)
VENV_DIR=""
GLOBAL_MODE=false

if [ -f ".venv/bin/activate" ]; then
    VENV_DIR=".venv"
elif [ -f "venv/bin/activate" ]; then
    VENV_DIR="venv"
else
    echo "[정보] 처음 실행 시 필요한 가상환경 폴더를 생성합니다. (약 10초 소요)"
    $PYTHON_CMD -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[경고] 가상환경 생성에 실패했습니다. 글로벌 Python 환경에 패키지를 설치합니다."
        GLOBAL_MODE=true
    else
        VENV_DIR=".venv"
    fi
fi

# 3. 가상환경 활성화 및 패키지 설치
if [ "$GLOBAL_MODE" != true ] && [ -n "$VENV_DIR" ]; then
    echo "[정보] 가상환경 활성화 중 ($VENV_DIR)..."
    source "$VENV_DIR/bin/activate"
    if [ $? -ne 0 ]; then
        echo "[경고] 가상환경 활성화 실패. 글로벌 Python 환경으로 대체하여 진행합니다."
        GLOBAL_MODE=true
    fi
fi

if [ "$GLOBAL_MODE" = true ]; then
    echo "[정보] 글로벌 패키지 설치 진행 중..."
    $PYTHON_CMD -m pip install --upgrade pip 2>/dev/null
    $PYTHON_CMD -m pip install -r requirements.txt
    echo "[정보] yt-dlp 최신 버전으로 업데이트 중..."
    $PYTHON_CMD -m pip install --upgrade yt-dlp
else
    echo "[정보] 필수 패키지 설치 및 업데이트 진행 중..."
    pip install --upgrade pip 2>/dev/null
    pip install -r requirements.txt
    echo "[정보] yt-dlp 최신 버전으로 업데이트 중..."
    pip install --upgrade yt-dlp
fi

if [ $? -ne 0 ]; then
    echo "[에러] 필수 라이브러리 설치 중 오류가 발생했습니다."
    exit 1
fi

echo ""
echo "[성공] 모든 필요한 패키지 설치 완료. 로컬 서버를 가동합니다!"
echo "============================================================"
echo "* 중요: 브라우저에서 다운로드하는 동안 이 터미널 창을 닫지 마세요!"
echo "* 기본 API 주소: http://127.0.0.1:5005/download"
echo "* yt-dlp 업데이트: http://127.0.0.1:5005/update-ytdlp"
echo "============================================================"
echo ""

if [ "$GLOBAL_MODE" = true ]; then
    $PYTHON_CMD app.py
else
    python app.py
fi
