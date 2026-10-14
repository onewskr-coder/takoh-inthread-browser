const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require(process.env.STUDIO_JSDOM || 'jsdom');

console.log('Testing Studio Discovery UI & Reference Library DOM Integration...');

const htmlPath = path.join(__dirname, 'studio_web', 'index.html');
const rawHtml = fs.readFileSync(htmlPath, 'utf8').replace('__STUDIO_TOKEN__', 'test-token-xyz');
const studioJs = fs.readFileSync(path.join(__dirname, 'studio_web', 'studio.js'), 'utf8');
const workspaceJs = fs.readFileSync(path.join(__dirname, 'studio_web', 'workspace.js'), 'utf8');

const dom = new JSDOM(rawHtml, {
  url: 'http://127.0.0.1:5006/studio/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});

const { window } = dom;
const { document } = window;
window.AbortController = globalThis.AbortController;

// Mock fetch for Studio API calls
const mockStore = {
  references: [],
  youtube_configured: false,
  youtube_key: ''
};

window.fetch = async (url, options = {}) => {
  const urlStr = String(url);

  if (urlStr.includes('/studio/models')) {
    return { ok: true, json: async () => [] };
  }
  if (urlStr.includes('/studio/styles')) {
    return { ok: true, json: async () => [] };
  }
  if (urlStr.includes('/studio/jobs')) {
    return { ok: true, json: async () => [] };
  }
  if (urlStr.includes('/studio/downloads/folder')) {
    return { ok: true, json: async () => ({ path: 'C:/Downloads' }) };
  }
  if (urlStr.includes('/studio/downloads')) {
    return { ok: true, json: async () => [] };
  }
  if (urlStr.includes('/studio/usage')) {
    return { ok: true, json: async () => ({ groups: [], scope: '테스트', note: '안내' }) };
  }
  if (urlStr.includes('/studio/commerce-settings')) {
    return { ok: true, json: async () => ({ configured: [] }) };
  }
  if (urlStr.includes('/studio/youtube-settings')) {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      mockStore.youtube_key = body.youtube_api_key || '';
      mockStore.youtube_configured = Boolean(mockStore.youtube_key);
    }
    return {
      ok: true,
      json: async () => ({
        configured: mockStore.youtube_configured,
        api_key_masked: mockStore.youtube_configured ? 'AIza...9999' : '',
        usage: { requests_count: 5, quota_units: 105, cache_hits: 2, last_fetched: Date.now() / 1000 },
        verification_status: mockStore.youtube_configured ? '실서비스 연결됨' : '실서비스 검증 대기 (API 키 미등록)'
      })
    };
  }
  if (urlStr.includes('/studio/references/import')) {
    const body = JSON.parse(options.body || '{}');
    const ref = body.reference;
    const exists = mockStore.references.some(r => r.permalink === ref.permalink);
    if (exists) {
      return { ok: true, json: async () => ({ ...ref, already_saved: true }) };
    }
    mockStore.references.push(ref);
    return { ok: true, json: async () => ({ ...ref, already_saved: false }) };
  }
  if (urlStr.includes('/studio/references')) {
    return { ok: true, json: async () => mockStore.references };
  }
  if (urlStr.includes('/studio/discovery/gemini-settings')) {
    return {
      ok: true,
      json: async () => ({
        api_configured: false,
        model: 'gemini-2.5-flash',
        cli_installed: true,
        cli_model: 'gemini-2.5-flash'
      })
    };
  }
  if (urlStr.includes('/studio/discovery/catalogue')) {
    return {
      ok: true,
      json: async () => ({
        videos: 899,
        channels: 132,
        unseen: 889,
        registered_channels: []
      })
    };
  }
  if (urlStr.includes('/studio/discovery/status')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        supported_providers: ['youtube', 'serpapi', 'gemini_search', 'antigravity_search']
      })
    };
  }
  if (urlStr.includes('/studio/discovery')) {
    if (!mockStore.youtube_configured) {
      return {
        ok: true,
        json: async () => ({
          configured: false,
          verification_status: '실서비스 검증 대기 (API 키 미등록)',
          message: 'YouTube API 키가 등록되지 않았습니다. 설정·사용량 탭에서 등록해 주세요.',
          items: [],
          count: 0
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        configured: true,
        verification_status: '실서비스 연결됨',
        country: 'KR',
        mode: 'popular',
        count: 2,
        usage: { quota_units: 105 },
        items: [
          {
            video_id: 'vid_korea_pop1',
            url: 'https://www.youtube.com/watch?v=vid_korea_pop1',
            title: '인기 숏폼 레시피 모음 #shorts',
            channel: '쿠킹랩',
            published_at: '2026-10-10T08:00:00Z',
            fetched_at: Date.now() / 1000,
            fetched_at_str: '2026-10-12 16:30:00',
            thumbnail_url: 'https://i.ytimg.com/vi/vid_korea_pop1/hqdefault.jpg',
            duration_seconds: 52,
            duration_display: '0:52',
            view_count: 240000,
            view_count_display: '24.0만 회',
            shorts_classification: 'Shorts (해시태그 확인)',
            shorts_status: 'shorts',
            shorts_grounds: ['재생시간 52초 (60초 이하)', '제목/설명에 #shorts 태그 포함'],
            recommendation_reason: '관측 조회수 24.0만 회 · [KR] 공식 인기 차트 #1 · 요리 관심 일치',
            growth_rate: null,
            growth_display: '최초 관측 (성장률은 2회 이상 관측 후 산출)',
            license_type: 'creative_common',
            license_label: 'CC 표시 (Creative Commons BY 재사용 허용)',
            license_url: 'https://www.youtube.com/watch?v=vid_korea_pop1',
            attribution_draft: '출처: 쿠킹랩 - "인기 숏폼 레시피 모음 #shorts" (Creative Commons)',
            legal_notice: '※ 법적 문제 없음을 시스템이 자동 보장하지 않습니다.',
            source_type: 'chart',
            source_label: '[KR] 공식 인기 차트 #1',
            rank: 1
          },
          {
            video_id: 'vid_korea_pop2',
            url: 'https://www.youtube.com/watch?v=vid_korea_pop2',
            title: '신제품 언박싱 롱폼 영상',
            channel: '테크리뷰',
            published_at: '2026-10-11T09:00:00Z',
            fetched_at: Date.now() / 1000,
            fetched_at_str: '2026-10-12 16:30:00',
            thumbnail_url: 'https://i.ytimg.com/vi/vid_korea_pop2/hqdefault.jpg',
            duration_seconds: 720,
            duration_display: '12:00',
            view_count: 85000,
            view_count_display: '8.5만 회',
            shorts_classification: '롱폼 영상',
            shorts_status: 'long',
            shorts_grounds: ['재생시간 720초 (60초 초과)'],
            recommendation_reason: '관측 조회수 8.5만 회 · [KR] 공식 인기 차트 #2',
            growth_rate: null,
            growth_display: '최초 관측 (성장률은 2회 이상 관측 후 산출)',
            license_type: 'standard',
            license_label: '표준 YouTube 라이선스',
            attribution_draft: null,
            legal_notice: '표준 YouTube 라이선스 영상입니다.',
            source_type: 'chart',
            source_label: '[KR] 공식 인기 차트 #2',
            rank: 2
          }
        ]
      })
    };
  }
  return { ok: true, json: async () => ({}) };
};

// Execute studio.js and workspace.js in JSDOM (shared browser global lexical scope)
dom.window.eval(studioJs + '\n' + workspaceJs);

(async () => {
  // Test 1: Navigation to Discovery workspace
  const discoveryTab = document.getElementById('workspace-discovery-tab');
  assert.ok(discoveryTab, 'Discovery tab button exists in navigation');
  discoveryTab.click();

  await new Promise(r => setTimeout(r, 50));
  assert.equal(document.getElementById('discovery-workspace').hidden, false, 'Discovery workspace is visible');
  assert.equal(document.getElementById('download-workspace').hidden, true, 'Download workspace is hidden');
  assert.equal(document.getElementById('create-workspace').hidden, true, 'Create workspace is hidden');
  console.log('✓ 1. 콘텐츠 발견 탭 전환 및 작업 화면 표시 확인');

  // Test 2: Unconfigured API key state
  const banner = document.getElementById('discovery-status-banner');
  assert.ok(banner.classList.contains('unconfigured'), 'Banner shows unconfigured state: ' + banner.className);
  assert.ok(banner.textContent.includes('실서비스 검증 대기'), 'Banner explains waiting for key verification, got: ' + banner.textContent);
  const grid = document.getElementById('discovery-grid');
  assert.ok(grid.textContent.includes('API 키 미등록 상태입니다'), 'Grid explains key registration requirement without fake data');
  console.log('✓ 2. API 키 미등록 시 실서비스 검증 대기 배너 및 모의 자료 날조 방지 확인');

  // Test 3: Configure YouTube API Key in Settings workspace
  const settingsTab = document.getElementById('workspace-settings-tab');
  settingsTab.click();
  await new Promise(r => setTimeout(r, 50));

  const keyInput = document.getElementById('youtube-api-key');
  const saveKeyBtn = document.getElementById('save-youtube-key');
  assert.ok(keyInput && saveKeyBtn, 'YouTube API key input and save button exist');

  keyInput.value = 'AIzaSyTestValidKey123456789999';
  saveKeyBtn.click();
  await new Promise(r => setTimeout(r, 50));

  const ytStatus = document.getElementById('yt-stat-configured');
  assert.ok(ytStatus.textContent.includes('등록됨'), 'Settings reflects encrypted registered API key');
  console.log('✓ 3. 설정 탭에서 YouTube API 키 암호화 등록 및 상태 반영 확인');

  // Test 4: Fetch Discovery items with configured key
  discoveryTab.click();
  await new Promise(r => setTimeout(r, 50));

  assert.ok(banner.classList.contains('configured'), 'Banner shows configured connection');
  assert.ok(banner.textContent.includes('공식 인기 차트'), 'Banner distinguishes official popular chart');

  const cards = grid.querySelectorAll('.discovery-card');
  assert.equal(cards.length, 2, '2 discovery video cards rendered');

  // Validate Card 1 (Shorts + CC)
  const card1 = cards[0];
  assert.ok(card1.querySelector('.badge-rank').textContent.includes('#1'), 'Card 1 shows rank #1');
  assert.ok(card1.querySelector('.badge-duration').textContent.includes('0:52'), 'Card 1 shows duration 0:52');
  assert.ok(card1.querySelector('.discovery-card-title').textContent.includes('인기 숏폼 레시피'), 'Card 1 shows title');
  assert.ok(card1.querySelector('.tag-shorts').textContent.includes('Shorts'), 'Card 1 shows Shorts classification');
  assert.ok(card1.querySelector('.tag-cc').textContent.includes('CC 표시'), 'Card 1 shows CC tag');
  assert.ok(card1.querySelector('.discovery-box.reason').textContent.includes('추천 근거'), 'Card 1 shows recommendation grounds');
  assert.ok(card1.querySelector('.discovery-box.growth').textContent.includes('최초 관측'), 'Card 1 shows 1st observation note without fake prediction');
  assert.ok(card1.querySelector('.discovery-box.attribution').textContent.includes('출처: 쿠킹랩'), 'Card 1 shows CC attribution draft');
  assert.ok(card1.querySelector('.discovery-box.attribution').textContent.includes('자동 보장하지 않습니다'), 'Card 1 disclaims copyright warranty');
  console.log('✓ 4. 차트 순위, Shorts 근거, CC 출처 초안, 추천 근거, 실측 성장률 카드 렌더링 확인');

  // Test 5: Save to Reference Library (보관함 담기)
  const saveBtn1 = card1.querySelector('.btn-save-ref');
  assert.ok(saveBtn1, 'Save button exists');
  saveBtn1.click();
  await new Promise(r => setTimeout(r, 50));

  assert.equal(saveBtn1.textContent, '✓ 보관함 담김', 'Button reflects saved state');
  assert.equal(mockStore.references.length, 1, 'Reference stored in library');
  assert.equal(mockStore.references[0].discovery.rank, 1, 'Discovery metadata preserved in saved reference');

  // Click again to test deduplication
  saveBtn1.click();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(saveBtn1.textContent, '이미 담겨 있음', 'Duplicate save detected and informed');
  console.log('✓ 5. 보관함 담기 실행, 메타데이터 보존, 중복 감지 확인');

  // Test 6: Verify Reference Library rendering of discovery item
  const createTab = document.getElementById('workspace-create-tab');
  createTab.click();
  await new Promise(r => setTimeout(r, 50));

  const refCard = document.querySelector('.reference-card');
  assert.ok(refCard, 'Reference card rendered in Create workspace');
  const discMeta = refCard.querySelector('.ref-discovery-meta');
  assert.ok(discMeta, 'Discovery metadata box rendered on reference card');
  assert.ok(discMeta.textContent.includes('공식 인기 차트 #1'), 'Reference card shows chart origin');
  assert.ok(discMeta.textContent.includes('Shorts (해시태그 확인)'), 'Reference card shows Shorts grounds');
  assert.ok(discMeta.textContent.includes('CC 표시'), 'Reference card shows CC license');

  const prepareBtn = refCard.querySelector('.btn-prepare-ref');
  assert.ok(prepareBtn, '“이 콘텐츠로 원본 준비 →” button exists to connect to analysis stage');
  console.log('✓ 6. 보관함 카드에서 발견 출처·추천근거·CC초안 확인 및 원본 준비 경로 연결 검증');

  console.log('\nAll Studio Discovery UI & Reference Library DOM tests PASSED successfully!');
  process.exit(0);
})();
