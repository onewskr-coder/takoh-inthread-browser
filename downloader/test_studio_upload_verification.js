'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs
  .readFileSync(path.join(__dirname, 'studio-upload.js'), 'utf8')
  .split(/\r?\n\(\(\) => \{/)[0];

function createDomEnv({ initialAnchors = [], navLinks = [], dialogs = [] } = {}) {
  const anchors = [...initialAnchors];
  const createClicks = [];

  const createBtn = {
    tagName: 'BUTTON',
    textContent: '만들기',
    getAttribute: (k) => (k === 'aria-label' ? '만들기' : null),
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 24 }),
    scrollIntoView: () => {},
    dispatchEvent: () => {},
    focus: () => {},
    click() {
      createClicks.push(true);
      if (this.onclick) this.onclick();
    },
  };

  const document = {
    body: {
      append: () => {},
      contains: (el) => dialogs.includes(el),
    },
    activeElement: null,
    getElementById: () => null,
    createElement: () => ({
      style: {},
      append: () => {},
    }),
    querySelector: (sel) => {
      if (sel.includes('[role="dialog"]')) return dialogs[0] || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === 'button,[role="button"]') {
        return [createBtn];
      }
      if (sel === '[role="dialog"]') {
        return dialogs;
      }
      if (sel.includes('nav a[href^="/@"]') || sel.includes('header a[href^="/@"]')) {
        return navLinks;
      }
      if (sel.includes('a[href*="/post/"]')) {
        return anchors;
      }
      return [];
    },
  };

  const sandbox = {
    navigator: { userAgent: 'jsdom' },
    location: { href: 'https://www.threads.com/', pathname: '/', hostname: 'www.threads.com' },
    document,
    window: {},
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Set,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    Uint8Array,
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    MouseEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    KeyboardEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    InputEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    Event: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    File: class {
      constructor(parts, name, opts) {
        this.parts = parts;
        this.name = name;
        this.type = opts?.type || '';
        this.size = parts.reduce((acc, p) => acc + (p.length || p.byteLength || 0), 0);
      }
    },
    DataTransfer: class {
      constructor() {
        this.files = [];
        this.items = { add: (f) => this.files.push(f) };
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source + '\nglobalThis.runUpload = takohThreadsUpload;', sandbox);
  return { sandbox, anchors, dialogs, createBtn, createClicks };
}

function makePostAnchor({ href, bodyText, authorHref = null, datetime = null }) {
  const container = {
    innerText: bodyText,
    querySelector: (sel) => {
      if (sel === 'time[datetime]' && datetime) {
        return { getAttribute: (k) => (k === 'datetime' ? datetime : null) };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === 'a[href^="/@"]' && authorHref) {
        return [{ getAttribute: (k) => (k === 'href' ? authorHref : null) }];
      }
      return [];
    },
  };
  return {
    href,
    textContent: '방금',
    getAttribute: (k) => (k === 'href' ? href : null),
    closest: (sel) => (sel.includes('article') ? container : null),
  };
}

(async () => {
  // 1. Partial carousel (2 files in payload.files, only 1 in loadedFiles) blocks before touching DOM
  {
    const { sandbox, createClicks } = createDomEnv();
    const res = await sandbox.runUpload({
      body: '#광고\n\n캐러셀 2장 중 1장 누락 테스트',
      comment: '',
      automatic: true,
      files: [
        { part: 'file/0', name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image' },
        { part: 'file/1', name: 'slide2.jpg', mime: 'image/jpeg', kind: 'image' },
      ],
      loadedFiles: [
        { name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image', base64: 'AQID' },
      ],
    });
    assert.equal(res.state, 'uncertain');
    assert.match(res.error || '', /전체 파일을 확보하지 못해 게시를 차단/);
    assert.equal(createClicks.length, 0, 'Must not click create button when carousel files are incomplete');
  }

  // 2. Empty file in carousel blocks before touching DOM
  {
    const { sandbox, createClicks } = createDomEnv();
    const res = await sandbox.runUpload({
      body: '#광고\n\n빈 슬라이드 차단 테스트',
      comment: '',
      automatic: true,
      files: [
        { part: 'file/0', name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image' },
        { part: 'file/1', name: 'slide2.jpg', mime: 'image/jpeg', kind: 'image' },
      ],
      loadedFiles: [
        { name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image', base64: 'AQID' },
        { name: 'slide2.jpg', mime: 'image/jpeg', kind: 'image', base64: '' },
      ],
    });
    assert.equal(res.state, 'uncertain');
    assert.match(res.error || '', /2번째 파일 데이터가 누락되어 게시를 차단/);
    assert.equal(createClicks.length, 0);
  }

  // 3. New post verification rejects:
  //    - pre-existing post ID even with identical full text
  //    - post from wrong account even with identical full text
  //    - post with identical 24-char prefix but different body text
  //    - post with stale timestamp (< uploadStartedAt - 120s)
  //    and selects only the genuine new post matching new ID + account + full body
  {
    const targetBody =
      '#광고\n\n공통으로 시작하는 스물네글자 이상의 앞부분 도입 문구이지만 뒤쪽 핵심 내용은 이번 신규 게시물만의 고유한 본문 설명입니다.';
    const similarPrefixOldBody =
      '#광고\n\n공통으로 시작하는 스물네글자 이상의 앞부분 도입 문구이지만 뒤쪽 내용은 과거에 올렸던 다른 상품 게시물 본문입니다.';

    const oldExactAnchor = makePostAnchor({
      href: 'https://www.threads.com/@my_shop/post/OLD_POST_111',
      bodyText: targetBody,
      authorHref: '/@my_shop',
    });

    const navLinks = [
      { getAttribute: (k) => (k === 'href' ? '/@my_shop' : null), textContent: '프로필' },
    ];

    const { sandbox, anchors, dialogs, createBtn } = createDomEnv({
      initialAnchors: [oldExactAnchor],
      navLinks,
    });

    let attachedFiles = null;
    createBtn.onclick = () => {
      const editor = {
        tagName: 'TEXTAREA',
        value: '',
        isConnected: true,
        getClientRects: () => [1],
        getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 40 }),
        scrollIntoView: () => {},
        dispatchEvent: () => {},
        focus: () => {},
        click: () => {},
      };
      const fileInput = {
        _files: [],
        get files() { return this._files; },
        set files(v) { this._files = v; attachedFiles = v; },
        dispatchEvent: () => {},
      };
      const imgPreview = { complete: true };
      const publishBtn = {
        disabled: false,
        textContent: '게시',
        getAttribute: () => null,
        getClientRects: () => [1],
        getBoundingClientRect: () => ({ left: 10, top: 10, width: 50, height: 24 }),
        scrollIntoView: () => {},
        dispatchEvent: () => {},
        focus: () => {},
        click() {
          dialogs.length = 0;
          // Candidate A: Wrong account (@other_seller) with exact targetBody
          anchors.push(
            makePostAnchor({
              href: 'https://www.threads.com/@other_seller/post/NEW_OTHER_222',
              bodyText: targetBody,
              authorHref: '/@other_seller',
            })
          );
          // Candidate B: Right account (@my_shop), new ID, but only matches first 24 chars (similar past phrase)
          anchors.push(
            makePostAnchor({
              href: 'https://www.threads.com/@my_shop/post/SIMILAR_PAST_333',
              bodyText: similarPrefixOldBody,
              authorHref: '/@my_shop',
            })
          );
          // Candidate C: Right account (@my_shop), exact body, but stale timestamp (1 hour ago)
          anchors.push(
            makePostAnchor({
              href: 'https://www.threads.com/@my_shop/post/STALE_TIME_444',
              bodyText: targetBody,
              authorHref: '/@my_shop',
              datetime: new Date(Date.now() - 3600_000).toISOString(),
            })
          );
          // Candidate D: Genuine new post (Right account @my_shop, new ID, fresh timestamp, full body match)
          anchors.push(
            makePostAnchor({
              href: 'https://www.threads.com/@my_shop/post/GENUINE_NEW_555',
              bodyText: targetBody,
              authorHref: '/@my_shop',
              datetime: new Date().toISOString(),
            })
          );
        },
      };
      const dlg = {
        innerText: '',
        getClientRects: () => [1],
        querySelector: (sel) => {
          if (sel.includes('textarea')) return editor;
          if (sel === 'input[type="file"]') return fileInput;
          if (sel === 'img') return imgPreview;
          return null;
        },
        querySelectorAll: (sel) => {
          if (sel === 'button,[role="button"]') return [publishBtn];
          return [];
        },
      };
      dialogs.push(dlg);
    };

    const res = await sandbox.runUpload({
      body: targetBody,
      comment: '',
      automatic: true,
      files: [
        { part: 'file/0', name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image' },
        { part: 'file/1', name: 'slide2.jpg', mime: 'image/jpeg', kind: 'image' },
      ],
      loadedFiles: [
        { name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image', base64: 'AQID' },
        { name: 'slide2.jpg', mime: 'image/jpeg', kind: 'image', base64: 'BAUG' },
      ],
    });

    assert.equal(attachedFiles.length, 2, 'Both carousel slides must be attached');
    assert.equal(res.state, 'posted');
    assert.equal(res.permalink, 'https://www.threads.com/@my_shop/post/GENUINE_NEW_555');
  }

  console.log('PASS: downloader/test_studio_upload_verification.js');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
