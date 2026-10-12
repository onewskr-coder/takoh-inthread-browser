import copy
import unittest
from pathlib import Path
import tempfile
from unittest.mock import Mock, patch
import requests
import studio_integrations as api


class IntegrationsTests(unittest.TestCase):
    def job(self):
        return {'sha256': 'media-hash', 'status': 'publish_ready', 'draft': {'body': '#광고\n영상 소개'},
                'comment': '#광고\n고지\nhttps://link.coupang.com/test',
                'publication': {'status': 'not_published', 'post_id': None, 'comment_id': None}}

    account = {'id': '1', 'username': 'owner'}

    def test_search_preserves_candidate_links_without_claiming_verified(self):
        with patch.object(api, 'request_json', return_value={'organic_results': [
            {'title': '후보', 'link': 'https://www.coupang.com/product', 'snippet': '설명'},
            {'title': '잘못된 링크', 'link': 'javascript:alert(1)'}]}) as call:
            results = api.search_products('상품', 'coupang', 'search-secret')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['verification'], 'discovered')
        self.assertEqual(results[0]['url'], 'https://www.coupang.com/product')
        self.assertIn('site:coupang.com', call.call_args.kwargs['params']['q'])
        self.assertNotIn('affiliate_url', results[0])

    def test_coupang_signature_and_matching_response(self):
        url = 'https://www.coupang.com/vp/products/123'
        with patch.object(api, 'request_json', return_value={'rCode': '0', 'data': [
            {'originalUrl': url, 'shortenUrl': 'https://link.coupang.com/test'}]}) as call:
            self.assertEqual(api.coupang_deeplink(url, 'access', 'secret'), 'https://link.coupang.com/test')
        self.assertEqual(call.call_args.kwargs['json'], {'coupangUrls': [url]})
        self.assertIn('CEA algorithm=HmacSHA256', call.call_args.kwargs['headers']['Authorization'])
        with patch.object(api, 'request_json', return_value={'rCode': '0', 'data': [
            {'originalUrl': url + '4', 'shortenUrl': 'https://link.coupang.com/test'}]}):
            with self.assertRaises(api.IntegrationError):
                api.coupang_deeplink(url, 'access', 'secret')
        with self.assertRaises(api.IntegrationError):
            api.coupang_deeplink('https://coupang.com.evil.test/product', 'access', 'secret')

    def fake_threads(self, job, calls, fail_comment=False, wrong_parent=False):
        def request(token, method, path, fields=None):
            calls.append((method, path, fields))
            if method == 'POST' and path == '1/threads':
                return {'id': '20' if fields['media_type'] in ('VIDEO', 'IMAGE') else '40'}
            if method == 'GET' and path in ('20', '40'):
                return {'status': 'FINISHED'}
            if method == 'POST' and path == '1/threads_publish':
                if fields['creation_id'] == '40' and fail_comment:
                    raise api.IntegrationError('댓글 권한 실패', uncertain=False)
                return {'id': '30' if fields['creation_id'] == '20' else '50'}
            if method == 'GET' and path == '30':
                return {'id': '30', 'text': job['draft']['body'], 'permalink': 'https://www.threads.com/@owner/post/test'}
            if method == 'GET' and path == '50':
                return {'id': '50', 'text': job['comment'], 'is_reply': True, 'replied_to': {'id': '999' if wrong_parent else '30'}}
            raise AssertionError((method, path, fields))
        return request

    def test_image_publication_uses_image_container_and_verifies_reply(self):
        job, calls = self.job(), []
        job['kind'] = 'image'
        with patch.object(api, 'threads_api', side_effect=self.fake_threads(job, calls)):
            api.advance_publication(job, 'token', self.account, 'https://cdn.example.com/photo.jpg', lambda j: None)
        fields = calls[0][2]
        self.assertEqual(fields['media_type'], 'IMAGE')
        self.assertEqual(fields['image_url'], 'https://cdn.example.com/photo.jpg')
        self.assertNotIn('video_url', fields)
        self.assertEqual(job['status'], 'published')
        self.assertTrue(job['publication']['comment_verified'])

    def test_reply_failure_retry_never_reposts_body(self):
        job, calls, snapshots = self.job(), [], []
        save = lambda j: snapshots.append(copy.deepcopy(j))
        with patch.object(api, 'threads_api', side_effect=self.fake_threads(job, calls, fail_comment=True)):
            with self.assertRaises(api.IntegrationError):
                api.advance_publication(job, 'token', self.account, 'https://cdn.example.com/video.mp4', save)
        self.assertEqual(job['publication']['status'], 'partial_success')
        self.assertEqual(job['publication']['post_id'], '30')
        self.assertIsNone(job['publication']['comment_id'])
        with patch.object(api, 'threads_api', side_effect=self.fake_threads(job, calls)):
            api.advance_publication(job, 'token', self.account, '', save)
        self.assertEqual(job['status'], 'published')
        body_publish = [c for c in calls if c[0] == 'POST' and c[1].endswith('threads_publish') and c[2]['creation_id'] == '20']
        self.assertEqual(len(body_publish), 1)
        self.assertTrue(any(j['publication'].get('post_pending') for j in snapshots))

    def test_processing_status_never_publishes_early(self):
        job, calls = self.job(), []
        def pending(token, method, path, fields=None):
            calls.append((method, path))
            return {'id': '20'} if method == 'POST' else {'status': 'IN_PROGRESS'}
        with patch.object(api, 'threads_api', side_effect=pending):
            api.advance_publication(job, 'token', self.account, 'https://cdn.example.com/video.mp4', lambda j: None)
            api.advance_publication(job, 'token', self.account, '', lambda j: None)
        self.assertEqual(job['publication']['status'], 'media_processing')
        self.assertEqual(len([c for c in calls if c[0] == 'POST']), 1)

    def test_unknown_publish_result_blocks_repeat_and_can_be_recovered(self):
        job, calls = self.job(), []
        real = self.fake_threads(job, calls)
        def timeout(token, method, path, fields=None):
            if method == 'POST' and path.endswith('threads_publish'):
                raise api.IntegrationError('연결 끊김', uncertain=True)
            return real(token, method, path, fields)
        with patch.object(api, 'threads_api', side_effect=timeout):
            with self.assertRaises(api.IntegrationError):
                api.advance_publication(job, 'token', self.account, 'https://cdn.example.com/video.mp4', lambda j: None)
        self.assertEqual(job['publication']['status'], 'publish_uncertain')
        with patch.object(api, 'threads_api') as call:
            with self.assertRaises(api.IntegrationError):
                api.advance_publication(job, 'token', self.account, '', lambda j: None)
            call.assert_not_called()
        with patch.object(api, 'threads_api', return_value={'id': '30', 'username': 'owner', 'media_type': 'VIDEO', 'text': job['draft']['body']}):
            api.recover_publication(job, 'token', self.account, '30', lambda j: None)
        self.assertFalse(job['publication']['post_pending'])
        self.assertEqual(job['publication']['post_id'], '30')

    def test_wrong_reply_parent_not_success_and_verification_retry_does_not_publish_again(self):
        job, calls = self.job(), []
        with patch.object(api, 'threads_api', side_effect=self.fake_threads(job, calls, wrong_parent=True)):
            with self.assertRaises(api.IntegrationError):
                api.advance_publication(job, 'token', self.account, 'https://cdn.example.com/video.mp4', lambda j: None)
        self.assertNotEqual(job['status'], 'published')
        before = len([c for c in calls if c[0] == 'POST'])
        with patch.object(api, 'threads_api', side_effect=self.fake_threads(job, calls)):
            api.advance_publication(job, 'token', self.account, '', lambda j: None)
        self.assertEqual(before, len([c for c in calls if c[0] == 'POST']))

    def test_account_change_and_private_url_rejected(self):
        job = self.job()
        job['publication']['account_id'] = '99'
        with patch.object(api, 'threads_api') as call:
            with self.assertRaises(api.IntegrationError):
                api.advance_publication(job, 'token', self.account, '', lambda j: None)
            call.assert_not_called()
        for url in ('https://127.0.0.1/video', 'https://localhost/video', 'file:///video', 'https://10.0.0.1/video'):
            with self.assertRaises(api.IntegrationError):
                api.public_video_url(url)

    def test_http_failure_and_missing_publish_id_are_uncertain(self):
        with patch.object(api.requests, 'request', side_effect=requests.Timeout('private token')):
            with self.assertRaises(api.IntegrationError) as error:
                api.request_json('POST', 'https://graph.threads.net/v1.0/1/threads_publish')
            self.assertTrue(error.exception.uncertain)

            self.assertNotIn('private token', error.exception.message)
        with patch.object(api, 'threads_api', return_value={}):
            with self.assertRaises(api.IntegrationError) as error:
                api.publish_container('token', '1', '20')
            self.assertTrue(error.exception.uncertain)

    def test_lens_uploads_actual_image_and_keeps_exact_candidates_unverified(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / 'frame.jpg'
            image.write_bytes(b'actual-frame-bytes')
            captured = []
            def provider(method, url, **kwargs):
                if method == 'POST':
                    captured.append(kwargs['files']['image'][1].read())
                    return {'image_id': 'uploaded-reference'}
                self.assertEqual(kwargs['params']['engine'], 'google_lens')
                self.assertEqual(kwargs['params']['image_id'], 'uploaded-reference')
                self.assertEqual(kwargs['params']['type'], 'exact_matches')
                return {'exact_matches': [{'title': '같은 장면 후보', 'link': 'https://www.youtube.com/watch?v=test',
                                          'thumbnail': 'https://example.com/thumbnail.jpg'}]}
            with patch.object(api, 'request_json', side_effect=provider):
                results = api.search_visual(image, 'not-saved-key', 'exact_matches')
            self.assertEqual(captured, [b'actual-frame-bytes'])
            self.assertEqual(results[0]['kind'], 'content')
            self.assertFalse(results[0]['same_video_verified'])
            self.assertEqual(results[0]['verification'], 'discovered')


if __name__ == '__main__':
    unittest.main()
