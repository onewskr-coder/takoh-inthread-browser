"""Isolated developer-launcher and reload verification; no builds or model calls."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import threading
import uuid
import requests

root = Path(__file__).resolve().parent
folder = root / 'scratch' / 'dev-runtime-test' / uuid.uuid4().hex
folder.mkdir(parents=True)
original_hash = hashlib.sha256((root / 'app.py').read_bytes()).hexdigest()
for name in ('app.py', 'studio.py', 'studio_ai.py', 'studio_writing.py', 'studio_integrations.py', 'studio_text_clean.py', 'studio_secrets.py', 'dev_server.py', 'dev_extension.py', 'build.py', 'start_dev.ps1'):
    shutil.copy2(root / name, folder / name)
from build import EXTENSION_FILES
for name in EXTENSION_FILES:
    shutil.copy2(root / name, folder / name)
shutil.copytree(root / 'icons', folder / 'icons')
shutil.copytree(root / 'studio_web', folder / 'studio_web')
with (folder / 'app.py').open('a', encoding='utf-8') as fixture:
    fixture.write("\n@app.route('/studio/dev-reload-check', methods=['POST'])\ndef dev_reload_check():\n    from pathlib import Path\n    import time\n    Path(__file__).with_name('request-started').write_text('started')\n    time.sleep(4)\n    return {'completed': True}\n")
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
env = dict(os.environ, TAKOH_PYTHON=sys.executable)
with (folder / 'server.log').open('w', encoding='utf-8') as log:
    extension_dir = folder / 'extension-only'
    process = subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', str(folder / 'start_dev.ps1'), '--port', str(port), '--data-dir', str(folder / 'data'), '--extension-dir', str(extension_dir)],
                               cwd=folder, env=env, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        def wait_version(expected):
            for _ in range(120):
                if process.poll() is not None:
                    raise RuntimeError('Developer launcher exited; inspect ' + str(folder / 'server.log'))
                try:
                    result = requests.get(base + '/ping', timeout=1)
                    if result.ok and result.json().get('helper_version') == expected: return
                except requests.RequestException:
                    pass
                time.sleep(.25)
            raise RuntimeError('Version did not appear: ' + expected)
        wait_version('3.5.4')
        extension_asset = folder / 'content.css'
        extension_asset.write_bytes(extension_asset.read_bytes() + b'\n/* extension sync verified */\n')
        for _ in range(40):
            if b'extension sync verified' in (extension_dir / 'content.css').read_bytes():
                break
            time.sleep(.25)
        else:
            raise AssertionError('Extension assets did not synchronize')
        assert not any(p.name.startswith('_') or p.suffix == '.py' for p in extension_dir.rglob('*'))
        page = requests.get(base + '/studio/', timeout=5)
        assert page.ok and page.headers['Cache-Control'] == 'no-store'
        css = folder / 'studio_web' / 'studio.css'
        css.write_bytes(css.read_bytes() + b'\n/* developer asset reload verified */\n')
        assert 'developer asset reload verified' in requests.get(base + '/studio/assets/studio.css', timeout=5).text
        app_file = folder / 'app.py'
        pending_result = {}
        def slow_request():
            try:
                pending_result['response'] = requests.post(base+'/studio/dev-reload-check',timeout=15)
            except Exception as error:
                pending_result['error'] = str(error)
        pending_thread = threading.Thread(target=slow_request)
        pending_thread.start()
        for _ in range(40):
            if (folder / 'request-started').exists(): break
            time.sleep(.1)
        assert (folder / 'request-started').exists()
        app_file.write_bytes(app_file.read_bytes().replace(b"HELPER_VERSION = '3.5.4'", b"HELPER_VERSION = '3.5.4-dev-check'"))
        pending_thread.join(timeout=15)
        assert 'error' not in pending_result, pending_result
        assert pending_result['response'].ok and pending_result['response'].json()['completed']
        wait_version('3.5.4-dev-check')
        occupied = subprocess.run([sys.executable, str(folder / 'dev_server.py'), '--port', str(port)], capture_output=True, timeout=10)
        assert occupied.returncode != 0 and b'No process was terminated' in occupied.stderr
        assert requests.get(base + '/ping', timeout=2).ok
        assert hashlib.sha256((root / 'app.py').read_bytes()).hexdigest() == original_hash
        evidence = {'active_request_survives_reload':True, 'extension_asset_sync':True, 'extension_no_python_caches':True, 'source_launcher':True, 'python_auto_reload':True, 'browser_asset_refresh':True, 'no_store':True, 'occupied_port_preserved':True, 'source_unchanged':True, 'isolated_data':True, 'builds':0}
        (folder / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        print(json.dumps(evidence))
    finally:
        subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'], capture_output=True)
        process.wait(timeout=10)
