import { ThreadPostReference, QueueItem, AppSettings, PublishRequest } from '../types/threads';

const KEYS = {
  REFERENCES: 'itc_references',
  QUEUE: 'itc_publish_queue',
  SETTINGS: 'itc_settings',
  ACTIVE_DRAFT: 'itc_active_draft',
  AUTH_CACHE: 'itc_auth_cache'
};

const DEFAULT_SETTINGS: AppSettings = {
  coupangSubId: '',
  autoExtractShoppingLink: true,
  defaultScheduleDelayMinutes: 10,
  floatingButtonVisible: true,
};

export async function getReferences(): Promise<ThreadPostReference[]> {
  const result = await chrome.storage.local.get(KEYS.REFERENCES);
  return result[KEYS.REFERENCES] || [];
}

export async function saveReference(ref: ThreadPostReference): Promise<void> {
  const list = await getReferences();
  const existingIdx = list.findIndex(item => item.id === ref.id || (item.code && item.code === ref.code));
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...ref };
  } else {
    list.unshift(ref);
  }
  // Max 100 references stored
  const trimmed = list.slice(0, 100);
  await chrome.storage.local.set({ [KEYS.REFERENCES]: trimmed });
}

export async function deleteReference(id: string): Promise<void> {
  const list = await getReferences();
  const filtered = list.filter(item => item.id !== id);
  await chrome.storage.local.set({ [KEYS.REFERENCES]: filtered });
}

export async function clearReferences(): Promise<void> {
  await chrome.storage.local.set({ [KEYS.REFERENCES]: [] });
}

export async function getQueue(): Promise<QueueItem[]> {
  const result = await chrome.storage.local.get(KEYS.QUEUE);
  return result[KEYS.QUEUE] || [];
}

export async function addToQueue(item: QueueItem): Promise<void> {
  const list = await getQueue();
  list.unshift(item);
  await chrome.storage.local.set({ [KEYS.QUEUE]: list });
}

export async function updateQueueItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  const list = await getQueue();
  const idx = list.findIndex(item => item.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    await chrome.storage.local.set({ [KEYS.QUEUE]: list });
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  const list = await getQueue();
  const filtered = list.filter(item => item.id !== id);
  await chrome.storage.local.set({ [KEYS.QUEUE]: filtered });
}

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [KEYS.SETTINGS]: updated });
  return updated;
}

export async function setActiveDraft(draft: PublishRequest | null): Promise<void> {
  await chrome.storage.local.set({ [KEYS.ACTIVE_DRAFT]: draft });
}

export async function getActiveDraft(): Promise<PublishRequest | null> {
  const result = await chrome.storage.local.get(KEYS.ACTIVE_DRAFT);
  return result[KEYS.ACTIVE_DRAFT] || null;
}
