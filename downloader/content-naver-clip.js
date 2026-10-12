/* TAKOH Media Downloader PRO - Naver Universal Video Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  const REVIEW_MEDIA = '[data-testid="review-media"], [data-review-media], [class*="reviewPhoto" i], [class*="review_image" i], [class*="review-photo" i], [class*="reviewMedia" i], [class*="review-media" i], [class*="review_video" i]';
  function isReviewMedia(element) {
    if (element.closest(REVIEW_MEDIA)) return true;
    const src = element.currentSrc || element.src || '';
    return /\/(?:review|reviews|review-attachment)\//i.test(src);
  }
  function isContentVideo(video) {
    if (video.closest('header, nav, [role="navigation"], [class*="avatar" i], [data-testid="advertisement"], [data-ad], .ad-area, .ad_area')) return false;
    // Shopping pages also contain promotional product players.
    if (/(^|\.)(?:smartstore|shopping|brand)\.naver\.com$/.test(location.hostname)) return isReviewMedia(video);
    return true;
  }
  function scanReviewImages() {
    if (!config.enableImages) return;
    document.querySelectorAll('img').forEach(img => {
      if (!isReviewMedia(img) || !window.TAKCore.isContentImage(img, 'naver')) return;
      if (img.closest('button[aria-label*="프로필"], [class*="profile" i], [class*="nickname" i]')) return;
      if ((img.naturalWidth || img.width) < 100 || (img.naturalHeight || img.height) < 100) return;
      if (img.closest('.video-js, [data-media-type="video"]') || img.parentElement?.querySelector('video')) return;
      const container = img.parentElement;
      if (!container || container.querySelector('.takoh-naver-review-image-btn')) return;
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      const btn = window.TAKCore.createDownloadButton('image', () => {
        if (!window.TAKCore.isContentImage(img, 'naver') || !isReviewMedia(img)) return;
        const meta = getPostMetadata(container);
        delete meta.filename;
        triggerDownload(img.currentSrc || img.src, 'image', meta, 'naverclip');
      });
      btn.classList.add('takoh-naver-review-image-btn');
      window.TAKCore.getOrCreateButtonContainer(container).appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btn.parentElement, img);
    });
  }

  // Helper to extract clean pure main body content text without ads or hashtags
  function extractPureContentText(element) {
    if (!element) return '';
    try {
      const clone = element.cloneNode(true);

      // Remove ad elements, hashtag link elements, swiper tag chips, blind elements, and UI buttons
      const selectors = [
        '[class*="ad"]', '[class*="Ad"]', '[class*="sponsor"]',
        '[class*="blind"]', '[class*="spi_sns"]', '[class*="share"]',
        '[class*="swiper"]', '[class*="KUeq8u"]', '[class*="puj4Uf"]', '[class*="wmkTAI"]',
        'a[class*="ceqlAA"]', 'a[href*="tag"]', 'a[href*="search"]',
        'button', 'svg'
      ].join(', ');

      const unneeded = clone.querySelectorAll(selectors);
      unneeded.forEach(n => n.remove());

      let text = clone.textContent.trim().replace(/\s+/g, ' ');

      // Remove any remaining hashtags (#hashtag)
      text = text.replace(/#[^\s#]+/g, '').trim();

      // Remove ad prefix words
      text = text.replace(/^(?:광고|AD|Ad|스폰서|협찬)\s*/gi, '').trim();

      // Clean special characters and cap to 25 chars
      const clean = text.replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim();
      return clean.substring(0, 25).trim();
    } catch (e) {
      return '';
    }
  }

  // Helper to find the true outer slide/card container that actually includes title & metadata elements
  function findOuterSlideBox(targetBox) {
    if (!targetBox) return document;
    let curr = targetBox;
    while (curr && curr !== document.body) {
      const desc = curr.querySelector('[class*="DescriptionAreaView-module__desc"], [class*="DescriptionAreaView"], .UqSZYD, [class*="UqSZYD"], .SeiEgh, [class*="SeiEgh"]');
      if (desc) return curr;
      curr = curr.parentElement;
    }
    return targetBox.closest('li, [class*="flick-panel"], [class*="panel"], [class*="Panel"], [class*="swiper-slide"], [class*="clip_impression"], [class*="ContentViewer"], [class*="ClipContent"], section, article') || targetBox.parentElement || document;
  }

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(container) {
    let username = 'naver_clip';
    let postId = '';

    // Find the enclosing slide or card container with climbing guarantee
    const slideBox = findOuterSlideBox(container);

    // 1. Extract Username / Channel Name (e.g. .H2Iokc, .IjcAOn, channel_name, nickname)
    try {
      const channelEl = slideBox.querySelector('.H2Iokc, .IjcAOn, a.channel_name, span.channel_name, .channel_name_text, [class*="channel"], [class*="nickname"], [class*="author"]') ||
                        document.querySelector('.H2Iokc, .IjcAOn, a.channel_name, span.channel_name, .channel_name_text, [class*="channel_name"], [class*="nickname"]');
      if (channelEl && channelEl.textContent.trim()) {
        username = channelEl.textContent.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9가-힣_-]/g, '');
      }
    } catch (e) {}

    // 2. Extract Pure Content Title (1st Priority: Naver Shorts DescriptionAreaView & Clip UqSZYD)
    try {
      const mainEl = slideBox.querySelector('[class*="DescriptionAreaView-module__desc"], [class*="DescriptionAreaView"], .UqSZYD, [class*="UqSZYD"]');
      if (mainEl) {
        postId = extractPureContentText(mainEl);
      }
    } catch (e) {}

    // Fallback: .SeiEgh, .Glld3q
    if (!postId) {
      try {
        const contentEl = slideBox.querySelector('.SeiEgh, [class*="SeiEgh"], .Glld3q');
        if (contentEl) {
          postId = extractPureContentText(contentEl);
        }
      } catch (e) {}
    }

    // 3. Fallback: Parse pure content from slideBox
    if (!postId) {
      postId = extractPureContentText(slideBox);
    }

    if (!postId || postId.length < 2) {
      postId = `clip_${Date.now().toString().slice(-6)}`;
    }

    const safeUser = (username || 'naver_clip').replace(/[^a-zA-Z0-9가-힣_-]/g, '');
    const safeTitle = postId.replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim();
    const uniqueFilename = `${safeUser}_${safeTitle}.mp4`;

    return {
      username: safeUser,
      postId: safeTitle,
      title: safeTitle,
      filename: uniqueFilename
    };
  }

  // ========== Search Video URLs in Performance Resource Timing ==========
  // ========== Search Video URLs in Performance Resource Timing ==========
  function findVideoUrlFromResources() {
    try {
      const entries = performance.getEntriesByType('resource');
      const videoUrls = entries
        .map(e => e.name)
        .filter(url => (url.includes('.mp4') || url.includes('rmcnmv') || url.includes('vod')) &&
          !url.includes('.gif') && !url.includes('.jpg') && !url.includes('.png') && !url.includes('.webp') && !url.includes('.ts') && !url.includes('PlayCount.json'));
      if (videoUrls.length > 0) return videoUrls[videoUrls.length - 1];
    } catch (e) { /* ignore */ }
    return null;
  }

  // ========== Search script tags for inline JSON/preloaded video configurations ==========
  function findVideoUrlFromScripts() {
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (text && (text.includes('mp4') || text.includes('vod') || text.includes('rmcnmv'))) {
          const urls = text.match(/https?:\/\/[^\s"'`<>]+?\.(?:mp4)[^\s"'`<>]*?/gi);
          if (urls && urls.length > 0) {
            const cleanUrl = urls[urls.length - 1].replace(/\\/g, '');
            return cleanUrl;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // ========== Fetch RMC Player API for Direct MP4 ==========
  async function fetchNaverVideoUrlFromRMC(vid, inkey) {
    try {
      const apiUrl = `https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/${vid}?key=${inkey}`;
      const response = await fetch(apiUrl);
      if (!response.ok) return null;
      const data = await response.json();

      if (data.videos && Array.isArray(data.videos.list) && data.videos.list.length > 0) {
        const best = data.videos.list.reduce((a, b) => {
          const wA = (a.encodingOption && a.encodingOption.width) || 0;
          const wB = (b.encodingOption && b.encodingOption.width) || 0;
          return wB > wA ? b : a;
        });
        return best.source;
      }
    } catch (err) {
      console.error('[TAKOH Naver] RMC API fetch failed:', err);
    }
    return null;
  }

  // ========== Extract RMC Credentials via DOM / CreatorHub API / Performance ==========
  async function findRmcCredentials(container) {
    const scope = container || document;

    // 1. DOM data attributes scoped to container
    const rmcEl = scope.querySelector('[data-vid][data-inkey]') ||
                  scope.querySelector('[data-video-id][data-in-key]') ||
                  document.querySelector('[data-vid][data-inkey]') ||
                  document.querySelector('[data-video-id][data-in-key]');
    if (rmcEl) {
      const vid = rmcEl.getAttribute('data-vid') || rmcEl.getAttribute('data-video-id');
      const inkey = rmcEl.getAttribute('data-inkey') || rmcEl.getAttribute('data-in-key');
      if (vid && inkey) return { vid, inkey };
    }

    // 2. Extract mediaId from container HTML or page URL query parameters
    let targetMediaId = '';
    try {
      const html = scope.innerHTML || '';
      const mVid = html.match(/mediaId=([A-Z0-9]+)/i) ||
                   html.match(/seedMediaId=([A-Z0-9]+)/i) ||
                   html.match(/["'](?:vid|mediaId|content_id|seedMediaId)["']\s*:\s*["']([A-Z0-9]+)["']/i);
      if (mVid) {
        targetMediaId = mVid[1];
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        targetMediaId = urlParams.get('mediaId') || urlParams.get('seedMediaId') || '';
      }
    } catch (e) {}

    // 3. Directly query Naver CreatorHub API for targetMediaId if available
    if (targetMediaId) {
      try {
        const apiUrl = `https://creatorhub-api.naver.com/api/v5.0/clipviewer/card?userInteraction=true&seedType=SPECIFIC&serviceType=CLIP&seedMediaId=${targetMediaId}`;
        const resp = await fetch(apiUrl);
        if (resp.ok) {
          const data = await resp.json();
          const jsonStr = JSON.stringify(data);
          const playCountMatch = jsonStr.match(/PlayCount\.json\?[^"']*/);
          let vid = targetMediaId;
          let inkey = '';
          if (playCountMatch) {
            const cleanUrl = playCountMatch[0].replace(/\\/g, '');
            const urlObj = new URL('https://apis.naver.com' + cleanUrl);
            vid = urlObj.searchParams.get('vid') || vid;
            inkey = urlObj.searchParams.get('key') || '';
          }
          if (!inkey) {
            const keyMatch = jsonStr.match(/key=([a-zA-Z0-9=]{20,})/);
            if (keyMatch) inkey = keyMatch[1];
          }
          if (vid && inkey) {
            return { vid, inkey };
          }
        }
      } catch (e) {}
    }

    // 4. Collect all RMC timing entries in order
    const allRmcEntries = [];
    try {
      const entries = performance.getEntriesByType('resource');
      for (const e of entries) {
        if (e.name.includes('PlayCount.json') || e.name.includes('rmcnmv')) {
          try {
            const urlObj = new URL(e.name);
            const v = urlObj.searchParams.get('vid') || '';
            const k = urlObj.searchParams.get('key') || '';
            if (v && k && !allRmcEntries.some(r => r.vid === v)) {
              allRmcEntries.push({ vid: v, inkey: k });
            }
          } catch (err) {}
        }
      }
    } catch (e) {}

    if (targetMediaId) {
      const matched = allRmcEntries.find(r => r.vid === targetMediaId);
      if (matched) return matched;
    }

    // 5. Index-scoped matching relative to all video elements
    const videos = Array.from(document.querySelectorAll('video'));
    let videoIndex = -1;
    if (container) {
      const containerVideo = container.querySelector('video');
      if (containerVideo) {
        videoIndex = videos.indexOf(containerVideo);
      }
    }
    if (videoIndex < 0) {
      const activeVideo = findActiveVideoInViewport();
      if (activeVideo) videoIndex = videos.indexOf(activeVideo);
    }

    if (videoIndex >= 0 && videoIndex < allRmcEntries.length) {
      return allRmcEntries[videoIndex];
    }

    // 6. Fallback: Last captured RMC entry
    if (allRmcEntries.length > 0) {
      return allRmcEntries[allRmcEntries.length - 1];
    }

    return null;
  }

  // ========== Find Currently Active / Playing Video in Viewport ==========
  function findActiveVideoInViewport() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    // 1. Currently playing video
    const playing = videos.find(v => !v.paused && !v.ended && v.readyState > 1 && v.offsetWidth > 50);
    if (playing) return playing;

    // 2. Video element closest to center of viewport
    const viewportCenterY = window.innerHeight / 2;
    let closestVideo = null;
    let minDistance = Infinity;

    videos.forEach(v => {
      if (!isContentVideo(v)) return;
      const rect = v.getBoundingClientRect();
      if (rect.height > 0 && rect.width > 0) {
        const videoCenterY = rect.top + (rect.height / 2);
        const dist = Math.abs(videoCenterY - viewportCenterY);
        if (dist < minDistance) {
          minDistance = dist;
          closestVideo = v;
        }
      }
    });

    return closestVideo || videos[0];
  }

  // ========== Main Download Handler for a specific player/container ==========
  async function handleDownloadClickForContainer(container) {
    const toastId = Date.now().toString();

    // 1. Search video element inside clicked container first, or fallback to currently active viewport video
    let videoEl = container ? container.querySelector('video') : null;
    if (!videoEl) {
      videoEl = findActiveVideoInViewport();
    }

    let videoUrl = '';

    if (videoEl) {
      if (videoEl.src && !videoEl.src.startsWith('blob:')) {
        videoUrl = videoEl.src;
      } else if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) {
        videoUrl = videoEl.currentSrc;
      }

      if (!videoUrl) {
        const sourceEl = videoEl.querySelector('source[src]');
        if (sourceEl && sourceEl.src && !sourceEl.src.startsWith('blob:')) {
          videoUrl = sourceEl.src;
        }
      }
    }

    // 2. Container-Scoped MP4/Stream extraction (Prevents video #1 duplication for feed items #2, #3, etc.)
    if (!videoUrl && container) {
      try {
        const containerHtml = container.innerHTML || '';
        const containerMp4s = containerHtml.match(/https?:\/\/[^\s"'`<>]+?\.(?:mp4)[^\s"'`<>]*?/gi);
        if (containerMp4s && containerMp4s.length > 0) {
          videoUrl = containerMp4s[containerMp4s.length - 1].replace(/\\/g, '');
        }
      } catch (e) {}
    }

    // 3. RMC Credentials scoped to container
    if (!videoUrl) {
      const creds = await findRmcCredentials(container);
      if (creds) {
        showToast(toastId, '다운로드 분석 중', '네이버 서버에서 원본 스트림 주소를 획득하고 있습니다...', 'info');
        videoUrl = await fetchNaverVideoUrlFromRMC(creds.vid, creds.inkey);
      }
    }

    // 4. Background captured webRequest URLs (filter latest captured media)
    if (!videoUrl) {
      try {
        const captured = await new Promise(resolve => {
          chrome.runtime.sendMessage({ action: 'getMediaUrls' }, (resp) => {
            if (chrome.runtime.lastError) resolve([]);
            else resolve(resp && resp.urls ? resp.urls : []);
          });
        });
        const naverStreams = captured.filter(u => u.url && (u.url.includes('rmcnmv') || u.url.includes('naver-rmc') || u.url.includes('vod.naver') || u.url.includes('.mp4')));
        if (naverStreams.length > 0) {
          videoUrl = naverStreams[naverStreams.length - 1].url;
        }
      } catch (e) {}
    }

    // 5. Performance Resource Timing
    if (!videoUrl) {
      videoUrl = findVideoUrlFromResources();
    }

    // 6. Meta og:video
    if (!videoUrl) {
      const ogVideo = document.querySelector('meta[property="og:video"], meta[property="og:video:url"]');
      if (ogVideo && ogVideo.content && ogVideo.content.includes('.mp4')) {
        videoUrl = ogVideo.content;
      }
    }

    if (videoUrl && !videoUrl.includes('.m3u8')) {
      const meta = getPostMetadata(container);
      triggerDownload(videoUrl, 'video', meta, 'naverclip');
    } else {
      showToast(toastId, '다운로드 안내', '동영상을 1~2초간 재생해 주신 후 다시 버튼을 눌러주세요.', 'info');
    }
  }

  // Helper to find main player targetBox (Shorts vs Clip)
  function findTargetPlayerBox(v) {
    if (!v) return null;

    // 1. For m.naver.com/shorts, climb up to find ancestor containing ControlAreaView/touch_wrap above full transparent layer
    if (window.location.hostname.includes('m.naver.com') || window.location.pathname.includes('/shorts')) {
      let curr = v;
      while (curr && curr !== document.body) {
        if (curr.querySelector('[class*="ControlAreaView"]') || curr.querySelector('[class*="touch_wrap"]')) {
          return curr;
        }
        curr = curr.parentElement;
      }
    }

    // 2. Lock & Preserve clip.naver.com targetBox logic completely intact
    return v.closest('[class*="webplayer-internal-core-shadow"]') ||
           v.closest('[class*="ContentViewer-module__video"]') ||
           v.closest('.player_area') ||
           v.closest('.rmc_player') ||
           v.parentElement;
  }

  // ========== Scanner: Attach overlay download buttons directly to video frames ==========
  function scanForVideos() {
    if (!config.enableVideos) return;

    // Target ONLY true video elements or primary webplayer containers
    const videos = document.querySelectorAll('video');

    videos.forEach(v => {
      // Find the main player wrapper
      if (!isContentVideo(v)) return;
      const targetBox = findTargetPlayerBox(v);

      if (!targetBox) return;

      // Prevent duplicate buttons on same container or any parent container
      if (targetBox.dataset.takohButtonAttached || targetBox.querySelector('.takoh-video-overlay-btn')) return;

      // Mark as processed
      targetBox.dataset.takohButtonAttached = 'true';

      // Ensure targetBox has relative or absolute position
      const style = window.getComputedStyle(targetBox);
      if (style.position === 'static') {
        targetBox.style.position = 'relative';
      }

      // Create video player overlay button
      const btn = document.createElement('button');
      btn.type = 'button';
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

      // Hover effects
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#10b981';
        btn.style.color = '#000000';
        btn.style.transform = 'scale(1.05)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(0, 0, 0, 0.8)';
        btn.style.color = '#ffffff';
        btn.style.transform = 'scale(1)';
      });

      // Suppress event propagation to parent player listeners without blocking button click
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
        await handleDownloadClickForContainer(targetBox);
      }, true);

      targetBox.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btn, v);
    });
  }

  // Register Naver platform processor
  window.TAKPlatform = {
    name: 'naverclip',
    process: () => { scanForVideos(); scanReviewImages(); }
  };
})();
