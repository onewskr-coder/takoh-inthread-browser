"""Local per-frame neural text detection and spatial repair; no external API."""
from pathlib import Path
import sys
import time


def clean_text_video(source, destination, scope='subtitles', progress=None, detector=None):
    import cv2
    import numpy as np
    if scope not in ('subtitles', 'all_text'):
        raise ValueError('지원하지 않는 텍스트 감지 범위입니다.')
    if detector is None:
        sys.path.insert(0, str(Path(__file__).parent / 'local_ai'))
        from rapidocr_onnxruntime import RapidOCR
        detector = RapidOCR(det_limit_side_len=640, intra_op_num_threads=2)
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise ValueError('원본 영상을 열지 못했습니다.')
    fps = capture.get(cv2.CAP_PROP_FPS)
    width, height = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if not 0 < fps <= 240 or min(width, height) < 2:
        capture.release()
        raise ValueError('영상의 프레임 정보를 확인하지 못했습니다.')
    writer = cv2.VideoWriter(str(destination), cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
    count, repaired, boxes_count, temporal_pixels = 0, 0, 0, 0
    previous_frame = previous_mask = None
    started = time.monotonic()
    try:
        if not writer.isOpened():
            raise ValueError('텍스트 처리 영상 파일을 만들지 못했습니다.')
        while True:
            ok, frame = capture.read()
            if not ok: break
            if time.monotonic() - started > 1800:
                raise ValueError('텍스트 처리 시간이 30분을 초과했습니다. 더 짧은 영상으로 시도하세요.')
            result, _ = detector(frame, use_cls=False, use_rec=False)
            mask = np.zeros((height, width), dtype=np.uint8)
            for polygon in result if result is not None else []:
                polygon = np.asarray(polygon, dtype=np.float32)
                if polygon.shape != (4, 2) or not np.isfinite(polygon).all(): continue
                if scope == 'subtitles' and polygon[:, 1].mean() < height * .5: continue
                polygon[:, 0] = np.clip(polygon[:, 0], 0, width-1)
                polygon[:, 1] = np.clip(polygon[:, 1], 0, height-1)
                cv2.fillPoly(mask, [polygon.astype(np.int32)], 255)
                boxes_count += 1
            raw_frame = frame.copy()
            if mask.any():
                # Cover antialiasing, text outlines and shadows around detector boxes.
                margin = max(3, round(min(width,height)*.006))
                mask = cv2.dilate(mask, np.ones((margin*2+1, margin*2+1), np.uint8))
                spatial = cv2.inpaint(frame, mask, 5, cv2.INPAINT_TELEA)
                if previous_frame is not None:
                    # Backward optical flow: only borrow pixels which were not text
                    # in the previous frame and agree with the spatial estimate.
                    current_gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
                    previous_gray=cv2.cvtColor(previous_frame,cv2.COLOR_BGR2GRAY)
                    flow=cv2.calcOpticalFlowFarneback(current_gray,previous_gray,None,.5,3,15,3,5,1.2,0)
                    yy,xx=np.mgrid[:height,:width].astype(np.float32)
                    mx,my=xx+flow[:,:,0],yy+flow[:,:,1]
                    warped=cv2.remap(previous_frame,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
                    old_mask=cv2.remap(previous_mask,mx,my,cv2.INTER_NEAREST,borderMode=cv2.BORDER_CONSTANT,borderValue=255)
                    disagreement=np.mean(np.abs(warped.astype(np.float32)-spatial.astype(np.float32)),axis=2)
                    valid=(mask>0)&(old_mask==0)&(mx>=0)&(mx<width-1)&(my>=0)&(my<height-1)&(disagreement<35)
                    spatial[valid]=warped[valid]
                    temporal_pixels+=int(valid.sum())
                # Soft boundaries reduce the rectangular seam left by hard masks.
                alpha=cv2.GaussianBlur(mask.astype(np.float32)/255,(5,5),0)[:,:,None]
                frame=np.clip(spatial.astype(np.float32)*alpha+frame.astype(np.float32)*(1-alpha),0,255).astype(np.uint8)
                repaired += 1
            previous_frame,previous_mask=raw_frame,mask.copy()
            writer.write(frame)
            count += 1
            if progress and (count == 1 or count % 10 == 0):
                progress(dict(stage='detecting',frame=count,total=total,repaired_frames=repaired))
        if count == 0:
            raise ValueError('읽을 수 있는 프레임이 없습니다.')
        if progress: progress(dict(stage='encoding',frame=count,total=count,repaired_frames=repaired))
        return dict(engine='RapidOCR + optical-flow background reuse + Telea',scope=scope,frames=count,repaired_frames=repaired,
                    detected_boxes=boxes_count,temporal_reused_pixels=temporal_pixels,temporal_ai_restoration=False)
    finally:
        capture.release()
        writer.release()


def _get_ocr_detector(detector=None):
    if detector is not None:
        return detector
    sys.path.insert(0, str(Path(__file__).parent / 'local_ai'))
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR(det_limit_side_len=960, intra_op_num_threads=2)


def _read_image_bgr(source):
    import cv2
    import numpy as np
    raw = np.fromfile(str(source), dtype=np.uint8)
    image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('원본 이미지를 열지 못했습니다.')
    return image


def _write_image_bgr(destination, image):
    import cv2
    ext = Path(destination).suffix.lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
        ext = '.jpg'
    params = [int(cv2.IMWRITE_JPEG_QUALITY), 95] if ext in ('.jpg', '.jpeg') else []
    ok, encoded = cv2.imencode(ext, image, params)
    if not ok:
        raise ValueError('편집된 이미지를 저장하지 못했습니다.')
    Path(destination).write_bytes(encoded.tobytes())


def detect_media_text(source, is_image=False, detector=None):
    """Detect and recognize text from an image or sampled frames of a video using local RapidOCR."""
    import cv2
    import numpy as np
    ocr = _get_ocr_detector(detector)
    frames = []
    if is_image:
        frames.append(_read_image_bgr(source))
    else:
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise ValueError('원본 영상을 열지 못했습니다.')
        try:
            total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
            indices = [0]
            if total > 3:
                indices = sorted({int(total * r) for r in (0.12, 0.38, 0.65, 0.88)})
            for idx in indices:
                if total > 0:
                    capture.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ok, frame = capture.read()
                if ok and frame is not None:
                    frames.append(frame)
        finally:
            capture.release()
    if not frames:
        raise ValueError('텍스트를 분석할 프레임을 읽지 못했습니다.')

    seen_texts = []
    boxes = []
    for frame_idx, frame in enumerate(frames):
        height, width = frame.shape[:2]
        if min(height, width) < 2:
            continue
        result, _ = ocr(frame, use_cls=False, use_rec=True)
        for item in result if result is not None else []:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            polygon = np.asarray(item[0], dtype=np.float32)
            text = str(item[1] or '').strip()
            score = float(item[2]) if len(item) > 2 and item[2] is not None else 0.0
            if polygon.shape != (4, 2) or not np.isfinite(polygon).all():
                continue
            x0 = float(np.clip(polygon[:, 0].min() / width * 100.0, 0.0, 100.0))
            y0 = float(np.clip(polygon[:, 1].min() / height * 100.0, 0.0, 100.0))
            x1 = float(np.clip(polygon[:, 0].max() / width * 100.0, 0.0, 100.0))
            y1 = float(np.clip(polygon[:, 1].max() / height * 100.0, 0.0, 100.0))
            if frame_idx == 0 or is_image:
                boxes.append({
                    'x': round(x0, 2),
                    'y': round(y0, 2),
                    'w': round(max(1.0, x1 - x0), 2),
                    'h': round(max(1.0, y1 - y0), 2),
                    'text': text,
                    'score': round(score, 3),
                })
            if text and text not in seen_texts:
                seen_texts.append(text)
    return {
        'texts': seen_texts,
        'combined_text': '\n'.join(seen_texts),
        'boxes': boxes,
        'box_count': len(boxes),
    }


STUDIO_BUNDLED_FONTS_DIR = Path(__file__).parent / 'fonts'
_BUNDLED_FONTS_DIR = STUDIO_BUNDLED_FONTS_DIR

STUDIO_FONT_CATALOG = [
    {'key': 'heavy_kr', 'name': '맑은 고딕 Bold (기본 훅 고딕)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'malgunbd.ttf', 'source': 'system'},
    {'key': 'black_han_sans', 'name': '검은고딕 Black Han Sans (초고밀도 헤비 타이틀)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'BlackHanSans-Regular.ttf', 'source': 'bundled'},
    {'key': 'gasoek_one', 'name': '가석체 Gasoek One (초극태 임팩트 블록)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'GasoekOne-Regular.ttf', 'source': 'bundled'},
    {'key': 'do_hyeon', 'name': '배민 도현체 Do Hyeon (직선 레트로 간판)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'DoHyeon-Regular.ttf', 'source': 'bundled'},
    {'key': 'jua', 'name': '배민 주아체 Jua (친근한 라운드 훅)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'Jua-Regular.ttf', 'source': 'bundled'},
    {'key': 'bagel_fat_one', 'name': '베이글팻원 Bagel Fat One (트렌디 볼륨 팝)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'BagelFatOne-Regular.ttf', 'source': 'bundled'},
    {'key': 'hy_headline', 'name': 'HY헤드라인M (클래식 뉴스 헤드라인)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'H2HDRM.TTF', 'source': 'system'},
    {'key': 'hy_gothic_extra', 'name': 'HY견고딕 (단단한 타이틀 고딕)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'H2GTRE.TTF', 'source': 'system'},
    {'key': 'pyeongchang_peace_bold', 'name': '휴먼둥근헤드라인 (와이드 모던 디스플레이)', 'group': '1. 훅·임팩트 타이틀 (쇼츠·릴스·카드뉴스 표지)', 'file': 'HMKMRHD.TTF', 'source': 'system'},
    {'key': 'sans', 'name': '본고딕 Noto Sans KR (깔끔한 산세리프)', 'group': '2. 모던·산세리프 본문 (깔끔한 가독성·자막)', 'file': 'NotoSansKR-VF.ttf', 'source': 'system'},
    {'key': 'gowun_dodum', 'name': '고운돋움 Gowun Dodum (단정한 청정 고딕)', 'group': '2. 모던·산세리프 본문 (깔끔한 가독성·자막)', 'file': 'GowunDodum-Regular.ttf', 'source': 'bundled'},
    {'key': 'orbit', 'name': '오르빗 Orbit (모던 테크·인포그래픽)', 'group': '2. 모던·산세리프 본문 (깔끔한 가독성·자막)', 'file': 'Orbit-Regular.ttf', 'source': 'bundled'},
    {'key': 'malgun_regular', 'name': '맑은 고딕 Regular (슬림 본문 고딕)', 'group': '2. 모던·산세리프 본문 (깔끔한 가독성·자막)', 'file': 'malgun.ttf', 'source': 'system'},
    {'key': 'gulim_clean', 'name': '새굴림 / 굴림 클린 산세리프', 'group': '2. 모던·산세리프 본문 (깔끔한 가독성·자막)', 'file': 'NGULIM.TTF', 'source': 'system'},
    {'key': 'nanum_gothic', 'name': '나눔고딕 볼드 NanumGothic (선명한 표준 자막)', 'group': '2. 모던·산세리프 본문 (깔끔한 가독성·자막)', 'file': 'ngBold.ttf', 'source': 'system'},
    {'key': 'serif', 'name': '고운바탕 Bold (매거진 에디토리얼 세리프)', 'group': '3. 매거진·에디토리얼 명조 (감성·뉴스·저널)', 'file': 'GowunBatang-Bold.ttf', 'source': 'bundled'},
    {'key': 'gowun_batang', 'name': '고운바탕 볼드 Gowun Batang (감성 에세이 명조)', 'group': '3. 매거진·에디토리얼 명조 (감성·뉴스·저널)', 'file': 'GowunBatang-Bold.ttf', 'source': 'bundled'},
    {'key': 'gowun_batang_bold', 'name': '고운바탕 볼드 Gowun Batang (감성 에세이 명조)', 'group': '3. 매거진·에디토리얼 명조 (감성·뉴스·저널)', 'file': 'GowunBatang-Bold.ttf', 'source': 'bundled'},
    {'key': 'batang_kr', 'name': '바탕체 / 본명조 (클래식 뉴스·교양 명조)', 'group': '3. 매거진·에디토리얼 명조 (감성·뉴스·저널)', 'file': 'NotoSerifKR-VF.ttf', 'source': 'system'},
    {'key': 'hy_myeongjo_extra', 'name': 'HY견명조 (무게감 있는 매거진 표지 명조)', 'group': '3. 매거진·에디토리얼 명조 (감성·뉴스·저널)', 'file': 'H2MJRE.TTF', 'source': 'system'},
    {'key': 'hy_sin_myeongjo', 'name': 'HY신명조 (신문·에세이 본문 명조)', 'group': '3. 매거진·에디토리얼 명조 (감성·뉴스·저널)', 'file': 'H2MJSM.TTF', 'source': 'system'},
    {'key': 'brush_kr', 'name': '나눔손글씨 펜 (자연스러운 손글씨 노트)', 'group': '4. 감성 손글씨·캘리그라피 (브이로그·포스트잇)', 'file': 'NanumPenScript-Regular.ttf', 'source': 'bundled'},
    {'key': 'nanum_pen', 'name': '나눔손글씨 펜 (자연스러운 손글씨 노트)', 'group': '4. 감성 손글씨·캘리그라피 (브이로그·포스트잇)', 'file': 'NanumPenScript-Regular.ttf', 'source': 'bundled'},
    {'key': 'gungseo_kr', 'name': '궁서체 / 휴먼편지체 (정통 감성 붓글씨)', 'group': '4. 감성 손글씨·캘리그라피 (브이로그·포스트잇)', 'file': 'HMFMPYUN.TTF', 'source': 'system'},
    {'key': 'hy_pyunji', 'name': '휴먼편지체 (따뜻한 감성 손편지체)', 'group': '4. 감성 손글씨·캘리그라피 (브이로그·포스트잇)', 'file': 'HMFMPYUN.TTF', 'source': 'system'},
    {'key': 'hy_gungseo_bold', 'name': 'HY궁서B (굵은 캘리그라피 붓글씨)', 'group': '4. 감성 손글씨·캘리그라피 (브이로그·포스트잇)', 'file': 'H2GSRB.TTF', 'source': 'system'},
    {'key': 'magic_kr', 'name': '휴먼매직체 (경쾌한 마커 손글씨)', 'group': '4. 감성 손글씨·캘리그라피 (브이로그·포스트잇)', 'file': 'HMKMMAG.TTF', 'source': 'system'},
    {'key': 'hy_mokgak', 'name': 'HY목각파임B (우드블록 스탬프)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'H2MKPB.TTF', 'source': 'system'},
    {'key': 'yet_hangul', 'name': '휴먼옛체 (전통 고전 감성)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'HMFMOLD.TTF', 'source': 'system'},
    {'key': 'hy_yet', 'name': '휴먼옛체 (전통 고전 감성)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'HMFMOLD.TTF', 'source': 'system'},
    {'key': 'pyeongchang_regular', 'name': 'HY그래픽M (모던 라운드 그래픽)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'H2GPRM.TTF', 'source': 'system'},
    {'key': 'hy_graphic', 'name': 'HY그래픽M (둥근 모던 그래픽)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'H2GPRM.TTF', 'source': 'system'},
    {'key': 'hy_post', 'name': 'HY포스트M (감성 포스터 둥근체)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'H2PORM.TTF', 'source': 'system'},
    {'key': 'hy_samul', 'name': 'HY얕은샘물M (깔끔한 둥근 포인트)', 'group': '5. 레트로·특수 디스플레이 (개성 연출)', 'file': 'H2SA1M.TTF', 'source': 'system'},
]

_CUSTOM_FONTS_DIR = None


def set_custom_fonts_dir(path):
    global _CUSTOM_FONTS_DIR
    _CUSTOM_FONTS_DIR = Path(path) if path else None


def _get_custom_fonts_dir():
    if _CUSTOM_FONTS_DIR is not None:
        return _CUSTOM_FONTS_DIR
    import os
    local_app = os.environ.get('LOCALAPPDATA') or ''
    if local_app:
        return Path(local_app) / 'ONEWS' / 'studio' / 'custom_fonts'
    return STUDIO_BUNDLED_FONTS_DIR / 'custom'


def _load_korean_font(font_px, bold=True, style='sans', weight=None):
    from PIL import ImageFont
    px = max(10, int(font_px))
    style = str(style or 'sans').strip()
    style_lower = style.lower()

    # 1. Check custom user-uploaded font (`custom_<id>` or direct filename in custom_fonts)
    custom_dir = _get_custom_fonts_dir()
    if style_lower.startswith('custom_') or (custom_dir and custom_dir.is_dir()):
        if custom_dir and custom_dir.is_dir():
            meta_file = custom_dir / 'fonts.json'
            if meta_file.is_file():
                try:
                    import json
                    items = json.loads(meta_file.read_text(encoding='utf-8'))
                    for item in items if isinstance(items, list) else []:
                        if str(item.get('key') or '').lower() == style_lower or str(item.get('id') or '').lower() == style_lower:
                            fp = custom_dir / str(item.get('file') or '')
                            if fp.is_file():
                                return ImageFont.truetype(str(fp), px)
                except Exception:
                    pass
            for ext in ('', '.ttf', '.otf', '.ttc'):
                cand_custom = custom_dir / f'{style}{ext}'
                if cand_custom.is_file():
                    try:
                        return ImageFont.truetype(str(cand_custom), px)
                    except Exception:
                        pass

    # 2. Check bundled downloaded fonts (`downloader/fonts/`) & mapped system catalog keys
    bundled_map = {
        'heavy_kr': ('C:/Windows/Fonts/malgunbd.ttf', 'C:/Windows/Fonts/H2GTRE.TTF', 'C:/Windows/Fonts/NotoSansKR-VF.ttf'),
        'malgun_bold': ('C:/Windows/Fonts/malgunbd.ttf', 'C:/Windows/Fonts/malgun.ttf'),
        'black_han_sans': (STUDIO_BUNDLED_FONTS_DIR / 'BlackHanSans-Regular.ttf', 'C:/Windows/Fonts/H2GTRE.TTF'),
        'gasoek_one': (STUDIO_BUNDLED_FONTS_DIR / 'GasoekOne-Regular.ttf', STUDIO_BUNDLED_FONTS_DIR / 'BlackHanSans-Regular.ttf', 'C:/Windows/Fonts/H2GTRE.TTF'),
        'do_hyeon': (STUDIO_BUNDLED_FONTS_DIR / 'DoHyeon-Regular.ttf', 'C:/Windows/Fonts/H2HDRM.TTF', 'C:/Windows/Fonts/H2GTRE.TTF'),
        'jua': (STUDIO_BUNDLED_FONTS_DIR / 'Jua-Regular.ttf', 'C:/Windows/Fonts/H2GPRM.TTF', 'C:/Windows/Fonts/malgunbd.ttf'),
        'bagel_fat_one': (STUDIO_BUNDLED_FONTS_DIR / 'BagelFatOne-Regular.ttf', STUDIO_BUNDLED_FONTS_DIR / 'Jua-Regular.ttf', 'C:/Windows/Fonts/H2GTRE.TTF'),
        'hy_headline': ('C:/Windows/Fonts/H2HDRM.TTF', 'C:/Windows/Fonts/HMKMRHD.TTF', 'C:/Windows/Fonts/H2GTRE.TTF'),
        'hy_gothic_extra': ('C:/Windows/Fonts/H2GTRE.TTF', 'C:/Windows/Fonts/H2GTRM.TTF', 'C:/Windows/Fonts/malgunbd.ttf'),
        'pyeongchang_peace_bold': ('C:/Windows/Fonts/HMKMRHD.TTF', 'C:/Windows/Fonts/H2PORM.TTF', 'C:/Windows/Fonts/H2HDRM.TTF'),
        'gowun_dodum': (STUDIO_BUNDLED_FONTS_DIR / 'GowunDodum-Regular.ttf', 'C:/Windows/Fonts/NotoSansKR-VF.ttf', 'C:/Windows/Fonts/malgun.ttf'),
        'orbit': (STUDIO_BUNDLED_FONTS_DIR / 'Orbit-Regular.ttf', 'C:/Windows/Fonts/NotoSansKR-VF.ttf', 'C:/Windows/Fonts/malgun.ttf'),
        'malgun_regular': ('C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/malgunsl.ttf'),
        'gulim_clean': ('C:/Windows/Fonts/NGULIM.TTF', 'C:/Windows/Fonts/gulim.ttc', 'C:/Windows/Fonts/malgun.ttf'),
        'nanum_gothic': ('C:/Windows/Fonts/ngBold.ttf' if bold else 'C:/Windows/Fonts/ng.ttf', 'C:/Windows/Fonts/ng.ttf', 'C:/Windows/Fonts/malgunbd.ttf'),
        'serif': (STUDIO_BUNDLED_FONTS_DIR / 'GowunBatang-Bold.ttf', 'C:/Windows/Fonts/NotoSerifKR-VF.ttf', 'C:/Windows/Fonts/batang.ttc'),
        'gowun_batang': (STUDIO_BUNDLED_FONTS_DIR / 'GowunBatang-Bold.ttf', 'C:/Windows/Fonts/NotoSerifKR-VF.ttf', 'C:/Windows/Fonts/batang.ttc'),
        'gowun_batang_bold': (STUDIO_BUNDLED_FONTS_DIR / 'GowunBatang-Bold.ttf', 'C:/Windows/Fonts/NotoSerifKR-VF.ttf', 'C:/Windows/Fonts/batang.ttc'),
        'hy_myeongjo_extra': ('C:/Windows/Fonts/H2MJRE.TTF', 'C:/Windows/Fonts/batang.ttc'),
        'hy_sin_myeongjo': ('C:/Windows/Fonts/H2MJSM.TTF', 'C:/Windows/Fonts/batang.ttc'),
        'brush_kr': (STUDIO_BUNDLED_FONTS_DIR / 'NanumPenScript-Regular.ttf', 'C:/Windows/Fonts/HMKMMAG.TTF', 'C:/Windows/Fonts/HMFMPYUN.TTF'),
        'nanum_pen': (STUDIO_BUNDLED_FONTS_DIR / 'NanumPenScript-Regular.ttf', 'C:/Windows/Fonts/HMKMMAG.TTF', 'C:/Windows/Fonts/HMFMPYUN.TTF'),
        'gungseo_kr': ('C:/Windows/Fonts/HMFMPYUN.TTF', 'C:/Windows/Fonts/H2GSRB.TTF', 'C:/Windows/Fonts/batang.ttc'),
        'hy_pyunji': ('C:/Windows/Fonts/HMFMPYUN.TTF', 'C:/Windows/Fonts/HMKMMAG.TTF', 'C:/Windows/Fonts/malgun.ttf'),
        'hy_gungseo_bold': ('C:/Windows/Fonts/H2GSRB.TTF', 'C:/Windows/Fonts/batang.ttc'),
        'magic_kr': ('C:/Windows/Fonts/HMKMMAG.TTF', 'C:/Windows/Fonts/HMFMPYUN.TTF', 'C:/Windows/Fonts/H2GSRB.TTF'),
        'hy_mokgak': ('C:/Windows/Fonts/H2MKPB.TTF', 'C:/Windows/Fonts/H2GTRE.TTF', 'C:/Windows/Fonts/malgunbd.ttf'),
        'yet_hangul': ('C:/Windows/Fonts/HMFMOLD.TTF', 'C:/Windows/Fonts/H2GSRB.TTF', 'C:/Windows/Fonts/batang.ttc'),
        'hy_yet': ('C:/Windows/Fonts/HMFMOLD.TTF', 'C:/Windows/Fonts/H2GSRB.TTF', 'C:/Windows/Fonts/batang.ttc'),
        'pyeongchang_regular': ('C:/Windows/Fonts/H2GPRM.TTF', 'C:/Windows/Fonts/H2SA1M.TTF', 'C:/Windows/Fonts/H2PORM.TTF'),
        'hy_graphic': ('C:/Windows/Fonts/H2GPRM.TTF', 'C:/Windows/Fonts/H2PORM.TTF', 'C:/Windows/Fonts/malgunbd.ttf'),
        'hy_post': ('C:/Windows/Fonts/H2PORM.TTF', 'C:/Windows/Fonts/H2PORL.TTF', 'C:/Windows/Fonts/H2GPRM.TTF'),
        'hy_samul': ('C:/Windows/Fonts/H2SA1M.TTF', 'C:/Windows/Fonts/H2PORM.TTF', 'C:/Windows/Fonts/malgun.ttf'),
    }
    if style_lower in bundled_map:
        for cand in bundled_map[style_lower]:
            p = Path(cand)
            if p.exists():
                try:
                    return ImageFont.truetype(str(p), px)
                except Exception:
                    pass

    if style_lower == 'batang_kr':
        vf_path = Path('C:/Windows/Fonts/NotoSerifKR-VF.ttf')
        if vf_path.exists():
            try:
                f = ImageFont.truetype(str(vf_path), px)
                w = int(weight if weight is not None else (700 if bold else 400))
                f.set_variation_by_axes([max(200, min(900, w))])
                return f
            except Exception:
                pass
        candidates = ('C:/Windows/Fonts/batang.ttc', 'C:/Windows/Fonts/H2MJSM.TTF', 'C:/Windows/Fonts/H2MJRE.TTF')
    elif style_lower == 'display_en':
        candidates = (
            'C:/Windows/Fonts/BOD_R.TTF' if not bold else 'C:/Windows/Fonts/BOD_B.TTF',
            'C:/Windows/Fonts/georgiab.ttf' if bold else 'C:/Windows/Fonts/georgia.ttf',
            'C:/Windows/Fonts/timesbd.ttf',
            'C:/Windows/Fonts/malgunbd.ttf',
        )
    elif style_lower == 'sans_cond_en':
        candidates = (
            'C:/Windows/Fonts/bahnschrift.ttf',
            'C:/Windows/Fonts/ARIALN.TTF',
            'C:/Windows/Fonts/malgun.ttf',
        )
    elif style_lower == 'brush_kr':
        candidates = (
            'C:/Windows/Fonts/HMKMMAG.TTF',
            'C:/Windows/Fonts/H2GSRB.TTF',
            'C:/Windows/Fonts/HMFMPYUN.TTF',
            'C:/Windows/Fonts/malgunbd.ttf',
        )
    elif style_lower == 'heavy_kr':
        candidates = (
            'C:/Windows/Fonts/H2GTRE.TTF',
            'C:/Windows/Fonts/H2HDRM.TTF',
            'C:/Windows/Fonts/HMKMRHD.TTF',
            'C:/Windows/Fonts/NotoSansKR-VF.ttf',
            'C:/Windows/Fonts/malgunbd.ttf',
        )
        for candidate in candidates:
            if Path(candidate).exists():
                try:
                    f = ImageFont.truetype(candidate, px)
                    if 'NotoSansKR-VF' in candidate:
                        f.set_variation_by_axes([900])
                    return f
                except Exception:
                    pass
    elif style_lower == 'script_en':
        candidates = (
            'C:/Windows/Fonts/Gabriola.ttf',
            'C:/Windows/Fonts/segoesc.ttf',
            'C:/Windows/Fonts/georgiai.ttf',
            'C:/Windows/Fonts/malgunbd.ttf',
        )
    else:
        vf_path = Path('C:/Windows/Fonts/NotoSansKR-VF.ttf')
        if vf_path.exists():
            try:
                f = ImageFont.truetype(str(vf_path), px)
                w = int(weight if weight is not None else (800 if bold else 400))
                f.set_variation_by_axes([max(100, min(900, w))])
                return f
            except Exception:
                pass
        candidates = (
            ('C:/Windows/Fonts/malgunbd.ttf', 'C:/Windows/Fonts/ngBold.ttf', 'C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/gulim.ttc')
            if bold
            else ('C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/malgunbd.ttf', 'C:/Windows/Fonts/gulim.ttc')
        )
    for candidate in candidates:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, px)
            except Exception:
                pass
    return ImageFont.load_default()


def _parse_hex_or_named_rgba(color_val, default_rgba=(0, 0, 0, 245)):
    if isinstance(color_val, (tuple, list)) and len(color_val) >= 3:
        return (int(color_val[0]), int(color_val[1]), int(color_val[2]), int(color_val[3]) if len(color_val) >= 4 else 255)
    s = str(color_val or '').strip().lower()
    named = {
        'black': (10, 12, 16, 250),
        'white': (255, 255, 255, 250),
        'yellow': (255, 228, 36, 250),
        'gold': (245, 196, 48, 250),
        'coral': (238, 86, 70, 250),
        'red': (225, 45, 55, 250),
        'mint': (45, 212, 191, 250),
        'neon_green': (74, 246, 88, 250),
        'blue': (59, 130, 246, 250),
        'navy': (15, 23, 42, 250),
        'pink': (236, 142, 192, 250),
    }
    if s in named:
        return named[s]
    if s.startswith('#') and len(s) in (4, 7):
        try:
            if len(s) == 4:
                r, g, b = int(s[1]*2, 16), int(s[2]*2, 16), int(s[3]*2, 16)
            else:
                r, g, b = int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16)
            return (r, g, b, 250)
        except Exception:
            pass
    return default_rgba


def _measure_spaced_text(draw, text, font, letter_spacing=0.0):
    """Measure text width, height, and top offset taking into account custom character spacing (px)."""
    s = str(text or '')
    if not s:
        return 0, 0, 0
    try:
        ls = float(letter_spacing or 0.0)
    except (TypeError, ValueError):
        ls = 0.0
    b = draw.textbbox((0, 0), s, font=font)
    base_w = b[2] - b[0]
    lh = b[3] - b[1]
    top_off = b[1]
    if abs(ls) < 0.2 or len(s) <= 1:
        return base_w, lh, top_off
    total_w = 0.0
    for idx, ch in enumerate(s):
        cb = draw.textbbox((0, 0), ch, font=font)
        cw = max(1, cb[2] - cb[0])
        total_w += cw + (ls if idx < len(s) - 1 else 0.0)
    return max(1, int(round(total_w))), lh, top_off


def _draw_double_stroke_text(
    draw,
    xy,
    text,
    font,
    fill_rgba,
    inner_w=0,
    inner_rgba=(10, 12, 16, 250),
    outer_w=0,
    outer_rgba=(255, 228, 36, 245),
    letter_spacing=0.0,
    underline=False,
):
    """Draw text with optional 1st (inner) stroke, 2nd (outer) stroke, character spacing (px), and underline."""
    x, y = int(xy[0]), int(xy[1])
    iw = max(0, int(round(inner_w or 0)))
    ow = max(0, int(round(outer_w or 0)))
    try:
        ls = float(letter_spacing or 0.0)
    except (TypeError, ValueError):
        ls = 0.0

    s = str(text or '')
    if not s:
        return

    def _draw_single(px, py, txt):
        if ow > 0:
            total_w = iw + ow if iw > 0 else ow
            draw.text(
                (px, py),
                txt,
                font=font,
                fill=outer_rgba,
                stroke_width=total_w,
                stroke_fill=outer_rgba,
            )
        if iw > 0:
            draw.text(
                (px, py),
                txt,
                font=font,
                fill=fill_rgba,
                stroke_width=iw,
                stroke_fill=inner_rgba,
            )
        else:
            draw.text((px, py), txt, font=font, fill=fill_rgba)

    if abs(ls) >= 0.2 and len(s) > 1:
        cur_x = float(x)
        for ch in s:
            _draw_single(int(round(cur_x)), y, ch)
            cb = draw.textbbox((0, 0), ch, font=font)
            cw = max(1, cb[2] - cb[0])
            cur_x += cw + ls
        span_w = max(1, int(round(cur_x - ls - x)))
    else:
        _draw_single(x, y, s)
        b = draw.textbbox((0, 0), s, font=font)
        span_w = max(1, b[2] - b[0])

    if underline:
        b_ref = draw.textbbox((0, 0), s, font=font)
        uy = y + b_ref[3] + max(2, int((b_ref[3] - b_ref[1]) * 0.08))
        uw = max(2, int((b_ref[3] - b_ref[1]) * 0.07))
        if iw > 0:
            draw.line([(x - 1, uy), (x + span_w + 1, uy)], fill=inner_rgba, width=uw + iw)
        draw.line([(x, uy), (x + span_w, uy)], fill=fill_rgba, width=uw)


def _apply_layer_italic_and_opacity(layer_img, italic=False, opacity=100.0, center_y=None):
    """Apply optional italic horizontal slant (shear) and overall layer opacity (10..100%) to a rendered RGBA PIL layer."""
    import numpy as np
    from PIL import Image

    if layer_img is None:
        return layer_img
    out = layer_img
    if italic:
        w, h = out.size
        cy = float(center_y if center_y is not None else (h * 0.5))
        shear = 0.20
        # x_src = x_dst + shear * (y_dst - cy)
        out = out.transform(
            (w, h),
            Image.Transform.AFFINE,
            (1.0, shear, -shear * cy, 0.0, 1.0, 0.0),
            resample=Image.Resampling.BICUBIC,
        )
    try:
        op_val = float(opacity if opacity is not None and opacity != '' else 100.0)
    except (TypeError, ValueError):
        op_val = 100.0
    if op_val < 99.5:
        op_ratio = max(0.05, min(1.0, op_val / 100.0))
        arr = np.asarray(out, dtype=np.float32).copy()
        arr[:, :, 3] = np.clip(arr[:, :, 3] * op_ratio, 0, 255)
        out = Image.fromarray(arr.astype(np.uint8), mode='RGBA')
    return out




def _wrap_korean_editorial_lines(draw, text, font, max_text_width):
    """Wrap Korean/English text cleanly on word boundaries first, falling back to character split only for oversized single words."""
    lines = []
    for raw_line in str(text or '').split('\n'):
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        words = raw_line.split(' ')
        current = ''
        for word in words:
            if not word:
                continue
            candidate = f'{current} {word}'.strip() if current else word
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if (bbox[2] - bbox[0]) <= max_text_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                    current = ''
                wbbox = draw.textbbox((0, 0), word, font=font)
                if (wbbox[2] - wbbox[0]) <= max_text_width:
                    current = word
                else:
                    chunk = ''
                    for ch in word:
                        test = chunk + ch
                        cbbox = draw.textbbox((0, 0), test, font=font)
                        if (cbbox[2] - cbbox[0]) > max_text_width and chunk:
                            lines.append(chunk)
                            chunk = ch
                        else:
                            chunk = test
                    current = chunk
        if current:
            lines.append(current)
    return lines


def _parse_highlight_segments(line_str):
    """Parse [형광펜] or *강조* segments within a line into [(text, mode), ...] where mode in ('normal', 'box', 'accent')."""
    import re
    pattern = re.compile(r'(\[[^\]]+\]|\*[^\*]+\*)')
    parts = pattern.split(str(line_str or ''))
    segments = []
    for part in parts:
        if not part:
            continue
        if part.startswith('[') and part.endswith(']') and len(part) > 2:
            segments.append((part[1:-1], 'box'))
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            segments.append((part[1:-1], 'accent'))
        else:
            segments.append((part, 'normal'))
    return segments or [(str(line_str or ''), 'normal')]


CAROUSEL_DESIGN_THEMES = {
    'editorial_dark': {
        'layout': 'cinema_review',
        'bg': (12, 14, 18, 240),
        'border': (255, 255, 255, 42),
        'text': (255, 255, 255, 255),
        'accent': (234, 88, 72, 255),
        'accent_text': (255, 255, 255, 255),
        'sub': (228, 232, 238, 245),
        'scrim': 'cinematic',
        'align': 'left',
        'accent_bar': True,
    },
    'magazine_gradient': {
        'layout': 'editorial_poster',
        'bg': None,
        'border': None,
        'text': (255, 255, 255, 255),
        'accent': (255, 214, 92, 255),
        'accent_text': (18, 20, 26, 255),
        'sub': (236, 240, 246, 242),
        'scrim': 'cinematic',
        'align': 'center',
        'accent_bar': True,
    },
    'clean_white': {
        'layout': 'framed_ticket',
        'bg': (250, 250, 248, 255),
        'border': (34, 48, 68, 45),
        'text': (42, 62, 108, 255),
        'accent': (52, 84, 152, 255),
        'accent_text': (255, 255, 255, 255),
        'sub': (112, 120, 134, 245),
        'scrim': 'soft_dark',
        'align': 'center',
        'accent_bar': False,
    },
    'highlight_hook': {
        'layout': 'diagonal_split',
        'bg': (48, 50, 48, 236),
        'border': (168, 235, 52, 180),
        'text': (255, 255, 255, 255),
        'accent': (174, 238, 54, 255),
        'accent_text': (18, 24, 14, 255),
        'sub': (228, 232, 236, 245),
        'scrim': 'dark',
        'align': 'left',
        'accent_bar': True,
    },
    'mint_modern': {
        'layout': 'workspace_magazine',
        'bg': (14, 20, 24, 236),
        'border': (255, 255, 255, 110),
        'text': (255, 255, 255, 255),
        'accent': (255, 255, 255, 255),
        'accent_text': (14, 18, 22, 255),
        'sub': (204, 212, 220, 238),
        'scrim': 'cinematic',
        'align': 'left',
        'accent_bar': True,
    },
    'warm_luxury': {
        'layout': 'scrapbook_note',
        'bg': (236, 234, 226, 255),
        'border': (168, 146, 118, 90),
        'text': (22, 20, 18, 255),
        'accent': (236, 234, 226, 255),
        'accent_text': (22, 20, 18, 255),
        'sub': (78, 72, 64, 240),
        'scrim': 'soft_dark',
        'align': 'left',
        'accent_bar': False,
    },
    'neon_pop': {
        'layout': 'social_review_ui',
        'bg': (255, 255, 255, 252),
        'border': (224, 228, 236, 255),
        'text': (22, 26, 34, 255),
        'accent': (49, 118, 246, 255),
        'accent_text': (255, 255, 255, 255),
        'sub': (68, 76, 88, 245),
        'scrim': 'soft_dark',
        'align': 'left',
        'accent_bar': True,
    },
    'minimal_outline': {
        'layout': 'korean_picnic_serif',
        'bg': None,
        'border': None,
        'text': (255, 253, 248, 255),
        'accent': (255, 232, 132, 255),
        'accent_text': (28, 24, 18, 255),
        'sub': (246, 242, 232, 245),
        'scrim': 'subtle',
        'align': 'left',
        'accent_bar': False,
    },
}


def _draw_segmented_line(
    draw,
    line_str,
    x,
    y,
    font,
    fill_rgba,
    accent_rgba,
    accent_text_rgba,
    stroke_w=0,
    stroke_rgba=(0, 0, 0, 200),
    box_style='rounded',
    double_stroke_w=0,
    double_stroke_rgba=(255, 228, 36, 240),
):
    """Draw a single line supporting [형광펜 박스], *색상 강조* inline spans, and 1st/2nd text outlines."""
    segments = _parse_highlight_segments(line_str)
    bbox_full = draw.textbbox((0, 0), '가Ag', font=font)
    lh = bbox_full[3] - bbox_full[1]
    top_off = bbox_full[1]
    cur_x = int(x)
    iw = max(0, int(round(stroke_w or 0)))
    ow = max(0, int(round(double_stroke_w or 0)))
    for seg_txt, seg_mode in segments:
        if not seg_txt:
            continue
        sb = draw.textbbox((0, 0), seg_txt, font=font)
        sw = sb[2] - sb[0]
        if seg_mode == 'box':
            pad_x = max(8, int(lh * 0.22))
            pad_y = max(4, int(lh * 0.12))
            if box_style == 'brush':
                pts = [
                    (cur_x - pad_x // 3, y + 2),
                    (cur_x + sw + pad_x, y - pad_y // 2),
                    (cur_x + sw + pad_x - 3, y + lh + pad_y),
                    (cur_x - pad_x // 2, y + lh + pad_y // 2),
                ]
                draw.polygon(pts, fill=accent_rgba)
            else:
                draw.rounded_rectangle(
                    [cur_x - pad_x // 3, y - pad_y, cur_x + sw + pad_x, y + lh + pad_y],
                    radius=max(6, int(lh * 0.22)),
                    fill=accent_rgba,
                )
            draw.text((cur_x + pad_x // 3, y - top_off), seg_txt, font=font, fill=accent_text_rgba)
            cur_x += sw + pad_x + 4
        elif seg_mode == 'accent':
            _draw_double_stroke_text(
                draw,
                (cur_x, y - top_off),
                seg_txt,
                font=font,
                fill_rgba=accent_rgba,
                inner_w=iw,
                inner_rgba=stroke_rgba,
                outer_w=ow,
                outer_rgba=double_stroke_rgba,
            )
            cur_x += sw
        else:
            _draw_double_stroke_text(
                draw,
                (cur_x, y - top_off),
                seg_txt,
                font=font,
                fill_rgba=fill_rgba,
                inner_w=iw,
                inner_rgba=stroke_rgba,
                outer_w=ow,
                outer_rgba=double_stroke_rgba,
            )
            cur_x += sw
    return cur_x


def _measure_clean_line(draw, line_str, font):
    import re
    clean = re.sub(r'\[([^\]]+)\]', r'\1', re.sub(r'\*([^\*]+)\*', r'\1', str(line_str or '')))
    b = draw.textbbox((0, 0), clean, font=font)
    extra = max(12, int((b[3] - b[1]) * 0.28)) if '[' in str(line_str or '') else 0
    return (b[2] - b[0]) + extra, (b[3] - b[1]), b[1]


def _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_text, accent_rgba, dark_mode=True):
    """Draw minimal subtle slide indicator in top-right when slide_total > 1."""
    if not (slide_total and slide_total > 1 and 1 <= int(slide_index or 0) <= int(slide_total)):
        return
    margin_x = int(width * 0.062)
    top_y = int(height * 0.036)
    fg = (255, 255, 255, 215) if dark_mode else (45, 52, 64, 200)
    muted = (255, 255, 255, 75) if dark_mode else (45, 52, 64, 65)
    meta_font = _load_korean_font(max(11, int(width * 0.017)), bold=True, weight=700)
    cnt_str = f'{int(slide_index):02d} / {int(slide_total):02d}'
    cb = draw.textbbox((0, 0), cnt_str, font=meta_font)
    cw, ch = cb[2] - cb[0], cb[3] - cb[1]
    px0 = width - margin_x - cw - 20
    py0 = top_y
    pill_bg = (12, 14, 20, 130) if dark_mode else (255, 255, 255, 175)
    draw.rounded_rectangle([px0, py0, width - margin_x, py0 + ch + 10], radius=(ch + 10) // 2, fill=pill_bg, outline=muted, width=1)
    draw.text((px0 + 10, py0 + 5 - cb[1]), cnt_str, font=meta_font, fill=fg)


def _render_canva_editorial_card_pil(
    pil_rgba,
    overlay_text='',
    overlay_position='bottom',
    overlay_size=4.5,
    template='editorial_dark',
    badge_text='',
    slide_index=0,
    slide_total=0,
    sub_text='',
    swipe_hint=True,
    slide_role='auto',
    font_family='',
    stroke_width=0,
    stroke_color='',
    double_stroke_width=0,
    double_stroke_color='',
):
    """Render 1:1 Canva-faithful full-canvas Korean card news layouts with dedicated Cover (메인 표지) / Body (본문 포인트) / CTA (마지막 요약·전환) role compositions."""
    import re
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageOps

    width, height = pil_rgba.size
    text = str(overlay_text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not text:
        return pil_rgba

    tpl_key = str(template or 'editorial_dark').strip().lower()
    theme = CAROUSEL_DESIGN_THEMES.get(tpl_key) or CAROUSEL_DESIGN_THEMES['editorial_dark']
    layout_mode = theme.get('layout', 'cinema_review')
    user_fam = str(font_family or '').strip().lower()
    try:
        u_stroke_w = max(0, int(round(float(stroke_width or 0))))
    except (TypeError, ValueError):
        u_stroke_w = 0
    try:
        u_double_w = max(0, int(round(float(double_stroke_width or 0))))
    except (TypeError, ValueError):
        u_double_w = 0
    u_stroke_rgba = _parse_hex_or_named_rgba(stroke_color, default_rgba=(10, 12, 16, 250))
    u_double_rgba = _parse_hex_or_named_rgba(double_stroke_color, default_rgba=(255, 228, 36, 245))

    # Resolve effective slide role: 'cover' | 'body' | 'cta'
    role_norm = str(slide_role or 'auto').strip().lower()
    s_idx = int(slide_index or 0)
    s_tot = int(slide_total or 0)
    if role_norm in ('cover', 'body', 'cta'):
        eff_role = role_norm
    elif s_tot <= 1 or s_idx <= 1:
        eff_role = 'cover'
    elif s_idx == s_tot and s_tot >= 3:
        eff_role = 'cta'
    else:
        eff_role = 'body'

    explicit_lines = [ln.strip() for ln in text.split('\n') if ln.strip()]
    if not sub_text and len(explicit_lines) >= 2:
        headline_raw = explicit_lines[0]
        sub_text = '\n'.join(explicit_lines[1:])
    else:
        headline_raw = text

    clean_headline = re.sub(r'\[([^\]]+)\]', r'\1', re.sub(r'\*([^\*]+)\*', r'\1', headline_raw)).strip()
    clean_sub = re.sub(r'\[([^\]]+)\]', r'\1', re.sub(r'\*([^\*]+)\*', r'\1', str(sub_text or ''))).strip()

    margin_x = int(width * 0.068)
    badge_str = str(badge_text or '').strip()
    point_num = max(1, s_idx - 1) if s_idx > 1 else 1

    # =========================================================================
    # DEDICATED BODY & CTA ROLE COMPOSITIONS (Themed per 8 Canva Palettes)
    # =========================================================================
    if eff_role in ('body', 'cta'):
        palette_map = {
            'editorial_dark': {
                'dark': True, 'card_bg': (14, 16, 22, 242), 'card_border': (238, 86, 70, 145),
                'accent': (238, 86, 70, 255), 'accent_txt': (255, 255, 255, 255),
                'head_col': (255, 255, 255, 255), 'sub_col': (218, 224, 234, 245),
                'cta_pill': '첫 댓글 & 프로필에서 상세 정보 확인하기 →',
            },
            'magazine_gradient': {
                'dark': True, 'card_bg': (12, 16, 26, 238), 'card_border': (255, 214, 92, 155),
                'accent': (255, 214, 92, 255), 'accent_txt': (16, 18, 24, 255),
                'head_col': (255, 255, 255, 255), 'sub_col': (222, 228, 240, 245),
                'cta_pill': '저장해 두고 필요할 때 바로 확인하기 →',
            },
            'clean_white': {
                'dark': False, 'card_bg': (252, 252, 250, 252), 'card_border': (52, 84, 152, 95),
                'accent': (52, 84, 152, 255), 'accent_txt': (255, 255, 255, 255),
                'head_col': (28, 42, 78, 255), 'sub_col': (78, 88, 106, 255),
                'cta_pill': '더 많은 추천 정보 · 첫 댓글 링크 확인 →',
            },
            'highlight_hook': {
                'dark': True, 'card_bg': (30, 34, 30, 244), 'card_border': (176, 242, 54, 185),
                'accent': (176, 242, 54, 255), 'accent_txt': (18, 24, 14, 255),
                'head_col': (255, 255, 255, 255), 'sub_col': (224, 232, 224, 245),
                'cta_pill': '지금 첫 댓글에서 최저가·상세 스펙 확인 ›',
            },
            'mint_modern': {
                'dark': True, 'card_bg': (14, 20, 24, 242), 'card_border': (255, 255, 255, 130),
                'accent': (255, 255, 255, 255), 'accent_txt': (14, 18, 22, 255),
                'head_col': (255, 255, 255, 255), 'sub_col': (204, 214, 224, 245),
                'cta_pill': '큐레이터 추천 상세 링크 · 첫 댓글 확인 »',
            },
            'warm_luxury': {
                'dark': False, 'card_bg': (244, 240, 232, 252), 'card_border': (148, 124, 96, 120),
                'accent': (62, 48, 36, 255), 'accent_txt': (248, 244, 236, 255),
                'head_col': (28, 24, 20, 255), 'sub_col': (76, 68, 58, 255),
                'cta_pill': '전체 코스와 상세 정보 · 저장 후 확인하세요',
            },
            'neon_pop': {
                'dark': False, 'card_bg': (255, 255, 255, 252), 'card_border': (49, 118, 246, 140),
                'accent': (49, 118, 246, 255), 'accent_txt': (255, 255, 255, 255),
                'head_col': (22, 28, 38, 255), 'sub_col': (68, 76, 90, 255),
                'cta_pill': '실구매 베스트 상품 정보 · 첫 댓글 바로가기 →',
            },
            'minimal_outline': {
                'dark': True, 'card_bg': (22, 26, 20, 238), 'card_border': (255, 232, 132, 150),
                'accent': (255, 232, 132, 255), 'accent_txt': (24, 22, 16, 255),
                'head_col': (255, 253, 246, 255), 'sub_col': (232, 228, 216, 245),
                'cta_pill': '놓치기 아까운 추천 리스트 · 저장 & 공유하기',
            },
        }
        pal = palette_map.get(tpl_key, palette_map['editorial_dark'])
        is_dark = pal['dark']
        use_serif = tpl_key in ('minimal_outline', 'magazine_gradient', 'warm_luxury')
        font_style = user_fam or ('serif' if use_serif else 'sans')
        sub_font_style = user_fam or 'sans'
        sub_badge = badge_str if (badge_str and not re.fullmatch(r'POINT\s*\d+', badge_str, re.I)) else f'POINT {point_num:02d}'
        body_copy = clean_sub or '실사용 장면에서 확인된 핵심 디테일과 차별화 포인트입니다.'

        # ---------- ROLE = BODY: 8 DISTINCT EDITORIAL LAYOUTS PER THEME ----------
        if eff_role == 'body':
            # 1) editorial_dark: Cinema Split Frame (Top 56% Widescreen Crop + Coral Divider + Bottom 44% Solid Dark Editorial Split Column with Giant Index 01)
            if tpl_key == 'editorial_dark':
                canvas = Image.new('RGBA', (width, height), (14, 15, 19, 255))
                top_h = int(height * 0.56)
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (width, top_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                canvas.paste(photo_crop, (0, 0))
                # Subtle top scrim for header readability
                top_scrim = np.zeros((int(height * 0.14), width, 4), dtype=np.uint8)
                ty = np.arange(top_scrim.shape[0], dtype=np.float32)
                top_scrim[:, :, 3] = np.clip((1.0 - ty / max(1.0, float(top_scrim.shape[0]))) * 150, 0, 255).astype(np.uint8)[:, None]
                canvas.alpha_composite(Image.fromarray(top_scrim, mode='RGBA'), (0, 0))

                draw = ImageDraw.Draw(canvas)
                _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, pal['accent'], dark_mode=True)
                # Crisp Coral Widescreen Divider Line
                draw.rectangle([0, top_h - 3, width, top_h + 3], fill=pal['accent'])

                # Left Index Column (01) + Vertical Divider + Right Editorial Copy
                col_x = margin_x
                idx_font = _load_korean_font(max(54, int(width * 0.105)), bold=True, style='sans', weight=900)
                idx_str = f'{point_num:02d}'
                ib = draw.textbbox((0, 0), idx_str, font=idx_font)
                idx_y = top_h + int(height * 0.048)
                draw.text((col_x, idx_y - ib[1]), idx_str, font=idx_font, fill=pal['accent'])

                lbl_f = _load_korean_font(max(13, int(width * 0.019)), bold=True, style='sans', weight=700)
                draw.text((col_x + 4, idx_y + (ib[3] - ib[1]) + 10), 'SCENE NOTE', font=lbl_f, fill=(148, 156, 172, 220))

                div_x = col_x + max(int(width * 0.175), (ib[2] - ib[0]) + 32)
                draw.line([(div_x, top_h + int(height * 0.045)), (div_x, height - int(height * 0.055))], fill=(255, 255, 255, 42), width=2)

                tx_x = div_x + int(width * 0.042)
                tx_w = width - margin_x - tx_x
                cur_y = top_h + int(height * 0.048)

                # Kicker tag
                kf = _load_korean_font(max(15, int(width * 0.023)), bold=True, style='sans', weight=800)
                kb = draw.textbbox((0, 0), sub_badge, font=kf)
                draw.text((tx_x, cur_y - kb[1]), sub_badge, font=kf, fill=pal['accent'])
                cur_y += (kb[3] - kb[1]) + int(height * 0.018)

                head_px = max(28, int(width * 0.048))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, tx_w)[:2]:
                    _draw_segmented_line(draw, ln, tx_x, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                cur_y += int(height * 0.014)
                sub_px = max(17, int(width * 0.028))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, tx_w)[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((tx_x, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)
                return canvas

            # 2) magazine_gradient: Vogue / NY Editorial Asymmetry (Top-Left Serif Number & Vertical Issue Tag + Top-Right Framed Photo + Bottom Editorial Spread)
            if tpl_key == 'magazine_gradient':
                canvas = Image.new('RGBA', (width, height), (14, 17, 24, 255))
                draw = ImageDraw.Draw(canvas)
                _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, pal['accent'], dark_mode=True)

                # Right-aligned framed vertical photo (62% width, 52% height)
                ph_w = int(width * 0.62)
                ph_h = int(height * 0.50)
                ph_x = width - margin_x - ph_w
                ph_y = int(height * 0.095)
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (ph_w, ph_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                canvas.paste(photo_crop, (ph_x, ph_y))
                draw.rectangle([ph_x - 2, ph_y - 2, ph_x + ph_w + 2, ph_y + ph_h + 2], outline=pal['accent'], width=2)

                # Top-left asymmetric index column
                left_x = margin_x
                left_w = ph_x - left_x - int(width * 0.03)
                k_f = _load_korean_font(max(13, int(width * 0.019)), bold=True, style='sans', weight=700)
                draw.text((left_x, ph_y + 6), 'EDITORIAL', font=k_f, fill=pal['accent'])
                draw.text((left_x, ph_y + 30), 'FEATURE', font=k_f, fill=(180, 188, 205, 220))
                draw.line([(left_x, ph_y + 62), (left_x + max(48, left_w - 10), ph_y + 62)], fill=pal['accent'], width=2)

                num_f = _load_korean_font(max(64, int(width * 0.125)), bold=True, style='serif', weight=900)
                n_str = f'{point_num:02d}'
                nb = draw.textbbox((0, 0), n_str, font=num_f)
                draw.text((left_x, ph_y + 84 - nb[1]), n_str, font=num_f, fill=(255, 255, 255, 245))

                sub_kf = _load_korean_font(max(15, int(width * 0.022)), bold=True, style='sans', weight=700)
                for b_idx, bln in enumerate(_wrap_korean_editorial_lines(draw, sub_badge, sub_kf, max(80, left_w))[:2]):
                    draw.text((left_x, ph_y + ph_h - 58 + b_idx * 26), bln, font=sub_kf, fill=pal['accent'])

                # Bottom full-width editorial spread between gold horizontal rules
                sp_y = ph_y + ph_h + int(height * 0.038)
                draw.line([(margin_x, sp_y), (width - margin_x, sp_y)], fill=(255, 214, 92, 140), width=2)
                cur_y = sp_y + int(height * 0.026)
                in_w = width - margin_x * 2

                head_px = max(30, int(width * 0.052))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, in_w)[:2]:
                    _draw_segmented_line(draw, ln, margin_x, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                cur_y += int(height * 0.014)
                sub_px = max(18, int(width * 0.029))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, in_w)[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((margin_x, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)

                draw.line([(margin_x, height - int(height * 0.048)), (width - margin_x, height - int(height * 0.048))], fill=(255, 214, 92, 90), width=1)
                return canvas

            # 3) clean_white: Modern White Gallery Sheet (Clean Off-White Paper Canvas + Top Minimal Rule + Framed Rounded Photo + Left-Aligned Clean Typography)
            if tpl_key == 'clean_white':
                canvas = Image.new('RGBA', (width, height), (248, 247, 243, 255))
                draw = ImageDraw.Draw(canvas)
                # Top Gallery Header Bar
                top_y = int(height * 0.045)
                hf = _load_korean_font(max(15, int(width * 0.022)), bold=True, style='sans', weight=800)
                left_hdr = f'STEP {point_num:02d}  ·  {sub_badge}'
                draw.text((margin_x, top_y), left_hdr, font=hf, fill=pal['accent'])
                pg_str = f'{s_idx:02d} / {s_tot:02d}'
                pg_b = draw.textbbox((0, 0), pg_str, font=hf)
                draw.text((width - margin_x - (pg_b[2] - pg_b[0]), top_y), pg_str, font=hf, fill=(120, 130, 148, 255))
                rule_y = top_y + int(height * 0.036)
                draw.line([(margin_x, rule_y), (width - margin_x, rule_y)], fill=(52, 84, 152, 70), width=2)

                # Centered Gallery Photo Frame
                ph_w = width - margin_x * 2
                ph_h = int(height * 0.48)
                ph_y = rule_y + int(height * 0.024)
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (ph_w, ph_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                pmask = Image.new('L', (ph_w, ph_h), 0)
                prad = int(width * 0.028)
                ImageDraw.Draw(pmask).rounded_rectangle([0, 0, ph_w, ph_h], radius=prad, fill=255)
                canvas.paste(photo_crop, (margin_x, ph_y), pmask)
                draw.rounded_rectangle([margin_x, ph_y, margin_x + ph_w, ph_y + ph_h], radius=prad, outline=(52, 84, 152, 55), width=2)

                # Bottom Typography Section on Clean Paper
                cur_y = ph_y + ph_h + int(height * 0.036)
                in_w = ph_w
                head_px = max(30, int(width * 0.052))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, in_w)[:2]:
                    _draw_segmented_line(draw, ln, margin_x, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                cur_y += int(height * 0.012)
                draw.rectangle([margin_x, cur_y, margin_x + int(width * 0.08), cur_y + 4], fill=pal['accent'])
                cur_y += int(height * 0.020)

                sub_px = max(18, int(width * 0.030))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, in_w)[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((margin_x, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)
                return canvas

            # 4) highlight_hook: Top Dark Headline Banner + Bottom 68% Visual with Floating Caption Bar
            if tpl_key == 'highlight_hook':
                canvas = Image.new('RGBA', (width, height), (20, 23, 20, 255))
                top_banner_h = int(height * 0.31)
                bot_h = height - top_banner_h
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (width, bot_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                canvas.paste(photo_crop, (0, top_banner_h))

                draw = ImageDraw.Draw(canvas)
                # Neon Lime Accent Strip at boundary
                draw.rectangle([0, top_banner_h - 4, width, top_banner_h + 2], fill=pal['accent'])

                # Top Header Banner Content
                cur_y = int(height * 0.038)
                in_w = width - margin_x * 2
                nf = _load_korean_font(max(15, int(width * 0.023)), bold=True, style='sans', weight=800)
                pill_str = f'KEY POINT {point_num:02d}'
                nb = draw.textbbox((0, 0), pill_str, font=nf)
                pw, ph = (nb[2] - nb[0]) + 24, (nb[3] - nb[1]) + 12
                draw.rounded_rectangle([margin_x, cur_y, margin_x + pw, cur_y + ph], radius=6, fill=pal['accent'])
                draw.text((margin_x + 12, cur_y + 6 - nb[1]), pill_str, font=nf, fill=pal['accent_txt'])

                pg_s = f'{s_idx:02d}/{s_tot:02d}'
                pg_b = draw.textbbox((0, 0), pg_s, font=nf)
                draw.text((width - margin_x - (pg_b[2] - pg_b[0]), cur_y + 4), pg_s, font=nf, fill=(190, 200, 190, 230))
                cur_y += ph + int(height * 0.020)

                head_px = max(29, int(width * 0.050))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, in_w)[:2]:
                    _draw_segmented_line(draw, ln, margin_x, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                # Floating Dark Caption Box over Bottom of Photo
                cap_x0, cap_x1 = margin_x, width - margin_x
                cap_y1 = height - int(height * 0.045)
                cap_y0 = height - int(height * 0.235)
                draw.rounded_rectangle([cap_x0, cap_y0, cap_x1, cap_y1], radius=int(width * 0.025), fill=(18, 22, 18, 236), outline=pal['accent'], width=2)

                sub_px = max(18, int(width * 0.029))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                cy_sub = cap_y0 + int(height * 0.026)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, (cap_x1 - cap_x0) - int(width * 0.08))[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((cap_x0 + int(width * 0.04), cy_sub - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cy_sub += (sb[3] - sb[1]) + int(sub_px * 0.34)
                return canvas

            # 5) mint_modern: Minimal Curation Book Layout (Dark Slate Canvas + Framed Center Photo + Left Vertical Rule & Curation Note)
            if tpl_key == 'mint_modern':
                canvas = Image.new('RGBA', (width, height), (16, 21, 26, 255))
                draw = ImageDraw.Draw(canvas)
                top_y = int(height * 0.045)
                hf = _load_korean_font(max(14, int(width * 0.021)), bold=True, style='sans', weight=700)
                draw.text((margin_x, top_y), f'CURATION NOTE · {point_num:02d}', font=hf, fill=(200, 212, 224, 240))
                pg_str = f'{s_idx:02d} — {s_tot:02d}'
                pg_b = draw.textbbox((0, 0), pg_str, font=hf)
                draw.text((width - margin_x - (pg_b[2] - pg_b[0]), top_y), pg_str, font=hf, fill=(160, 175, 190, 220))

                ph_w = width - margin_x * 2
                ph_h = int(height * 0.49)
                ph_y = top_y + int(height * 0.042)
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (ph_w, ph_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                pmask = Image.new('L', (ph_w, ph_h), 0)
                ImageDraw.Draw(pmask).rounded_rectangle([0, 0, ph_w, ph_h], radius=int(width * 0.020), fill=255)
                canvas.paste(photo_crop, (margin_x, ph_y), pmask)

                # Bottom Quote-Style Left Vertical Rule + Typography
                cur_y = ph_y + ph_h + int(height * 0.040)
                rule_x = margin_x + 6
                draw.rectangle([rule_x, cur_y, rule_x + 4, height - int(height * 0.065)], fill=(255, 255, 255, 230))
                tx_x = margin_x + int(width * 0.042)
                tx_w = width - margin_x - tx_x

                head_px = max(29, int(width * 0.050))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, tx_w)[:2]:
                    _draw_segmented_line(draw, ln, tx_x, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                cur_y += int(height * 0.016)
                sub_px = max(18, int(width * 0.029))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, tx_w)[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((tx_x, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)
                return canvas

            # 6) warm_luxury: Polaroid & Grid Journal Note (Warm Cream Grid Paper + White Polaroid Frame with Tape + Serif Note)
            if tpl_key == 'warm_luxury':
                canvas = Image.new('RGBA', (width, height), (242, 237, 228, 255))
                draw = ImageDraw.Draw(canvas)
                step_g = max(28, int(width * 0.045))
                for gx in range(0, width, step_g):
                    draw.line([(gx, 0), (gx, height)], fill=(216, 208, 196, 120), width=1)
                for gy in range(0, height, step_g):
                    draw.line([(0, gy), (width, gy)], fill=(216, 208, 196, 120), width=1)

                # Polaroid White Card Container
                pol_x0, pol_x1 = margin_x, width - margin_x
                pol_y0, pol_y1 = int(height * 0.065), height - int(height * 0.055)
                shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
                ImageDraw.Draw(shadow).rounded_rectangle([pol_x0 + 4, pol_y0 + 10, pol_x1 + 4, pol_y1 + 10], radius=12, fill=(40, 32, 22, 48))
                canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(radius=10)))
                draw = ImageDraw.Draw(canvas)
                draw.rounded_rectangle([pol_x0, pol_y0, pol_x1, pol_y1], radius=10, fill=(252, 250, 246, 255), outline=(196, 184, 168, 180), width=2)

                # Masking Tape Accent at Top Center
                tape_w, tape_h = int(width * 0.22), int(height * 0.032)
                tx0 = (width - tape_w) // 2
                ty0 = pol_y0 - tape_h // 2
                draw.rectangle([tx0, ty0, tx0 + tape_w, ty0 + tape_h], fill=(224, 210, 184, 215), outline=(196, 180, 154, 140), width=1)

                # Inner Photo inside Polaroid
                pad_p = int(width * 0.042)
                ph_x0, ph_y0 = pol_x0 + pad_p, pol_y0 + pad_p
                ph_w = (pol_x1 - pol_x0) - pad_p * 2
                ph_h = int(height * 0.44)
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (ph_w, ph_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                canvas.paste(photo_crop, (ph_x0, ph_y0))
                draw.rectangle([ph_x0, ph_y0, ph_x0 + ph_w, ph_y0 + ph_h], outline=(180, 168, 152, 160), width=1)

                # Journal Note Typography inside lower Polaroid margin
                cur_y = ph_y0 + ph_h + int(height * 0.028)
                kf = _load_korean_font(max(15, int(width * 0.022)), bold=True, style='sans', weight=800)
                note_lbl = f'ARCHIVE NOTE #{point_num:02d}  ·  {sub_badge}'
                draw.text((ph_x0, cur_y), note_lbl, font=kf, fill=(124, 96, 68, 255))
                cur_y += int(height * 0.034)

                head_px = max(28, int(width * 0.048))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, ph_w)[:2]:
                    _draw_segmented_line(draw, ln, ph_x0, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                cur_y += int(height * 0.014)
                sub_px = max(17, int(width * 0.028))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, ph_w)[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((ph_x0, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)
                return canvas

            # 7) neon_pop: Modern Insight Window Card (Blurred Background + Crisp White UI Window with Header Bar + Embedded Photo + Pill Tag)
            if tpl_key == 'neon_pop':
                bg_blur = ImageOps.fit(pil_rgba.convert('RGB'), (width, height), method=Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(radius=20)).convert('RGBA')
                canvas = Image.alpha_composite(bg_blur, Image.new('RGBA', (width, height), (14, 20, 34, 135)))

                win_x0, win_x1 = margin_x, width - margin_x
                win_y0, win_y1 = int(height * 0.055), height - int(height * 0.055)
                win_r = int(width * 0.036)
                shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
                ImageDraw.Draw(shadow).rounded_rectangle([win_x0 + 4, win_y0 + 12, win_x1 + 4, win_y1 + 12], radius=win_r, fill=(0, 0, 0, 105))
                canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(radius=14)))

                draw = ImageDraw.Draw(canvas)
                draw.rounded_rectangle([win_x0, win_y0, win_x1, win_y1], radius=win_r, fill=(255, 255, 255, 252), outline=pal['card_border'], width=2)

                # Top UI Window Bar
                bar_h = int(height * 0.055)
                draw.rounded_rectangle([win_x0, win_y0, win_x1, win_y0 + bar_h], radius=win_r, fill=(241, 245, 249, 255))
                draw.rectangle([win_x0, win_y0 + bar_h // 2, win_x1, win_y0 + bar_h], fill=(241, 245, 249, 255))
                draw.line([(win_x0, win_y0 + bar_h), (win_x1, win_y0 + bar_h)], fill=(226, 232, 240, 255), width=2)
                bf = _load_korean_font(max(14, int(width * 0.021)), bold=True, style='sans', weight=800)
                draw.text((win_x0 + int(width * 0.04), win_y0 + int(bar_h * 0.28)), f'INSIGHT {point_num:02d}  ·  {sub_badge}', font=bf, fill=pal['accent'])

                # Embedded Rounded Photo inside Window
                pad_w = int(width * 0.04)
                ph_x0 = win_x0 + pad_w
                ph_y0 = win_y0 + bar_h + int(height * 0.022)
                ph_w = (win_x1 - win_x0) - pad_w * 2
                ph_h = int(height * 0.42)
                photo_crop = ImageOps.fit(pil_rgba.convert('RGB'), (ph_w, ph_h), method=Image.Resampling.LANCZOS).convert('RGBA')
                pmask = Image.new('L', (ph_w, ph_h), 0)
                ImageDraw.Draw(pmask).rounded_rectangle([0, 0, ph_w, ph_h], radius=int(width * 0.022), fill=255)
                canvas.paste(photo_crop, (ph_x0, ph_y0), pmask)

                cur_y = ph_y0 + ph_h + int(height * 0.028)
                head_px = max(28, int(width * 0.049))
                head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
                for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, ph_w)[:2]:
                    _draw_segmented_line(draw, ln, ph_x0, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                    lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                    cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

                cur_y += int(height * 0.014)
                sub_px = max(17, int(width * 0.028))
                sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
                for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, ph_w)[:3]:
                    sb = draw.textbbox((0, 0), sln, font=sub_font)
                    draw.text((ph_x0, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                    cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)
                return canvas

            # 8) minimal_outline (Default fallback): Full-Bleed Serif Essay Poster (No Card Box — Full-Bleed Photo + Smooth Bottom Scrim + Fine Editorial Rules + Serif Copy)
            canvas = pil_rgba.copy()
            scrim = np.zeros((height, width, 4), dtype=np.uint8)
            bot_start = int(height * 0.32)
            bot_h = height - bot_start
            by = np.arange(bot_h, dtype=np.float32)
            scrim[bot_start:, :, 0] = 10
            scrim[bot_start:, :, 1] = 12
            scrim[bot_start:, :, 2] = 10
            scrim[bot_start:, :, 3] = np.clip(((by / max(1.0, float(bot_h))) ** 1.2) * 238, 0, 255).astype(np.uint8)[:, None]
            canvas = Image.alpha_composite(canvas, Image.fromarray(scrim, mode='RGBA'))

            draw = ImageDraw.Draw(canvas)
            _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, pal['accent'], dark_mode=True)

            # Fine editorial frame border
            frame_pad = int(width * 0.042)
            draw.rectangle([frame_pad, frame_pad, width - frame_pad, height - frame_pad], outline=(255, 232, 132, 95), width=1)

            in_x = margin_x + int(width * 0.02)
            in_w = width - in_x * 2
            cur_y = int(height * 0.57)

            idx_f = _load_korean_font(max(24, int(width * 0.042)), bold=True, style='serif', weight=800)
            draw.text((in_x, cur_y), f'{point_num:02d}.  {sub_badge}', font=idx_f, fill=pal['accent'])
            cur_y += int(height * 0.046)
            draw.line([(in_x, cur_y), (in_x + int(width * 0.14), cur_y)], fill=pal['accent'], width=2)
            cur_y += int(height * 0.024)

            head_px = max(32, int(width * 0.054))
            head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
            for ln in _wrap_korean_editorial_lines(draw, headline_raw, head_font, in_w)[:2]:
                _draw_segmented_line(draw, ln, in_x, cur_y, head_font, fill_rgba=pal['head_col'], accent_rgba=pal['accent'], accent_text_rgba=pal['accent_txt'], stroke_w=u_stroke_w, stroke_rgba=u_stroke_rgba, double_stroke_w=u_double_w, double_stroke_rgba=u_double_rgba)
                lb = draw.textbbox((0, 0), re.sub(r'[\[\]\*]', '', ln), font=head_font)
                cur_y += (lb[3] - lb[1]) + int(head_px * 0.36)

            cur_y += int(height * 0.016)
            sub_px = max(18, int(width * 0.030))
            sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
            for sln in _wrap_korean_editorial_lines(draw, body_copy, sub_font, in_w)[:3]:
                sb = draw.textbbox((0, 0), sln, font=sub_font)
                draw.text((in_x, cur_y - sb[1]), sln, font=sub_font, fill=pal['sub_col'])
                cur_y += (sb[3] - sb[1]) + int(sub_px * 0.34)
            return canvas

        # ---------- ROLE = CTA (마지막 요약·결론·행동유도 슬라이드: 썸네일 서클 + 핵심 체크 요약 + 하단 대형 CTA 버튼) ----------
        bg_blur = ImageOps.fit(pil_rgba.convert('RGB'), (width, height), method=Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(radius=18)).convert('RGBA')
        tint = Image.new('RGBA', (width, height), (8, 10, 16, 155) if is_dark else (235, 232, 225, 145))
        canvas = Image.alpha_composite(bg_blur, tint)

        card_w = int(width * 0.86)
        card_h = int(height * 0.82)
        cx0 = (width - card_w) // 2
        cy0 = (height - card_h) // 2
        card_r = int(width * 0.045)

        shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([cx0 + 4, cy0 + 14, cx0 + card_w + 4, cy0 + card_h + 14], radius=card_r, fill=(0, 0, 0, 115))
        canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(radius=16)))

        draw = ImageDraw.Draw(canvas)
        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, pal['accent'], dark_mode=True)
        draw.rounded_rectangle([cx0, cy0, cx0 + card_w, cy0 + card_h], radius=card_r, fill=pal['card_bg'], outline=pal['card_border'], width=2)

        cur_y = cy0 + int(card_h * 0.055)
        # Top circular/rounded hero thumbnail of the source frame
        thumb_w = int(card_w * 0.78)
        thumb_h = int(card_h * 0.34)
        tx0 = (width - thumb_w) // 2
        ty0 = cur_y
        hero_crop = ImageOps.fit(pil_rgba.convert('RGB'), (thumb_w, thumb_h), method=Image.Resampling.LANCZOS).convert('RGBA')
        hmask = Image.new('L', (thumb_w, thumb_h), 0)
        ImageDraw.Draw(hmask).rounded_rectangle([0, 0, thumb_w, thumb_h], radius=int(width * 0.030), fill=255)
        canvas.paste(hero_crop, (tx0, ty0), hmask)

        draw = ImageDraw.Draw(canvas)
        # Summary / CTA Kicker Pill overlapping bottom of hero photo
        cta_badge = badge_str if (badge_str and badge_str != 'SUMMARY · CTA') else 'FINAL SUMMARY · 핵심 요약'
        bf = _load_korean_font(max(15, int(width * 0.024)), bold=True, style='sans', weight=800)
        bb = draw.textbbox((0, 0), cta_badge, font=bf)
        bw, bh = bb[2] - bb[0], bb[3] - bb[1]
        pw_pill = bw + 36
        ph_pill = bh + 16
        px0 = (width - pw_pill) // 2
        py0 = ty0 + thumb_h - ph_pill // 2
        draw.rounded_rectangle([px0, py0, px0 + pw_pill, py0 + ph_pill], radius=ph_pill // 2, fill=pal['accent'])
        draw.text((px0 + 18, py0 + 8 - bb[1]), cta_badge, font=bf, fill=pal['accent_txt'])

        cur_y = py0 + ph_pill + int(card_h * 0.042)
        in_w = int(card_w * 0.84)

        # Center Headline
        head_px = max(30, int(width * 0.052))
        head_font = _load_korean_font(head_px, bold=True, style=font_style, weight=800)
        h_lines = _wrap_korean_editorial_lines(draw, clean_headline, head_font, in_w)[:2]
        for ln in h_lines:
            hb = draw.textbbox((0, 0), ln, font=head_font)
            hw = hb[2] - hb[0]
            _draw_double_stroke_text(draw, ((width - hw) // 2, cur_y - hb[1]), ln, font=head_font, fill_rgba=pal['head_col'], inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
            cur_y += (hb[3] - hb[1]) + int(head_px * 0.22)

        cur_y += int(card_h * 0.024)
        # Checkmark summary box
        sub_px = max(18, int(width * 0.029))
        sub_font = _load_korean_font(sub_px, bold=False, style=sub_font_style, weight=500)
        summary_body = clean_sub or '시간 아껴주는 핵심 요약 완료! 지금 바로 확인해 보세요.'
        s_lines = _wrap_korean_editorial_lines(draw, summary_body, sub_font, in_w - 24)[:3]
        for sln in s_lines:
            chk_ln = sln if sln.startswith(('✓', '✔', '•', '-')) else f'• {sln}'
            sb = draw.textbbox((0, 0), chk_ln, font=sub_font)
            sw = sb[2] - sb[0]
            draw.text(((width - sw) // 2, cur_y - sb[1]), chk_ln, font=sub_font, fill=pal['sub_col'])
            cur_y += (sb[3] - sb[1]) + int(sub_px * 0.36)

        # Bottom Action CTA Pill Bar inside card
        cta_btn_h = int(card_h * 0.088)
        cta_btn_w = int(card_w * 0.84)
        cb_x0 = (width - cta_btn_w) // 2
        cb_y0 = cy0 + card_h - int(card_h * 0.052) - cta_btn_h
        draw.rounded_rectangle([cb_x0, cb_y0, cb_x0 + cta_btn_w, cb_y0 + cta_btn_h], radius=cta_btn_h // 2, fill=pal['accent'])
        cf = _load_korean_font(max(17, int(width * 0.027)), bold=True, style='sans', weight=800)
        cb_txt = pal['cta_pill']
        cbb = draw.textbbox((0, 0), cb_txt, font=cf)
        draw.text(((width - (cbb[2] - cbb[0])) // 2, cb_y0 + (cta_btn_h - (cbb[3] - cbb[1])) // 2 - cbb[1]), cb_txt, font=cf, fill=pal['accent_txt'])

        return canvas

    # =========================================================================
    # ROLE = COVER (1번 메인 표지 8종 Canva 1:1 오리지널 포스터 레이아웃)
    # =========================================================================
    # LAYOUT 1: CINEMA REVIEW (`editorial_dark`) — Exact 1:1 "movie review / 라라나 영화처럼"
    if layout_mode == 'cinema_review':
        canvas = pil_rgba.copy()
        scrim = np.zeros((height, width, 4), dtype=np.uint8)
        bot_start = int(height * 0.44)
        bot_h = height - bot_start
        by = np.arange(bot_h, dtype=np.float32)
        scrim[bot_start:, :, 0] = 6
        scrim[bot_start:, :, 1] = 8
        scrim[bot_start:, :, 2] = 6
        scrim[bot_start:, :, 3] = np.clip(((by / max(1.0, float(bot_h))) ** 1.15) * 248, 0, 255).astype(np.uint8)[:, None]
        canvas = Image.alpha_composite(canvas, Image.fromarray(scrim, mode='RGBA'))
        draw = ImageDraw.Draw(canvas)

        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (234, 88, 72, 255), dark_mode=True)

        kicker_px = max(20, int(width * 0.038))
        kicker_font = _load_korean_font(kicker_px, bold=True, style='sans', weight=800)
        head_px = max(38, int(width * 0.078))
        head_font = _load_korean_font(head_px, bold=True, style=user_fam or 'sans', weight=900)
        star_px = max(22, int(width * 0.042))
        star_font = _load_korean_font(star_px, bold=True, style='sans', weight=800)
        sub_px = max(15, int(width * 0.025))
        sub_font = _load_korean_font(sub_px, bold=True, style=user_fam or 'sans', weight=600)

        max_w = width - margin_x * 2
        h_lines = _wrap_korean_editorial_lines(draw, clean_headline, head_font, max_w)[:2]
        s_lines = []
        if clean_sub:
            for raw_s in clean_sub.split('\n'):
                if raw_s.strip():
                    s_lines.extend(_wrap_korean_editorial_lines(draw, raw_s.strip(), sub_font, max_w + int(sub_px * 3)))
        s_lines = s_lines[:4]

        # Position at lower left (adjust start height slightly if 3+ sub lines are present)
        cur_y = int(height * (0.58 if len(s_lines) >= 3 else 0.64))
        kicker_txt = badge_str.lower() if (badge_str and badge_str.isascii()) else (badge_str or 'movie review')
        kb = draw.textbbox((0, 0), kicker_txt, font=kicker_font)
        kw, kh = kb[2] - kb[0], kb[3] - kb[1]
        # Dark rounded pill behind coral red "movie review" text
        draw.rounded_rectangle(
            [margin_x - 4, cur_y, margin_x + kw + 28, cur_y + kh + 18],
            radius=10,
            fill=(16, 18, 16, 235),
        )
        draw.text((margin_x + 12, cur_y + 9 - kb[1]), kicker_txt, font=kicker_font, fill=(238, 86, 70, 255))
        cur_y += kh + int(height * 0.026)

        for ln in h_lines:
            hb = draw.textbbox((0, 0), ln, font=head_font)
            _draw_double_stroke_text(draw, (margin_x, cur_y - hb[1]), ln, font=head_font, fill_rgba=(255, 255, 255, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
            cur_y += (hb[3] - hb[1]) + int(head_px * 0.18)

        cur_y += int(height * 0.010)
        sb = draw.textbbox((0, 0), '★★★★★', font=star_font)
        draw.text((margin_x, cur_y - sb[1]), '★★★★★', font=star_font, fill=(250, 202, 34, 255))
        cur_y += (sb[3] - sb[1]) + int(height * 0.018)

        for idx_s, sln in enumerate(s_lines):
            sub_b = draw.textbbox((0, 0), sln, font=sub_font)
            s_col = (248, 250, 252, 250) if idx_s == 0 else (203, 213, 225, 235)
            draw.text((margin_x, cur_y - sub_b[1]), sln, font=sub_font, fill=s_col)
            cur_y += (sub_b[3] - sub_b[1]) + int(sub_px * 0.36)

        return canvas

    # =========================================================================
    # LAYOUT 2: NEW YORK EDITORIAL POSTER (`magazine_gradient`) — Exact 1:1 "New York / 내가 사랑한 영화 속 명장면 | 뉴욕 필수 코스 3곳"
    # =========================================================================
    if layout_mode == 'editorial_poster':
        canvas = pil_rgba.copy()
        scrim = np.zeros((height, width, 4), dtype=np.uint8)
        bot_start = int(height * 0.50)
        bot_h = height - bot_start
        by = np.arange(bot_h, dtype=np.float32)
        scrim[bot_start:, :, 0] = 6
        scrim[bot_start:, :, 1] = 8
        scrim[bot_start:, :, 2] = 14
        scrim[bot_start:, :, 3] = np.clip(((by / max(1.0, float(bot_h))) ** 1.2) * 238, 0, 255).astype(np.uint8)[:, None]
        canvas = Image.alpha_composite(canvas, Image.fromarray(scrim, mode='RGBA'))
        draw = ImageDraw.Draw(canvas)

        # Top-left handle + extended thin horizontal line across top
        handle_font = _load_korean_font(max(13, int(width * 0.020)), bold=False, style='sans', weight=400)
        handle_txt = '@reallygreatsite'
        hb = draw.textbbox((0, 0), handle_txt, font=handle_font)
        hy = int(height * 0.056)
        draw.text((margin_x, hy - hb[1]), handle_txt, font=handle_font, fill=(255, 255, 255, 215))
        line_x0 = margin_x + (hb[2] - hb[0]) + 18
        line_y = hy + (hb[3] - hb[1]) // 2
        draw.line([(line_x0, line_y), (width - margin_x, line_y)], fill=(255, 255, 255, 165), width=1)

        # Giant Title-Case "New York" serif display across upper sky (y ~ 18%)
        en_title = badge_str if (badge_str and badge_str.isascii() and badge_str.upper() not in ('MAIN COVER', 'POINT 01', 'POINT 02', 'POINT 03', 'SUMMARY · CTA')) else 'New York'
        disp_px = max(68, int(width * 0.175))
        disp_font = _load_korean_font(disp_px, bold=False, style='display_en')
        db = draw.textbbox((0, 0), en_title, font=disp_font)
        dw = db[2] - db[0]
        max_disp_w = int(width * 0.86)
        while dw > max_disp_w and disp_px > 32:
            disp_px = max(32, int(disp_px * 0.90))
            disp_font = _load_korean_font(disp_px, bold=False, style='display_en')
            db = draw.textbbox((0, 0), en_title, font=disp_font)
            dw = db[2] - db[0]
        disp_y = int(height * 0.175)
        draw.text(((width - dw) // 2, disp_y - db[1]), en_title, font=disp_font, fill=(255, 255, 255, 248))

        # Bottom horizontal line with split Light | Bold Korean headline
        bot_y = int(height * 0.775)
        head_px = max(21, int(width * 0.034))
        light_font = _load_korean_font(head_px, bold=False, style=user_fam or 'sans', weight=300)
        bold_font = _load_korean_font(head_px, bold=True, style=user_fam or 'sans', weight=800)

        if '|' in clean_headline:
            parts = [p.strip() for p in clean_headline.split('|', 1)]
            left_part, right_part = parts[0], parts[1]
        elif '[' in headline_raw and ']' in headline_raw:
            m = re.search(r'\[([^\]]+)\](.*)', headline_raw)
            left_part = m.group(1).strip() if m else clean_headline
            right_part = re.sub(r'[\*\[\]]', '', m.group(2)).strip() if m else ''
        else:
            words = clean_headline.split(' ')
            mid = max(1, len(words) // 2)
            left_part = ' '.join(words[:mid])
            right_part = ' '.join(words[mid:])

        lb = draw.textbbox((0, 0), left_part, font=light_font)
        sep_b = draw.textbbox((0, 0), ' | ', font=light_font)
        rb = draw.textbbox((0, 0), right_part, font=bold_font) if right_part else (0, 0, 0, 0)
        total_tw = (lb[2] - lb[0]) + ((sep_b[2] - sep_b[0]) + (rb[2] - rb[0]) if right_part else 0)
        tx0 = max(margin_x + 24, (width - total_tw) // 2)
        th = max(lb[3] - lb[1], rb[3] - rb[1])
        mid_line_y = bot_y + th // 2

        if tx0 > margin_x + 12:
            draw.line([(margin_x, mid_line_y), (tx0 - 14, mid_line_y)], fill=(255, 255, 255, 175), width=1)
        cur_tx = tx0
        _draw_double_stroke_text(draw, (cur_tx, bot_y - lb[1]), left_part, font=light_font, fill_rgba=(240, 244, 250, 245), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
        cur_tx += (lb[2] - lb[0])
        if right_part:
            draw.text((cur_tx, bot_y - sep_b[1]), ' | ', font=light_font, fill=(255, 255, 255, 180))
            cur_tx += (sep_b[2] - sep_b[0])
            _draw_double_stroke_text(draw, (cur_tx, bot_y - rb[1]), right_part, font=bold_font, fill_rgba=(255, 255, 255, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
            cur_tx += (rb[2] - rb[0])
        if cur_tx + 14 < width - margin_x:
            draw.line([(cur_tx + 14, mid_line_y), (width - margin_x, mid_line_y)], fill=(255, 255, 255, 175), width=1)

        if clean_sub:
            sub_px = max(13, int(width * 0.021))
            sub_font = _load_korean_font(sub_px, bold=False, style=user_fam or 'sans', weight=300)
            s_lines = []
            for raw_s in clean_sub.split('\n'):
                if raw_s.strip():
                    s_lines.extend(_wrap_korean_editorial_lines(draw, raw_s.strip(), sub_font, width - margin_x * 2 - 40))
            s_lines = s_lines[:3]
            sy = bot_y + th + int(height * 0.024)
            for sln in s_lines:
                sb = draw.textbbox((0, 0), sln, font=sub_font)
                sw = sb[2] - sb[0]
                draw.text(((width - sw) // 2, sy - sb[1]), sln, font=sub_font, fill=(200, 208, 222, 225))
                sy += (sb[3] - sb[1]) + 8

        return canvas

    # =========================================================================
    # LAYOUT 3: FLY TO SEOUL ROUNDED CARD (`clean_white`) — Exact 1:1 "한국인을 위한 한국여행 / FLY TO SEOUL"
    # =========================================================================
    if layout_mode == 'framed_ticket':
        # Full blurred background of the source photo
        bg_blur = ImageOps.fit(pil_rgba.convert('RGB'), (width, height), method=Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(radius=22)).convert('RGBA')
        canvas = bg_blur.copy()

        # Centered vertical white rounded card (width=64%, height=84%)
        card_w = int(width * 0.64)
        card_h = int(height * 0.84)
        cx0 = (width - card_w) // 2
        cy0 = (height - card_h) // 2
        card_r = int(width * 0.045)

        shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([cx0 + 4, cy0 + 12, cx0 + card_w + 4, cy0 + card_h + 12], radius=card_r, fill=(0, 0, 0, 95))
        canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(radius=16)))

        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle([cx0, cy0, cx0 + card_w, cy0 + card_h], radius=card_r, fill=(252, 252, 250, 255))

        # Inner rounded photo inside upper 62% of the white card
        in_pad = int(card_w * 0.065)
        px0 = cx0 + in_pad
        py0 = cy0 + in_pad
        pw = card_w - in_pad * 2
        ph = int(card_h * 0.62)
        in_r = int(card_w * 0.05)

        inner_photo = ImageOps.fit(pil_rgba.convert('RGB'), (pw, ph), method=Image.Resampling.LANCZOS).convert('RGBA')
        top_scrim = np.zeros((ph, pw, 4), dtype=np.uint8)
        th_s = int(ph * 0.42)
        ty = np.arange(th_s, dtype=np.float32)
        top_scrim[:th_s, :, 0] = 20
        top_scrim[:th_s, :, 1] = 45
        top_scrim[:th_s, :, 2] = 95
        top_scrim[:th_s, :, 3] = np.clip((1.0 - ty / max(1.0, float(th_s))) ** 1.4 * 125, 0, 255).astype(np.uint8)[:, None]
        inner_photo = Image.alpha_composite(inner_photo, Image.fromarray(top_scrim, mode='RGBA'))

        idraw = ImageDraw.Draw(inner_photo)
        top_kr_px = max(20, int(card_w * 0.058))
        top_kr_font = _load_korean_font(top_kr_px, bold=True, style=user_fam or 'sans', weight=700)
        if '|' in text:
            top_part, bot_part = [p.strip() for p in text.split('|', 1)]
        elif len(explicit_lines) >= 3:
            top_part = '\n'.join(explicit_lines[:2])
            bot_part = '\n'.join(explicit_lines[2:])
        else:
            top_part = clean_headline
            bot_part = clean_sub
        top_lines = [re.sub(r'[\[\]\*]', '', ln).strip() for ln in top_part.split('\n') if ln.strip()]
        if len(top_lines) == 1 and ' ' in top_lines[0]:
            w_parts = top_lines[0].split(' ')
            top_lines = [' '.join(w_parts[:-1]), w_parts[-1]] if len(w_parts) >= 2 else top_lines
        ty_cur = int(ph * 0.065)
        for tln in top_lines[:2]:
            tb = idraw.textbbox((0, 0), tln, font=top_kr_font)
            _draw_double_stroke_text(idraw, (int(pw * 0.07), ty_cur - tb[1]), tln, font=top_kr_font, fill_rgba=(255, 255, 255, 250), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
            ty_cur += (tb[3] - tb[1]) + 8

        pmask = Image.new('L', (pw, ph), 0)
        ImageDraw.Draw(pmask).rounded_rectangle([0, 0, pw, ph], radius=in_r, fill=255)
        canvas.paste(inner_photo, (px0, py0), pmask)

        draw = ImageDraw.Draw(canvas)
        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (52, 84, 152, 255), dark_mode=True)

        # Bottom white area inside card: "FLY TO" + big "SEOUL" + 2 lines Korean subtext
        bot_top = py0 + ph + int(card_h * 0.032)
        kicker_en = badge_str if (badge_str and badge_str.isascii() and badge_str.upper() not in ('MAIN COVER', 'POINT 01', 'POINT 02', 'POINT 03')) else 'FLY TO'
        main_en = 'SEOUL'
        if ' ' in kicker_en and kicker_en.upper().startswith('FLY TO '):
            main_en = kicker_en[7:].strip() or 'SEOUL'
            kicker_en = 'FLY TO'

        kf_en = _load_korean_font(max(16, int(card_w * 0.048)), bold=False, style='sans_cond_en')
        mf_en = _load_korean_font(max(42, int(card_w * 0.145)), bold=False, style='sans_cond_en')
        kb = draw.textbbox((0, 0), kicker_en, font=kf_en)
        draw.text(((width - (kb[2] - kb[0])) // 2, bot_top - kb[1]), kicker_en, font=kf_en, fill=(78, 108, 168, 255))
        bot_top += (kb[3] - kb[1]) + 6

        mb = draw.textbbox((0, 0), main_en, font=mf_en)
        draw.text(((width - (mb[2] - mb[0])) // 2, bot_top - mb[1]), main_en, font=mf_en, fill=(52, 78, 138, 255))
        bot_top += (mb[3] - mb[1]) + int(card_h * 0.028)

        sub_px = max(14, int(card_w * 0.042))
        sub_font = _load_korean_font(sub_px, bold=False, style=user_fam or 'sans', weight=400)
        bot_clean = re.sub(r'[\[\]\*]', '', bot_part or '').strip()
        s_lines = []
        for raw_s in (bot_clean or '전통과 현대가 공존하는\n매력적인 도시, 서울').split('\n'):
            if raw_s.strip():
                s_lines.extend(_wrap_korean_editorial_lines(draw, raw_s.strip(), sub_font, pw - 20))
        for sln in s_lines[:3]:
            sb = draw.textbbox((0, 0), sln, font=sub_font)
            draw.text(((width - (sb[2] - sb[0])) // 2, bot_top - sb[1]), sln, font=sub_font, fill=(108, 116, 128, 255))
            bot_top += (sb[3] - sb[1]) + 6

        return canvas

    # =========================================================================
    # LAYOUT 4: DIAGONAL GEOMETRIC SPLIT (`highlight_hook`) — Exact 1:1 "심플하고 깔끔한 카드뉴스 썸네일"
    # =========================================================================
    if layout_mode == 'diagonal_split':
        canvas = pil_rgba.copy()
        overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)

        band_y = int(height * 0.56)
        odraw.rectangle([0, band_y, width, height], fill=(42, 44, 42, 216))
        canvas = Image.alpha_composite(canvas, overlay)
        draw = ImageDraw.Draw(canvas)

        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (174, 238, 54, 255), dark_mode=False)

        cur_y = band_y + int(height * 0.042)
        kicker_str = badge_str if (badge_str and not badge_str.isascii()) else '심플하지만 강력한!!'
        kf = _load_korean_font(max(18, int(width * 0.032)), bold=False, style=user_fam or 'sans', weight=400)
        kb = draw.textbbox((0, 0), kicker_str, font=kf)
        draw.text((margin_x, cur_y - kb[1]), kicker_str, font=kf, fill=(242, 244, 240, 245))
        cur_y += (kb[3] - kb[1]) + int(height * 0.018)

        # Line 1: Bold 800, Line 2: Light 300 (exactly like "심플하고 깔끔한" bold / "카드뉴스 썸네일" light)
        head_px = max(36, int(width * 0.072))
        bold_font = _load_korean_font(head_px, bold=True, style=user_fam or 'sans', weight=800)
        light_font = _load_korean_font(head_px, bold=False, style=user_fam or 'sans', weight=300)

        non_tag_lines = [re.sub(r'[\[\]\*]', '', ln).strip() for ln in explicit_lines if not ln.strip().startswith('#')]
        if len(non_tag_lines) >= 2:
            h_lines = non_tag_lines[:2]
        else:
            h_lines = _wrap_korean_editorial_lines(draw, clean_headline, bold_font, width - margin_x * 2)[:2]
            if len(h_lines) == 1 and ' ' in clean_headline:
                words = clean_headline.split(' ')
                mid = max(1, len(words) // 2)
                h_lines = [' '.join(words[:mid]), ' '.join(words[mid:])]

        for idx_l, ln in enumerate(h_lines):
            f_use = bold_font if idx_l == 0 else light_font
            lb = draw.textbbox((0, 0), ln, font=f_use)
            _draw_double_stroke_text(draw, (margin_x, cur_y - lb[1]), ln, font=f_use, fill_rgba=(255, 255, 255, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
            cur_y += (lb[3] - lb[1]) + int(head_px * 0.16)

        # Render additional body lines if provided
        extra_sub_lines = [re.sub(r'[\[\]\*]', '', ln).strip() for ln in (clean_sub.split('\n') if clean_sub else []) if ln.strip() and not ln.strip().startswith('#')]
        if extra_sub_lines:
            sub_f = _load_korean_font(max(15, int(width * 0.025)), bold=False, style=user_fam or 'sans', weight=500)
            for sln in extra_sub_lines[:2]:
                sb_b = draw.textbbox((0, 0), sln, font=sub_f)
                draw.text((margin_x, cur_y - sb_b[1]), sln, font=sub_f, fill=(215, 224, 215, 240))
                cur_y += (sb_b[3] - sb_b[1]) + 6

        # Bottom row: neon-lime hashtag pills (#깔끔한 #썸네일) on left, "자세히보기 >" on right
        pill_y = height - int(height * 0.088)
        pf = _load_korean_font(max(16, int(width * 0.028)), bold=True, style=user_fam or 'sans', weight=700)
        tags = ['#깔끔한', '#썸네일']
        if clean_sub:
            extracted_tags = [w for w in clean_sub.split() if w.startswith('#')]
            if extracted_tags:
                tags = extracted_tags[:2]
        px_cur = margin_x
        for tg in tags:
            tb = draw.textbbox((0, 0), tg, font=pf)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
            ph_pill = th + 20
            pw_pill = tw + 36
            draw.rounded_rectangle([px_cur, pill_y, px_cur + pw_pill, pill_y + ph_pill], radius=ph_pill // 2, fill=(176, 242, 54, 255))
            draw.text((px_cur + 18, pill_y + 10 - tb[1]), tg, font=pf, fill=(22, 28, 16, 255))
            px_cur += pw_pill + 14

        stxt = '자세히보기  ›'
        sf = _load_korean_font(max(15, int(width * 0.025)), bold=False, style='sans', weight=500)
        sb = draw.textbbox((0, 0), stxt, font=sf)
        draw.text((width - margin_x - (sb[2] - sb[0]), pill_y + 10 - sb[1]), stxt, font=sf, fill=(240, 244, 240, 235))
        return canvas

    # =========================================================================
    # LAYOUT 5: WORKSPACE CURATION (`mint_modern`) — Exact 1:1 "Curator Pick / 집중과 영감을 위한 / 워크스페이스"
    # =========================================================================
    if layout_mode == 'workspace_magazine':
        canvas = pil_rgba.copy()
        scrim = np.zeros((height, width, 4), dtype=np.uint8)
        top_h = int(height * 0.46)
        ty = np.arange(top_h, dtype=np.float32)
        scrim[:top_h, :, 0] = 8
        scrim[:top_h, :, 1] = 10
        scrim[:top_h, :, 2] = 12
        scrim[:top_h, :, 3] = np.clip((1.0 - ty / max(1.0, float(top_h))) ** 1.3 * 205, 0, 255).astype(np.uint8)[:, None]

        bot_start = int(height * 0.64)
        bot_h = height - bot_start
        by = np.arange(bot_h, dtype=np.float32)
        scrim[bot_start:, :, 0] = 8
        scrim[bot_start:, :, 1] = 10
        scrim[bot_start:, :, 2] = 12
        scrim[bot_start:, :, 3] = np.clip(((by / max(1.0, float(bot_h))) ** 1.3) * 215, 0, 255).astype(np.uint8)[:, None]
        canvas = Image.alpha_composite(canvas, Image.fromarray(scrim, mode='RGBA'))
        draw = ImageDraw.Draw(canvas)

        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (255, 255, 255, 255), dark_mode=True)

        # Top-left white pill "Curator Pick"
        cur_y = int(height * 0.088)
        kicker_str = badge_str if (badge_str and badge_str.isascii() and badge_str.upper() not in ('MAIN COVER', 'POINT 01')) else 'Curator Pick'
        kf = _load_korean_font(max(15, int(width * 0.025)), bold=True, style='serif', weight=700)
        kb = draw.textbbox((0, 0), kicker_str, font=kf)
        kw, kh = kb[2] - kb[0], kb[3] - kb[1]
        pill_w = kw + 48
        pill_h = kh + 20
        draw.rounded_rectangle([margin_x, cur_y, margin_x + pill_w, cur_y + pill_h], radius=pill_h // 2, fill=(255, 255, 255, 250))
        draw.text((margin_x + 24, cur_y + 10 - kb[1]), kicker_str, font=kf, fill=(16, 18, 22, 255))
        cur_y += pill_h + int(height * 0.042)

        # Line 1: Thin/Light smaller Korean ("집중과 영감을 위한"), Line 2: Giant Bold Korean ("워크스페이스")
        if ' ' in clean_headline:
            words = clean_headline.split(' ')
            if len(words) >= 2:
                line1_txt = ' '.join(words[:-1])
                line2_txt = words[-1]
            else:
                line1_txt = '집중과 영감을 위한'
                line2_txt = clean_headline
        else:
            line1_txt = '집중과 영감을 위한'
            line2_txt = clean_headline

        f_top_sub = _load_korean_font(max(26, int(width * 0.048)), bold=False, style=user_fam or 'sans', weight=300)
        f_top_main = _load_korean_font(max(50, int(width * 0.098)), bold=True, style=user_fam or 'sans', weight=800)

        b1 = draw.textbbox((0, 0), line1_txt, font=f_top_sub)
        _draw_double_stroke_text(draw, (margin_x, cur_y - b1[1]), line1_txt, font=f_top_sub, fill_rgba=(242, 245, 248, 250), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
        cur_y += (b1[3] - b1[1]) + int(height * 0.015)

        b2 = draw.textbbox((0, 0), line2_txt, font=f_top_main)
        _draw_double_stroke_text(draw, (margin_x, cur_y - b2[1]), line2_txt, font=f_top_main, fill_rgba=(255, 255, 255, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)

        # Bottom-left lines of clean small summary + bottom-right solid white circle with black '»'
        sub_px = max(14, int(width * 0.022))
        sub_font = _load_korean_font(sub_px, bold=False, style=user_fam or 'sans', weight=400)
        s_lines = []
        for raw_s in (clean_sub or '집중과 영감을 돕고 싶은 창작자들을 위한 워크스페이스.\n큐레이터가 직접 다녀온 공간을 소개합니다.').split('\n'):
            if raw_s.strip():
                s_lines.extend(_wrap_korean_editorial_lines(draw, raw_s.strip(), sub_font, int(width * 0.68)))
        s_lines = s_lines[:3]
        sy = height - int(height * 0.088) - len(s_lines) * (sub_px + 8)
        for sln in s_lines:
            sb = draw.textbbox((0, 0), sln, font=sub_font)
            draw.text((margin_x, sy - sb[1]), sln, font=sub_font, fill=(200, 206, 214, 235))
            sy += (sb[3] - sb[1]) + 8

        r = max(20, int(width * 0.028))
        cx, cy = width - margin_x - r, height - int(height * 0.075)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 245))
        aw = max(5, int(r * 0.30))
        for off in (-aw // 2 - 2, aw // 2 + 2):
            draw.line([(cx + off - aw // 2, cy - aw), (cx + off + aw // 2, cy), (cx + off - aw // 2, cy + aw)], fill=(16, 18, 22, 255), width=3)
        return canvas

    # =========================================================================
    # LAYOUT 6: TORN-PAPER COLLAGE (`warm_luxury`) — Exact 1:1 "후지산을 만나는 / 최고의 열차 여행."
    # =========================================================================
    if layout_mode == 'scrapbook_note':
        # Full-bleed photo on the right/background
        canvas = ImageOps.fit(pil_rgba.convert('RGB'), (width, height), method=Image.Resampling.LANCZOS).convert('RGBA')

        # Left vertical torn cream paper strip + two torn horizontal paper title strips
        paper_col = (238, 235, 226, 255)
        edge_shadow_col = (20, 24, 30, 55)

        rng = np.random.default_rng(42)
        left_w = int(width * 0.28)
        ys = np.linspace(0, height, 65, dtype=np.int32)
        xs = left_w + rng.integers(-9, 10, size=len(ys))
        left_poly = [(0, 0)] + [(int(x), int(y)) for x, y in zip(xs, ys)] + [(0, height)]

        shadow_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_layer)
        sdraw.polygon([(x + 6, y + 4) for x, y in left_poly], fill=edge_shadow_col)

        # Two horizontal torn paper strips for the 2-line brush headline
        strip1_box = [int(width * 0.11), int(height * 0.125), int(width * 0.62), int(height * 0.235)]
        strip2_box = [int(width * 0.19), int(height * 0.228), int(width * 0.84), int(height * 0.342)]

        def _torn_rect_pts(x0, y0, x1, y1, seed):
            r_gen = np.random.default_rng(seed)
            top_pts = [(int(x), int(y0 + r_gen.integers(-3, 4))) for x in np.linspace(x0, x1, 18)]
            right_pts = [(int(x1 + r_gen.integers(-6, 7)), int(y)) for y in np.linspace(y0, y1, 8)]
            bot_pts = [(int(x), int(y1 + r_gen.integers(-3, 4))) for x in np.linspace(x1, x0, 18)]
            left_pts = [(int(x0 + r_gen.integers(-6, 7)), int(y)) for y in np.linspace(y1, y0, 8)]
            return top_pts + right_pts + bot_pts + left_pts

        pts1 = _torn_rect_pts(*strip1_box, 101)
        pts2 = _torn_rect_pts(*strip2_box, 202)
        sdraw.polygon([(x + 5, y + 6) for x, y in pts1], fill=edge_shadow_col)
        sdraw.polygon([(x + 5, y + 6) for x, y in pts2], fill=edge_shadow_col)
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=6))
        canvas = Image.alpha_composite(canvas, shadow_layer)

        draw = ImageDraw.Draw(canvas)
        draw.polygon(left_poly, fill=paper_col)
        draw.polygon(pts1, fill=paper_col)
        draw.polygon(pts2, fill=paper_col)

        # Split headline into 2 lines for the 2 torn strips
        words = clean_headline.split(' ')
        if len(words) >= 2:
            mid = max(1, len(words) // 2)
            l1 = ' '.join(words[:mid])
            l2 = ' '.join(words[mid:])
        else:
            l1 = clean_headline
            l2 = (clean_sub.split('\n')[0][:14] if clean_sub else '최고의 감성 여행.')
        if not l2.endswith('.'):
            l2 = l2 + '.'

        brush_px = max(34, int(width * 0.064))
        brush_font = _load_korean_font(brush_px, bold=True, style=user_fam or 'brush_kr')
        b1 = draw.textbbox((0, 0), l1, font=brush_font)
        b2 = draw.textbbox((0, 0), l2, font=brush_font)
        _draw_double_stroke_text(draw, (strip1_box[0] + 24, (strip1_box[1] + strip1_box[3] - (b1[3] - b1[1])) // 2 - b1[1]), l1, font=brush_font, fill_rgba=(20, 18, 16, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
        _draw_double_stroke_text(draw, (strip2_box[0] + 28, (strip2_box[1] + strip2_box[3] - (b2[3] - b2[1])) // 2 - b2[1]), l2, font=brush_font, fill_rgba=(20, 18, 16, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)

        # Render subtitle / body note if present
        if clean_sub:
            note_f = _load_korean_font(max(15, int(width * 0.024)), bold=True, style=user_fam or 'serif')
            note_y = strip2_box[3] + int(height * 0.025)
            for raw_s in clean_sub.split('\n')[:2]:
                if not raw_s.strip():
                    continue
                nb_b = draw.textbbox((0, 0), raw_s.strip()[:34], font=note_f)
                draw.rounded_rectangle([strip1_box[0] + 12, note_y - 4, strip1_box[0] + 28 + (nb_b[2] - nb_b[0]), note_y + (nb_b[3] - nb_b[1]) + 8], radius=6, fill=(248, 245, 238, 232))
                draw.text((strip1_box[0] + 20, note_y - nb_b[1] + 2), raw_s.strip()[:34], font=note_f, fill=(38, 32, 26, 255))
                note_y += (nb_b[3] - nb_b[1]) + 16

        # Bottom two tilted mini Polaroid photos overlapping the torn edge
        def _paste_tilted_polaroid(base_rgba, src_img, box_w, box_h, dst_x, dst_y, angle_deg, crop_box):
            cw, ch = src_img.size
            sub_crop = src_img.crop((int(cw * crop_box[0]), int(ch * crop_box[1]), int(cw * crop_box[2]), int(ch * crop_box[3])))
            pol = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
            pdraw = ImageDraw.Draw(pol)
            pdraw.rounded_rectangle([6, 8, box_w - 2, box_h - 2], radius=6, fill=(0, 0, 0, 65))
            pol = pol.filter(ImageFilter.GaussianBlur(radius=4))
            pdraw = ImageDraw.Draw(pol)
            pdraw.rounded_rectangle([0, 0, box_w - 8, box_h - 8], radius=4, fill=(252, 250, 245, 255), outline=(210, 206, 198, 255), width=2)
            pad = max(8, int(box_w * 0.055))
            iw, ih = box_w - 8 - pad * 2, box_h - 8 - pad * 2 - int(box_h * 0.06)
            fitted = ImageOps.fit(sub_crop.convert('RGB'), (iw, ih), method=Image.Resampling.LANCZOS).convert('RGBA')
            pol.paste(fitted, (pad, pad))
            rot = pol.rotate(angle_deg, expand=True, resample=Image.Resampling.BICUBIC)
            base_rgba.alpha_composite(rot, (dst_x, dst_y))

        _paste_tilted_polaroid(canvas, pil_rgba, int(width * 0.34), int(height * 0.22), int(width * 0.08), int(height * 0.67), 4.5, (0.0, 0.15, 0.75, 0.85))
        _paste_tilted_polaroid(canvas, pil_rgba, int(width * 0.35), int(height * 0.23), int(width * 0.33), int(height * 0.71), -2.5, (0.25, 0.20, 1.0, 0.95))

        draw = ImageDraw.Draw(canvas)
        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (42, 36, 30, 255), dark_mode=False)
        return canvas

    # =========================================================================
    # LAYOUT 7: SOCIAL REVIEW WINDOW (`neon_pop`) — Exact 1:1 "구매 고객 후기 / 차*정 ★★★★★ BEST + 3 Thumbnails"
    # =========================================================================
    if layout_mode == 'social_review_ui':
        bg_photo = ImageOps.fit(pil_rgba.convert('RGB'), (width, height), method=Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(radius=6)).convert('RGBA')
        tint = Image.new('RGBA', (width, height), (18, 20, 24, 48))
        canvas = Image.alpha_composite(bg_photo, tint)

        card_w = int(width * 0.82)
        card_h = int(height * 0.74)
        cx0 = (width - card_w) // 2
        cy0 = (height - card_h) // 2

        # Stacked back window shadow card + drop shadow
        shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([cx0 + 10, cy0 + 18, cx0 + card_w + 14, cy0 + card_h + 18], radius=14, fill=(0, 0, 0, 95))
        canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(radius=14)))

        draw = ImageDraw.Draw(canvas)
        # Offset second white card behind
        draw.rounded_rectangle([cx0 + 10, cy0 + 10, cx0 + card_w + 10, cy0 + card_h + 10], radius=10, fill=(242, 244, 248, 245), outline=(210, 214, 220, 255), width=2)
        # Main front window card
        draw.rounded_rectangle([cx0, cy0, cx0 + card_w, cy0 + card_h], radius=10, fill=(255, 255, 255, 255), outline=(218, 222, 228, 255), width=2)

        bar_h = int(card_h * 0.088)
        draw.line([(cx0, cy0 + bar_h), (cx0 + card_w, cy0 + bar_h)], fill=(230, 234, 240, 255), width=2)

        dot_y = cy0 + bar_h // 2
        dot_r = max(6, int(width * 0.008))
        for i, col in enumerate(((255, 95, 86, 255), (255, 189, 46, 255), (39, 201, 63, 255))):
            dx = cx0 + 26 + i * (dot_r * 3)
            draw.ellipse([dx - dot_r, dot_y - dot_r, dx + dot_r, dot_y + dot_r], fill=col)

        bar_title = badge_str if (badge_str and not badge_str.isascii()) else '구매 고객 후기'
        bf = _load_korean_font(max(15, int(width * 0.023)), bold=True, style='sans', weight=700)
        bb = draw.textbbox((0, 0), bar_title, font=bf)
        draw.text((cx0 + 26 + dot_r * 10, dot_y - (bb[3] - bb[1]) // 2 - bb[1]), bar_title, font=bf, fill=(32, 38, 46, 255))

        # Top-right magnifying glass icon in window header
        qx, qy = cx0 + card_w - 32, dot_y - 2
        qr = max(6, int(width * 0.008))
        draw.ellipse([qx - qr, qy - qr, qx + qr, qy + qr], outline=(90, 98, 110, 255), width=2)
        draw.line([(qx + int(qr * 0.7), qy + int(qr * 0.7)), (qx + int(qr * 1.6), qy + int(qr * 1.6))], fill=(90, 98, 110, 255), width=2)

        in_pad = int(card_w * 0.075)
        ix0 = cx0 + in_pad
        cur_y = cy0 + bar_h + int(card_h * 0.055)

        # User avatar circle silhouette + Stars + BEST pill + Reviewer name "차*정  10.01 작성"
        av_r = int(card_w * 0.058)
        av_cx, av_cy = ix0 + av_r, cur_y + av_r
        draw.ellipse([av_cx - av_r, av_cy - av_r, av_cx + av_r, av_cy + av_r], fill=(42, 46, 52, 255))
        head_r = int(av_r * 0.36)
        draw.ellipse([av_cx - head_r, av_cy - int(av_r * 0.45) - head_r, av_cx + head_r, av_cy - int(av_r * 0.45) + head_r], fill=(255, 255, 255, 255))
        body_r = int(av_r * 0.62)
        draw.pieslice([av_cx - body_r, av_cy + int(av_r * 0.05), av_cx + body_r, av_cy + int(av_r * 1.25)], 180, 360, fill=(255, 255, 255, 255))

        rx0 = ix0 + av_r * 2 + 20
        sf = _load_korean_font(max(18, int(width * 0.028)), bold=True, style='sans', weight=800)
        draw.text((rx0, cur_y), '★★★★★', font=sf, fill=(255, 202, 40, 255))
        sb = draw.textbbox((0, 0), '★★★★★', font=sf)
        best_x = rx0 + (sb[2] - sb[0]) + 12
        best_h = sb[3] - sb[1] + 6
        draw.rounded_rectangle([best_x, cur_y, best_x + 58, cur_y + best_h], radius=best_h // 2, fill=(49, 118, 246, 255))
        tf = _load_korean_font(max(12, int(width * 0.017)), bold=True, style='sans', weight=800)
        tb = draw.textbbox((0, 0), 'BEST', font=tf)
        draw.text((best_x + (58 - (tb[2] - tb[0])) // 2, cur_y + (best_h - (tb[3] - tb[1])) // 2 - tb[1]), 'BEST', font=tf, fill=(255, 255, 255, 255))

        name_f = _load_korean_font(max(20, int(width * 0.032)), bold=True, style='sans', weight=800)
        date_f = _load_korean_font(max(14, int(width * 0.020)), bold=False, style='sans', weight=400)
        name_y = cur_y + best_h + 10
        nb = draw.textbbox((0, 0), '차*정', font=name_f)
        draw.text((rx0, name_y - nb[1]), '차*정', font=name_f, fill=(24, 28, 34, 255))
        draw.text((rx0 + (nb[2] - nb[0]) + 14, name_y + 6), '10.01 작성', font=date_f, fill=(140, 148, 160, 255))

        cur_y = max(av_cy + av_r, name_y + (nb[3] - nb[1])) + int(card_h * 0.048)

        # Product option gray line: "[추천아이템] " + clean_headline
        opt_f = _load_korean_font(max(15, int(width * 0.023)), bold=True, style=user_fam or 'sans', weight=600)
        opt_str = f'[실사용 베스트] {clean_headline}'
        ob = draw.textbbox((0, 0), opt_str, font=opt_f)
        _draw_double_stroke_text(draw, (ix0, cur_y - ob[1]), opt_str, font=opt_f, fill_rgba=(148, 156, 168, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
        cur_y += (ob[3] - ob[1]) + int(card_h * 0.038)

        # Multi-line review paragraph
        body_f = _load_korean_font(max(16, int(width * 0.025)), bold=False, style=user_fam or 'sans', weight=500)
        review_copy = clean_sub or f'{clean_headline} 직접 써보니 디자인이 세련되어 어디에나 잘 어울리고, 가볍고 튼튼해서 매일 손이 갑니다. 품질이 매우 뛰어나 앞으로도 자주 쓸 것 같아요 :)'
        if len(review_copy) < 55:
            review_copy = review_copy + ' 가볍고 편안해서 오래 사용해도 부담이 없고 디테일 완성도가 뛰어나 만족도가 정말 높습니다 :)'
        r_lines = _wrap_korean_editorial_lines(draw, review_copy, body_f, card_w - in_pad * 2)[:4]
        for rln in r_lines:
            rb = draw.textbbox((0, 0), rln, font=body_f)
            draw.text((ix0, cur_y - rb[1]), rln, font=body_f, fill=(42, 48, 58, 255))
            cur_y += (rb[3] - rb[1]) + 10

        # Bottom 3 square product thumbnails in a row
        thumb_gap = 14
        avail_w = card_w - in_pad * 2
        thumb_w = (avail_w - thumb_gap * 2) // 3
        thumb_h = int(thumb_w * 0.92)
        thumb_y = cy0 + card_h - in_pad - thumb_h
        crops = [(0.0, 0.0, 0.75, 0.85), (0.12, 0.08, 0.88, 0.92), (0.25, 0.15, 1.0, 1.0)]
        sw_i, sh_i = pil_rgba.size
        for ti in range(3):
            cbox = crops[ti]
            sub_img = pil_rgba.crop((int(sw_i * cbox[0]), int(sh_i * cbox[1]), int(sw_i * cbox[2]), int(sh_i * cbox[3])))
            fitted = ImageOps.fit(sub_img.convert('RGB'), (thumb_w, thumb_h), method=Image.Resampling.LANCZOS).convert('RGBA')
            tx = ix0 + ti * (thumb_w + thumb_gap)
            canvas.paste(fitted, (tx, thumb_y))

        draw = ImageDraw.Draw(canvas)
        _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (49, 118, 246, 255), dark_mode=True)
        return canvas

    # =========================================================================
    # LAYOUT 8: KOREAN PICNIC SERIF (`minimal_outline`) — Exact 1:1 "여기가 피크닉 맛집!! / 봄에 꼭 가야하는 / 피크닉 명소 / TOP 3"
    # =========================================================================
    canvas = pil_rgba.copy()
    scrim = np.zeros((height, width, 4), dtype=np.uint8)
    top_h = int(height * 0.56)
    ty = np.arange(top_h, dtype=np.float32)
    scrim[:top_h, :, 0] = 22
    scrim[:top_h, :, 1] = 28
    scrim[:top_h, :, 2] = 14
    scrim[:top_h, :, 3] = np.clip((1.0 - ty / max(1.0, float(top_h))) ** 1.35 * 165, 0, 255).astype(np.uint8)[:, None]
    canvas = Image.alpha_composite(canvas, Image.fromarray(scrim, mode='RGBA'))
    draw = ImageDraw.Draw(canvas)

    _draw_top_editorial_chrome(draw, width, height, slide_index, slide_total, badge_str, (255, 232, 132, 255), dark_mode=True)

    cur_y = int(height * 0.095)
    kicker_str = badge_str if (badge_str and not badge_str.isascii()) else '여기가 피크닉 맛집!!'
    kf = _load_korean_font(max(20, int(width * 0.033)), bold=True, style=user_fam or 'serif', weight=700)
    kb = draw.textbbox((0, 0), kicker_str, font=kf)
    draw.text((margin_x, cur_y - kb[1]), kicker_str, font=kf, fill=(255, 253, 245, 250))
    cur_y += (kb[3] - kb[1]) + int(height * 0.028)

    head_px = max(42, int(width * 0.082))
    head_font = _load_korean_font(head_px, bold=True, style=user_fam or 'serif', weight=700)
    max_w = width - margin_x * 2

    h_lines = _wrap_korean_editorial_lines(draw, clean_headline, head_font, int(max_w * 0.88))[:3]

    for ln in h_lines:
        lb = draw.textbbox((0, 0), ln, font=head_font)
        draw.text((margin_x + 2, cur_y - lb[1] + 2), ln, font=head_font, fill=(18, 22, 12, 95))
        _draw_double_stroke_text(draw, (margin_x, cur_y - lb[1]), ln, font=head_font, fill_rgba=(255, 253, 248, 255), inner_w=u_stroke_w, inner_rgba=u_stroke_rgba, outer_w=u_double_w, outer_rgba=u_double_rgba)
        cur_y += (lb[3] - lb[1]) + int(head_px * 0.24)

    if clean_sub:
        cur_y += int(height * 0.014)
        sub_f = _load_korean_font(max(18, int(width * 0.029)), bold=False, style=user_fam or 'sans', weight=500)
        s_lines = []
        for raw_s in clean_sub.split('\n'):
            if raw_s.strip():
                s_lines.extend(_wrap_korean_editorial_lines(draw, raw_s.strip(), sub_f, int(max_w * 0.90)))
        for sln in s_lines[:3]:
            sb_b = draw.textbbox((0, 0), sln, font=sub_f)
            draw.text((margin_x, cur_y - sb_b[1]), sln, font=sub_f, fill=(242, 244, 236, 242))
            cur_y += (sb_b[3] - sb_b[1]) + 10

    return canvas



VIDEO_HOOK_TEMPLATES = {
    'reels_rounded_black': '둥근 블랙 카드 훅 (릴스·쇼츠 기본)',
    'reels_top_banner_pink': '상단 블랙바 + 핑크 하이라이트 훅',
    'reels_3d_pop_shadow': '3D 입체 외곽선 팝업 훅',
    'reels_neon_green_glow': '화이트 + 네온그린 글로우 훅',
    'reels_giant_yellow_impact': '화이트 + 초대형 옐로우 임팩트 훅',
    'reels_editorial_split': '매거진 상·하단 시네마 훅',
}


def _resolve_font_px(overlay_size, width, height, default_px=48):
    try:
        raw_sz = float(overlay_size or default_px)
        if not (raw_sz == raw_sz):
            raw_sz = float(default_px)
    except (TypeError, ValueError):
        raw_sz = float(default_px)
    min_dim = max(240, min(int(width), int(height)))
    if raw_sz >= 15.0:
        px = int(round(raw_sz * (min_dim / 1080.0)))
        return max(16, min(int(min_dim * 0.22), px))
    size_ratio = max(2.0, min(raw_sz, 14.9)) / 100.0
    return max(18, int(round(min_dim * size_ratio)))


def _render_video_hook_template_layer(
    width,
    height,
    overlay_text='',
    overlay_position='top',
    overlay_size=54,
    custom_center_x=None,
    custom_center_y=None,
    template='reels_rounded_black',
    badge_text='',
    sub_text='',
    font_family='',
    box_w_pct=None,
    box_h_pct=None,
    box_radius=None,
    stroke_width=None,
    stroke_color='',
    double_stroke_width=None,
    double_stroke_color='',
    bold=True,
    italic=False,
    underline=False,
    text_color_hex='',
    bg_color_hex='',
    bg_opacity=None,
    letter_spacing=0.0,
    line_spacing=1.25,
    text_align='center',
    scale_pct=100.0,
    opacity=100.0,
    overlay_bg=True,
):
    """Render the 6 Korean viral Reels/Shorts/Threads video hook templates onto a transparent RGBA PIL Image."""
    import re
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    width, height = int(width), int(height)
    layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    raw_text = str(overlay_text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not raw_text:
        return layer

    tpl = str(template or 'reels_rounded_black').strip().lower()
    fam = str(font_family or '').strip().lower()
    draw = ImageDraw.Draw(layer)

    is_bold = bool(bold if bold is not None else True)
    is_italic = bool(italic)
    is_underline = bool(underline)
    use_bg_box = bool(overlay_bg if overlay_bg is not None else True)
    align_norm = str(text_align or 'center').strip().lower()
    if align_norm not in ('left', 'center', 'right'):
        align_norm = 'center'

    scale_ratio = max(240, min(width, height)) / 1080.0
    try:
        sc_pct = max(40.0, min(250.0, float(scale_pct if scale_pct is not None and scale_pct != '' else 100.0)))
    except (TypeError, ValueError):
        sc_pct = 100.0
    try:
        ls_px = max(-12.0, min(60.0, float(letter_spacing or 0.0) * scale_ratio))
    except (TypeError, ValueError):
        ls_px = 0.0
    try:
        lh_mult = max(0.7, min(3.0, float(line_spacing if line_spacing is not None and line_spacing != '' else 1.25)))
    except (TypeError, ValueError):
        lh_mult = 1.25
    line_gap_ratio = max(0.08, (lh_mult - 0.95) * 0.85)

    user_radius_px = None
    if box_radius is not None and box_radius != '':
        try:
            user_radius_px = max(0, min(200, int(round(float(box_radius) * scale_ratio))))
        except (TypeError, ValueError):
            user_radius_px = None

    user_stroke_w = None
    if stroke_width is not None and stroke_width != '':
        try:
            user_stroke_w = max(0, min(48, int(round(float(stroke_width) * scale_ratio))))
        except (TypeError, ValueError):
            user_stroke_w = None

    user_double_w = 0
    if double_stroke_width is not None and double_stroke_width != '':
        try:
            user_double_w = max(0, min(48, int(round(float(double_stroke_width) * scale_ratio))))
        except (TypeError, ValueError):
            user_double_w = 0

    user_stroke_rgba = _parse_hex_or_named_rgba(stroke_color, default_rgba=(8, 10, 14, 250))
    user_double_rgba = _parse_hex_or_named_rgba(double_stroke_color, default_rgba=(255, 228, 36, 245))
    custom_fg_rgba = _parse_hex_or_named_rgba(text_color_hex, default_rgba=None) if str(text_color_hex or '').strip() else None
    custom_bg_rgba = _parse_hex_or_named_rgba(bg_color_hex, default_rgba=None) if str(bg_color_hex or '').strip() else None
    if custom_bg_rgba is not None and bg_opacity is not None and bg_opacity != '':
        try:
            bg_op_val = max(0, min(255, int(round(float(bg_opacity) * 2.55))))
            custom_bg_rgba = (custom_bg_rgba[0], custom_bg_rgba[1], custom_bg_rgba[2], bg_op_val)
        except (TypeError, ValueError):
            pass

    # Split into 2 lines naturally if single line has space or | or [bracket]
    explicit = [ln.strip() for ln in raw_text.split('\n') if ln.strip()]
    if len(explicit) == 1 and '|' in explicit[0]:
        lines_raw = [p.strip() for p in explicit[0].split('|', 1) if p.strip()]
    elif len(explicit) >= 2:
        lines_raw = explicit[:3]
    else:
        single = explicit[0]
        m = re.match(r'^([^\[\*]+)\s+(\[[^\]]+\]|\*[^\*]+\*.*)$', single)
        if m:
            lines_raw = [m.group(1).strip(), m.group(2).strip()]
        else:
            words = single.split(' ')
            if len(words) >= 2:
                mid = max(1, len(words) // 2)
                lines_raw = [' '.join(words[:mid]), ' '.join(words[mid:])]
            else:
                lines_raw = [single]

    clean_lines = [re.sub(r'[\[\]\*]', '', ln).strip() for ln in lines_raw if ln.strip()]
    if not clean_lines:
        return layer

    base_px = max(16, int(round(_resolve_font_px(overlay_size, width, height, default_px=54) * (sc_pct / 100.0))))
    cx = int(round(custom_center_x)) if custom_center_x is not None else (width // 2)
    if custom_center_y is not None:
        cy = int(round(custom_center_y))
    elif overlay_position == 'top':
        cy = int(height * 0.16)
    elif overlay_position in ('middle', 'center'):
        cy = int(height * 0.48)
    else:
        cy = int(height * 0.78)

    custom_bw = None
    custom_bh = None
    try:
        if box_w_pct is not None and float(box_w_pct) > 5.0:
            custom_bw = max(60, min(width - 8, int(round(width * float(box_w_pct) / 100.0))))
    except (TypeError, ValueError):
        custom_bw = None
    try:
        if box_h_pct is not None and float(box_h_pct) > 3.0:
            custom_bh = max(32, min(height - 8, int(round(height * float(box_h_pct) / 100.0))))
    except (TypeError, ValueError):
        custom_bh = None

    def _aligned_x(lw, container_x0, container_w, pad=12):
        if align_norm == 'left':
            return max(12, container_x0 + pad)
        if align_norm == 'right':
            return max(12, container_x0 + container_w - lw - pad)
        return max(12, container_x0 + (container_w - lw) // 2)

    def _draw_optional_box_for_text(x0, y0, x1, y1, default_bg=(12, 14, 22, 232), border_col=None):
        nonlocal layer, draw
        if not use_bg_box:
            return
        bw_loc = max(24, x1 - x0)
        bh_loc = max(20, y1 - y0)
        eff_r = user_radius_px if user_radius_px is not None else max(14, int(base_px * 0.36))
        eff_r = min(eff_r, min(bw_loc, bh_loc) // 2)
        shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([x0 + 3, y0 + 6, x1 + 3, y1 + 6], radius=eff_r, fill=(0, 0, 0, 105))
        layer = Image.alpha_composite(layer, shadow.filter(ImageFilter.GaussianBlur(radius=8)))
        draw = ImageDraw.Draw(layer)
        box_fill = custom_bg_rgba if custom_bg_rgba is not None else default_bg
        draw.rounded_rectangle([x0, y0, x1, y1], radius=eff_r, fill=box_fill, outline=border_col, width=2 if border_col else 0)

    # -------------------------------------------------------------------------
    # 1. REELS ROUNDED BLACK BOX (`reels_rounded_black`) — "장 볼때 누구나 / 한번쯤 하는 고민"
    # -------------------------------------------------------------------------
    if tpl == 'reels_rounded_black':
        f_px = max(22, int(base_px * 1.18))
        font = _load_korean_font(f_px, bold=is_bold, style=fam or 'sans', weight=800 if is_bold else 400)
        line_gap = max(6, int(f_px * line_gap_ratio))
        metrics = []
        max_lw = 0
        total_lh = 0
        for ln in clean_lines:
            lw, lh, top_off = _measure_spaced_text(draw, ln, font, letter_spacing=ls_px)
            metrics.append((ln, lw, lh, top_off))
            max_lw = max(max_lw, lw)
            total_lh += lh
        total_lh += line_gap * max(0, len(metrics) - 1)

        pad_x = max(14, int(f_px * 0.34))
        pad_y = max(9, int(f_px * 0.22))
        box_w = custom_bw if custom_bw is not None else min(width - 24, max_lw + pad_x * 2)
        box_h = custom_bh if custom_bh is not None else (total_lh + pad_y * 2)
        bx0 = max(8, min(width - box_w - 8, cx - box_w // 2))
        by0 = max(8, min(height - box_h - 8, cy - box_h // 2))
        bx1, by1 = bx0 + box_w, by0 + box_h

        if use_bg_box:
            eff_r = user_radius_px if user_radius_px is not None else max(16, int(f_px * 0.42))
            eff_r = min(eff_r, min(box_w, box_h) // 2)
            shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            ImageDraw.Draw(shadow).rounded_rectangle([bx0 + 3, by0 + 7, bx1 + 3, by1 + 7], radius=eff_r, fill=(0, 0, 0, 115))
            layer = Image.alpha_composite(layer, shadow.filter(ImageFilter.GaussianBlur(radius=9)))
            draw = ImageDraw.Draw(layer)

            box_fill = custom_bg_rgba if custom_bg_rgba is not None else (4, 4, 6, 246)
            draw.rounded_rectangle([bx0, by0, bx1, by1], radius=eff_r, fill=box_fill)
        cur_y = by0 + max(4, (box_h - total_lh) // 2)
        iw = user_stroke_w if user_stroke_w is not None else (0 if use_bg_box else max(4, int(f_px * 0.12)))
        fg_col = custom_fg_rgba if custom_fg_rgba is not None else (255, 255, 255, 255)
        for ln, lw, lh, top_off in metrics:
            lx = _aligned_x(lw, bx0, box_w, pad=max(10, pad_x // 2))
            _draw_double_stroke_text(
                draw,
                (lx, cur_y - top_off),
                ln,
                font=font,
                fill_rgba=fg_col,
                inner_w=iw,
                inner_rgba=user_stroke_rgba,
                outer_w=user_double_w,
                outer_rgba=user_double_rgba,
                letter_spacing=ls_px,
                underline=is_underline,
            )
            cur_y += lh + line_gap
        return _apply_layer_italic_and_opacity(layer, italic=is_italic, opacity=opacity, center_y=cy)

    # -------------------------------------------------------------------------
    # 2. REELS TOP BLACK HEADER + PINK HIGHLIGHT (`reels_top_banner_pink`) — "일본에서 산 껌통안에 / [종이가 들어있는 이유?!]"
    # -------------------------------------------------------------------------
    if tpl == 'reels_top_banner_pink':
        f_px = max(22, int(base_px * 1.15))
        font = _load_korean_font(f_px, bold=is_bold, style=fam or 'heavy_kr', weight=800 if is_bold else 400)
        line_gap = max(8, int(f_px * max(0.22, line_gap_ratio)))
        metrics = []
        max_lw = 0
        total_lh = 0
        for ln in clean_lines:
            lw, lh, top_off = _measure_spaced_text(draw, ln, font, letter_spacing=ls_px)
            metrics.append((ln, lw, lh, top_off))
            max_lw = max(max_lw, lw)
            total_lh += lh
        total_lh += line_gap * max(0, len(metrics) - 1)

        pad_x = max(16, int(f_px * 0.36))
        pad_y = max(12, int(f_px * 0.28))
        banner_h = custom_bh if custom_bh is not None else (total_lh + pad_y * 2)
        banner_w = custom_bw if custom_bw is not None else min(width - 20, max_lw + pad_x * 2)
        bx0 = max(6, min(width - banner_w - 6, cx - banner_w // 2))
        bx1 = bx0 + banner_w
        by0 = max(6, min(height - banner_h - 6, cy - banner_h // 2))
        by1 = by0 + banner_h

        eff_r = user_radius_px if user_radius_px is not None else 14
        if use_bg_box:
            banner_fill = custom_bg_rgba if custom_bg_rgba is not None else (4, 4, 6, 248)
            if eff_r > 0:
                draw.rounded_rectangle([bx0, by0, bx1, by1], radius=min(eff_r, min(banner_w, banner_h) // 2), fill=banner_fill)
            else:
                draw.rectangle([bx0, by0, bx1, by1], fill=banner_fill)
        cur_y = by0 + max(5, (banner_h - total_lh) // 2)
        iw = user_stroke_w if user_stroke_w is not None else (0 if use_bg_box else max(3, int(f_px * 0.10)))
        fg_main = custom_fg_rgba if custom_fg_rgba is not None else (255, 255, 255, 255)
        for idx_l, (ln, lw, lh, top_off) in enumerate(metrics):
            lx = _aligned_x(lw, bx0, banner_w, pad=12)
            is_pink_bar = (idx_l == len(metrics) - 1 and len(metrics) >= 2) or ('[' in lines_raw[idx_l])
            if is_pink_bar:
                if use_bg_box:
                    hp_x = max(12, int(f_px * 0.28))
                    hp_y = max(5, int(f_px * 0.12))
                    draw.rounded_rectangle([lx - hp_x, cur_y - hp_y, lx + lw + hp_x, cur_y + lh + hp_y], radius=min(eff_r or 10, 20), fill=(230, 178, 192, 255))
                pink_fg = (10, 10, 12, 255) if use_bg_box else (245, 180, 208, 255)
                _draw_double_stroke_text(draw, (lx, cur_y - top_off), ln, font=font, fill_rgba=pink_fg, inner_w=iw, inner_rgba=user_stroke_rgba, outer_w=user_double_w, outer_rgba=user_double_rgba, letter_spacing=ls_px, underline=is_underline)
            else:
                _draw_double_stroke_text(draw, (lx, cur_y - top_off), ln, font=font, fill_rgba=fg_main, inner_w=iw, inner_rgba=user_stroke_rgba, outer_w=user_double_w, outer_rgba=user_double_rgba, letter_spacing=ls_px, underline=is_underline)
            cur_y += lh + line_gap
        return _apply_layer_italic_and_opacity(layer, italic=is_italic, opacity=opacity, center_y=cy)

    # -------------------------------------------------------------------------
    # 3. REELS 3D POP EXTRUDED OUTLINE (`reels_3d_pop_shadow`) — "물집 때문에 / 힐 포기할 뻔..."
    # -------------------------------------------------------------------------
    if tpl == 'reels_3d_pop_shadow':
        f_px = max(24, int(base_px * 1.32))
        font = _load_korean_font(f_px, bold=is_bold, style=fam or 'heavy_kr', weight=900 if is_bold else 500)
        line_gap = max(8, int(f_px * line_gap_ratio))
        metrics = []
        total_lh = 0
        max_lw = 0
        for ln in clean_lines:
            lw, lh, top_off = _measure_spaced_text(draw, ln, font, letter_spacing=ls_px)
            metrics.append((ln, lw, lh, top_off))
            max_lw = max(max_lw, lw)
            total_lh += lh
        total_lh += line_gap * max(0, len(metrics) - 1)

        start_y = max(20, min(height - total_lh - 20, cy - total_lh // 2))
        pad_x = max(14, int(f_px * 0.32))
        pad_y = max(9, int(f_px * 0.20))
        box_w_eff = custom_bw if custom_bw is not None else (max_lw + pad_x * 2)
        box_h_eff = custom_bh if custom_bh is not None else (total_lh + pad_y * 2)
        box_x0 = max(10, cx - box_w_eff // 2)
        box_y0 = max(10, cy - box_h_eff // 2)
        if use_bg_box:
            _draw_optional_box_for_text(box_x0, box_y0, box_x0 + box_w_eff, box_y0 + box_h_eff, default_bg=(12, 14, 22, 218))

        sub_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(sub_layer)
        stroke_w = user_stroke_w if user_stroke_w is not None else max(5, int(f_px * 0.16))
        extrude_steps = max(5, int(f_px * 0.16))
        st_col = user_stroke_rgba if stroke_color else (10, 10, 12, 255)
        fg_col = custom_fg_rgba if custom_fg_rgba is not None else (255, 255, 255, 255)

        cur_y = start_y
        for ln, lw, lh, top_off in metrics:
            lx = _aligned_x(lw, box_x0, box_w_eff, pad=10) if align_norm != 'center' else max(16, min(width - lw - 16, cx - lw // 2))
            for step in range(extrude_steps, 0, -1):
                _draw_double_stroke_text(
                    sdraw,
                    (lx + step, cur_y - top_off + step),
                    ln,
                    font=font,
                    fill_rgba=st_col,
                    inner_w=stroke_w + user_double_w,
                    inner_rgba=user_double_rgba if user_double_w > 0 else st_col,
                    letter_spacing=ls_px,
                )
            _draw_double_stroke_text(
                sdraw,
                (lx, cur_y - top_off),
                ln,
                font=font,
                fill_rgba=fg_col,
                inner_w=stroke_w,
                inner_rgba=st_col,
                outer_w=user_double_w,
                outer_rgba=user_double_rgba,
                letter_spacing=ls_px,
                underline=is_underline,
            )
            cur_y += lh + line_gap

        rotated = sub_layer.rotate(3.5, resample=Image.Resampling.BICUBIC, center=(cx, cy))
        out_layer = Image.alpha_composite(layer, rotated)
        return _apply_layer_italic_and_opacity(out_layer, italic=is_italic, opacity=opacity, center_y=cy)

    # -------------------------------------------------------------------------
    # 4. REELS WHITE + NEON GREEN GLOW (`reels_neon_green_glow`) — "손에 안 묻는 / 구리스 스프레이"
    # -------------------------------------------------------------------------
    if tpl == 'reels_neon_green_glow':
        f_px = max(24, int(base_px * 1.38))
        font = _load_korean_font(f_px, bold=is_bold, style=fam or 'heavy_kr', weight=900 if is_bold else 500)
        line_gap = max(8, int(f_px * line_gap_ratio))
        metrics = []
        total_lh = 0
        max_lw = 0
        for ln in clean_lines:
            lw, lh, top_off = _measure_spaced_text(draw, ln, font, letter_spacing=ls_px)
            metrics.append((ln, lw, lh, top_off))
            max_lw = max(max_lw, lw)
            total_lh += lh
        total_lh += line_gap * max(0, len(metrics) - 1)

        start_y = max(20, min(height - total_lh - 20, cy - total_lh // 2))
        pad_x = max(14, int(f_px * 0.32))
        pad_y = max(9, int(f_px * 0.20))
        box_w_eff = custom_bw if custom_bw is not None else (max_lw + pad_x * 2)
        box_h_eff = custom_bh if custom_bh is not None else (total_lh + pad_y * 2)
        box_x0 = max(10, cx - box_w_eff // 2)
        box_y0 = max(10, cy - box_h_eff // 2)
        if use_bg_box:
            _draw_optional_box_for_text(box_x0, box_y0, box_x0 + box_w_eff, box_y0 + box_h_eff, default_bg=(10, 14, 18, 224))

        glow_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow_layer)
        cur_y = start_y
        for idx_l, (ln, lw, lh, top_off) in enumerate(metrics):
            lx = _aligned_x(lw, box_x0, box_w_eff, pad=10) if align_norm != 'center' else max(16, min(width - lw - 16, cx - lw // 2))
            is_neon = (idx_l == len(metrics) - 1 and len(metrics) >= 2) or ('[' in lines_raw[idx_l] or '*' in lines_raw[idx_l])
            g_col = (50, 255, 78, 235) if is_neon else (0, 0, 0, 235)
            gdraw.text((lx, cur_y - top_off + 5), ln, font=font, fill=g_col, stroke_width=max(8, int(f_px * 0.24)), stroke_fill=(0, 0, 0, 245))
            cur_y += lh + line_gap

        glow_blur = glow_layer.filter(ImageFilter.GaussianBlur(radius=12))
        layer = Image.alpha_composite(layer, glow_blur)
        draw = ImageDraw.Draw(layer)

        cur_y = start_y
        stroke_w = user_stroke_w if user_stroke_w is not None else max(5, int(f_px * 0.15))
        st_col = user_stroke_rgba if stroke_color else (8, 12, 8, 255)
        for idx_l, (ln, lw, lh, top_off) in enumerate(metrics):
            lx = _aligned_x(lw, box_x0, box_w_eff, pad=10) if align_norm != 'center' else max(16, min(width - lw - 16, cx - lw // 2))
            is_neon = (idx_l == len(metrics) - 1 and len(metrics) >= 2) or ('[' in lines_raw[idx_l] or '*' in lines_raw[idx_l])
            fg_col = (82, 255, 92, 255) if is_neon else (custom_fg_rgba or (255, 255, 255, 255))
            _draw_double_stroke_text(
                draw,
                (lx, cur_y - top_off),
                ln,
                font=font,
                fill_rgba=fg_col,
                inner_w=stroke_w,
                inner_rgba=st_col,
                outer_w=user_double_w,
                outer_rgba=user_double_rgba,
                letter_spacing=ls_px,
                underline=is_underline,
            )
            cur_y += lh + line_gap
        return _apply_layer_italic_and_opacity(layer, italic=is_italic, opacity=opacity, center_y=cy)

    # -------------------------------------------------------------------------
    # 5. REELS GIANT YELLOW IMPACT (`reels_giant_yellow_impact`) — "밭일하시는 부모님 / 이거면 끝"
    # -------------------------------------------------------------------------
    if tpl == 'reels_giant_yellow_impact':
        has_two_lines = False
        if len(clean_lines) >= 2:
            top_ln = clean_lines[0]
            bot_ln = ' '.join(clean_lines[1:])
            has_two_lines = True
        else:
            top_ln = ''
            bot_ln = clean_lines[0]

        top_px = max(24, int(base_px * 1.05))
        bot_px = max(32, int(base_px * (1.72 if has_two_lines else 1.38)))
        f_top = _load_korean_font(top_px, bold=is_bold, style=fam or 'heavy_kr', weight=900 if is_bold else 500)
        f_bot = _load_korean_font(bot_px, bold=is_bold, style=fam or 'heavy_kr', weight=900 if is_bold else 500)

        max_avail = (custom_bw - 20) if custom_bw is not None else (width - 28)
        max_avail = max(80, max_avail)
        if has_two_lines:
            tw, th, top_off_t = _measure_spaced_text(draw, top_ln, f_top, letter_spacing=ls_px)
            if tw > max_avail:
                top_px = max(20, int(top_px * max_avail / tw))
                f_top = _load_korean_font(top_px, bold=is_bold, style=fam or 'heavy_kr', weight=900 if is_bold else 500)
                tw, th, top_off_t = _measure_spaced_text(draw, top_ln, f_top, letter_spacing=ls_px)
        else:
            tw, th, top_off_t = 0, 0, 0

        bw, bh, top_off_b = _measure_spaced_text(draw, bot_ln, f_bot, letter_spacing=ls_px)
        if bw > max_avail:
            bot_px = max(26, int(bot_px * max_avail / bw))
            f_bot = _load_korean_font(bot_px, bold=is_bold, style=fam or 'heavy_kr', weight=900 if is_bold else 500)
            bw, bh, top_off_b = _measure_spaced_text(draw, bot_ln, f_bot, letter_spacing=ls_px)

        gap = max(6, int(top_px * line_gap_ratio)) if has_two_lines else 0
        total_h = (th + gap + bh) if has_two_lines else bh
        start_y = max(18, min(height - total_h - 18, cy - total_h // 2))

        pad_x = max(14, int(bot_px * 0.30))
        pad_y = max(9, int(bot_px * 0.20))
        content_w = max(tw, bw)
        box_w_eff = custom_bw if custom_bw is not None else (content_w + pad_x * 2)
        box_h_eff = custom_bh if custom_bh is not None else (total_h + pad_y * 2)
        box_x0 = max(10, cx - box_w_eff // 2)
        box_y0 = max(10, start_y - pad_y) if custom_bh is None else max(10, cy - box_h_eff // 2)
        if use_bg_box:
            _draw_optional_box_for_text(box_x0, box_y0, box_x0 + box_w_eff, box_y0 + box_h_eff, default_bg=(8, 10, 16, 228))

        tx = _aligned_x(tw, box_x0, box_w_eff, pad=10) if align_norm != 'center' else max(14, min(width - tw - 14, cx - tw // 2))
        bx = _aligned_x(bw, box_x0, box_w_eff, pad=10) if align_norm != 'center' else max(14, min(width - bw - 14, cx - bw // 2))

        st_top = user_stroke_w if user_stroke_w is not None else max(4, int(top_px * 0.14))
        st_bot = user_stroke_w if user_stroke_w is not None else max(5, int(bot_px * 0.14))
        st_col = user_stroke_rgba if stroke_color else (8, 8, 10, 255)
        bot_fg = custom_fg_rgba if custom_fg_rgba is not None else (255, 224, 20, 255)

        for ox, oy in ((4, 6), (2, 3)):
            if has_two_lines:
                _draw_double_stroke_text(draw, (tx + ox, start_y - top_off_t + oy), top_ln, font=f_top, fill_rgba=(0, 0, 0, 225), inner_w=st_top, inner_rgba=(0, 0, 0, 225), letter_spacing=ls_px)
            _draw_double_stroke_text(draw, (bx + ox, start_y + (th + gap if has_two_lines else 0) - top_off_b + oy), bot_ln, font=f_bot, fill_rgba=(0, 0, 0, 235), inner_w=st_bot, inner_rgba=(0, 0, 0, 235), letter_spacing=ls_px)

        if has_two_lines:
            _draw_double_stroke_text(draw, (tx, start_y - top_off_t), top_ln, font=f_top, fill_rgba=(255, 255, 255, 255), inner_w=st_top, inner_rgba=st_col, outer_w=user_double_w, outer_rgba=user_double_rgba, letter_spacing=ls_px, underline=is_underline)
        _draw_double_stroke_text(draw, (bx, start_y + (th + gap if has_two_lines else 0) - top_off_b), bot_ln, font=f_bot, fill_rgba=bot_fg, inner_w=st_bot, inner_rgba=st_col, outer_w=user_double_w, outer_rgba=user_double_rgba, letter_spacing=ls_px, underline=is_underline)
        return _apply_layer_italic_and_opacity(layer, italic=is_italic, opacity=opacity, center_y=cy)

    # -------------------------------------------------------------------------
    # 6. REELS EDITORIAL SPLIT (`reels_editorial_split`) — Magazine Kicker Pill + Highlight Box
    # -------------------------------------------------------------------------
    f_px = max(22, int(base_px * 1.05))
    font = _load_korean_font(f_px, bold=is_bold, style=fam or 'sans', weight=900 if is_bold else 500)
    line_gap = max(6, int(f_px * line_gap_ratio))
    metrics = []
    total_lh = 0
    max_lw = 0
    for ln in lines_raw:
        clean_ln = re.sub(r'[\[\]\*]', '', ln).strip()
        lw, lh, top_off = _measure_spaced_text(draw, clean_ln, font, letter_spacing=ls_px)
        metrics.append((ln, clean_ln, lw, lh, top_off))
        max_lw = max(max_lw, lw)
        total_lh += lh
    total_lh += line_gap * max(0, len(metrics) - 1)

    start_y = max(36, min(height - total_lh - 24, cy - total_lh // 2))
    kicker_txt = str(badge_text or '').strip()
    if kicker_txt:
        kf = _load_korean_font(max(13, int(f_px * 0.44)), bold=True, style=fam or 'sans', weight=800)
        kb = draw.textbbox((0, 0), kicker_txt, font=kf)
        kw, kh = kb[2] - kb[0], kb[3] - kb[1]
        kx0 = cx - (kw + 24) // 2
        ky0 = max(10, start_y - kh - 20)
        draw.rounded_rectangle([kx0, ky0, kx0 + kw + 24, ky0 + kh + 12], radius=(kh + 12) // 2, fill=(255, 208, 28, 255))
        draw.text((kx0 + 12, ky0 + 6 - kb[1]), kicker_txt, font=kf, fill=(14, 16, 20, 255))

    cur_y = start_y
    eff_r = user_radius_px if user_radius_px is not None else 12
    iw = user_stroke_w if user_stroke_w is not None else max(4, int(f_px * 0.12))
    st_col = user_stroke_rgba if stroke_color else (10, 12, 16, 245)
    fg_main = custom_fg_rgba if custom_fg_rgba is not None else (255, 255, 255, 255)
    pad_x = max(14, int(f_px * 0.32))
    pad_y = max(8, int(f_px * 0.18))
    box_w_all = max(max_lw + pad_x * 2, custom_bw or 0)
    box_x0 = max(12, cx - box_w_all // 2)
    if use_bg_box and len(metrics) == 1:
        _draw_optional_box_for_text(box_x0, start_y - pad_y, box_x0 + box_w_all, start_y + total_lh + pad_y, default_bg=(14, 16, 22, 236), border_col=(255, 208, 28, 210))
    for idx_l, (raw_ln, clean_ln, lw, lh, top_off) in enumerate(metrics):
        lx = _aligned_x(lw, box_x0, box_w_all, pad=10) if align_norm != 'center' else max(16, min(width - lw - 16, cx - lw // 2))
        if idx_l == len(metrics) - 1 and len(metrics) >= 2:
            if use_bg_box:
                box_w_eff = max(lw + 22, custom_bw or 0)
                bx0 = cx - box_w_eff // 2
                bx1 = bx0 + box_w_eff
                box_bg = custom_bg_rgba if custom_bg_rgba is not None else (14, 16, 22, 240)
                draw.rounded_rectangle([bx0, cur_y - 5, bx1, cur_y + lh + 7], radius=min(eff_r, (lh + 12) // 2), fill=box_bg, outline=(255, 208, 28, 220), width=2)
            _draw_double_stroke_text(draw, (lx, cur_y - top_off), clean_ln, font=font, fill_rgba=(255, 224, 36, 255), inner_w=(user_stroke_w or 0) if use_bg_box else iw, inner_rgba=st_col, outer_w=user_double_w, outer_rgba=user_double_rgba, letter_spacing=ls_px, underline=is_underline)
        else:
            _draw_double_stroke_text(draw, (lx, cur_y - top_off), clean_ln, font=font, fill_rgba=fg_main, inner_w=iw, inner_rgba=st_col, outer_w=user_double_w, outer_rgba=user_double_rgba, letter_spacing=ls_px, underline=is_underline)
        cur_y += lh + line_gap
    return _apply_layer_italic_and_opacity(layer, italic=is_italic, opacity=opacity, center_y=cy)


def render_overlay_rgba_layer(
    width,
    height,
    overlay_text='',
    overlay_position='bottom',
    overlay_size=4.5,
    overlay_color='white',
    overlay_bg=True,
    custom_center_x=None,
    custom_center_y=None,
    force_opaque_bg=False,
    template='',
    badge_text='',
    slide_index=0,
    slide_total=0,
    sub_text='',
    swipe_hint=True,
    font_family='',
    box_w_pct=None,
    box_h_pct=None,
    box_radius=None,
    stroke_width=None,
    stroke_color='',
    double_stroke_width=None,
    double_stroke_color='',
    bold=True,
    italic=False,
    underline=False,
    text_color_hex='',
    bg_color_hex='',
    bg_opacity=None,
    letter_spacing=0.0,
    line_spacing=1.25,
    text_align='',
    scale_pct=100.0,
    opacity=100.0,
):
    """Render magazine-grade Korean editorial typography, viral Reels/Shorts hook templates, gradient scrims, highlight spans, and swipe indicators onto a transparent RGBA PIL Image."""
    import re
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    overlay_layer = Image.new('RGBA', (int(width), int(height)), (0, 0, 0, 0))
    text = str(overlay_text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not text:
        return overlay_layer

    tpl_key = str(template or '').strip().lower()
    col_key = str(overlay_color or '').strip().lower()
    if tpl_key in VIDEO_HOOK_TEMPLATES or col_key in VIDEO_HOOK_TEMPLATES:
        hook_tpl = tpl_key if tpl_key in VIDEO_HOOK_TEMPLATES else col_key
        return _render_video_hook_template_layer(
            width=width,
            height=height,
            overlay_text=overlay_text,
            overlay_position=overlay_position,
            overlay_size=overlay_size,
            custom_center_x=custom_center_x,
            custom_center_y=custom_center_y,
            template=hook_tpl,
            badge_text=badge_text,
            sub_text=sub_text,
            font_family=font_family,
            box_w_pct=box_w_pct,
            box_h_pct=box_h_pct,
            box_radius=box_radius,
            stroke_width=stroke_width,
            stroke_color=stroke_color,
            double_stroke_width=double_stroke_width,
            double_stroke_color=double_stroke_color,
            bold=bold,
            italic=italic,
            underline=underline,
            text_color_hex=text_color_hex,
            bg_color_hex=bg_color_hex,
            bg_opacity=bg_opacity,
            letter_spacing=letter_spacing,
            line_spacing=line_spacing,
            text_align=text_align or 'center',
            scale_pct=scale_pct,
            opacity=opacity,
            overlay_bg=bool(overlay_bg or force_opaque_bg),
        )

    draw = ImageDraw.Draw(overlay_layer)
    theme = CAROUSEL_DESIGN_THEMES.get(tpl_key)
    is_editorial_card = bool(theme is not None)

    if tpl_key == 'clean_white':
        overlay_color = 'black'
        overlay_bg = True
    elif tpl_key == 'warm_luxury':
        overlay_color = 'black'
        overlay_bg = True
    elif tpl_key == 'highlight_hook':
        overlay_color = 'yellow'
        overlay_bg = True
    elif tpl_key in ('minimal_outline', 'magazine_gradient'):
        overlay_bg = False
    elif tpl_key in ('mint_modern', 'editorial_dark', 'neon_pop'):
        overlay_bg = True

    is_bold = bool(bold if bold is not None else True)
    is_italic = bool(italic)
    is_underline = bool(underline)

    scale_ratio = max(240, min(int(width), int(height))) / 1080.0
    try:
        sc_pct = max(40.0, min(250.0, float(scale_pct if scale_pct is not None and scale_pct != '' else 100.0)))
    except (TypeError, ValueError):
        sc_pct = 100.0
    try:
        ls_px = max(-12.0, min(60.0, float(letter_spacing or 0.0) * scale_ratio))
    except (TypeError, ValueError):
        ls_px = 0.0
    try:
        lh_mult = max(0.7, min(3.0, float(line_spacing if line_spacing is not None and line_spacing != '' else 1.25)))
    except (TypeError, ValueError):
        lh_mult = 1.25
    line_gap_ratio = max(0.08, (lh_mult - 0.95) * 0.95)

    fam_style = str(font_family or 'sans').strip().lower() or 'sans'
    base_font_px = _resolve_font_px(overlay_size, width, height, default_px=44)
    font_px = max(16, int(round(base_font_px * (sc_pct / 100.0))))
    font = _load_korean_font(font_px, bold=is_bold, style=fam_style, weight=800 if is_bold else 400)
    sub_font_px = max(14, int(round(font_px * 0.68)))
    sub_font = _load_korean_font(sub_font_px, bold=False, style=fam_style)

    user_radius_px = None
    if box_radius is not None and box_radius != '':
        try:
            user_radius_px = max(0, min(200, int(round(float(box_radius) * scale_ratio))))
        except (TypeError, ValueError):
            user_radius_px = None

    user_stroke_w = None
    if stroke_width is not None and stroke_width != '':
        try:
            user_stroke_w = max(0, min(48, int(round(float(stroke_width) * scale_ratio))))
        except (TypeError, ValueError):
            user_stroke_w = None

    user_double_w = 0
    if double_stroke_width is not None and double_stroke_width != '':
        try:
            user_double_w = max(0, min(48, int(round(float(double_stroke_width) * scale_ratio))))
        except (TypeError, ValueError):
            user_double_w = 0

    # Split headline vs body sub-lines when rendering a card or multi-line editorial block
    explicit_lines = [ln.strip() for ln in text.split('\n') if ln.strip()]
    if is_editorial_card and not sub_text and len(explicit_lines) >= 2:
        headline_raw = explicit_lines[0]
        sub_text = '\n'.join(explicit_lines[1:])
    else:
        headline_raw = text

    custom_bw = None
    custom_bh = None
    try:
        if box_w_pct is not None and float(box_w_pct) > 5.0:
            custom_bw = max(60, min(width - 12, int(round(width * float(box_w_pct) / 100.0))))
    except (TypeError, ValueError):
        custom_bw = None
    try:
        if box_h_pct is not None and float(box_h_pct) > 3.0:
            custom_bh = max(32, min(height - 12, int(round(height * float(box_h_pct) / 100.0))))
    except (TypeError, ValueError):
        custom_bh = None

    safe_margin_x = max(24, int(width * 0.075))
    if custom_bw is not None:
        max_text_width = max(60, custom_bw - max(20, int(font_px * 0.72)))
    else:
        max_text_width = max(80, width - safe_margin_x * 2 - (20 if overlay_bg or force_opaque_bg else 0))

    if ('[' in headline_raw or '*' in headline_raw):
        lines = _wrap_korean_editorial_lines(draw, headline_raw, font, max_text_width + int(font_px * 1.4))
    else:
        lines = _wrap_korean_editorial_lines(draw, headline_raw, font, max_text_width)
    if not lines:
        return overlay_layer

    if str(sub_text or '').strip():
        sub_extra_w = int(sub_font_px * 1.4) if ('[' in str(sub_text) or '*' in str(sub_text)) else 0
        sub_lines = _wrap_korean_editorial_lines(draw, sub_text, sub_font, max_text_width + sub_extra_w)
    else:
        sub_lines = []

    line_gap = max(6, int(font_px * line_gap_ratio))
    sub_gap = max(5, int(sub_font_px * line_gap_ratio))
    line_metrics = []
    total_h = 0
    max_w = 0
    for line in lines:
        clean_for_measure = re.sub(r'\[([^\]]+)\]', r'\1', re.sub(r'\*([^\*]+)\*', r'\1', line))
        lw_raw, lh, top_off = _measure_spaced_text(draw, clean_for_measure, font, letter_spacing=ls_px)
        lw = lw_raw + (max(8, int(font_px * 0.24)) if '[' in line else 0)
        line_metrics.append((line, lw, lh, top_off))
        max_w = max(max_w, lw)
        total_h += lh
    total_h += line_gap * max(0, len(lines) - 1)

    sub_metrics = []
    if sub_lines:
        total_h += max(12, int(font_px * 0.42))
        for sline in sub_lines:
            clean_sub_measure = re.sub(r'\[([^\]]+)\]', r'\1', re.sub(r'\*([^\*]+)\*', r'\1', sline))
            sw_raw, sh, s_top_off = _measure_spaced_text(draw, clean_sub_measure, sub_font, letter_spacing=ls_px * 0.7)
            sw = sw_raw + (max(6, int(sub_font_px * 0.20)) if '[' in sline else 0)
            sub_metrics.append((sline, sw, sh, s_top_off))
            max_w = max(max_w, sw)
            total_h += sh
        total_h += sub_gap * max(0, len(sub_lines) - 1)

    if custom_center_y is not None:
        start_y = max(14, min(height - total_h - 14, int(round(custom_center_y - total_h / 2))))
    elif overlay_position == 'top':
        start_y = max(int(height * 0.11), 24)
    elif overlay_position in ('middle', 'center'):
        start_y = max(16, int((height - total_h) / 2))
    else:
        bottom_anchor = 0.84 if (slide_total and slide_total > 1) else 0.87
        start_y = max(16, int(height * bottom_anchor) - total_h)

    if custom_center_x is not None:
        center_x = max(int(max_w / 2) + 14, min(width - int(max_w / 2) - 14, int(round(custom_center_x))))
    else:
        center_x = width // 2

    # 1. Cinematic Gradient Scrim for Magazine Readability
    if is_editorial_card and theme.get('scrim') in ('cinematic', 'dark', 'soft_dark'):
        scrim_arr = np.zeros((height, width, 4), dtype=np.uint8)
        max_alpha = 228 if theme['scrim'] == 'cinematic' else (175 if theme['scrim'] == 'dark' else 120)
        if overlay_position == 'top':
            band_h = min(height, max(int(height * 0.46), start_y + total_h + int(height * 0.12)))
            y_idx = np.arange(band_h, dtype=np.float32)
            alphas = np.clip((1.0 - (y_idx / max(1.0, float(band_h)))) ** 1.45 * max_alpha, 0, 255).astype(np.uint8)
            scrim_arr[:band_h, :, 0] = 6
            scrim_arr[:band_h, :, 1] = 8
            scrim_arr[:band_h, :, 2] = 14
            scrim_arr[:band_h, :, 3] = alphas[:, None]
        else:
            band_start = max(0, min(int(height * 0.42), start_y - int(height * 0.14)))
            band_h = height - band_start
            if band_h > 8:
                y_idx = np.arange(band_h, dtype=np.float32)
                alphas = np.clip(((y_idx / max(1.0, float(band_h))) ** 1.35) * max_alpha, 0, 255).astype(np.uint8)
                scrim_arr[band_start:, :, 0] = 6
                scrim_arr[band_start:, :, 1] = 8
                scrim_arr[band_start:, :, 2] = 14
                scrim_arr[band_start:, :, 3] = alphas[:, None]
        if slide_total and slide_total > 1:
            top_h = min(height, int(height * 0.14))
            ty = np.arange(top_h, dtype=np.float32)
            talphas = np.clip((1.0 - ty / max(1.0, float(top_h))) ** 1.6 * 125, 0, 255).astype(np.uint8)
            scrim_arr[:top_h, :, 3] = np.maximum(scrim_arr[:top_h, :, 3], talphas[:, None])
        scrim_img = Image.fromarray(scrim_arr, mode='RGBA')
        overlay_layer = Image.alpha_composite(overlay_layer, scrim_img)
        draw = ImageDraw.Draw(overlay_layer)

    color_map = {
        'white': (255, 255, 255, 255),
        'yellow': (255, 232, 64, 255),
        'black': (20, 22, 28, 255),
        'mint': (94, 252, 212, 255),
        'coral': (255, 98, 82, 255),
    }
    base_fill = theme['text'] if theme else _parse_hex_or_named_rgba(overlay_color, default_rgba=color_map.get(str(overlay_color or 'white').lower(), (255, 255, 255, 255)))
    fill_rgba = _parse_hex_or_named_rgba(text_color_hex, default_rgba=base_fill) if str(text_color_hex or '').strip() else base_fill
    accent_rgba = theme['accent'] if theme else (255, 232, 64, 255)
    accent_text_rgba = theme['accent_text'] if theme else (16, 18, 24, 255)
    sub_rgba = theme['sub'] if theme else (225, 232, 240, 240)
    default_stroke_rgba = (255, 255, 255, 240) if fill_rgba[:3] in ((20, 22, 28), (18, 22, 30), (38, 30, 22)) else (0, 0, 0, 235)
    stroke_rgba = _parse_hex_or_named_rgba(stroke_color, default_rgba=default_stroke_rgba) if stroke_color else default_stroke_rgba
    double_stroke_rgba = _parse_hex_or_named_rgba(double_stroke_color, default_rgba=(255, 228, 36, 245))

    user_align = str(text_align or '').strip().lower()
    if user_align in ('left', 'center', 'right'):
        align_mode = user_align
    else:
        align_mode = (theme.get('align') if (theme and custom_center_x is None) else 'center') or 'center'

    pad_x = max(14, int(font_px * 0.34))
    pad_y = max(9, int(font_px * 0.22))
    if custom_bw is not None:
        box_x0 = max(6, min(width - custom_bw - 6, int(center_x - custom_bw / 2)))
        box_x1 = box_x0 + custom_bw
    elif align_mode == 'left' and custom_center_x is None:
        box_x0 = safe_margin_x
        box_x1 = min(width - safe_margin_x, box_x0 + max_w + pad_x * 2)
    elif align_mode == 'right' and custom_center_x is None:
        box_x1 = width - safe_margin_x
        box_x0 = max(safe_margin_x, box_x1 - (max_w + pad_x * 2))
    else:
        box_x0 = max(10, int(center_x - max_w / 2) - pad_x)
        box_x1 = min(width - 10, int(center_x + max_w / 2) + pad_x)
    if custom_bh is not None:
        cy_eff = int(round(custom_center_y)) if custom_center_y is not None else (start_y + total_h // 2)
        box_y0 = max(6, min(height - custom_bh - 6, cy_eff - custom_bh // 2))
        box_y1 = box_y0 + custom_bh
        start_y = max(box_y0 + 6, box_y0 + (custom_bh - total_h) // 2)
    else:
        box_y0 = max(10, start_y - pad_y)
        box_y1 = min(height - 10, start_y + total_h + pad_y)

    # 2. Card Container + Soft Drop Shadow + Accent Bar
    has_card_box = bool((overlay_bg or force_opaque_bg) and (not theme or theme.get('bg') is not None or force_opaque_bg))
    if has_card_box:
        radius = user_radius_px if user_radius_px is not None else max(12, int(font_px * 0.42))
        radius = min(radius, max(0, min(box_x1 - box_x0, box_y1 - box_y0) // 2))
        shadow_layer = Image.new('RGBA', overlay_layer.size, (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_layer)
        sdraw.rounded_rectangle([box_x0 + 2, box_y0 + 6, box_x1 + 2, box_y1 + 8], radius=radius, fill=(0, 0, 0, 95))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=max(4, int(font_px * 0.22))))
        overlay_layer = Image.alpha_composite(overlay_layer, shadow_layer)
        draw = ImageDraw.Draw(overlay_layer)

        if str(bg_color_hex or '').strip():
            parsed_bg = _parse_hex_or_named_rgba(bg_color_hex, default_rgba=(12, 14, 22, 224))
            bg_alpha = 248 if force_opaque_bg else 224
            if bg_opacity is not None and bg_opacity != '':
                try:
                    bg_alpha = max(0, min(255, int(round(float(bg_opacity) * 2.55))))
                except (TypeError, ValueError):
                    pass
            bg_rgba = (parsed_bg[0], parsed_bg[1], parsed_bg[2], bg_alpha)
        elif theme and theme.get('bg') is not None:
            bg_rgba = tuple(theme['bg'][:3]) + ((250,) if force_opaque_bg else (theme['bg'][3],))
        elif fill_rgba[:3] in ((20, 22, 28), (18, 22, 30)):
            bg_rgba = (252, 252, 254, 248 if force_opaque_bg else 238)
        else:
            bg_alpha = 248 if force_opaque_bg else 218
            if bg_opacity is not None and bg_opacity != '':
                try:
                    bg_alpha = max(0, min(255, int(round(float(bg_opacity) * 2.55))))
                except (TypeError, ValueError):
                    pass
            bg_rgba = (12, 14, 22, bg_alpha)

        border_rgba = theme.get('border') if theme else (255, 255, 255, 38)
        draw.rounded_rectangle(
            [box_x0, box_y0, box_x1, box_y1],
            radius=radius,
            fill=bg_rgba,
            outline=border_rgba,
            width=2 if border_rgba else 0,
        )
        if theme and theme.get('accent_bar'):
            bar_w = max(6, int(font_px * 0.18))
            draw.rounded_rectangle(
                [box_x0, box_y0, min(box_x1, box_x0 + bar_w), box_y1],
                radius=max(3, bar_w // 2),
                fill=accent_rgba,
            )
    elif theme and theme.get('accent_bar') and align_mode == 'left':
        bar_w = max(6, int(font_px * 0.16))
        draw.rounded_rectangle(
            [box_x0, start_y - 4, box_x0 + bar_w, start_y + total_h + 4],
            radius=max(2, bar_w // 2),
            fill=accent_rgba,
        )

    # 3. Category / Kicker Pill Badge (e.g. MAIN COVER, POINT 01)
    if badge_text:
        badge_font = _load_korean_font(max(13, int(font_px * 0.50)), bold=True)
        bb = draw.textbbox((0, 0), str(badge_text), font=badge_font)
        bw, bh = bb[2] - bb[0], bb[3] - bb[1]
        pill_pad_x = max(12, int(font_px * 0.34))
        pill_pad_y = max(6, int(font_px * 0.16))
        if align_mode == 'left':
            bx0 = box_x0 + (max(10, int(font_px * 0.28)) if (theme and theme.get('accent_bar') and not has_card_box) else 0)
        elif align_mode == 'right':
            bx0 = max(10, box_x1 - (bw + pill_pad_x * 2))
        else:
            bx0 = max(10, int(center_x - (bw + pill_pad_x * 2) / 2))
        by1 = max(28, (box_y0 if has_card_box else start_y) - max(10, int(font_px * 0.28)))
        by0 = max(8, by1 - bh - pill_pad_y * 2)
        bx1 = min(width - 10, bx0 + bw + pill_pad_x * 2)
        draw.rounded_rectangle([bx0, by0, bx1, by1], radius=max(8, (by1 - by0) // 2), fill=accent_rgba)
        draw.text((bx0 + pill_pad_x, by0 + pill_pad_y - bb[1]), str(badge_text), font=badge_font, fill=accent_text_rgba)

    # 4. Top-Right Slide Counter Pill & Progress Dots (01 / 05)
    if slide_total and slide_total > 1 and 1 <= int(slide_index or 0) <= int(slide_total):
        s_idx = int(slide_index)
        s_tot = int(slide_total)
        cnt_font = _load_korean_font(max(13, int(min(width, height) * 0.022)), bold=True)
        cnt_label = f'{s_idx:02d} / {s_tot:02d}'
        cb = draw.textbbox((0, 0), cnt_label, font=cnt_font)
        cw, ch = cb[2] - cb[0], cb[3] - cb[1]
        cx1 = width - safe_margin_x
        cx0 = cx1 - cw - 24
        cy0 = max(22, int(height * 0.036))
        cy1 = cy0 + ch + 14
        draw.rounded_rectangle([cx0, cy0, cx1, cy1], radius=(cy1 - cy0) // 2, fill=(12, 14, 22, 185), outline=(255, 255, 255, 55), width=1)
        draw.text((cx0 + 12, cy0 + 7 - cb[1]), cnt_label, font=cnt_font, fill=(255, 255, 255, 245))

        dot_y = (cy0 + cy1) // 2
        dot_x = safe_margin_x
        for d_i in range(1, min(s_tot, 10) + 1):
            is_cur = (d_i == s_idx)
            dw = 22 if is_cur else 8
            dh = 8
            d_col = accent_rgba if is_cur else (255, 255, 255, 120)
            draw.rounded_rectangle([dot_x, dot_y - dh // 2, dot_x + dw, dot_y + dh // 2], radius=4, fill=d_col)
            dot_x += dw + 6

        if swipe_hint and s_idx < s_tot:
            sw_font = _load_korean_font(max(12, int(min(width, height) * 0.020)), bold=True)
            sw_label = '다음 장 넘기기 →' if s_idx == 1 else 'SWIPE →'
            sb = draw.textbbox((0, 0), sw_label, font=sw_font)
            sw_w, sw_h = sb[2] - sb[0], sb[3] - sb[1]
            sx1 = width - safe_margin_x
            sx0 = sx1 - sw_w - 22
            sy1 = height - max(18, int(height * 0.028))
            sy0 = sy1 - sw_h - 12
            if sy0 > box_y1 + 6:
                draw.rounded_rectangle([sx0, sy0, sx1, sy1], radius=(sy1 - sy0) // 2, fill=(14, 16, 24, 195), outline=accent_rgba[:3] + (140,), width=1)
                draw.text((sx0 + 11, sy0 + 6 - sb[1]), sw_label, font=sw_font, fill=accent_rgba)

    # 5. Render Headline Lines with [형광펜 박스], *강조 색상*, and 1st/2nd Stroke Support
    cur_y = start_y
    default_stroke_w = max(2, int(round(font_px * 0.08))) if not has_card_box else 0
    eff_stroke_w = user_stroke_w if user_stroke_w is not None else default_stroke_w
    in_pad = pad_x if has_card_box else max(16, int(font_px * 0.42))
    text_left_base = box_x0 + in_pad
    text_right_base = box_x1 - in_pad

    for line, lw, lh, top_offset in line_metrics:
        if align_mode == 'left':
            line_x = max(10, min(width - lw - 10, text_left_base))
        elif align_mode == 'right':
            line_x = max(10, min(width - lw - 10, text_right_base - lw))
        else:
            line_x = max(10, min(width - lw - 10, int(center_x - lw / 2)))

        segments = _parse_highlight_segments(line)
        seg_x = line_x
        for seg_txt, seg_mode in segments:
            if not seg_txt:
                continue
            seg_w, _, _ = _measure_spaced_text(draw, seg_txt, font, letter_spacing=ls_px)
            if seg_mode == 'box':
                h_pad_x = max(6, int(font_px * 0.16))
                h_pad_y = max(3, int(font_px * 0.08))
                draw.rounded_rectangle(
                    [seg_x - h_pad_x // 2, cur_y - h_pad_y, seg_x + seg_w + h_pad_x, cur_y + lh + h_pad_y],
                    radius=max(6, int(font_px * 0.18)),
                    fill=accent_rgba,
                )
                _draw_double_stroke_text(
                    draw,
                    (seg_x + h_pad_x // 4, cur_y - top_offset),
                    seg_txt,
                    font=font,
                    fill_rgba=accent_text_rgba,
                    letter_spacing=ls_px,
                    underline=is_underline,
                )
                seg_x += seg_w + h_pad_x
            elif seg_mode == 'accent':
                _draw_double_stroke_text(
                    draw,
                    (seg_x, cur_y - top_offset),
                    seg_txt,
                    font=font,
                    fill_rgba=accent_rgba,
                    inner_w=eff_stroke_w,
                    inner_rgba=stroke_rgba,
                    outer_w=user_double_w,
                    outer_rgba=double_stroke_rgba,
                    letter_spacing=ls_px,
                    underline=is_underline,
                )
                seg_x += seg_w
            else:
                _draw_double_stroke_text(
                    draw,
                    (seg_x, cur_y - top_offset),
                    seg_txt,
                    font=font,
                    fill_rgba=fill_rgba,
                    inner_w=eff_stroke_w,
                    inner_rgba=stroke_rgba,
                    outer_w=user_double_w,
                    outer_rgba=double_stroke_rgba,
                    letter_spacing=ls_px,
                    underline=is_underline,
                )
                seg_x += seg_w
        cur_y += lh + line_gap

    # 6. Render Subtext / Body Copy Hierarchy (with fine rule line)
    if sub_metrics:
        rule_y = cur_y - line_gap // 2 + max(4, int(font_px * 0.14))
        rule_x0 = text_left_base if align_mode == 'left' else int(center_x - min(max_w, int(width * 0.32)) / 2)
        rule_x1 = (rule_x0 + max(48, int(font_px * 1.8))) if align_mode == 'left' else int(center_x + min(max_w, int(width * 0.32)) / 2)
        draw.line([(rule_x0, rule_y), (rule_x1, rule_y)], fill=accent_rgba[:3] + (180,), width=2)
        cur_y = rule_y + max(8, int(font_px * 0.24))
        sub_stroke_w = user_stroke_w if user_stroke_w is not None else (max(1, int(round(sub_font_px * 0.07))) if not has_card_box else 0)
        for sline, sw, sh, stop_offset in sub_metrics:
            if align_mode == 'left':
                sx = max(10, min(width - sw - 10, text_left_base))
            elif align_mode == 'right':
                sx = max(10, min(width - sw - 10, text_right_base - sw))
            else:
                sx = max(10, min(width - sw - 10, int(center_x - sw / 2)))
            sub_segments = _parse_highlight_segments(sline)
            sub_seg_x = sx
            for s_txt, s_mode in sub_segments:
                if not s_txt:
                    continue
                s_w, _, _ = _measure_spaced_text(draw, s_txt, sub_font, letter_spacing=ls_px * 0.7)
                if s_mode == 'box':
                    sp_x = max(5, int(sub_font_px * 0.14))
                    sp_y = max(2, int(sub_font_px * 0.06))
                    draw.rounded_rectangle(
                        [sub_seg_x - sp_x // 2, cur_y - sp_y, sub_seg_x + s_w + sp_x, cur_y + sh + sp_y],
                        radius=max(5, int(sub_font_px * 0.16)),
                        fill=accent_rgba,
                    )
                    _draw_double_stroke_text(
                        draw,
                        (sub_seg_x + sp_x // 4, cur_y - stop_offset),
                        s_txt,
                        font=sub_font,
                        fill_rgba=accent_text_rgba,
                        letter_spacing=ls_px * 0.7,
                        underline=is_underline,
                    )
                    sub_seg_x += s_w + sp_x
                elif s_mode == 'accent':
                    _draw_double_stroke_text(
                        draw,
                        (sub_seg_x, cur_y - stop_offset),
                        s_txt,
                        font=sub_font,
                        fill_rgba=accent_rgba,
                        inner_w=sub_stroke_w,
                        inner_rgba=stroke_rgba,
                        outer_w=user_double_w,
                        outer_rgba=double_stroke_rgba,
                        letter_spacing=ls_px * 0.7,
                        underline=is_underline,
                    )
                    sub_seg_x += s_w
                else:
                    _draw_double_stroke_text(
                        draw,
                        (sub_seg_x, cur_y - stop_offset),
                        s_txt,
                        font=sub_font,
                        fill_rgba=sub_rgba,
                        inner_w=sub_stroke_w,
                        inner_rgba=stroke_rgba,
                        outer_w=user_double_w,
                        outer_rgba=double_stroke_rgba,
                        letter_spacing=ls_px * 0.7,
                        underline=is_underline,
                    )
                    sub_seg_x += s_w
            cur_y += sh + sub_gap

    return _apply_layer_italic_and_opacity(overlay_layer, italic=is_italic, opacity=opacity, center_y=(box_y0 + box_y1) * 0.5)


def render_transparent_overlay_png(
    width,
    height,
    destination_png,
    overlay_text='',
    overlay_position='bottom',
    overlay_size=4.5,
    overlay_color='white',
    overlay_bg=True,
    custom_center_x=None,
    custom_center_y=None,
    force_opaque_bg=False,
    template='',
    badge_text='',
    sub_text='',
    font_family='',
    box_w_pct=None,
    box_h_pct=None,
    box_radius=None,
    stroke_width=None,
    stroke_color='',
    double_stroke_width=None,
    double_stroke_color='',
    bold=True,
    italic=False,
    underline=False,
    text_color_hex='',
    bg_color_hex='',
    bg_opacity=None,
    letter_spacing=0.0,
    line_spacing=1.25,
    text_align='',
    scale_pct=100.0,
    opacity=100.0,
):
    """Save a transparent RGBA PNG overlay so FFmpeg can composite magazine-grade typography onto videos."""
    layer = render_overlay_rgba_layer(
        width=width,
        height=height,
        overlay_text=overlay_text,
        overlay_position=overlay_position,
        overlay_size=overlay_size,
        overlay_color=overlay_color,
        overlay_bg=overlay_bg,
        custom_center_x=custom_center_x,
        custom_center_y=custom_center_y,
        force_opaque_bg=force_opaque_bg,
        template=template,
        badge_text=badge_text,
        slide_index=0,
        slide_total=0,
        sub_text=sub_text,
        swipe_hint=False,
        font_family=font_family,
        box_w_pct=box_w_pct,
        box_h_pct=box_h_pct,
        box_radius=box_radius,
        stroke_width=stroke_width,
        stroke_color=stroke_color,
        double_stroke_width=double_stroke_width,
        double_stroke_color=double_stroke_color,
        bold=bold,
        italic=italic,
        underline=underline,
        text_color_hex=text_color_hex,
        bg_color_hex=bg_color_hex,
        bg_opacity=bg_opacity,
        letter_spacing=letter_spacing,
        line_spacing=line_spacing,
        text_align=text_align,
        scale_pct=scale_pct,
        opacity=opacity,
    )
    Path(destination_png).parent.mkdir(parents=True, exist_ok=True)
    layer.save(str(destination_png), format='PNG')
    return Path(destination_png)


def draw_korean_overlay_pil(
    bgr_image,
    overlay_text='',
    overlay_position='bottom',
    overlay_size=4.5,
    overlay_color='white',
    overlay_bg=True,
    custom_center_x=None,
    custom_center_y=None,
    force_opaque_bg=False,
    template='',
    badge_text='',
    slide_index=0,
    slide_total=0,
    sub_text='',
    swipe_hint=True,
    slide_role='auto',
    font_family='',
    box_w_pct=None,
    box_h_pct=None,
    box_radius=None,
    stroke_width=None,
    stroke_color='',
    double_stroke_width=None,
    double_stroke_color='',
    bold=True,
    italic=False,
    underline=False,
    text_color_hex='',
    bg_color_hex='',
    bg_opacity=None,
    letter_spacing=0.0,
    line_spacing=1.25,
    text_align='',
    scale_pct=100.0,
    opacity=100.0,
):
    """Render Canva-grade full-canvas editorial card news layouts or positioned overlays onto a BGR image."""
    import cv2
    import numpy as np
    from PIL import Image

    text = str(overlay_text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not text:
        return bgr_image

    height, width = bgr_image.shape[:2]
    rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb).convert('RGBA')

    tpl_key = str(template or '').strip().lower()
    if tpl_key == 'clean_white_card':
        tpl_key = 'clean_white'
    use_full_canva_layout = (
        tpl_key in CAROUSEL_DESIGN_THEMES
        and custom_center_x is None
        and custom_center_y is None
        and (slide_total > 0 or overlay_position != 'top' or slide_role in ('cover', 'body', 'cta'))
    )
    if use_full_canva_layout:
        composed = _render_canva_editorial_card_pil(
            pil_img,
            overlay_text=overlay_text,
            overlay_position=overlay_position,
            overlay_size=overlay_size,
            template=tpl_key,
            badge_text=badge_text,
            slide_index=slide_index,
            slide_total=slide_total,
            sub_text=sub_text,
            swipe_hint=swipe_hint,
            slide_role=slide_role,
            font_family=font_family,
            stroke_width=stroke_width or 0,
            stroke_color=stroke_color,
            double_stroke_width=double_stroke_width or 0,
            double_stroke_color=double_stroke_color,
        ).convert('RGB')
        return cv2.cvtColor(np.asarray(composed), cv2.COLOR_RGB2BGR)

    overlay_layer = render_overlay_rgba_layer(
        width=width,
        height=height,
        overlay_text=overlay_text,
        overlay_position=overlay_position,
        overlay_size=overlay_size,
        overlay_color=overlay_color,
        overlay_bg=overlay_bg,
        custom_center_x=custom_center_x,
        custom_center_y=custom_center_y,
        force_opaque_bg=force_opaque_bg,
        template=template,
        badge_text=badge_text,
        slide_index=slide_index,
        slide_total=slide_total,
        sub_text=sub_text,
        swipe_hint=swipe_hint,
        font_family=font_family,
        box_w_pct=box_w_pct,
        box_h_pct=box_h_pct,
        box_radius=box_radius,
        stroke_width=stroke_width,
        stroke_color=stroke_color,
        double_stroke_width=double_stroke_width,
        double_stroke_color=double_stroke_color,
        bold=bold,
        italic=italic,
        underline=underline,
        text_color_hex=text_color_hex,
        bg_color_hex=bg_color_hex,
        bg_opacity=bg_opacity,
        letter_spacing=letter_spacing,
        line_spacing=line_spacing,
        text_align=text_align,
        scale_pct=scale_pct,
        opacity=opacity,
    )
    combined = Image.alpha_composite(pil_img, overlay_layer).convert('RGB')
    return cv2.cvtColor(np.asarray(combined), cv2.COLOR_RGB2BGR)


def detect_subtitle_cover_band(source, is_image=False, detector=None):
    """Detect the bounding band (x, y, w, h in % of frame) of existing subtitles to cover them with a box."""
    try:
        ocr_res = detect_media_text(source, is_image=is_image, detector=detector)
        boxes = ocr_res.get('boxes') or []
    except Exception:
        boxes = []
    # Only consider boxes in the lower subtitle zone (center y >= 55% and individual box height <= 22%)
    sub_boxes = [
        b for b in boxes
        if (float(b.get('y', 0)) + float(b.get('h', 0)) * 0.5) >= 55.0
        and float(b.get('h', 0)) <= 22.0
    ]
    if not sub_boxes:
        return {'x': 6.0, 'y': 74.0, 'w': 88.0, 'h': 15.0, 'detected': False}
    # Cluster around the lowest subtitle line so scattered middle-screen text doesn't create a huge box
    lowest_cy = max(float(b.get('y', 75.0)) + float(b.get('h', 10.0)) * 0.5 for b in sub_boxes)
    cluster_boxes = [
        b for b in sub_boxes
        if abs((float(b.get('y', 75.0)) + float(b.get('h', 10.0)) * 0.5) - lowest_cy) <= 18.0
    ] or sub_boxes
    min_x = min(float(b.get('x', 10.0)) for b in cluster_boxes)
    min_y = min(float(b.get('y', 75.0)) for b in cluster_boxes)
    max_x = max(float(b.get('x', 10.0)) + float(b.get('w', 80.0)) for b in cluster_boxes)
    max_y = max(float(b.get('y', 75.0)) + float(b.get('h', 12.0)) for b in cluster_boxes)
    pad_x = 3.5
    pad_y = 2.0
    x0 = max(2.0, min_x - pad_x)
    y0 = max(52.0, min_y - pad_y)
    x1 = min(98.0, max_x + pad_x)
    y1 = min(98.0, max_y + pad_y)
    h_pct = min(24.0, max(7.0, y1 - y0))
    return {
        'x': round(x0, 2),
        'y': round(y0, 2),
        'w': round(max(12.0, x1 - x0), 2),
        'h': round(h_pct, 2),
        'detected': True,
    }


def clean_and_overlay_image(
    source,
    destination,
    erase_mode='auto_all',
    rectangle=None,
    overlay_text='',
    overlay_position='bottom',
    overlay_size=42.0,
    overlay_color='white',
    overlay_bg=True,
    overlay_x=None,
    overlay_y=None,
    overlay_font='',
    overlay_box_w=None,
    overlay_box_h=None,
    overlay_box_radius=None,
    overlay_stroke_width=None,
    overlay_stroke_color='',
    overlay_double_stroke_width=None,
    overlay_double_stroke_color='',
    overlay_bold=True,
    overlay_italic=False,
    overlay_underline=False,
    overlay_text_color='',
    overlay_bg_color='',
    overlay_bg_opacity=None,
    overlay_letter_spacing=0.0,
    overlay_line_spacing=1.25,
    overlay_align='',
    overlay_scale_pct=100.0,
    overlay_opacity=100.0,
    title_text='',
    title_position='top',
    title_size=54.0,
    title_color='yellow',
    title_bg=True,
    title_x=None,
    title_y=None,
    title_badge='',
    title_font='',
    title_box_w=None,
    title_box_h=None,
    title_box_radius=None,
    title_stroke_width=None,
    title_stroke_color='',
    title_double_stroke_width=None,
    title_double_stroke_color='',
    title_bold=True,
    title_italic=False,
    title_underline=False,
    title_text_color='',
    title_bg_color='',
    title_bg_opacity=None,
    title_letter_spacing=0.0,
    title_line_spacing=1.25,
    title_align='',
    title_scale_pct=100.0,
    title_opacity=100.0,
    template='',
    badge_text='',
    slide_index=0,
    slide_total=0,
    sub_text='',
    swipe_hint=True,
    slide_role='auto',
    mask_color='#0f172a',
    mask_opacity=0.92,
    video_zoom=100.0,
    focus_x=50.0,
    focus_y=50.0,
    detector=None,
):
    """Erase existing text in an image (via Blur, Cover Box, or Complete AI Inpaint Deletion + Mask) and optionally apply zoom and Korean overlays."""
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw

    erase_mode = str(erase_mode or 'keep').strip()
    if erase_mode in ('none', 'cover_box'):
        erase_mode = 'keep'
    overlay_position = str(overlay_position or 'bottom').strip()
    if overlay_position == 'center':
        overlay_position = 'middle'

    frame = _read_image_bgr(source)
    height, width = frame.shape[:2]

    # 1. Optional Zoom / Crop (100% ~ 200%) centered on (focus_x, focus_y)
    try:
        z_pct = float(video_zoom or 100.0)
    except (TypeError, ValueError):
        z_pct = 100.0
    if z_pct > 100.5:
        z_ratio = min(2.5, max(1.0, z_pct / 100.0))
        try:
            fx = min(100.0, max(0.0, float(focus_x if focus_x is not None else 50.0)))
            fy = min(100.0, max(0.0, float(focus_y if focus_y is not None else 50.0)))
        except (TypeError, ValueError):
            fx, fy = 50.0, 50.0
        crop_w = max(16, int(round(width / z_ratio)))
        crop_h = max(16, int(round(height / z_ratio)))
        cx = int(round(width * (fx / 100.0)))
        cy = int(round(height * (fy / 100.0)))
        x0 = max(0, min(width - crop_w, cx - crop_w // 2))
        y0 = max(0, min(height - crop_h, cy - crop_h // 2))
        cropped = frame[y0:y0 + crop_h, x0:x0 + crop_w]
        if cropped.size > 0:
            frame = cv2.resize(cropped, (width, height), interpolation=cv2.INTER_CUBIC)

    def _resolve_mask_rect(default_y=74.0, default_h=16.0):
        if isinstance(rectangle, dict):
            try:
                rx = float(rectangle.get('x', 6.0))
                ry = float(rectangle.get('y', default_y))
                rw = float(rectangle.get('w', 88.0))
                rh = float(rectangle.get('h', default_h))
                if rw >= 2.0 and rh >= 2.0:
                    x0 = max(0, min(width - 4, int(round(width * rx / 100.0))))
                    y0 = max(0, min(height - 4, int(round(height * ry / 100.0))))
                    x1 = max(x0 + 4, min(width, x0 + int(round(width * rw / 100.0))))
                    y1 = max(y0 + 4, min(height, y0 + int(round(height * rh / 100.0))))
                    return x0, y0, x1, y1
            except (TypeError, ValueError):
                pass
        det = detect_subtitle_cover_band(source, is_image=True, detector=detector)
        x0 = max(0, min(width - 4, int(round(width * float(det.get('x', 6.0)) / 100.0))))
        y0 = max(0, min(height - 4, int(round(height * float(det.get('y', default_y)) / 100.0))))
        x1 = max(x0 + 4, min(width, x0 + int(round(width * float(det.get('w', 88.0)) / 100.0))))
        y1 = max(y0 + 4, min(height, y0 + int(round(height * float(det.get('h', default_h)) / 100.0))))
        return x0, y0, x1, y1

    mask = np.zeros((height, width), dtype=np.uint8)
    boxes_count = 0

    if erase_mode in ('blur_subtitles', 'blur_mask'):
        if erase_mode == 'blur_subtitles' and not (isinstance(rectangle, dict) and float(rectangle.get('w', 0) or 0) >= 5):
            x0, y0, x1, y1 = _resolve_mask_rect(74.0, 16.0)
        else:
            x0, y0, x1, y1 = _resolve_mask_rect(72.0, 18.0)
        roi = frame[y0:y1, x0:x1]
        if roi.size > 0:
            ksize = max(15, (min(width, height) // 18) | 1)
            blurred = cv2.GaussianBlur(roi, (ksize, ksize), 0)
            frame[y0:y1, x0:x1] = blurred
            boxes_count = 1
    elif erase_mode in ('cover_subtitles', 'cover_mask'):
        x0, y0, x1, y1 = _resolve_mask_rect(73.0, 16.0)
        rgb_col = _hex_to_rgb(mask_color or '#0f172a', (15, 23, 42))
        try:
            op = min(1.0, max(0.15, float(mask_opacity if mask_opacity is not None else 0.92)))
        except (TypeError, ValueError):
            op = 0.92
        fill_rgba = (rgb_col[0], rgb_col[1], rgb_col[2], int(round(op * 255)))
        pil_base = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert('RGBA')
        layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw_l = ImageDraw.Draw(layer)
        rad = max(8, int(round(min(width, height) * 0.022)))
        draw_l.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=fill_rgba)
        frame = cv2.cvtColor(np.asarray(Image.alpha_composite(pil_base, layer).convert('RGB')), cv2.COLOR_RGB2BGR)
        boxes_count = 1
    elif erase_mode in ('auto_all', 'auto_subtitles', 'auto_text', 'inpaint_subtitles', 'inpaint_all'):
        ocr = _get_ocr_detector(detector)
        result, _ = ocr(frame, use_cls=False, use_rec=False)
        sub_only = erase_mode in ('auto_subtitles', 'inpaint_subtitles')
        for polygon in result if result is not None else []:
            polygon = np.asarray(polygon, dtype=np.float32)
            if polygon.shape != (4, 2) or not np.isfinite(polygon).all():
                continue
            if sub_only and polygon[:, 1].mean() < height * 0.5:
                continue
            polygon[:, 0] = np.clip(polygon[:, 0], 0, width - 1)
            polygon[:, 1] = np.clip(polygon[:, 1], 0, height - 1)
            cv2.fillPoly(mask, [polygon.astype(np.int32)], 255)
            boxes_count += 1
    elif erase_mode in ('local_fill', 'inpaint_mask') and isinstance(rectangle, dict):
        x0, y0, x1, y1 = _resolve_mask_rect(72.0, 18.0)
        mask[y0:y1, x0:x1] = 255
        boxes_count = 1

    if mask.any():
        margin = max(4, round(min(width, height) * 0.008))
        dilated = cv2.dilate(mask, np.ones((margin * 2 + 1, margin * 2 + 1), np.uint8))
        inpainted = cv2.inpaint(frame, dilated, 7, cv2.INPAINT_TELEA)
        alpha = cv2.GaussianBlur(dilated.astype(np.float32) / 255.0, (7, 7), 0)[:, :, None]
        frame = np.clip(
            inpainted.astype(np.float32) * alpha + frame.astype(np.float32) * (1.0 - alpha),
            0,
            255,
        ).astype(np.uint8)

    def _pct_to_px(val, dim):
        if val is None or val == '':
            return None
        try:
            v = float(val)
            if 0.0 <= v <= 100.0:
                return dim * (v / 100.0)
        except (TypeError, ValueError):
            pass
        return None

    if str(title_text or '').strip():
        tx_px = _pct_to_px(title_x, width)
        ty_px = _pct_to_px(title_y, height)
        frame = draw_korean_overlay_pil(
            frame,
            overlay_text=title_text,
            overlay_position=title_position or 'top',
            overlay_size=title_size,
            overlay_color=title_color,
            overlay_bg=title_bg,
            custom_center_x=tx_px,
            custom_center_y=ty_px,
            template=template,
            badge_text=title_badge,
            swipe_hint=False,
            font_family=title_font,
            box_w_pct=title_box_w,
            box_h_pct=title_box_h,
            box_radius=title_box_radius,
            stroke_width=title_stroke_width,
            stroke_color=title_stroke_color,
            double_stroke_width=title_double_stroke_width,
            double_stroke_color=title_double_stroke_color,
            bold=title_bold,
            italic=title_italic,
            underline=title_underline,
            text_color_hex=title_text_color,
            bg_color_hex=title_bg_color,
            bg_opacity=title_bg_opacity,
            letter_spacing=title_letter_spacing,
            line_spacing=title_line_spacing,
            text_align=title_align,
            scale_pct=title_scale_pct,
            opacity=title_opacity,
        )

    if str(overlay_text or '').strip():
        ox_px = _pct_to_px(overlay_x, width)
        oy_px = _pct_to_px(overlay_y, height)
        frame = draw_korean_overlay_pil(
            frame,
            overlay_text=overlay_text,
            overlay_position=overlay_position,
            overlay_size=overlay_size,
            overlay_color=overlay_color,
            overlay_bg=overlay_bg,
            custom_center_x=ox_px,
            custom_center_y=oy_px,
            force_opaque_bg=False,
            template=template,
            badge_text=badge_text,
            slide_index=slide_index,
            slide_total=slide_total,
            sub_text=sub_text,
            swipe_hint=swipe_hint,
            slide_role=slide_role,
            font_family=overlay_font,
            box_w_pct=overlay_box_w,
            box_h_pct=overlay_box_h,
            box_radius=overlay_box_radius,
            stroke_width=overlay_stroke_width,
            stroke_color=overlay_stroke_color,
            double_stroke_width=overlay_double_stroke_width,
            double_stroke_color=overlay_double_stroke_color,
            bold=overlay_bold,
            italic=overlay_italic,
            underline=overlay_underline,
            text_color_hex=overlay_text_color,
            bg_color_hex=overlay_bg_color,
            bg_opacity=overlay_bg_opacity,
            letter_spacing=overlay_letter_spacing,
            line_spacing=overlay_line_spacing,
            text_align=overlay_align,
            scale_pct=overlay_scale_pct,
            opacity=overlay_opacity,
        )

    _write_image_bgr(destination, frame)
    return {
        'engine': 'RapidOCR + Inpaint + Pillow Editorial Magazine Engine',
        'erase_mode': erase_mode,
        'detected_boxes': boxes_count,
        'overlay_applied': bool(str(overlay_text or '').strip() or str(title_text or '').strip()),
    }



