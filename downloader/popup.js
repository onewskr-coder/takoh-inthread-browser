/* Threads Media Downloader - Popup Dashboard Script */

// ★ 배포 시 아래 변수에 본인의 구글 앱스 스크립트 웹앱 URL을 붙여넣으세요.
// 예: "https://script.google.com/macros/s/AKfycb.../exec"
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWNX42T-DBN9aqKlaykcVYu04JWQ5RkHvsr3_jMd0hTvnkcvNX5xT1gZTpyMCs2EU5/exec";

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('open-studio')?.addEventListener('click', () => {
    chrome.tabs.create({url: 'http://127.0.0.1:5005/studio/#workspace=create'});
  });
  // Dynamic Manifest Version Display
  const versionBadge = document.getElementById('app-version-badge');
  if (versionBadge && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        versionBadge.textContent = `v${manifest.version}`;
      }
    } catch (e) {}
  }

  // DOM Elements
  const toggleImages = document.getElementById('toggle-images');
  const toggleVideos = document.getElementById('toggle-videos');
  const toggleConfirmDownload = document.getElementById('toggle-confirm-download');
  const selectVideoQuality = document.getElementById('select-video-quality');
  const statTotal = document.getElementById('stat-total');
  const statImages = document.getElementById('stat-images');
  const statVideos = document.getElementById('stat-videos');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const captureStatusArea = document.getElementById('capture-status-area');

  // SVG Icons
  const svgCamera = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  `;

  const svgVideo = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  `;

  const svgCopy = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const svgCheck = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const svgDownload = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // Relative time helper
  function getRelativeTime(timestamp) {
    if (!timestamp) return '방금 전';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  }


  const togglePlatformFolder = document.getElementById('toggle-platform-folder');
  const inputRootFolder = document.getElementById('input-root-folder');

  // Real-time Helper Server Connection Monitor
  function updateHelperConnectionUI() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const ytdlpDot = document.getElementById('ytdlp-status-dot');
    const ytdlpText = document.getElementById('ytdlp-status-text');

    chrome.storage.local.get(['helperStatus'], (res) => {
      const isOnline = res.helperStatus === 'online';
      
      if (statusDot && statusText) {
        if (isOnline) {
          statusDot.style.background = '#10b981';
          statusText.textContent = '도우미 연결됨';
          statusText.style.color = '#10b981';
        } else {
          statusDot.style.background = '#ef4444';
          statusText.textContent = '도우미 미연결 (start_helper.bat 실행 필요)';
          statusText.style.color = '#ef4444';
        }
      }

      if (ytdlpDot && ytdlpText) {
        if (isOnline) {
          ytdlpDot.style.background = '#10b981';
          ytdlpText.textContent = '🟢 연결 정상';
          ytdlpText.style.color = '#10b981';
        } else {
          ytdlpDot.style.background = '#ef4444';
          ytdlpText.textContent = '🔴 미연결';
          ytdlpText.style.color = '#ef4444';
        }
      }
    });
  }

  updateHelperConnectionUI();
  setInterval(updateHelperConnectionUI, 2000);

  // Load Settings & Stats & History
  function updateDashboard() {
    chrome.storage.local.get([
      'enableImages',
      'enableVideos',
      'confirmDownload',
      'platformFolderEnabled',
      'rootFolderName',
      'videoQuality',
      'statTotal',
      'statImages',
      'statVideos',
      'history'
    ], (result) => {
      // Toggle switches & Quality
      toggleImages.checked = result.enableImages !== false;
      toggleVideos.checked = result.enableVideos !== false;
      if (toggleConfirmDownload) {
        toggleConfirmDownload.checked = result.confirmDownload === true;
      }
      if (togglePlatformFolder) {
        togglePlatformFolder.checked = result.platformFolderEnabled !== false;
      }
      if (inputRootFolder) {
        inputRootFolder.value = result.rootFolderName || 'TAKOH';
      }
      if (selectVideoQuality) {
        selectVideoQuality.value = result.videoQuality || 'best';
      }

      // Stats counters
      const totalCount = result.statTotal || 0;
      statTotal.textContent = totalCount;
      statImages.textContent = result.statImages || 0;
      statVideos.textContent = result.statVideos || 0;

      // Render Platform Stats Chart
      try {
        const history = result.history || [];
        const platformChartBar = document.querySelector('.chart-progress-stacked');
        const platformLegendGrid = document.getElementById('chart-legend-grid');

        if (platformChartBar && platformLegendGrid) {
          platformChartBar.innerHTML = '';
          platformLegendGrid.innerHTML = '';

          // 플랫폼 종류별 카운트 세기
          const platformCounts = {
            threads: 0,
            instagram: 0,
            facebook: 0,
            tiktok: 0,
            douyin: 0,
            xiaohongshu: 0,
            naverclip: 0,
            coupang: 0,
            youtube: 0,
            twitter: 0,
            pinterest: 0
          };

          history.forEach(item => {
            const p = item.platform || 'threads';
            if (platformCounts[p] !== undefined) {
              platformCounts[p]++;
            } else {
              platformCounts.threads++;
            }
          });

          // 색상 정의
          const colors = {
            threads: '#a1a1aa',
            instagram: '#e1306c',
            facebook: '#1877f2',
            tiktok: '#ff0050',
            naverclip: '#03cf5d',
            coupang: '#e52521',
            youtube: '#ff0000',
            twitter: '#1d9bf0'
          };

          const totalHistory = history.length || 1;

          Object.keys(platformCounts).forEach(plat => {
            const count = platformCounts[plat];
            const pct = ((count / totalHistory) * 100).toFixed(1);

            if (count > 0 && totalCount > 0) {
              // stacked bar segment 추가
              const segment = document.createElement('div');
              segment.style.width = `${pct}%`;
              segment.style.backgroundColor = colors[plat];
              segment.style.height = '100%';
              segment.title = `${plat.toUpperCase()}: ${count}개 (${pct}%)`;
              platformChartBar.appendChild(segment);
            }

            // 범례 추가 (0개여도 전체 목록 표시하여 빈 공간 정렬)
            const legend = document.createElement('div');
            legend.style.cssText = 'display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            legend.innerHTML = `
              <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${colors[plat]}; display: inline-block; flex-shrink: 0;"></span>
              <span style="font-weight: bold; color: #ffffff; flex-shrink: 0;">${count}</span>
              <span style="color: var(--text-muted); font-size: 8px;">${plat === 'naverclip' ? '네이버' : plat.toUpperCase()}</span>
            `;
            platformLegendGrid.appendChild(legend);
          });
        }
      } catch (chartErr) {
        console.error('[Dashboard Chart Error] 차트 렌더링 실패:', chartErr);
      }

      // Update captured media list from background webRequest log
      updateCapturedMediaPanel();
    });
  }

  // Live storage change listener for instant history & license updates
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.history || changes.statTotal || changes.statImages || changes.statVideos) {
      updateDashboard();
    }
    if (changes.dailyDownloadCount || changes.isLicensed) {
      checkLicenseStatus();
    }
  });

  function updateCapturedMediaPanel() {
    // Helper to process active tab
    function processActiveTab(activeTab) {
      if (!captureStatusArea) return; // Safely return if capture panel was removed from UI
      if (!activeTab || !activeTab.id) {
        if (captureStatusArea) {
          captureStatusArea.innerHTML = `
            <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">
              활성화된 웹 탭을 찾을 수 없습니다.
            </div>
          `;
        }
        return;
      }
      const url = activeTab.url || '';
      const rawTitle = activeTab.title || '감지된 미디어';
      const cleanTitle = rawTitle.replace(/\s*-\s*YouTube/i, '')
                                .replace(/\s*\|\s*Instagram/i, '')
                                .replace(/\s*-\s*Threads/i, '')
                                .trim() || '미디어 동영상';

      // Check platform
      let platform = 'unknown';
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

      if (platform === 'unknown') {
        captureStatusArea.innerHTML = `
          <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">
            현재 사이트는 실시간 감지 대상이 아닙니다.
          </div>
        `;
        return;
      }

      // Extract Thumbnail for YouTube
      let posterThumb = '';
      if (platform === 'youtube') {
        let ytVideoId = '';
        try {
          if (url.includes('/shorts/')) {
            ytVideoId = url.split('/shorts/')[1]?.split('?')[0] || '';
          } else if (url.includes('v=')) {
            ytVideoId = new URL(url).searchParams.get('v') || '';
          }
        } catch(e) {}
        if (ytVideoId) {
          posterThumb = `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`;
        }
      }

      // Send message to active tab's Content Script for exact title and thumbnail parsing
      chrome.tabs.sendMessage(activeTab.id, { action: 'getPageMediaInfo' }, (pageInfo) => {
        const info = (!chrome.runtime.lastError && pageInfo) ? pageInfo : {};
        const displayTitle = info.title || cleanTitle;
        const displayThumb = info.thumbnail || posterThumb;
        const activePlatform = (info.platform && info.platform !== 'unknown') ? info.platform : platform;

        chrome.runtime.sendMessage({ action: 'getMediaUrls', tabId: activeTab.id }, (response) => {
          if (chrome.runtime.lastError || !response || !response.urls || response.urls.length === 0) {
            captureStatusArea.innerHTML = `
              <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">
                🔍 현재 페이지에서 미디어를 탐색하는 중...<br>(영상을 1~2초간 재생해 보세요)
              </div>
            `;
            return;
          }

          const captured = response.urls;
          captureStatusArea.innerHTML = ''; // Clear loading

          const container = document.createElement('div');
          container.style.cssText = 'display: flex; flex-direction: column; gap: 6px; width: 100%; max-height: 200px; overflow-y: auto;';

          const itemsToDisplay = [];

          if (activePlatform === 'youtube') {
            const hasVideo = captured.some(u => u.url.includes('/videoplayback') || u.url.includes('googlevideo.com'));
            const hasAudio = captured.some(u => u.url.includes('mime=audio'));
            if (hasVideo) {
              itemsToDisplay.push({
                label: 'YouTube 고화질 동영상',
                type: 'video',
                format: 'mp4',
                thumb: displayThumb,
                downloadUrl: activeTab.url
              });
            }
            if (hasAudio) {
              itemsToDisplay.push({
                label: 'YouTube 오디오 음원',
                type: 'audio',
                format: 'mp3',
                thumb: displayThumb,
                downloadUrl: activeTab.url
              });
            }
          } else {
            const mediaUrls = Array.from(new Set(captured.map(i => i.url))).filter(u => 
              u.includes('.mp4') || u.includes('.webm') || u.includes('/video/') || u.includes('cdninstagram') || u.includes('fbcdn') || u.includes('twimg.com')
            );

            mediaUrls.slice(-3).forEach((mUrl, idx) => {
              itemsToDisplay.push({
                label: `${activePlatform.toUpperCase()} 동영상 #${idx + 1}`,
                type: 'video',
                format: 'mp4',
                thumb: displayThumb,
                downloadUrl: mUrl
              });
            });
          }

          if (itemsToDisplay.length === 0) {
            captureStatusArea.innerHTML = `
              <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">
                🔍 현재 페이지에서 미디어를 탐색하는 중...<br>(영상을 1~2초간 재생해 보세요)
              </div>
            `;
            return;
          }

          itemsToDisplay.forEach((item) => {
            const card = document.createElement('div');
            card.style.cssText = 'display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.06); padding: 6px 10px; border-radius: 6px; border-left: 3px solid #10b981; border: 1px solid rgba(255,255,255,0.08);';

            const thumbHtml = item.thumb ? 
              `<img src="${item.thumb}" style="width: 44px; height: 33px; object-fit: cover; border-radius: 4px; flex-shrink: 0; background: #000;" onerror="this.style.display='none'" />` : 
              `<div style="width: 32px; height: 32px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">🎬</div>`;

            const safeFileName = `${displayTitle.replace(/[^a-zA-Z0-9가-힣_ -]/g, '')}.${item.format}`;

            card.innerHTML = `
              ${thumbHtml}
              <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; flex: 1; margin-right: 4px;">
                <span style="font-size: 11px; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${displayTitle}">${displayTitle}</span>
                <span style="font-size: 9px; color: var(--text-muted);">${activePlatform.toUpperCase()} • ${item.label}</span>
              </div>
              <button class="btn-primary-sm" style="padding: 4px 10px; font-size: 10px; font-weight: 700; border-radius: 4px; flex-shrink: 0; background: #10b981; color: #000; border: none; cursor: pointer;">다운로드</button>
            `;

            const dlBtn = card.querySelector('button');
            dlBtn.addEventListener('click', () => {
              chrome.runtime.sendMessage({
                action: 'download',
                url: item.downloadUrl,
                filename: safeFileName,
                username: activePlatform,
                postId: 'media',
                type: item.type,
                platform: activePlatform
              }, (dlResponse) => {
                if (dlResponse && dlResponse.success) {
                  dlBtn.textContent = '시작됨';
                  dlBtn.style.backgroundColor = '#047857';
                  dlBtn.style.color = '#fff';
                  dlBtn.disabled = true;
                } else {
                  alert('다운로드 오류: ' + ((dlResponse && dlResponse.error) || '요청 실패'));
                }
              });
            });

            container.appendChild(card);
          });

          captureStatusArea.appendChild(container);
        });
      });
    };

    // Query active tab with fallback for side panel context
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        processActiveTab(tabs[0]);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
          if (fallbackTabs && fallbackTabs.length > 0) {
            processActiveTab(fallbackTabs[0]);
          }
        });
      }
    });
  }

  // Initial call and periodic polling interval (2 seconds) to keep captured list alive & updating
  updateDashboard();
  setInterval(updateCapturedMediaPanel, 2000);


  // Bind settings toggles
  toggleImages.addEventListener('change', () => {
    chrome.storage.local.set({ enableImages: toggleImages.checked });
  });

  toggleVideos.addEventListener('change', (e) => {
    chrome.storage.local.set({ enableVideos: e.target.checked });
  });

  if (toggleConfirmDownload) {
    toggleConfirmDownload.addEventListener('change', (e) => {
      chrome.storage.local.set({ confirmDownload: e.target.checked });
    });
  }

  if (togglePlatformFolder) {
    togglePlatformFolder.addEventListener('change', (e) => {
      chrome.storage.local.set({ platformFolderEnabled: e.target.checked });
    });
  }

  if (inputRootFolder) {
    inputRootFolder.addEventListener('input', (e) => {
      const cleanVal = e.target.value.trim().replace(/[\\/:*?"<>|]/g, '');
      chrome.storage.local.set({ rootFolderName: cleanVal || 'TAKOH' });
    });
  }

  if (selectVideoQuality) {
    selectVideoQuality.addEventListener('change', (e) => {
      chrome.storage.local.set({ videoQuality: e.target.value });
    });
  }

  // ========== License Verification Logic ==========
  const licenseInactiveForm = document.getElementById('license-inactive-form');
  const licenseActiveStatus = document.getElementById('license-active-status');
  const inputLicenseKey = document.getElementById('input-license-key');
  const btnActivateLicense = document.getElementById('btn-activate-license');
  const btnDeactivateLicense = document.getElementById('btn-deactivate-license');
  const licenseHelp = document.getElementById('license-help');

  function checkLicenseStatus() {
    const todayStr = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(['licenseKey', 'isLicensed', 'issuedSerialKey', 'dailyDownloadDate', 'dailyDownloadCount'], (result) => {
      const freeBadge = document.getElementById('free-mode-badge');
      const freeCountText = document.getElementById('free-count-text');

      const hasValidKey = !!(result.licenseKey && result.licenseKey.trim().length > 0);
      const isLicensed = result.isLicensed === true && hasValidKey;

      if (!hasValidKey && result.isLicensed) {
        chrome.storage.local.set({ isLicensed: false });
      }

      if (isLicensed) {
        licenseInactiveForm.classList.add('hidden');
        licenseActiveStatus.classList.remove('hidden');

        if (freeBadge) freeBadge.style.display = 'none';

        let displayStr = result.licenseKey;
        if (result.issuedSerialKey) {
          displayStr = `${result.licenseKey} (발행 키: ${result.issuedSerialKey})`;
        }
        licenseHelp.textContent = `등록 완료: ${displayStr}`;
      } else {
        licenseInactiveForm.classList.remove('hidden');
        licenseActiveStatus.classList.add('hidden');

        if (freeBadge) freeBadge.style.display = 'block';
        const lastDate = result.dailyDownloadDate || '';
        const currentCount = (lastDate === todayStr) ? (result.dailyDownloadCount || 0) : 0;
        if (freeCountText) freeCountText.textContent = `${currentCount} / 3회`;

        licenseHelp.textContent = '미인증 시 하루 3회 무료 / 구매 시 입력한 이메일, 휴대폰 번호(010-XXXX-XXXX) 또는 키를 입력해 주세요.';
      }
    });
  }

  // Get or Create Unique Device ID
  function getOrCreateDeviceId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['deviceId'], (result) => {
        if (result.deviceId) {
          resolve(result.deviceId);
        } else {
          const newId = 'DEV-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          chrome.storage.local.set({ deviceId: newId }, () => {
            resolve(newId);
          });
        }
      });
    });
  }

  // ========== Google Sheets Online License Verification & Auto Issue ==========
  // 라이센스 성능 최적화: 24시간 이내 캐시 검증 통과용 TTL
  const LICENSE_CACHE_TTL = 24 * 60 * 60 * 1000;

  async function validateLicenseOnline(key, forceVerify = false) {
    const deviceId = await getOrCreateDeviceId();
    const cleanKey = key.trim();

    // 1) 캐시 판정 (강제 확인이 아닐 때)
    if (!forceVerify) {
      const cached = await new Promise((res) => {
        chrome.storage.local.get(['isLicensed', 'licenseKey', 'lastVerified'], res);
      });
      if (cached.isLicensed && cached.licenseKey === cleanKey && cached.lastVerified) {
        if (Date.now() - cached.lastVerified < LICENSE_CACHE_TTL) {
          console.log('[License] 캐시된 라이센스가 유효합니다 (24시간 미만).');
          return { isValid: true, status: 'success', serialKey: cached.licenseKey };
        }
      }
    }

    return new Promise((resolve, reject) => {
      if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_SCRIPT_URL_HERE') {
        console.warn('[License] Google Script URL이 설정되지 않아 기본 검증을 사용합니다.');
        const isValid = cleanKey.length >= 4;
        resolve({ isValid: isValid, status: isValid ? 'success' : 'invalid_key', serialKey: 'THREADS-PRO-OFFLINE' });
        return;
      }

      const extensionId = chrome.runtime.id;
      const url = `${GOOGLE_SCRIPT_URL}?action=verify&key=${encodeURIComponent(cleanKey)}&deviceId=${encodeURIComponent(deviceId)}&extensionId=${encodeURIComponent(extensionId)}`;
      chrome.runtime.sendMessage({
        action: 'verifyLicense',
        url: url
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          console.warn('[License] 온라인 서버 검증 실패 또는 오프라인 모드: 기본 정품 등록으로 통과합니다.');
          const isMinValid = cleanKey.length >= 2;
          resolve({
            isValid: isMinValid,
            status: isMinValid ? 'success' : 'invalid_key',
            serialKey: 'PRO-OFFLINE-' + cleanKey
          });
          return;
        }
        if (response && response.success) {
          resolve({
            isValid: response.valid,
            status: response.status,
            serialKey: response.serialKey || ('PRO-' + cleanKey)
          });
        } else {
          resolve({
            isValid: true,
            status: 'success',
            serialKey: 'PRO-' + cleanKey
          });
        }
      });
    });
  }

  // 서버에 기기 해제 요청 전송
  async function deactivateLicenseOnline(key) {
    const deviceId = await getOrCreateDeviceId();
    const cleanKey = key.trim();

    return new Promise((resolve, reject) => {
      if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_SCRIPT_URL_HERE') {
        resolve({ success: true });
        return;
      }

      const extensionId = chrome.runtime.id;
      const url = `${GOOGLE_SCRIPT_URL}?action=deactivate&key=${encodeURIComponent(cleanKey)}&deviceId=${encodeURIComponent(deviceId)}&extensionId=${encodeURIComponent(extensionId)}`;
      chrome.runtime.sendMessage({
        action: 'verifyLicense', // verifyLicense 백그라운드 액션 재활용
        url: url
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          resolve({ success: true });
        } else {
          reject(new Error(response ? response.error : '서버 기기 해제 실패'));
        }
      });
    });
  }

  btnActivateLicense.addEventListener('click', async () => {
    const key = inputLicenseKey.value.trim();

    if (!key) {
      licenseHelp.textContent = '❌ 이메일, 휴대폰 번호 또는 라이센스 키를 입력해주세요.';
      licenseHelp.style.color = '#ef4444';
      return;
    }

    // Show loading state
    btnActivateLicense.disabled = true;
    btnActivateLicense.textContent = '확인 중...';
    licenseHelp.textContent = '🔍 구매 내역을 확인하고 라이센스를 발급하는 중입니다...';
    licenseHelp.style.color = '#3b82f6';

    try {
      // 신규 입력 활성화는 항상 강제 검증하도록 forceVerify=true 설정
      const { isValid, status, serialKey } = await validateLicenseOnline(key, true);

      if (isValid) {
        chrome.storage.local.set({
          licenseKey: key,
          issuedSerialKey: serialKey,
          isLicensed: true,
          lastVerified: Date.now() // 캐시 활성화 시점 저장
        }, () => {
          licenseHelp.style.color = '';
          inputLicenseKey.value = '';
          checkLicenseStatus();
        });
      } else {
        licenseHelp.textContent = '❌ 일치하는 구매 내역이 없습니다. 구매 시 등록한 이메일 또는 휴대폰 번호를 확인해주세요.';
        licenseHelp.style.color = '#ef4444';
      }
    } catch (err) {
      console.error('[License] 검증 오류:', err);
      licenseHelp.textContent = '⚠️ 네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.';
      licenseHelp.style.color = '#f59e0b';
    } finally {
      btnActivateLicense.disabled = false;
      btnActivateLicense.textContent = '활성화';
    }
  });

  btnDeactivateLicense.addEventListener('click', async () => {
    const ok = await showCustomConfirm('라이센스 등록을 해제하시겠습니까? 등록 해제 시 다운로드 기능이 비활성화되며, 기기 슬롯이 반환됩니다.');
    if (ok) {
      chrome.storage.local.get(['licenseKey'], async (result) => {
        const cachedKey = result.licenseKey || '';

        // 로컬 비우기 전 서버에 기기 해제 요청 전송
        try {
          if (cachedKey) {
            await deactivateLicenseOnline(cachedKey);
            console.log('[License] 서버 기기 해제 완료');
          }
        } catch (err) {
          console.warn('[License] 서버 기기 해제 요청 실패 (오프라인 상태일 수 있음):', err);
        }

        chrome.storage.local.set({
          licenseKey: '',
          issuedSerialKey: '',
          isLicensed: false,
          lastVerified: 0
        }, () => {
          licenseHelp.style.color = '';
          checkLicenseStatus();
        });
      });
    }
  });

  // Bind clear history action (Safely check if element exists)
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      const ok = await showCustomConfirm('모든 다운로드 기록과 통계를 초기화하시겠습니까?');
      if (ok) {
        chrome.storage.local.set({
          history: [],
          statTotal: 0,
          statImages: 0,
          statVideos: 0
        }, () => {
          updateDashboard();
        });
      }
    });
  }

  // YouTube API Endpoint management
  const inputYtdlpApi = document.getElementById('input-ytdlp-api');
  const btnSaveYtdlpApi = document.getElementById('btn-save-ytdlp-api');
  const btnTestYtdlpApi = document.getElementById('btn-test-ytdlp-api');

  function checkYtdlpServer(url) {
    const statusDot = document.getElementById('ytdlp-status-dot');
    const statusText = document.getElementById('ytdlp-status-text');
    if (!statusDot || !statusText) return;

    statusText.textContent = '확인 중...';
    statusText.style.color = '#888892';
    statusDot.style.backgroundColor = '#3b82f6';
    statusDot.style.boxShadow = '0 0 8px #3b82f6';

    let pingUrl = url;
    if (pingUrl.endsWith('/download')) {
      pingUrl = pingUrl.replace(/\/download$/, '/ping');
    } else if (pingUrl.endsWith('/download/')) {
      pingUrl = pingUrl.replace(/\/download\/$/, '/ping');
    } else if (!pingUrl.includes('/ping') && !pingUrl.includes('/download')) {
      pingUrl = pingUrl.endsWith('/') ? pingUrl + 'ping' : pingUrl + '/ping';
    }

    chrome.runtime.sendMessage({ action: 'pingYtdlpServer', pingUrl: pingUrl }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        console.warn('Local helper server ping failed:', chrome.runtime.lastError || (response && response.error));
        statusText.textContent = '연결 안 됨';
        statusText.style.color = '#ef4444';
        statusDot.style.backgroundColor = '#ef4444';
        statusDot.style.boxShadow = '0 0 8px #ef4444';
      } else {
        statusText.textContent = '연결됨';
        statusText.style.color = '#10b981';
        statusDot.style.backgroundColor = '#10b981';
        statusDot.style.boxShadow = '0 0 8px #10b981';
      }
    });
  }

  if (inputYtdlpApi && btnSaveYtdlpApi) {
    chrome.storage.local.get(['ytdlpApiUrl'], (result) => {
      const activeUrl = result.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
      inputYtdlpApi.value = activeUrl;
      checkYtdlpServer(activeUrl);
    });

    btnSaveYtdlpApi.addEventListener('click', () => {
      const val = inputYtdlpApi.value.trim();
      chrome.storage.local.set({ ytdlpApiUrl: val }, () => {
        // alert 대신 연결 확인을 바로 다시 실행하여 시각 피드백으로 안내
        checkYtdlpServer(val);
      });
    });

    if (btnTestYtdlpApi) {
      btnTestYtdlpApi.addEventListener('click', () => {
        checkYtdlpServer(inputYtdlpApi.value.trim());
      });
    }
  }



  // ========== Custom Confirm Modal Helper ==========
  function showCustomConfirm(message) {
    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnOk = document.getElementById('btn-modal-ok');
    const btnCancel = document.getElementById('btn-modal-cancel');

    if (!modal || !msgEl || !btnOk || !btnCancel) {
      // 돔이 누적되지 않았거나 오작동 시 fallback
      return Promise.resolve(confirm(message));
    }

    return new Promise((resolve) => {
      msgEl.textContent = message;
      modal.classList.remove('hidden');

      const cleanup = (value) => {
        modal.classList.add('hidden');
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
        resolve(value);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
    });
  }

  function updateDownloadQueueUI() {
    const queueList = document.getElementById('queue-list');
    const queueEmpty = document.getElementById('queue-empty');
    const queueBadge = document.getElementById('queue-count-badge');

    if (!queueList) return;

    chrome.storage.local.get(['downloadQueue'], (res) => {
      const queue = (res.downloadQueue || []).filter(q => Date.now() - q.timestamp < 300000);
      const activeCount = queue.filter(q => q.status === 'downloading').length;

      if (queueBadge) {
        queueBadge.textContent = `${activeCount}개 진행 중`;
        queueBadge.style.background = activeCount > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)';
        queueBadge.style.color = activeCount > 0 ? '#10b981' : 'var(--text-muted)';
      }

      if (queue.length === 0) {
        if (queueEmpty) queueEmpty.style.display = 'block';
        queueList.innerHTML = '';
        if (queueEmpty) queueList.appendChild(queueEmpty);
        return;
      }

      if (queueEmpty) queueEmpty.style.display = 'none';

      let html = '';
      queue.forEach(item => {
        let statusBadge = '⏳ 대기 중';
        let statusColor = '#f59e0b';
        if (item.status === 'downloading') {
          statusBadge = '🚀 다운로드 중...';
          statusColor = '#3b82f6';
        } else if (item.status === 'completed') {
          statusBadge = '✅ 완료';
          statusColor = '#10b981';
        } else if (item.status === 'failed') {
          statusBadge = '❌ 실패';
          statusColor = '#ef4444';
        }

        const safePlatform = (item.platform || 'Douyin').toUpperCase();

        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; font-size: 11px;">
            <div style="display: flex; flex-direction: column; overflow: hidden; max-width: 68%;">
              <span style="font-weight: 600; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.filename || '동영상'}</span>
              <span style="font-size: 9px; color: var(--text-muted);">${safePlatform}</span>
            </div>
            <span style="font-size: 10px; font-weight: bold; color: ${statusColor};">${statusBadge}</span>
          </div>
        `;
      });

      queueList.innerHTML = html;
    });
  }

  // Initial load & Periodic Queue Refresh
  updateDashboard();
  updateDownloadQueueUI();
  checkLicenseStatus();

  setInterval(updateDownloadQueueUI, 1000);
});
