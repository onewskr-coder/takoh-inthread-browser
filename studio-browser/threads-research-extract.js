/* Read-only, bounded extraction. No scrolling, login dismissal or private API. */
function extractThreadsResearch(detail=false){
  const profileMode=detail==='profile';
  if(/\/(?:challenge|checkpoint)(?:\/|$)/i.test(location.pathname))return {status:'challenge_required',items:[]};
  if(/\/(?:accounts\/login|login)(?:\/|$)/i.test(location.pathname))return {status:'login_required',items:[]};
  if(/too many requests|요청이 너무 많/i.test((document.body?.innerText||'').slice(0,1500)))return {status:'rate_limited',items:[]};
  const canonical=value=>{try{const u=new URL(value,location.href),m=u.pathname.match(/^\/@([\w.]+)\/post\/([\w-]+)\/?$/);return u.protocol==='https:'&&['www.threads.com','threads.com','www.threads.net','threads.net'].includes(u.hostname)&&m?{id:m[2],username:m[1],permalink:'https://www.threads.com/@'+m[1]+'/post/'+m[2]}:null;}catch{return null;}};
  const visible=node=>{if(!node||node.closest('[hidden],[aria-hidden="true"]'))return false;const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&node.getBoundingClientRect().height>0;};
  const safeUrl=v=>{try{const u=new URL(String(v||'').replace(/\\\//g,'/').replace(/\\u0026/g,'&').replace(/\\u0025/g,'%').replace(/\\u003d/g,'='));return u.protocol==='https:'&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)?u.href:null;}catch{return null;}};
  const profileMatch=location.pathname.match(/^\/@([\w.]+)\/?$/);
  const source=canonical(location.href)||(profileMode&&profileMatch?{username:profileMatch[1],permalink:'https://www.threads.com/@'+profileMatch[1]+'/'}:null);if(!source)return {status:'invalid_page',items:[]};
  const login=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(n=>visible(n)&&/로그인|log in|sign in/i.test(n.innerText||n.textContent));
  const joinPrompt=[...document.querySelectorAll('div,span,button,a')].some(n=>{if(n.childElementCount>2||!visible(n)||!/^(Threads에서 소통해보세요|Instagram으로 계속하기|Join Threads|Continue with Instagram)$/i.test((n.innerText||n.textContent||'').trim()))return false;const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;});
  if(login||joinPrompt)return {status:'login_required',items:[]};
  const heading=[...document.querySelectorAll('h1,h2,h3,[role="heading"],span,div')].find(n=>n.childElementCount<4&&visible(n)&&/^(?:관련\s*스레드|related\s*threads|더\s*많은\s*스레드|more\s*threads|추천\s*스레드)$/i.test((n.innerText||n.textContent||'').trim()));
  if(!heading&&!detail)return {status:'related_not_observed',related_section_observed:false,items:[]};
  const count=text=>{const m=String(text||'').replace(/[,\u200B-\u200D\uFEFF]/g,'').replace(/(\d)([가-힣A-Za-z])/g,'$1 $2').match(/(?:^|\s|:)(\d+(?:\.\d+)?)\s*(만|천|[KMB])?(?:\s|회|개|$)/i);if(!m)return null;return Math.round(Number(m[1])*({만:10000,천:1000,k:1000,m:1000000,b:1000000000}[(m[2]||'').toLowerCase()]||1));};
  // Parse embedded Relay/SSR JSON scripts for exact metrics (views/likes/replies/reposts) and full media versions by post code
  const relayMap=new Map();
  try{
    const visitObj=(node,depth=0)=>{
      if(!node||typeof node!=='object'||depth>22)return;
      if(Array.isArray(node)){for(const x of node)visitObj(x,depth+1);return;}
      const code=typeof node.code==='string'&&/^[\w-]{5,24}$/.test(node.code)?node.code:null;
      if(code&&(node.like_count!==undefined||node.text_post_app_info||node.video_versions||node.image_versions2||node.carousel_media||node.caption)){
        const entry=relayMap.get(code)||{metrics:{views:null,likes:null,replies:null,reposts:null,quotes:null},media:[],text:''};
        const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
        const tpa=node.text_post_app_info||{};
        const views=num(node.impression_count)??num(node.view_count)??num(node.play_count)??num(tpa.impression_count)??num(tpa.view_count);
        const likes=num(node.like_count);
        const replies=num(tpa.direct_reply_count)??num(node.comment_count);
        const reposts=num(tpa.repost_count)??num(node.repost_count);
        const quotes=num(tpa.quote_count)??num(node.quote_count);
        if(views!==null)entry.metrics.views=views;
        if(likes!==null)entry.metrics.likes=likes;
        if(replies!==null)entry.metrics.replies=replies;
        if(reposts!==null)entry.metrics.reposts=reposts;
        if(quotes!==null)entry.metrics.quotes=quotes;
        if(typeof node.caption?.text==='string'&&node.caption.text.length>entry.text.length)entry.text=node.caption.text;
        const addMedia=m=>{
          if(!m||typeof m!=='object')return;
          const vUrl=Array.isArray(m.video_versions)&&m.video_versions[0]?.url?safeUrl(m.video_versions[0].url):null;
          const iUrl=Array.isArray(m.image_versions2?.candidates)&&m.image_versions2.candidates[0]?.url?safeUrl(m.image_versions2.candidates[0].url):null;
          if(vUrl||iUrl)entry.media.push({kind:vUrl?'video':'image',preview_url:iUrl||vUrl,source_url:vUrl||iUrl});
        };
        if(Array.isArray(node.carousel_media)&&node.carousel_media.length){for(const cm of node.carousel_media)addMedia(cm);}else{addMedia(node);}
        relayMap.set(code,entry);
      }
      for(const k of Object.keys(node)){if(k!=='parent'&&k!=='return')visitObj(node[k],depth+1);}
    };
    for(const s of document.querySelectorAll('script[type="application/json"],script:not([src])')){
      const raw=s.textContent||'';
      if(raw.length<30||raw.length>4000000||(!raw.includes('"code"')&&!raw.includes('like_count')&&!raw.includes('video_versions')))continue;
      try{visitObj(JSON.parse(raw),0);}catch{}
    }
  }catch{}
  const items=[],seen=new Set();
  for(const link of document.querySelectorAll('a[href*="/post/"]')){
    if(items.length>=50)break;
    const post=canonical(link.href);if(!post||(!detail&&post.id===source.id)||seen.has(post.id)||!visible(link))continue;
    if(!detail&&!(heading.compareDocumentPosition(link)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
    if(detail&&(post.username.toLowerCase()!==source.username.toLowerCase()||(!profileMode&&heading&&(heading.compareDocumentPosition(link)&Node.DOCUMENT_POSITION_FOLLOWING))))continue;
    let card=link.closest('article,[role="article"],[data-pressable-container="true"]');
    if(!card){for(let n=link.parentElement,depth=0;n&&n!==document.body&&depth<20;n=n.parentElement,depth++){const ids=new Set([...n.querySelectorAll('a[href*="/post/"]')].map(a=>canonical(a.href)?.id).filter(Boolean));if(ids.size>1)break;if(ids.has(post.id)&&(n.querySelector('img,video,picture')||(n.innerText||n.textContent||'').length>20))card=n;}}
    if(!card)continue;
    // Never attach neighbouring posts or comments to this account's evidence.
    const ids=new Set([...card.querySelectorAll('a[href*="/post/"]')].map(a=>canonical(a.href)?.id).filter(Boolean));if(ids.size!==1)continue;
    const relay=relayMap.get(post.id);
    const clean=card.cloneNode(true);clean.querySelectorAll('button,[role="button"],nav,header,time,[data-takoh-threads-controls],.takoh-collect-reference').forEach(n=>n.remove());
    const stripChrome=(s,u)=>{let t=String(s||'').replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').trim();if(!t)return '';const esc=String(u||'').replace(/^@/,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(let i=0;i<3;i++){t=t.replace(/^(?:팔로우|팔로잉|Follow|Following|작성자|Author|고정됨|Pinned)\s*/i,'');if(esc)t=t.replace(new RegExp(`^@?${esc}(?:\\s*인증된\\s*계정|\\s*Verified)?(?:\\s*게시물이\\s*페디버스에\\s*공유됩니다)?(?:\\s*(?:\\d+\\s*(?:초|분|시간|일|주|개월|년)(?:\\s*전)?|\\d+\\s*[smhdw]\\b|어제|방금))?(?:\\s*(?:수정됨|Edited))?(?:\\s*(?:더\\s*보기|See\\s*more))?\\s*`,'i'),'');t=t.replace(/^@?[A-Za-z0-9_.]{2,32}?(?=(?:\s*인증된\s*계정|\s*Verified)?(?:\s*게시물이\s*페디버스에\s*공유됩니다)?\s*(?:\d{1,3}\s*(?:초|분|시간|일|주|개월|년)(?:\s*전)?|어제|방금)(?!\s*(?:만에|동안|뒤|후|간|정도|연속|컷|배)))(?:\s*인증된\s*계정|\s*Verified)?(?:\s*게시물이\s*페디버스에\s*공유됩니다)?\s*(?:\d{1,3}\s*(?:초|분|시간|일|주|개월|년)(?:\s*전)?|어제|방금)(?:\s*(?:수정됨|Edited))?(?:\s*(?:더\s*보기|See\s*more))?\s*/i,'');t=t.replace(/^(?:인증된\s*계정|게시물이\s*페디버스에\s*공유됩니다|더\s*보기|See\s*more)\s*/i,'');}for(let i=0;i<4;i++){const p=t;t=t.replace(/(?:\s|\n)*(?:번역하기|번역\s*보기|See\s*translation|Translate|\d{1,2}[\s\n]*\/[\s\n]*\d{1,2}|오디오\s*소리\s*(?:꺼짐|켜짐)|소리\s*(?:꺼짐|켜짐)|음소거(?:\s*해제)?|Muted|Unmute|(?:좋아요|답글|댓글|리포스트|재게시|인용|공유하기|공유|보내기|조회(?:수)?|Like|Reply|Repost|Share)(?:\s*[\d,.]+\s*(?:만|천|[KMB])?\s*(?:회|개)?)?)+$/i,'').replace(/(?:\n+\d{1,4})+\s*$/,'').trim();if(t===p)break;}return t.replace(/([^\n\s])\s*((?:老公|老婆|남편|아내|엄마|아빠|아들|딸|媽媽|爸爸|兒子|女兒)\s*[：:])/g,'$1\n$2').trim();};
    const domText=stripChrome(clean.innerText||clean.textContent||'',post.username);
    const relayText=stripChrome(relay?.text||'',post.username);
    const text=(relayText.length>=2?relayText:(domText||relayText)).slice(0,10000),links=[];
    for(const a of card.querySelectorAll('a[href]')){try{let u=new URL(a.href,location.href);if(['l.threads.com','l.threads.net'].includes(u.hostname)){const target=u.searchParams.get('u');if(target)u=new URL(target);}if(u.protocol==='https:'&&!/(^|\.)(threads\.com|threads\.net)$/.test(u.hostname)){u.username='';u.password='';u.hash='';links.push(u.href);}}catch{}}
    const mediaAssets=[];for(const n of card.querySelectorAll('video,img')){if(!visible(n)||/프로필|profile|avatar/i.test(n.getAttribute('alt')||''))continue;const anchor=n.closest('a[href]');if(anchor&&!/\/post\//.test(anchor.getAttribute('href')||''))continue;const r=n.getBoundingClientRect();if(Math.max(n.naturalWidth||n.videoWidth||0,r.width)<90||Math.max(n.naturalHeight||n.videoHeight||0,r.height)<75)continue;const srcsetUrl=(n.getAttribute('srcset')||'').split(',')[0]?.trim().split(/\s+/)[0];const preview=safeUrl(n.poster||n.currentSrc||n.src||srcsetUrl||n.dataset?.src),src=n.tagName==='VIDEO'?safeUrl(n.currentSrc||n.src||n.querySelector('source')?.src):preview;if(!preview&&!src&&n.tagName!=='VIDEO')continue;mediaAssets.push({kind:n.tagName==='VIDEO'?'video':'image',preview_url:preview||src,source_url:src||preview});}
    if(!mediaAssets.length&&relay?.media?.length){for(const rm of relay.media)mediaAssets.push(rm);}
    else if(mediaAssets.length&&relay?.media?.length){for(let i=0;i<mediaAssets.length;i++){if(mediaAssets[i].kind==='video'&&!mediaAssets[i].source_url&&relay.media[i]?.source_url)mediaAssets[i].source_url=relay.media[i].source_url;if(!mediaAssets[i].preview_url&&relay.media[i]?.preview_url)mediaAssets[i].preview_url=relay.media[i].preview_url;}}
    const thumbnail=mediaAssets.find(x=>x.preview_url)?.preview_url||null;
    const metrics={views:relay?.metrics?.views??null,likes:relay?.metrics?.likes??null,replies:relay?.metrics?.replies??null,reposts:relay?.metrics?.reposts??null,quotes:relay?.metrics?.quotes??null};
    for(const n of card.querySelectorAll('button,[role="button"],[aria-label],a[href*="/post/"]')){const label=n.getAttribute('aria-label')||n.querySelector('[aria-label]')?.getAttribute('aria-label')||n.querySelector('svg[title]')?.getAttribute('title')||n.querySelector('svg title')?.textContent||'',value=count(label+' '+(n.innerText||''))??(()=>{const copy=n.cloneNode(true);copy.querySelectorAll('svg').forEach(e=>e.remove());return count(copy.textContent||'');})();if(value===null)continue;for(const [key,re]of Object.entries({views:/조회|views?|재생|plays?/i,likes:/좋아요|likes?/i,replies:/답글|댓글|replies|comments?/i,reposts:/재게시|리포스트|reposts?/i,quotes:/인용|quotes?/i}))if(re.test(label))metrics[key]=value;}
    // Also scan plain spans/divs inside the card for view count badges (e.g. "조회 1.4만회", "14.2K views")
    for(const s of card.querySelectorAll('span,div')){if(s.childElementCount>1)continue;const t=(s.innerText||s.textContent||'').trim();if(!t||t.length>45)continue;const vm=t.match(/^(?:조회(?:수)?\s*([\d,.]+\s*(?:만|천|[KMB])?)\s*회?|([\d,.]+\s*(?:만|천|[KMB])?)\s*(?:회\s*조회|views?|plays?))$/i);if(vm&&metrics.views===null){const v=count((vm[1]||vm[2]||'').trim());if(v!==null)metrics.views=v;}}
    const topicTags=[...card.querySelectorAll('a[href]')].filter(a=>{try{return /^\/search(?:\/|$)/.test(new URL(a.href,location.href).pathname);}catch{return false;}}).map(a=>(a.innerText||a.textContent||'').trim()).filter(t=>/^(?:#|\[)?(?:광고|협찬|유료광고)(?:\])?$/.test(t));
    if(detail&&!profileMode&&post.id===source.id){const labels=[...document.querySelectorAll('h1,h2,[role=heading]')];for(const n of document.querySelectorAll('span,div,a')){if(n.childElementCount>2||!visible(n)||!(n.compareDocumentPosition(card)&Node.DOCUMENT_POSITION_FOLLOWING))continue;const label=(n.innerText||n.textContent||'').trim();if(/^(?:조회(?:수)?\s*[\d,.]+\s*(?:만|천|[KMB])?\s*회?|[\d,.]+\s*(?:만|천|[KMB])?\s*(?:회\s*조회|views?|plays?))$/i.test(label)){const match=label.match(/[\d,.]+\s*(?:만|천|[KMB])?/i);const v=match?count(match[0].trim()):null;if(v!==null)metrics.views=v;}}for(const h of labels){const scope=h.parentElement;if(!scope||scope.querySelector('article,[role=article]'))continue;const value=(scope.innerText||scope.textContent||'').trim();if(value.length>250)continue;const m=value.match(/(?:조회(?:수)?|views?)\s*([\d,.]+\s*(?:만|천|[KMB])?)|([\d,.]+\s*(?:만|천|[KMB])?)\s*(?:회?\s*조회|views?)/i);if(m){const v=count((m[1]||m[2]||'').trim());if(v!==null)metrics.views=v;}}}
    const time=card.querySelector('time[datetime]')?.getAttribute('datetime')||null;
    if(detail&&!profileMode&&post.id!==source.id&&!/작성자|author/i.test(card.innerText||card.textContent||''))continue;
    seen.add(post.id);items.push({...post,text,thumbnail_url:thumbnail,media_checked:true,media_assets:mediaAssets,topic_tags:[...new Set(topicTags)],links:[...new Set(links)].slice(0,20),metrics,published_at:time,evidence_scope:profileMode?'visible_profile_post':detail&&post.id!==source.id?'visible_author_reply':'visible_post_card',comments_checked:false});
  }
  return {related_section_observed:Boolean(heading),status:items.length?'captured':detail?'detail_not_observed':'related_not_observed',source:source.permalink,items,observed_at:new Date().toISOString()};
}
if(typeof module!=='undefined')module.exports={extractThreadsResearch};
