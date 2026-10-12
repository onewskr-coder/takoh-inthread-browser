// InThread Cheat - Threads Interceptor (MAIN World)
(function () {
  'use strict';

  const SOURCE = 'inthread-cheat';

  function extractTokens() {
    const tokens: Record<string, string> = {};
    try {
      const req = (window as any).require;
      const dtsg = req && req('DTSGInitData') && req('DTSGInitData').token;
      if (dtsg) {
        tokens.fb_dtsg = dtsg;
        let sum = 0;
        for (let i = 0; i < dtsg.length; i++) sum += dtsg.charCodeAt(i);
        tokens.jazoest = '2' + sum;
      }
      const currentUser = req && req('CurrentUserInitialData') && req('CurrentUserInitialData').NON_FACEBOOK_USER_ID;
      if (currentUser) {
        tokens.av = String(currentUser);
      }
    } catch {}

    const lsdMatch = document.documentElement.innerHTML.match(/"LSD",\[\],\{"token":"([^"]+)"/);
    if (lsdMatch) tokens.lsd = lsdMatch[1];

    return tokens;
  }

  // Periodic token poll
  let tokenPollCount = 0;
  const tokenInterval = setInterval(() => {
    const tokens = extractTokens();
    if (tokens.fb_dtsg && tokens.lsd) {
      window.postMessage({ source: SOURCE, kind: 'tokens', tokens }, window.location.origin);
    }
    if (++tokenPollCount > 30 || (tokens.fb_dtsg && tokens.lsd)) {
      clearInterval(tokenInterval);
    }
  }, 1000);

  // Periodic viewer poll
  let viewerPollCount = 0;
  const viewerInterval = setInterval(() => {
    try {
      const req = (window as any).require;
      const viewer = req && req('BarcelonaSharedData') && req('BarcelonaSharedData').viewer;
      if (viewer && viewer.username) {
        window.postMessage(
          {
            source: SOURCE,
            kind: 'viewer',
            username: viewer.username,
            profilePicUrl: viewer.profile_picture_url,
          },
          '*'
        );
        clearInterval(viewerInterval);
      }
    } catch {}
    if (++viewerPollCount > 25) clearInterval(viewerInterval);
  }, 1000);

  // Intercept Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const response = await originalFetch.apply(this, [input, init]);
    try {
      const url = typeof input === 'string' ? input : (input as Request).url || '';
      if (url.includes('/graphql') || url.includes('/api/graphql')) {
        const clone = response.clone();
        clone.text().then(text => {
          if (text.includes('thread_items')) {
            try {
              const json = JSON.parse(text);
              window.postMessage({ source: SOURCE, kind: 'feed', json }, '*');
            } catch {}
          }
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any).__itcUrl = typeof url === 'string' ? url : url.toString();
    return (originalOpen as any).apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const url = (this as any).__itcUrl;
    if (url && (url.includes('/graphql') || url.includes('/api/graphql'))) {
      this.addEventListener('load', () => {
        try {
          if (this.responseText && this.responseText.includes('thread_items')) {
            const json = JSON.parse(this.responseText);
            window.postMessage({ source: SOURCE, kind: 'feed', json }, '*');
          }
        } catch {}
      });
    }
    return originalSend.apply(this, [body]);
  };

  console.log('[InThread Cheat] Main world interceptor initialized.');
})();
export {};
