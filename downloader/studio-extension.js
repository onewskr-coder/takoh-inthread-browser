/* Shared service-worker/panel bridge; no helper token or remote credentials. */
(() => {
  const cleanUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
  function cleanReference(ref) {
    if(!ref||typeof ref!=='object')throw new Error('게시물 정보가 없습니다.');
    const permalink=cleanUrl(ref.permalink);if(!permalink)throw new Error('HTTPS 게시물 주소가 필요합니다.');
    const urls=key=>(Array.isArray(ref[key])?ref[key]:[]).slice(0,30).map(cleanUrl).filter(Boolean);
    const poster=cleanUrl(ref.poster);
    const thumbnailUrl=cleanUrl(ref.thumbnailUrl);
    return {id:permalink,permalink,mediaKind:['video','image'].includes(ref.mediaKind)?ref.mediaKind:'auto',username:String(ref.username||'').slice(0,200),text:String(ref.text||'').slice(0,10000),
      imageUrls:urls('imageUrls'),videoUrls:urls('videoUrls'),
      poster:poster||'',thumbnailUrl:thumbnailUrl||poster||'',
      savedAt:Date.now(),state:'discovered'};
  }
  function open(ref) {
    const payload=cleanReference(ref),hash=encodeURIComponent(JSON.stringify(payload));
    if(hash.length>48000)throw new Error('게시물 정보가 너무 큽니다.');
    return chrome.tabs.create({url:'http://127.0.0.1:5005/studio/#reference='+hash});
  }
  globalThis.TAKStudioExtension={cleanReference,open};
  async function downloadItem(id) {
    const data=await chrome.storage.local.get('history');
    const owned=(data.history||[]).find(item=>item.downloadId===id);
    if(!owned)throw new Error('이 다운로더에서 받은 파일이 아닙니다. 파일 선택을 사용하세요.');
    const [item]=await chrome.downloads.search({id});
    if(!item||item.state!=='complete'||item.exists===false)throw new Error('다운로드가 완료되지 않았거나 파일이 삭제되었습니다.');
    if(!/\.(mp4|webm|mov|mkv|m4v|jpg|jpeg|png|webp|gif|bmp|tiff)$/i.test(item.filename))throw new Error('영상·이미지 파일만 제작에 사용할 수 있습니다.');
    return {downloadId:id,path:item.filename,name:item.filename.split(/[\\/]/).pop(),completed:true,
      type:owned.type,source:cleanUrl(owned.sourceUrl)||'',platform:owned.platform};
  }
  async function downloadList(){
    const data=await chrome.storage.local.get('history'),items=[];
    for(const entry of (data.history||[]).slice(0,100)){
      if(!Number.isInteger(entry.downloadId))continue;
      try{const item=await downloadItem(entry.downloadId);items.push(item);}catch{}
    }
    return items;
  }
  globalThis.TAKStudioExtension.downloadItem=downloadItem;
  if(typeof document==='undefined'){
    let pending=Promise.resolve();
    chrome.runtime.onMessage.addListener((message,sender,reply)=>{
      if(['studioListDownloads','studioGetDownload','studioListReferences'].includes(message.action)){
        if(sender.id!==chrome.runtime.id||!/^http:\/\/(127\.0\.0\.1|localhost):5005\/studio\//.test(sender.tab?.url||'')){reply({success:false,error:'제작 화면에서만 파일을 연결할 수 있습니다.'});return;}
        (message.action==='studioListReferences'?chrome.storage.local.get('studioReferences').then(data=>(data.studioReferences||[]).map(cleanReference)):message.action==='studioListDownloads'?downloadList():downloadItem(message.downloadId))
          .then(data=>reply({success:true,data})).catch(error=>reply({success:false,error:error.message}));
        return true;
      }
      if(message.action!=='studioSaveReference')return;
      pending=pending.catch(()=>{}).then(async()=>{
        const ref=cleanReference(message.reference),data=await chrome.storage.local.get('studioReferences');
        const previous=(data.studioReferences||[]).find(item=>item.permalink===ref.permalink);
        if(previous)for(const key of ['imageUrls','videoUrls'])ref[key]=[...new Set([...(previous[key]||[]),...ref[key]])].slice(0,30);
        const refs=(data.studioReferences||[]).filter(item=>item.permalink!==ref.permalink);
        refs.unshift(ref);await chrome.storage.local.set({studioReferences:refs.slice(0,100)});
        reply({success:true});
      }).catch(error=>reply({success:false,error:error.message}));
      return true;
    });
    return;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const list=document.getElementById('studio-references');
    if(!list)return;
    async function render(){const data=await chrome.storage.local.get('studioReferences');list.replaceChildren();
      for(const ref of data.studioReferences||[]){
        const card=document.createElement('div');card.className='studio-ref-card';
        card.style.cssText='display:flex;gap:10px;padding:10px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(255,255,255,0.03);align-items:center;';
        const thumbBox=document.createElement('div');
        thumbBox.style.cssText='width:60px;height:60px;border-radius:6px;background:#222;overflow:hidden;flex-shrink:0;position:relative;display:flex;align-items:center;justify-content:center;';
        const thumbUrl=ref.thumbnailUrl||ref.poster||ref.imageUrls?.[0];
        const img=document.createElement('img');img.alt='썸네일';
        img.style.cssText='width:100%;height:100%;object-fit:cover;';
        const fallback=document.createElement('span');
        fallback.style.cssText='font-size:10px;color:#888;text-align:center;padding:2px;';
        fallback.textContent=ref.videoUrls?.length?'영상':'이미지';
        if(thumbUrl){
          img.src=thumbUrl;
          img.onerror=()=>{img.hidden=true;fallback.hidden=false;};
          img.onload=()=>{img.hidden=false;fallback.hidden=true;};
          thumbBox.append(img);
        }
        fallback.hidden=!!thumbUrl;
        thumbBox.append(fallback);
        const badge=document.createElement('span');
        badge.style.cssText='position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:1px 3px;border-radius:3px;';
        const vCount=(ref.videoUrls||[]).length, iCount=(ref.imageUrls||[]).length;
        badge.textContent=vCount&&iCount?`V${vCount}/I${iCount}`:vCount?`V${vCount}`:`I${iCount||1}`;
        thumbBox.append(badge);

        const infoBox=document.createElement('div');
        infoBox.style.cssText='flex:1;min-width:0;';
        const label=document.createElement('p');
        label.style.cssText='margin:0 0 6px;font-size:11px;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent=ref.text?.slice(0,140)||ref.permalink;
        const btnBox=document.createElement('div');
        btnBox.style.cssText='display:flex;gap:6px;';
        const select=document.createElement('button');
        select.type='button';select.style.cssText='padding:4px 8px;font-size:11px;background:#10b981;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;';
        select.textContent='분석 · 상품 찾기';
        select.onclick=()=>{try{open(ref);}catch(e){label.textContent=e.message;}};
        const remove=document.createElement('button');
        remove.type='button';remove.style.cssText='padding:4px 8px;font-size:11px;background:transparent;color:#ef4444;border:1px solid rgba(239,68,68,0.4);border-radius:4px;cursor:pointer;';
        remove.textContent='삭제';
        remove.onclick=async()=>{
          const fresh=await chrome.storage.local.get('studioReferences');
          await chrome.storage.local.set({studioReferences:(fresh.studioReferences||[]).filter(x=>x.permalink!==ref.permalink)});
        };
        btnBox.append(select,remove);
        infoBox.append(label,btnBox);
        card.append(thumbBox,infoBox);
        list.append(card);
      }if(!list.children.length)list.textContent='콘텐츠의 수집 버튼을 누르면 여기에 보관됩니다.';
    }
    chrome.storage.onChanged.addListener(changes=>{if(changes.studioReferences)render();});render();
  });
})();
