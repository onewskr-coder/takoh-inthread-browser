import tempfile
import unittest
from unittest.mock import patch,Mock
from studio_gemini_discovery import grounded_search,extract_video_ids,GeminiDiscoveryError,parse_antigravity_events,resolve_grounding_redirects,antigravity_transcript_sources

class GeminiDiscoveryTests(unittest.TestCase):
    def test_urls_are_validated_deduplicated_and_not_channel_links(self):
        self.assertEqual(extract_video_ids('https://youtube.com/shorts/abcdefghijk https://m.youtube.com/shorts/abcdefghijk https://youtu.be/abcdefghijk https://youtube.com/@channel https://youtube.com/watch?v=bad'),['abcdefghijk'])
    def test_antigravity_nested_search_steps_are_deduplicated(self):
        events=[{'event':'step_update','step_update':{'step_index':2,'state':'ACTIVE','tool_name':'search_web'}},{'event':'step_update','step_update':{'step_index':2,'state':'DONE','tool_name':'search_web'}},{'event':'result','result':{'status':'ERROR','response':'No usable video URLs','error':'interrupted'}}]
        text,sources,count,final=parse_antigravity_events(events)
        self.assertEqual(count,1)
        self.assertEqual(final['status'],'ERROR')
        self.assertEqual(sources,[])

    @patch('studio_gemini_discovery.requests.post')
    def test_api_requires_web_search_and_preserves_evidence(self,post):
        post.return_value=Mock(ok=True,json=Mock(return_value={'steps':[{'type':'google_search_call','arguments':{'queries':['shopping shorts']}},{'type':'model_output','content':[{'type':'text','text':'https://youtube.com/shorts/abcdefghijk','annotations':[{'type':'url_citation','url':'https://youtube.com/shorts/abcdefghijk','title':'Product demo'}]}]}]}))
        with tempfile.TemporaryDirectory() as root:
            result=grounded_search('gemini_search','test-key','gemini-3.8-flash','prompt',root)
            self.assertEqual(result['ids'],['abcdefghijk'])
            self.assertEqual(result['search_queries_observed'],1)
            self.assertEqual(post.call_count,1)
            self.assertEqual(post.call_args.kwargs['json']['tools'],[{'type':'google_search'}])
    @patch('studio_gemini_discovery.requests.post')
    def test_ungrounded_model_url_is_rejected(self,post):
        post.return_value=Mock(ok=True,json=Mock(return_value={'outputs':[{'type':'text','text':'https://youtu.be/abcdefghijk'}]}))
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(GeminiDiscoveryError):grounded_search('gemini_search','test-key','gemini-3.8-flash','prompt',root)
    @patch('studio_gemini_discovery.requests.post')
    def test_provider_error_is_not_retried(self,post):
        post.return_value=Mock(ok=False,status_code=429)
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(GeminiDiscoveryError):grounded_search('gemini_search','test-key','gemini-3.8-flash','prompt',root)
        self.assertEqual(post.call_count,1)

    def test_antigravity_stream_deltas_accumulated_and_sources_deduplicated(self):
        events=[
            {'event':'step_update','step_update':{'step_index':2,'state':'DONE','tool_name':'search_web','tool_info':{'result':{'items':[{'link':'https://youtube.com/shorts/vid11111111'}]}}}},
            {'event':'step_update','step_update':{'step_index':3,'step_type':'agent_response','text_delta':'추천 영상 1: '}},
            {'event':'step_update','step_update':{'step_index':3,'step_type':'agent_response','text_delta':'https://youtube.com/shorts/vid22222222'}},
            {'event':'result','result':{'status':'SUCCESS','response':'','sources':[{'url':'https://youtube.com/shorts/vid11111111','title':'Source 1'},{'url':'https://youtube.com/shorts/vid33333333','title':'Source 2'}]}}
        ]
        text,sources,count,final=parse_antigravity_events(events)
        self.assertEqual(count,1)
        self.assertEqual(final['status'],'SUCCESS')
        self.assertIn('https://youtube.com/shorts/vid22222222',text)
        # Verify deduplication
        urls=[s['url'] for s in sources]
        self.assertEqual(len(urls),len(set(urls)))
        self.assertIn('https://youtube.com/shorts/vid11111111',urls)
        self.assertIn('https://youtube.com/shorts/vid33333333',urls)

    @patch('studio_gemini_discovery.subprocess.run')
    @patch('studio_gemini_discovery.official_cli',return_value=['mock_agy.exe'])
    def test_antigravity_success_with_mock_events_in_grounded_search(self,mock_cli,mock_run):
        import json
        events=[
            {'event':'step_update','step_update':{'step_index':2,'state':'DONE','tool_name':'search_web','tool_info':{'result':{'url':'https://youtube.com/shorts/mockvid1234'}}}},
            {'event':'step_update','step_update':{'step_index':3,'step_type':'agent_response','text_delta':'발견된 영상: https://youtube.com/shorts/mockvid1234'}},
            {'event':'result','result':{'status':'SUCCESS','response':'발견된 영상: https://youtube.com/shorts/mockvid1234','sources':[{'url':'https://youtube.com/shorts/mockvid1234','title':'쇼핑쇼츠'}]}}
        ]
        stdout_bytes='\n'.join(json.dumps(e) for e in events).encode('utf-8')
        mock_run.return_value=Mock(returncode=0,stdout=stdout_bytes,stderr=b'')
        with tempfile.TemporaryDirectory() as root:
            res=grounded_search('antigravity_search','','gemini-3.8-flash-low','find shopping shorts',root)
            self.assertEqual(res['ids'],['mockvid1234'])
            self.assertEqual(res['search_queries_observed'],1)
            self.assertEqual(len(res['sources']),1)
            # Verify latest-response.json was preserved locally
            audit_file=tempfile.Path(root)/'latest-response.json' if hasattr(tempfile,'Path') else None
            from pathlib import Path
            self.assertTrue((Path(root)/'latest-response.json').is_file())

    @patch('studio_gemini_discovery.subprocess.run')
    @patch('studio_gemini_discovery.official_cli',return_value=['mock_agy.exe'])
    def test_antigravity_stream_interrupted_raises_clear_error(self,mock_cli,mock_run):
        import json
        events=[
            {'event':'step_update','step_update':{'step_index':2,'state':'DONE','tool_name':'search_web'}},
            {'event':'result','result':{'status':'ERROR','error':'The stream was interrupted.','response':''}}
        ]
        mock_run.return_value=Mock(returncode=0,stdout='\n'.join(json.dumps(e) for e in events).encode('utf-8'),stderr=b'')
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(GeminiDiscoveryError) as ctx:
                grounded_search('antigravity_search','','gemini-3.8-flash-low','prompt',root)
            self.assertIn('CLI 응답이 완료되지 않았습니다',str(ctx.exception))

    @patch('studio_gemini_discovery.requests.head')
    def test_antigravity_transcript_sources_and_redirect_resolution(self,mock_head):
        import json
        from pathlib import Path
        mock_head.return_value=Mock(status_code=302,headers={'Location':'https://m.youtube.com/shorts/zT6hH9JACPY'})
        with tempfile.TemporaryDirectory() as brain:
            conv_id='0fdbe528-2ad5-4bd0-a602-1e858f03e3dc'
            logs=Path(brain)/conv_id/'.system_generated'/'logs'
            logs.mkdir(parents=True,exist_ok=True)
            redir='https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ_test_token'
            (logs/'transcript_full.jsonl').write_text(
                json.dumps({'step_index':2,'type':'GENERIC','content':f'Sources:\n[1] [youtube.com]({redir})'})+'\n',
                encoding='utf-8'
            )
            events=[
                {'event':'init','conversation_id':conv_id},
                {'event':'step_update','step_update':{'conversation_id':conv_id,'step_index':2,'state':'DONE','tool_name':'search_web'}},
                {'event':'result','result':{'conversation_id':conv_id,'status':'SUCCESS','response':'리다이렉트 주소만 제공됨'}}
            ]
            text,sources,count,final=parse_antigravity_events(events,brain_root=brain,resolve_redirects=True)
            self.assertEqual(count,1)
            self.assertEqual(len(sources),1)
            self.assertEqual(sources[0]['url'],'https://m.youtube.com/shorts/zT6hH9JACPY')
            self.assertEqual(sources[0]['redirect_url'],redir)
            ids=extract_video_ids(text+'\n'+'\n'.join(s['url'] for s in sources))
            self.assertEqual(ids,['zT6hH9JACPY'])

if __name__=='__main__':unittest.main()

