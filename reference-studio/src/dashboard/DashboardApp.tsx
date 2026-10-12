import React, { useState, useEffect } from 'react';
import { ThreadPostReference, AppSettings } from '../types/threads';
import { HOOKING_STYLES } from '../services/hookingTemplates';
import { formatCoupangAffiliateLink } from '../services/coupangApi';
import { openInStudio } from '../services/studioBridge';

// Initial sample viral references for immediate rich view
const INITIAL_REFERENCES: ThreadPostReference[] = [
  {
    id: 'sample-1',
    code: 'C_sample1',
    username: 'living_curator',
    userPic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    permalink: 'https://www.threads.net/@living_curator/post/sample1',
    imageUrls: [],
    videoUrls: [],
    text: '다이소 5번 갈 거 이거 하나로 해결됨... 삶의 질 200% 수직상승템 정리해봄\n\n1. 싱크대 틈새 방수 테이프 (기름때/물때 완벽차단)\n2. 자석식 실리콘 냄비받침 (수납혁명)\n3. 360도 회전 양념통 정리대 (공간 3배 늘어남)\n\n특히 1번은 자취생이든 주부든 무조건 사야함. 청소시간 1/3로 줄어듦.',
    createdAt: Date.now() - 1000 * 60 * 45,
    likeCount: 3840,
    replyCount: 421,
    isShoppingFeed: true,
    shoppingLinks: [{
      url: 'https://link.coupang.com/a/sample1',
      type: 'coupang',
      title: '주방 싱크대 틈새 방수 곰팡이 방지 테이프'
    }]
  },
  {
    id: 'sample-2',
    code: 'C_sample2',
    username: 'tech_nomad',
    userPic: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    permalink: 'https://www.threads.net/@tech_nomad/post/sample2',
    imageUrls: [],
    videoUrls: [],
    text: '맥북 유저들 주목. 10만원대 가성비 썬더볼트 독 끝판왕 찾았다...\n\n포트 12개 동시에 꽂아도 발열 1도 없고 4K 144Hz 듀얼 모니터 완벽 지원함. 쿠팡 로켓직구로 사면 4만원 더 저렴함. 재고 소진 빠르니까 필요하신 분 미리 챙겨두세요.',
    createdAt: Date.now() - 1000 * 60 * 180,
    likeCount: 5120,
    replyCount: 560,
    isShoppingFeed: true,
    shoppingLinks: [{
      url: 'https://link.coupang.com/a/sample2',
      type: 'coupang',
      title: '12in1 C타입 초고속 멀티 허브 독'
    }]
  },
  {
    id: 'sample-3',
    code: 'C_sample3',
    username: 'healthy_diet_kr',
    userPic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    permalink: 'https://www.threads.net/@healthy_diet_kr/post/sample3',
    imageUrls: [],
    videoUrls: [],
    text: '솔직히 닭가슴살 3년 먹으면서 이거보다 안 질리고 맛있는 소스는 처음 봄...\n\n당류 0g인데 속세 양념치킨 맛 그대로 남. 냉동실에 5병씩 쟁여놓는 필수템 공유합니다. 내돈내산 100% 검증 완료.',
    createdAt: Date.now() - 1000 * 60 * 360,
    likeCount: 2980,
    replyCount: 312,
    isShoppingFeed: true,
    shoppingLinks: [{
      url: 'https://link.coupang.com/a/sample3',
      type: 'coupang',
      title: '저칼로리 제로 당류 스위트 칠리 닭가슴살 소스'
    }]
  },
  {
    id: 'sample-4',
    code: 'C_sample4',
    username: 'daily_minimalist',
    userPic: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    permalink: 'https://www.threads.net/@daily_minimalist/post/sample4',
    imageUrls: [],
    videoUrls: [],
    text: '원룸 인테리어 감성 살리는 조명은 비싼 루이스폴센 살 필요 없음.\n\n3만원대 무선 충전 버섯 램프 하나로 호텔 라운지 분위기 쌉가능. 조도 3단 조절에 터치식이라 자기 전에 머리맡에 두기 딱 좋음.',
    createdAt: Date.now() - 1000 * 60 * 720,
    likeCount: 4180,
    replyCount: 489,
    isShoppingFeed: false,
    shoppingLinks: []
  }
];

const TREND_KEYWORDS = [
  { rank: 1, keyword: '다이소 꿀템 추천', category: '생활/리빙', change: '+142%', isHot: true },
  { rank: 2, keyword: '제로당 소스 모음', category: '식품/헬스', change: '+98%', isHot: true },
  { rank: 3, keyword: '원룸 데스크테리어', category: '가구/인테리어', change: '+85%', isHot: false },
  { rank: 4, keyword: '자취 필수 가전 TOP5', category: '디지털/가전', change: '+76%', isHot: true },
  { rank: 5, keyword: '쿠팡 로켓프레시 밀키트', category: '식품', change: '+64%', isHot: false },
  { rank: 6, keyword: '휴대용 썬더볼트 독', category: 'IT/전자기기', change: '+59%', isHot: false },
  { rank: 7, keyword: '가을 보습 수분크림', category: '뷰티/스킨케어', change: '+51%', isHot: false },
  { rank: 8, keyword: '실리콘 접이식 냄비', category: '주방용품', change: '+48%', isHot: false },
];

const HOT_PRODUCTS = [
  {
    id: 'p1',
    name: '마그네틱 실리콘 싱크대 물막이 + 방수 틈새테이프 세트',
    category: '주방/생활',
    price: '14,900원',
    discount: '32%',
    commission: '3.0%',
    estRevenue: '건당 447원',
    badge: '골드박스 특가',
    url: 'https://www.coupang.com/vp/products/68102931'
  },
  {
    id: 'p2',
    name: '초경량 100W 질화갈륨(GaN) 3포트 고속충전기',
    category: '디지털/가전',
    price: '28,500원',
    discount: '41%',
    commission: '3.0%',
    estRevenue: '건당 855원',
    badge: '카테고리 베스트 1위',
    url: 'https://www.coupang.com/vp/products/79182390'
  },
  {
    id: 'p3',
    name: '무설탕 저당 비빔장 & 닭가슴살 볶음 소스 3종 패키지',
    category: '식품/다이어트',
    price: '16,800원',
    discount: '25%',
    commission: '3.0%',
    estRevenue: '건당 504원',
    badge: '스레드 바이럴 급상승',
    url: 'https://www.coupang.com/vp/products/81203914'
  },
  {
    id: 'p4',
    name: '호텔식 고밀도 순면 워싱 차렵이불 사계절용',
    category: '인테리어/침구',
    price: '34,900원',
    discount: '48%',
    commission: '3.0%',
    estRevenue: '건당 1,047원',
    badge: 'MD 추천 픽',
    url: 'https://www.coupang.com/vp/products/90182471'
  }
];

export const DashboardApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'references' | 'studio' | 'coupang' | 'queue' | 'trends' | 'guide'>('overview');
  const [extInstalled, setExtInstalled] = useState(false);
  const [extVersion, setExtVersion] = useState('');
  const [references, setReferences] = useState<ThreadPostReference[]>(INITIAL_REFERENCES);
  const [settings, setSettings] = useState<AppSettings>({
    coupangSubId: '',
    autoExtractShoppingLink: true,
    defaultScheduleDelayMinutes: 10,
    floatingButtonVisible: true
  });
  const [subIdInput, setSubIdInput] = useState('');
  
  // Studio state
  const [selectedRef, setSelectedRef] = useState<ThreadPostReference | null>(INITIAL_REFERENCES[0]);
  const [composerText, setComposerText] = useState(INITIAL_REFERENCES[0].text);
  const [selectedStyle, setSelectedStyle] = useState('curiosity');
  const [placement, setPlacement] = useState<'comment' | 'body'>('comment');
  const [includeFTC, setIncludeFTC] = useState(true);
  const [productUrlInput, setProductUrlInput] = useState(INITIAL_REFERENCES[0].shoppingLinks[0]?.url || '');
  const [isPublishing, setIsPublishing] = useState(false);

  // Coupang link converter state
  const [rawCoupangUrl, setRawCoupangUrl] = useState('');
  const [convertedLink, setConvertedLink] = useState('');

  // Queue state
  const [queueItems, setQueueItems] = useState<any[]>([
    {
      id: 'q1',
      text: '다이소 5번 갈 거 이거 하나로 끝남... (방수 테이프 실사용기)',
      scheduledAt: Date.now() + 1000 * 60 * 35,
      status: 'pending',
      target: 'threads.com'
    }
  ]);

  // Toast message
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Check URL params for ?onboarding=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboarding') === '1') {
      setActiveTab('guide');
    }
  }, []);

  // Bridge communication with InThread Cheat Extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'INTHREAD_READY' || data.type === 'INTHREAD_PONG') {
        setExtInstalled(true);
        if (data.version) setExtVersion(data.version);
        window.postMessage({ type: 'INTHREAD_GET_DATA' }, window.location.origin);
      }

      if (data.type === 'INTHREAD_GET_DATA_RESPONSE') {
        if (data.references && data.references.length > 0) {
          setReferences(data.references);
        }
        if (data.settings) {
          setSettings(data.settings);
          if (data.settings.coupangSubId) {
            setSubIdInput(data.settings.coupangSubId);
          }
        }
      }

      if (data.type === 'INTHREAD_SAVE_SETTINGS_RESPONSE' && data.success) {
        showToast('✓ 쿠팡 SubID 설정이 확장프로그램에 완벽 동기화되었습니다!');
      }

      if (data.type === 'INTHREAD_PUBLISH_NOW_RESPONSE') {
        setIsPublishing(false);
        if (data.ok) {
          showToast('⚡ 스레드 글쓰기 창이 열렸습니다! 클립보드에 복사된 글을 Ctrl+V로 붙여넣으세요.');
        } else {
          showToast(`안내: ${data.message || '스레드 탭을 열어주세요.'}`);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    window.postMessage({ type: 'INTHREAD_PING' }, window.location.origin);
    const pingTimer = setInterval(() => {
      window.postMessage({ type: 'INTHREAD_PING' }, window.location.origin);
    }, 3000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(pingTimer);
    };
  }, []);

  const handleSaveSubId = () => {
    const clean = subIdInput.trim();
    setSettings(prev => ({ ...prev, coupangSubId: clean }));
    window.postMessage({
      type: 'INTHREAD_SAVE_SETTINGS',
      payload: { coupangSubId: clean }
    }, window.location.origin);
    showToast(`✓ SubID [${clean || '기본값'}] 저장 완료!`);
  };

  const handleSelectRefForStudio = (ref: ThreadPostReference) => {
    openInStudio(ref);
  };

  const handleApplyStyle = (styleId: string) => {
    setSelectedStyle(styleId);
    const style = HOOKING_STYLES.find(s => s.id === styleId);
    if (style && selectedRef) {
      setComposerText(style.transform(selectedRef.text, productUrlInput));
      showToast(`⚡ ${style.label} 템플릿 적용 완료!`);
    }
  };

  const handleConvertCoupangLink = () => {
    if (!rawCoupangUrl.trim()) {
      showToast('⚠️ 쿠팡 상품 링크를 입력해주세요.');
      return;
    }
    const formatted = formatCoupangAffiliateLink(rawCoupangUrl.trim(), settings.coupangSubId);
    setConvertedLink(formatted);
    showToast('✓ 내 SubID가 적용된 파트너스 링크가 생성되었습니다!');
  };

  const handleCopyText = (textToCopy: string, label: string = '텍스트') => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(`✓ ${label}가 클립보드에 복사되었습니다!`);
    });
  };

  const handlePublishToThreads = () => {
    setIsPublishing(true);
    let finalPost = composerText.trim();
    let commentText = '';

    const ftcNotice = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

    if (productUrlInput.trim()) {
      const affiliateUrl = formatCoupangAffiliateLink(productUrlInput.trim(), settings.coupangSubId);
      if (placement === 'body') {
        finalPost += `\n\n🔗 상품 바로가기: ${affiliateUrl}`;
        if (includeFTC) {
          finalPost = `${ftcNotice}\n\n${finalPost}`;
        }
      } else {
        commentText = `👉 제가 쓰고 있는 제품 링크입니다!\n${affiliateUrl}`;
        if (includeFTC) {
          commentText = `${ftcNotice}\n\n${commentText}`;
        }
      }
    }

    navigator.clipboard.writeText(finalPost);

    const mediaList = [...(selectedRef?.imageUrls || []), ...(selectedRef?.videoUrls || [])];

    window.postMessage({
      type: 'INTHREAD_PUBLISH_NOW',
      payload: {
        text: finalPost,
        comment: commentText,
        mediaUrls: mediaList
      }
    }, window.location.origin);

    setTimeout(() => {
      window.open('https://www.threads.net', '_blank');
      setIsPublishing(false);
      showToast('⚡ 스레드가 열렸습니다! Ctrl+V로 본문을 붙여넣으세요.');
    }, 1200);
  };

  const handleAddToQueue = () => {
    const newItem = {
      id: 'q_' + Date.now(),
      text: composerText.substring(0, 45) + '...',
      scheduledAt: Date.now() + 1000 * 60 * settings.defaultScheduleDelayMinutes,
      status: 'pending',
      target: 'threads.com'
    };
    setQueueItems(prev => [newItem, ...prev]);
    showToast(`📅 ${settings.defaultScheduleDelayMinutes}분 뒤 자동 발행 큐에 등록되었습니다!`);
    setActiveTab('queue');
  };

  const totalLikes = references.reduce((acc, r) => acc + (r.likeCount ?? 0), 0);
  const shoppingRefCount = references.filter(r => r.isShoppingFeed).length;

  return (
    <div className="flex min-h-screen w-full bg-[#090D14] text-zinc-100 font-sans antialiased selection:bg-orange-500 selection:text-white">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-zinc-900/95 border border-orange-500/40 text-zinc-100 px-5 py-3.5 rounded-xl shadow-2xl shadow-orange-500/10 backdrop-blur-xl animate-bounce">
          <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-ping" />
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}

      {/* Left Sidebar Navigation */}
      <aside className="w-64 shrink-0 border-r border-zinc-800/60 bg-[#0C101A]/90 backdrop-blur-md flex flex-col justify-between p-4 sticky top-0 h-screen z-20">
        <div>
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-400 p-[1.5px] shadow-lg shadow-orange-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <span className="text-xl">⚡</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">인스레드 치트키 by TAKOH</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">PRO</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-medium">스레드 수익화 올인원 SaaS</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'overview'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-base">🏠</span>
              <span>대시보드 홈</span>
            </button>

            <button
              onClick={() => setActiveTab('references')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'references'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">📥</span>
                <span>스레드 수집함</span>
              </div>
              <span className="text-xs font-mono bg-zinc-800/80 px-2 py-0.5 rounded-full text-zinc-300">
                {references.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('studio')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'studio'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-base">✍️</span>
              <span>AI 스튜디오 (글쓰기)</span>
            </button>

            <button
              onClick={() => setActiveTab('coupang')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'coupang'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-base">🛍️</span>
              <span>쿠팡 소싱 & 변환기</span>
            </button>

            <button
              onClick={() => setActiveTab('queue')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'queue'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">📅</span>
                <span>발행 캘린더 (큐)</span>
              </div>
              <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                {queueItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('trends')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'trends'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-base">📈</span>
              <span>실시간 트렌드 키워드</span>
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'guide'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-base">🚀</span>
              <span>시작 가이드 & 진단</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Bottom: Connection & SubID Badge */}
        <div className="space-y-3 pt-4 border-t border-zinc-800/60">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">확장프로그램</span>
              {extInstalled ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  연결됨 {extVersion && `v${extVersion}`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  스캔 대기중
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">쿠팡 SubID</span>
              <span className="font-mono text-zinc-300 font-medium truncate max-w-[100px]">
                {settings.coupangSubId || '미설정'}
              </span>
            </div>
          </div>

          <a
            href="https://www.threads.net"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-xs font-semibold text-zinc-200 transition"
          >
            <span>🔗 스레드 바로가기</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto min-h-screen">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-10 bg-[#090D14]/90 backdrop-blur-md border-b border-zinc-800/60 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2.5">
              {activeTab === 'overview' && '대시보드 종합 현황'}
              {activeTab === 'references' && '스레드 알고리즘 수집함'}
              {activeTab === 'studio' && 'AI 스레드 바이럴 스튜디오'}
              {activeTab === 'coupang' && '쿠팡 파트너스 수익화 센터'}
              {activeTab === 'queue' && '발행 & 예약 캘린더'}
              {activeTab === 'trends' && '실시간 바이럴 키워드 랭킹'}
              {activeTab === 'guide' && '치트 온보딩 & 연동 진단'}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              하입덕 기능 완벽 독립 호환 · Threads 알고리즘 핏 소싱부터 쿠팡 제휴 수익화까지
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('studio')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition"
            >
              <span>⚡ 새 글 쓰기</span>
            </button>
          </div>
        </header>

        {/* Tab 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
            {/* 4 Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800/80 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">수집된 레퍼런스</span>
                  <span className="text-base p-2 rounded-xl bg-orange-500/10 text-orange-400">📥</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">{references.length}</span>
                  <span className="text-xs font-semibold text-emerald-400">+100% 실시간</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">내 Threads 피드에서 자동 캡처</p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800/80 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">쇼핑/쿠팡 전환 감지</span>
                  <span className="text-base p-2 rounded-xl bg-emerald-500/10 text-emerald-400">🛍️</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">{shoppingRefCount}</span>
                  <span className="text-xs font-semibold text-emerald-400">타래 링크 자동 소싱</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">수익화 가능 게시물 비율 75%</p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800/80 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">누적 인터랙션 (좋아요)</span>
                  <span className="text-base p-2 rounded-xl bg-purple-500/10 text-purple-400">🔥</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">{totalLikes.toLocaleString()}</span>
                  <span className="text-xs font-semibold text-purple-400">검증된 바이럴</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">알고리즘 상위 5% 데이터</p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800/80 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">발행 예약 대기열</span>
                  <span className="text-base p-2 rounded-xl bg-amber-500/10 text-amber-400">📅</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">{queueItems.length}건</span>
                  <span className="text-xs font-semibold text-amber-400">스케줄러 활성</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">지정 시간 순차 발행</p>
              </div>
            </div>

            {/* Quick Action Banner */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-orange-950/40 via-[#131926] to-zinc-900 border border-orange-500/30 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold mb-1">
                  <span>⚡ 원클릭 치트 파이프라인</span>
                </div>
                <h3 className="text-lg font-bold text-white">Threads에서 터진 글, 내 쿠팡 링크로 3초 만에 재가공하세요</h3>
                <p className="text-xs text-zinc-400">
                  확장프로그램이 수집한 원문의 구조·훅을 그대로 유지하면서 내 문체와 쿠팡 파트너스 링크로 즉시 변환합니다.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setActiveTab('references')}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-lg shadow-orange-500/25 transition"
                >
                  수집함에서 글 고르기 →
                </button>
                <button
                  onClick={() => setActiveTab('coupang')}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition"
                >
                  쿠팡 링크 변환
                </button>
              </div>
            </div>

            {/* Two-Column Grid: Recent Feeds & Trend Keywords */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left 2 Cols: Recent Reference Cards */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>📥 최근 수집된 바이럴 스레드</span>
                    <span className="text-xs text-zinc-500 font-normal">({references.length}개)</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('references')}
                    className="text-xs text-orange-400 hover:underline font-medium"
                  >
                    전체보기
                  </button>
                </div>

                <div className="space-y-3">
                  {references.slice(0, 3).map((ref) => (
                    <div
                      key={ref.id}
                      className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800/80 hover:border-orange-500/40 transition group space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <img
                            src={ref.userPic || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                          />
                          <div>
                            <span className="text-xs font-bold text-white block">@{ref.username}</span>
                            <span className="text-[10px] text-zinc-500">방금 전 수집</span>
                          </div>
                        </div>

                        {ref.isShoppingFeed ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                            🛍️ 쿠팡 링크 감지됨
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-medium">
                            💡 일반 정보글
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed whitespace-pre-line">
                        {ref.text}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                        <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                          <span>❤️ {(ref.likeCount ?? 0).toLocaleString()}</span>
                          <span>💬 {(ref.replyCount ?? 0).toLocaleString()}</span>
                        </div>

                        <button
                          onClick={() => handleSelectRefForStudio(ref)}
                          className="px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 text-xs font-bold transition"
                        >
                          ⚡ AI 스튜디오로 편집
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right 1 Col: Hot Trend Keywords */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>🔥 실시간 바이럴 검색어</span>
                  </h3>
                  <span className="text-[11px] text-orange-400 font-medium">실시간 집계</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#0F1420] border border-zinc-800/80 space-y-2.5">
                  {TREND_KEYWORDS.slice(0, 6).map((item) => (
                    <div
                      key={item.rank}
                      onClick={() => {
                        setComposerText(`요즘 스레드에서 난리난 '${item.keyword}' 핵심만 요약해봄...\n\n`);
                        setActiveTab('studio');
                        showToast(`'${item.keyword}' 키워드로 초안을 시작합니다.`);
                      }}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-800/50 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-5 text-center font-mono font-bold text-xs ${item.rank <= 3 ? 'text-orange-400' : 'text-zinc-500'}`}>
                          {item.rank}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-zinc-200">{item.keyword}</p>
                          <span className="text-[10px] text-zinc-500">{item.category}</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-emerald-400">{item.change}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: REFERENCES (Feed Library) */}
        {activeTab === 'references' && (
          <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">내 알고리즘 맞춤 수집 카드</h2>
                <p className="text-xs text-zinc-400">
                  Threads 웹에서 [⚡ 치트 레퍼런스] 버튼을 누르거나 자동 스캔으로 보관된 원본 글 목록입니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">필터:</span>
                <button className="px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-bold">
                  전체 ({references.length})
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700">
                  🛍️ 쇼핑형만
                </button>
              </div>
            </div>

            {/* Grid of Reference Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {references.map((ref) => (
                <div
                  key={ref.id}
                  className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800/80 hover:border-orange-500/50 flex flex-col justify-between transition group shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={ref.userPic || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block">@{ref.username}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{ref.code}</span>
                        </div>
                      </div>

                      {ref.isShoppingFeed && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          쇼핑 링크
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line line-clamp-4">
                      {ref.text}
                    </p>

                    {ref.shoppingLinks && ref.shoppingLinks.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] space-y-1">
                        <span className="text-zinc-400 font-medium block">감지된 상품:</span>
                        <span className="text-orange-400 font-semibold truncate block">
                          {ref.shoppingLinks[0].title || ref.shoppingLinks[0].url}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-zinc-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                      <span>❤️ {(ref.likeCount ?? 0).toLocaleString()}</span>
                      <span>💬 {(ref.replyCount ?? 0).toLocaleString()}</span>
                    </div>

                    <button
                      onClick={() => handleSelectRefForStudio(ref)}
                      className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition"
                    >
                      ⚡ 스튜디오에서 분석·상품 찾기
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: AI STUDIO */}
        {activeTab === 'studio' && (
          <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column (7 cols): Editor & Settings */}
              <div className="lg:col-span-7 space-y-6">
                {/* 5 Viral Hook Presets */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-300 block">
                    1. 바이럴 훅 템플릿 선택 (원클릭 문체 변환)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {HOOKING_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => handleApplyStyle(style.id)}
                        className={`p-3 rounded-xl border text-left transition ${
                          selectedStyle === style.id
                            ? 'bg-orange-500/20 border-orange-500 text-white shadow-lg shadow-orange-500/10'
                            : 'bg-[#0F1420] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <span className="text-xs font-bold block">{style.label}</span>
                        <span className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                          {style.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Text Editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-300">
                      2. 스레드 본문 편집
                    </label>
                    <span className="text-xs font-mono text-zinc-400">
                      {composerText.length} / 500자 (Threads 권장)
                    </span>
                  </div>
                  <textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    rows={10}
                    className="w-full p-4 rounded-2xl bg-[#0F1420] border border-zinc-800 text-zinc-100 text-sm leading-relaxed focus:outline-none focus:border-orange-500 resize-none font-sans"
                    placeholder="스레드에 올릴 본문을 입력하세요..."
                  />
                </div>

                {/* Coupang Link & FTC Setting */}
                <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <span>🛍️ 쿠팡 파트너스 수익화 부착</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                        자동 공정위 문구 지원
                      </span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">연결할 쿠팡 상품 URL</label>
                    <input
                      type="text"
                      value={productUrlInput}
                      onChange={(e) => setProductUrlInput(e.target.value)}
                      placeholder="https://www.coupang.com/vp/products/..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">링크 부착 위치</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPlacement('comment')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                            placement === 'comment'
                              ? 'bg-orange-500 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          첫 댓글(타래)에 배치
                        </button>
                        <button
                          onClick={() => setPlacement('body')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                            placement === 'body'
                              ? 'bg-orange-500 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          본문 하단에 포함
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">공정위 필수 고지</label>
                      <button
                        onClick={() => setIncludeFTC(!includeFTC)}
                        className={`w-full py-2 rounded-lg text-xs font-bold border transition ${
                          includeFTC
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {includeFTC ? '✓ 공정위 문구 자동 부착 ON' : '✕ 수동 표기 OFF'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Publish & Queue Action Buttons */}
                <div className="flex items-center gap-4 pt-2">
                  <button
                    disabled={isPublishing}
                    onClick={handlePublishToThreads}
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-sm font-bold shadow-xl shadow-orange-500/25 transition flex items-center justify-center gap-2"
                  >
                    <span>⚡ 스레드 즉시 글쓰기 (클립보드 복사 & 이동)</span>
                  </button>

                  <button
                    onClick={handleAddToQueue}
                    className="px-5 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold transition flex items-center gap-2"
                  >
                    <span>📅 예약 큐에 등록</span>
                  </button>
                </div>
              </div>

              {/* Right Column (5 cols): Real-time Threads Mobile Feed Mockup */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Threads 모바일 피드 실시간 미리보기
                  </span>
                  <span className="text-xs text-orange-400 font-mono">100% 실사 핏</span>
                </div>

                {/* Phone Frame */}
                <div className="w-full max-w-sm mx-auto rounded-[36px] bg-black border-[6px] border-zinc-800 p-4 shadow-2xl relative overflow-hidden">
                  <div className="w-24 h-4 bg-zinc-800 rounded-full mx-auto mb-4" />

                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900">
                    <span className="text-sm font-black text-white">Threads</span>
                    <span className="text-xs text-zinc-500">인스레드 프리뷰</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xs">
                        ⚡
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">내 스레드 계정</span>
                        <span className="text-[10px] text-zinc-500">방금 전</span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line break-words">
                      {includeFTC && placement === 'body' && productUrlInput && (
                        <span className="text-[10px] text-zinc-500 block mb-1">
                          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
                        </span>
                      )}
                      {composerText || '본문을 입력하면 여기에 실제 스레드 게시물 형태로 표시됩니다.'}
                      {placement === 'body' && productUrlInput && (
                        <span className="text-orange-400 block mt-2 text-[11px] underline">
                          🔗 {formatCoupangAffiliateLink(productUrlInput, settings.coupangSubId)}
                        </span>
                      )}
                    </p>

                    <div className="flex items-center gap-4 text-sm text-zinc-400 pt-2 border-t border-zinc-900">
                      <span>🤍</span>
                      <span>💬</span>
                      <span>🔁</span>
                      <span>✈️</span>
                    </div>

                    {placement === 'comment' && productUrlInput && (
                      <div className="mt-3 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-orange-400">내 타래 첫 댓글</span>
                          <span className="text-[9px] text-zinc-500">자동 생성</span>
                        </div>
                        {includeFTC && (
                          <p className="text-[10px] text-zinc-500 leading-tight">
                            이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-300">
                          👉 제가 쓰고 있는 제품 링크입니다!<br/>
                          <span className="text-orange-400 underline break-all">
                            {formatCoupangAffiliateLink(productUrlInput, settings.coupangSubId)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: COUPANG MONETIZATION CENTER */}
        {activeTab === 'coupang' && (
          <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
            <div className="p-6 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🔑 내 쿠팡 파트너스 SubID 설정</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    SubID를 입력하면 모든 생성 링크에 자동으로 부여되어 스레드 유입 채널별 수익 통계를 정확히 추적할 수 있습니다.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={subIdInput}
                    onChange={(e) => setSubIdInput(e.target.value)}
                    placeholder="예: inthread_01"
                    className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 focus:outline-none focus:border-orange-500 w-44"
                  />
                  <button
                    onClick={handleSaveSubId}
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition shrink-0"
                  >
                    저장하기
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-4">
              <h3 className="text-base font-bold text-white">⚡ 쿠팡 상품 링크 원클릭 파트너스 변환기</h3>
              <p className="text-xs text-zinc-400">
                일반 쿠팡 상품 주소를 입력하면 내 파트너스 제휴 단축 링크로 자동 변환됩니다.
              </p>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={rawCoupangUrl}
                  onChange={(e) => setRawCoupangUrl(e.target.value)}
                  placeholder="쿠팡 상품 URL을 붙여넣으세요 (예: https://www.coupang.com/vp/products/...)"
                  className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-orange-500"
                />
                <button
                  onClick={handleConvertCoupangLink}
                  className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition shrink-0"
                >
                  제휴 링크 변환
                </button>
              </div>

              {convertedLink && (
                <div className="p-4 rounded-xl bg-zinc-900/90 border border-orange-500/30 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase">생성된 파트너스 링크</span>
                    <p className="text-xs font-mono text-orange-400 break-all">{convertedLink}</p>
                  </div>
                  <button
                    onClick={() => handleCopyText(convertedLink, '파트너스 링크')}
                    className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition"
                  >
                    복사
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">🔥 스레드 바이럴 추천 소싱 상품 (골드박스/베스트)</h3>
                  <p className="text-xs text-zinc-400">스레드에서 높은 구매 전환율과 폭발적 조회수를 기록 중인 실시간 추천 상품입니다.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {HOT_PRODUCTS.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800 hover:border-orange-500/40 flex flex-col justify-between transition group"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          {prod.badge}
                        </span>
                        <span className="text-[10px] text-zinc-500">{prod.category}</span>
                      </div>

                      <h4 className="text-xs font-bold text-zinc-200 line-clamp-2 leading-snug">
                        {prod.name}
                      </h4>

                      <div className="pt-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-black text-white">{prod.price}</span>
                          <span className="text-xs font-bold text-red-400">{prod.discount} 할인</span>
                        </div>
                        <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                          예상 수익: {prod.estRevenue} ({prod.commission})
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-zinc-800 flex items-center gap-2">
                      <button
                        onClick={() => {
                          const affiliateUrl = formatCoupangAffiliateLink(prod.url, settings.coupangSubId);
                          setProductUrlInput(affiliateUrl);
                          setComposerText(`스레드에서 요즘 매일 품절 뜨는 '${prod.name}' 실사용 솔직후기...\n\n가성비 미쳤다는 말밖에 안 나옴. 특히 자취생분들은 필수임.`);
                          setActiveTab('studio');
                          showToast(`✓ [${prod.name}] 상품으로 AI 글쓰기를 시작합니다.`);
                        }}
                        className="w-full py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition text-center shadow-md shadow-orange-500/20"
                      >
                        ⚡ 스튜디오로 글쓰기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: QUEUE */}
        {activeTab === 'queue' && (
          <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Threads 자동 발행 대기열 (캘린더)</h2>
                <p className="text-xs text-zinc-400">
                  지정된 시간에 맞춰 순차 발행 대기 중인 목록입니다.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800 flex items-center justify-between"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        발행 대기중
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        예약 시각: {new Date(item.scheduledAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-zinc-200">{item.text}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        window.open('https://www.threads.net', '_blank');
                        showToast('⚡ 스레드로 이동하여 즉시 발행합니다.');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition"
                    >
                      지금 즉시 발행
                    </button>
                    <button
                      onClick={() => {
                        setQueueItems(prev => prev.filter(q => q.id !== item.id));
                        showToast('✓ 예약이 취소되었습니다.');
                      }}
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 text-xs font-medium transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 6: TRENDS */}
        {activeTab === 'trends' && (
          <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">실시간 트렌드 및 바이럴 키워드</h2>
              <p className="text-xs text-zinc-400">
                지금 사람들이 가장 많이 검색하고 반응하는 SNS 바이럴 키워드입니다. 클릭하여 바로 글을 기획하세요.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TREND_KEYWORDS.map((k) => (
                <div
                  key={k.rank}
                  onClick={() => {
                    setComposerText(`요즘 난리난 '${k.keyword}' 직접 써보고 정리한 솔직 리뷰...\n\n`);
                    setActiveTab('studio');
                    showToast(`'${k.keyword}' 주제로 AI 스튜디오를 시작합니다.`);
                  }}
                  className="p-4 rounded-2xl bg-[#0F1420] border border-zinc-800 hover:border-orange-500/40 cursor-pointer flex items-center justify-between transition group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-mono font-black text-base text-orange-400">
                      {k.rank}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-orange-300 transition">
                        {k.keyword}
                      </h4>
                      <span className="text-[10px] text-zinc-500">{k.category}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-emerald-400 block">{k.change}</span>
                    <span className="text-[10px] text-orange-400 font-semibold">⚡ 글쓰기 클릭</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 7: GUIDE */}
        {activeTab === 'guide' && (
          <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
            <div>
              <h2 className="text-lg font-bold text-white">인스레드 치트 시작 가이드 & 시스템 진단</h2>
              <p className="text-xs text-zinc-400">
                확장 프로그램과 공식 대시보드 간 실시간 연결 상태 및 100% 수익화 파이프라인 가이드입니다.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🩺 실시간 시스템 연동 상태</span>
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 text-lg">●</span>
                    <div>
                      <span className="text-xs font-bold text-white block">크롬 확장프로그램 (Chrome MV3)</span>
                      <span className="text-[11px] text-zinc-400">InThread Cheat Extension</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-400">
                    {extInstalled ? `연결 성공 (v${extVersion || '1.0.0'})` : '연결 대기중'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 text-lg">●</span>
                    <div>
                      <span className="text-xs font-bold text-white block">Threads 브라우저 세션</span>
                      <span className="text-[11px] text-zinc-400">threads.com 직접 연결</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-400">사용 준비 완료</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span className={settings.coupangSubId ? 'text-emerald-400 text-lg' : 'text-amber-400 text-lg'}>
                      ●
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white block">쿠팡 파트너스 SubID</span>
                      <span className="text-[11px] text-zinc-400">
                        {settings.coupangSubId ? `등록됨: ${settings.coupangSubId}` : '쿠팡 소싱 탭에서 SubID를 등록해주세요'}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold ${settings.coupangSubId ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {settings.coupangSubId ? '동기화 완료' : '설정 권장'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white">🚀 스레드 쿠팡 파트너스 3단계 수익화 루틴</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-black flex items-center justify-center">
                    1
                  </span>
                  <h4 className="text-xs font-bold text-white">Threads에서 터진 글 수집</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    스레드 피드를 구경하다가 마음에 드는 상품 글에 뜨는 [⚡ 치트 레퍼런스] 버튼을 클릭해 대시보드로 수집합니다.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-black flex items-center justify-center">
                    2
                  </span>
                  <h4 className="text-xs font-bold text-white">AI 스튜디오에서 훅 변환</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    5가지 바이럴 훅 템플릿 중 하나를 골라 내 말투로 변환하고 내 쿠팡 파트너스 링크와 공정위 문구를 자동으로 붙입니다.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-[#0F1420] border border-zinc-800 space-y-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-black flex items-center justify-center">
                    3
                  </span>
                  <h4 className="text-xs font-bold text-white">원클릭 발행 및 수익 창출</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    [⚡ 스레드 즉시 글쓰기]를 누르면 스레드 창이 자동으로 열려 Ctrl+V로 바로 게시할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
