/* TAKOH Media Downloader PRO - YouTube Module (yt-dlp API & Multi-Target Injection) */

(() => {
  console.log('[TAKOH YouTube] YouTube module script loaded and active!');

  let moduleInitialized = false;

  function initModule() {
    if (moduleInitialized) return;
    if (!window.TAKCore) {
      setTimeout(initModule, 200);
      return;
    }
    moduleInitialized = true;
    const { config, showToast, triggerDownload, createDownloadButton } = window.TAKCore;

    // Helper for safe chrome.runtime.sendMessage handling context invalidation
    function safeSendMessage(msg, callback) {
      if (!chrome.runtime?.id) {
        showToast(Date.now().toString(), '새로고침 필요 🔄', '확장프로그램이 새로 로드되었습니다. 페이지를 새로고침(F5) 해주세요!', 'warning');
        if (callback) callback({ success: false, error: 'Extension context invalidated. Please refresh the page (F5).' });
        return;
      }
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[TAKOH YouTube] sendMessage error:', chrome.runtime.lastError.message);
            if (chrome.runtime.lastError.message?.includes('invalidated') || chrome.runtime.lastError.message?.includes('Receiving end')) {
              showToast(Date.now().toString(), '새로고침 필요 🔄', '확장프로그램 연결이 갱신되었습니다. 페이지를 새로고침(F5) 해주세요!', 'warning');
            }
          }
          if (callback) callback(response);
        });
      } catch (err) {
        console.warn('[TAKOH YouTube] sendMessage exception:', err);
        showToast(Date.now().toString(), '새로고침 필요 🔄', '페이지를 새로고침(F5) 후 다시 시도해주세요!', 'warning');
        if (callback) callback({ success: false, error: err.message });
      }
    }

    // Main World Bridge Script Injection via web_accessible_resources (Bypasses YouTube CSP)
    try {
      const injectScript = document.createElement('script');
      injectScript.src = chrome.runtime.getURL('content-youtube-main.js');
      injectScript.onload = () => injectScript.remove();
      (document.head || document.documentElement).appendChild(injectScript);
    } catch (e) {
      console.warn('[TAKOH YouTube] Bridge script injection notice:', e);
    }

    // Default configuration for yt-dlp API server
    const DEFAULT_API_URL = 'https://takoh.onrender.com/download';

    // Listen to Main World Metadata update event
    document.addEventListener('TAKOH_YT_META_UPDATE', (e) => {
      if (!e || !e.detail) return;
      const { videoId, viewCount, publishDate } = e.detail;
      if (!videoId) return;
      
      const activeReel = getActiveShortsContainer();
      if (!activeReel) return;
      
      const currentUrl = window.location.href;
      if (!currentUrl.includes(videoId)) return;

      const badge = activeReel.querySelector('.yt-shorts-meta-badge');
      if (!badge) return;

      const subCountEl = activeReel.querySelector('#subscriber-count');
      const subText = subCountEl ? subCountEl.textContent.trim() : "";
      const subscribers = parseSubscribers(subText);
      
      let diffDays = 1;
      if (publishDate !== "날짜 미상" && publishDate !== "") {
        const normalizedDate = publishDate.replace(/\.\s*/g, '-').replace(/-$/, '').trim();
        const pubDate = new Date(normalizedDate);
        const today = new Date();
        
        today.setHours(0, 0, 0, 0);
        pubDate.setHours(0, 0, 0, 0);
        
        const timeDiff = today.getTime() - pubDate.getTime();
        diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) || 1;
        if (diffDays < 1) diffDays = 1;
      }
      
      const viralRatio = subscribers > 0 ? (viewCount / subscribers) : 0;
      
      let ratioText = "";
      let ratioBg = "rgba(0, 0, 0, 0.75)";
      
      if (subscribers > 0) {
        if (viralRatio >= 1.0) {
          ratioText = `👑 ${viralRatio.toFixed(1)}x`;
          ratioBg = 'linear-gradient(135deg, #f59e0b, #d97706)';
        } else if (viralRatio >= 0.5) {
          ratioText = `🔥 ${viralRatio.toFixed(1)}x`;
          ratioBg = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        } else {
          ratioText = `❌ ${viralRatio.toFixed(1)}x`;
        }
      } else {
        if (viewCount >= 500000) {
          ratioText = `👑 ${(viewCount/10000).toFixed(0)}만`;
          ratioBg = 'linear-gradient(135deg, #f59e0b, #d97706)';
        } else if (viewCount >= 100000) {
          ratioText = `🔥 ${(viewCount/10000).toFixed(0)}만`;
          ratioBg = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        } else {
          ratioText = `❌ ${(viewCount/10000).toFixed(1)}만`;
        }
      }
      
      let viewText = "";
      if (viewCount >= 10000) {
        viewText = (viewCount / 10000).toFixed(1) + "만회";
      } else {
        viewText = viewCount.toLocaleString() + "회";
      }
      
      badge.style.background = ratioBg;
      badge.innerHTML = `
        <span>📅 ${publishDate} (${diffDays}일전)</span>
        <span>👁️ ${viewText} / ${ratioText}</span>
      `;
    });

    // Helper to parse Korean subscriber/view texts
    function parseSubscribers(text) {
      if (!text) return 0;
      const matched = text.match(/[0-9\.]+[만억MK명K]?/g);
      if (!matched) return 0;
      const clean = matched[0];
      let num = parseFloat(clean);
      if (clean.includes("만")) {
        num *= 10000;
      } else if (clean.includes("억")) {
        num *= 100000000;
      } else if (clean.includes("M")) {
        num *= 1000000;
      } else if (clean.includes("K")) {
        num *= 1000;
      }
      return isNaN(num) ? 0 : num;
    }

    function requestPlayerResponse() {
      return new Promise((resolve) => {
        const targetId = `ytpr-${Math.random().toString(36).slice(2)}`;
        const listener = (e) => {
          if (!e.detail || e.detail.targetId !== targetId) return;
          document.removeEventListener('TAKOH_RESPONSE_PLAYER_RESPONSE', listener);
          resolve(e.detail.playerResponse || null);
        };
        document.addEventListener('TAKOH_RESPONSE_PLAYER_RESPONSE', listener);
        document.dispatchEvent(new CustomEvent('TAKOH_REQUEST_PLAYER_RESPONSE', { detail: { targetId } }));
        setTimeout(() => {
          document.removeEventListener('TAKOH_RESPONSE_PLAYER_RESPONSE', listener);
          resolve(null);
        }, 1200);
      });
    }

    function getFormatUrl(format) {
      if (!format) return null;
      if (format.url) return format.url;
      const cipher = format.signatureCipher || format.cipher;
      if (!cipher) return null;
      try {
        const params = new URLSearchParams(cipher);
        const url = params.get('url');
        const sp = params.get('sp') || params.get('sig') || 'sig';
        const s = params.get('s');
        if (!url) return null;
        if (s) {
          return `${decodeURIComponent(url)}&${sp}=${decodeURIComponent(s)}`;
        }
        return decodeURIComponent(url);
      } catch (e) {
        return null;
      }
    }

    function extractDirectVideoUrl(playerResponse) {
      if (!playerResponse) return null;
      const streamingData = playerResponse.streamingData || {};
      const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
      const adaptiveFormats = Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [];
      const candidates = formats.concat(adaptiveFormats).map((format) => {
        return {
          url: getFormatUrl(format),
          hasAudio: !!(format.audioBitrate || (format.mimeType && format.mimeType.includes('audio'))),
          bitrate: format.bitrate || 0,
          qualityLabel: format.qualityLabel || ''
        };
      }).filter(item => item.url);
      candidates.sort((a, b) => {
        if (a.hasAudio !== b.hasAudio) return a.hasAudio ? -1 : 1;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });
      return candidates.length > 0 ? candidates[0].url : null;
    }

    function extractJsonFromText(text, key) {
      const needle = key + '\\s*=\\s*';
      const idx = text.search(new RegExp(needle));
      if (idx < 0) return null;
      const braceStart = text.indexOf('{', idx);
      if (braceStart < 0) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = braceStart; i < text.length; i++) {
        const chr = text[i];
        if (chr === '\\\\' && !escape) {
          escape = true;
          continue;
        }
        if (chr === '"' && !escape) {
          inString = !inString;
        }
        escape = false;
        if (inString) continue;
        if (chr === '{') depth += 1;
        else if (chr === '}') depth -= 1;
        if (depth === 0) {
          return text.slice(braceStart, i + 1);
        }
      }
      return null;
    }

    async function getYoutubeDirectUrl() {
      let playerResponse = await requestPlayerResponse();
      if (!playerResponse) {
        if (window.ytInitialPlayerResponse) {
          playerResponse = window.ytInitialPlayerResponse;
        } else if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.player_response) {
          try {
            playerResponse = JSON.parse(window.ytplayer.config.args.player_response);
          } catch (e) {
            playerResponse = null;
          }
        }
      }

      let directUrl = extractDirectVideoUrl(playerResponse);
      if (directUrl) return directUrl;

      const scripts = Array.from(document.scripts || []);
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text) continue;
        const jsonText = extractJsonFromText(text, 'ytInitialPlayerResponse') || extractJsonFromText(text, 'player_response');
        if (!jsonText) continue;
        try {
          const parsed = JSON.parse(jsonText);
          directUrl = extractDirectVideoUrl(parsed);
          if (directUrl) return directUrl;
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    // Hybrid Capture-and-Scrape Downloader for YouTube
    function downloadCapturedYoutubeVideo(meta, fallbackCallback) {
      function startTrafficCapture() {
        safeSendMessage({ action: 'getMediaUrls' }, (response) => {
          const urls = (response && response.urls) ? response.urls : [];
          const videoUrls = urls.filter(u => u.url.includes('googlevideo.com/videoplayback') || u.url.includes('/videoplayback'));
          
          if (videoUrls.length > 0) {
            let targetUrl = null;
            const combined = videoUrls.find(u => !u.url.includes('mime=audio') && !u.url.includes('mime%3Daudio'));
            if (combined) {
              targetUrl = combined.url;
            } else {
              targetUrl = videoUrls[videoUrls.length - 1].url;
            }

            if (targetUrl) {
              try {
                const urlObj = new URL(targetUrl);
                urlObj.searchParams.delete('range');
                urlObj.searchParams.delete('rn');
                urlObj.searchParams.delete('rbuf');
                targetUrl = urlObj.toString();
              } catch (e) {}

              console.log('[YouTube Downloader] Downloading captured stream URL:', targetUrl.substring(0, 100));
              showToast(Date.now().toString(), '다운로드 시작', '감지된 고해상도 비디오 스트림을 다운로드합니다.', 'success');
              
              safeSendMessage({
                action: 'download',
                url: targetUrl,
                filename: `${meta.username}_${meta.postId}.mp4`,
                username: meta.username,
                postId: meta.postId,
                type: 'video',
                platform: 'youtube'
              }, (dlResponse) => {
                if (!dlResponse || !dlResponse.success) {
                  const errMsg = dlResponse ? dlResponse.error : '다운로드 오류';
                  showToast(Date.now().toString(), '다운로드 실패', `다운로드 실패: ${errMsg}`, 'error');
                }
              });
              return;
            }
          }
          
          fallbackCallback();
        });
      }

      chrome.storage.local.get(['ytdlpApiUrl', 'videoQuality'], (result) => {
        const apiEndpoint = result.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
        const quality = result.videoQuality || 'best';
        const videoUrl = window.location.href;
        const fullDownloadUrl = `${apiEndpoint}?url=${encodeURIComponent(videoUrl)}&quality=${quality}&_t=${Date.now()}`;

        console.log('[YouTube Downloader] Downloading via Helper API:', fullDownloadUrl.substring(0, 120));
        showToast(Date.now().toString(), '다운로드 시작', '도우미 서버를 통해 고화질 유튜브 동영상을 다운로드합니다.', 'success');

        safeSendMessage({
          action: 'download',
          url: fullDownloadUrl,
          filename: `${meta.username}_${meta.postId}.mp4`,
          username: meta.username,
          postId: meta.postId,
          type: 'video',
          platform: 'youtube'
        }, (dlResponse) => {
          if (!dlResponse || !dlResponse.success) {
            const errMsg = dlResponse ? dlResponse.error : '다운로드 오류';
            console.warn('[YouTube Downloader] API download failed:', errMsg);
            
            if (errMsg && errMsg.includes('진행 중')) {
              showToast(Date.now().toString(), '다운로드 진행 중', '이미 다운로드가 진행 중입니다.', 'info');
              return;
            }
            
            showToast(Date.now().toString(), 'API 다운로드 실패', `도우미 서버 응답 오류: ${errMsg}. 트래픽 감지로 전환합니다.`, 'warning');
            startTrafficCapture();
          }
        });
      });
    }

    // Helper: Find active Shorts container
    function getActiveShortsContainer() {
      let activeReel = document.querySelector('ytd-reel-video-renderer[is-active]') || 
                       document.querySelector('yt-reel-video-renderer[is-active]') ||
                       document.querySelector('ytd-shorts-video-renderer[is-active]') ||
                       document.querySelector('ytd-reel-video-renderer') ||
                       document.querySelector('yt-reel-video-renderer') ||
                       document.querySelector('ytd-shorts');

      if (!activeReel) {
        const videos = Array.from(document.querySelectorAll('video'));
        const visibleVideo = videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0 && (v.closest('ytd-shorts') || v.closest('#shorts-container')));
        if (visibleVideo) {
          activeReel = visibleVideo.closest('ytd-reel-video-renderer, yt-reel-video-renderer, ytd-shorts-video-renderer, ytd-shorts') || visibleVideo.parentElement;
        }
      }
      return activeReel;
    }

    // Master check function for YouTube pages
    function checkYoutubePage() {
      const currentUrl = window.location.href;
      
      if (currentUrl.includes('/shorts') || currentUrl.includes('/@') || currentUrl.includes('/channel/') || currentUrl.includes('/c/')) {
        processShortsGrid();
      }
      
      if (currentUrl.includes('/watch')) {
        handleWatchPage(currentUrl);
      } else if (currentUrl.includes('/shorts')) {
        handleShortsPage(currentUrl);
      }
    }

    // Helper: Create YouTube Action Bar Button (Native Red Pill Style)
    // Helper: Create YouTube Action Bar Button (Native Red / Green Pill Style)
    function createYoutubeNativeActionButton(label, bg, svgIcon, onClick) {
      const btn = document.createElement('button');
      btn.className = 'takoh-yt-action-btn yt-spec-button-shape-next';
      btn.style.cssText = `
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        background: ${bg} !important;
        color: #ffffff !important;
        font-family: "Roboto", "Arial", sans-serif !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        padding: 0 14px !important;
        height: 36px !important;
        border-radius: 18px !important;
        border: none !important;
        cursor: pointer !important;
        margin-left: 6px !important;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3) !important;
        transition: all 0.2s ease !important;
        z-index: 9999 !important;
        white-space: nowrap !important;
        opacity: 1 !important;
        visibility: visible !important;
      `;
      btn.innerHTML = `
        ${svgIcon}
        <span>${label}</span>
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return btn;
    }

    // Watch Page Handler (Long-form videos)
    function handleWatchPage(currentUrl) {
      const videoEl = document.querySelector('ytd-watch-flexy video.html5-main-video') || 
                      document.querySelector('video.html5-main-video') ||
                      document.querySelector('video');
      if (!videoEl) return;

      // 1) Remove any legacy top-overlay buttons from player if present
      const playerContainer = document.querySelector('#movie_player') || 
                              document.querySelector('.html5-video-player') ||
                              videoEl.parentElement;
      if (playerContainer) {
        const overlayBtn = playerContainer.querySelector('.youtube-watch-download-btn-container');
        if (overlayBtn) overlayBtn.remove();
      }

      // 2) Stable Action Bar Button Injection (Prevents 1s Flickering)
      const actionBar = document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
                        document.querySelector('#top-row #actions #top-level-buttons-computed') ||
                        document.querySelector('ytd-watch-metadata #actions') ||
                        document.querySelector('#top-row #actions');

      if (actionBar) {
        const hasVideoBtn = actionBar.querySelector('.takoh-yt-btn-video');
        const hasAudioBtn = actionBar.querySelector('.takoh-yt-btn-audio');

        if (hasVideoBtn && hasAudioBtn && document.body.contains(hasVideoBtn) && document.body.contains(hasAudioBtn)) {
          return; // Both buttons are stably attached in actionBar
        }

        // Clean any orphaned or detached buttons
        document.querySelectorAll('.takoh-yt-action-btn').forEach(b => {
          if (!actionBar.contains(b)) b.remove();
        });

        const videoSvg = `<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:currentColor;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        const audioSvg = `<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:currentColor;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

        if (!actionBar.querySelector('.takoh-yt-btn-video')) {
          const videoBtn = createYoutubeNativeActionButton('📹 비디오', '#ff0000', videoSvg, () => {
            triggerYoutubeWatchDownload(currentUrl);
          });
          videoBtn.classList.add('takoh-yt-btn-video');
          const targetPos = actionBar.children[1] || actionBar.firstChild;
          if (targetPos) actionBar.insertBefore(videoBtn, targetPos);
          else actionBar.appendChild(videoBtn);
        }

        if (!actionBar.querySelector('.takoh-yt-btn-audio')) {
          const audioBtn = createYoutubeNativeActionButton('🎵 MP3 음원', '#10b981', audioSvg, () => {
            triggerYoutubeAudioDownload(currentUrl);
          });
          audioBtn.classList.add('takoh-yt-btn-audio');
          const videoBtn = actionBar.querySelector('.takoh-yt-btn-video');
          if (videoBtn && videoBtn.nextSibling) actionBar.insertBefore(audioBtn, videoBtn.nextSibling);
          else actionBar.appendChild(audioBtn);
        }

        console.log('[YouTube Downloader] YT watch video & audio native action bar buttons stably attached.');
      }
    }

    function extractDirectAudioUrl(playerResponse) {
      if (!playerResponse) return null;
      const streamingData = playerResponse.streamingData || {};
      const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
      const adaptiveFormats = Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [];
      const candidates = formats.concat(adaptiveFormats).map((format) => {
        return {
          url: getFormatUrl(format),
          isAudio: !!(format.audioBitrate || (format.mimeType && format.mimeType.includes('audio'))),
          bitrate: format.bitrate || 0
        };
      }).filter(item => item.url && item.isAudio);

      candidates.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      return candidates.length > 0 ? candidates[0].url : null;
    }

    async function getYoutubeDirectAudioUrl() {
      let playerResponse = await requestPlayerResponse();
      if (!playerResponse) {
        if (window.ytInitialPlayerResponse) {
          playerResponse = window.ytInitialPlayerResponse;
        }
      }

      let audioUrl = extractDirectAudioUrl(playerResponse);
      if (audioUrl) return audioUrl;

      const scripts = Array.from(document.scripts || []);
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text) continue;
        const jsonText = extractJsonFromText(text, 'ytInitialPlayerResponse') || extractJsonFromText(text, 'player_response');
        if (!jsonText) continue;
        try {
          const parsed = JSON.parse(jsonText);
          audioUrl = extractDirectAudioUrl(parsed);
          if (audioUrl) return audioUrl;
        } catch (e) {}
      }
      return null;
    }

    function triggerYoutubeWatchDownload(latestUrl) {
      const titleEl = document.querySelector('ytd-watch-metadata h1 ytd-formatted-string') ||
                      document.querySelector('h1.ytd-watch-metadata') ||
                      document.querySelector('h1.title');
      const channelEl = document.querySelector('ytd-watch-metadata #channel-name a') ||
                        document.querySelector('#owner #channel-name a');

      const rawTitle = titleEl ? titleEl.textContent.trim() : (document.title || 'YouTube_Video');
      const cleanTitle = rawTitle.replace(/\s*-\s*YouTube/i, '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim() || 'YouTube_Video';
      const postId = new URL(latestUrl).searchParams.get('v') || 'video';

      const toastId = Date.now().toString();
      showToast(toastId, '유튜브 고화질 다운로드 중 🚀', `'${cleanTitle}' 동영상 다운로드를 요청하고 있습니다 (약 5~15초 소요)...`, 'info');

      const helperPingUrl = 'http://127.0.0.1:5005/ping';
      const helperDownloadUrl = `http://127.0.0.1:5005/download?url=${encodeURIComponent(latestUrl)}&quality=best`;

      fetch(helperPingUrl, { method: 'GET' })
        .then(res => res.ok)
        .catch(() => false)
        .then(isHelperActive => {
          if (isHelperActive) {
            safeSendMessage({
              action: 'download',
              url: helperDownloadUrl,
              filename: `${cleanTitle}.mp4`,
              username: channelEl ? channelEl.textContent.trim() : 'YouTube',
              postId: postId,
              title: cleanTitle,
              type: 'video',
              platform: 'youtube'
            }, (res) => {
              if (res && res.success) {
                showToast(toastId, '다운로드 시작 🎉', `'${cleanTitle}.mp4' 저장이 시작되었습니다!`, 'success');
              } else {
                showToast(toastId, '유튜브 다운로드 안내 ⚠️', '도우미 프로그램(start_helper.bat)을 실행하셨나요?', 'error');
              }
            });
          } else {
            fallbackDirectYoutubeDownload(latestUrl, cleanTitle, postId, channelEl, toastId);
          }
        });
    }

    function triggerYoutubeAudioDownload(latestUrl) {
      const titleEl = document.querySelector('ytd-watch-metadata h1 ytd-formatted-string') ||
                      document.querySelector('h1.ytd-watch-metadata') ||
                      document.querySelector('h1.title');
      const channelEl = document.querySelector('ytd-watch-metadata #channel-name a') ||
                        document.querySelector('#owner #channel-name a');

      const rawTitle = titleEl ? titleEl.textContent.trim() : (document.title || 'YouTube_Audio');
      const cleanTitle = rawTitle.replace(/\s*-\s*YouTube/i, '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim() || 'YouTube_Audio';
      const postId = new URL(latestUrl).searchParams.get('v') || 'audio';

      const toastId = Date.now().toString();
      showToast(toastId, 'MP3 초고속 추출 🎵', `'${cleanTitle}' 음원 저장 중...`, 'info');

      getYoutubeDirectAudioUrl().then(audioUrl => {
        let finalUrl = audioUrl;
        if (finalUrl) {
          try {
            const urlObj = new URL(finalUrl);
            urlObj.searchParams.delete('range');
            finalUrl = urlObj.toString();
          } catch(e) {}
        }

        if (!finalUrl) {
          safeSendMessage({ action: 'getMediaUrls' }, (response) => {
            const urls = (response && response.urls) ? response.urls : [];
            const audioStream = urls.find(u => u.url.includes('mime=audio') || u.url.includes('mime%3Daudio'));
            if (audioStream) {
              finalUrl = audioStream.url;
            }
            if (finalUrl) {
              safeSendMessage({
                action: 'download',
                url: finalUrl,
                filename: `${cleanTitle}.mp3`,
                username: channelEl ? channelEl.textContent.trim() : 'YouTube',
                postId: postId,
                title: cleanTitle,
                type: 'audio',
                platform: 'youtube'
              });
              showToast(toastId, 'MP3 저장 시작 🎧', `'${cleanTitle}.mp3' 저장 시작!`, 'success');
            } else {
              showToast(toastId, '음원 준비 중 ⚠️', '영상을 1초간 재생 후 다시 눌러주세요.', 'error');
            }
          });
          return;
        }

        safeSendMessage({
          action: 'download',
          url: finalUrl,
          filename: `${cleanTitle}.mp3`,
          username: channelEl ? channelEl.textContent.trim() : 'YouTube',
          postId: postId,
          title: cleanTitle,
          type: 'audio',
          platform: 'youtube'
        }, (res) => {
          showToast(toastId, 'MP3 저장 시작 🎧', `'${cleanTitle}.mp3' 저장 시작!`, 'success');
        });
      });
    }

    function fallbackDirectYoutubeDownload(latestUrl, cleanTitle, postId, channelEl, toastId) {
      showToast(toastId, '고화질 추출 중 🔍', '유튜브 스트림 추출 중입니다...', 'info');
      getYoutubeDirectUrl().then(directUrl => {
        const targetUrl = directUrl || latestUrl;
        try {
          safeSendMessage({
            action: 'download',
            url: targetUrl,
            filename: `${cleanTitle}.mp4`,
            username: channelEl ? channelEl.textContent.trim() : 'YouTube',
            postId: postId,
            title: cleanTitle,
            type: 'video',
            platform: 'youtube'
          }, (res) => {
            if (chrome.runtime.lastError) {
              console.log('[YouTube Downloader] sendMessage lastError:', chrome.runtime.lastError.message);
              showToast(toastId, '다운로드 실패', '다운로드 처리에 실패했습니다.', 'error');
              return;
            }
            if (res && res.success) {
              showToast(toastId, '다운로드 시작 🎉', `'${cleanTitle}.mp4' 저장 시작!`, 'success');
            } else {
              showToast(toastId, '다운로드 실패', '다운로드 처리에 실패했습니다.', 'error');
            }
          });
        } catch (err) {
          console.log('[YouTube Downloader] sendMessage thrown error:', err);
          showToast(toastId, '다운로드 실패', '다운로드 처리에 실패했습니다.', 'error');
        }
      });
    }

    // YouTube Shorts Handler
    function handleShortsPage(currentUrl) {
      const activeReel = getActiveShortsContainer();
      if (!activeReel) return;

      const videoEl = activeReel.querySelector('video') || activeReel.querySelector('.html5-main-video');
      if (!videoEl) return;

      const postId = currentUrl.split('/shorts/')[1]?.split('?')[0] || 'shorts';

      // ------------------------------------------------------------
      // 1) Shorts Right Action Bar Injection (Circle Button next to Like/Comment)
      // ------------------------------------------------------------
      const rightActionBar = activeReel.querySelector('#actions') || 
                             activeReel.querySelector('ytd-shorts-player-controls') ||
                             activeReel.querySelector('.action-container') ||
                             activeReel.querySelector('ytd-reel-player-overlay-renderer #actions');

      if (rightActionBar) {
        let actionBtn = rightActionBar.querySelector('.takoh-yt-shorts-action-btn');
        if (!actionBtn) {
          actionBtn = document.createElement('button');
          actionBtn.className = 'takoh-yt-shorts-action-btn';
          actionBtn.title = '쇼츠 동영상 다운로드';
          actionBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <span>다운로드</span>
          `;
          actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerYoutubeShortsDownload(window.location.href);
          });
          // Insert at the top of right action buttons
          rightActionBar.insertBefore(actionBtn, rightActionBar.firstChild);
          console.log('[YouTube Downloader] Shorts right action bar circle button injected!');
        }
      }

      // ------------------------------------------------------------
      // 2) Shorts Video Player Container Overlay (Left-Top of Video Frame)
      // ------------------------------------------------------------
      const videoFrame = activeReel.querySelector('#player-container') || 
                         activeReel.querySelector('.html5-video-player') ||
                         activeReel.querySelector('#media-container') ||
                         activeReel.querySelector('ytd-player') ||
                         activeReel;

      if (videoFrame) {
        // Enforce containing block position relative
        if (window.getComputedStyle(videoFrame).position === 'static') {
          videoFrame.style.position = 'relative';
        }

        let btnContainer = videoFrame.querySelector('.youtube-shorts-download-btn-container');
        const processedId = videoEl.getAttribute('data-yt-shorts-processed-id');

        if (btnContainer && (!document.body.contains(btnContainer) || processedId !== postId)) {
          btnContainer.remove();
          btnContainer = null;
          videoEl.removeAttribute('data-yt-shorts-processed');
        }

        if (!btnContainer && !videoEl.hasAttribute('data-yt-shorts-processed')) {
          videoEl.setAttribute('data-yt-shorts-processed', 'true');
          videoEl.setAttribute('data-yt-shorts-processed-id', postId);

          btnContainer = document.createElement('div');
          btnContainer.className = 'youtube-shorts-download-btn-container';
          btnContainer.style.cssText = `
            position: absolute !important;
            top: 20px !important;
            left: 20px !important;
            z-index: 2147483647 !important;
            pointer-events: auto !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          `;

          const btn = createDownloadButton('video', () => {
            triggerYoutubeShortsDownload(window.location.href);
          });

          // FORCE VISIBILITY & FLEX DISPLAY
          btn.style.cssText = `
            display: flex !important;
            opacity: 1 !important;
            visibility: visible !important;
            transform: none !important;
            background: rgba(255, 0, 0, 0.9) !important;
            border-color: rgba(255, 0, 0, 0.4) !important;
            border-left: 4px solid #ff0000 !important;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6) !important;
            pointer-events: auto !important;
          `;

          const textSpan = btn.querySelector('span');
          if (textSpan) textSpan.textContent = 'Shorts Download';

          const badge = document.createElement('div');
          badge.className = 'yt-shorts-meta-badge';
          badge.style.cssText = 'background: rgba(0, 0, 0, 0.75); color: #fff; padding: 6px 10px; font-size: 11px; font-weight: bold; border-radius: 6px; border-left: 3px solid #ff0000; box-shadow: 0 4px 12px rgba(0,0,0,0.4); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); pointer-events: none; white-space: nowrap; display: flex; flex-direction: column; gap: 2px;';
          badge.innerHTML = '<span>📅 날짜 로딩 중...</span>';

          btnContainer.appendChild(btn);
          btnContainer.appendChild(badge);
          videoFrame.appendChild(btnContainer);
          window.TAKCore.anchorMediaControls?.(btnContainer, videoEl);
          console.log('[YouTube Downloader] YT Shorts overlay download button injected inside video frame.');
        }
      }
    }

    function getShortsTitle(activeReel) {
      if (activeReel) {
        const candidates = [
          activeReel.querySelector('ytd-reel-player-header-renderer h2'),
          activeReel.querySelector('ytd-reel-player-overlay-renderer #title'),
          activeReel.querySelector('yt-core-attributed-string'),
          activeReel.querySelector('.reel-player-header-title'),
          activeReel.querySelector('h2.yt-shorts-title'),
          activeReel.querySelector('h2.title'),
          activeReel.querySelector('h2')
        ];
        for (const el of candidates) {
          if (el && el.textContent && el.textContent.trim().length > 1) {
            return el.textContent.trim();
          }
        }
      }

      if (document.title) {
        const cleanDocTitle = document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube/i, '').trim();
        if (cleanDocTitle && cleanDocTitle.length > 1) {
          return cleanDocTitle;
        }
      }
      return null;
    }

    function triggerYoutubeShortsDownload(latestUrl) {
      let targetUrl = latestUrl || window.location.href;
      const activeReel = getActiveShortsContainer();
      if (activeReel) {
        const link = activeReel.querySelector('a[href*="/shorts/"]');
        if (link && link.href) {
          targetUrl = link.href;
        }
      }

      let postId = '';
      if (targetUrl.includes('/shorts/')) {
        postId = targetUrl.split('/shorts/')[1]?.split('?')[0]?.split('&')[0]?.replace(/\/$/, '') || '';
      } else if (targetUrl.includes('v=')) {
        postId = new URL(targetUrl).searchParams.get('v') || '';
      }
      if (!postId && window.location.pathname.includes('/shorts/')) {
        postId = window.location.pathname.split('/shorts/')[1]?.split('?')[0]?.split('/')[0] || '';
      }
      if (!postId) postId = 'shorts';

      // Normalize to standard Watch URL format for maximum server compatibility
      const canonicalUrl = postId && postId !== 'shorts' ? `https://www.youtube.com/watch?v=${postId}` : targetUrl;
      const rawTitle = getShortsTitle(activeReel);
      const cleanTitle = (rawTitle || `Shorts_${postId}`).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim() || `Shorts_${postId}`;

      const helperPingUrl = 'http://127.0.0.1:5005/ping';
      const helperDownloadUrl = `http://127.0.0.1:5005/download?url=${encodeURIComponent(canonicalUrl)}&quality=best`;

      const toastId = Date.now().toString();
      showToast(toastId, 'Shorts 고화질 다운로드 중 🚀', `'${cleanTitle}' 다운로드를 시작합니다 (약 3~10초 소요)...`, 'info');

      fetch(helperPingUrl, { method: 'GET' })
        .then(res => res.ok)
        .catch(() => false)
        .then(isHelperActive => {
          if (isHelperActive) {
            safeSendMessage({
              action: 'download',
              url: helperDownloadUrl,
              filename: `${cleanTitle}.mp4`,
              username: 'YouTube_Shorts',
              postId: postId,
              title: cleanTitle,
              type: 'video',
              platform: 'youtube'
            }, (res) => {
              if (res && res.success) {
                showToast(toastId, 'Shorts 다운로드 시작 🎉', `'${cleanTitle}.mp4' 저장이 시작되었습니다!`, 'success');
              } else {
                fallbackDirectYoutubeDownload(canonicalUrl, cleanTitle, postId, null, toastId);
              }
            });
          } else {
            fallbackDirectYoutubeDownload(canonicalUrl, cleanTitle, postId, null, toastId);
          }
        });
    }

    let channelSubscribers = 0;

    function detectChannelSubscribers() {
      if (channelSubscribers > 0) return channelSubscribers;
      
      const subEl = document.querySelector('#subscriber-count') || 
                    document.querySelector('#owner-sub-count') ||
                    document.querySelector('yt-formatted-string[id="subscriber-count"]');
      if (subEl) {
        const text = subEl.textContent.trim();
        channelSubscribers = parseSubscribers(text);
        console.log('[TAKOH YouTube] Detected channel subscribers:', channelSubscribers);
      }
      return channelSubscribers || 0;
    }

    function processShortsGrid() {
      const cards = document.querySelectorAll('ytd-shorts-lockup-view-model');
      if (cards.length === 0) return;

      const subCount = detectChannelSubscribers();

      cards.forEach(card => {
        if (card.hasAttribute('data-takoh-processed')) return;
        card.setAttribute('data-takoh-processed', 'true');

        const thumbnailArea = card.querySelector('#thumbnail') || 
                              card.querySelector('.yt-shorts-lockup-view-model-html5-thumbnail') ||
                              card.firstElementChild;
        if (!thumbnailArea) return;

        const metaSpan = Array.from(card.getElementsByTagName('*')).find(el => {
          const t = el.textContent || "";
          return (t.includes('조회수') || t.includes('views')) && !t.includes('\n');
        });
        if (!metaSpan) return;

        const viewText = metaSpan.textContent.trim();
        const viewCount = parseSubscribers(viewText);
        
        let badgeHtml = "";
        let badgeBg = "";
        
        if (subCount > 0) {
          const ratio = viewCount / subCount;
          if (ratio >= 1.0) {
            badgeHtml = `👑 ${(ratio).toFixed(1)}x`;
            badgeBg = 'linear-gradient(135deg, #f59e0b, #d97706)';
          } else if (ratio >= 0.5) {
            badgeHtml = `🔥 ${(ratio).toFixed(1)}x`;
            badgeBg = 'linear-gradient(135deg, #ef4444, #b91c1c)';
          } else {
            badgeHtml = `❌ ${(ratio).toFixed(1)}x`;
            badgeBg = 'rgba(0, 0, 0, 0.7)';
          }
        } else {
          if (viewCount >= 500000) {
            badgeHtml = `👑 ${(viewCount/10000).toFixed(0)}만`;
            badgeBg = 'linear-gradient(135deg, #f59e0b, #d97706)';
          } else if (viewCount >= 100000) {
            badgeHtml = `🔥 ${(viewCount/10000).toFixed(0)}만`;
            badgeBg = 'linear-gradient(135deg, #ef4444, #b91c1c)';
          } else {
            badgeHtml = `❌ ${(viewCount/10000).toFixed(1)}만`;
            badgeBg = 'rgba(0, 0, 0, 0.7)';
          }
        }

        const gridBadge = document.createElement('span');
        gridBadge.className = 'takoh-grid-viral-badge';
        gridBadge.style.cssText = `display: inline-block; margin-left: 6px; background: ${badgeBg}; color: #fff; padding: 1px 5px; font-size: 9px; font-weight: 800; border-radius: 4px; vertical-align: middle; line-height: 1.2; box-shadow: 0 1px 3px rgba(0,0,0,0.3);`;
        gridBadge.innerHTML = badgeHtml;

        metaSpan.after(gridBadge);
      });
    }

    // Monitor via interval loop & YouTube SPA navigation events
    setInterval(checkYoutubePage, 800);
    window.addEventListener('yt-navigate-finish', checkYoutubePage);
    window.addEventListener('popstate', checkYoutubePage);
    window.addEventListener('hashchange', checkYoutubePage);
  }

  // Safely initialize when core is ready
  if (window.TAKCore) {
    initModule();
  } else {
    document.addEventListener('TAKCoreInitialized', initModule);
  }
})();
