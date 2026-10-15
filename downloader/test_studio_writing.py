import unittest
from studio_writing import extract_json_safely, draft_prompt, audit_draft, format_post, STYLES


class WritingTests(unittest.TestCase):
    def test_post_formatting_preserves_paragraphs_and_separates_single_line(self):
        self.assertEqual(format_post('#광고\n첫 문장. 두 번째. 세 번째.', True), '#광고\n\n첫 문장. 두 번째.\n\n세 번째.')
        self.assertEqual(format_post('첫 문단\n\n두 번째 문단', True), '#광고\n\n첫 문단\n\n두 번째 문단')
        self.assertEqual(format_post('#광고\n\n첫 줄입니다.\n둘째 줄입니다.', True, style='one_line'), '#광고\n\n첫 줄입니다. 둘째 줄입니다.')
        self.assertEqual(format_post('#광고\n\n첫 줄입니다.\n\n둘째 줄입니다.\n셋째 줄입니다.', True, style='two_line'), '#광고\n\n첫 줄입니다.\n둘째 줄입니다. 셋째 줄입니다.')
        self.assertEqual(len(format_post('가' * 495, True)), 500)
        self.assertEqual(len(STYLES), 15)
        for mode in ('one_line', 'two_line', 'hook', 'story'):
            self.assertIn(mode, STYLES)
        prompt = draft_prompt({'observations': [], 'audio_summary': '', 'uncertainties': []}, None, 'expert')
        self.assertIn('AIDA', prompt)
        self.assertIn('500자 이하', prompt)
        self.assertIn('자막이나 내레이션이 아닙니다', prompt)
        one_line_prompt = draft_prompt({'observations': [], 'audio_summary': '', 'uncertainties': []}, None, 'one_line')
        self.assertIn('한줄 모드', one_line_prompt)
        self.assertIn('딱 1줄', one_line_prompt)
    def test_natural_copy_removes_canned_comment_ending(self):
        from studio_writing import repost_draft_prompt
        self.assertEqual(format_post('고리 없이 봉에 끼우는 샤워 커튼. 자세한 정보는 첫 댓글에 남겨둘게요.', True, 'one_line'), '#광고\n\n고리 없이 봉에 끼우는 샤워 커튼.')
        self.assertEqual(format_post('제품 정보와 구매 링크는 첫 댓글에 남겨둘게요.', False), '')
        analysis={'observations': [], 'audio_summary': '', 'uncertainties': []}
        for mode in STYLES:
            for prompt in [draft_prompt(analysis, {}, mode), repost_draft_prompt('원문', analysis, mode, include_ad_tag=True)]:
                self.assertIn('상투적인 판매 마무리는 금지', prompt)
                self.assertNotIn('첫 댓글 안내 1', prompt)
                self.assertNotIn('처럼 짧게 안내하세요', prompt)
                self.assertIn('담백', prompt)

    def test_json_fences_and_commentary_are_parsed_but_truncation_is_not(self):
        self.assertEqual(extract_json_safely('```json\n{"body":"한국어"}\n```'), {'body': '한국어'})
        self.assertEqual(extract_json_safely('결과: {"script":"장면"}'), {'script': '장면'})
        self.assertIsNone(extract_json_safely('{"body":'))

    def test_prompt_uses_observations_and_preserves_uncertainties(self):
        analysis = {'observations': [{'timestamp': 4, 'description': '수납함에 소품을 넣음'}], 'audio_summary': '없음', 'uncertainties': ['브랜드 미확인']}
        prompt = draft_prompt(analysis, {'name': '후보'}, 'problem_solution')
        self.assertIn('수납함에 소품을 넣음', prompt)
        self.assertIn('브랜드 미확인', prompt)
        self.assertIn('내 후기처럼', prompt)
        self.assertIn('후보', prompt)
        with self.assertRaises(ValueError):
            draft_prompt(analysis, None, 'unsupported')

    def test_quality_notes_do_not_claim_content_verified(self):
        self.assertTrue(audit_draft('직접 써봤어요. 역대급 반전!', '#광고\n최저가'))
        self.assertEqual(audit_draft('소품을 나누어 넣는 장면입니다.', '#광고\n사용 장면을 소개합니다.'), [])
