/* Reference collection & direct studio creation inside the downloader, bound to post or media controls. */
(() => {
  const https = value => {try {const u=new URL(value,location.href);return u.protocol==='https:'?u.href:null;}catch{return null;}};
  function findPostBoundary(target) {
    if (!target || !target.closest) return null;
    if (target.dataset?.takohPostBoundary === 'true') return target;
    let boundary = target.closest('article, shreddit-post, [role="article"]');
    if (!boundary) {
      for (let node = target; node && node !== document.body; node = node.parentElement) {
        const links = Array.from(node.querySelectorAll('a[href*="/post/"],a[href*="/p/"],a[href*="/reel/"],a[href*="/status/"],a[href*="/pin/"]'));
        const postIds = [...new Set(links.map(a => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/\/(?:post|p|reel|status|pin)\/([\w-]+)/);
          return m ? m[1] : https(a.href);
        }).filter(Boolean))];
        if (postIds.length === 1) { boundary = node; break; }
        if (postIds.length > 1) break;
      }
    }
    return boundary;
  }
  function reference(target) {
    if (!target) return null;
    const isMedia = target.tagName === 'VIDEO' || target.tagName === 'IMG';
    const media = isMedia ? target : (target.querySelector?.('video') || target.querySelector?.('img') || target);
    const tileLink = media.closest?.('a[href*="/p/"],a[href*="/reel/"]');
    if (tileLink && !media.closest('article,[role="article"],[role="dialog"]') && /(^|\.)instagram\.com$/.test(location.hostname)) {
      const permalink = https(tileLink.href);
      const thumbnailUrl = https(media.tagName === 'VIDEO' ? media.poster : media.currentSrc || media.src || (getComputedStyle(media).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1])) || '';
      return {id:permalink,permalink,mediaKind:'media',username:'',text:media.alt||'',imageUrls:[],videoUrls:[],poster:thumbnailUrl,thumbnailUrl};
    }
    const boundary = findPostBoundary(target) || (isMedia ? findPostBoundary(media) : target);
    const links = Array.from((boundary || target)?.querySelectorAll?.('a[href*="/post/"],a[href*="/p/"],a[href*="/reel/"],a[href*="/status/"],a[href*="/pin/"]') || []);
    const cleanPostUrls = [...new Set(links.map(a => {
      const u = https(a.href);
      if (!u) return null;
      return u.replace(/\/media\/?(\?.*)?$/, '');
    }).filter(Boolean))];
    let source = isMedia && (media.currentSrc || media.src) ? https(media.currentSrc || media.src) : null;
    if (media?.tagName === 'VIDEO' && window.TAKPinterest) {
      const id = window.TAKPinterest.findPinId(media);
      source = window.TAKPinterest.structuredVideoUrl(document, id, location.pathname.includes('/pin/' + id)) || source;
    }
    const detail = /\/(?:post|pin|p|reel|status|shorts|clip)\//.test(location.pathname) || location.pathname === '/watch';
    let permalink = cleanPostUrls.length >= 1 ? cleanPostUrls[0] : detail ? https(location.href) : source;
    const pinId = isMedia ? window.TAKPinterest?.findPinId(media) : null;
    if (pinId) permalink = 'https://www.pinterest.com/pin/' + pinId + '/';
    const poster = media?.tagName === 'VIDEO' ? (media.poster || media.getAttribute('poster') || window.TAKPinterest?.structuredThumbnailUrl(document, pinId) || '') : '';
    const posterUrl = poster ? https(poster) : '';
    const thumbnailUrl = media?.tagName === 'IMG' && source ? source : posterUrl;

    // Collect all videos and content images inside this post boundary
    const videoSet = new Set();
    if (media?.tagName === 'VIDEO' && source) videoSet.add(source);
    const imageSet = new Set();
    if (media?.tagName === 'IMG' && source) imageSet.add(source);
    let extraPoster = posterUrl;
    let firstVideoEl = media?.tagName === 'VIDEO' ? media : null;
    let firstImgEl = media?.tagName === 'IMG' ? media : null;
    const scope = boundary || target;
    if (scope && scope.querySelectorAll) {
      for (const v of scope.querySelectorAll('video')) {
        if (!firstVideoEl) firstVideoEl = v;
        const vUrl = https(v.currentSrc || v.src || v.querySelector('source')?.src || '');
        if (vUrl) videoSet.add(vUrl);
        if (!extraPoster) {
          const vp = https(v.poster || v.getAttribute('poster') || '');
          if (vp) extraPoster = vp;
        }
      }
      for (const img of scope.querySelectorAll('img')) {
        const iUrl = https(img.currentSrc || img.src || '');
        if (!iUrl) continue;
        if (/\/t51\.(?:2885|12442)-19(?:\/|[._])|\/(?:profile_images|avatars?|emoji|emojis|communityIcon)(?:\/|[._-])/i.test(iUrl)) continue;
        const r = img.getBoundingClientRect?.() || { width: 0, height: 0 };
        const w = img.naturalWidth || img.width || r.width || 0;
        const h = img.naturalHeight || img.height || r.height || 0;
        if ((w > 0 && w < 100) || (h > 0 && h < 100)) continue;
        if (r.width > 0 && r.height > 0 && Math.min(r.width, r.height) < 72) continue;
        const alt = (img.alt || '').toLowerCase();
        if (alt.includes('profile picture') || alt.includes('프로필 사진') || alt.includes('avatar')) continue;
        if (img.closest('header, [data-testid*="avatar" i]')) continue;
        const a = img.closest('a[href]');
        if (a && /^\/@[^/]+\/?$/.test(new URL(a.href, location.href).pathname)) continue;
        if (!firstImgEl) firstImgEl = img;
        imageSet.add(iUrl);
      }
    }

    let thumbnailDataUrl = '';
    try {
      const snapTarget = (firstVideoEl && firstVideoEl.readyState >= 2 && firstVideoEl.videoWidth > 0) ? firstVideoEl : ((firstImgEl && firstImgEl.complete && firstImgEl.naturalWidth > 0) ? firstImgEl : null);
      if (snapTarget) {
        const sw = snapTarget.videoWidth || snapTarget.naturalWidth || 320;
        const sh = snapTarget.videoHeight || snapTarget.naturalHeight || 320;
        const scale = Math.min(1, 360 / Math.max(sw, sh, 1));
        const cw = Math.max(1, Math.round(sw * scale));
        const ch = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(snapTarget, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl && dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length < 220000) {
          thumbnailDataUrl = dataUrl;
        }
      }
    } catch {}

    // Extract clean post text (excluding our own injected toolbar labels)
    let rawText = '';
    if (scope) {
      const clone = scope.cloneNode(true);
      clone.querySelectorAll?.('.takoh-threads-toolbar, .threads-download-btn-container, .takoh-positioned-controls, [data-takoh-threads-controls], [data-takoh-pinterest-toolbar]').forEach(el => el.remove());
      rawText = (clone.innerText || '').trim();
    }

    if (!permalink || !/(^|\.)(threads\.com|threads\.net|instagram\.com|pinterest\.com)$/i.test((() => { try { return new URL(permalink).hostname; } catch { return ''; } })())) {
      const userLink = scope?.querySelector?.('a[href^="/@"]');
      const uHref = userLink ? https(userLink.href) : null;
      permalink = cleanPostUrls[0] || uHref || https(location.href) || [...videoSet][0] || [...imageSet][0] || 'https://www.threads.com/';
    }

    const mediaKind = videoSet.size > 0 ? 'video' : (imageSet.size > 0 ? 'image' : 'text');
    const resolvedPoster = extraPoster || [...imageSet][0] || '';
    const resolvedThumb = thumbnailUrl || extraPoster || [...imageSet][0] || '';
    return {
      id: permalink,
      permalink,
      mediaKind,
      username: '',
      text: rawText.slice(0, 10000),
      imageUrls: [...imageSet],
      videoUrls: [...videoSet],
      poster: resolvedPoster,
      thumbnailUrl: resolvedThumb,
      thumbnailDataUrl
    };
  }
  function stopEvents(el){
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend'])el.addEventListener(type,e=>e.stopPropagation(),true);
  }
  function createStudioActionButtons(getTargetFn) {
    const button=document.createElement('button');button.type='button';
    button.className='takoh-collect-reference';button.textContent='📌 수집';button.title='이 게시물을 인스레드 치트키 보관함에 추가';
    button.style.cssText='pointer-events:auto;padding:5px 10px;border:1px solid rgba(139,92,246,0.45);border-radius:8px;background:rgba(91,72,220,0.9);color:white;cursor:pointer;font-size:12px;font-weight:600;z-index:2147483647;';
    stopEvents(button);
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const failed=()=>window.TAKCore.showToast('studio-'+Date.now(),'수집 연결 끊김','확장이 갱신되었습니다. 이 콘텐츠 페이지를 새로고침한 뒤 다시 수집하세요.','error');
      try{
      const runtime=typeof chrome==='undefined'?null:chrome.runtime;
      if(!runtime?.id||typeof runtime.sendMessage!=='function'){failed();return;}
      runtime.sendMessage({action:'studioSaveReference',reference:reference(getTargetFn())},response=>{
        try{
        const error=runtime.lastError;
        window.TAKCore.showToast('studio-'+Date.now(),error||!response?.success?'수집 실패':'보관함에 추가됨',error?.message||response?.error||'보관함에 저장되었습니다.',error||!response?.success?'error':'success');
        }catch{failed();}
      });
      }catch{failed();}
    },true);

    const directBtn=document.createElement('button');directBtn.type='button';
    directBtn.className='takoh-create-direct';directBtn.textContent='⚡ 바로 제작';directBtn.title='콘텐츠 제작 탭으로 이동해 이 게시물을 바로 편집·번역하고 업로드';
    directBtn.style.cssText='pointer-events:auto;padding:5px 11px;border:1px solid rgba(45,212,191,0.6);border-radius:8px;background:linear-gradient(135deg,#0f766e,#2563eb);color:white;cursor:pointer;font-size:12px;font-weight:700;z-index:2147483647;margin-left:4px;';
    stopEvents(directBtn);
    directBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const failed=()=>window.TAKCore.showToast('studio-direct-'+Date.now(),'제작 연결 실패','도우미 연결을 확인하고 다시 시도해 주세요.','error');
      try{
      const runtime=typeof chrome==='undefined'?null:chrome.runtime;
      if(!runtime?.id||typeof runtime.sendMessage!=='function'){failed();return;}
      const refData=reference(getTargetFn());
      window.TAKCore.showToast('studio-direct-'+Date.now(),'✦ 콘텐츠 제작 탭으로 이동','원본 본문과 미디어를 콘텐츠 제작 화면으로 불러옵니다.','info');
      runtime.sendMessage({action:'studioCreateDirect',reference:refData},response=>{
        try{
        const error=runtime.lastError;
        if(error||!response?.success){
          window.TAKCore.showToast('studio-direct-'+Date.now(),'바로 제작 실패',error?.message||response?.error||'도우미 서버를 확인하세요.','error');
        }
        }catch{failed();}
      });
      }catch{failed();}
    },true);

    return {button, directBtn};
  }
  function attach(controls,media,fixed=false) {
    if(controls.closest?.('[data-takoh-pinterest-toolbar]'))return;
    // On Threads, individual media controls only show the [저장] button;
    // [📌 수집] and [⚡ 바로 제작] are placed ONCE per post via attachPostToolbar!
    if (controls.classList.contains('takoh-threads-media-controls') && !controls.classList.contains('takoh-threads-modal-controls')) {
      return;
    }
    if(controls.classList.contains('takoh-collect-reference')||controls.querySelector('.takoh-collect-reference')||(controls.tagName==='BUTTON'&&controls.dataset.takohStudioAttached))return;
    controls.dataset.takohStudioAttached='true';
    const {button, directBtn} = createStudioActionButtons(() => controls.__takohPost || controls.__takohMedia || media);
    if(controls.tagName==='BUTTON'){
      controls.parentElement.appendChild(button);
      controls.parentElement.appendChild(directBtn);
      window.TAKCore.anchorMediaControls(button,media,fixed);
    }else{
      controls.appendChild(button);
      controls.appendChild(directBtn);
    }
  }
  const ACTION_LABEL_RE = /좋아요|Like|답글|댓글|Reply|리포스트|Repost|공유|Share|보내기|Send/i;
  const SHARE_LABEL_RE = /공유|Share|보내기|Send/i;
  const HEADER_EXCLUDE_RE = /프로필|Profile|메뉴|더\s*보기|More|팔로우|Follow|복사|Copy|인스타그램|Instagram/i;

  function findActionRowAndShareSlot(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return null;
    const candidates = Array.from(rootEl.querySelectorAll('svg[aria-label], svg title, [role="button"][aria-label], button[aria-label]'));
    const actionBtns = [];
    const seen = new Set();

    for (const node of candidates) {
      if (node.closest('div[role="dialog"], div[aria-modal="true"], header, nav')) continue;
      const label = (node.getAttribute?.('aria-label') || node.textContent || '').trim();
      if (!ACTION_LABEL_RE.test(label) || HEADER_EXCLUDE_RE.test(label)) continue;
      const btn = node.closest('[role="button"], button, a') || (node.tagName === 'TITLE' ? node.parentElement : node);
      if (!btn || !rootEl.contains(btn) || seen.has(btn)) continue;
      // 프로필 링크(/@username) 내부나 바로 옆 헤더 영역의 버튼은 제외
      if (btn.closest('a[href^="/@"]:not([href*="/post/"])')) continue;
      seen.add(btn);
      const r = btn.getBoundingClientRect();
      actionBtns.push({ btn, label, rect: r });
    }

    if (actionBtns.length < 2) return null;

    // 공유하기 버튼 후보들 중 같은 가로줄(수직 오차 28px 이내)에 다른 액션 버튼(좋아요/답글/리포스트)이 최소 1개 이상 함께 있는 진짜 하단 액션바의 공유하기 버튼을 선택
    const shareCandidates = actionBtns.filter(item => SHARE_LABEL_RE.test(item.label));
    let shareEntry = null;
    for (const cand of shareCandidates) {
      const peersOnSameRow = actionBtns.filter(other => other.btn !== cand.btn && Math.abs(other.rect.top - cand.rect.top) < 28);
      if (peersOnSameRow.length >= 1) {
        shareEntry = cand;
      }
    }
    if (!shareEntry) {
      // 공유하기 라벨이 없으면 가장 아래쪽 가로 액션줄의 마지막 버튼을 선택
      shareEntry = actionBtns[actionBtns.length - 1];
    }
    const targetBtn = shareEntry.btn;

    // targetBtn에서 부모를 타고 올라가며 좋아요/답글/리포스트/공유 아이콘들을 한 줄로 감싸는 액션 바 컨테이너(row)를 찾음
    let slotEl = targetBtn;
    let cur = targetBtn.parentElement;
    for (let depth = 0; depth < 6 && cur && cur !== rootEl && rootEl.contains(cur); depth++) {
      const containedOnRow = actionBtns.filter(item => cur.contains(item.btn) && Math.abs(item.rect.top - shareEntry.rect.top) < 32);
      // 만약 cur가 프로필 아바타나 게시물 본문 이미지/동영상까지 통째로 감싸는 상위 컨테이너라면 너무 많이 올라간 것!
      const containsMediaOrHeader = cur.querySelector('video, a[href*="/post/"] img, a[href^="/@"]:not([href*="/post/"])');
      if (containedOnRow.length >= 2 && !containsMediaOrHeader) {
        return { row: cur, slotEl, shareBtn: targetBtn };
      }
      if (containsMediaOrHeader) break;
      slotEl = cur;
      cur = cur.parentElement;
    }

    return null;
  }

  function updatePostToolbarPositions() {
    // Native DOM attachment scrolls at 60fps with the page automatically; no JS scroll repositioning needed.
  }

  function attachPostToolbar(postEl) {
    if (!postEl || !postEl.isConnected) return;
    // 이전에 body에 띄웠던 floating 잔여물이 있으면 정리
    document.querySelectorAll('.takoh-threads-toolbar-floating').forEach(el => el.remove());

    const slotInfo = findActionRowAndShareSlot(postEl);
    if (!slotInfo || !slotInfo.row) return;
    const { row, slotEl } = slotInfo;

    // 이미 이 액션 바(row)에 툴바가 붙어 있으면 스킵 (게시물당 정확히 1개 보장)
    if (row.querySelector(':scope > .takoh-threads-toolbar') || postEl.querySelector('.takoh-threads-toolbar')) {
      return;
    }

    postEl.dataset.takohPostBoundary = 'true';
    row.dataset.takohActionRow = 'true';

    const toolbar = document.createElement('div');
    toolbar.className = 'takoh-threads-toolbar';
    toolbar.setAttribute('data-takoh-threads-controls', 'true');
    toolbar.__takohPost = postEl;
    const {button, directBtn} = createStudioActionButtons(() => findPostBoundary(row) || postEl);
    toolbar.appendChild(button);
    toolbar.appendChild(directBtn);
    if(window.takohNative&&/(^|\.)(threads\.com|threads\.net)$/.test(location.hostname)){
      const find=document.createElement('button');find.type='button';find.className='takoh-find-products';find.textContent='동일·연관 쇼핑계정 찾기';find.title='이 영상과 동일·유사한 영상을 올리는 쇼핑 콘텐츠 계정 및 연관 게시물 탐색';find.style.cssText=button.style.cssText;stopEvents(find);
      find.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(find.disabled)return;find.disabled=true;try{const ref=reference(findPostBoundary(row)||postEl);const r=await window.takohNative.request({action:'studioFindProducts',url:ref.permalink});if(!r?.success)throw Error(r?.error||'탐색 시작 실패');}catch(error){window.TAKCore.showToast('research-'+Date.now(),'동일·연관 쇼핑계정 찾기',error.message,'error');}finally{find.disabled=false;}},true);toolbar.append(find);
    }


    // 액션 바(row)가 flex/grid 줄 안에서 자연스럽게 나란히 배치되도록 최소한의 안전한 스타일만 보강
    const rowStyle = window.getComputedStyle(row);
    if (rowStyle.display.includes('grid')) {
      row.style.setProperty('display', 'inline-flex', 'important');
      row.style.setProperty('align-items', 'center', 'important');
    } else if (rowStyle.display.includes('flex')) {
      row.style.setProperty('align-items', 'center', 'important');
    }
    row.style.setProperty('overflow', 'visible', 'important');

    if (slotEl && slotEl.parentElement === row) {
      slotEl.insertAdjacentElement('afterend', toolbar);
    } else {
      row.appendChild(toolbar);
    }
  }

  window.TAKStudio={attach,attachPostToolbar,updatePostToolbarPositions,reference,findPostBoundary,createStudioActionButtons};
})();
