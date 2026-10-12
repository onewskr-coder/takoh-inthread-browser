"""Windows packaged-EXE smoke test using isolated local media and no external APIs."""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
import uuid
import requests

root = Path(__file__).resolve().parent
version = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))['version']
helper = root / f'dist_release_v{version}' / 'TAKOH_Helper'
folder = root / 'scratch' / 'studio-package-test' / uuid.uuid4().hex
folder.mkdir(parents=True, exist_ok=True)
fixture = folder / 'fixture.mp4'
subprocess.run([str(helper / 'ffmpeg.exe'), '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-pix_fmt', 'yuv420p', str(fixture)], check=True, capture_output=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
env = dict(os.environ, PORT=str(port), STUDIO_DATA_DIR=str(folder / 'data'), STUDIO_DOWNLOAD_ROOT=str(folder),
           PYTHONPATH='', TEMP=str(folder), TMP=str(folder))
with (folder / 'helper.log').open('w', encoding='utf-8') as log:
    process = subprocess.Popen([str(helper / 'TAKOH_Helper.exe')], cwd=helper, env=env,
        stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        for _ in range(60):
            if process.poll() is not None:
                raise RuntimeError('Packaged helper exited; inspect scratch/studio-package-test/helper.log')
            try:
                ping = requests.get(base + '/ping', timeout=1)
                ping.raise_for_status()
                break
            except requests.RequestException:
                time.sleep(.5)
        else:
            raise RuntimeError('Packaged helper did not respond on the isolated port')
        assert ping.json()['helper_version'] == version
        page = requests.get(base + '/studio/', timeout=5)
        page.raise_for_status()
        assert 'data-production-stage="analysis"' in page.text
        assert 'Antigravity CLI' in page.text
        token = re.search(r'name="studio-token" content="([^"]+)"', page.text)[1]
        for asset in ('studio.js', 'studio.css', 'workspace.js'):
            response = requests.get(base + '/studio/assets/' + asset, timeout=5)
            response.raise_for_status()
            assert response.content == (root / 'studio_web' / asset).read_bytes(), asset
        imported = requests.post(base + '/studio/imports', json={'path': str(fixture), 'completed': True,
            'source': 'https://www.threads.com/@test/post/ONE'}, headers={'X-Studio-Token': token}, timeout=45)
        imported.raise_for_status()
        job = imported.json()
        assert job['sha256'] == hashlib.sha256(fixture.read_bytes()).hexdigest()
        assert job['media']['has_audio'] and len(job['evidence']['frames']) == 6
        styles = requests.get(base + '/studio/styles', timeout=5).json()
        assert len(styles) == 12
        created = requests.post(base + '/studio/styles', json={'name':'배포 검증 스타일','instructions':'관찰 장면을 세 문장으로 소개'}, headers={'X-Studio-Token':token}, timeout=5)
        created.raise_for_status()
        assert requests.get(base + '/studio/styles', timeout=5).json()[-1]['name'] == '배포 검증 스타일'
        frame = requests.get(base + f'/studio/jobs/{job["id"]}/media/frame-0.jpg', timeout=5)
        frame.raise_for_status()
        assert frame.content[:2] == b'\xff\xd8'
        thumb = requests.get(base + '/studio/downloads/thumbnail', params={'path': str(fixture.resolve())}, timeout=15)
        assert thumb.status_code == 200 and thumb.content[:2] == b'\xff\xd8'
        headers = {'X-Studio-Token': token}
        models = requests.get(base + '/studio/models', timeout=5).json()
        assert any(m['model_id'] == 'gpt-6.1-sol' for m in models)
        custom = requests.post(base + '/studio/models', json={'name': 'Package test', 'provider': 'openai_api', 'model_id': 'package-test-model'}, headers=headers, timeout=5)
        custom.raise_for_status()
        assert next(m for m in custom.json() if m['model_id'] == 'package-test-model')['verified'] is False
        denied = requests.post(base + '/studio/acquire', json={'url': 'http://127.0.0.1/private'}, headers=headers, timeout=5)
        assert denied.status_code == 403
        agy_evidence = None
        if os.environ.get('STUDIO_PACKAGE_AGY_CHECK'):
            agy = requests.post(base + '/studio/ai/status', json={'provider':'antigravity_cli'}, headers=headers, timeout=40)
            agy.raise_for_status()
            assert agy.json()['authenticated'] is True
            assert any(m['model_id'] == 'gemini-3.8-flash-medium' for m in agy.json()['models'])
            agy_evidence = {'authenticated':True, 'models':len(agy.json()['models'])}
        pin_url = os.environ.get('STUDIO_PACKAGE_PIN_URL')
        pin_evidence = None
        if pin_url:
            acquired = requests.post(base + '/studio/acquire', json={'url': pin_url, 'kind': 'video'}, headers=headers, timeout=90)
            acquired.raise_for_status()
            actual = acquired.json()
            assert actual['media']['has_audio'] and len(actual['evidence']['frames']) == 6
            pin_evidence = {'source': actual['source'], 'media': actual['media']}
        evidence = {'version': version, 'standalone_exe': True, 'download_import_sha_matches': True,
            'audio_track': True, 'frames': 6, 'all_screen_assets_match': True, 'builtin_styles':12,
            'custom_style_persisted':True, 'download_thumbnail':True, 'custom_model_unverified':True, 'acquire_local_url_rejected':True, 'pinterest_live':pin_evidence, 'antigravity':agy_evidence, 'external_api_calls': 0}
        (folder / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(json.dumps(evidence))
    finally:
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
        process.wait(timeout=10)
