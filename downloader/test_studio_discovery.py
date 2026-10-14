import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import unittest
from unittest.mock import patch, Mock

from flask import Flask
import requests

import studio


class StudioDiscoveryTests(unittest.TestCase):
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

    def tearDown(self):
        self.data.cleanup()

    def test_discovery_unconfigured_never_returns_fake_items(self):
        """When YouTube API key is missing, return waiting state and empty items."""
        response = self.client.get('/studio/discovery?country=KR', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.json
        self.assertFalse(data['configured'])
        self.assertEqual(data['verification_status'], '실서비스 검증 대기 (API 키 미등록)')
        self.assertEqual(data['items'], [])
        self.assertEqual(data['count'], 0)
        self.assertIn('YouTube API 키가 등록되지 않았습니다', data['message'])

    def test_youtube_settings_get_and_post_encrypted(self):
        """YouTube settings store encrypted via DPAPI and mask key on retrieval."""
        res_get = self.client.get('/studio/youtube-settings', headers=self.headers)
        self.assertEqual(res_get.status_code, 200)
        self.assertFalse(res_get.json['configured'])

        res_post = self.client.post('/studio/youtube-settings',
                                    json={'youtube_api_key': 'AIzaSyFakeKeyForTest12345678'},
                                    headers=self.headers)
        self.assertEqual(res_post.status_code, 200)
        self.assertTrue(res_post.json['configured'])
        self.assertEqual(res_post.json['api_key_masked'], 'AIza...5678')
        self.assertEqual(res_post.json['verification_status'], '실서비스 연결됨')

        res_del = self.client.post('/studio/youtube-settings',
                                   json={'youtube_api_key': ''},
                                   headers=self.headers)
        self.assertEqual(res_del.status_code, 200)
        self.assertFalse(res_del.json['configured'])

    @patch('requests.get')
    def test_discovery_chart_vs_search_distinction_and_attribution(self, mock_get):
        """Distinguish official popular chart vs keyword search and check Shorts & CC metadata."""
        # Save a test key
        self.client.post('/studio/youtube-settings', json={'youtube_api_key': 'AIzaTestKey'}, headers=self.headers)

        # Mock YouTube Data API response for popular chart
        mock_chart_resp = Mock()
        mock_chart_resp.ok = True
        mock_chart_resp.status_code = 200
        mock_chart_resp.json.return_value = {
            'items': [
                {
                    'id': 'vid_cc_shorts',
                    'snippet': {
                        'title': '생활 꿀팁 대방출 #shorts',
                        'channelTitle': '꿀팁TV',
                        'publishedAt': '2026-10-10T12:00:00Z',
                        'description': '진짜 유용한 생활 꿀팁 모음 #shorts',
                        'thumbnails': {'high': {'url': 'https://i.ytimg.com/vi/vid_cc_shorts/hqdefault.jpg'}}
                    },
                    'contentDetails': {'duration': 'PT45S'},
                    'statistics': {'viewCount': '150000'},
                    'status': {'license': 'creativeCommon'},
                    'is_vertical': True
                },
                {
                    'id': 'vid_candidate_shorts',
                    'snippet': {
                        'title': '길이만 짧은 영상',
                        'channelTitle': '일상채널',
                        'publishedAt': '2026-10-11T12:00:00Z',
                        'description': '태그 없음',
                        'thumbnails': {'high': {'url': 'https://i.ytimg.com/vi/vid_candidate_shorts/hqdefault.jpg'}}
                    },
                    'contentDetails': {'duration': 'PT30S'},
                    'statistics': {'viewCount': '5000'},
                    'status': {'license': 'youtube'}
                },
                {
                    'id': 'vid_long_std',
                    'snippet': {
                        'title': '10분짜리 제품 심층 리뷰',
                        'channelTitle': '리뷰마스터',
                        'publishedAt': '2026-10-09T10:00:00Z',
                        'description': '풀버전 리뷰',
                        'thumbnails': {'high': {'url': 'https://i.ytimg.com/vi/vid_long_std/hqdefault.jpg'}}
                    },
                    'contentDetails': {'duration': 'PT10M15S'},
                    'statistics': {'viewCount': '85000'},
                    'status': {'license': 'youtube'}
                }
            ]
        }
        mock_get.return_value = mock_chart_resp

        # 1. Official Popular Chart Query
        res = self.client.get('/studio/discovery?country=KR&mode=popular', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        items = res.json['items']
        self.assertEqual(len(items), 3)

        # Check Item 0: Shorts confirmed with vertical aspect ratio and CC license
        it0 = items[0]
        self.assertEqual(it0['source_type'], 'chart')
        self.assertIn('[KR] 공식 인기 차트 #1', it0['source_label'])
        self.assertEqual(it0['rank'], 1)
        self.assertEqual(it0['shorts_status'], 'shorts')
        self.assertIn('세로/정사각형 화면 비율 확인', it0['shorts_grounds'][1])
        self.assertEqual(it0['license_type'], 'creative_common')
        self.assertIn('출처: 꿀팁TV', it0['attribution_draft'])
        self.assertIn('자동 보장하지 않습니다', it0['legal_notice'])
        self.assertIn('최초 관측', it0['growth_display'])

        # Check Item 1: Shorts candidate (under 3m but ratio unconfirmed)
        it1 = items[1]
        self.assertEqual(it1['shorts_status'], 'shorts_candidate')
        self.assertIn('화면 비율 미확인', it1['shorts_grounds'][1])
        self.assertEqual(it1['license_type'], 'standard')

        # Check Item 2: Long-form video (over 3 min)
        it2 = items[2]
        self.assertEqual(it2['shorts_status'], 'long')
        self.assertIn('3분 초과', it2['shorts_grounds'][0])

        # 2. Check 15-minute cache hit
        res_cached = self.client.get('/studio/discovery?country=KR&mode=popular', headers=self.headers)
        self.assertTrue(res_cached.json.get('cached'))
        self.assertGreaterEqual(res_cached.json['usage']['cache_hits'], 1)

    @patch('requests.get')
    def test_discovery_growth_rate_requires_at_least_two_observations(self, mock_get):
        """Growth rate is only calculated after two or more observations."""
        self.client.post('/studio/youtube-settings', json={'youtube_api_key': 'AIzaTestKey'}, headers=self.headers)

        vid_id = 'test_growth_vid_123'
        # 1st observation
        mock_resp1 = Mock()
        mock_resp1.ok = True
        mock_resp1.json.return_value = {
            'items': [{
                'id': vid_id,
                'snippet': {'title': '성장률 테스트', 'channelTitle': '채널', 'publishedAt': '2026-10-10T00:00:00Z', 'thumbnails': {}},
                'contentDetails': {'duration': 'PT60S'},
                'statistics': {'viewCount': '10000'},
                'status': {'license': 'youtube'}
            }]
        }
        mock_get.return_value = mock_resp1

        # Request with a unique topic so cache doesn't hit
        res1 = self.client.get('/studio/discovery?country=US&topic=tech', headers=self.headers)
        self.assertEqual(res1.status_code, 200)
        item1 = res1.json['items'][0]
        self.assertIn('최초 관측', item1['growth_display'])
        self.assertIsNone(item1['growth_rate'])

        # Simulate second observation with increased views 1 hour later
        t0 = time.time()
        with patch('time.time', return_value=t0 + 3600):
            from studio import record_video_observation
            history = record_video_observation(vid_id, 15000, self.data.name)
            self.assertEqual(len(history), 2)
            delta_sec = history[-1]['timestamp'] - history[-2]['timestamp']
            rate = round(((history[-1]['views'] - history[-2]['views']) / delta_sec) * 3600)
            self.assertEqual(rate, 5000)

    def test_reference_import_deduplication_and_discovery_metadata_preservation(self):
        """Saving video to reference library preserves discovery metadata and flags duplicates."""
        ref_payload = {
            'permalink': 'https://www.youtube.com/watch?v=unique_vid_999',
            'username': '테스트크리에이터',
            'text': '테스트 영상 본문',
            'mediaKind': 'video',
            'videoUrls': ['https://www.youtube.com/watch?v=unique_vid_999'],
            'thumbnailUrl': 'https://i.ytimg.com/vi/unique_vid_999/hqdefault.jpg',
            'discovery': {
                'video_id': 'unique_vid_999',
                'source_type': 'chart',
                'source_label': '[KR] 공식 인기 차트 #5',
                'rank': 5,
                'shorts_classification': 'Shorts (해시태그 확인)',
                'shorts_status': 'shorts',
                'shorts_grounds': ['재생시간 40초', '#shorts 태그 확인'],
                'recommendation_reason': '관측 조회수 25.0만 회 · 공식 인기 차트 #5',
                'growth_display': '최초 관측 (성장률은 2회 이상 관측 후 산출)',
                'license_label': 'CC 표시 (Creative Commons BY 재사용 허용)',
                'attribution_draft': '출처: 테스트크리에이터 - "테스트 영상" (CC BY)',
                'legal_notice': '법적 문제 없음을 시스템이 자동 보장하지 않습니다.'
            }
        }

        # First import
        res1 = self.client.post('/studio/references/import', json={'reference': ref_payload}, headers=self.headers)
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json
        self.assertFalse(data1.get('already_saved'))
        self.assertEqual(data1['discovery']['video_id'], 'unique_vid_999')
        self.assertEqual(data1['discovery']['rank'], 5)

        # Second import (duplicate)
        res2 = self.client.post('/studio/references/import', json={'reference': ref_payload}, headers=self.headers)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json
        self.assertTrue(data2.get('already_saved'))

        # Fetch references list and check discovery metadata
        res_list = self.client.get('/studio/references', headers=self.headers)
        self.assertEqual(res_list.status_code, 200)
        matched = [r for r in res_list.json if r['permalink'] == ref_payload['permalink']]
        self.assertEqual(len(matched), 1)
        self.assertEqual(matched[0]['discovery']['attribution_draft'], ref_payload['discovery']['attribution_draft'])

    def test_classify_youtube_format_cases(self):
        """Test 45s landscape, 90s/180s vertical, missing duration, and tag-only cases."""
        from studio import classify_youtube_format

        # 1. 45s landscape video -> must be classified as long-form due to landscape aspect ratio
        c_45_land = classify_youtube_format(45, published_at='2024-11-01', aspect_ratio=(16, 9))
        self.assertEqual(c_45_land['status'], 'long')
        self.assertEqual(c_45_land['classification'], '롱폼 영상 (가로 비율)')
        self.assertIn('가로 화면 비율', c_45_land['grounds'][1])

        # 2. 90s vertical video after 2024-10-15 -> Shorts confirmed
        c_90_vert = classify_youtube_format(90, published_at='2024-11-01', is_vertical=True)
        self.assertEqual(c_90_vert['status'], 'shorts')
        self.assertIn('3분 이하 세로 영상', c_90_vert['classification'])
        self.assertIn('2024-10-15 이후 게시', c_90_vert['grounds'][1])

        # 3. 180s vertical video after 2024-10-15 -> Shorts confirmed (maximum 3 minutes)
        c_180_vert = classify_youtube_format(180, published_at='2024-11-01', is_vertical=True)
        self.assertEqual(c_180_vert['status'], 'shorts')
        self.assertIn('3분 이하 세로 영상', c_180_vert['classification'])

        # 4. Over 180s (e.g. 185s) -> long-form confirmed
        c_185_vert = classify_youtube_format(185, published_at='2024-11-01', is_vertical=True)
        self.assertEqual(c_185_vert['status'], 'long')
        self.assertEqual(c_185_vert['classification'], '롱폼 영상 (3분 초과)')

        # 5. 90s vertical video uploaded BEFORE 2024-10-15 -> long-form (60s was the old limit)
        c_old_90 = classify_youtube_format(90, published_at='2024-05-01', is_vertical=True)
        self.assertEqual(c_old_90['status'], 'long')
        self.assertIn('2024-10-15 이전 업로드 영상은 60초 초과 시 롱폼', c_old_90['grounds'][1])

        # 6. Missing duration (0 or None) -> unconfirmed format
        c_missing = classify_youtube_format(0)
        self.assertEqual(c_missing['status'], 'unconfirmed')
        self.assertEqual(c_missing['classification'], '형식 미확인 (재생시간 정보 없음)')

        c_none = classify_youtube_format(None)
        self.assertEqual(c_none['status'], 'unconfirmed')

        # 7. #shorts tag only, but aspect ratio is unconfirmed -> must NOT confirm as Shorts, keep candidate
        c_tag_only = classify_youtube_format(45, published_at='2024-11-01', title='태그만 있는 영상 #shorts')
        self.assertEqual(c_tag_only['status'], 'shorts_candidate')
        self.assertIn('#shorts 태그 여부만으로 Shorts 확정 불가', c_tag_only['grounds'][2])

    @patch('requests.get')
    def test_topic_match_distinguishes_confirmed_keywords_from_unconfirmed_filter(self, mock_get):
        """Only videos with actual keyword match confirm topic; missing keywords don't claim interest match."""
        self.client.post('/studio/youtube-settings', json={'youtube_api_key': 'AIzaTestKey'}, headers=self.headers)

        mock_resp = Mock(ok=True, status_code=200)
        mock_resp.json.return_value = {
            'items': [
                {
                    'id': 'vid_confirmed_topic',
                    'snippet': {
                        'title': '최신 무선 스마트폰 기기 언박싱 및 솔직한 리뷰',
                        'channelTitle': 'IT리뷰어',
                        'publishedAt': '2026-10-10T12:00:00Z',
                        'description': '새로운 전자기기 사용기',
                        'thumbnails': {}
                    },
                    'contentDetails': {'duration': 'PT500S'},
                    'statistics': {'viewCount': '50000'},
                    'status': {'license': 'youtube'}
                },
                {
                    'id': 'vid_unconfirmed_topic',
                    'snippet': {
                        'title': '오늘 날씨가 정말 화창하네요',
                        'channelTitle': '일상기록',
                        'publishedAt': '2026-10-10T12:00:00Z',
                        'description': '산책 풍경',
                        'thumbnails': {}
                    },
                    'contentDetails': {'duration': 'PT600S'},
                    'statistics': {'viewCount': '30000'},
                    'status': {'license': 'youtube'}
                }
            ]
        }
        mock_get.return_value = mock_resp

        # Query with tech filter
        res = self.client.get('/studio/discovery?country=KR&topic=tech', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        items = res.json['items']
        self.assertEqual(len(items), 2)

        # 1st item: matched tech keywords ('스마트폰', '리뷰') -> confirmed
        it0 = items[0]
        self.assertTrue(it0['topic_match_confirmed'])
        self.assertIn('주제 키워드 확인', it0['topic_reason'])
        self.assertNotIn('관심 일치', it0['recommendation_reason'])

        # 2nd item: filtered by tech, but has no tech keywords -> NOT confirmed
        it1 = items[1]
        self.assertFalse(it1['topic_match_confirmed'])
        self.assertIn('필터 적용 (주제 키워드 직접 미확인)', it1['topic_reason'])
        self.assertNotIn('관심 일치', it1['recommendation_reason'])

    @patch('requests.get')
    def test_missing_status_license_treated_as_unconfirmed_and_permission_unimplemented(self, mock_get):
        """Missing status.license defaults to 'unconfirmed' and permission record states unimplemented."""
        self.client.post('/studio/youtube-settings', json={'youtube_api_key': 'AIzaTestKey'}, headers=self.headers)

        mock_resp = Mock(ok=True, status_code=200)
        mock_resp.json.return_value = {
            'items': [
                {
                    'id': 'vid_no_license',
                    'snippet': {
                        'title': '라이선스 필드가 아예 없는 영상',
                        'channelTitle': '채널',
                        'publishedAt': '2026-10-10T12:00:00Z',
                        'description': '설명',
                        'thumbnails': {}
                    },
                    'contentDetails': {'duration': 'PT300S'},
                    'statistics': {'viewCount': '1000'},
                    'status': {} # license key omitted
                }
            ]
        }
        mock_get.return_value = mock_resp

        res = self.client.get('/studio/discovery?country=KR&license=all', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        items = res.json['items']
        self.assertEqual(len(items), 1)

        it = items[0]
        self.assertEqual(it['license_type'], 'unconfirmed')
        self.assertEqual(it['license_label'], '라이선스 미확인')
        self.assertIn('라이선스 메타데이터가 확인되지 않은 영상입니다', it['legal_notice'])
        self.assertEqual(it['user_permission_record']['status'], 'unimplemented')
        self.assertIn('미구현', it['user_permission_record']['label'])

        # Query with license=permission should yield 0 items since it's unimplemented
        res_perm = self.client.get('/studio/discovery?country=KR&license=permission', headers=self.headers)
        self.assertEqual(len(res_perm.json['items']), 0)


if __name__ == '__main__':
    unittest.main()

