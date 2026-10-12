import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ReferenceList } from './components/ReferenceList';
import { CheatComposer } from './components/CheatComposer';
import { QueueList } from './components/QueueList';
import { SettingsTab } from './components/SettingsTab';
import { ThreadPostReference, QueueItem, AppSettings, ThreadsAuthSession } from '../types/threads';
import {
  getReferences,
  deleteReference,
  clearReferences,
  getQueue,
  removeFromQueue,
  getSettings,
  saveSettings,
  getActiveDraft,
  setActiveDraft
} from '../services/storage';
import { checkThreadsAuth } from '../services/threadsApi';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'references' | 'composer' | 'queue' | 'settings'>('references');
  const [auth, setAuth] = useState<ThreadsAuthSession | null>(null);
  const [references, setReferences] = useState<ThreadPostReference[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [settings, setAppSettings] = useState<AppSettings>({
    autoExtractShoppingLink: true,
    defaultScheduleDelayMinutes: 10,
    floatingButtonVisible: true
  });
  const [selectedRef, setSelectedRef] = useState<ThreadPostReference | null>(null);

  const loadData = async () => {
    const [authRes, refs, q, setts, draft] = await Promise.all([
      checkThreadsAuth(),
      getReferences(),
      getQueue(),
      getSettings(),
      getActiveDraft()
    ]);

    setAuth(authRes);
    setReferences(refs);
    setQueue(q);
    setAppSettings(setts);

    if (draft) {
      // If there was an active draft, switch to composer
      setSelectedRef({
        id: draft.sourceRefId || 'draft',
        code: '',
        username: '내 스레드',
        text: draft.text,
        imageUrls: (draft.media || []).map(m => m.url || m.dataUrl || ''),
        videoUrls: [],
        permalink: '',
        shoppingLinks: [],
        isShoppingFeed: false,
        createdAt: Date.now()
      });
      setActiveTab('composer');
      await setActiveDraft(null); // consume
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      getQueue().then(setQueue);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectForComposer = (ref: ThreadPostReference) => {
    setSelectedRef(ref);
    setActiveTab('composer');
  };

  const handleDeleteRef = async (id: string) => {
    await deleteReference(id);
    setReferences(references.filter(r => r.id !== id));
  };

  const handleClearRefs = async () => {
    if (confirm('수집된 모든 레퍼런스를 비우시겠습니까?')) {
      await clearReferences();
      setReferences([]);
    }
  };

  const handleRemoveQueue = async (id: string) => {
    await removeFromQueue(id);
    setQueue(queue.filter(q => q.id !== id));
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    const updated = await saveSettings(patch);
    setAppSettings(updated);
  };

  return (
    <div className="min-h-[560px] flex flex-col bg-zinc-950 text-zinc-100">
      <Header
        auth={auth}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        refCount={references.length}
      />

      <main className="flex-1">
        {activeTab === 'references' && (
          <ReferenceList
            references={references}
            onSelectForComposer={handleSelectForComposer}
            onDelete={handleDeleteRef}
            onClear={handleClearRefs}
          />
        )}

        {activeTab === 'composer' && (
          <CheatComposer
            initialRef={selectedRef}
            onPostSuccess={() => {
              getQueue().then(setQueue);
            }}
          />
        )}

        {activeTab === 'queue' && (
          <QueueList
            queue={queue}
            onRemove={handleRemoveQueue}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>
    </div>
  );
};
