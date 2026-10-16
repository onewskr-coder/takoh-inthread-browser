import tempfile
from pathlib import Path
import unittest
import cv2
import numpy as np
from studio_text_clean import clean_text_video, clean_and_overlay_image


class TextCleanTests(unittest.TestCase):
    def test_neural_detector_tracks_text_at_changing_positions(self):
        with tempfile.TemporaryDirectory() as temporary:
            source=Path(temporary)/'moving.mp4'
            destination=Path(temporary)/'clean.mp4'
            writer=cv2.VideoWriter(str(source),cv2.VideoWriter_fourcc(*'mp4v'),6,(320,240))
            for i in range(12):
                frame=np.full((240,320,3),70,dtype=np.uint8)
                cv2.putText(frame,'SALE 123',(12+i*5,65+i*7),cv2.FONT_HERSHEY_SIMPLEX,.8,(255,255,255),2,cv2.LINE_AA)
                writer.write(frame)
            writer.release()
            states=[]
            report=clean_text_video(source,destination,'all_text',progress=states.append)
            self.assertEqual(report['frames'],12)
            self.assertGreaterEqual(report['repaired_frames'],10)
            self.assertFalse(report['temporal_ai_restoration'])
            self.assertGreater(report['temporal_reused_pixels'],0)
            self.assertEqual(states[-1]['frame'],states[-1]['total'])
            a,b=cv2.VideoCapture(str(source)),cv2.VideoCapture(str(destination))
            for i in range(12):
                ok1,original=a.read();ok2,cleaned=b.read()
                self.assertTrue(ok1 and ok2)
                before=int(np.sum(original[:,:,0]>180));after=int(np.sum(cleaned[:,:,0]>180))
                self.assertLess(after,before*.25)
            a.release();b.release()

    def test_cover_box_is_neutralized_and_does_not_paint_black_rectangles(self):
        with tempfile.TemporaryDirectory() as temporary:
            src = Path(temporary) / 'raw.jpg'
            dst = Path(temporary) / 'out.jpg'
            img = np.full((200, 200, 3), 210, dtype=np.uint8)
            cv2.imwrite(str(src), img)

            def fake_real_text_detector(_frame, use_cls=False, use_rec=True):
                poly = [[20, 130], [180, 130], [180, 170], [20, 170]]
                return [([poly[0], poly[1], poly[2], poly[3]], '특가 할인 50%', 0.95)], None

            res_real = clean_and_overlay_image(src, dst, erase_mode='cover_box', detector=fake_real_text_detector)
            self.assertEqual(res_real['detected_boxes'], 0)
            out_real = cv2.imread(str(dst))
            self.assertGreater(float(out_real[150, 100].mean()), 190.0)

    def test_px_font_size_and_box_dimensions_render_cleanly(self):
        with tempfile.TemporaryDirectory() as temporary:
            src = Path(temporary) / 'raw.jpg'
            dst = Path(temporary) / 'out.jpg'
            img = np.full((640, 360, 3), 180, dtype=np.uint8)
            cv2.imwrite(str(src), img)
            res = clean_and_overlay_image(
                src,
                dst,
                erase_mode='none',
                overlay_text='하단 자막 px 크기·글씨체 테스트',
                overlay_size=46.0,
                overlay_font='serif',
                overlay_box_w=86.0,
                overlay_box_h=14.0,
                title_text='상단 타이틀 박스 상하좌우 리사이즈',
                title_size=64.0,
                title_font='brush_kr',
                title_box_w=88.0,
                title_box_h=18.0,
            )
            self.assertTrue(res['overlay_applied'])
            self.assertTrue(dst.exists())

    def test_expanded_korean_fonts_double_stroke_and_box_radius(self):
        import shutil
        from studio_text_clean import (
            STUDIO_FONT_CATALOG,
            STUDIO_BUNDLED_FONTS_DIR,
            set_custom_fonts_dir,
            _load_korean_font,
        )
        with tempfile.TemporaryDirectory() as temporary:
            temp_dir = Path(temporary)
            custom_fonts_dir = temp_dir / 'custom_fonts'
            custom_fonts_dir.mkdir(parents=True, exist_ok=True)
            set_custom_fonts_dir(custom_fonts_dir)

            # Copy one bundled TTF as a user-uploaded custom font
            sample_ttf = STUDIO_BUNDLED_FONTS_DIR / 'Jua-Regular.ttf'
            if sample_ttf.is_file():
                shutil.copy2(sample_ttf, custom_fonts_dir / 'my_brand_font.ttf')

            self.assertGreaterEqual(len(STUDIO_FONT_CATALOG), 20)
            keys = {f['key'] for f in STUDIO_FONT_CATALOG}
            for expected_key in ('black_han_sans', 'gasoek_one', 'do_hyeon', 'jua', 'bagel_fat_one', 'gowun_dodum', 'gowun_batang', 'nanum_pen', 'orbit'):
                self.assertIn(expected_key, keys)
            if sample_ttf.is_file():
                loaded_custom = _load_korean_font(42, style='custom_my_brand_font')
                self.assertIsNotNone(loaded_custom)

            src = temp_dir / 'raw.jpg'
            dst_overlay = temp_dir / 'out_overlay.jpg'
            dst_carousel = temp_dir / 'out_carousel.jpg'
            img = np.full((640, 360, 3), 120, dtype=np.uint8)
            cv2.imwrite(str(src), img)

            # Test 1: Video hook title + subtitle with custom font, box_radius, and 1st + 2nd double stroke
            res1 = clean_and_overlay_image(
                src,
                dst_overlay,
                erase_mode='none',
                overlay_text='[자막 둥글기 40px] + *2중 테두리* 완벽 적용',
                overlay_size=44.0,
                overlay_font='custom_my_brand_font' if sample_ttf.is_file() else 'jua',
                overlay_box_radius=40,
                overlay_stroke_width=4,
                overlay_stroke_color='#000000',
                overlay_double_stroke_width=6,
                overlay_double_stroke_color='#38bdf8',
                title_text='초극태 타이틀 | 2중 외곽선 효과',
                title_color='reels_rounded_black',
                title_size=58.0,
                title_font='gasoek_one',
                title_box_radius=36,
                title_stroke_width=5,
                title_stroke_color='#111111',
                title_double_stroke_width=5,
                title_double_stroke_color='#facc15',
            )
            self.assertTrue(res1['overlay_applied'])
            self.assertTrue(dst_overlay.is_file())

            # Test 2: Editorial carousel card with custom font & double stroke
            res2 = clean_and_overlay_image(
                src,
                dst_carousel,
                erase_mode='cover_box',
                overlay_text='[캐러셀 폰트] 2중 테두리 적용\n커스텀 글씨체와 외곽선 굵기 조절 지원',
                overlay_font='bagel_fat_one',
                overlay_stroke_width=4,
                overlay_stroke_color='#0f172a',
                overlay_double_stroke_width=4,
                overlay_double_stroke_color='#facc15',
                template='editorial_dark',
                slide_index=2,
                slide_total=5,
                slide_role='body',
            )
            self.assertTrue(res2['overlay_applied'])
            self.assertTrue(dst_carousel.is_file())

    def test_capcut_11_typography_features_render_in_pillow(self):
        from studio_text_clean import render_transparent_overlay_png
        with tempfile.TemporaryDirectory() as temporary:
            temp_dir = Path(temporary)
            src = temp_dir / 'raw.jpg'
            dst_img = temp_dir / 'out_capcut_img.jpg'
            dst_png = temp_dir / 'out_capcut_overlay.png'
            img = np.full((640, 360, 3), 100, dtype=np.uint8)
            cv2.imwrite(str(src), img)

            res = clean_and_overlay_image(
                src,
                dst_img,
                erase_mode='none',
                overlay_text='하단 자막 테스트\n줄간격·자간·기울임·밑줄·정렬',
                overlay_size=40.0,
                overlay_font='do_hyeon',
                overlay_bold=False,
                overlay_italic=True,
                overlay_underline=True,
                overlay_text_color='#38bdf8',
                overlay_bg_color='#0f172a',
                overlay_bg_opacity=80.0,
                overlay_letter_spacing=4.0,
                overlay_line_spacing=1.45,
                overlay_align='left',
                overlay_scale_pct=115.0,
                overlay_opacity=85.0,
                overlay_stroke_width=3,
                overlay_stroke_color='#000000',
                overlay_double_stroke_width=4,
                overlay_double_stroke_color='#facc15',
                title_text='상단 후킹 타이틀 | 2중 테두리 & 자간',
                title_color='reels_giant_yellow_impact',
                title_size=52.0,
                title_font='black_han_sans',
                title_bold=True,
                title_italic=True,
                title_underline=True,
                title_text_color='#ffea18',
                title_bg_color='#1e293b',
                title_bg_opacity=90.0,
                title_letter_spacing=2.5,
                title_line_spacing=1.25,
                title_align='right',
                title_scale_pct=120.0,
                title_opacity=92.0,
                title_stroke_width=4,
                title_stroke_color='#000000',
                title_double_stroke_width=5,
                title_double_stroke_color='#f43f5e',
            )
            self.assertTrue(res['overlay_applied'])
            self.assertTrue(dst_img.is_file())

            ok_png = render_transparent_overlay_png(
                360,
                640,
                dst_png,
                overlay_text='투명 레이어 자막\n우측 정렬 + 기울임 + 자간',
                font_family='jua',
                bold=True,
                italic=True,
                underline=True,
                text_color_hex='#4ade80',
                bg_color_hex='#090d16',
                bg_opacity=75.0,
                letter_spacing=3.0,
                line_spacing=1.35,
                text_align='right',
                scale_pct=110.0,
                opacity=90.0,
                stroke_width=3,
                stroke_color='#000000',
                double_stroke_width=4,
                double_stroke_color='#ffffff',
            )
            self.assertTrue(ok_png)
            self.assertTrue(dst_png.is_file())

