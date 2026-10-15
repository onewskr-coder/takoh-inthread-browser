'use strict';
const $ = id => document.getElementById(id);
let token = document.querySelector('meta[name="studio-token"]').content;
const disclosureDefaults={coupang:'이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',naver:'이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.',toss:'이 글의 토스쇼핑 제휴 링크를 통해 구매가 발생하면 수수료를 제공받습니다.'};
let job = null, busy = false, productDirty = false, account = null;
const names = {media_ready:'영상 준비', analysis_ready:'분석 완료', product_ready:'상품 준비', draft_ready:'초안 준비', publish_ready:'게시 준비',published:'본문·댓글 게시 완료'};
function message(text, error=false) { $('message').textContent=text; $('message').className=error?'error':''; }
async function api(path, data) {
  if(data?.provider==='kie_api'&&(path==='kie/translate'||/^jobs\/[^/]+\//.test(path))){
    const segments=path.split('/');
    const plan=await api('kie/plan',{job_id:path==='kie/translate'?null:segments[1],model:data.model,action:path==='kie/translate'?'translate':segments.slice(2).join('/')});
    if(!confirm(`KIE 유료 요청 확인\n모델: ${plan.model}\n프레임 최대 ${plan.frame_limit}장 + 텍스트 전송 · 음성 전송 없음\n${plan.api_usage_estimate}\n요금표: ${plan.pricing}\n자동 재시도·공급자 전환 없음. 실행할까요?`))throw new Error('KIE 요청을 취소했습니다. 과금 요청은 보내지 않았습니다.');
    data={...data,kie_approved:true,kie_frame_limit:plan.frame_limit};
  }
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
function credentials(role){const selected={provider:$('ai-provider').value,key:$('key').value.trim(),model:$('model').value.trim(),fallback_model:$('fallback-model').value.trim()};return window.studioTaskCredentials?window.studioTaskCredentials(role,selected):selected;}
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
$('recommend-hook').onclick=()=>act('영상 전체에서 후킹 후보를 비교하는 중…',async()=>{job=await api(`jobs/${job.id}/hook-recommend`,credentials('analysis'));editJobId=null;render();await refreshJobs();},'추천 1순위를 선택했습니다. 원본 구간을 확인하고 인트로 효과를 고르세요.');
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
function buildDefaultComment(){
  const disc=$('disclosure')?.value?.trim()||'';
  const aff=$('affiliate-url')?.value?.trim()||job?.product?.affiliate_url||'';
  const prodName=$('product-name')?.value?.trim()||job?.product?.name||'';
  const parts=[];
  if(disc)parts.push(disc);
  if(aff)parts.push(`${prodName?prodName+': ':''}${aff}`);
  return parts.join('\n\n').trim();
}

function updateProductionStepBadges(){
  const checks={
    reference:Boolean(displayedReferences?.length||job),
    analysis:Boolean(job?.analysis||job?.source_text||job),
    writing:Boolean(job?.draft||$('script')?.value?.trim()),
    product:Boolean(job?.product?.affiliate_url||job?.product?.name||job?.comment||$('comment')?.value?.trim()),
    publish:job?.status==='publish_ready'||job?.status==='published'||job?.publication?.status==='published'
  };
  document.querySelectorAll('[data-production-stage]').forEach(btn=>{
    const key=btn.dataset.productionStage;
    btn.classList.toggle('step-done',Boolean(checks[key]));
  });
}
function renderCarouselPreview(){
  const wrap=$('carousel-slides-wrap'),grid=$('carousel-slides-preview'),label=$('carousel-slides-label');
  if(!wrap||!grid)return;
  grid.replaceChildren();
  const slides=job?.carousel?.slides||[];
  if(!job||!slides.length){wrap.hidden=true;return;}
  wrap.hidden=false;
  if(label)label.textContent=`생성된 캐러셀 슬라이드 (${slides.length}장 · ${job.carousel.aspect||'4:5'} 비율) — [게시·예약]에서 인스타 캐러셀/쓰레드로 바로 업로드 가능`;
  const base=`/studio/jobs/${job.id}/media/`;
  const tsCache=Math.floor((job.carousel.updated_at||Date.now())*1000);
  for(const s of slides){
    const fig=document.createElement('figure');
    fig.className='carousel-slide-card';
    const img=document.createElement('img');
    img.src=`${base}${s.file}?t=${tsCache}`;
    img.alt=`슬라이드 ${s.index}`;
    const cap=text('figcaption',`#${s.index} (${Number(s.timestamp||0).toFixed(1)}초)${s.text?' · '+s.text:''}`);
    fig.append(img,cap);
    grid.append(fig);
  }
}
function renderAttachmentsPreview(){
  const box=$('attachments-box'),list=$('attachments-list');
  if(!box||!list)return;
  list.replaceChildren();
  const items=job?.attachments||[];
  if(!job||!items.length){box.hidden=true;return;}
  box.hidden=false;
  const base=`/studio/jobs/${job.id}/media/`;
  for(const [idx,att] of items.entries()){
    const card=document.createElement('div');
    card.className='attachment-item';
    if(att.kind==='image'){
      const img=document.createElement('img');
      img.src=base+att.file;
      img.alt=`첨부 이미지 ${idx+2}`;
      card.append(img);
    }else{
      const badge=text('span',`🎬 추가 영상 #${idx+2}`);
      badge.className='attachment-video-badge';
      card.append(badge);
    }
    list.append(card);
  }
}
let activeEditTab='subtitle';
function selectEditTab(tabName){
  activeEditTab=tabName||'subtitle';
  document.querySelectorAll('[data-edit-tab]').forEach(btn=>{
    const isMatch=btn.dataset.editTab===activeEditTab;
    btn.classList.toggle('active',isMatch);
    btn.setAttribute('aria-selected',String(isMatch));
  });
  document.querySelectorAll('[data-edit-panel]').forEach(panel=>{
    panel.hidden=(panel.dataset.editPanel!==activeEditTab);
  });
}
document.querySelectorAll('[data-edit-tab]').forEach(btn=>{
  btn.addEventListener('click',()=>selectEditTab(btn.dataset.editTab));
});
document.querySelectorAll('[data-goto-stage]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const stage=btn.dataset.gotoStage;if(stage==='publish'){document.querySelector('[data-workspace=publish]')?.click();return;}
    const stageBtn=document.querySelector(`[data-production-stage="${stage}"]`);
    if(stageBtn&&!document.body.classList.contains('quick-sidebar-mode')){
      stageBtn.click();
    }else{
      const sec=document.querySelector(`[data-production-section="${stage}"]`);
      if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });
});

function render(){
  if($('publish-job-summary'))$('publish-job-summary').textContent=job?'현재 작업: '+(job.name||job.id)+' · '+(names[job.status]||job.status):'콘텐츠 제작에서 작업을 선택해 주세요. 작업 없이도 게시 화면을 살펴볼 수 있습니다.';
  if($('production-job-summary'))$('production-job-summary').textContent=job?'현재 작업 · '+(job.name||job.id)+' · '+(names[job.status]||job.status):'먼저 레퍼런스를 고르거나 원본 파일을 불러오세요.';
  productDirty=false;
  renderEditor();
  updateProductionStepBadges();
  $('media').hidden=!job;
  const carouselTabBtn=document.querySelector('[data-edit-tab="carousel"]');
  if(carouselTabBtn){
    carouselTabBtn.disabled=!job||job.kind==='image';
    if(job?.kind==='image'&&activeEditTab==='carousel')activeEditTab='subtitle';
  }
  selectEditTab(activeEditTab);
  if($('analysis-empty-state'))$('analysis-empty-state').hidden=Boolean(job);
  $('analyze').disabled=!job;$('save-product').disabled=!job;
  $('draft').disabled=!job;
  $('prepare').disabled=!job||!(job.draft||$('script').value.trim());
  $('copy-body').disabled=job?.status!=='publish_ready';$('copy-comment').disabled=job?.status!=='publish_ready'||!job?.comment;
  $('video-download').hidden=!job;
  $('analysis').replaceChildren();$('frames').replaceChildren();
  $('extension-upload').disabled=job?.status!=='publish_ready';
  if($('extension-batch-upload'))$('extension-batch-upload').disabled=job?.status!=='publish_ready';
  if($('source-post-text'))$('source-post-text').value=job?.source_text||'';
  if($('ocr-original-text')){
    const ocrCombined=job?.media_ocr?.combined_text||(job?.media_ocr?.texts||[]).join('\n')||'';
    $('ocr-original-text').value=ocrCombined;
  }
  const ocrTrans=job?.media_ocr?.translated_text||job?.media_ocr?.korean_translation||'';
  if($('overlay-korean-text')&&ocrTrans){
    $('overlay-korean-text').value=ocrTrans;
  }
  renderAttachmentsPreview();
  renderCarouselPreview();
  if($('writing-context-text')){
    if(job?.analysis){
      const sum=job.analysis.result?.summary||job.name||'분석 완료';
      const srcNote=job.source_text?` · 원본 글: "${job.source_text.slice(0,60)}${job.source_text.length>60?'…':''}"`:'';
      const prod=job.product?.name?` · 연결 상품: ${job.product.name}`:'';
      $('writing-context-text').textContent=`📌 분석 요약: ${sum}${srcNote}${prod}`;
    }else if(job&&job.source_text){
      $('writing-context-text').textContent=`📌 원본 게시물 본문: "${job.source_text.slice(0,90)}${job.source_text.length>90?'…':''}" · 바로 한국 스타일 3안 작성이 가능합니다.`;
    }else if(job){
      $('writing-context-text').textContent=`현재 미디어: ${job.name} · 원본 글을 입력하거나 [✦ 한국 스타일 초안 3안 작성]을 누르면 화면과 내용을 바탕으로 3안을 작성합니다.`;
    }else{
      $('writing-context-text').textContent='원본 분석이나 원본 게시물 본문이 준비되면 여기에 요약이 표시됩니다.';
    }
  }
  $('draft-variants').replaceChildren();
  const selectedIdx=Number(job?.draft?.selected||0);
  for(const [index,value] of (job?.draft?.variants||[]).entries()){
    const card=document.createElement('div');
    card.className='draft-variant'+(index===selectedIdx?' selected':'');
    const head=document.createElement('div');
    head.className='draft-variant-head';
    head.append(text('h3',`게시글 ${index+1}안`),text('span',`${Array.from(value).length}자`));
    const bodyP=text('p',value);
    const select=text('button',index===selectedIdx?'✓ 현재 선택된 초안':'이 초안으로 편집하기');
    select.type='button';
    select.className=index===selectedIdx?'secondary btn-variant-selected':'secondary';
    select.onclick=()=>{
      $('script').value=value;$('body').value=value;job.draft.selected=index;
      document.querySelectorAll('#draft-variants .draft-variant').forEach((el,i)=>{
        el.classList.toggle('selected',i===index);
        const btn=el.querySelector('button');
        if(btn){btn.textContent=i===index?'✓ 현재 선택된 초안':'이 초안으로 편집하기';btn.className=i===index?'secondary btn-variant-selected':'secondary';}
      });
      writingCounts();$('extension-upload').disabled=true;if($('extension-batch-upload'))$('extension-batch-upload').disabled=true;
      message(`${index+1}안을 편집창에 불러왔습니다. 내용을 다듬은 뒤 [게시·예약]에서 확정하세요.`);
    };
    card.append(head,bodyP,select);
    $('draft-variants').append(card);
  }
  $('script').value=job?.draft?.script||'';$('body').value=job?.draft?.body||'';
  const product=job?.product;
  $('platform').value=product?.platform||'coupang';$('product-name').value=product?.name||'';
  $('product-url').value=product?.url||'';$('affiliate-url').value=product?.affiliate_url||'';
  $('confirmed').checked=['user_confirmed','api_issued'].includes(product?.attribution);if($('affiliate-entry-mode'))$('affiliate-entry-mode').value=product?.link_entry_mode||(product?.affiliate_method==='coupang_api'||product?.url&&!product?.affiliate_url?'api':'manual');
  $('disclosure').value=job?.disclosure||(product?.affiliate_url?(disclosureDefaults[product?.platform]||''):'');
  $('comment').value=job?.comment||buildDefaultComment();
  writingCounts();
  $('draft-style').value=job?.draft?.style||$('draft-style').value||'two_line';
  fillStyle();
  const qNotes=(job?.draft?.quality_notes||[]).join(' · ');
  $('draft-quality').textContent=qNotes;
  $('draft-quality').hidden=!qNotes;
  $('publication').textContent=job?.status==='publish_ready'?'게시 준비 완료 · 원하는 플랫폼으로 바로 업로드하세요.':'아직 게시하지 않았습니다.';
  renderIntegrations();
  renderVisual();
  if(!job){
    $('preview').pause();
    $('preview').removeAttribute('src');
    $('preview').removeAttribute('poster');
    $('preview').load();
    if($('source-link'))$('source-link').hidden=true;
    return;
  }
  $('source').value=job.source||'';
  if($('fetch-url')&&job.source)$('fetch-url').value=job.source;
  if($('source-link')){
    if(job.source&&/^https?:\/\//i.test(job.source)){
      $('source-link').href=job.source;
      $('source-link').hidden=false;
    }else{
      $('source-link').hidden=true;
    }
  }
  const base=`/studio/jobs/${job.id}/media/`;
  const isImage=job.kind==='image';
  $('preview').hidden=isImage;$('image-preview').hidden=!isImage;
  if(isImage){
    $('preview').pause();
    $('preview').removeAttribute('src');
    $('preview').removeAttribute('poster');
    $('image-preview').src=base+'frame-0.jpg?t='+encodeURIComponent(job.sha256||'1');
  }else{
    const firstFrame=job.evidence?.frames?.[0]?.file||'frame-0.jpg';
    $('preview').poster=base+firstFrame;
    const nextSrc=base+'video';
    if($('preview').getAttribute('src')!==nextSrc){
      $('preview').src=nextSrc;
      $('preview').load();
    }
  }
  $('video-download').href=base+(isImage?'original':'video');$('video-download').download=job.name;
  const kindBadge=isImage?'이미지':'영상';
  const durText=isImage?'단일 이미지':`${Number(job.media?.duration||0).toFixed(1)}초`;
  const resText=`${job.media?.width||0}×${job.media?.height||0}`;
  const audioText=isImage?'':` · ${job.media?.has_audio?'음성 트랙 있음':'음성 없음'}`;
  const attCount=(job.attachments||[]).length;
  const carCount=(job.carousel?.slides||[]).length;
  const extraInfo=(attCount?` · 추가 첨부 ${attCount}개`:'')+(carCount?` · 캐러셀 ${carCount}장 준비됨`:'');
  $('metadata').textContent=`[${kindBadge}] ${job.name} · ${durText} · ${resText}${audioText}${extraInfo}`;
  if(job.edit?.text_clean)$('metadata').textContent+=` · 텍스트 처리 ${job.edit.text_clean.repaired_frames}/${job.edit.text_clean.frames}프레임`;
  for(const frame of (job.evidence?.frames||[])){
    const figure=document.createElement('figure');
    figure.className='analysis-frame-item';
    figure.title=isImage?'원본 이미지':`${frame.timestamp}초 시점으로 이동`;
    const img=document.createElement('img');
    img.src=base+frame.file+'?t='+encodeURIComponent(job.sha256||'1');
    img.alt=`${frame.timestamp}초 추출 프레임`;
    figure.append(img,text('figcaption',isImage?'원본':`${frame.timestamp}초 ▶`));
    if(!isImage){
      figure.onclick=()=>{
        $('preview').currentTime=Number(frame.timestamp||0);
        $('preview').play().catch(()=>{});
      };
    }
    $('frames').append(figure);
  }
  if(job.analysis){
    const data=job.analysis.result||{};
    const summaryBox=document.createElement('div');
    summaryBox.className='analysis-summary-card';
    const scopeBadge=text('span',job.analysis.scope?.description||job.evidence?.description||'AI 분석 완료');
    scopeBadge.className='analysis-scope-meta';
    const summaryTitle=text('h3',data.summary||'핵심 장면 요약');
    summaryBox.append(scopeBadge,summaryTitle);
    $('analysis').append(summaryBox);

    if(Array.isArray(data.observations)&&data.observations.length){
      const obsSection=document.createElement('div');
      obsSection.className='analysis-block';
      obsSection.append(text('h4','시간대별 주요 관찰 장면'));
      const list=document.createElement('div');
      list.className='analysis-timeline-list';
      for(const item of data.observations){
        const row=document.createElement('div');
        row.className='analysis-timeline-row';
        const timeBtn=text('button',`${item.timestamp}초 ▶`);
        timeBtn.type='button';
        timeBtn.className='analysis-time-chip';
        timeBtn.title='클릭하면 이 장면으로 영상 이동';
        timeBtn.onclick=()=>{
          if(!isImage){
            $('preview').currentTime=Number(item.timestamp||0);
            $('preview').play().catch(()=>{});
          }
        };
        const descSpan=text('span',item.description||'');
        descSpan.className='analysis-timeline-desc';
        row.append(timeBtn,descSpan);
        list.append(row);
      }
      obsSection.append(list);
      $('analysis').append(obsSection);
    }

    const metaGrid=document.createElement('div');
    metaGrid.className='analysis-detail-grid';
    const audioBox=document.createElement('div');
    audioBox.className='analysis-detail-item';
    audioBox.append(text('h4','음성·내레이션 요약'),text('p',data.audio_summary||'음성 정보 없음'));
    const uncertainBox=document.createElement('div');
    uncertainBox.className='analysis-detail-item';
    const uncList=Array.isArray(data.uncertainties)&&data.uncertainties.length?data.uncertainties.join(' · '):'특이사항 없음';
    uncertainBox.append(text('h4','확인 필요 사항'),text('p',uncList));
    metaGrid.append(audioBox,uncertainBox);
    $('analysis').append(metaGrid);

    if(Array.isArray(data.search_terms)&&data.search_terms.length){
      const termBox=document.createElement('div');
      termBox.className='analysis-block';
      termBox.append(text('h4','추출된 상품 검색 키워드 (클릭 시 3 상품 검색에 입력)'));
      const chips=document.createElement('div');
      chips.className='analysis-term-chips';
      for(const term of data.search_terms){
        const chip=text('button',`🔍 ${term}`);
        chip.type='button';
        chip.className='analysis-term-chip';
        chip.onclick=()=>{
          if($('search-query'))$('search-query').value=term;
          document.querySelector('[data-production-stage="product"]')?.click();
          message(`상품 검색어 "${term}"을(를) 입력했습니다. [후보 검색]을 눌러 확인하세요.`);
        };
        chips.append(chip);
      }
      termBox.append(chips);
      $('analysis').append(termBox);
    }
  }else{
    const placeholder=document.createElement('div');
    placeholder.className='analysis-placeholder';
    placeholder.append(
      text('strong','아직 AI 장면 분석을 실행하지 않았습니다'),
      text('p','[✦ AI 장면 분석 시작]을 누르면 영상 프레임·음성을 분석해 대본 작성 근거와 릴스 후킹 추천 구간을 찾아줍니다.')
    );
    $('analysis').append(placeholder);
  }
}
async function update(path,data){const targetId=job?.id;if(!targetId)return;const next=await api(`jobs/${targetId}/${path}`,data);if(job?.id!==targetId)return;job=next;render();await refreshJobs();}
if($('url-fetch-form'))$('url-fetch-form').onsubmit=event=>{event.preventDefault();act('게시물에서 미디어와 본문을 가져오는 중…',async()=>{const url=$('fetch-url').value.trim();job=await api('acquire',{url});render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();},'영상·이미지와 게시물 정보를 불러왔습니다.');};
$('upload-form').onsubmit=event=>{event.preventDefault();const file=$('video-file').files[0];if(!file){message('영상 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('영상과 음성·프레임을 추출하는 중…',async()=>{const data=new FormData();data.append('video',file);data.append('source',$('source').value);job=await api('jobs',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
$('image-form').onsubmit=event=>{event.preventDefault();const file=$('image-file').files[0];if(!file){message('이미지 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('원본 이미지 불러오는 중…',async()=>{const data=new FormData();data.append('image',file);data.append('source',$('source').value);job=await api('images',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
if($('btn-save-source-text'))$('btn-save-source-text').onclick=()=>act('원본 게시물 본문 저장 중…',()=>update('repost-meta',{source_text:$('source-post-text').value}),'원본 게시물 글을 저장했습니다. 이제 [2 대본·게시문]에서 한국 스타일로 번역·재작성할 수 있습니다.');
if($('btn-ocr-media-text'))$('btn-ocr-media-text').onclick=()=>act('화면 속 글자(OCR)를 인식하고 자연스러운 한국어로 번역하는 중…',async()=>{
  const tone=$('ocr-translate-tone')?.value||'natural';
  await update('media-text-ocr',{...credentials('analysis'),tone});
  const trans=job?.media_ocr?.translated_text||job?.media_ocr?.korean_translation||'';
  if(trans)$('overlay-korean-text').value=trans;
},'화면 속 글자 인식 및 한국어 번역이 완료되었습니다!');
if($('btn-ocr-retranslate'))$('btn-ocr-retranslate').onclick=()=>act('인식된 기존 글자를 AI로 자연스럽게 한국어 번역하는 중…',async()=>{
  if(!job)throw new Error('먼저 원본 미디어를 불러와 주세요.');
  const rawText=($('ocr-original-text')?.value||'').trim();
  const tone=$('ocr-translate-tone')?.value||'natural';
  if(!rawText){
    await update('media-text-ocr',{...credentials('analysis'),tone});
  }else{
    await update('ocr-translate',{...credentials('analysis'),text:rawText,tone});
  }
  const trans=job?.media_ocr?.translated_text||job?.media_ocr?.korean_translation||'';
  if(trans)$('overlay-korean-text').value=trans;
},'선택한 말투로 자연스러운 한국어 자막 번역을 완료했습니다!');
if($('btn-apply-media-text-edit'))$('btn-apply-media-text-edit').onclick=()=>act('기존 자막을 덮어쓰고 한글 자막을 입히는 중…',async()=>{
  const sourceId=job.id;
  const eraseMode=$('text-erase-mode').value;
  const styleVal=$('overlay-style').value;
  const sizeVal=$('overlay-size').value;
  const numericSize=sizeVal==='small'?3.5:(sizeVal==='large'?6.0:4.5);
  const overlayColor=styleVal==='highlight'?'black':'white';
  const overlayBg=styleVal!=='outline';
  const rectangle={};for(const key of ['x','y','w','h'])rectangle[key]=Number($('subtitle-'+key)?.value||0);
  const timer=(job.kind!=='image'&&(eraseMode.startsWith('auto_')||eraseMode==='cover_box'))?setInterval(async()=>{try{const progress=await api(`jobs/${sourceId}/text-clean-progress`);if(progress.stage==='detecting')message(`자막 처리 중… ${progress.total>0?Math.min(100,Math.floor(progress.frame/progress.total*100)):0}% (${progress.frame} / ${progress.total} 프레임)`);else if(progress.stage==='encoding')message('한글 자막 합성 및 인코딩 중…');}catch{}},2000):null;
  try{
    job=await api(`jobs/${sourceId}/media-text-edit`,{
      erase_mode:eraseMode,
      overlay_text:$('overlay-korean-text').value,
      overlay_position:$('overlay-position').value,
      overlay_size:numericSize,
      overlay_color:overlayColor,
      overlay_bg:overlayBg,
      rectangle
    });
    render();await refreshJobs();
  }finally{if(timer)clearInterval(timer);}
},'자막·글자 편집본을 새 작업으로 생성했습니다! 좌측 미리보기에서 결과를 확인하세요.');
if($('btn-generate-carousel'))$('btn-generate-carousel').onclick=()=>act('영상에서 핵심 장면을 추출해 캐러셀 이미지를 생성하는 중…',async()=>{
  const customLines=($('carousel-custom-texts')?.value||'').split(/\r?\n/).map(s=>s.trim());
  const hasCustom=customLines.some(Boolean);
  await update('carousel-generate',{
    count:Number($('carousel-count').value||5),
    aspect:$('carousel-ratio').value||'4:5',
    erase_mode:$('carousel-erase-mode').value||'cover_box',
    overlay_position:$('carousel-text-pos').value||'bottom',
    overlay_size:4.5,
    overlay_color:'white',
    overlay_bg:true,
    auto_caption:$('carousel-auto-caption').checked,
    slide_texts:hasCustom?customLines:[]
  });
  if($('upload-platform'))$('upload-platform').value='instagram_carousel';
  if($('upload-format'))$('upload-format').value='carousel';
},'캐러셀 이미지 세트를 생성했습니다! 아래 슬라이드 미리보기를 확인하고 인스타 캐러셀·쓰레드로 바로 업로드하세요.');
$('analyze').onclick=()=>act('선택한 영상 데이터를 분석하는 중…',()=>update('analyze',credentials('analysis')));
$('product-form').onsubmit=event=>{event.preventDefault();const mode=$('affiliate-entry-mode')?.value||'manual';act('상품 저장 중…',()=>{if(mode==='manual'&&!$('affiliate-url').value.trim())throw Error('직접 발급한 제휴 링크를 입력하세요.');return update('product',{platform:$('platform').value,name:$('product-name').value,url:mode==='api'?$('product-url').value:'',link_entry_mode:mode,affiliate_url:$('affiliate-url').value,confirmed:$('confirmed').checked});},'상품과 제휴 링크를 저장했습니다.');};
$('draft').onclick=()=>act('내 스타일로 한국어 게시글 3안을 작성하는 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('draft',{...credentials('writing'),style:$('draft-style').value,include_ad_tag:Boolean($('include-ad-tag')?.checked),source_text:$('source-post-text')?.value||job?.source_text||''});});
$('prepare').onclick=()=>act('본문과 첫 댓글 확정 저장 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('prepare',{body:$('script').value,script:$('script').value,disclosure:$('disclosure').value,comment:$('comment').value,selected:job?.draft?.selected||0});},'본문과 첫 댓글을 확정 저장했습니다. 이제 원하는 플랫폼(쓰레드·인스타·네이버 클립·틱톡)으로 바로 업로드할 수 있습니다.');
for(const target of ['body','comment']) $('copy-'+target).onclick=()=>act('복사 중…',async()=>{await navigator.clipboard.writeText($(target).value);}, '복사했습니다. 원하는 채널에 붙여 넣어 주세요.');
$('new-job').onclick=()=>{job=null;editJobId=null;render();$('upload-form').reset();if($('fetch-url')){$('fetch-url').value='';$('fetch-url').focus();}refreshJobs().catch(e=>message(e.message,true));};
if($('btn-goto-reference'))$('btn-goto-reference').onclick=()=>document.querySelector('[data-production-stage="reference"]')?.click();
if($('btn-toggle-style-drawer')&&$('writing-style-drawer')){
  $('btn-toggle-style-drawer').onclick=()=>{
    const open=$('writing-style-drawer').hidden;
    $('writing-style-drawer').hidden=!open;
    $('btn-toggle-style-drawer').setAttribute('aria-expanded',String(open));
    $('btn-toggle-style-drawer').textContent=`✎ 내 스타일 추가·수정 ${open?'▴':'▾'}`;
  };
}
document.querySelectorAll('[data-disclosure-preset]').forEach(btn=>{
  btn.onclick=()=>{
    const key=btn.dataset.disclosurePreset;
    if(disclosureDefaults[key]){
      $('disclosure').value=disclosureDefaults[key];
      $('comment').value=buildDefaultComment();
      $('copy-body').disabled=true;$('copy-comment').disabled=true;
      $('publish-api').disabled=true;$('extension-upload').disabled=true;if($('extension-batch-upload'))$('extension-batch-upload').disabled=true;
      message(`${btn.textContent} 고지 문구를 첫 댓글에 반영했습니다. [✦ 본문 · 첫 댓글 최종 확정 저장]을 눌러 저장하세요.`);
    }
  };
});
$('disclosure').addEventListener('input',()=>{$('comment').value=buildDefaultComment();});
$('affiliate-url').addEventListener('input',()=>{$('comment').value=buildDefaultComment();});
$('script').addEventListener('input',()=>{$('body').value=$('script').value;if(job)$('prepare').disabled=!$('script').value.trim();});
// Editing prepared text requires saving it again before the copy actions can run.
for(const id of ['script','body','disclosure','comment','platform','product-name','product-url','affiliate-url','confirmed']) $(id).addEventListener('input',()=>{$('copy-body').disabled=true;$('copy-comment').disabled=true;});
for(const id of ['script','body','disclosure','comment','platform','product-name','product-url','affiliate-url','confirmed']) $(id).addEventListener('input',()=>{$('publish-api').disabled=true;$('extension-upload').disabled=true;if($('extension-batch-upload'))$('extension-batch-upload').disabled=true;});
for(const id of ['platform','product-name','product-url','affiliate-url','confirmed']) $(id).addEventListener('input',()=>{productDirty=true;});
function renderIntegrations(){
 const p=job?.publication,locked=!!p?.account_id;
 $('recovery').hidden=p?.status!=='publish_uncertain';
 $('search-products').disabled=!job||locked;
 $('issue-affiliate').disabled=!job||job?.product?.platform!=='coupang'||locked;
 $('publish-api').disabled=job?.status!=='publish_ready'||!account||p?.status==='publish_uncertain';
 for(const id of ['script','body','disclosure','platform','product-name','product-url','affiliate-url','confirmed']) $(id).disabled=locked;
 if(locked)for(const id of ['analyze','save-product','draft','prepare'])$(id).disabled=true;
 $('affiliate-status').textContent=job?.product?.affiliate_method==='coupang_api'?'쿠팡 API 발급 완료 · 정산 귀속은 파트너스 계정에서 별도 확인하세요.':'Amazon·네이버·토스는 공식 화면에서 직접 발급한 링크를 등록하세요.';
 const states={published:'본문과 광고 댓글 게시 및 확인 완료',media_processing:'영상 처리 중',comment_processing:'본문 게시 완료 · 댓글 처리 중',partial_success:'본문 게시 완료 · 댓글/결과 확인을 이어가세요.',publish_uncertain:'발행 결과 불확실 · 중복 방지를 위해 재발행 중지',failed:'게시 실패'};
 if(states[p?.status])$('publication').textContent=states[p.status]+(p.post_id?` · 본문 ID ${p.post_id}`:'')+(p.comment_id?` · 댓글 ID ${p.comment_id}`:'')+(p.error?` · ${p.error}`:'');
 $('publish-api').textContent=locked?'게시 진행 / 실패한 단계 이어가기':'영상과 광고 댓글 자동 게시';
 $('published-link').hidden=true;
 if(p?.permalink){try{const link=new URL(p.permalink);if(link.protocol==='https:'&&['www.threads.com','www.threads.net','threads.com','threads.net'].includes(link.hostname)){$('published-link').href=link.href;$('published-link').hidden=false;}}catch{}}
 $('public-video').value=p?.video_url||'';syncAffiliateEntry();
 const terms=job?.analysis?.result?.search_terms||[];
 if($('product-keyword-bar')&&$('product-keyword-chips')){
  $('product-keyword-chips').replaceChildren();
  $('product-keyword-bar').hidden=!terms.length;
  for(const term of terms){
   const chip=text('button',`🔍 ${term}`);
   chip.type='button';
   chip.className='analysis-term-chip';
   chip.onclick=()=>{
    $('search-query').value=term;
    if(!$('search-products').disabled)$('search-products').click();
   };
   $('product-keyword-chips').append(chip);
  }
 }
 $('search-query').value=job?.search?.query||terms[0]||'';
 $('candidates').replaceChildren();
 for(const candidate of job?.search?.candidates||[]){
  const box=document.createElement('div');box.className='candidate-item';box.append(text('h3',candidate.name),text('p',candidate.snippet));
  const choose=text('button','이 후보 선택');choose.type='button';choose.className='secondary';choose.disabled=locked;
  choose.onclick=()=>{$('platform').value=candidate.platform;$('product-name').value=candidate.name;$('product-url').value=candidate.url;$('affiliate-url').value='';$('confirmed').checked=false;productDirty=true;$('copy-body').disabled=true;$('copy-comment').disabled=true;$('publish-api').disabled=true;message('상품 후보를 채웠습니다. 제품을 확인한 뒤 상품을 저장하세요.');};
  box.append(choose);$('candidates').append(box);
 }
}
$('search-products').onclick=()=>act('상품 후보 검색 중…',()=>update('search',{query:$('search-query').value,platform:$('platform').value,key:$('serp-key').value.trim()}));
function syncAffiliateEntry(){const mode=$('affiliate-entry-mode');if(!mode)return;const isCoupang=$('platform').value==='coupang';mode.querySelector('[value=api]').disabled=!isCoupang;if(!isCoupang&&mode.value==='api')mode.value='manual';const manual=mode.value!=='api',locked=!!job?.publication?.account_id;$('affiliate-origin-field').hidden=manual;$('product-url').required=!manual;$('product-url').disabled=manual||locked;$('affiliate-api-actions').hidden=manual;$('affiliate-url').required=manual;$('confirmed').required=manual;$('save-product').textContent=manual?'제휴 링크 저장':'API 발급용 상품 정보 저장';$('affiliate-mode-help').textContent=manual?'API가 없어도 됩니다. 제휴 서비스에서 직접 발급한 링크를 붙여 넣으세요. 원본 상품 URL은 필요하지 않습니다.':'쿠팡파트너스 API 키가 등록된 경우에만 사용하세요. 원본 상품 URL을 저장한 뒤 발급 버튼을 눌러 주세요.';$('issue-affiliate').disabled=manual||!job||locked||!job.product?.url||productDirty;mode.disabled=locked;}
$('affiliate-entry-mode')?.addEventListener('change',()=>{productDirty=true;syncAffiliateEntry();$('copy-comment').disabled=true;$('publish-api').disabled=true;$('extension-upload').disabled=true;if($('extension-batch-upload'))$('extension-batch-upload').disabled=true;});$('platform').addEventListener('change',syncAffiliateEntry);syncAffiliateEntry();
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
  if(candidate.kind==='product'||/(^|\.)coupang\.com$/.test(new URL(candidate.url).hostname)){const choose=text('button','상품 입력으로 선택');choose.disabled=!!job.publication?.account_id;choose.onclick=()=>{const coupang=/(^|\.)coupang\.com$/.test(new URL(candidate.url).hostname);$('platform').value=coupang?'coupang':$('platform').value;$('product-name').value=candidate.name;$('product-url').value=candidate.url;productDirty=true;syncAffiliateEntry();message('상품 후보를 입력했습니다. 직접 발급한 제휴 링크를 넣거나 API 발급 방식을 선택하세요. 자동 발급은 실행하지 않았습니다.');};card.append(choose);}
  $('visual-results').append(card);
 }
 if(job?.visual_search&&!job.visual_search.candidates.length)$('visual-results').append(text('p','이 이미지의 검색 후보가 없습니다. 다른 프레임으로 검색해 보세요.'));
}
function showVisualOriginal(){const frame=job?.visual_search?.frame?.file||$('visual-frame').value;$('visual-original').hidden=!job||!frame;if(job&&frame)$('visual-original').src=`/studio/jobs/${job.id}/media/${frame}`;}
$('visual-frame').onchange=showVisualOriginal;
$('visual-search').onclick=()=>act('원본 이미지를 업로드하고 시각 검색하는 중…',()=>update('visual-search',{frame:$('visual-frame').value,mode:$('visual-mode').value,key:$('serp-key').value.trim()}));
let incoming=null;
if(location.hash.startsWith('#reference=')&&location.hash.length<50000){try{incoming=JSON.parse(decodeURIComponent(location.hash.substring(11)));$('incoming-reference').hidden=false;$('incoming-text').textContent=`@${incoming.username||''}: ${String(incoming.text||'').substring(0,500)}`;history.replaceState(null,'',location.pathname);}catch{message('전달된 레퍼런스를 읽지 못했습니다.',true);}}
let selectedReference=null, referenceCollection='collected', displayedReferenceCollection='collected', displayedReferences=[], referenceLoadSeq=0, referenceLoading=false;
const referenceMediaChoices=new Map(),referenceStates=new Map(),checkedReferenceIds=new Set();
const getRefKey=ref=>ref?.reference_id||ref?.permalink||'';
function syncReferenceCollectionTabs(){
  for(const [id,value] of [['show-collected-references','collected'],['show-saved-references','saved']])$(id)?.setAttribute('aria-pressed',String(referenceCollection===value));
}
function updateReferenceSelectionUi(){
  const isSynced=!referenceLoading&&displayedReferenceCollection===referenceCollection;
  const activeRefs=isSynced?displayedReferences:[];
  const validKeys=new Set(activeRefs.map(getRefKey).filter(Boolean));
  for(const key of Array.from(checkedReferenceIds))if(!validKeys.has(key))checkedReferenceIds.delete(key);
  const count=checkedReferenceIds.size,total=activeRefs.length;
  const selectAll=$('select-all-references');
  if(selectAll){
    selectAll.disabled=!isSynced||!total;
    selectAll.checked=isSynced&&total>0&&count===total;
    selectAll.indeterminate=isSynced&&count>0&&count<total;
  }
  const saveSelected=$('save-selected-references');
  if(saveSelected){
    saveSelected.hidden=referenceCollection==='saved';
    saveSelected.disabled=!isSynced||referenceCollection==='saved'||count===0;
    saveSelected.textContent=count>0?`선택 보관함에 담기 (${count})`:'선택 보관함에 담기';
  }
  const deleteSelected=$('delete-selected-references');
  if(deleteSelected){
    deleteSelected.disabled=!isSynced||count===0;
    deleteSelected.textContent=count>0?`선택 삭제 (${count})`:'선택 삭제';
  }
  if($('delete-all-references'))$('delete-all-references').disabled=!isSynced||!total;
  const summary=$('reference-summary-count');
  if(summary){
    const label=referenceCollection==='saved'?'보관함':'수집한 레퍼런스';
    summary.textContent=referenceLoading&&displayedReferenceCollection!==referenceCollection?`${label} 불러오는 중…`:`${label} ${total}개`+(count>0?` · ${count}개 선택됨`:'');
  }
}
async function refreshReferences(requestedCollection=referenceCollection){
  const targetCollection=requestedCollection==='saved'?'saved':'collected';
  const reqSeq=++referenceLoadSeq;
  referenceLoading=true;
  syncReferenceCollectionTabs();
  if(displayedReferenceCollection!==targetCollection){
    displayedReferences=[];
    checkedReferenceIds.clear();
    const list=$('references');
    if(list)list.replaceChildren(text('p',`${targetCollection==='saved'?'보관함':'수집한 레퍼런스'} 목록을 불러오는 중…`));
  }
  updateReferenceSelectionUi();
  let refs;
  try{
    refs=await api(targetCollection==='saved'?'saved-references':'references');
  }catch(err){
    if(reqSeq===referenceLoadSeq&&referenceCollection===targetCollection){
      referenceLoading=false;
      updateReferenceSelectionUi();
    }
    throw err;
  }
  if(reqSeq!==referenceLoadSeq||referenceCollection!==targetCollection)return;
  const normalizedRefs=(Array.isArray(refs)?refs:[]).map(ref=>({...ref,collection:targetCollection}));
  referenceLoading=false;
  displayedReferenceCollection=targetCollection;
  displayedReferences=normalizedRefs;
  updateProductionStepBadges();
  syncReferenceCollectionTabs();
  const list=$('references');if(!list)return;
  list.replaceChildren();
  updateReferenceSelectionUi();
  for(const ref of normalizedRefs){
    const cardCollection=targetCollection;
    const cardRefId=ref.reference_id;
    const refKey=getRefKey(ref);
    const isChecked=Boolean(refKey&&checkedReferenceIds.has(refKey));
    const card=document.createElement('div');
    card.className='reference-card'+(selectedReference?.permalink===ref.permalink?' selected':'')+(isChecked?' checked':'');
    card.dataset.collection=cardCollection;
    if(cardRefId)card.dataset.refId=cardRefId;
    const thumbBox=document.createElement('div');
    thumbBox.className='ref-thumb-wrap';
    const checkLabel=document.createElement('label');
    checkLabel.className='ref-check-badge';
    checkLabel.onclick=e=>e.stopPropagation();
    const checkInput=document.createElement('input');
    checkInput.type='checkbox';
    checkInput.className='ref-select-checkbox';
    checkInput.dataset.refId=refKey;
    checkInput.dataset.collection=cardCollection;
    checkInput.checked=isChecked;
    checkInput.setAttribute('aria-label',(ref.username?'@'+ref.username+' ':'')+'레퍼런스 선택');
    checkInput.onchange=e=>{
      e.stopPropagation();
      if(!refKey||referenceCollection!==cardCollection||displayedReferenceCollection!==cardCollection)return;
      if(checkInput.checked){checkedReferenceIds.add(refKey);card.classList.add('checked');}
      else{checkedReferenceIds.delete(refKey);card.classList.remove('checked');}
      updateReferenceSelectionUi();
    };
    checkLabel.append(checkInput,text('span','선택'));
    thumbBox.append(checkLabel);
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
    const isVideoRef=ref.mediaKind==='video'||/(?:youtube\.com|youtu\.be)/i.test(ref.permalink||'');
    const cleanVideoUrls=(ref.videoUrls||[]).filter(u=>u&&u!==ref.permalink&&!/(?:youtube\.com|youtu\.be)/i.test(u));
    const cleanImageUrls=(ref.imageUrls||[]).filter(u=>{
      if(!u)return false;
      if(isVideoRef&&(u===ref.thumbnailUrl||u===ref.poster||/(?:ytimg\.com|ggpht\.com)/i.test(u)))return false;
      return true;
    });
    const vCount=cleanVideoUrls.length, iCount=cleanImageUrls.length;
    let badgeLabel=isVideoRef?'영상':ref.mediaKind==='image'?'이미지':'미디어';
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
      discBox.append(text('strong',`${disc.source_label||'발견'} · 조회수 ${disc.view_count_display||'-'}`));
      const metaParts=[disc.shorts_classification,disc.growth_display,disc.license_label].filter(Boolean);
      if(metaParts.length)discBox.append(text('span',metaParts.join(' · ')));
      if(disc.attribution_draft){
        const attrP=text('span',`출처 표기: ${disc.attribution_draft}`);
        attrP.className='ref-discovery-attr';
        discBox.append(attrP);
      }
      info.append(discBox);
    }

    const allMedia=[
      ...cleanVideoUrls.map((u,idx)=>({url:u,kind:'video',label:`영상 #${idx+1}`})),
      ...cleanImageUrls.map((u,idx)=>({url:u,kind:'image',label:`이미지 #${idx+1}`}))
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
          const payload={
            url:ref.permalink,
            kind:isVideoRef?'video':(ref.mediaKind||'auto'),
            source_text:ref.text||'',
            video_urls:cleanVideoUrls,
            image_urls:cleanImageUrls
          };
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
    const itemActions=document.createElement('div');itemActions.className='ref-card-item-actions';
    const removeBtn=text('button','삭제');removeBtn.type='button';removeBtn.className='secondary btn-card-delete';
    removeBtn.onclick=e=>{
      e.stopPropagation();
      const targetIds=[cardRefId].filter(Boolean);
      if(!targetIds.length||referenceLoading||displayedReferenceCollection!==cardCollection||referenceCollection!==cardCollection)return;
      if(!confirm(`이 레퍼런스를 ${cardCollection==='saved'?'보관함':'수집한 레퍼런스'}에서 삭제할까요? 준비한 원본과 작업은 유지됩니다.`))return;
      act('삭제 중…',async()=>{
        await api('references/delete',{collection:cardCollection,ids:targetIds});
        checkedReferenceIds.delete(refKey);
        if(selectedReference?.permalink===ref.permalink)selectedReference=null;
        await refreshReferences(referenceCollection);
      },'목록에서 삭제했습니다.');
    };
    if(cardCollection==='collected'){
      const saveBtn=text('button','보관함 저장');saveBtn.type='button';saveBtn.className='secondary btn-card-save';
      saveBtn.onclick=e=>{
        e.stopPropagation();
        if(!cardRefId||referenceLoading||displayedReferenceCollection!==cardCollection)return;
        act('보관함에 저장 중…',async()=>{
          const result=await api('references/save',{reference_id:cardRefId});
          message(result.already_saved?'이미 보관된 자료를 갱신했습니다.':'보관함에 저장했습니다.');
        },'보관함에 저장했습니다.');
      };
      itemActions.append(saveBtn);
    }
    itemActions.append(removeBtn);
    linksRow.append(itemActions);
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
  if(!normalizedRefs.length)list.append(text('p',targetCollection==='saved'?'보관함이 비어 있습니다. 수집한 레퍼런스에서 [보관함에 저장]을 누르세요.':'수집된 레퍼런스가 없습니다. 게시물의 [수집] 버튼을 누르면 여기에 나타납니다.'));
}
for(const [id,collection] of [['show-collected-references','collected'],['show-saved-references','saved']])if($(id))$(id).onclick=()=>{
  referenceCollection=collection;
  checkedReferenceIds.clear();
  refreshReferences(collection).catch(e=>message(e.message,true));
};
if($('select-all-references'))$('select-all-references').onchange=e=>{
  if(referenceLoading||displayedReferenceCollection!==referenceCollection)return;
  checkedReferenceIds.clear();
  if(e.target.checked)for(const ref of displayedReferences){if(ref.collection===referenceCollection){const k=getRefKey(ref);if(k)checkedReferenceIds.add(k);}}
  document.querySelectorAll('#references .reference-card').forEach(card=>{
    const cb=card.querySelector('.ref-select-checkbox');
    if(cb){cb.checked=e.target.checked;card.classList.toggle('checked',Boolean(e.target.checked));}
  });
  updateReferenceSelectionUi();
};
if($('save-selected-references'))$('save-selected-references').onclick=()=>{
  const targetCollection=displayedReferenceCollection;
  if(referenceLoading||targetCollection!=='collected'||referenceCollection!=='collected')return;
  const selectedRefs=displayedReferences.filter(ref=>ref.collection===targetCollection&&checkedReferenceIds.has(getRefKey(ref)));
  const ids=Object.freeze(selectedRefs.map(ref=>ref.reference_id).filter(Boolean));
  if(!ids.length)return;
  act('선택한 레퍼런스를 보관함에 담는 중…',async()=>{
    const result=await api('references/save',{ids});
    for(const ref of selectedRefs)checkedReferenceIds.delete(getRefKey(ref));
    await refreshReferences(referenceCollection);
    const total=result.total||ids.length;
    message(result.already_saved?`선택한 ${total}개 레퍼런스(이미 보관됨)를 최신 상태로 갱신했습니다.`:`선택한 ${total}개 레퍼런스를 보관함에 담았습니다.`);
  });
};
if($('delete-selected-references'))$('delete-selected-references').onclick=()=>{
  const targetCollection=displayedReferenceCollection;
  if(referenceLoading||targetCollection!==referenceCollection)return;
  const selectedRefs=displayedReferences.filter(ref=>ref.collection===targetCollection&&checkedReferenceIds.has(getRefKey(ref)));
  const ids=Object.freeze(selectedRefs.map(ref=>ref.reference_id).filter(Boolean));
  const selectedKeys=selectedRefs.map(getRefKey).filter(Boolean);
  const selectedPermalinks=new Set(selectedRefs.map(r=>r.permalink).filter(Boolean));
  if(!ids.length||!confirm(`선택한 레퍼런스 ${ids.length}개를 ${targetCollection==='saved'?'보관함':'수집한 레퍼런스'}에서 삭제할까요? 준비한 원본과 작업은 유지됩니다.`))return;
  act('선택한 레퍼런스 삭제 중…',async()=>{
    await api('references/delete',{collection:targetCollection,ids});
    if(selectedReference&&selectedPermalinks.has(selectedReference.permalink))selectedReference=null;
    for(const key of selectedKeys)checkedReferenceIds.delete(key);
    await refreshReferences(referenceCollection);
  },`선택한 레퍼런스 ${ids.length}개를 삭제했습니다.`);
};
if($('delete-all-references'))$('delete-all-references').onclick=()=>{
  const targetCollection=displayedReferenceCollection;
  if(referenceLoading||targetCollection!==referenceCollection)return;
  const snapshotRefs=displayedReferences.filter(ref=>ref.collection===targetCollection&&ref.reference_id);
  const ids=Object.freeze(snapshotRefs.map(ref=>ref.reference_id));
  const snapshotKeys=snapshotRefs.map(getRefKey).filter(Boolean);
  const snapshotPermalinks=new Set(snapshotRefs.map(r=>r.permalink).filter(Boolean));
  if(!ids.length||!confirm(`${targetCollection==='saved'?'보관함':'수집한 레퍼런스'} ${ids.length}개를 모두 삭제할까요? 다른 목록과 준비한 원본·작업은 유지됩니다.`))return;
  act('목록 전체 삭제 중…',async()=>{
    await api('references/delete',{collection:targetCollection,ids,all:true,confirm_all:true});
    if(selectedReference&&snapshotPermalinks.has(selectedReference.permalink))selectedReference=null;
    for(const key of snapshotKeys)checkedReferenceIds.delete(key);
    await refreshReferences(referenceCollection);
  },'확인한 목록을 삭제했습니다.');
};
$('import-reference').onclick=()=>act('레퍼런스 저장 중…',async()=>{await api('references/import',{reference:incoming});$('incoming-reference').hidden=true;await refreshReferences(referenceCollection);});
if($('reload-references'))$('reload-references').onclick=()=>refreshReferences(referenceCollection).catch(e=>message(e.message,true));


refreshJobs().catch(error=>message(error.message,true));
refreshReferences().catch(error=>message(error.message,true));

let allModels=[
  {id:'builtin_gemini_25_flash',provider:'gemini_api',name:'Gemini 2.5 Flash (기본·빠름)',model_id:'gemini-2.5-flash',has_audio:true,verified:true,builtin:true},
  {id:'builtin_gemini_25_pro',provider:'gemini_api',name:'Gemini 2.5 Pro (고성능)',model_id:'gemini-2.5-pro',has_audio:true,verified:true,builtin:true},
  {id:'builtin_gemini_25_flash_lite',provider:'gemini_api',name:'Gemini 2.5 Flash-Lite (초경량)',model_id:'gemini-2.5-flash-lite',has_audio:true,verified:true,builtin:true},
  {id:'builtin_gemini_38_flash',provider:'gemini_api',name:'Gemini 3.8 Flash',model_id:'gemini-3.8-flash',has_audio:true,verified:false,builtin:true},
  {id:'builtin_gemini_38_pro',provider:'gemini_api',name:'Gemini 3.8 Pro',model_id:'gemini-3.8-pro',has_audio:true,verified:false,builtin:true},
  {id:'builtin_gemini_20_flash',provider:'gemini_api',name:'Gemini 2.0 Flash',model_id:'gemini-2.0-flash',has_audio:true,verified:true,builtin:true},
  {id:'builtin_antigravity_cli_auto',provider:'antigravity_cli',name:'자동 (auto · 구독 기본)',model_id:'auto',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gemini_38_flash',provider:'antigravity_cli',name:'Gemini 3.8 Flash (구독)',model_id:'gemini-3.8-flash',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gemini_38_flash_low',provider:'antigravity_cli',name:'Gemini 3.8 Flash Low (구독·고속)',model_id:'gemini-3.8-flash-low',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gemini_38_pro',provider:'antigravity_cli',name:'Gemini 3.8 Pro (구독·고성능)',model_id:'gemini-3.8-pro',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gemini_38_pro_high',provider:'antigravity_cli',name:'Gemini 3.8 Pro High (구독·최고성능)',model_id:'gemini-3.8-pro-high',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gemini_25_pro',provider:'antigravity_cli',name:'Gemini 2.5 Pro (구독)',model_id:'gemini-2.5-pro',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gemini_25_flash',provider:'antigravity_cli',name:'Gemini 2.5 Flash (구독)',model_id:'gemini-2.5-flash',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_claude_sonnet_45',provider:'antigravity_cli',name:'Claude Sonnet 4.5 (구독)',model_id:'claude-sonnet-4-5',has_audio:false,verified:true,builtin:true},
  {id:'builtin_antigravity_gpt41',provider:'antigravity_cli',name:'GPT-4.1 (구독)',model_id:'gpt-4.1',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt41',provider:'openai_api',name:'GPT-4.1 (기본)',model_id:'gpt-4.1',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt41_mini',provider:'openai_api',name:'GPT-4.1 mini (빠름)',model_id:'gpt-4.1-mini',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt41_nano',provider:'openai_api',name:'GPT-4.1 nano (초경량)',model_id:'gpt-4.1-nano',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt4o',provider:'openai_api',name:'GPT-4o',model_id:'gpt-4o',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt4o_mini',provider:'openai_api',name:'GPT-4o mini',model_id:'gpt-4o-mini',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_o3',provider:'openai_api',name:'o3 (추론 특화)',model_id:'o3',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_o4_mini',provider:'openai_api',name:'o4-mini (고속 추론)',model_id:'o4-mini',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt5',provider:'openai_api',name:'GPT-5',model_id:'gpt-5',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt5_mini',provider:'openai_api',name:'GPT-5 mini',model_id:'gpt-5-mini',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_gpt6_sol',provider:'openai_api',name:'GPT-6 Sol',model_id:'gpt-6-sol',has_audio:false,verified:true,builtin:true},
  {id:'builtin_openai_chatgpt61_sol',provider:'openai_api',name:'ChatGPT 6.1 Sol',model_id:'gpt-6.1-sol',has_audio:false,verified:false,builtin:true},
  {id:'builtin_codex_chatgpt61_sol',provider:'codex_cli',name:'ChatGPT 6.1 Sol (구독 기본)',model_id:'gpt-6.1-sol',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt6_sol',provider:'codex_cli',name:'GPT-6 Sol (구독)',model_id:'gpt-6-sol',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt6_astra',provider:'codex_cli',name:'GPT-6 Astra (구독)',model_id:'gpt-6-astra',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt6_luna',provider:'codex_cli',name:'GPT-6 Luna (구독·경량 대체)',model_id:'gpt-6-luna',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt5_codex',provider:'codex_cli',name:'GPT-5 Codex (구독)',model_id:'gpt-5-codex',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_o3',provider:'codex_cli',name:'o3 (구독 추론)',model_id:'o3',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_o4_mini',provider:'codex_cli',name:'o4-mini (구독 고속 추론)',model_id:'o4-mini',has_audio:false,verified:true,builtin:true},
  {id:'builtin_codex_gpt41',provider:'codex_cli',name:'GPT-4.1 (구독)',model_id:'gpt-4.1',has_audio:false,verified:true,builtin:true}
];

function populateSearchAndFallbackModels(){
  const provider=$('ai-provider').value;
  const fb=$('fallback-model');
  if(fb&&fb.tagName==='SELECT'){
    const prevFb=localStorage.getItem('studio-fallback-'+provider)||'';
    fb.replaceChildren();
    const autoOpt=text('option','자동 · CLI 한도 초과 시 Flash / Luna');
    autoOpt.value='';
    fb.append(autoOpt);
    const noneOpt=text('option','사용 안 함 · 대체 실행 중단');noneOpt.value='__none__';fb.append(noneOpt);
    const cliModels=provider.endsWith('_cli')?allModels.filter(m=>m.provider===provider):[];
    const seenFb=new Set();
    for(const m of cliModels){
      if(!m.model_id||seenFb.has(m.model_id))continue;
      seenFb.add(m.model_id);
      const opt=text('option',`${m.name} (${m.model_id})`);
      opt.value=m.model_id;
      fb.append(opt);
    }
    if(prevFb&&!seenFb.has(prevFb)){
      const extra=text('option',`${prevFb}`);
      extra.value=prevFb;
      fb.append(extra);
    }
    fb.value=prevFb;
    if(!provider.endsWith('_cli')){fb.replaceChildren(text('option','사용 안 함 · API 자동 대체 없음'));fb.firstChild.value='';fb.value='';}
  }
  const gs=$('gemini-search-model');
  if(gs&&gs.tagName==='SELECT'){
    const cur=gs.value||'gemini-3.8-flash';
    gs.replaceChildren();
    const seen=new Set();
    for(const m of allModels.filter(x=>x.provider==='gemini_api')){
      if(!m.model_id||seen.has(m.model_id))continue;
      seen.add(m.model_id);
      const opt=text('option',`${m.name} (${m.model_id})`);
      opt.value=m.model_id;
      gs.append(opt);
    }
    if(cur&&!seen.has(cur)){const o=text('option',cur);o.value=cur;gs.append(o);}
    gs.value=cur;
  }
  const ags=$('antigravity-search-model');
  if(ags&&ags.tagName==='SELECT'){
    const cur=ags.value||'gemini-3.8-flash-low';
    ags.replaceChildren();
    const seen=new Set();
    for(const m of allModels.filter(x=>x.provider==='antigravity_cli')){
      if(!m.model_id||seen.has(m.model_id))continue;
      seen.add(m.model_id);
      const opt=text('option',`${m.name} (${m.model_id})`);
      opt.value=m.model_id;
      ags.append(opt);
    }
    if(cur&&!seen.has(cur)){const o=text('option',cur);o.value=cur;ags.append(o);}
    ags.value=cur;
  }
}
window.populateSearchAndFallbackModels=populateSearchAndFallbackModels;

async function loadModels(){
  try{const list=await api('models');if(Array.isArray(list)&&list.length)allModels=list;}catch{}
  populateSearchAndFallbackModels();
}

function chooseProvider(){
  const provider=$('ai-provider').value,cli=provider.endsWith('_cli');
  $('api-key-label').hidden=cli||provider==='kie_api';if($('save-ai-key'))$('save-ai-key').hidden=cli||provider==='kie_api';$('cli-check').hidden=!cli;$('cli-login').hidden=!cli;$('cli-login-help').hidden=!cli;$('cli-status').textContent='';
  if($('kie-inspect-model'))$('kie-inspect-model').disabled=provider!=='kie_api';
  $('fallback-model').disabled=!cli;
  const providerModels=allModels.filter(m=>m.provider===provider);
  $('model-choice').replaceChildren();
  for(const m of providerModels){
    const opt=text('option',`${m.name} (${m.model_id}) [${provider==='kie_api'?'이미지 지원은 스키마 확인':m.has_audio?'음성+프레임':'프레임만'}]`);
    opt.value=m.model_id;opt.dataset.modelEntryId=m.id;$('model-choice').append(opt);
  }
  const custom=text('option',provider==='kie_api'?'먼저 계정 모델 목록을 갱신하세요':'+ 직접 모델 ID 입력...');custom.value='custom';if(provider==='kie_api')custom.disabled=true;$('model-choice').append(custom);
  const savedModel=localStorage.getItem('takoh-ai-model-'+provider);
  const matching=providerModels.find(m=>m.model_id===savedModel);
  if(matching){$('model-choice').value=matching.model_id;$('model').value=matching.model_id;$('model').hidden=true;}
  else if(savedModel&&savedModel!=='custom'){$('model-choice').value='custom';$('model').value=savedModel;$('model').hidden=false;}
  else if(providerModels.length){$('model-choice').value=providerModels[0].model_id;$('model').value=providerModels[0].model_id;$('model').hidden=true;}
  else if(provider==='kie_api'){$('model').value='';$('model').hidden=true;}
  $('cli-login-help').textContent=provider==='codex_cli'?'ChatGPT 구독(Plus/Pro/Team) 계정으로 Codex CLI가 연결됩니다.':'Google / Antigravity 구독 계정으로 CLI가 연결됩니다.';
  populateSearchAndFallbackModels();
  document.dispatchEvent(new Event('ai-settings-updated'));
  try{localStorage.setItem('takoh-ai-provider',provider);}catch{}
}

$('ai-provider').onchange=()=>{$('key').value='';chooseProvider();refreshKieStatus().catch(()=>{});if(window.refreshConnectionsStatus)window.refreshConnectionsStatus();};
$('model-choice').onchange=()=>{
  if($('ai-provider').value==='kie_api')$('kie-model-status').textContent='모델이 바뀌었습니다. 스키마·요금 확인 버튼을 눌러주세요.';
  if($('model-choice').value!=='custom'){
    $('model').value=$('model-choice').value;
    $('model').hidden=true;
  }else{
    $('model').hidden=false;
    $('model').focus();
  }
  try{localStorage.setItem('takoh-ai-model-'+$('ai-provider').value,$('model').value);}catch{}
};
$('model').addEventListener('input',()=>{
  try{localStorage.setItem('takoh-ai-model-'+$('ai-provider').value,$('model').value.trim());}catch{}
});
if($('save-ai-key'))$('save-ai-key').onclick=()=>act('AI API 키 암호화 저장 중…',async()=>{
  const provider=$('ai-provider').value,val=$('key').value.trim();
  if(!val)throw new Error('저장할 API 키를 입력해 주세요.');
  const payload=provider==='kie_api'?{key:val}:provider==='openai_api'?{openai_api_key:val}:{gemini_api_key:val};
  await api(provider==='kie_api'?'kie/settings':'connections-status',payload);
  if(provider==='kie_api')await refreshKieStatus();
  $('key').value='';
  if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();
},'API 키를 암호화(숨김)하여 저장했습니다.');

$('cli-check').onclick=()=>act('CLI 확인 중…',async()=>{const result=await api('ai/status',{provider:$('ai-provider').value});$('cli-status').textContent=result.message;if(result.models){allModels=[...allModels.filter(m=>m.provider!=='antigravity_cli'),...result.models];chooseProvider();$('cli-status').textContent=result.message;}if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();},'CLI 상태를 확인했습니다.');
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

try{const prev=localStorage.getItem('takoh-ai-provider')==='gemini_cli'?'antigravity_cli':localStorage.getItem('takoh-ai-provider');if(prev&&['gemini_api','antigravity_cli','openai_api','codex_cli','kie_api'].includes(prev))$('ai-provider').value=prev;}catch{}
loadModels().then(chooseProvider).catch(chooseProvider);

let writingStyles=[];
function syncQuickModeChips(){const current=$('draft-style')?.value||'two_line';document.querySelectorAll('[data-style-mode]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.styleMode===current);});}
async function refreshStyles(selected){selected=selected||job?.draft?.style||'two_line';const values=await api('styles');if(!Array.isArray(values))return;writingStyles=values;$('draft-style').replaceChildren();for(const style of values){const option=text('option',(style.builtin?'':'내 스타일 · ')+style.name);option.value=style.id;$('draft-style').append(option);}if(values.some(x=>x.id===selected))$('draft-style').value=selected;fillStyle();}
function fillStyle(){const style=writingStyles.find(x=>x.id===$('draft-style').value);$('style-name').value=style&&!style.builtin?style.name:'';$('style-instructions').value=style?.instructions||'';const editable=!!style&&!style.builtin;$('style-update').disabled=!editable;$('style-delete').disabled=!editable;syncQuickModeChips();}
$('draft-style').addEventListener('change',fillStyle);
document.querySelectorAll('[data-style-mode]').forEach(btn=>{btn.addEventListener('click',()=>{const mode=btn.dataset.styleMode;if($('draft-style')&&mode){$('draft-style').value=mode;fillStyle();if(job?.analysis&&!$('draft').disabled){$('draft').click();}}});});
function saveStyle(update){return act('스타일 저장 중…',async()=>{const data={name:$('style-name').value,instructions:$('style-instructions').value};if(update)data.id=$('draft-style').value;const styles=await api('styles',data);await refreshStyles(update?data.id:styles[styles.length-1].id);},'사용자 스타일을 저장했습니다.');}
$('style-save').onclick=()=>saveStyle(false);$('style-update').onclick=()=>saveStyle(true);
$('style-delete').onclick=()=>act('스타일 삭제 중…',async()=>{const response=await fetch('/studio/styles/'+encodeURIComponent($('draft-style').value),{method:'DELETE',headers:{'X-Studio-Token':token}});if(!response.ok)throw new Error('스타일 삭제 실패');await refreshStyles();});
refreshStyles().catch(error=>message(error.message,true));

$('refresh-models').onclick=()=>act('계정의 모델 목록을 조회하는 중…',async()=>{
  const provider=$('ai-provider').value,entries=await api('models/refresh',credentials());
  if(!entries.length)throw new Error('사용 가능한 모델 목록이 비어 있습니다.');
  allModels=[...allModels.filter(m=>m.provider!==provider),...entries];chooseProvider();
},'계정 모델 목록을 갱신했습니다. 사용할 모델을 선택해 주세요.');

async function refreshKieStatus(){
  const data=await api('kie/settings');
  document.dispatchEvent(new CustomEvent('ai-kie-configured',{detail:{configured:data.configured}}));
  if(data.translation)$('kie-translation-result').textContent=data.translation.text;
  $('kie-status').textContent=!data.configured?'KIE 키 미등록':`키 등록됨 · ${data.auth_verified?'모델 목록 조회로 인증 확인':'인증 미확인'} · ${data.generation_verified?'생성 응답 확인':'실제 생성 미검증'}`;
  if($('ai-provider').value==='kie_api')$('key').placeholder=data.configured?'•••••••• (등록됨 · 변경 시 입력)':'KIE API 키 입력';
  const model=$('ai-provider').value==='kie_api'?$('model').value:'';
  const detail=data.details?.[model];
  $('kie-model-status').textContent=detail?`모델: ${model} · ${detail.has_vision?'이미지 입력 스키마 확인':'텍스트만 · 이미지 미확인'} · 요금표: ${detail.pricing} · 확인 ${new Date(detail.checked_at*1000).toLocaleString()}`:'선택 모델 스키마·요금 미확인';
  return data;
}
$('kie-save-key').onclick=()=>act('KIE 키 암호화 저장 중…',async()=>{const key=$('kie-key').value.trim();if(!key)throw Error('KIE API 키를 입력하세요.');await api('kie/settings',{key});$('kie-key').value='';allModels=allModels.filter(m=>m.provider!=='kie_api');if($('ai-provider').value==='kie_api')chooseProvider();await refreshKieStatus();},'KIE 키를 암호화 저장했습니다. 인증·생성은 아직 확인되지 않았습니다.');
$('kie-translate').onclick=()=>act('KIE 한국어 번역 중…',async()=>{if($('ai-provider').value!=='kie_api')throw Error('아래 연결 방식을 KIE로 선택하세요.');const result=await api('kie/translate',{...credentials(),text:$('kie-translate-input').value});$('kie-translation-result').textContent=result.text;},'한국어 번역을 저장했습니다.');
$('kie-refresh-status').onclick=()=>act('KIE 등록 정보 확인 중…',refreshKieStatus,'KIE 로컬 등록 상태를 확인했습니다.');
$('kie-credit').onclick=()=>act('KIE 잔여 크레딧 조회 중…',async()=>{const data=await api('kie/credit',{});$('kie-credit-status').textContent=`잔여 ${data.credits} 크레딧 · ${new Date(data.checked_at*1000).toLocaleString()} 기준`;},'크레딧 조회 완료 · 자동 반복 조회하지 않습니다.');
$('kie-inspect-model').onclick=()=>act('KIE 모델 스키마·요금 조회 중…',async()=>{if($('ai-provider').value!=='kie_api'||!$('model').value)throw Error('KIE 모델 목록을 갱신하고 모델을 선택하세요.');await api('kie/model/inspect',credentials());await refreshKieStatus();},'선택 모델의 스키마·요금을 확인했습니다. 실제 생성은 별도 확인 후 실행합니다.');
$('kie-clear-key').onclick=()=>{if(!confirm('저장된 KIE 키를 삭제할까요? 다른 공급자의 키는 유지됩니다.'))return;act('KIE 키 삭제 중…',async()=>{await api('kie/settings',{clear:true});allModels=allModels.filter(m=>m.provider!=='kie_api');chooseProvider();await refreshKieStatus();},'저장된 KIE 키를 삭제했습니다. 환경변수가 있으면 별도로 유지됩니다.');};
refreshKieStatus().catch(error=>{$('kie-status').textContent=error.message;});

const platformNames={
  threads:'Threads',
  instagram_reels:'인스타 릴스',
  instagram_carousel:'인스타 캐러셀·피드',
  naver_clip:'네이버 클립',
  tiktok:'틱톡 (TikTok)'
};

$('extension-upload').onclick=()=>act('휴먼터치 직접 업로드 작업 저장 중…',async()=>{
 const when=$('extension-when').value?new Date($('extension-when').value).getTime():Date.now();
 const platform=$('upload-platform')?$('upload-platform').value:'threads';
 const publish_format=$('upload-format')?$('upload-format').value:'auto';
 const packet=await api(`jobs/${job.id}/extension-export`,{when,automatic:$('extension-mode').value==='auto',platform,publish_format});
 await uploadBridge('upload',packet);
 await refreshUploadQueue();
},'휴먼터치 업로드 작업을 등록했습니다. 지금 바로 업로드하거나 예약 시각에 실행합니다.');

if($('extension-batch-upload'))$('extension-batch-upload').onclick=()=>act('선택한 멀티 플랫폼 일괄 업로드 등록 중…',async()=>{
 const checked=Array.from(document.querySelectorAll('.batch-platform-cb:checked')).map(cb=>cb.value);
 if(!checked.length)throw new Error('동시 업로드할 채널을 1개 이상 선택해 주세요.');
 const baseWhen=$('extension-when').value?new Date($('extension-when').value).getTime():Date.now();
 const publish_format=$('upload-format')?$('upload-format').value:'auto';
 const automatic=$('extension-mode').value==='auto';
 for(let i=0;i<checked.length;i++){
   const platform=checked[i];
   const when=baseWhen+(i*4000);
   const packet=await api(`jobs/${job.id}/extension-export`,{when,automatic,platform,publish_format});
   await uploadBridge('upload',packet);
 }
 await refreshUploadQueue();
},'선택한 모든 플랫폼을 휴먼터치 업로드 대기열에 등록했습니다.');

$('save-commerce').onclick=()=>act('검색·제휴 설정 암호화 저장 중…',async()=>{const state=await api('commerce-settings',{serp_key:$('serp-key').value,coupang_access:$('coupang-access').value,coupang_secret:$('coupang-secret').value});$('commerce-status').textContent='등록됨: '+state.configured.join(', ');for(const id of ['serp-key','coupang-access','coupang-secret'])$(id).value='';if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();},'API 설정을 암호화하여 저장했습니다.');
if($('clear-coupang-keys'))$('clear-coupang-keys').onclick=()=>act('쿠팡파트너스 API 키 삭제 중…',async()=>{await api('connections-status',{coupang_access:'',coupang_secret:'',clear_coupang_access:true,clear_coupang_secret:true});$('coupang-access').value='';$('coupang-secret').value='';if(window.refreshCommerceSettings)await window.refreshCommerceSettings();else if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();},'쿠팡파트너스 API 키를 삭제했습니다.');

$('platform').addEventListener('change',()=>{if(!job?.disclosure)$('disclosure').value=disclosureDefaults[$('platform').value]||'';});

function uploadBridge(kind,packet){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('브라우저 브리지 또는 확장 프로그램을 새로고침한 뒤 다시 연결하세요.'));},5000);function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);event.data.success?resolve(event.data.data):reject(new Error(event.data.error));}window.addEventListener('message',receive);window.postMessage({source:'takoh-studio-ui',kind,packet,requestId},location.origin);});}
async function refreshUploadQueue(){const queue=await uploadBridge('upload-status');document.dispatchEvent(new CustomEvent('studio-upload-queue',{detail:queue}));$('upload-queue').replaceChildren();const states={queued:'예약 대기',running:'휴먼터치 업로드 중',awaiting_confirmation:'휴먼터치 본문 입력 완료 · 직접 게시 확인',posted:'휴먼터치 본문·댓글 게시 확인',partial_success:'본문 게시 · 댓글 확인 필요',uncertain:'결과 확인 필요 · 자동 재시도 중지',missed:'예약 시각 경과 · 실행 안 함',cancelled:'예약 취소'};for(const item of queue){const row=document.createElement('div');const platLabel=platformNames[item.platform]||item.platform||'Threads';row.append(text('p',`[${platLabel}] ${item.name} · ${new Date(item.when).toLocaleString()} · ${states[item.state]||item.state}${item.error?' · '+item.error:''}`));if(item.state==='queued'){const cancel=text('button','예약 취소');cancel.onclick=()=>act('예약 취소 중…',async()=>{await uploadBridge('upload-cancel',{id:item.id});await refreshUploadQueue();});row.append(cancel);}if(item.permalink){const link=text('a','게시물 확인');link.href=item.permalink;link.target='_blank';link.rel='noopener';row.append(link);}$('upload-queue').append(row);}if(!queue.length)$('upload-queue').append(text('p','등록된 휴먼터치 업로드 작업이 없습니다.'));}
$('upload-queue-refresh').onclick=()=>act('휴먼터치 업로드·예약 상태 확인 중…',refreshUploadQueue,'업로드 상태를 확인했습니다.');

const apiClearPayloads={
  gemini_api:{gemini_api_key:'',clear_gemini_api_key:true},
  openai_api:{openai_api_key:'',clear_openai_api_key:true},
  youtube_api:{youtube_api_key:'',clear_youtube_api_key:true},
  serpapi:{serp_key:'',clear_serp_key:true},
  coupang:{coupang_access:'',coupang_secret:'',clear_coupang_access:true,clear_coupang_secret:true},
  gemini_search:{gemini_search_key:'',clear_gemini_search_key:true}
};

async function refreshConnectionsStatus(){
  const grid=$('connections-status-grid');
  try{
    const status=await api('connections-status');
    document.dispatchEvent(new CustomEvent('ai-connections-updated',{detail:status}));
    const provider=$('ai-provider')?.value;
    if($('key')){
      if(provider==='gemini_api')$('key').placeholder=status.apis?.gemini_api?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'키 입력 후 [API 키 암호화 저장] 클릭';
      else if(provider==='openai_api')$('key').placeholder=status.apis?.openai_api?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'키 입력 후 [API 키 암호화 저장] 클릭';
    }
    if($('serp-key'))$('serp-key').placeholder=status.apis?.serpapi?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'키 입력 후 저장 시 암호화 숨김 보관';
    if($('coupang-access'))$('coupang-access').placeholder=status.apis?.coupang?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'Access Key 입력';
    if($('coupang-secret'))$('coupang-secret').placeholder=status.apis?.coupang?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'Secret Key 입력';
    if($('gemini-search-key'))$('gemini-search-key').placeholder=status.apis?.gemini_search?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'비우면 기본 Gemini API 키 공유';
    if($('youtube-api-key'))$('youtube-api-key').placeholder=status.apis?.youtube_api?.configured?'•••••••• (암호화 등록됨 · 변경 시에만 입력)':'키 입력 (비우고 저장 시 삭제)';
    if(!grid)return;
    grid.replaceChildren();
    const cards=[
      {title:'Antigravity CLI (Google 구독제)',ok:status.clis?.antigravity_cli?.logged_in,masked:status.clis?.antigravity_cli?.masked||'미확인',detail:status.clis?.antigravity_cli?.message||'구독 계정 확인'},
      {title:'Codex CLI (ChatGPT 구독제)',ok:status.clis?.codex_cli?.logged_in,masked:status.clis?.codex_cli?.masked||'미확인',detail:status.clis?.codex_cli?.message||'구독 계정 확인'},
      ...Object.entries(status.apis||{}).map(([apiKey,a])=>({apiKey,title:a.label,ok:a.configured,masked:a.masked,detail:a.source}))
    ];
    for(const c of cards){
      const card=document.createElement('div');
      card.className='conn-status-card '+(c.ok?'conn-ok':'conn-missing');
      const head=document.createElement('div');
      head.className='conn-card-head';
      const titleEl=text('strong',c.title);
      const badgeWrap=document.createElement('div');
      badgeWrap.style.display='flex';badgeWrap.style.alignItems='center';badgeWrap.style.gap='6px';
      const badge=text('span',c.ok?'✓ 등록됨 (숨김)':'미등록');
      badge.className='conn-badge '+(c.ok?'ok':'missing');
      badgeWrap.append(badge);
      if(c.ok&&c.apiKey&&apiClearPayloads[c.apiKey]){
        const delBtn=text('button','삭제');
        delBtn.type='button';
        delBtn.className='secondary btn-subtle-danger';
        delBtn.style.padding='2px 8px';
        delBtn.style.fontSize='11px';
        delBtn.onclick=()=>act(`${c.title} 키 삭제 중…`,async()=>{
          await api('connections-status',apiClearPayloads[c.apiKey]);
          if(window.refreshCommerceSettings)await window.refreshCommerceSettings();
          else await refreshConnectionsStatus();
        },`${c.title} 등록 정보를 삭제했습니다.`);
        badgeWrap.append(delBtn);
      }
      head.append(titleEl,badgeWrap);
      const maskRow=text('div',c.masked);
      maskRow.className='conn-masked-value';
      const subRow=text('div',c.detail);
      subRow.className='conn-detail-note';
      card.append(head,maskRow,subRow);
      grid.append(card);
    }

    if(status.version_info&&grid){
      const vi=status.version_info;
      const vCard=document.createElement('div');
      vCard.className='conn-status-card';
      vCard.style.gridColumn='1 / -1';
      vCard.style.opacity='0.85';
      const vHead=document.createElement('div');
      vHead.className='conn-card-head';
      vHead.append(text('span','시스템 빌드 정보'),text('span',`앱 v${vi.app_version}`));
      const vDesc=text('div',`커밋: ${vi.commit_id}${vi.is_dirty?' (로컬 변경 있음)':''} · 스키마: ${vi.schema_version} · 도우미 포트: ${vi.helper_port}`);
      vDesc.className='conn-detail-note';
      vCard.append(vHead,vDesc);
      grid.append(vCard);
    }
  }catch(e){
    if(grid){grid.replaceChildren(text('p','상태 조회 실패: '+e.message));}
  }
}
window.refreshConnectionsStatus=refreshConnectionsStatus;
if($('refresh-connections-status'))$('refresh-connections-status').onclick=()=>act('연결·등록 상태 확인 중…',refreshConnectionsStatus,'연결·등록 상태를 갱신했습니다.');

async function refreshCommerceSettings(){const state=await api('commerce-settings');if(Array.isArray(state.configured)){$('commerce-status').textContent=state.configured.length?'암호화 등록됨: '+state.configured.join(', '):'아직 등록한 검색·제휴 API가 없습니다.';}await refreshConnectionsStatus();}
window.refreshCommerceSettings=refreshCommerceSettings;window.refreshReferences=refreshReferences;
$('ai-provider').addEventListener('change',()=>{populateSearchAndFallbackModels();});
$('fallback-model').addEventListener('change',()=>localStorage.setItem('studio-fallback-'+$('ai-provider').value,$('fallback-model').value.trim()));
refreshConnectionsStatus().catch(()=>{});

function applySidebarWidth(widthPx,save=true){
  const w=Math.max(360,Math.min(1080,Math.round(Number(widthPx)||580)));
  if(save){
    try{localStorage.setItem('takoh-quick-sidebar-width',String(w));}catch{}
  }
  document.querySelectorAll('.btn-sidebar-width').forEach(btn=>{
    const target=Number(btn.dataset.sidebarWidth||0);
    btn.classList.toggle('active',Math.abs(target-w)<=40);
  });
  uploadBridge('sidebar-resize',{width:w}).catch(()=>{});
}

function setQuickSidebarMode(enabled){
  const on=Boolean(enabled);
  document.body.classList.toggle('quick-sidebar-mode',on);
  if($('quick-sidebar-bar'))$('quick-sidebar-bar').hidden=!on;
  if($('quick-sidebar-resizer'))$('quick-sidebar-resizer').hidden=!on;
  if(on){
    const savedW=Number(localStorage.getItem('takoh-quick-sidebar-width'))||580;
    applySidebarWidth(savedW,false);
    document.querySelector('[data-workspace="create"]')?.click();
    const sections={
      reference:false,
      analysis:true,
      writing:true,
      product:false,
      publish:true
    };
    document.querySelectorAll('#create-workspace [data-production-section]').forEach(sec=>{
      const key=sec.getAttribute('data-production-section');
      const show=Boolean(sections[key]);
      sec.hidden=!show;
      sec.dataset.stageHidden=String(!show);
    });
  }else{
    const activeStage=document.querySelector('[data-production-stage][aria-pressed="true"]')?.getAttribute('data-production-stage')||'analysis';
    document.querySelectorAll('#create-workspace [data-production-section]').forEach(sec=>{
      const show=(sec.getAttribute('data-production-section')===activeStage);
      sec.hidden=!show;
      sec.dataset.stageHidden=String(!show);
    });
  }
}
window.setQuickSidebarMode=setQuickSidebarMode;

document.querySelectorAll('.btn-sidebar-width').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const w=Number(btn.dataset.sidebarWidth||580);
    applySidebarWidth(w,true);
  });
});

(function initSidebarDragResizer(){
  const resizer=$('quick-sidebar-resizer');
  if(!resizer)return;
  let dragging=false,startScreenX=0,startWidth=580,rafId=0,pendingW=580;
  resizer.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    dragging=true;
    startScreenX=e.screenX;
    startWidth=window.innerWidth||Number(localStorage.getItem('takoh-quick-sidebar-width'))||580;
    pendingW=startWidth;
    resizer.classList.add('dragging');
    try{resizer.setPointerCapture(e.pointerId);}catch{}
    e.preventDefault();
  });
  resizer.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const delta=startScreenX-e.screenX;
    pendingW=Math.max(360,Math.min(1080,startWidth+delta));
    if(!rafId){
      rafId=requestAnimationFrame(()=>{
        rafId=0;
        applySidebarWidth(pendingW,false);
      });
    }
  });
  const endDrag=e=>{
    if(!dragging)return;
    dragging=false;
    if(rafId){cancelAnimationFrame(rafId);rafId=0;}
    resizer.classList.remove('dragging');
    try{resizer.releasePointerCapture(e.pointerId);}catch{}
    applySidebarWidth(pendingW,true);
  };
  resizer.addEventListener('pointerup',endDrag);
  resizer.addEventListener('pointercancel',endDrag);
})();

if($('btn-close-quick-sidebar'))$('btn-close-quick-sidebar').onclick=()=>{
  setQuickSidebarMode(false);
  uploadBridge('sidebar-close',{}).catch(()=>{});
};
if($('btn-expand-full-studio'))$('btn-expand-full-studio').onclick=()=>{
  setQuickSidebarMode(false);
  uploadBridge('sidebar-expand',{}).catch(()=>{});
};

window.addEventListener('message',event=>{
  if(event.source!==window)return;
  if(event.data?.type==='native-sidebar-mode'){
    setQuickSidebarMode(Boolean(event.data.enabled));
    return;
  }
  if(event.data?.type!=='native-create-direct')return;
  const ref=event.data.reference;
  if(!ref||!ref.permalink)return;
  const quickSidebar=Boolean(event.data.quickSidebar||ref.quickSidebar);
  document.querySelector('[data-workspace="create"]')?.click();
  document.querySelector('[data-production-stage="analysis"]')?.click();
  setQuickSidebarMode(quickSidebar);
  if($('source'))$('source').value=ref.permalink;
  if($('fetch-url'))$('fetch-url').value=ref.permalink;
  act('선택한 게시물에서 미디어와 본문을 바로 가져오는 중…',async()=>{
    const cleanVideoUrls=(ref.videoUrls||[]).filter(u=>u&&u!==ref.permalink&&!/(?:youtube\.com|youtu\.be)/i.test(u));
    const cleanImageUrls=(ref.imageUrls||[]).filter(u=>u&&!/(?:ytimg\.com|ggpht\.com)/i.test(u));
    const payload={
      url:ref.permalink,
      kind:ref.mediaKind||'auto',
      source_text:ref.text||'',
      video_urls:cleanVideoUrls,
      image_urls:cleanImageUrls
    };
    if(cleanVideoUrls[0]){payload.media_url=cleanVideoUrls[0];payload.kind='video';}
    else if(cleanImageUrls[0]){payload.media_url=cleanImageUrls[0];payload.kind='image';}
    job=await api('acquire',payload);
    render();
    await refreshJobs();
    await refreshReferences().catch(()=>{});
    if(quickSidebar)setQuickSidebarMode(true);
    else document.querySelector('[data-production-stage="analysis"]')?.click();
  },'게시물 미디어와 본문을 불러왔습니다! 우측 사이드바에서 자막·본문·첫 댓글을 편집해 바로 업로드하세요.');
});

/* Reorganize existing controls without replacing handlers or saved settings. */
(()=>{
  const root=document.getElementById('settings-workspace');
  if(!root||root.dataset.organized)return;
  root.dataset.organized='true';
  const byId=id=>document.getElementById(id);
  const sections=[...root.children].filter(n=>n.tagName==='SECTION');
  const ai=byId('ai-provider').closest('section'),kie=byId('kie-settings-section');
  const heading=root.querySelector('.workspace-heading');
  heading.querySelector('h1').textContent='연결 및 설정';
  heading.querySelector('p').textContent='사용할 서비스 하나를 선택하고 키를 등록하세요. 저장된 키와 로그인은 그대로 유지됩니다.';
  const nav=document.createElement('div');nav.className='settings-nav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','설정 분류');
  heading.after(nav);
  const groups={};
  for(const [key,label] of [['ai','AI 연결'],['search','콘텐츠 검색·제휴'],['usage','사용량·등록 현황']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.id='settings-tab-'+key;button.setAttribute('role','tab');button.setAttribute('aria-controls','settings-panel-'+key);
    const panel=document.createElement('div');panel.id='settings-panel-'+key;panel.className='settings-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);root.append(panel);groups[key]={button,panel};nav.append(button);
    button.onclick=()=>{for(const [id,g]of Object.entries(groups)){g.panel.hidden=id!==key;g.button.setAttribute('aria-selected',String(id===key));}};
    button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const list=[...nav.children],i=list.indexOf(button),next=e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next].click();list[next].focus();};
  }
  for(const section of sections){
    const title=section.querySelector('h2')?.textContent||'';
    groups[section===ai||section===kie?'ai':section.id==='youtube-settings-section'?'search':/사용량|등록 현황/.test(title)?'usage':'search'].panel.append(section);
  }
  groups.ai.panel.prepend(ai);
  const step=(host,title)=>{const h=host.querySelector('h2');if(h)h.textContent=title;};
  step(ai,'1. 사용할 AI 선택');step(kie,'2. KIE 키 등록');
  const modelBox=document.createElement('section');modelBox.className='settings-model-step';modelBox.innerHTML='<h2>3. 모델 선택</h2><p class="hint">모델 목록을 불러온 뒤 사용할 모델을 선택하세요. 생성 실행은 제작 화면에서 진행합니다.</p>';
  groups.ai.panel.append(modelBox);
  const modelLabel=byId('model-choice').closest('label');modelBox.append(byId('refresh-models'),modelLabel,byId('kie-inspect-model'),byId('kie-model-status'));
  const keyBox=document.createElement('div');keyBox.className='settings-key-step';keyBox.innerHTML='<h3>2. API 키 등록</h3>';ai.append(keyBox);keyBox.append(byId('api-key-label'),byId('save-ai-key'));
  byId('key').placeholder='API 키를 붙여넣으세요';byId('save-ai-key').textContent='키 저장';byId('kie-key').placeholder='KIE API 키를 붙여넣으세요';byId('kie-save-key').textContent='KIE 키 저장';byId('refresh-models').textContent='모델 목록 불러오기';byId('kie-inspect-model').textContent='선택 모델의 지원 기능·요금 확인';
  const extra=document.createElement('details');extra.className='settings-extra';extra.innerHTML='<summary>크레딧 조회·등록 상태·키 삭제</summary>';kie.append(extra);extra.append(byId('kie-credit'),byId('kie-credit-status'),byId('kie-refresh-status'),byId('kie-clear-key'));
  const translation=document.createElement('details');translation.className='settings-extra';translation.innerHTML='<summary>KIE 문장 번역 도구</summary>';kie.append(translation);translation.append(byId('kie-translate-input').closest('label'),byId('kie-translate'),byId('kie-translation-result'));
  // The model workflow now appears immediately below key registration.
  for(const p of [...kie.querySelectorAll(':scope > p.hint')])if(p.textContent.includes('→'))p.remove();
  const custom=ai.querySelector('.settings-custom-model-drawer');if(custom)modelBox.append(custom);
  const guide=document.createElement('p');guide.className='settings-connection-guide';ai.querySelector('h2').after(guide);
  const update=()=>{const provider=byId('ai-provider').value,isKie=provider==='kie_api',cli=provider.endsWith('_cli');kie.hidden=!isKie;keyBox.hidden=isKie||cli;byId('kie-inspect-model').hidden=!isKie;byId('kie-model-status').hidden=!isKie;guide.textContent=cli?'계정 로그인 방식입니다. API 키 없이 아래 로그인·연결 확인 버튼을 사용하세요.':'API 키를 저장하고 아래에서 모델을 선택하면 연결 준비가 끝납니다.';modelBox.querySelector('h2').textContent=cli?'2. 모델 선택':'3. 모델 선택';if(custom)custom.hidden=isKie;};

  const picker=document.createElement('section');picker.className='settings-provider-picker';picker.innerHTML='<h2>어떤 AI를 사용할까요?</h2><p class="hint">서비스를 선택하면 필요한 연결 항목만 표시됩니다. 키 저장만으로 인증·생성 성공이 확인되지는 않습니다.</p><div class="settings-provider-cards" role="group" aria-label="사용할 AI 서비스"></div>';
  groups.ai.panel.prepend(picker);
  const providerInfo={gemini_api:['Gemini','Google API 키','프레임·음성 분석'],openai_api:['OpenAI','OpenAI API 키','프레임 분석·글 작성'],kie_api:['KIE AI','KIE API 키 · 크레딧','여러 AI 모델을 한곳에서'],antigravity_cli:['Antigravity','Google 계정 로그인','기존 CLI 계정 연결'],codex_cli:['Codex','ChatGPT 계정 로그인','기존 CLI 계정 연결']};
  const cardButtons={};
  for(const [value,info] of Object.entries(providerInfo)){
    const button=document.createElement('button');button.type='button';button.className='settings-provider-card';button.dataset.provider=value;button.setAttribute('aria-pressed','false');button.innerHTML='<span class="settings-provider-top"><strong></strong><span class="settings-provider-selected"></span></span><span class="settings-provider-kind"></span><span class="settings-provider-description"></span>';
    button.querySelector('strong').textContent=info[0];button.querySelector('.settings-provider-kind').textContent=info[1];button.querySelector('.settings-provider-description').textContent=info[2];button.onclick=()=>{byId('ai-provider').value=value;byId('ai-provider').dispatchEvent(new Event('change',{bubbles:true}));};picker.querySelector('.settings-provider-cards').append(button);cardButtons[value]=button;
  }
  byId('ai-provider').closest('label').hidden=true;
  ai.classList.add('settings-connection-card');modelBox.classList.add('settings-configuration-card');
  const connectionBody=document.createElement('div');connectionBody.className='settings-connection-body';ai.append(connectionBody);connectionBody.append(keyBox,kie);
  kie.querySelector('h2').hidden=true;
  const modelActions=document.createElement('div');modelActions.className='settings-button-row';modelBox.append(modelActions);modelActions.append(byId('refresh-models'),byId('kie-inspect-model'));modelLabel.after(modelActions);
  const keyActions=document.createElement('div');keyActions.className='settings-button-row';keyBox.append(keyActions);keyActions.append(byId('save-ai-key'));
  const kieKeyActions=document.createElement('div');kieKeyActions.className='settings-button-row';byId('kie-key').closest('label').after(kieKeyActions);kieKeyActions.append(byId('kie-save-key'));
  const utilityActions=document.createElement('div');utilityActions.className='settings-button-row';extra.append(utilityActions);utilityActions.append(byId('kie-credit'),byId('kie-refresh-status'));
  const danger=document.createElement('div');danger.className='settings-danger-row';danger.append(byId('kie-clear-key'));extra.append(danger);
  const state=document.createElement('p');state.className='settings-selected-status';state.setAttribute('role','status');guide.after(state);
  const syncStatus=()=>{const provider=byId('ai-provider').value;state.textContent=provider==='kie_api'?byId('kie-status').textContent:provider.endsWith('_cli')?(byId('cli-status').textContent||'계정 로그인 상태를 확인하세요.'):(byId('key').placeholder.includes('등록됨')?'키 저장됨 · 실제 연결은 실행 시 확인합니다.':'API 키를 입력하고 저장하세요.');};
  const enhancedUpdate=()=>{update();const provider=byId('ai-provider').value;for(const [value,button] of Object.entries(cardButtons)){button.setAttribute('aria-pressed',String(value===provider));button.querySelector('.settings-provider-selected').textContent=value===provider?'선택됨':'';}ai.querySelector('h2').textContent='1. '+providerInfo[provider][0]+' 연결';keyBox.querySelector('h3').hidden=true;modelBox.querySelector('h2').textContent='2. 사용할 모델';syncStatus();};
  const serviceHelp=document.createElement('details');serviceHelp.className='settings-extra';serviceHelp.innerHTML='<summary>전송 데이터·지원 기능 안내</summary>';ai.append(serviceHelp);
  for(const host of [ai,kie])for(const note of [...host.children].filter(n=>n.tagName==='P'&&n.classList.contains('hint')&&!n.id))serviceHelp.append(note);
  byId('kie-status').hidden=true;
  const statusObserver=new MutationObserver(syncStatus);for(const id of ['kie-status','cli-status'])statusObserver.observe(byId(id),{childList:true,subtree:true,characterData:true});statusObserver.observe(byId('key'),{attributes:true,attributeFilter:['placeholder']});
  // Keep button placement consistent for the remaining service cards, too.
  for(const section of [...groups.search.panel.children,...groups.usage.panel.children]){section.classList.add('settings-service-card');for(const actions of section.querySelectorAll('.actions,.stage-action-bar'))actions.classList.add('settings-button-row');}
  byId('ai-provider').addEventListener('change',enhancedUpdate);enhancedUpdate();groups.ai.button.click();
})();

'use strict';
/* Task assignments contain model IDs only. Keys stay in the existing secret store. */
(()=>{
  const byId=id=>document.getElementById(id), storageKey='takoh-ai-task-routes-v1';
  const names={gemini_api:'Gemini API',openai_api:'OpenAI API',kie_api:'KIE API',codex_cli:'Codex · 구독 CLI',antigravity_cli:'Antigravity · 구독 CLI'};
  const roles={writing:'글 작성',analysis:'분석·번역'};
  let routes={},searchModels={},connections={};try{routes=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
  const valid=r=>r&&Object.hasOwn(names,r.provider)&&typeof r.model==='string'&&r.model.length>0&&typeof r.fallback_model==='string';
  for(const role of Object.keys(roles))if(!valid(routes[role]))delete routes[role];
  const current=()=>({provider:byId('ai-provider').value,model:byId('model').value.trim(),fallback_model:byId('fallback-model').value.trim()});
  const routeFor=role=>routes[role]||current();
  const subLabel=r=>!r.provider.endsWith('_cli')?'사용 안 함 · API 자동 전환 없음':r.fallback_model==='__none__'?'사용 안 함':r.fallback_model|| (r.provider==='codex_cli'?'자동 · gpt-6-luna':'자동 · 설치 모델 중 3.8 Flash');
  const describe=r=>(names[r.provider]||r.provider)+' / '+(r.model||'모델 미선택');
  window.studioTaskCredentials=(role,base)=>{
    if(!Object.hasOwn(roles,role))return base;
    const r=routeFor(role);
    if(!r.model)throw Error(roles[role]+'에 사용할 모델을 먼저 선택하세요.');
    return {...base,...r,key:r.provider===base.provider?base.key:'',fallback_model:r.provider.endsWith('_cli')?(r.fallback_model==='__none__'?r.model:r.fallback_model):''};
  };
  const root=byId('settings-workspace'),nav=root.querySelector('.settings-nav');
  const section=document.createElement('section');section.className='ai-task-settings';section.id='ai-task-settings';
  section.innerHTML='<div class="ai-task-heading"><div><h2>작업별 AI 배정</h2><p>메인은 처음 실행할 모델, 서브는 CLI 한도 초과 때 같은 연결에서 한 번 사용하는 대체 모델입니다.</p></div><span class="ai-task-badge">이 브라우저에 저장</span></div><div id="ai-task-grid" class="ai-task-grid"></div><p id="ai-task-save-status" role="status" class="hint">연결 등록과 작업 배정은 별개입니다. 아래에서 연결·모델을 고른 뒤 원하는 작업에 배정하세요.</p>';
  nav.after(section);
  const cards={};
  for(const [role,title]of Object.entries(roles)){
    const card=document.createElement('article');card.className='ai-task-card';
    const h=document.createElement('h3');h.textContent=title;
    const main=document.createElement('p');main.id='ai-role-'+role+'-main';main.className='ai-task-main';
    const sub=document.createElement('p');sub.id='ai-role-'+role+'-sub';sub.className='hint';
    const mode=document.createElement('p');mode.className='hint';
    const connection=document.createElement('p');connection.className='ai-task-connection';
    const actions=document.createElement('div');actions.className='settings-button-row';
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='연결·모델 편집';edit.id='ai-role-'+role+'-edit';
    edit.onclick=()=>{const r=routeFor(role);byId('settings-tab-ai').click();byId('ai-provider').value=r.provider;byId('ai-provider').dispatchEvent(new Event('change',{bubbles:true}));byId('model').value=r.model;const choice=byId('model-choice');choice.value=[...choice.options].some(o=>o.value===r.model)?r.model:'custom';byId('model').hidden=choice.value!=='custom';const fb=byId('fallback-model');if(![...fb.options].some(o=>o.value===r.fallback_model)){const o=new Option(r.fallback_model,r.fallback_model);fb.add(o);}fb.value=r.fallback_model;window.refreshAITasks();byId('model-choice').scrollIntoView({block:'center',behavior:'smooth'});byId('model-choice').focus();};
    const assign=document.createElement('button');assign.type='button';assign.id='ai-role-'+role+'-assign';assign.textContent='현재 선택을 '+title+'에 배정';
    assign.onclick=()=>{const r=current();if(!r.model){byId('ai-task-save-status').textContent='모델을 먼저 선택하세요. 키나 계정을 등록한 것만으로 모델이 정해지지는 않습니다.';return;}try{const next={...routes,[role]:r};localStorage.setItem(storageKey,JSON.stringify(next));routes=next;byId('ai-task-save-status').textContent=title+' 메인: '+describe(r)+' · 저장했습니다. API 호출은 실행하지 않았습니다.';refresh();}catch{byId('ai-task-save-status').textContent='브라우저 저장에 실패했습니다. 배정은 변경하지 않았습니다.';}};
    actions.append(edit,assign);card.append(h,main,sub,connection,mode,actions);byId('ai-task-grid').append(card);cards[role]={main,sub,connection,mode,assign};
  }
  const search=document.createElement('article');search.className='ai-task-card';search.innerHTML='<h3>콘텐츠 검색</h3><label>검색에 사용할 연결<select id="ai-role-search-provider" aria-label="검색에 사용할 연결"></select></label><p id="ai-role-search-detail" class="hint"></p><p class="hint">글 작성·분석과 별도로 사용합니다. 검색 버튼을 눌러야 새 검색이 실행됩니다. 서브 공급자로 자동 전환하지 않습니다.</p><button id="ai-role-search-edit" type="button" class="secondary">검색 키·모델 설정</button>';
  byId('ai-task-grid').append(search);
  const discovery=byId('discovery-provider'),searchSelect=byId('ai-role-search-provider');
  for(const option of discovery.options)searchSelect.add(new Option(option.textContent,option.value));
  try{const saved=localStorage.getItem('takoh-search-provider');if([...discovery.options].some(o=>o.value===saved))discovery.value=saved;}catch{}
  function searchDetail(){const p=discovery.value;searchSelect.value=p;byId('ai-role-search-detail').textContent=p==='gemini_search'?'Gemini API · Google 웹 검색 / '+(searchModels.model||'설정 불러오는 중'):p==='antigravity_search'?'Antigravity 구독 CLI · 웹 검색 / '+(searchModels.cli_model||'설정 불러오는 중'):p==='serpapi'?'SerpAPI 검색 · 영상 상세·조회수 확인은 YouTube Data API':'YouTube Data API · 영상 검색과 상세·조회수 조회';}
  function saveSearch(){try{localStorage.setItem('takoh-search-provider',discovery.value);}catch{}searchDetail();}
  searchSelect.onchange=()=>{discovery.value=searchSelect.value;discovery.dispatchEvent(new Event('change',{bubbles:true}));saveSearch();};
  discovery.addEventListener('change',saveSearch);
  byId('btn-reset-discovery-filters')?.addEventListener('click',()=>setTimeout(saveSearch,0));
  byId('ai-role-search-edit').onclick=()=>{byId('settings-tab-search').click();const target=['gemini_search','antigravity_search'].includes(discovery.value)?byId('gemini-search-model'):byId('youtube-settings-section');target.scrollIntoView({block:'center',behavior:'smooth'});};
  // Keep the fallback editor next to its primary model, not under unrelated commerce keys.
  const fallbackLabel=byId('fallback-model').closest('label');document.querySelector('.settings-model-step').append(fallbackLabel);
  fallbackLabel.firstChild.textContent='서브 모델 · CLI 한도 초과 시에만 사용';
  const explain=document.createElement('p');explain.className='hint';explain.textContent='API 연결은 서브 모델 자동 실행을 지원하지 않습니다. CLI는 같은 공급자 안에서만 대체합니다. 사용 안 함을 선택하면 대체 실행도 중단합니다.';fallbackLabel.after(explain);
  const applyActions=document.createElement('div');applyActions.className='settings-button-row';
  for(const [role,title]of Object.entries(roles)){const button=document.createElement('button');button.type='button';button.textContent='이 모델을 '+title+'에 사용';button.onclick=()=>cards[role].assign.click();document.querySelector('.settings-model-step').append(applyActions);applyActions.append(button);}
  const selected=document.createElement('p');selected.id='ai-editor-selection';selected.className='ai-editor-selection';document.querySelector('.settings-model-step').prepend(selected);
  root.querySelector('.workspace-heading p').textContent='연결을 등록하고 작업별로 배정하세요. 글 작성·분석·검색에 사용하는 연결을 위에서 바로 확인할 수 있습니다.';
  document.querySelector('.settings-provider-picker h2').textContent='연결 등록·모델 선택';
  document.querySelector('.settings-provider-picker p').textContent='등록할 서비스를 선택하세요. 선택만으로 저장된 작업 배정은 바뀌지 않습니다. 연결·모델을 정한 뒤 위 배정 버튼을 누르세요.';
  function refresh(){
    const c=current();selected.textContent='지금 편집 중: '+describe(c);
    for(const [role,card]of Object.entries(cards)){const r=routeFor(role);card.main.textContent='메인 · '+describe(r);card.sub.textContent='서브 · '+subLabel(r);const state=r.provider.endsWith('_cli')?connections.clis?.[r.provider]:connections.apis?.[r.provider];card.connection.textContent=r.provider.endsWith('_cli')?(state?.logged_in?'구독 계정 로그인 확인됨':state?.installed?'CLI 설치됨 · 로그인 미확인':'CLI 연결 상태 미확인'):(state?.configured?'키 등록됨 · 생성 성공은 실행 시 확인':'키 등록 상태 미확인');card.mode.textContent=routes[role]?'작업별 배정 저장됨 · 연결 편집과 독립':'아직 별도 배정 없음 · 현재 공통 선택을 따릅니다';card.assign.disabled=!c.model;}
    searchDetail();
    for(const [role,ids]of [['writing',['draft']],['analysis',['analyze','recommend-hook']]])for(const id of ids){const button=byId(id);if(!button)continue;let hint=byId(id+'-ai-route');if(!hint){hint=document.createElement('p');hint.id=id+'-ai-route';hint.className='hint ai-execution-route';button.after(hint);}hint.textContent=roles[role]+' 메인: '+describe(routeFor(role))+' · 서브: '+subLabel(routeFor(role));}
  }
  window.refreshAITasks=refresh;
  for(const id of ['ai-provider','model-choice','model','fallback-model','gemini-search-model','antigravity-search-model'])byId(id)?.addEventListener('change',refresh);
  byId('model').addEventListener('input',refresh);
  document.addEventListener('ai-settings-updated',refresh);
  document.addEventListener('ai-connections-updated',event=>{const kie=connections.apis?.kie_api;connections=event.detail||{};if(kie)connections.apis={...connections.apis,kie_api:kie};refresh();});
  document.addEventListener('ai-kie-configured',event=>{connections.apis={...connections.apis,kie_api:event.detail};refresh();});
  document.addEventListener('ai-search-settings-loaded',event=>{searchModels=event.detail||{};refresh();});
  refresh();
})();

/* Local platform preview + ordered publishing + persisted queue calendar. */
(()=>{
  const get=id=>document.getElementById(id), platforms={threads:'Threads',instagram:'Instagram',tiktok:'TikTok',naver_clip:'네이버 클립'};
  const create=get('create-workspace'),publish=get('publish-workspace');
  const instances=[];
  function previewPanel(context){
    const panel=document.createElement('aside');panel.className='content-live-preview';panel.setAttribute('aria-label','플랫폼별 콘텐츠 미리보기');
    panel.innerHTML='<div class="preview-heading"><h2>실시간 미리보기</h2><span>레이아웃 참고용</span></div><div class="preview-platform-tabs" role="group" aria-label="미리보기 플랫폼"></div><p class="preview-note">실제 앱의 줄바꿈·잘림·표시는 다를 수 있습니다.</p><article class="platform-preview"><header><strong class="preview-service"></strong><span class="preview-account">내 계정 · 지금</span><span class="preview-more" aria-hidden="true">•••</span></header><div class="preview-view-top"></div><p class="preview-body"></p><div class="preview-media"></div><div class="preview-media-nav"><button type="button" class="secondary preview-prev" aria-label="이전 미디어">←</button><span class="preview-media-count"></span><button type="button" class="secondary preview-next" aria-label="다음 미디어">→</button></div><footer class="preview-engagement"></footer><div class="preview-audio"><span>♫</span><span class="preview-audio-label">원본 오디오</span><i></i></div><div class="preview-bottom-nav"></div><div class="preview-comment"><strong>첫 댓글</strong><p></p></div></article><p class="preview-source-note hint"></p>';
    const state={panel,context,platform:'threads',index:0,mediaKey:''};
    for(const [key,label]of Object.entries(platforms)){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.previewPlatform=key;b.setAttribute('aria-pressed',String(key==='threads'));b.onclick=()=>{state.platform=key;state.index=0;refreshPreview(state);};panel.querySelector('.preview-platform-tabs').append(b);}
    panel.querySelector('.preview-prev').onclick=()=>{state.index--;refreshPreview(state);};panel.querySelector('.preview-next').onclick=()=>{state.index++;refreshPreview(state);};instances.push(state);return panel;
  }
  const createArticle=create.querySelector(':scope > article'),createLayout=document.createElement('div');createLayout.className='content-studio-layout';create.append(createLayout);createLayout.append(previewPanel('create'),createArticle);createArticle.classList.add('content-studio-controls');
  const publishLayout=document.createElement('div');publishLayout.className='content-studio-layout';const controls=document.createElement('div');controls.className='content-studio-controls';publish.append(publishLayout);publishLayout.append(previewPanel('publish'),controls);for(const section of [...publish.querySelectorAll(':scope > section')])controls.append(section);
  const prepare=publish.querySelector('.publish-prepare-col'),automation=publish.querySelector('.publish-automation-col');
  prepare.querySelector('h3').textContent='1. 본문·첫 댓글 확정';automation.querySelector('h3').textContent='2. 대상·미디어와 실행 시각';
  const originals=[get('extension-upload'),get('extension-batch-upload')];for(const button of originals)button.hidden=true;
  const execution=document.createElement('section');execution.className='publish-final-step';execution.innerHTML='<h3>3. 최종 확인 후 시작</h3><label>실행할 대상<select id="publish-target-mode"><option value="single">선택한 단일 플랫폼</option><option value="batch">체크한 여러 플랫폼</option></select></label><p id="publish-start-summary" role="status"></p><p class="hint">자동 모드는 실제 게시까지 진행합니다. 반자동 모드는 작성창 입력 후 직접 최종 게시해야 합니다. 예약은 앱과 도우미가 실행 중일 때 동작합니다.</p><label class="check"><input id="publish-final-confirm" type="checkbox">미디어·본문·댓글·로그인 계정과 실행 시각을 확인했습니다.</label><button id="publish-start" type="button" disabled>시작</button><button id="publish-open-calendar" type="button" class="secondary">예약 달력 보기</button>';
  const apiDrawer=automation.querySelector('.publish-api-drawer');automation.insertBefore(execution,apiDrawer);get('publish-open-calendar').onclick=()=>get('workspace-scheduler-tab').click();
  function mediaItems(state){
    if(!job)return [];
    const base='/studio/jobs/'+encodeURIComponent(job.id)+'/media/';
    const fmt=get('upload-format').value,selected=get('upload-platform').value;
    const carousel=state.platform==='instagram'?(selected==='instagram_carousel'||fmt==='carousel'):(state.platform==='threads'&&fmt==='carousel');
    if(carousel)return (job.carousel?.slides||[]).map(s=>({kind:'image',url:base+encodeURIComponent(s.file)}));
    const first=job.kind==='image'?{kind:'image',url:base+'original'}:{kind:'video',url:base+'video',poster:base+encodeURIComponent(job.evidence?.frames?.[0]?.file||'frame-0.jpg')};
    return [first,...(state.platform==='threads'||state.platform==='instagram'?(job.attachments||[]).map(a=>({kind:a.kind,url:base+encodeURIComponent(a.file)})):[])];
  }
  function refreshPreview(state){
    const p=state.panel;p.dataset.platform=state.platform;p.querySelector('.preview-service').textContent=platforms[state.platform];
    for(const b of p.querySelectorAll('[data-preview-platform]'))b.setAttribute('aria-pressed',String(b.dataset.previewPlatform===state.platform));
    const shortView=['tiktok','naver_clip'].includes(state.platform)||(state.platform==='instagram'&&get('upload-platform').value!=='instagram_carousel'&&get('upload-format').value!=='carousel');p.dataset.view=shortView?'short':'feed';
    p.querySelector('.preview-account').textContent=state.platform==='threads'?'내 계정 · 지금':state.platform==='instagram'?'내 계정 · 팔로우':'내 계정';
    p.querySelector('.preview-view-top').textContent=state.platform==='threads'?'':state.platform==='instagram'?(shortView?'Reels　　⌕':'Instagram　　♡　✉'):state.platform==='tiktok'?'팔로잉　 |　 추천　　⌕':'N　클립　　팔로잉　추천　⌕';
    const icon=(path)=>'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
    const home=icon('<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z"/>'),searchIcon=icon('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'),plus=icon('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7v10M7 12h10"/>'),profile=icon('<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>');
    const heart=icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'),commentIcon=icon('<path d="M21 11.5a8.5 8.5 0 1 1-3.7-7L21 3v8.5Z"/>'),share=icon('<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>'),repost=icon('<path d="m3 7 3-3 3 3M6 4v12h8m7 1-3 3-3-3m3 3V8h-8"/>'),save=icon('<path d="M6 3h12v18l-6-4-6 4V3Z"/>');
    const labels=state.platform==='threads'?[[heart,'좋아요'],[commentIcon,'답글'],[repost,'리포스트'],[share,'공유']]:state.platform==='instagram'?[[heart,'좋아요'],[commentIcon,'댓글'],[share,'공유'],[save,'저장']]:[[heart,'좋아요'],[commentIcon,'댓글'],[save,'저장'],[share,'공유']];
    const engagement=p.querySelector('.preview-engagement');engagement.replaceChildren();for(const [svg,label]of labels){const el=document.createElement('span');el.innerHTML=svg;el.append(text('small',shortView?label:''));el.setAttribute('aria-label',label+' 위치 미리보기');engagement.append(el);}
    p.querySelector('.preview-audio').hidden=!shortView;
    p.querySelector('.preview-audio-label').textContent=job?.media?.has_audio?'원본 오디오 · 내 콘텐츠':'음성 없는 미디어';
    p.querySelector('.preview-more').hidden=shortView;
    p.querySelector('.preview-bottom-nav').textContent=state.platform==='threads'?'⌂　　⌕　　＋　　♡　　◎':state.platform==='instagram'?'⌂　　⌕　　＋　　▷　　◎':state.platform==='tiktok'?'홈　　친구　　＋　　메시지　　프로필':'홈　　검색　　＋　　알림　　프로필';
    const bottom=p.querySelector('.preview-bottom-nav');bottom.replaceChildren();for(const [svg,label]of [[home,'홈'],[searchIcon,'검색'],[plus,'만들기'],[commentIcon,'메시지'],[profile,'프로필']]){const el=document.createElement('span');el.innerHTML=svg;if(shortView)el.append(text('small',label));bottom.append(el);}
    p.querySelector('.preview-body').textContent=get('script').value||'본문을 작성하면 여기에 바로 표시됩니다.';
    const comment=get('comment').value||'';p.querySelector('.preview-comment p').textContent=comment||'첫 댓글 없음';
    p.querySelector('.preview-comment').hidden=state.platform!=='threads'&&state.platform!=='instagram';
    const items=mediaItems(state);state.index=Math.max(0,Math.min(state.index,items.length-1));const item=items[state.index];
    const key=JSON.stringify([job?.id,job?.edit,job?.carousel?.updated_at,item]);
    if(key!==state.mediaKey){state.mediaKey=key;const box=p.querySelector('.preview-media');for(const v of box.querySelectorAll('video'))v.pause();box.replaceChildren();if(item){const el=document.createElement(item.kind==='video'?'video':'img');el.src=item.url;if(item.kind==='video'){el.controls=true;el.preload='metadata';el.playsInline=true;if(item.poster)el.poster=item.poster;}else el.alt='게시 미디어 '+(state.index+1);el.onerror=()=>{p.querySelector('.preview-source-note').textContent='미디어를 표시하지 못했습니다. 원본 준비와 파일 상태를 확인하세요.';};box.append(el);}else box.append(text('p',job?'선택한 미디어 구성에 준비된 파일이 없습니다.':'레퍼런스를 선택하거나 원본을 불러오세요.'));}
    p.querySelector('.preview-media-count').textContent=items.length?(state.index+1)+' / '+items.length:'미디어 없음';p.querySelector('.preview-prev').disabled=state.index<=0;p.querySelector('.preview-next').disabled=state.index>=items.length-1;
    p.querySelector('.preview-source-note').textContent=job?(job.name||'선택한 작업')+(get('upload-format').value==='carousel'?' · 캐러셀 슬라이드 미리보기':' · 현재 준비된 미디어')+(['tiktok','naver_clip'].includes(state.platform)&&job.kind==='image'?' · 이 대상은 게시용 영상이 필요합니다.':''):'아직 선택한 작업이 없습니다.';
  }
  let reviewSignature='';
  function updateStart(){const signature=JSON.stringify([job?.id,job?.sha256,job?.edit,job?.carousel?.updated_at,get('script').value,get('comment').value,get('upload-platform').value,get('upload-format').value,get('extension-mode').value,get('extension-when').value,get('publish-target-mode').value,[...document.querySelectorAll('.batch-platform-cb:checked')].map(b=>b.value)]);if(signature!==reviewSignature)get('publish-final-confirm').checked=false;reviewSignature=signature;const batch=get('publish-target-mode').value==='batch';const target=batch?[...document.querySelectorAll('.batch-platform-cb:checked')].map(b=>platformNames[b.value]).join(', '):platformNames[get('upload-platform').value];const when=get('extension-when').value;get('publish-start-summary').textContent=(target||'대상 미선택')+' · '+(when?new Date(when).toLocaleString():'지금 실행')+' · '+(get('extension-mode').value==='auto'?'자동 게시':'반자동 입력');get('publish-start').textContent=when?'예약 등록 시작':'게시 준비 시작';get('publish-start').disabled=!get('publish-final-confirm').checked||originals[batch?1:0].disabled||busy;}
  get('publish-start').onclick=()=>{updateStart();if(!get('publish-start').disabled)originals[get('publish-target-mode').value==='batch'?1:0].click();};
  function changed(event){if(event?.isTrusted)get('publish-final-confirm').checked=false;refreshPreviews();}
  for(const id of ['script','body','comment','disclosure','product-name','affiliate-url','upload-platform','upload-format','extension-mode','extension-when','publish-target-mode']){get(id)?.addEventListener('input',changed);get(id)?.addEventListener('change',changed);}
  for(const cb of document.querySelectorAll('.batch-platform-cb'))cb.addEventListener('change',changed);
  get('publish-final-confirm').onchange=updateStart;
  get('upload-platform').addEventListener('change',()=>{const value=get('upload-platform').value;instances.find(s=>s.context==='publish').platform=value.startsWith('instagram')?'instagram':value;refreshPreviews();});
  const originalRender=render;render=function(...args){const oldId=instances[0].jobId;const result=originalRender(...args);if(oldId!==job?.id)get('publish-final-confirm').checked=false;for(const state of instances)state.jobId=job?.id;refreshPreviews();return result;};
  function refreshPreviews(){for(const state of instances)refreshPreview(state);updateStart();}
  new MutationObserver(updateStart).observe(originals[0],{attributes:true,attributeFilter:['disabled']});new MutationObserver(updateStart).observe(originals[1],{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(()=>{for(const state of instances)if(state.panel.closest('main').hidden)for(const video of state.panel.querySelectorAll('video'))video.pause();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
  // Calendar consumes the existing persisted native upload queue; no second scheduling engine.
  const tab=document.createElement('button');tab.id='workspace-scheduler-tab';tab.dataset.workspace='scheduler';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','scheduler-workspace');tab.textContent='예약 달력';get('workspace-publish-tab').after(tab);
  const calendar=document.createElement('main');calendar.id='scheduler-workspace';calendar.hidden=true;calendar.setAttribute('role','tabpanel');calendar.setAttribute('aria-labelledby',tab.id);calendar.innerHTML='<div class="workspace-heading"><div><h1>예약 달력</h1><p>이 컴퓨터의 실제 게시 대기열 · 현지 시간 기준</p></div><button id="calendar-refresh" type="button" class="secondary">예약 상태 새로고침</button></div><p id="calendar-status" role="status">예약 목록을 불러오세요.</p><div class="calendar-layout"><section><div class="calendar-toolbar"><button id="calendar-prev" type="button" class="secondary" aria-label="이전 달">←</button><h2 id="calendar-month"></h2><button id="calendar-next" type="button" class="secondary" aria-label="다음 달">→</button><button id="calendar-today" type="button" class="secondary">오늘</button></div><div class="calendar-weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div id="calendar-days" class="calendar-days" role="group" aria-label="예약 날짜 선택"></div></section><section class="calendar-detail"><h2 id="calendar-selected"></h2><div id="calendar-events"></div><button id="calendar-use-date" type="button" class="secondary">이 날짜로 예약 설정</button><p class="hint">앱이 닫혀 있으면 예약을 실행할 수 없습니다. ‘확인 필요’는 게시 완료가 아닙니다.</p></section></div>';
  get('settings-workspace').before(calendar);
  let queue=[],month=new Date(),selected=new Date(),queueLoaded=false,queueError='',queuePending=null,queueCheckedAt=null;month=new Date(month.getFullYear(),month.getMonth(),1);
  const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const states={queued:'예약 대기',running:'실행 중',awaiting_confirmation:'직접 게시 확인 대기',posted:'게시 확인',partial_success:'일부 게시 · 확인 필요',uncertain:'결과 확인 필요',missed:'예약 시각 경과',cancelled:'취소됨'};
  function drawCalendar(){
    get('calendar-month').textContent=month.getFullYear()+'년 '+(month.getMonth()+1)+'월';get('calendar-selected').textContent=selected.toLocaleDateString()+' 예약';get('calendar-status').textContent=queueError||(!queueLoaded?'예약 목록을 불러오는 중…':'대기열 '+queue.length+'건 · 현지 시간 · 마지막 확인 '+(queueCheckedAt?.toLocaleTimeString()||'미확인'));const days=get('calendar-days');days.replaceChildren();const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();for(let i=0;i<month.getDay();i++){const gap=document.createElement('span');gap.className='calendar-gap';days.append(gap);}for(let day=1;day<=count;day++){const date=new Date(month.getFullYear(),month.getMonth(),day),key=dateKey(date),events=queue.filter(e=>dateKey(new Date(e.when))===key),button=document.createElement('button');button.type='button';button.className='calendar-day';button.dataset.date=key;button.setAttribute('aria-pressed',String(key===dateKey(selected)));button.setAttribute('aria-label',date.toLocaleDateString()+', '+events.length+'건');button.append(text('strong',String(day)));for(const e of events.slice(0,2)){const badge=text('span',(platformNames[e.platform]||'Threads')+' · '+(states[e.state]||e.state));badge.className='calendar-event';badge.dataset.state=e.state;button.append(badge);}if(events.length>2)button.append(text('small','+'+(events.length-2)+'건'));button.onclick=()=>{selected=date;drawCalendar();};days.append(button);}
    const list=get('calendar-events');list.replaceChildren();const events=queue.filter(e=>dateKey(new Date(e.when))===dateKey(selected)).sort((a,b)=>a.when-b.when);for(const e of events){const row=document.createElement('article');row.className='calendar-event-detail';row.append(text('h3',e.name||'제목 없음'),text('p',new Date(e.when).toLocaleTimeString()+' · '+(platformNames[e.platform]||'Threads')),text('p',states[e.state]||e.state));if(e.error)row.append(text('p',e.error));if(e.permalink&&/^https:\/\//.test(e.permalink)){const link=document.createElement('a');link.href=e.permalink;link.target='_blank';link.rel='noopener';link.textContent='게시 결과 확인';row.append(link);}list.append(row);}if(!events.length)list.append(text('p',queueLoaded?'이 날짜에 등록된 예약이 없습니다.':'예약 목록을 확인하지 못했습니다.'));get('calendar-use-date').disabled=dateKey(selected)<dateKey(new Date());
  }
  document.addEventListener('studio-upload-queue',event=>{queue=Array.isArray(event.detail)?event.detail:[];queueLoaded=true;queueError='';queueCheckedAt=new Date();drawCalendar();});
  async function refreshCalendar(){if(queuePending)return queuePending;queuePending=refreshUploadQueue().catch(error=>{queueError='예약 목록 연결 실패: '+error.message+' · 마지막 확인 목록을 유지합니다.';drawCalendar();}).finally(()=>{queuePending=null;});return queuePending;}
  window.refreshStudioCalendar=refreshCalendar;get('calendar-refresh').onclick=refreshCalendar;
  get('calendar-prev').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);drawCalendar();};get('calendar-next').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);drawCalendar();};get('calendar-today').onclick=()=>{selected=new Date();month=new Date(selected.getFullYear(),selected.getMonth(),1);drawCalendar();};
  get('calendar-use-date').onclick=()=>{const target=dateKey(selected)===dateKey(new Date())?new Date(Date.now()+3600000):new Date(selected.getFullYear(),selected.getMonth(),selected.getDate(),9);get('extension-when').value=dateKey(target)+'T'+String(target.getHours()).padStart(2,'0')+':'+String(target.getMinutes()).padStart(2,'0');get('publish-final-confirm').checked=false;refreshPreviews();get('workspace-publish-tab').click();};
  const timer=setInterval(()=>{if(!document.hidden&&(!calendar.hidden||!publish.hidden))refreshCalendar();},30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  refreshPreviews();drawCalendar();
})();
