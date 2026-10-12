"""Explicit API or installed CLI adapters; never persist credentials or retry billing."""
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import requests
from studio_writing import extract_json_safely


class AIError(Exception):
    pass


class QuotaError(AIError):
    pass


def cli_command(provider):
    if provider == 'codex_cli':
        binary = shutil.which('codex.exe') or shutil.which('codex')
        if not binary and os.name == 'nt':
            candidate = Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/OpenAI/Codex/bin/codex.exe'
            if candidate.is_file(): binary = str(candidate)
        return [binary] if binary else None
    if provider in ('antigravity_cli', 'gemini_cli'):
        binary = shutil.which('agy.exe') or shutil.which('agy')
        if not binary and os.name == 'nt':
            candidate = Path(os.environ.get('LOCALAPPDATA', '')) / 'agy/bin/agy.exe'
            if candidate.is_file(): binary = str(candidate)
        return [binary] if binary else None
    return None


def antigravity_models():
    cmd = cli_command('antigravity_cli')
    if not cmd: raise AIError('Antigravity CLI(agy)를 먼저 설치하세요.')
    env = os.environ.copy()
    for name in ('OPENAI_API_KEY','CODEX_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'): env.pop(name, None)
    try:
        result = subprocess.run(cmd + ['models'], capture_output=True, timeout=30, env=env,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except (OSError, subprocess.TimeoutExpired): raise AIError('Antigravity 모델 목록 조회 실패 또는 시간 초과')
    if result.returncode: raise AIError('Antigravity 계정 로그인과 연결을 확인하세요. 터미널에서 agy를 실행해 로그인하세요.')
    entries = []
    for line in result.stdout.decode('utf-8', errors='replace').splitlines():
        parts = re.split(r'\s+', line.strip(), maxsplit=1)
        if len(parts) == 2 and re.fullmatch(r'[A-Za-z0-9._-]+', parts[0]):
            entries.append(dict(id='agy_' + parts[0], provider='antigravity_cli', name=parts[1],
                                model_id=parts[0], has_audio=False, verified=True, builtin=True))
    if not entries: raise AIError('Antigravity에서 사용 가능한 모델을 확인하지 못했습니다.')
    return entries


def cli_status(provider):
    if provider in ('antigravity_cli', 'gemini_cli'):
        try:
            models = antigravity_models()
            return {'installed': True, 'authenticated': True, 'auth_mode':'account', 'models':models, 'message':'Antigravity 계정 모델 목록 확인됨 · 실제 분석은 실행 시 확인합니다.'}
        except AIError as error:
            return {'installed':bool(cli_command(provider)), 'authenticated':False, 'message':str(error)}
    cmd = cli_command(provider)
    if not cmd: return {'installed': False, 'message': '공식 CLI를 설치하고 계정 로그인 후 다시 확인하세요.'}
    try:
        result = subprocess.run(cmd + (['login', 'status'] if provider == 'codex_cli' else ['--version']),
            capture_output=True, timeout=15, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        # No auth file inspection or raw credential output.
        status_text = (result.stdout + result.stderr).decode('utf-8',errors='replace').lower()
        mode = 'chatgpt' if 'chatgpt' in status_text else 'api_key' if 'api key' in status_text or 'api_key' in status_text else 'unknown'
        return {'installed': True, 'auth_mode':mode, 'authenticated': result.returncode == 0 if provider == 'codex_cli' else None,
                'message': ('ChatGPT 로그인 확인됨 · 모델 접근은 실행 시 확인합니다.' if provider == 'codex_cli' and result.returncode == 0 and mode=='chatgpt'
                            else '현재 API 키 인증입니다. 구독 연결은 공식 CLI에서 ChatGPT 로그인으로 변경하세요.' if provider=='codex_cli' and mode=='api_key'
                            else 'CLI 설치 확인 · 터미널에서 계정 로그인하세요. 실제 생성 전에는 연결 성공으로 표시하지 않습니다.')}
    except (OSError, subprocess.TimeoutExpired):
        return {'installed': True, 'authenticated': False, 'message': 'CLI 상태 확인 실패 또는 시간 초과'}


def launch_login(provider):
    if os.name != 'nt': raise AIError('터미널에서 공식 CLI 로그인 명령을 실행하세요.')
    cmd = cli_command(provider)
    if not cmd: raise AIError('공식 CLI를 먼저 설치하세요.')
    # User presses a login button: show the official CLI's interactive login window.
    quoted = ' '.join("'"+arg.replace("'","''")+"'" for arg in cmd)
    command = '& '+quoted+(' login' if provider=='codex_cli' else '')
    env = os.environ.copy()
    for name in ('OPENAI_API_KEY','CODEX_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'): env.pop(name, None)
    try:
        subprocess.Popen(['powershell.exe','-NoProfile','-NoExit','-Command',command],
                         env=env, creationflags=subprocess.CREATE_NEW_CONSOLE)
    except OSError: raise AIError('로그인 창을 열지 못했습니다. 터미널에서 로그인하세요.')
    return {'message':'공식 CLI 로그인 창을 열었습니다. 로그인을 마친 뒤 설치·로그인 확인을 누르세요.'}


def generate_other(provider, key, model, parts, schema, audit_path):
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', model): raise AIError('모델 이름을 확인하세요.')
    prompt = '\n'.join(p['text'] for p in parts if 'text' in p)
    prompt += '\n다음 형식의 완전한 JSON 객체만 반환하세요: ' + json.dumps(schema, ensure_ascii=False)
    images = [p['inlineData'] for p in parts if p.get('inlineData', {}).get('mimeType', '').startswith('image/')]
    has_audio = any(p.get('inlineData', {}).get('mimeType', '').startswith('audio/') for p in parts)
    if provider in ('openai_api', 'codex_cli', 'antigravity_cli', 'gemini_cli') and has_audio:
        prompt += '\n이 경로에는 음성이 전달되지 않았습니다. audio_summary는 "음성 미분석"으로 쓰고 음성 내용을 추측하지 마세요.'
    if provider == 'openai_api':
        if not key: raise AIError('OpenAI API 키를 입력하거나 OPENAI_API_KEY를 설정하세요.')
        content = [{'type': 'input_text', 'text': prompt}] + [
            {'type': 'input_image', 'image_url': 'data:'+i['mimeType']+';base64,'+i['data']} for i in images]
        try:
            response = requests.post('https://api.openai.com/v1/responses', headers={'Authorization': 'Bearer '+key},
                json={'model': model, 'store': False, 'input': [{'role': 'user', 'content': content}]}, timeout=180)
        except requests.RequestException: raise AIError('OpenAI 연결 실패. 자동 재요청하지 않았습니다.')
        if not response.ok: raise AIError(f'OpenAI 요청 실패 HTTP {response.status_code}. 키·모델 권한·사용량을 확인하세요.')
        payload = response.json()
        audit_path.write_text(json.dumps({k: payload.get(k) for k in ('id','status','output','usage')}, ensure_ascii=False), encoding='utf-8')
        if payload.get('status') != 'completed': raise AIError('OpenAI 응답이 완료되지 않았습니다.')
        output = ''.join(c.get('text','') for item in payload.get('output',[]) if item.get('type')=='message'
                         for c in item.get('content',[]) if c.get('type')=='output_text')
    elif provider in ('codex_cli', 'antigravity_cli', 'gemini_cli'):
        cmd = cli_command(provider)
        if not cmd: raise AIError('CLI를 찾지 못했습니다. 공식 CLI 설치와 로그인을 확인하세요.')
        if provider == 'codex_cli' and cli_status(provider).get('auth_mode') != 'chatgpt':
            raise AIError('ChatGPT 구독 로그인을 확인하지 못했습니다. 공식 CLI 로그인 후 다시 시도하세요. API로 자동 전환하지 않습니다.')
        with tempfile.TemporaryDirectory(prefix='takoh-ai-', ignore_cleanup_errors=True) as folder:
            folder = Path(folder)
            paths = []
            for index, image in enumerate(images):
                p = folder / f'frame-{index}.jpg'; p.write_bytes(base64.b64decode(image['data'])); paths.append(p)
            env = os.environ.copy()
            for name in ('OPENAI_API_KEY','CODEX_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'): env.pop(name, None)
            env.pop('CODEX_THREAD_ID', None)
            output_path = folder / 'result.json'
            if provider == 'codex_cli':
                args = cmd + ['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-m',model,'-o',str(output_path)]
                for p in paths: args += ['-i',str(p)]
                args += ['-']
            else:
                for p in paths: prompt += '\n첨부 프레임: @'+p.name
                args = cmd + ['--mode','plan','--disable-slash-commands','--output-format','json','--print-timeout','220s','-p',prompt]
                if model != 'auto': args += ['--model',model]
            try:
                result = subprocess.run(args, input=prompt.encode('utf-8'), cwd=folder, env=env,
                    capture_output=True, timeout=240, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            except (OSError, subprocess.TimeoutExpired): raise AIError('CLI 실행 실패 또는 240초 시간 초과. 자동 재요청하지 않았습니다.')
            if result.returncode and any(x in (result.stdout+result.stderr).decode('utf-8',errors='replace').lower() for x in ('quota','resource_exhausted','rate limit','usage limit','capacity','할당량')):raise QuotaError('CLI 구독 할당량 제한')
            if result.returncode: raise AIError('CLI 생성 실패. 터미널의 계정 로그인·모델 권한·구독 한도를 확인하세요. 기존 결과는 유지했습니다.')
            output = output_path.read_text(encoding='utf-8') if provider == 'codex_cli' and output_path.is_file() else result.stdout.decode('utf-8',errors='replace')
            if provider in ('antigravity_cli', 'gemini_cli'):
                # The transport envelope is plain JSON. Its response may contain
                # fenced JSON; stripping those fences before decoding destroys it.
                try:
                    wrapper = json.loads(output.strip().lstrip('\ufeff'))
                except (ValueError, TypeError):
                    raise AIError('Antigravity 응답 형식을 읽지 못했습니다. 로그인 실패로 판단하지 않았습니다.')
                if not isinstance(wrapper, dict):
                    raise AIError('Antigravity 응답이 JSON 객체 형식이 아닙니다.')
                if wrapper.get('status') != 'SUCCESS' or wrapper.get('error'):
                    error = str(wrapper.get('error') or '').lower()
                    reason = ('구독 한도 또는 사용량 제한' if any(x in error for x in ('quota','exhaust','rate limit','capacity'))
                              else '계정 인증 필요' if any(x in error for x in ('auth','login','sign in'))
                              else '모델 접근 실패' if 'model' in error else 'CLI 작업 미완료')
                    if reason=='구독 한도 또는 사용량 제한':raise QuotaError('Antigravity 구독 할당량 제한')
                    raise AIError('Antigravity: '+reason+' (상태: '+str(wrapper.get('status','없음'))[:40]+'). 자동 재요청하지 않았습니다.')
                output = json.dumps(wrapper['structured_output'],ensure_ascii=False) if isinstance(wrapper.get('structured_output'),dict) else wrapper.get('response','')
            reported_usage = (wrapper.get('usage') or wrapper.get('usageMetadata')) if provider in ('antigravity_cli','gemini_cli') else None
            audit_path.write_text(json.dumps({'provider':provider,'model':model,'response':output,'usage':reported_usage},ensure_ascii=False),encoding='utf-8')
    else: raise AIError('지원하지 않는 AI 연결입니다.')
    data = extract_json_safely(output)
    if not data: raise AIError('AI가 완전한 JSON 결과를 반환하지 않았습니다. 기존 결과를 유지했습니다.')
    if provider in ('openai_api','codex_cli','antigravity_cli','gemini_cli') and images:
        data['audio_summary'] = '음성 미분석 (선택한 연결은 프레임 분석만 수행)'
    return data
