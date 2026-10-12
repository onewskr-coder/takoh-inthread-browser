import { HookingStyle } from '../types/threads';

export const HOOKING_STYLES: HookingStyle[] = [
  {
    id: 'original',
    label: '원문 그대로',
    badge: 'Original',
    description: '레퍼런스 피드의 본문을 그대로 복사하여 사용합니다.',
    transform: (text: string, link?: string) => {
      let result = text.trim();
      if (link && !result.includes(link)) {
        result += `\n\n🔗 구매 링크:\n${link}`;
      }
      return result;
    }
  },
  {
    id: 'curiosity',
    label: '🔥 호기심 유발형',
    badge: '클릭률 300% ↑',
    description: '첫 문장에서 시선을 확 사로잡는 스레드 바이럴 스타일',
    transform: (text: string, link?: string) => {
      const clean = text.trim();
      const lines = clean.split('\n').filter(l => l.trim().length > 0);
      const coreContent = lines.slice(0, 4).join('\n');
      
      const hooks = [
        '솔직히 이거 써보기 전까진 과장인 줄 알았거든요? 근데 삶의 질이 3배는 바뀜...',
        '스레드에서 왜 이렇게 난리 났는지 직접 사보고 알았습니다.',
        '친구들한테만 몰래 알려주던 치트키 템인데 공유해봅니다.',
        '이거 진짜 왜 아무도 안 알려줬지? 나만 알고 싶었는데 공유함'
      ];
      const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];
      
      let res = `${selectedHook}\n\n${coreContent}`;
      if (link) {
        res += `\n\n👇 정보/구매 좌표 남겨둘게요\n${link}`;
      }
      return res;
    }
  },
  {
    id: 'review',
    label: '💡 리얼 찐후기형',
    badge: '신뢰도 극대화',
    description: '광고 느낌을 없애고 찐 내돈내산 사용기처럼 전달',
    transform: (text: string, link?: string) => {
      const clean = text.trim();
      const lines = clean.split('\n').filter(l => l.trim().length > 0);
      const body = lines.slice(0, 5).join('\n');

      let res = `[내돈내산 3주 사용 후기]\n\n`;
      res += `장점: 기대 이상으로 편하고 퀄리티 좋음\n단점: 진작 살 걸 후회됨..\n\n`;
      res += `${body}`;
      if (link) {
        res += `\n\n재구매 물어보시는 분들 많아서 좌표 공유해요:\n${link}`;
      }
      return res;
    }
  },
  {
    id: 'urgency',
    label: '⚡ 마감/할인 특가형',
    badge: '전환율 최고',
    description: '기간 한정 세일 및 품절 임박 분위기를 연출',
    transform: (text: string, link?: string) => {
      const clean = text.trim();
      let res = `🚨 역대급 할인 떴습니다 (언제 끝날지 모름)\n\n`;
      res += `${clean}`;
      if (link) {
        res += `\n\n🔥 지금 쿠폰 먹이면 최저가 나오니 얼른 확인하세요\n${link}`;
      }
      return res;
    }
  },
  {
    id: 'summary',
    label: '📌 3줄 핵심 요약형',
    badge: '가독성 최고',
    description: '바쁜 현대인을 위한 요약 정리 스타일',
    transform: (text: string, link?: string) => {
      const clean = text.trim();
      const lines = clean.split('\n').filter(l => l.trim().length > 0);
      const items = lines.slice(0, 3).map((l, i) => `${i + 1}. ${l.replace(/^[-*•\d.]+\s*/, '')}`);

      let res = `바쁜 분들을 위한 딱 3줄 요약:\n\n`;
      res += items.join('\n');
      if (link) {
        res += `\n\n자세한 정보와 최저가는 아래 링크에서 확인하세요:\n${link}`;
      }
      return res;
    }
  }
];
