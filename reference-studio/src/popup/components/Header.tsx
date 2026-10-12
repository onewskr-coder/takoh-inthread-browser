import React from 'react';
import { ThreadsAuthSession } from '../../types/threads';

interface HeaderProps {
  auth: ThreadsAuthSession | null;
  activeTab: 'references' | 'composer' | 'queue' | 'settings';
  setActiveTab: (tab: 'references' | 'composer' | 'queue' | 'settings') => void;
  refCount: number;
}

export const Header: React.FC<HeaderProps> = ({ auth, activeTab, setActiveTab, refCount }) => {
  const handleOpenOnboarding = () => {
    chrome.tabs.create({ url: 'onboarding.html' });
  };

  return (
    <header className="border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur sticky top-0 z-20 px-4 pt-3.5 pb-2.5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-black shadow-md shadow-orange-500/20">
            ⚡
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
              인스레드 치트키 <span className="text-[10px] font-semibold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">by TAKOH</span>
            </h1>
            <p className="text-[11px] text-zinc-400 font-medium leading-none mt-0.5">
              레퍼런스 수집 · 원본 분석 · 상품 찾기
            </p>
          </div>
        </div>

        {/* Right Actions & Auth Badge */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenOnboarding}
            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center transition"
            title="온보딩 가이드 및 대시보드 열기"
          >
            💡
          </button>

          {auth?.loggedIn ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>@{auth.username || '연결됨'}</span>
            </div>
          ) : (
            <a
              href="https://www.threads.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
            >
              <span>로그인 필요</span>
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 bg-zinc-950/60 p-1 rounded-xl border border-zinc-800/60">
        <button
          type="button"
          onClick={() => setActiveTab('references')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'references'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          레퍼런스 {refCount > 0 && `(${refCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('composer')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'composer'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          치트 컴포저
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'queue'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          발행 큐
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`py-1.5 px-2.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'settings'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          설정
        </button>
      </nav>
    </header>
  );
};
