import time
"""Real FFmpeg media path and simulated provider failures; no paid API calls."""
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch, Mock

from flask import Flask
import studio


class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.binary = os.environ.get('STUDIO_TEST_FFMPEG') or shutil.which('ffmpeg')
        if not cls.binary:
            raise RuntimeError('Set STUDIO_TEST_FFMPEG to run the actual media tests.')
        cls.fixture = Path(cls.tmp.name) / 'fixture.mp4'
        subprocess.run([cls.binary, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
            'testsrc=size=320x240:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000',
            '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(cls.fixture)], check=True)
        cls.fixture2 = Path(cls.tmp.name) / 'fixture2.mp4'
        subprocess.run([cls.binary, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
            'testsrc=size=320x240:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=16000',
            '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(cls.fixture2)], check=True)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        with patch.dict(os.environ, {'STUDIO_DATA_DIR': self.data.name, 'STUDIO_DOWNLOAD_ROOT': self.tmp.name}):
            self.app = Flask(__name__)
            self.pinterest_resolver = Mock(return_value=None)
            studio.register_studio(self.app, lambda: self.binary, self.pinterest_resolver)
        self.client = self.app.test_client()
        page = self.client.get('/studio/').get_data(as_text=True)
        self.token = re.search(r'name="studio-token" content="([^"]+)"', page)[1]
        self.headers = {'X-Studio-Token': self.token}

    def tearDown(self):
        self.data.cleanup()

    def upload(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        return response.json

    def test_custom_styles_persist_update_and_delete(self):
        initial=self.client.get('/studio/styles').json
        self.assertEqual(len(initial),15)
        self.assertEqual([s['id'] for s in initial[:4]], ['one_line', 'two_line', 'hook', 'story'])
        result=self.client.post('/studio/styles',json={'name':'내 설명형','instructions':'세 문장으로 차분하게'},headers=self.headers)
        sid=result.json[-1]['id']
        self.assertEqual(self.client.get('/studio/styles').json[-1]['name'],'내 설명형')
        self.assertEqual(self.client.post('/studio/styles',json={'id':sid,'name':'수정','instructions':'한 문장'},headers=self.headers).status_code,200)
        self.assertEqual(self.client.post('/studio/styles',json={'name':'','instructions':''},headers=self.headers).status_code,400)
        self.assertEqual(self.client.delete('/studio/styles/'+sid,headers=self.headers).status_code,200)
        self.assertEqual(len(self.client.get('/studio/styles').json),15)

    def test_usage_records_reported_tokens_errors_and_excludes_api_keys(self):
        job=self.upload()
        def generate_fixture(key,model,parts,schema,audit_path):
            audit_path.write_text(json.dumps({'usageMetadata':{'promptTokenCount':120,'candidatesTokenCount':30,'totalTokenCount':160}}),encoding='utf-8')
            return self.analysis(job)
        with patch.object(studio,'generate',side_effect=generate_fixture):
            self.assertEqual(self.post(job,'analyze',{'key':'private-key-test'}).status_code,200)
        with patch.object(studio,'generate',side_effect=studio.StudioError('quota',429)):
            self.assertEqual(self.post(job,'analyze',{'key':'private-key-test'}).status_code,429)
        response=self.client.get('/studio/usage')
        group=response.json['groups'][0]
        self.assertEqual((group['calls'],group['successful'],group['failed']),(2,1,1))
        self.assertEqual((group['input_tokens'],group['output_tokens'],group['total_tokens']),(120,30,160))
        self.assertEqual(group['reported_calls'],1)
        self.assertFalse(response.json['quota_available'])
        self.assertNotIn('private-key-test',response.get_data(as_text=True))
        self.assertNotIn('private-key-test',''.join(p.read_text(encoding='utf-8') for p in (Path(self.data.name)/'usage').glob('*.json')))

    def test_download_folder_list_and_import_legacy_file(self):
        os.utime(self.fixture,(1,1))
        listed=self.client.get('/studio/downloads').json
        item=next(x for x in listed if x['name']=='fixture.mp4')
        self.assertTrue(item['completed'])
        imported=self.client.post('/studio/imports',json=item,headers=self.headers)
        self.assertEqual(imported.status_code,201,imported.data)
        self.assertEqual(imported.json['name'],'fixture.mp4')

    def test_download_folder_changes_listing_thumbnail_import_and_survives_restart(self):
        selected = Path(self.data.name) / 'selected'
        selected.mkdir()
        copied = selected / 'chosen.mp4'
        shutil.copy2(self.fixture, copied)
        os.utime(copied, (1, 1))
        endpoint = '/studio/downloads/folder'
        for invalid in ('', 'relative/path', str(selected / 'missing'), str(copied)):
            self.assertEqual(self.client.post(endpoint, json={'path': invalid}, headers=self.headers).status_code, 400)
        self.assertEqual(self.client.post(endpoint, json={'path': str(selected)}).status_code, 403)
        response = self.client.post(endpoint, json={'path': str(selected)}, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json['path'], str(selected.resolve()))
        listed = self.client.get('/studio/downloads').json
        self.assertEqual([x['name'] for x in listed], ['chosen.mp4'])
        thumb = self.client.get(listed[0]['thumbnail_url'])
        self.assertEqual(thumb.status_code, 200)
        thumb.close()
        imported = self.client.post('/studio/imports', json=listed[0], headers=self.headers)
        self.assertEqual(imported.status_code, 201, imported.data)
        self.assertEqual(self.client.post('/studio/imports', json={'path': str(self.fixture), 'completed': True}, headers=self.headers).status_code, 403)
        with patch.dict(os.environ, {'STUDIO_DATA_DIR': self.data.name, 'STUDIO_DOWNLOAD_ROOT': self.tmp.name}):
            restarted = Flask('folder-restart')
            studio.register_studio(restarted, lambda: self.binary)
        self.assertEqual(restarted.test_client().get(endpoint).json['path'], str(selected.resolve()))

    def post(self, job, route, data):
        return self.client.post(f"/studio/jobs/{job['id']}/{route}", json=data, headers=self.headers)

    def analysis(self, job):
        return {'summary': '테스트 영상', 'audio_summary': '테스트 음성', 'observations': [
            {'timestamp': job['evidence']['frames'][0]['timestamp'], 'description': '테스트 패턴'}],
            'uncertainties': ['제품 식별 불가'], 'search_terms': ['제품 사용 영상']}

    def test_actual_media_extraction_and_persistence(self):
        job = self.upload()
        self.assertTrue(job['media']['has_audio'])
        self.assertEqual((job['media']['width'], job['media']['height']), (320, 240))
        self.assertEqual(len(job['evidence']['frames']), 6)

        directory = Path(self.data.name) / job['id']
        self.assertGreater((directory / 'audio.wav').stat().st_size, 1000)
        for frame in job['evidence']['frames']:
            self.assertTrue((directory / frame['file']).read_bytes().startswith(b'\xff\xd8'))
        response = self.client.get(f"/studio/jobs/{job['id']}/media/video")
        self.assertEqual(response.data, self.fixture.read_bytes())
        response.close()
        self.assertEqual(self.client.get('/studio/jobs').json[0]['status'], 'media_ready')
        self.assertIsNone(job['analysis'])

    def test_reuse_preserves_original_analysis_and_resets_publication(self):
        job = self.upload()
        with patch.object(studio, 'generate', return_value=self.analysis(job)):
            job = self.post(job, 'analyze', {'key': 'test'}).json
        root = Path(self.data.name)
        original_file = root / job['id'] / 'job.json'
        persisted = json.loads(original_file.read_text(encoding='utf-8'))
        persisted['publication'] = {'status': 'published', 'account_id': 'old-account', 'post_id': 'old-post'}
        persisted['status'] = 'published'
        original_file.write_text(json.dumps(persisted), encoding='utf-8')
        before = original_file.read_bytes()
        response = self.post(job, 'reuse', {})
        self.assertEqual(response.status_code, 201, response.data)
        reused = response.json
        self.assertNotEqual(reused['id'], job['id'])
        repeated = self.post(job, 'reuse', {})
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json['id'], reused['id'])
        self.assertEqual(self.post(reused, 'reuse', {}).json['id'], reused['id'])
        self.assertEqual(len(list(root.glob('*/job.json'))), 2)
        self.assertTrue(os.path.samefile(root / job['id'] / 'video', root / reused['id'] / 'video'))
        self.assertEqual(reused['analysis'], job['analysis'])
        self.assertEqual(reused['publication']['status'], 'not_published')
        self.assertNotIn('account_id', reused['publication'])
        self.assertEqual(reused['status'], 'analysis_ready')
        self.assertEqual(original_file.read_bytes(), before)
        self.assertEqual((root / reused['id'] / 'video').read_bytes(), (root / job['id'] / 'video').read_bytes())
        self.assertTrue(next(x for x in self.client.get('/studio/jobs').json if x['id'] == reused['id'])['analyzed'])
        with patch.object(studio, 'generate', return_value={'variants':['소개 글','판매 글','추천 글']}):
            self.assertEqual(self.post(reused, 'draft', {'key': 'test'}).status_code, 200)
        self.assertEqual(self.client.delete('/studio/jobs/'+reused['id']).status_code,403)
        response = self.client.delete('/studio/jobs/'+reused['id'],headers=self.headers)
        self.assertEqual(response.status_code,200,response.data)
        self.assertFalse((root / reused['id']).exists())
        self.assertTrue((root / job['id'] / 'video').is_file())
        self.assertEqual(original_file.read_bytes(),before)

    def test_unpublished_reuse_opens_existing_work_and_delete_preserves_input(self):
        job=self.upload()
        before=self.fixture.read_bytes()
        for _ in range(3):
            response=self.post(job,'reuse',{})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json['id'],job['id'])
        self.assertEqual(len(list(Path(self.data.name).glob('*/job.json'))),1)
        self.assertEqual(self.client.delete('/studio/jobs/'+job['id'],headers=self.headers).status_code,200)
        self.assertEqual(self.fixture.read_bytes(),before)
        self.assertEqual(self.client.get('/studio/jobs').json,[])
        self.assertEqual(self.client.delete('/studio/jobs/'+job['id'],headers=self.headers).status_code,404)

    def test_invalid_file_cleanup(self):
        response = self.client.post('/studio/jobs', data={'video': (io.BytesIO(b'not video'), 'fake.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(list(Path(self.data.name).iterdir()), [])

    def test_hook_edit_replaces_opening_preserves_audio_and_fills_selected_region(self):
        fixture = Path(self.data.name) / 'colored.mp4'
        subprocess.run([self.binary,'-hide_banner','-loglevel','error','-y',
            '-f','lavfi','-i','color=red:size=160x120:rate=12:duration=2',
            '-f','lavfi','-i','color=blue:size=160x120:rate=12:duration=2',
            '-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=4',
            '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0,drawbox=x=40:y=80:w=70:h=12:color=white:t=fill,drawbox=x=2:y=40:w=10:h=20:color=lime:t=fill[v]',
            '-map','[v]','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(fixture)],check=True)
        with fixture.open('rb') as stream:
            original = self.client.post('/studio/jobs',data={'video':(stream,'colored.mp4')},headers=self.headers).json
        with patch.object(studio,'generate',return_value=self.analysis(original)):
            original = self.post(original,'analyze',{'key':'test'}).json
        before = (Path(self.data.name)/original['id']/'video').read_bytes()
        response = self.post(original,'edit',{'hook_start':2.5,'opening_seconds':1,'subtitle_mode':'local_fill',
            'rectangle':{'x':20,'y':60,'w':55,'h':23}})
        self.assertEqual(response.status_code,201,response.data)
        edited = response.json
        self.assertNotEqual(edited['id'],original['id'])
        self.assertTrue(edited['media']['has_audio'])
        self.assertAlmostEqual(edited['media']['duration'],4,delta=.15)
        self.assertEqual(edited['edit']['source_job_id'],original['id'])
        self.assertEqual(edited['edit']['segments'],[[2.5,3.5],[0,2.5],[3.5,4]])
        intervals=sorted(edited['edit']['segments'])
        self.assertEqual(intervals[0][0],0)
        for left,right in zip(intervals,intervals[1:]):self.assertEqual(left[1],right[0])
        self.assertEqual(intervals[-1][1],original['media']['duration'])
        self.assertEqual(edited['analysis']['scope']['source_job_id'],original['id'])
        self.assertIsNone(edited['draft'])
        self.assertEqual((Path(self.data.name)/original['id']/'video').read_bytes(),before)
        path = Path(self.data.name)/edited['id']/'video'
        def pixel(time,x,y):
            output=subprocess.run([self.binary,'-hide_banner','-loglevel','error','-ss',str(time),'-i',str(path),
                '-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True).stdout
            return tuple(output[(y*160+x)*3:(y*160+x)*3+3])
        first=pixel(.25,10,10);rest=pixel(1.25,10,10);filled=pixel(.25,70,85)
        self.assertGreater(first[2],200)  # Blue highlight replaces the original red opening.
        self.assertGreater(rest[0],200)   # Unchanged continuation begins at original second 1.
        self.assertGreater(filled[2],200)
        self.assertLess(filled[0],35)     # White overlay removed on uniform background.
        focused=self.post(original,'edit',{'hook_start':2.5,'opening_seconds':1,'hook_effect':'zoom','effect_strength':3,'hook_focus':{'x':4,'y':42}})
        self.assertEqual(focused.status_code,201,focused.data)
        self.assertLessEqual(focused.json['edit']['hook_focus']['zoom_max'],1.18)
        path=Path(self.data.name)/focused.json['id']/'video'
        target=pixel(.3,7,55)
        self.assertGreater(target[1],180) # Product at the left edge stays visible instead of central cropping.
        self.assertLess(target[2],70)
        preview=self.client.get(f"/studio/jobs/{original['id']}/hook-frame?time=2.5")
        self.assertEqual(preview.status_code,200)
        self.assertEqual(preview.mimetype,'image/jpeg')
        self.assertEqual(self.post(original,'edit',{'hook_start':0,'opening_seconds':1,'hook_focus':{'x':101,'y':50}}).status_code,400)

        self.assertEqual(self.post(original,'edit',{'hook_start':99,'opening_seconds':1}).status_code,400)
        self.assertEqual(self.post(original,'edit',{'hook_start':0,'opening_seconds':float('nan')}).status_code,400)

    def test_hook_recommendations_rank_only_sampled_times_and_effects_render(self):
        job=self.upload()
        with patch.object(studio,'generate',return_value=self.analysis(job)):
            job=self.post(job,'analyze',{'key':'test'}).json
        timestamps=[round(job['media']['duration']*i/12,3) for i in range(12)]
        candidates=[{'timestamp':timestamps[2],'score':60,'reason':'사용 장면'},
                    {'timestamp':timestamps[8],'score':90,'reason':'제품 특징','product_box':{'x':5,'y':20,'w':30,'h':60}},
                    {'timestamp':999,'score':100,'reason':'잘못된 시각'}]
        with patch.object(studio,'generate',return_value={'candidates':candidates}) as generate:
            response=self.post(job,'hook-recommend',{'key':'test'})
        self.assertEqual(response.status_code,200,response.data)
        ranked=response.json['hook_recommendations']['candidates']
        self.assertEqual(len(ranked),2)
        self.assertEqual(ranked[0]['timestamp'],timestamps[8])
        self.assertEqual(ranked[0]['product_box']['x'],5)
        located=self.post(job,'edit',{'hook_start':timestamps[8],'opening_seconds':.2,'hook_effect':'zoom','effect_strength':3})
        self.assertEqual(located.status_code,201,located.data)
        self.assertEqual(located.json['edit']['hook_focus']['source'],'ai_box')
        self.assertEqual(sum('inlineData' in part for part in generate.call_args.args[2]),12)
        for effect in ('none','zoom','flash','shake','pulse','mono','fade','vignette','impact'):
            with self.subTest(effect=effect):
                response=self.post(job,'edit',{'hook_start':1,'opening_seconds':.5,'hook_effect':effect})
                self.assertEqual(response.status_code,201,response.data)
                self.assertEqual(response.json['edit']['hook_effect'],effect)
                self.assertTrue(response.json['media']['has_audio'])
                self.assertAlmostEqual(response.json['media']['duration'],job['media']['duration'],delta=.15)
                self.assertEqual(response.json['media']['width'],job['media']['width'])
        self.assertEqual(self.post(job,'edit',{'hook_start':1,'opening_seconds':.5,'hook_effect':'invalid'}).status_code,400)
        auto=self.post(job,'edit',{'hook_start':1,'opening_seconds':.5,'hook_effect':'flash','effect_strength':3,'subtitle_mode':'auto_subtitles'})
        self.assertEqual(auto.status_code,201,auto.data)
        self.assertTrue(auto.json['media']['has_audio'])
        self.assertGreater(auto.json['edit']['text_clean']['frames'],0)
        self.assertEqual(auto.json['edit']['effect_strength'],3)
        for position in ('left','right'):
            muted=self.post(job,'edit',{'hook_start':1,'opening_seconds':.5,'hook_effect':'impact','effect_strength':3,'subtitle_mode':'keep','mute_audio':True,'ad_position':position})
            self.assertEqual(muted.status_code,201,muted.data)
            self.assertFalse(muted.json['media']['has_audio'])
            self.assertEqual(muted.json['edit']['ad_position'],position)
            self.assertAlmostEqual(muted.json['media']['duration'],job['media']['duration'],delta=.15)
        self.assertEqual(self.post(job,'edit',{'hook_start':1,'opening_seconds':.5,'mute_audio':'yes'}).status_code,400)
        self.assertEqual(self.post(job,'edit',{'hook_start':1,'opening_seconds':.5,'ad_position':'center'}).status_code,400)


    def test_three_drafts_quota_fallback_and_saved_extension_packet(self):
        job=self.upload()
        with patch.object(studio,'generate',return_value=self.analysis(job)):job=self.post(job,'analyze',{'key':'test'}).json
        variants={'variants':['제품 사용 상황.\n\n첫 댓글 확인.','관찰한 제품 특징.','활용 팁 소개.']}
        with patch.object(studio,'generate_other',side_effect=[studio.QuotaError('quota'),variants]) as run,patch.object(studio,'antigravity_models',return_value=[{'model_id':'gemini-3.8-flash-medium','name':'Gemini 3.8 Flash'}]):
            response=self.post(job,'draft',{'provider':'antigravity_cli','model':'claude-test'})
        self.assertEqual(response.status_code,200,response.data)
        job=response.json
        self.assertEqual(len(job['draft']['variants']),3)
        self.assertEqual(job['draft']['model'],'gemini-3.8-flash-medium')
        self.assertEqual(run.call_count,2)
        with patch.object(studio,'generate_other',side_effect=studio.AIError('login')) as run:
            self.assertEqual(self.post(job,'draft',{'provider':'antigravity_cli','model':'claude-test'}).status_code,502)
        self.assertEqual(run.call_count,1)
        job=self.post(job,'product',{'platform':'naver','name':'제품','url':'https://smartstore.naver.com/test','affiliate_url':'https://naver.me/test','confirmed':True}).json
        with patch.object(studio,'generate',return_value=variants):job=self.post(job,'draft',{'key':'test'}).json
        job=self.post(job,'prepare',{'body':job['draft']['variants'][2],'script':job['draft']['variants'][2],'disclosure':'판매 발생 시 수수료를 제공받습니다.','selected':2}).json
        self.assertFalse(job['comment'].startswith('#광고'))
        self.assertTrue(job['comment'].startswith('판매 발생 시 수수료를 제공받습니다.'))
        self.assertIn('수수료',job['comment'])
        self.assertIn('https://naver.me/test',job['comment'])
        when=int(time.time()*1000)+3600000
        packet=self.post(job,'extension-export',{'when':when,'automatic':True})
        self.assertEqual(packet.status_code,200,packet.data)
        self.assertEqual(self.post(job,'extension-export',{'when':when,'automatic':True}).json['id'],packet.json['id'])
        delivery=self.client.get('/studio/delivery/'+packet.json['id'],headers={'Origin':'chrome-extension://test'})
        self.assertEqual(delivery.status_code,200)
        self.assertEqual(delivery.json['body'],job['draft']['variants'][2])
        self.assertEqual(delivery.json['comment'],job['comment'])
        media=self.client.get('/studio/delivery/'+packet.json['id']+'/video')
        self.assertEqual(media.status_code,200)
        self.assertEqual(media.mimetype,'video/mp4')
        media.close()
        self.assertEqual(self.client.get('/studio/delivery/'+'0'*48).status_code,404)
        self.assertTrue(self.client.post('/studio/jobs').is_json)
        self.assertTrue(self.client.get('/studio/session').json['token'])

    def test_commerce_credentials_are_encrypted_and_used_for_link(self):
        response=self.client.post('/studio/commerce-settings',json={'serp_key':'private-serp-test','coupang_access':'access-test','coupang_secret':'secret-test'},headers=self.headers)
        self.assertEqual(response.status_code,200,response.data)
        stored=(Path(self.data.name)/'credentials.dpapi').read_bytes()
        self.assertNotIn(b'private-serp-test',stored)
        self.assertNotIn('secret-test',response.get_data(as_text=True))
        job=self.upload()
        job=self.post(job,'product',{'platform':'coupang','name':'상품','url':'https://www.coupang.com/test','affiliate_url':'','confirmed':False}).json
        with patch.object(studio,'coupang_deeplink',return_value='https://link.coupang.com/issued') as issue:
            response=self.post(job,'affiliate-auto',{})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(issue.call_args.args[1:3],('access-test','secret-test'))
        self.assertEqual(response.json['product']['attribution'],'api_issued')

    def test_origin_and_token_rejected(self):
        self.assertEqual(self.client.post('/studio/jobs', headers={'Origin': 'https://evil.test'}).status_code, 403)
        self.assertEqual(self.client.get('/studio/jobs', headers={'Origin': 'https://evil.test'}).status_code, 403)
        self.assertEqual(self.client.post('/studio/jobs').status_code, 403)
        self.assertEqual(self.client.get('/studio/', headers={'Host': 'evil.test'}).status_code, 403)

    def test_completed_download_import_copies_real_file_and_source(self):
        source = 'https://www.threads.com/@owner/post/ONE'
        response = self.client.post('/studio/imports', json={'path': str(self.fixture), 'source': source, 'completed': True}, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        job = response.json
        self.assertEqual(job['source'], source)
        self.assertEqual((Path(self.data.name) / job['id'] / 'video').read_bytes(), self.fixture.read_bytes())
        self.assertEqual(len(job['evidence']['frames']), 6)
        self.assertTrue(job['media']['has_audio'])
        self.assertNotIn('path', job)
        self.assertEqual(self.client.post('/studio/imports', json={'path': str(self.fixture)}, headers=self.headers).status_code, 400)
        outside = Path(self.data.name) / 'outside.mp4'
        outside.write_bytes(self.fixture.read_bytes())
        self.assertEqual(self.client.post('/studio/imports', json={'path': str(outside), 'completed': True}, headers=self.headers).status_code, 403)

    def test_invalid_ai_analysis_preserves_response_before_validation(self):
        job = self.upload()
        payload = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '```json\n{"summary":"応答", "observations": []}\n```'}]}}],
                   'usageMetadata': {'totalTokenCount': 42}}
        provider = Mock(status_code=200, ok=True)
        provider.json.return_value = payload
        with patch.object(studio.requests, 'post', return_value=provider):
            response = self.post(job, 'analyze', {'key': 'private-key'})
        self.assertEqual(response.status_code, 502)
        files = list((Path(self.data.name) / job['id']).glob('analysis-response-*.json'))
        self.assertEqual(len(files), 1)
        saved = files[0].read_text(encoding='utf-8')
        self.assertNotIn('private-key', saved)
        self.assertEqual(json.loads(saved)['usageMetadata']['totalTokenCount'], 42)
        self.assertIsNone(self.client.get(f"/studio/jobs/{job['id']}").json['analysis'])

    def test_ai_receives_real_frames_audio_and_no_key_persisted(self):
        job = self.upload()
        with patch.object(studio, 'generate', return_value=self.analysis(job)) as generate:
            response = self.post(job, 'analyze', {'key': 'test-secret', 'model': 'test-model'})
        self.assertEqual(response.status_code, 200)
        parts = generate.call_args.args[2]
        media = [p['inlineData'] for p in parts if 'inlineData' in p]
        self.assertEqual(len(media), 7)
        self.assertEqual(media[-1]['mimeType'], 'audio/wav')
        self.assertNotIn('test-secret', (Path(self.data.name) / job['id'] / 'job.json').read_text(encoding='utf-8'))

    def test_quota_error_preserves_previous_analysis(self):
        job = self.upload()
        with patch.object(studio, 'generate', return_value=self.analysis(job)):
            job = self.post(job, 'analyze', {'key': 'test'}).json
        with patch.object(studio.requests, 'post', return_value=Mock(status_code=429)) as post:
            response = self.post(job, 'analyze', {'key': 'test'})
        self.assertEqual(response.status_code, 429)
        post.assert_called_once()
        self.assertEqual(self.client.get(f"/studio/jobs/{job['id']}").json['analysis'], job['analysis'])

    def test_analysis_rejects_unobserved_timestamp(self):
        job = self.upload()
        result = self.analysis(job)
        result['observations'][0]['timestamp'] = 999
        with patch.object(studio, 'generate', return_value=result):
            self.assertEqual(self.post(job, 'analyze', {'key': 'test'}).status_code, 502)
        self.assertIsNone(self.client.get(f"/studio/jobs/{job['id']}").json['analysis'])

    def test_prepare_never_marks_published_and_product_change_invalidates_draft(self):
        job = self.upload()
        self.assertEqual(self.post(job, 'draft', {'key': 'test'}).status_code, 400)
        with patch.object(studio, 'generate', return_value=self.analysis(job)):
            job = self.post(job, 'analyze', {'key': 'test'}).json
        product = {'platform': 'coupang', 'name': '테스트 상품', 'url': 'https://www.coupang.com/product',
                   'affiliate_url': 'https://link.coupang.com/test', 'confirmed': True}
        self.assertEqual(self.post(job, 'product', {**product, 'confirmed': False}).status_code, 400)
        job = self.post(job, 'product', product).json
        for field in ('script', 'body'):
            oversized = {'variants':['가'*500,'소개 글','판매 글']}
            with patch.object(studio, 'generate', return_value=oversized):
                self.assertEqual(self.post(job, 'draft', {'key': 'test'}).status_code, 422)
        with patch.object(studio, 'generate', return_value={'variants':['관찰 기반 대본','사용 장면 소개','제품 특징 소개']}):
            job = self.post(job, 'draft', {'key': 'test'}).json
        response = self.post(job, 'prepare', {'script': job['draft']['script'], 'body': job['draft']['body'],
                                            'disclosure': '링크 구매 시 수수료를 받을 수 있습니다.'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json['status'], 'publish_ready')
        self.assertEqual(response.json['publication']['status'], 'not_published')
        self.assertIn(product['affiliate_url'], response.json['comment'])
        self.assertEqual(self.post(job, 'prepare', {'script': 'test', 'body': '고지 없음', 'disclosure': 'test'}).status_code, 400)
        job = self.post(job, 'product', {**product, 'name': '다른 상품'}).json
        self.assertIsNotNone(job['draft'])
        self.assertTrue(job['draft'].get('needs_review'))
        self.assertIn('재검토', job['draft'].get('review_reason', ''))
        self.assertEqual(job['comment'], '')

    def test_external_routes_store_results_without_credentials_and_lock_started_job(self):
        job = self.upload()
        secret = 'only-in-request-secret'
        candidate = {'name': '검색 후보', 'url': 'https://www.coupang.com/vp/products/123',
                     'platform': 'coupang', 'verification': 'discovered'}
        with patch.object(studio, 'search_products', return_value=[candidate]):
            job = self.post(job, 'search', {'query': '상품', 'platform': 'coupang', 'key': secret}).json
        self.assertEqual(job['search']['candidates'][0]['verification'], 'discovered')
        job = self.post(job, 'product', {'platform': 'coupang', 'name': '상품', 'url': candidate['url']}).json
        with patch.object(studio, 'coupang_deeplink', return_value='https://link.coupang.com/test'):
            job = self.post(job, 'affiliate', {'access_key': 'access-secret', 'secret_key': secret}).json
        self.assertEqual(job['product']['affiliate_method'], 'coupang_api')
        stored = Path(self.data.name) / job['id'] / 'job.json'
        self.assertNotIn(secret, stored.read_text(encoding='utf-8'))
        self.assertNotIn('access-secret', stored.read_text(encoding='utf-8'))
        with patch.object(studio, 'threads_account') as account:
            self.assertEqual(self.post(job, 'publish', {'token': secret, 'confirmed': True}).status_code, 400)
            account.assert_not_called()
        job['publication']['account_id'] = '1'
        stored.write_text(json.dumps(job), encoding='utf-8')
        self.assertEqual(self.post(job, 'product', {'platform': 'coupang', 'name': '다른 상품', 'url': candidate['url']}).status_code, 409)

    def test_visual_search_uses_selected_job_frame_and_image_upload(self):
        job = self.upload()
        with patch.object(studio, 'search_visual', return_value=[{'name': '상품 후보', 'verification': 'discovered'}]) as call:
            response = self.post(job, 'visual-search', {'frame': 'frame-2.jpg', 'mode': 'products', 'key': 'not-persisted'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(call.call_args.args[0].name, 'frame-2.jpg')
            self.assertEqual(response.json['visual_search']['frame']['timestamp'], job['evidence']['frames'][2]['timestamp'])
            self.assertEqual(self.post(job, 'visual-search', {'frame': '../video', 'mode': 'products', 'key': 'test'}).status_code, 400)
        data = (Path(self.data.name) / job['id'] / 'frame-0.jpg').read_bytes()
        response = self.client.post('/studio/images', data={'image': (io.BytesIO(data), 'source.jpg')}, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json['kind'], 'image')
        self.assertFalse(response.json['media']['has_audio'])
        self.assertEqual(len(response.json['evidence']['frames']), 1)

    def test_reference_import_preserves_public_media_but_excludes_tokens(self):
        reference = {'id': 'ref1', 'username': 'owner', 'text': '게시문', 'permalink': 'https://www.threads.com/@owner/post/test',
                     'imageUrls': ['https://example.com/source.jpg'], 'videoUrls': ['https://example.com/source.mp4'],
                     'poster': 'https://example.com/poster.jpg', 'thumbnailUrl': 'https://example.com/thumb.jpg',
                     'tokens': {'access_token': 'private-secret'}}
        response = self.client.post('/studio/references/import', json={'reference': reference}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        result = self.client.get('/studio/references').json
        self.assertEqual(result[0]['videoUrls'], reference['videoUrls'])
        self.assertEqual(result[0]['poster'], 'https://example.com/poster.jpg')
        self.assertEqual(result[0]['thumbnailUrl'], 'https://example.com/thumb.jpg')
        self.assertNotIn('tokens', result[0])
        self.assertNotIn('private-secret', json.dumps(result))

    def test_link_only_reference_thumbnail_is_extracted_and_cached(self):
        self.client.post('/studio/references/import', json={'reference': {
            'permalink': 'https://www.pinterest.com/pin/123/', 'mediaKind': 'video'}}, headers=self.headers)
        ref = self.client.get('/studio/references').json[0]
        image = Path(self.data.name) / 'fixture.jpg'
        subprocess.run([self.binary, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(self.fixture),
                        '-frames:v', '1', str(image)], check=True)
        page = Mock(encoding='utf-8')
        page.iter_content.return_value = [b'<meta content="https://cdn.example/preview.jpg?a=1&amp;b=2" property="og:image">']
        preview = Mock(headers={'Content-Type': 'image/jpeg'})
        preview.iter_content.return_value = [image.read_bytes()]
        with patch('studio.safe_fetch_stream', side_effect=[(page, ref['permalink']), (preview, 'https://cdn.example/preview.jpg')]) as fetch:
            response = self.client.get(ref['previewUrl'])
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.mimetype, 'image/jpeg')
            self.assertEqual(fetch.call_args.args[0], 'https://cdn.example/preview.jpg?a=1&b=2')
            cached = self.client.get(ref['previewUrl'])
            self.assertEqual(cached.data, response.data)
            self.assertEqual(fetch.call_count, 2)
            response.close()
            cached.close()
        self.assertEqual(self.client.get('/studio/references/invalid/thumbnail').status_code, 404)

    def test_video_reference_without_poster_uses_own_video_and_caches_frame(self):
        self.client.post('/studio/references/import', json={'reference': {
            'permalink': 'https://www.threads.com/@demo/post/ONE', 'mediaKind': 'video',
            'videoUrls': ['https://cdn.example/own.mp4']}}, headers=self.headers)
        ref = self.client.get('/studio/references').json[0]
        video = Mock(headers={'Content-Type': 'video/mp4'})
        video.iter_content.return_value = [self.fixture.read_bytes()]
        with patch('studio.safe_fetch_stream', return_value=(video, 'https://cdn.example/own.mp4')) as fetch:
            response = self.client.get(ref['previewUrl'])
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.mimetype, 'image/jpeg')
            self.assertTrue(response.data.startswith(bytes([255,216])))
            self.assertEqual(fetch.call_args.args[0], 'https://cdn.example/own.mp4')
            cached = self.client.get(ref['previewUrl'])
            self.assertEqual(cached.status_code, 200)
            cached.close()
            response.close()
            self.assertEqual(fetch.call_count, 1)
        video.close.assert_called_once()

    def test_reference_preview_without_metadata_reports_unavailable(self):
        page = Mock(encoding='utf-8')
        page.iter_content.return_value = [b'<html>Login required</html>']
        with patch('studio.safe_fetch_stream', return_value=(page, 'https://example.com/post')):
            with self.assertRaises(studio.StudioError) as error:
                studio.fetch_reference_thumbnail({'permalink': 'https://example.com/post'})
        self.assertEqual(error.exception.status, 404)
        page.close.assert_called_once()

    def test_models_endpoint_crud_and_builtins(self):
        models = self.client.get('/studio/models').json
        self.assertTrue(any(m['model_id'] == 'gpt-6.1-sol' for m in models))
        self.assertTrue(any(m['model_id'] == 'gemini-3.8-flash' for m in models))
        # Add custom model
        create_res = self.client.post('/studio/models', json={'name': 'My Custom Model', 'model_id': 'custom-gpt', 'provider': 'openai_api', 'has_audio': False}, headers=self.headers)
        self.assertEqual(create_res.status_code, 200)
        models_after = self.client.get('/studio/models').json
        custom_entry = next((m for m in models_after if m['model_id'] == 'custom-gpt'), None)
        self.assertIsNotNone(custom_entry)
        self.assertFalse(custom_entry['verified'])
        # Cannot delete builtin model
        del_builtin = self.client.delete('/studio/models/builtin_codex_chatgpt61_sol', headers=self.headers)
        self.assertEqual(del_builtin.status_code, 404)
        # Delete custom model
        del_custom = self.client.delete(f"/studio/models/{custom_entry['id']}", headers=self.headers)
        self.assertEqual(del_custom.status_code, 200)
        self.assertFalse(any(m['model_id'] == 'custom-gpt' for m in self.client.get('/studio/models').json))

    def test_downloads_thumbnail_endpoint(self):
        # Create a file inside download root (self.data.name or self.tmp.name)
        test_file = Path(self.tmp.name) / 'fixture.mp4'
        self.assertTrue(test_file.is_file())
        thumb_res = self.client.get(f"/studio/downloads/thumbnail?path={test_file}")
        self.assertEqual(thumb_res.status_code, 200)
        self.assertEqual(thumb_res.content_type, 'image/jpeg')
        thumb_res.close()
        # Check security on invalid path outside download root
        bad_thumb = self.client.get('/studio/downloads/thumbnail?path=C:/Windows/System32/calc.exe')
        self.assertEqual(bad_thumb.status_code, 403)
        bad_thumb.close()

    def test_pinterest_acquire_uses_canonical_pin_and_specialized_resolver(self):
        response = Mock()
        response.headers = {'Content-Type': 'video/mp4'}
        response.iter_content.return_value = [self.fixture.read_bytes()]
        direct = 'https://v1.pinimg.com/videos/test.mp4'
        self.pinterest_resolver.return_value = direct
        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(response, direct)) as fetch:
            result = self.client.post('/studio/acquire', json={'url': 'https://kr.pinterest.com/pin/300404237670215552/', 'kind': 'video'}, headers=self.headers)
        self.assertEqual(result.status_code, 201)
        canonical = 'https://www.pinterest.com/pin/300404237670215552/'
        self.pinterest_resolver.assert_called_once_with(canonical)
        self.assertEqual(result.json['source'], canonical)
        self.assertTrue(result.json['media']['has_audio'])
        self.assertEqual(fetch.call_args.args[0], direct)

    def test_video_acquisition_rejects_poster_image(self):
        job = self.upload()
        image = (Path(self.data.name) / job['id'] / 'frame-0.jpg').read_bytes()
        response = Mock()
        response.headers = {'Content-Type': 'image/jpeg'}
        response.iter_content.return_value = [image]
        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(response, 'https://example.com/poster.jpg')):
            result = self.client.post('/studio/acquire', json={'url': 'https://example.com/post/1', 'media_url': 'https://example.com/poster.jpg', 'kind': 'video'}, headers=self.headers)
        self.assertEqual(result.status_code, 422)
        self.assertEqual(len(self.client.get('/studio/jobs').json), 1)

    def test_model_refresh_reads_account_without_persisting_credentials(self):
        response = Mock(ok=True)
        response.json.return_value = {'data': [{'id': 'account-model'}]}
        with patch('studio.requests.get', return_value=response) as call:
            result = self.client.post('/studio/models/refresh', json={'provider': 'openai_api', 'key': 'review-secret'}, headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json[0]['model_id'], 'account-model')
        self.assertEqual(call.call_args.kwargs['headers']['Authorization'], 'Bearer review-secret')
        self.assertFalse((Path(self.data.name) / 'models.json').exists())
        self.assertEqual(self.client.post('/studio/models/refresh', json={'provider': 'codex_cli'}, headers=self.headers).status_code, 422)

    def test_acquire_endpoint_ssrf_and_direct_url(self):
        # SSRF rejection (403 for private/local IP)
        bad_res = self.client.post('/studio/acquire', json={'url': 'http://127.0.0.1:8080/secret'}, headers=self.headers)
        self.assertEqual(bad_res.status_code, 403)
        self.assertIn('로컬 주소', bad_res.json.get('error', ''))
        # Direct media download simulation
        fake_video_bytes = self.fixture.read_bytes()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.ok = True
        mock_response.headers = {'Content-Type': 'video/mp4', 'Content-Length': str(len(fake_video_bytes))}
        mock_response.iter_content.return_value = [fake_video_bytes]
        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(mock_response, 'https://example.com/video.mp4')):
            acquire_res = self.client.post('/studio/acquire', json={'url': 'https://example.com/video.mp4'}, headers=self.headers)
            self.assertEqual(acquire_res.status_code, 201)
            self.assertEqual(acquire_res.json['status'], 'media_ready')
            self.assertEqual(acquire_res.json['source'], 'https://example.com/video.mp4')

    def test_job_upload_deduplication_by_sha256(self):
        # 1st upload
        job1 = self.upload()
        self.assertEqual(len(self.client.get('/studio/jobs').json), 1)

        # 2nd upload with identical video content
        with self.fixture.open('rb') as f:
            res2 = self.client.post('/studio/jobs', data={'video': (f, 'second_upload.mp4'), 'source': 'https://example.com/post2'}, headers=self.headers)
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json['id'], job1['id'])
        self.assertEqual(res2.json['sha256'], job1['sha256'])

        # Verify only 1 job exists in studio root
        jobs_list = self.client.get('/studio/jobs').json
        self.assertEqual(len(jobs_list), 1)
        self.assertEqual(jobs_list[0]['id'], job1['id'])

    def test_acquire_deduplication_prevents_duplicate_jobs(self):
        fake_video_bytes = self.fixture.read_bytes()
        mock_response = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
        mock_response.iter_content.return_value = [fake_video_bytes]

        # First acquire -> creates new job (201)
        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(mock_response, 'https://example.com/source_v1.mp4')):
            res1 = self.client.post('/studio/acquire', json={'url': 'https://example.com/post/1', 'media_url': 'https://example.com/source_v1.mp4'}, headers=self.headers)
        self.assertEqual(res1.status_code, 201)
        job_id = res1.json['id']
        self.assertEqual(len(self.client.get('/studio/jobs').json), 1)

        # Second acquire with exact same URL -> matched by pre-download source check (200)
        with patch('studio.check_safe_url') as safe_url_check, patch('studio.safe_fetch_stream') as fetch_check:
            res2 = self.client.post('/studio/acquire', json={'url': 'https://example.com/post/1', 'media_url': 'https://example.com/source_v1.mp4'}, headers=self.headers)
            self.assertEqual(res2.status_code, 200)
            self.assertEqual(res2.json['id'], job_id)
            fetch_check.assert_not_called()

        # Third acquire with different post URL but identical file bytes -> matched by SHA-256 deduplication (200)
        mock_response_3 = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
        mock_response_3.iter_content.return_value = [fake_video_bytes]
        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(mock_response_3, 'https://cdn2.example.com/another.mp4')):
            res3 = self.client.post('/studio/acquire', json={'url': 'https://example.com/post/999', 'media_url': 'https://cdn2.example.com/another.mp4'}, headers=self.headers)
            self.assertEqual(res3.status_code, 200)
            self.assertEqual(res3.json['id'], job_id)

        # Confirm still only 1 job in storage
        self.assertEqual(len(self.client.get('/studio/jobs').json), 1)

    def test_full_collection_thumbnail_acquire_and_reuse_flow(self):
        # Step 1: Collect reference from simulated browser
        ref_payload = {
            'reference': {
                'id': 'https://www.threads.com/@creator/post/flow_test_1',
                'permalink': 'https://www.threads.com/@creator/post/flow_test_1',
                'username': 'creator',
                'text': 'New flow test video',
                'mediaKind': 'video',
                'videoUrls': ['https://cdn.example.com/flow_video.mp4'],
                'poster': ''
            }
        }
        import_res = self.client.post('/studio/references/import', json=ref_payload, headers=self.headers)
        self.assertEqual(import_res.status_code, 200)

        # Step 2: Reference appears in library with previewUrl
        refs_res = self.client.get('/studio/references')
        self.assertEqual(refs_res.status_code, 200)
        refs = refs_res.json
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0]['username'], 'creator')
        preview_url = refs[0]['previewUrl']

        # Step 3: Fetch reference thumbnail via own-video fallback
        fake_video_bytes = self.fixture.read_bytes()
        thumb_img_mock = Mock(headers={'Content-Type': 'video/mp4'})
        thumb_img_mock.iter_content.return_value = [fake_video_bytes]
        with patch('studio.safe_fetch_stream', return_value=(thumb_img_mock, 'https://cdn.example.com/flow_video.mp4')):
            thumb_res = self.client.get(preview_url)
            self.assertEqual(thumb_res.status_code, 200)
            self.assertEqual(thumb_res.mimetype, 'image/jpeg')
            thumb_res.close()

        # Step 4: Acquire original media into studio job
        video_resp = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
        video_resp.iter_content.return_value = [fake_video_bytes]
        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(video_resp, 'https://cdn.example.com/flow_video.mp4')):
            acq_res = self.client.post('/studio/acquire', json={
                'url': refs[0]['permalink'],
                'media_url': refs[0]['videoUrls'][0],
                'kind': 'video'
            }, headers=self.headers)
            self.assertEqual(acq_res.status_code, 201)
            job = acq_res.json
            self.assertEqual(job['status'], 'media_ready')
            self.assertTrue(job['media']['has_audio'])

        # Step 5: Duplicate acquire does not create extra jobs
        with patch('studio.check_safe_url'):
            acq_dup = self.client.post('/studio/acquire', json={
                'url': refs[0]['permalink'],
                'media_url': refs[0]['videoUrls'][0],
                'kind': 'video'
            }, headers=self.headers)
            self.assertEqual(acq_dup.status_code, 200)
            self.assertEqual(acq_dup.json['id'], job['id'])
            self.assertEqual(len(self.client.get('/studio/jobs').json), 1)

        # Step 6: Unpublished reuse returns original job without clone
        reuse_res = self.client.post(f"/studio/jobs/{job['id']}/reuse", headers=self.headers)
        reuse_res_json = reuse_res.json
        reuse_res.close()
        self.assertEqual(reuse_res.status_code, 200)
        self.assertEqual(reuse_res_json['id'], job['id'])
        jobs_check = self.client.get('/studio/jobs')
        self.assertEqual(len(jobs_check.json), 1)
        jobs_check.close()

    def test_concurrent_acquire_creates_only_one_job(self):
        import concurrent.futures
        fake_video_bytes = self.fixture.read_bytes()

        def make_request():
            mock_resp = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
            mock_resp.iter_content.return_value = [fake_video_bytes]
            with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(mock_resp, 'https://example.com/concurrent_v.mp4')):
                res = self.client.post('/studio/acquire', json={
                    'url': 'https://example.com/post/concurrent',
                    'media_url': 'https://example.com/concurrent_v.mp4',
                    'kind': 'video'
                }, headers=self.headers)
                status = res.status_code
                data = res.json
                res.close()
                return status, data

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request) for _ in range(5)]
            results = [f.result() for f in futures]

        statuses = [r[0] for r in results]
        job_ids = {r[1]['id'] for r in results}
        self.assertEqual(len(job_ids), 1, "모든 동시 요청이 동일한 단일 job ID를 공유해야 합니다.")
        self.assertIn(201, statuses)
        self.assertTrue(all(s in (200, 201) for s in statuses))

        all_jobs_res = self.client.get('/studio/jobs')
        all_jobs = all_jobs_res.json
        all_jobs_res.close()
        self.assertEqual(len(all_jobs), 1, "동시 요청 후 작업은 정확히 1개만 생성되어야 합니다.")

    def test_sequential_repeat_requests_do_not_create_new_jobs(self):
        fake_video_bytes = self.fixture.read_bytes()
        mock_resp = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
        mock_resp.iter_content.return_value = [fake_video_bytes]

        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(mock_resp, 'https://example.com/repeat_v.mp4')):
            res1 = self.client.post('/studio/acquire', json={'url': 'https://example.com/post/repeat', 'media_url': 'https://example.com/repeat_v.mp4'}, headers=self.headers)
            self.assertEqual(res1.status_code, 201)
            job_id = res1.json['id']
            res1.close()

            # Sequential repeated acquires
            for _ in range(3):
                res = self.client.post('/studio/acquire', json={'url': 'https://example.com/post/repeat', 'media_url': 'https://example.com/repeat_v.mp4'}, headers=self.headers)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.json['id'], job_id)
                res.close()

        all_jobs_res = self.client.get('/studio/jobs')
        self.assertEqual(len(all_jobs_res.json), 1, "반복 요청 후에도 총 작업 수는 1개여야 합니다.")
        all_jobs_res.close()

    def test_different_carousel_slides_create_separate_jobs(self):
        # Carousel post with 2 distinct video slides
        post_url = 'https://www.threads.com/@creator/post/carousel_mixed'
        slide1_media = 'https://cdn.example.com/carousel_slide_1.mp4'
        slide2_media = 'https://cdn.example.com/carousel_slide_2.mp4'

        fake_video_bytes_1 = self.fixture.read_bytes()
        fake_video_bytes_2 = self.fixture2.read_bytes()
        resp1 = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
        resp1.iter_content.return_value = [fake_video_bytes_1]
        resp2 = Mock(status_code=200, ok=True, headers={'Content-Type': 'video/mp4'})
        resp2.iter_content.return_value = [fake_video_bytes_2]

        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(resp1, slide1_media)):
            res1 = self.client.post('/studio/acquire', json={'url': post_url, 'media_url': slide1_media}, headers=self.headers)
            self.assertEqual(res1.status_code, 201)
            job1_id = res1.json['id']
            res1.close()

        with patch('studio.check_safe_url'), patch('studio.safe_fetch_stream', return_value=(resp2, slide2_media)):
            res2 = self.client.post('/studio/acquire', json={'url': post_url, 'media_url': slide2_media}, headers=self.headers)
            # Different media in the same post must NOT be merged
            self.assertEqual(res2.status_code, 201)
            job2_id = res2.json['id']
            res2.close()

        self.assertNotEqual(job1_id, job2_id, "서로 다른 캐러셀 슬라이드는 별도의 작업으로 분리되어야 합니다.")
        all_jobs_res = self.client.get('/studio/jobs')
        jobs = all_jobs_res.json
        all_jobs_res.close()
        self.assertEqual(len(jobs), 2, "2개의 서로 다른 슬라이드는 총 2개의 작업으로 유지되어야 합니다.")

    def test_published_job_acquire_does_not_auto_reuse(self):
        # Create a job and mark it as published directly in job.json
        source_url = 'https://example.com/published_post'
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4'), 'source': source_url}, headers=self.headers)
        job = response.json
        job_id = job['id']
        job_path = Path(self.data.name) / job_id / 'job.json'
        persisted = json.loads(job_path.read_text(encoding='utf-8'))
        persisted['publication'] = {
            'account_id': 'threads-user-1',
            'post_id': 'https://www.threads.net/t/12345678',
            'comment_id': None,
            'status': 'published'
        }
        job_path.write_text(json.dumps(persisted), encoding='utf-8')

        # Re-acquiring the published job in normal 'prepare source' must NOT automatically trigger reuse_job
        with patch('studio.check_safe_url'):
            res = self.client.post('/studio/acquire', json={'url': source_url}, headers=self.headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json['id'], job_id, "기존 작업이 그대로 반환되어야 하며 자동 reuse_job 복제가 발생하지 않아야 합니다.")
            res.close()

        all_jobs_res = self.client.get('/studio/jobs')
        self.assertEqual(len(all_jobs_res.json), 1, "새 작업이 자동으로 생성되지 않아야 합니다.")
        all_jobs_res.close()

        # Only explicit user request to /jobs/<id>/reuse creates a new cloned job
        reuse_res = self.client.post(f'/studio/jobs/{job_id}/reuse', headers=self.headers)
        self.assertEqual(reuse_res.status_code, 201)
        cloned_id = reuse_res.json['id']
        self.assertNotEqual(cloned_id, job_id)
        reuse_res.close()

        all_jobs_res2 = self.client.get('/studio/jobs')
        self.assertEqual(len(all_jobs_res2.json), 2, "명시적 reuse 호출 시에만 새 작업이 추가되어 총 2개가 됩니다.")
        all_jobs_res2.close()

    def test_batch_save_and_delete_references(self):
        for idx in (1, 2, 3):
            res = self.client.post('/studio/references/import', json={
                'reference': {
                    'permalink': f'https://www.threads.com/@owner/post/batch_{idx}',
                    'username': f'user{idx}',
                    'text': f'Batch ref {idx}',
                    'mediaKind': 'video',
                    'videoUrls': [f'https://cdn.example.com/v_{idx}.mp4'],
                }
            }, headers=self.headers)
            self.assertEqual(res.status_code, 200)

        collected = self.client.get('/studio/references').json
        self.assertEqual(len(collected), 3)
        ids = [r['reference_id'] for r in collected]

        # Batch save 2 items to library (보관함)
        save_res = self.client.post('/studio/references/save', json={'ids': ids[:2]}, headers=self.headers)
        self.assertEqual(save_res.status_code, 200)
        self.assertTrue(save_res.json['saved'])
        self.assertEqual(save_res.json['saved_count'], 2)
        self.assertEqual(save_res.json['updated_count'], 0)
        self.assertEqual(save_res.json['total'], 2)
        self.assertFalse(save_res.json['already_saved'])

        # Saving the same 2 items again reports already_saved=True
        save_again = self.client.post('/studio/references/save', json={'ids': ids[:2]}, headers=self.headers)
        self.assertEqual(save_again.status_code, 200)
        self.assertEqual(save_again.json['saved_count'], 0)
        self.assertEqual(save_again.json['updated_count'], 2)
        self.assertTrue(save_again.json['already_saved'])

        saved_list = self.client.get('/studio/saved-references').json
        self.assertEqual({r['reference_id'] for r in saved_list}, set(ids[:2]))

        # Batch delete 2 items from collected references
        del_res = self.client.post('/studio/references/delete', json={'collection': 'collected', 'ids': ids[:2]}, headers=self.headers)
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json['deleted'], 2)

        remaining_collected = self.client.get('/studio/references').json
        self.assertEqual([r['reference_id'] for r in remaining_collected], [ids[2]])
        # Library items remain intact
        self.assertEqual(len(self.client.get('/studio/saved-references').json), 2)

    def test_carousel_and_media_text_edit_erase_mode_none_preserves_original_frame(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # 1. carousel-generate with UI value erase_mode='none' and overlay_position='center' must map to 'keep' and 'middle'
        # Even with auto_caption=True or leftover slide_texts, 'none' mode must not inject captions or dark boxes over the original frames
        car_res = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 3,
            'aspect': '4:5',
            'erase_mode': 'none',
            'overlay_position': 'center',
            'auto_caption': True,
            'slide_texts': ['잔여 문구 1', '잔여 문구 2', '잔여 문구 3'],
        }, headers=self.headers)
        self.assertEqual(car_res.status_code, 200)
        car = car_res.json['carousel']
        self.assertEqual(car['erase_mode'], 'keep')
        self.assertEqual(car['overlay_position'], 'middle')
        self.assertEqual(len(car['slides']), 3)
        for slide in car['slides']:
            self.assertEqual(slide['text'], '')

        # 2. media-text-edit with UI value erase_mode='none' and overlay_position='center' must succeed without StudioError
        edit_res = self.client.post(f'/studio/jobs/{job_id}/media-text-edit', json={
            'erase_mode': 'none',
            'overlay_text': '',
            'overlay_position': 'center',
        }, headers=self.headers)
        self.assertEqual(edit_res.status_code, 200)
        self.assertEqual(edit_res.json['text_edit']['erase_mode'], 'keep')
        self.assertEqual(edit_res.json['text_edit']['overlay_position'], 'middle')

        # 3. If previous edit created video-raw, carousel extraction must use video-raw
        raw_video = Path(self.data.name) / job_id / 'video-raw'
        self.assertTrue(raw_video.is_file())
        car_res2 = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 3,
            'aspect': '4:5',
            'erase_mode': 'cover_first',
            'overlay_position': 'bottom',
            'auto_caption': False,
            'slide_texts': ['표지 후킹 문구', '2번 문구', '3번 문구'],
        }, headers=self.headers)
        self.assertEqual(car_res2.status_code, 200)
        slides2 = car_res2.json['carousel']['slides']
        self.assertEqual(len(slides2), 3)
        self.assertEqual(slides2[0]['text'], '표지 후킹 문구')
        self.assertEqual(slides2[1]['text'], '')
        self.assertEqual(slides2[2]['text'], '')

        # 4. Per-slide timestamp update replaces only the requested slide
        upd_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-update', json={
            'index': 2,
            'timestamp': 1.25,
        }, headers=self.headers)
        self.assertEqual(upd_res.status_code, 200)
        self.assertEqual(upd_res.json['carousel']['slides'][1]['timestamp'], 1.25)

    def test_stage0_r1_exported_carousel_delivery_immutability_and_hash_invalidation(self):
        import hashlib
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # Generate initial carousel
        car_res = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 3,
            'aspect': '4:5',
            'erase_mode': 'none',
            'auto_caption': False,
        }, headers=self.headers)
        self.assertEqual(car_res.status_code, 200)

        # Prepare job for publish
        prep = self.client.post(f'/studio/jobs/{job_id}/prepare', json={
            'body': '첫 번째 예약 테스트 본문입니다.',
            'script': '첫 번째 예약 테스트 본문입니다.',
            'disclosure': '',
            'comment': '첫 번째 댓글',
        }, headers=self.headers)
        self.assertEqual(prep.status_code, 200)
        self.assertGreaterEqual(len(prep.json.get('draft_history') or []), 1)

        # Export carousel delivery 1
        exp1 = self.client.post(f'/studio/jobs/{job_id}/extension-export', json={
            'platform': 'instagram_carousel',
            'upload_format': 'carousel',
        }, headers=self.headers)
        self.assertEqual(exp1.status_code, 200)
        deliv1_id = exp1.json['id']
        deliv1_file0 = Path(self.data.name) / 'deliveries' / deliv1_id / 'file-0'
        self.assertTrue(deliv1_file0.is_file())
        deliv1_bytes_before = deliv1_file0.read_bytes()
        deliv1_sha_before = hashlib.sha256(deliv1_bytes_before).hexdigest()

        # Mutate slide 1 via carousel-slide-update with a new text and timestamp=0.0 (R4 + R1)
        upd = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-update', json={
            'index': 1,
            'timestamp': 0,
            'text': '수정된 표지 타이틀 문구',
            'erase_mode': 'title_first',
        }, headers=self.headers)
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(upd.json['carousel']['slides'][0]['timestamp'], 0.0)
        self.assertEqual(upd.json['carousel']['slides'][0]['text'], '수정된 표지 타이틀 문구')
        self.assertEqual(upd.json['carousel']['slides'][0]['erase_mode'], 'keep')

        # Verify delivery 1 file-0 bytes on disk were NOT mutated!
        deliv1_bytes_after = deliv1_file0.read_bytes()
        self.assertEqual(hashlib.sha256(deliv1_bytes_after).hexdigest(), deliv1_sha_before)
        # Verify working carousel-1.jpg changed
        working_slide0 = Path(self.data.name) / job_id / 'carousel-1.jpg'
        self.assertNotEqual(hashlib.sha256(working_slide0.read_bytes()).hexdigest(), deliv1_sha_before)

        # Re-exporting produces a new delivery_id with the updated slide
        exp2 = self.client.post(f'/studio/jobs/{job_id}/extension-export', json={
            'platform': 'instagram_carousel',
            'upload_format': 'carousel',
        }, headers=self.headers)
        self.assertEqual(exp2.status_code, 200)
        deliv2_id = exp2.json['id']
        self.assertNotEqual(deliv1_id, deliv2_id)
        deliv2_file0 = Path(self.data.name) / 'deliveries' / deliv2_id / 'file-0'
        self.assertEqual(
            hashlib.sha256(deliv2_file0.read_bytes()).hexdigest(),
            hashlib.sha256(working_slide0.read_bytes()).hexdigest()
        )
        # And delivery 1 is still intact
        self.assertEqual(hashlib.sha256(deliv1_file0.read_bytes()).hexdigest(), deliv1_sha_before)

    def test_stage0_r2_r3_r5_draft_history_saved_products_and_title_first(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # R5: title_first puts title on slide 1 with erase_mode='keep' (no OCR cover_box) and keeps slides 2..N untouched
        car_res = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 3,
            'aspect': '4:5',
            'erase_mode': 'title_first',
            'overlay_position': 'top',
            'auto_caption': False,
            'slide_texts': ['표지 전용 타이틀', '무시될 2번 문구', '무시될 3번 문구'],
        }, headers=self.headers)
        self.assertEqual(car_res.status_code, 200)
        car = car_res.json['carousel']
        self.assertEqual(car['erase_mode'], 'title_first')
        self.assertEqual(car['caption_scope'], 'first')
        self.assertEqual(car['slides'][0]['text'], '표지 전용 타이틀')
        self.assertEqual(car['slides'][0]['erase_mode'], 'keep')
        self.assertEqual(car['slides'][0]['role'], 'cover')
        self.assertEqual(car['slides'][1]['text'], '')
        self.assertEqual(car['slides'][1]['erase_mode'], 'keep')
        self.assertEqual(car['slides'][1]['role'], 'body')

        # R2: multiple prepare calls record bounded per-job draft_history
        self.client.post(f'/studio/jobs/{job_id}/prepare', json={'body': '첫 본문 버전', 'script': '첫 본문 버전'}, headers=self.headers)
        prep2 = self.client.post(f'/studio/jobs/{job_id}/prepare', json={'body': '두 번째 본문 버전', 'script': '두 번째 본문 버전'}, headers=self.headers)
        self.assertEqual(prep2.status_code, 200)
        bodies = [h['body'] for h in prep2.json['draft_history']]
        self.assertIn('첫 본문 버전', bodies)
        self.assertIn('두 번째 본문 버전', bodies)

        # R3: /studio/saved-products validation, CRUD, migration, and 50-item limit
        bad_save = self.client.post('/studio/saved-products', json={'name': '', 'affiliate_url': ''}, headers=self.headers)
        self.assertEqual(bad_save.status_code, 400)

        good_save = self.client.post('/studio/saved-products', json={
            'name': '스텐 배수구 거름망',
            'platform': 'coupang',
            'link_entry_mode': 'manual',
            'affiliate_url': 'https://link.coupang.com/a/test1',
        }, headers=self.headers)
        self.assertEqual(good_save.status_code, 200)
        saved_id = good_save.json['saved_id']
        self.assertEqual(len(good_save.json['products']), 1)

        # Delete
        del_res = self.client.delete('/studio/saved-products', json={'id': saved_id}, headers=self.headers)
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(len(del_res.json['products']), 0)

    def test_five_new_features_overlay_attachments_carousel_templates_and_multiplatform_images(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # 1. Media text edit with draggable coordinates (overlay_x, overlay_y) and top/hook title (title_text, title_x, title_y, title_end)
        edit_res = self.client.post(f'/studio/jobs/{job_id}/media-text-edit', json={
            'erase_mode': 'none',
            'overlay_text': '하단 자막 테스트',
            'overlay_position': 'bottom',
            'overlay_x': 45.0,
            'overlay_y': 80.0,
            'title_text': '초반 3초 후킹 타이틀',
            'title_position': 'top',
            'title_x': 50.0,
            'title_y': 16.0,
            'title_start': 0.0,
            'title_end': 3.5,
        }, headers=self.headers)
        self.assertEqual(edit_res.status_code, 200)
        te = edit_res.json['text_edit']
        self.assertEqual(te['overlay_text'], '하단 자막 테스트')
        self.assertEqual(te['overlay_x'], 45.0)
        self.assertEqual(te['overlay_y'], 80.0)
        self.assertEqual(te['title_text'], '초반 3초 후킹 타이틀')
        self.assertEqual(te['title_x'], 50.0)
        self.assertEqual(te['title_y'], 16.0)
        self.assertEqual(te['title_end'], 3.5)

        # 2. Attachments config for Threads/Instagram/Naver Clip/TikTok (영상 1 + 이미지 1 preset & reorder)
        att_res = self.client.post(f'/studio/jobs/{job_id}/attachments-config', json={
            'action': 'preset_video_plus_images',
            'image_count': 2,
            'source': 'frames',
        }, headers=self.headers)
        self.assertEqual(att_res.status_code, 200)
        self.assertEqual(len(att_res.json['attachments']), 2)

        move_res = self.client.post(f'/studio/jobs/{job_id}/attachments-config', json={
            'action': 'move',
            'index': 0,
            'direction': 1,
        }, headers=self.headers)
        self.assertEqual(move_res.status_code, 200)
        self.assertEqual(len(move_res.json['attachments']), 2)

        # 3. Carousel generate with cover_title, body slide_texts, template, and deterministic fallback
        self.client.post(f'/studio/jobs/{job_id}/prepare', json={
            'body': '자취방 삶의 질 수직상승 아이템!\n설치 10초 만에 끝납니다.\n물때 걱정이 사라졌어요.',
            'script': '자취방 삶의 질 수직상승 아이템!\n설치 10초 만에 끝납니다.\n물때 걱정이 사라졌어요.',
            'disclosure': '',
            'comment': '첫 댓글 링크 안내',
        }, headers=self.headers)

        car_res = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 3,
            'aspect': '4:5',
            'erase_mode': 'title_all',
            'template': 'highlight_hook',
            'cover_title': '',
            'slide_texts': [],
            'auto_caption': False,
        }, headers=self.headers)
        self.assertEqual(car_res.status_code, 200)
        car = car_res.json['carousel']
        self.assertEqual(car['template'], 'highlight_hook')
        self.assertEqual(len(car['slides']), 3)
        # Deterministic fallback must populate cover (slide 1) and body slides (slides 2..3) from draft body!
        self.assertTrue(bool(car['slides'][0]['text'].strip()))
        self.assertTrue(bool(car['slides'][1]['text'].strip()))
        self.assertTrue(bool(car['slides'][2]['text'].strip()))

        # 4. Extension export supports carousel/combo on naver_clip and tiktok as well as threads
        exp_naver_car = self.client.post(f'/studio/jobs/{job_id}/extension-export', json={
            'platform': 'naver_clip',
            'publish_format': 'carousel',
        }, headers=self.headers)
        self.assertEqual(exp_naver_car.status_code, 200)
        naver_packet = json.loads((Path(self.data.name) / 'deliveries' / exp_naver_car.json['id'] / 'packet.json').read_text(encoding='utf-8'))
        self.assertEqual(len(naver_packet['files']), 3)

        exp_tiktok_car = self.client.post(f'/studio/jobs/{job_id}/extension-export', json={
            'platform': 'tiktok',
            'publish_format': 'carousel',
        }, headers=self.headers)
        self.assertEqual(exp_tiktok_car.status_code, 200)
        tiktok_packet = json.loads((Path(self.data.name) / 'deliveries' / exp_tiktok_car.json['id'] / 'packet.json').read_text(encoding='utf-8'))
        self.assertEqual(len(tiktok_packet['files']), 3)

        # Combo (video 1 + 2 attached images = 3 files) vs video only (1 file)
        exp_threads_combo = self.client.post(f'/studio/jobs/{job_id}/extension-export', json={
            'platform': 'threads',
            'publish_format': 'combo',
        }, headers=self.headers)
        self.assertEqual(exp_threads_combo.status_code, 200)
        combo_packet = json.loads((Path(self.data.name) / 'deliveries' / exp_threads_combo.json['id'] / 'packet.json').read_text(encoding='utf-8'))
        self.assertEqual(len(combo_packet['files']), 3)
        self.assertEqual(combo_packet['files'][0]['kind'], 'video')
        self.assertEqual(combo_packet['files'][1]['kind'], 'image')

        exp_threads_video_only = self.client.post(f'/studio/jobs/{job_id}/extension-export', json={
            'platform': 'threads',
            'publish_format': 'video',
        }, headers=self.headers)
        self.assertEqual(exp_threads_video_only.status_code, 200)
        video_only_packet = json.loads((Path(self.data.name) / 'deliveries' / exp_threads_video_only.json['id'] / 'packet.json').read_text(encoding='utf-8'))
        self.assertEqual(len(video_only_packet['files']), 1)

    def test_magazine_carousel_8_themes_slide_actions_and_video_png_overlay(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # Inject rich analysis.result and product into job.json to verify 2-tier editorial harvesting
        job_path = Path(self.data.name) / job_id / 'job.json'
        persisted = json.loads(job_path.read_text(encoding='utf-8'))
        persisted['product'] = {
            'name': '무타공 스테인리스 선반',
            'summary': '자취방 욕실 수납 고민 끝',
            'affiliate_url': 'https://link.coupang.com/a/test2',
        }
        persisted['analysis'] = {
            'status': 'completed',
            'result': {
                'summary': '접착력 테스트 결과 5kg 아령도 버티는 무타공 욕실 선반입니다.',
                'audio_summary': '물빠짐 구조로 물때가 끼지 않아 위생적입니다.',
                'observations': [
                    '00:01 타일 벽면에 원터치로 부착하는 장면',
                    '00:02 샴푸 4통을 올려도 흔들림 없는 지지력',
                ],
                'search_terms': ['무타공 욕실 선반', '스테인리스 코너선반'],
            },
        }
        job_path.write_text(json.dumps(persisted, ensure_ascii=False), encoding='utf-8')

        # 1. Generate carousel with magazine_gradient theme and let fallback harvest 2-tier headline\nsubcopy
        car_res = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 4,
            'aspect': '4:5',
            'erase_mode': 'title_all',
            'template': 'magazine_gradient',
            'cover_title': '',
            'slide_texts': [],
            'auto_caption': False,
        }, headers=self.headers)
        self.assertEqual(car_res.status_code, 200)
        car = car_res.json['carousel']
        self.assertEqual(car['template'], 'magazine_gradient')
        self.assertEqual(len(car['slides']), 4)
        # Verify automatic Cover / Body / CTA role assignment
        self.assertEqual([s.get('role') for s in car['slides']], ['cover', 'body', 'body', 'cta'])
        # Cover and body slides must contain 2-tier headline\nsubcopy harvested from product & analysis.result
        self.assertIn('\n', car['slides'][0]['text'])
        self.assertIn('무타공 스테인리스 선반', car['slides'][0]['text'])

        # 1b. Test per-slide role & template override via /carousel-slide-update
        upd_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-update', json={
            'index': 2,
            'role': 'cta',
            'template': 'clean_white_card',
            'text': '[최종 요약] 무타공 선반 체크리스트\n1) 5kg 하중 지지 • 2) 원터치 부착 • 3) 물빠짐 위생 설계',
            'badge': 'SUMMARY & LINK',
        }, headers=self.headers)
        self.assertEqual(upd_res.status_code, 200)
        upd_slides = upd_res.json['carousel']['slides']
        self.assertEqual(upd_slides[1]['role'], 'cta')
        self.assertEqual(upd_slides[1]['template'], 'clean_white_card')
        self.assertEqual(upd_slides[1]['badge'], 'SUMMARY & LINK')

        # 2. Test slide deck actions: add, move, delete via /carousel-slide-action
        add_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-action', json={
            'action': 'add',
            'timestamp': 1.5,
            'text': '[추가 포인트] 물빠짐 완벽\n습기 많은 욕실에서도 물때 걱정 제로',
            'badge': 'WATERPROOF CHECK',
        }, headers=self.headers)
        self.assertEqual(add_res.status_code, 200)
        slides_after_add = add_res.json['carousel']['slides']
        self.assertEqual(len(slides_after_add), 5)
        self.assertEqual(slides_after_add[4]['badge'], 'WATERPROOF CHECK')
        self.assertEqual(slides_after_add[4]['role'], 'cta')

        move_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-action', json={
            'action': 'move',
            'index': 5,
            'direction': -1,
        }, headers=self.headers)
        self.assertEqual(move_res.status_code, 200)
        slides_after_move = move_res.json['carousel']['slides']
        self.assertEqual(slides_after_move[3]['badge'], 'WATERPROOF CHECK')
        self.assertEqual([s['index'] for s in slides_after_move], [1, 2, 3, 4, 5])

        del_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-action', json={
            'action': 'delete',
            'index': 4,
        }, headers=self.headers)
        self.assertEqual(del_res.status_code, 200)
        slides_after_del = del_res.json['carousel']['slides']
        self.assertEqual(len(slides_after_del), 4)
        self.assertEqual([s['index'] for s in slides_after_del], [1, 2, 3, 4])

        # 3. Test video media-text-edit with viral Korean video hook template (reels_giant_yellow_impact), kicker badge, and 2-line split
        edit_res = self.client.post(f'/studio/jobs/{job_id}/media-text-edit', json={
            'erase_mode': 'none',
            'template': 'warm_luxury',
            'title_badge': 'BEST PICK',
            'title_color': 'reels_giant_yellow_impact',
            'title_text': '밭일하시는 부모님 | 이거면 끝',
            'title_position': 'top',
            'title_x': 50.0,
            'title_y': 18.0,
            'title_start': 0.0,
            'title_end': 3.0,
            'overlay_text': '첫 댓글에서 *최저가 링크* 확인하세요',
            'overlay_position': 'bottom',
            'overlay_x': 50.0,
            'overlay_y': 82.0,
        }, headers=self.headers)
        self.assertEqual(edit_res.status_code, 200)
        te = edit_res.json['text_edit']
        self.assertEqual(te['template'], 'warm_luxury')
        self.assertEqual(te['title_badge'], 'BEST PICK')
        self.assertEqual(te['title_color'], 'reels_giant_yellow_impact')

    def test_carousel_story_draft_and_3part_cover_body_cta_generation(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        job_path = Path(self.data.name) / job_id / 'job.json'
        persisted = json.loads(job_path.read_text(encoding='utf-8'))
        persisted['product'] = {
            'name': '자동 회전 물걸레 청소기',
            'summary': '허리 숙일 필요 없는 초강력 듀얼 스핀 물걸레',
            'affiliate_url': 'https://link.coupang.com/a/spinmop',
        }
        persisted['analysis'] = {
            'status': 'completed',
            'result': {
                'summary': '분당 200회 회전으로 찌든 바닥 얼룩을 한 번에 닦아내는 무선 물걸레 청소기입니다.',
                'audio_summary': '물 분사 버튼으로 걸레가 마르지 않고 끝까지 촉촉하게 유지됩니다.',
                'observations': [
                    '00:01 커피 자국을 한 번에 지우는 장면',
                    '00:02 소파 밑 낮은 틈새까지 180도 눕혀서 청소하는 모습',
                ],
                'search_terms': ['무선 물걸레 청소기', '듀얼 스핀 청소기'],
            },
        }
        job_path.write_text(json.dumps(persisted, ensure_ascii=False), encoding='utf-8')

        # 1. Test /carousel-story-draft deterministic fallback (use_ai=False) returns 3-part cover, body, cta
        draft_res = self.client.post(f'/studio/jobs/{job_id}/carousel-story-draft', json={
            'count': 4,
            'use_ai': False,
        }, headers=self.headers)
        self.assertEqual(draft_res.status_code, 200)
        story = draft_res.json['carousel_story_draft']
        self.assertEqual(story['count'], 4)
        self.assertEqual(len(story['slides']), 4)
        self.assertEqual([s['role'] for s in story['slides']], ['cover', 'body', 'body', 'cta'])
        self.assertIn('자동 회전 물걸레 청소기', story['cover_title'])
        self.assertEqual(len(story['body_lines']), 3)
        self.assertIn('핵심 요약', story['slides'][3]['text'])

        # 2. Test /carousel-story-draft with mocked AI provider/model override
        mock_ai_dict = {
            'slides': [
                {'role': 'cover', 'headline': '걸레질 아직도 무릎 꿇고 하세요?', 'subcopy': '자동 회전 물걸레 청소기 실사용 3가지 포인트', 'timestamp': 0.2},
                {'role': 'body', 'headline': '포인트 1. 커피 얼룩 1초 컷', 'subcopy': '분당 200회 듀얼 스핀으로 찌든 때까지 깔끔 삭제', 'timestamp': 0.8},
                {'role': 'body', 'headline': '포인트 2. 소파 밑 180도 밀착', 'subcopy': '낮은 틈새까지 걸림 없이 쑥 들어가는 헤드 설계', 'timestamp': 1.5},
                {'role': 'cta', 'headline': '[최종 요약] 무선 물걸레 체크리스트', 'subcopy': '1) 200회 스핀 • 2) 물 분사 • 프로필·첫 댓글 링크 확인', 'timestamp': 2.1},
            ]
        }
        with patch.object(studio, 'generate', return_value=mock_ai_dict) as mocked_provider:
            ai_draft_res = self.client.post(f'/studio/jobs/{job_id}/carousel-story-draft', json={
                'count': 4,
                'use_ai': True,
                'provider': 'gemini_api',
                'model': 'gemini-2.5-flash',
                'key': 'test-key',
            }, headers=self.headers)
            self.assertEqual(ai_draft_res.status_code, 200)
            ai_story = ai_draft_res.json['carousel_story_draft']
            self.assertTrue(ai_story['ai_used'])
            self.assertEqual(ai_story['provider'], 'gemini_api')
            self.assertEqual(ai_story['model'], 'gemini-2.5-flash')
            self.assertIn('걸레질 아직도 무릎 꿇고 하세요?', ai_story['cover_title'])
            self.assertIn('[최종 요약]', ai_story['slides'][3]['text'])
            self.assertTrue(mocked_provider.called)

    def test_video_subtitle_erase_modes_blur_cover_inpaint_mask_and_zoom(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # 1. Test blur_subtitles with custom mask rectangle and 118% video zoom
        blur_res = self.client.post(f'/studio/jobs/{job_id}/media-text-edit', json={
            'erase_mode': 'blur_subtitles',
            'rectangle': {'x': 6, 'y': 72, 'w': 88, 'h': 18},
            'video_zoom': 118,
            'focus_x': 50,
            'focus_y': 45,
            'overlay_text': '[블러 모드] 테스트 자막',
        }, headers=self.headers)
        self.assertEqual(blur_res.status_code, 200)
        te_blur = blur_res.json['text_edit']
        self.assertEqual(te_blur['erase_mode'], 'blur_subtitles')
        self.assertEqual(te_blur['video_zoom'], 118.0)
        self.assertEqual(te_blur['focus_y'], 45.0)
        self.assertEqual(te_blur['rectangle']['y'], 72.0)

        # 2. Test cover_subtitles with custom mask_color, mask_opacity, and 125% zoom
        cover_res = self.client.post(f'/studio/jobs/{job_id}/media-text-edit', json={
            'erase_mode': 'cover_subtitles',
            'rectangle': {'x': 8, 'y': 70, 'w': 84, 'h': 20},
            'mask_color': '#1e293b',
            'mask_opacity': 0.90,
            'video_zoom': 125,
            'focus_x': 50,
            'focus_y': 50,
            'overlay_text': '*덮어씌우기* 테스트 자막',
        }, headers=self.headers)
        self.assertEqual(cover_res.status_code, 200)
        te_cover = cover_res.json['text_edit']
        self.assertEqual(te_cover['erase_mode'], 'cover_subtitles')
        self.assertEqual(te_cover['mask_color'], '#1e293b')
        self.assertAlmostEqual(float(te_cover['mask_opacity']), 0.90, places=2)
        self.assertEqual(te_cover['video_zoom'], 125.0)

    def test_carousel_cover_hook_formulas_and_slide_photo_paste_and_3tier_text(self):
        import base64
        import io
        from PIL import Image

        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        # 1. Verify Cover Hook Formulas ('question', 'number', 'twist') in carousel-story-draft
        for formula_key, expected_token in [
            ('question', '아직도'),
            ('number', '핵심 공식'),
            ('twist', '의외의 반전'),
        ]:
            draft_res = self.client.post(f'/studio/jobs/{job_id}/carousel-story-draft', json={
                'count': 4,
                'hook_formula': formula_key,
                'use_ai': False,
            }, headers=self.headers)
            self.assertEqual(draft_res.status_code, 200)
            draft = draft_res.json['carousel_story_draft']
            self.assertEqual(draft['hook_formula'], formula_key)
            self.assertIn(expected_token, draft['cover_title'])
            self.assertTrue(draft['slides'][0].get('title'))
            self.assertTrue(draft['slides'][0].get('subtitle'))

        # 2. Generate 4-slide carousel with hook_formula='number'
        gen_res = self.client.post(f'/studio/jobs/{job_id}/carousel-generate', json={
            'count': 4,
            'aspect': '4:5',
            'template': 'editorial_dark',
            'hook_formula': 'number',
            'cover_title': '[잘 터지는] *캐러셀* 제작하기\n잘 되는 캐러셀에는 공식이 있습니다!',
        }, headers=self.headers)
        self.assertEqual(gen_res.status_code, 200)
        slides = gen_res.json['carousel']['slides']
        self.assertEqual(len(slides), 4)
        self.assertEqual(slides[0]['title'], '[잘 터지는] *캐러셀* 제작하기')
        self.assertEqual(slides[0]['subtitle'], '잘 되는 캐러셀에는 공식이 있습니다!')

        # 3. Create a synthetic PNG data URL (simulating Ctrl+V clipboard paste or image upload)
        buf = io.BytesIO()
        Image.new('RGB', (320, 400), color=(28, 64, 128)).save(buf, format='PNG')
        fake_data_url = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')

        # 4. Update Slide 1 with pasted image_data_url + Title + Subtitle + Body Text
        upd_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-update', json={
            'index': 1,
            'image_data_url': fake_data_url,
            'title': '혹시 [캐러셀 첫장] *아직도 대충* 만드세요?',
            'subtitle': '첫 장이 전체 스와이프의 90%를 결정합니다!',
            'body_text': '· 질문형 후킹\n· 숫자·공식형 후킹\n· 반전·통념파괴형 후킹',
            'badge': 'QUESTION HOOK',
        }, headers=self.headers)
        self.assertEqual(upd_res.status_code, 200)
        s1 = upd_res.json['carousel']['slides'][0]
        self.assertTrue(s1.get('custom_image', '').startswith('carousel-custom-1-'))
        self.assertEqual(s1['title'], '혹시 [캐러셀 첫장] *아직도 대충* 만드세요?')
        self.assertEqual(s1['subtitle'], '첫 장이 전체 스와이프의 90%를 결정합니다!')
        self.assertIn('질문형 후킹', s1['body_text'])

        # 5. Add a new slide with pasted/uploaded image_data_url via carousel-slide-action
        add_res = self.client.post(f'/studio/jobs/{job_id}/carousel-slide-action', json={
            'action': 'add',
            'image_data_url': fake_data_url,
            'title': '[추가 사진 슬라이드] 핵심 비교',
            'subtitle': '복사·붙여넣기로 추가한 이미지 설명',
            'body_text': '· 전후 비교 디테일 체크',
        }, headers=self.headers)
        self.assertEqual(add_res.status_code, 200)
        after_slides = add_res.json['carousel']['slides']
        self.assertEqual(len(after_slides), 5)
        added_slide = after_slides[3]  # Inserted before final CTA slide
        self.assertTrue(added_slide.get('custom_image'))
        self.assertEqual(added_slide['title'], '[추가 사진 슬라이드] 핵심 비교')
        self.assertEqual(added_slide['subtitle'], '복사·붙여넣기로 추가한 이미지 설명')

    def test_video_text_inspector_11_typography_parameters_persist_and_render(self):
        with self.fixture.open('rb') as file:
            response = self.client.post('/studio/jobs', data={'video': (file, 'fixture.mp4')}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        job_id = response.json['id']

        res = self.client.post(f'/studio/jobs/{job_id}/media-text-edit', json={
            'erase_mode': 'none',
            'title_text': '[클릭 편집창] 타이틀 | 글꼴·기울임·자간·2중 획',
            'title_badge': 'HOT TREND',
            'title_color': 'reels_giant_yellow_impact',
            'title_font': 'black_han_sans',
            'title_size': 56,
            'title_bold': True,
            'title_italic': True,
            'title_underline': True,
            'title_text_color': '#ffea18',
            'title_bg_color': '#0f172a',
            'title_bg_opacity': 85,
            'title_letter_spacing': 3.5,
            'title_line_spacing': 1.25,
            'title_align': 'left',
            'title_scale_pct': 115,
            'title_opacity': 92,
            'title_stroke_width': 5,
            'title_stroke_color': '#000000',
            'title_double_stroke_width': 6,
            'title_double_stroke_color': '#f43f5e',
            'overlay_text': '하단 자막도 클릭 한 번으로\n색상·정렬·불투명도·줄간격 완벽 조절',
            'overlay_font': 'jua',
            'overlay_size': 44,
            'overlay_bold': False,
            'overlay_italic': True,
            'overlay_underline': True,
            'overlay_text_color': '#38bdf8',
            'overlay_bg_color': '#1e293b',
            'overlay_bg_opacity': 78,
            'overlay_letter_spacing': 2.0,
            'overlay_line_spacing': 1.40,
            'overlay_align': 'right',
            'overlay_scale_pct': 110,
            'overlay_opacity': 88,
            'overlay_stroke_width': 4,
            'overlay_stroke_color': '#000000',
            'overlay_double_stroke_width': 5,
            'overlay_double_stroke_color': '#facc15',
        }, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        te = res.json['text_edit']
        self.assertEqual(te['title_font'], 'black_han_sans')
        self.assertTrue(te['title_bold'])
        self.assertTrue(te['title_italic'])
        self.assertTrue(te['title_underline'])
        self.assertEqual(te['title_text_color'], '#ffea18')
        self.assertEqual(te['title_bg_color'], '#0f172a')
        self.assertEqual(te['title_bg_opacity'], 85.0)
        self.assertEqual(te['title_letter_spacing'], 3.5)
        self.assertEqual(te['title_line_spacing'], 1.25)
        self.assertEqual(te['title_align'], 'left')
        self.assertEqual(te['title_scale_pct'], 115.0)
        self.assertEqual(te['title_opacity'], 92.0)
        self.assertEqual(te['title_double_stroke_width'], 6)
        self.assertEqual(te['overlay_font'], 'jua')
        self.assertFalse(te['overlay_bold'])
        self.assertTrue(te['overlay_italic'])
        self.assertTrue(te['overlay_underline'])
        self.assertEqual(te['overlay_text_color'], '#38bdf8')
        self.assertEqual(te['overlay_align'], 'right')
        self.assertEqual(te['overlay_scale_pct'], 110.0)
        self.assertEqual(te['overlay_opacity'], 88.0)
        self.assertEqual(te['overlay_double_stroke_width'], 5)


if __name__ == '__main__':
    unittest.main()



