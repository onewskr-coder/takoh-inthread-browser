import React from 'react';
import { ThreadPostReference } from '../../types/threads';
import { openInStudio } from '../../services/studioBridge';

interface ReferenceListProps {
  references: ThreadPostReference[];
  onSelectForComposer: (ref: ThreadPostReference) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export const ReferenceList: React.FC<ReferenceListProps> = ({
  references,
  onSelectForComposer,
  onDelete,
  onClear,
}) => {
  if (references.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl mb-3 shadow-inner">
          🛍️
        </div>
        <h3 className="text-sm font-bold text-zinc-200">수집된 레퍼런스가 없습니다</h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-[280px] leading-relaxed">
          스레드 웹(threads.com)에서 마음에 드는 쇼핑 피드를 발견하면 피드 카드의 <strong className="text-orange-400 font-semibold">[⚡ 치트 레퍼런스]</strong> 버튼을 눌러보세요!
        </p>
        <a
          href="https://www.threads.com"
          target="_blank"
          rel="noreferrer"
          className="mt-4 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition shadow-lg shadow-orange-600/20"
        >
          스레드로 피드 찾으러 가기 →
        </a>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400">
          최근 레퍼런스 피드 ({references.length})
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-zinc-400 hover:text-red-400 transition"
        >
          전체 비우기
        </button>
      </div>

      <div className="space-y-3">
        {references.map((ref) => (
          <div
            key={ref.id}
            className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition space-y-2.5"
          >
            {/* Top User & Badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-200">@{ref.username}</span>
                {ref.isShoppingFeed && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    🛍️ 쇼핑
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(ref.id)}
                className="text-xs text-zinc-400 hover:text-zinc-200 p-1"
                title="삭제"
              >
                ✕
              </button>
            </div>

            {/* Post text */}
            <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed whitespace-pre-wrap">
              {ref.text || '(이미지 중심 게시물)'}
            </p>

            {/* Images preview */}
            {ref.imageUrls.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {ref.imageUrls.slice(0, 4).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-14 h-14 object-cover rounded-lg border border-zinc-800"
                  />
                ))}
                {ref.imageUrls.length > 4 && (
                  <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                    +{ref.imageUrls.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
              <button
                type="button"
                onClick={() => openInStudio(ref)}
                className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-orange-500/20 transition"
              >
                <span>⚡ 스튜디오에서 분석·상품 찾기</span>
              </button>
              <a
                href={ref.permalink}
                target="_blank"
                rel="noreferrer"
                className="py-1.5 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
              >
                원문 보기
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
