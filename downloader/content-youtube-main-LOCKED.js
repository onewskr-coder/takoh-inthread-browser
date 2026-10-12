/* TAKOH Media Downloader PRO - YouTube Main World Bridge Script */
(() => {
  function extractJson(text, key) {
    const idx = text.indexOf(key);
    if (idx < 0) return null;
    const braceStart = text.indexOf('{', idx);
    if (braceStart < 0) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = braceStart; i < text.length; i++) {
      const chr = text[i];
      if (chr === '\\' && !escape) {
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

  function getYoutubePlayerResponse() {
    try {
      if (window.ytInitialPlayerResponse) {
        return window.ytInitialPlayerResponse;
      }
      if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.player_response) {
        return JSON.parse(window.ytplayer.config.args.player_response);
      }
      if (window.ytcfg && window.ytcfg.data_ && window.ytcfg.data_.PLAYER_RESPONSE) {
        return window.ytcfg.data_.PLAYER_RESPONSE;
      }

      const scripts = Array.from(document.scripts);
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text) continue;
        if (text.includes('var ytInitialPlayerResponse =') || text.includes('ytInitialPlayerResponse =')) {
          const raw = extractJson(text, 'ytInitialPlayerResponse');
          if (raw) return JSON.parse(raw);
        }
      }
    } catch (e) {}
    return null;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'TAKOH_YT_GET_PLAYER_RESPONSE') {
      const playerResp = getYoutubePlayerResponse();
      window.postMessage({
        type: 'TAKOH_YT_PLAYER_RESPONSE_RESULT',
        requestId: event.data.requestId,
        data: playerResp
      }, '*');
    }
  });
})();
