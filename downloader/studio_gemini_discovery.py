"""Grounded discovery only: one API request or bounded official CLI session."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import requests

class GeminiDiscoveryError(Exception):
    pass

def official_cli():
    binary=shutil.which('agy.exe') or shutil.which('agy')
    if not binary and os.name=='nt':
        path=Path(os.environ.get('LOCALAPPDATA',''))/'agy'/'bin'/'agy.exe'
        if path.is_file():binary=str(path)
    return [binary] if binary else None

def extract_video_ids(text):
    return list(dict.fromkeys(re.findall(r'https?://(?:(?:www|m)\.)?(?:youtube\.com/(?:shorts/|watch\?v=|embed/)|youtu\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])',text)))[:50]

def antigravity_transcript_sources(conversation_id,brain_root=None):
    if not conversation_id or not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',str(conversation_id)):return []
    root=Path(brain_root) if brain_root else Path.home()/'.gemini'/'antigravity-cli'/'brain'
    logs=root/str(conversation_id)/'.system_generated'/'logs'
    sources=[];seen=set()
    for name in ('transcript_full.jsonl','transcript.jsonl'):
        path=logs/name
        if not path.is_file():continue
        for line in path.read_text(encoding='utf-8',errors='replace').splitlines():
            try:obj=json.loads(line)
            except ValueError:continue
            if obj.get('type')!='GENERIC':continue
            content=obj.get('content','') or ''
            for title,url in re.findall(r'\[([^\]]+)\]\((https?://[^\)\s"<>]+)\)',content):
                if url not in seen:
                    seen.add(url)
                    sources.append({'url':url,'title':title or 'Antigravity 웹 검색 출처'})
            for url in re.findall(r'https?://[^\)\s"<>]+',content):
                if url not in seen:
                    seen.add(url)
                    sources.append({'url':url,'title':'Antigravity 웹 검색 출처'})
        if sources:break
    return sources

def resolve_grounding_redirects(sources,timeout=4):
    resolved=[];seen=set()
    for source in sources:
        if not isinstance(source,dict) or not source.get('url'):continue
        url=source['url'];target=url
        if 'vertexaisearch.cloud.google.com/grounding-api-redirect/' in url:
            try:
                resp=requests.head(url,allow_redirects=False,timeout=timeout,headers={'User-Agent':'Mozilla/5.0'})
                loc=resp.headers.get('Location') or resp.headers.get('location')
                if not loc and resp.status_code in (403,405):
                    resp=requests.get(url,allow_redirects=False,timeout=timeout,stream=True,headers={'User-Agent':'Mozilla/5.0'})
                    loc=resp.headers.get('Location') or resp.headers.get('location')
                    resp.close()
                if loc and loc.startswith(('http://','https://')):target=loc
            except requests.RequestException:pass
        if target not in seen:
            seen.add(target)
            item=dict(source);item['url']=target
            if target!=url:item['redirect_url']=url
            resolved.append(item)
    return resolved

def parse_antigravity_events(events,brain_root=None,resolve_redirects=True):
    searches=set();sources=[];seen_source_urls=set();accumulated_deltas=[];final={};conversation_id=''
    for event in events:
        if event.get('conversation_id') and not conversation_id:
            conversation_id=event['conversation_id']
        update=event.get('step_update',{})
        if update.get('conversation_id') and not conversation_id:
            conversation_id=update['conversation_id']
        tool=update.get('tool_name') or update.get('tool_info',{}).get('name')
        if tool in ('google_web_search','search_web','web_search'):
            searches.add(update.get('step_index'))
            output=update.get('tool_info',{}).get('result') or update.get('tool_info',{}).get('output') or ''
            for u in re.findall(r'https?://[^\s"<>]+',json.dumps(output,ensure_ascii=False)):
                if u not in seen_source_urls:
                    seen_source_urls.add(u)
                    sources.append({'url':u,'title':'Antigravity 웹 검색 출처'})
        if update.get('step_type')=='agent_response' and update.get('text_delta'):
            accumulated_deltas.append(update['text_delta'])
        if event.get('event')=='result' and isinstance(event.get('result'),dict):
            final=event['result']
            if final.get('conversation_id') and not conversation_id:
                conversation_id=final['conversation_id']
            for source in final.get('sources',[]) or []:
                if isinstance(source,dict) and source.get('url') and source['url'] not in seen_source_urls:
                    seen_source_urls.add(source['url'])
                    sources.append(source)
    if searches and not sources and conversation_id:
        for source in antigravity_transcript_sources(conversation_id,brain_root=brain_root):
            if source['url'] not in seen_source_urls:
                seen_source_urls.add(source['url'])
                sources.append(source)
    if resolve_redirects and sources:
        sources=resolve_grounding_redirects(sources)
    text=final.get('response','') or ''.join(accumulated_deltas)
    return text,sources,len(searches),final



def grounded_search(provider,key,model,prompt,audit_dir):
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,100}',model):
        raise GeminiDiscoveryError('Gemini 검색 모델 ID를 확인하세요.')
    audit_dir=Path(audit_dir);audit_dir.mkdir(parents=True,exist_ok=True)
    text='';sources=[];search_count=0;usage={}
    if provider=='gemini_search':
        if not key:
            raise GeminiDiscoveryError('Gemini 검색 API 키를 설정에 등록하세요.')
        response=requests.post('https://generativelanguage.googleapis.com/v1beta/interactions',headers={'x-goog-api-key':key},json={'model':model,'input':prompt,'tools':[{'type':'google_search'}]},timeout=120)
        if not response.ok:
            raise GeminiDiscoveryError(f'Gemini 검색 실패 (HTTP {response.status_code}). 자동 재시도·CLI 전환하지 않습니다.')
        data=response.json()
        for step in data.get('steps',[]):
            if step.get('type')=='google_search_call':
                search_count+=len(step.get('arguments',{}).get('queries',[])) or 1
            for block in step.get('content',[]):
                if block.get('type')=='text':
                    text+='\n'+block.get('text','')
                    sources.extend({'url':a.get('url',''),'title':a.get('title','')} for a in block.get('annotations',[]) if a.get('type')=='url_citation')
        # Some interactions versions expose final output blocks separately.
        for block in data.get('outputs',[]):
            if block.get('type')=='text':
                text+='\n'+block.get('text','')
                sources.extend({'url':a.get('url',''),'title':a.get('title','')} for a in block.get('annotations',[]) if a.get('type')=='url_citation')
        if sources:sources=resolve_grounding_redirects(sources)
        usage=data.get('usage',{})
    else:
        command=official_cli()
        if not command:
            raise GeminiDiscoveryError('공식 Antigravity CLI를 찾지 못했습니다. Gemini API를 선택하거나 CLI를 설치하세요.')
        with tempfile.TemporaryDirectory(prefix='antigravity-search-',dir=audit_dir) as tmp:
            env=os.environ.copy()
            for name in ('GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY'):env.pop(name,None)
            result=subprocess.run(command+['--model',model,'--mode','plan','--sandbox','--disable-slash-commands','--print-timeout','110s','--output-format','stream-json','-p',prompt],cwd=tmp,env=env,capture_output=True,timeout=120,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            events=[]
            for line in result.stdout.decode('utf-8',errors='replace').splitlines():
                try:events.append(json.loads(line))
                except ValueError:pass
            if result.returncode:
                raise GeminiDiscoveryError(f'Antigravity CLI 검색 실패 (종료 코드 {result.returncode}). 로그인·모델 권한을 확인하세요. 자동 API 전환하지 않습니다.')
            text,sources,search_count,final=parse_antigravity_events(events)
            usage=final.get('usage',{})
            data={'events':events}
            (audit_dir/'latest-response.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
            if final.get('status')!='SUCCESS' or final.get('error'):
                raise GeminiDiscoveryError(f'Antigravity 웹 검색 {search_count}회 실행 후 CLI 응답이 완료되지 않았습니다 (상태: {final.get("status","미확인")}). 영상 주소가 확보되지 않아 저장하지 않았습니다. 자동 재실행·API 전환하지 않습니다.')
    # Keep provider evidence locally, before parsing. Keys are never included.
    (audit_dir/'latest-response.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    if not search_count or not sources:
        raise GeminiDiscoveryError('Google 웹 검색 실행·출처 근거를 확인하지 못해 추천을 중단했습니다. 모델이 기억으로 만든 URL은 사용하지 않습니다.')
    ids=extract_video_ids(text+'\n'+'\n'.join(s['url'] for s in sources))
    return {'ids':ids,'sources':sources[:60],'search_queries_observed':search_count,'usage':usage,'text':text}
