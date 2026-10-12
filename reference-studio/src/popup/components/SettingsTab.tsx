import React, { useState } from 'react';
import { AppSettings } from '../../types/threads';
import { formatCoupangAffiliateLink } from '../../services/coupangApi';

interface SettingsTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onUpdateSettings }) => {
  const [subId, setSubId] = useState(settings.coupangSubId || '');
  const [testUrl, setTestUrl] = useState('');
  const [convertedUrl, setConvertedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSaveSubId = () => {
    onUpdateSettings({ coupangSubId: subId.trim() });
  };

  const handleConvertTest = () => {
    if (!testUrl.trim()) return;
    const res = formatCoupangAffiliateLink(testUrl.trim(), subId.trim());
    setConvertedUrl(res);
  };

  const handleCopyConverted = async () => {
    if (!convertedUrl) return;
    await navigator.clipboard.writeText(convertedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Coupang Sub ID */}
      <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div>
          <h4 className="text-xs font-bold text-zinc-200">쿠팡 파트너스 Sub ID 설정</h4>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            등록 시 레퍼런스 피드의 상품 링크에 Sub ID가 자동으로 추가됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={subId}
            onChange={e => setSubId(e.target.value)}
            placeholder="예: thread_shop_01"
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-orange-500 text-zinc-100 text-xs outline-none"
          />
          <button
            type="button"
            onClick={handleSaveSubId}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition"
          >
            저장
          </button>
        </div>
      </div>

      {/* Quick Link Converter Tool */}
      <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div>
          <h4 className="text-xs font-bold text-zinc-200">⚡ 쿠팡 링크 즉시 변환기</h4>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            쿠팡 상품 링크를 넣으면 내 Sub ID가 적용된 링크로 바로 변환합니다.
          </p>
        </div>
        <div className="space-y-2">
          <input
            type="url"
            value={testUrl}
            onChange={e => {
              setTestUrl(e.target.value);
              setConvertedUrl('');
            }}
            placeholder="https://www.coupang.com/vp/products/..."
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-orange-500 text-zinc-100 text-xs outline-none"
          />
          <button
            type="button"
            onClick={handleConvertTest}
            disabled={!testUrl.trim()}
            className="w-full py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold transition"
          >
            파트너스 링크로 변환
          </button>

          {convertedUrl && (
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-orange-500/30 space-y-2">
              <p className="text-[11px] text-zinc-300 break-all font-mono">
                {convertedUrl}
              </p>
              <button
                type="button"
                onClick={handleCopyConverted}
                className="w-full py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold"
              >
                {copied ? '✓ 복사되었습니다!' : '링크 복사하기'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Automation Preferences */}
      <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <h4 className="text-xs font-bold text-zinc-200">기능 스위치</h4>
        
        <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
          <span>스레드 피드 위 [⚡ 치트 버튼] 표시</span>
          <input
            type="checkbox"
            checked={settings.floatingButtonVisible}
            onChange={e => onUpdateSettings({ floatingButtonVisible: e.target.checked })}
            className="w-4 h-4 rounded accent-orange-500"
          />
        </label>

        <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
          <span>쇼핑/할인 피드 자동 태깅</span>
          <input
            type="checkbox"
            checked={settings.autoExtractShoppingLink}
            onChange={e => onUpdateSettings({ autoExtractShoppingLink: e.target.checked })}
            className="w-4 h-4 rounded accent-orange-500"
          />
        </label>
      </div>

      <div className="text-center pt-2 text-[11px] text-zinc-400">
        인스레드 치트 (InThread Cheat) v1.0.0 · 로컬 독립 동작 모드
      </div>
    </div>
  );
};
