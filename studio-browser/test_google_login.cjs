const assert = require('node:assert/strict');
const { googleLoginGuide, createGoogleLoginNotice } = require('./google-login.cjs');
(async () => {
  assert.equal(googleLoginGuide('tiktok').name, 'TikTok');
  assert.equal(googleLoginGuide('pinterest').url, 'https://www.pinterest.com/login/');
  assert.equal(googleLoginGuide('unknown').url, null);
  let finish, count = 0; const opened = [];
  const explain = createGoogleLoginNotice({ dialog: { showMessageBox(options) {
    count++; assert.match(options.title, /TikTok/); assert.doesNotMatch(options.detail, /Pinterest/);
    return new Promise(resolve => { finish = resolve; });
  } }, shell: { openExternal: url => opened.push(url) } });
  const first = explain('tiktok'); assert.equal(explain('tiktok'), first);
  await Promise.resolve(); assert.equal(count, 1);
  finish({ response: 1 }); await first;
  assert.deepEqual(opened, ['https://www.tiktok.com/login']);
  console.log('PASS Google login guidance and duplicate dialog guard');
})();
