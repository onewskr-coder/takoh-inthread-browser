/* Reference collection inside the downloader, bound to its media controls. */
(() => {
  const https = value => {try {const u=new URL(value,location.href);return u.protocol==='https:'?u.href:null;}catch{return null;}};
  function reference(media) {
    const tileLink=media.closest('a[href*="/p/"],a[href*="/reel/"]');
    if(tileLink&&!media.closest('article,[role="article"],[role="dialog"]')&&/(^|\.)instagram\.com$/.test(location.hostname)){
      const permalink=https(tileLink.href),thumbnailUrl=https(media.tagName==='VIDEO'?media.poster:media.currentSrc||media.src||(getComputedStyle(media).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]))||'';
      return {id:permalink,permalink,mediaKind:'media',username:'',text:media.alt||'',imageUrls:[],videoUrls:[],poster:thumbnailUrl,thumbnailUrl};
    }
    let boundary=media.closest('article, shreddit-post, [role="article"]');
    if (!boundary) for(let node=media.parentElement;node&&node!==document.body;node=node.parentElement){
      const links=Array.from(node.querySelectorAll('a[href*="/post/"],a[href*="/p/"],a[href*="/reel/"],a[href*="/status/"],a[href*="/pin/"]'));
      const urls=[...new Set(links.map(a=>https(a.href)).filter(Boolean))];
      if(urls.length===1){boundary=node;break;}if(urls.length>1)break;
    }
    const links=Array.from(boundary?.querySelectorAll('a[href*="/post/"],a[href*="/p/"],a[href*="/reel/"],a[href*="/status/"],a[href*="/pin/"]')||[]);
    const urls=[...new Set(links.map(a=>https(a.href)).filter(Boolean))];
    let source=(media.currentSrc||media.src)?https(media.currentSrc||media.src):null;
    if(media.tagName==='VIDEO'&&window.TAKPinterest){
      const id=window.TAKPinterest.findPinId(media);
      source=window.TAKPinterest.structuredVideoUrl(document,id,location.pathname.includes('/pin/'+id))||source;
    }
    const detail=/\/(?:post|pin|p|reel|status|shorts|clip)\//.test(location.pathname)||location.pathname==='/watch';
    let permalink=urls.length===1?urls[0]:detail?https(location.href):source;
    const pinId=window.TAKPinterest?.findPinId(media);
    if(pinId)permalink='https://www.pinterest.com/pin/'+pinId+'/';
    const poster=media.tagName==='VIDEO'?(media.poster||media.getAttribute('poster')||window.TAKPinterest?.structuredThumbnailUrl(document,pinId)||''):'';
    const posterUrl=poster?https(poster):'';
    const thumbnailUrl=media.tagName==='IMG'&&source?source:posterUrl;
    return {id:permalink,permalink,mediaKind:media.tagName==='VIDEO'?'video':'image',username:'',text:(urls.length<=1?boundary?.innerText||'':'').slice(0,10000),
      imageUrls:media.tagName==='IMG'&&source?[source]:[],videoUrls:media.tagName==='VIDEO'&&source?[source]:[],
      poster:posterUrl||'',thumbnailUrl:thumbnailUrl||''};
  }
  function attach(controls,media,fixed=false) {
    if(controls.classList.contains('takoh-collect-reference')||controls.querySelector('.takoh-collect-reference')||(controls.tagName==='BUTTON'&&controls.dataset.takohStudioAttached))return;
    controls.dataset.takohStudioAttached='true';
    const button=document.createElement('button');button.type='button';
    button.className='takoh-collect-reference';button.textContent='수집';button.title='이 콘텐츠를 인스레드 치트키 보관함에 추가';
    button.style.cssText='pointer-events:auto;padding:6px 9px;border:0;border-radius:8px;background:#5b48dc;color:white;cursor:pointer;font-size:12px;z-index:2147483647;';
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend'])button.addEventListener(type,e=>e.stopPropagation(),true);
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const failed=()=>window.TAKCore.showToast('studio-'+Date.now(),'수집 연결 끊김','확장이 갱신되었습니다. 이 콘텐츠 페이지를 새로고침한 뒤 다시 수집하세요.','error');
      try{
      const runtime=typeof chrome==='undefined'?null:chrome.runtime;
      if(!runtime?.id||typeof runtime.sendMessage!=='function'){failed();return;}
      runtime.sendMessage({action:'studioSaveReference',reference:reference(controls.__takohMedia||media)},response=>{
        try{
        const error=runtime.lastError;
        window.TAKCore.showToast('studio-'+Date.now(),error||!response?.success?'수집 실패':'보관함에 추가',error?.message||response?.error||'확장 패널에서 분석할 콘텐츠를 선택하세요.',error||!response?.success?'error':'success');
        }catch{failed();}
      });
      }catch{failed();}
    },true);
    if(controls.tagName==='BUTTON'){
      controls.parentElement.appendChild(button);
      window.TAKCore.anchorMediaControls(button,media,fixed);
    }else controls.appendChild(button);
  }
  window.TAKStudio={attach,reference};
})();
