function address(value){
  const input=String(value||'').trim();
  if(!input)throw Error('열 웹사이트 주소를 입력하세요.');
  const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(input)?input:'https://'+input);
  if(url.protocol!=='https:')throw Error('HTTPS 웹사이트 주소를 입력하세요.');
  if(url.username||url.password)throw Error('주소에 계정 정보를 넣지 마세요.');
  return url.href;
}
function platform(value){
  const host=new URL(value).hostname;
  if(/(^|\.)instagram\.com$/.test(host))return 'instagram';
  if(/(^|\.)(threads\.com|threads\.net)$/.test(host))return 'threads';
  if(/(^|\.)pinterest\.com$/.test(host))return 'pinterest';
  if(/(^|\.)tiktok\.com$/.test(host))return 'tiktok';
  if(/(^|\.)naver\.com$/.test(host))return 'naver_clip';
  return null;
}
module.exports={address,platform};
