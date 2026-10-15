'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createThreadsUploadManager, packetUrl } = require('./threads-upload.cjs');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'takoh-threads-upload-test-'));
  try {
    const token1 = 'a'.repeat(48);
    const token2 = 'b'.repeat(48);
    const url5006 = `http://127.0.0.1:5006/studio/delivery/${token1}`;
    const url5005 = `http://127.0.0.1:5005/studio/delivery/${token2}`;

    assert.strictEqual(packetUrl(url5006), url5006);
    assert.strictEqual(packetUrl(url5005), url5005);
    assert.strictEqual(packetUrl('https://evil.example.com/studio/delivery/' + token1), null);

    let executedScripts = [];
    const mockUploadResult = {
      state: 'posted',
      permalink: 'https://www.threads.com/@tester/post/DirectHuman123',
      error: '',
    };

    const mockEnsureThreadsView = async () => ({
      webContents: {
        executeJavaScript: async (code) => {
          executedScripts.push(code);
          return mockUploadResult;
        },
      },
    });

    const now = Date.now();
    const futureWhen = now + 60_000;
    const immediateWhen = now;

    const mockFetch = async (url) => {
      const u = String(url);
      if (u === url5006) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'upload-1',
            when: immediateWhen,
            name: 'Immediate Human Upload',
            text: '#광고\nDirect human-touch upload caption',
            reply: 'https://link.coupang.com/a/testhuman1',
            filename: 'video.mp4',
            mime: 'video/mp4',
          }),
        };
      }
      if (u === url5006 + '/video') {
        const buf = Buffer.from('mp4-bytes');
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        };
      }
      if (u === url5005) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'upload-2',
            when: futureWhen,
            name: 'Scheduled Human Upload',
            text: '#광고\nScheduled post',
            reply: '',
            filename: 'video2.mp4',
            mime: 'video/mp4',
          }),
        };
      }
      return {
        ok: false,
        status: 404,
      };
    };

    const manager = createThreadsUploadManager({
      dataDir: tmpDir,
      ensureThreadsView: mockEnsureThreadsView,
      fetchImpl: mockFetch,
    });
    await manager.init();

    // 1. Test future scheduled upload + cancel
    const resScheduled = await manager.queueUpload({
      id: 'upload-2',
      url: url5005,
      when: futureWhen,
    });
    assert.strictEqual(resScheduled.id, 'upload-2');

    let list = await manager.status();
    const item2 = list.find((x) => x.id === 'upload-2');
    assert.ok(item2);
    assert.strictEqual(item2.state, 'queued');

    const cancelled = await manager.cancel({ id: 'upload-2' });
    assert.strictEqual(cancelled.id, 'upload-2');
    list = await manager.status();
    assert.strictEqual(list.find((x) => x.id === 'upload-2').state, 'cancelled');

    // 2. Test immediate upload execution via run()
    await manager.queueUpload({
      id: 'upload-1',
      url: url5006,
      when: immediateWhen,
    });
    await manager.run('upload-1');

    list = await manager.status();
    const item1 = list.find((x) => x.id === 'upload-1');
    assert.ok(item1);
    assert.strictEqual(item1.state, 'posted');
    assert.strictEqual(item1.permalink, 'https://www.threads.com/@tester/post/DirectHuman123');
    assert.strictEqual(executedScripts.length, 1);
    assert.ok(executedScripts[0].includes('takohThreadsUpload'));
    assert.ok(executedScripts[0].includes('humanClick'));
    assert.ok(executedScripts[0].includes('humanFill'));

    // 3. Test crash recovery (running -> uncertain on init)
    const queueFile = path.join(tmpDir, 'upload-queue.json');
    const saved = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    saved.push({
      id: 'upload-interrupted',
      name: 'Interrupted Upload',
      url: url5006,
      when: now,
      state: 'running',
    });
    fs.writeFileSync(queueFile, JSON.stringify(saved, null, 2), 'utf8');

    const recoveredManager = createThreadsUploadManager({
      dataDir: tmpDir,
      ensureThreadsView: mockEnsureThreadsView,
      fetchImpl: mockFetch,
    });
    await recoveredManager.init();
    const recoveredList = await recoveredManager.status();
    const interrupted = recoveredList.find((x) => x.id === 'upload-interrupted');
    assert.ok(interrupted);
    assert.strictEqual(interrupted.state, 'uncertain');

    // 4. Test partial carousel failure blocks publishing
    const token3 = 'c'.repeat(48);
    const urlPartialCarousel = `http://127.0.0.1:5006/studio/delivery/${token3}`;
    const managerPartial = createThreadsUploadManager({
      dataDir: tmpDir,
      ensureThreadsView: mockEnsureThreadsView,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u === urlPartialCarousel) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'upload-partial-carousel',
              when: immediateWhen,
              name: 'Partial Carousel Upload',
              text: '#광고\nCarousel post with 2 slides',
              reply: '',
              filename: 'slide1.jpg',
              mime: 'image/jpeg',
              files: [
                { part: 'file/0', name: 'slide1.jpg', mime: 'image/jpeg', kind: 'image' },
                { part: 'file/1', name: 'slide2.jpg', mime: 'image/jpeg', kind: 'image' },
              ],
            }),
          };
        }
        if (u === urlPartialCarousel + '/file/0') {
          const buf = Buffer.from('jpg-slide-1');
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          };
        }
        // file/1 fails with 404
        return { ok: false, status: 404 };
      },
    });
    await managerPartial.init();
    const scriptsBeforePartial = executedScripts.length;
    await managerPartial.queueUpload({
      id: 'upload-partial-carousel',
      url: urlPartialCarousel,
      when: immediateWhen,
    });
    await managerPartial.run('upload-partial-carousel');
    const partialList = await managerPartial.status();
    const partialItem = partialList.find((x) => x.id === 'upload-partial-carousel');
    assert.ok(partialItem);
    assert.strictEqual(partialItem.state, 'uncertain');
    assert.match(partialItem.error || '', /2\/2.*다운로드 실패/);
    assert.strictEqual(executedScripts.length, scriptsBeforePartial, 'Should block publishing before calling executeJavaScript');

    manager.dispose();
    recoveredManager.dispose();
    managerPartial.dispose();
    console.log('PASS: studio-browser/test_threads_upload.cjs');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
