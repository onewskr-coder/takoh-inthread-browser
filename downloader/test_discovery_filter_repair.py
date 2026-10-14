import unittest
from studio import evaluate_shopping_relevance, serp_discovery_filters, serp_video_candidates, discovery_growth, subscriber_view_multiple, shopping_shorts_evidence


class FilterRepairTests(unittest.TestCase):
    def test_japanese_kitchen_candidate_is_not_rejected_for_language(self):
        result = evaluate_shopping_relevance('【キッチンツアー】料理がラクになる毎日使ってる愛用品13選。収納・調味料', '', 'living_kitchen')
        self.assertTrue(result['is_qualified'])
        self.assertIn('キッチン', result['category_matches'])

    def test_tracking_url_cannot_change_relevance(self):
        title = 'Kitchen storage tools demonstration review'
        clean = evaluate_shopping_relevance(title, 'kitchen gadgets review', 'living_kitchen')
        linked = evaluate_shopping_relevance(title, 'kitchen gadgets review https://amazon.example/path/mv?srsltid=mv', 'living_kitchen')
        self.assertTrue(clean['is_qualified'])
        self.assertEqual(clean['is_qualified'], linked['is_qualified'])

    def test_real_music_video_remains_excluded(self):
        result = evaluate_shopping_relevance('Official MV music video', 'music performance', 'living_kitchen')
        self.assertFalse(result['is_qualified'])

    def test_shorts_shelves_and_regular_videos_are_collected(self):
        result = serp_video_candidates({'video_results': [{'link': 'https://youtube.com/watch?v=regular1234'}], 'shorts_results': [{'shorts': [{'link': 'https://youtube.com/shorts/shorts12345'}, {'link': 'https://youtube.com/shorts/shorts67890'}]}]})
        self.assertEqual(len(result), 3)
        self.assertIn('/shorts/', result[1]['link'])

    def test_growth_uses_recorded_interval_and_zero_baseline(self):
        self.assertEqual(discovery_growth([{'timestamp':0,'views':100},{'timestamp':7200,'views':300}])[:2],(100,100.0))
        self.assertIsNone(discovery_growth([{'timestamp':0,'views':100},{'timestamp':30,'views':300}])[0])
        self.assertIsNone(discovery_growth([{'timestamp':0,'views':0},{'timestamp':3600,'views':100}])[1])

    def test_subscriber_multiple_is_distinct_from_growth(self):
        self.assertEqual(subscriber_view_multiple(200000,{'subscribers':10000}),20)
        self.assertIsNone(subscriber_view_multiple(200000,{'subscribers':10000,'hidden':True}))
        self.assertIsNone(subscriber_view_multiple(200000,{'subscribers':0}))
        self.assertIsNone(subscriber_view_multiple(200000,{}))

    def test_all_category_includes_car_and_kitchen_but_rejects_music(self):
        self.assertTrue(evaluate_shopping_relevance('car accessories review','car phone holder demonstration','all')['is_qualified'])
        self.assertTrue(evaluate_shopping_relevance('주방 수납 도구 리뷰','사용법','all')['is_qualified'])
        self.assertFalse(evaluate_shopping_relevance('Official music video MV','','all')['is_qualified'])
        self.assertTrue(evaluate_shopping_relevance('car accessories review','car phone holder demonstration','automotive')['is_qualified'])
        self.assertFalse(evaluate_shopping_relevance('car accessories review','car phone holder demonstration','beauty')['is_qualified'])

    def test_shopping_shorts_needs_more_than_short_duration(self):
        self.assertIsNone(shopping_shorts_evidence({},30,'product demo','','shorts_candidate'))
        self.assertIsNotNone(shopping_shorts_evidence({},30,'product demo #shorts','','shorts_candidate'))
        self.assertIsNotNone(shopping_shorts_evidence({'_shorts_evidence':'Shorts shelf'},30,'product demo','','shorts_candidate'))
        self.assertIsNone(shopping_shorts_evidence({'_shorts_evidence':'Shorts shelf'},600,'product demo #shorts','','long'))

    def test_recent_ranges_use_documented_upload_order(self):
        for period in ('7d', '30d', '90d', '1y', 'custom'):
            self.assertEqual(serp_discovery_filters(period, 'relevance'), {'sp': 'CAI='})
        self.assertEqual(serp_discovery_filters('all', 'latest'), {'sp': 'CAI='})
        self.assertEqual(serp_discovery_filters('all', 'relevance'), {})


if __name__ == '__main__':
    unittest.main()
