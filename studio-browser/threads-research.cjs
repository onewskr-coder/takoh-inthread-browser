const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PreviewCache,mediaState,groupMedia,assetKey}=require('./threads-research-media.cjs');
const {extractThreadsResearch}=require('./threads-research-extract.js');
const {closeThreadsPrompt}=require('./threads-research-page.js');
const {ResearchFrontier,createFrontierRunner,frontierTarget}=require('./threads-research-frontier.cjs');
function postUrl(value){const u=new URL(String(value||''));const m=u.pathname.match(/^\/@([\w.]+)\/post\/([\w-]+)\/?$/);if(u.protocol!=='https:'||!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)||!m||u.username||u.password)throw Error('Threads 게시물 주소를 입력하세요.');return 'https://www.threads.com/@'+m[1]+'/post/'+m[2];}
function researchInput(value){
  let raw=String(value||'').trim().replace(/[\u200B-\u200D\uFEFF]/g,'');
  if(/^(?:www\.)?threads\.(?:com|net)\//i.test(raw))raw='https://'+raw;
  let u;try{u=new URL(raw);}catch{throw Error('복사한 Threads 게시물 또는 공유 링크를 붙여넣으세요.');}
  if(u.protocol!=='https:'||!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)||u.port||u.username||u.password)throw Error('threads.com 또는 threads.net의 HTTPS 게시물·공유 링크가 필요합니다.');
  if(/^\/share\/[\w-]+\/?$/.test(u.pathname))return {url:u.origin+u.pathname,shared:true};
  try{return {url:postUrl(u.href),shared:false};}catch{throw Error('계정 주소 대신 게시물 고유 주소 또는 /share/ 공유 링크를 입력하세요.');}
}
async function loadResearchPage(window,url,timeout=25000){
  let timer;try{await Promise.race([window.loadURL(url),new Promise((_,reject)=>{timer=setTimeout(()=>{window.webContents.stop?.();reject(Error('Threads 페이지 열기 시간이 초과됐습니다. 기존 결과는 유지됩니다.'));},timeout);})]);}finally{clearTimeout(timer);}
}
function classify(item){
  const text=String(item.text||'');const patterns={advertising:/#\s*광고|\[광고\]|(?:^|\n)\s*광고\s*(?=\n|$)|유료\s*광고|\badvertisement\b|#ad\b/gi,sponsorship:/협찬|제품\s*제공|무상\s*제공|\bsponsored\b|\bgifted\b/gi,economic:/수수료|커미션|경제적\s*이해|제휴\s*활동|파트너스\s*활동|\baffiliate\b|\bcommission\b/gi};
  const evidence=[];for(const tag of (Array.isArray(item.topic_tags)?item.topic_tags:[]))if(/^(?:#|\[)?(?:광고|협찬|유료광고)(?:\])?$/.test(tag))evidence.push({kind:'advertising',scope:'topic_tag',match:tag,excerpt:'게시물 토픽 태그: '+tag});for(const [kind,pattern]of Object.entries(patterns))for(const match of text.matchAll(pattern)){evidence.push({kind,match:match[0],excerpt:text.slice(Math.max(0,match.index-35),match.index+match[0].length+65)});if(evidence.filter(e=>e.kind===kind).length>=5)break;}
  const links=[...new Set((item.links||[]).filter(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}))].slice(0,20);
  return {evidence,links,commercial_candidate:evidence.length>0||links.length>0,disclosure_observed:evidence.length>0,assessment:'문구·링크 단서이며 광고 확정 또는 법적 적합성 판정이 아닙니다.'};
}
function contentRegion(text){const value=String(text||'').replace(/https?:\/\/\S+/g,'').replace(/@[^\s]+/g,'').replace(/\d+\s*(?:초|분|시간|일|주|개월|년)(?:\s*전)?/g,'').replace(/작성자|번역하기|더 보기|답글 보기/g,'');if(/[가-힣]/.test(value))return 'korean';if(/[A-Za-z\u3040-\u30ff\u4e00-\u9fff\u0400-\u04ff\u0e00-\u0e7f]/.test(value))return 'overseas';return 'unknown';}
function safeThumbnail(value){try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
class ResearchStore{
  constructor(dir){this.file=path.join(dir,'threads-research.json');this.data={version:1,posts:{},sessions:[]};if(fs.existsSync(this.file)){const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(data.version!==1||!data.posts||!Array.isArray(data.sessions))throw Error('관련 콘텐츠 저장 자료를 확인해 주세요.');this.data=data;}}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data,null,2));fs.renameSync(tmp,this.file);}
  capture(source,result,product,context={}){source=postUrl(source);const at=new Date().toISOString();let added=0;
    for(const item of (result.items||[]).slice(0,50)){let url;try{url=postUrl(item.permalink);}catch{continue;}if(url===source&&!context.allowSource)continue;const parsed=new URL(url).pathname.match(/^\/@([^/]+)\/post\/(.+)$/),id=parsed[2];const old=this.data.posts[id];if(!old&&(item.evidence_scope==='visible_author_reply'||item.media_checked&&!(item.media_assets||[]).length))continue;const metrics={};for(const k of ['views','likes','replies','reposts','quotes'])metrics[k]=typeof item.metrics?.[k]==='number'&&Number.isFinite(item.metrics[k])&&item.metrics[k]>=0?item.metrics[k]:null;
      const priorDetail=old?.detail_evidence||[];const checks=classify({topic_tags:item.topic_tags,text:[item.text,...priorDetail.map(x=>x.text)].join('\n'),links:[...(item.links||[]),...priorDetail.flatMap(x=>x.links||[])]});const observed={...item,id,username:parsed[1],permalink:url,text:String(item.text||'').slice(0,10000),links:checks.links,checks,metrics,observed_at:at,comments_checked:priorDetail.length?'visible_author_replies_only':false,detail_evidence:priorDetail,detail_metrics:old?.detail_metrics,thumbnail_url:safeThumbnail(item.thumbnail_url)||old?.thumbnail_url||null,media_checked:item.media_checked??old?.media_checked,media_assets:item.media_assets??old?.media_assets,media_preview:!item.media_checked||assetKey(item.thumbnail_url)===assetKey(old?.thumbnail_url)?old?.media_preview:null,preview_error:old?.preview_error,separate_media:old?.separate_media};
      const history=old?.history||[];history.push({at,metrics});const paths=old?.discovery_paths||[];if(context.kind&&!paths.some(p=>p.kind===context.kind&&p.from===context.from))paths.push({kind:context.kind,from:context.from,at});this.data.posts[id]={...observed,discovery_paths:paths.slice(-100),first_seen:old?.first_seen||at,sources:[...new Set([...(old?.sources||[]),source])],products:[...new Set([...(old?.products||[]),String(product||'').slice(0,120)].filter(Boolean))],product_match:old?.product_match||'unreviewed',saved_reference:old?.saved_reference||false,history:history.slice(-100)};if(!old)added++;
    }
    this.data.sessions.push({source,at,status:result.status,observed:(result.items||[]).length,added});this.data.sessions=this.data.sessions.slice(-200);this.save();return {added,status:result.status,...this.list()};
  }
  list(){const posts=Object.values(this.data.posts).map(p=>({...p,media_state:mediaState(p),content_region:contentRegion(p.text),display_metrics:Object.fromEntries(['views','likes','replies','reposts','quotes'].map(k=>[k,(p.detail_metrics?.observed_at>=p.observed_at?p.detail_metrics?.[k]??p.metrics?.[k]:p.metrics?.[k]??p.detail_metrics?.[k])??null]))}));const accounts=new Map();for(const p of posts){const key=p.username.toLowerCase();const a=accounts.get(key)||{username:p.username,posts:0,commercial_candidates:0,evidence_and_link:0,confirmed_products:0};a.posts++;a.commercial_candidates+=Number(p.checks.commercial_candidate);a.evidence_and_link+=Number(p.checks.disclosure_observed&&p.links.length>0);a.confirmed_products+=Number(p.product_match==='same');accounts.set(key,a);}const groups=groupMedia(posts).map(g=>({id:g.id,representative_id:g.representative.id,member_ids:g.members.map(p=>p.id),reason:g.reason,duplicate_count:g.duplicate_count}));return {posts,media_groups:groups,media_summary:{ready:posts.filter(p=>p.media_state==='ready').length,pending:posts.filter(p=>p.media_state==='pending').length,excluded:posts.filter(p=>p.media_state==='excluded').length,review:posts.filter(p=>p.media_state==='review').length,groups:groups.length},accounts:[...accounts.values()],last_session:this.data.sessions.at(-1)||null};}
  mark(id,match){if(!['same','similar','different','unreviewed'].includes(match)||!this.data.posts[id])throw Error('제품 확인 항목을 선택하세요.');this.data.posts[id].product_match=match;this.save();return this.list();}
  enrich(id,result){const p=this.data.posts[id];if(!p||postUrl(result.source)!==p.permalink)throw Error('검사한 원문이 수집한 게시물과 다릅니다.');if(result.status!=='captured')return {status:result.status,...this.list()};
    const root=(result.items||[]).find(x=>x.id===id);if(!root)return {status:'detail_not_observed',...this.list()};
    const observations=(result.items||[]).filter(x=>x.id===id||(x.username.toLowerCase()===p.username.toLowerCase()&&x.evidence_scope==='visible_author_reply')).map(x=>({post_url:postUrl(x.permalink),scope:x.evidence_scope,text:String(x.text||'').slice(0,10000),links:classify(x).links,topic_tags:x.topic_tags||[],at:new Date().toISOString()}));
    const merged=new Map((p.detail_evidence||[]).map(x=>[x.post_url,x]));for(const x of observations)merged.set(x.post_url,x);p.detail_evidence=[...merged.values()].slice(-51);p.checks=classify({topic_tags:p.detail_evidence.flatMap(x=>x.topic_tags||[]),text:p.detail_evidence.map(x=>x.text).join('\n'),links:p.detail_evidence.flatMap(x=>x.links)});p.links=p.checks.links;p.comments_checked='visible_author_replies_only';
    // Keep the related-card counters separate from detail-page observations.
    p.detail_metrics={...root.metrics,observed_at:new Date().toISOString()};p.thumbnail_url=safeThumbnail(root.thumbnail_url)||p.thumbnail_url||null;if(root.media_checked){p.media_checked=true;p.media_assets=root.media_assets||[];if(p.media_preview&&p.media_preview.asset_key!==assetKey(root.thumbnail_url))p.media_preview=null;}this.save();return {status:'detail_checked',...this.list()};
  }
}
function createThreadsResearch({dataDir,BrowserWindow,helper,mediaCache}){
  let store,storeError;try{store=new ResearchStore(dataDir);}catch(error){storeError=error;}let guest=null,review=null,reviewId='',source='',product='',pending=false;const partition='threads-research-'+crypto.randomUUID();
  const allowed=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)&&!u.port&&!u.username&&!u.password;}catch{return false;}};
  let cache=mediaCache;function previewCache(){if(!cache){const {net,nativeImage}=require('electron');cache=new PreviewCache(dataDir,{fetchImage:(u,o)=>net.fetch(u,o),decode:b=>nativeImage.createFromBuffer(b)});}return cache;}async function preparePreview(p){if(!p||!p.media_checked||!p.media_assets?.length)return;try{p.media_preview=await previewCache().prepare(p);if(p.media_preview)p.media_preview.asset_key=assetKey(p.media_assets.find(a=>a.preview_url)?.preview_url);p.preview_error='';}catch(e){p.preview_error=e.message;}store.save();}
  let frontier,runner;try{frontier=new ResearchFrontier(dataDir);}catch{}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  function ensureGuest(mobile=true){if(!guest||guest.isDestroyed()){guest=new BrowserWindow({width:460,height:940,title:'Threads 관련 콘텐츠 · 비로그인 탐색',webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true}});guest.webContents.setWindowOpenHandler(()=>({action:'deny'}));guest.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});guest.webContents.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault();});guest.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));guest.on?.('closed',()=>runner?.pause());}guest.setContentSize?.(mobile?430:1000,mobile?900:820);return guest;}
  async function readPage(mode=false){const code=fs.readFileSync(path.join(__dirname,'threads-research-extract.js'),'utf8');return guest.webContents.executeJavaScript('(()=>{'+code+';return extractThreadsResearch('+JSON.stringify(mode)+');})()');}
  async function normalClose(){const result=await guest.webContents.executeJavaScript('('+closeThreadsPrompt.toString()+')()');if(result?.clicked)await wait(400);return Boolean(result?.clicked);}
  if(frontier&&store)runner=createFrontierRunner({frontier,async visit(node,cancelled,remainingMs){
    const window=ensureGuest();window.show();let current;try{current=frontierTarget(window.webContents.getURL()).url;}catch{}if(current!==node.url)await loadResearchPage(window,node.url,Math.min(25000,remainingMs));
    await wait(1400);let closed=false;const related=new Map(),profilePosts=new Map(),detail=new Map();let outcome='related_not_observed';
    for(let scroll=0;scroll<(node.kind==='profile'?5:4);scroll++){
      if(cancelled())return {status:'cancelled',related:[...related.values()],profile_posts:[...profilePosts.values()],detail:[...detail.values()]};if(!closed)closed=await normalClose();
      const mode=node.kind==='profile'?'profile':false;const result=await readPage(mode);outcome=result.status;
      if(['login_required','invalid_page'].includes(result.status))return {status:result.status,normal_close:closed,related:[...related.values()],profile_posts:[...profilePosts.values()],detail:[...detail.values()]};
      for(const item of result.items||[]){if(node.kind==='profile'){let prior;try{prior=frontier.data.nodes[frontierTarget(item.permalink).key];}catch{continue;}if(prior&&prior.state!=='queued')continue;} (node.kind==='profile'?profilePosts:related).set(item.id,item);}
      if(node.kind==='post'){const own=await readPage(true);for(const item of own.items||[])detail.set(item.id,item);if(result.status==='related_not_observed')break;}
      if(node.kind==='profile'&&profilePosts.size>=frontier.data.limits.postsPerProfile)break;
      if(scroll<(node.kind==='profile'?4:3)){await window.webContents.executeJavaScript('window.scrollBy(0,Math.max(300,innerHeight*.85))');await wait(550);}
    }
    return {related_status:node.kind==='profile'?'not_applicable':outcome==='related_not_observed'?'not_observed':related.size?'captured':'empty',status:related.size||profilePosts.size||detail.size?'captured':outcome,normal_close:closed,related:[...related.values()],profile_posts:[...profilePosts.values()],detail:[...detail.values()]};
  },async ingest(node,result){
    const seed=frontier.data.seed,product=frontier.data.product,own=(result.detail||[]).find(p=>p.permalink===node.url);
    if(own&&(own.media_assets?.length||store.data.posts[own.id])){store.capture(seed,{status:'captured',items:[own]},product,{allowSource:true,kind:'visited_post',from:node.from});store.enrich(own.id,{status:'captured',source:node.url,items:result.detail});}
    if(result.related?.length)store.capture(node.url,{status:'captured',items:result.related},product,{kind:'related',from:node.url});
    if(result.profile_posts?.length)store.capture(seed,{status:'captured',items:result.profile_posts},product,{allowSource:true,kind:'profile_post',from:node.url});for(const item of [...(result.detail||[]),...(result.related||[]),...(result.profile_posts||[])].slice(0,8)){const p=store.data.posts[item.id];if(p&&!p.media_preview)await preparePreview(p);}
  }});
  return {async request(action,packet={}){
    if(!store)throw Error('관련 콘텐츠 저장 자료를 읽지 못했습니다. 기존 파일은 보존됩니다.');
    if(action==='list'||action==='crawl-status'){const list=store.list();return {...list,frontier:runner?{...runner.status(),new_posts:Math.max(0,list.posts.length-(frontier.data.start_posts||0)),new_accounts:Math.max(0,list.accounts.length-(frontier.data.start_accounts||0))}:null};}
    if(action==='crawl-pause'){runner?.pause();guest?.webContents.stop?.();return {...store.list(),frontier:runner?.status()||null};}
    if(action==='start-from-post'){
      if(pending)throw Error('페이지 확인이 진행 중입니다. 완료 후 다시 눌러 주세요.');if(!runner)throw Error('탐색 대기열을 읽지 못했습니다.');const url=postUrl(packet.url);pending=true;try{runner.pause();await runner.settled();frontier.configure(url,'',{keepQueue:true,maxPages:20,maxDepth:5,postsPerProfile:10,maxSeconds:180});const node=frontier.data.nodes[frontierTarget(url).key];if(!node)throw Error('탐색 대기열 한도에 도달했습니다.');node.relation='selected_seed';node.state='queued';node.depth=0;node.branch=url;frontier.data.selected_branch=url;frontier.save();source=url;frontier.data.start_posts=Object.keys(store.data.posts).length;frontier.data.start_accounts=store.list().accounts.length;runner.start();return {...store.list(),frontier:runner.status(),selected_seed:url};}finally{pending=false;}
    }
    if(action==='crawl-start'){
      if(pending)throw Error('페이지를 여는 중입니다. 로딩 후 탐색을 시작하세요.');
      if(!runner)throw Error('탐색 대기열을 읽지 못했습니다. 기존 파일은 보존됩니다.');if(runner.isRunning())return {...store.list(),frontier:runner.status()};
      if(!frontier.data.seed||packet.url){const input=researchInput(packet.url);if(input.shared){const window=ensureGuest();window.show();await loadResearchPage(window,input.url);source=postUrl(window.webContents.getURL());}else source=input.url;frontier.configure(source,packet.product,packet.limits||{});}
      frontier.data.start_posts=Object.keys(store.data.posts).length;frontier.data.start_accounts=store.list().accounts.length;const status=runner.start();return {...store.list(),frontier:status};
    }
    if(['open','capture','review-open','review-capture'].includes(action)&&runner?.isRunning())throw Error('연속 탐색 중입니다. 먼저 일시정지한 뒤 현재 화면을 사용하세요.');
    if(action==='viewport'){ensureGuest(packet.mode!=='desktop').show();return {mobile:packet.mode!=='desktop'};}
    if(action==='close-prompt'){if(!guest||guest.isDestroyed())throw Error('먼저 관련 화면을 여세요.');const clicked=await normalClose();return {clicked,message:clicked?'화면의 정상 X 닫기 버튼을 눌렀습니다. 다시 수집할 수 있습니다.':'현재 화면에 보이는 정상 X 닫기 버튼을 찾지 못했습니다. 직접 닫거나 로그인 상태를 확인하세요.'};}
    if(action==='separate-media'){const p=store.data.posts[String(packet.id)];if(!p)throw Error('게시물을 찾지 못했습니다.');p.separate_media=!p.separate_media;store.save();return store.list();}
    if(action==='audit-media'){if(runner?.isRunning()||pending)throw Error('먼저 탐색을 일시정지하세요.');pending=true;let checked=0;try{const candidates=Object.values(store.data.posts).filter(p=>!p.media_checked||p.media_assets?.length&&!p.media_preview).slice(0,5);for(const p of candidates){ensureGuest().show();await loadResearchPage(guest,p.permalink);await wait(1800);await normalClose();const r=await readPage(true);if(r.status==='login_required')break;if(r.items?.some(x=>x.id===p.id)){store.enrich(p.id,r);await preparePreview(p);checked++;}await wait(1200);}return {...store.list(),checked};}finally{pending=false;}}
    if(action==='mark')return store.mark(packet.id,packet.match);
    if(action==='review-open'){
      const p=store.data.posts[String(packet.id)];if(!p)throw Error('검사할 후보를 선택하세요.');
      if(review&&!review.isDestroyed()){const editing=await review.webContents.executeJavaScript(`!!Array.from(document.querySelectorAll('[contenteditable="true"],textarea')).find(e=>(e.innerText||e.value||'').trim())`);if(editing)throw Error('원문 확인 창에 작성 중인 내용이 있습니다. 먼저 보존해 주세요.');}
      else {review=new BrowserWindow({width:1000,height:820,title:'Threads 원문 근거 확인 · 기존 사이트 세션',webPreferences:{partition:'persist:sites',nodeIntegration:false,contextIsolation:true,sandbox:true}});review.webContents.setWindowOpenHandler(()=>({action:'deny'}));review.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});review.webContents.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault();});}
      reviewId=p.id;review.show();await review.loadURL(p.permalink);return {opened:true};
    }
    if(action==='review-capture'){
      if(!review||review.isDestroyed()||!reviewId)throw Error('후보의 원문 검사 창을 먼저 여세요.');const p=store.data.posts[reviewId];if(postUrl(review.webContents.getURL())!==p.permalink)throw Error('처음 연 후보의 원문으로 돌아가세요.');const r=await review.webContents.executeJavaScript('('+extractThreadsResearch.toString()+')(true)');if(r.status==='login_required')return {status:r.status,...store.list()};store.enrich(reviewId,r);await preparePreview(p);return {status:r.status==='captured'?'detail_checked':r.status,...store.list()};
    }
    if(action==='open'){
      if(pending)throw Error('관련 화면을 여는 중입니다.');const input=researchInput(packet.url);pending=true;try{source='';product=String(packet.product||'').slice(0,120);
        ensureGuest(packet.viewport!=='desktop');
        guest.show();await loadResearchPage(guest,input.url);try{source=postUrl(guest.webContents.getURL());}catch{throw Error(input.shared?'공유 링크가 아직 게시물 주소로 연결되지 않았습니다. 로그인 안내나 페이지 오류를 확인한 뒤 주소창의 게시물 고유 주소를 사용하세요.':'게시물 페이지를 확인하지 못했습니다. 로그인 안내나 페이지 오류를 확인하세요.');}
        return {opened:true,canonical_url:source,message:(input.shared?'공유 링크를 게시물 주소로 연결했습니다. ':'')+'관련 스레드 영역을 화면에 표시한 뒤 [현재 관련 목록 수집]을 누르세요. 로그인 팝업이 뜨면 바깥 클릭이나 Esc로 닫을 수 있습니다. 로그인 요구가 유지되면 수집을 중단합니다.'};
      }finally{pending=false;}
    }
    if(action==='capture'){
      if(!guest||guest.isDestroyed())throw Error('먼저 비로그인 관련 화면을 여세요.');if(pending)throw Error('페이지 로딩 중입니다.');if(postUrl(guest.webContents.getURL())!==source)throw Error('처음 연 게시물로 돌아간 뒤 수집하세요.');
      await normalClose();const result=await readPage();const captured=store.capture(source,result,product);for(const item of result.items||[])await preparePreview(store.data.posts[item.id]);return {...captured,...store.list()};
    }
    if(action==='reference'){
      const p=store.data.posts[String(packet.id)];if(!p)throw Error('수집한 게시물을 찾지 못했습니다.');if(mediaState(p)!=='ready')throw Error('실제 미디어와 미리보기를 먼저 확인하세요.');if(p.product_match!=='same'&&p.product_match!=='similar')throw Error('동일 제품 또는 유사 제품인지 먼저 확인하세요.');
      await helper('references/import',{reference:{id:'threads-'+p.id,username:p.username,text:p.text,permalink:p.permalink,mediaKind:p.media_assets.some(a=>a.kind==='video')?'video':'image',imageUrls:p.media_assets.filter(a=>a.kind==='image').map(a=>safeThumbnail(a.source_url)).filter(Boolean),videoUrls:p.media_assets.filter(a=>a.kind==='video').map(a=>safeThumbnail(a.source_url)).filter(Boolean),thumbnailUrl:p.thumbnail_url,discovery:{source:'threads_related',seed_posts:p.sources,product_match:p.product_match,evidence:p.checks.evidence,detail_evidence:p.detail_evidence||[],observed_metrics:p.metrics,observed_at:p.observed_at,comments_checked:p.comments_checked}}});store.data.posts[p.id].saved_reference=true;store.save();return {saved:true};
    }
    throw Error('지원하지 않는 관련 콘텐츠 동작입니다.');
  },async prepareStop(){runner?.pause();guest?.webContents.stop?.();await runner?.settled();},dispose(){runner?.dispose();for(const w of [guest,review])if(w&&!w.isDestroyed())w.destroy();}};
}
module.exports={postUrl,researchInput,loadResearchPage,classify,ResearchStore,createThreadsResearch};
