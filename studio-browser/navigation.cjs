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
  if(/(^|\.)pinterest\.(com|co\.kr)$/.test(host))return 'pinterest';
  if(/(^|\.)tiktok\.com$/.test(host))return 'tiktok';
  if(/(^|\.)coupang\.com$/.test(host))return 'coupang';
  if(/(^|\.)(smartstore|shopping|brand)\.naver\.com$/.test(host))return 'smartstore';
  if(/(^|\.)naver\.com$/.test(host))return 'naver_clip';
  if(/(^|\.)facebook\.com$/.test(host))return 'facebook';
  if(/(^|\.)(youtube\.com|youtu\.be)$/.test(host))return 'youtube';
  if(/(^|\.)(twitter\.com|x\.com)$/.test(host))return 'twitter';
  if(/(^|\.)reddit\.com$/.test(host))return 'reddit';
  return null;
}
function siteKey(value){
  const host=new URL(value).hostname;
  if(host==='clipcreators.naver.com')return 'naver_creator';
  const p=platform(value);
  if(['threads','instagram','naver_clip','smartstore','coupang','tiktok','pinterest'].includes(p))return p;
  return 'browser';
}
function uploadSiteKey(platform){return ['instagram','instagram_reels','instagram_carousel'].includes(platform)?'instagram':platform==='naver_clip'?'naver_creator':platform==='tiktok'?'tiktok':'threads';}
module.exports={address,platform,siteKey,uploadSiteKey};

