/* TAKOH Media Downloader PRO - Threads Module */

(() => {
  function initModule() {
    if (!window.TAKCore) return;
    const { config, showToast, triggerDownload, createDownloadButton, getOrCreateButtonContainer, findMediaContainer } = window.TAKCore;

    const PLATFORM_RULES = [
      'div[aria-label="Video player"]',
      'div[aria-label="동영상 플레이어"]',
      'div[aria-label="비디오 플레이어"]',
      'div[data-visualcompletion="media-renderer"]',
      'div[role="presentation"]'
    ];

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'threads', postId = 'post';
    const urlMatch = window.location.pathname.match(/\/@([a-zA-Z0-9_.]+)\/post\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) { username = urlMatch[1]; postId = urlMatch[2]; }
    const article = element.closest('article') || element.closest('[role="article"]');
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
      // Skip control thumbnails and tiny elements
      if (videoEl.offsetWidth < 100 || videoEl.offsetHeight < 100) return;

      // Sync lock videoEl directly (highest accuracy sync lock)
      if (videoEl.hasAttribute('data-threads-processed') || 
          videoEl.getAttribute('data-button-injected') === 'true') {
        return;
      }

      let playerContainer = findMediaContainer(videoEl, PLATFORM_RULES) || 
                            videoEl.closest('div[aria-label*="player" i]') ||
                            videoEl.closest('div[role="presentation"]') ||
                            videoEl.parentElement;
      if (!playerContainer) return;

      // Check container sync flags
      if (playerContainer.hasAttribute('data-threads-processed') || 
          playerContainer.getAttribute('data-button-injected') === 'true' ||
          playerContainer.querySelector('.threads-download-btn[data-media-type="video"]')) {
        videoEl.setAttribute('data-threads-processed', 'true');
        return;
      }

      // Sync lock: Mark element and container
      videoEl.setAttribute('data-threads-processed', 'true');
      playerContainer.setAttribute('data-threads-processed', 'true');
      playerContainer.setAttribute('data-button-injected', 'true');
      playerContainer.classList.add('threads-download-container');

      const btnContainer = getOrCreateButtonContainer(playerContainer);
      btnContainer.style.setProperty('top', '32%', 'important'); // Explicitly lock video container to top-third

      if (btnContainer.querySelector('.threads-download-btn[data-media-type="video"]')) {
        return;
      }

      console.log("[Threads Downloader] Detected video player. Injecting button.");

      const btn = createDownloadButton('video', async () => {
        console.log('[Threads Downloader] Video download button clicked!');
        try {
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
            const allUrls = findAllVideoUrls();
            if (allUrls.length > 0) {
              videoUrl = allUrls[allUrls.length - 1];
            }
          }

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
    if (!config.enableImages) return false;

    // 글쓰기 창(새로운 스레드), 답글 달기 창 등 대화상자(dialog) 내부 이미지 제외
    const inDialog = img.closest('div[role="dialog"]') || 
                     img.closest('div[aria-label="새로운 스레드"]') || 
                     img.closest('div[aria-label="답글"]');
    if (inDialog) return false;

    // 프로필 헤더, 프로필 사진 영역(header, avatar, profile 링크 등) 완벽 제외
    const inProfileHeader = img.closest('header') || 
                            img.closest('div[aria-label*="프로필" i]') || 
                            img.closest('div[aria-label*="Profile" i]') ||
                            img.closest('div[data-pressable-container="true"] a[href^="/@"]') ||
                            img.closest('a[role="link"][href^="/@"]');
    if (inProfileHeader) return false;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // 150px 미만의 작은 아바타/아이콘 제외
    if (width > 0 && width < 150) return false;
    if (height > 0 && height < 150) return false;
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
        src.includes('/s320x320/') ||
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
      if (img.hasAttribute('data-threads-processed')) return;

      const check = () => {
        if (img.hasAttribute('data-threads-processed')) return;
        if (!isValidImage(img)) {
          img.setAttribute('data-threads-processed', 'failed');
          return;
        }

        let container = findMediaContainer(img, PLATFORM_RULES);
        if (!container) return;

        // Check if this image belongs to a video player card (control, play button, poster image)
        const isVideoThumb = container.querySelector('video') || 
                            container.querySelector('div[aria-label*="video" i]') ||
                            container.querySelector('div[aria-label*="play" i]') ||
                            container.querySelector('div[aria-label*="재생" i]') ||
                            container.querySelector('div[aria-label*="동영상" i]') ||
                            container.querySelector('div[aria-label*="비디오" i]') ||
                            container.querySelector('div[role="button"][tabindex="0"]') ||
                            container.closest('div[aria-label="Video player"]') ||
                            container.closest('div[aria-label="동영상 플레이어"]') ||
                            container.closest('div[aria-label="비디오 플레이어"]') ||
                            img.closest('div[aria-label="Video player"]') ||
                            img.closest('div[aria-label="동영상 플레이어"]') ||
                            img.closest('div[aria-label="비디오 플레이어"]');

        const labelType = isVideoThumb ? 'thumbnail' : 'image';

        img.setAttribute('data-threads-processed', 'true');
        const btnContainer = getOrCreateButtonContainer(container);
        btnContainer.style.setProperty('top', '68%', 'important');

        if (btnContainer.querySelector(`.threads-download-btn[data-media-type="${labelType}"]`)) return;

        container.classList.add('threads-download-container');

        // Dynamic active slide media finder on click
        const btn = createDownloadButton(labelType, () => {
          console.log('[Threads Downloader] Image download button clicked!');
          const activeImg = container.querySelector('img[src]') || img;
          if (activeImg && activeImg.src) {
            const meta = getPostMetadata(container);
            triggerDownload(activeImg.src, labelType, meta, 'threads');
          }
        });

        btnContainer.appendChild(btn);

        // Batch download for Threads Carousel posts
        const postBoundary = container.closest('article') || container.closest('[role="article"]') || container;
        const allMediaUrls = findAllMediaUrlsFromReactProps(postBoundary) || findAllMediaUrlsFromReactProps(img) || [];
        
        const uniqueUrls = Array.from(new Set(allMediaUrls)).filter(url => {
          return url && typeof url === 'string' && (url.includes('.jpg') || url.includes('.webp') || url.includes('.png') || url.includes('.mp4')) && !url.includes('/s150x150/') && !url.includes('/s320x320/');
        });

        if (uniqueUrls.length > 1) {
          if (btnContainer.querySelector('.threads-download-btn[data-media-type="batch"]')) return;

          const batchBtn = createDownloadButton('image', () => {
            const meta = getPostMetadata(container);
            showToast('batch-start', '일괄 저장 시작 🚀', `총 ${uniqueUrls.length}개의 쓰레드 미디어를 순차적으로 저장합니다.`, 'success');
            
            uniqueUrls.forEach((mediaUrl, idx) => {
              setTimeout(() => {
                const isVideo = mediaUrl.includes('.mp4');
                triggerDownload(mediaUrl, isVideo ? 'video' : 'image', {
                  ...meta,
                  postId: `${meta.postId}_slide_${idx + 1}`
                }, 'threads');
              }, idx * 250);
            });
          });

          batchBtn.setAttribute('data-media-type', 'batch');
          batchBtn.title = '이 쓰레드 게시물의 모든 사진/동영상 한 번에 저장';
          batchBtn.style.background = 'rgba(16, 185, 129, 0.95)';
          batchBtn.style.borderColor = 'rgba(16, 185, 129, 0.2)';
          batchBtn.style.borderLeft = '4px solid #10b981';
          batchBtn.style.color = '#000000';
          
          const labelSpan = batchBtn.querySelector('span');
          if (labelSpan) labelSpan.textContent = `모두 저장 (${uniqueUrls.length})`;

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

  function processPageMedia() {
    try {
      processVideoPlayers();
    } catch (e) {}
    try {
      processImages();
    } catch (e) {}
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
