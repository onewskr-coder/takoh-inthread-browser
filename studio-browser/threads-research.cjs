const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {extractThreadsResearch}=require('./threads-research-extract.js');
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
  const evidence=[];for(const [kind,pattern]of Object.entries(patterns))for(const match of text.matchAll(pattern)){evidence.push({kind,match:match[0],excerpt:text.slice(Math.max(0,match.index-35),match.index+match[0].length+65)});if(evidence.filter(e=>e.kind===kind).length>=5)break;}
  const links=[...new Set((item.links||[]).filter(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}))].slice(0,20);
  return {evidence,links,commercial_candidate:evidence.length>0||links.length>0,disclosure_observed:evidence.length>0,assessment:'문구·링크 단서이며 광고 확정 또는 법적 적합성 판정이 아닙니다.'};
}
class ResearchStore{
  constructor(dir){this.file=path.join(dir,'threads-research.json');this.data={version:1,posts:{},sessions:[]};if(fs.existsSync(this.file)){const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(data.version!==1||!data.posts||!Array.isArray(data.sessions))throw Error('관련 콘텐츠 저장 자료를 확인해 주세요.');this.data=data;}}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data,null,2));fs.renameSync(tmp,this.file);}
  capture(source,result,product){source=postUrl(source);const at=new Date().toISOString();let added=0;
    for(const item of (result.items||[]).slice(0,50)){let url;try{url=postUrl(item.permalink);}catch{continue;}if(url===source)continue;const parsed=new URL(url).pathname.match(/^\/@([^/]+)\/post\/(.+)$/),id=parsed[2];const old=this.data.posts[id];const metrics={};for(const k of ['views','likes','replies','reposts','quotes'])metrics[k]=typeof item.metrics?.[k]==='number'&&Number.isFinite(item.metrics[k])&&item.metrics[k]>=0?item.metrics[k]:null;
      const priorDetail=old?.detail_evidence||[];const checks=classify({text:[item.text,...priorDetail.map(x=>x.text)].join('\n'),links:[...(item.links||[]),...priorDetail.flatMap(x=>x.links||[])]});const observed={...item,id,username:parsed[1],permalink:url,text:String(item.text||'').slice(0,10000),links:checks.links,checks,metrics,observed_at:at,comments_checked:priorDetail.length?'visible_author_replies_only':false,detail_evidence:priorDetail,detail_metrics:old?.detail_metrics};
      const history=old?.history||[];history.push({at,metrics});this.data.posts[id]={...observed,first_seen:old?.first_seen||at,sources:[...new Set([...(old?.sources||[]),source])],products:[...new Set([...(old?.products||[]),String(product||'').slice(0,120)].filter(Boolean))],product_match:old?.product_match||'unreviewed',saved_reference:old?.saved_reference||false,history:history.slice(-100)};if(!old)added++;
    }
    this.data.sessions.push({source,at,status:result.status,observed:(result.items||[]).length,added});this.data.sessions=this.data.sessions.slice(-200);this.save();return {added,status:result.status,...this.list()};
  }
  list(){const posts=Object.values(this.data.posts);const accounts=new Map();for(const p of posts){const key=p.username.toLowerCase();const a=accounts.get(key)||{username:p.username,posts:0,commercial_candidates:0,evidence_and_link:0,confirmed_products:0};a.posts++;a.commercial_candidates+=Number(p.checks.commercial_candidate);a.evidence_and_link+=Number(p.checks.disclosure_observed&&p.links.length>0);a.confirmed_products+=Number(p.product_match==='same');accounts.set(key,a);}return {posts,accounts:[...accounts.values()],last_session:this.data.sessions.at(-1)||null};}
  mark(id,match){if(!['same','similar','different','unreviewed'].includes(match)||!this.data.posts[id])throw Error('제품 확인 항목을 선택하세요.');this.data.posts[id].product_match=match;this.save();return this.list();}
  enrich(id,result){const p=this.data.posts[id];if(!p||postUrl(result.source)!==p.permalink)throw Error('검사한 원문이 수집한 게시물과 다릅니다.');if(result.status!=='captured')return {status:result.status,...this.list()};
    const root=(result.items||[]).find(x=>x.id===id);if(!root)return {status:'detail_not_observed',...this.list()};
    const observations=(result.items||[]).filter(x=>x.id===id||(x.username.toLowerCase()===p.username.toLowerCase()&&x.evidence_scope==='visible_author_reply')).map(x=>({post_url:postUrl(x.permalink),scope:x.evidence_scope,text:String(x.text||'').slice(0,10000),links:classify(x).links,at:new Date().toISOString()}));
    const merged=new Map((p.detail_evidence||[]).map(x=>[x.post_url,x]));for(const x of observations)merged.set(x.post_url,x);p.detail_evidence=[...merged.values()].slice(-51);p.checks=classify({text:p.detail_evidence.map(x=>x.text).join('\n'),links:p.detail_evidence.flatMap(x=>x.links)});p.links=p.checks.links;p.comments_checked='visible_author_replies_only';
    // Keep the related-card counters separate from detail-page observations.
    p.detail_metrics={...root.metrics,observed_at:new Date().toISOString()};this.save();return {status:'detail_checked',...this.list()};
  }
}
function createThreadsResearch({dataDir,BrowserWindow,helper}){
  let store,storeError;try{store=new ResearchStore(dataDir);}catch(error){storeError=error;}let guest=null,review=null,reviewId='',source='',product='',pending=false;const partition='threads-research-'+crypto.randomUUID();
  const allowed=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)&&!u.port&&!u.username&&!u.password;}catch{return false;}};
  return {async request(action,packet={}){
    if(!store)throw Error('관련 콘텐츠 저장 자료를 읽지 못했습니다. 기존 파일은 보존됩니다.');
    if(action==='list')return store.list();
    if(action==='mark')return store.mark(packet.id,packet.match);
    if(action==='review-open'){
      const p=store.data.posts[String(packet.id)];if(!p)throw Error('검사할 후보를 선택하세요.');
      if(review&&!review.isDestroyed()){const editing=await review.webContents.executeJavaScript(`!!Array.from(document.querySelectorAll('[contenteditable="true"],textarea')).find(e=>(e.innerText||e.value||'').trim())`);if(editing)throw Error('원문 확인 창에 작성 중인 내용이 있습니다. 먼저 보존해 주세요.');}
      else {review=new BrowserWindow({width:1000,height:820,title:'Threads 원문 근거 확인 · 기존 사이트 세션',webPreferences:{partition:'persist:sites',nodeIntegration:false,contextIsolation:true,sandbox:true}});review.webContents.setWindowOpenHandler(()=>({action:'deny'}));review.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});review.webContents.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault();});}
      reviewId=p.id;review.show();await review.loadURL(p.permalink);return {opened:true};
    }
    if(action==='review-capture'){
      if(!review||review.isDestroyed()||!reviewId)throw Error('후보의 원문 검사 창을 먼저 여세요.');const p=store.data.posts[reviewId];if(postUrl(review.webContents.getURL())!==p.permalink)throw Error('처음 연 후보의 원문으로 돌아가세요.');const r=await review.webContents.executeJavaScript('('+extractThreadsResearch.toString()+')(true)');if(r.status==='login_required')return {status:r.status,...store.list()};return store.enrich(reviewId,r);
    }
    if(action==='open'){
      if(pending)throw Error('관련 화면을 여는 중입니다.');const input=researchInput(packet.url);pending=true;try{source='';product=String(packet.product||'').slice(0,120);
        if(!guest||guest.isDestroyed()){guest=new BrowserWindow({width:1000,height:820,title:'Threads 관련 콘텐츠 · 비로그인 탐색',webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true}});guest.webContents.setWindowOpenHandler(()=>({action:'deny'}));guest.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});guest.webContents.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault();});guest.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));}
        guest.show();await loadResearchPage(guest,input.url);try{source=postUrl(guest.webContents.getURL());}catch{throw Error(input.shared?'공유 링크가 아직 게시물 주소로 연결되지 않았습니다. 로그인 안내나 페이지 오류를 확인한 뒤 주소창의 게시물 고유 주소를 사용하세요.':'게시물 페이지를 확인하지 못했습니다. 로그인 안내나 페이지 오류를 확인하세요.');}
        return {opened:true,canonical_url:source,message:(input.shared?'공유 링크를 게시물 주소로 연결했습니다. ':'')+'관련 스레드 영역을 화면에 표시한 뒤 앱에서 현재 목록 수집을 누르세요. 로그인 요구가 나오면 중단합니다.'};
      }finally{pending=false;}
    }
    if(action==='capture'){
      if(!guest||guest.isDestroyed())throw Error('먼저 비로그인 관련 화면을 여세요.');if(pending)throw Error('페이지 로딩 중입니다.');if(postUrl(guest.webContents.getURL())!==source)throw Error('처음 연 게시물로 돌아간 뒤 수집하세요.');
      const result=await guest.webContents.executeJavaScript('('+extractThreadsResearch.toString()+')()');return store.capture(source,result,product);
    }
    if(action==='reference'){
      const p=store.data.posts[String(packet.id)];if(!p)throw Error('수집한 게시물을 찾지 못했습니다.');if(p.product_match!=='same'&&p.product_match!=='similar')throw Error('동일 제품 또는 유사 제품인지 먼저 확인하세요.');
      await helper('references/import',{reference:{id:'threads-'+p.id,username:p.username,text:p.text,permalink:p.permalink,mediaKind:'auto',imageUrls:[],videoUrls:[],discovery:{source:'threads_related',seed_posts:p.sources,product_match:p.product_match,evidence:p.checks.evidence,detail_evidence:p.detail_evidence||[],observed_metrics:p.metrics,observed_at:p.observed_at,comments_checked:p.comments_checked}}});store.data.posts[p.id].saved_reference=true;store.save();return {saved:true};
    }
    throw Error('지원하지 않는 관련 콘텐츠 동작입니다.');
  },dispose(){for(const w of [guest,review])if(w&&!w.isDestroyed())w.destroy();}};
}
module.exports={postUrl,researchInput,loadResearchPage,classify,ResearchStore,createThreadsResearch};
