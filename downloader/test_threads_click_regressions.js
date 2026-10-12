const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

for (const hostname of ['www.threads.com', 'www.threads.net', 'kr.pinterest.com', 'www.pinterest.com', 'www.coupang.com', 'smartstore.naver.com', 'clip.naver.com']) {
  const listeners = {};
  let downloads = 0;
  let now = 2000;
  const buttons = [];
  function element() {
    return {
      listeners: {}, offsetWidth: 100, offsetHeight: 30,
      setAttribute() {}, remove() {},
      addEventListener(name, cb) {this.listeners[name] = cb;},
      contains(target) {return target === this || target?.parent === this;},
      getBoundingClientRect: () => ({left:0,right:100,top:0,bottom:30,width:100,height:30})
    };
  }
  const context = {
    console, Date: {now: () => now},
    window: {location:{href:`https://${hostname}/`,hostname}},
    document: {
      head: {appendChild() {}}, body: {contains: () => true},
      createElement: element, querySelectorAll: () => buttons,
      addEventListener(name, cb) {(listeners[name] ||= []).push(cb);}, dispatchEvent() {}
    },
    chrome: {runtime: {getURL:x=>x,onMessage:{addListener(){}}},
      storage: {local:{get:(keys,cb)=>cb({})},onChanged:{addListener(){}}}},
    CustomEvent: function(){}, MutationObserver:function(){this.observe=()=>{};},
    setTimeout(){},setInterval(){}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('content-core.js','utf8'),context);
  const btn = context.window.TAKCore.createDownloadButton('video',()=>downloads++);
  buttons.push(btn);
  const overlappingImage = context.window.TAKCore.createDownloadButton('image',()=>{throw new Error('Wrong image button triggered');});
  buttons.unshift(overlappingImage);
  assert.equal(btn.type,'button','download button must not submit comment forms');
  function event(target, path=[target]) {
    return {target,clientX:10,clientY:10,composedPath:()=>path,
      preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;}};
  }
  for (const action of ['comment','next-slide','dialog-close','keyboard-comment']) {
    for (const type of ['click','pointerdown','mousedown']) {
      const e = event({action});
      if (action === 'keyboard-comment') e.clientX=e.clientY=0;
      for (const handler of listeners[type] || []) handler(e);
      assert.equal(downloads,0,`${action} must not download`);
      assert.equal(e.prevented,undefined,`${action} must keep native behavior`);
    }
  }
  btn._takohClickHandler(event({action:'comment'}));
  assert.equal(downloads,0,'unrelated target must be rejected by button handler');
  const icon = {parent:btn};
  const click = event(icon,[icon,btn]);
  for (const handler of listeners.click) handler(click);
  btn.listeners.click(click);
  assert.equal(downloads,1,'icon inside real download button must download once');
  now += 1100;
  btn.listeners.click(event(btn,[btn]));
  assert.equal(downloads,2,'direct button click remains functional');
}
console.log('Click regressions passed: Threads/Pinterest navigation and overlapping image/video buttons');
