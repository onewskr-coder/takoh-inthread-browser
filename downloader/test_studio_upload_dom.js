const {JSDOM}=require(process.env.STUDIO_JSDOM||'jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs');
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
const source=fs.readFileSync('studio-upload.js','utf8').split('\n(() => {')[0];w.eval(source+'\nwindow.runUpload=takohThreadsUpload;');
const result=await w.runUpload({body,comment,name:'test.mp4',video:'AQID',automatic});
assert.equal(result.state,automatic?'posted':'awaiting_confirmation');
assert.equal(d.querySelectorAll('article').length,automatic?2:0);
dom.window.close();
}
console.log('Threads DOM fixture: media attachment, exact saved text, manual confirmation and automatic post/comment verification passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
