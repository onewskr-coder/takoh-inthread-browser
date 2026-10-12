/* TAKOH Media Downloader PRO - Facebook Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'facebook_user';
    let postId = 'post';
    let postUrl = window.location.href;

    if (element) {
      const article = element.closest('div[role="article"]') || element.closest('[data-pagelet="FeedUnit"]') || element.closest('div[class*="x1yztbdb"]') || element.closest('div[class*="x78zum5"]');
      if (article) {
        const links = article.querySelectorAll('a[href*="/videos/"], a[href*="/reel/"], a[href*="/watch/"], a[href*="/posts/"], a[href*="permalink"]');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const m = href.match(/\/(?:videos|reel|watch|posts|permalink)(?:\/|\?v=)([0-9]+)/);
          if (m) {
            postId = m[1];
            postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
            break;
          }
        }

        const nameEl = article.querySelector('strong span, a[role="link"] strong, a[role="link"] span, h2 span, h3 span');
        if (nameEl && nameEl.textContent.trim()) {
          username = nameEl.textContent.trim().replace(/\s+/g, '_');
        }

        const textEl = article.querySelector('div[data-ad-preview="message"], div[dir="auto"]');
        if (textEl && textEl.textContent.trim()) {
          const cleanText = textEl.textContent.trim().replace(/#[^\s#]+/g, '').replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim().substring(0, 25);
          if (cleanText.length > 2) postId = `${postId !== 'post' ? postId + '_' : ''}${cleanText}`;
        }
      }
    }

    if (postId === 'post') {
      const url = window.location.href;
      const watchMatch = url.match(/[?&]v=([0-9]+)/);
      if (watchMatch) {
        postId = watchMatch[1];
      } else {
        const pathMatch = url.match(/\/(posts|videos|watch|reel|permalink|groups\/[^/]+\/permalink)\/([0-9]+)/);
        if (pathMatch) {
          postId = pathMatch[2];
        }
      }
    }

    const safeUser = username.replace(/[^a-zA-Z0-9가-힣_-]/g, '') || 'facebook_user';
    const safeTitle = postId.replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim() || 'video';

    return {
      username: safeUser,
      postId: safeTitle,
      title: safeTitle,
      postUrl: postUrl,
      filename: `${safeUser}_${safeTitle}.mp4`
    };
  }

  // ========== React Fiber Scoped Video URL Extraction ==========
  function extractFacebookFiberVideoUrl(videoEl, container) {
    let curr = videoEl || container;
    let depth = 0;

    const searchProps = (obj, d = 0) => {
      if (!obj || d > 8) return null;
      try {
        if (typeof obj === 'string' && obj.startsWith('http') && (obj.includes('fbcdn.net') || obj.includes('facebook.com')) && obj.includes('.mp4')) {
          return obj;
        }
        if (typeof obj === 'object') {
          const hd = obj.playable_url_quality_hd || obj.playable_url_quality_hd_src || obj.playableUrlQualityHd;
          if (hd && typeof hd === 'string' && hd.startsWith('http')) return hd;

          const sd = obj.playable_url || obj.playableUrl || obj.videoUrl || obj.video_url;
          if (sd && typeof sd === 'string' && sd.startsWith('http') && !sd.includes('.m3u8')) return sd;

          for (const k in obj) {
            if (k.startsWith('__') || k === 'return' || k === 'stateNode' || k === 'current') continue;
            const res = searchProps(obj[k], d + 1);
            if (res) return res;
          }
        }
      } catch (e) {}
      return null;
    };

    while (curr && depth < 25) {
      const fiberKey = Object.keys(curr).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (fiberKey) {
        let node = curr[fiberKey];
        let nDepth = 0;
        while (node && nDepth < 35) {
          if (node.memoizedProps) {
            const found = searchProps(node.memoizedProps);
            if (found) return found;
          }
          if (node.pendingProps) {
            const found = searchProps(node.pendingProps);
            if (found) return found;
          }
          if (node.memoizedState) {
            const found = searchProps(node.memoizedState);
            if (found) return found;
          }
          node = node.return;
          nDepth++;
        }
      }
      curr = curr.parentElement;
      depth++;
    }
    return null;
  }

  function findVideoUrlFromResources() {
    try {
      const entries = performance.getEntriesByType('resource');
      const videoUrls = entries
        .map(e => e.name)
        .filter(url => url.includes('.mp4') && url.includes('fbcdn.net'));
      if (videoUrls.length > 0) return videoUrls[videoUrls.length - 1];
    } catch (e) {}
    return null;
  }

  // ========== Helper: Query Video URL from Main World Bridge ==========
  async function getVideoUrlViaMainWorldBridge(videoEl) {
    if (!videoEl) return null;
    const requestId = 'fb_' + Math.random().toString(36).substring(2, 9);
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
      setTimeout(() => {
        document.removeEventListener('TAKOH_RESPONSE_URL', onResponse);
        videoEl.removeAttribute('data-takoh-target');
        resolve(null);
      }, 1000);
    });
  }

  function findTargetPlayerBox(v) {
    if (!v) return null;
    return v.closest('div[class*="x1yztbdb"]') ||
           v.closest('div[role="article"]') ||
           v.closest('div[class*="x78zum5"]') ||
           v.parentElement;
  }

  // Scanner: Attach overlay download buttons directly to Facebook Videos
  function scanForVideos() {
    if (!config.enableVideos) return;

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
        background: 'rgba(24, 119, 242, 0.9)',
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
        btn.style.background = '#1877f2';
        btn.style.transform = 'scale(1.05)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(24, 119, 242, 0.9)';
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

        const meta = getPostMetadata(targetBox);

        let videoUrl = '';
        if (v.src && !v.src.startsWith('blob:')) {
          videoUrl = v.src;
        } else if (v.currentSrc && !v.currentSrc.startsWith('blob:')) {
          videoUrl = v.currentSrc;
        }

        // 1. Query Main World Bridge for pure React Fiber HD/SD video URL
        if (!videoUrl) {
          videoUrl = await getVideoUrlViaMainWorldBridge(v);
        }

        // 2. Extract specifically from React Fiber in content script
        if (!videoUrl) {
          videoUrl = extractFacebookFiberVideoUrl(v, targetBox);
        }

        // 3. Extract from captured background network requests
        if (!videoUrl) {
          try {
            const captured = await new Promise(resolve => {
              chrome.runtime.sendMessage({ action: 'getMediaUrls' }, (resp) => {
                if (chrome.runtime.lastError) resolve([]);
                else resolve(resp && resp.urls ? resp.urls : []);
              });
            });
            const fbVideos = captured
              .map(c => c.url)
              .filter(u => u && u.includes('.mp4') && (u.includes('fbcdn.net') || u.includes('facebook.com')));
            if (fbVideos.length > 0) {
              videoUrl = fbVideos[fbVideos.length - 1];
            }
          } catch (err) {}
        }

        // 4. Fallback to resource timing entry
        if (!videoUrl) {
          videoUrl = findVideoUrlFromResources();
        }

        if (videoUrl) {
          triggerDownload(videoUrl, 'video', meta, 'facebook');
        } else if (meta.postUrl && (meta.postUrl.includes('/videos/') || meta.postUrl.includes('/reel/') || meta.postUrl.includes('watch'))) {
          chrome.storage.local.get(['ytdlpApiUrl', 'videoQuality'], async (result) => {
            const apiEndpoint = result.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
            const quality = result.videoQuality || 'best';
            const helperUrl = `${apiEndpoint}?url=${encodeURIComponent(meta.postUrl)}&quality=${quality}&_t=${Date.now()}`;
            chrome.runtime.sendMessage({
              action: 'download',
              url: helperUrl,
              filename: meta.filename,
              username: meta.username,
              postId: meta.postId,
              type: 'video',
              platform: 'facebook'
            });
          });
        } else {
          showToast(Date.now().toString(), '다운로드 안내', '동영상을 1~2초간 재생해 주신 후 다시 시도해 주세요.', 'info');
        }
      }, true);

      targetBox.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btn, v);
    });
  }

  // Register Facebook platform processor
  window.TAKPlatform = {
    name: 'facebook',
    process: scanForVideos
  };
})();
