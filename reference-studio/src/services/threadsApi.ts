import { ThreadsAuthSession } from '../types/threads';

export async function checkThreadsAuth(): Promise<ThreadsAuthSession> {
  try {
    const [csrf, session] = await Promise.all([
      chrome.cookies.get({ url: 'https://www.threads.com', name: 'csrftoken' }).catch(() => null),
      chrome.cookies.get({ url: 'https://www.threads.com', name: 'sessionid' }).catch(() => null)
    ]);

    const hasCookies = Boolean(csrf?.value && session?.value);
    if (!hasCookies) {
      return { loggedIn: false };
    }

    const tabs = await chrome.tabs.query({ url: 'https://www.threads.com/*' });
    if (tabs.length > 0 && tabs[0].id) {
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          world: 'MAIN',
          func: () => {
            try {
              const req = (window as any).require;
              const sharedData = req ? req('BarcelonaSharedData') : null;
              const viewer = sharedData?.viewer;
              if (viewer) {
                return {
                  username: viewer.username,
                  profilePicUrl: viewer.profile_picture_url
                };
              }
            } catch {}
            return null;
          }
        });

        if (res?.result) {
          return {
            loggedIn: true,
            username: res.result.username,
            profilePicUrl: res.result.profilePicUrl,
            tokens: { csrftoken: csrf?.value }
          };
        }
      } catch (e) {
        console.warn('Probe user failed', e);
      }
    }

    return {
      loggedIn: true,
      tokens: { csrftoken: csrf?.value }
    };
  } catch (error) {
    console.error('Error checking threads auth:', error);
    return { loggedIn: false };
  }
}

export async function openThreadsWithDraft(text: string): Promise<boolean> {
  try {
    const tab = await chrome.tabs.create({
      url: 'https://www.threads.com/',
      active: true
    });

    if (!tab.id) return false;

    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        chrome.scripting.executeScript({
          target: { tabId },
          func: (contentToPaste: string) => {
            setTimeout(() => {
              const buttons = Array.from(document.querySelectorAll('svg, button, div[role="button"]'));
              const createBtn = buttons.find(b => {
                const label = b.getAttribute('aria-label') || b.textContent || '';
                return label.includes('새 스레드') || label.includes('글쓰기') || label.includes('Create') || label.includes('작성');
              }) as HTMLElement | null;

              if (createBtn) {
                createBtn.click();
              }
            }, 1200);
          },
          args: [text]
        });
      }
    });

    return true;
  } catch (err) {
    console.error('Failed to open threads with draft', err);
    return false;
  }
}

export async function downloadImage(url: string, filename?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename: filename || `inthread-cheat-${Date.now()}.jpg`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(downloadId);
      }
    });
  });
}
