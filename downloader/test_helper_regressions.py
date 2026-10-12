"""Offline regressions; no websites, browser cookies, or engine updates."""
import io
import os
import unittest
import zipfile
from unittest.mock import patch, MagicMock
import app


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()

    def download(self, suffix='.mp4'):
        paths = []
        def extract(url, download=True):
            opts = engine.call_args.args[0]
            path = opts['outtmpl'].replace('%(title)s', 'fixture').replace('%(ext)s', suffix[1:])
            with open(path, 'wb') as handle:
                handle.write(b'fixture-media')
            paths.append(path)
            return {'title': 'fixture', 'id': '123'}
        with patch.object(app.yt_dlp, 'YoutubeDL') as engine:
            engine.return_value.__enter__.return_value.extract_info.side_effect = extract
            response = self.client.get('/download?url=https://x.com/user/status/123/video/2')
            self.assertEqual(engine.call_args.args[0]['playlist_items'], '2')
        return response, paths

    def test_x_download_and_cleanup_after_transfer(self):
        response, paths = self.download()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(os.path.exists(paths[0]))
        self.assertEqual(response.data, b'fixture-media')
        response.close()
        self.assertFalse(os.path.exists(os.path.dirname(paths[0])))

    def test_interrupted_transfer_cleanup(self):
        response, paths = self.download()
        response.close()
        self.assertFalse(os.path.exists(os.path.dirname(paths[0])))

    def test_partial_video_is_not_success(self):
        response, paths = self.download('.f137.mp4')
        self.assertEqual(response.status_code, 500)
        response.close()
        self.assertFalse(os.path.exists(os.path.dirname(paths[0])))

    def test_head_does_not_download(self):
        with patch.object(app.yt_dlp, 'YoutubeDL') as engine:
            self.assertEqual(self.client.head('/download?url=https://example.com/video').status_code, 405)
            engine.assert_not_called()

    def test_audio_requires_merger(self):
        with patch.object(app, 'find_ffmpeg_location', return_value=None), patch.object(app.yt_dlp, 'YoutubeDL') as engine:
            response = self.client.get('/download?url=https://example.com/video&quality=audio')
            self.assertEqual(response.status_code, 503)
            engine.assert_not_called()
            response.close()

    def test_missing_metadata(self):
        with patch.object(app.yt_dlp, 'YoutubeDL') as engine:
            engine.return_value.__enter__.return_value.extract_info.return_value = None
            self.assertEqual(self.client.get('/info?url=https://example.com/video').status_code, 502)

    def test_zip_failure_is_explicit(self):
        with patch.object(app.http_requests, 'get', return_value=MagicMock(status_code=403)):
            response = self.client.post('/download_zip', json={'urls': ['https://example.com/a.mp4']})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json['failed_items'], [1])

    def test_zip_success(self):
        with patch.object(app.http_requests, 'get', return_value=MagicMock(status_code=200, content=b'a' * 200)):
            response = self.client.post('/download_zip', json={'urls': ['https://example.com/a.mp4']})
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            self.assertEqual(archive.read('media_01.mp4'), b'a' * 200)
        response.close()

    def test_zip_invalid_payload(self):
        self.assertEqual(self.client.post('/download_zip', json={'urls': 123}).status_code, 400)

    def test_pinterest_repin_canonical(self):
        html = '<link rel="canonical" href="https://in.pinterest.com/pin/bathroom--881016745874551311/"><script type="application/ld+json">{"@type":"VideoObject","@id":"https://in.pinterest.com/pin/bathroom--881016745874551311/","contentUrl":"https://v1.pinimg.com/fixture.mp4"}</script>'
        with patch.object(app.http_requests, 'get', return_value=MagicMock(ok=True, text=html)):
            response = self.client.get('/pinterest/resolve?url=https://kr.pinterest.com/pin/901071837963839661/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['pin_id'], '901071837963839661')
        self.assertEqual(response.json['media_url'], 'https://v1.pinimg.com/fixture.mp4')

    def test_pinterest_wrong_pin_excluded(self):
        self.assertIsNone(app.pinterest_embedded_mp4([{'@type':'VideoObject', '@id':'https://www.pinterest.com/pin/999/', 'contentUrl':'https://v1.pinimg.com/wrong.mp4'}], '123'))

    def test_pinterest_invalid_url(self):
        self.assertEqual(self.client.get('/pinterest/resolve?url=https://example.com/pin/123/').status_code, 400)


if __name__ == '__main__':
    unittest.main()
