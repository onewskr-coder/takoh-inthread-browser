/* TAKOH Media Downloader PRO - Injected Core Script */

console.log("[TAKOH Downloader] Core Engine initialized on:", window.location.href);

(() => {
  // Extension reload injection must preserve the existing processor registry.
  if (window.TAKCore) return;
  let runtime=null;
  try { runtime=typeof chrome==='undefined'?null:chrome.runtime; } catch {}
  function listenRuntime(listener) {
    try { runtime?.onMessage?.addListener(listener); } catch {}
  }
  // Inject the main world bridge script for React Fiber parsing
  try {
    const script = document.createElement('script');
    if (!runtime?.id || typeof runtime.getURL !== 'function') throw new Error('Extension connection unavailable');
    script.src = runtime.getURL('content-meta-main.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    console.log('[TAKOH Core] Main world bridge injected.');
  } catch (e) {
    // A reloaded extension can leave an old page context disconnected.
  }

  // ========== Config ==========
  let config = { enableImages: true, enableVideos: true, isLicensed: true };
  let toastContainer = null;

  // Safe runtime message helper
  function safeSendMessage(message, callback) {
    try {
      if (!runtime?.id || typeof runtime.sendMessage !== 'function') { if(callback) callback(); return; }
      runtime.sendMessage(message, res => {
        try { const error=runtime.lastError; if(callback) callback(error?undefined:res); }
        catch { if(callback) callback(); }
      });
    } catch { if(callback) callback(); }
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['enableImages', 'enableVideos', 'isLicensed'], (result) => {
        try { if (runtime?.lastError) return; } catch { return; }
        config.enableImages = result.enableImages !== false;
        config.enableVideos = result.enableVideos !== false;
        config.isLicensed = result.isLicensed === true;
      });

      chrome.storage.onChanged.addListener((changes) => {
        if (changes.enableImages) config.enableImages = changes.enableImages.newValue;
        if (changes.enableVideos) config.enableVideos = changes.enableVideos.newValue;
        if (changes.isLicensed) config.isLicensed = changes.isLicensed.newValue;
      });
    }
  } catch (e) {}

  // ========== SVG Icons ==========
  const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
  const ICON_VIDEO = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>`;

  // ========== Toast System ==========
  function getToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'threads-download-toast-container'; // Keep original class for CSS compatibility
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(id, title, desc, type = 'info', downloadId = null) {
    const container = getToastContainer();

    // 중복 동일 안내 토스트가 화면에 무한히 쌓이지 않도록 기존 동일 내용 토스트가 있다면 제거
    Array.from(container.children).forEach(child => {
      const titleEl = child.querySelector('.threads-toast-title');
      const descEl = child.querySelector('.threads-toast-desc');
      if (titleEl && descEl && titleEl.textContent === title && descEl.textContent === desc && child.id !== `toast-${id}`) {
        child.classList.remove('show');
        setTimeout(() => { if (child.parentNode) child.parentNode.removeChild(child); }, 300);
      }
    });

    let toast = document.getElementById(`toast-${id}`);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = `toast-${id}`;
      toast.className = `threads-download-toast ${type}`;
      container.appendChild(toast);
      toast.offsetHeight; // force reflow
      toast.classList.add('show');
    } else {
      toast.className = `threads-download-toast ${type} show`;
    }
    let iconHtml = '';
    if (type === 'info') iconHtml = '<div class="threads-toast-spinner"></div>';
    else if (type === 'success') iconHtml = `<div class="threads-toast-icon-check"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg></div>`;
    else if (type === 'error') iconHtml = `<div class="threads-toast-icon-error"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg></div>`;
    
    // 취소 버튼 영역 구성 (진행 중 + downloadId가 명시된 경우)
    let actionHtml = '';
    if (type === 'info' && downloadId !== null) {
      actionHtml = `<button class="threads-toast-cancel-btn" style="margin-left: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #ef4444; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s;">취소</button>`;
    }

    // ✕ 닫기 버튼 추가
    const closeBtnHtml = `<button class="threads-toast-close-btn" style="background: transparent; border: none; color: rgba(255,255,255,0.5); font-size: 14px; font-weight: bold; cursor: pointer; padding: 2px 6px; margin-left: 6px; line-height: 1; transition: color 0.2s;" title="닫기">✕</button>`;

    toast.innerHTML = `${iconHtml}<div class="threads-toast-content" style="flex: 1;"><div class="threads-toast-title">${title}</div><div class="threads-toast-desc">${desc}</div></div>${actionHtml}${closeBtnHtml}`;
    
    // ✕ 버튼 클릭 시 토스트 즉시 닫기
    const closeBtn = toast.querySelector('.threads-toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast(id);
      });
      closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#ffffff');
      closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = 'rgba(255,255,255,0.5)');
    }

    if (type === 'info' && downloadId !== null) {
      const cancelBtn = toast.querySelector('.threads-toast-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          safeSendMessage({ action: 'cancelDownload', downloadId: downloadId }, () => {
            showToast(id, '다운로드 취소됨', '사용자에 의해 다운로드가 중단되었습니다.', 'error');
          });
        });
      }
    }

    // 모든 토스트 알림 4초 후 자동 소멸 (진행 중인 downloadId 없는 일반 안내 토스트 포함)
    if (downloadId === null || type === 'success' || type === 'error') {
      setTimeout(() => dismissToast(id), 4000);
    }
  }

  function dismissToast(id) {
    const toast = document.getElementById(`toast-${id}`);
    if (toast) {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 500);
    }
  }

  // ========== Download Trigger ==========
  const downloadToasts = {};
  const activeBlobUrls = {};
  const activeDownloads = new Set();
  const downloadUrls = {};
  
  async function triggerDownload(mediaUrl, type, meta, platform) {
    if (activeDownloads.has(mediaUrl)) {
      console.log('[TAKOH Core] Download already in progress for URL:', mediaUrl);
      const toastId = Date.now().toString();
      showToast(toastId, '다운로드 중', '이미 다운로드가 진행 중인 파일입니다.', 'info');
      return;
    }

    // Add to active downloads lock
    activeDownloads.add(mediaUrl);

    const ext = type === 'video' ? 'mp4' : (type === 'zip' ? 'zip' : 'jpg');
    const timestamp = Math.floor(Date.now() / 1000);
    let filename = '';

    if (meta.filename) {
      filename = meta.filename.endsWith(`.${ext}`) ? meta.filename : `${meta.filename}.${ext}`;
    } else if (meta.title || meta.videoTitle) {
      const explicitTitle = (meta.title || meta.videoTitle).replace(/[\\/:*?"<>|]/g, '').trim();
      filename = `${explicitTitle}.${ext}`;
    } else if (meta.username && meta.postId && meta.postId !== 'media' && meta.postId !== 'post') {
      const safeUser = meta.username.replace(/[^a-zA-Z0-9가-힣_.]/g, '');
      const safeId = meta.postId.replace(/[^a-zA-Z0-9가-힣_ -]/g, '');
      filename = `${safeUser}_${safeId}.${ext}`;
    } else {
      const safeUser = (meta.username || 'threads').replace(/[^a-zA-Z0-9가-힣_.]/g, '');
      const safeId = (meta.postId || 'post').replace(/[^a-zA-Z0-9가-힣_-]/g, '');
      filename = `takoh_${platform}_${safeUser}_${safeId}_${timestamp}.${ext}`;
    }

    const toastId = Date.now().toString();
    showToast(toastId, '다운로드 준비 중', '파일을 요청하고 있습니다...', 'info');

    let downloadUrl = mediaUrl;

    // HTTPS CDN URLs go straight to the extension download path, avoiding page CORS.
    // Only local blob URLs require reading within their owning page.
    if (mediaUrl.startsWith('blob:')) {
      try {
        showToast(toastId, '다운로드 중', '동영상을 다운로드 중입니다 (약 1~3초 소요)...', 'info');
        
        const response = await fetch(mediaUrl, {
          method: 'GET',
          credentials: 'include'
        });
        
        const contentType = response ? (response.headers.get('content-type') || '') : '';
        const isValidMediaResponse = response && response.ok && !contentType.includes('text/html') && !contentType.includes('application/json');

        if (isValidMediaResponse) {
          const rawBlob = await response.blob();
          if (rawBlob && rawBlob.size >= 1000) {
            const videoBlob = new Blob([rawBlob], { type: rawBlob.type || (type === 'video' ? 'video/mp4' : 'image/jpeg') });
            downloadUrl = URL.createObjectURL(videoBlob);
          } else {
            throw new Error('Empty media blob');
          }
        } else {
          throw new Error('Unreadable media blob');
        }
      } catch (err) {
        activeDownloads.delete(mediaUrl);
        showToast(toastId, '원본 주소 확인 필요', '재생용 blob 주소를 파일로 읽을 수 없습니다. 콘텐츠를 다시 열고 원본 영상 주소를 추출한 뒤 저장해야 합니다.', 'error');
        return;
      }
    }

    try {
      safeSendMessage({
        action: 'download', 
        url: downloadUrl, 
        filename, 
        username: meta ? meta.username : 'media', 
        postId: meta ? meta.postId : 'post', 
        type,
        platform
      }, (response) => {
        if (response && response.success) {
          // 폴더 항상 물어보기 설정 여부 조회
          try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['confirmDownload'], (res) => {
                const askFolder = res && res.confirmDownload === true;
                if (askFolder) {
                  showToast(toastId, '저장 위치 선택 중 📂', '열린 탐색기 창에서 저장할 폴더를 지정해 주세요.', 'info', response.downloadId);
                } else {
                  showToast(toastId, '다운로드 시작 🚀', '파일을 안전하게 디스크에 저장하고 있습니다...', 'info', response.downloadId);
                }
              });
            } else {
              showToast(toastId, '다운로드 시작 🚀', '파일을 안전하게 디스크에 저장하고 있습니다...', 'info', response.downloadId);
            }
          } catch(e) {}

          downloadToasts[response.downloadId] = toastId;
          downloadUrls[response.downloadId] = mediaUrl; // Store URL mapping for release lock
          if (downloadUrl.startsWith('blob:')) {
            activeBlobUrls[response.downloadId] = downloadUrl;
          }
        } else {
          const errMsg = response && response.error;
          if (errMsg === 'LICENSE_REQUIRED' || errMsg === 'DAILY_LIMIT_EXCEEDED') {
            showToast(toastId, '매일 무료 3회 다운로드 완료 🔑', '오늘 무료 3회 사용이 완료되었습니다. (매일 자정 3회 자동 리셋)<br><a href="https://litt.ly/tako/sale/3CXxeYb" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:8px; background:linear-gradient(135deg, #10b981, #059669); color:#ffffff; font-weight:bold; font-size:11px; padding:6px 12px; border-radius:6px; text-decoration:none; box-shadow:0 2px 6px rgba(16,185,129,0.4);">🛒 PRO 무제한 이용권 구매하기 (클릭)</a>', 'error');
          } else {
            showToast(toastId, '다운로드 오류 ❌', errMsg || '다운로드 요청이 거부되었습니다.', 'error');
          }
          activeDownloads.delete(mediaUrl); // Release lock
          if (downloadUrl.startsWith('blob:')) {
            URL.revokeObjectURL(downloadUrl);
          }
        }
      });
    } catch (err) {
      console.warn('[TAKOH Core triggerDownload Handled Exception]', err);
      activeDownloads.delete(mediaUrl);
    }
  }

  listenRuntime((message, sender, sendResponse) => {
    if (message.action === 'getPageMediaInfo') {
      const url = window.location.href;
      let title = document.title || '미디어 동영상';
      let thumbnail = '';
      let platform = 'unknown';

      // Platform detection
      if (url.includes('threads.net')) platform = 'threads';
      else if (url.includes('instagram.com')) platform = 'instagram';
      else if (url.includes('facebook.com')) platform = 'facebook';
      else if (url.includes('tiktok.com')) platform = 'tiktok';
      else if (url.includes('douyin.com')) platform = 'douyin';
      else if (url.includes('xiaohongshu.com') || url.includes('rednote.com')) platform = 'xiaohongshu';
      else if (url.includes('naver.com')) platform = 'naverclip';
      else if (url.includes('coupang.com')) platform = 'coupang';
      else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
      else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'twitter';
      else if (url.includes('pinterest.com') || url.includes('pinterest.co.kr')) platform = 'pinterest';
      else if (url.includes('reddit.com') || url.includes('redd.it')) platform = 'reddit';

      // 1) YouTube Specific Info Extraction
      if (platform === 'youtube') {
        if (url.includes('/shorts/')) {
          const postId = url.split('/shorts/')[1]?.split('?')[0] || '';
          if (postId) {
            thumbnail = `https://i.ytimg.com/vi/${postId}/hqdefault.jpg`;
          }
          // Try fetching active shorts title
          const activeReel = document.querySelector('ytd-reel-video-renderer[is-active]') || 
                             document.querySelector('yt-reel-video-renderer[is-active]') ||
                             document.querySelector('ytd-shorts-video-renderer[is-active]') ||
                             document.querySelector('ytd-reel-video-renderer');
          if (activeReel) {
            const titleEl = activeReel.querySelector('h2') || activeReel.querySelector('#video-title') || activeReel.querySelector('.title');
            if (titleEl && titleEl.textContent.trim()) {
              title = titleEl.textContent.trim();
            }
          }
        } else if (url.includes('/watch')) {
          const videoId = new URL(url).searchParams.get('v');
          if (videoId) {
            thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          }
          const titleEl = document.querySelector('ytd-watch-metadata h1 ytd-formatted-string') ||
                          document.querySelector('h1.ytd-watch-metadata') ||
                          document.querySelector('h1.title');
          if (titleEl && titleEl.textContent.trim()) {
            title = titleEl.textContent.trim();
          }
        }
      }

      // 2) Og Image fallback
      if (!thumbnail) {
        const ogImg = document.querySelector('meta[property="og:image"]') || document.querySelector('meta[name="twitter:image"]');
        if (ogImg && ogImg.content) {
          thumbnail = ogImg.content;
        }
      }

      // 3) Og Title fallback
      if (!title || title === document.title) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) {
          title = ogTitle.content;
        }
      }

      // Clean title string
      title = title.replace(/\s*-\s*YouTube/i, '')
                   .replace(/\s*\|\s*Instagram/i, '')
                   .replace(/\s*-\s*Threads/i, '')
                   .replace(/\s*:\s*YouTube/i, '')
                   .trim();

      sendResponse({
        url: url,
        title: title || '동영상 미디어',
        thumbnail: thumbnail,
        platform: platform
      });
      return true;
    }

    if (message.action === 'downloadStatus') {
      const toastId = downloadToasts[message.downloadId];
      if (!toastId) return;

      const mediaUrl = downloadUrls[message.downloadId];
      if (mediaUrl) {
        activeDownloads.delete(mediaUrl); // Release lock on completion/error
        delete downloadUrls[message.downloadId];
      }

      if (message.status === 'complete') {
        showToast(toastId, '다운로드 완료!', '성공적으로 저장되었습니다.', 'success');
        delete downloadToasts[message.downloadId];
        if (activeBlobUrls[message.downloadId]) {
          URL.revokeObjectURL(activeBlobUrls[message.downloadId]);
          delete activeBlobUrls[message.downloadId];
        }
      } else if (message.status === 'error') {
        showToast(toastId, '다운로드 실패', message.error || '알 수 없는 오류가 발생했습니다.', 'error');
        delete downloadToasts[message.downloadId];
        if (activeBlobUrls[message.downloadId]) {
          URL.revokeObjectURL(activeBlobUrls[message.downloadId]);
          delete activeBlobUrls[message.downloadId];
        }
      }
    }
  });

  // Global click throttle to prevent duplicate triggers across any button instances
  let globalLastClickTime = 0;
  const isThreadsPage = /(^|\.)threads\.(net|com)$/.test(window.location.hostname);
  const useActualDownloadTarget = true;

  // ========== Button Creation ==========
  function createDownloadButton(type, onClick) {
    const btn = document.createElement('button');
    if (useActualDownloadTarget) btn.type = 'button';
    btn.className = 'threads-download-btn';
    btn.setAttribute('data-media-type', type);
    
    let label = 'Download';
    let iconSvg = ICON_DOWNLOAD;
    let titleStr = '다운로드';
    
    if (type === 'video') {
      label = 'Video';
      iconSvg = ICON_VIDEO;
      titleStr = '동영상 다운로드';
    } else if (type === 'thumbnail') {
      label = 'Thumbnail';
      iconSvg = ICON_DOWNLOAD;
      titleStr = '썸네일 이미지 다운로드';
    } else if (type === 'image') {
      label = 'Image';
      iconSvg = ICON_DOWNLOAD;
      titleStr = '이미지 다운로드';
    }
    
    btn.title = titleStr;
    btn.innerHTML = `${iconSvg}<span>${label}</span>`;
    const handleButtonClick = (e) => {
      if (useActualDownloadTarget && e) {
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
        if (!path.includes(btn) && !btn.contains(e.target)) return;
      }
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      const now = Date.now();
      if (now - globalLastClickTime < 1000) { // 1초 이내 추가 클릭은 무조건 무시
        console.log('[TAKOH Core] Prevented duplicate click globally within 1000ms');
        return;
      }
      globalLastClickTime = now;
      onClick(e);
    };

    btn._takohClickHandler = handleButtonClick;

    // Attach click and mouse/touch interceptors directly to the button
    btn.addEventListener('click', handleButtonClick, true);

    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evtType => {
      btn.addEventListener(evtType, (e) => {
        if (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (evtType === 'pointerdown' || evtType === 'mousedown') {
            e.preventDefault();
          }
        }
      }, true);
    });

    return btn;
  }

  // Unified global capture-phase interceptor to catch clicks on download buttons even when covered by transparent overlays (e.g. Instagram play/pause)
  document.addEventListener('click', (e) => {
    // Navigation and overlapping image/video buttons must use the actual target.
    if (e.target?.closest?.('.takoh-collect-reference')) return;
    if (useActualDownloadTarget) return;
    const allBtns = document.querySelectorAll('.threads-download-btn, .takoh-video-overlay-btn, .takoh-image-overlay-btn');
    for (const btn of allBtns) {
      if (!document.body.contains(btn)) continue;
      if (btn.offsetWidth === 0 || btn.offsetHeight === 0) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (typeof btn._takohClickHandler === 'function') {
          btn._takohClickHandler(e);
        } else {
          btn.click();
        }
        return;
      }
    }
  }, true);

  ['pointerdown', 'mousedown'].forEach(evtType => {
    document.addEventListener(evtType, (e) => {
      if (e.target?.closest?.('.takoh-collect-reference')) return;
      if (useActualDownloadTarget) return;
      const allBtns = document.querySelectorAll('.threads-download-btn, .takoh-video-overlay-btn, .takoh-image-overlay-btn');
      for (const btn of allBtns) {
        if (!document.body.contains(btn)) continue;
        if (btn.offsetWidth === 0 || btn.offsetHeight === 0) continue;
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }
    }, true);
  });

  // ========== Helper: Find Media Container Wrapper ==========
  const findMediaContainer = (element, platformRules = []) => {
    if (!element) return null;
    
    // Check custom platform-specific wrappers first
    for (const rule of platformRules) {
      const closestWrapper = element.closest(rule);
      if (closestWrapper) return closestWrapper;
    }
    
    // Default fallback: walk up to find a positioned container
    let current = element.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!current || current === document.body) break;
      const style = window.getComputedStyle(current);
      if (current.tagName === 'DIV' && 
          (style.position === 'relative' || style.position === 'absolute') && 
          style.overflow === 'hidden') {
        return current;
      }
      current = current.parentElement;
    }
    
    return element.parentElement;
  };

  // ========== Helper: Get or Create Flex Container for Buttons ==========
  function getOrCreateButtonContainer(mediaContainer) {
    let btnContainer = mediaContainer.querySelector('.threads-download-btn-container');
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.className = 'threads-download-btn-container';
      mediaContainer.appendChild(btnContainer);
    }
    return btnContainer;
  }

  function getCapturedMediaUrls() {
    return new Promise((resolve) => {
      safeSendMessage({ action: 'getMediaUrls' }, (response) => {
        if (!response || !response.urls) {
          resolve([]);
        } else {
          resolve(response.urls);
        }
      });
    });
  }

  async function triggerZipDownload(urlList, meta, platform) {
    if (!urlList || urlList.length === 0) return;

    const timestamp = Math.floor(Date.now() / 1000);
    const safeUser = (meta.username || 'unknown').replace(/[^a-zA-Z0-9_.]/g, '');
    const safeId = (meta.postId || 'media').replace(/[^a-zA-Z0-9_-]/g, '');
    const zipFilename = `takoh_${platform}_${safeUser}_${safeId}_${timestamp}_carousel.zip`;

    const toastId = Date.now().toString();
    showToast(toastId, 'ZIP 압축 생성 중 📦', `총 ${urlList.length}개 미디어를 하나의 ZIP 파일로 압축 중입니다...`, 'info');

    const helperApiUrl = 'http://127.0.0.1:5005/download_zip';

    try {
      const response = await fetch(helperApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: urlList,
          filename: zipFilename
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 100) {
          const zipBlobUrl = URL.createObjectURL(blob);
          safeSendMessage({
            action: 'download',
            url: zipBlobUrl,
            filename: zipFilename,
            username: safeUser,
            postId: safeId,
            type: 'zip',
            platform: platform
          }, (res) => {
            if (res && res.success) {
              showToast(toastId, 'ZIP 다운로드 완료 🎉', `${zipFilename} 파일이 성공적으로 저장되었습니다!`, 'success');
            } else {
              fallbackZipDownload(urlList, zipFilename, meta, platform, toastId);
            }
          });
          return;
        } else {
          console.warn('[TAKOH Core] Generated ZIP blob was empty (size <= 100 bytes). Falling back.');
        }
      }
    } catch (e) {
      console.warn('[TAKOH Core] Helper ZIP endpoint unavailable, using fallback:', e);
    }

    fallbackZipDownload(urlList, zipFilename, meta, platform, toastId);
  }

  function fallbackZipDownload(urlList, zipFilename, meta, platform, toastId) {
    showToast(toastId, '일괄 저장 진행 🚀', `총 ${urlList.length}개의 미디어를 순차적으로 저장합니다.`, 'info');
    urlList.forEach((mediaUrl, idx) => {
      setTimeout(() => {
        const isVideo = mediaUrl.includes('.mp4');
        triggerDownload(mediaUrl, isVideo ? 'video' : 'image', {
          ...meta,
          postId: `${meta.postId}_slide_${idx + 1}`
        }, platform);
      }, idx * 300);
    });
  }

  // A negative filter shared by image scanners; platform media boundaries remain authoritative.
  function isComposerMedia(media) {
    if (!media?.closest) return false;
    if(media.closest('[contenteditable="true"],textarea,[data-testid*="composer" i]'))return true;
    for(let node=media.parentElement;node&&node!==document.body;node=node.parentElement){
      const role=node.getAttribute('role');
      if((role==='dialog'||node.tagName==='FORM'||role==='article'||node.tagName==='ARTICLE')&&node.querySelector('[contenteditable="true"],textarea,[role="textbox"]'))return true;
    }
    return false;
  }
  function isContentImage(img, platform = '') {
    if (!img || img.tagName !== 'IMG') return false;
    if(isComposerMedia(img))return false;
    if (platform === 'instagram') {
      if (/^\/(?:accounts|auth_platform|challenge)(?:\/|$)/i.test(location.pathname) || document.querySelector('input[type="password"],input[autocomplete="current-password"]')) return false;
      const postContext=img.closest('article,[role="article"],a[href*="/p/"],a[href*="/reel/"]');
      const detail=/^\/(?:p|reel|reels|stories)\//i.test(location.pathname);
      if (!postContext && !detail) return false;
    }
    const src = img.currentSrc || img.src || '';
    if (/\/t51\.(?:2885|12442)-19(?:\/|[._])|\/(?:profile_images|avatars?|emoji|emojis|communityIcon)(?:\/|[._-])/i.test(src)) return false;
    const identity = `${img.alt || ''} ${img.className || ''}`;
    if (/avatar|profile[ _-]*(?:picture|photo)|프로필\s*(?:사진|이미지)|아바타|(?:^|\s)emoji(?:\s|$)/i.test(identity)) return false;
    if (img.closest('header, nav, [role="navigation"], [data-testid="UserAvatar"], [data-testid*="avatar" i], [data-test-id*="avatar" i], [class*="avatar" i], .profile-picture, .user-avatar')) return false;
    const rect = img.getBoundingClientRect();
    // Source dimensions can be large even when an avatar is rendered at 32px.
    if (['instagram', 'threads'].includes(platform) && rect.width > 0 && rect.height > 0 && Math.min(rect.width, rect.height) < 80) return false;
    const anchor = img.closest('a[href]');
    if (anchor) {
      try {
        const url = new URL(anchor.href, location.href);
        const path = url.pathname;
        if (platform === 'threads' && /^\/@[^/]+\/?$/.test(path)) return false;
        if (platform === 'xhs' && /^\/user\/profile\//.test(path)) return false;
        if (platform === 'instagram' && /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/[^/]+\/?$/.test(path)) return false;
      } catch (_) {}
    }
    return true;
  }

  const positionedControls = new Map();
  const overlaySelector = '.threads-download-btn-container, .youtube-shorts-download-btn-container, .takoh-video-overlay-btn, .takoh-image-overlay-btn';
  function anchorMediaControls(controls, media, fixed = false) {
    if (!controls || !media) return;
    if(isComposerMedia(media)){controls.remove();return;}
    window.TAKStudio?.attach(controls, media, fixed);
    positionedControls.set(controls, {media, fixed});
    controls.classList.add('takoh-positioned-controls');
    const buttons = controls.tagName === 'BUTTON' ? [controls] : Array.from(controls.querySelectorAll('button'));
    for (const btn of buttons) {
      btn.type = 'button';
      if (!btn.title) btn.title = media.tagName === 'IMG' ? '이미지 다운로드' : '동영상 다운로드';
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', btn.title);
    }
  }
  function visibleMediaRect(media) {
    const r = media.getBoundingClientRect();
    let left = Math.max(0,r.left), top = Math.max(0,r.top);
    let right = Math.min(window.innerWidth,r.right), bottom = Math.min(window.innerHeight,r.bottom);
    for (let node = media.parentElement; node && node !== document.body; node = node.parentElement) {
      const s = window.getComputedStyle(node), b = node.getBoundingClientRect();
      if (/(hidden|clip|scroll|auto)/.test(s.overflowX)) {left=Math.max(left,b.left);right=Math.min(right,b.right);}
      if (/(hidden|clip|scroll|auto)/.test(s.overflowY)) {top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
      if (s.display === 'none' || s.visibility === 'hidden') return null;
    }
    const s = window.getComputedStyle(media);
    if (s.display === 'none' || s.visibility === 'hidden' || right-left < 56 || bottom-top < 48) return null;
    return {left,top,right,bottom,width:right-left,height:bottom-top};
  }
  function updateMediaControlPositions() {
    if (!document.querySelectorAll) return;
    // Preserve platform wrappers and deduplication markers; only move their controls.
    for (const control of document.querySelectorAll(overlaySelector)) {
      if (control.hasAttribute('data-takoh-threads-controls') || positionedControls.has(control)) continue;
      if (control.closest('.threads-download-btn-container, .youtube-shorts-download-btn-container') !== control && control.closest('.threads-download-btn-container, .youtube-shorts-download-btn-container')) continue;
      const host = control.parentElement;
      if (!host || host === document.body) continue;
      if(isComposerMedia(control)){control.remove();continue;}
      const media = Array.from(host.querySelectorAll('video,img,shreddit-player')).filter(el => {
        const r=el.getBoundingClientRect();
        return r.width>=56 && r.height>=48 && (el.tagName!=='IMG' || isContentImage(el));
      }).sort((a,b)=> (b.tagName==='VIDEO')-(a.tagName==='VIDEO') || b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];
      if (media) anchorMediaControls(control,media);
    }
    const occupied=[];
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    for (const [control,{media,fixed}] of positionedControls) {
      if(isComposerMedia(media)){control.remove();positionedControls.delete(control);continue;}
      if (!control.isConnected) {positionedControls.delete(control);continue;}
      const rect=media.isConnected ? visibleMediaRect(media) : null;
      const enabled=media.tagName==='IMG' ? config.enableImages : config.enableVideos;
      if (!rect || !enabled) {control.style.setProperty('display','none','important');continue;}
      control.classList.toggle('takoh-compact-controls',rect.width<240);
      control.style.setProperty('display','flex','important');
      const width=Math.min(control.offsetWidth || 110,rect.width-12), height=control.offsetHeight || 34;
      if (height>rect.height-12) {control.style.setProperty('display','none','important');continue;}
      const root=media.closest('article, [role="dialog"], shreddit-post') || media.parentElement;
      const isPinterest=/(^|\.)pinterest\.(com|co\.kr)$/.test(location.hostname);
      const obstacleRoot=isPinterest?document:root;
      const obstacles=Array.from(obstacleRoot?.querySelectorAll('button, [role="button"], input, a[aria-label]') || []).filter(el=>el!==control && !control.contains(el) && !el.closest('.takoh-positioned-controls')).map(el=>el.getBoundingClientRect()).filter(r=>r.width>0 && r.height>0);
      const candidates=[];
      for(const y of (isPinterest?[rect.bottom-height-48,rect.top+64,rect.top+8]:[rect.top+8,rect.top+48])) for(const x of [rect.left+8,rect.right-width-8]) {
        if(y+height<=rect.bottom-4) candidates.push({left:Math.max(rect.left+4,x),top:y,right:Math.max(rect.left+4,x)+width,bottom:y+height});
      }
      if(!candidates.length) {control.style.setProperty('display','none','important');continue;}
      candidates.sort((a,b)=>[...obstacles,...occupied].reduce((n,r)=>n+overlap(a,r),0)-[...obstacles,...occupied].reduce((n,r)=>n+overlap(b,r),0));
      const chosen=candidates[0]; occupied.push(chosen);
      control.style.setProperty('position',fixed?'fixed':'absolute','important');
      control.style.setProperty('right','auto','important');
      control.style.setProperty('bottom','auto','important');
      const parent=control.offsetParent || control.parentElement;
      const origin=fixed ? {left:0,top:0} : parent.getBoundingClientRect();
      control.style.setProperty('left',`${chosen.left-origin.left+(fixed?0:(parent.scrollLeft||0)-(parent.clientLeft||0))}px`,'important');
      control.style.setProperty('top',`${chosen.top-origin.top+(fixed?0:(parent.scrollTop||0)-(parent.clientTop||0))}px`,'important');
      control.style.setProperty('max-width',`${rect.width-12}px`,'important');
    }
  }
  let positionFramePending=false;
  function scheduleMediaControlPositions() {
    if(positionFramePending) return;
    positionFramePending=true;
    (window.requestAnimationFrame || (fn=>fn()))(()=>{positionFramePending=false;updateMediaControlPositions();});
  }
  window.addEventListener?.('scroll',scheduleMediaControlPositions,true);
  window.addEventListener?.('resize',scheduleMediaControlPositions);
  document.addEventListener('fullscreenchange',scheduleMediaControlPositions);

  const registeredProcessors = [];

  function registerPlatform(name, processFn) {
    if (typeof processFn === 'function') {
      registeredProcessors.push({ name, processFn });
    }
  }

  // ========== Expose Core Engine Globally ==========
  window.TAKCore = {
    anchorMediaControls,
    updateMediaControlPositions,
    isContentImage,
    isComposerMedia,
    config,
    showToast,
    triggerDownload,
    triggerZipDownload,
    createDownloadButton,
    getOrCreateButtonContainer,
    findMediaContainer,
    getCapturedMediaUrls,
    registerPlatform
  };

  // Dispatch custom event to notify platform modules that core is ready
  document.dispatchEvent(new CustomEvent('TAKCoreInitialized'));

  // ========== Shared Scan Scheduler & Observer ==========
  let lastScan = 0;
  const THROTTLE = 500;
  
  function runPlatformProcess() {
    if (window.TAKPlatform && typeof window.TAKPlatform.process === 'function') {
      try {
        window.TAKPlatform.process();
      } catch (e) {}
    }
    for (const proc of registeredProcessors) {
      try {
        proc.processFn();
      } catch (e) {}
    }
  }

  const observer = new MutationObserver(() => {
    const now = Date.now();
    if (now - lastScan >= THROTTLE) {
      lastScan = now;
      runPlatformProcess();
    }
    updateMediaControlPositions();
  });

  function startObserver() {
    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      try {
        observer.observe(targetNode, { childList: true, subtree: true });
      } catch (e) {}
    }
  }

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver);
  }

  // Listen for message events from background script
  listenRuntime((message) => {
    if (message.action === 'showToast') {
      showToast(message.id || Date.now().toString(), message.title, message.message, message.type);
    }
  });

  // Initial & Continuous Patrol Scan Loop (1000ms)
  runPlatformProcess();
  setTimeout(runPlatformProcess, 1000);
  setTimeout(runPlatformProcess, 2500);
  setInterval(runPlatformProcess, 1000);
})();
