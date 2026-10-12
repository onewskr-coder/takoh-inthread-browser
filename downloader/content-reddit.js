/* TAKOH Media Downloader PRO - Reddit Module */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload, createDownloadButton, getOrCreateButtonContainer } = window.TAKCore;

  // ========== Metadata Extraction ==========
  function getPostMetadata(element) {
    let username = 'reddit_user';
    let postId = 'post';
    let postTitle = '';
    let postUrl = window.location.href;

    if (element) {
      const shredditPost = element.closest('shreddit-post') || 
                           document.querySelector(`shreddit-post[id*="${element.id || ''}"]`);
      if (shredditPost) {
        if (shredditPost.getAttribute('author')) {
          username = shredditPost.getAttribute('author');
        }
        if (shredditPost.getAttribute('post-title')) {
          postTitle = shredditPost.getAttribute('post-title');
        }
        if (shredditPost.getAttribute('id')) {
          postId = shredditPost.getAttribute('id').replace(/^t3_/, '');
        }
        if (shredditPost.getAttribute('permalink')) {
          postUrl = `https://www.reddit.com${shredditPost.getAttribute('permalink')}`;
        }
      }

      if (!postTitle) {
        const postContainer = element.closest('div[data-testid="post-container"]') || 
                              element.closest('article') || 
                              element.closest('div.Post') ||
                              element.closest('.thing');
        if (postContainer) {
          const authorEl = postContainer.querySelector('a[href*="/user/"], a[href*="/u/"], [data-testid="post_author_link"]');
          if (authorEl && authorEl.textContent.trim()) {
            username = authorEl.textContent.trim().replace(/^u\//i, '');
          }

          const titleEl = postContainer.querySelector('h1, h2, h3, [data-testid="post-title"], a[data-click-id="body"]');
          if (titleEl && titleEl.textContent.trim()) {
            postTitle = titleEl.textContent.trim();
          }

          const commentsLink = postContainer.querySelector('a[data-click-id="comments"], a[href*="/comments/"]');
          if (commentsLink) {
            const href = commentsLink.getAttribute('href') || '';
            const m = href.match(/\/comments\/([a-zA-Z0-9]+)/);
            if (m) postId = m[1];
          }
        }
      }
    }

    if (!postId || postId === 'post') {
      const urlMatch = window.location.pathname.match(/\/comments\/([a-zA-Z0-9]+)/);
      if (urlMatch) {
        postId = urlMatch[1];
      }
    }

    if (!postTitle) {
      const h1 = document.querySelector('h1');
      if (h1 && h1.textContent.trim()) {
        postTitle = h1.textContent.trim();
      } else {
        postTitle = document.title ? document.title.replace(/\s*:\s*r\/.*$/i, '').trim() : 'reddit_video';
      }
    }

    const safeUser = username.replace(/[^a-zA-Z0-9가-힣_-]/g, '') || 'reddit_user';
    const safeTitle = (postTitle || postId || 'media').replace(/[^a-zA-Z0-9가-힣_ -]/g, '').trim().substring(0, 40) || 'media';

    return {
      username: safeUser,
      postId: postId || 'media',
      title: safeTitle,
      postUrl: postUrl,
      filename: `${safeUser}_${safeTitle}`
    };
  }

  // ========== Resolve High Quality Reddit Video URL ==========
  async function resolveRedditVideoUrl(targetEl) {
    if (!targetEl) return null;

    // 1. Check shreddit-player attributes
    const shredditPlayer = targetEl.tagName === 'SHREDDIT-PLAYER' ? targetEl : (targetEl.closest('shreddit-player') || targetEl.querySelector('shreddit-player'));
    if (shredditPlayer) {
      const packagedUrl = shredditPlayer.getAttribute('packaged-media-json');
      if (packagedUrl) {
        try {
          const parsed = JSON.parse(packagedUrl);
          const mp4Url = parsed?.playbackMp4Url || parsed?.scrubberMediaUrl;
          if (mp4Url && mp4Url.startsWith('http')) return mp4Url;
        } catch (e) {}
      }

      const streamUrl = shredditPlayer.getAttribute('stream-url') || shredditPlayer.getAttribute('src');
      if (streamUrl && streamUrl.startsWith('http') && streamUrl.includes('.mp4')) {
        return streamUrl;
      }
    }

    // 2. Direct video or source tag
    let videoEl = targetEl.tagName === 'VIDEO' ? targetEl : targetEl.querySelector('video');
    if (videoEl) {
      let src = videoEl.src || videoEl.currentSrc || '';
      if (!src) {
        const sourceEl = videoEl.querySelector('source');
        if (sourceEl) src = sourceEl.src || sourceEl.getAttribute('src') || '';
      }
      if (src && src.startsWith('http')) {
        if (src.includes('v.redd.it') || src.includes('redd.it')) {
          const baseUrlMatch = src.match(/^(https?:\/\/v\.redd\.it\/[a-zA-Z0-9]+)/);
          if (baseUrlMatch) {
            return `${baseUrlMatch[1]}/DASH_1080.mp4?source=fallback`;
          }
        }
        if (!src.startsWith('blob:') && src.includes('.mp4')) {
          return src;
        }
      }
    }

    // 3. Check JSON API via Post ID fallback
    const meta = getPostMetadata(targetEl);
    if (meta && meta.postId && meta.postId !== 'media' && meta.postId !== 'post') {
      try {
        const jsonUrl = `https://www.reddit.com/by_id/t3_${meta.postId}.json`;
        const res = await fetch(jsonUrl);
        if (res.ok) {
          const data = await res.json();
          const postData = data?.data?.children?.[0]?.data;
          const mediaObj = postData?.media || postData?.secure_media;
          const redditVideo = mediaObj?.reddit_video;
          if (redditVideo) {
            const fallbackUrl = redditVideo.fallback_url || redditVideo.dash_url || redditVideo.hls_url;
            if (fallbackUrl) return fallbackUrl;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  // ========== Process Video Players (Including Modern Shreddit Players) ==========
  function processVideos() {
    if (!config.enableVideos) return;

    // Support both modern shreddit-player and standard video elements
    const targets = Array.from(document.querySelectorAll('shreddit-player, video, shreddit-post[post-type="video"], [data-testid="shreddit-player-wrapper"]'));

    targets.forEach((target) => {
      // Find the card container
      const container = target.closest('shreddit-player') ||
                        target.closest('shreddit-post') ||
                        target.closest('div[data-testid="post-container"]') ||
                        target.closest('.media-element') ||
                        target;

      if (!container) return;

      // Prevent duplicate attachment
      if (container.dataset.takohVideoAttached === 'true') return;

      const btnContainer = getOrCreateButtonContainer(container);
      if (!btnContainer) return;

      // Check if button already exists
      if (btnContainer.querySelector('[data-media-type="video"]')) {
        container.dataset.takohVideoAttached = 'true';
        return;
      }

      container.dataset.takohVideoAttached = 'true';
      const meta = getPostMetadata(container);

      const btn = createDownloadButton('video', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        showToast(Date.now().toString(), '다운로드 준비 중', '레딧 고화질 동영상 소스를 탐색 중입니다...', 'info');

        let videoUrl = await resolveRedditVideoUrl(target);
        if (videoUrl) {
          triggerDownload(videoUrl, 'video', {
            username: meta.username,
            postId: meta.postId,
            title: meta.title
          }, 'reddit');
        } else {
          showToast(Date.now().toString(), '동영상 다운로드 불가', '동영상 원본 링크를 추출하지 못했습니다. 동영상을 1초간 재생 후 다시 클릭해 주세요.', 'error');
        }
      });

      btnContainer.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btnContainer, target.querySelector('video') || target);
    });
  }

  // ========== Process Gallery & Single Images ==========
  function processImages() {
    if (!config.enableImages) return;

    // Target post media images only (exclude avatar, icons, badges)
    const images = document.querySelectorAll('shreddit-post img, div[data-testid="post-container"] img, figure img');
    images.forEach((img) => {
      if (!window.TAKCore.isContentImage(img, 'reddit')) return;
      if (img.offsetWidth < 200 || img.offsetHeight < 150) return;
      if (img.src && (img.src.includes('avatar') || img.src.includes('emoji') || img.src.includes('icon') || img.src.includes('communityIcon'))) return;

      // Ignore if this is a video poster image inside a video player
      if (img.closest('shreddit-player') || img.closest('video') || img.closest('[post-type="video"]')) return;

      const container = img.closest('shreddit-post') ||
                        img.closest('div[data-testid="post-container"]') ||
                        img.closest('figure') ||
                        img.parentElement;

      if (!container) return;

      if (container.dataset.takohImageAttached === 'true') return;

      const btnContainer = getOrCreateButtonContainer(container);
      if (!btnContainer) return;

      if (btnContainer.querySelector('[data-media-type="image"]')) {
        container.dataset.takohImageAttached = 'true';
        return;
      }

      container.dataset.takohImageAttached = 'true';
      const meta = getPostMetadata(container);

      const btn = createDownloadButton('image', (e) => {
        e.preventDefault();
        e.stopPropagation();

        let imgSrc = img.src || img.getAttribute('src') || '';
        if (imgSrc.includes('preview.redd.it')) {
          imgSrc = imgSrc.replace('preview.redd.it', 'i.redd.it').split('?')[0];
        }

        if (imgSrc) {
          triggerDownload(imgSrc, 'image', {
            username: meta.username,
            postId: meta.postId,
            title: meta.title
          }, 'reddit');
        }
      });

      btnContainer.appendChild(btn);
      window.TAKCore.anchorMediaControls?.(btnContainer, img);
    });
  }

  function processRedditMedia() {
    processVideos();
    processImages();
  }

  // Register Reddit Platform
  window.TAKPlatform = {
    name: 'reddit',
    process: processRedditMedia
  };
})();
