import React, { useState, useEffect } from 'react';
import { ThreadsAuthSession, AppSettings } from '../types/threads';
import { checkThreadsAuth } from '../services/threadsApi';
import { getSettings, saveSettings } from '../services/storage';
import { formatCoupangAffiliateLink } from '../services/coupangApi';
import '../popup/index.css';

export const OnboardingApp: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [auth, setAuth] = useState<ThreadsAuthSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [settings, setAppSettings] = useState<AppSettings>({
    autoExtractShoppingLink: true,
    defaultScheduleDelayMinutes: 10,
    floatingButtonVisible: true
  });
  const [subId, setSubId] = useState('');
  const [savedSubId, setSavedSubId] = useState(false);
  const [testUrl, setTestUrl] = useState('https://www.coupang.com/vp/products/12345678');
  const [convertedUrl, setConvertedUrl] = useState('');

  const loadInitialData = async () => {
    setCheckingAuth(true);
    const [authRes, setts] = await Promise.all([
      checkThreadsAuth(),
      getSettings()
    ]);
    setAuth(authRes);
    setCheckingAuth(false);
    setAppSettings(setts);
    if (setts.coupangSubId) {
      setSubId(setts.coupangSubId);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleSaveSubId = async () => {
    await saveSettings({ coupangSubId: subId.trim() });
    setSavedSubId(true);
    const converted = formatCoupangAffiliateLink(testUrl, subId.trim());
    setConvertedUrl(converted);
    setTimeout(() => setSavedSubId(false), 2500);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start py-12 px-4 selection:bg-orange-500 selection:text-white">
      {/* Container */}
      <div className="w-full max-w-3xl space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-orange-600 to-amber-500 text-3xl shadow-xl shadow-orange-600/30 ring-1 ring-white/20">
            ⚡
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            인스레드 치트 <span className="text-orange-500 font-extrabold">대시보드</span>
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            스레드에서 떡상한 쇼핑 피드를 1클릭으로 레퍼런스하고, AI 후킹 문구로 변형하여 내 스레드에 바로 올리는 치트키 솔루션
          </p>
        </div>

        {/* Step Navigation Pill */}
        <div className="flex items-center justify-center">
          <div className="flex items-center p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-lg">
            {[
              { num: 1, title: '스레드 연동' },
              { num: 2, title: '쿠팡 파트너스' },
              { num: 3, title: '치트 사용법' },
              { num: 4, title: '시작하기' }
            ].map(step => (
              <button
                key={step.num}
                onClick={() => setCurrentStep(step.num)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  currentStep === step.num
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  currentStep === step.num ? 'bg-white text-orange-600' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {step.num}
                </span>
                <span>{step.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step Card Content */}
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* STEP 1: Threads Auth Check */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Step 1 of 4</span>
                <h2 className="text-xl font-extrabold text-white mt-1">Threads 계정 연결 확인</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  스레드(threads.com) 웹에 로그인되어 있으면 브라우저 쿠키를 통해 백그라운드에서 바로 연결됩니다.
                </p>
              </div>

              {checkingAuth ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-zinc-400 font-medium">Threads 세션 확인 중…</span>
                </div>
              ) : auth?.loggedIn ? (
                <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-4">
                  <div className="flex items-center gap-4">
                    {auth.profilePicUrl ? (
                      <img src={auth.profilePicUrl} alt="" className="w-14 h-14 rounded-full border-2 border-emerald-500/30 object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
                        @
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-white">@{auth.username || '내 스레드'}</h3>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold">연결됨 ✓</span>
                      </div>
                      <p className="text-xs text-emerald-300/80 mt-1">
                        Threads 세션이 정상적으로 인식되었습니다. 피드 추출 및 바로 올리기 준비 완료!
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <h3 className="text-sm font-bold text-amber-300">Threads 로그인이 필요합니다</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        threads.com에 로그인 후 아래 [새로고침] 버튼을 눌러주세요.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2.5 pt-2">
                    <a
                      href="https://www.threads.com"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition"
                    >
                      Threads 로그인하러 가기 ↗
                    </a>
                    <button
                      type="button"
                      onClick={loadInitialData}
                      className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition"
                    >
                      상태 새로고침
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-extrabold text-xs shadow-lg shadow-orange-500/25 transition flex items-center gap-2"
                >
                  <span>다음: 쿠팡 파트너스 설정</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Coupang Settings */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Step 2 of 4</span>
                <h2 className="text-xl font-extrabold text-white mt-1">쿠팡 파트너스 Sub ID 설정</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  레퍼런스 피드의 상품 링크를 내 파트너스 정산용 링크로 자동 변환하기 위해 Sub ID를 입력하세요.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-200 block mb-1.5">내 쿠팡 파트너스 Sub ID (선택)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subId}
                      onChange={e => setSubId(e.target.value)}
                      placeholder="예: thread_01 (영문/숫자)"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-orange-500 text-white text-xs outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={handleSaveSubId}
                      className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition shadow"
                    >
                      {savedSubId ? '✓ 저장 완료!' : '저장하기'}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5">
                    * Sub ID를 비워두면 링크 변환 시 원본 링크 구조를 그대로 유지합니다.
                  </p>
                </div>

                {/* Live Preview */}
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300">⚡ 실시간 변환 미리보기</span>
                    <button
                      type="button"
                      onClick={() => setConvertedUrl(formatCoupangAffiliateLink(testUrl, subId.trim()))}
                      className="text-[11px] text-orange-400 hover:underline"
                    >
                      미리보기 갱신
                    </button>
                  </div>
                  <div className="text-xs font-mono p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 break-all">
                    {convertedUrl || formatCoupangAffiliateLink(testUrl, subId.trim())}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition"
                >
                  ← 이전 단계
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-extrabold text-xs shadow-lg shadow-orange-500/25 transition flex items-center gap-2"
                >
                  <span>다음: 3초 치트 사용법</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Tutorial / Workflow */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Step 3 of 4</span>
                <h2 className="text-xl font-extrabold text-white mt-1">3초 마스터: 쇼핑 피드 치트 워크플로우</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  스레드에서 피드를 발견하고 내 스레드에 업로드하기까지 단 3단계면 끝납니다.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 font-black flex items-center justify-center text-sm border border-orange-500/20">
                    1
                  </div>
                  <h4 className="text-sm font-bold text-white">피드 발견 & [⚡ 치트] 클릭</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    threads.com 피드마다 나타나는 <strong className="text-orange-400 font-semibold">[⚡ 치트 레퍼런스]</strong> 버튼을 누르면 본문과 고화질 이미지가 한 번에 캡처됩니다.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 font-black flex items-center justify-center text-sm border border-purple-500/20">
                    2
                  </div>
                  <h4 className="text-sm font-bold text-white">AI 후킹 스타일 선택</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    호기심 유발형, 찐후기형, 마감특가형 중 원하는 스타일을 클릭하면 첫 문장과 구성이 바이럴하게 자동 리라이팅됩니다.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 font-black flex items-center justify-center text-sm border border-emerald-500/20">
                    3
                  </div>
                  <h4 className="text-sm font-bold text-white">[내 스레드에 올리기] 완료!</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    클릭 한 번으로 글쓰기 창이 열리고 클립보드에 복사된 내용이 자동 주입되어 Ctrl+V 즉시 발행 또는 예약할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition"
                >
                  ← 이전 단계
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-extrabold text-xs shadow-lg shadow-orange-500/25 transition flex items-center gap-2"
                >
                  <span>다음: 준비 완료</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Ready to Launch */}
          {currentStep === 4 && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-3xl mx-auto shadow-inner">
                🎉
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">모든 준비가 완료되었습니다!</h2>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                  이제 스레드로 이동하여 타겟으로 삼을 만한 쇼핑 피드를 찾아보고, [⚡ 치트 레퍼런스]를 직접 사용해보세요.
                </p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href="https://www.threads.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-extrabold text-sm shadow-xl shadow-orange-500/30 transition flex items-center justify-center gap-2"
                >
                  <span>⚡ 스레드로 이동하여 시작하기</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-zinc-500 font-medium">
          인스레드 치트 (InThread Cheat) v1.0.0 · 로컬 세션 전용
        </div>
      </div>
    </div>
  );
};
