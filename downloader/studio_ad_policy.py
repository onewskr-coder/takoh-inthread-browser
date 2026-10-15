"""Platform-specific commerce disclosure; local video variants preserve originals."""
import hashlib
from pathlib import Path
import re

POLICY_VERSION = 'platform-ad-v1'
VIDEO_AD_PLATFORMS = {'instagram_reels', 'instagram_carousel', 'instagram', 'tiktok', 'naver_clip'}

def disclosure_body(body, platform):
    clean = re.sub(r'^\s*(?:(?:#광고|\[광고\])\s*)+', '', str(body or '')).strip()
    return ('#광고' if platform == 'threads' else '[광고]') + (' ' + clean if clean else '')

def prepare_ad_video(source, binary, run, inspect):
    source = Path(source)
    if not binary:
        raise ValueError('영상 [광고] 표시용 FFmpeg를 찾지 못했습니다.')
    font = Path('C:/Windows/Fonts/malgunbd.ttf')
    if not font.is_file():
        raise ValueError('영상 [광고] 표시용 한글 글꼴을 찾지 못했습니다.')
    key = hashlib.sha256(source.read_bytes() + POLICY_VERSION.encode()).hexdigest()
    folder = source.parent / 'ad-variants'
    folder.mkdir(exist_ok=True)
    target = folder / (key + '.mp4')
    if target.is_file() and target.stat().st_size:
        return target
    info = inspect(binary, source)
    size = max(16, round(min(info['width'], info['height']) * .045))
    font_arg = str(font).replace('\\', '/').replace(':', r'\:')
    vf = f"drawtext=fontfile='{font_arg}':text='[광고]':fontsize={size}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=8:x=20:y=20"
    temporary = folder / (key + '.partial.mp4')
    try:
        result = run(binary, ['-y', '-i', str(source), '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf,
                              '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
                              '-c:a', 'aac', '-movflags', '+faststart', str(temporary)])
        if result.returncode or not temporary.is_file() or not temporary.stat().st_size:
            raise ValueError('영상 [광고] 표시 생성에 실패하여 게시 준비를 중단했습니다.')
        checked = inspect(binary, temporary)
        if checked['width'] != info['width'] or checked['height'] != info['height']:
            raise ValueError('광고 표시 영상의 크기가 원본과 달라 게시 준비를 중단했습니다.')
        temporary.replace(target)
        return target
    finally:
        temporary.unlink(missing_ok=True)
