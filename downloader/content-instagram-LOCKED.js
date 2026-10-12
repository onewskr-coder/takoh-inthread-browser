/* TAKOH Media Downloader PRO - Instagram Module */

(() => {
  const { config, showToast, triggerDownload, createDownloadButton, getOrCreateButtonContainer, findMediaContainer } = window.TAKCore;

  const PLATFORM_RULES = [
    'div._aatb',              // Instagram Reels Outer Frame
    'div._aakw',              // Instagram Media container
    'div._aagv',              // Instagram Feed Image wrapper
    'div._ac2d',              // Stories main section wrapper
    'div._ac1z',              // Stories item container
    'div._ac7v',              // Stories video/image overlay wrapper
    'div[role="dialog"] div._aakw', // Profile modal media container
    'div[role="dialog"] div._aatb', // Profile reels modal outer frame
    'div[role="dialog"] article'    // Profile modal article frame
  ];

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'instagram';
    let postId = 'post';

    // 1. Check if Instagram Story
    const storyUrlMatch = window.location.pathname.match(/\/stories\/([a-zA-Z0-9_.]+)\/(\d+)/);
    if (storyUrlMatch) {
      username = storyUrlMatch[1];
      postId = 'story_' + storyUrlMatch[2];
      return { username, postId };
    } else if (window.location.pathname.includes('/stories/')) {
      const parts = window.location.pathname.split('/');
      const storiesIdx = parts.indexOf('stories');
      if (storiesIdx !== -1 && parts[storiesIdx + 1]) {
        username = parts[storiesIdx + 1];
        postId = 'story_' + (parts[storiesIdx + 2] || 'active');
        return { username, postId };
      }
    }

    // 2. Check if single post page
    const urlMatch = window.location.pathname.match(/\/(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) { 
      postId = urlMatch[2]; 
    }

    // 3. Check if timeline/feed card
    const article = element.closest('article') || element.closest('section');
    if (article) {
      const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (postLink) {
        const m = postLink.getAttribute('href').match(/\/(p|reel)\/([a-zA-Z0-9_-]+)/);
        if (m) postId = m[2];
      }

      const links = article.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const m = href.match(/^\/([a-zA-Z0-9_.]+)\/$/);
        if (m && !['explore', 'reels', 'direct', 'emails', 'developer'].includes(m[1])) {
          username = m[1];
          break;
        }
      }
    }
    return { username, postId };
  }

  // ========== Search Video URLs in Performance Resource Timing ==========
  function findVideoUrlFromResources() {
    try {
      const entries = performance.getEntriesByType('resource');
      const videoUrls = entries
        .map(e => e.name)
        .filter(url => url.includes('.mp4') && (url.includes('cdninstagram.com') || url.includes('fbcdn.net')));
      
      // Return the most recently loaded video URL
      if (videoUrls.length > 0) {
        return videoUrls[videoUrls.length - 1];
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ========== Helper: Query Video URL from Main World Bridge ==========
  async function getVideoUrlViaMainWorldBridge(videoEl) {
    if (!videoEl) return null;
    const requestId = Math.random().toString(36).substring(2, 9);
    videoEl.setAttribute('data-takoh-target', requestId);
    
    console.log('[Instagram Downloader] Requesting video URL via MAIN world bridge for request:', requestId);

    return new Promise((resolve) => {
      const onResponse = (e) => {
        if (e.detail && e.detail.targetId === requestId) {
          console.log('[Instagram Downloader] Received bridge response for request:', requestId, 'Url:', e.detail.videoUrl);
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
        console.log('[Instagram Downloader] Bridge request timed out for request:', requestId);
        document.removeEventListener('TAKOH_RESPONSE_URL', onResponse);
        videoEl.removeAttribute('data-takoh-target');
        resolve(null);
      }, 800);
    });
  }

  // ========== Helper: Deduplicate Instagram Media URLs by Unique Media ID ==========
  function deduplicateMediaUrls(urls) {
    if (!urls || urls.length === 0) return [];
    const mediaMap = new Map();

    urls.forEach(urlStr => {
      if (!urlStr || typeof urlStr !== 'string') return;

      // Extract unique Media ID: e.g. /t51.82787-15/{MEDIA_ID}_n.heic or {MEDIA_ID}.jpg or ig_cache_key={MEDIA_ID}
      const m = urlStr.match(/\/([0-9]+_[0-9]+_[0-9]+)/) || urlStr.match(/\/([0-9]+_[0-9]+)/) || urlStr.match(/ig_cache_key=([^&]+)/);
      const mediaId = m ? m[1] : urlStr.split('?')[0];

      const isLowRes = urlStr.includes('_s640x640') || urlStr.includes('_s320x320') || urlStr.includes('_s480x480') || urlStr.includes('_s750x750') || urlStr.includes('/s150x150/') || urlStr.includes('/s320x320/');

      if (!mediaMap.has(mediaId)) {
        mediaMap.set(mediaId, urlStr);
      } else {
        const existing = mediaMap.get(mediaId);
        const existingLowRes = existing.includes('_s640x640') || existing.includes('_s320x320') || existing.includes('_s480x480') || existing.includes('_s750x750') || existing.includes('/s150x150/') || existing.includes('/s320x320/');
        // Prefer full resolution (without _s640x640 etc.) over thumbnail
        if (existingLowRes && !isLowRes) {
          mediaMap.set(mediaId, urlStr);
        }
      }
    });

    return Array.from(mediaMap.values());
  }

  // ========== Helper: Search All Media URLs in React Props (For Batch Download) ==========
  function findAllMediaUrlsFromReactProps(element) {
    if (!element) return [];
    
    const keys = Object.keys(element);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!fiberKey) return [];
    
    const fiberNode = element[fiberKey];
    if (!fiberNode) return [];

    const foundUrls = new Set();

    const searchObj = (obj, depth = 0) => {
      if (!obj || depth > 12) return;
      
      // 만약 배열(carousel_media, edge_sidecar_to_children 등)을 발견하면 내부 미디어 추출
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
            const isImage = val.includes('.jpg') || val.includes('.webp') || val.includes('.png') || val.includes('_n.jpg') || val.includes('.heic') || val.includes('dst-jpg') || val.includes('cdninstagram.com');
            const isHls = val.includes('.m3u8') || val.includes('.mpd') || val.includes('/hls-') || val.includes('m3u8') || val.includes('.m3u');

            if ((isVideoUrl || isImage) && !isHls && !val.includes('/s150x150/') && !val.includes('/s320x320/')) {
              foundUrls.add(val);
            }
          }
          if (typeof val === 'object' && val !== null) {
            if (key.startsWith('__') || key === 'current' || key === 'return' || val.nodeType) continue;
            searchObj(val, depth + 1);
          }
        } catch (e) {}
      }
    };

    let currentFiber = fiberNode;
    let levelsChecked = 0;
    
    // Walk up the component return tree up to 15 levels to capture full post Fiber scope
    while (currentFiber && levelsChecked < 15) {
      levelsChecked++;
      if (currentFiber.memoizedProps) {
        searchObj(currentFiber.memoizedProps);
      }
      if (currentFiber.pendingProps) {
        searchObj(currentFiber.pendingProps);
      }
      if (currentFiber.stateNode && typeof currentFiber.stateNode === 'object') {
        searchObj(currentFiber.stateNode);
      }
      currentFiber = currentFiber.return;
    }

    return Array.from(foundUrls);
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
          console.log(`[Instagram Downloader] Found URL in memoizedProps at Fiber level ${levelsChecked}:`, url);
          return url;
        }
      }
      
      if (currentFiber.pendingProps) {
        const url = searchObj(currentFiber.pendingProps);
        if (url) {
          console.log(`[Instagram Downloader] Found URL in pendingProps at Fiber level ${levelsChecked}:`, url);
          return url;
        }
      }

      if (currentFiber.memoizedState) {
        const url = searchObj(currentFiber.memoizedState);
        if (url) {
          console.log(`[Instagram Downloader] Found URL in memoizedState at Fiber level ${levelsChecked}:`, url);
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
          console.log("[Instagram Downloader] Matched video URL by poster. Distance:", minDistance);
          return closestUrl;
        }
      }
    } catch (e) {
      console.log("[Instagram Downloader] Error in findVideoUrlByPoster:", e);
    }
    return null;
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
          console.log("[Instagram Downloader] Matched video URL by postId. Distance:", minDistance);
          return closestUrl;
        }
      }
    } catch (e) {
      console.error("[Instagram Downloader] Error in findVideoUrlByPostId:", e);
    }
    return null;
  }

  // ========== Media Processing ==========
  function processVideoPlayers() {
    if (!config.enableVideos) return;

    const openDialog = document.querySelector('div[role="dialog"]');
    const isExploreUrl = window.location.pathname.includes('/explore');

    // 탐색(/explore) 탭에서 모달 팝업이 닫혀있는 상태일 때: 그리드 비디오 레이어 보호를 위해 처리 스킵 및 잔여 컨테이너 정리
    if (isExploreUrl && !openDialog) {
      const strayContainers = document.querySelectorAll('main .threads-download-btn-container, main .threads-download-container');
      strayContainers.forEach(el => {
        if (el.classList.contains('threads-download-btn-container')) {
          el.remove();
        } else if (el.classList.contains('threads-download-container')) {
          el.classList.remove('threads-download-container');
          el.removeAttribute('data-tak-processed');
        }
      });
      return;
    }

    // Target elements containing video or shadow roots
    const videoElements = document.querySelectorAll('video');

    videoElements.forEach(videoEl => {
      // 1. /explore 페이지 보호: 모달 다이얼로그 외부의 탐색 그리드 비디오는 절대 변경/주입하지 않음
      if (isExploreUrl && !videoEl.closest('div[role="dialog"]')) return;

      // 2. 모달 팝업 오픈 상태 보호: 모달 팝업이 열려있을 때 배경(탐색 피드/프로필 그리드 등)의 비디오는 절대 건드리지 않음
      if (openDialog && !videoEl.closest('div[role="dialog"]')) return;

      // 3. 탐색/프로필 그리드 타일 보호 (모달 외부에 있는 3열 그리드 타일 내 비디오 제외)
      if (videoEl.closest('main') && !videoEl.closest('article') && !videoEl.closest('div[role="dialog"]') && !videoEl.closest('div._aatb')) {
        if (videoEl.closest('a[href*="/p/"], a[href*="/reel/"]') || videoEl.closest('div._ac7v')) return;
      }

      // Skip small elements (like story previews)
      if (videoEl.offsetWidth < 80 || videoEl.offsetHeight < 80) return;

      // Robust container resolution: Target outer Reel/Media container
      // (NEVER direct video wrappers _aabw, _ab21, _aamv, _aabz to avoid freezing Instagram video rendering & gray screens)
      let playerContainer = videoEl.closest('div._aatb') ||
                            videoEl.closest('div._aakw') || 
                            videoEl.closest('div._aagv') ||
                            videoEl.closest('div.x1qjc9v5') ||
                            videoEl.closest('div.x5yr21d.x1n2onr6') ||
                            videoEl.closest('article') ||
                            (videoEl.parentElement && videoEl.parentElement.parentElement) ||
                            videoEl.parentElement;
                            
      if (!playerContainer) return;

      // Avoid injecting into sensitive inner video wrappers (_aabw, _aamv, _ab21)
      if (playerContainer.classList.contains('_aabw') || playerContainer.classList.contains('_aamv') || playerContainer.classList.contains('_ab21')) {
        playerContainer = playerContainer.closest('div._aatb') || playerContainer.closest('div._aakw') || playerContainer.closest('article') || playerContainer.parentElement;
      }

      // 전체 모달 dialog나 article이 잡힌 경우 적절한 외부 미디어 프레임(_aatb, _aakw 등)으로 수축
      if (playerContainer.getAttribute('role') === 'dialog' || playerContainer.tagName === 'ARTICLE' || playerContainer.querySelector('header')) {
        const outerMedia = playerContainer.querySelector('div._aatb') || 
                           playerContainer.querySelector('div._aakw') || 
                           playerContainer.querySelector('div._aagv') || 
                           playerContainer.querySelector('div.x1qjc9v5');
        if (outerMedia) {
          playerContainer = outerMedia;
        }
      }

      // position: static일 경우 relative 보장하여 버튼 이탈 방지
      try {
        const compStyle = window.getComputedStyle(playerContainer);
        if (compStyle.position === 'static') {
          playerContainer.style.position = 'relative';
        }
      } catch (e) {}

      if (playerContainer.hasAttribute('data-tak-processed')) return;

      const btnContainer = getOrCreateButtonContainer(playerContainer);
      if (btnContainer.querySelector('.threads-download-btn[data-media-type="video"]')) return;

      playerContainer.setAttribute('data-tak-processed', 'true');
      playerContainer.classList.add('threads-download-container');

      console.log("[TAKOH Instagram] Injecting video download button.");

      const btn = createDownloadButton('video', async () => {
        const meta = getPostMetadata(playerContainer);
        let posterUrl = '';
        
        if (videoEl) {
          posterUrl = videoEl.poster || videoEl.getAttribute('poster');
        }
        if (!posterUrl) {
          const imgEl = playerContainer.querySelector('img');
          if (imgEl) posterUrl = imgEl.src;
        }

        let videoUrl = '';
        
        // 1. First, query the MAIN world React Fiber bridge (100% accurate)
        if (videoEl) {
          videoUrl = await getVideoUrlViaMainWorldBridge(videoEl);
        }

        // 2. Direct src
        if (!videoUrl) {
          if (videoEl.src && !videoEl.src.startsWith('blob:')) {
            videoUrl = videoEl.src;
          } else if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) {
            videoUrl = videoEl.currentSrc;
          } 
        }
        
        // 3. Scan React props of videoEl locally (fallback)
        if (!videoUrl && videoEl) {
          videoUrl = findVideoUrlFromReactProps(videoEl);
        }

        // 4. Scan React props of playerContainer locally (fallback)
        if (!videoUrl) {
          videoUrl = findVideoUrlFromReactProps(playerContainer);
        }

        // 5. Match poster URL in page script tags
        if (!videoUrl) {
          videoUrl = findVideoUrlByPoster(posterUrl);
        }

        // 6. Match post ID/shortcode in script tags
        if (!videoUrl) {
          videoUrl = findVideoUrlByPostId(meta.postId);
        }
        
        // 7. Fallback to most recently loaded video URL from resources
        if (!videoUrl) {
          videoUrl = findVideoUrlFromResources();
        }

        // 8. Meta og:video fallback
        if (!videoUrl) {
          const ogVideo = document.querySelector('meta[property="og:video"], meta[property="og:video:url"]');
          if (ogVideo && ogVideo.content) videoUrl = ogVideo.content;
        }

        // 9. 최종 백그라운드 캡처 네트워크 로그에서 해당 탭의 비디오 URL 매핑 스니핑 시도
        if (!videoUrl) {
          chrome.runtime.sendMessage({ action: 'getMediaUrls' }, (response) => {
            if (response && response.urls && response.urls.length > 0) {
              // cdninstagram 또는 fbcdn mp4 주소 우선 추출
              const bgVideo = response.urls.find(item => item.url.includes('.mp4') && (item.url.includes('cdninstagram') || item.url.includes('fbcdn')));
              if (bgVideo) {
                videoUrl = bgVideo.url;
              }
            }
            
            if (videoUrl) {
              triggerDownload(videoUrl, 'video', meta, 'instagram');
            } else {
              showToast(Date.now().toString(), '다운로드 준비 중 ⚠️', '동영상을 1~2초간 재생한 뒤 다시 시도해 주세요.', 'error');
            }
          });
        } else {
          triggerDownload(videoUrl, 'video', meta, 'instagram');
        }
      });

      btnContainer.appendChild(btn);
    });
  }

  function isValidImage(img) {
    if (!config.enableImages) return false;

    // Reject images located inside Instagram's bottom action bar (like/comment/share/bookmark area or user profile icons)
    const inActionBar = img.closest('div._aamu') || 
                       img.closest('div._aamw') || 
                       img.closest('section._aaew');
                       
    // Main post media wrappers
    const isMainMedia = img.closest('div._aagv') || img.closest('div._aakw') || img.closest('div._ac7v') || img.closest('div._ab21');
    if (inActionBar && !isMainMedia) return false;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // Ignore small icons/avatars (threshold 100px)
    if (width > 0 && width < 100) return false;
    if (height > 0 && height < 100) return false;
    if (width === 0 && height === 0) return false;

    const classes = (img.className || '').toLowerCase();
    const src = (img.src || '').toLowerCase();
    const alt = (img.getAttribute('alt') || '').toLowerCase();

    // Skip avatar, emojis, story icons
    if (classes.includes('avatar') || 
        classes.includes('emoji') || 
        src.includes('/emoji/') || 
        alt.includes('프로필 사진') || 
        alt.includes('profile picture')) {
      return false;
    }

    return true;
  }

  function processImages() {
    if (!config.enableImages) return;

    const openDialog = document.querySelector('div[role="dialog"]');
    const isExploreUrl = window.location.pathname.includes('/explore');

    // 탐색(/explore) 탭에서 모달 팝업이 닫혀있는 상태일 때: 그리드 이미지 레이어 보호를 위해 탐색 이미지 처리 스킵
    if (isExploreUrl && !openDialog) return;

    document.querySelectorAll('img').forEach(img => {
      // 1. /explore 페이지 보호: 모달 다이얼로그 외부의 탐색 그리드 이미지는 절대 변경/주입하지 않음
      if (isExploreUrl && !img.closest('div[role="dialog"]')) return;

      // 2. 모달 팝업 오픈 상태 보호: 모달이 열려있을 때 배경의 이미지는 건드리지 않음
      if (openDialog && !img.closest('div[role="dialog"]')) return;

      // 3. 탐색/프로필 그리드 타일 보호
      if (img.closest('main') && !img.closest('article') && !img.closest('div[role="dialog"]') && !img.closest('div._aatb')) {
        if (img.closest('a[href*="/p/"], a[href*="/reel/"]') || img.closest('div._ac7v')) return;
      }

      if (img.hasAttribute('data-tak-processed')) return;

      const check = () => {
        if (img.hasAttribute('data-tak-processed')) return;

        // Skip if image is a video poster / inside a video player (Reel / Feed video) to avoid gray screen corruption
        if (img.closest('div._aatb') || img.closest('div._aamv') || img.closest('div._ab21') || img.closest('div._aabw') || img.closest('div._aabz')) {
          img.setAttribute('data-tak-processed', 'skipped');
          return;
        }
        if (img.parentElement && img.parentElement.querySelector('video')) {
          img.setAttribute('data-tak-processed', 'skipped');
          return;
        }

        if (!isValidImage(img)) {
          img.setAttribute('data-tak-processed', 'failed');
          return;
        }

        // Find Instagram-specific container with fallback
        let container = findMediaContainer(img, PLATFORM_RULES) || 
                        img.closest('div._aagv') || 
                        img.closest('div._aakw') || 
                        img.closest('a[href*="/reel/"]') ||
                        img.closest('div.x1lliihq') ||
                        img.parentElement;
        if (!container) return;

        // 상단 프로필 헤더(header) 가림 방지 (단, 릴스 모달 팝업 내부 및 그리드 항목은 제외)
        if ((container.querySelector('header') || container.tagName === 'ARTICLE') && !container.closest('div[role="dialog"]')) {
          container = img.closest('div._aagv') || img.closest('div._aakw') || img.closest('a[href*="/reel/"]') || img.parentElement;
        }

        // Skip if container is actually an action bar wrapper
        if (container.closest('div._aamu') || container.closest('div._aamw')) {
          const isMainMedia = container.classList.contains('_aagv') || container.classList.contains('_aakw') || container.closest('div._aagv');
          if (!isMainMedia) return;
        }

        img.setAttribute('data-tak-processed', 'true');
        const btnContainer = getOrCreateButtonContainer(container);

        // Check if it's a video thumbnail container
        const isVideoThumb = container.querySelector('video') || 
                            container.closest('div._ab21') ||
                            container.querySelector('span[aria-label*="reels" i]') ||
                            container.querySelector('span[aria-label*="동영상" i]');

        const labelType = isVideoThumb ? 'thumbnail' : 'image';

        if (btnContainer.querySelector(`.threads-download-btn[data-media-type="${labelType}"]`)) return;

        container.classList.add('threads-download-container');

        // 단일 미디어 다운로드 버튼: 클릭 시점에 현재 슬라이드에 보이는 미디어를 실시간 탐색
        const btn = createDownloadButton(labelType, async () => {
          const activeImg = container.querySelector('img[src]') || img;
          const activeVideo = container.querySelector('video');

          const meta = getPostMetadata(container);

          if (activeVideo && labelType === 'video') {
            let videoUrl = await getVideoUrlViaMainWorldBridge(activeVideo) || 
                           (activeVideo.src && !activeVideo.src.startsWith('blob:') ? activeVideo.src : null) || 
                           (activeVideo.currentSrc && !activeVideo.currentSrc.startsWith('blob:') ? activeVideo.currentSrc : null) ||
                           findVideoUrlFromReactProps(activeVideo) ||
                           findVideoUrlFromReactProps(container) ||
                           findVideoUrlByPoster(activeVideo.poster) ||
                           findVideoUrlFromResources();

            if (videoUrl) {
              triggerDownload(videoUrl, 'video', meta, 'instagram');
            } else {
              showToast(Date.now().toString(), '다운로드 준비 중 ⚠️', '동영상을 1~2초간 재생한 뒤 다시 시도해 주세요.', 'error');
            }
          } else if (activeImg && activeImg.src) {
            triggerDownload(activeImg.src, 'image', meta, 'instagram');
          }
        });
        btnContainer.appendChild(btn);

        // ★ 일괄 다운로드(Batch Download) 버튼 연동 (캐러셀 게시글 전체 미디어 일괄 저장)
        const parentArticle = container.closest('article') || container.closest('section') || container;
        const allMediaUrls = findAllMediaUrlsFromReactProps(parentArticle) || findAllMediaUrlsFromReactProps(container) || findAllMediaUrlsFromReactProps(img) || [];
        
        // Check if page is post detail (/p/, /reel/) or has multiple post images/carousel dots
        const isPostPage = window.location.href.includes('/p/') || window.location.href.includes('/reel/');
        const bodyImgs = parentArticle.querySelectorAll('img');
        const validBodyImgCount = Array.from(bodyImgs).filter(i => i.src && !i.src.includes('t51.2885-19') && !i.closest('header')).length;

        const isCarouselDom = isPostPage || validBodyImgCount > 1 || parentArticle.querySelector('div._acai') || parentArticle.querySelector('ul') || parentArticle.querySelector('button');

        if (isCarouselDom) {
          if (btnContainer.querySelector('.threads-download-btn[data-media-type="batch"]')) return;

          const batchBtn = createDownloadButton('image', () => {
            const meta = getPostMetadata(container);
            const collectedUrls = new Set();

            // Resolve postBox: closest parent element that wraps both container AND the Next button specifically for this post!
            let curr = container;
            let postBox = null;
            while (curr && curr !== document.body && curr.tagName !== 'MAIN') {
              const nextBtn = curr.querySelector('button[aria-label="Next"], button[aria-label="다음"], button._af2v, svg[aria-label="Next"], svg[aria-label="다음"]');
              if (nextBtn) {
                postBox = curr;
                break;
              }
              curr = curr.parentElement;
            }

            if (!postBox) {
              postBox = container.closest('article') || container.closest('div[role="dialog"]') || container;
            }

            async function collectCurrentSlideMedia() {
              // 1. Collect Image elements strictly inside postBox (excluding recommended posts and avatars)
              const currentImgs = postBox.querySelectorAll('img');
              currentImgs.forEach(imgEl => {
                const src = imgEl.src || '';
                const alt = (imgEl.alt || '').toLowerCase();
                const className = (imgEl.className || '').toLowerCase();

                // Exclude profile avatar CDN pattern (t51.2885-19) & thumbnails
                if (src.includes('t51.2885-19') || src.includes('/s150x150/') || src.includes('/s320x320/') || src.includes('_150x150') || src.includes('_320x320')) return;
                if (imgEl.closest('header') || imgEl.closest('ul._a9ym') || imgEl.closest('a[href*="/stories/"]')) return;
                if (alt.includes('profile') || alt.includes('프로필') || alt.includes('avatar') || className.includes('avatar')) return;

                // ★ EXCLUDE RECOMMENDED POST IMAGES (wrapped in a[href*="/p/"] or a[href*="/reel/"] for OTHER posts)
                const postLink = imgEl.closest('a[href*="/p/"], a[href*="/reel/"]');
                if (postLink) {
                  const href = postLink.getAttribute('href') || '';
                  if (meta.postId && meta.postId !== 'post' && !href.includes(meta.postId)) {
                    return; // Exclude recommended post image!
                  }
                }

                if (src && typeof src === 'string') {
                  if (src.includes('.jpg') || src.includes('.webp') || src.includes('.png') || src.includes('.heic') || src.includes('dst-jpg') || src.includes('cdninstagram.com') || src.includes('fbcdn.net')) {
                    collectedUrls.add(src);
                  }
                }
              });

              // 2. Collect Video elements & Sources strictly inside postBox
              const currentVideos = postBox.querySelectorAll('video');
              for (const vEl of currentVideos) {
                if (vEl.closest('header') || vEl.closest('ul._a9ym')) continue;

                const postLink = vEl.closest('a[href*="/p/"], a[href*="/reel/"]');
                if (postLink) {
                  const href = postLink.getAttribute('href') || '';
                  if (meta.postId && meta.postId !== 'post' && !href.includes(meta.postId)) {
                    continue; // Exclude recommended video!
                  }
                }

                if (vEl.src && !vEl.src.startsWith('blob:')) {
                  collectedUrls.add(vEl.src);
                } else if (vEl.currentSrc && !vEl.currentSrc.startsWith('blob:')) {
                  collectedUrls.add(vEl.currentSrc);
                }

                vEl.querySelectorAll('source').forEach(sEl => {
                  if (sEl.src && !sEl.src.startsWith('blob:')) {
                    collectedUrls.add(sEl.src);
                  }
                });

                try {
                  const fiberVideoUrl = await getVideoUrlViaMainWorldBridge(vEl) || findVideoUrlFromReactProps(vEl);
                  if (fiberVideoUrl) {
                    collectedUrls.add(fiberVideoUrl);
                  }
                } catch(e) {}
              }
            }

            showToast('batch-start', '슬라이드 탐색 시작 🔍', '캐러셀 전체 이미지 및 동영상을 탐색하여 압축 저장합니다.', 'info');

            let steps = 0;
            const maxSteps = 15;

            // Instant scan before stepping
            collectCurrentSlideMedia();

            const slideInterval = setInterval(async () => {
              steps++;
              // Robust Next button selectors inside postBox
              const nextBtn = postBox.querySelector('button[aria-label="Next"]') || 
                              postBox.querySelector('button[aria-label="다음"]') || 
                              postBox.querySelector('button._af2v') || 
                              postBox.querySelector('div._9zm2 button') ||
                              postBox.querySelector('svg[aria-label="Next"]')?.closest('button') ||
                              postBox.querySelector('svg[aria-label="다음"]')?.closest('button') ||
                              postBox.querySelector('button._a9--._a9_0');

              if (nextBtn && steps < maxSteps) {
                try {
                  nextBtn.click();
                } catch (e) {}
                setTimeout(collectCurrentSlideMedia, 200);
              } else {
                clearInterval(slideInterval);
                await collectCurrentSlideMedia();

                const rawUrlList = Array.from(collectedUrls);
                const finalUrlList = deduplicateMediaUrls(rawUrlList);

                if (finalUrlList.length === 0) {
                  showToast('batch-empty', '탐색 실패', '캐러셀 미디어를 찾을 수 없습니다.', 'error');
                  return;
                }

                if (window.TAKCore && window.TAKCore.triggerZipDownload) {
                  window.TAKCore.triggerZipDownload(finalUrlList, meta, 'instagram');
                } else {
                  showToast('batch-download', '일괄 저장 시작 🚀', `총 ${finalUrlList.length}개의 미디어를 다운로드합니다.`, 'success');
                  finalUrlList.forEach((mediaUrl, idx) => {
                    setTimeout(() => {
                      const isVideo = mediaUrl.includes('.mp4');
                      triggerDownload(mediaUrl, isVideo ? 'video' : 'image', {
                        ...meta,
                        postId: `${meta.postId}_slide_${idx + 1}`
                      }, 'instagram');
                    }, idx * 300);
                  });
                }
              }
            }, 250);
          });

          batchBtn.setAttribute('data-media-type', 'batch');
          batchBtn.title = '이 캐러셀 게시물의 모든 사진/동영상 슬라이드 탐색 후 저장';
          batchBtn.style.background = 'rgba(16, 185, 129, 0.95)';
          batchBtn.style.borderColor = 'rgba(16, 185, 129, 0.2)';
          batchBtn.style.borderLeft = '4px solid #10b981';
          batchBtn.style.color = '#000000';
          
          const labelSpan = batchBtn.querySelector('span');
          if (labelSpan) labelSpan.textContent = `모두 저장`;

          btnContainer.appendChild(batchBtn);
        }
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

  // ========== Process Stories ==========
  function processStories() {
    if (!window.location.pathname.includes('/stories/')) return;

    // 스토리 컨테이너 찾기
    const storyContainer = document.querySelector('div._ac2d') || document.querySelector('div._ac1z') || document.querySelector('section');
    if (!storyContainer) return;

    // 활성화되어 화면에 노출 중인 비디오 또는 이미지 태그 탐색
    const activeVideo = storyContainer.querySelector('video');
    const activeImg = storyContainer.querySelector('img[decoding="sync"]'); // 스토리 원본 이미지는 주로 decoding="sync"를 씀

    // 비디오 또는 이미지 중 현재 노출된 대상을 추출
    let targetEl = activeVideo || activeImg;
    if (!targetEl) {
      // fallback: 아무 이미지나 가져오기 (단, 아바타 등 isValidImage가 아닌 것 제외)
      const imgs = storyContainer.querySelectorAll('img');
      for (const img of imgs) {
        if (isValidImage(img)) {
          targetEl = img;
          break;
        }
      }
    }

    if (!targetEl) return;

    const isVideo = targetEl.tagName === 'VIDEO';
    const mediaType = isVideo ? 'video' : 'image';

    // 스토리 컨테이너 우측 상단에 단 하나의 버튼만 마운트되도록 관리
    const btnContainer = getOrCreateButtonContainer(storyContainer);
    
    // 타겟이 바뀌거나 URL이 달라졌을 때 기존 스토리 버튼을 갱신하기 위해 이전 버튼의 미디어 타입을 대조
    const existingBtn = btnContainer.querySelector('.threads-download-btn');
    if (existingBtn) {
      // 이미 같은 미디어 타입의 버튼이 있고, targetEl 속성이 최신화되어 있다면 그대로 둠
      if (existingBtn.getAttribute('data-media-type') === mediaType) {
        // 스토리 전환 시 타겟 URL 갱신을 위해 데이터 속성에 저장
        const currentUrl = isVideo ? (targetEl.src || targetEl.currentSrc) : targetEl.src;
        existingBtn.setAttribute('data-target-url', currentUrl || '');
        return;
      }
      // 타입이 변경되었을 경우 기존 버튼 제거 후 다시 생성
      existingBtn.remove();
    }

    storyContainer.classList.add('threads-download-container');

    const btn = createDownloadButton(mediaType, async (e) => {
      const meta = getPostMetadata(targetEl);
      
      // 실시간 데이터 속성에 주입된 최신 URL을 사용
      const targetUrl = btn.getAttribute('data-target-url') || (isVideo ? (targetEl.src || targetEl.currentSrc) : targetEl.src);
      
      if (!targetUrl) {
        showToast(Date.now().toString(), '다운로드 불가', '스토리 미디어 URL을 찾을 수 없습니다.', 'error');
        return;
      }

      if (isVideo) {
        // 비디오 URL이 blob일 경우 React props 혹은 리소스로부터 실주소 복구 시도
        let realVideoUrl = targetUrl;
        if (realVideoUrl.startsWith('blob:')) {
          realVideoUrl = await getVideoUrlViaMainWorldBridge(targetEl) || findVideoUrlFromReactProps(targetEl) || findVideoUrlFromResources();
        }
        if (realVideoUrl) {
          triggerDownload(realVideoUrl, 'video', meta, 'instagram');
        } else {
          showToast(Date.now().toString(), '다운로드 준비 중', '동영상을 1~2초간 재생한 뒤 다시 시도해 주세요.', 'error');
        }
      } else {
        triggerDownload(targetUrl, 'image', meta, 'instagram');
      }
    });

    // 초기 URL 할당
    const initialUrl = isVideo ? (targetEl.src || targetEl.currentSrc) : targetEl.src;
    btn.setAttribute('data-target-url', initialUrl || '');

    btnContainer.appendChild(btn);
  }

  function processPageMedia() {
    processStories(); // 스토리 먼저 확인
    processVideoPlayers();
    processImages();
  }

  // Register Instagram platform processor
  window.TAKPlatform = {
    name: 'instagram',
    process: processPageMedia
  };
})();
