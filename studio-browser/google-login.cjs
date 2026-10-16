const guides = {
  pinterest: { name: 'Pinterest', url: 'https://www.pinterest.com/login/', alternative: '앱에서는 이메일·비밀번호 로그인을 이용하세요. Google로 가입했다면 Pinterest의 비밀번호 재설정을 통해 이메일 로그인 가능 여부를 확인하세요.' },
  tiktok: { name: 'TikTok', url: 'https://www.tiktok.com/login', alternative: '앱에서는 QR 코드 또는 전화번호·이메일 등 사이트가 제공하는 다른 로그인 방식을 이용하세요.' },
  instagram: { name: 'Instagram', url: 'https://www.instagram.com/accounts/login/', alternative: '앱에서는 Instagram 계정 또는 사이트가 제공하는 Facebook 로그인 방식을 이용하세요.' },
  threads: { name: 'Threads', url: 'https://www.threads.com/', alternative: '앱에서는 사이트가 제공하는 Instagram 계정 로그인 방식을 이용하세요.' }
};
function googleLoginGuide(key) {
  return guides[key] || { name: '해당 사이트', url: null, alternative: '앱에서는 해당 사이트가 제공하는 이메일·전화번호·QR 코드 등 다른 로그인 방식을 이용하세요.' };
}
function createGoogleLoginNotice({ dialog, shell }) {
  let pending = null;
  return function explain(key) {
    if (pending) return pending;
    const guide = googleLoginGuide(key);
    pending = Promise.resolve().then(() => dialog.showMessageBox({
      type: 'info', title: `${guide.name} 로그인 안내`,
      message: 'Google 로그인은 이 내장 브라우저에서 지원되지 않습니다.',
      detail: `${guide.alternative}\n\nGoogle 로그인이 꼭 필요하면 Chrome·Edge에서 해당 사이트를 이용하세요. 외부 브라우저의 로그인은 이 앱으로 자동 전달되지 않습니다.`,
      buttons: guide.url ? ['앱에서 다른 방식으로 로그인', `외부 브라우저에서 ${guide.name} 열기`] : ['닫기'],
      defaultId: 0, cancelId: 0
    })).then(({ response }) => {
      if (response === 1 && guide.url) return shell.openExternal(guide.url);
    }).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { googleLoginGuide, createGoogleLoginNotice };
