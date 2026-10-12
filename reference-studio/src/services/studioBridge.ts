import { ThreadPostReference } from '../types/threads';

export function openInStudio(ref: ThreadPostReference): void {
  // Transfer public reference fields only. Never transfer authentication caches or cookies.
  const payload = {
    id: ref.id, username: ref.username, text: ref.text, permalink: ref.permalink,
    imageUrls: ref.imageUrls, videoUrls: ref.videoUrls,
  };
  const url = 'http://127.0.0.1:5005/studio/#reference=' + encodeURIComponent(JSON.stringify(payload));
  if (url.length > 50000) throw new Error('레퍼런스가 너무 큽니다. 이미지 목록을 줄여 주세요.');
  window.open(url, '_blank', 'noopener,noreferrer');
}
