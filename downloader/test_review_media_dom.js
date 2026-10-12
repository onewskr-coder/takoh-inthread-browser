const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('./.test-tools/node_modules/jsdom');
function fixture(url, html, module) {
  const dom = new JSDOM(html,{url,runScripts:'outside-only'});
  const w = dom.window;
  w.chrome={runtime:{id:'fixture',getURL:x=>x,onMessage:{addListener(){}},sendMessage:(m,cb)=>cb?.({urls:[]})},storage:{local:{get:(k,cb)=>cb({isLicensed:true})},onChanged:{addListener(){}}}};
  for(const media of w.document.querySelectorAll('img,video')) {
    for(const key of ['naturalWidth','naturalHeight','offsetWidth','offsetHeight']) Object.defineProperty(media,key,{value:400});
    Object.defineProperty(media,'complete',{value:true});
    media.getBoundingClientRect=()=>({width:400,height:400,left:0,top:0,right:400,bottom:400});
  }
  w.eval(fs.readFileSync('content-core.js','utf8'));
  w.eval(fs.readFileSync(module,'utf8'));
  w.TAKPlatform.process();
  return dom;
}
let dom=fixture('https://smartstore.naver.com/shop/products/1',`
<div id="review" data-review-media><img src="https://cdn.example.com/review/photo.jpg"></div>
<div data-review-media class="profile"><img src="https://cdn.example.com/review/avatar.jpg"></div>
<div id="product"><img src="https://cdn.example.com/product.jpg"><video src="https://cdn.example.com/product.mp4"></video></div>
<div id="reviewVideo" data-review-media><video src="https://cdn.example.com/review/one.mp4"></video></div>
<nav><video src="https://cdn.example.com/ui.mp4"></video></nav>`, 'content-naver-clip.js');
assert.equal(dom.window.document.querySelectorAll('.takoh-naver-review-image-btn').length,1);
assert.equal(dom.window.document.querySelectorAll('.takoh-video-overlay-btn').length,1);
assert.ok(dom.window.document.querySelector('#reviewVideo .takoh-video-overlay-btn'));
assert.equal(dom.window.document.querySelector('.takoh-video-overlay-btn').type,'button');
dom.window.close();
dom=fixture('https://clip.naver.com/clip/1','<div><video src="https://cdn.example.com/clip.mp4"></video></div><header><img src="https://cdn.example.com/profile.jpg"></header>', 'content-naver-clip.js');
assert.equal(dom.window.document.querySelectorAll('.takoh-video-overlay-btn').length,1);
assert.equal(dom.window.document.querySelectorAll('[data-media-type="image"]').length,0);
dom.window.close();
dom=fixture('https://www.coupang.com/vp/products/1',`
<div id="reviewVideo" class="sdp-review__video-modal"><video src="https://cdn.example.com/review.mp4"></video></div>
<div id="product"><video src="https://cdn.example.com/product.mp4"></video></div>
<div class="sdp-review__article__list__attachment"><img src="https://cdn.example.com/photo.jpg"></div>
<div class="sdp-review__article__list__attachment avatar"><img src="https://cdn.example.com/face.jpg"></div>`, 'content-coupang.js');
assert.equal(dom.window.document.querySelectorAll('[data-media-type="video"]').length,1);
assert.equal(dom.window.document.querySelectorAll('[data-media-type="image"]').length,1);
assert.equal(dom.window.document.querySelector('#product [data-media-type="video"]'),null);
dom.window.close();
console.log('Review media DOM passed: Coupang review only, Naver review images/videos, Clip videos, profile/product/UI exclusion');
