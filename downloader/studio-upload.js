/* Durable extension & native browser upload queue with human-touch Threads DOM interaction. No repeated posting after uncertain failures. */
async function takohThreadsUpload(payload) {
  const isJsdom=/jsdom/i.test((typeof navigator!=='undefined'?navigator.userAgent:'') + ' ' + (globalThis.navigator?.userAgent||''));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const rand=(min,max)=>Math.floor(min+Math.random()*(max-min+1));
  const humanPause=(min=420,max=980)=>sleep(isJsdom?2:rand(min,max));
  async function wait(find,timeout=45000,label='요소'){const end=Date.now()+timeout;while(Date.now()<end){const result=find();if(result)return result;await sleep(isJsdom?20:380);}throw new Error(`Threads 화면 요소(${label})를 확인하지 못했습니다. 로그인·화면 구조를 확인하세요.`);}
  const visible=el=>el&&el.getClientRects().length>0;
  const buttons=root=>[...root.querySelectorAll('button,[role="button"]')].filter(visible);
  const findButton=(root,pattern)=>buttons(root).find(el=>pattern.test((el.getAttribute('aria-label')||el.textContent||'').trim()));
  async function humanClick(el){
    if(!el)throw new Error('클릭할 화면 요소를 찾지 못했습니다.');
    try{el.scrollIntoView?.({behavior:'smooth',block:'center'});}catch{}
    await humanPause(160,360);
    const rect=el.getBoundingClientRect?.()||{left:0,top:0,width:0,height:0};
    const clientX=rect.width>4?Math.round(rect.left+rect.width*(0.3+Math.random()*0.4)):12;
    const clientY=rect.height>4?Math.round(rect.top+rect.height*(0.3+Math.random()*0.4)):12;
    const mouseInit={bubbles:true,cancelable:true,clientX,clientY,button:0,buttons:1};
    for(const type of ['pointerover','mouseover','pointermove','mousemove']){try{el.dispatchEvent(new MouseEvent(type,{...mouseInit,buttons:0}));}catch{}}
    await sleep(isJsdom?1:rand(35,85));
    for(const type of ['pointerdown','mousedown']){try{el.dispatchEvent(new MouseEvent(type,mouseInit));}catch{}}
    try{el.focus?.();}catch{}
    await sleep(isJsdom?1:rand(45,115));
    for(const type of ['pointerup','mouseup']){try{el.dispatchEvent(new MouseEvent(type,{...mouseInit,buttons:0}));}catch{}}
    el.click();
  }
  async function humanFill(editor,value){
    const parentDlg=editor.closest?.('[role="dialog"]');
    await humanClick(editor);
    if(!isJsdom&&!editor.isConnected){
      await sleep(220);
      const active=document.activeElement?.matches?.('[role="textbox"],textarea')?document.activeElement:null;
      editor=active||(parentDlg&&parentDlg.querySelector('[role="textbox"],textarea'))||[...document.querySelectorAll('[role="textbox"],textarea')].find(visible)||editor;
    }
    editor.focus();
    const chars=Array.from(String(value||''));
    const tag=String(editor.tagName||'').toUpperCase();
    if(tag==='TEXTAREA'||tag==='INPUT'){
      const proto=tag==='TEXTAREA'?globalThis.HTMLTextAreaElement?.prototype:globalThis.HTMLInputElement?.prototype;
      const setter=proto&&Object.getOwnPropertyDescriptor(proto,'value')?.set;
      let current='';
      const step=isJsdom?Math.max(1,chars.length):1;
      for(let i=0;i<chars.length;i+=step){
        const chunk=chars.slice(i,i+step).join('');
        current+=chunk;
        try{editor.dispatchEvent(new KeyboardEvent('keydown',{key:chunk,bubbles:true,cancelable:true}));}catch{}
        if(setter)setter.call(editor,current);else editor.value=current;
        try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,data:chunk,inputType:'insertText'}));}catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
        try{editor.dispatchEvent(new KeyboardEvent('keyup',{key:chunk,bubbles:true}));}catch{}
        if(!isJsdom)await sleep(/[\s.,!?~\n]/.test(chunk)?rand(85,190):rand(24,68));
      }
      editor.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      const normText=s=>String(s||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
      const rebindEditor=()=>{
        if(isJsdom||editor.isConnected)return editor;
        const active=document.activeElement?.matches?.('[role="textbox"],textarea')?document.activeElement:null;
        const scoped=parentDlg&&[...parentDlg.querySelectorAll('[role="textbox"],textarea')].find(visible);
        const fallback=[...document.querySelectorAll('[role="textbox"],textarea')].filter(visible).pop();
        editor=active||scoped||fallback||editor;
        try{editor.focus?.();}catch{}
        return editor;
      };
      const selectAllInEditor=()=>{
        try{
          rebindEditor();
          editor.focus();
          const sel=window.getSelection?.();
          if(sel){
            const range=document.createRange();
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          document.execCommand?.('selectAll',false);
        }catch{}
      };
      selectAllInEditor();
      try{document.execCommand?.('delete',false);}catch{}
      await humanPause(120,260);
      for(let idx=0;idx<chars.length;idx++){
        const ch=chars[idx];
        rebindEditor();
        if(idx===0&&normText(editor.value||editor.innerText||editor.textContent))selectAllInEditor();
        try{editor.dispatchEvent(new KeyboardEvent('keydown',{key:ch==='\n'?'Enter':ch,bubbles:true,cancelable:true}));}catch{}
        let inserted=false;
        try{
          if(document.execCommand){
            inserted=ch==='\n'?(document.execCommand('insertLineBreak',false)||document.execCommand('insertParagraph',false)||document.execCommand('insertText',false,'\n')):document.execCommand('insertText',false,ch);
          }
        }catch{}
        if(!inserted){
          try{editor.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,data:ch==='\n'?null:ch,inputType:ch==='\n'?'insertParagraph':'insertText'}));}catch{}
          try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,data:ch==='\n'?null:ch,inputType:ch==='\n'?'insertParagraph':'insertText'}));}catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
        }
        try{editor.dispatchEvent(new KeyboardEvent('keyup',{key:ch==='\n'?'Enter':ch,bubbles:true}));}catch{}
        if(!isJsdom)await sleep(/[\s.,!?~\n]/.test(ch)?rand(90,210):rand(26,74));
      }
      rebindEditor();
      const normNoSpace=s=>String(s||'').replace(/#광고|#[^\s#]+/g,'').replace(/[\u200B-\u200D\uFEFF\s]+/g,'');
      if(!normNoSpace(editor.value||editor.innerText||editor.textContent)){
        selectAllInEditor();
        try{if(!document.execCommand?.('insertText',false,value))editor.textContent=value;}catch{editor.textContent=value;}
      }
    }
    const normCheck=s=>String(s||'').replace(/#광고|#[^\s#]+/g,'').replace(/[\u200B-\u200D\uFEFF\s]+/g,'');
    const actualFinal=normCheck(editor.value||editor.innerText||editor.textContent);
    if(!actualFinal.includes(normCheck(value)))throw new Error('본문 입력 결과를 확인하지 못했습니다.');
    await humanPause(320,680);
    return editor;
  }
  const extractPostId=href=>{const m=String(href||'').match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/);return m?m[1]:'';};
  const extractPostAuthor=href=>{const m=String(href||'').match(/\/@([A-Za-z0-9._]+)\/(?:post|t)\//);return m?m[1].toLowerCase():'';};
  const detectActiveAccount=()=>{
    const explicit=String(payload.expectedUsername||payload.username||'').replace(/^@/,'').trim().toLowerCase();
    if(explicit)return explicit;
    const profLinks=[...document.querySelectorAll('nav a[href^="/@"], header a[href^="/@"]')];
    for(const a of profLinks){
      const m=String(a.getAttribute('href')||'').match(/^\/@([A-Za-z0-9._]+)\/?$/);
      if(m)return m[1].toLowerCase();
    }
    return '';
  };
  let expectedAccount=detectActiveAccount();
  const oldLinks=new Set();
  const oldPostIds=new Set();
  const snapshotExistingPosts=()=>{
    for(const a of document.querySelectorAll('a[href*="/post/"],a[href*="/t/"]')){
      if(a.href)oldLinks.add(a.href);
      const pid=extractPostId(a.href||a.getAttribute('href'));
      if(pid)oldPostIds.add(pid);
    }
    const curPid=extractPostId(location.pathname);
    if(curPid)oldPostIds.add(curPid);
  };
  snapshotExistingPosts();
  const uploadStartedAt=Date.now();
  function status(text){let banner=document.getElementById('takoh-upload-status');if(!banner){banner=document.createElement('div');banner.id='takoh-upload-status';banner.style.cssText='position:fixed;bottom:20px;right:20px;padding:16px;background:#163d2a;color:white;z-index:2147483647;max-width:360px';document.body.append(banner);}banner.textContent=text;return banner;}
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  const stripTagsAndUrls=value=>normalize(String(value||'').replace(/#광고|#[^\s#]+/g,'').replace(/https?:\/\/\S+/g,''));
  const cleanBodyFull=stripTagsAndUrls(payload.body)||normalize(payload.body);
  const bodyMatchText=cleanBodyFull.slice(0,24)||normalize(payload.body).slice(0,24);
  const bodySegments=(()=>{
    if(!cleanBodyFull)return [];
    if(cleanBodyFull.length<=36)return [cleanBodyFull];
    const segLen=Math.min(28,Math.max(12,Math.floor(cleanBodyFull.length/3)));
    const midStart=Math.max(0,Math.floor((cleanBodyFull.length-segLen)/2));
    return [...new Set([
      cleanBodyFull.slice(0,segLen),
      cleanBodyFull.slice(midStart,midStart+segLen),
      cleanBodyFull.slice(-segLen)
    ].map(s=>s.trim()).filter(Boolean))];
  })();
  const matchesFullBody=containerText=>{
    const normContainer=normalize(containerText);
    const strippedContainer=stripTagsAndUrls(containerText);
    if(!cleanBodyFull)return Boolean(normContainer);
    if(strippedContainer.includes(cleanBodyFull)||normContainer.includes(cleanBodyFull))return true;
    const compactContainer=strippedContainer.replace(/[^\p{L}\p{N}]+/gu,'');
    const compactBody=cleanBodyFull.replace(/[^\p{L}\p{N}]+/gu,'');
    if(compactBody&&compactContainer.includes(compactBody))return true;
    if(bodySegments.length>=2&&bodySegments.every(seg=>strippedContainer.includes(seg)||normContainer.includes(seg)))return true;
    return false;
  };
  const isStaleTimestamp=container=>{
    if(!container)return false;
    const timeEl=container.querySelector?.('time[datetime]');
    if(timeEl){
      const dt=Date.parse(timeEl.getAttribute('datetime')||'');
      if(Number.isFinite(dt)&&dt<uploadStartedAt-120000)return true;
    }
    return false;
  };
  const matchesAccount=(a,container)=>{
    if(!expectedAccount)return true;
    const urlAuthor=extractPostAuthor(a.href||a.getAttribute('href'));
    if(urlAuthor)return urlAuthor===expectedAccount;
    if(container){
      const authorAnchors=[...container.querySelectorAll('a[href^="/@"]')];
      const authors=authorAnchors.map(el=>{const m=String(el.getAttribute('href')||'').match(/^\/@([A-Za-z0-9._]+)(?:\/|$)/);return m?m[1].toLowerCase():'';}).filter(Boolean);
      if(authors.length>0)return authors[0]===expectedAccount;
    }
    return true;
  };
  const findPostLink=()=>[...document.querySelectorAll('a[href*="/post/"]')].find(a=>{
    if(!a.href||oldLinks.has(a.href))return false;
    const pid=extractPostId(a.href);
    if(!pid||oldPostIds.has(pid))return false;
    if(!/^https:\/\/(?:www\.)?threads\.(?:com|net)\//.test(a.href))return false;
    const isToastView=/^(보기|View)$/i.test((a.textContent||'').trim());
    const container=a.closest('article,[role="article"], [data-pressable-container="true"]');
    if(isToastView&&!container){
      return matchesAccount(a,null);
    }
    if(!container)return false;
    if(!matchesAccount(a,container))return false;
    if(isStaleTimestamp(container))return false;
    return matchesFullBody(container.innerText);
  });
  async function locatePost(){
    let found=findPostLink();
    if(found)return found;
    if(!isJsdom){
      await sleep(2200);
      found=findPostLink();
      if(found)return found;
      const prof=[...document.querySelectorAll('nav a[href^="/@"], header a[href^="/@"], a[href^="/@"]')].find(a=>/프로필|profile/i.test((a.textContent||'')+(a.getAttribute('aria-label')||''))||/^\/@[A-Za-z0-9._]+$/.test(a.getAttribute('href')||''));
      if(prof){
        const m=String(prof.getAttribute('href')||'').match(/^\/@([A-Za-z0-9._]+)\/?$/);
        if(m&&!expectedAccount)expectedAccount=m[1].toLowerCase();
        try{await humanClick(prof);}catch{prof.click();}
      }
    }
    return wait(()=>findPostLink(),60000,'새 게시물 링크(ID·계정·본문 일치)');
  }
  async function commentOnPost(link,automatic){
    await humanPause(480,1050);
    if(link && location.href!==link.href)await humanClick(link);
    const commentSnippet=normalize(String(payload.comment||'').replace(/#광고|#[^\s#]+/g,'').replace(/https?:\/\/\S+/g,'')).slice(0,24)||normalize(payload.comment).slice(0,24);
    const hasReply=()=>[...document.querySelectorAll('article,[role="article"],[data-pressable-container="true"],main')].some(el=>visible(el)&&!el.closest('[role="dialog"]')&&normalize(el.innerText).includes(commentSnippet));
    if(!isJsdom&&commentSnippet&&hasReply())return;
    const findModalReplyDialog=()=>{
      const dlgs=[...document.querySelectorAll('[role="dialog"]')].filter(d=>visible(d)&&d.querySelector('[role="textbox"],textarea')&&!/새로운 스레드|New thread/i.test(d.innerText||''));
      return dlgs.length?{dialog:dlgs[dlgs.length-1],editor:dlgs[dlgs.length-1].querySelector('[role="textbox"],textarea'),inline:false}:null;
    };
    const findInlineReplyEditor=()=>{
      const inlineEditors=[...document.querySelectorAll('[role="textbox"],textarea')].filter(el=>visible(el)&&!el.closest('[role="dialog"]'));
      if(!inlineEditors.length)return null;
      const ed=inlineEditors[inlineEditors.length-1];
      const container=ed.closest('form,[role="region"]')||ed.parentElement?.parentElement?.parentElement?.parentElement?.parentElement||document.body;
      return {dialog:container,editor:ed,inline:true};
    };
    if(!findModalReplyDialog()){
      const reply=buttons(document).find(el=>!el.closest('[role="dialog"]')&&/^(답글|답글 달기|Reply|답글을 달았습니다)(?:\s*\d+)?$/i.test((el.getAttribute('aria-label')||el.textContent||'').trim()))||(!findInlineReplyEditor()?await wait(()=>buttons(document).find(el=>!el.closest('[role="dialog"]')&&/^(답글|답글 달기|Reply|답글을 달았습니다)(?:\s*\d+)?$/i.test((el.getAttribute('aria-label')||el.textContent||'').trim())),45000,'답글버튼'):null);
      if(reply){
        await humanClick(reply);
        if(!isJsdom){
          const modalWaitEnd=Date.now()+2800;
          while(Date.now()<modalWaitEnd&&!findModalReplyDialog())await sleep(180);
        }
      }
    }
    let {dialog:replyDialog,editor:replyEditor,inline:isInlineReply}=await wait(()=>{
      const d=findModalReplyDialog()||findInlineReplyEditor();
      if(d)return d;
      const dlg=[...document.querySelectorAll('[role="dialog"]')].find(el=>visible(el)&&el.querySelector('[role="textbox"],textarea'));
      if(dlg&&isJsdom)return {dialog:dlg,editor:dlg.querySelector('[role="textbox"],textarea')};
      return null;
    },45000,'답글입력창');
    await humanPause(320,680);
    replyEditor=(await humanFill(replyEditor,payload.comment))||replyEditor;
    replyDialog=replyEditor.closest?.('[role="dialog"]')||replyDialog;
    if(!automatic){status('휴먼터치로 첫 댓글을 입력했습니다. 내용을 확인한 뒤 답글 게시 버튼을 눌러 주세요.');return;}
    const scope=replyDialog||replyEditor.parentElement?.parentElement?.parentElement?.parentElement||document;
    const publish=await wait(()=>{
      const candidates=buttons(scope).filter(el=>/^(게시|답글|Post|Reply)$/i.test((el.getAttribute('aria-label')||el.textContent||'').trim())&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');
      if(candidates.length)return candidates[candidates.length-1];
      const docCandidates=buttons(document).filter(el=>/^(게시|답글|Post|Reply)$/i.test((el.getAttribute('aria-label')||el.textContent||'').trim())&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');
      return docCandidates.length?docCandidates[docCandidates.length-1]:null;
    },45000,'답글게시버튼');
    await humanPause(450,950);
    await humanClick(publish);
    if(replyDialog&&!isInlineReply)await wait(()=>!document.body.contains(replyDialog)||!visible(replyDialog)||!normalize(replyDialog.innerText).includes(commentSnippet),45000,'답글모달닫힘');
    if(!hasReply()&&link&&location.href!==link.href){try{await humanClick(link);}catch{}}
    await wait(hasReply,45000,'답글노출');
  }
  function buildDataTransfer(){
    const transfer=new DataTransfer();
    if(Array.isArray(payload.files)&&payload.files.length>0){
      if(!Array.isArray(payload.loadedFiles)||payload.loadedFiles.length!==payload.files.length){
        throw new Error('캐러셀 전체 파일을 확보하지 못해 게시를 차단했습니다.');
      }
    }
    if(Array.isArray(payload.loadedFiles)&&payload.loadedFiles.length>0){
      for(let idx=0;idx<payload.loadedFiles.length;idx++){
        const f=payload.loadedFiles[idx];
        const b64=f&&(f.base64||f.b64);
        if(!b64)throw new Error(`캐러셀 ${idx+1}번째 파일 데이터가 누락되어 게시를 차단했습니다.`);
        const binary=atob(b64);
        if(!binary.length)throw new Error(`캐러셀 ${idx+1}번째 파일이 비어 있어 게시를 차단했습니다.`);
        const bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        transfer.items.add(new File([bytes],f.name||'media.jpg',{type:f.mime||((f.kind==='image'||/\.jpe?g$|\.png$|\.webp$/i.test(f.name||''))?'image/jpeg':'video/mp4')}));
      }
      return transfer;
    }
    if(!payload.video)throw new Error('업로드할 미디어 데이터가 없어 게시를 차단했습니다.');
    const binary=atob(payload.video);
    if(!binary.length)throw new Error('업로드할 미디어 파일이 비어 있어 게시를 차단했습니다.');
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const mime=payload.mime||((payload.kind==='image'||/\.jpe?g$|\.png$|\.webp$/i.test(payload.name||''))?'image/jpeg':'video/mp4');
    transfer.items.add(new File([bytes],payload.name||(mime==='image/jpeg'?'media.jpg':'video.mp4'),{type:mime}));
    return transfer;
  }

  // Pre-validate media integrity before touching the DOM
  let preparedTransfer;
  try{
    preparedTransfer=buildDataTransfer();
  }catch(error){
    return {state:'uncertain',error:error.message};
  }

  const targetPlatform=String(payload.platform||'threads').trim();

  // --- Instagram Reels & Carousel Upload ---
  if(!isJsdom&&(targetPlatform==='instagram_reels'||targetPlatform==='instagram_carousel'||/instagram\.com/i.test(location.hostname))){
    const isCarousel=targetPlatform==='instagram_carousel'||(Array.isArray(payload.loadedFiles)&&payload.loadedFiles.length>1);
    const modeLabel=isCarousel?'인스타그램 캐러셀(다중 이미지)':'인스타그램 릴스(영상)';
    status(`${modeLabel} 업로드를 시작합니다...`);
    if(!document.querySelector('[role="dialog"] input[type="file"]')){
      const createBtn=await wait(()=>{
        const bySvg=[...document.querySelectorAll('a,button,[role="button"],[role="link"]')].find(el=>visible(el)&&(/^(만들기|새 게시물|Create|New post)$/i.test((el.getAttribute('aria-label')||el.textContent||'').trim())||el.querySelector('svg[aria-label*="만들기"],svg[aria-label*=" 새로운 게시물"],svg[aria-label*="New post"],svg[aria-label*="Create"]')));
        return bySvg||findButton(document,/^(만들기|새 게시물|Create|New post)$/i);
      },45000,'인스타그램 만들기(+) 버튼');
      await humanClick(createBtn);
      await humanPause(400,800);
      const subPostBtn=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],span')].find(el=>visible(el)&&/^(게시물|Post)$/i.test((el.textContent||'').trim()));
      if(subPostBtn){try{await humanClick(subPostBtn);}catch{}}
    }
    const fileInput=await wait(()=>document.querySelector('[role="dialog"] input[type="file"]')||document.querySelector('input[type="file"]'),45000,'인스타그램 파일 선택창');
    await humanPause(300,650);
    fileInput.files=preparedTransfer.files;
    fileInput.dispatchEvent(new Event('input',{bubbles:true}));
    fileInput.dispatchEvent(new Event('change',{bubbles:true}));
    await humanPause(1200,2000);
    // Dismiss "릴스로 공유됩니다 / OK" popup if shown
    const okPopup=findButton(document,/^(확인|OK|알겠습니다|Got it)$/i);
    if(okPopup){try{await humanClick(okPopup);await humanPause(400,700);}catch{}}
    // Step 1 -> Step 2 (Crop -> Filter/Edit) -> Step 3 (Caption)
    for(let step=0;step<2;step++){
      const nextBtn=await wait(()=>{
        const dlg=document.querySelector('[role="dialog"]')||document;
        return findButton(dlg,/^(다음|Next)$/i);
      },45000,'다음(Next) 버튼');
      await humanClick(nextBtn);
      await humanPause(900,1500);
    }
    const captionEditor=await wait(()=>{
      const dlg=document.querySelector('[role="dialog"]')||document;
      return [...dlg.querySelectorAll('[role="textbox"],textarea,[contenteditable="true"]')].find(visible);
    },45000,'인스타그램 문구 입력창');
    if(payload.body){
      await humanFill(captionEditor,payload.body);
    }
    if(!payload.automatic){
      status(`휴먼터치로 ${modeLabel} 미디어와 본문을 입력했습니다. 화면에서 확인 후 [공유하기] 버튼을 눌러 주세요.`);
      return {state:'awaiting_confirmation',permalink:location.href};
    }
    const shareBtn=await wait(()=>{
      const dlg=document.querySelector('[role="dialog"]')||document;
      return findButton(dlg,/^(공유하기|공유|Share)$/i);
    },45000,'공유하기(Share) 버튼');
    await humanPause(600,1200);
    await humanClick(shareBtn);
    status(`${modeLabel} 공유하기를 실행했습니다. 업로드 완료 여부를 확인하세요.`);
    return {state:'posted',permalink:location.href};
  }

  // --- TikTok Upload (Video & Photo/Carousel Mode) ---
  if(!isJsdom&&(targetPlatform==='tiktok'||/tiktok\.com/i.test(location.hostname))){
    const isImageUpload=payload.kind==='image'||payload.publish_format==='image'||payload.publish_format==='carousel'||(Array.isArray(payload.loadedFiles)&&payload.loadedFiles.length>0&&payload.loadedFiles.every(f=>f.kind==='image'||/^image\//i.test(f.mime||'')));
    const modeLabel=isImageUpload?'틱톡(TikTok) 이미지·포토 슬라이드':'틱톡(TikTok) 영상';
    status(`${modeLabel} 업로드를 시작합니다...`);
    const fileInput=await wait(()=>{
      if(isImageUpload){
        return document.querySelector('input[type="file"][accept*="image"]')||document.querySelector('input[type="file"]');
      }
      return document.querySelector('input[type="file"][accept*="video"]')||document.querySelector('input[type="file"]');
    },45000,'틱톡 파일 입력');
    await humanPause(350,750);
    fileInput.files=preparedTransfer.files;
    fileInput.dispatchEvent(new Event('input',{bubbles:true}));
    fileInput.dispatchEvent(new Event('change',{bubbles:true}));
    const captionEditor=await wait(()=>[...document.querySelectorAll('[contenteditable="true"],[role="textbox"],textarea')].find(visible),60000,'틱톡 설명 입력창');
    await humanPause(800,1400);
    if(payload.body){
      await humanFill(captionEditor,payload.body);
    }
    if(!payload.automatic){
      status(`휴먼터치로 ${modeLabel}와 설명을 입력했습니다. 화면에서 확인 후 [게시(Post)] 버튼을 눌러 주세요.`);
      return {state:'awaiting_confirmation',permalink:location.href};
    }
    const postBtn=await wait(()=>findButton(document,/^(게시|업로드|Post|Publish)$/i),60000,'틱톡 게시 버튼');
    await humanPause(700,1300);
    await humanClick(postBtn);
    status(`${modeLabel} 게시 버튼을 클릭했습니다.`);
    return {state:'posted',permalink:location.href};
  }

  // --- Naver Clip Upload (Video & Image/Multi-Image) ---
  if(!isJsdom&&(targetPlatform==='naver_clip'||/naver\.com/i.test(location.hostname))){
    const isImageUpload=payload.kind==='image'||payload.publish_format==='image'||payload.publish_format==='carousel'||(Array.isArray(payload.loadedFiles)&&payload.loadedFiles.length>0&&payload.loadedFiles.every(f=>f.kind==='image'||/^image\//i.test(f.mime||'')));
    const modeLabel=isImageUpload?'네이버 클립(Naver Clip) 이미지·슬라이드':'네이버 클립(Naver Clip) 영상';
    status(`${modeLabel} 업로드를 시작합니다...`);
    const fileInput=await wait(()=>{
      if(isImageUpload){
        return document.querySelector('input[type="file"][accept*="image"]')||document.querySelector('input[type="file"]');
      }
      return document.querySelector('input[type="file"][accept*="video"]')||document.querySelector('input[type="file"]');
    },45000,'네이버 클립 파일 입력');
    await humanPause(350,750);
    fileInput.files=preparedTransfer.files;
    fileInput.dispatchEvent(new Event('input',{bubbles:true}));
    fileInput.dispatchEvent(new Event('change',{bubbles:true}));
    await humanPause(1200,2000);
    const nextBtn=findButton(document,/^(다음|확인|완료|Next)$/i);
    if(nextBtn){try{await humanClick(nextBtn);await humanPause(800,1400);}catch{}}
    const editor=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"],input[type="text"]')].find(visible);
    if(editor&&payload.body){
      try{await humanFill(editor,payload.body);}catch{}
    }
    if(!payload.automatic){
      status(`휴먼터치로 ${modeLabel}와 본문을 입력했습니다. 화면에서 확인 후 등록 버튼을 눌러 주세요.`);
      return {state:'awaiting_confirmation',permalink:location.href};
    }
    const publishBtn=findButton(document,/^(등록|발행|게시|올리기|완료)$/i);
    if(publishBtn){
      await humanPause(600,1100);
      await humanClick(publishBtn);
      status(`${modeLabel} 등록 버튼을 클릭했습니다.`);
      return {state:'posted',permalink:location.href};
    }
    status(`${modeLabel}와 본문을 채웠습니다. 화면에서 최종 등록 버튼을 눌러 주세요.`);
    return {state:'awaiting_confirmation',permalink:location.href};
  }

  // --- Threads Upload (Single/Multi Image, Video, Carousel, Optional First Comment) ---
  const hasComment=Boolean(String(payload.comment||'').trim());
  if(!document.querySelector('[role="dialog"] [role="textbox"], [role="dialog"] textarea')){
    const create=await wait(()=>findButton(document,/^(새 스레드|새로운 스레드|만들기|작성|Create|New thread)$/i),45000,'작성버튼');
    await humanClick(create);
  }
  const dialog=await wait(()=>[...document.querySelectorAll('[role="dialog"]')].find(d=>visible(d)&&d.querySelector('[role="textbox"],textarea')),45000,'작성모달');
  if(!expectedAccount){
    const dlgUserLink=dialog.querySelector('a[href^="/@"]');
    const dlgMatch=String(dlgUserLink?.getAttribute('href')||'').match(/^\/@([A-Za-z0-9._]+)\/?$/);
    if(dlgMatch)expectedAccount=dlgMatch[1].toLowerCase();
  }
  await humanPause(350,750);
  const editor=dialog.querySelector('[role="textbox"],textarea');
  await humanFill(editor,payload.body);
  const input=await wait(()=>dialog.querySelector('input[type="file"]'),45000,'파일입력');
  await humanPause(280,620);
  input.files=preparedTransfer.files;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  if(!payload.automatic){
    if(!hasComment){
      status('휴먼터치로 미디어·본문을 입력했습니다. 화면에서 확인 후 [게시] 버튼을 눌러 주세요.');
      return {state:'awaiting_confirmation'};
    }
    const banner=status('휴먼터치로 영상·본문을 입력했습니다. 확인 후 게시하세요. 게시 완료 후 아래 버튼으로 첫 댓글을 입력합니다.');
    const next=document.createElement('button');
    next.textContent='본문 게시 완료 · 첫 댓글 입력';
    next.onclick=async()=>{next.disabled=true;try{await commentOnPost(await locatePost(),false);}catch(error){status(error.message);}};
    banner.append(document.createElement('br'),next);
    return {state:'awaiting_confirmation'};
  }
  const isImageFile=f=>Boolean(f&&(f.kind==='image'||(typeof f.mime==='string'&&f.mime.startsWith('image/'))||/\.(?:jpe?g|png|webp|gif)$/i.test(f.name||'')));
  const expectImageOnly=(payload.kind==='image'||(typeof payload.mime==='string'&&payload.mime.startsWith('image/'))||/\.(?:jpe?g|png|webp|gif)$/i.test(payload.name||''))||(Array.isArray(payload.loadedFiles)&&payload.loadedFiles.length>0&&payload.loadedFiles.every(isImageFile));
  if(expectImageOnly){
    await wait(()=>dialog.querySelector('img')||dialog.querySelector('video'),45000,'이미지미리보기');
  }else{
    await wait(()=>(dialog.querySelector('video')&&dialog.querySelector('video').readyState>=2)||dialog.querySelector('img'),90000,'영상미리보기');
  }
  await humanPause(650,1400);
  snapshotExistingPosts();
  const publish=await wait(()=>{const b=findButton(dialog,/^(게시|Post)$/i);return b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'?b:null;},45000,'본문게시버튼');
  await humanClick(publish);
  await wait(()=>!document.body.contains(dialog)||!visible(dialog)||!normalize(dialog.innerText).includes(bodyMatchText),45000,'본문모달닫힘');
  const link=await locatePost();const permalink=link.href;
  if(hasComment){
    try{await commentOnPost(link,true);}catch(error){return {state:'partial_success',permalink,error:error.message};}
    status('휴먼터치로 본문과 첫 댓글 게시를 화면에서 확인했습니다.');
  }else{
    status('휴먼터치로 쓰레드 게시를 화면에서 확인했습니다.');
  }
  return {state:'posted',permalink};
}
(() => {
  let running=false;
  const key='studioUploadQueue';
  const packetUrl=value=>{try{const u=new URL(value);return /^http:\/\/127\.0\.0\.1:(?:5005|5006)\/studio\/delivery\/[a-f0-9]{48}$/.test(u.href)?u.href:null;}catch{return null;}};
  let writes=Promise.resolve();
  function updateQueue(change){const operation=writes.catch(()=>{}).then(async()=>{const data=await chrome.storage.local.get(key);const queue=data[key]||[];const result=change(queue);await chrome.storage.local.set({[key]:queue});return result;});writes=operation;return operation;}
  async function state(id,updates){return updateQueue(queue=>{const item=queue.find(x=>x.id===id);if(item)Object.assign(item,updates);});}
  async function run(id){if(running){await chrome.alarms.create('takoh-upload-'+id,{when:Date.now()+60000});return;}running=true;try{const data=await chrome.storage.local.get(key);const item=(data[key]||[]).find(x=>x.id===id);if(!item||item.state!=='queued')return;if(item.when>Date.now()+1000){await chrome.alarms.create('takoh-upload-'+id,{when:item.when});return;}if(Date.now()-item.when>600000){await state(id,{state:'missed',error:'예약 시각을 10분 이상 지나 자동 게시하지 않았습니다.'});return;}const claimed=await updateQueue(queue=>{const current=queue.find(x=>x.id===id);if(!current||current.state!=='queued')return false;current.state='running';return true;});if(!claimed)return;
    const response=await fetch(item.url);if(!response.ok)throw new Error('도우미 업로드 작업을 읽지 못했습니다.');const payload=await response.json();
    if(Array.isArray(payload.files)&&payload.files.length>0){
      if(payload.files.length>10)throw new Error('캐러셀 미디어가 10개를 초과하여 게시를 차단했습니다.');
      const loadedFiles=[];
      for(let idx=0;idx<payload.files.length;idx++){
        const f=payload.files[idx];
        const partPath=String(f?.part||'').trim();
        if(!partPath)throw new Error(`캐러셀 ${idx+1}번째 파일 경로가 누락되어 게시를 차단했습니다.`);
        const fRes=await fetch(item.url+'/'+partPath);
        if(!fRes||!fRes.ok)throw new Error(`캐러셀 ${idx+1}/${payload.files.length}번째 파일 다운로드 실패로 게시를 차단했습니다.`);
        const fBytes=new Uint8Array(await fRes.arrayBuffer());
        if(fBytes.length===0)throw new Error(`캐러셀 ${idx+1}/${payload.files.length}번째 파일이 비어 있어 게시를 차단했습니다.`);
        if(fBytes.length>30*1024*1024)throw new Error(`캐러셀 ${idx+1}/${payload.files.length}번째 파일이 30MB를 넘어 게시를 차단했습니다.`);
        let fEnc='';for(let i=0;i<fBytes.length;i+=32768)fEnc+=String.fromCharCode(...fBytes.subarray(i,i+32768));
        loadedFiles.push({name:f.name||`media-${idx+1}.jpg`,mime:f.mime||'image/jpeg',kind:f.kind||'image',base64:btoa(fEnc)});
      }
      if(loadedFiles.length!==payload.files.length)throw new Error('캐러셀 전체 파일을 확보하지 못해 게시를 차단했습니다.');
      payload.loadedFiles=loadedFiles;
      payload.video=loadedFiles[0].base64;
    }else{
      const video=await fetch(item.url+'/video');if(!video.ok)throw new Error('저장된 영상을 읽지 못했습니다.');const bytes=new Uint8Array(await video.arrayBuffer());if(bytes.length===0)throw new Error('미디어 파일이 비어 있어 게시를 차단했습니다.');if(bytes.length>30*1024*1024)throw new Error('영상이 30MB를 넘습니다.');let encoded='';for(let i=0;i<bytes.length;i+=32768)encoded+=String.fromCharCode(...bytes.subarray(i,i+32768));payload.video=btoa(encoded);
    }
    const plat=payload.platform||item.platform||'threads';
    const targetUrl=plat==='instagram_reels'||plat==='instagram_carousel'?'https://www.instagram.com/':plat==='naver_clip'?'https://clipcreators.naver.com/web':plat==='tiktok'?'https://www.tiktok.com/tiktokstudio/upload':'https://www.threads.com/';
    const tab=await chrome.tabs.create({url:targetUrl,active:true});const end=Date.now()+60000;while((await chrome.tabs.get(tab.id)).status!=='complete'){if(Date.now()>end)throw new Error('페이지 로딩 시간 초과');await new Promise(r=>setTimeout(r,500));}
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:takohThreadsUpload,args:[payload]});await state(id,result.result||{state:'uncertain',error:'화면 실행 결과가 없습니다. 플랫폼에서 직접 확인하세요.'});
  }catch(error){await state(id,{state:'uncertain',error:error.message});}finally{running=false;}}
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!['studioQueueUpload','studioUploadStatus','studioCancelUpload'].includes(message.action))return;
    if(sender.id!==chrome.runtime.id||!/^http:\/\/(127\.0\.0\.1|localhost):(5005|5006)\/studio\//.test(sender.tab?.url||'')){reply({success:false,error:'제작 화면에서만 업로드를 등록할 수 있습니다.'});return;}
    if(!chrome.alarms?.create||!chrome.alarms?.onAlarm){reply({success:false,error:'예약 권한이 적용되지 않았습니다. Chrome 확장 관리에서 개발 확장을 새로고침하고 제작 화면도 새로고침하세요.'});return;}
    if(message.action==='studioUploadStatus'){chrome.storage.local.get(key).then(data=>reply({success:true,data:(data[key]||[]).map(({id,name,when,state,error,permalink,platform,publish_format})=>({id,name,when,state,error,permalink,platform:platform||'threads',publish_format:publish_format||'video'}))}));return true;}
    if(message.action==='studioCancelUpload'){(async()=>{const id=await updateQueue(queue=>{const item=queue.find(x=>x.id===message.packet?.id);if(!item||item.state!=='queued')throw new Error('대기 중인 예약만 취소할 수 있습니다.');item.state='cancelled';return item.id;});const item={id};await chrome.alarms.clear('takoh-upload-'+item.id);reply({success:true,data:{id:item.id}});})().catch(error=>reply({success:false,error:error.message}));return true;}
    (async()=>{const item=message.packet;const url=packetUrl(item?.url);if(!url||!Number.isFinite(item.when))throw new Error('업로드 작업 주소 또는 시각이 잘못되었습니다.');const result=await fetch(url);if(!result.ok)throw new Error('도우미 업로드 내용을 읽지 못했습니다.');const payload=await result.json();if(payload.id!==item.id||payload.when!==item.when)throw new Error('예약 정보가 일치하지 않습니다.');const added=await updateQueue(queue=>{if(queue.some(x=>x.id===item.id))return false;queue.push({...item,url,state:'queued',name:payload.name,platform:payload.platform||item.platform||'threads',publish_format:payload.publish_format||item.publish_format||'video'});return true;});if(added)await chrome.alarms.create('takoh-upload-'+item.id,{when:Math.max(Date.now()+1000,item.when)});reply({success:true,data:{id:item.id}});})().catch(error=>reply({success:false,error:error.message}));return true;
  });
  chrome.alarms?.onAlarm?.addListener(alarm=>{if(alarm.name.startsWith('takoh-upload-'))run(alarm.name.slice(13));});
  chrome.runtime.onStartup.addListener(async()=>{if(!chrome.alarms?.create)return;const data=await chrome.storage.local.get(key);for(const item of data[key]||[])if(item.state==='queued')await chrome.alarms.create('takoh-upload-'+item.id,{when:Math.max(Date.now()+1000,item.when)});else if(item.state==='running')await state(item.id,{state:'uncertain',error:'브라우저가 작업 중 종료되었습니다. 플랫폼에서 게시 여부를 확인하세요.'});});
})();
