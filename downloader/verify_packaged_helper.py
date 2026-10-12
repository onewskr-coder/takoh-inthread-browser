"""Run only the packaged EXE, on an isolated port, and verify real Pinterest media."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import requests

root = Path(__file__).resolve().parent
helper = root / 'dist_release_v3.1.4' / 'TAKOH_Helper'
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
env = dict(os.environ, PORT=str(port), PYTHONPATH='')
temp = root / 'scratch' / 'exe-test-temp'
temp.mkdir(exist_ok=True)
env['TEMP'] = env['TMP'] = str(temp)
base = f'http://127.0.0.1:{port}'
log_path = root / 'scratch' / 'packaged_helper.log'
with log_path.open('w', encoding='utf-8') as log:
    process = subprocess.Popen([str(helper / 'TAKOH_Helper.exe')], cwd=helper,
        env=env, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        for attempt in range(60):
            if process.poll() is not None:
                raise RuntimeError(log_path.read_text(encoding='utf-8', errors='replace'))
            try:
                ping = requests.get(base + '/ping', timeout=1)
                ping.raise_for_status()
                break
            except requests.RequestException:
                time.sleep(0.5)
        else:
            raise RuntimeError('Packaged helper did not start')
        assert ping.json()['helper_version'] == '3.1.4', ping.text
        resolve = requests.get(base + '/pinterest/resolve',
            params={'url':'https://kr.pinterest.com/pin/901071837963839661/'}, timeout=60)
        resolve.raise_for_status()
        result = resolve.json()
        assert result['pin_id'] == '901071837963839661' and result['media_url']
        video = requests.get(base + '/download', params={'url':result['media_url']}, timeout=120)
        video.raise_for_status()
        assert video.headers['Content-Type'].startswith('video/mp4')
        destination = root / 'scratch' / 'packaged_helper_pinterest.mp4'
        destination.write_bytes(video.content)
        reference = root / 'scratch' / 'pinterest_901071837963839661.mp4'
        assert hashlib.sha256(video.content).digest() == hashlib.sha256(reference.read_bytes()).digest()
        assert requests.post(base + '/update-ytdlp', timeout=3).status_code == 409
        evidence = {'ping':ping.json(), 'resolve':result, 'bytes':len(video.content),
                    'sha256':hashlib.sha256(video.content).hexdigest(), 'standalone_exe':True}
        (root / 'scratch' / 'packaged_helper_verification.json').write_text(json.dumps(evidence, indent=2),encoding='utf-8')
        print(json.dumps(evidence, indent=2), flush=True)
    finally:
        subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'], capture_output=True)
        process.wait(timeout=10)
