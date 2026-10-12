const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('./.test-tools/node_modules/jsdom');
const dom = new JSDOM('', {url:'https://www.instagram.com/', runScripts:'outside-only'});
const w = dom.window;
w.chrome = {runtime:{getURL:x=>x,onMessage:{addListener(){}},sendMessage(){}},storage:{local:{get:(k,cb)=>cb({})},onChanged:{addListener(){}}}};
w.eval(fs.readFileSync('content-core.js','utf8'));
function check(html, platform, expected, size=400) {
  w.document.body.innerHTML = html;
  const img = w.document.querySelector('img');
  Object.defineProperty(img,'naturalWidth',{value:1024});
  img.getBoundingClientRect=()=>({width:size,height:size});
  assert.equal(w.TAKCore.isContentImage(img,platform),expected,html);
}
check('<article><img src="https://cdninstagram.com/v/t51.2885-19/avatar.jpg"></article>','instagram',false);
check('<article><img src="https://cdninstagram.com/photo.jpg"></article>','instagram',false,40);
check('<a href="/alice/"><img src="https://cdninstagram.com/photo.jpg"></a>','instagram',false);
check('<a href="/p/post123/"><img src="https://cdninstagram.com/photo.jpg"></a>','instagram',true);
check('<a href="https://www.threads.com/@alice"><img src="https://cdninstagram.com/photo.jpg"></a>','threads',false);
check('<a href="https://www.threads.com/@alice/post/123"><img src="https://cdninstagram.com/photo.jpg"></a>','threads',true);
check('<header><img src="https://cdn.example.com/banner.jpg"></header>','xhs',false);
check('<div data-testid="UserAvatar"><img src="https://cdn.example.com/photo.jpg"></div>','reddit',false);
check('<img src="https://i.pinimg.com/avatars/user.jpg">','pinterest',false);
check('<img src="https://i.pinimg.com/originals/ab/cd/photo.jpg">','pinterest',true);
check('<img src="https://cdn.example.com/product.jpg">','coupang',true,50);
check('<article><img alt="프로필 사진" src="https://cdn.example.com/photo.jpg"></article>','instagram',false);
dom.window.close();
console.log('Content image filtering regressions passed');
