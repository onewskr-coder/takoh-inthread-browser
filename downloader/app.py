# app.py - TAKOH Media Downloader Helper Server (Enhanced)
import sys
import os
import io
import json
import subprocess
import threading
import time
import random
import re
import shutil
from urllib.parse import urlparse
from html.parser import HTMLParser

HELPER_VERSION = '3.5.4'

# Ensure Windows Console supports UTF-8 stdout printing safely
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from flask import Flask, request, Response, stream_with_context, jsonify, send_file, after_this_request
from flask_cors import CORS
import yt_dlp
import requests as http_requests
import logging

# Suppress /ping heartbeat logs from flooding the console
log = logging.getLogger('werkzeug')
class QuietPingFilter(logging.Filter):
    def filter(self, record):
        return '/ping' not in record.getMessage()
log.addFilter(QuietPingFilter())

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

import multiprocessing

# Add PyInstaller freeze_support for Windows executable multiprocessing protection
if __name__ == '__main__':
    multiprocessing.freeze_support()

# ========== yt-dlp & ffmpeg auto-update on startup ==========
def auto_update_ytdlp():
    """Silently attempt to update yt-dlp to latest master/nightly and imageio-ffmpeg on startup."""
    if getattr(sys, 'frozen', False):
        print("[TAKOH Helper] 실행 파일(EXE) 모드로 실행되었습니다.")
        return
    try:
        print("[TAKOH Helper] yt-dlp 및 1080p 고화질 ffmpeg 인코더 최신 업데이트 점검 중...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "--no-deps", "https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40
        )
        print("[TAKOH Helper] 1080p Full-HD 고화질 결합 엔진 준비 완료 (최신 yt-dlp 엔진)!")
    except Exception as e:
        print(f"[TAKOH Helper] 엔진 준비 완료.")

# Run update in background thread
# Updates are explicit: importing or starting the server must not replace its engine.

# ========== Common yt-dlp options builder ==========
def build_ydl_opts(quality=None, format_spec=None, extra_opts=None):
    """Build yt-dlp options with quality preference and anti-blocking techniques."""
    if format_spec:
        target_format = format_spec
    elif quality == '720p':
        target_format = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best'
    elif quality == '480p':
        target_format = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best'
    else: # 'best' or '1080p'
        target_format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best'

    opts = {
        'format': target_format,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'socket_timeout': 15,
        'retries': 10,
        'fragment_retries': 10,
        'concurrent_fragment_downloads': 4,
        'noplaylist': True,
        'ignoreerrors': False,
    }
    if extra_opts:
        opts.update(extra_opts)
    return opts


@app.route('/')
@app.route('/ping')
def ping():
    try:
        ytdlp_version = yt_dlp.version.__version__
    except Exception:
        ytdlp_version = "unknown"
    return jsonify({
        "status": "ok",
        "helper_version": HELPER_VERSION,
        "message": "TAKOH Media Downloader Helper Server is running!",
        "ytdlp_version": ytdlp_version,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    })


class PinterestScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.collect = False
        self.parts = []
        self.documents = []
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        if tag == 'link' and dict(attrs).get('rel') == 'canonical':
            self.canonical = dict(attrs).get('href')
        if tag == 'script':
            self.collect = dict(attrs).get('type') in ('application/ld+json', 'application/json')
            self.parts = []

    def handle_data(self, data):
        if self.collect:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.collect:
            try:
                self.documents.append(json.loads(''.join(self.parts)))
            except ValueError:
                pass
            self.collect = False


def pinterest_pin_id(url):
    parsed = urlparse(url or '')
    if parsed.scheme not in ('http', 'https') or not re.fullmatch(r'(?:[\w-]+\.)*pinterest\.(?:com|co\.kr)', parsed.hostname or ''):
        return None
    match = re.match(r'^/pin/(?:[\w-]+--)?(\d+)(?:/|$)', parsed.path)
    return match.group(1) if match else None


def pinterest_embedded_mp4(documents, pin_id, canonical_url=None):
    candidates = []
    allowed_ids = {pin_id}
    canonical_id = pinterest_pin_id(canonical_url)
    if canonical_id:
        allowed_ids.add(canonical_id)
    def add(url, height=0):
        parsed = urlparse(url or '')
        if parsed.scheme in ('http', 'https') and parsed.path.lower().endswith('.mp4'):
            candidates.append((height if isinstance(height, (int, float)) else 0, url))
    def walk(value):
        if isinstance(value, dict):
            if value.get('@type') == 'VideoObject' and pinterest_pin_id(value.get('@id') or value.get('url')) in allowed_ids:
                add(value.get('contentUrl'))
            if str(value.get('id') or value.get('pin_id') or '') == pin_id:
                for item in (value.get('videos') or {}).get('video_list', {}).values():
                    if isinstance(item, dict):
                        add(item.get('url'), item.get('height', 0))
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(documents)
    return max(candidates, default=(0, None))[1]


def pinterest_studio_media(url):
    pin_id = pinterest_pin_id(url)
    if not pin_id:
        return None
    try:
        response = http_requests.get(f'https://www.pinterest.com/pin/{pin_id}/', timeout=15, headers={
            'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'})
        if response.ok:
            parser = PinterestScripts()
            parser.feed(response.text)
            return pinterest_embedded_mp4(parser.documents, pin_id, parser.canonical)
    except http_requests.RequestException:
        pass
    return None


@app.route('/pinterest/resolve')
def resolve_pinterest():
    pin_id = pinterest_pin_id(request.args.get('url'))
    if not pin_id:
        return jsonify({'error': '올바른 Pinterest 핀 URL이 필요합니다.'}), 400
    canonical = f'https://www.pinterest.com/pin/{pin_id}/'
    try:
        response = http_requests.get(canonical, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'})
        if response.ok:
            parser = PinterestScripts()
            parser.feed(response.text)
            media_url = pinterest_embedded_mp4(parser.documents, pin_id, parser.canonical)
            if media_url:
                return jsonify({'pin_id': pin_id, 'media_url': media_url, 'requires_merge': False})
        with yt_dlp.YoutubeDL(build_ydl_opts(extra_opts={'skip_download': True})) as ydl:
            info = ydl.extract_info(canonical, download=False)
        if not info or str(info.get('id')) != pin_id or not info.get('formats'):
            return jsonify({'error': '이 핀의 영상 원본을 확인하지 못했습니다.'}), 502
        # HLS/adaptive formats go through the existing download/FFmpeg merger.
        return jsonify({'pin_id': pin_id, 'requires_merge': True})
    except Exception as error:
        return jsonify({'error': f'Pinterest 추출 오류: {error}'}), 502


@app.route('/info')
def get_info():
    """Return video metadata without downloading."""
    video_url = request.args.get('url')
    if not video_url:
        return jsonify({"error": "URL parameter 'url' is required."}), 400

    try:
        ydl_opts = build_ydl_opts()
        ydl_opts['skip_download'] = True

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)

        if not info:
            return jsonify({"error": "동영상 정보를 읽을 수 없습니다."}), 502

        safe_info = {
            'id': info.get('id'),
            'title': info.get('title'),
            'duration': info.get('duration'),
            'uploader': info.get('uploader'),
            'view_count': info.get('view_count'),
            'like_count': info.get('like_count'),
            'upload_date': info.get('upload_date'),
            'thumbnail': info.get('thumbnail'),
            'description': (info.get('description') or '')[:500],
            'format_count': len(info.get('formats', [])),
        }
        return jsonify(safe_info)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def find_ffmpeg_location():
    """Locate ffmpeg binary in local folder, PATH or imageio_ffmpeg."""
    base_dir = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, 'ffmpeg.exe'),
        os.path.join(base_dir, 'ffmpeg'),
        os.path.join(base_dir, 'bin', 'ffmpeg.exe'),
        'C:\\ffmpeg\\bin\\ffmpeg.exe'
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
def find_aria2c_location():
    """Locate aria2c binary in local folder, PATH or bin."""
    base_dir = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, 'aria2c.exe'),
        os.path.join(base_dir, 'aria2c'),
        os.path.join(base_dir, 'bin', 'aria2c.exe')
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

@app.route('/download', methods=['GET', 'HEAD'])
def download_video():
    """Download and serve genuine 1080p Full-HD merged video files using yt-dlp."""
    video_url = request.args.get('url')
    quality = request.args.get('quality', 'best')
    if not video_url:
        return "URL parameter 'url' is required.", 400
    if request.method == 'HEAD':
        return '', 405, {'Allow': 'GET'}

    import tempfile, glob
    temp_dir = tempfile.mkdtemp(prefix='takoh_download_')

    @after_this_request
    def cleanup_after_transfer(response):
        original = response.response
        def cleanup():
            close = getattr(original, 'close', None)
            if close:
                close()
            shutil.rmtree(temp_dir, ignore_errors=True)
        def transfer():
            try:
                yield from original
            finally:
                cleanup()
        response.response = transfer()
        response.call_on_close(cleanup)
        return response

    # ========== Detect platform for cookie injection ==========
    def is_douyin_url(url):
        return 'douyin.com' in url or 'douyinvod.com' in url

    def is_xiaohongshu_url(url):
        return 'xiaohongshu.com' in url or 'rednote.com' in url

    def is_tiktok_url(url):
        return 'tiktok.com' in url

    # Standardize YouTube URLs to watch?v= format for maximum reliability and strip playlist params
    if 'youtube.com/shorts/' in video_url:
        m = re.search(r'/shorts/([a-zA-Z0-9_-]+)', video_url)
        if m:
            video_url = f"https://www.youtube.com/watch?v={m.group(1)}"
    elif 'youtu.be/' in video_url:
        m = re.search(r'youtu\.be/([a-zA-Z0-9_-]+)', video_url)
        if m:
            video_url = f"https://www.youtube.com/watch?v={m.group(1)}"
    elif 'youtube.com/watch' in video_url:
        m = re.search(r'[?&]v=([a-zA-Z0-9_-]+)', video_url)
        if m:
            video_url = f"https://www.youtube.com/watch?v={m.group(1)}"

    def try_inject_browser_cookies(opts, platform_name):
        """Try to inject cookies from Edge, Chrome, or Firefox (in order)."""
        browsers = ['edge', 'chrome', 'firefox', 'brave', 'opera']
        for browser in browsers:
            try:
                test_opts = dict(opts)
                test_opts['cookiesfrombrowser'] = (browser,)
                test_opts['skip_download'] = True
                test_opts['quiet'] = True
                # Quick validation – will raise if browser not found
                with yt_dlp.YoutubeDL(test_opts) as ydl_test:
                    ydl_test.extract_info(video_url, download=False)
                # If no exception, use this browser
                opts['cookiesfrombrowser'] = (browser,)
                print(f"[TAKOH Helper] {platform_name}: '{browser}' 브라우저 쿠키 자동 연동 성공")
                return True
            except Exception as e:
                err_str = str(e)
                # If the error is cookie-related but browser was found, still use it
                if 'cookies' not in err_str.lower() and 'browser' not in err_str.lower():
                    opts['cookiesfrombrowser'] = (browser,)
                    print(f"[TAKOH Helper] {platform_name}: '{browser}' 쿠키 연동 (검증 생략)")
                    return True
                continue
        print(f"[TAKOH Helper] {platform_name}: 브라우저 쿠키 연동 실패 – 쿠키 없이 시도")
        return False

    try:
        temp_id = f"takoh_yt_{random.randint(10000, 99999)}"
        outtmpl = os.path.join(temp_dir, f"{temp_id}_%(title)s.%(ext)s")

        # Format specifiers for genuine 1080p/4K high quality or MP3 Audio
        merge_fmt = 'mp4'
        if quality == 'audio':
            fmt = 'bestaudio/best'
            merge_fmt = 'mp3'
        elif quality == '720p':
            fmt = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best'
        elif quality == '480p':
            fmt = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best'
        else:
            fmt = 'bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best'

        is_yt = 'youtube.com' in video_url or 'youtu.be' in video_url

        ydl_opts = {
            'format': fmt,
            'outtmpl': outtmpl,
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'merge_output_format': merge_fmt,
            'socket_timeout': 30,
            'retries': 10,
            'fragment_retries': 10,
            'concurrent_fragment_downloads': 4 if is_yt else 16,
        }

        # Only apply custom browser headers for non-YouTube platforms (YouTube requires internal dynamic tokens & UA)
        if not is_yt:
            ydl_opts['http_headers'] = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.douyin.com/' if is_douyin_url(video_url) else '',
            }

        # ---- Twitter / X: Handle multi-video index (/video/1, /video/2, /video/3, /video/4 or index param) ----
        is_twitter = 'twitter.com' in video_url or 'x.com' in video_url
        twitter_index = None
        if is_twitter:
            m_idx = re.search(r'/(?:video|photo)/(\d+)', video_url)
            if m_idx:
                twitter_index = int(m_idx.group(1))
            elif request.args.get('index'):
                try:
                    twitter_index = int(request.args.get('index'))
                except (ValueError, TypeError):
                    pass
            
            if twitter_index:
                print(f"[TAKOH Helper] Twitter 다중 영상 감지: 인덱스 #{twitter_index} 다운로드 설정")
                ydl_opts['playlist_items'] = str(twitter_index)
                ydl_opts['noplaylist'] = False

        # ---- Douyin: Direct API & Stream Merger (Bypasses yt-dlp Fresh cookies requirement) ----
        if is_douyin_url(video_url):
            print(f"[TAKOH Helper] 더우인 URL 감지 – 쿠키 없는 우회 세션 다운로드")
            import requests
            aweme_match = re.search(r'([0-9]{15,22})', video_url)
            aweme_id = aweme_match.group(1) if aweme_match else ''
            
            if aweme_id:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Referer': 'https://www.douyin.com/'
                }
                play_url = None
                
                # 1. Try iesdouyin V2 iteminfo API
                try:
                    api_resp = requests.get(f"https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids={aweme_id}", headers=headers, timeout=10)
                    if api_resp.status_code == 200:
                        item_data = api_resp.json()
                        if item_data.get('item_list') and item_data['item_list'][0].get('video'):
                            video_info = item_data['item_list'][0]['video']
                            p_url = video_info.get('play_addr', {}).get('url_list', [None])[0]
                            if p_url: play_url = p_url.replace('playwm', 'play')
                except Exception as ex:
                    print(f"[TAKOH Helper] iesdouyin V2 실패: {ex}")

                # 2. Try web aweme detail API
                if not play_url:
                    try:
                        api_resp = requests.get(f"https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id={aweme_id}", headers=headers, timeout=10)
                        if api_resp.status_code == 200:
                            detail_data = api_resp.json()
                            if detail_data.get('aweme_detail') and detail_data['aweme_detail'].get('video'):
                                video_info = detail_data['aweme_detail']['video']
                                play_addr = video_info.get('play_addr_h264') or video_info.get('play_addr') or video_info.get('playAddr')
                                if play_addr and play_addr.get('url_list'):
                                    play_url = play_addr['url_list'][0]
                    except Exception as ex:
                        print(f"[TAKOH Helper] aweme detail V1 실패: {ex}")

                if play_url:
                    try:
                        print(f"[TAKOH Helper] 더우인 고화질 원본 MP4 직결 스트림 획득 성공 ({aweme_id})")
                        v_res = requests.get(play_url, headers=headers, stream=True, timeout=30)
                        if v_res.status_code == 200:
                            target_file = os.path.join(temp_dir, f"{temp_id}_douyin_{aweme_id}.mp4")
                            with open(target_file, 'wb') as f:
                                for chunk in v_res.iter_content(chunk_size=1024*1024):
                                    if chunk: f.write(chunk)
                            
                            return send_file(
                                target_file,
                                mimetype='video/mp4',
                                as_attachment=True,
                                download_name=f"douyin_{aweme_id}.mp4"
                            )
                    except Exception as ex:
                        print(f"[TAKOH Helper] 스트림 파일 저장 실패: {ex}")

        # ---- Xiaohongshu: inject browser cookies ----
        elif is_xiaohongshu_url(video_url):
            print(f"[TAKOH Helper] 샤오홍수 URL 감지 – 쿠키 자동 연동 시작")
            for browser in ['edge', 'chrome', 'firefox']:
                try:
                    ydl_opts['cookiesfrombrowser'] = (browser,)
                    break
                except Exception:
                    continue

        # ---- TikTok: optimize options ----
        elif is_tiktok_url(video_url):
            print(f"[TAKOH Helper] 틱톡 URL 감지 – 전용 모드로 처리")

        ffmpeg_bin = find_ffmpeg_location()
        if ffmpeg_bin:
            ydl_opts['ffmpeg_location'] = ffmpeg_bin
            print(f"[TAKOH Helper] Found ffmpeg at: {ffmpeg_bin}")
            if quality == 'audio':
                ydl_opts['postprocessors'] = [{'key': 'FFmpegExtractAudio',
                                              'preferredcodec': 'mp3', 'preferredquality': '192'}]
        elif quality == 'audio':
            return jsonify({"error": "MP3 변환에 필요한 FFmpeg를 찾을 수 없습니다."}), 503
        else:
            # Without a merger, select a single file containing both streams.
            height_filter = {'480p': '[height<=480]', '720p': '[height<=720]',
                             '1080p': '[height<=1080]'}.get(quality, '')
            ydl_opts['format'] = f'best[vcodec!=none][acodec!=none]{height_filter}'

        aria2c_bin = find_aria2c_location()
        # aria2c is incompatible with cookiesfrombrowser and causes HTTP 403 / rehydration issues on YouTube/TikTok
        is_yt = 'youtube.com' in video_url or 'youtu.be' in video_url
        is_tt = is_tiktok_url(video_url)
        if aria2c_bin and 'cookiesfrombrowser' not in ydl_opts and not is_yt and not is_tt:
            ydl_opts['external_downloader'] = aria2c_bin
            ydl_opts['external_downloader_args'] = {'aria2c': ['-j', '16', '-x', '16', '-s', '16', '-k', '1M']}
            print(f"[TAKOH Helper] 초고속 16채널 aria2c 가속 엔진 탑재: {aria2c_bin}")
        elif is_yt or is_tt:
            ydl_opts['concurrent_fragment_downloads'] = 4

        # ---- First attempt with current opts ----
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)

        if not info:
            return jsonify({"error": "동영상 정보를 읽을 수 없습니다."}), 500

        # Handle playlist / multi-video entries (Twitter, playlists, etc.)
        if 'entries' in info and info.get('entries'):
            entries = [e for e in info.get('entries', []) if e]
            if entries:
                entry = entries[0]
                video_title = entry.get('title') or info.get('title') or 'twitter_video'
                video_id = entry.get('id') or info.get('id') or 'video'
                if is_twitter and twitter_index and twitter_index > 1 and f"_part{twitter_index}" not in video_title:
                    video_title = f"{video_title}_part{twitter_index}"
            else:
                video_title = info.get('title', 'video')
                video_id = info.get('id', 'video')
        else:
            video_title = info.get('title', 'video')
            video_id = info.get('id', 'video')

        downloaded_files = glob.glob(os.path.join(temp_dir, f"{temp_id}_*"))
        # .f137.mp4, .f251.webm, .part 등의 중간 분리 파편 파일 제외 및 최종 결합된 최대 용량 파일 선택
        valid_files = [f for f in downloaded_files if not re.search(r'\.f\d+\.', f) and not f.endswith('.part') and not f.endswith('.temp')]
        valid_files = [f for f in valid_files if os.path.isfile(f) and os.path.getsize(f) > 0
                       and os.path.splitext(f)[1].lower() in ('.mp4', '.mkv', '.webm', '.mp3', '.m4a', '.ogg', '.opus', '.wav', '.flac', '.mov')]
        
        if not valid_files:
            return jsonify({"error": "고화질 동영상 변환에 실패했습니다."}), 500

        # 파일 크기가 가장 큰 최종 결합 고화질 1080p MP4 파일 선택
        valid_files.sort(key=lambda x: os.path.getsize(x), reverse=True)
        target_file = valid_files[0]
        ext = os.path.splitext(target_file)[1] or '.mp4'

        safe_title = re.sub(r'[\\/:*?"<>|\r\n\t]', '_', video_title).strip()[:100] or video_id
        download_name = f"{safe_title}{ext}"

        ext_lower = ext.lower()
        if ext_lower == '.mp3':
            mimetype = 'audio/mpeg'
        elif ext_lower == '.m4a':
            mimetype = 'audio/mp4'
        elif ext_lower == '.webm':
            mimetype = 'video/webm'
        else:
            mimetype = 'video/mp4'

        return send_file(
            target_file,
            mimetype=mimetype,
            as_attachment=True,
            download_name=download_name
        )

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        print(f"[TAKOH Helper] yt-dlp DownloadError: {error_msg}")

        # ---- TikTok Specific Fallback Engine ----
        if is_tiktok_url(video_url):
            print(f"[TAKOH Helper] 틱톡 추출 실패 감지 – 고화질 직결 API 우회 다운로드 시작...")
            import requests as tt_req
            aweme_match = re.search(r'([0-9]{15,22})', video_url)
            aweme_id = aweme_match.group(1) if aweme_match else ''
            
            tt_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': 'https://www.tiktok.com/'
            }
            play_url = None
            title = f"tiktok_{aweme_id}" if aweme_id else "tiktok_video"

            # 1. TikWM Direct HD API
            try:
                api_res = tt_req.post("https://www.tikwm.com/api/", data={"url": video_url, "hd": 1}, headers=tt_headers, timeout=12).json()
                if api_res.get('code') == 0 and api_res.get('data'):
                    d = api_res['data']
                    play_url = d.get('hdplay') or d.get('play') or d.get('wmplay')
                    if d.get('title'):
                        title = d['title']
            except Exception as ex:
                print(f"[TAKOH Helper] TikWM API 우회 실패: {ex}")

            # 2. Official TikTok Mobile Feed API
            if not play_url and aweme_id:
                try:
                    feed_url = f"https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id={aweme_id}"
                    feed_res = tt_req.get(feed_url, headers=tt_headers, timeout=10).json()
                    if feed_res.get('aweme_list'):
                        aweme_item = feed_res['aweme_list'][0]
                        video_obj = aweme_item.get('video', {})
                        url_list = video_obj.get('play_addr', {}).get('url_list', [])
                        if url_list:
                            play_url = url_list[0]
                        if aweme_item.get('desc'):
                            title = aweme_item['desc']
                except Exception as ex:
                    print(f"[TAKOH Helper] TikTok Feed API 우회 실패: {ex}")

            # If stream URL found, download & serve
            if play_url:
                try:
                    target_file = os.path.join(temp_dir, f"{temp_id}_tiktok_{aweme_id or 'vid'}.mp4")
                    v_res = tt_req.get(play_url, headers=tt_headers, stream=True, timeout=35)
                    if v_res.status_code == 200:
                        with open(target_file, 'wb') as f:
                            for chunk in v_res.iter_content(chunk_size=1024*1024):
                                if chunk: f.write(chunk)
                        
                        safe_title = re.sub(r'[\\/:*?"<>|\r\n\t]', '_', title).strip()[:100] or (aweme_id or "tiktok_video")
                        download_name = f"{safe_title}.mp4"

                        print(f"[TAKOH Helper] 틱톡 우회 스트림 전송 성공: {download_name}")
                        return send_file(
                            target_file,
                            mimetype='video/mp4',
                            as_attachment=True,
                            download_name=download_name
                        )
                except Exception as ex:
                    print(f"[TAKOH Helper] 틱톡 우회 스트림 저장 실패: {ex}")

        if 'Sign in to confirm' in error_msg or 'age-restricted' in error_msg:
            return Response("이 영상은 로그인이 필요한 연령 제한 콘텐츠입니다.", status=403, mimetype='text/plain; charset=utf-8')
        elif 'Private' in error_msg or 'private' in error_msg:
            return Response("이 영상은 비공개 영상입니다.", status=403, mimetype='text/plain; charset=utf-8')
        elif 'not available' in error_msg or 'unavailable' in error_msg:
            return Response("이 영상은 현재 사용할 수 없습니다.", status=404, mimetype='text/plain; charset=utf-8')
        elif 'cookies' in error_msg.lower() or 'fresh' in error_msg.lower():
            return Response("더우인/틱톡: 브라우저에서 한 번 접속한 후 다시 시도해주세요.", status=401, mimetype='text/plain; charset=utf-8')
        else:
            return Response(f"yt-dlp 추출 오류: {error_msg}", status=500, mimetype='text/plain; charset=utf-8')
    except Exception as general_err:
        print(f"[TAKOH Helper] General Exception: {general_err}")
        return Response(f"서버 오류: {str(general_err)}", status=500, mimetype='text/plain; charset=utf-8')

    except Exception as e:
        print(f"[TAKOH Helper] Video download error: {e}")
        return jsonify({"error": f"서버 처리 오류: {str(e)}"}), 500


@app.route('/download_zip', methods=['POST', 'GET'])
def download_zip_endpoint():
    """Download multiple media URLs and return a single compressed ZIP file."""
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        urls = data.get('urls', [])
        zip_name = data.get('filename', 'carousel_media.zip')
    else:
        urls = request.args.getlist('urls')
        zip_name = request.args.get('filename', 'carousel_media.zip')

    if isinstance(urls, str):
        try:
            urls = json.loads(urls)
        except Exception:
            urls = [urls]

    if not isinstance(urls, list) or not isinstance(zip_name, str):
        return jsonify({"error": "urls must be a list and filename must be a string"}), 400
    if not zip_name.endswith('.zip'):
        zip_name += '.zip'

    if not urls:
        return jsonify({"error": "No media URLs provided"}), 400

    import zipfile
    memory_file = io.BytesIO()
    failures = []
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for idx, item_url in enumerate(urls):
            try:
                if not item_url or not isinstance(item_url, str):
                    failures.append(idx + 1)
                    continue
                clean_url = item_url.replace('\\/', '/').replace('\\u0026', '&')
                ext = 'mp4' if '.mp4' in clean_url.lower() else 'jpg'
                item_filename = f"media_{idx + 1:02d}.{ext}"

                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Referer': 'https://www.instagram.com/',
                    'Accept': '*/*',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site'
                }
                if 'threads.net' in clean_url or 'threads' in zip_name.lower():
                    headers['Referer'] = 'https://www.threads.net/'

                resp = http_requests.get(clean_url, timeout=20, headers=headers)
                if resp.status_code in (200, 206) and len(resp.content) > 100:
                    zf.writestr(item_filename, resp.content)
                    print(f"[TAKOH Helper ZIP] Successfully added item {idx+1}: {len(resp.content)} bytes")
                else:
                    failures.append(idx + 1)
                    print(f"[TAKOH Helper ZIP] HTTP {resp.status_code} for item {idx+1}")
            except Exception as e:
                failures.append(idx + 1)
                print(f"[TAKOH Helper ZIP] Error fetching item {idx+1}: {e}")

    if failures:
        return jsonify({"error": "일부 미디어를 받지 못했습니다. 다시 시도해주세요.",
                        "failed_items": failures}), 502
    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=zip_name
    )




@app.route('/update-ytdlp', methods=['POST', 'GET'])
def update_ytdlp():
    """Manually trigger yt-dlp update."""
    if getattr(sys, 'frozen', False):
        return jsonify({'status': 'error', 'message': 'EXE 업데이트는 최신 통합 배포본으로 교체해 주세요.'}), 409
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            return jsonify({
                "status": "ok",
                "message": "yt-dlp 업데이트 완료!",
                "output": result.stdout[-500:] if result.stdout else ""
            })
        else:
            return jsonify({
                "status": "error",
                "message": "업데이트 실패",
                "error": result.stderr[-500:] if result.stderr else ""
            }), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


from studio import register_studio
register_studio(app, find_ffmpeg_location, pinterest_studio_media)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5005))
    print(f"\n============================================================")
    print(f"  TAKOH Media Downloader PRO - 로컬 도우미 서버 가동 성공!")
    print(f"  ----------------------------------------------------------")
    print(f"  - 서버 주소: http://127.0.0.1:{port}")
    print(f"  - 다운로드 API: http://127.0.0.1:{port}/download?url=...")
    print(f"  - yt-dlp 엔진 버전: {yt_dlp.version.__version__}")
    print(f"  - Python 버전: {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
    print(f"  ----------------------------------------------------------")
    print(f"  * 다운로드하는 동안 이 까만 창을 닫지 마세요.")
    print(f"============================================================\n")
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)
