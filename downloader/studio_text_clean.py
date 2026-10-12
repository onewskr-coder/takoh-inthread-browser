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
