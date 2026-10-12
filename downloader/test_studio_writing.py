import unittest
from studio_writing import extract_json_safely, draft_prompt, audit_draft, format_post, STYLES


class WritingTests(unittest.TestCase):
    def test_post_formatting_preserves_paragraphs_and_separates_single_line(self):
        self.assertEqual(format_post('#광고\n첫 문장. 두 번째. 세 번째.', True), '#광고\n\n첫 문장. 두 번째.\n\n세 번째.')
        self.assertEqual(format_post('첫 문단\n\n두 번째 문단', True), '#광고\n\n첫 문단\n\n두 번째 문단')
        self.assertEqual(len(format_post('가' * 495, True)), 500)
        self.assertEqual(len(STYLES), 12)
        prompt = draft_prompt({'observations': [], 'audio_summary': '', 'uncertainties': []}, None, 'expert')
        self.assertIn('AIDA', prompt)
        self.assertIn('500자 이하', prompt)
        self.assertIn('자막이나 내레이션이 아닙니다', prompt)
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
