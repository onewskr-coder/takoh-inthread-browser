import { checkThreadsAuth, openThreadsWithDraft, downloadImage } from '../services/threadsApi';
import { getQueue, addToQueue, updateQueueItem, removeFromQueue } from '../services/storage';
import { QueueItem } from '../types/threads';

console.log('[InThread Cheat] Service Worker initialized');

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[InThread Cheat] Extension installed/updated, reason:', details.reason);
  chrome.alarms.create('itc-queue-worker', { periodInMinutes: 1 });

  // Open onboarding page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'onboarding.html' });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'itc-queue-worker') {
    await processQueue();
  }
});

async function processQueue() {
  const queue = await getQueue();
  const now = Date.now();
  const pending = queue.filter(item => item.status === 'pending' && item.scheduledAt <= now);

  for (const item of pending) {
    await updateQueueItem(item.id, { status: 'publishing' });
    try {
      // Execute post
      const auth = await checkThreadsAuth();
      if (!auth.loggedIn) {
        await updateQueueItem(item.id, {
          status: 'failed',
          error: 'Threads 로그인이 필요합니다.'
        });
        continue;
      }

      // Open tab or inject posting
      await openThreadsWithDraft(item.text);
      await updateQueueItem(item.id, {
        status: 'published'
      });
    } catch (e: any) {
      await updateQueueItem(item.id, {
        status: 'failed',
        error: e?.message || '발행 중 오류 발생'
      });
    }
  }
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'THREADS_CHECK_AUTH') {
    checkThreadsAuth().then(sendResponse);
    return true;
  }

  if (message.type === 'OPEN_THREADS_DRAFT') {
    openThreadsWithDraft(message.text).then(ok => sendResponse({ ok }));
    return true;
  }

  if (message.type === 'DOWNLOAD_IMAGE') {
    downloadImage(message.url, message.filename)
      .then(id => sendResponse({ ok: true, id }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'OPEN_ONBOARDING') {
    chrome.tabs.create({ url: 'onboarding.html' });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'THREADS_ENQUEUE') {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      text: message.item.text,
      media: message.item.media,
      scheduledAt: message.item.scheduledAt || Date.now(),
      status: 'pending',
      createdAt: Date.now(),
      attempts: 0
    };
    addToQueue(item).then(() => sendResponse({ ok: true, item }));
    return true;
  }
});
