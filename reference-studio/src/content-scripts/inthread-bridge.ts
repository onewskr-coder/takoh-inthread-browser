// InThread Cheat - Official Web Dashboard Bridge
(function () {
  'use strict';

  console.log('[InThread Cheat Bridge] Web dashboard bridge active');

  const notifyInstalled = () => {
    window.postMessage({
      type: 'INTHREAD_READY',
      installed: true,
      version: chrome.runtime.getManifest().version
    }, window.location.origin);
  };

  notifyInstalled();
  window.addEventListener('focus', notifyInstalled);

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || typeof event.data.type !== 'string') return;
    const { type, payload } = event.data;

    if (type === 'INTHREAD_PING') {
      window.postMessage({
        type: 'INTHREAD_PONG',
        installed: true,
        version: chrome.runtime.getManifest().version
      }, window.location.origin);
      return;
    }

    if (type === 'INTHREAD_GET_DATA') {
      try {
        const refs = await chrome.storage.local.get(['itc_references', 'itc_settings', 'itc_publish_queue']);
        window.postMessage({
          type: 'INTHREAD_GET_DATA_RESPONSE',
          references: refs.itc_references || [],
          settings: refs.itc_settings || {},
          queue: refs.itc_publish_queue || []
        }, window.location.origin);
      } catch (e: any) {
        window.postMessage({
          type: 'INTHREAD_GET_DATA_RESPONSE',
          error: e.message
        }, window.location.origin);
      }
      return;
    }

    if (type === 'INTHREAD_SAVE_SETTINGS') {
      try {
        const current = (await chrome.storage.local.get('itc_settings'))?.itc_settings || {};
        const updated = { ...current, ...payload };
        await chrome.storage.local.set({ itc_settings: updated });
        window.postMessage({
          type: 'INTHREAD_SAVE_SETTINGS_RESPONSE',
          success: true,
          settings: updated
        }, window.location.origin);
      } catch (e: any) {
        window.postMessage({
          type: 'INTHREAD_SAVE_SETTINGS_RESPONSE',
          success: false,
          error: e.message
        }, window.location.origin);
      }
      return;
    }

    if (type === 'INTHREAD_PUBLISH_NOW') {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'OPEN_THREADS_DRAFT',
          text: payload.text
        });
        window.postMessage({
          type: 'INTHREAD_PUBLISH_NOW_RESPONSE',
          ok: res?.ok
        }, window.location.origin);
      } catch (e: any) {
        window.postMessage({
          type: 'INTHREAD_PUBLISH_NOW_RESPONSE',
          ok: false,
          error: e.message
        }, window.location.origin);
      }
      return;
    }
  });
})();
export {};
