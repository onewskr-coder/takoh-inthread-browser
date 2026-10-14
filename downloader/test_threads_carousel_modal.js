const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require(process.env.STUDIO_JSDOM || 'jsdom');

console.log('Testing Threads Carousel Modal Viewer...');

// 1. 피드 + 모달 구조 DOM 생성
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

  <!-- 미디어 확대창 (처음엔 없음, 사용자가 클릭하면 열림) -->
  <div id="modal-container"></div>
</body>
</html>
`;

const dom = new JSDOM(html, {
  url: 'https://www.threads.com/@creator/post/CAROUSEL1',
  runScripts: 'outside-only'
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

// 피드 요소 크기 설정
mockDimensions(d.getElementById('feed-img1'), { left: 50, top: 100, width: 300, height: 400 });
mockDimensions(d.getElementById('feed-vid2'), { left: 400, top: 100, width: 300, height: 400 });
mockDimensions(d.getElementById('feed-img3'), { left: 750, top: 100, width: 300, height: 400 });

let scanThreads;
const downloadedFiles = [];

w.chrome = { runtime: { sendMessage: () => {} } };
w.TAKCore = {
  config: { enableVideos: true, enableImages: true },
  isContentImage: (img) => {
    return !img.src.includes('avatar') && !img.src.includes('emoji');
  },
  showToast: () => {},
  triggerDownload: (url, type, meta, platform) => {
    downloadedFiles.push({ url, type, meta, platform });
  },
  createDownloadButton: (type, onClick) => {
    const b = d.createElement('button');
    b.className = 'threads-download-btn';
    b.dataset.mediaType = type;
    b.innerHTML = '<span>' + type + '</span>';
    b.addEventListener('click', onClick);
    return b;
  },
  anchorMediaControls: (controls, media, fixed) => {
    controls.__takohMedia = media;
    controls.style.position = fixed ? 'fixed' : 'absolute';
    w.TAKStudio?.attach(controls, media, fixed);
  },
  findMediaContainer: el => el.parentElement,
  registerPlatform: (name, fn) => { scanThreads = fn; }
};

// 스크립트 로드
w.eval(fs.readFileSync('content-studio.js', 'utf8'));
w.eval(fs.readFileSync('content-threads.js', 'utf8'));

// 1. 피드 초기 스캔
scanThreads();

// 피드 버튼 확인 (이미지 2개, 영상 1개 총 3개 컨트롤 생성)
const feedControls = d.querySelectorAll('.takoh-threads-media-controls:not(.takoh-threads-modal-controls)');
assert.equal(feedControls.length, 3, 'Feed should have 3 sets of controls');
feedControls.forEach(ctrl => {
  assert.notEqual(ctrl.style.display, 'none', 'Feed controls should be visible');
});
console.log('✓ Feed controls initial render verified (3 controls visible)');

// 2. 확대창 열기 (슬라이드 1: 이미지 1 활성화)
const modalHtml = `
<div role="dialog" aria-modal="true" class="threads-lightbox-modal">
  <button aria-label="닫기" class="close-btn" style="position:fixed; top:20px; right:20px; width:40px; height:40px;"></button>
  <button aria-label="이전" class="prev-btn" style="position:fixed; top:400px; left:20px; width:40px; height:40px;"></button>
  <button aria-label="다음" class="next-btn" style="position:fixed; top:400px; right:20px; width:40px; height:40px;"></button>
  <div class="modal-carousel-stage">
    <img id="modal-img1" src="https://cdn.threads.net/img1_full.jpg" class="active-slide">
    <video id="modal-vid2" src="https://cdn.threads.net/vid2_full.mp4" style="display:none;"></video>
    <img id="modal-img3" src="https://cdn.threads.net/img3_full.jpg" style="display:none;">
  </div>
</div>
`;
d.getElementById('modal-container').innerHTML = modalHtml;
const modalEl = d.querySelector('div[role="dialog"]');
mockDimensions(modalEl, { left: 0, top: 0, width: 1000, height: 800 });
const closeBtn = modalEl.querySelector('.close-btn');
const nextBtn = modalEl.querySelector('.next-btn');
const prevBtn = modalEl.querySelector('.prev-btn');
mockDimensions(closeBtn, { left: 900, top: 20, width: 40, height: 40 });
mockDimensions(nextBtn, { left: 920, top: 400, width: 40, height: 40 });
mockDimensions(prevBtn, { left: 20, top: 400, width: 40, height: 40 });

const modalImg1 = d.getElementById('modal-img1');
const modalVid2 = d.getElementById('modal-vid2');
const modalImg3 = d.getElementById('modal-img3');

// 슬라이드 1 활성 (화면 중앙 700x700)
mockDimensions(modalImg1, { left: 150, top: 60, width: 700, height: 700 });
// 슬라이드 2, 3은 비활성 (크기 0)
mockDimensions(modalVid2, { left: 0, top: 0, width: 0, height: 0 });
mockDimensions(modalImg3, { left: 0, top: 0, width: 0, height: 0 });

// 스캔 수행
scanThreads();

// 검증 A: 피드 버튼이 모두 숨겨졌는지
feedControls.forEach(ctrl => {
  assert.equal(ctrl.style.display, 'none', 'Feed controls must be hidden when modal is open');
});
console.log('✓ Feed controls hidden when modal opens');

// 검증 B: 확대창 버튼이 단 1세트만 생성되었는지
const modalControlsList = d.querySelectorAll('.takoh-threads-modal-controls');
assert.equal(modalControlsList.length, 1, 'Modal must have exactly 1 set of controls');
const modalControls = modalControlsList[0];
assert.equal(modalControls.style.display, 'flex', 'Modal controls must be flex/visible');

// 검증 C: 닫기 버튼 및 슬라이드 버튼과 겹치지 않는 위치에 배치되었는지
const modalCtrlLeft = parseFloat(modalControls.style.left);
const modalCtrlTop = parseFloat(modalControls.style.top);
assert.ok(modalCtrlLeft < 900, 'Modal controls right must not overlap close button (left: 900)');
console.log(`✓ Modal controls positioned safely at left: ${modalCtrlLeft}px, top: ${modalCtrlTop}px without overlapping close button`);

// 검증 D: 슬라이드 1(이미지 1) 저장 클릭 시 정확한 파일 URL 다운로드
downloadedFiles.length = 0;
const saveBtn1 = modalControls.querySelector('.threads-download-btn');
assert.equal(saveBtn1.dataset.mediaType, 'image');
assert.equal(saveBtn1.querySelector('span').textContent, '저장');
saveBtn1.click();
assert.equal(downloadedFiles.length, 1);
assert.equal(downloadedFiles[0].url, 'https://cdn.threads.net/img1_full.jpg');
assert.equal(downloadedFiles[0].type, 'image');
console.log('✓ Slide 1 (Image) accurately triggered download of img1_full.jpg');

// 3. 슬라이드 이동: 슬라이드 2 (비디오 1)로 넘김
modalImg1.style.display = 'none';
mockDimensions(modalImg1, { left: 0, top: 0, width: 0, height: 0 });

modalVid2.style.display = 'block';
mockDimensions(modalVid2, { left: 150, top: 60, width: 700, height: 700 });

scanThreads();

// 검증 E: 버튼이 영상(video) 타입으로 동적 갱신되었는지
const saveBtn2 = modalControls.querySelector('.threads-download-btn');
assert.equal(saveBtn2.dataset.mediaType, 'video', 'Controls should switch to video');
assert.equal(saveBtn2.querySelector('span').textContent, '저장');

// 검증 F: 비디오 저장 클릭 시 정확한 비디오 파일 URL 다운로드
downloadedFiles.length = 0;
saveBtn2.click();
assert.equal(downloadedFiles.length, 1);
assert.equal(downloadedFiles[0].url, 'https://cdn.threads.net/vid2_full.mp4');
assert.equal(downloadedFiles[0].type, 'video');
console.log('✓ Slide 2 (Video) accurately updated and downloaded vid2_full.mp4');

// 4. 슬라이드 이동: 슬라이드 3 (이미지 2)로 넘김
modalVid2.style.display = 'none';
mockDimensions(modalVid2, { left: 0, top: 0, width: 0, height: 0 });

modalImg3.style.display = 'block';
mockDimensions(modalImg3, { left: 150, top: 60, width: 700, height: 700 });

scanThreads();

// 검증 G: 버튼이 다시 이미지(image) 타입으로 동적 갱신되었는지
const saveBtn3 = modalControls.querySelector('.threads-download-btn');
assert.equal(saveBtn3.dataset.mediaType, 'image', 'Controls should switch back to image');

// 검증 H: 이미지 3 저장 클릭 시 정확한 이미지 파일 URL 다운로드
downloadedFiles.length = 0;
saveBtn3.click();
assert.equal(downloadedFiles.length, 1);
assert.equal(downloadedFiles[0].url, 'https://cdn.threads.net/img3_full.jpg');
assert.equal(downloadedFiles[0].type, 'image');
console.log('✓ Slide 3 (Image) accurately updated and downloaded img3_full.jpg');

// 5. 확대창 닫기
d.getElementById('modal-container').innerHTML = '';
scanThreads();

// 검증 I: 확대창 버튼이 DOM에서 완전히 제거되었는지
assert.equal(d.querySelectorAll('.takoh-threads-modal-controls').length, 0, 'Modal controls should be removed on close');

// 검증 J: 피드 버튼들이 정상적으로 복원(표시)되었는지
feedControls.forEach(ctrl => {
  assert.equal(ctrl.style.display, '', 'Feed controls must have display restored');
});
console.log('✓ Modal closed: modal controls removed and feed controls restored');

// 6. 다시 확대창 열기 (재확대)
d.getElementById('modal-container').innerHTML = modalHtml;
const newModal = d.querySelector('div[role="dialog"]');
mockDimensions(newModal, { left: 0, top: 0, width: 1000, height: 800 });
const newCloseBtn = newModal.querySelector('.close-btn');
mockDimensions(newCloseBtn, { left: 900, top: 20, width: 40, height: 40 });
const newImg1 = d.getElementById('modal-img1');
mockDimensions(newImg1, { left: 150, top: 60, width: 700, height: 700 });

scanThreads();

// 검증 K: 재확대 시 다시 피드 버튼 숨김 + 확대창 버튼 1세트 생성 확인
feedControls.forEach(ctrl => {
  assert.equal(ctrl.style.display, 'none', 'Feed controls must be hidden again on reopen');
});
const reopenedModalControls = d.querySelectorAll('.takoh-threads-modal-controls');
assert.equal(reopenedModalControls.length, 1, 'Reopening modal should recreate 1 set of modal controls');
console.log('✓ Reopened modal successfully: feed controls hidden and modal controls recreated');

dom.window.close();
console.log('\nAll Threads Carousel Modal Viewer tests PASSED successfully!');
