"""
TAKOH Media Downloader PRO - 단일 통합 배포 빌드 스크립트 (build.py)
================================================================
실행 방법:
    python build.py
"""

import os
import sys
import shutil
import zipfile
import json
from pathlib import Path

BASE_DIR = Path(__file__).parent
VERSION = json.loads((BASE_DIR / 'manifest.json').read_text(encoding='utf-8'))['version']
DIST_DIR = BASE_DIR / f"dist_release_v{VERSION}"
EXT_DIR = DIST_DIR / "TAKOH_Extension"
HELPER_DIR = DIST_DIR / "TAKOH_Helper"
ZIP_NAME = f"InThread_Cheatkey_TAKOH_v{VERSION}.zip"

EXTENSION_FILES = [
    "background.js",
    "content-core.js",
    "content-studio.js",
    "studio-extension.js",
    "studio-upload.js",
    "studio-local-bridge.js",
    "content-threads.js",
    "content-instagram.js",
    "content-youtube.js",
    "content-youtube-main.js",
    "content-coupang.js",
    "content-facebook.js",
    "content-tiktok.js",
    "content-douyin.js",
    "content-xhs.js",
    "content-twitter.js",
    "content-pinterest.js",
    "content-naver-clip.js",
    "content-1688.js",
    "content-reddit.js",
    "content-meta-main.js",
    "content-xhs-main.js",
    "popup.js",
    "popup-workspace.js",
    "popup.html",
    "popup.css",
    "content.css",
    "manifest.json"
]

HELPER_FILES = [
    "app.py",
    "studio.py",
    "studio_integrations.py",
    "studio_writing.py",
    "studio_ai.py",
    "TAKOH_Helper.exe",
    "start_helper.bat",
    "start_helper.command",
    "start_helper.sh",
    "requirements.txt",
    "ffmpeg.exe",
    "aria2c.exe",
    "설명서.txt",
    "설명서.pdf",
    "Mac_설명서_필독.txt"
]

def clean_and_build():
    print("============================================================")
    print(f"  TAKOH Media Downloader PRO - 통합 패키지 빌드 시작 (v{VERSION})")
    print("============================================================")

    # 1. Clean old dist directory
    helper_exe = BASE_DIR / 'helper_build_dist' / 'TAKOH_Helper.exe'
    helper_sources = [BASE_DIR / 'app.py', BASE_DIR / 'studio.py', BASE_DIR / 'studio_integrations.py', BASE_DIR / 'studio_writing.py', BASE_DIR / 'studio_ai.py', *list((BASE_DIR / 'studio_web').glob('*'))]
    if not helper_exe.is_file() or any(helper_exe.stat().st_mtime < source.stat().st_mtime for source in helper_sources):
        raise RuntimeError('수정된 app.py로 도우미 EXE를 먼저 다시 빌드해야 합니다.')
    for filename in EXTENSION_FILES + HELPER_FILES:
        source = helper_exe if filename == 'TAKOH_Helper.exe' else BASE_DIR / filename
        if not source.is_file():
            raise FileNotFoundError(f'배포 필수 파일 누락: {source}')
    if DIST_DIR.exists():
        if DIST_DIR.resolve().parent != BASE_DIR.resolve():
            raise RuntimeError('배포 디렉터리 경로 확인 실패')
        shutil.rmtree(DIST_DIR)

    EXT_DIR.mkdir(parents=True, exist_ok=True)
    HELPER_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BASE_DIR / 'studio_web', HELPER_DIR / 'studio_web')

    # 2. Copy extension files
    print("\n[1] 크롬 확장프로그램 파일 복사 중...")
    for f in EXTENSION_FILES:
        src = BASE_DIR / f
        if src.exists():
            shutil.copy2(src, EXT_DIR / f)
            print(f"  [확장] {f}")

    icons_dir = BASE_DIR / "icons"
    if icons_dir.exists():
        shutil.copytree(icons_dir, EXT_DIR / "icons", dirs_exist_ok=True)
        print("  [폴더] icons/")

    # 3. Copy helper files
    print("\n[2] 로컬 도우미 프로그램 파일 복사 중...")
    for f in HELPER_FILES:
        src = helper_exe if f == 'TAKOH_Helper.exe' else BASE_DIR / f
        if src.exists():
            shutil.copy2(src, HELPER_DIR / f)
            print(f"  [도우미] {f}")

    (DIST_DIR / '시작하기.txt').write_text(
        f'인스레드 치트키 by TAKOH {VERSION} 통합 배포본\n\n'
        '1. Windows: TAKOH_Helper 폴더의 start_helper.bat을 실행합니다. Python 설치는 필요 없습니다.\n'
        '2. Chrome/Edge 확장프로그램 관리에서 개발자 모드를 켜고 TAKOH_Extension 폴더를 로드합니다.\n'
        '3. 기존 설치를 업데이트하면 해당 폴더를 덮어쓴 뒤 확장프로그램과 사이트 페이지를 새로고침합니다.\n'
        '4. 이전 도우미 창을 닫고 새 도우미를 실행하세요. 다운로드 중에는 창을 닫지 마세요.\n'
        '5. 콘텐츠 옆 수집 버튼 → 확장 패널 콘텐츠 보관함 → 분석·상품 찾기를 사용합니다. 별도 레퍼런스 확장은 필요 없습니다.\n'
        'Mac/Linux: 도우미의 start_helper.command 또는 start_helper.sh를 사용합니다. Python이 필요합니다.\n'
        '포트 5005가 다른 프로그램에서 사용 중이면 해당 프로그램을 직접 확인하세요.\n', encoding='utf-8')

    # 4. Create ZIP package (with Unix execute permissions for Mac shell scripts)
    print("\n[3] 최종 ZIP 배포 압축 파일 생성 중...")
    zip_path = BASE_DIR / ZIP_NAME
    if zip_path.exists():
        zip_path.unlink()

    # Files that need Unix execute permissions (chmod 755) for macOS
    EXEC_EXTENSIONS = {'.command', '.sh'}

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fpath in sorted(DIST_DIR.rglob('*')):
            if fpath.is_file():
                arcname = fpath.relative_to(DIST_DIR)
                arcname_str = str(arcname)

                if fpath.suffix.lower() in EXEC_EXTENSIONS:
                    # Embed Unix rwxr-xr-x (755) permission into ZIP external attributes
                    # Upper 16 bits of external_attr = Unix file permission mode
                    zi = zipfile.ZipInfo(arcname_str)
                    zi.compress_type = zipfile.ZIP_DEFLATED
                    zi.external_attr = 0o100755 << 16  # chmod 755
                    with open(fpath, 'rb') as f:
                        zf.writestr(zi, f.read())
                    print(f"  압축 [+x]: {arcname}")
                else:
                    zf.write(fpath, arcname_str)
                    print(f"  압축: {arcname}")

    zip_size = zip_path.stat().st_size / (1024 * 1024)
    print("\n============================================================")
    print(f"[OK] 빌드 완료! 생성된 압축 파일: {ZIP_NAME} ({zip_size:.1f} MB)")
    print("============================================================")

if __name__ == "__main__":
    clean_and_build()
