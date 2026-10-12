/* TAKOH Media Downloader PRO - Threads Module */

(() => {
  function initModule() {
    if (!window.TAKCore || window.__takohThreadsToolbarReady) return;
    window.__takohThreadsToolbarReady=true;
    document.querySelectorAll('[data-takoh-threads-controls],.takoh-collect-reference').forEach(node=>node.remove());
    document.querySelectorAll('[data-threads-processed]').forEach(node=>node.removeAttribute('data-threads-processed'));
  if (!window.TAKCore) return;
    const { config, showToast, triggerDownload, createDownloadButton, getOrCreateButtonContainer, findMediaContainer } = window.TAKCore;

    const PLATFORM_RULES = [
      'div[aria-label="Video player"]',
      'div[aria-label="동영상 플레이어"]',
      'div[aria-label="비디오 플레이어"]',
      'div[data-visualcompletion="media-renderer"]',
      'div[role="presentation"]'
    ];

  // Each media owns its actions, including individual carousel slides.
  const threadControls = new Map();
  function getThreadButtons(media) {
    let controls=threadControls.get(media);
    if(controls?.isConnected)return controls;
    controls=document.createElement('div');
    controls.className='threads-download-btn-container takoh-threads-media-controls';
    controls.setAttribute('data-takoh-threads-controls','true');
    controls.__takohCandidates=[media];
    controls.__takohMedia=media;
    document.body.appendChild(controls);
    threadControls.set(media,controls);
    window.TAKCore.anchorMediaControls(controls,media,true);
    return controls;
  }
  function videoForImage(img){
    const post=findThreadPostBoundary(img);if(!post)return null;
    const r=img.getBoundingClientRect();
    return Array.from(post.querySelectorAll('video')).find(video=>{
      if(video.poster&&(video.poster===(img.currentSrc||img.src)))return true;
      const v=video.getBoundingClientRect();
      return r.width>0&&r.height>0&&v.width>0&&v.height>0&&Math.abs(r.left-v.left)<2&&Math.abs(r.top-v.top)<2&&Math.abs(r.width-v.width)<2&&Math.abs(r.height-v.height)<2;
    });
  }
  function visibleArea(media){
    const r=media.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
    for(let parent=media.parentElement;parent&&parent!==document.body;parent=parent.parentElement){const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();if(/hidden|clip|scroll|auto/.test(style.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}if(/hidden|clip|scroll|auto/.test(style.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}if(style.display==='none'||style.visibility==='hidden')return 0;}
    return Math.max(0,right-left)*Math.max(0,bottom-top);
  }
  function activeMedia(controls,type){return controls.__takohCandidates.filter(m=>m.isConnected&&(!type||m.tagName===type)).sort((a,b)=>visibleArea(b)-visibleArea(a))[0];}
  function updateThreadButtons(){
    for(const [media,controls] of threadControls){if(!media.isConnected||(media.tagName==='IMG'&&videoForImage(media))){controls.remove();threadControls.delete(media);}}
    for(const controls of new Set(threadControls.values())){
      controls.__takohCandidates=controls.__takohCandidates.filter(m=>m.isConnected);
      if(!controls.__takohCandidates.length){controls.remove();continue;}
      const visibleVideo=activeMedia(controls,'VIDEO');
      controls.__takohMedia=visibleVideo&&visibleArea(visibleVideo)>0?visibleVideo:activeMedia(controls);
      const enabled=controls.__takohCandidates.some(m=>m.tagName==='VIDEO'?config.enableVideos:config.enableImages);
      if(!enabled)controls.style.setProperty('display','none','important');
      for(const button of controls.querySelectorAll('.threads-download-btn')){const label=button.querySelector('span');if(label&&button.dataset.mediaType!=='batch')label.textContent='저장';}
    }
  }
  window.addEventListener('scroll',updateThreadButtons,true);
  window.addEventListener('resize',updateThreadButtons);

  function findThreadPostBoundary(element) {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const links = Array.from(node.querySelectorAll('a[href*="/post/"]'));
      const ids = new Set(links.map(link => link.getAttribute('href').match(/\/post\/([\w-]+)/)?.[1]).filter(Boolean));
      if (ids.size === 1) return node;
      if (ids.size > 1) return null;
    }
    return null;
  }

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'threads', postId = 'post';
    const urlMatch = window.location.pathname.match(/\/@([a-zA-Z0-9_.]+)\/post\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) { username = urlMatch[1]; postId = urlMatch[2]; }
    const article = findThreadPostBoundary(element);
    if (article) {
      const userLink = article.querySelector('a[href^="/@"]');
      if (userLink) { const m = userLink.getAttribute('href').match(/\/@([a-zA-Z0-9_.]+)/); if (m) username = m[1]; }
      const postLink = article.querySelector('a[href*="/post/"]');
      if (postLink) { const m = postLink.getAttribute('href').match(/\/post\/([a-zA-Z0-9_-]+)/); if (m) postId = m[1]; }
    }
    return { username, postId };
  }

  // ========== Helper: Find Video Element (Including Shadow DOM) ==========
  function findVideoElement(root) {
    if (!root) return null;
    if (root.tagName === 'VIDEO') return root;
    
    const lightVideo = root.querySelector('video');
    if (lightVideo) return lightVideo;
    
    if (root.shadowRoot) {
      const shadowVideo = findVideoElement(root.shadowRoot);
      if (shadowVideo) return shadowVideo;
    }
    
    for (const child of root.children) {
      const video = findVideoElement(child);
      if (video) return video;
    }
    
    return null;
  }

  // ========== Helper: Query Video URL from Main World Bridge ==========
  async function getVideoUrlViaMainWorldBridge(videoEl) {
    if (!videoEl) return null;
    const requestId = Math.random().toString(36).substring(2, 9);
    videoEl.setAttribute('data-takoh-target', requestId);

    return new Promise((resolve) => {
      const onResponse = (e) => {
        if (e.detail && e.detail.targetId === requestId) {
          document.removeEventListener('TAKOH_RESPONSE_URL', onResponse);
          videoEl.removeAttribute('data-takoh-target');
          resolve(e.detail.videoUrl);
        }
      };
      document.addEventListener('TAKOH_RESPONSE_URL', onResponse);
      document.dispatchEvent(new CustomEvent('TAKOH_REQUEST_URL', {
        detail: { targetId: requestId }
      }));
      // Timeout after 800ms to allow DOM thread processing
      setTimeout(() => {
        document.removeEventListener('TAKOH_RESPONSE_URL', onResponse);
        videoEl.removeAttribute('data-takoh-target');
        resolve(null);
      }, 800);
    });
  }

  // ========== Helper: Search Video URL in React Internal Props ==========
  function findVideoUrlFromReactProps(element) {
    if (!element) return null;
    
    // Find the React Fiber key on the element
    const keys = Object.keys(element);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!fiberKey) return null;
    
    const fiberNode = element[fiberKey];
    if (!fiberNode) return null;
    
    const searchObj = (obj, depth = 0) => {
      if (!obj || depth > 8) return null;
      
      for (const key in obj) {
        try {
          const val = obj[key];
          if (typeof val === 'string' && val.startsWith('http') && (val.includes('cdninstagram') || val.includes('fbcdn'))) {
            const isVideoKey = /video|playable|stream|source|hd|sd|src/i.test(key);
            const isVideoUrl = val.includes('.mp4') || val.includes('/v/') || val.includes('/o1/v/') || isVideoKey;
            const isImage = val.includes('.jpg') || val.includes('.webp') || val.includes('.png') || val.includes('_n.jpg');
            const isHls = val.includes('.m3u8') || val.includes('.mpd') || val.includes('/hls-') || val.includes('m3u8') || val.includes('.m3u');
            
            if (isVideoUrl && !isImage && !isHls) {
              return val;
            }
          }
          if (typeof val === 'object' && val !== null) {
            if (key.startsWith('__') || key === 'current' || key === 'stateNode' || key === 'return' || val.nodeType) continue;
            const res = searchObj(val, depth + 1);
            if (res) return res;
          }
        } catch (e) {}
      }
      return null;
    };
    
    let currentFiber = fiberNode;
    let levelsChecked = 0;
    
    // Walk up the component return tree (limited to 5 levels to avoid timeline-level contexts)
    while (currentFiber && levelsChecked < 5) {
      levelsChecked++;
      
      if (currentFiber.memoizedProps) {
        const url = searchObj(currentFiber.memoizedProps);
        if (url) {
          console.log(`[Threads Downloader] Found URL in memoizedProps at Fiber level ${levelsChecked}:`, url);
          return url;
        }
      }
      
      if (currentFiber.pendingProps) {
        const url = searchObj(currentFiber.pendingProps);
        if (url) {
          console.log(`[Threads Downloader] Found URL in pendingProps at Fiber level ${levelsChecked}:`, url);
          return url;
        }
      }

      if (currentFiber.memoizedState) {
        const url = searchObj(currentFiber.memoizedState);
        if (url) {
          console.log(`[Threads Downloader] Found URL in memoizedState at Fiber level ${levelsChecked}:`, url);
          return url;
        }
      }
      
      currentFiber = currentFiber.return;
    }
    
    return null;
  }

  // ========== Search JSON scripts by Poster URL ==========
  function findVideoUrlByPoster(posterUrl) {
    if (!posterUrl) return null;
    const cleanPoster = posterUrl.split('?')[0];
    const escapedPoster = cleanPoster.replace(/\//g, '\\/');
    
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        const hasClean = text.includes(cleanPoster);
        const hasEscaped = text.includes(escapedPoster);
        if (!text || (!hasClean && !hasEscaped)) continue;
        
        const posterIndex = hasEscaped ? text.indexOf(escapedPoster) : text.indexOf(cleanPoster);
        const mp4Regex = /https?:\\\/\\\/[^\s"'<>]*?\.mp4[^\s"'<>]*|https?:\/\/[^\s"'<>]*?\.mp4[^\s"'<>]*/g;
        let match;
        let closestUrl = null;
        let minDistance = Infinity;
        
        while ((match = mp4Regex.exec(text)) !== null) {
          const url = match[0]
            .replace(/\\\//g, '/')
            .replace(/\\u0025/g, '%')
            .replace(/\\u0026/g, '&')
            .replace(/\\u003d/g, '=');
          const urlIndex = match.index;
          const distance = Math.abs(urlIndex - posterIndex);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestUrl = url;
          }
        }
        
        if (closestUrl) {
          console.log("[Threads Downloader] Matched video URL by poster. Distance:", minDistance);
          return closestUrl;
        }
      }
    } catch (e) {
      console.log("[Threads Downloader] Error in findVideoUrlByPoster:", e);
    }
  }

  // ========== Search JSON scripts by Post Shortcode / ID ==========
  function findVideoUrlByPostId(postId) {
    if (!postId || postId === 'post') return null;
    
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes(postId)) continue;
        
        const postIndex = text.indexOf(postId);
        const mp4Regex = /https?:\\\/\\\/[^\s"'<>]*?\.mp4[^\s"'<>]*|https?:\/\/[^\s"'<>]*?\.mp4[^\s"'<>]*/g;
        let match;
        let closestUrl = null;
        let minDistance = Infinity;
        
        while ((match = mp4Regex.exec(text)) !== null) {
          const url = match[0]
            .replace(/\\\//g, '/')
            .replace(/\\u0025/g, '%')
            .replace(/\\u0026/g, '&')
            .replace(/\\u003d/g, '=');
          const urlIndex = match.index;
          const distance = Math.abs(urlIndex - postIndex);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestUrl = url;
          }
        }
        
        if (closestUrl && minDistance < 10000) {
          console.log("[Threads Downloader] Matched video URL by postId. Distance:", minDistance);
          return closestUrl;
        }
      }
    } catch (e) {
      console.error("[Threads Downloader] Error in findVideoUrlByPostId:", e);
    }
    return null;
  }

  // ========== Search All Video URLs in Source ==========
  function findAllVideoUrls() {
    const urls = new Set();
    
    try {
      document.querySelectorAll('script').forEach(script => {
        const text = script.textContent || '';
        const matches = text.match(/https?:\\\/\\\/[^\s"'<>]*?\.mp4[^\s"'<>]*|https?:\/\/[^\s"'<>]*?\.mp4[^\s"'<>]*/g);
        if (matches) {
          matches.forEach(url => {
            const decoded = url
              .replace(/\\\//g, '/')
              .replace(/\\u0025/g, '%')
              .replace(/\\u0026/g, '&')
              .replace(/\\u003d/g, '=');
            urls.add(decoded);
          });
        }
      });
    } catch (e) { /* ignore */ }

    // Fallbacks
    try {
      const ogVideo = document.querySelector('meta[property="og:video"], meta[property="og:video:url"]');
      if (ogVideo && ogVideo.content) urls.add(ogVideo.content);
    } catch (e) { /* ignore */ }

    try {
      performance.getEntriesByType('resource').forEach(entry => {
        const url = entry.name;
        if (url.includes('.mp4') && (url.includes('cdninstagram.com') || url.includes('fbcdn.net'))) {
          urls.add(url);
        }
      });
    } catch (e) { /* ignore */ }

    return Array.from(urls);
  }

  // ========== Media Processing ==========
  function processVideoPlayers() {
    if (!config.enableVideos) return;

    const videoElements = document.querySelectorAll('video');

    videoElements.forEach(videoEl => {
      if(window.TAKCore.isComposerMedia?.(videoEl))return;
      // Skip control thumbnails and tiny elements
      if (videoEl.offsetWidth < 100 || videoEl.offsetHeight < 100) return;

      // Sync lock videoEl directly (highest accuracy sync lock)
      if (threadControls.has(videoEl)) {
        return;
      }

      let playerContainer = videoEl.parentElement;
      if (!playerContainer) return;

      // Check container sync flags
      // Sync lock: Mark element and container
      videoEl.setAttribute('data-threads-processed', 'true');
      playerContainer.setAttribute('data-threads-processed', 'true');
      playerContainer.setAttribute('data-button-injected', 'true');


      const btnContainer = getThreadButtons(videoEl);

      if (btnContainer.querySelector('.threads-download-btn[data-media-type="video"]')) {
        return;
      }

      console.log("[Threads Downloader] Detected video player. Injecting button.");

      const btn = createDownloadButton('video', async () => {
        videoEl=activeMedia(btnContainer,'VIDEO')||videoEl;
        console.log('[Threads Downloader] Video download button clicked!');
        try {
          const meta = getPostMetadata(videoEl);
          let posterUrl = '';
          
          if (videoEl) {
            posterUrl = videoEl.poster || videoEl.getAttribute('poster');
          }
          if (!posterUrl) {
            const imgEl = playerContainer.querySelector('img');
            if (imgEl) posterUrl = imgEl.src;
          }

          let videoUrl = [videoEl.currentSrc, videoEl.src, ...Array.from(videoEl.querySelectorAll('source')).map(s => s.src)]
            .find(url => /^https?:\/\//.test(url) && !/\.(m3u8|mpd)(?:[?#]|$)/i.test(url)) || '';
          
          // 1. First, query the MAIN world React Fiber bridge (100% accurate)
          if (!videoUrl && videoEl) {
            videoUrl = await getVideoUrlViaMainWorldBridge(videoEl);
          }

          // 2. Direct src
          if (!videoUrl) {
            if (videoEl && videoEl.src && !videoEl.src.startsWith('blob:')) {
              videoUrl = videoEl.src;
            } else if (videoEl && videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) {
              videoUrl = videoEl.currentSrc;
            }
          }
          
          // 3. Scan React props of videoEl locally (fallback)
          if (!videoUrl && videoEl) {
            videoUrl = findVideoUrlFromReactProps(videoEl);
          }


          // Never substitute the last video loaded elsewhere in the feed.

          if (videoUrl) {
            triggerDownload(videoUrl, 'video', meta, 'threads');
          } else {
            showToast(Date.now().toString(), '다운로드 준비 중', '동영상을 한번 재생한 후 다시 시도해주세요.', 'error');
          }
        } catch (err) {
          console.error('[Threads Downloader] Video download error:', err);
        }
      });

      btnContainer.appendChild(btn);
    });
  }

  function isValidImage(img) {
    if (!window.TAKCore.isContentImage(img, 'threads') || !findThreadPostBoundary(img)) return false;
    if (!config.enableImages) return false;

    // 글쓰기 창(새로운 스레드), 답글 달기 창 등 대화상자(dialog) 내부 이미지 제외
    const inDialog = img.closest('div[role="dialog"]') || 
                     img.closest('div[aria-label="새로운 스레드"]') || 
                     img.closest('div[aria-label="답글"]');
    if (inDialog) return false;

    // 프로필 헤더, 프로필 사진 영역(header, avatar, profile 링크 등) 완벽 제외
    const profileLink = img.closest('a[href*="/@"]');
    const inProfileHeader = img.closest('header') || 
                            img.closest('div[aria-label*="프로필" i]') || 
                            img.closest('div[aria-label*="Profile" i]') ||
                            (profileLink && !profileLink.getAttribute('href').includes('/post/'));
    if (inProfileHeader) return false;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // 150px 미만의 작은 아바타/아이콘 제외
    if (width > 0 && height > 0 && Math.max(width,height) < 150) return false;
    if (width === 0 && height === 0) return false;

    const classes = (img.className || '').toLowerCase();
    const src = (img.src || '').toLowerCase();
    const alt = (img.getAttribute('alt') || '').toLowerCase();

    // Skip avatar, emojis, story icons, profile picture
    if (classes.includes('avatar') || 
        classes.includes('emoji') || 
        classes.includes('profile') ||
        src.includes('/emoji/') || 
        src.includes('avatar') ||
        src.includes('/s150x150/') ||
        alt.includes('프로필 사진') || 
        alt.includes('profile picture') ||
        alt.includes('avatar')) {
      return false;
    }

    return true;
  }

  // ========== Helper: Search All Media URLs in React Props (For Threads Carousel Batch Download) ==========
  function findAllMediaUrlsFromReactProps(element) {
    if (!element) return [];
    
    const keys = Object.keys(element);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!fiberKey) return [];
    
    const fiberNode = element[fiberKey];
    if (!fiberNode) return [];

    const foundUrls = new Set();

    const searchObj = (obj, depth = 0) => {
      if (!obj || depth > 10) return;
      
      if (Array.isArray(obj)) {
        obj.forEach(item => {
          if (item && typeof item === 'object') {
            searchObj(item, depth + 1);
          }
        });
        return;
      }

      for (const key in obj) {
        try {
          const val = obj[key];
          if (typeof val === 'string' && val.startsWith('http') && (val.includes('cdninstagram') || val.includes('fbcdn'))) {
            const isVideoKey = /video|playable|stream|source|hd|sd|src/i.test(key);
            const isVideoUrl = val.includes('.mp4') || val.includes('/v/') || val.includes('/o1/v/') || isVideoKey;
            const isImage = val.includes('.jpg') || val.includes('.webp') || val.includes('.png') || val.includes('_n.jpg');
            const isHls = val.includes('.m3u8') || val.includes('.mpd') || val.includes('/hls-') || val.includes('m3u8') || val.includes('.m3u');

            if ((isVideoUrl || isImage) && !isHls && !val.includes('/s150x150/') && !val.includes('/s320x320/')) {
              foundUrls.add(val);
            }
          }
          if (typeof val === 'object' && val !== null) {
            if (key.startsWith('__') || key === 'current' || key === 'stateNode' || key === 'return' || val.nodeType) continue;
            searchObj(val, depth + 1);
          }
        } catch (e) {}
      }
    };

    let currentFiber = fiberNode;
    let levelsChecked = 0;
    
    while (currentFiber && levelsChecked < 6) {
      levelsChecked++;
      if (currentFiber.memoizedProps) {
        searchObj(currentFiber.memoizedProps);
      }
      if (currentFiber.pendingProps) {
        searchObj(currentFiber.pendingProps);
      }
      currentFiber = currentFiber.return;
    }

    return Array.from(foundUrls);
  }

  function processImages() {
    if (!config.enableImages) return;

    document.querySelectorAll('img').forEach(img => {
      if (threadControls.has(img)) return;

      const check = () => {
        if (threadControls.has(img)) return;
        if (!isValidImage(img)) {
          return;
        }

        let container = img.parentElement;
        if (!container) return;

        // A poster and its video can be separate DOM siblings occupying one tile.
        if (videoForImage(img)) return;
        const labelType = 'image';

        img.setAttribute('data-threads-processed', 'true');
        const btnContainer = getThreadButtons(img);

        if (btnContainer.querySelector(`.threads-download-btn[data-media-type="${labelType}"]`)) return;



        // Dynamic active slide media finder on click
        const btn = createDownloadButton(labelType, () => {
          console.log('[Threads Downloader] Image download button clicked!');
          const activeImg = activeMedia(btnContainer,'IMG')||img;
          if (activeImg && activeImg.src) {
            const meta = getPostMetadata(img);
            triggerDownload(activeImg.currentSrc || activeImg.src, labelType, meta, 'threads');
          }
        });

        btnContainer.appendChild(btn);


      };

      if (img.complete) {
        check();
      } else {
        img.addEventListener('load', function onLoad() {
          img.removeEventListener('load', onLoad);
          check();
        });
      }
    });
  }

  function processPageMedia() {
    try {
      processVideoPlayers();
    } catch (e) {}
    try {
      processImages();
    } catch (e) {}
    updateThreadButtons();
  }

    window.TAKPlatform = {
      name: 'threads',
      process: processPageMedia
    };

    if (window.TAKCore && window.TAKCore.registerPlatform) {
      window.TAKCore.registerPlatform('threads', processPageMedia);
    }
  }

  if (window.TAKCore) {
    initModule();
  } else {
    document.addEventListener('TAKCoreInitialized', initModule);
  }
})();
