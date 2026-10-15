"""Independent KIE adapter. Metadata is cached locally; generation never retries."""
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import quote, unquote
import requests

BASE = 'https://api.kie.ai'

class KieError(Exception):
    pass

def model_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/:-]{0,149}',value) or '..' in value:
        raise KieError('KIE 모델 ID를 확인하세요.')
    return value

def request(method,path,key,body=None,params=None):
    if not key:raise KieError('KIE API 키를 암호화 저장하세요.')
    try:
        response=requests.request(method,BASE+path,headers={'Authorization':'Bearer '+key},json=body,params=params,timeout=120 if method=='POST' else 20,allow_redirects=False)
    except requests.RequestException:
        raise KieError('KIE 연결 실패 또는 시간 초과. 자동 재시도하지 않았습니다.') from None
    if not response.ok:raise KieError(f'KIE 요청 실패 (HTTP {response.status_code}). 자동 재시도·공급자 전환 없음.')
    try:data=response.json()
    except ValueError:raise KieError('KIE 응답이 JSON 형식이 아닙니다.') from None
    if not isinstance(data,dict):raise KieError('KIE 응답 형식을 확인하지 못했습니다.')
    if 'code' in data and str(data['code'])!='200':
        raise KieError(f'KIE 처리 실패 (코드 {data["code"]}). 자동 재시도하지 않았습니다.')
    return data

def read_cache(root):
    path=Path(root)/'kie-models.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {'models':[],'details':{}}

def save_cache(root,data):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    path=root/'kie-models.json';tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');tmp.replace(path)

def models(root,key):
    payload=request('GET','/api/v1/models',key,params={'taskType':'Chat'})
    rows=payload.get('data',{}).get('models',[])
    if not isinstance(rows,list):raise KieError('KIE 모델 목록 형식을 확인하지 못했습니다.')
    entries=[]
    for row in rows:
        mid=row.get('model') or row.get('slug')
        try:model_id(mid)
        except KieError:continue
        entries.append({'id':'kie_'+hashlib.sha256(mid.encode()).hexdigest()[:16],'provider':'kie_api','model_id':mid,'name':row.get('title') or mid,'has_audio':False,'has_vision':None,'verified':False,'builtin':True,'pricing':row.get('pricingDesc') or ''})
    cache=read_cache(root);cache.update(models=entries,listed_at=time.time());save_cache(root,cache)
    return entries

def deref(value,document,depth=0):
    if depth>16:return {}
    if isinstance(value,dict):
        if '$ref' in value:
            target=document
            if not value['$ref'].startswith('#/'):raise KieError('외부 스키마 참조는 지원하지 않습니다.')
            for segment in value['$ref'][2:].split('/'):
                target=target.get(unquote(segment).replace('~1','/').replace('~0','~'),{})
            return deref(target,document,depth+1)
        return {k:deref(v,document,depth+1) for k,v in value.items()}
    if isinstance(value,list):return [deref(v,document,depth+1) for v in value]
    return value

def inspect_model(root,key,model):
    mid=model_id(model);cache=read_cache(root)
    if not any(m['model_id']==mid for m in cache['models']):raise KieError('먼저 KIE 모델 목록을 조회하고 목록에서 선택하세요.')
    document=request('GET','/api/v1/models/'+quote(mid,safe='/')+'/schema',key).get('data',{}).get('openapi')
    if not isinstance(document,dict):raise KieError('이 모델의 스키마가 제공되지 않아 호출을 차단했습니다.')
    selected=None
    for path,verbs in document.get('paths',{}).items():
        if 'post' not in verbs:continue
        protocol='responses' if path.endswith('/responses') else 'messages' if path.endswith('/messages') else 'chat' if path.endswith('/chat/completions') else 'gemini' if path.endswith(':generateContent') else None
        if not protocol:continue
        endpoint=path.replace('{model}',quote(mid,safe='/-._:'))
        if not re.fullmatch(r'/[A-Za-z0-9/._:-]+',endpoint) or '..' in endpoint:continue
        schema=deref(verbs['post'].get('requestBody',{}).get('content',{}).get('application/json',{}).get('schema',{}),document)
        image_evidence=json.dumps(schema).lower()
        vision=any(term in image_evidence for term in ('input_image','image_url','inline_data','inlinedata','"image"'))
        selected={'endpoint':endpoint,'protocol':protocol,'schema':schema,'has_vision':vision,'checked_at':time.time()};break
    if not selected:raise KieError('이 모델은 현재 지원하는 동기식 분석·텍스트 API 스키마가 아닙니다. 다른 모델을 선택하세요.')
    # Discovery/schema/price share a rate limit. One explicit action, no retry.
    time.sleep(1.1)
    pricing=request('GET','/api/v1/models/'+quote(mid,safe='/')+'/price',key).get('data',{}).get('pricingDesc')
    if not pricing:raise KieError('모델 요금을 확인하지 못해 생성 준비를 중단했습니다.')
    selected['pricing']=pricing
    selected['generated']=False
    cache.setdefault('details',{})[mid]=selected
    for row in cache['models']:
        if row['model_id']==mid:row.update(has_vision=vision,name=row['name'],pricing=pricing)
    save_cache(root,cache)
    return {k:v for k,v in selected.items() if k!='schema'}

def credit(key):
    value=request('GET','/api/v1/chat/credit',key).get('data')
    if not isinstance(value,(int,float)) or isinstance(value,bool):raise KieError('KIE 크레딧 응답 형식을 확인하지 못했습니다.')
    return {'credits':value,'checked_at':time.time()}

def generate(root,key,model,parts,result_schema,audit_path,approved=False,frame_limit=0):
    mid=model_id(model);config=read_cache(root).get('details',{}).get(mid)
    if not config or time.time()-config['checked_at']>86400:raise KieError('KIE 모델 스키마·요금을 먼저 확인하세요. 확인 정보는 24시간 유효합니다.')
    images=[p['inlineData'] for p in parts if p.get('inlineData',{}).get('mimeType','').startswith('image/')]
    if images and not config['has_vision']:raise KieError('이 모델 스키마에서 이미지 입력을 확인하지 못했습니다. 프레임을 보내지 않았습니다.')
    if not approved or len(images)>frame_limit:raise KieError('KIE 유료 요청과 프레임 전송 범위를 먼저 확인하세요.')
    prompt='\n'.join(p['text'] for p in parts if 'text' in p)+'\n음성은 전송하지 않았습니다. 음성 내용을 추측하지 마세요. 완전한 JSON 객체만 반환하세요:\n'+json.dumps(result_schema,ensure_ascii=False)
    protocol=config['protocol']
    if protocol=='responses':
        content=[{'type':'input_text','text':prompt}]+[{'type':'input_image','image_url':'data:'+p['mimeType']+';base64,'+p['data']} for p in images]
        body={'model':mid,'input':[{'role':'user','content':content}],'stream':False}
    elif protocol in ('messages','chat'):
        content=[{'type':'text','text':prompt}]
        for p in images:
            content.append({'type':'image','source':{'type':'base64','media_type':p['mimeType'],'data':p['data']}} if protocol=='messages' else {'type':'image_url','image_url':{'url':'data:'+p['mimeType']+';base64,'+p['data']}})
        body={'model':mid,'messages':[{'role':'user','content':content}],'max_tokens':4096,'stream':False}
    else:
        body={'contents':[{'role':'user','parts':[{'text':prompt}]+[{'inlineData':p} for p in images]}]}
    properties=config['schema'].get('properties',{})
    for field in config['schema'].get('required',[]):
        if field not in body:
            if 'default' in properties.get(field,{}):body[field]=properties[field]['default']
            else:raise KieError('모델 필수 입력 필드 미지원: '+field+' · 요청하지 않았습니다.')
    raw=request('POST',config['endpoint'],key,body=body)
    payload=raw.get('data') if isinstance(raw.get('data'),dict) else raw
    # Record only the response, never request images, prompt or credentials.
    Path(audit_path).write_text(json.dumps({'provider':'kie_api','model':mid,'response':payload,'usage':payload.get('usage') or payload.get('usageMetadata')},ensure_ascii=False),encoding='utf-8')
    if protocol=='responses':
        if payload.get('status')!='completed':raise KieError('KIE 응답이 완료되지 않았습니다. 자동 재요청하지 않습니다.')
        output=''.join(c.get('text','') for item in payload.get('output',[]) if item.get('type')=='message' for c in item.get('content',[]) if c.get('type')=='output_text')
    elif protocol=='messages':
        if payload.get('stop_reason') not in ('end_turn','stop_sequence'):raise KieError('KIE 메시지가 완료되지 않았습니다.')
        output=''.join(c.get('text','') for c in payload.get('content',[]) if c.get('type')=='text')
    elif protocol=='chat':
        choices=payload.get('choices',[])
        if not choices or choices[0].get('finish_reason')!='stop':raise KieError('KIE 채팅 응답이 완료되지 않았습니다.')
        output=choices[0].get('message',{}).get('content','')
    else:
        candidates=payload.get('candidates',[])
        if not candidates or candidates[0].get('finishReason')!='STOP':raise KieError('KIE Gemini 응답이 완료되지 않았습니다.')
        output=''.join(p.get('text','') for p in candidates[0].get('content',{}).get('parts',[]))
    from studio_writing import extract_json_safely
    result=extract_json_safely(output)
    if not isinstance(result,dict) or not result:raise KieError('KIE가 완전한 JSON 결과를 반환하지 않았습니다. 기존 결과는 유지합니다.')
    if images:result['audio_summary']='음성 미분석 (KIE는 프레임·텍스트만 전송)'
    cache=read_cache(root)
    if mid in cache.get('details',{}):cache['details'][mid]['generated']=True;save_cache(root,cache)
    return result
