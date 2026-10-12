/* TAKOH Media Downloader PRO - Pinterest Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  function pinIdFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    try {
      const parsed = new URL(url, location.href);
      if (!/(^|\.)pinterest\.(com|co\.kr)$/.test(parsed.hostname)) return '';
      return parsed.pathname.match(/^\/pin\/(?:[\w-]+--)?(\d+)(?:\/|$)/)?.[1] || '';
    } catch (e) { return ''; }
  }

  function findPinId(element) {
    const card = element?.closest('[data-test-id="pin"], div[role="listitem"]');
    const anchor = element?.closest('a[href*="/pin/"]') || card?.querySelector('a[href*="/pin/"]');
    const cardId = pinIdFromUrl(anchor?.href);
    const explicitId = card?.getAttribute?.('data-test-pin-id') || card?.getAttribute?.('data-pin-id');
    if (/^\d+$/.test(explicitId || '')) return explicitId;
    // Pinterest's main HLS player can sit inside a listitem without a permalink.
    if (element?.getAttribute?.('data-test-id') === 'duplo-hls-video') {
      return cardId || pinIdFromUrl(location.href);
    }
    // A recommendation card must never inherit the main detail pin's ID.
    if (card) return cardId;
    return cardId || pinIdFromUrl(location.href);
  }

  function isMp4(url) {
    try { return /^https?:$/.test(new URL(url).protocol) && /\.mp4(?:[?#]|$)/i.test(url); }
    catch (e) { return false; }
  }

  function structuredVideoUrl(doc, pinId, allowCanonical = false) {
    if (!pinId) return '';
    const canonicalId = allowCanonical ? pinIdFromUrl(doc.querySelector?.('link[rel="canonical"]')?.href) : '';
    let result = '';
    function visit(value) {
      if (!value || typeof value !== 'object' || result) return;
      if (value['@type'] === 'VideoObject' &&
          [pinId, canonicalId].filter(Boolean).includes(pinIdFromUrl(value['@id'] || value.url)) && isMp4(value.contentUrl)) {
        result = value.contentUrl;
        return;
      }
      if (String(value.id || value.pin_id || '') === pinId && value.videos?.video_list) {
        const formats = Object.values(value.videos.video_list)
          .filter(f => isMp4(f?.url)).sort((a,b) => (b.height || 0) - (a.height || 0));
        if (formats.length) { result = formats[0].url; return; }
      }
      for (const child of Object.values(value)) visit(child);
    }
    for (const script of doc.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]')) {
      try { visit(JSON.parse(script.textContent)); } catch (e) {}
    }
    return result;
  }

  function structuredThumbnailUrl(doc,pinId) {
    let result='';
    const visit=value=>{
      if(!value||typeof value!=='object'||result)return;
      if(value['@type']==='VideoObject'&&pinIdFromUrl(value['@id']||value.url)===pinId){
        const url=Array.isArray(value.thumbnailUrl)?value.thumbnailUrl[0]:value.thumbnailUrl;
        try{if(new URL(url).protocol==='https:')result=url;}catch{}
      }
      for(const child of Object.values(value))visit(child);
    };
    for(const script of doc.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]')){
      try{visit(JSON.parse(script.textContent));}catch{}
    }
    return result;
  }

  const pinRequests = new Map();
  async function resolveVideoUrl(video, pinId) {
    const direct = [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source')).map(s => s.src)].find(isMp4);
    if (direct) return direct;
    const embedded = structuredVideoUrl(document, pinId, pinIdFromUrl(location.href) === pinId);
    if (embedded) return embedded;
    if (!pinId) return '';
    if (!pinRequests.has(pinId)) {
      const pending = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(`${location.origin}/pin/${pinId}/`, {
            credentials: 'include', signal: controller.signal
          });
          if (!response.ok) return '';
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          return structuredVideoUrl(doc, pinId, true);
        } catch (e) { return ''; }
        finally { clearTimeout(timer); }
      })();
      pinRequests.set(pinId, pending);
    }
    const url = await pinRequests.get(pinId);
    // Signed media URLs and failed lookups must be refreshed on the next click.
    pinRequests.delete(pinId);
    if (url) return url;
    const settings = await new Promise(resolve => chrome.storage.local.get(['ytdlpApiUrl'], resolve));
    const helper = new URL(settings.ytdlpApiUrl || 'http://127.0.0.1:5005/download');
    helper.pathname = '/pinterest/resolve';
    helper.search = new URLSearchParams({url:`https://www.pinterest.com/pin/${pinId}/`}).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(helper.href, {signal:controller.signal});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '도우미 원본 추출 실패');
      if (result.pin_id !== pinId) throw new Error('도우미의 핀 ID가 일치하지 않습니다.');
      if (isMp4(result.media_url)) return result.media_url;
      if (result.requires_merge) {
        helper.pathname = '/download';
        helper.search = new URLSearchParams({url:`https://www.pinterest.com/pin/${pinId}/`,quality:'best'}).toString();
        return helper.href;
      }
      return '';
    } catch (e) {
      throw new Error(`원본 추출 실패: ${e.message}. 최신 도우미의 start_helper.bat을 실행해 주세요.`);
    } finally { clearTimeout(timer); }
  }

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'pinterest_user';
    let postId = 'pin';

    postId = findPinId(element) || 'pin';

    const ownerEl = document.querySelector('div[data-test-id="official-user-attribution"] a, div[data-test-id="creator-profile-link"] a');
    if (ownerEl) {
      const href = ownerEl.getAttribute('href') || '';
      const m = href.match(/\/([^/]+)\/$/);
      if (m) username = m[1];
    }

    const safeUser = username.replace(/[^a-zA-Z0-9가-힣_-]/g, '');
    const safeTitle = postId.replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim();

    return {
      username: safeUser,
      postId: safeTitle,
      title: safeTitle,
      filename: `${safeUser}_${safeTitle}`
    };
  }

  // Convert Pinterest thumbnail URL (736x/564x/236x) to original URL
  function getOriginalImageUrl(src) {
    if (!src) return '';
    if (src.includes('pinimg.com')) {
      return src.replace(/\/(736x|564x|474x|236x)\//, '/originals/');
    }
    return src;
  }

  function findTargetContainer(el) {
    if (!el) return null;
    return el.closest('[data-test-id="pin-detail-image"]') ||
           el.closest('[data-test-id="visual-search-crop-container"]') ||
           el.closest('[data-test-id="pin"]') ||
           el.closest('div[role="listitem"]') ||
           el.parentElement;
  }

  // Scanner: Attach overlay download buttons to Pinterest Images & Videos
  function scanForPinterestMedia() {
    // 1. Process Images
    if (config.enableImages) {
      const images = document.querySelectorAll('img[src*="pinimg.com"]');

      images.forEach(img => {
        if (!window.TAKCore.isContentImage(img, 'pinterest')) return;
        if (img.offsetWidth < 120 || img.offsetHeight < 120) return;

        const targetBox = findTargetContainer(img);
        if (!targetBox) return;
        if (img.src.includes('/videos/thumbnails/') || targetBox.querySelector('video')) return;

        if (targetBox.querySelector('.takoh-image-overlay-btn')) return;
        targetBox.dataset.takohButtonAttached = 'true';

        const style = window.getComputedStyle(targetBox);
        if (style.position === 'static') {
          targetBox.style.position = 'relative';
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'takoh-image-overlay-btn';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;flex-shrink:0;">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          <span>이미지 저장</span>
        `;

        Object.assign(btn.style, {
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: '2147483647',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          background: 'rgba(230, 0, 35, 0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        });

        btn.addEventListener('mouseenter', () => {
          btn.style.background = '#e60023';
          btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(230, 0, 35, 0.9)';
          btn.style.transform = 'scale(1)';
        });

        ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evtType => {
          btn.addEventListener(evtType, (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
          }, true);
        });

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const origSrc = getOriginalImageUrl(img.src);
          if (origSrc) {
            const meta = getPostMetadata(targetBox);
            meta.filename = `${meta.username}_${meta.postId}.jpg`;
            triggerDownload(origSrc, 'image', meta, 'pinterest');
          }
        }, true);

        targetBox.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btn, img);
      });
    }

    // 2. Process Videos
    if (config.enableVideos) {
      const videos = document.querySelectorAll('video');

      videos.forEach(videoEl => {
        if (videoEl.offsetWidth < 80 || videoEl.offsetHeight < 80) return;

        const targetBox = findTargetContainer(videoEl);
        if (!targetBox) return;

        if (targetBox.querySelector('.takoh-video-overlay-btn')) return;
        targetBox.dataset.takohVideoBtnAttached = 'true';

        const style = window.getComputedStyle(targetBox);
        if (style.position === 'static') {
          targetBox.style.position = 'relative';
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'takoh-video-overlay-btn';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;flex-shrink:0;">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          <span>동영상 저장</span>
        `;

        Object.assign(btn.style, {
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: '2147483647',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          background: 'rgba(230, 0, 35, 0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        });

        btn.addEventListener('mouseenter', () => {
          btn.style.background = '#e60023';
          btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(230, 0, 35, 0.9)';
          btn.style.transform = 'scale(1)';
        });

        ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evtType => {
          btn.addEventListener(evtType, (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
          }, true);
        });

        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (btn.disabled) return;
          btn.disabled = true;
          showToast('pinterest-resolve', '다운로드 준비 중', '이 핀의 원본 동영상을 확인하고 있습니다.', 'info');
          try {
            const meta = getPostMetadata(videoEl);
            const pinId = findPinId(videoEl);
            const videoUrl = await resolveVideoUrl(videoEl, pinId);
            if (videoUrl) {
            meta.filename = `${meta.username}_${meta.postId}.mp4`;
              triggerDownload(videoUrl, 'video', meta, 'pinterest');
            } else {
              showToast('pinterest-resolve', '원본 추출 실패', '핀 상세 페이지에서 다시 시도해 주세요. 원본 MP4 주소를 확인하지 못했습니다.', 'error');
            }
          } catch (error) {
            showToast('pinterest-resolve', '다운로드 오류', error.message, 'error');
          } finally { btn.disabled = false; }
        }, true);

        targetBox.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btn, videoEl);
      });
    }
  }

  window.TAKPinterest={findPinId,structuredVideoUrl,structuredThumbnailUrl};

  // Register Pinterest platform processor
  window.TAKPlatform = {
    name: 'pinterest',
    process: scanForPinterestMedia
  };
})();
