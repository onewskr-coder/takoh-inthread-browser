const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require(process.env.STUDIO_JSDOM || 'jsdom');

console.log('Testing Threads Carousel Modal with real content-core.js engine regression...');

const html = `
<!DOCTYPE html>
<html>
<head></head>
<body>
  <!-- 피드 포스트 (캐러셀: 이미지 2개 + 비디오 1개) -->
  <article id="feed-post">
    <a href="https://www.threads.com/@creator/post/CAROUSEL1">게시물 링크</a>
    <div id="carousel-feed">
      <div class="tile" id="tile-img1">
        <img id="feed-img1" src="https://cdn.threads.net/img1_thumb.jpg">
      </div>
      <div class="tile" id="tile-vid2">
        <video id="feed-vid2" src="https://cdn.threads.net/vid2_feed.mp4" poster="https://cdn.threads.net/vid2_poster.jpg"></video>
      </div>
      <div class="tile" id="tile-img3">
        <img id="feed-img3" src="https://cdn.threads.net/img3_thumb.jpg">
      </div>
    </div>
  </article>

  <!-- 가짜/숨겨진 dialog 1 (화면 밖) -->
  <div role="dialog" aria-modal="true" id="offscreen-dialog" style="position:fixed; left:-9999px; top:-9999px; width:500px; height:500px;">
    <img id="offscreen-img" src="https://cdn.threads.net/offscreen.jpg">
  </div>

  <!-- 가짜/숨겨진 dialog 2 (display: none) -->
  <div role="dialog" aria-modal="true" id="hidden-dialog" style="display:none; width:500px; height:500px;">
    <img id="hidden-img" src="https://cdn.threads.net/hidden.jpg">
  </div>

  <!-- 실제 미디어 확대창 컨테이너 -->
  <div id="modal-container"></div>
</body>
</html>
`;

const dom = new JSDOM(html, {
  url: 'https://www.threads.com/@creator/post/CAROUSEL1',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const w = dom.window;
const d = w.document;

function mockDimensions(el, rect) {
  Object.defineProperty(el, 'offsetWidth', { value: rect.width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: rect.height, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: rect.width, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: rect.height, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, configurable: true });
  el.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height
  });
}

// 뷰포트 크기
w.innerWidth = 1200;
w.innerHeight = 900;

// 피드 요소 크기 설정
mockDimensions(d.getElementById('feed-img1'), { left: 50, top: 100, width: 300, height: 400 });
mockDimensions(d.getElementById('feed-vid2'), { left: 400, top: 100, width: 300, height: 400 });
mockDimensions(d.getElementById('feed-img3'), { left: 750, top: 100, width: 300, height: 400 });

// 숨겨진 dialog 크기 설정
const offscreenDialog = d.getElementById('offscreen-dialog');
mockDimensions(offscreenDialog, { left: -9999, top: -9999, width: 500, height: 500 });
const offscreenImg = d.getElementById('offscreen-img');
mockDimensions(offscreenImg, { left: -9999, top: -9999, width: 400, height: 400 });

const hiddenDialog = d.getElementById('hidden-dialog');
mockDimensions(hiddenDialog, { left: 0, top: 0, width: 0, height: 0 });
const hiddenImg = d.getElementById('hidden-img');
mockDimensions(hiddenImg, { left: 0, top: 0, width: 0, height: 0 });

const downloadedFiles = [];
const collectedReferences = [];

w.chrome = {
  runtime: {
    id: 'takoh-extension-id',
    sendMessage: (msg, callback) => {
      if (msg.action === 'studioSaveReference') {
        collectedReferences.push(msg.reference);
        if (callback) callback({ success: true });
      } else if (callback) {
        callback({ success: true });
      }
    }
  }
};

let currentTime = 1700000000000;
w.Date.now = () => currentTime;

// 실제 content-core.js 로드 전 가상 브릿지 및 환경 준비
w.eval(fs.readFileSync('content-studio.js', 'utf8'));
w.eval(fs.readFileSync('content-core.js', 'utf8'));

// core의 triggerDownload 후킹하여 기록
const originalTriggerDownload = w.TAKCore.triggerDownload;
w.TAKCore.triggerDownload = (url, type, meta, platform) => {
  downloadedFiles.push({ url, type, meta, platform });
};

// Threads 모듈 로드
w.eval(fs.readFileSync('content-threads.js', 'utf8'));

// 1. 초기 상태 스캔 (숨겨진 dialog 2개가 있어도 확대창으로 오인되지 않아야 함)
w.TAKPlatform.process();
w.TAKCore.updateMediaControlPositions();

const feedControls = d.querySelectorAll('.takoh-threads-media-controls:not(.takoh-threads-modal-controls)');
assert.equal(feedControls.length, 3, '피드 컨트롤 3세트가 생성되어야 합니다.');
feedControls.forEach(ctrl => {
  assert.equal(ctrl.getAttribute('data-takoh-hidden'), null, '숨겨진 dialog로 인해 피드 버튼이 숨겨지면 안 됨');
  assert.notEqual(ctrl.style.display, 'none', '피드 버튼이 표시되어야 함');
});
assert.equal(d.querySelectorAll('.takoh-threads-modal-controls').length, 0, '화면 밖 dialog에는 모달 컨트롤이 생성되지 않아야 함');
console.log('✓ 1. 화면 밖/숨겨진 dialog 오인 방지 및 피드 버튼 정상 표시 확인 완료');

// 2. 실제 확대창 열림 (이미지 1 활성화)
const modalHtml = `
<div role="dialog" aria-modal="true" class="threads-lightbox-modal" style="position:fixed; left:0; top:0; width:1200px; height:900px;">
  <button aria-label="닫기" class="close-btn" style="position:fixed; top:20px; right:20px; width:40px; height:40px;"></button>
  <button aria-label="이전" class="prev-btn" style="position:fixed; top:400px; left:20px; width:40px; height:40px;"></button>
  <button aria-label="다음" class="next-btn" style="position:fixed; top:400px; right:20px; width:40px; height:40px;"></button>
  <div class="modal-carousel-stage">
    <img id="modal-img1" src="https://cdn.threads.net/img1_full.jpg" class="active-slide">
    <img id="modal-img2" src="https://cdn.threads.net/img2_full.jpg" style="display:none;">
    <video id="modal-vid3" src="https://cdn.threads.net/vid3_full.mp4" style="display:none;"></video>
  </div>
</div>
`;
d.getElementById('modal-container').innerHTML = modalHtml;
const modalEl = d.querySelector('.threads-lightbox-modal');
mockDimensions(modalEl, { left: 0, top: 0, width: 1200, height: 900 });

const closeBtn = modalEl.querySelector('.close-btn');
mockDimensions(closeBtn, { left: 1140, top: 20, width: 40, height: 40 });

const modalImg1 = d.getElementById('modal-img1');
const modalImg2 = d.getElementById('modal-img2');
const modalVid3 = d.getElementById('modal-vid3');

// 슬라이드 1 (화면 정중앙 600x600: left 300..900, top 150..750)
mockDimensions(modalImg1, { left: 300, top: 150, width: 600, height: 600 });
mockDimensions(modalImg2, { left: 0, top: 0, width: 0, height: 0 });
mockDimensions(modalVid3, { left: 0, top: 0, width: 0, height: 0 });

w.TAKPlatform.process();

// 검증 A: 확대창 열렸을 때 피드 버튼 숨김 상태
feedControls.forEach(ctrl => {
  assert.equal(ctrl.getAttribute('data-takoh-hidden'), 'true', '피드 컨트롤에 data-takoh-hidden이 설정되어야 함');
  assert.equal(ctrl.style.display, 'none', '피드 컨트롤이 숨겨져야 함');
});
assert.equal(d.querySelectorAll('.takoh-threads-modal-controls').length, 1, '확대창에는 단 1세트의 컨트롤만 생성되어야 함');
console.log('✓ 2. 확대창 오픈 시 피드 버튼 숨김 및 모달 버튼 1세트 생성 확인');

// 검증 B: 스크롤, 리사이즈, 공통 코어 엔진 주기 갱신(updateMediaControlPositions) 수행 후에도 피드 버튼이 숨겨져 있는지 회귀 검증
w.TAKCore.updateMediaControlPositions();
w.dispatchEvent(new w.Event('scroll'));
w.dispatchEvent(new w.Event('resize'));
w.TAKCore.updateMediaControlPositions();

feedControls.forEach(ctrl => {
  assert.equal(ctrl.style.display, 'none', '공통 엔진 갱신 후에도 피드 버튼 display:none이 유지되어야 함');
  assert.equal(ctrl.getAttribute('data-takoh-hidden'), 'true');
});
const modalCtrl = d.querySelector('.takoh-threads-modal-controls');
assert.equal(modalCtrl.style.display, 'flex', '모달 컨트롤은 계속 flex로 유지되어야 함');
console.log('✓ 3. 공통 위치 엔진(updateMediaControlPositions) 주기 갱신·스크롤·리사이즈 후에도 배경 버튼 숨김 유지 확인 (회귀 방지 완료)');

// 검증 C: 이미지 1 저장 및 수집 검증
downloadedFiles.length = 0;
collectedReferences.length = 0;
const saveBtn1 = modalCtrl.querySelector('.threads-download-btn');
assert.equal(saveBtn1.dataset.mediaType, 'image');
saveBtn1.click();
assert.equal(downloadedFiles.length, 1);
assert.equal(downloadedFiles[0].url, 'https://cdn.threads.net/img1_full.jpg');
assert.equal(downloadedFiles[0].type, 'image');

const collectBtn = modalCtrl.querySelector('.takoh-collect-reference');
assert.ok(collectBtn, '모달 컨트롤에 수집 버튼이 부착되어 있어야 함');
collectBtn.click();
assert.equal(collectedReferences.length, 1);
assert.equal(collectedReferences[0].imageUrls[0], 'https://cdn.threads.net/img1_full.jpg');
console.log('✓ 4. 슬라이드 1(이미지 1) 저장 및 수집 정확한 파일/레퍼런스 매핑 확인');

// 3. 슬라이드 전환: 이미지 1 → 이미지 2 (이미지→이미지 전환 검증)
modalImg1.style.display = 'none';
mockDimensions(modalImg1, { left: 0, top: 0, width: 0, height: 0 });

modalImg2.style.display = 'block';
mockDimensions(modalImg2, { left: 300, top: 150, width: 600, height: 600 });

w.TAKPlatform.process();
w.TAKCore.updateMediaControlPositions();

downloadedFiles.length = 0;
collectedReferences.length = 0;
// 1000ms 중복 클릭 방지 윈도우 우회
currentTime += 1500;
const saveBtn2 = modalCtrl.querySelector('.threads-download-btn');
assert.equal(saveBtn2.dataset.mediaType, 'image');
saveBtn2.click();
assert.equal(downloadedFiles.length, 1);
assert.equal(downloadedFiles[0].url, 'https://cdn.threads.net/img2_full.jpg');

collectBtn.click();
assert.equal(collectedReferences.length, 1);
assert.equal(collectedReferences[0].imageUrls[0], 'https://cdn.threads.net/img2_full.jpg');
console.log('✓ 5. 이미지→이미지 슬라이드 전환 시 저장 및 수집 대상 img2_full.jpg로 정상 갱신');

// 4. 슬라이드 전환: 이미지 2 → 영상 3 (이미지→영상 전환 검증)
modalImg2.style.display = 'none';
mockDimensions(modalImg2, { left: 0, top: 0, width: 0, height: 0 });

modalVid3.style.display = 'block';
mockDimensions(modalVid3, { left: 300, top: 150, width: 600, height: 600 });

w.TAKPlatform.process();
w.TAKCore.updateMediaControlPositions();

downloadedFiles.length = 0;
collectedReferences.length = 0;
currentTime += 1500;
const saveBtn3 = modalCtrl.querySelector('.threads-download-btn');
assert.equal(saveBtn3.dataset.mediaType, 'video', '영상 슬라이드로 전환 시 버튼 타입이 video로 변경되어야 함');
saveBtn3.click();
assert.equal(downloadedFiles.length, 1);
assert.equal(downloadedFiles[0].url, 'https://cdn.threads.net/vid3_full.mp4');
assert.equal(downloadedFiles[0].type, 'video');

collectBtn.click();
assert.equal(collectedReferences.length, 1);
assert.equal(collectedReferences[0].videoUrls[0], 'https://cdn.threads.net/vid3_full.mp4');
console.log('✓ 6. 이미지→영상 슬라이드 전환 시 버튼 타입 video 변경 및 저장/수집 vid3_full.mp4 갱신 확인');

// 5. 확대창 닫기 및 피드 복원 검증
d.getElementById('modal-container').innerHTML = '';
w.TAKPlatform.process();
w.TAKCore.updateMediaControlPositions();

assert.equal(d.querySelectorAll('.takoh-threads-modal-controls').length, 0, '모달 닫힘 시 모달 컨트롤 제거');
feedControls.forEach(ctrl => {
  assert.equal(ctrl.getAttribute('data-takoh-hidden'), null, '모달 닫힘 시 data-takoh-hidden 제거');
  assert.equal(ctrl.style.display, 'flex', '모달 닫힘 시 피드 컨트롤 display 정상 복원');
});
console.log('✓ 7. 확대창 닫기 시 모달 버튼 제거 및 피드 버튼 복원 확인');

// 6. 재확대 검증
d.getElementById('modal-container').innerHTML = modalHtml;
const reModal = d.querySelector('.threads-lightbox-modal');
mockDimensions(reModal, { left: 0, top: 0, width: 1200, height: 900 });
const reImg1 = d.getElementById('modal-img1');
mockDimensions(reImg1, { left: 300, top: 150, width: 600, height: 600 });

w.TAKPlatform.process();
w.TAKCore.updateMediaControlPositions();

feedControls.forEach(ctrl => {
  assert.equal(ctrl.style.display, 'none');
  assert.equal(ctrl.getAttribute('data-takoh-hidden'), 'true');
});
assert.equal(d.querySelectorAll('.takoh-threads-modal-controls').length, 1);
console.log('✓ 8. 재확대 시 피드 버튼 재숨김 및 모달 버튼 정상 재생성 확인');

dom.window.close();
console.log('\nAll content-core + content-threads modal regression tests PASSED successfully!');
