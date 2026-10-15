/* Read-only, bounded extraction. No scrolling, login dismissal or private API. */
function extractThreadsResearch(detail=false){
  const profileMode=detail==='profile';
  if(/\/(?:challenge|checkpoint)(?:\/|$)/i.test(location.pathname))return {status:'challenge_required',items:[]};
  if(/\/(?:accounts\/login|login)(?:\/|$)/i.test(location.pathname))return {status:'login_required',items:[]};
  if(/too many requests|요청이 너무 많/i.test((document.body?.innerText||'').slice(0,1500)))return {status:'rate_limited',items:[]};
  const canonical=value=>{try{const u=new URL(value,location.href),m=u.pathname.match(/^\/@([\w.]+)\/post\/([\w-]+)\/?$/);return u.protocol==='https:'&&['www.threads.com','threads.com','www.threads.net','threads.net'].includes(u.hostname)&&m?{id:m[2],username:m[1],permalink:'https://www.threads.com/@'+m[1]+'/post/'+m[2]}:null;}catch{return null;}};
  const visible=node=>{if(!node||node.closest('[hidden],[aria-hidden="true"]'))return false;const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&node.getBoundingClientRect().height>0;};
  const profileMatch=location.pathname.match(/^\/@([\w.]+)\/?$/);
  const source=canonical(location.href)||(profileMode&&profileMatch?{username:profileMatch[1],permalink:'https://www.threads.com/@'+profileMatch[1]+'/'}:null);if(!source)return {status:'invalid_page',items:[]};
  const login=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(n=>visible(n)&&/로그인|log in|sign in/i.test(n.innerText||n.textContent));
  const joinPrompt=[...document.querySelectorAll('div,span,button,a')].some(n=>{if(n.childElementCount>2||!visible(n)||!/^(Threads에서 소통해보세요|Instagram으로 계속하기|Join Threads|Continue with Instagram)$/i.test((n.innerText||n.textContent||'').trim()))return false;const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;});
  if(login||joinPrompt)return {status:'login_required',items:[]};
  const heading=[...document.querySelectorAll('h1,h2,h3,[role="heading"],span,div')].find(n=>n.childElementCount<3&&visible(n)&&/^(관련\s*스레드|related\s*threads)$/i.test((n.innerText||n.textContent||'').trim()));
  if(!heading&&!detail)return {status:'related_not_observed',items:[]};
  const count=text=>{const m=String(text).replace(/,/g,'').match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(만|천|[KMB])?(?:\s|$)/i);if(!m)return null;return Math.round(Number(m[1])*({만:10000,천:1000,k:1000,m:1000000,b:1000000000}[(m[2]||'').toLowerCase()]||1));};
  const items=[],seen=new Set();
  for(const link of document.querySelectorAll('a[href*="/post/"]')){
    if(items.length>=50)break;
    const post=canonical(link.href);if(!post||(!detail&&post.id===source.id)||seen.has(post.id)||!visible(link))continue;
    if(!detail&&!(heading.compareDocumentPosition(link)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
    if(detail&&(post.username.toLowerCase()!==source.username.toLowerCase()||(!profileMode&&heading&&(heading.compareDocumentPosition(link)&Node.DOCUMENT_POSITION_FOLLOWING))))continue;
    let card=link.closest('article,[role="article"]');
    if(!card){for(let n=link.parentElement,depth=0;n&&n!==document.body&&depth<20;n=n.parentElement,depth++){const ids=new Set([...n.querySelectorAll('a[href*="/post/"]')].map(a=>canonical(a.href)?.id).filter(Boolean));if(ids.size>1)break;if(ids.has(post.id)&&n.querySelector('img,video')&&(n.innerText||n.textContent||'').length>35)card=n;}}
    if(!card)continue;
    // Never attach neighbouring posts or comments to this account's evidence.
    const ids=new Set([...card.querySelectorAll('a[href*="/post/"]')].map(a=>canonical(a.href)?.id).filter(Boolean));if(ids.size!==1)continue;
    const clean=card.cloneNode(true);clean.querySelectorAll('button,[role="button"],nav,[data-takoh-threads-controls],.takoh-collect-reference').forEach(n=>n.remove());
    const text=(clean.innerText||clean.textContent||'').trim().slice(0,10000),links=[];
    for(const a of card.querySelectorAll('a[href]')){try{let u=new URL(a.href,location.href);if(['l.threads.com','l.threads.net'].includes(u.hostname)){const target=u.searchParams.get('u');if(target)u=new URL(target);}if(u.protocol==='https:'&&!/(^|\.)(threads\.com|threads\.net)$/.test(u.hostname)){u.username='';u.password='';u.hash='';links.push(u.href);}}catch{}}
    const metrics={views:null,likes:null,replies:null,reposts:null,quotes:null};
    for(const n of card.querySelectorAll('button,[role="button"],[aria-label]')){const label=n.getAttribute('aria-label')||n.querySelector('[aria-label]')?.getAttribute('aria-label')||'',value=count(label+' '+(n.innerText||n.textContent||''));if(value===null)continue;for(const [key,re]of Object.entries({views:/조회|views/i,likes:/좋아요|likes?/i,replies:/답글|댓글|replies/i,reposts:/재게시|리포스트|reposts?/i,quotes:/인용|quotes?/i}))if(re.test(label))metrics[key]=value;}
    const topicTags=[...card.querySelectorAll('a[href]')].filter(a=>{try{return /^\/search(?:\/|$)/.test(new URL(a.href,location.href).pathname);}catch{return false;}}).map(a=>(a.innerText||a.textContent||'').trim()).filter(t=>/^(?:#|\[)?(?:광고|협찬|유료광고)(?:\])?$/.test(t));
    const time=card.querySelector('time[datetime]')?.getAttribute('datetime')||null;
    if(detail&&!profileMode&&post.id!==source.id&&!/작성자|author/i.test(card.innerText||card.textContent||''))continue;
    seen.add(post.id);items.push({...post,text,topic_tags:[...new Set(topicTags)],links:[...new Set(links)].slice(0,20),metrics,published_at:time,evidence_scope:profileMode?'visible_profile_post':detail&&post.id!==source.id?'visible_author_reply':'visible_post_card',comments_checked:false});
  }
  return {status:items.length?'captured':detail?'detail_not_observed':'related_not_observed',source:source.permalink,items,observed_at:new Date().toISOString()};
}
if(typeof module!=='undefined')module.exports={extractThreadsResearch};
