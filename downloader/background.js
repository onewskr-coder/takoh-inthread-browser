importScripts('studio-upload.js');
/* TAKOH Media Downloader PRO - Background Service Worker */
importScripts('studio-extension.js');

// 크롬 툴바 아이콘 클릭 시 사이드바 패널이 열리도록 설정 (지원의 경우)
if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  } catch (e) {}
}

// ========== Auto-Inject Content Scripts into Open Tabs on Extension Update/Install ==========
// 사용자가 확장프로그램을 새로 설치하거나 새로고침(업데이트)할 때 Ctrl+F5 없이 기존 열린 탭에 최신 스크립트를 자동 주입
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[TAKOH BG] Extension installed/updated, setting default license and auto-injecting scripts...');
  
  // Set default isLicensed to false for free 3-limit mode if not set
  chrome.storage.local.get(['isLicensed'], (res) => {
    if (typeof res.isLicensed === 'undefined') {
      chrome.storage.local.set({ isLicensed: false });
    }
  });

  const manifest = chrome.runtime.getManifest();
  const contentScripts = manifest.content_scripts || [];

  for (const cs of contentScripts) {
    for (const matchPattern of cs.matches) {
      try {
        const tabs = await chrome.tabs.query({ url: matchPattern });
        for (const tab of tabs) {
          if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            continue;
          }

          // 1. CSS 자동 주입
          if (cs.css && cs.css.length > 0) {
            for (const cssFile of cs.css) {
              chrome.scripting.insertCSS({
                target: { tabId: tab.id, allFrames: cs.all_frames || false },
                files: [cssFile]
              }).catch(() => {});
            }
          }

          // 2. JS 컨텐츠 스크립트 순차 자동 주입
          if (cs.js && cs.js.length > 0) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id, allFrames: cs.all_frames || false },
              files: cs.js
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[TAKOH BG] Auto-injection failed for pattern:', matchPattern, err);
      }
    }
  }
});

// Setup DeclarativeNetRequest Referer headers for Douyin, Xiaohongshu, and TikTok
async function installRefererRules() {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Referer", operation: "set", value: "https://www.tiktok.com/" },
          { header: "Origin", operation: "set", value: "https://www.tiktok.com" },
          { header: "Sec-Fetch-Site", operation: "set", value: "same-site" },
          { header: "Sec-Fetch-Mode", operation: "set", value: "cors" },
          { header: "Sec-Fetch-Dest", operation: "set", value: "video" }
        ]
      },
      condition: {
        regexFilter: "^https?://[^/]*\\.tiktok(?:cdn|v)?\\.com/",
        resourceTypes: ["xmlhttprequest", "media", "other", "sub_frame", "main_frame", "image"]
      }
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Referer", operation: "set", value: "https://www.xiaohongshu.com/" }
        ]
      },
      condition: {
        regexFilter: "^https?://[^/]*(?:xhscdn|rednotecdn)\\.com/",
        resourceTypes: ["xmlhttprequest", "media", "other", "sub_frame", "main_frame"]
      }
    },
    {
      id: 3,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Referer", operation: "set", value: "https://www.douyin.com/" }
        ]
      },
      condition: {
        regexFilter: "^https?://[^/]*(?:douyinvod\\.com|zjcdn\\.com|bytecdn\\.cn|ixigua\\.com)/",
        resourceTypes: ["xmlhttprequest", "media", "other", "sub_frame", "main_frame"]
      }
    }
  ];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map(r => r.id),
      addRules: rules
    });
    console.log('[TAKOH BG] Referer rules installed for Douyin, Xiaohongshu, TikTok');
  } catch (e) {
    console.warn('[TAKOH BG] Failed to install Referer rules:', e);
  }
}

// Keep track of active downloads to send state updates back to content scripts
const activeDownloads = {};
const processingUrls = new Set();
installRefererRules();

// ========== Helper Server Auto-reconnect & Heartbeat Keep-Alive ==========
let helperStatus = 'unknown';

async function checkHelperServerHealth() {
  chrome.storage.local.get(['ytdlpApiUrl'], async (res) => {
    const apiEndpoint = res.ytdlpApiUrl || 'http://127.0.0.1:5005/download';
    let pingUrl = 'http://127.0.0.1:5005/ping';
    try {
      const parsed = new URL(apiEndpoint);
      pingUrl = `${parsed.protocol}//${parsed.host}/ping`;
    } catch (e) {}

    let isOnline = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(pingUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) {
          isOnline = true;
          break;
        }
      } catch (e) {
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
      }
    }

    const newStatus = isOnline ? 'online' : 'offline';
    if (helperStatus !== newStatus) {
      helperStatus = newStatus;
      console.log(`[TAKOH BG] Helper Server status changed to: ${newStatus}`);
      chrome.storage.local.set({
        helperStatus: newStatus,
        lastHelperPingTime: Date.now()
      });
    }
  });
}

// 10초 주기 하트비트 체크 (서비스 워커 활성화 시)
setInterval(checkHelperServerHealth, 10000);
checkHelperServerHealth();

// Alarms API를 활용하여 서비스 워커 타임아웃 방지 및 주기적 자동 재연결 핑
try {
  chrome.alarms.create('takoh_helper_heartbeat', { periodInMinutes: 0.25 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'takoh_helper_heartbeat') {
      checkHelperServerHealth();
    }
  });
} catch (e) {}

// ========== Media URL Capture via webRequest ==========
const capturedMediaUrls = {};

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const { url, tabId, type } = details;
    if (tabId < 0) return;

    let isMedia = false;

    // Type 'media' catches all media resource loads
    if (type === 'media') {
      isMedia = true;
    }

    // Also catch known XHR/other patterns
    if (!isMedia && (type === 'xmlhttprequest' || type === 'other' || type === 'script' || type === 'stylesheet')) {
      isMedia = url.includes('.mp4') || url.includes('.webm') || url.includes('douyinvod.com') ||
                url.includes('googlevideo.com') || url.includes('/videoplayback') ||
                url.includes('/video/') || url.includes('tiktokcdn') || 
                url.includes('byteoversea') || url.includes('ibyteimg') ||
                url.includes('rmcnmv') || url.includes('naver-rmc') || url.includes('vod.naver') ||
                url.includes('cdninstagram.com') || url.includes('fbcdn.net') ||
                (url.includes('coupangcdn.com') && url.includes('video')) ||
                url.includes('pinimg.com') || 
                (url.includes('twimg.com') && (url.includes('.mp4') || url.includes('tweet_video')));
      // Exclude m3u8 playlist files for twitter
      if (url.includes('twimg.com') && url.includes('.m3u8')) {
        isMedia = false;
      }
    }

    if (isMedia) {
      if (!capturedMediaUrls[tabId]) capturedMediaUrls[tabId] = [];
      capturedMediaUrls[tabId].push({
        url: url,
        type: type,
        timestamp: Date.now()
      });
      // Keep last 100 per tab
      if (capturedMediaUrls[tabId].length > 100) {
        capturedMediaUrls[tabId] = capturedMediaUrls[tabId].slice(-100);
      }
      console.log(`[TAKOH BG] Captured media URL (${type}):`, url.substring(0, 120));
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedMediaUrls[tabId];
});

// ========== declarativeNetRequest dynamic rules for safe Referer injection ==========
function setupDownloadHeadersRules() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    console.warn('[TAKOH DNR] declarativeNetRequest API is not available.');
    return;
  }
  const rules = [
    {
      id: 2,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.tiktok.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.tiktok.com' }
        ],
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://www.tiktok.com' },
          { header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' },
          { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, POST, OPTIONS' }
        ]
      },
      condition: {
        urlFilter: 'tiktokcdn.com',
        excludedInitiatorDomains: ['tiktok.com']
      }
    },
    {
      id: 3,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.tiktok.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.tiktok.com' }
        ],
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://www.tiktok.com' },
          { header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' },
          { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, POST, OPTIONS' }
        ]
      },
      condition: {
        urlFilter: 'byteoversea.com',
        excludedInitiatorDomains: ['tiktok.com']
      }
    },
    {
      id: 4,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.coupang.com/' }
        ]
      },
      condition: {
        urlFilter: 'coupangcdn.com',
        excludedInitiatorDomains: ['coupang.com']
      }
    },
    {
      id: 5,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.tiktok.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.tiktok.com' }
        ],
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://www.tiktok.com' },
          { header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' },
          { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, POST, OPTIONS' },
          { header: 'Access-Control-Allow-Headers', operation: 'set', value: '*' }
        ]
      },
      condition: {
        urlFilter: 'tiktokcdn-us.com',
        excludedInitiatorDomains: ['tiktok.com']
      }
    },
    {
      id: 6,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.tiktok.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.tiktok.com' }
        ],
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://www.tiktok.com' },
          { header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' },
          { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, POST, OPTIONS' },
          { header: 'Access-Control-Allow-Headers', operation: 'set', value: '*' }
        ]
      },
      condition: {
        urlFilter: 'tiktokv.com',
        excludedInitiatorDomains: ['tiktok.com']
      }
    },
    {
      id: 7,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.tiktok.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.tiktok.com' }
        ],
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://www.tiktok.com' },
          { header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' },
          { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, POST, OPTIONS' },
          { header: 'Access-Control-Allow-Headers', operation: 'set', value: '*' }
        ]
      },
      condition: {
        urlFilter: 'tiktokv.us',
        excludedInitiatorDomains: ['tiktok.com']
      }
    },
    {
      id: 8,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.instagram.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.instagram.com' }
        ]
      },
      condition: {
        urlFilter: 'cdninstagram.com',
        excludedInitiatorDomains: ['threads.net', 'threads.com', 'facebook.com']
      }
    },
    {
      id: 9,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.instagram.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.instagram.com' }
        ]
      },
      condition: {
        urlFilter: 'fbcdn.net',
        excludedInitiatorDomains: ['threads.net', 'threads.com', 'facebook.com']
      }
    },
    {
      id: 10,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.youtube.com/' },
          { header: 'Origin', operation: 'set', value: 'https://www.youtube.com' }
        ]
      },
      condition: {
        urlFilter: 'googlevideo.com',
        excludedInitiatorDomains: ['youtube.com']
      }
    },
    {
      id: 11,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://x.com/' },
          { header: 'Origin', operation: 'set', value: 'https://x.com' }
        ]
      },
      condition: {
        urlFilter: 'twimg.com',
        excludedInitiatorDomains: ['twitter.com', 'x.com']
      }
    },
    {
      id: 12,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.douyin.com/' }
        ]
      },
      condition: {
        urlFilter: 'douyinvod.com',
        excludedInitiatorDomains: ['douyin.com']
      }
    },
    {
      id: 13,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: 'https://www.xiaohongshu.com/' }
        ]
      },
      condition: {
        regexFilter: '^https?://[^/]*(?:xhscdn|rednotecdn)\\.com/',
        excludedInitiatorDomains: ['xiaohongshu.com', 'rednote.com']
      }
    }
  ];

  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    addRules: rules
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('[TAKOH DNR] Failed to set rules:', chrome.runtime.lastError.message);
    } else {
      console.log('[TAKOH DNR] Session Referer rules configured safely.');
    }
  });
}

// Set up rules on startup/installed
if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
  setupDownloadHeadersRules();
}

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([
    'history', 
    'statImages', 
    'statVideos', 
    'statTotal', 
    'enableImages', 
    'enableVideos', 
    'confirmDownload'
  ], (result) => {
    const defaults = {};
    if (result.history === undefined) defaults.history = [];
    if (result.statImages === undefined) defaults.statImages = 0;
    if (result.statVideos === undefined) defaults.statVideos = 0;
    if (result.statTotal === undefined) defaults.statTotal = 0;
    if (result.enableImages === undefined) defaults.enableImages = true;
    if (result.enableVideos === undefined) defaults.enableVideos = true;
    if (result.confirmDownload === undefined) defaults.confirmDownload = false;
    
    chrome.storage.local.set(defaults, () => {
      console.log('Threads Media Downloader initialized with default settings.');
    });
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
      setupDownloadHeadersRules();
    }
  });
});

// Handle incoming download requests from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Return captured media URLs for the requesting tab
  if (message.action === 'getMediaUrls') {
    const tabId = message.tabId !== undefined ? message.tabId : (sender.tab ? sender.tab.id : -1);
    let urls = capturedMediaUrls[tabId] || [];

    // Fallback: If no urls found for tabId, grab from any tab's recently captured list
    if (urls.length === 0) {
      const allTabs = Object.keys(capturedMediaUrls);
      if (allTabs.length > 0) {
        const lastTabId = allTabs[allTabs.length - 1];
        urls = capturedMediaUrls[lastTabId] || [];
      }
    }

    sendResponse({ urls });
    return true;
  }

  if (message.action === 'sync_fss_cookies_manual') {
    syncFssCookies().then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'verifyLicense') {
    const { url } = message;
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, valid: data.valid === true, status: data.status, serialKey: data.serialKey || '' });
      })
      .catch(err => {
        console.error('[Background License Verification Error]', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'pingYtdlpServer') {
    const { pingUrl } = message;
    fetch(pingUrl, { method: 'GET' })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('HTTP Status ' + res.status);
      })
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'download') {
    const { url, filename, username, postId, type, platform } = message;

    if (processingUrls.has(url)) {
      console.log('[TAKOH BG] Duplicate download request ignored for URL:', url.substring(0, 100));
      sendResponse({ success: false, error: '이미 다운로드가 진행 중입니다.' });
      return true;
    }

    processingUrls.add(url);
    // Auto release lock after 10 seconds to prevent permanent lockup on duplicate clicks
    setTimeout(() => {
      processingUrls.delete(url);
    }, 10000);

    // 로컬 스토리지에서 라이센스 상태, 라이센스 키, 일일 다운로드 카운트 및 옵션 획득
    const todayStr = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(['isLicensed', 'licenseKey', 'dailyDownloadDate', 'dailyDownloadCount', 'confirmDownload', 'platformFolderEnabled', 'rootFolderName'], (res) => {
      const hasValidKey = !!(res.licenseKey && res.licenseKey.trim().length > 0);
      const isLicensed = res.isLicensed === true && hasValidKey;

      // 라이센스 키가 없는데 isLicensed가 true로 남아있는 경우 즉시 false로 교정
      if (!hasValidKey && res.isLicensed) {
        chrome.storage.local.set({ isLicensed: false });
      }

      const lastDate = res.dailyDownloadDate || '';
      let currentCount = (lastDate === todayStr) ? (res.dailyDownloadCount || 0) : 0;

      // 미인증 유저 3회 제한 체크
      if (!isLicensed && currentCount >= 3) {
        processingUrls.delete(url);
        sendResponse({ success: false, error: 'DAILY_LIMIT_EXCEEDED', count: currentCount });
        return;
      }
      
      const askFolder = res.confirmDownload === true;
      const isPlatformFolderEnabled = res.platformFolderEnabled !== false;
      const rootFolder = (res.rootFolderName || 'TAKOH').trim().replace(/[\\/:*?"<>|]/g, '') || 'TAKOH';

      // 플랫폼별 폴더명 매핑
      function getPlatformFolderName(p) {
        if (!p) return 'General';
        const lower = p.toLowerCase();
        if (lower === 'threads') return 'Threads';
        if (lower === 'instagram') return 'Instagram';
        if (lower === 'facebook') return 'Facebook';
        if (lower === 'tiktok') return 'TikTok';
        if (lower === 'douyin') return 'Douyin';
        if (lower === 'xiaohongshu' || lower === 'xhs') return 'Xiaohongshu';
        if (lower === 'naverclip' || lower === 'naver') return 'NaverClip';
        if (lower === 'coupang') return 'Coupang';
        if (lower === 'youtube') return 'YouTube';
        if (lower === 'twitter' || lower === 'x') return 'Twitter';
        if (lower === 'pinterest') return 'Pinterest';
        if (lower === 'reddit') return 'Reddit';
        return p.charAt(0).toUpperCase() + p.slice(1);
      }

      let cleanName = (filename || 'download').trim()
        .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
        .replace(/\s+/g, ' ');

      if (!cleanName || cleanName.length < 2) {
        cleanName = `media_${Date.now()}`;
      }
      // Stripping trailing dot if present
      cleanName = cleanName.replace(/\.+$/, '');

      if (type === 'video' && !cleanName.toLowerCase().endsWith('.mp4')) {
        cleanName += '.mp4';
      } else if (type === 'audio' && !cleanName.toLowerCase().endsWith('.mp3')) {
        cleanName += '.mp3';
      } else if (type === 'image' && !cleanName.match(/\.(jpg|jpeg|png|webp|heic|gif)$/i)) {
        cleanName += '.jpg';
      }

      let savePath = cleanName;
      if (isPlatformFolderEnabled) {
        const platformSubDir = getPlatformFolderName(platform);
        savePath = `${rootFolder}/${platformSubDir}/${cleanName}`;
      }

      console.log('[TAKOH BG] Target download path:', savePath);

      // Direct download via Chrome download API
      chrome.downloads.download({
        url: url,
        filename: savePath,
        saveAs: askFolder // true일 경우 파일 탐색기 폴더선택/이름지정 대화상자가 팝업됨
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          processingUrls.delete(url);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        // 미인증 유저일 경우 성공적인 일일 다운로드 카운트 1 증가
        if (!isLicensed) {
          const newCount = currentCount + 1;
          chrome.storage.local.set({
            dailyDownloadDate: todayStr,
            dailyDownloadCount: newCount
          });
          console.log(`[TAKOH BG Free Mode] Daily download count updated: ${newCount}/3`);
        }

        const activeInfo = {
          downloadId,
          status: 'downloading',
          sourceUrl: platform==='threads'&&/^[\w.-]+$/.test(username||'')&&/^[\w-]+$/.test(postId||'')&&!['post','media'].includes(postId)
            ? `https://www.threads.com/@${username}/post/${postId}`
            : platform==='pinterest'&&/^\d+$/.test(postId||'')?`https://www.pinterest.com/pin/${postId}/`:sender.tab?.url || '',
          tabId: sender.tab ? sender.tab.id : -1,
          url: url,
          filename: filename,
          username: username || 'user',
          postId: postId || 'media',
          type: type || 'video',
          platform: platform || 'youtube',
          timestamp: Date.now()
        };

        // Persist active download state to storage to handle Service Worker lifecycle restarts
        chrome.storage.local.get(['activeDownloadsMap', 'downloadQueue'], (mapRes) => {
          const map = mapRes.activeDownloadsMap || {};
          map[downloadId] = activeInfo;

          let queue = mapRes.downloadQueue || [];
          queue = queue.filter(q => Date.now() - q.timestamp < 300000);
          queue.unshift({
            id: downloadId,
            filename: cleanName,
            platform: platform || 'douyin',
            type: type || 'video',
            status: 'downloading',
            timestamp: Date.now()
          });

          chrome.storage.local.set({ activeDownloadsMap: map, downloadQueue: queue });
        });

        // Instantly save to history log for immediate UI dashboard updates
        saveDownloadToHistory(activeInfo);

        sendResponse({ success: true, downloadId: downloadId });
      });
    });

    return true; // Keep message channel open for async sendResponse
  }

  // 다운로드 취소 요청
  if (message.action === 'cancelDownload') {
    const { downloadId } = message;
    if (downloadId !== undefined) {
      chrome.downloads.cancel(downloadId, () => {
        if (chrome.runtime.lastError) {
          console.warn('[TAKOH BG] Cancel failed:', chrome.runtime.lastError.message);
        } else {
          console.log('[TAKOH BG] Cancelled downloadId:', downloadId);
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
});

// 시스템 알림(Notification) 발생 헬퍼
function showSystemNotification(activeInfo) {
  if (!chrome.notifications) return;
  
  const platformName = (activeInfo.platform || 'media').toUpperCase();
  const fileType = activeInfo.type === 'video' ? '동영상' : '이미지';
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'TAKOH 다운로드 완료! 🎉',
    message: `[${platformName}] ${fileType} 저장이 완료되었습니다.\n파일명: ${activeInfo.filename}`,
    priority: 1
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.warn('[TAKOH Notification] Error:', chrome.runtime.lastError.message);
    }
  });
}

// Monitor download status changes
chrome.downloads.onChanged.addListener((delta) => {
  const downloadId = delta.id;

  chrome.storage.local.get(['activeDownloadsMap'], (res) => {
    const map = res.activeDownloadsMap || {};
    const activeInfo = map[downloadId];
    
    if (!activeInfo) return; // Not initiated by our extension

    // Case 1: Download completed successfully
    if (delta.state && delta.state.current === 'complete') {
      processingUrls.delete(activeInfo.url);

      if (activeInfo.tabId > 0) {
        chrome.tabs.sendMessage(activeInfo.tabId, {
          action: 'downloadStatus',
          downloadId: downloadId,
          status: 'complete'
        }).catch(() => {});
      }

      // Finalize history and system notification
      saveDownloadToHistory({...activeInfo, status: 'completed'});
      showSystemNotification(activeInfo);

      delete map[downloadId];
      chrome.storage.local.get(['downloadQueue'], (qRes) => {
        const queue = qRes.downloadQueue || [];
        const target = queue.find(q => q.id === downloadId);
        if (target) target.status = 'completed';
        chrome.storage.local.set({ activeDownloadsMap: map, downloadQueue: queue });
      });
    }
    
    // Case 2: Download failed or was interrupted
    else if (delta.state && delta.state.current === 'interrupted') {
      processingUrls.delete(activeInfo.url);

      const errorMsg = delta.error ? delta.error.current : '다운로드 중단됨';
      delete map[downloadId];
      chrome.storage.local.get(['downloadQueue'], (qRes) => {
        const queue = qRes.downloadQueue || [];
        const target = queue.find(q => q.id === downloadId);
        if (target) target.status = 'failed';
        chrome.storage.local.set({ activeDownloadsMap: map, downloadQueue: queue });
      });
      if (activeInfo.tabId > 0) {
        chrome.tabs.sendMessage(activeInfo.tabId, {
          action: 'downloadStatus',
          downloadId: downloadId,
          status: 'error',
          error: translateError(errorMsg)
        }).catch(() => {});
      }

      delete map[downloadId];
      chrome.storage.local.set({ activeDownloadsMap: map });
    }
  });
});

// Force correct filename extensions and prevent Chrome from auto-converting videos to .txt or .json
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  let targetName = item.filename;
  if (targetName.includes('download.txt') || targetName.endsWith('.txt')) {
    targetName = targetName.replace(/\.txt$/i, '.mp4');
  } else if (targetName.endsWith('.json')) {
    targetName = targetName.replace(/\.json$/i, '.mp4');
  }
  suggest({ filename: targetName, conflictAction: 'uniquify' });
  return true;
});

// Translate standard Chrome download error codes for localized Korean user feedback
function translateError(error) {
  const errors = {
    'NETWORK_FAILED': '네트워크 오류가 발생했습니다.',
    'NETWORK_TIMEOUT': '네트워크 연결이 만료되었습니다.',
    'NETWORK_DISCONNECTED': '네트워크 연결이 끊겼습니다.',
    'SERVER_FAILED': '서버 응답 오류가 발생했습니다.',
    'SERVER_BAD_CONTENT': '올바르지 않은 미디어 소스입니다.',
    'FILE_FAILED': '파일 저장에 실패했습니다.',
    'FILE_ACCESS_DENIED': '파일 액세스 권한이 없습니다.',
    'FILE_NO_SPACE': '디스크 공간이 부족합니다.',
    'FILE_NAME_TOO_LONG': '파일 이름이 너무 깁니다.',
    'FILE_TOO_LARGE': '파일 용량이 너무 깁니다.',
    'USER_CANCELED': '사용자가 다운로드를 취소했습니다.',
    'CRASH': '다운로드 서비스 오류가 발생했습니다.'
  };
  return errors[error] || `다운로드 실패 (사유: ${error})`;
}

// Log download detail to history & update counts in storage
function saveDownloadToHistory(info) {
  if (!info || !info.filename) return;

  chrome.storage.local.get(['history', 'statImages', 'statVideos', 'statTotal'], (result) => {
    let history = result.history || [];
    
    // De-duplicate: check if exact same item exists in last 5 seconds
    const existingIndex = history.findIndex(h => Number.isInteger(info.downloadId) ? h.downloadId === info.downloadId :
      h.filename === info.filename || (h.url === info.url && Math.abs((h.timestamp || 0) - info.timestamp) < 5000));

    const newEntry = {
      id: info.timestamp ? info.timestamp.toString() : Date.now().toString(),
      downloadId: info.downloadId,
      status: info.status || 'unknown',
      sourceUrl: info.sourceUrl || '',
      url: info.url,
      filename: info.filename,
      username: info.username || 'user',
      postId: info.postId || 'media',
      type: info.type || 'video',
      platform: info.platform || 'youtube',
      timestamp: info.timestamp || Date.now()
    };
    
    if (existingIndex >= 0) {
      history[existingIndex] = newEntry; // update existing
    } else {
      history.unshift(newEntry); // insert new at top
      if (history.length > 100) history.pop();

      let statImages = result.statImages || 0;
      let statVideos = result.statVideos || 0;
      
      if (info.type === 'video') statVideos++;
      else statImages++;

      chrome.storage.local.set({
        statImages: statImages,
        statVideos: statVideos,
        statTotal: statImages + statVideos
      });
    }

    chrome.storage.local.set({ history: history });
  });
}

// ========== FSSBLOG 서버 유튜브 쿠키 자동 동기화 ==========
async function syncFssCookies() {
  if (!chrome.cookies) return;
  try {
    const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
    if (!cookies || cookies.length === 0) return;

    let netscapeFormat = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# Generated by TAKOH Extension\n\n";
    for (const c of cookies) {
      const domain = c.domain.startsWith('.') ? c.domain : '.' + c.domain;
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = c.path || '/';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const expiration = c.expirationDate ? Math.round(c.expirationDate) : Math.round(Date.now() / 1000 + 86400 * 30);
      const name = c.name;
      const value = c.value;
      netscapeFormat += `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}\n`;
    }

    const formData = new FormData();
    formData.append('action', 'fss_sync_cookies');
    formData.append('secret', 'fss_yt_cookie_sync_sec_2026');
    formData.append('cookies', netscapeFormat);

    await fetch('https://fssblog.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      body: formData
    });
    console.log('[TAKOH] FSSBLOG YouTube cookies synchronized successfully.');
  } catch (err) {
    console.warn('[TAKOH] Cookie sync error:', err);
  }
}

// 유튜브 페이지를 방문할 때 세션 쿠키 자동 갱신
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
    syncFssCookies();
  }
});

