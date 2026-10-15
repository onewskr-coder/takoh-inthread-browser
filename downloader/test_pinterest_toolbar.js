const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require(process.env.STUDIO_JSDOM||'jsdom');
(async()=>{
const dom=new JSDOM('<style>'+fs.readFileSync('content.css','utf8')+'</style><div data-test-id="pin" data-test-pin-id="111"><a href="/pin/111/"><div id="host"><img src="https://i.pinimg.com/736x/image.jpg"></div></a></div><div data-test-id="pin-detail-image" id="detail"><img src="https://i.pinimg.com/736x/detail.jpg"></div>',{url:'https://kr.pinterest.com/pin/222/',runScripts:'outside-only'}),w=dom.window,d=w.document,calls=[];
const size=el=>{Object.defineProperty(el,'offsetWidth',{configurable:true,get:()=>260});Object.defineProperty(el,'offsetHeight',{configurable:true,get:()=>350});el.getBoundingClientRect=()=>({left:10,top:100,width:260,height:350,right:270,bottom:450});};d.querySelectorAll('img').forEach(size);
w.chrome={runtime:{id:'test',sendMessage:(packet,cb)=>{calls.push(packet);cb?.({success:true});}},storage:{local:{get:(k,cb)=>cb({})},onChanged:{addListener(){}}}};
w.TAKCore={config:{enableImages:true,enableVideos:true},isContentImage:()=>true,showToast(){},triggerDownload:(...args)=>calls.push({download:args}),anchorMediaControls:()=>{throw Error('Pinterest must not use dynamic shared positioning');}};
w.eval(fs.readFileSync('content-studio.js','utf8'));w.eval(fs.readFileSync('content-pinterest.js','utf8'));
for(let i=0;i<8;i++)w.TAKPlatform.process();
const bar=d.querySelector('#host > [data-takoh-pinterest-toolbar]');assert(bar);assert.equal(bar.children.length,3);assert.equal(bar.querySelectorAll('.takoh-create-direct').length,1);assert.equal(d.querySelectorAll('[data-takoh-pinterest-toolbar]').length,2);assert.equal(d.querySelector('#detail > [data-takoh-pinterest-toolbar]').dataset.detail,'true');
assert.equal(w.getComputedStyle(bar).position,'absolute');assert.equal(w.getComputedStyle(bar).bottom,'10px');
bar.querySelector('.takoh-collect-reference').click();assert.equal(calls[0].reference.permalink,'https://www.pinterest.com/pin/111/');
bar.querySelector('.takoh-image-overlay-btn').click();assert.equal(calls[1].download[2].postId,'111');
let parentClicks=0;d.querySelector('#host').parentElement.addEventListener('click',()=>parentClicks++);bar.querySelector('.takoh-create-direct').click();assert.equal(parentClicks,0);assert.equal(calls[2].action,'studioCreateDirect');assert.equal(calls[2].reference.permalink,'https://www.pinterest.com/pin/111/');
const old=d.querySelector('#host img');old.remove();const video=d.createElement('video');video.src='https://v1.pinimg.com/test.mp4';size(video);d.getElementById('host').append(video);w.TAKPlatform.process();assert.equal(d.querySelectorAll('#host > [data-takoh-pinterest-toolbar]').length,1);assert.equal(d.querySelector('#host > [data-takoh-pinterest-toolbar]').dataset.kind,'video');assert.equal(d.querySelectorAll('#host .takoh-create-direct').length,1);
d.querySelector('[data-test-id=pin]').remove();w.TAKPlatform.process();assert.equal(d.querySelectorAll('[data-takoh-pinterest-toolbar]').length,1);dom.window.close();console.log('PASS: one stable Pinterest toolbar, ordered actions, detail placement, exact pin payloads, no click-through, recycled image/video cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});

