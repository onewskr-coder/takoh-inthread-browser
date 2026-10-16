/* TAKOH Media Downloader PRO - Coupang Module */
/* Handles Coupang review videos (Video.js HLS) and review images */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload, createDownloadButton, getOrCreateButtonContainer, findMediaContainer, getCapturedMediaUrls } = window.TAKCore;

  const PLATFORM_RULES = [
    'div.sdp-review__article__list__attachment__list',
    'div.sdp-review__article__list__attachment',
    'div.sdp-review__video-modal',
    'div.sdp-review__image-modal',
    'li.sdp-review__article__list__attachment__item',
    'div.vjs-poster',           // Video.js poster wrapper
    'div.video-js'              // Video.js player root
  ];

  // ========== Captured Video URLs via Source Interception ==========
  const capturedVideoUrls = [];

  // Intercept Video.js source assignments by monitoring <source> elements
  // and also monkey-patching the video element's src setter
  (function interceptVideoSources() {
    // 1. Monitor DOM for <source> elements being added
    const sourceObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          
          // Check if the node itself is a <source>
          if (node.tagName === 'SOURCE') {
            const src = node.getAttribute('src');
            if (src && !src.startsWith('blob:') && (src.includes('.mp4') || src.includes('.m3u8'))) {
              capturedVideoUrls.push(src);
              console.log('[TAKOH Coupang] Captured <source> URL:', src);
            }
          }
          
          // Check child <source> elements
          if (node.querySelectorAll) {
            node.querySelectorAll('source').forEach(source => {
              const src = source.getAttribute('src');
              if (src && !src.startsWith('blob:') && (src.includes('.mp4') || src.includes('.m3u8'))) {
                capturedVideoUrls.push(src);
                console.log('[TAKOH Coupang] Captured nested <source> URL:', src);
              }
            });
          }
        });
      });
    });
    
    if (document.body) {
      sourceObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        sourceObserver.observe(document.body, { childList: true, subtree: true });
      });
    }

    // 2. Intercept XHR to capture video playback URLs from Coupang's API
    try {
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url) {
        this._takUrl = url;
        return originalXHROpen.apply(this, arguments);
      };
      
      XMLHttpRequest.prototype.send = function() {
        const self = this;
        this.addEventListener('load', function() {
          try {
            if (self._takUrl && (self._takUrl.includes('video') || self._takUrl.includes('review') || self._takUrl.includes('gallery') || self._takUrl.includes('attachment') || self._takUrl.includes('sdp'))) {
              const text = self.responseText || '';
              // Search for mp4 or m3u8 or poster URLs in the response
              const urlMatches = text.match(/https?:\/\/[^\s"'<>\\]+/gi);
              if (urlMatches) {
                urlMatches.forEach(url => {
                  const decoded = url.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                  const convertedMp4 = convertCoupangPosterToMp4(decoded);
                  if (convertedMp4) {
                    if (!capturedVideoUrls.includes(convertedMp4)) {
                      capturedVideoUrls.push(convertedMp4);
                      console.log('[TAKOH Coupang] Captured XHR video URL via poster:', convertedMp4);
                    }
                  } else if (decoded.includes('.mp4') || decoded.includes('.m3u8')) {
                    if (!capturedVideoUrls.includes(decoded)) {
                      capturedVideoUrls.push(decoded);
                      console.log('[TAKOH Coupang] Captured XHR video URL:', decoded);
                    }
                  }
                });
              }
            }
          } catch (e) { /* ignore */ }
        });
        return originalXHRSend.apply(this, arguments);
      };
    } catch (e) {
      console.log('[TAKOH Coupang] XHR interception setup failed:', e);
    }

    // 3. Intercept window.fetch to capture modern Next.js/React review gallery API responses
    try {
      if (window.fetch && !window._takFetchIntercepted) {
        window._takFetchIntercepted = true;
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const response = await originalFetch.apply(this, args);
          try {
            const clone = response.clone();
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (url && (url.includes('review') || url.includes('gallery') || url.includes('attachment') || url.includes('product') || url.includes('sdp'))) {
              clone.text().then(text => {
                const urlMatches = text.match(/https?:\/\/[^\s"'<>\\]+/gi);
                if (urlMatches) {
                  urlMatches.forEach(rawUrl => {
                    const decoded = rawUrl.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                    const convertedMp4 = convertCoupangPosterToMp4(decoded);
                    if (convertedMp4) {
                      if (!capturedVideoUrls.includes(convertedMp4)) {
                        capturedVideoUrls.push(convertedMp4);
                        console.log('[TAKOH Coupang] Captured fetch video URL via poster:', convertedMp4);
                      }
                    } else if (decoded.includes('.mp4') || decoded.includes('.m3u8')) {
                      if (!capturedVideoUrls.includes(decoded)) {
                        capturedVideoUrls.push(decoded);
                        console.log('[TAKOH Coupang] Captured fetch video URL:', decoded);
                      }
                    }
                  });
                }
              }).catch(() => {});
            }
          } catch (e) { /* ignore */ }
          return response;
        };
      }
    } catch (e) {
      console.log('[TAKOH Coupang] Fetch interception setup failed:', e);
    }
  })();

  // ========== Post/Product Metadata Extraction ==========
  function getProductMetadata(element) {
    let username = 'coupang';
    let postId = 'review';

    const url = window.location.href;
    const match = url.match(/\/products\/([0-9]+)/);
    if (match) {
      postId = `product_${match[1]}`;
    }

    const reviewItem = element ? (element.closest('article.sdp-review__article__list') || element.closest('.sdp-review__article__list__attachment__list')) : null;
    if (reviewItem) {
      const nameEl = reviewItem.querySelector('.sdp-review__article__list__info__user__name');
      if (nameEl) {
        username = nameEl.textContent.trim().replace(/\s+/g, '_');
      }
    }

    return { username, postId };
  }

  // ========== Coupang Review Video Poster to MP4 Converter ==========
  function convertCoupangPosterToMp4(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;

    // 1. video.coupangcdn.com cloud PRODUCTREVIEW videos
    if (urlStr.includes('video.coupangcdn.com')) {
      if (urlStr.includes('/transcode/')) {
        const transcodeFolder = urlStr.split('/transcode/')[0] + '/transcode/';
        return transcodeFolder + 'playlist.m3u8';
      }
      return urlStr;
    }

    // 2. Strip thumbnail proxy wrapper: e.g. //thumbnail*.coupangcdn.com/thumbnails/remote/.../
    let cleanUrl = urlStr;
    if (cleanUrl.startsWith('//')) {
      cleanUrl = 'https:' + cleanUrl;
    }
    cleanUrl = cleanUrl.replace(/https?:\/\/thumbnail([0-9]*)\.coupangcdn\.com\/thumbnails\/remote\/[^\/]+\//i, 'https://image$1.coupangcdn.com/');
    cleanUrl = cleanUrl.replace(/\/thumbnails\/remote\/[^\/]+\//i, '/');

    // 3. Extract /review-attachment/videos/ ID
    const match = cleanUrl.match(/(https?:\/\/[^\s"'<>]+\/review-attachment\/videos\/)(?:hls|thumbnails|poster|preview|images)\/([a-zA-Z0-9_-]+)/i) ||
                  cleanUrl.match(/(https?:\/\/[^\s"'<>]+\/review-attachment\/videos\/)([a-zA-Z0-9_-]+)/i);
    if (match) {
      let prefix = match[1];
      const videoId = match[2];
      if (videoId && videoId !== 'original' && videoId !== 'hls' && videoId !== 'thumbnails') {
        return `${prefix}original/${videoId}.mp4`;
      }
    }
    return null;
  }

  // ========== Multi-strategy Video URL Finder ==========
  async function findVideoUrl(videoEl) {
    if (!videoEl) return null;
    
    // Strategy 0: Convert image poster/thumbnail URL to original MP4
    const imgChild = videoEl.querySelector ? videoEl.querySelector('img') : null;
    const posterSrc = videoEl.poster || (videoEl.getAttribute ? (videoEl.getAttribute('poster') || (imgChild ? imgChild.src : '')) : '');
    const convertedFromPoster = convertCoupangPosterToMp4(posterSrc);
    if (convertedFromPoster) return convertedFromPoster;

    // Strategy 1: Direct video element src (non-blob)
    if (videoEl.src && !videoEl.src.startsWith('blob:')) return videoEl.src;
    if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) return videoEl.currentSrc;

    // Strategy 2: <source> children of the video element
    const sourceEls = videoEl.querySelectorAll ? videoEl.querySelectorAll('source') : [];
    for (const src of sourceEls) {
      const url = src.getAttribute('src');
      if (url && !url.startsWith('blob:')) return url;
    }

    // Strategy 3: Data attributes on video and ancestor elements
    const dataAttrs = ['data-video-url', 'data-src', 'data-file-url', 'data-video-src', 'data-original-url', 'data-setup'];
    let el = videoEl;
    for (let i = 0; i < 12 && el && el !== document.body; i++) {
      for (const attr of dataAttrs) {
        if (el.getAttribute) {
          const val = el.getAttribute(attr);
          if (val) {
            const convertedData = convertCoupangPosterToMp4(val);
            if (convertedData) return convertedData;

            if (attr === 'data-setup') {
              try {
                const setup = JSON.parse(val);
                if (setup.sources && setup.sources.length > 0) {
                  return setup.sources[0].src;
                }
              } catch (e) { /* not JSON */ }
            } else if (val.includes('.mp4') || val.includes('.m3u8') || val.includes('video')) {
              return val;
            }
          }
        }
      }
      el = el.parentElement;
    }

    // Strategy 4: Captured URLs from XHR/Source interception
    if (capturedVideoUrls.length > 0) {
      return capturedVideoUrls[capturedVideoUrls.length - 1];
    }

    // Strategy 5: Performance Resource Timing API
    try {
      const entries = performance.getEntriesByType('resource');
      const names = entries.map(e => e.name);
      
      const mp4Url = names.filter(url => url.includes('.mp4') && 
        (url.includes('coupang') || url.includes('cdn'))).pop();
      if (mp4Url) return mp4Url;
      
      const m3u8Url = names.filter(url => url.includes('.m3u8') &&
        (url.includes('coupang') || url.includes('cdn'))).pop();
      if (m3u8Url) return m3u8Url;

      const tsUrl = names.filter(url => url.includes('.ts') &&
        (url.includes('coupang') || url.includes('cdn'))).pop();
      if (tsUrl) {
        const patterns = [
          /\/videos\/hls\/([a-zA-Z0-9_-]+)\//,
          /\/hls\/([a-zA-Z0-9_-]+)\//,
          /\/video\/([a-zA-Z0-9_-]+)\//
        ];
        for (const pattern of patterns) {
          const m = tsUrl.match(pattern);
          if (m) {
            const baseUrl = tsUrl.substring(0, tsUrl.indexOf(m[0]));
            const candidates = [
              `${baseUrl}/videos/original/${m[1]}.mp4`,
              `${baseUrl}/videos/${m[1]}.mp4`,
              `${baseUrl}/video/${m[1]}.mp4`
            ];
            return candidates[0];
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Strategy 6: Captured network requests from background webRequest
    try {
      const captured = await getCapturedMediaUrls();
      const coupangUrls = captured
        .map(c => c.url)
        .filter(url => url.includes('coupangcdn.com') || url.includes('coupang'));
        
      if (coupangUrls.length > 0) {
        const mp4Url = coupangUrls.find(url => url.includes('.mp4'));
        if (mp4Url) return mp4Url;
        
        const hlsUrl = coupangUrls.find(url => url.includes('.m3u8') || url.includes('.ts'));
        if (hlsUrl) {
          const match = hlsUrl.match(/\/review-attachment\/videos\/hls\/([a-zA-Z0-9_-]+)/);
          if (match) {
            const videoId = match[1];
            const prefix = hlsUrl.split('/review-attachment/videos/hls/')[0];
            return `${prefix}/review-attachment/videos/original/${videoId}.mp4`;
          }
        }
        
        return coupangUrls[coupangUrls.length - 1];
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  function isMediaVideo(url, el) {
    if (url && typeof url === 'string') {
      const lower = url.toLowerCase();
      if (lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('video.coupangcdn.com') || lower.includes('/review-attachment/videos/') || lower.includes('/videos/hls/') || lower.includes('/videos/original/')) {
        return true;
      }
    }
    if (el) {
      const videoParent = el.closest('.sdp-review__article__list__attachment__item--video') ||
                          el.closest('div.vjs-poster') ||
                          el.closest('div.video-js') ||
                          el.closest('div.sdp-review__video-modal') ||
                          el.closest('video') ||
                          (el.parentElement && (
                            el.parentElement.querySelector('.sdp-review__article__list__attachment__play-icon') ||
                            el.parentElement.querySelector('.review-gallery-popup-video-element-play-btn') ||
                            el.parentElement.querySelector('.review-gallery-popup-video-element-duration') ||
                            el.parentElement.querySelector('video')
                          ));
      if (videoParent) return true;
    }
    return false;
  }

  function isValidImage(img) {
    if (!window.TAKCore.isContentImage(img, 'coupang')) return false;
    if (!config.enableImages) return false;

    // Ignore site UI icons, close buttons, header buttons
    if (img.closest('button, .review-popup-close-btn, [class*="close"], [class*="btn"], header')) {
      return false;
    }

    const classes = (img.className || '').toLowerCase();
    
    const isReviewAttachment = classes.includes('sdp-review__article__list__attachment__img') || 
                               classes.includes('sdp-review__image-modal__attachment__img') ||
                               classes.includes('review-gallery-popup-image') ||
                               img.closest('.sdp-review__article__list__attachment') !== null ||
                               img.closest('.review-gallery-popup-container') !== null ||
                               img.closest('.review-gallery-thumbnail-item-container') !== null ||
                               img.closest('#product-modal') !== null;

    if (!isReviewAttachment) return false;

    // Reject if this image belongs to a video container or poster
    if (isMediaVideo(img.src, img)) return false;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (width > 0 && width < 50) return false;
    if (height > 0 && height < 50) return false;

    return true;
  }

  function getOriginalImageUrl(thumbUrl) {
    if (!thumbUrl || typeof thumbUrl !== 'string') return '';
    let cleanUrl = thumbUrl;
    if (cleanUrl.startsWith('//')) {
      cleanUrl = 'https:' + cleanUrl;
    }

    // Strip Coupang CDN thumbnail wrapper (/thumbnails/remote/{size_or_q}/)
    // and route to original high-res image domain image*.coupangcdn.com
    cleanUrl = cleanUrl.replace(/https?:\/\/thumbnail([0-9]*)\.coupangcdn\.com\/thumbnails\/remote\/[^\/]+\//i, 'https://image$1.coupangcdn.com/');
    cleanUrl = cleanUrl.replace(/\/thumbnails\/remote\/[^\/]+\//i, '/');

    return cleanUrl;
  }

  function processVideoPlayers() {
    if (!config.enableVideos) return;

    document.querySelectorAll('video').forEach(videoEl => {
      // Product advertisements and unrelated players are not review attachments.
      if (!videoEl.closest('.sdp-review__article__list__attachment, .sdp-review__article__list__attachment__list, .sdp-review__video-modal, .review-gallery-popup-container, .review-gallery-popup-detail-container, .review-gallery-thumbnail-item-container')) return;
      const playerContainer = findMediaContainer(videoEl, PLATFORM_RULES);
      if (!playerContainer) return;

      if (playerContainer.hasAttribute('data-tak-processed')) return;

      const btnContainer = getOrCreateButtonContainer(playerContainer);
      if (btnContainer.querySelector('.threads-download-btn[data-media-type="video"]')) return;

      const isModalDetail = playerContainer.classList.contains('sdp-review__video-modal') || 
                            playerContainer.closest('.sdp-review__video-modal') ||
                            playerContainer.classList.contains('review-gallery-popup-detail-container') ||
                            playerContainer.closest('.review-gallery-popup-detail-container') ||
                            playerContainer.querySelector('.review-popup-close-btn') !== null ||
                            playerContainer.querySelector('.review-gallery-popup-detail-container-close-btn') !== null;

      if (isModalDetail) {
        btnContainer.style.cssText = `
          position: absolute !important;
          top: 20px !important;
          left: 20px !important;
          right: auto !important;
          bottom: auto !important;
          z-index: 2147483647 !important;
        `;
      }

      playerContainer.setAttribute('data-tak-processed', 'true');
      playerContainer.classList.add('threads-download-container');

      console.log("[TAKOH Coupang] Injecting video download button.");

      const btn = createDownloadButton('video', async () => {
        const videoUrl = await findVideoUrl(videoEl);

        if (videoUrl) {
          const meta = getProductMetadata(playerContainer);
          triggerDownload(videoUrl, 'video', meta, 'coupang');
        } else {
          showToast(Date.now().toString(), '다운로드 불가', '동영상 URL을 찾을 수 없습니다. 동영상을 한번 재생한 뒤 다시 시도해 주세요.', 'error');
        }
      });

      btnContainer.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btnContainer, videoEl);
    });
  }

  function processImages() {
    if (!config.enableImages) return;

    document.querySelectorAll('img').forEach(img => {
      if (img.hasAttribute('data-tak-processed')) return;

      const check = () => {
        if (img.hasAttribute('data-tak-processed')) return;
        if (!isValidImage(img)) return;

        let container = findMediaContainer(img, PLATFORM_RULES);
        if (!container) return;

        img.setAttribute('data-tak-processed', 'true');
        const btnContainer = getOrCreateButtonContainer(container);

        if (btnContainer.querySelector('.threads-download-btn[data-media-type="image"]')) return;

        // If inside enlarged image modal or detail view with close button, position button container at top-left to avoid overlapping close 'X' button
        const isModalDetail = container.classList.contains('sdp-review__image-modal') || 
                              container.closest('.sdp-review__image-modal') ||
                              container.classList.contains('review-gallery-popup-detail-container') ||
                              container.closest('.review-gallery-popup-detail-container') ||
                              container.querySelector('.review-popup-close-btn') !== null ||
                              container.querySelector('.review-gallery-popup-detail-container-close-btn') !== null;

        if (isModalDetail) {
          btnContainer.style.cssText = `
            position: absolute !important;
            top: 20px !important;
            left: 20px !important;
            right: auto !important;
            bottom: auto !important;
            z-index: 2147483647 !important;
          `;
        }

        container.classList.add('threads-download-container');

        const btn = createDownloadButton('image', () => {
          if (img.src) {
            const originalUrl = getOriginalImageUrl(img.src);
            const meta = getProductMetadata(img);
            triggerDownload(originalUrl, 'image', meta, 'coupang');
          }
        });

        btnContainer.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btnContainer, img);
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

  function injectNativeGalleryDownloadButton() {
    const galleryHeader = document.querySelector('.review-gallery-popup-container header');
    if (!galleryHeader || galleryHeader.querySelector('#takoh-native-gallery-download-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'takoh-native-gallery-download-btn';
    btn.style.cssText = `
      margin-left: auto !important;
      margin-right: 15px !important;
      background: linear-gradient(135deg, #0073e6, #0052a5) !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 20px !important;
      padding: 8px 16px !important;
      font-size: 13px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      box-shadow: 0 4px 12px rgba(0,115,230,0.3) !important;
      z-index: 99 !important;
    `;
    btn.innerHTML = `<span>갤러리 미디어 선택 저장</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCoupangSelectiveModal();
    });

    const closeBtn = galleryHeader.querySelector('.review-popup-close-btn');
    if (closeBtn) {
      galleryHeader.insertBefore(btn, closeBtn);
    } else {
      galleryHeader.appendChild(btn);
    }
  }

  function injectVideoSectionNotice(galleryContainer) {
    if (galleryContainer.querySelector('#takoh-gallery-video-section-notice')) return;
    const headings = Array.from(galleryContainer.querySelectorAll('div, h2, h3, h4, span, p'));
    const videoHeading = headings.find(el => {
      const txt = (el.textContent || '').trim();
      return (txt.startsWith('동영상') || txt.includes('동영상 ')) && el.children.length === 0 && el.offsetParent !== null;
    });
    if (videoHeading) {
      const noticeBox = document.createElement('div');
      noticeBox.id = 'takoh-gallery-video-section-notice';
      noticeBox.style.cssText = `
        margin: 10px 0 16px 0 !important;
        padding: 10px 16px !important;
        background: rgba(247, 37, 133, 0.08) !important;
        border-left: 4px solid #f72585 !important;
        border-radius: 8px !important;
        color: #f72585 !important;
        font-size: 13px !important;
        font-weight: bold !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05) !important;
      `;
      noticeBox.innerHTML = `<span>동영상은 썸네일을 클릭하여 재생한 뒤, 영상 화면 위 다운로드 버튼을 통해 고화질 저장하실 수 있습니다.</span>`;
      videoHeading.after(noticeBox);
    }
  }

  // ========== Coupang Native Gallery Direct Download Integration ==========

  // Inject download buttons & selection checkboxes directly onto each item inside Coupang's Native Gallery Popup
  function attachDownloadOverlayToNativeGallery() {
    const galleryContainer = document.querySelector('.review-gallery-popup-container, #product-modal');
    if (!galleryContainer) return;

    injectVideoSectionNotice(galleryContainer);

    // 1. Inject Header Controls (Select All / Deselect All / ZIP Download)
    const galleryHeader = galleryContainer.querySelector('header');
    if (galleryHeader && !galleryHeader.querySelector('#takoh-native-gallery-header-download')) {
      const headerBtnContainer = document.createElement('div');
      headerBtnContainer.id = 'takoh-native-gallery-header-download';
      headerBtnContainer.style.cssText = `
        margin-left: auto !important;
        margin-right: 15px !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        z-index: 9999 !important;
      `;

      const selectAllBtn = document.createElement('button');
      selectAllBtn.style.cssText = `
        background: #3a3a48 !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 14px !important;
        padding: 6px 12px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        cursor: pointer !important;
      `;
      selectAllBtn.textContent = '전체 선택';
      selectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        galleryContainer.querySelectorAll('.takoh-gallery-item-chk').forEach(chk => {
          chk.checked = true;
          chk.dispatchEvent(new Event('change'));
        });
      });

      const deselectAllBtn = document.createElement('button');
      deselectAllBtn.style.cssText = `
        background: #2a2a35 !important;
        color: #aaaaaa !important;
        border: none !important;
        border-radius: 14px !important;
        padding: 6px 12px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        cursor: pointer !important;
      `;
      deselectAllBtn.textContent = '전체 해제';
      deselectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        galleryContainer.querySelectorAll('.takoh-gallery-item-chk').forEach(chk => {
          chk.checked = false;
          chk.dispatchEvent(new Event('change'));
        });
      });

      const downloadZipBtn = document.createElement('button');
      downloadZipBtn.id = 'takoh-native-gallery-zip-btn';
      downloadZipBtn.style.cssText = `
        background: linear-gradient(135deg, #0073e6, #0052a5) !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 20px !important;
        padding: 7px 16px !important;
        font-size: 13px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        box-shadow: 0 4px 14px rgba(0, 115, 230, 0.4) !important;
        transition: transform 0.2s ease !important;
      `;
      downloadZipBtn.innerHTML = `<span>선택한 미디어 ZIP 저장</span>`;

      downloadZipBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const mediaUrls = [];
        const mediaSet = new Set();
        let hasHlsVideo = false;

        const checkedBoxes = galleryContainer.querySelectorAll('.takoh-gallery-item-chk:checked');
        for (const chk of checkedBoxes) {
          const item = chk.closest('.review-gallery-thumbnail-item-container, .review-gallery-popup-element, li');
          if (!item) continue;

          const img = item.querySelector('img');
          if (!img || !img.src) continue;

          const isVideoItem = item.querySelector('.review-gallery-popup-video-element-duration') !== null ||
                              item.querySelector('.review-gallery-popup-video-element-play-btn') !== null ||
                              img.src.includes('video.coupangcdn.com') ||
                              isMediaVideo(img.src, item);

          let finalUrl = null;
          if (isVideoItem) {
            finalUrl = convertCoupangPosterToMp4(img.src) || await findVideoUrl(item);
            if (!finalUrl || finalUrl.includes('.m3u8') || finalUrl.includes('.xml')) {
              hasHlsVideo = true;
            }
          } else {
            finalUrl = getOriginalImageUrl(img.src);
          }

          if (finalUrl && !mediaSet.has(finalUrl)) {
            mediaSet.add(finalUrl);
            mediaUrls.push(finalUrl);
          }
        }

        if (mediaUrls.length === 0) {
          showToast('cp-empty-zip', '선택 항목 없음', '다운로드할 미디어를 최소 1개 이상 선택해 주세요.', 'error');
          return;
        }

        if (hasHlsVideo) {
          showToast('cp-video-notice', '동영상 수집 안내', '동영상은 재생 버튼을 눌러 재생한 후 플레이어의 다운로드 버튼으로 고화질 저장하실 수 있습니다.', 'info');
        }

        const prodMeta = getProductMetadata(galleryContainer);
        if (window.TAKCore && window.TAKCore.triggerZipDownload) {
          window.TAKCore.triggerZipDownload(mediaUrls, prodMeta, 'coupang');
        } else {
          showToast('cp-zip-start', '선택 저장 시작', `총 ${mediaUrls.length}개의 미디어를 다운로드합니다.`, 'success');
          mediaUrls.forEach((u, idx) => {
            setTimeout(() => {
              triggerDownload(u, u.includes('.mp4') ? 'video' : 'image', prodMeta, 'coupang');
            }, idx * 300);
          });
        }
      });

      headerBtnContainer.appendChild(selectAllBtn);
      headerBtnContainer.appendChild(deselectAllBtn);
      headerBtnContainer.appendChild(downloadZipBtn);

      const closeBtn = galleryHeader.querySelector('.review-popup-close-btn');
      if (closeBtn) {
        galleryHeader.insertBefore(headerBtnContainer, closeBtn);
      } else {
        galleryHeader.appendChild(headerBtnContainer);
      }
    }

    function updateZipButtonCount() {
      const zipBtn = galleryContainer.querySelector('#takoh-native-gallery-zip-btn span');
      if (zipBtn) {
        const count = galleryContainer.querySelectorAll('.takoh-gallery-item-chk:checked').length;
        zipBtn.textContent = `선택한 미디어 (${count}개) ZIP 저장`;
      }
    }

    // 2. Attach Selection Checkbox & Download Button on Each Gallery Thumbnail Item
    const items = galleryContainer.querySelectorAll('.review-gallery-thumbnail-item-container, .review-gallery-popup-element, li');
    items.forEach(item => {
      if (item.tagName === 'BUTTON' || 
          item.classList.contains('review-popup-close-btn') || 
          item.classList.contains('review-gallery-popup-detail-container-close-btn') || 
          item.closest('.review-popup-close-btn') ||
          item.closest('.review-gallery-popup-detail-container-close-btn')) {
        return;
      }

      if (item.hasAttribute('data-tak-gallery-processed')) return;
      const galleryImage = item.querySelector('img');
      if (!galleryImage && !item.querySelector('video')) return;
      if (galleryImage && !window.TAKCore.isContentImage(galleryImage, 'coupang')) return;
      item.setAttribute('data-tak-gallery-processed', 'true');

      item.style.position = 'relative';

      const img = item.querySelector('img');
      const imgSrc = img ? img.src : '';

      const isVideoItem = item.querySelector('.review-gallery-popup-video-element-duration') !== null ||
                          item.querySelector('.review-gallery-popup-video-element-play-btn') !== null ||
                          imgSrc.includes('video.coupangcdn.com') ||
                          isMediaVideo(imgSrc, item);

      // Checkbox for selection
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = true;
      chk.className = 'takoh-gallery-item-chk';
      chk.style.cssText = `
        position: absolute !important;
        top: 6px !important;
        left: 6px !important;
        z-index: 9999 !important;
        width: 20px !important;
        height: 20px !important;
        cursor: pointer !important;
        accent-color: ${isVideoItem ? '#f72585' : '#0073e6'} !important;
      `;
      chk.addEventListener('change', updateZipButtonCount);

      item.appendChild(chk);

      if (!isVideoItem) {
        // Item Download Button ONLY for Images
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'takoh-gallery-item-dl-btn';
        downloadBtn.style.cssText = `
          position: absolute !important;
          bottom: 6px !important;
          right: 6px !important;
          z-index: 9999 !important;
          background: rgba(0, 115, 230, 0.9) !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 50% !important;
          width: 32px !important;
          height: 32px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
          transition: transform 0.2s ease, background 0.2s ease !important;
        `;
        downloadBtn.title = '사진 저장';
        downloadBtn.innerHTML = `
          <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:#ffffff;">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        `;

        downloadBtn.addEventListener('mouseenter', () => {
          downloadBtn.style.transform = 'scale(1.15)';
        });
        downloadBtn.addEventListener('mouseleave', () => {
          downloadBtn.style.transform = 'scale(1)';
        });

        downloadBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();

          const mediaUrl = getOriginalImageUrl(imgSrc);
          if (mediaUrl) {
            const meta = getProductMetadata(item);
            triggerDownload(mediaUrl, 'image', meta, 'coupang');
          } else {
            showToast('cp-item-err', '다운로드 불가', '이미지 URL을 찾을 수 없습니다.', 'error');
          }
        });

        item.appendChild(downloadBtn);
        window.TAKCore.anchorMediaControls?.(downloadBtn, img);
      }
    });

    updateZipButtonCount();
  }

  function processPageMedia() {
    processVideoPlayers();
    processImages();
    attachDownloadOverlayToNativeGallery();
  }

  // Register Coupang platform processor
  window.TAKPlatform = {
    name: 'coupang',
    process: processPageMedia
  };
})();
