"""Isolated real Flask/product persistence; no provider calls."""
import unittest
from unittest.mock import patch
import test_studio
import studio

class ProductionAffiliateTests(unittest.TestCase):
    setUpClass = classmethod(test_studio.StudioTests.setUpClass.__func__)
    tearDownClass = classmethod(test_studio.StudioTests.tearDownClass.__func__)
    setUp = test_studio.StudioTests.setUp
    tearDown = test_studio.StudioTests.tearDown
    upload = test_studio.StudioTests.upload
    post = test_studio.StudioTests.post

    def test_manual_link_without_original_url_persists(self):
        job = self.upload()
        for platform, url in [('coupang','https://link.coupang.com/a/test'), ('naver','https://naver.me/test')]:
            with patch.object(studio, 'coupang_deeplink') as issue:
                response = self.post(job, 'product', {'platform':platform, 'name':'직접 선택 상품', 'link_entry_mode':'manual', 'affiliate_url':url, 'confirmed':True})
                self.assertEqual(response.status_code, 200, response.json)
                self.assertEqual(response.json['product']['url'], '')
                self.assertEqual(response.json['product']['affiliate_url'], url)
                self.assertEqual(response.json['product']['attribution'], 'user_confirmed')
                issue.assert_not_called()
                loaded = self.client.get('/studio/jobs/'+job['id']).json
                self.assertEqual(loaded['product']['link_entry_mode'], 'manual')
                self.assertEqual(loaded['product']['affiliate_url'], url)

    def test_manual_requires_link_and_ownership_confirmation(self):
        job = self.upload()
        payload = dict(platform='coupang', name='상품', link_entry_mode='manual', affiliate_url='https://link.coupang.com/a/test')
        self.assertEqual(self.post(job,'product',payload).status_code,400)
        self.assertEqual(self.post(job,'product',{**payload,'affiliate_url':'','confirmed':True}).status_code,400)

    def test_api_mode_requires_original_and_supported_platform(self):
        job = self.upload()
        payload = dict(platform='coupang',name='상품',link_entry_mode='api',affiliate_url='')
        self.assertEqual(self.post(job,'product',payload).status_code,400)
        result=self.post(job,'product',{**payload,'url':'https://www.coupang.com/vp/products/123'})
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(result.json['product']['affiliate_method'],'none')
        self.assertEqual(self.post(job,'product',{**payload,'platform':'naver','url':'https://example.com/123'}).status_code,400)

if __name__ == '__main__':
    unittest.main()
