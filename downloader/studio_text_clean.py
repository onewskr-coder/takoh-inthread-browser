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


def draw_korean_overlay_pil(bgr_image, overlay_text='', overlay_position='bottom', overlay_size=4.5, overlay_color='white', overlay_bg=True, custom_center_y=None, force_opaque_bg=False):
    """Render crisp Korean multiline text onto a BGR numpy image using Pillow and Malgun Gothic."""
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    text = str(overlay_text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not text:
        return bgr_image

    height, width = bgr_image.shape[:2]
    rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb).convert('RGBA')
    overlay_layer = Image.new('RGBA', pil_img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_layer)

    try:
        size_ratio = max(2.0, min(float(overlay_size or 4.5), 12.0)) / 100.0
    except (TypeError, ValueError):
        size_ratio = 0.045
    font_px = max(18, int(round(min(width, height) * size_ratio)))

    font = None
    for candidate in (
        'C:/Windows/Fonts/malgunbd.ttf',
        'C:/Windows/Fonts/malgun.ttf',
        'C:/Windows/Fonts/NanumGothicBold.ttf',
        'C:/Windows/Fonts/gulim.ttc',
    ):
        if Path(candidate).exists():
            try:
                font = ImageFont.truetype(candidate, font_px)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()

    # Wrap long lines so text stays within 88% of image width
    max_text_width = max(80, int(width * 0.88))
    lines = []
    for raw_line in text.split('\n'):
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        current = ''
        for ch in raw_line:
            test = current + ch
            bbox = draw.textbbox((0, 0), test, font=font)
            if (bbox[2] - bbox[0]) > max_text_width and current:
                lines.append(current)
                current = ch
            else:
                current = test
        if current:
            lines.append(current)
    if not lines:
        return bgr_image

    line_gap = max(6, int(font_px * 0.26))
    line_metrics = []
    total_h = 0
    max_w = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        lh = bbox[3] - bbox[1]
        line_metrics.append((line, lw, lh, bbox[1]))
        max_w = max(max_w, lw)
        total_h += lh
    total_h += line_gap * max(0, len(lines) - 1)

    if custom_center_y is not None:
        start_y = max(12, min(height - total_h - 12, int(round(custom_center_y - total_h / 2))))
    elif overlay_position == 'top':
        start_y = max(int(height * 0.08), 16)
    elif overlay_position == 'middle':
        start_y = max(12, int((height - total_h) / 2))
    else:
        start_y = max(12, int(height * 0.88) - total_h)

    color_map = {
        'white': (255, 255, 255, 255),
        'yellow': (255, 232, 64, 255),
        'black': (20, 20, 24, 255),
        'mint': (110, 255, 216, 255),
    }
    fill_rgba = color_map.get(str(overlay_color or 'white').lower(), (255, 255, 255, 255))
    stroke_rgba = (255, 255, 255, 240) if fill_rgba[:3] == (20, 20, 24) else (0, 0, 0, 235)

    if overlay_bg or force_opaque_bg:
        pad_x = max(16, int(font_px * 0.62))
        pad_y = max(12, int(font_px * 0.42))
        box_x0 = max(6, int((width - max_w) / 2) - pad_x)
        box_y0 = max(6, start_y - pad_y)
        box_x1 = min(width - 6, int((width + max_w) / 2) + pad_x)
        box_y1 = min(height - 6, start_y + total_h + pad_y)
        alpha_val = 248 if force_opaque_bg else (205 if fill_rgba[:3] == (20, 20, 24) else 195)
        bg_rgba = (255, 255, 255, alpha_val) if fill_rgba[:3] == (20, 20, 24) else (12, 14, 20, alpha_val)
        radius = max(8, int(font_px * 0.35))
        draw.rounded_rectangle([box_x0, box_y0, box_x1, box_y1], radius=radius, fill=bg_rgba)

    cur_y = start_y
    stroke_w = max(2, int(round(font_px * 0.07)))
    for line, lw, lh, top_offset in line_metrics:
        x = int((width - lw) / 2)
        draw.text(
            (x, cur_y - top_offset),
            line,
            font=font,
            fill=fill_rgba,
            stroke_width=0 if (overlay_bg or force_opaque_bg) else stroke_w,
            stroke_fill=stroke_rgba,
        )
        cur_y += lh + line_gap

    combined = Image.alpha_composite(pil_img, overlay_layer).convert('RGB')
    return cv2.cvtColor(np.asarray(combined), cv2.COLOR_RGB2BGR)


def detect_subtitle_cover_band(source, is_image=False, detector=None):
    """Detect the bounding band (x, y, w, h in % of frame) of existing subtitles to cover them with a box."""
    try:
        ocr_res = detect_media_text(source, is_image=is_image, detector=detector)
        boxes = ocr_res.get('boxes') or []
    except Exception:
        boxes = []
    # Prefer subtitle boxes in the lower half (y >= 42%), fallback to all boxes if none in lower half
    sub_boxes = [b for b in boxes if (b.get('y', 0) + b.get('h', 0) * 0.5) >= 42.0]
    target_boxes = sub_boxes if sub_boxes else boxes
    if not target_boxes:
        return {'x': 6.0, 'y': 74.0, 'w': 88.0, 'h': 15.0, 'detected': False}
    min_x = min(float(b.get('x', 10.0)) for b in target_boxes)
    min_y = min(float(b.get('y', 75.0)) for b in target_boxes)
    max_x = max(float(b.get('x', 10.0)) + float(b.get('w', 80.0)) for b in target_boxes)
    max_y = max(float(b.get('y', 75.0)) + float(b.get('h', 12.0)) for b in target_boxes)
    pad_x = 3.5
    pad_y = 2.2
    x0 = max(2.0, min_x - pad_x)
    y0 = max(2.0, min_y - pad_y)
    x1 = min(98.0, max_x + pad_x)
    y1 = min(98.0, max_y + pad_y)
    return {
        'x': round(x0, 2),
        'y': round(y0, 2),
        'w': round(max(12.0, x1 - x0), 2),
        'h': round(max(7.0, y1 - y0), 2),
        'detected': True,
    }


def clean_and_overlay_image(
    source,
    destination,
    erase_mode='auto_all',
    rectangle=None,
    overlay_text='',
    overlay_position='bottom',
    overlay_size=4.5,
    overlay_color='white',
    overlay_bg=True,
    detector=None,
):
    """Erase or cover existing text in an image (via RapidOCR, cover_box, or rectangle mask) and optionally overlay Korean text."""
    import cv2
    import numpy as np

    frame = _read_image_bgr(source)
    height, width = frame.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)
    boxes_count = 0
    cover_center_y = None

    if erase_mode == 'cover_box':
        ocr = _get_ocr_detector(detector)
        result, _ = ocr(frame, use_cls=False, use_rec=False)
        polys = []
        for polygon in result if result is not None else []:
            polygon = np.asarray(polygon, dtype=np.float32)
            if polygon.shape != (4, 2) or not np.isfinite(polygon).all():
                continue
            polys.append(polygon)
        sub_polys = [p for p in polys if p[:, 1].mean() >= height * 0.42]
        target_polys = sub_polys if sub_polys else polys
        is_light_bg = str(overlay_color or 'white').lower() == 'black'
        box_bgr = (248, 248, 250) if is_light_bg else (16, 18, 24)
        if target_polys:
            all_pts = np.vstack(target_polys)
            pad_x = max(14, int(width * 0.035))
            pad_y = max(10, int(height * 0.018))
            x0 = max(4, int(np.min(all_pts[:, 0])) - pad_x)
            y0 = max(4, int(np.min(all_pts[:, 1])) - pad_y)
            x1 = min(width - 4, int(np.max(all_pts[:, 0])) + pad_x)
            y1 = min(height - 4, int(np.max(all_pts[:, 1])) + pad_y)
            cover_center_y = (y0 + y1) / 2.0
            overlay_copy = frame.copy()
            cv2.rectangle(overlay_copy, (x0, y0), (x1, y1), box_bgr, -1)
            frame = cv2.addWeighted(overlay_copy, 0.94, frame, 0.06, 0)
            boxes_count = len(target_polys)
        elif isinstance(rectangle, dict):
            rx = int(round(width * float(rectangle.get('x', 6)) / 100.0))
            ry = int(round(height * float(rectangle.get('y', 74)) / 100.0))
            rw = int(round(width * float(rectangle.get('w', 88)) / 100.0))
            rh = int(round(height * float(rectangle.get('h', 15)) / 100.0))
            x0, y0 = max(4, rx), max(4, ry)
            x1, y1 = min(width - 4, x0 + rw), min(height - 4, y0 + rh)
            cover_center_y = (y0 + y1) / 2.0
            overlay_copy = frame.copy()
            cv2.rectangle(overlay_copy, (x0, y0), (x1, y1), box_bgr, -1)
            frame = cv2.addWeighted(overlay_copy, 0.94, frame, 0.06, 0)
            boxes_count = 1
    elif erase_mode in ('auto_all', 'auto_subtitles', 'auto_text'):
        ocr = _get_ocr_detector(detector)
        result, _ = ocr(frame, use_cls=False, use_rec=False)
        for polygon in result if result is not None else []:
            polygon = np.asarray(polygon, dtype=np.float32)
            if polygon.shape != (4, 2) or not np.isfinite(polygon).all():
                continue
            if erase_mode == 'auto_subtitles' and polygon[:, 1].mean() < height * 0.5:
                continue
            polygon[:, 0] = np.clip(polygon[:, 0], 0, width - 1)
            polygon[:, 1] = np.clip(polygon[:, 1], 0, height - 1)
            cv2.fillPoly(mask, [polygon.astype(np.int32)], 255)
            boxes_count += 1
    elif erase_mode == 'local_fill' and isinstance(rectangle, dict):
        rx = int(round(width * float(rectangle.get('x', 8)) / 100.0))
        ry = int(round(height * float(rectangle.get('y', 72)) / 100.0))
        rw = int(round(width * float(rectangle.get('w', 84)) / 100.0))
        rh = int(round(height * float(rectangle.get('h', 18)) / 100.0))
        x0 = max(0, min(rx, width - 2))
        y0 = max(0, min(ry, height - 2))
        x1 = max(x0 + 2, min(x0 + rw, width))
        y1 = max(y0 + 2, min(y0 + rh, height))
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

    if str(overlay_text or '').strip():
        frame = draw_korean_overlay_pil(
            frame,
            overlay_text=overlay_text,
            overlay_position=overlay_position,
            overlay_size=overlay_size,
            overlay_color=overlay_color,
            overlay_bg=overlay_bg,
            custom_center_y=cover_center_y if erase_mode == 'cover_box' else None,
            force_opaque_bg=(erase_mode == 'cover_box'),
        )

    _write_image_bgr(destination, frame)
    return {
        'engine': 'RapidOCR + CoverBox/Inpaint + Pillow Korean overlay',
        'erase_mode': erase_mode,
        'detected_boxes': boxes_count,
        'overlay_applied': bool(str(overlay_text or '').strip()),
    }

