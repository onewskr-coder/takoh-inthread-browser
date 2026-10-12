import './threads-content.css';
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ThreadPostReference, ShoppingLink, QueueItem, AppSettings } from '../types/threads';
import { saveReference, getReferences, deleteReference, getSettings, saveSettings, addToQueue } from '../services/storage';
import { extractShoppingUrls, isShoppingContent, formatCoupangAffiliateLink } from '../services/coupangApi';
import { HOOKING_STYLES } from '../services/hookingTemplates';
import { downloadImage } from '../services/threadsApi';

// Store captured posts from GraphQL interceptor
const capturedPosts = new Map<string, any>();

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'inthread-cheat') return;

  if (event.data.kind === 'feed' && event.data.json) {
    parseFeedData(event.data.json);
  }
});

function parseFeedData(json: any) {
  try {
    const threadItems: any[] = [];
    
    function traverse(obj: any) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(traverse);
        return;
      }
      if (obj.thread_items && Array.isArray(obj.thread_items)) {
        threadItems.push(...obj.thread_items);
      }
      for (const key of Object.keys(obj)) {
        traverse(obj[key]);
      }
    }

    traverse(json);

    for (const item of threadItems) {
      const post = item?.post;
      if (!post) continue;

      const pk = String(post.pk || post.id || '');
      const code = String(post.code || '');
      const user = post.user || {};
      const caption = post.caption?.text || '';

      const imageUrls: string[] = [];
      if (post.image_versions2?.candidates?.length > 0) {
        imageUrls.push(post.image_versions2.candidates[0].url);
      }
      if (post.carousel_media && Array.isArray(post.carousel_media)) {
        for (const m of post.carousel_media) {
          if (m.image_versions2?.candidates?.length > 0) {
            imageUrls.push(m.image_versions2.candidates[0].url);
          }
        }
      }

      if (pk || code) {
        capturedPosts.set(pk, {
          id: pk,
          code,
          username: user.username || 'unknown',
          userPic: user.profile_pic_url,
          text: caption,
          imageUrls: Array.from(new Set(imageUrls)),
          likeCount: post.like_count,
          replyCount: post.text_post_app_info?.direct_reply_count
        });
        if (code) {
          capturedPosts.set(code, capturedPosts.get(pk));
        }
      }
    }
  } catch (err) {
    console.error('[InThread Cheat] Feed parse error:', err);
  }
}

// Global Toast
function showToast(message: string) {
  const existing = document.getElementById('itc-toast-root');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'itc-toast-root';
  container.className = 'itc-toast';
  container.innerHTML = `<span>⚡</span><span>${message}</span>`;
  document.body.appendChild(container);

  setTimeout(() => {
    container.remove();
  }, 3500);
}

// Global function to open Threads composer on the page
function triggerThreadsComposer(textToPaste: string) {
  // 1. Copy formatted text to clipboard
  navigator.clipboard.writeText(textToPaste);

  // 2. Look for Threads "Create / 새 스레드" buttons in DOM
  const selectors = [
    'svg[aria-label*="새 스레드"]',
    'svg[aria-label*="Create"]',
    'div[role="button"][aria-label*="스레드"]',
    'div[role="button"][aria-label*="Create"]',
    'a[href*="/create"]',
    'button[aria-label*="스레드"]'
  ];

  let createBtn: HTMLElement | null = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) {
      createBtn = el.closest('div[role="button"], a, button') as HTMLElement || el;
      break;
    }
  }

  if (!createBtn) {
    // Fallback search by text
    const allBtns = Array.from(document.querySelectorAll('div[role="button"], button, a'));
    createBtn = (allBtns.find(b => {
      const txt = (b.getAttribute('aria-label') || b.textContent || '').trim();
      return txt.includes('스레드 시작') || txt === '새 스레드' || txt === '스레드 만들기' || txt === 'Create';
    }) as HTMLElement) || null;
  }

  if (createBtn) {
    createBtn.click();
    showToast('⚡ 스레드 글쓰기 창이 열렸습니다! Ctrl+V로 본문을 붙여넣으세요.');
    setTimeout(() => {
      const editor = document.querySelector('div[contenteditable="true"], div[role="textbox"]') as HTMLElement | null;
      if (editor) editor.focus();
    }, 450);
  } else {
    showToast('⚡ 클립보드에 복사 완료! 스레드 글쓰기 창을 열고 Ctrl+V를 누르세요.');
  }
}

// Global dispatcher to open Right Sidebar from any feed button
let globalOpenSidebarWithPost: ((post: ThreadPostReference) => void) | null = null;

// Right Sidebar In-Page Component
const RightSidebarDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'library' | 'coupang'>('editor');
  const [currentPost, setCurrentPost] = useState<ThreadPostReference | null>(null);
  const [editedText, setEditedText] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('curiosity');
  const [shoppingUrl, setShoppingUrl] = useState('');
  const [includeFTC, setIncludeFTC] = useState(true);
  const [placement, setPlacement] = useState<'comment' | 'body'>('comment');
  const [references, setReferences] = useState<ThreadPostReference[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    coupangSubId: '',
    autoExtractShoppingLink: true,
    defaultScheduleDelayMinutes: 10,
    floatingButtonVisible: true
  });
  const [subIdInput, setSubIdInput] = useState('');
  const [coupangRawUrl, setCoupangRawUrl] = useState('');
  const [convertedAffiliateLink, setConvertedAffiliateLink] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Load saved references and settings on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const refs = await getReferences();
      setReferences(refs);
      if (refs.length > 0 && !currentPost) {
        loadPostIntoEditor(refs[0]);
      }
      const sett = await getSettings();
      setSettings(sett);
      setSubIdInput(sett.coupangSubId || '');
    } catch (e) {
      console.error(e);
    }
  };

  const loadPostIntoEditor = (post: ThreadPostReference) => {
    setCurrentPost(post);
    const url = post.shoppingLinks[0]?.url || '';
    setShoppingUrl(url);

    const style = HOOKING_STYLES.find(s => s.id === selectedStyle) || HOOKING_STYLES[1];
    setEditedText(style.transform(post.text, url));
    setActiveTab('editor');
    setIsOpen(true);
  };

  // Register global opener for feed buttons
  useEffect(() => {
    globalOpenSidebarWithPost = (post: ThreadPostReference) => {
      loadPostIntoEditor(post);
      setReferences(prev => {
        const filtered = prev.filter(r => r.id !== post.id);
        return [post, ...filtered];
      });
      showToast(`✓ [@${post.username}] 글을 담았습니다! 우측 패널에서 바로 편집하세요.`);
    };
    return () => {
      globalOpenSidebarWithPost = null;
    };
  }, [selectedStyle]);

  // Hooking style transform
  const handleApplyStyle = (styleId: string) => {
    setSelectedStyle(styleId);
    const style = HOOKING_STYLES.find(s => s.id === styleId);
    if (style && currentPost) {
      setEditedText(style.transform(currentPost.text, shoppingUrl));
      showToast(`⚡ ${style.label} 스타일 적용 완료!`);
    }
  };

  // Build final post copy (with FTC & Coupang link)
  const buildFinalCopy = () => {
    let finalPost = editedText.trim();
    const ftcNotice = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

    if (shoppingUrl.trim()) {
      const formattedLink = formatCoupangAffiliateLink(shoppingUrl.trim(), settings.coupangSubId);
      if (placement === 'body') {
        finalPost += `\n\n🔗 상품 링크:\n${formattedLink}`;
        if (includeFTC) {
          finalPost = `${ftcNotice}\n\n${finalPost}`;
        }
      }
    }
    return finalPost;
  };

  const handlePublishNow = () => {
    const finalCopy = buildFinalCopy();
    triggerThreadsComposer(finalCopy);
  };

  const handleCopy = async () => {
    const finalCopy = buildFinalCopy();
    await navigator.clipboard.writeText(finalCopy);
    showToast('✓ 본문이 클립보드에 복사되었습니다!');
  };

  const handleAddToScheduleQueue = async () => {
    const finalCopy = buildFinalCopy();
    const newItem: QueueItem = {
      id: 'q_' + Date.now(),
      text: finalCopy,
      scheduledAt: Date.now() + 1000 * 60 * settings.defaultScheduleDelayMinutes,
      status: 'pending',
      createdAt: Date.now(),
      attempts: 0
    };
    await addToQueue(newItem);
    showToast(`📅 ${settings.defaultScheduleDelayMinutes}분 뒤 발행 대기열에 등록되었습니다!`);
  };

  const handleDownloadImages = async () => {
    if (!currentPost || currentPost.imageUrls.length === 0) return;
    setDownloading(true);
    try {
      for (let i = 0; i < currentPost.imageUrls.length; i++) {
        await downloadImage(currentPost.imageUrls[i], `inthread-${currentPost.code || 'img'}-${i + 1}.jpg`);
      }
      showToast(`🖼️ 이미지 ${currentPost.imageUrls.length}장 다운로드 시작!`);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveSubId = async () => {
    const clean = subIdInput.trim();
    const updated = await saveSettings({ coupangSubId: clean });
    setSettings(updated);
    showToast(`✓ SubID [${clean || '기본값'}] 저장 완료!`);
  };

  const handleConvertCoupangUrl = () => {
    if (!coupangRawUrl.trim()) return;
    const formatted = formatCoupangAffiliateLink(coupangRawUrl.trim(), settings.coupangSubId);
    setConvertedAffiliateLink(formatted);
    showToast('✓ 내 SubID 제휴 링크가 생성되었습니다!');
  };

  const handleDeleteReference = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteReference(id);
    setReferences(prev => prev.filter(r => r.id !== id));
    showToast('✓ 레퍼런스가 삭제되었습니다.');
  };

  return (
    <>
      {/* Persistent Floating Trigger on Threads page */}
      <div
        className="itc-floating-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="인스레드 치트 우측 팝업 열기"
      >
        <span>⚡ 인스레드 치트</span>
        <span className="itc-trigger-badge">{references.length}</span>
      </div>

      {/* Backdrop overlay */}
      <div
        className={`itc-sidebar-overlay ${isOpen ? 'itc-open' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Right Slide-Over Panel */}
      <aside className={`itc-sidebar ${isOpen ? 'itc-open' : ''}`}>
        {/* Header */}
        <div className="itc-sidebar-header">
          <div className="itc-sidebar-title">
            <span style={{ fontSize: '22px' }}>⚡</span>
            <div>
              <h3>인스레드 치트 스튜디오</h3>
              <p>스레드 피드 즉시 담기 · AI 후킹 변환 · 바로 발행</p>
            </div>
          </div>
          <button className="itc-close-btn" onClick={() => setIsOpen(false)} title="닫기">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="itc-tabs">
          <button
            className={`itc-tab-btn ${activeTab === 'editor' ? 'itc-tab-active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            <span>✍️ 즉시 편집·발행</span>
          </button>
          <button
            className={`itc-tab-btn ${activeTab === 'library' ? 'itc-tab-active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            <span>📥 담아둔 글 ({references.length})</span>
          </button>
          <button
            className={`itc-tab-btn ${activeTab === 'coupang' ? 'itc-tab-active' : ''}`}
            onClick={() => setActiveTab('coupang')}
          >
            <span>🛍️ 쿠팡 링크</span>
          </button>
        </div>

        {/* Tab 1: Editor & Publish */}
        {activeTab === 'editor' && (
          <>
            <div className="itc-sidebar-body">
              {/* Active post info */}
              {currentPost ? (
                <div className="itc-source-box">
                  <div className="itc-source-header">
                    <div className="itc-source-user">
                      <img
                        src={currentPost.userPic || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'}
                        alt=""
                      />
                      <span>@{currentPost.username}</span>
                    </div>
                    {currentPost.isShoppingFeed && (
                      <span className="itc-shopping-tag">🛍️ 쇼핑 감지</span>
                    )}
                  </div>
                  <p className="itc-source-text">{currentPost.text}</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: '#71717a', fontSize: '12px' }}>
                  스레드 피드에서 <b>[⚡ 담기 & 바로 편집]</b> 버튼을 누르면 이 곳에 즉시 불러와집니다.
                </div>
              )}

              {/* 5 Viral Hook Presets */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#d4d4d8', display: 'block', marginBottom: '6px' }}>
                  🎯 AI 바이럴 훅 템플릿 (원클릭 문체 변환)
                </label>
                <div className="itc-hook-grid">
                  {HOOKING_STYLES.map(style => (
                    <button
                      key={style.id}
                      className={`itc-hook-btn ${selectedStyle === style.id ? 'itc-hook-active' : ''}`}
                      onClick={() => handleApplyStyle(style.id)}
                    >
                      <div>{style.label}</div>
                      <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '2px' }}>{style.badge}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Content Textarea */}
              <div className="itc-textarea-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#d4d4d8' }}>발행할 게시물 문구</label>
                  <span style={{ fontSize: '11px', color: editedText.length > 500 ? '#ef4444' : '#a1a1aa', fontWeight: 700 }}>
                    {editedText.length} / 500자
                  </span>
                </div>
                <textarea
                  className="itc-textarea"
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  placeholder="스레드에 올릴 내용을 입력하세요..."
                />
              </div>

              {/* Images Preview & Download */}
              {currentPost && currentPost.imageUrls.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#d4d4d8' }}>
                      첨부 이미지 ({currentPost.imageUrls.length}장)
                    </label>
                    <button
                      onClick={handleDownloadImages}
                      disabled={downloading}
                      style={{
                        background: '#18181b',
                        border: '1px solid #3f3f46',
                        color: '#f4f4f5',
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                    >
                      {downloading ? '다운로드 중…' : '📥 이미지 전체 다운'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {currentPost.imageUrls.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt=""
                        style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #27272a' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Coupang Monetization & FTC Options */}
              <div className="itc-monetize-box">
                <div className="itc-monetize-title">
                  <span>🛍️ 쿠팡 파트너스 링크 & 공정위 설정</span>
                  <span style={{ fontSize: '10px', color: '#f97316' }}>SubID: {settings.coupangSubId || '미설정'}</span>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>
                    쿠팡 상품 링크 (원클릭 자동 변환)
                  </label>
                  <input
                    type="text"
                    className="itc-input"
                    value={shoppingUrl}
                    onChange={e => setShoppingUrl(e.target.value)}
                    placeholder="https://www.coupang.com/vp/products/..."
                  />
                </div>

                {shoppingUrl && (
                  <>
                    <div>
                      <label style={{ fontSize: '10px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>링크 배치 위치</label>
                      <div className="itc-pill-row">
                        <button
                          className={`itc-pill-btn ${placement === 'comment' ? 'itc-pill-active' : ''}`}
                          onClick={() => setPlacement('comment')}
                        >
                          첫 댓글(타래)에 달기
                        </button>
                        <button
                          className={`itc-pill-btn ${placement === 'body' ? 'itc-pill-active' : ''}`}
                          onClick={() => setPlacement('body')}
                        >
                          본문 하단에 포함
                        </button>
                      </div>
                    </div>

                    <div>
                      <button
                        className={`itc-pill-btn ${includeFTC ? 'itc-pill-active' : ''}`}
                        style={{ width: '100%' }}
                        onClick={() => setIncludeFTC(!includeFTC)}
                      >
                        {includeFTC ? '✓ 공정위 문구 자동 부착 (ON)' : '✕ 공정위 문구 제외 (OFF)'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Sticky Bottom Actions */}
            <div className="itc-sidebar-footer">
              <button className="itc-publish-main-btn" onClick={handlePublishNow}>
                <span>⚡ 내 스레드에 바로 올리기 (즉시 발행)</span>
              </button>
              <div className="itc-secondary-btn-row">
                <button className="itc-secondary-btn" onClick={handleCopy}>
                  📋 문구 복사
                </button>
                <button className="itc-secondary-btn" onClick={handleAddToScheduleQueue}>
                  📅 예약 대기열 추가
                </button>
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Saved Library */}
        {activeTab === 'library' && (
          <div className="itc-sidebar-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f4f4f5' }}>
                담아둔 피드 목록 ({references.length}개)
              </span>
            </div>

            {references.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#71717a', fontSize: '12px' }}>
                스레드 피드를 구경하며 <b>[⚡ 담기 & 바로 편집]</b> 버튼을 눌러보세요!
              </div>
            ) : (
              references.map(ref => (
                <div
                  key={ref.id}
                  className="itc-lib-item"
                  onClick={() => loadPostIntoEditor(ref)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '12px', color: '#ffffff' }}>@{ref.username}</span>
                      {ref.isShoppingFeed && (
                        <span className="itc-shopping-tag" style={{ padding: '2px 6px', fontSize: '10px' }}>쇼핑</span>
                      )}
                    </div>
                    <button
                      onClick={e => handleDeleteReference(ref.id, e)}
                      style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '12px' }}
                      title="삭제"
                    >
                      ✕
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#d4d4d8', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {ref.text}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#71717a' }}>
                    <span>❤️ {(ref.likeCount ?? 0).toLocaleString()}</span>
                    <span style={{ color: '#f97316', fontWeight: 700 }}>⚡ 클릭하여 편집</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Coupang Link Tool */}
        {activeTab === 'coupang' && (
          <div className="itc-sidebar-body">
            <div className="itc-monetize-box">
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>🔑 내 쿠팡 파트너스 SubID</span>
              <p style={{ fontSize: '11px', color: '#a1a1aa', margin: 0 }}>
                스레드 피드에서 복사/추출하는 모든 링크에 내 SubID가 자동 부여되어 수익이 정확히 정산됩니다.
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  className="itc-input"
                  value={subIdInput}
                  onChange={e => setSubIdInput(e.target.value)}
                  placeholder="예: inthread_01"
                />
                <button
                  onClick={handleSaveSubId}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: '#f97316', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}
                >
                  저장
                </button>
              </div>
            </div>

            <div className="itc-monetize-box">
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>⚡ 일반 쿠팡 링크 → 제휴 링크 변환</span>
              <input
                type="text"
                className="itc-input"
                value={coupangRawUrl}
                onChange={e => setCoupangRawUrl(e.target.value)}
                placeholder="일반 쿠팡 상품 주소 붙여넣기..."
              />
              <button
                onClick={handleConvertCoupangUrl}
                style={{ padding: '10px', borderRadius: '8px', background: '#27272a', color: '#fff', border: '1px solid #3f3f46', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}
              >
                변환하기
              </button>

              {convertedAffiliateLink && (
                <div style={{ background: '#090d14', border: '1px solid rgba(249, 115, 22, 0.4)', borderRadius: '8px', padding: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#a1a1aa', fontWeight: 700, display: 'block', marginBottom: '4px' }}>생성된 링크:</span>
                  <p style={{ fontSize: '11px', color: '#f97316', wordBreak: 'break-all', margin: 0, fontWeight: 700 }}>
                    {convertedAffiliateLink}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(convertedAffiliateLink);
                      showToast('✓ 파트너스 링크가 복사되었습니다!');
                    }}
                    style={{ marginTop: '8px', padding: '6px 12px', borderRadius: '6px', background: '#f97316', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '11px' }}
                  >
                    링크 복사
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

// Mount the Right Sidebar App on Threads page
function mountInThreadApp() {
  if (document.getElementById('itc-root')) return;

  const mountPoint = document.createElement('div');
  mountPoint.id = 'itc-root';
  document.body.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<RightSidebarDrawer />);
}

// Inject floating buttons into each post in Threads feed
function attachCheatButtons() {
  const postElements = Array.from(document.querySelectorAll('div[data-pressable-container="true"], article, div[tabindex="-1"]'));

  for (const el of postElements) {
    if (el.getAttribute('data-itc-attached')) continue;

    const linkEl = el.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
    if (!linkEl) continue;

    const match = linkEl.href.match(/\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/);
    if (!match) continue;

    const [, username, code] = match;
    el.setAttribute('data-itc-attached', 'true');

    const textEl = el.querySelector('span[dir="auto"], div[dir="auto"]');
    const text = textEl?.textContent || '';

    const imgEls = Array.from(el.querySelectorAll('img[src*="cdninstagram"], img[src*="threads"]')) as HTMLImageElement[];
    const domImageUrls = imgEls.map(img => img.src).filter(src => !src.includes('profile') && !src.includes('s150x150'));

    const isShopping = isShoppingContent(text);
    const shoppingLinks: ShoppingLink[] = extractShoppingUrls(text).map(url => ({
      url,
      type: url.includes('coupang') ? 'coupang' : 'other'
    }));

    const container = document.createElement('div');
    container.className = 'itc-badge-container';

    const btn = document.createElement('button');
    btn.className = 'itc-cheat-btn';
    btn.innerHTML = '⚡ 담기 & 바로 편집';
    btn.title = '이 글을 우측 스튜디오로 담아서 바로 수정/발행';

    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const captured = capturedPosts.get(code) || {};
      const finalPost: ThreadPostReference = {
        id: captured.id || code,
        code,
        username: captured.username || username,
        userPic: captured.userPic,
        text: captured.text || text,
        imageUrls: captured.imageUrls?.length ? captured.imageUrls : domImageUrls,
        videoUrls: captured.videoUrls || [],
        permalink: linkEl.href,
        shoppingLinks: captured.shoppingLinks || shoppingLinks,
        isShoppingFeed: isShopping,
        createdAt: Date.now()
      };

      await saveReference(finalPost);

      if (globalOpenSidebarWithPost) {
        globalOpenSidebarWithPost(finalPost);
      }
    };

    container.appendChild(btn);

    if (isShopping) {
      const shoppingBadge = document.createElement('span');
      shoppingBadge.className = 'itc-shopping-tag';
      shoppingBadge.innerHTML = '🛍️ 쿠팡/쇼핑 감지';
      container.appendChild(shoppingBadge);
    }

    const targetArea = el.querySelector('div[role="group"]') || el;
    targetArea.appendChild(container);
  }
}

// Initialize on page load
function init() {
  mountInThreadApp();
  attachCheatButtons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Observer for infinite scrolling on Threads
const observer = new MutationObserver(() => {
  attachCheatButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

setTimeout(init, 1500);

console.log('[InThread Cheat] Right Sidebar and Content Script loaded successfully.');
