import React from 'react';
import { QueueItem } from '../../types/threads';

interface QueueListProps {
  queue: QueueItem[];
  onRemove: (id: string) => void;
}

export const QueueList: React.FC<QueueListProps> = ({ queue, onRemove }) => {
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl mb-3 shadow-inner">
          📦
        </div>
        <h3 className="text-sm font-bold text-zinc-200">발행 큐가 비어 있습니다</h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-[260px] leading-relaxed">
          치트 컴포저에서 예약 발행을 설정하면 백그라운드 큐에 등록되어 지정된 시간에 자동으로 진행됩니다.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: QueueItem['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">예약 대기</span>;
      case 'publishing':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">발행 중</span>;
      case 'published':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">완료 ✓</span>;
      case 'failed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">실패</span>;
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400">발행 대기 및 이력 ({queue.length})</span>
      </div>

      <div className="space-y-2.5">
        {queue.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusBadge(item.status)}
                <span className="text-[11px] text-zinc-400 font-medium">
                  {formatTime(item.scheduledAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="text-xs text-zinc-400 hover:text-red-400 p-1"
                title="삭제"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed whitespace-pre-wrap">
              {item.text || '(이미지만 첨부됨)'}
            </p>

            {item.error && (
              <p className="text-[11px] text-red-400 bg-red-500/10 p-1.5 rounded-lg border border-red-500/20">
                {item.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
