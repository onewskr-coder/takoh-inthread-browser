import tempfile
from pathlib import Path
import unittest
import cv2
import numpy as np
from studio_text_clean import clean_text_video


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
