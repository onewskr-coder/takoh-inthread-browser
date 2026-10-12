import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
from studio_ai import generate_other, AIError, QuotaError, cli_status, antigravity_models


class AITests(unittest.TestCase):
    def test_openai_images_complete_and_no_audio_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            response=Mock(ok=True); response.json.return_value={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'summary':'프레임','audio_summary':'추측'})}]}]}
            with patch('studio_ai.requests.post',return_value=response) as post:
                data=generate_other('openai_api','secret-key','gpt-4.1',[{'text':'분석'},{'inlineData':{'mimeType':'image/jpeg','data':'eA=='}},{'inlineData':{'mimeType':'audio/wav','data':'eA=='}}],{},Path(tmp)/'audit.json')
            self.assertIn('음성 미분석',data['audio_summary'])
            self.assertFalse(post.call_args.kwargs['json']['store'])
            self.assertEqual(post.call_args.kwargs['json']['input'][0]['content'][1]['type'],'input_image')
            self.assertNotIn('secret-key',(Path(tmp)/'audit.json').read_text())

    def test_cli_stdin_images_readonly_and_no_api_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            def run(args,**kwargs):
                self.assertIn('--sandbox',args);self.assertIn('read-only',args);self.assertIn('-i',args)
                self.assertEqual(args[-1],'-');self.assertIsInstance(kwargs['input'],bytes)
                self.assertNotIn('OPENAI_API_KEY',kwargs['env']);self.assertNotIn('GEMINI_API_KEY',kwargs['env'])
                Path(args[args.index('-o')+1]).write_text('{"script":"본문","body":"#광고"}',encoding='utf-8')
                return Mock(returncode=0,stdout=b'',stderr=b'')
            with patch.dict(os.environ,{'OPENAI_API_KEY':'private'}),patch('studio_ai.cli_command',return_value=['codex']),patch('studio_ai.cli_status',return_value={'auth_mode':'chatgpt'}),patch('studio_ai.subprocess.run',side_effect=run):
                data=generate_other('codex_cli','ignored','gpt-6.1-sol',[{'text':'한글 대본'},{'inlineData':{'mimeType':'image/jpeg','data':'eA=='}}],{},Path(tmp)/'audit.json')
            self.assertEqual(data['script'],'본문')

    def test_cli_usage_errors_are_classified_for_one_fallback(self):
        with tempfile.TemporaryDirectory() as tmp,patch('studio_ai.cli_command',return_value=['codex']),patch('studio_ai.cli_status',return_value={'auth_mode':'chatgpt'}),patch('studio_ai.subprocess.run',return_value=Mock(returncode=1,stdout=b'',stderr=b'RESOURCE_EXHAUSTED: quota limit')):
            with self.assertRaises(QuotaError):generate_other('codex_cli',None,'gpt-6.1-sol',[],{},Path(tmp)/'audit.json')
        wrapper=Mock(returncode=0,stdout=b'{"status":"ERROR","error":"resource_exhausted"}',stderr=b'')
        with tempfile.TemporaryDirectory() as tmp,patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=wrapper):
            with self.assertRaises(QuotaError):generate_other('antigravity_cli',None,'claude-test',[],{},Path(tmp)/'audit.json')

    def test_subscription_cli_rejects_api_auth(self):
        with tempfile.TemporaryDirectory() as tmp,patch('studio_ai.cli_command',return_value=['codex']),patch('studio_ai.cli_status',return_value={'auth_mode':'api_key'}),patch('studio_ai.requests.post') as post:
            with self.assertRaises(AIError):generate_other('codex_cli',None,'gpt-6.1-sol',[],{},Path(tmp)/'audit.json')
            post.assert_not_called()

    def test_gemini_cli_json_wrapper_and_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            response=Mock(returncode=0,stdout=b'{"status":"SUCCESS","response":"{\\"script\\":\\"ok\\",\\"body\\":\\"ad\\"}"}')
            with patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=response) as run:
                data=generate_other('gemini_cli',None,'auto',[{'text':'draft'}],{},Path(tmp)/'audit.json')
                self.assertEqual(data['script'],'ok');self.assertIn('plan',run.call_args.args[0])
            with patch('studio_ai.cli_command',return_value=None):
                with self.assertRaises(AIError):generate_other('gemini_cli',None,'auto',[],{},Path(tmp)/'audit.json')
                self.assertFalse(cli_status('gemini_cli')['installed'])

    def test_antigravity_model_discovery_and_status(self):
        response=Mock(returncode=0,stdout=b'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\n',stderr=b'')
        with patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=response):
            models=antigravity_models()
            self.assertEqual(models[0]['model_id'],'gemini-3.8-flash-medium')
            self.assertTrue(cli_status('antigravity_cli')['authenticated'])
        with patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=Mock(returncode=1,stdout=b'',stderr=b'not logged in')):
            self.assertFalse(cli_status('antigravity_cli')['authenticated'])

    def test_antigravity_print_flags_and_incomplete_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            response=Mock(returncode=0,stdout=b'{"status":"SUCCESS","structured_output":{"summary":"frame"}}',stderr=b'')
            with patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=response) as run:
                result=generate_other('antigravity_cli',None,'gemini-3.8-flash-medium',[{'text':'analysis'},{'inlineData':{'mimeType':'image/jpeg','data':'eA=='}}],{},Path(tmp)/'audit.json')
                args=run.call_args.args[0]
                self.assertIn('--mode',args);self.assertIn('plan',args)
                self.assertIn('--disable-slash-commands',args);self.assertNotIn('--dangerously-skip-permissions',args)
                self.assertIn('@frame-0.jpg',args[args.index('-p')+1]);self.assertIn('음성 미분석',result['audio_summary'])
            response.stdout=b'{"status":"ERROR","response":"{\"summary\":\"partial\"}"}'
            with patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=response):
                with self.assertRaises(AIError):generate_other('antigravity_cli',None,'auto',[],{},Path(tmp)/'audit.json')

    def test_antigravity_success_envelope_with_fenced_inner_json(self):
        for response_text in ['```json\n{"summary":"정상 분석"}\n```', '결과입니다:\n```json\n{"summary":"정상 분석"}\n```']:
            with tempfile.TemporaryDirectory() as tmp:
                response=Mock(returncode=0,stdout=json.dumps({'status':'SUCCESS','response':response_text},ensure_ascii=False).encode(),stderr=b'')
                with patch('studio_ai.cli_command',return_value=['agy']),patch('studio_ai.subprocess.run',return_value=response):
                    result=generate_other('antigravity_cli',None,'claude-sonnet-4-6',[],{},Path(tmp)/'audit.json')
                self.assertEqual(result['summary'],'정상 분석')

    def test_no_partial_or_quota_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            response=Mock(ok=False,status_code=429)
            with patch('studio_ai.requests.post',return_value=response) as post:
                with self.assertRaises(AIError):generate_other('openai_api','key','gpt-4.1',[],{},Path(tmp)/'audit.json')
                self.assertEqual(post.call_count,1)
            with self.assertRaises(AIError):generate_other('openai_api','key','bad;model',[],{},Path(tmp)/'audit.json')
