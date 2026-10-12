/* TAKOH Media Downloader PRO - TikTok Module (Auto-Retry Engine) */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  // Cleanup orphaned buttons on SPA navigation (e.g. going from explore to detail page)
  function cleanupOrphanedButtons() {
    document.querySelectorAll('.takoh-video-overlay-btn').forEach(btn => {
      if (!document.body.contains(btn)) return;
      const parent = btn.parentElement;
      if (parent && !parent.querySelector('video')) {
        btn.remove();
        delete parent.dataset.takohButtonAttached;
      }
    });
  }

  // Extract clean username, exact video ID, post title, and direct 1:1 Fiber MP4 URL
  function getContainerMetadata(container, videoEl) {
    let username = 'tiktok_user';
    let postId = 'video';
    let videoUrl = window.location.href;
    let descText = '';
    let fiberPlayUrl = '';

    // 0. High-Priority DOM Card Scoping for TikTok Feed Items (article[data-e2e="recommend-list-item-container"], article[id*="item-"])
    const cardArticle = (container || videoEl) ? (container || videoEl).closest('article[data-e2e="recommend-list-item-container"], article[id*="item-"], div[data-e2e="recommend-list-item-container"]') : null;

    if (cardArticle) {
      // Extract Video ID from xgwrapper ID (e.g. xgwrapper-0-7652533920562449678)
      const xgWrapper = cardArticle.querySelector('[id*="xgwrapper-"]');
      if (xgWrapper && xgWrapper.id) {
        const xgMatch = xgWrapper.id.match(/xgwrapper-\d+-(\d+)/);
        if (xgMatch) postId = xgMatch[1];
      }

      // Fallback Video ID from Music link (e.g. /music/original-sound-7652533982248160014)
      if (postId === 'video') {
        const musicLink = cardArticle.querySelector('a[href*="/music/"]');
        if (musicLink && musicLink.href) {
          const musicMatch = musicLink.href.match(/-(\d+)$/);
          if (musicMatch) postId = musicMatch[1];
        }
      }

      // Fallback Video ID from video link if present
      if (postId === 'video') {
        const videoLink = cardArticle.querySelector('a[href*="/video/"]');
        if (videoLink && videoLink.href) {
          const vMatch = videoLink.href.match(/\/video\/(\d+)/);
          if (vMatch) postId = vMatch[1];
        }
      }

      // Extract Username from Author link (e.g. /@funnybean8)
      const authorLink = cardArticle.querySelector('a[href*="/@"]');
      if (authorLink && authorLink.href) {
        const userMatch = authorLink.href.match(/\/@([a-zA-Z0-9_.-]+)/);
        if (userMatch) username = userMatch[1];
      }

      // Extract Description from card
      const descEl = cardArticle.querySelector('[data-e2e="video-desc"], [class*="DivDescriptionContentContainer"], [class*="DivDesc"]');
      if (descEl && descEl.textContent.trim()) {
        descText = descEl.textContent.trim();
      }

      if (postId !== 'video' && username !== 'tiktok_user') {
        videoUrl = `https://www.tiktok.com/@${username}/video/${postId}`;
      }
    }

    // 1. Extract item metadata directly from React Fiber props of container / video element if DOM extraction was partial
    if ((username === 'tiktok_user' || postId === 'video') && (container || videoEl)) {
      let curr = videoEl || container;
      for (let i = 0; i < 40 && curr; i++) {
        const fiberKey = Object.keys(curr).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
          let node = curr[fiberKey];
          for (let j = 0; j < 40 && node; j++) {
            const mp = node.memoizedProps;
            if (mp) {
              const item = mp.item || mp.itemStruct || (mp.videoData ? mp.videoData : null);
              if (item) {
                if (item.id) postId = item.id;
                if (item.author?.uniqueId) username = item.author.uniqueId;
                if (item.desc && !descText) descText = item.desc;
                videoUrl = `https://www.tiktok.com/@${username}/video/${postId}`;

                if (item.video) {
                  const v = item.video;
                  const rawUrl = v.downloadAddr || v.playAddr || (v.bitrateInfo && v.bitrateInfo[0] && v.bitrateInfo[0].PlayAddr && v.bitrateInfo[0].PlayAddr.UrlList ? v.bitrateInfo[0].PlayAddr.UrlList[0] : null);
                  if (rawUrl && rawUrl.startsWith('http') && !rawUrl.includes('.json')) {
                    fiberPlayUrl = rawUrl;
                  }
                }
                break;
              }
            }
            node = node.return;
          }
          if (postId !== 'video') break;
        }
        curr = curr.parentElement;
      }
    }

    // 3. Clean description text for file title if available
    if (!descText && container) {
      const descEl = container.querySelector('[data-e2e="browse-video-desc"], [class*="SpanText"], [class*="DivVideoTitle"], h1[class*="Title"], [data-e2e="user-post-item-desc"], [class*="DivDesc"]');
      if (descEl && descEl.textContent.trim()) {
        descText = descEl.textContent.trim();
      }
    }

    let fileTitle = postId;
    if (descText) {
      const cleanDesc = descText
        .replace(/#[^\s#]+/g, '')
        .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 30);
      if (cleanDesc.length > 2) {
        fileTitle = `${postId}_${cleanDesc}`;
      }
    }

    const safeUser = username.replace(/[^a-zA-Z0-9가-힣_-]/g, '');
    const safeTitle = fileTitle.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();

    return {
      username: safeUser,
      postId: safeTitle,
      rawPostId: postId.replace(/[^0-9]/g, ''),
      title: safeTitle,
      videoUrl: videoUrl,
      fiberPlayUrl: fiberPlayUrl,
      filename: `${safeUser}_${safeTitle}.mp4`
    };
  }

  // Global Fiber DOM Search: Search whole DOM for exact matching post ID
  function findExactFiberPlayUrlByPostId(targetPostId) {
    if (!targetPostId) return null;

    const allElements = Array.from(document.querySelectorAll('*'));
    for (const el of allElements) {
      const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      if (fiberKey) {
        let node = el[fiberKey];
        for (let j = 0; j < 15 && node; j++) {
          const mp = node.memoizedProps;
          if (mp) {
            const item = mp.item || mp.itemStruct || (mp.videoData ? mp.videoData : null);
            if (item && String(item.id) === String(targetPostId) && item.video) {
              const v = item.video;
              const rawUrl = v.downloadAddr || v.playAddr || (v.bitrateInfo && v.bitrateInfo[0] && v.bitrateInfo[0].PlayAddr && v.bitrateInfo[0].PlayAddr.UrlList ? v.bitrateInfo[0].PlayAddr.UrlList[0] : null);
              if (rawUrl && rawUrl.startsWith('http') && !rawUrl.includes('.json')) {
                return rawUrl;
              }
            }
          }
          node = node.return;
        }
      }
    }
    return null;
  }

  // Download video via direct Blob fetch inside current TikTok browser session
  async function downloadVideoAsBlob(targetUrl, meta, toastId) {
    try {
      showToast(toastId, '다운로드 중 🚀', `${meta.username}님의 동영상을 다운로드합니다.`, 'info');

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size < 10240) {
        throw new Error('Downloaded file size too small or corrupted.');
      }

      const blobUrl = URL.createObjectURL(blob);
      triggerDownload(blobUrl, 'video', meta, 'tiktok');
      showToast(toastId, '다운로드 완료 🎉', `${meta.username}님의 동영상이 저장되었습니다.`, 'success');

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return true;
    } catch (err) {
      console.warn('[TAKOH TikTok Blob Fetch Failed]', err);
      return false;
    }
  }

  // Helper Server Request with Automatic Retry (3 Attempts with 1.5s delay)
  async function requestHelperServerWithRetry(helperUrl, meta, toastId, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const isSuccess = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({
            action: 'download',
            url: `${helperUrl}&attempt=${attempt}`,
            filename: meta.filename,
            username: meta.username,
            postId: meta.postId,
            type: 'video',
            platform: 'tiktok'
          }, (dlResponse) => {
            if (!chrome.runtime.lastError && dlResponse && dlResponse.success) {
              resolve(true);
            } else {
              resolve(false);
            }
          });
        } catch (e) {
          resolve(false);
        }
      });

      if (isSuccess) return true;

      // If failed, wait 1.5s before automatic retry
      if (attempt < maxRetries) {
        console.log(`[TAKOH TikTok Auto-Retry] Helper server attempt ${attempt} failed. Retrying in 1.5s...`);
        showToast(toastId, '자동 재시도 중 🔄', `틱톡 차단을 우회하여 재시도 중입니다 (${attempt}/${maxRetries})...`, 'info');
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    return false;
  }

  // Pure High-Speed Direct MP4 Download Handler (Auto 1.5s Play Buffer + 1:1 Direct Engine)
  async function handleDownloadClick(container, videoEl) {
    try {
      const toastId = Date.now().toString();

      // 1. 동영상 자동 재생 및 1초 자율 버퍼링 수행 (사용자가 따로 재생하지 않아도 확장프로그램이 자동 처리)
      if (videoEl) {
        try {
          if (videoEl.paused) {
            videoEl.play().catch(() => {});
          }
        } catch (e) {}
      }

      showToast(toastId, '자동 미디어 추출 중 ⚡', '틱톡 세션 인증 후 동영상이 바로 저장됩니다...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 자동 재생 대기

      const meta = getContainerMetadata(container, videoEl);
      let videoUrl = '';

      // Step 1: Check 1:1 direct React Fiber MP4 URL extracted directly from container
      if (meta && meta.fiberPlayUrl) {
        videoUrl = meta.fiberPlayUrl;
      }

      // Step 2: Global DOM Fiber Search for exact rawPostId
      if (!videoUrl && meta && meta.rawPostId) {
        videoUrl = findExactFiberPlayUrlByPostId(meta.rawPostId);
      }

      // Step 3: Check direct HTML5 video element src / currentSrc if valid HTTP MP4 URL
      if (!videoUrl && videoEl) {
        try {
          const s1 = videoEl.src || '';
          const s2 = videoEl.currentSrc || '';
          if (s1 && !s1.startsWith('blob:') && s1.startsWith('http') && !s1.includes('.json')) {
            videoUrl = s1;
          } else if (s2 && !s2.startsWith('blob:') && s2.startsWith('http') && !s2.includes('.json')) {
            videoUrl = s2;
          }
        } catch (e) {}
      }

      // If 1:1 direct MP4 stream is found locally, download directly via Chrome Download API
      if (videoUrl && !videoUrl.includes('.json') && !videoUrl.includes('.m3u8')) {
        console.log('[TAKOH TikTok Auto-Play Engine] Downloading MP4:', meta ? meta.rawPostId : 'media', meta ? meta.filename : 'tiktok.mp4');
        triggerDownload(videoUrl, 'video', meta || {}, 'tiktok');
        showToast(toastId, '다운로드 시작 🎉', `${meta ? meta.username : 'tiktok'}님의 동영상이 저장됩니다.`, 'success');
        return;
      }

      // Step 4: Fallback to helper server ONLY IF a valid /video/ URL is resolved
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['ytdlpApiUrl', 'videoQuality'], async (result) => {
          const apiEndpoint = result.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
          const quality = result.videoQuality || 'best';
          
          let targetUrl = meta ? meta.videoUrl : '';
          if (!targetUrl || !targetUrl.includes('/video/')) {
            if (meta && meta.rawPostId && meta.username && meta.username !== 'tiktok_user') {
              targetUrl = `https://www.tiktok.com/@${meta.username}/video/${meta.rawPostId}`;
            } else {
              targetUrl = null;
            }
          }

          if (targetUrl && targetUrl.includes('/video/')) {
            const helperUrl = `${apiEndpoint}?url=${encodeURIComponent(targetUrl)}&quality=${quality}&_t=${Date.now()}`;
            console.log('[TAKOH TikTok Auto-Retry Helper Request]', helperUrl);

            const ok = await requestHelperServerWithRetry(helperUrl, meta || {}, toastId, 3);
            if (!ok) {
              showToast(toastId, '다운로드 안내 💡', '도우미 프로그램(start_helper.bat)이 켜져 있는지 확인해 주세요!', 'warning');
            }
          } else {
            showToast(toastId, '다운로드 안내 💡', '버튼을 다시 한 번 눌러주시면 즉시 저장됩니다!', 'info');
          }
        });
      }
    } catch (err) {
      console.warn('[TAKOH TikTok handleDownloadClick Handled Exception]', err);
    }
  }

  // Find exact video player wrapper
  function findTargetPlayerBox(v) {
    if (!v) return null;

    let parent = v.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const className = parent.className || '';
      const dataE2e = parent.getAttribute ? parent.getAttribute('data-e2e') : '';
      if (className.includes('DivBasicPlayerWrapper') ||
          className.includes('DivContainer') ||
          className.includes('DivPlayerContainer') ||
          className.includes('DivItemContainer') ||
          dataE2e === 'feed-video' ||
          dataE2e === 'explore-item' ||
          dataE2e === 'recommend-list-item-container') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return v.parentElement;
  }

  // Scanner: Attach overlay download buttons directly to TikTok video player frames
  function scanForVideos() {
    if (!config.enableVideos) return;

    cleanupOrphanedButtons();

    const videos = document.querySelectorAll('video');

    videos.forEach(v => {
      if (v.offsetWidth < 80 || v.offsetHeight < 80) return;

      const targetBox = findTargetPlayerBox(v);
      if (!targetBox) return;

      if (targetBox.dataset.takohButtonAttached || targetBox.querySelector('.takoh-video-overlay-btn')) return;

      targetBox.dataset.takohButtonAttached = 'true';

      const style = window.getComputedStyle(targetBox);
      if (style.position === 'static') {
        targetBox.style.position = 'relative';
      }

      const btn = document.createElement('button');
      btn.className = 'takoh-video-overlay-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;flex-shrink:0;">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        <span>다운로드</span>
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
        background: 'rgba(0, 0, 0, 0.8)',
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
        btn.style.background = '#fe2c55';
        btn.style.color = '#ffffff';
        btn.style.transform = 'scale(1.05)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(0, 0, 0, 0.8)';
        btn.style.color = '#ffffff';
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
        await handleDownloadClick(targetBox, v);
      }, true);

      targetBox.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btn, v);
    });
  }

  // Register TikTok platform processor
  window.TAKPlatform = {
    name: 'tiktok',
    process: scanForVideos
  };
})();
