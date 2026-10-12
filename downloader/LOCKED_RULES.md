# TAKOH Media Downloader PRO - Code Locking Rules

## 🔒 LOCKED FILES (수정 금지 파일 목록)
Below files are locked and frozen in their fully working state. **DO NOT MODIFY** unless the USER explicitly requests modifications for that specific file.

1. **`content-threads.js`**
   - Baseline Locked File: `content-threads-LOCKED.js`
   - Lock Date: 2026-07-23
   - Status: STABLE & LOCKED 🔒

2. **`content-instagram.js`**
   - Baseline Locked File: `content-instagram-LOCKED.js`
   - Lock Date: 2026-07-24
   - Status: FULLY STABLE & LOCKED 🔒 (Single image/video/thumb + Carousel HEIC/dst-jpg CDN + Media ID deduplication + 1:1 postBox scoped auto-slide ZIP downloads completely locked)

3. **`content-youtube.js` & `content-youtube-main.js`**
   - Baseline Locked Files: `content-youtube-LOCKED.js`, `content-youtube-main-LOCKED.js`
   - Lock Date: 2026-07-24
   - Status: FULLY STABLE & LOCKED 🔒 (1080p Full-HD merged video & Shorts high quality + Exact video title filename completely locked)

4. **`content-naver-clip.js`**
   - Baseline Locked File: `content-naver-clip-LOCKED.js`
   - Lock Date: 2026-07-24
   - Status: FULLY STABLE & LOCKED 🔒 (Naver Clip & Shorts 1:1 download matching locked)

5. **`content-tiktok.js`**
   - Baseline Locked File: `content-tiktok-LOCKED.js`
   - Lock Date: 2026-07-25
   - Status: FULLY STABLE & LOCKED 🔒 (1:1 React Fiber ID stream matching + High-speed Blob fetch + Auto-retry 403 bypass + Multi-parallel downloads + Title filename completely locked)

6. **`content-core.js` 수정 격리 원칙 (Core Isolation Rule)**
   - `content-core.js`를 수정할 때는 기존 함수 시그니처와 동작 방식을 100% 하위 호환(Backward Compatible)으로 보장해야 하며, 기존 플랫폼 미디어 추출 및 오버레이 동작에 절대로 부작용(Side-effect)이나 장애가 발생하지 않도록 철저히 모듈화/격리함.

---
*Note: Any future updates for other platforms must strictly isolate changes without altering locked files.*
