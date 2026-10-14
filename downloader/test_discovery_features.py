"""
Unit tests for discovery provider selection, pagination, SerpAPI integration,
and cache resilience against race conditions.
"""
import os
import json
import re
import tempfile
import time
import unittest
from unittest.mock import patch, Mock
from flask import Flask

import studio
from studio_secrets import save as save_secrets


class DiscoveryFeatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        with patch.dict(os.environ, {'STUDIO_DATA_DIR': self.data.name, 'STUDIO_DOWNLOAD_ROOT': self.tmp.name}):
            self.app = Flask(__name__)
            studio.register_studio(self.app, lambda: None, lambda _: None)
        self.client = self.app.test_client()
        page = self.client.get('/studio/').get_data(as_text=True)
        self.token = re.search(r'name="studio-token" content="([^"]+)"', page)[1]
        self.headers = {'X-Studio-Token': self.token}

        # Save test secrets for both youtube and serpapi
        from pathlib import Path
        root = Path(self.data.name)
        save_secrets(root, {
            'youtube_api_key': 'AIzaTestFakeKeyForDiscovery123',
            'serp_key': 'serp_fake_test_key_for_unit_tests'
        })

    def tearDown(self):
        self.data.cleanup()

    def test_reference_library_delete_isolated_and_auto_sync_does_not_restore(self):
        ref={'permalink':'https://www.youtube.com/watch?v=abcdefghijk','text':'제품 참고','imageUrls':[],'videoUrls':[]}
        self.assertEqual(self.client.post('/studio/references/import',headers=self.headers,json={'reference':ref}).status_code,200)
        rid=self.client.get('/studio/references').json[0]['reference_id']
        self.assertEqual(self.client.post('/studio/references/save',headers=self.headers,json={'reference_id':rid}).status_code,200)
        self.assertEqual(len(self.client.get('/studio/saved-references').json),1)
        self.assertEqual(self.client.post('/studio/references/delete',headers=self.headers,json={'ids':[rid],'all':True}).status_code,400)
        self.assertEqual(self.client.post('/studio/references/delete',json={'ids':[rid]}).status_code,403)
        r=self.client.post('/studio/references/delete',headers=self.headers,json={'ids':[rid]})
        self.assertEqual(r.json['deleted'],1)
        self.assertEqual(self.client.get('/studio/references').json,[])
        self.assertEqual(len(self.client.get('/studio/saved-references').json),1)
        r=self.client.post('/studio/references/import',headers=self.headers,json={'reference':ref,'automatic':True})
        self.assertTrue(r.json['skipped_deleted'])
        self.assertEqual(self.client.get('/studio/references').json,[])
        self.client.post('/studio/references/import',headers=self.headers,json={'reference':ref})
        self.assertEqual(len(self.client.get('/studio/references').json),1)
        self.assertEqual(self.client.post('/studio/references/delete',headers=self.headers,json={'ids':['../credentials']}).status_code,400)
        self.client.post('/studio/references/delete',headers=self.headers,json={'collection':'saved','ids':[rid],'all':True,'confirm_all':True})
        self.assertEqual(self.client.get('/studio/saved-references').json,[])
        self.assertEqual(len(self.client.get('/studio/references').json),1)

    @patch('requests.get')
    def test_catalogue_persists_deduplicates_and_hides_seen_without_api(self, mock_get):
        from studio_catalogue import DiscoveryCatalogue
        catalogue = DiscoveryCatalogue(self.data.name)
        item={'id':'archive1234','snippet':{'title':'주방 수납 도구 사용법 리뷰','channelId':'UCregistered','channelTitle':'제품 채널','publishedAt':'2026-10-13T00:00:00Z','thumbnails':{}},'contentDetails':{'duration':'PT30S'},'statistics':{'viewCount':'20000'},'status':{'license':'youtube'}}
        self.assertEqual(catalogue.add([(item,'주방','한국어')]),1)
        self.assertEqual(catalogue.add([(item,'주방','한국어')]),0)
        url='/studio/discovery?archive=1&unseen=1&provider=serpapi&country=ALL&mode=shopping&category=living_kitchen&published_range=all'
        self.assertEqual(self.client.get(url).json['count'],1)
        exhausted=self.client.get(url).json
        self.assertEqual(exhausted['count'],0)
        self.assertEqual(exhausted['empty_reason'],'already_seen')
        self.assertEqual(exhausted['matching_including_seen'],1)
        self.assertEqual(self.client.get(url.replace('unseen=1','unseen=0')).json['count'],1)
        stats=self.client.get('/studio/discovery/catalogue').json
        self.assertEqual((stats['videos'],stats['channels']),(1,1))
        self.assertEqual(DiscoveryCatalogue(self.data.name).stats()['videos'],1)
        mock_get.assert_not_called()

    @patch('requests.get')
    def test_registered_channel_updates_use_youtube_not_serpapi(self, mock_get):
        from studio_catalogue import DiscoveryCatalogue
        catalogue=DiscoveryCatalogue(self.data.name)
        catalogue.add([({'id':'old','snippet':{'channelId':'UCtest','channelTitle':'test'}},'','')])
        responses=[{'items':[{'id':'UCtest','contentDetails':{'relatedPlaylists':{'uploads':'UUtest'}}}]},{'items':[{'contentDetails':{'videoId':'newvideo'}}]},{'items':[{'id':'newvideo','snippet':{'channelId':'UCtest','channelTitle':'test'}}]}]
        mock_get.side_effect=[Mock(ok=True,json=Mock(return_value=data)) for data in responses]
        result=self.client.post('/studio/discovery/channels/refresh',headers=self.headers,json={})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['added'],1)
        self.assertEqual(result.json['serpapi_requests'],0)
        self.assertEqual(mock_get.call_count,3)
        for call in mock_get.call_args_list:
            self.assertTrue(call.args[0].startswith('https://www.googleapis.com/youtube/v3/'))
            self.assertNotIn('/search',call.args[0])

    @patch('requests.get')
    def test_channel_shortforms_rank_persist_and_deduplicate(self,mock_get):
        from studio_catalogue import DiscoveryCatalogue
        catalogue=DiscoveryCatalogue(self.data.name)
        catalogue.add([({'id':'seed','snippet':{'channelId':'UCtest'}},'','')])
        def video(vid,duration,views):
            return {'id':vid,'snippet':{'channelId':'UCtest','title':'제품 시연'},'contentDetails':{'duration':duration},'statistics':{'viewCount':str(views)}}
        responses=[{'items':[{'id':'UCtest','contentDetails':{'relatedPlaylists':{'uploads':'UUtest'}}}]},
            {'items':[{'contentDetails':{'videoId':v}} for v in ['low','high','long','missing']]},
            {'items':[video('low','PT30S',10),video('high','PT3M',900),video('long','PT4M',9999),video('missing','',999)]}]
        mock_get.side_effect=[Mock(ok=True,json=Mock(return_value=d)) for d in responses]
        r=self.client.post('/studio/discovery/channels/shorts/refresh',headers=self.headers,json={})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json['ranked_video_ids'],['high','low'])
        self.assertEqual(r.json['added'],2)
        self.assertEqual(r.json['youtube_requests'],3)
        self.assertEqual(r.json['serpapi_requests'],0)
        self.assertEqual({i['id'] for i,q,l in catalogue.rows()},{'seed','high','low'})
        mock_get.side_effect=[Mock(ok=True,json=Mock(return_value=d)) for d in responses[1:]]
        r=self.client.post('/studio/discovery/channels/shorts/refresh',headers=self.headers,json={})
        self.assertEqual(r.json['added'],0)
        self.assertEqual(r.json['youtube_requests'],2)
        for call in mock_get.call_args_list:
            self.assertNotIn('/search',call.args[0])

    @patch('requests.get')
    def test_subscriber_refresh_persists_and_displays_multiple(self,mock_get):
        from studio_catalogue import DiscoveryCatalogue
        catalogue=DiscoveryCatalogue(self.data.name)
        catalogue.add([({'id':'ratioexample','snippet':{'title':'주방 수납 도구 사용법 리뷰','channelId':'UCratio','channelTitle':'test','publishedAt':'2026-10-13T00:00:00Z','thumbnails':{}},'statistics':{'viewCount':'200000'},'contentDetails':{'duration':'PT30S'},'status':{'license':'youtube'}},'','')])
        mock_get.return_value=Mock(ok=True,json=Mock(return_value={'items':[{'id':'UCratio','statistics':{'subscriberCount':'10000','hiddenSubscriberCount':False}}]}))
        response=self.client.post('/studio/discovery/subscribers/refresh',headers=self.headers,json={})
        self.assertEqual(response.json['youtube_requests'],1)
        self.assertEqual(mock_get.call_args.kwargs['params']['part'],'statistics')
        result=self.client.get('/studio/discovery?archive=1&country=ALL&mode=shopping&category=living_kitchen&published_range=all&sort_by=subscriber_multiple').json
        self.assertEqual(result['items'][0]['subscriber_multiple'],20)
        self.assertIsNone(result['items'][0]['growth_rate'])
        self.assertEqual(DiscoveryCatalogue(self.data.name).channel_statistics()['UCratio']['subscribers'],10000)
        self.assertEqual(mock_get.call_count,1)

    @patch('requests.get')
    def test_shopping_shorts_search_requests_short_videos_and_filters_untagged(self,mock_get):
        search=Mock(ok=True,json=Mock(return_value={'items':[{'id':{'videoId':'tagged'}},{'id':{'videoId':'plain'}}]}))
        def video(vid,title):
            return {'id':vid,'snippet':{'title':title,'description':'주방 도구 사용법','channelTitle':'test','publishedAt':'2026-10-13T00:00:00Z','thumbnails':{}},'contentDetails':{'duration':'PT30S'},'statistics':{'viewCount':'200000'},'status':{'license':'youtube'}}
        detail=Mock(ok=True,json=Mock(return_value={'items':[video('tagged','주방 도구 시연 #shorts'),video('plain','주방 도구 시연')]}))
        mock_get.side_effect=[search,detail]
        result=self.client.get('/studio/discovery?provider=youtube&country=KR&mode=shopping&category=all&published_range=all&sort_by=views&type=shopping_shorts&refresh=1',headers=self.headers)
        self.assertEqual(result.status_code,200)
        params=mock_get.call_args_list[0].kwargs['params']
        self.assertEqual(params['order'],'viewCount')
        self.assertEqual(params['videoDuration'],'short')
        self.assertIn('#shorts',params['q'])
        self.assertEqual(result.json['count'],1)
        self.assertEqual(result.json['items'][0]['video_id'],'tagged')

    @patch('studio.grounded_search')
    @patch('requests.get')
    def test_gemini_cli_candidates_are_verified_saved_and_reused(self,mock_get,search):
        search.return_value={'ids':['abcdefghijk'],'sources':[{'url':'https://youtube.com/shorts/abcdefghijk','title':'demo'}],'text':'https://youtube.com/shorts/abcdefghijk','search_queries_observed':1,'usage':{}}
        mock_get.return_value=Mock(ok=True,json=Mock(return_value={'items':[{'id':'abcdefghijk','snippet':{'title':'주방 도구 시연 #shorts','channelId':'UCtest','channelTitle':'test','publishedAt':'2026-10-13T00:00:00Z','thumbnails':{}},'contentDetails':{'duration':'PT30S'},'statistics':{'viewCount':'123456'},'status':{'license':'youtube'}}]}))
        with patch('studio.official_cli',return_value=['node','gemini.js']):
            result=self.client.get('/studio/discovery?provider=antigravity_search&country=ALL&category=all&mode=shopping&type=shopping_shorts&published_range=all&refresh=1',headers=self.headers)
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json['count'],1)
            self.assertEqual(result.json['gemini_session_requests'],1)
            self.assertEqual(mock_get.call_count,1)
            archive=self.client.get('/studio/discovery?provider=antigravity_search&archive=1&country=ALL&category=all&mode=shopping&type=shopping_shorts&published_range=all').json
            self.assertEqual(archive['count'],1)
            self.assertEqual(archive['gemini_session_requests'],0)
            self.assertEqual(search.call_count,1)
    @patch('requests.get')
    @patch('studio.grounded_search')
    def test_unconfigured_gemini_does_not_fall_back(self,search,get):
        result=self.client.get('/studio/discovery?provider=gemini_search&refresh=1',headers=self.headers)
        self.assertFalse(result.json['configured'])
        search.assert_not_called();get.assert_not_called()

    def test_cache_miss_returns_unconfigured_or_no_cache_without_external_call(self):
        """When not explicit refresh and no cache exists, return '저장된 캐시 없음' without calling requests."""
        with patch('requests.get') as mock_get:
            res = self.client.get('/studio/discovery?country=ALL&category=living_kitchen&published_range=90d&min_views=10000', headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.json
            self.assertTrue(data['configured'])
            self.assertEqual(data['verification_status'], '저장된 캐시 없음')
            self.assertEqual(len(data['items']), 0)
            # Ensure no external HTTP calls were made!
            mock_get.assert_not_called()

    @patch('requests.get')
    def test_explicit_refresh_with_pagination_and_min_views_10000(self, mock_get):
        """
        With explicit refresh, search API is called, nextPageToken is processed,
        duplicates are skipped, min_views 10000 filters items, and stop reason is recorded.
        """
        # Mock search response with 2 items and a nextPageToken
        search_resp1 = Mock(ok=True, status_code=200)
        search_resp1.json.return_value = {
            'nextPageToken': 'token_page_2',
            'items': [
                {'id': {'videoId': 'vid_high_views'}},
                {'id': {'videoId': 'vid_low_views'}}
            ]
        }
        search_resp2 = Mock(ok=True, status_code=200)
        search_resp2.json.return_value = {
            'nextPageToken': None, # end of pages
            'items': [
                {'id': {'videoId': 'vid_high_views'}}, # duplicate!
                {'id': {'videoId': 'vid_high_views_2'}}
            ]
        }

        # Mock videos details
        detail_resp1 = Mock(ok=True, status_code=200)
        detail_resp1.json.return_value = {
            'items': [
                {
                    'id': 'vid_high_views',
                    'snippet': {'title': '신박한 주방 자동 쓰레기통 시연 리뷰', 'channelTitle': '주방리뷰', 'publishedAt': '2026-09-01T00:00:00Z', 'thumbnails': {}},
                    'contentDetails': {'duration': 'PT2M30S'},
                    'statistics': {'viewCount': '25000'},
                    'status': {'license': 'youtube'}
                },
                {
                    'id': 'vid_low_views',
                    'snippet': {'title': '소형 틈새 수납선반 조립법', 'channelTitle': '정리왕', 'publishedAt': '2026-09-10T00:00:00Z', 'thumbnails': {}},
                    'contentDetails': {'duration': 'PT1M10S'},
                    'statistics': {'viewCount': '500'}, # below 10,000!
                    'status': {'license': 'youtube'}
                }
            ]
        }

        detail_resp2 = Mock(ok=True, status_code=200)
        detail_resp2.json.return_value = {
            'items': [
                {
                    'id': 'vid_high_views_2',
                    'snippet': {'title': '만능 조리도구 세트 실사용 비교 리뷰', 'channelTitle': '키친가젯', 'publishedAt': '2026-09-15T00:00:00Z', 'thumbnails': {}},
                    'contentDetails': {'duration': 'PT3M00S'},
                    'statistics': {'viewCount': '12000'},
                    'status': {'license': 'creativeCommon'}
                }
            ]
        }

        mock_get.side_effect = [
            # Call 1 search KR, Call 2 details, Call 3 search p2 KR, Call 4 details p2,
            # Then US target search, etc.
            search_resp1, detail_resp1, search_resp2, detail_resp2,
            search_resp1, detail_resp1, search_resp2, detail_resp2,
            search_resp1, detail_resp1, search_resp2, detail_resp2
        ]

        res = self.client.get('/studio/discovery?provider=youtube&country=KR&mode=shopping&category=living_kitchen&published_range=90d&min_views=10000&refresh=1', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertTrue(data['configured'])
        self.assertEqual(data['verification_status'], '실서비스 연결됨')
        # Only vid_high_views (25000) and vid_high_views_2 (12000) should qualify
        items = data['items']
        self.assertEqual(len(items), 2)
        vids = [it['video_id'] for it in items]
        self.assertIn('vid_high_views', vids)
        self.assertIn('vid_high_views_2', vids)
        self.assertNotIn('vid_low_views', vids)

        # Telemetry verification
        telem = data['telemetry']
        self.assertGreater(telem['excluded_duplicates_count'], 0) # duplicate detected
        self.assertGreater(telem['excluded_filters_count'], 0) # low views filtered
        self.assertEqual(telem['current_displayed_count'], 2)

    @patch('requests.get')
    def test_serpapi_provider_search_and_youtube_detail_batch(self, mock_get):
        """SerpAPI provider extracts video IDs from YouTube web search and enriches with YouTube Data API."""
        serp_resp = Mock(ok=True, status_code=200, headers={'content-type': 'application/json'})
        serp_resp.json.return_value = {
            'video_results': [
                {
                    'title': 'SerpAPI로 찾은 에어프라이어 작동 시연',
                    'link': 'https://www.youtube.com/watch?v=serp_vid_001',
                    'views': '54000',
                    'published_date': '1달 전',
                    'channel': {'name': '가전리뷰TV'}
                }
            ]
        }

        yt_detail_resp = Mock(ok=True, status_code=200)
        yt_detail_resp.json.return_value = {
            'items': [
                {
                    'id': 'serp_vid_001',
                    'snippet': {'title': 'SerpAPI로 찾은 에어프라이어 작동 시연', 'channelTitle': '가전리뷰TV', 'publishedAt': '2026-09-01T00:00:00Z', 'thumbnails': {}},
                    'contentDetails': {'duration': 'PT5M00S'},
                    'statistics': {'viewCount': '54000'},
                    'status': {'license': 'youtube'}
                }
            ]
        }

        mock_get.side_effect = [serp_resp, yt_detail_resp]

        res = self.client.get('/studio/discovery?provider=serpapi&country=KR&mode=shopping&category=living_kitchen&published_range=90d&min_views=10000&refresh=1', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertEqual(data['provider'], 'serpapi')
        self.assertEqual(len(data['items']), 1)
        it = data['items'][0]
        self.assertEqual(it['video_id'], 'serp_vid_001')
        self.assertEqual(it['discovery_provider'], 'serpapi')
        self.assertEqual(it['view_count'], 54000)

    def test_raw_cache_reuse_for_different_min_views(self):
        """When raw cache exists, changing min_views from 0 to 10000 reuses raw cache without external calls."""
        from pathlib import Path
        root = Path(self.data.name)
        raw_cache_dir = root / 'youtube_raw_cache'
        raw_cache_dir.mkdir(parents=True, exist_ok=True)

        raw_item1 = {
            'id': 'vid_raw_high',
            'snippet': {'title': '주방 칼 세트 시연 리뷰', 'channelTitle': '쿡', 'publishedAt': '2026-09-01T00:00:00Z', 'thumbnails': {}},
            'contentDetails': {'duration': 'PT1M00S'},
            'statistics': {'viewCount': '50000'},
            'status': {'license': 'youtube'}
        }
        raw_item2 = {
            'id': 'vid_raw_low',
            'snippet': {'title': '주방 행주 건조대 사용법', 'channelTitle': '홈', 'publishedAt': '2026-09-01T00:00:00Z', 'thumbnails': {}},
            'contentDetails': {'duration': 'PT1M00S'},
            'statistics': {'viewCount': '300'},
            'status': {'license': 'youtube'}
        }

        FILTER_VERSION = 'v4_serp_paging_rawcache'
        raw_cache_key_str = f"{FILTER_VERSION}:youtube:KR:shopping:living_kitchen::90d:::relevance:30"
        import hashlib
        raw_cache_key = hashlib.sha256(raw_cache_key_str.encode('utf-8')).hexdigest()
        raw_cache_file = raw_cache_dir / f"{raw_cache_key}.json"

        raw_cache_file.write_text(json.dumps({
            'cached_at': time.time(),
            'provider': 'youtube',
            'stop_reason': '테스트용 원시 캐시',
            'total_raw_found': 2,
            'total_duplicate_skipped': 0,
            'items': [[raw_item1, '주방', '한국어'], [raw_item2, '주방', '한국어']]
        }, ensure_ascii=False), encoding='utf-8')

        with patch('requests.get') as mock_get:
            # Query with min_views=10000, NOT explicit refresh
            res = self.client.get('/studio/discovery?provider=youtube&country=KR&mode=shopping&category=living_kitchen&published_range=90d&min_views=10000&limit=30', headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.json
            self.assertEqual(len(data['items']), 1)
            self.assertEqual(data['items'][0]['video_id'], 'vid_raw_high')
            # Zero external calls!
            mock_get.assert_not_called()

    def test_invalid_provider_returns_400_error_without_fallback(self):
        """Invalid provider query returns 400 error and never falls back to youtube or executes."""
        with patch('requests.get') as mock_get:
            res = self.client.get('/studio/discovery?provider=unknown_service&refresh=1', headers=self.headers)
            self.assertEqual(res.status_code, 400)
            self.assertIn('지원하지 않는 검색 공급자', res.json['error'])
            mock_get.assert_not_called()

    @patch('requests.get')
    def test_serpapi_never_calls_youtube_search_api(self, mock_get):
        """When provider=serpapi, only serpapi.com and youtube videos details are called; youtube search is NEVER called."""
        serp_resp = Mock(ok=True, status_code=200, headers={'content-type': 'application/json'})
        serp_resp.json.return_value = {
            'video_results': [
                {
                    'title': '세척솔 시연',
                    'link': 'https://www.youtube.com/watch?v=clean123456',
                    'views': '12000'
                }
            ]
        }
        yt_detail_resp = Mock(ok=True, status_code=200)
        yt_detail_resp.json.return_value = {
            'items': [
                {
                    'id': 'clean123456',
                    'snippet': {'title': '세척솔 시연', 'channelTitle': '솔채널', 'publishedAt': '2026-09-01T00:00:00Z', 'thumbnails': {}},
                    'contentDetails': {'duration': 'PT1M00S'},
                    'statistics': {'viewCount': '12000'},
                    'status': {'license': 'youtube'}
                }
            ]
        }
        mock_get.side_effect = [serp_resp, yt_detail_resp]

        res = self.client.get('/studio/discovery?provider=serpapi&country=KR&mode=shopping&category=living_kitchen&refresh=1', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertEqual(data['provider'], 'serpapi')

        # Inspect all URLs called
        called_urls = [call.args[0] if call.args else call.kwargs.get('url', '') for call in mock_get.call_args_list]
        self.assertIn('https://serpapi.com/search.json', called_urls)
        # CRITICAL ASSERTION: YouTube search.list MUST NOT be called!
        for url in called_urls:
            self.assertNotIn('/youtube/v3/search', url, f"YouTube search API must not be called when provider is serpapi! (Called: {url})")

    @patch('requests.get')
    def test_serpapi_collects_second_page_shorts_with_bounded_calls(self, mock_get):
        first = Mock(ok=True, status_code=200)
        first.json.return_value = {'video_results': [], 'serpapi_pagination': {'next_page_token': 'page-two'}}
        second = Mock(ok=True, status_code=200)
        second.json.return_value = {'shorts_results': [{'shorts': [{'title': '주방 도구 시연', 'link': 'https://youtube.com/shorts/short123456'}]}], 'serpapi_pagination': {'next_page_token': 'page-three'}}
        detail = Mock(ok=True, status_code=200)
        detail.json.return_value = {'items': [{'id': 'short123456', 'snippet': {'title': '주방 도구 시연 리뷰', 'channelTitle': 'test', 'publishedAt': '2026-10-13T00:00:00Z', 'description': '주방 도구 사용법', 'thumbnails': {}}, 'contentDetails': {'duration': 'PT30S'}, 'statistics': {'viewCount': '20000'}, 'status': {'license': 'youtube'}}]}
        mock_get.side_effect = [first, second, detail]
        result = self.client.get('/studio/discovery?provider=serpapi&country=KR&mode=shopping&category=living_kitchen&published_range=all&refresh=1', headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(mock_get.call_count, 3)
        self.assertEqual(mock_get.call_args_list[1].kwargs['params']['sp'], 'page-two')
        self.assertEqual(result.json['count'], 1)
        self.assertEqual(result.json['items'][0]['video_id'], 'short123456')

    def test_serpapi_unconfigured_fails_without_fallback_to_youtube(self):
        """When serp_key is missing, query fails with unconfigured SerpAPI message instead of silently falling back to YouTube."""
        from pathlib import Path
        root = Path(self.data.name)
        # Overwrite secrets without serp_key
        save_secrets(root, {'youtube_api_key': 'AIzaFakeKey'})

        with patch('requests.get') as mock_get:
            res = self.client.get('/studio/discovery?provider=serpapi&refresh=1', headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.json
            self.assertFalse(data['configured'])
            self.assertEqual(data['provider'], 'serpapi')
            self.assertIn('SerpAPI 키가 등록되지 않았습니다', data['message'])
            mock_get.assert_not_called()

    def test_discovery_status_read_only_endpoint(self):
        """Read-only discovery status API returns supported providers and version without external calls."""
        with patch('requests.get') as mock_get:
            res = self.client.get('/studio/discovery/status', headers=self.headers)
            self.assertEqual(res.status_code, 200)
            data = res.json
            self.assertEqual(data['status'], 'ok')
            self.assertIn('serpapi', data['supported_providers'])
            self.assertIn('youtube', data['supported_providers'])
            self.assertEqual(data['discovery_engine_version'], 'v4_serp_paging_rawcache')
            self.assertGreaterEqual(data.get('serpapi_keys_count', 0), 1)
            mock_get.assert_not_called()

    def test_serpapi_auto_rotation_disabled_by_default(self):
        """By default, 429 stops immediately without trying second key, reporting 429 and error."""
        from pathlib import Path
        root = Path(self.data.name)
        key1 = 'a' * 64
        key2 = 'b' * 64
        save_secrets(root, {
            'youtube_api_key': 'AIzaTestFakeKeyForDiscovery123',
            'serpapi_keys': [key1, key2]
        })

        # Check status endpoint reports keys count and auto_key_rotation_default is False
        st_res = self.client.get('/studio/discovery/status', headers=self.headers)
        self.assertEqual(st_res.json.get('serpapi_keys_count'), 2)
        self.assertFalse(st_res.json.get('auto_key_rotation_default'))

        with patch('requests.get') as mock_get:
            resp_429 = Mock(ok=False, status_code=429)
            resp_429.json.return_value = {'error': 'Monthly search limit reached'}
            resp_429.headers = {'content-type': 'application/json'}
            mock_get.return_value = resp_429

            # Default call without allow_key_rotation=1
            res = self.client.get('/studio/discovery?provider=serpapi&country=KR&category=living_kitchen&published_range=90d&min_views=10000&refresh=1', headers=self.headers)
            self.assertEqual(res.status_code, 429)
            self.assertIn('SerpAPI 요청 한도 초과', res.json.get('error', ''))
            self.assertIn('자동 키 전환 비활성화됨', res.json.get('error', ''))
            # Exactly 1 call was made; no auto rotation occurred!
            self.assertEqual(len(mock_get.call_args_list), 1)
            self.assertEqual(mock_get.call_args_list[0][1]['params']['api_key'], key1)

    def test_dual_serpapi_keys_explicit_rotation_opt_in(self):
        """When allow_key_rotation=1 is explicitly passed, second key is tried upon 429 error."""
        from pathlib import Path
        root = Path(self.data.name)
        key1 = 'a' * 64
        key2 = 'b' * 64
        save_secrets(root, {
            'youtube_api_key': 'AIzaTestFakeKeyForDiscovery123',
            'serpapi_keys': [key1, key2]
        })

        with patch('requests.get') as mock_get:
            resp_429 = Mock(ok=False, status_code=429)
            resp_429.json.return_value = {'error': 'Quota exceeded'}
            resp_429.headers = {'content-type': 'application/json'}

            resp_200 = Mock(ok=True, status_code=200)
            resp_200.json.return_value = {
                'video_results': [
                    {'title': '에어프라이어 작동법', 'link': 'https://youtube.com/watch?v=vid_failover_1', 'views': '20000'}
                ]
            }

            yt_detail = Mock(ok=True, status_code=200)
            yt_detail.json.return_value = {
                'items': [
                    {
                        'id': 'vid_failover_1',
                        'snippet': {'title': '에어프라이어 작동법', 'channelTitle': '리뷰', 'publishedAt': '2026-09-01T00:00:00Z', 'thumbnails': {}},
                        'contentDetails': {'duration': 'PT2M00S'},
                        'statistics': {'viewCount': '20000'},
                        'status': {'license': 'youtube'}
                    }
                ]
            }

            mock_get.side_effect = [resp_429, resp_200, yt_detail]

            # Explicitly pass allow_key_rotation=1
            res = self.client.get('/studio/discovery?provider=serpapi&country=KR&category=living_kitchen&published_range=90d&min_views=10000&refresh=1&allow_key_rotation=1', headers=self.headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(len(res.json['items']), 1)
            # Verify mock_get was called first with key1, then with key2
            self.assertEqual(mock_get.call_args_list[0][1]['params']['api_key'], key1)
            self.assertEqual(mock_get.call_args_list[1][1]['params']['api_key'], key2)


if __name__ == '__main__':
    unittest.main()


