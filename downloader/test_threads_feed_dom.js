const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('./.test-tools/node_modules/jsdom');
const dom = new JSDOM(`<style>${fs.readFileSync('content.css','utf8')}</style>
<section><a href="/@alice/post/post_A">time A</a><div style="overflow-x:hidden;overflow-y:hidden"><video id="v1" src="https://cdninstagram.com/one.mp4"></video></div>
<a href="/@alice"><img src="https://cdninstagram.com/avatar-large.jpg"></a><div class="author-avatar"><img src="https://cdninstagram.com/unknown.jpg"></div>
<a role="link" href="/@alice/post/post_A/media"><picture><img id="photo" src="https://cdninstagram.com/photo.jpg"></picture></a><button id="comment">Comment</button></section>
<section><a href="/@bob/post/post_B">time B</a><div><video id="v2" src="https://cdninstagram.com/two.mp4"></video></div></section>`,
{url:'https://www.threads.com/',runScripts:'outside-only'});
const w = dom.window;
let now = 2000;
w.Date.now = () => now;
const downloads = [], fetched = [], blobs = [];
w.URL.createObjectURL = blob => {blobs.push(blob);return `blob:fixture-${blobs.length}`;};
w.URL.revokeObjectURL = ()=>{};
w.fetch = async url => {fetched.push(url); return {ok:true,headers:{get:()=>url.endsWith('.jpg')?'image/jpeg':'video/mp4'},
  blob:async()=>new w.Blob(['fixture-content'.repeat(200)],{type:url.endsWith('.jpg')?'image/jpeg':'video/mp4'})};};
w.chrome = {
  runtime:{id:'fixture',getURL:x=>x,onMessage:{addListener(){}},sendMessage:(m,cb)=>{
    if(m.action==='download'){downloads.push(m);cb({success:true,downloadId:downloads.length});}
    else cb({urls:[]});
  }},
  storage:{local:{get:(keys,cb)=>cb({isLicensed:true})},onChanged:{addListener(){}}}
};
const rect = {left:20,right:660,top:150,bottom:550,width:640,height:400};
for (const media of w.document.querySelectorAll('video,img')) {
  for (const [key,value] of Object.entries({offsetWidth:640,offsetHeight:400,naturalWidth:640,naturalHeight:400,complete:true})) {
    Object.defineProperty(media,key,{value,configurable:true});
  }
  media.getBoundingClientRect=()=>rect;
  media.parentElement.getBoundingClientRect=()=>rect;
}
w.eval(fs.readFileSync('content-core.js','utf8'));
w.eval(fs.readFileSync('content-threads.js','utf8'));
w.TAKPlatform.process();
const controls = Array.from(w.document.querySelectorAll('[data-takoh-threads-controls]'));
assert.equal(controls.length,3,'each actual media gets independent controls');
for (const control of controls) {
  assert.equal(control.parentElement,w.document.body,'controls escape site clipping/click layers');
  assert.equal(control.style.position,'fixed');
  assert.equal(control.style.display,'flex');
  assert.equal(w.getComputedStyle(control.querySelector('button')).pointerEvents,'auto');
}
const flush = ()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  w.document.querySelector('#comment').click();
  assert.equal(downloads.length,0,'comments never initiate downloads');
  controls[0].querySelector('button').click();
  await flush(); await flush();
  assert.equal(downloads[0].url,'https://cdninstagram.com/one.mp4');
  assert.equal(downloads[0].type,'video');
  assert.equal(downloads[0].postId,'post_A');
  now += 1100;
  controls[2].querySelector('button[data-media-type="image"]').click();
  await flush(); await flush();
  assert.equal(downloads[1].url,'https://cdninstagram.com/photo.jpg','post image link must not be excluded as an avatar');
  assert.equal(downloads[1].type,'image');
  assert.equal(downloads[1].filename.endsWith('.jpg'),true,'image download filename must retain .jpg extension');
  now += 1100;
  controls[1].querySelector('button').click();
  await flush(); await flush();
  assert.equal(downloads[2].url,'https://cdninstagram.com/two.mp4','second video must retain its own URL');
  assert.equal(downloads[2].postId,'post_B');
  w.document.querySelector('#v1').remove();
  w.TAKPlatform.process();
  assert.equal(controls[0].isConnected,false,'removed media must not leave a floating button');
  w.TAKCore.config.enableImages=false;
  w.TAKPlatform.process();
  assert.equal(controls[2].style.display,'none');
  console.log('Threads feed DOM passed: clickable portals, correct video/image URLs and post IDs, native comment click, MIME, removal and config');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>w.close());
