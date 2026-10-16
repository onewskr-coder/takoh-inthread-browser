const {JSDOM}=require(process.env.STUDIO_JSDOM||'jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
for(const automatic of [false,true]){
const dom=new JSDOM('<button id="create">만들기</button>',{url:'https://www.threads.com/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLElement.prototype.getClientRects=function(){return [1];};
Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
Object.defineProperty(w.HTMLInputElement.prototype,'files',{get(){return this._files;},set(value){this._files=value;}});
w.DataTransfer=class{constructor(){this.files=[];this.items={add:item=>this.files.push(item)};}};
const body='#광고\n\n테스트 영상 소개',comment='#광고\n수수료 고지\nhttps://shop.test';
d.getElementById('create').onclick=()=>{
 const dialog=d.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<textarea></textarea><input type="file"><button id="post">게시</button>';d.body.append(dialog);
 dialog.querySelector('input').onchange=()=>{const video=d.createElement('video');Object.defineProperty(video,'readyState',{value:2});dialog.append(video);};
 dialog.querySelector('#post').onclick=()=>{assert.equal(dialog.querySelector('textarea').value,body);assert.equal(dialog.querySelector('input').files[0].name,'test.mp4');dialog.remove();const article=d.createElement('article');article.innerHTML='<a href="https://www.threads.com/@owner/post/NEW">시간</a><p></p><button id="reply">답글</button>';article.querySelector('p').textContent=body;d.body.append(article);article.querySelector('#reply').onclick=()=>{const reply=d.createElement('div');reply.setAttribute('role','dialog');reply.innerHTML='<textarea></textarea><button>게시</button>';d.body.append(reply);reply.querySelector('button').onclick=()=>{assert.equal(reply.querySelector('textarea').value,comment);reply.remove();const text=d.createElement('article');text.textContent=comment;d.body.append(text);};};};
};
const source=fs.readFileSync(path.join(__dirname,'studio-upload.js'),'utf8').split(/\r?\n\(\(\) => \{/)[0];w.eval(source+'\nwindow.runUpload=takohThreadsUpload;');
const result=await w.runUpload({body,comment,name:'test.mp4',video:'AQID',automatic});
assert.equal(result.state,automatic?'posted':'awaiting_confirmation');
assert.equal(d.querySelectorAll('article').length,automatic?2:0);
console.log('Passed Test 1: automatic='+automatic);
dom.window.close();
}

// Test 2: Partial carousel (2 files expected, 1 missing in loadedFiles) blocks before opening compose dialog
{
const dom=new JSDOM('<button id="create">만들기</button>',{url:'https://www.threads.com/',runScripts:'outside-only'}),w=dom.window,d=w.document;
let createClicked=false;
d.getElementById('create').onclick=()=>{createClicked=true;};
w.HTMLElement.prototype.getClientRects=function(){return [1];};
Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
w.DataTransfer=class{constructor(){this.files=[];this.items={add:item=>this.files.push(item)};}};
const source=fs.readFileSync(path.join(__dirname,'studio-upload.js'),'utf8').split(/\r?\n\(\(\) => \{/)[0];w.eval(source+'\nwindow.runUpload=takohThreadsUpload;');
const resPartial=await w.runUpload({
 body:'#광고\n\n캐러셀 테스트',
 comment:'',
 automatic:true,
 files:[{part:'file/0',name:'s1.jpg',mime:'image/jpeg'},{part:'file/1',name:'s2.jpg',mime:'image/jpeg'}],
 loadedFiles:[{name:'s1.jpg',mime:'image/jpeg',b64:'AQID'}]
});
assert.equal(resPartial.state,'uncertain');
assert.match(resPartial.error||'',/전체 파일을 확보하지 못해 게시를 차단/);
assert.equal(createClicked,false);
console.log('Passed Test 2: partial carousel');
dom.window.close();
}

// Test 3: Old post with identical 24-char prefix, old post ID, or wrong account is never chosen as the new post result
{
const body='#광고\n\n공통 도입부 문구입니다 스물네글자 이상 동일한 앞부분이지만 뒤쪽 핵심 본문은 완전히 다른 이번 신상품 전용 설명입니다.';
const oldSimilarBody='#광고\n\n공통 도입부 문구입니다 스물네글자 이상 동일한 앞부분이지만 뒤쪽은 예전에 올렸던 과거 게시물 내용입니다.';
const dom=new JSDOM(`
 <header><a href="/@owner">프로필</a></header>
 <button id="create">만들기</button>
 <article id="old-exact"><a href="https://www.threads.com/@owner/post/OLD_EXACT_ID">1일</a><p>${body}</p></article>
`,{url:'https://www.threads.com/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLElement.prototype.getClientRects=function(){return [1];};
Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
Object.defineProperty(w.HTMLInputElement.prototype,'files',{get(){return this._files;},set(value){this._files=value;}});
w.DataTransfer=class{constructor(){this.files=[];this.items={add:item=>this.files.push(item)};}};
d.getElementById('create').onclick=()=>{
 const dialog=d.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<textarea></textarea><input type="file"><button id="post">게시</button>';d.body.append(dialog);
 dialog.querySelector('input').onchange=()=>{const img=d.createElement('img');Object.defineProperty(img,'complete',{value:true});dialog.append(img);};
 dialog.querySelector('#post').onclick=()=>{
  dialog.remove();
  // Inject a post from another account with exact body, and a post from @owner with same prefix but different suffix, plus the real new post
  const otherAcc=d.createElement('article');
  otherAcc.innerHTML='<a href="https://www.threads.com/@other_user/post/OTHER_NEW_ID">방금</a><p></p>';
  otherAcc.querySelector('p').textContent=body;
  d.body.append(otherAcc);

  const prefixOnly=d.createElement('article');
  prefixOnly.innerHTML='<a href="https://www.threads.com/@owner/post/SIMILAR_PREFIX_ID">방금</a><p></p>';
  prefixOnly.querySelector('p').textContent=oldSimilarBody;
  d.body.append(prefixOnly);

  const realNew=d.createElement('article');
  realNew.innerHTML='<a href="https://www.threads.com/@owner/post/REAL_NEW_ID_999">방금</a><p></p>';
  realNew.querySelector('p').textContent=body;
  d.body.append(realNew);
 };
};
const source=fs.readFileSync(path.join(__dirname,'studio-upload.js'),'utf8').split(/\r?\n\(\(\) => \{/)[0];w.eval(source+'\nwindow.runUpload=takohThreadsUpload;');
const resVerify=await w.runUpload({
 body,
 comment:'',
 automatic:true,
 files:[{part:'file/0',name:'s1.jpg',mime:'image/jpeg'},{part:'file/1',name:'s2.jpg',mime:'image/jpeg'}],
 loadedFiles:[{name:'s1.jpg',mime:'image/jpeg',b64:'AQID'},{name:'s2.jpg',mime:'image/jpeg',b64:'BAUG'}]
});
assert.equal(resVerify.state,'posted');
assert.equal(resVerify.permalink,'https://www.threads.com/@owner/post/REAL_NEW_ID_999');
dom.window.close();
}

console.log('Threads DOM fixture: media attachment, exact saved text, partial carousel block, and strict new-post ID/account/body verification passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
