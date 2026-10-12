/* TAKOH Media Downloader PRO - Xiaohongshu / RedNote (샤오홍슈/레드노트) Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload, createDownloadButton } = window.TAKCore;

  // Inject Main World Bridge Script for Xiaohongshu __INITIAL_STATE__ extraction
  try {
    const injectScript = document.createElement('script');
    injectScript.src = chrome.runtime.getURL('content-xhs-main.js');
    injectScript.onload = () => injectScript.remove();
    (document.head || document.documentElement).appendChild(injectScript);
  } catch (e) {}

  let latestXhsNoteData = null;

  window.addEventListener('message', (e) => {
    if (e.data?.source === 'takoh-downloader-main-world' && e.data?.type === 'XHS_NOTE_DATA') {
      latestXhsNoteData = e.data.data;
    }
  });

  // ========== Post Metadata Extraction ==========
  function getPostMetadata(container) {
    let username = 'xhs_user';
    let postId = 'note';

    const urlMatch = window.location.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z_]+)/);
    if (urlMatch) {
      postId = urlMatch[1];
    }

    const titleEl = document.querySelector('#detail-title, .title, [class*="title"], .desc, [class*="desc"]');
    if (titleEl && titleEl.textContent.trim()) {
      const cleanTitle = titleEl.textContent.trim().replace(/#[^\s#]+/g, '').replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim().substring(0, 25);
      if (cleanTitle.length > 2) postId = cleanTitle;
    }

    const userEl = document.querySelector('.author-wrapper .name, .user-name, [class*="username"], [class*="author"]');
    if (userEl && userEl.textContent.trim()) {
      username = userEl.textContent.trim().replace(/\s+/g, '_');
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

  function findTargetContainer(el) {
    if (!el) return null;
    return el.closest('div.note-content') ||
           el.closest('div.note-container') ||
           el.closest('div[class*="noteContainer"]') ||
           el.closest('div[class*="media-container"]') ||
           el.closest('div[class*="carousel"]') ||
           el.parentElement;
  }

  // Scanner: Attach overlay download buttons to Xiaohongshu Videos & Images
  function scanForXhsMedia() {
    // 1. Process Videos
    if (config.enableVideos) {
      const videos = document.querySelectorAll('video');

      videos.forEach(v => {
        if (v.offsetWidth < 80 || v.offsetHeight < 80) return;

        const targetBox = findTargetContainer(v);
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
          background: 'rgba(254, 44, 85, 0.9)',
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
          btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(254, 44, 85, 0.9)';
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

          let videoUrl = '';

          if (latestXhsNoteData && latestXhsNoteData.type === 'video' && latestXhsNoteData.videoUrl) {
            videoUrl = latestXhsNoteData.videoUrl;
          }

          if (!videoUrl) {
            if (v.src && !v.src.startsWith('blob:')) {
              videoUrl = v.src;
            } else if (v.currentSrc && !v.currentSrc.startsWith('blob:')) {
              videoUrl = v.currentSrc;
            }
          }

          if (videoUrl) {
            const meta = getPostMetadata(targetBox);
            meta.filename = `${meta.username}_${meta.postId}.mp4`;
            triggerDownload(videoUrl, 'video', meta, 'xiaohongshu');
          } else {
            showToast(Date.now().toString(), '다운로드 안내', '동영상을 1~2초간 재생해 주신 후 다시 시도해 주세요.', 'info');
          }
        }, true);

        targetBox.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btn, v);
      });
    }

    // 2. Process Images
    if (config.enableImages) {
      const images = document.querySelectorAll('img');

      images.forEach(imgEl => {
        if (!window.TAKCore.isContentImage(imgEl, 'xhs')) return;
        if (imgEl.offsetWidth < 180 || imgEl.offsetHeight < 180) return;

        const src = imgEl.src || '';
        if (!src || src.startsWith('data:') || src.includes('avatar') || src.includes('profile')) return;

        const targetBox = findTargetContainer(imgEl);
        if (!targetBox) return;

        if (targetBox.dataset.takohImageBtnAttached || targetBox.querySelector('.takoh-image-overlay-btn')) return;
        targetBox.dataset.takohImageBtnAttached = 'true';

        const style = window.getComputedStyle(targetBox);
        if (style.position === 'static') {
          targetBox.style.position = 'relative';
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
          background: 'rgba(254, 44, 85, 0.9)',
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
          btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(254, 44, 85, 0.9)';
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

          let imageUrl = imgEl.src.split('?')[0];
          if (latestXhsNoteData && latestXhsNoteData.type === 'image' && latestXhsNoteData.imageUrls && latestXhsNoteData.imageUrls.length > 0) {
            imageUrl = latestXhsNoteData.imageUrls[0];
          }

          const meta = getPostMetadata(targetBox);
          meta.filename = `${meta.username}_${meta.postId}.jpg`;
          triggerDownload(imageUrl, 'image', meta, 'xiaohongshu');
        }, true);

        targetBox.appendChild(btn);
        window.TAKCore.anchorMediaControls?.(btn, imgEl);
      });
    }
  }

  // Register Xiaohongshu platform processor
  window.TAKPlatform = {
    name: 'xiaohongshu',
    process: scanForXhsMedia
  };
})();
