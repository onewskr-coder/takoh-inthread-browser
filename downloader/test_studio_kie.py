import json
import os
from pathlib import Path
import re
import tempfile
import time
import unittest
from unittest.mock import patch,Mock
from flask import Flask
import studio
import studio_kie as kie
from studio_secrets import save as save_secrets,load as load_secrets

def response(payload,ok=True,status=200):return Mock(ok=ok,status_code=status,json=Mock(return_value=payload))

def completion(value):
    return response({'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(value)}]}],'usage':{'input_tokens':10,'output_tokens':20}})

class KieTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        with patch.dict(os.environ,{'STUDIO_DATA_DIR':self.tmp.name,'STUDIO_DOWNLOAD_ROOT':self.tmp.name,'KIE_API_KEY':''}):
            self.app=Flask(__name__);studio.register_studio(self.app,lambda:None,lambda _:None)
        self.client=self.app.test_client()
        self.token=re.search(r'name="studio-token" content="([^"]+)"',self.client.get('/studio/').text)[1]
        self.headers={'X-Studio-Token':self.token}
        save_secrets(self.root,{'openai_api_key':'untouched','kie_api_key':'test-kie-secret'})
        self.model='fixture/model'
        kie.save_cache(self.root,{'models':[{'id':'kie_fixture','provider':'kie_api','model_id':self.model,'name':'fixture','has_audio':False,'builtin':True}], 'details':{self.model:{'endpoint':'/openai/v1/responses','protocol':'responses','schema':{},'has_vision':True,'pricing':'fixture pricing, not a live quote','checked_at':time.time(),'generated':False}}})
    def tearDown(self):self.tmp.cleanup()
    def post(self,path,data):return self.client.post('/studio/'+path,headers=self.headers,json=data)
    def job(self):
        jid='a'*32;folder=self.root/jid;folder.mkdir(exist_ok=True);(folder/'frame-0.jpg').write_bytes(b'fake-frame')
        job={'id':jid,'name':'fixture','sha256':'b'*64,'publication':{},'evidence':{'frames':[{'file':'frame-0.jpg','timestamp':0}],'audio_seconds':0},'media':{'duration':1,'has_audio':False},'analysis':None,'product':None,'status':'media_ready'}
        (folder/'job.json').write_text(json.dumps(job),encoding='utf-8');return jid
    def test_key_encryption_auth_and_other_secrets_preserved(self):
        self.assertEqual(self.client.post('/studio/kie/settings',json={'key':'new-key'}).status_code,403)
        self.assertEqual(self.post('kie/settings',{'key':'new-key'}).status_code,200)
        self.assertEqual(load_secrets(self.root)['openai_api_key'],'untouched')
        self.assertNotIn(b'new-key',(self.root/'credentials.dpapi').read_bytes())
        data=self.client.get('/studio/kie/settings').text
        self.assertNotIn('new-key',data);self.assertFalse(json.loads(data)['auth_verified'])
        self.post('kie/settings',{'clear':True});self.assertNotIn('kie_api_key',load_secrets(self.root))
    @patch('studio_kie.requests.request')
    def test_metadata_schema_price_and_credit(self,request):
        schema={'paths':{'/openai/v1/responses':{'post':{'requestBody':{'content':{'application/json':{'schema':{'required':['model','input'],'properties':{'model':{'type':'string'},'input':{'description':'input_image supported'}}}}}}}}}}
        request.side_effect=[response({'code':200,'data':{'models':[{'model':self.model,'title':'Fixture model'}]}}),response({'code':200,'data':{'openapi':schema}}),response({'code':200,'data':{'pricingDesc':'fixture pricing'}}),response({'code':200,'data':125})]
        self.assertEqual(self.post('models/refresh',{'provider':'kie_api'}).json[0]['model_id'],self.model)
        with patch('studio_kie.time.sleep'):
            self.assertTrue(self.post('kie/model/inspect',{'model':self.model}).json['has_vision'])
        self.assertEqual(self.post('kie/credit',{}).json['credits'],125)
        self.assertTrue(all(c.args[0]=='GET' for c in request.call_args_list))
        self.assertEqual(request.call_count,4)
    @patch('studio_kie.requests.request')
    def test_no_confirmation_no_billing_and_no_text_only_image(self,request):
        jid=self.job();payload={'provider':'kie_api','model':self.model,'kie_frame_limit':1}
        self.assertEqual(self.post('jobs/'+jid+'/analyze',payload).status_code,422);request.assert_not_called()
        cache=kie.read_cache(self.root);cache['details'][self.model]['has_vision']=False;kie.save_cache(self.root,cache)
        payload['kie_approved']=True
        self.assertEqual(self.post('jobs/'+jid+'/analyze',payload).status_code,422);request.assert_not_called()
    @patch('studio_kie.requests.request')
    def test_analysis_draft_translation_persist_and_reload(self,request):
        jid=self.job();base={'provider':'kie_api','model':self.model,'kie_approved':True,'kie_frame_limit':1}
        result={'summary':'제품 사용 장면','audio_summary':'not used','observations':[{'timestamp':0,'description':'도구를 사용하는 장면'}],'uncertainties':['제품명 미확인'],'search_terms':['주방 도구']}
        request.return_value=completion(result)
        plan=self.post('kie/plan',{'job_id':jid,'model':self.model,'action':'analyze'});self.assertEqual(plan.json['frame_limit'],1)
        r=self.post('jobs/'+jid+'/analyze',base);self.assertEqual(r.status_code,200,r.text)
        sent=request.call_args.kwargs['json'];self.assertIn('input_image',json.dumps(sent));self.assertNotIn('audio/wav',json.dumps(sent))
        self.assertEqual(r.json['analysis']['scope']['audio_seconds'],0)
        request.return_value=completion({'variants':['첫 번째 소개 글입니다.','두 번째 소개 글입니다.','세 번째 소개 글입니다.']})
        r=self.post('jobs/'+jid+'/draft',{**base,'style':'two_line','include_ad_tag':False});self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(len(r.json['draft']['variants']),3)
        loaded=json.loads((self.root/jid/'job.json').read_text(encoding='utf-8'));self.assertEqual(loaded['draft']['provider'],'kie_api')
        self.assertEqual(loaded['analysis']['result']['summary'],'제품 사용 장면')
        request.return_value=completion({'translated':'한국어 번역'})
        r=self.post('jobs/'+jid+'/ocr-translate',{**base,'text':'中文文字'});self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json['translated_text'],'한국어 번역')
        self.assertEqual(json.loads((self.root/jid/'job.json').read_text(encoding='utf-8'))['media_ocr']['translated_text'],'한국어 번역')
    @patch('studio_kie.requests.request')
    def test_provider_failure_has_no_retry_and_preserves_job(self,request):
        jid=self.job();before=(self.root/jid/'job.json').read_bytes()
        request.return_value=response({'code':429,'msg':'test-kie-secret'},True)
        r=self.post('jobs/'+jid+'/analyze',{'provider':'kie_api','model':self.model,'kie_approved':True,'kie_frame_limit':1})
        self.assertEqual(r.status_code,422);self.assertEqual(request.call_count,1)
        self.assertNotIn('test-kie-secret',r.text);self.assertEqual(before,(self.root/jid/'job.json').read_bytes())
    @patch('studio_kie.requests.request')
    def test_unknown_model_never_bills(self,request):
        with self.assertRaises(kie.KieError):kie.generate(self.root,'secret','unknown',[{'text':'test'}],{},self.root/'audit.json',approved=True)
        request.assert_not_called()
    @patch('studio_kie.requests.request')
    def test_standalone_translation_saved_reloaded_and_failure_preserves(self,request):
        self.assertEqual(self.post('kie/plan',{'model':self.model,'action':'translate'}).json['frame_limit'],0)
        request.return_value=completion({'translated':'저장되는 한국어 번역'})
        data={'model':self.model,'text':'test source','kie_approved':True,'kie_frame_limit':0}
        result=self.post('kie/translate',data);self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(self.client.get('/studio/kie/settings').json['translation']['text'],'저장되는 한국어 번역')
        request.return_value=response({'code':402})
        self.assertEqual(self.post('kie/translate',data).status_code,422)
        self.assertEqual(self.client.get('/studio/kie/settings').json['translation']['text'],'저장되는 한국어 번역')
    @patch('studio_kie.requests.request')
    def test_messages_chat_and_gemini_response_shapes(self,request):
        for protocol,endpoint,payload in [
            ('messages','/anthropic/v1/messages',{'content':[{'type':'text','text':'{"translated":"번역"}'}],'stop_reason':'end_turn'}),
            ('chat','/fixture/v1/chat/completions',{'choices':[{'finish_reason':'stop','message':{'content':'{"translated":"번역"}'}}]}),
            ('gemini','/v1beta/models/fixture:generateContent',{'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{"translated":"번역"}'}]}}]})]:
            cache=kie.read_cache(self.root);cache['details'][self.model].update(protocol=protocol,endpoint=endpoint);kie.save_cache(self.root,cache)
            request.return_value=response(payload)
            result=kie.generate(self.root,'secret',self.model,[{'text':'translate'}],{},self.root/'audit.json',approved=True)
            self.assertEqual(result['translated'],'번역');self.assertEqual(request.call_args.args[1],kie.BASE+endpoint)
    @patch('studio_kie.requests.request')
    def test_expired_schema_and_frame_limit_block_calls(self,request):
        with self.assertRaises(kie.KieError):kie.generate(self.root,'secret',self.model,[{'inlineData':{'mimeType':'image/jpeg','data':'ZmFrZQ=='}}],{},self.root/'audit.json',approved=True,frame_limit=0)
        cache=kie.read_cache(self.root);cache['details'][self.model]['checked_at']=0;kie.save_cache(self.root,cache)
        with self.assertRaises(kie.KieError):kie.generate(self.root,'secret',self.model,[{'text':'test'}],{},self.root/'audit.json',approved=True)
        request.assert_not_called()
    @patch('studio_kie.requests.request')
    def test_malformed_or_incomplete_generation_never_marks_success(self,request):
        request.return_value=response({'status':'incomplete','output':[]})
        with self.assertRaises(kie.KieError):kie.generate(self.root,'secret',self.model,[{'text':'test'}],{},self.root/'audit.json',approved=True)
        self.assertFalse(kie.read_cache(self.root)['details'][self.model]['generated'])
        request.return_value=completion({'arbitrary':'value'})
        # Strict downstream analysis/draft validators remain responsible for task schemas.
        jid=self.job();before=(self.root/jid/'job.json').read_bytes()
        result=self.post('jobs/'+jid+'/analyze',{'provider':'kie_api','model':self.model,'kie_approved':True,'kie_frame_limit':1})
        self.assertEqual(result.status_code,502);self.assertEqual(before,(self.root/jid/'job.json').read_bytes())

if __name__=='__main__':unittest.main()
