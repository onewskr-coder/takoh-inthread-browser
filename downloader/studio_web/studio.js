'use strict';
const $ = id => document.getElementById(id);
let token = document.querySelector('meta[name="studio-token"]').content;
const disclosureDefaults={coupang:'이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',naver:'이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.',toss:'이 글의 토스쇼핑 제휴 링크를 통해 구매가 발생하면 수수료를 제공받습니다.'};
let job = null, busy = false, productDirty = false, account = null;
const names = {media_ready:'영상 준비', analysis_ready:'분석 완료', product_ready:'상품 준비', draft_ready:'초안 준비', publish_ready:'게시 준비',published:'본문·댓글 게시 완료'};
function message(text, error=false) { $('message').textContent=text; $('message').className=error?'error':''; }
async function api(path, data) {
  const options = data ? {method:'POST', headers:{'X-Studio-Token':token}, body:data instanceof FormData ? data : JSON.stringify(data)} : {};
  if (data && !(data instanceof FormData)) options.headers['Content-Type']='application/json';
  let response;try{response=await fetch('/studio/'+path, options);}catch{throw new Error('도우미 서버 연결이 끊겼습니다. 서버 실행 상태를 확인하고 다시 시도하세요. AI 요청은 자동으로 재전송하지 않았습니다.');}
  if(response.status===403&&data){const session=await fetch('/studio/session');const fresh=await session.json();token=fresh.token;options.headers['X-Studio-Token']=token;response=await fetch('/studio/'+path,options);}
  let result; try {result=await response.json();} catch {throw new Error(response.status===413?'영상이 300MB를 넘습니다.':'도우미 응답을 읽지 못했습니다.');}
  if (!response.ok) throw new Error(result.error || `요청 실패 (${response.status})`);
  return result;
}
async function act(label, action, success='저장했습니다.') {
  if(busy) return;
  busy=true;document.body.classList.add('busy');message(label);
  try {await action();message(success);} catch(error) {message(error.message,true);}
  finally {busy=false;document.body.classList.remove('busy');}
}
function credentials(){return {provider:$('ai-provider').value,key:$('key').value.trim(),model:$('model').value.trim(),fallback_model:$('fallback-model').value.trim()};}
function writingCounts(){for(const id of ['script','body']){const count=Array.from($(id).value).length;$(id+'-count').textContent=count+' / 500자';}for(const [button,field] of [['copy-intro','script'],['copy-draft-body','body']])$(button).disabled=!$(field).value.trim()||Array.from($(field).value).length>500;}
for(const id of ['script','body'])$(id).addEventListener('input',writingCounts);
for(const [button,field] of [['copy-intro','script'],['copy-draft-body','body']])$(button).onclick=()=>act('복사 중…',async()=>{await navigator.clipboard.writeText($(field).value);},'문단을 유지해 복사했습니다.');
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
window.$=$;window.api=api;window.act=act;window.message=message;window.text=text;
let editJobId=null;
let hookFocus=null;
function refreshHookFocus(){
  hookFocus=null;$('hook-focus-mark').hidden=true;
  const start=Number($('hook-start').value);
  $('hook-focus-image').src=`/studio/jobs/${job.id}/hook-frame?time=${start}`;
  const candidate=job.hook_recommendations?.candidates?.find(c=>Math.abs(c.timestamp-start)<.1);
  $('hook-focus-status').textContent=candidate?.product_box?'AI 제품 영역을 기준으로 확대합니다.':'제품 위치 정보가 없습니다. 제품을 클릭하거나 AI 후킹 추천을 다시 실행하세요. 확대 없이 효과만 적용됩니다.';
}
$('hook-focus-image').onclick=event=>{const bounds=event.currentTarget.getBoundingClientRect();hookFocus={x:(event.clientX-bounds.left)/bounds.width*100,y:(event.clientY-bounds.top)/bounds.height*100};$('hook-focus-mark').hidden=false;$('hook-focus-mark').style.left=hookFocus.x+'%';$('hook-focus-mark').style.top=hookFocus.y+'%';$('hook-focus-status').textContent='직접 지정한 제품 중심으로 확대합니다.';};
$('hook-focus-auto').onclick=refreshHookFocus;
$('hook-start').addEventListener('change',refreshHookFocus);

function regionBox(){for(const [key,property] of [['x','left'],['y','top'],['w','width'],['h','height']])$('subtitle-region-box').style[property]=$('subtitle-'+key).value+'%';}
for(const key of ['x','y','w','h'])$('subtitle-'+key).addEventListener('input',regionBox);
$('subtitle-treatment').onchange=()=>{$('subtitle-region').hidden=$('subtitle-treatment').value!=='local_fill';regionBox();};
let regionStart=null;
function regionPoint(event){const bounds=$('subtitle-region-preview').getBoundingClientRect();return [Math.max(1,Math.min(99,(event.clientX-bounds.left)/bounds.width*100)),Math.max(1,Math.min(99,(event.clientY-bounds.top)/bounds.height*100))];}
$('subtitle-region-preview').onpointerdown=event=>{regionStart=regionPoint(event);event.currentTarget.setPointerCapture(event.pointerId);};
$('subtitle-region-preview').onpointermove=event=>{if(!regionStart)return;const point=regionPoint(event);for(const [key,value] of [['x',Math.min(point[0],regionStart[0])],['y',Math.min(point[1],regionStart[1])],['w',Math.abs(point[0]-regionStart[0])],['h',Math.abs(point[1]-regionStart[1])]])$('subtitle-'+key).value=value.toFixed(1);regionBox();};
$('subtitle-region-preview').onpointerup=()=>{regionStart=null;};
$('subtitle-region-preview').onpointercancel=()=>{regionStart=null;};
function renderEditor(){
  $('hook-editor').hidden=!job?.analysis||job?.kind==='image';
  if(!job?.analysis||job.kind==='image'||editJobId===job.id)return;
  editJobId=job.id;const duration=job.media.duration,length=Math.round(Math.min(3,duration/3)*100)/100;
  $('hook-length').value=length;$('hook-start').max=duration-length;
  const result=job.analysis.result,hook=result.hook,recommendations=job.hook_recommendations?.candidates||[];
  $('hook-candidate').replaceChildren();
  for(const [i,item] of (recommendations.length?recommendations:result.observations).entries()){const option=text('option',recommendations.length?`${i+1}순위 · 적합도 ${item.score}/100 · ${item.timestamp}초 · ${item.reason}`:`${item.timestamp}초 · ${item.description}`);option.value=String(Math.max(0,Math.min(duration-length,item.timestamp)));option.dataset.timestamp=item.timestamp;option.dataset.reason=item.reason||item.description;$('hook-candidate').append(option);}
  const recommendation=recommendations.length?Number($('hook-candidate').value):hook&&Number.isFinite(hook.timestamp)?Math.max(0,Math.min(duration-length,hook.timestamp)):Number($('hook-candidate').value||0);
  $('hook-start').value=recommendation;refreshHookFocus();
  $('hook-reason').textContent=recommendations.length?'1순위 자동 선택 · '+recommendations[0].reason:hook?.reason?'AI 추천: '+hook.reason:'저장된 관찰 장면 중 사용할 구간을 선택하거나 AI 추천을 실행하세요.';
  if(!recommendations.length&&hook)$('hook-candidate').value=String(recommendation);
  $('hook-effect').value='impact';
  $('subtitle-region-image').src=`/studio/jobs/${job.id}/media/${job.evidence.frames[0].file}`;
  $('subtitle-treatment').value='auto_subtitles';$('subtitle-region').hidden=true;regionBox();
}
$('hook-candidate').onchange=()=>{const select=$('hook-candidate');$('hook-start').value=select.value;refreshHookFocus();const option=select.selectedOptions[0];$('hook-reason').textContent=option?.dataset.reason||'';const timestamp=Number(option?.dataset.timestamp||0);const frame=[...job.evidence.frames].sort((a,b)=>Math.abs(a.timestamp-timestamp)-Math.abs(b.timestamp-timestamp))[0];if(frame)$('subtitle-region-image').src=`/studio/jobs/${job.id}/media/${frame.file}`;};
$('recommend-hook').onclick=()=>act('영상 전체에서 후킹 후보를 비교하는 중…',async()=>{job=await api(`jobs/${job.id}/hook-recommend`,credentials());editJobId=null;render();await refreshJobs();},'추천 1순위를 선택했습니다. 원본 구간을 확인하고 인트로 효과를 고르세요.');
$('preview-hook').onclick=()=>{$('preview').currentTime=Number($('hook-start').value);$('preview').scrollIntoView({behavior:'smooth',block:'center'});};
$('create-hook-edit').onclick=()=>act('후킹 편집과 자막 처리 중… 원본은 보관됩니다.',async()=>{
  const sourceId=job.id,rectangle={};for(const key of ['x','y','w','h'])rectangle[key]=Number($('subtitle-'+key).value);
  const mode=$('subtitle-treatment').value;
  const timer=mode.startsWith('auto_')?setInterval(async()=>{try{const progress=await api(`jobs/${sourceId}/text-clean-progress`);if(progress.stage==='detecting')message(`자막 자동 감지·처리 중… ${progress.total>0?Math.min(100,Math.floor(progress.frame/progress.total*100)):0}% (${progress.frame} / ${progress.total} 프레임)`);else if(progress.stage==='encoding')message('자막 삭제 100% · 편집본 저장 중…');}catch{}},2000):null;
  try{job=await api(`jobs/${sourceId}/edit`,{hook_start:Number($('hook-start').value),opening_seconds:Number($('hook-length').value),hook_effect:$('hook-effect').value,hook_focus:hookFocus,effect_strength:Number($('hook-strength').value),subtitle_mode:mode,mute_audio:$('edit-audio').value==='mute',ad_position:$('ad-position').value,rectangle});render();await refreshJobs();$('preview').scrollIntoView({behavior:'smooth',block:'center'});}finally{if(timer)clearInterval(timer);}
},'편집본을 별도 작업으로 저장했습니다. 처음과 자막 영역의 복원 결과를 확인하세요.');
async function refreshJobs(){
  const items=await api('jobs');$('jobs').replaceChildren();
  for(const item of items){
    const row=document.createElement('div');row.className='saved-job';
    row.classList.toggle('active',item.id===job?.id);
    const button=document.createElement('button');button.type='button';button.className='saved-job-open';button.title=item.name;
    const thumbnail=document.createElement('img');thumbnail.src=`/studio/jobs/${item.id}/media/frame-0.jpg`;thumbnail.alt='';thumbnail.loading='lazy';thumbnail.onerror=()=>{thumbnail.hidden=true;};
    const details=document.createElement('span');details.className='saved-job-details';
    const title=text('span',item.name);title.className='saved-job-title';
    const status=text('span',`${names[item.status]||item.status}${item.reused_from?' · 재사용':''}`);status.className='saved-job-status';
    const action=text('span',item.analyzed?'열어서 대본 작성·재게시 →':'열어서 분석 →');action.className='saved-job-action';
    details.append(title,status,action);button.append(thumbnail,details);
    button.onclick=()=>act('저장된 원본과 분석을 불러오는 중…',async()=>{job=item.analyzed?await api(`jobs/${item.id}/reuse`,{}):await api(`jobs/${item.id}`);render();await refreshJobs();document.querySelector('[data-workspace="create"]')?.click();document.querySelector(`[data-production-stage="${job.analysis?'writing':'analysis'}"]`)?.click();});
    row.append(button);
    const remove=text('button','×');remove.type='button';remove.className='saved-job-delete';remove.title='이 작업 삭제';remove.setAttribute('aria-label',item.name+' 작업 삭제');remove.onclick=()=>{
      if(!window.confirm(`“${item.name}” 작업과 이 작업의 보관 파일을 삭제할까요? 다운로드 폴더의 원본과 Threads 게시물은 삭제되지 않습니다.`))return;
      act('작업 삭제 중…',async()=>{const response=await fetch(`/studio/jobs/${item.id}`,{method:'DELETE',headers:{'X-Studio-Token':token}});const result=await response.json();if(!response.ok)throw new Error(result.error||'작업 삭제 실패');if(job?.id===item.id){job=null;editJobId=null;render();}await refreshJobs();},'저장된 작업을 삭제했습니다.');
    };row.append(remove);
    $('jobs').append(row);
  }
}
function render(){
  productDirty=false;
  renderEditor();
  $('media').hidden=!job; $('analyze').disabled=!job;$('save-product').disabled=!job;
  $('draft').disabled=!job?.analysis;$('prepare').disabled=!job?.draft;
  $('copy-body').disabled=job?.status!=='publish_ready';$('copy-comment').disabled=job?.status!=='publish_ready';
  $('video-download').hidden=!job;
  $('analysis').replaceChildren();$('frames').replaceChildren();
  $('extension-upload').disabled=job?.status!=='publish_ready';
  $('draft-variants').replaceChildren();
  for(const [index,value] of (job?.draft?.variants||[]).entries()){const card=document.createElement('div');card.className='draft-variant';card.append(text('h3',`소개 글 ${index+1}안`),text('p',value));const select=text('button','이 초안 선택');select.type='button';select.onclick=()=>{$('script').value=value;$('body').value=value;job.draft.selected=index;writingCounts();$('extension-upload').disabled=true;message('선택한 초안을 수정한 뒤 본문·첫 댓글 저장을 눌러 주세요.');};card.append(select);$('draft-variants').append(card);}
  $('script').value=job?.draft?.script||'';$('body').value=job?.draft?.body||'';$('comment').value=job?.comment||'';
  writingCounts();
  $('disclosure').value=job?.disclosure||disclosureDefaults[job?.product?.platform]||'';
  $('draft-style').value=job?.draft?.style||$('draft-style').value||'observation';
  fillStyle();
  $('draft-quality').textContent=(job?.draft?.quality_notes||[]).join('\n');
  const product=job?.product;
  $('platform').value=product?.platform||'coupang';$('product-name').value=product?.name||'';
  $('product-url').value=product?.url||'';$('affiliate-url').value=product?.affiliate_url||'';
  $('confirmed').checked=['user_confirmed','api_issued'].includes(product?.attribution);
  $('publication').textContent=job?.status==='publish_ready'?'게시 준비 완료 · Threads에서 직접 게시해 주세요.':'아직 게시하지 않았습니다.';
  renderIntegrations();
  renderVisual();
  if(!job){$('preview').removeAttribute('src');return;}
  $('source').value=job.source;
  const base=`/studio/jobs/${job.id}/media/`;
  $('preview').hidden=job.kind==='image';$('image-preview').hidden=job.kind!=='image';
  if(job.kind==='image')$('image-preview').src=base+'frame-0.jpg';
  if($('preview').getAttribute('src')!==base+'video') $('preview').src=base+'video';
  $('video-download').href=base+(job.kind==='image'?'original':'video');$('video-download').download=job.name;
  $('metadata').textContent=`${job.name} · ${job.media.duration.toFixed(1)}초 · ${job.media.width}×${job.media.height} · ${job.media.has_audio?'음성 트랙 있음':'음성 트랙 없음'}`;
  if(job.edit?.text_clean)$('metadata').textContent+=` · 텍스트 처리 ${job.edit.text_clean.repaired_frames}/${job.edit.text_clean.frames}프레임`;
  for(const frame of job.evidence.frames){const figure=document.createElement('figure');const img=document.createElement('img');img.src=base+frame.file;img.alt=`${frame.timestamp}초 추출 프레임`;figure.append(img,text('figcaption',`${frame.timestamp}초`));$('frames').append(figure);}
  if(job.analysis){const data=job.analysis.result;$('analysis').append(text('h3',data.summary),text('p',job.analysis.scope?.description||job.evidence.description));const list=document.createElement('ul');for(const item of data.observations) list.append(text('li',`${item.timestamp}초: ${item.description}`));$('analysis').append(list,text('h3','음성 요약'),text('p',data.audio_summary),text('h3','확인이 필요한 내용'),text('p',data.uncertainties.join(' · ')),text('h3','상품 검색어'),text('p',data.search_terms.join(' · ')));}
}
async function update(path,data){job=await api(`jobs/${job.id}/${path}`,data);render();await refreshJobs();}
if($('url-fetch-form'))$('url-fetch-form').onsubmit=event=>{event.preventDefault();act('게시물에서 미디어를 가져오는 중…',async()=>{const url=$('fetch-url').value.trim();job=await api('acquire',{url});render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();},'영상·이미지를 불러왔습니다. 원본 분석을 시작할 수 있습니다.');};
$('upload-form').onsubmit=event=>{event.preventDefault();const file=$('video-file').files[0];if(!file){message('영상 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('영상과 음성·프레임을 추출하는 중…',async()=>{const data=new FormData();data.append('video',file);data.append('source',$('source').value);job=await api('jobs',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
$('image-form').onsubmit=event=>{event.preventDefault();const file=$('image-file').files[0];if(!file){message('이미지 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('원본 이미지 불러오는 중…',async()=>{const data=new FormData();data.append('image',file);data.append('source',$('source').value);job=await api('images',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
$('analyze').onclick=()=>act('선택한 영상 데이터를 분석하는 중…',()=>update('analyze',credentials()));
$('product-form').onsubmit=event=>{event.preventDefault();act('상품 저장 중…',()=>update('product',{platform:$('platform').value,name:$('product-name').value,url:$('product-url').value,affiliate_url:$('affiliate-url').value,confirmed:$('confirmed').checked}));};
$('draft').onclick=()=>act('영상 관찰 근거로 대본을 작성하는 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('draft',{...credentials(),style:$('draft-style').value});});
$('prepare').onclick=()=>act('게시 내용 준비 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요. 상품 변경 후에는 초안을 다시 작성합니다.');return update('prepare',{body:$('script').value,script:$('script').value,disclosure:$('disclosure').value,selected:job.draft.selected||0});});
for(const target of ['body','comment']) $('copy-'+target).onclick=()=>act('복사 중…',async()=>{await navigator.clipboard.writeText($(target).value);}, '복사했습니다. Threads에서 붙여 넣어 주세요.');
$('new-job').onclick=()=>{job=null;render();$('upload-form').reset();refreshJobs().catch(e=>message(e.message,true));$('video-file').focus();};
// Editing prepared text requires saving it again before the copy actions can run.
for(const id of ['script','body','disclosure','platform','product-name','product-url','affiliate-url','confirmed']) $(id).addEventListener('input',()=>{$('copy-body').disabled=true;$('copy-comment').disabled=true;});
for(const id of ['script','body','disclosure','platform','product-name','product-url','affiliate-url','confirmed']) $(id).addEventListener('input',()=>{$('publish-api').disabled=true;$('extension-upload').disabled=true;});
for(const id of ['platform','product-name','product-url','affiliate-url','confirmed']) $(id).addEventListener('input',()=>{productDirty=true;});
function renderIntegrations(){
 const p=job?.publication,locked=!!p?.account_id;
 $('recovery').hidden=p?.status!=='publish_uncertain';
 $('search-products').disabled=!job||locked;
 $('issue-affiliate').disabled=job?.product?.platform!=='coupang'||locked;
 $('publish-api').disabled=job?.status!=='publish_ready'||!account||p?.status==='publish_uncertain';
 for(const id of ['script','body','disclosure','platform','product-name','product-url','affiliate-url','confirmed']) $(id).disabled=locked;
 if(locked)for(const id of ['analyze','save-product','draft','prepare'])$(id).disabled=true;
 $('affiliate-status').textContent=job?.product?.affiliate_method==='coupang_api'?'쿠팡 API 발급 완료 · 정산 귀속은 파트너스 계정에서 별도 확인하세요.':'Amazon·네이버·토스는 공식 화면에서 직접 발급한 링크를 등록하세요.';
 const states={published:'본문과 광고 댓글 게시 및 확인 완료',media_processing:'영상 처리 중',comment_processing:'본문 게시 완료 · 댓글 처리 중',partial_success:'본문 게시 완료 · 댓글/결과 확인을 이어가세요.',publish_uncertain:'발행 결과 불확실 · 중복 방지를 위해 재발행 중지',failed:'게시 실패'};
 if(states[p?.status])$('publication').textContent=states[p.status]+(p.post_id?` · 본문 ID ${p.post_id}`:'')+(p.comment_id?` · 댓글 ID ${p.comment_id}`:'')+(p.error?` · ${p.error}`:'');
 $('publish-api').textContent=locked?'게시 진행 / 실패한 단계 이어가기':'영상과 광고 댓글 자동 게시';
 $('published-link').hidden=true;
 if(p?.permalink){try{const link=new URL(p.permalink);if(link.protocol==='https:'&&['www.threads.com','www.threads.net','threads.com','threads.net'].includes(link.hostname)){$('published-link').href=link.href;$('published-link').hidden=false;}}catch{}}
 $('public-video').value=p?.video_url||'';
 $('search-query').value=job?.search?.query||job?.analysis?.result?.search_terms?.[0]||'';
 $('candidates').replaceChildren();
 for(const candidate of job?.search?.candidates||[]){
  const box=document.createElement('div');box.append(text('h3',candidate.name),text('p',candidate.snippet));
  const choose=text('button','이 후보 선택');choose.type='button';choose.disabled=locked;
  choose.onclick=()=>{$('platform').value=candidate.platform;$('product-name').value=candidate.name;$('product-url').value=candidate.url;$('affiliate-url').value='';$('confirmed').checked=false;productDirty=true;$('copy-body').disabled=true;$('copy-comment').disabled=true;$('publish-api').disabled=true;message('상품 후보를 채웠습니다. 제품을 확인한 뒤 상품을 저장하세요.');};
  box.append(choose);$('candidates').append(box);
 }
}
$('search-products').onclick=()=>act('상품 후보 검색 중…',()=>update('search',{query:$('search-query').value,platform:$('platform').value,key:$('serp-key').value.trim()}));
$('issue-affiliate').onclick=()=>act('쿠팡 제휴 링크 발급 중…',()=>{if(productDirty)throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('affiliate',{access_key:$('coupang-access').value.trim(),secret_key:$('coupang-secret').value.trim()});});
$('connect-threads').onclick=()=>act('Threads 게시 계정 확인 중…',async()=>{account=await api('threads/connect',{token:$('threads-token').value.trim()});$('threads-account').textContent=`게시 계정: @${account.username} (${account.id})`;$('publish-api').disabled=job?.status!=='publish_ready'||productDirty||$('copy-body').disabled||job?.publication?.status==='publish_uncertain';},'계정을 확인했습니다.');
$('threads-token').addEventListener('input',()=>{account=null;$('publish-api').disabled=true;$('threads-account').textContent='토큰을 변경했습니다. 게시 계정을 다시 확인해 주세요.';});
$('recover-publication').onclick=()=>act('기존 게시 결과 확인 중…',()=>update('recover',{token:$('threads-token').value.trim(),media_id:$('recover-id').value.trim()}));
$('publish-api').onclick=()=>act('Threads에 영상과 광고 댓글을 게시하는 중…',async()=>{
 if(productDirty)throw new Error('변경한 상품을 먼저 저장해 주세요.');
 const data={token:$('threads-token').value.trim(),account_id:account?.id,video_url:$('public-video').value,confirmed:$('publish-confirm').checked,same_video:$('same-video').checked};
 const id=job.id;
 try{for(let i=0;i<24;i++){job=await api(`jobs/${id}/publish`,data);render();await refreshJobs();if(!['media_processing','comment_processing'].includes(job.publication.status))return;message($('publication').textContent);await new Promise(resolve=>setTimeout(resolve,5000));}}
 catch(error){job=await api(`jobs/${id}`);render();await refreshJobs();throw error;}
},'게시 결과를 저장했습니다. 처리 중이면 게시 진행 버튼으로 이어가세요.');
function renderVisual(){
 $('visual-search').disabled=!job||!!job.publication?.account_id;
 const previous=$('visual-frame').value;$('visual-frame').replaceChildren();
 for(const f of job?.evidence?.frames||[]){const option=text('option',job.kind==='image'?'원본 이미지':`${f.timestamp}초 프레임`);option.value=f.file;$('visual-frame').append(option);}
 if((job?.evidence?.frames||[]).some(f=>f.file===previous))$('visual-frame').value=previous;
 showVisualOriginal();$('visual-results').replaceChildren();
 for(const candidate of job?.visual_search?.candidates||[]){
  const card=document.createElement('div');card.className='visual-card';card.append(text('h3',candidate.name),text('p',candidate.source+' · 검색 후보 / 동일성 미검증'));
  if(candidate.image){const img=document.createElement('img');img.src=candidate.image;img.alt='비교할 검색 후보 이미지';img.referrerPolicy='no-referrer';card.append(img);}
  const link=text('a','후보 원문 보기 ↗');link.href=candidate.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
  if(candidate.kind==='product'||/(^|\.)coupang\.com$/.test(new URL(candidate.url).hostname)){const choose=text('button','상품 입력으로 선택');choose.disabled=!!job.publication?.account_id;choose.onclick=()=>act('상품 저장·제휴 링크 확인 중…',async()=>{const coupang=/(^|\.)coupang\.com$/.test(new URL(candidate.url).hostname);$('platform').value=coupang?'coupang':$('platform').value;$('product-name').value=candidate.name;$('product-url').value=candidate.url;await update('product',{platform:$('platform').value,name:candidate.name,url:candidate.url,affiliate_url:'',confirmed:false});if(coupang)await update('affiliate-auto',{});},'상품 후보를 저장했습니다. 영상 속 제품과 같은지 확인하고 필요하면 제휴 링크를 직접 입력하세요.');card.append(choose);}
  $('visual-results').append(card);
 }
 if(job?.visual_search&&!job.visual_search.candidates.length)$('visual-results').append(text('p','이 이미지의 검색 후보가 없습니다. 다른 프레임으로 검색해 보세요.'));
}
function showVisualOriginal(){const frame=job?.visual_search?.frame?.file||$('visual-frame').value;$('visual-original').hidden=!job||!frame;if(job&&frame)$('visual-original').src=`/studio/jobs/${job.id}/media/${frame}`;}
$('visual-frame').onchange=showVisualOriginal;
$('visual-search').onclick=()=>act('원본 이미지를 업로드하고 시각 검색하는 중…',()=>update('visual-search',{frame:$('visual-frame').value,mode:$('visual-mode').value,key:$('serp-key').value.trim()}));
let incoming=null;
if(location.hash.startsWith('#reference=')&&location.hash.length<50000){try{incoming=JSON.parse(decodeURIComponent(location.hash.substring(11)));$('incoming-reference').hidden=false;$('incoming-text').textContent=`@${incoming.username||''}: ${String(incoming.text||'').substring(0,500)}`;history.replaceState(null,'',location.pathname);}catch{message('전달된 레퍼런스를 읽지 못했습니다.',true);}}
let selectedReference=null;
const referenceMediaChoices=new Map(),referenceStates=new Map();
async function refreshReferences(){
  const refs=await api('references').catch(()=>[]);
  const list=$('references');if(!list)return;
  list.replaceChildren();
  const summary=$('reference-summary-count');if(summary)summary.textContent=`수집된 레퍼런스 ${refs.length}개`;
  for(const ref of refs){
    const card=document.createElement('div');
    card.className='reference-card'+(selectedReference?.permalink===ref.permalink?' selected':'');
    const thumbBox=document.createElement('div');
    thumbBox.className='ref-thumb-wrap';
    const thumbUrl=ref.previewUrl||ref.thumbnailUrl||ref.poster||ref.imageUrls?.[0]||'';
    const img=document.createElement('img');img.alt='콘텐츠 썸네일';img.className='ref-thumb-img';img.loading='lazy';img.referrerPolicy='no-referrer';
    const fallback=document.createElement('div');fallback.className='ref-thumb-fallback';
    const fallbackText=document.createElement('span');fallbackText.textContent=thumbUrl?'썸네일 로드 실패':'썸네일 없음';
    const retryBtn=document.createElement('button');retryBtn.type='button';retryBtn.className='btn-retry-thumb secondary';retryBtn.textContent='다시 가져오기';
    retryBtn.onclick=e=>{e.stopPropagation();fallback.hidden=true;img.hidden=false;img.src=thumbUrl+(thumbUrl.includes('?')?'&':'?')+'_t='+Date.now();};
    fallback.append(fallbackText);if(thumbUrl)fallback.append(retryBtn);
    if(thumbUrl){img.src=thumbUrl;img.onload=()=>{img.hidden=false;fallback.hidden=true;};img.onerror=()=>{img.hidden=true;fallback.hidden=false;};}
    else{img.hidden=true;fallback.hidden=false;}
    thumbBox.append(img,fallback);

    const badge=document.createElement('span');badge.className='media-badge';
    const vCount=(ref.videoUrls||[]).length, iCount=(ref.imageUrls||[]).length;
    let badgeLabel=ref.mediaKind==='video'?'영상':ref.mediaKind==='image'?'이미지':'미디어';
    if(vCount>0&&iCount>0)badgeLabel=`영상 ${vCount} · 이미지 ${iCount}`;
    else if(vCount>0)badgeLabel=vCount>1?`영상 ${vCount}개`:'영상';
    else if(iCount>0)badgeLabel=iCount>1?`이미지 ${iCount}장`:'이미지';
    badge.textContent=badgeLabel;
    thumbBox.append(badge);
    card.append(thumbBox);

    const info=document.createElement('div');info.className='ref-card-body';
    info.append(text('h3',ref.username?'@'+ref.username:'수집한 콘텐츠'));
    info.append(text('p',ref.text?ref.text.slice(0,250):ref.permalink));
    if(ref.discovery){
      const disc=ref.discovery;
      const discBox=document.createElement('div');
      discBox.className='ref-discovery-meta';
      discBox.style.cssText='font-size:11px;background:#f6f9f5;border:1px solid #dfe5de;border-radius:8px;padding:8px 10px;margin:6px 0;display:flex;flex-direction:column;gap:4px;';
      discBox.append(text('strong',`[발견] ${disc.source_label||''} · 조회수 ${disc.view_count_display||''}`));
      if(disc.shorts_classification)discBox.append(text('span',`형식: ${disc.shorts_classification}`));
      if(disc.recommendation_reason)discBox.append(text('span',`추천: ${disc.recommendation_reason}`));
      if(disc.growth_display)discBox.append(text('span',`관측: ${disc.growth_display}`));
      if(disc.license_label)discBox.append(text('span',`권리: ${disc.license_label}`));
      if(disc.attribution_draft){
        const attrP=text('p',`출처 표기: ${disc.attribution_draft}`);
        attrP.style.cssText='margin:4px 0 0;padding:4px;background:#fffde7;border-radius:4px;font-size:10px;word-break:break-all;';
        discBox.append(attrP);
      }
      info.append(discBox);
    }

    const allMedia=[
      ...(ref.videoUrls||[]).map((u,idx)=>({url:u,kind:'video',label:`영상 #${idx+1}`})),
      ...(ref.imageUrls||[]).map((u,idx)=>({url:u,kind:'image',label:`이미지 #${idx+1}`}))
    ];
    let chosenMedia=allMedia.find(m=>m.url===referenceMediaChoices.get(ref.permalink))||allMedia[0]||null;
    if(allMedia.length>1){
      const selectorWrap=document.createElement('div');selectorWrap.className='media-selector-wrap';
      selectorWrap.append(text('label','사용할 미디어 선택:'));
      const selectEl=document.createElement('select');
      allMedia.forEach((m,idx)=>{const opt=document.createElement('option');opt.value=idx;opt.textContent=m.label;selectEl.append(opt);});
      selectEl.value=String(allMedia.indexOf(chosenMedia));
      selectEl.onchange=e=>{e.stopPropagation();chosenMedia=allMedia[parseInt(selectEl.value,10)]||allMedia[0];referenceMediaChoices.set(ref.permalink,chosenMedia.url);};
      selectEl.onclick=e=>e.stopPropagation();
      selectorWrap.append(selectEl);info.append(selectorWrap);
    }

    const statusText=document.createElement('div');statusText.className='ref-status-text hint';statusText.textContent=referenceStates.get(ref.permalink)||'준비 대기';
    info.append(statusText);

    const chooseBtn=text('button','이 콘텐츠로 원본 준비 →');chooseBtn.type='button';chooseBtn.className='btn-prepare-ref';
    chooseBtn.onclick=async e=>{
      e.stopPropagation();
      selectedReference=ref;
      document.querySelectorAll('.reference-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      $('source').value=ref.permalink;
      if($('fetch-url'))$('fetch-url').value=ref.permalink;
      if(busy){message('진행 중인 작업이 끝난 뒤 다시 시도해 주세요.',true);return;}
      statusText.textContent='원본 획득 중…';referenceStates.set(ref.permalink,statusText.textContent);
      chooseBtn.disabled=true;
      try{
        await act('콘텐츠 원본을 획득하는 중…',async()=>{
          const payload={url:ref.permalink,kind:ref.mediaKind||'auto'};
          if(chosenMedia){payload.media_url=chosenMedia.url;payload.kind=chosenMedia.kind;}
          try{job=await api('acquire',payload);}catch(err){statusText.textContent='획득 실패: '+err.message;referenceStates.set(ref.permalink,statusText.textContent);throw err;}
          statusText.textContent='준비 완료!';referenceStates.set(ref.permalink,statusText.textContent);
          render();await refreshJobs();
          document.querySelector('[data-production-stage="analysis"]')?.click();
        },'원본을 획득하여 분석 준비를 마쳤습니다.');
      }catch(err){
        statusText.textContent='획득 실패: '+err.message;
        message('미디어 획득 실패: '+err.message+' (원본 주소는 유지되었습니다. 직접 파일을 선택할 수도 있습니다.)',true);
      }finally{chooseBtn.disabled=false;}
    };
    info.append(chooseBtn);

    const linksRow=document.createElement('div');linksRow.className='ref-links';
    const postLink=text('a','원본 게시물 ↗');postLink.href=ref.permalink;postLink.target='_blank';postLink.rel='noopener noreferrer';
    postLink.onclick=e=>e.stopPropagation();
    linksRow.append(postLink);
    info.append(linksRow);

    card.onclick=()=>{
      selectedReference=ref;
      document.querySelectorAll('.reference-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      $('source').value=ref.permalink;
      if($('fetch-url'))$('fetch-url').value=ref.permalink;
      message('레퍼런스를 선택했습니다. [이 콘텐츠로 원본 준비]를 누르면 미디어를 가져옵니다.');
    };
    card.append(info);
    list.append(card);
  }
  if(!refs.length)list.append(text('p','수집된 레퍼런스가 없습니다. 웹 브라우저에서 게시물의 [수집] 버튼을 누르면 여기에 나타납니다.'));
}
$('import-reference').onclick=()=>act('레퍼런스 저장 중…',async()=>{await api('references/import',{reference:incoming});$('incoming-reference').hidden=true;await refreshReferences();});
if($('reload-references'))$('reload-references').onclick=()=>refreshReferences().catch(e=>message(e.message,true));
refreshJobs().catch(error=>message(error.message,true));
refreshReferences().catch(error=>message(error.message,true));

let allModels=[
  {id:'builtin_gemini_25_flash',provider:'gemini_api',name:'Gemini 2.5 Flash',model_id:'gemini-2.5-flash',has_audio:true,verified:true,builtin:true},
  {id:'builtin_gemini_25_pro',provider:'gemini_api',name:'Gemini 2.5 Pro',model_id:'gemini-2.5-pro',has_audio:true,verified:true,builtin:true},
  {id:'builtin_gemini_38_flash',provider:'gemini_api',name:'Gemini 3.8 Flash (호출 ID 확인 필요)',model_id:'gemini-3.8-flash',has_audio:true,verified:false,builtin:true},
  {id:'builtin_antigravity_cli_auto',provider:'antigravity_cli',name:'자동 (auto)',model_id:'auto',has_audio:false,verified:false,builtin:true},
  {id:'builtin_openai_gpt41',provider:'openai_api',name:'GPT-4.1',model_id:'gpt-4.1',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt41_mini',provider:'openai_api',name:'GPT-4.1 mini',model_id:'gpt-4.1-mini',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt6_sol',provider:'openai_api',name:'GPT-6 Sol',model_id:'gpt-6-sol',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_chatgpt61_sol',provider:'openai_api',name:'ChatGPT 6.1 Sol (API 권한/ID 확인 필요)',model_id:'gpt-6.1-sol',has_audio:false,verified:false,builtin:true},
  {id:'builtin_codex_chatgpt61_sol',provider:'codex_cli',name:'ChatGPT 6.1 Sol',model_id:'gpt-6.1-sol',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt6_sol',provider:'codex_cli',name:'GPT-6 Sol',model_id:'gpt-6-sol',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt6_astra',provider:'codex_cli',name:'GPT-6 Astra',model_id:'gpt-6-astra',has_audio:false,verified:true,builtin:true}
];

async function loadModels(){
  try{const list=await api('models');if(Array.isArray(list)&&list.length)allModels=list;}catch{}
}

function chooseProvider(){
  const provider=$('ai-provider').value,cli=provider.endsWith('_cli');
  $('api-key-label').hidden=cli;$('cli-check').hidden=!cli;$('cli-login').hidden=!cli;$('cli-login-help').hidden=!cli;$('cli-status').textContent='';
  const providerModels=allModels.filter(m=>m.provider===provider);
  $('model-choice').replaceChildren();
  for(const m of providerModels){
    const opt=text('option',`${m.name} [${m.has_audio?'음성+프레임':'프레임만'}]${m.verified?'':' ⚠️'}`);
    opt.value=m.model_id;opt.dataset.modelEntryId=m.id;$('model-choice').append(opt);
  }
  const custom=text('option','모델 이름 직접 입력');custom.value='custom';$('model-choice').append(custom);
  const savedModel=localStorage.getItem('takoh-ai-model-'+provider);
  const matching=providerModels.find(m=>m.model_id===savedModel);
  if(matching){$('model-choice').value=matching.model_id;$('model').value=matching.model_id;}
  else if(savedModel&&savedModel!=='custom'){$('model-choice').value='custom';$('model').value=savedModel;}
  else if(providerModels.length){$('model-choice').value=providerModels[0].model_id;$('model').value=providerModels[0].model_id;}
  $('cli-login-help').textContent=provider==='codex_cli'?'최초 로그인: 터미널에서 codex login 실행 후 ChatGPT 계정으로 로그인하세요. 인증은 공식 CLI가 보관합니다.':'최초 로그인: 터미널에서 agy 실행 → Google 계정 로그인 → 구독 계정으로 로그인하세요. 인증은 공식 CLI가 보관합니다.';
  try{localStorage.setItem('takoh-ai-provider',provider);}catch{}
}

$('ai-provider').onchange=()=>{$('key').value='';chooseProvider();};
$('model-choice').onchange=()=>{
  if($('model-choice').value!=='custom')$('model').value=$('model-choice').value;
  else $('model').focus();
  try{localStorage.setItem('takoh-ai-model-'+$('ai-provider').value,$('model').value);}catch{}
};
$('model').addEventListener('input',()=>{
  try{localStorage.setItem('takoh-ai-model-'+$('ai-provider').value,$('model').value.trim());}catch{}
});
$('cli-check').onclick=()=>act('CLI 확인 중…',async()=>{const result=await api('ai/status',{provider:$('ai-provider').value});$('cli-status').textContent=result.message;if(result.models){allModels=[...allModels.filter(m=>m.provider!=='antigravity_cli'),...result.models];chooseProvider();$('cli-status').textContent=result.message;}},'CLI 상태를 확인했습니다.');
$('cli-login').onclick=()=>act('공식 CLI 로그인 창을 여는 중…',async()=>{const result=await api('ai/login',{provider:$('ai-provider').value});$('cli-status').textContent=result.message;},'열린 공식 CLI 창에서 로그인하세요.');

if($('btn-save-custom-model'))$('btn-save-custom-model').onclick=()=>act('사용자 모델 등록 중…',async()=>{
  const name=$('custom-model-name').value.trim(),model_id=$('custom-model-id').value.trim(),has_audio=$('custom-model-audio').checked,provider=$('ai-provider').value;
  if(!name||!model_id)throw new Error('모델 표시 이름과 호출 ID를 입력해 주세요.');
  allModels=await api('models',{provider,name,model_id,has_audio});
  chooseProvider();
  $('custom-model-name').value='';$('custom-model-id').value='';$('custom-model-audio').checked=false;
},'사용자 모델을 등록했습니다.');

if($('btn-delete-custom-model'))$('btn-delete-custom-model').onclick=()=>act('사용자 모델 삭제 중…',async()=>{
  const opt=$('model-choice').selectedOptions[0],entryId=opt?.dataset?.modelEntryId;
  const curr=allModels.find(m=>m.id===entryId);
  if(!curr||curr.builtin)throw new Error('사용자가 직접 등록한 모델만 삭제할 수 있습니다.');
  const res=await fetch('/studio/models/'+encodeURIComponent(curr.id),{method:'DELETE',headers:{'X-Studio-Token':token}});
  if(!res.ok)throw new Error('모델 삭제 실패');
  await loadModels();chooseProvider();
},'사용자 모델을 삭제했습니다.');

try{const prev=localStorage.getItem('takoh-ai-provider')==='gemini_cli'?'antigravity_cli':localStorage.getItem('takoh-ai-provider');if(prev&&['gemini_api','antigravity_cli','openai_api','codex_cli'].includes(prev))$('ai-provider').value=prev;}catch{}
loadModels().then(chooseProvider).catch(chooseProvider);

let writingStyles=[];
async function refreshStyles(selected){selected=selected||job?.draft?.style;const values=await api('styles');if(!Array.isArray(values))return;writingStyles=values;$('draft-style').replaceChildren();for(const style of values){const option=text('option',(style.builtin?'':'내 스타일 · ')+style.name);option.value=style.id;$('draft-style').append(option);}if(values.some(x=>x.id===selected))$('draft-style').value=selected;fillStyle();}
function fillStyle(){const style=writingStyles.find(x=>x.id===$('draft-style').value);$('style-name').value=style&&!style.builtin?style.name:'';$('style-instructions').value=style?.instructions||'';const editable=!!style&&!style.builtin;$('style-update').disabled=!editable;$('style-delete').disabled=!editable;}
$('draft-style').addEventListener('change',fillStyle);
function saveStyle(update){return act('스타일 저장 중…',async()=>{const data={name:$('style-name').value,instructions:$('style-instructions').value};if(update)data.id=$('draft-style').value;const styles=await api('styles',data);await refreshStyles(update?data.id:styles[styles.length-1].id);},'사용자 스타일을 저장했습니다.');}
$('style-save').onclick=()=>saveStyle(false);$('style-update').onclick=()=>saveStyle(true);
$('style-delete').onclick=()=>act('스타일 삭제 중…',async()=>{const response=await fetch('/studio/styles/'+encodeURIComponent($('draft-style').value),{method:'DELETE',headers:{'X-Studio-Token':token}});if(!response.ok)throw new Error('스타일 삭제 실패');await refreshStyles();});
refreshStyles().catch(error=>message(error.message,true));

$('refresh-models').onclick=()=>act('계정의 모델 목록을 조회하는 중…',async()=>{
  const provider=$('ai-provider').value,entries=await api('models/refresh',credentials());
  if(!entries.length)throw new Error('사용 가능한 모델 목록이 비어 있습니다.');
  allModels=[...allModels.filter(m=>m.provider!==provider),...entries];chooseProvider();
},'계정 모델 목록을 갱신했습니다. 사용할 모델을 선택해 주세요.');

$('extension-upload').onclick=()=>act('확장 업로드 작업 저장 중…',async()=>{
 const when=$('extension-when').value?new Date($('extension-when').value).getTime():Date.now();
 const packet=await api(`jobs/${job.id}/extension-export`,{when,automatic:$('extension-mode').value==='auto'});
 await new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('확장 프로그램을 새로고침하고 다시 연결하세요.'));},5000);function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);event.data.success?resolve(event.data.data):reject(new Error(event.data.error));}window.addEventListener('message',receive);window.postMessage({source:'takoh-studio-ui',kind:'upload',requestId,packet},location.origin);});
},'확장 프로그램에 작업을 저장했습니다. 지금 업로드하거나 예약 시각에 실행합니다.');

$('save-commerce').onclick=()=>act('검색·제휴 설정 암호화 저장 중…',async()=>{const state=await api('commerce-settings',{serp_key:$('serp-key').value,coupang_access:$('coupang-access').value,coupang_secret:$('coupang-secret').value});$('commerce-status').textContent='등록됨: '+state.configured.join(', ');for(const id of ['serp-key','coupang-access','coupang-secret'])$(id).value='';},'API 설정을 암호화하여 저장했습니다.');

$('platform').addEventListener('change',()=>{if(!job?.disclosure)$('disclosure').value=disclosureDefaults[$('platform').value]||'';});

function uploadBridge(kind,packet){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('확장 프로그램을 새로고침한 뒤 다시 연결하세요.'));},5000);function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);event.data.success?resolve(event.data.data):reject(new Error(event.data.error));}window.addEventListener('message',receive);window.postMessage({source:'takoh-studio-ui',kind,packet,requestId},location.origin);});}
async function refreshUploadQueue(){const queue=await uploadBridge('upload-status');$('upload-queue').replaceChildren();const states={queued:'예약 대기',running:'업로드 중',awaiting_confirmation:'본문 입력 완료 · 직접 게시 확인',posted:'본문·댓글 게시 확인',partial_success:'본문 게시 · 댓글 확인 필요',uncertain:'결과 확인 필요 · 자동 재시도 중지',missed:'예약 시각 경과 · 실행 안 함',cancelled:'예약 취소'};for(const item of queue){const row=document.createElement('div');row.append(text('p',`${item.name} · ${new Date(item.when).toLocaleString()} · ${states[item.state]||item.state}${item.error?' · '+item.error:''}`));if(item.state==='queued'){const cancel=text('button','예약 취소');cancel.onclick=()=>act('예약 취소 중…',async()=>{await uploadBridge('upload-cancel',{id:item.id});await refreshUploadQueue();});row.append(cancel);}if(item.permalink){const link=text('a','게시물 확인');link.href=item.permalink;link.target='_blank';link.rel='noopener';row.append(link);}$('upload-queue').append(row);}if(!queue.length)$('upload-queue').append(text('p','확장 업로드 작업이 없습니다.'));}
$('upload-queue-refresh').onclick=()=>act('확장 예약 상태 확인 중…',refreshUploadQueue,'업로드 상태를 확인했습니다.');

async function refreshCommerceSettings(){const state=await api('commerce-settings');if(!Array.isArray(state.configured))return;$('commerce-status').textContent=state.configured.length?'등록됨: '+state.configured.join(', '):'아직 등록한 검색·제휴 API가 없습니다.';for(const [id,key] of [['serp-key','serp_key'],['coupang-access','coupang_access'],['coupang-secret','coupang_secret']])$(id).placeholder=state.configured.includes(key)?'암호화 등록됨 · 변경할 때만 입력':'';}
window.refreshCommerceSettings=refreshCommerceSettings;window.refreshReferences=refreshReferences;
$('ai-provider').addEventListener('change',()=>{$('fallback-model').value=localStorage.getItem('studio-fallback-'+$('ai-provider').value)||'';});
$('fallback-model').value=localStorage.getItem('studio-fallback-'+$('ai-provider').value)||'';
$('fallback-model').addEventListener('change',()=>localStorage.setItem('studio-fallback-'+$('ai-provider').value,$('fallback-model').value.trim()));
