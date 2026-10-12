/* TAKOH Media Downloader PRO - Douyin (더우인) Module (TikTok Logic Ported) */

(() => {
  if (!window.TAKCore) return;
  const { config, showToast, triggerDownload } = window.TAKCore;

  // Cleanup orphaned buttons on SPA navigation
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

  // Extract metadata: username, video ID, title — ported from TikTok with Douyin adaptations
  function getContainerMetadata(container, videoEl) {
    let username = 'douyin_user';
    let postId = 'video';
    let videoUrl = window.location.href;
    let descText = '';
    let fiberPlayUrl = '';
    let rawAwemeId = '';

    // 0. URL에서 aweme ID 추출 (modal_id 또는 /video/ 경로)
    const urlMatch = window.location.search.match(/modal_id=([0-9]+)/) ||
                     window.location.pathname.match(/\/video\/([0-9]+)/);
    if (urlMatch) {
      rawAwemeId = urlMatch[1];
      postId = rawAwemeId;
    }

    // 0-1. Container의 data-aweme-id 속성에서 추출
    if (!rawAwemeId && container) {
      const awemeEl = container.closest('[data-aweme-id]');
      if (awemeEl && awemeEl.dataset.awemeId) {
        rawAwemeId = awemeEl.dataset.awemeId;
        postId = rawAwemeId;
      }
    }

    // 0-2. xgplayer wrapper ID에서 추출 (틱톡의 xgwrapper 패턴 — 더우인도 동일)
    if (!rawAwemeId && container) {
      const xgWrapper = container.querySelector('[id*="xgwrapper-"]') ||
                         container.closest('[id*="xgwrapper-"]');
      if (xgWrapper && xgWrapper.id) {
        const xgMatch = xgWrapper.id.match(/xgwrapper-\d+-(\d+)/);
        if (xgMatch) {
          rawAwemeId = xgMatch[1];
          postId = rawAwemeId;
        }
      }
    }

    // 0-3. Active feed video에서 추출
    if (!rawAwemeId) {
      const activeContainer = document.querySelector('[data-aweme-id][class*="active"], [data-e2e="feed-active-video"]');
      if (activeContainer && activeContainer.dataset.awemeId) {
        rawAwemeId = activeContainer.dataset.awemeId;
        postId = rawAwemeId;
      }
    }

    // 1. React Fiber에서 메타데이터 + 직접 MP4 URL 추출 (틱톡과 동일한 패턴)
    if (container || videoEl) {
      let curr = videoEl || container;
      for (let i = 0; i < 40 && curr; i++) {
        const fiberKey = Object.keys(curr).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
          let node = curr[fiberKey];
          for (let j = 0; j < 40 && node; j++) {
            const mp = node.memoizedProps;
            if (mp) {
              // 더우인은 aweme / item / videoData / playerProps 등 다양한 키 사용
              const item = mp.aweme || mp.item || mp.itemStruct || mp.videoData ||
                           (mp.playerProps ? mp.playerProps.aweme : null) ||
                           (mp.data ? mp.data : null);
              if (item && (item.video || item.aweme_id || item.id)) {
                // ID 추출
                const itemId = item.aweme_id || item.id;
                if (itemId) {
                  // rawAwemeId가 아직 없거나 일치하면 채택
                  if (!rawAwemeId || String(rawAwemeId) === String(itemId)) {
                    rawAwemeId = String(itemId);
                    postId = rawAwemeId;
                  }
                }

                // Author 추출
                const author = item.author || item.authorInfo;
                if (author) {
                  const uname = author.uniqueId || author.unique_id || author.nickname || author.sec_uid;
                  if (uname) username = uname;
                }

                // Description 추출
                if (item.desc && !descText) descText = item.desc;

                // Video URL 추출 (틱톡과 동일한 우선순위 체인)
                if (item.video) {
                  const v = item.video;
                  // downloadAddr > playAddr > play_addr_h264 > play_addr > bitrateInfo
                  const addrCandidates = [
                    v.downloadAddr,
                    v.playAddr,
                    v.play_addr_h264,
                    v.play_addr,
                    (v.bitrateInfo && v.bitrateInfo[0]) ? (v.bitrateInfo[0].PlayAddr || v.bitrateInfo[0].playAddr) : null
                  ];

                  for (const addr of addrCandidates) {
                    if (!addr) continue;

                    // addr가 직접 URL 문자열인 경우
                    if (typeof addr === 'string' && addr.startsWith('http') && !addr.includes('.json')) {
                      fiberPlayUrl = addr;
                      break;
                    }

                    // addr가 UrlList/urlList를 가진 객체인 경우
                    const urlList = addr.UrlList || addr.urlList || addr.url_list || [];
                    if (urlList.length > 0) {
                      const validUrl = urlList.find(u =>
                        u && typeof u === 'string' &&
                        u.startsWith('http') &&
                        !u.includes('.json') &&
                        !u.includes('.webp') &&
                        !u.includes('mime_type=audio') &&
                        !u.includes('ft=audio')
                      );
                      if (validUrl) {
                        fiberPlayUrl = validUrl;
                        break;
                      }
                    }
                  }
                }

                if (rawAwemeId) break;
              }
            }
            node = node.return;
          }
          if (rawAwemeId && rawAwemeId !== 'video') break;
        }
        curr = curr.parentElement;
      }
    }

    // 2. DOM에서 Description 추출 (폴백)
    if (!descText && container) {
      const descCandidates = [
        container.querySelector('[data-feed-ad-click-refer="title"]'),
        container.querySelector('[data-e2e="video-desc"]'),
        container.querySelector('.MbPBEgaP'),
        container.querySelector('.j5WZzJdp'),
        container.querySelector('h1'),
        document.querySelector('[data-e2e="video-desc"]')
      ];
      for (const el of descCandidates) {
        if (el && el.textContent.trim()) {
          descText = el.textContent.trim();
          break;
        }
      }
    }

    // 3. DOM에서 Author 추출 (폴백)
    if (username === 'douyin_user' && container) {
      const userCandidates = [
        container.querySelector('.YNWySbv3'),
        container.querySelector('[data-feed-ad-click-refer="name"]'),
        container.querySelector('[data-e2e="feed-author"]'),
        container.querySelector('a[href*="/user/"]'),
        document.querySelector('[data-e2e="feed-author"]')
      ];
      for (const el of userCandidates) {
        if (el && el.textContent.trim()) {
          username = el.textContent.trim().replace(/^@/, '').replace(/\s+/g, '_');
          break;
        }
      }
    }

    // 4. 파일명 정리
    let fileTitle = postId;
    if (descText) {
      const cleanDesc = descText
        .replace(/#[^\s#]+/g, '')
        .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 30);
      if (cleanDesc.length > 2) {
        fileTitle = rawAwemeId ? `${rawAwemeId}_${cleanDesc}` : cleanDesc;
      }
    }

    const safeUser = (username.replace(/[^a-zA-Z0-9가-힣_\u4e00-\u9fff-]/g, '') || 'douyin_user');
    const safeTitle = (fileTitle.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim() || 'video');
    const cleanFilename = `${safeUser}_${safeTitle}`;

    return {
      username: safeUser,
      postId: safeTitle,
      rawPostId: rawAwemeId || '',
      rawAwemeId: rawAwemeId || '',
      title: safeTitle,
      videoUrl: videoUrl,
      fiberPlayUrl: fiberPlayUrl,
      filename: cleanFilename.endsWith('.mp4') ? cleanFilename : `${cleanFilename}.mp4`
    };
  }

  // Global Fiber DOM Search: 전체 DOM에서 정확한 aweme ID의 동영상 URL 검색 (틱톡과 동일한 패턴)
  function findExactFiberPlayUrlByAwemeId(targetAwemeId) {
    if (!targetAwemeId) return null;

    const allElements = Array.from(document.querySelectorAll('*'));
    for (const el of allElements) {
      const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      if (fiberKey) {
        let node = el[fiberKey];
        for (let j = 0; j < 15 && node; j++) {
          const mp = node.memoizedProps;
          if (mp) {
            const item = mp.aweme || mp.item || mp.itemStruct || mp.videoData ||
                         (mp.playerProps ? mp.playerProps.aweme : null);
            const itemId = item ? (item.aweme_id || item.id) : null;
            if (item && String(itemId) === String(targetAwemeId) && item.video) {
              const v = item.video;
              const addrCandidates = [
                v.downloadAddr,
                v.playAddr,
                v.play_addr_h264,
                v.play_addr,
                (v.bitrateInfo && v.bitrateInfo[0]) ? (v.bitrateInfo[0].PlayAddr || v.bitrateInfo[0].playAddr) : null
              ];
              for (const addr of addrCandidates) {
                if (!addr) continue;
                if (typeof addr === 'string' && addr.startsWith('http') && !addr.includes('.json')) {
                  return addr;
                }
                const urlList = addr.UrlList || addr.urlList || addr.url_list || [];
                const validUrl = urlList.find(u =>
                  u && typeof u === 'string' &&
                  u.startsWith('http') &&
                  !u.includes('.json') &&
                  !u.includes('.webp') &&
                  !u.includes('mime_type=audio')
                );
                if (validUrl) return validUrl;
              }
            }
          }
          node = node.return;
        }
      }
    }
    return null;
  }

  // Blob 다운로드 (틱톡에서 가져온 핵심 로직)
  async function downloadVideoAsBlob(targetUrl, meta, toastId) {
    try {
      showToast(toastId, '다운로드 중 🚀', `${meta.username}님의 동영상을 다운로드합니다.`, 'info');

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
          'Referer': 'https://www.douyin.com/'
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

      const videoBlob = new Blob([blob], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(videoBlob);
      triggerDownload(blobUrl, 'video', meta, 'douyin');
      showToast(toastId, '다운로드 완료 🎉', `${meta.username}님의 동영상이 저장되었습니다.`, 'success');

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return true;
    } catch (err) {
      console.warn('[TAKOH Douyin Blob Fetch Failed]', err);
      return false;
    }
  }

  // 메인 다운로드 핸들러 (틱톡과 동일한 단계적 접근)
  async function handleDownloadClick(container, videoEl) {
    try {
      const toastId = Date.now().toString();

      // 1. 동영상 자동 재생 (틱톡과 동일)
      if (videoEl) {
        try {
          if (videoEl.paused) {
            videoEl.play().catch(() => {});
          }
        } catch (e) {}
      }

      showToast(toastId, '자동 미디어 추출 중 ⚡', '더우인 세션 인증 후 동영상이 바로 저장됩니다...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));

      const meta = getContainerMetadata(container, videoEl);
      let videoUrl = '';

      // Step 1: React Fiber에서 직접 추출된 MP4 URL (틱톡과 동일)
      if (meta && meta.fiberPlayUrl) {
        videoUrl = meta.fiberPlayUrl;
        console.log('[TAKOH Douyin] Step 1 - Fiber URL found:', videoUrl.substring(0, 80));
      }

      // Step 2: Global DOM Fiber Search (틱톡의 findExactFiberPlayUrlByPostId와 동일)
      if (!videoUrl && meta && meta.rawAwemeId) {
        videoUrl = findExactFiberPlayUrlByAwemeId(meta.rawAwemeId);
        if (videoUrl) console.log('[TAKOH Douyin] Step 2 - Global Fiber URL found:', videoUrl.substring(0, 80));
      }

      // Step 3: HTML5 video element src / currentSrc (틱톡과 동일)
      if (!videoUrl && videoEl) {
        try {
          // source 태그 우선 확인
          const sources = videoEl.querySelectorAll('source[src]');
          for (const s of sources) {
            if (s.src && s.src.startsWith('http') && !s.src.startsWith('blob:') &&
                !s.src.includes('.json') && !s.src.includes('mime_type=audio')) {
              videoUrl = s.src;
              break;
            }
          }

          if (!videoUrl) {
            const s1 = videoEl.src || '';
            const s2 = videoEl.currentSrc || '';
            if (s1 && !s1.startsWith('blob:') && s1.startsWith('http') && !s1.includes('.json')) {
              videoUrl = s1;
            } else if (s2 && !s2.startsWith('blob:') && s2.startsWith('http') && !s2.includes('.json')) {
              videoUrl = s2;
            }
          }

          if (videoUrl) console.log('[TAKOH Douyin] Step 3 - HTML5 src found:', videoUrl.substring(0, 80));
        } catch (e) {}
      }

      // Step 4: RENDER_DATA 스크립트에서 추출 (더우인 고유 — SSR 데이터)
      if (!videoUrl && meta.rawAwemeId) {
        try {
          const scriptTags = document.querySelectorAll('script#RENDER_DATA');
          for (const script of scriptTags) {
            if (!script.textContent) continue;
            const decoded = decodeURIComponent(script.textContent);
            // aweme_id로 해당 동영상 데이터 찾기
            if (decoded.includes(meta.rawAwemeId)) {
              // play_addr의 url_list에서 HTTP URL 추출
              const playAddrMatch = decoded.match(/"play_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\[([^\]]+)\]/);
              if (playAddrMatch) {
                const urlListStr = playAddrMatch[1];
                const urls = urlListStr.match(/https?:\/\/[^"'\s,]+/g);
                if (urls) {
                  const validUrl = urls.find(u =>
                    !u.includes('.json') && !u.includes('mime_type=audio') && !u.includes('.webp')
                  );
                  if (validUrl) {
                    videoUrl = validUrl.replace(/\\u002F/g, '/');
                    console.log('[TAKOH Douyin] Step 4 - RENDER_DATA URL found:', videoUrl.substring(0, 80));
                  }
                }
              }
            }
          }
        } catch (e) {}
      }

      // Step 5: __NEXT_DATA__ 또는 인라인 스크립트에서 추출
      if (!videoUrl && meta.rawAwemeId) {
        try {
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const text = script.textContent || '';
            if (text.length < 100 || !text.includes(meta.rawAwemeId)) continue;

            // play_addr 패턴 검색
            const patterns = [
              /"play_addr_h264"\s*:\s*\{[^}]*"url_list"\s*:\s*\[([^\]]+)\]/,
              /"playAddr"\s*:\s*"(https?:\/\/[^"]+)"/,
              /"downloadAddr"\s*:\s*"(https?:\/\/[^"]+)"/,
              /"play_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\[([^\]]+)\]/
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match) {
                if (match[1].startsWith('http')) {
                  videoUrl = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
                } else {
                  const urls = match[1].match(/https?:\/\/[^"'\s,\\]+/g);
                  if (urls) {
                    const validUrl = urls.find(u =>
                      !u.includes('.json') && !u.includes('mime_type=audio')
                    );
                    if (validUrl) videoUrl = validUrl.replace(/\\u002F/g, '/');
                  }
                }
                if (videoUrl) {
                  console.log('[TAKOH Douyin] Step 5 - Script data URL found:', videoUrl.substring(0, 80));
                  break;
                }
              }
            }
            if (videoUrl) break;
          }
        } catch (e) {}
      }

      // Step 6: Douyin API 호출 (이전 폴백 유지)
      if (!videoUrl && meta.rawAwemeId) {
        // V2 API
        try {
          const apiRes = await fetch(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${meta.rawAwemeId}`);
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData && apiData.item_list && apiData.item_list[0] && apiData.item_list[0].video) {
              const videoObj = apiData.item_list[0].video;
              const playAddr = videoObj.play_addr;
              if (playAddr && playAddr.url_list && playAddr.url_list.length > 0) {
                let rawUrl = playAddr.url_list[0];
                if (rawUrl) {
                  videoUrl = rawUrl.replace('playwm', 'play');
                  console.log('[TAKOH Douyin] Step 6a - V2 API URL found');
                }
              }
            }
          }
        } catch (err) {}

        // V1 Web Detail API
        if (!videoUrl) {
          try {
            const apiRes = await fetch(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${meta.rawAwemeId}`, {
              headers: { 'Accept': 'application/json' }
            });
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData && apiData.aweme_detail && apiData.aweme_detail.video) {
                const videoObj = apiData.aweme_detail.video;
                const addrCandidates = [
                  videoObj.play_addr_h264,
                  videoObj.playAddr,
                  videoObj.play_addr
                ];
                for (const addr of addrCandidates) {
                  if (!addr) continue;
                  const list = addr.urlList || addr.UrlList || addr.url_list || [];
                  const realUrl = list.find(u =>
                    u && u.startsWith('http') &&
                    !u.includes('.json') &&
                    !u.includes('mime_type=audio')
                  );
                  if (realUrl) {
                    videoUrl = realUrl;
                    console.log('[TAKOH Douyin] Step 6b - V1 API URL found');
                    break;
                  }
                }
              }
            }
          } catch (err) {}
        }
      }

      // Step 7: 네트워크 트래픽 캡처 URL (최후의 수단)
      if (!videoUrl && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          const capturedRes = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'getMediaUrls' }, resolve);
          });
          if (capturedRes && capturedRes.urls && capturedRes.urls.length > 0) {
            const awemeId = meta.rawAwemeId;
            let matchedMedia = null;
            if (awemeId) {
              matchedMedia = capturedRes.urls.slice().reverse().find(m =>
                m.url && m.url.includes(awemeId) &&
                !m.url.includes('.json') &&
                !m.url.includes('mime_type=audio')
              );
            }
            if (!matchedMedia) {
              matchedMedia = capturedRes.urls.slice().reverse().find(m => {
                if (!m.url) return false;
                const u = m.url.toLowerCase();
                if (u.includes('.json') || u.includes('/api/') || u.includes('/web/v1/') ||
                    u.includes('/log/') || u.includes('mime_type=audio')) return false;
                return u.startsWith('http') && (u.includes('douyinvod') || u.includes('bytevcloudcdn'));
              });
            }
            if (matchedMedia) {
              videoUrl = matchedMedia.url;
              console.log('[TAKOH Douyin] Step 7 - Captured URL found');
            }
          }
        } catch (err) {}
      }

      // === 다운로드 실행 ===
      if (videoUrl && !videoUrl.includes('.json') && !videoUrl.includes('.m3u8')) {
        console.log('[TAKOH Douyin] Downloading MP4:', meta.rawAwemeId, meta.filename);

        // 틱톡과 동일: 먼저 Blob fetch 시도 → 실패 시 직접 triggerDownload
        const blobSuccess = await downloadVideoAsBlob(videoUrl, meta, toastId);
        if (!blobSuccess) {
          // Blob 실패 시 직접 URL로 다운로드 (triggerDownload 내부에서 다시 Blob 시도)
          triggerDownload(videoUrl, 'video', meta, 'douyin');
          showToast(toastId, '다운로드 시작 🎉', `${meta.username}님의 동영상이 저장됩니다.`, 'success');
        }
        return;
      }

      // Helper Server 폴백 (모든 단계 실패 시)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['ytdlpApiUrl', 'videoQuality'], async (result) => {
          const apiEndpoint = result.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
          const quality = result.videoQuality || 'best';

          let targetUrl = meta.rawAwemeId
            ? `https://www.douyin.com/video/${meta.rawAwemeId}`
            : window.location.href;

          const helperUrl = `${apiEndpoint}?url=${encodeURIComponent(targetUrl)}&quality=${quality}&_t=${Date.now()}`;
          console.log('[TAKOH Douyin Helper Request]', helperUrl);

          try {
            const isSuccess = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                action: 'download',
                url: helperUrl,
                filename: meta.filename,
                username: meta.username,
                postId: meta.postId,
                type: 'video',
                platform: 'douyin'
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
              showToast(toastId, '다운로드 안내 💡', '동영상 원본 주소를 찾을 수 없습니다. 도우미 프로그램(start_helper.bat)이 켜져 있는지 확인해 주세요!', 'warning');
            }
          } catch (err) {
            showToast(toastId, '다운로드 실패 ⚠️', '동영상 원본 주소를 찾을 수 없습니다. 페이지를 새로고침(F5) 후 다시 시도해보세요.', 'warning');
          }
        });
      } else {
        showToast(toastId, '다운로드 실패 ⚠️', '동영상 원본 주소를 찾을 수 없습니다. 페이지를 새로고침(F5) 후 다시 시도해보세요.', 'warning');
      }
    } catch (err) {
      console.warn('[TAKOH Douyin handleDownloadClick]', err);
    }
  }

  // Find exact video player wrapper (더우인 고유 플레이어 클래스 + 틱톡 공통 패턴)
  function findTargetPlayerBox(v) {
    if (!v) return null;

    let parent = v.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const className = parent.className || '';
      const tagName = (parent.tagName || '').toLowerCase();
      const dataE2e = parent.getAttribute ? parent.getAttribute('data-e2e') : '';

      if (tagName === 'xg-video-container' ||
          className.includes('xg-video-container') ||
          className.includes('xgplayer-container') ||
          className.includes('xgplayer') ||
          className.includes('DivBasicPlayerWrapper') ||
          className.includes('DivContainer') ||
          className.includes('DivPlayerContainer') ||
          className.includes('douyin-player') ||
          className.includes('LivePlayer') ||
          className.includes('video-container') ||
          className.includes('player-container') ||
          dataE2e === 'feed-video' ||
          dataE2e === 'feed-active-video' ||
          dataE2e === 'explore-item') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return v.parentElement;
  }

  // Scanner: 더우인 동영상에 다운로드 버튼 부착 (틱톡 scanForVideos와 동일한 구조)
  function scanForVideos() {
    if (!config.enableVideos) return;

    cleanupOrphanedButtons();

    // Modal 상태 확인
    const isModalOpen = window.location.search.includes('modal_id=') ||
                        document.querySelector('[data-e2e="video-detail"]') ||
                        document.querySelector('.video-detail-container');

    // Modal이 열려있으면 그리드 카드의 버튼 숨기기
    if (isModalOpen) {
      document.querySelectorAll('.discover-video-card-item > .takoh-video-overlay-btn').forEach(btn => {
        btn.style.display = 'none';
      });
    } else {
      // 피드/검색 카드 스캔
      const cards = document.querySelectorAll('.discover-video-card-item, [data-e2e="user-post-item"]');
      cards.forEach(card => {
        if (!card.querySelector('video')) {
          attachDownloadButton(card);
        }
      });
    }

    // 활성 비디오 플레이어 스캔 (틱톡과 동일한 패턴)
    const videos = document.querySelectorAll('video');
    videos.forEach(v => {
      if (v.offsetWidth < 80 || v.offsetHeight < 80) return;

      const targetBox = findTargetPlayerBox(v);
      if (!targetBox) return;

      if (targetBox.dataset.takohButtonAttached || targetBox.querySelector('.takoh-video-overlay-btn')) return;

      attachDownloadButton(targetBox, v);
    });
  }

  function attachDownloadButton(targetBox, videoEl = null) {
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

    // 이벤트 전파 차단 (틱톡과 동일)
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evtType => {
      btn.addEventListener(evtType, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, { capture: true, passive: false });
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      await handleDownloadClick(targetBox, videoEl || targetBox.querySelector('video'));
    }, true);

    targetBox.appendChild(btn);
    window.TAKCore.anchorMediaControls?.(btn, videoEl || targetBox.querySelector('video') || targetBox);
  }

  // Register Douyin platform processor
  window.TAKPlatform = {
    name: 'douyin',
    process: scanForVideos
  };
})();
