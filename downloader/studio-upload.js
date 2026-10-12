/* Durable extension upload queue. No repeated posting after uncertain failures. */
async function takohThreadsUpload(payload) {
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function wait(find,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const result=find();if(result)return result;await sleep(400);}throw new Error('Threads 화면 요소를 확인하지 못했습니다. 로그인·화면 구조를 확인하세요.');}
  const visible=el=>el&&el.getClientRects().length>0;
  const buttons=root=>[...root.querySelectorAll('button,[role="button"]')].filter(visible);
  const findButton=(root,pattern)=>buttons(root).find(el=>pattern.test((el.getAttribute('aria-label')||el.textContent||'').trim()));
  function fill(editor,value){editor.focus();if(editor.tagName==='TEXTAREA'){const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(editor,value);editor.dispatchEvent(new Event('input',{bubbles:true}));}else{document.execCommand('selectAll',false);document.execCommand('insertText',false,value);}if((editor.value||editor.innerText||editor.textContent).trim()!==value.trim())throw new Error('본문 입력 결과를 확인하지 못했습니다.');}
  const oldLinks=new Set([...document.querySelectorAll('a[href*="/post/"]')].map(a=>a.href));
  if(!document.querySelector('[role="dialog"] [role="textbox"], [role="dialog"] textarea')){
    const create=await wait(()=>findButton(document,/^(새 스레드|새로운 스레드|만들기|작성|Create|New thread)$/i));create.click();
  }
  const dialog=await wait(()=>[...document.querySelectorAll('[role="dialog"]')].find(d=>d.querySelector('[role="textbox"],textarea')));
  const editor=dialog.querySelector('[role="textbox"],textarea');fill(editor,payload.body);
  const input=await wait(()=>dialog.querySelector('input[type="file"]'));
  const binary=atob(payload.video);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const transfer=new DataTransfer();transfer.items.add(new File([bytes],payload.name,{type:'video/mp4'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  function status(text){let banner=document.getElementById('takoh-upload-status');if(!banner){banner=document.createElement('div');banner.id='takoh-upload-status';banner.style.cssText='position:fixed;bottom:20px;right:20px;padding:16px;background:#163d2a;color:white;z-index:2147483647;max-width:360px';document.body.append(banner);}banner.textContent=text;return banner;}
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  async function locatePost(){return wait(()=>[...document.querySelectorAll('a[href*="/post/"]')].find(a=>!oldLinks.has(a.href)&&/^https:\/\/(?:www\.)?threads\.(?:com|net)\//.test(a.href)&&normalize(a.closest('article,[role="article"], [data-pressable-container="true"]')?.innerText).includes(normalize(payload.body))),60000);}
  async function commentOnPost(link,automatic){link.click();const reply=await wait(()=>findButton(document,/^(답글|답글 달기|Reply)$/i));reply.click();const replyDialog=await wait(()=>[...document.querySelectorAll('[role="dialog"]')].find(d=>d.querySelector('[role="textbox"],textarea')));fill(replyDialog.querySelector('[role="textbox"],textarea'),payload.comment);if(!automatic){status('첫 댓글을 입력했습니다. 내용을 확인한 뒤 답글 게시 버튼을 눌러 주세요.');return;}const publish=await wait(()=>findButton(replyDialog,/^(게시|답글|Post|Reply)$/i));if(publish.getAttribute('aria-disabled')==='true'||publish.disabled)throw new Error('첫 댓글 게시 버튼이 아직 비활성입니다.');publish.click();await wait(()=>!document.body.contains(replyDialog));await wait(()=>[...document.querySelectorAll('article,[role="article"],[data-pressable-container="true"]')].some(el=>visible(el)&&normalize(el.innerText).includes(normalize(payload.comment))));}
  if(!payload.automatic){const banner=status('영상·본문을 입력했습니다. 확인 후 게시하세요. 게시 완료 후 아래 버튼으로 첫 댓글을 입력합니다.');const next=document.createElement('button');next.textContent='본문 게시 완료 · 첫 댓글 입력';next.onclick=async()=>{next.disabled=true;try{await commentOnPost(await locatePost(),false);}catch(error){status(error.message);}};banner.append(document.createElement('br'),next);return {state:'awaiting_confirmation'};}
  await wait(()=>dialog.querySelector('video')&&dialog.querySelector('video').readyState>=2,90000);
  const publish=await wait(()=>{const b=findButton(dialog,/^(게시|Post)$/i);return b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'?b:null;});
  publish.click();await wait(()=>!document.body.contains(dialog));
  const link=await locatePost();const permalink=link.href;
  try{await commentOnPost(link,true);}catch(error){return {state:'partial_success',permalink,error:error.message};}
  status('본문과 첫 댓글 게시를 화면에서 확인했습니다.');return {state:'posted',permalink};
}
(() => {
  let running=false;
  const key='studioUploadQueue';
  const packetUrl=value=>{try{const u=new URL(value);return /^http:\/\/127\.0\.0\.1:5005\/studio\/delivery\/[a-f0-9]{48}$/.test(u.href)?u.href:null;}catch{return null;}};
  let writes=Promise.resolve();
  function updateQueue(change){const operation=writes.catch(()=>{}).then(async()=>{const data=await chrome.storage.local.get(key);const queue=data[key]||[];const result=change(queue);await chrome.storage.local.set({[key]:queue});return result;});writes=operation;return operation;}
  async function state(id,updates){return updateQueue(queue=>{const item=queue.find(x=>x.id===id);if(item)Object.assign(item,updates);});}
  async function run(id){if(running){await chrome.alarms.create('takoh-upload-'+id,{when:Date.now()+60000});return;}running=true;try{const data=await chrome.storage.local.get(key);const item=(data[key]||[]).find(x=>x.id===id);if(!item||item.state!=='queued')return;if(item.when>Date.now()+1000){await chrome.alarms.create('takoh-upload-'+id,{when:item.when});return;}if(Date.now()-item.when>600000){await state(id,{state:'missed',error:'예약 시각을 10분 이상 지나 자동 게시하지 않았습니다.'});return;}const claimed=await updateQueue(queue=>{const current=queue.find(x=>x.id===id);if(!current||current.state!=='queued')return false;current.state='running';return true;});if(!claimed)return;
    const response=await fetch(item.url);if(!response.ok)throw new Error('도우미 업로드 작업을 읽지 못했습니다.');const payload=await response.json();const video=await fetch(item.url+'/video');if(!video.ok)throw new Error('저장된 영상을 읽지 못했습니다.');const bytes=new Uint8Array(await video.arrayBuffer());if(bytes.length>30*1024*1024)throw new Error('영상이 30MB를 넘습니다.');let encoded='';for(let i=0;i<bytes.length;i+=32768)encoded+=String.fromCharCode(...bytes.subarray(i,i+32768));payload.video=btoa(encoded);
    const tab=await chrome.tabs.create({url:'https://www.threads.com/',active:true});const end=Date.now()+60000;while((await chrome.tabs.get(tab.id)).status!=='complete'){if(Date.now()>end)throw new Error('Threads 페이지 로딩 시간 초과');await new Promise(r=>setTimeout(r,500));}
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:takohThreadsUpload,args:[payload]});await state(id,result.result||{state:'uncertain',error:'화면 실행 결과가 없습니다. Threads에서 직접 확인하세요.'});
  }catch(error){await state(id,{state:'uncertain',error:error.message});}finally{running=false;}}
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!['studioQueueUpload','studioUploadStatus','studioCancelUpload'].includes(message.action))return;
    if(sender.id!==chrome.runtime.id||!/^http:\/\/(127\.0\.0\.1|localhost):5005\/studio\//.test(sender.tab?.url||'')){reply({success:false,error:'제작 화면에서만 업로드를 등록할 수 있습니다.'});return;}
    if(!chrome.alarms?.create||!chrome.alarms?.onAlarm){reply({success:false,error:'예약 권한이 적용되지 않았습니다. Chrome 확장 관리에서 개발 확장을 새로고침하고 제작 화면도 새로고침하세요.'});return;}
    if(message.action==='studioUploadStatus'){chrome.storage.local.get(key).then(data=>reply({success:true,data:(data[key]||[]).map(({id,name,when,state,error,permalink})=>({id,name,when,state,error,permalink}))}));return true;}
    if(message.action==='studioCancelUpload'){(async()=>{const id=await updateQueue(queue=>{const item=queue.find(x=>x.id===message.packet?.id);if(!item||item.state!=='queued')throw new Error('대기 중인 예약만 취소할 수 있습니다.');item.state='cancelled';return item.id;});const item={id};await chrome.alarms.clear('takoh-upload-'+item.id);reply({success:true,data:{id:item.id}});})().catch(error=>reply({success:false,error:error.message}));return true;}
    (async()=>{const item=message.packet;const url=packetUrl(item?.url);if(!url||!Number.isFinite(item.when))throw new Error('업로드 작업 주소 또는 시각이 잘못되었습니다.');const result=await fetch(url);if(!result.ok)throw new Error('도우미 업로드 내용을 읽지 못했습니다.');const payload=await result.json();if(payload.id!==item.id||payload.when!==item.when)throw new Error('예약 정보가 일치하지 않습니다.');const added=await updateQueue(queue=>{if(queue.some(x=>x.id===item.id))return false;queue.push({...item,url,state:'queued',name:payload.name});return true;});if(added)await chrome.alarms.create('takoh-upload-'+item.id,{when:Math.max(Date.now()+1000,item.when)});reply({success:true,data:{id:item.id}});})().catch(error=>reply({success:false,error:error.message}));return true;
  });
  chrome.alarms?.onAlarm?.addListener(alarm=>{if(alarm.name.startsWith('takoh-upload-'))run(alarm.name.slice(13));});
  chrome.runtime.onStartup.addListener(async()=>{if(!chrome.alarms?.create)return;const data=await chrome.storage.local.get(key);for(const item of data[key]||[])if(item.state==='queued')await chrome.alarms.create('takoh-upload-'+item.id,{when:Math.max(Date.now()+1000,item.when)});else if(item.state==='running')await state(item.id,{state:'uncertain',error:'브라우저가 작업 중 종료되었습니다. Threads에서 게시 여부를 확인하세요.'});});
})();
