/* TAKOH Media Downloader PRO - Xiaohongshu Main World Bridge */

(() => {
  let lastNoteId = null;

  const getNoteId = () => {
    const m = location.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z_]+)/i);
    if (m) return m[1];
    const map = window.__INITIAL_STATE__?.note?.noteDetailMap;
    if (map) {
      const keys = Object.keys(map);
      if (keys.length > 0) return keys[keys.length - 1];
    }
    return null;
  };

  const notifyState = (data) => {
    window.postMessage({ source: 'takoh-downloader-main-world', type: 'XHS_NOTE_DATA', data: data }, '*');
  };

  const tryExtractState = () => {
    const noteId = getNoteId();
    if (!noteId) return false;

    const noteDetailMap = window.__INITIAL_STATE__?.note?.noteDetailMap;
    const note = noteDetailMap?.[noteId]?.note || (noteDetailMap ? Object.values(noteDetailMap)[0]?.note : null);
    if (!note || Object.keys(note).length === 0) return false;

    const title = note.title || note.desc || '';

    if (note.type === 'video' && note.video?.media?.stream) {
      const stream = note.video.media.stream;
      const rawStreams = [...(stream.h264 ?? []), ...(stream.h265 ?? []), ...(stream.av1 ?? [])];
      const isClean = s => typeof s?.streamDesc === 'string' && !s.streamDesc.startsWith('WM_');
      const cleanStream = rawStreams.find(isClean) ?? rawStreams[0];
      if (cleanStream) {
        const masterUrl = cleanStream.masterUrl || (cleanStream.backupUrls && cleanStream.backupUrls[0]);
        if (masterUrl) {
          notifyState({ noteId, type: 'video', title, videoUrl: masterUrl });
          lastNoteId = noteId;
          return true;
        }
      }
    }

    if (Array.isArray(note.imageList) && note.imageList.length > 0) {
      const imageUrls = note.imageList
        .map(img => img.urlDefault || img.url || img.urlPre || img.original)
        .filter(url => typeof url === 'string' && url.length > 0);
      if (imageUrls.length > 0) {
        notifyState({ noteId, type: 'image', title, imageUrls });
        lastNoteId = noteId;
        return true;
      }
    }

    return false;
  };

  tryExtractState();

  setInterval(() => {
    const currentId = getNoteId();
    if (currentId !== lastNoteId || !lastNoteId) {
      tryExtractState();
    }
  }, 800);
})();
