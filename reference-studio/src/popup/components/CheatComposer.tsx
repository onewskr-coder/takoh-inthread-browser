import React, { useState } from 'react';
import { ThreadPostReference, PublishMediaItem } from '../../types/threads';
import { HOOKING_STYLES } from '../../services/hookingTemplates';
import { openThreadsWithDraft } from '../../services/threadsApi';
import { addToQueue } from '../../services/storage';

interface CheatComposerProps {
  initialRef: ThreadPostReference | null;
  onPostSuccess: () => void;
}

export const CheatComposer: React.FC<CheatComposerProps> = ({ initialRef, onPostSuccess }) => {
  const [text, setText] = useState(initialRef?.text || '');
  const [shoppingLink, setShoppingLink] = useState(initialRef?.shoppingLinks[0]?.url || '');
  const [images, setImages] = useState<PublishMediaItem[]>(
    (initialRef?.imageUrls || []).map(url => ({ kind: 'image', url }))
  );
  const [selectedStyle, setSelectedStyle] = useState('original');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleMinutes, setScheduleMinutes] = useState(10);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleApplyStyle = (styleId: string) => {
    setSelectedStyle(styleId);
    const style = HOOKING_STYLES.find(s => s.id === styleId);
    if (style) {
      const origin = initialRef?.text || text;
      setText(style.transform(origin, shoppingLink));
    }
  };

  const handlePublishNow = async () => {
    if (!text.trim() && images.length === 0) return;
    setIsPublishing(true);
    try {
      if (isScheduled) {
        // Enqueue
        const scheduledTime = Date.now() + scheduleMinutes * 60 * 1000;
        await addToQueue({
          id: crypto.randomUUID(),
          text: text.trim(),
          media: images,
          scheduledAt: scheduledTime,
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0
        });
        setToastMsg(`🕒 ${scheduleMinutes}분 뒤 예약 발행 큐에 등록되었습니다!`);
      } else {
        // Direct Publish via open draft
        await openThreadsWithDraft(text.trim());
        setToastMsg('⚡ 내 스레드 글쓰기 창이 열렸습니다! (Ctrl+V로 바로 붙여넣기)');
      }
      onPostSuccess();
    } catch (e: any) {
      setToastMsg('오류: ' + (e?.message || '발행 실패'));
    } finally {
      setIsPublishing(false);
      setTimeout(() => setToastMsg(null), 3000);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 space-y-4">
      {toastMsg && (
        <div className="p-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-bold text-center animate-pulse">
          {toastMsg}
        </div>
      )}

      {/* Style Presets */}
      <div>
        <label className="text-xs font-bold text-zinc-300 block mb-2">
          🎯 AI 후킹 카피 변환 (클릭 시 자동 리라이팅)
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {HOOKING_STYLES.map(style => (
            <button
              key={style.id}
              type="button"
              onClick={() => handleApplyStyle(style.id)}
              className={`p-2 rounded-xl text-left border transition ${
                selectedStyle === style.id
                  ? 'bg-orange-500/15 border-orange-500 text-orange-400 font-bold'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="text-[11px] leading-snug">{style.label}</div>
              <div className="text-[10px] opacity-75 font-normal">{style.badge}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Text Area */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-zinc-300">게시물 본문</label>
          <span className="text-[11px] text-zinc-400">{text.length} / 500자</span>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="스레드에 올릴 글을 작성하거나 레퍼런스를 변환하세요..."
          className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-orange-500 text-zinc-100 text-xs leading-relaxed outline-none resize-none transition"
        />
      </div>

      {/* Shopping Link Input */}
      <div>
        <label className="text-xs font-bold text-zinc-300 block mb-1">
          🔗 쇼핑/쿠팡 파트너스 링크 (선택)
        </label>
        <input
          type="url"
          value={shoppingLink}
          onChange={e => setShoppingLink(e.target.value)}
          placeholder="https://link.coupang.com/..."
          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-orange-500 text-zinc-100 text-xs outline-none transition"
        />
      </div>

      {/* Images */}
      {images.length > 0 && (
        <div>
          <label className="text-xs font-bold text-zinc-300 block mb-1.5">
            첨부 이미지 ({images.length}장)
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <div key={i} className="relative group shrink-0">
                <img
                  src={img.url || img.dataUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded-xl border border-zinc-800"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 text-xs flex items-center justify-center hover:bg-red-500 hover:text-white transition shadow"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Option Toggle */}
      <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isScheduled}
            onChange={e => setIsScheduled(e.target.checked)}
            className="w-4 h-4 rounded accent-orange-500"
          />
          <span>예약 발행 모드</span>
        </label>
        {isScheduled && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <input
              type="number"
              min={5}
              max={1440}
              value={scheduleMinutes}
              onChange={e => setScheduleMinutes(Number(e.target.value))}
              className="w-14 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-center text-zinc-100 font-bold"
            />
            <span>분 뒤 발행</span>
          </div>
        )}
      </div>

      {/* Submit Action */}
      <button
        type="button"
        disabled={isPublishing || (!text.trim() && images.length === 0)}
        onClick={handlePublishNow}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition"
      >
        <span>{isPublishing ? '처리 중…' : isScheduled ? '🕒 큐에 예약 등록하기' : '⚡ 내 스레드에 바로 올리기'}</span>
      </button>
    </div>
  );
};
