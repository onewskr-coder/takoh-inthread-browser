/* TAKOH Media Downloader PRO - X (Twitter) Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  // Helper: Find index of specific video in multi-video tweet
  function getVideoIndexInArticle(container) {
    if (!container) return 0;

    // 1. Check direct link on container or inside container (e.g. /username/status/123/video/2)
    const link = container.querySelector('a[href*="/video/"], a[href*="/photo/"]') || container.closest('a[href*="/video/"], a[href*="/photo/"]');
    if (link) {
      const m = (link.getAttribute('href') || '').match(/\/(?:video|photo)\/(\d+)/);
      if (m) {
        return Math.max(0, parseInt(m[1], 10) - 1);
      }
    }

    // 2. Check current page URL if opened in modal / detail view (/status/.../video/2)
    const urlMatch = (window.location.pathname || window.location.href || '').match(/\/(?:video|photo)\/(\d+)/);
    if (urlMatch) {
      return Math.max(0, parseInt(urlMatch[1], 10) - 1);
    }

    const article = container.closest('article[data-testid="tweet"]') || container.closest('article');
    if (!article) return 0;

    // 3. Find all video components in the same article
    const allVideoComponents = Array.from(article.querySelectorAll('div[data-testid="videoComponent"]'));
    const idx = allVideoComponents.indexOf(container);
    if (idx !== -1) return idx;

    // 4. Fallback: check video tags
    const allVideos = Array.from(article.querySelectorAll('video'));
    const vid = container.querySelector('video') || (container.tagName === 'VIDEO' ? container : null);
    if (vid) {
      const vidIdx = allVideos.indexOf(vid);
      if (vidIdx !== -1) return vidIdx;
    }

    return 0;
  }

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'twitter_user';
    let postId = 'media';
    let tweetId = '';
    let tweetUrl = window.location.href;
    const videoIndex = getVideoIndexInArticle(element);

    if (element) {
      const article = element.closest('article[data-testid="tweet"]') || element.closest('article');
      if (article) {
        // 1. Status link extraction
        const statusLinks = article.querySelectorAll('a[href*="/status/"]');
        for (const linkEl of statusLinks) {
          const href = linkEl.getAttribute('href') || '';
          const m = href.match(/\/([a-zA-Z0-9_]+)\/status\/(\d+)/);
          if (m) {
            username = m[1];
            tweetId = m[2];
            postId = m[2];
            tweetUrl = `https://x.com/${username}/status/${tweetId}`;
            break;
          }
        }

        // 2. User profile link extraction
        if (username === 'twitter_user') {
          const userLinks = article.querySelectorAll('a[role="link"][href^="/"]');
          for (const link of userLinks) {
            const href = link.getAttribute('href') || '';
            const m = href.match(/^\/([a-zA-Z0-9_]+)$/);
            if (m && !['home', 'explore', 'notifications', 'messages', 'search', 'i'].includes(m[1])) {
              username = m[1];
              break;
            }
          }
        }

        // 3. Time element extraction fallback
        if (!tweetId) {
          const timeLink = article.querySelector('time')?.closest('a');
          if (timeLink) {
            const m = (timeLink.getAttribute('href') || '').match(/\/status\/(\d+)/);
            if (m) {
              tweetId = m[1];
              postId = m[1];
            }
          }
        }

        // 4. Video poster thumb extraction fallback
        if (!tweetId) {
          const video = article.querySelector('video');
          const poster = video?.getAttribute('poster') || '';
          const m = poster.match(/(?:thumb|img)\/(\d+)/);
          if (m) {
            tweetId = m[1];
            if (postId === 'media') postId = m[1];
          }
        }

        // Try extracting tweet text for filename
        const textEl = article.querySelector('div[data-testid="tweetText"]');
        if (textEl && textEl.textContent.trim()) {
          const cleanText = textEl.textContent.trim().replace(/#[^\s#]+/g, '').replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim().substring(0, 25);
          if (cleanText.length > 2) postId = cleanText;
        }
      }
    }

    if (!tweetId && (tweetUrl.includes('x.com') || tweetUrl.includes('twitter.com'))) {
      const urlMatch = tweetUrl.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/);
      if (urlMatch) {
        username = urlMatch[1];
        tweetId = urlMatch[2];
        if (postId === 'media') postId = urlMatch[2];
        tweetUrl = `https://x.com/${username}/status/${tweetId}`;
      }
    }

    const safeUser = username.replace(/[^a-zA-Z0-9가-힣_-]/g, '') || 'twitter_user';
    const safeTitle = postId.replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim() || (tweetId || 'video');
    const indexSuffix = videoIndex > 0 ? `_part${videoIndex + 1}` : '';
    const videoSuffix = videoIndex > 0 ? `/video/${videoIndex + 1}` : '';
    tweetUrl = `https://x.com/${username}/status/${tweetId || postId}${videoSuffix}`;

    return {
      username: safeUser,
      postId: safeTitle,
      tweetId: tweetId,
      videoIndex: videoIndex,
      title: safeTitle,
      tweetUrl: tweetUrl,
      filename: `${safeUser}_${safeTitle}${indexSuffix}.mp4`
    };
  }

  // ========== Extract highest quality image URL ==========
  function getHighQualityImageUrl(imgSrc) {
    if (!imgSrc) return null;
    try {
      const url = new URL(imgSrc);
      if (url.hostname.includes('twimg.com')) {
        url.searchParams.set('name', 'orig');
        if (!url.searchParams.has('format')) {
          url.searchParams.set('format', 'jpg');
        }
        return url.toString();
      }
    } catch (e) {}
    return imgSrc;
  }

  // Fetch direct high quality MP4 via Twitter Syndication & VxTwitter APIs (Multi-video aware)
  async function fetchTwitterHighResVideoUrl(tweetId, mediaIndex = 0) {
    if (!tweetId || !/^\d+$/.test(tweetId)) return null;

    // Method 1: VxTwitter API (Direct High-Speed MP4 array matching)
    try {
      const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`);
      if (vxRes.ok) {
        const vxData = await vxRes.json();
        if (vxData && Array.isArray(vxData.media_extended)) {
          const videoItems = vxData.media_extended.filter(m => m.type === 'video' && m.url && m.url.includes('.mp4'));
          if (videoItems.length > 0) {
            const target = videoItems[mediaIndex] || videoItems[0];
            if (target && target.url) {
              console.log(`[TAKOH Twitter] VxTwitter MP4 found for index ${mediaIndex}:`, target.url);
              return target.url;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[TAKOH Twitter] VxTwitter API failed:', e);
    }

    // Method 2: Twitter Syndication API (Multi-video mediaDetails array)
    try {
      const token = ((Number(tweetId) / 1e15) * Math.PI).toString(64).replace(/(0+|\.)/g, '');
      const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.mediaDetails) && data.mediaDetails.length > 0) {
          const videoDetails = data.mediaDetails.filter(m => m.type === 'video' || m.type === 'animated_gif' || (m.video_info && m.video_info.variants));
          const targetMedia = videoDetails[mediaIndex] || videoDetails[0] || data.mediaDetails[mediaIndex];
          if (targetMedia && targetMedia.video_info && Array.isArray(targetMedia.video_info.variants)) {
            const mp4s = targetMedia.video_info.variants
              .filter(v => (v.type === 'video/mp4' || v.content_type === 'video/mp4') && (v.src || v.url) && !(v.src || v.url).includes('.m3u8'))
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            if (mp4s.length > 0) {
              const chosen = mp4s[0].src || mp4s[0].url;
              console.log(`[TAKOH Twitter] Syndication mediaDetails[${mediaIndex}] MP4 found:`, chosen);
              return chosen;
            }
          }
        }

        if (data && data.video && data.video.variants) {
          const mp4s = data.video.variants
            .filter(v => (v.type === 'video/mp4' || v.content_type === 'video/mp4') && (v.src || v.url) && !(v.src || v.url).includes('.m3u8'))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (mp4s.length > 0) {
            const chosen = mp4s[0].src || mp4s[0].url;
            console.log('[TAKOH Twitter] Syndication MP4 found:', chosen);
            return chosen;
          }
        }
      }
    } catch (e) {
      console.warn('[TAKOH Twitter] Syndication API failed:', e);
    }

    return null;
  }

  // Extract real MP4 video URL directly from Twitter React Fiber
  function extractTwitterFiberVideoUrl(videoEl, container, mediaIndex = 0) {
    let curr = videoEl || container;
    let depth = 0;

    while (curr && depth < 20) {
      const fiberKey = Object.keys(curr).find(k => k.startsWith('__reactFiber$'));
      if (fiberKey) {
        let node = curr[fiberKey];
        let nDepth = 0;
        while (node && nDepth < 35) {
          const mp = node.memoizedProps;
          if (mp) {
            let directMedia = mp.media || mp.video || mp.mediaData || (mp.playerData ? mp.playerData : null);

            if (!directMedia && mp.tweet) {
              const mediaList = mp.tweet.extended_entities?.media || mp.tweet.legacy?.extended_entities?.media || [];
              if (Array.isArray(mediaList) && mediaList.length > 0) {
                directMedia = mediaList[mediaIndex] || mediaList[0];
              }
            }

            if (directMedia) {
              const videoInfo = directMedia.video_info || directMedia;
              const variants = videoInfo.variants || (videoInfo.videoValue ? videoInfo.videoValue.variants : null);

              if (variants && Array.isArray(variants)) {
                const mp4s = variants
                  .filter(v => v && (v.url || v.src) && (v.content_type === 'video/mp4' || v.type === 'video/mp4') && !(v.url || v.src).includes('.m3u8'))
                  .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

                if (mp4s.length > 0) {
                  return mp4s[0].url || mp4s[0].src;
                }
              }
            }
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

  // Direct MP4 Stream Parser with multi-stage fallbacks
  async function findTwitterMp4DirectUrl(videoEl, container, meta) {
    function isValidMp4Url(url) {
      if (!url || typeof url !== 'string') return false;
      if (url.startsWith('blob:')) return false;
      if (url.includes('.m3u8') || url.includes('.ts')) return false;
      return url.includes('.mp4') && url.startsWith('http');
    }

    const videoIndex = meta?.videoIndex || 0;

    // Step 1: Twitter Syndication / VxTwitter API (with exact video index)
    let tweetId = meta?.tweetId;
    if (!tweetId && meta?.tweetUrl) {
      const m = meta.tweetUrl.match(/\/status\/(\d+)/);
      if (m) tweetId = m[1];
    }
    if (tweetId) {
      const remoteUrl = await fetchTwitterHighResVideoUrl(tweetId, videoIndex);
      if (remoteUrl && isValidMp4Url(remoteUrl)) {
        return remoteUrl;
      }
    }

    // Step 2: React Fiber parsing for highest bitrate MP4
    const fiberUrl = extractTwitterFiberVideoUrl(videoEl, container, videoIndex);
    if (fiberUrl && isValidMp4Url(fiberUrl)) {
      console.log('[TAKOH Twitter] Fiber MP4 URL found:', fiberUrl);
      return fiberUrl;
    }

    // Step 3: Check HTML5 video element source
    if (videoEl) {
      const s1 = videoEl.src || '';
      const s2 = videoEl.currentSrc || '';
      if (isValidMp4Url(s1)) return s1;
      if (isValidMp4Url(s2)) return s2;

      const sources = videoEl.querySelectorAll('source');
      for (const src of sources) {
        const srcUrl = src.getAttribute('src');
        if (isValidMp4Url(srcUrl)) return srcUrl;
      }
    }

    return null;
  }

  // Blob fetch video inside twitter session
  async function downloadTwitterVideoAsBlob(targetUrl, meta, toastId) {
    try {
      showToast(toastId, '다운로드 중 🚀', `${meta.username}님의 동영상을 다운로드하고 있습니다...`, 'info');

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size < 10240) {
        throw new Error('Downloaded file size too small or corrupted.');
      }

      const videoBlob = new Blob([blob], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(videoBlob);
      const fullMeta = { ...meta };
      
      triggerDownload(blobUrl, 'video', fullMeta, 'twitter');
      showToast(toastId, '다운로드 완료 🎉', `${meta.username}님의 동영상이 저장되었습니다.`, 'success');

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return true;
    } catch (err) {
      console.warn('[TAKOH Twitter Blob Fetch Failed]', err);
      return false;
    }
  }

  async function downloadTwitterVideo(videoEl, container, meta) {
    const toastId = Date.now().toString();
    const directMp4Url = await findTwitterMp4DirectUrl(videoEl, container, meta);

    if (directMp4Url) {
      const fullMeta = { ...meta };
      try {
        triggerDownload(directMp4Url, 'video', fullMeta, 'twitter');
        showToast(toastId, '다운로드 시작 🎉', `${meta.username}님의 동영상이 저장됩니다.`, 'success');
        return;
      } catch (e) {
        const blobSuccess = await downloadTwitterVideoAsBlob(directMp4Url, fullMeta, toastId);
        if (blobSuccess) return;
      }
    }

    // Helper server fallback if direct MP4 is not accessible
    if (meta.tweetUrl && meta.tweetUrl.includes('/status/')) {
      chrome.storage.local.get(['ytdlpApiUrl', 'videoQuality'], async (result) => {
        const apiEndpoint = result.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
        const quality = result.videoQuality || 'best';
        const itemIdx = (meta.videoIndex || 0) + 1;
        const helperUrl = `${apiEndpoint}?url=${encodeURIComponent(meta.tweetUrl)}&index=${itemIdx}&quality=${quality}&_t=${Date.now()}`;

        try {
          const isSuccess = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              action: 'download',
              url: helperUrl,
              filename: meta.filename,

              username: meta.username,
              postId: meta.postId,
              type: 'video',
              platform: 'twitter'
            }, (dlResponse) => {
              if (!chrome.runtime.lastError && dlResponse && dlResponse.success) {
                resolve(true);
              } else {
                resolve(false);
              }
            });
          });

          if (isSuccess) {
            showToast(toastId, '다운로드 시작 🎉', `${meta.username}님의 동영상이 저장됩니다.`, 'success');
          } else {
            showToast(toastId, '다운로드 안내 💡', '트위터 동영상을 1~2초간 재생 후 다시 클릭해 주세요.', 'warning');
          }
        } catch (err) {
          showToast(toastId, '다운로드 안내 💡', '트위터 동영상을 1~2초간 재생 후 다시 클릭해 주세요.', 'warning');
        }
      });
    } else {
      showToast(toastId, '다운로드 안내 💡', '동영상 상세 게시물로 이동하여 다운로드를 클릭해 주세요.', 'warning');
    }
  }

  // ========== Scanner: Attach overlay download buttons to Videos & Images ==========
  function scanForTwitterMedia() {
    // 1. Process Twitter Videos & GIFs
    if (config.enableVideos) {
      const videoContainers = document.querySelectorAll('div[data-testid="videoComponent"]');

      videoContainers.forEach(node => {
        const container = node.tagName === 'VIDEO' ? (node.closest('div[data-testid="videoComponent"]') || node.closest('div[data-testid="videoPlayer"]') || node.parentElement) : node;
        if (!container) return;

        if (container.dataset.takohButtonAttached || container.querySelector('.takoh-video-overlay-btn')) return;
        container.dataset.takohButtonAttached = 'true';

        const style = window.getComputedStyle(container);
        if (style.position === 'static') {
          container.style.position = 'relative';
        }

        const videoEl = node.tagName === 'VIDEO' ? node : container.querySelector('video');

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
          background: 'rgba(29, 155, 240, 0.9)',
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
          btn.style.background = '#1d9bf0';
          btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(29, 155, 240, 0.9)';
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
          const meta = getPostMetadata(container);
          await downloadTwitterVideo(videoEl, container, meta);
        }, true);

        container.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btn, container.querySelector('video') || container);
      });
    }

    // 2. Process Twitter Images
    if (config.enableImages) {
      const photoDivs = document.querySelectorAll('div[data-testid="tweetPhoto"]');

      photoDivs.forEach(photoDiv => {
        if (photoDiv.dataset.takohButtonAttached || photoDiv.querySelector('.takoh-image-overlay-btn')) return;

        const img = photoDiv.querySelector('img[src*="twimg.com/media"]');
        if (!img) return;

        photoDiv.dataset.takohButtonAttached = 'true';

        const style = window.getComputedStyle(photoDiv);
        if (style.position === 'static') {
          photoDiv.style.position = 'relative';
        }

        const btn = document.createElement('button');
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
          background: 'rgba(29, 155, 240, 0.9)',
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
          btn.style.background = '#1d9bf0';
          btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(29, 155, 240, 0.9)';
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

          const toastId = Date.now().toString();
          showToast(toastId, '이미지 추출 중 🖼️', '고화질 트위터 이미지를 다운로드하고 있습니다...', 'info');

          const rawSrc = img.src || img.getAttribute('src');
          const highQualityUrl = getHighQualityImageUrl(rawSrc);

          if (highQualityUrl) {
            const meta = getPostMetadata(photoDiv);
            meta.filename = `${meta.username}_${meta.postId}.jpg`;

            try {
              // Fetch image blob directly using twitter session to bypass 403 Forbidden
              const resp = await fetch(highQualityUrl, { credentials: 'include' });
              if (resp.ok) {
                const imgBlob = await resp.blob();
                const blobUrl = URL.createObjectURL(imgBlob);
                triggerDownload(blobUrl, 'image', meta, 'twitter');
                showToast(toastId, '다운로드 완료 🎉', `${meta.username}님의 이미지가 저장되었습니다.`, 'success');
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                return;
              }
            } catch (err) {}

            // Fallback trigger
            triggerDownload(highQualityUrl, 'image', meta, 'twitter');
          } else {
            showToast(toastId, '다운로드 실패 ⚠️', '이미지 주소를 찾을 수 없습니다.', 'warning');
          }
        }, true);

        photoDiv.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btn, img);
      });
    }
  }

  // Register X/Twitter platform processor
  window.TAKPlatform = {
    name: 'twitter',
    process: scanForTwitterMedia
  };
})();
