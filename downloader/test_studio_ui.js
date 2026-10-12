const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require(process.env.STUDIO_JSDOM || './.test-tools/node_modules/jsdom');
const html=fs.readFileSync(path.join(__dirname,'studio_web/index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'studio_web/studio.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const dom=new JSDOM(html,{url:'http://127.0.0.1:5005/studio/',runScripts:'outside-only'});
 const w=dom.window, d=w.document;
 const job={id:'a'.repeat(32),name:'fixture.mp4',status:'publish_ready',source:'',media:{duration:2,width:320,height:240,has_audio:true},
  evidence:{description:'6 frames',frames:Array.from({length:6},(_,i)=>({file:`frame-${i}.jpg`,timestamp:i/4}))},
  analysis:{result:{summary:'<img src=x onerror=alert(1)>',observations:[{timestamp:0,description:'패턴'}],audio_summary:'음성',uncertainties:['모델 미확인'],search_terms:['검색어']}},
  product:{platform:'coupang',name:'상품',url:'https://example.com/product',affiliate_url:'https://example.com/affiliate',attribution:'user_confirmed'},
  draft:{script:'대본',body:'#광고\n본문'},comment:'#광고\n고지\n링크',disclosure:'저장한 고지',
  publication:{status:'not_published'},search:{query:'상품',candidates:[{name:'검색 후보',url:'https://www.coupang.com/product',platform:'coupang',snippet:'미확인 후보'}]},
  visual_search:{frame:{file:'frame-2.jpg',timestamp:.5},candidates:[{name:'시각 상품 후보',url:'https://www.coupang.com/item',image:'https://example.com/image.jpg',kind:'product',source:'판매처'}]}};
 const calls=[];
 w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url==='/studio/references'?[]:url==='/studio/jobs'?[job]:job};};
 const copied=[];Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>copied.push(value)}});
 w.eval(script);await flush();
 assert.equal(d.querySelector('#analyze').disabled,true);
 d.querySelector('#jobs button').click();await flush();await flush();
 assert.equal(d.querySelectorAll('#frames img').length,6);
 assert.equal(d.querySelector('#disclosure').value,'저장한 고지');
 assert.equal(d.querySelector('#analysis img'),null,'AI output must remain plain text');
 assert.equal(d.querySelector('#copy-body').disabled,false);
 assert.ok(d.querySelector('#visual-original').src.endsWith('/frame-2.jpg'));
 assert.equal(d.querySelectorAll('#visual-results img').length,1);
 d.querySelector('#copy-body').click();await flush();
 assert.deepEqual(copied,['#광고\n본문']);
 assert.ok(d.querySelector('#publication').textContent.includes('직접 게시'));
 d.querySelector('#product-name').value='변경한 상품';d.querySelector('#product-name').dispatchEvent(new w.Event('input'));
 assert.equal(d.querySelector('#copy-body').disabled,true);
 const before=calls.length;d.querySelector('#prepare').click();await flush();
 assert.equal(calls.length,before,'unsaved product changes must block preparation');
 assert.ok(d.querySelector('#message').textContent.includes('먼저 저장'));
 d.querySelector('#candidates button').click();
 assert.equal(d.querySelector('#product-name').value,'검색 후보');
 assert.equal(d.querySelector('#affiliate-url').value,'');
 assert.equal(d.querySelector('#confirmed').checked,false);
 assert.equal(d.querySelector('#publish-api').disabled,true);
 d.querySelector('#visual-results button').click();
 assert.equal(d.querySelector('#product-name').value,'시각 상품 후보');
 assert.equal(d.querySelector('#product-url').value,'https://www.coupang.com/item');
 d.querySelector('#new-job').click();await flush();
 assert.equal(d.querySelector('#disclosure').value,'');assert.equal(d.querySelector('#media').hidden,true);
 dom.window.close();console.log('Studio UI: restore, frames, plain-text output, copy state, unsaved-product guards and candidate selection passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
