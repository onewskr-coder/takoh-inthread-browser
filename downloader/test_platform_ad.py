import hashlib,json,os,re,shutil,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
import studio
from studio_ad_policy import disclosure_body
class PlatformAdTests(unittest.TestCase):
 def test_platform_export_and_real_video(self):
  binary=shutil.which('ffmpeg');self.assertTrue(binary)
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);jid='a'*32;folder=root/jid;folder.mkdir();source=folder/'video'
   r=studio.run_ffmpeg(binary,['-y','-f','lavfi','-i','color=black:s=320x240:r=12','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-f','mp4',str(source)]);self.assertEqual(r.returncode,0)
   original=source.read_bytes();job=dict(id=jid,name='test.mp4',kind='video',status='publish_ready',sha256=hashlib.sha256(original).hexdigest(),draft={'body':'#광고 [광고] 제품 소개'},comment='')
   (folder/'job.json').write_text(json.dumps(job),encoding='utf-8');app=Flask(__name__)
   with patch.dict(os.environ,{'STUDIO_DATA_DIR':str(root)}):studio.register_studio(app,lambda:binary)
   client=app.test_client();page=client.get('/studio/').get_data(as_text=True);token=re.search('name="studio-token" content="([^"]+)"',page)[1]
   for platform in ['threads','instagram_reels','tiktok','naver_clip']:
    response=client.post('/studio/jobs/'+jid+'/extension-export',json={'platform':platform},headers={'X-Studio-Token':token});self.assertEqual(response.status_code,200,response.data)
    delivery=root/'deliveries'/response.json['id'];packet=json.loads((delivery/'packet.json').read_text(encoding='utf-8'));self.assertEqual(packet['body'],('#광고' if platform=='threads' else '[광고]')+' 제품 소개');exported=delivery/'video';self.assertEqual(source.read_bytes(),original)
    if platform=='threads':self.assertEqual(exported.read_bytes(),original)
    else:
     self.assertNotEqual(exported.read_bytes(),original);info=studio.inspect_media(binary,exported);self.assertEqual((info['width'],info['height']),(320,240));self.assertTrue(info['has_audio'])
     frame=studio.run_ffmpeg(binary,['-i',str(exported),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);self.assertEqual(frame.returncode,0);self.assertGreater(sum(v>180 for v in frame.stdout[:320*80*3]),100);self.assertEqual((delivery/'file-0').read_bytes(),exported.read_bytes())
   self.assertEqual(len(list((folder/'ad-variants').glob('*.mp4'))),1)
   with patch.object(studio,'prepare_ad_video',side_effect=ValueError('광고 표시 실패')):
    fail=client.post('/studio/jobs/'+jid+'/extension-export',json={'platform':'tiktok'},headers={'X-Studio-Token':token});self.assertEqual(fail.status_code,422)
 def test_no_duplicate_prefix(self):
  for body in ['#광고 [광고] 제품','#광고 #광고 제품','[광고] 제품']:
   self.assertEqual(disclosure_body(body,'threads'),'#광고 제품');self.assertEqual(disclosure_body(body,'tiktok'),'[광고] 제품')
if __name__=='__main__':unittest.main()
