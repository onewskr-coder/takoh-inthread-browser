/* TAKOH Media Downloader PRO - 1688 Product Media Extraction Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  function fixUrl(url) {
    if (!url) return null;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http')) return url;
    return null;
  }

  function get1688Metadata() {
    const titleEl = document.querySelector('.title-text, .mod-detail-title h1, h1');
    let title = titleEl ? titleEl.textContent.trim() : document.title;
    title = title.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().substring(0, 40) || '1688_product';
    return {
      username: '1688_seller',
      postId: title,
      title: title,
      filename: `${title}.mp4`
    };
  }

  function scanFor1688Media() {
    if (!config.enableVideos) return;

    // Scan videos
    const videos = document.querySelectorAll('video');
    videos.forEach(v => {
      if (v.offsetWidth < 80 || v.offsetHeight < 80) return;
      const parent = v.parentElement;
      if (!parent || parent.dataset.takohButtonAttached) return;
      parent.dataset.takohButtonAttached = 'true';

      const style = window.getComputedStyle(parent);
      if (style.position === 'static') parent.style.position = 'relative';

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
        color: '#ffffff',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        transition: 'all 0.2s ease'
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        let videoUrl = fixUrl(v.getAttribute('src')) || fixUrl(v.currentSrc);
        if (!videoUrl) {
          const source = v.querySelector('source[src]');
          if (source) videoUrl = fixUrl(source.getAttribute('src'));
        }

        const meta = get1688Metadata();
        if (videoUrl) {
          triggerDownload(videoUrl, 'video', meta, '1688');
        } else {
          showToast(Date.now().toString(), '다운로드 실패 ⚠️', '1688 동영상 URL을 찾을 수 없습니다.', 'warning');
        }
      });

      parent.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btn, v);
    });
  }

  window.TAKPlatform = {
    name: '1688',
    process: scanFor1688Media
  };
})();
