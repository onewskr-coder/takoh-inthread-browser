import tempfile
import unittest
from unittest.mock import patch,Mock
from studio_gemini_discovery import grounded_search,extract_video_ids,GeminiDiscoveryError,parse_antigravity_events

class GeminiDiscoveryTests(unittest.TestCase):
    def test_urls_are_validated_deduplicated_and_not_channel_links(self):
        self.assertEqual(extract_video_ids('https://youtube.com/shorts/abcdefghijk https://youtu.be/abcdefghijk https://youtube.com/@channel https://youtube.com/watch?v=bad'),['abcdefghijk'])
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

if __name__=='__main__':unittest.main()
