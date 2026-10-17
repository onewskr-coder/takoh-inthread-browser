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
function escapeHtml(str){return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
window.$=$;window.api=api;window.act=act;window.message=message;window.text=text;window.escapeHtml=escapeHtml;
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
  if($('hook-editor'))$('hook-editor').hidden=(activeEditTab!=='hook');
  if(!job||job.kind==='image')return;
  const duration=Number(job.media?.duration||3),length=Math.round(Math.min(3,duration/3)*100)/100;
  if(editJobId!==job.id){
    editJobId=job.id;
    $('hook-length').value=length;$('hook-start').max=Math.max(0,duration-length);
    const result=job.analysis?.result||{},hook=result.hook,recommendations=job.hook_recommendations?.candidates||[],obs=result.observations||[];
    $('hook-candidate').replaceChildren();
    const list=recommendations.length?recommendations:obs;
    if(list.length){
      for(const [i,item] of list.entries()){
        const option=text('option',recommendations.length?`${i+1}순위 · 적합도 ${item.score}/100 · ${item.timestamp}초 · ${item.reason}`:`${item.timestamp}초 · ${item.description}`);
        option.value=String(Math.max(0,Math.min(duration-length,item.timestamp)));
        option.dataset.timestamp=item.timestamp;
        option.dataset.reason=item.reason||item.description;
        $('hook-candidate').append(option);
      }
    }else{
      const opt=text('option','0.0초 · 영상 시작 구간 (AI 후킹 추천 실행 가능)');
      opt.value='0';opt.dataset.timestamp='0';opt.dataset.reason='원하는 시작 시점을 직접 입력하거나 [AI 후킹 구간 추천]을 실행하세요.';
      $('hook-candidate').append(opt);
    }
    const recommendation=recommendations.length?Number($('hook-candidate').value):hook&&Number.isFinite(hook.timestamp)?Math.max(0,Math.min(duration-length,hook.timestamp)):Number($('hook-candidate').value||0);
    $('hook-start').value=recommendation;refreshHookFocus();
    $('hook-reason').textContent=recommendations.length?'1순위 자동 선택 · '+recommendations[0].reason:hook?.reason?'AI 추천: '+hook.reason:'저장된 관찰 장면 중 사용할 구간을 선택하거나 AI 추천을 실행하세요.';
    if(!recommendations.length&&hook)$('hook-candidate').value=String(recommendation);
    $('hook-effect').value='impact';
    const firstFrame=job.evidence?.frames?.[0]?.file||'frame-0.jpg';
    $('subtitle-region-image').src=`/studio/jobs/${job.id}/media/${firstFrame}`;
    $('subtitle-treatment').value='auto_subtitles';$('subtitle-region').hidden=true;regionBox();
  }
}
$('hook-candidate').onchange=()=>{const select=$('hook-candidate');$('hook-start').value=select.value;refreshHookFocus();const option=select.selectedOptions[0];$('hook-reason').textContent=option?.dataset.reason||'';const timestamp=Number(option?.dataset.timestamp||0);const frame=[...(job?.evidence?.frames||[])].sort((a,b)=>Math.abs(a.timestamp-timestamp)-Math.abs(b.timestamp-timestamp))[0];if(frame)$('subtitle-region-image').src=`/studio/jobs/${job.id}/media/${frame.file}`;};
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
  let cReady=0,cAnalyzed=0,cPublished=0;
  for(const item of items){
    const isPub=['published','posted'].includes(item.status)||item.publication?.status==='published';
    const isDoneOrProg=Boolean(item.analyzed||item.edited||['analyzed','draft_ready','publish_ready','edited','analysis_ready','product_ready'].includes(item.status));
    const group=isPub?'published':(isDoneOrProg?'analyzed':'ready');
    if(group==='published')cPublished++;
    else if(group==='analyzed')cAnalyzed++;
    else cReady++;

    const row=document.createElement('div');row.className='saved-job dashboard-job-card';
    row.classList.toggle('active',item.id===job?.id);
    row.dataset.search=((item.name||'')+' '+(item.product_name||'')+' '+(item.body_preview||'')).toLocaleLowerCase();
    row.dataset.group=group;

    const topBtn=document.createElement('button');topBtn.type='button';topBtn.className='saved-job-open';topBtn.title=item.name;
    const thumbWrap=document.createElement('div');thumbWrap.className='saved-job-thumb-wrap';
    const thumbnail=document.createElement('img');thumbnail.src=`/studio/jobs/${item.id}/media/frame-0.jpg`;thumbnail.alt='';thumbnail.loading='lazy';thumbnail.onerror=()=>{thumbnail.hidden=true;};
    const kindTag=text('span',item.kind==='image'?'이미지':'영상');kindTag.className='saved-job-kind-badge';
    thumbWrap.append(thumbnail,kindTag);

    const details=document.createElement('div');details.className='saved-job-details';
    const headRow=document.createElement('div');headRow.className='saved-job-head-row';
    const title=text('strong',item.name||'이름 없는 프로젝트');title.className='saved-job-title';
    const status=text('span',`${names[item.status]||item.status}${item.reused_from?' · 재사용':''}`);
    status.className='saved-job-status status-'+group;
    headRow.append(title);
    details.append(headRow,status);

    // 4-step pipeline pills: 분석 · 편집 · 대본 · 게시준비
    const stepBar=document.createElement('div');stepBar.className='saved-job-steps';
    const p1=text('span','01 분석');p1.className='job-step-pill'+(item.analyzed?' done':'');
    const p2=text('span','02 편집');p2.className='job-step-pill'+((item.edited||item.has_carousel||item.has_text_edit)?' done':'');
    const p3=text('span','03 대본');p3.className='job-step-pill'+((['draft_ready','publish_ready','published'].includes(item.status))?' done':'');
    const p4=text('span','04 게시');p4.className='job-step-pill'+((['publish_ready','published'].includes(item.status))?' done':'');
    stepBar.append(p1,p2,p3,p4);
    details.append(stepBar);

    topBtn.append(thumbWrap,details);
    const openJobToStage=(targetWorkspace,targetStage)=>act('선택한 프로젝트를 불러오는 중…',async()=>{
      job=await api(`jobs/${item.id}`);
      render();await refreshJobs();
      if(window.selectWorkspace)window.selectWorkspace(targetWorkspace);
      else document.querySelector(`[data-workspace="${targetWorkspace}"]`)?.click();
      if(targetWorkspace==='create'&&targetStage){
        if(window.selectStage)window.selectStage(targetStage);
        else document.querySelector(`[data-production-stage="${targetStage}"]`)?.click();
      }
    });
    topBtn.onclick=()=>openJobToStage('create',item.analyzed?'editing':'analysis');
    row.append(topBtn);

    const quickBar=document.createElement('div');quickBar.className='saved-job-quick-actions';
    const btnAn=text('button','분석');btnAn.type='button';btnAn.className='secondary btn-xs';
    btnAn.onclick=e=>{e.stopPropagation();openJobToStage('create','analysis');};
    const btnEd=text('button','미디어편집');btnEd.type='button';btnEd.className='secondary btn-xs';
    btnEd.onclick=e=>{e.stopPropagation();openJobToStage('create','editing');};
    const btnCar=text('button','캐러셀편집');btnCar.type='button';btnCar.className='secondary btn-xs';
    btnCar.onclick=e=>{e.stopPropagation();openJobToStage('create','carousel');};
    const btnWr=text('button','대본');btnWr.type='button';btnWr.className='secondary btn-xs';
    btnWr.onclick=e=>{e.stopPropagation();openJobToStage('create','writing');};
    const btnPub=text('button','게시');btnPub.type='button';btnPub.className='secondary btn-xs';
    btnPub.onclick=e=>{e.stopPropagation();openJobToStage('publish','');};
    quickBar.append(btnAn,btnEd,btnCar,btnWr,btnPub);
    row.append(quickBar);

    const remove=text('button','×');remove.type='button';remove.className='saved-job-delete';remove.title='이 프로젝트 삭제';remove.setAttribute('aria-label',item.name+' 작업 삭제');remove.onclick=e=>{
      e.stopPropagation();
      if(!window.confirm(`“${item.name}” 프로젝트와 보관 파일을 삭제할까요? 다운로드 폴더의 원본과 게시된 콘텐츠는 삭제되지 않습니다.`))return;
      act('작업 삭제 중…',async()=>{const response=await fetch(`/studio/jobs/${item.id}`,{method:'DELETE',headers:{'X-Studio-Token':token}});const result=await response.json();if(!response.ok)throw new Error(result.error||'작업 삭제 실패');if(job?.id===item.id){job=null;editJobId=null;try{localStorage.removeItem('takoh-active-job-id');}catch{}render();}await refreshJobs();},'저장된 프로젝트를 삭제했습니다.');
    };row.append(remove);
    $('jobs').append(row);
  }
  if($('kpi-total-jobs'))$('kpi-total-jobs').textContent=String(items.length);
  if($('kpi-ready-jobs'))$('kpi-ready-jobs').textContent=String(cReady);
  if($('kpi-analyzed-jobs'))$('kpi-analyzed-jobs').textContent=String(cAnalyzed);
  if($('kpi-published-jobs'))$('kpi-published-jobs').textContent=String(cPublished);
  window.filterSavedJobs?.();
  if(!job&&!window.__initialJobRestored){
    window.__initialJobRestored=true;
    let savedJobId='';
    try{savedJobId=localStorage.getItem('takoh-active-job-id')||'';}catch{}
    if(savedJobId&&items.some(it=>it.id===savedJobId)){
      try{
        job=await api(`jobs/${savedJobId}`);
        render();
        document.querySelectorAll('#jobs .saved-job').forEach(r=>r.classList.remove('active'));
        const idx=items.findIndex(it=>it.id===savedJobId);
        if(idx>=0&&$('jobs')?.children[idx])$('jobs').children[idx].classList.add('active');
      }catch{}
    }
  }
}
window.filterSavedJobs=()=>{
  const query=($('saved-job-search')?.value||'').toLocaleLowerCase(),group=$('saved-job-filter')?.value||'all';
  document.querySelectorAll('[data-kpi-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.kpiFilter===group));
  const rows=[...$('jobs').children];let shown=0;
  for(const row of rows){
    row.hidden=!row.dataset.search.includes(query)||(group!=='all'&&row.dataset.group!==group);
    if(!row.hidden)shown++;
  }
  if($('saved-job-count'))$('saved-job-count').textContent=`${shown} / ${rows.length}개 프로젝트`;
};
$('saved-job-search')?.addEventListener('input',window.filterSavedJobs);
$('saved-job-filter')?.addEventListener('change',window.filterSavedJobs);
document.querySelectorAll('[data-kpi-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if($('saved-job-filter')){$('saved-job-filter').value=btn.dataset.kpiFilter||'all';window.filterSavedJobs();}
  });
});
if($('dashboard-url-form'))$('dashboard-url-form').onsubmit=event=>{
  event.preventDefault();
  const url=($('dashboard-fetch-url')?.value||'').trim();
  if(!url){message('불러올 게시물 URL을 입력해 주세요.',true);return;}
  act('게시물에서 미디어와 본문을 가져와 제작 프로젝트를 생성하는 중…',async()=>{
    let acquired=await api('acquire',{url});
    job=await normalizeAcquiredComboJob(acquired,{url,cleanImageUrls:[]});
    if((job?.attachments||[]).length>0&&$('upload-format'))$('upload-format').value='combo';
    if($('dashboard-fetch-url'))$('dashboard-fetch-url').value='';
    render();await refreshJobs();
    document.querySelector('[data-workspace="create"]')?.click();
    document.querySelector('[data-production-stage="analysis"]')?.click();
  },'새 프로젝트를 생성했습니다! 01 영상·소재 분석 단계로 이동했습니다.');
};
async function exportPlatformPacket(id,data){
 let policy;try{policy=await api('disclosure-policy');}catch{throw new Error('플랫폼별 광고 표시를 적용하려면 도우미 최신 코드로 재시작이 필요합니다. 게시 준비를 중단했습니다.');}
 if(policy.version!=='platform-ad-v1')throw new Error('광고 표시 도우미 버전이 맞지 않아 게시 준비를 중단했습니다.');
 return api(`jobs/${id}/extension-export`,data);
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
  const hasSavedProduct=Boolean(!productDirty&&job?.product&&(job.product.affiliate_url||(job.product.name&&['user_confirmed','api_issued'].includes(job.product.attribution))));
  const checks={
    analysis:Boolean(job&&(job.analysis||job.media_ocr||(job.source_text&&job.source_text.trim()))),
    editing:Boolean(job&&(job.text_edit||job.edit||(job.attachments?.length))),
    carousel:Boolean(job&&(job.carousel?.slides?.length)),
    writing:Boolean(job&&(job.draft?.body||job.draft?.script||job.status==='publish_ready'||job.status==='published')),
    product:hasSavedProduct,
    publish:job?.status==='publish_ready'||job?.status==='published'||job?.publication?.status==='published'
  };
  document.querySelectorAll('[data-production-stage]').forEach(btn=>{
    const key=btn.dataset.productionStage;
    btn.classList.toggle('step-done',Boolean(checks[key]));
  });
}
const carouselTemplateNames={
  editorial_dark:'시네마 리뷰 다크 (상하 분할 + 좌측 넘버링)',
  magazine_gradient:'뉴욕 매거진 세리프 (우측 액자 + 좌측 인덱스)',
  clean_white:'클린 화이트 갤러리 (오프화이트 지면)',
  highlight_hook:'하이라이트 훅 배너 (상단 배너 + 하단 캡션)',
  mint_modern:'모던 큐레이션 북 (슬레이트 + 좌측 보더)',
  warm_luxury:'폴라로이드 저널 (모눈 지면 + 폴라로이드)',
  neon_pop:'모던 윈도우 카드 (블러 배경 + UI 윈도우)',
  minimal_outline:'미니멀 명조 포스터 (풀블리드 + 세리프)'
};
const carouselRoleLabels={
  cover:'01 메인 표지 (Cover · 풀블리드 포스터)',
  body:'02 본문 포인트 (Body · 8종 테마별 고유 연출)',
  cta:'03 마지막 요약·CTA (CTA · 체크리스트 + 액션 바)'
};
let activeCarouselSlideIndex=1;
function formatHighlightPreviewHtml(raw){
  const escaped=String(raw||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return escaped
    .replace(/\[([^\]]+)\]/g,'<span class="drag-hl-box">$1</span>')
    .replace(/\*([^\*]+)\*/g,'<span class="drag-hl-accent">$1</span>');
}
function renderCarouselIntelBar(){
  const wrap=$('carousel-intel-badges');
  if(!wrap)return;
  wrap.replaceChildren();
  if(!job){
    const p=text('span','원본·분석 자료 대기');p.className='intel-pill';wrap.append(p);
    return;
  }
  const items=[
    {label:'원본 게시물 글',ok:Boolean((job.source_text||$('source-post-text')?.value||'').trim())},
    {label:`AI 장면 분석 (${(job.analysis?.result?.observations||[]).length}개)`,ok:Boolean(job.analysis?.result)},
    {label:'OCR 번역',ok:Boolean(job.media_ocr?.translated_text||job.media_ocr?.raw_text)},
    {label:'게시글 초안',ok:Boolean((job.draft?.body||$('script')?.value||'').trim())},
    {label:`상품 정보${job.product?.name?' ('+job.product.name.slice(0,12)+')':''}`,ok:Boolean(job.product?.name)}
  ];
  for(const it of items){
    const badge=text('span',`${it.ok?'':'· '}${it.label}`);
    badge.className='intel-pill'+(it.ok?' active':'');
    wrap.append(badge);
  }
}
const coverHookFormulaMeta={
  question:{name:'질문형 후킹',badge:'QUESTION HOOK',desc:'호기심·공감 유발 질문으로 스와이프 유도'},
  number:{name:'숫자·공식형 후킹',badge:'90% FORMULA',desc:'구체적 수치·법칙으로 신뢰도·클릭률 상승'},
  twist:{name:'반전·통념파괴형',badge:'TWIST HOOK',desc:'고정관념을 깨는 반전 문장으로 시선 고정'},
  loss_aversion:{name:'손실회피·비교형',badge:'MUST CHECK',desc:'모르면 손해 보는 핵심 체크 포인트 강조'},
  direct_rule:{name:'단도직입·비결형',badge:'CORE SECRET',desc:'잘 터지는 핵심 공식·결론을 직관적으로 제시'}
};
function formatCoverHookByFormula(formulaKey,rawTopic,rawSub,prodName,slideCount){
  const f=(formulaKey||'number').trim();
  const countNum=Math.max(1,Math.min(10,Number(slideCount||$('carousel-count')?.value||5)));
  const pointCount=Math.max(2,countNum>1?countNum-1:3);
  let baseTopic=String(rawTopic||'').replace(/\|.*$/,'').replace(/\[|\]|\*/g,'').trim();
  // Strip previously applied formula wrappers if user switches between chips
  baseTopic=baseTopic
    .replace(/^혹시\s+/,'')
    .replace(/\s*(?:아직도 그대로 쓰세요\?|왜 다들 이걸로 바꿀까\?)$/,'')
    .replace(/^(?:90%가 놓치는|잘 터지는)\s+/,'')
    .replace(/\s*핵심 공식\s*\d+가지$/,'')
    .replace(/^다들 반대로 알고 있는\s+/,'')
    .replace(/\s*진짜 반전 핵심$/,'')
    .replace(/^모르면 손해 보는\s+/,'')
    .replace(/\s*실패 없는 체크리스트$/,'')
    .replace(/^잘 되는\s+/,'')
    .replace(/\s*제작·활용 공식 정리$/,'')
    .trim();
  const kw=(prodName||baseTopic||'핵심 포인트').slice(0,18).trim()||'핵심 포인트';
  const detail=(baseTopic&&baseTopic!==kw)?baseTopic.slice(0,22).trim():'실전 노하우';
  let title='';
  let subtitle=String(rawSub||'').trim();
  if(f==='question'){
    title=detail&&detail!==kw?`혹시 [${kw}] *${detail}* 아직도 그대로 쓰세요?`:`혹시 [${kw}] 아직도 *그대로* 쓰세요?`;
    if(!subtitle||/공식이 있습니다|체크 포인트|가이드/.test(subtitle)){
      subtitle=countNum===1?'90%가 무심코 지나치는 결정적 차이와 핵심 포인트를 한 장에 정리했습니다.':'90%가 무심코 지나치는 결정적 차이, 슬라이드를 넘겨 확인하세요!';
    }
  }else if(f==='number'){
    title=`90%가 놓치는 [${kw}] *핵심 공식 ${pointCount}가지*`;
    if(!subtitle||/지나치는 결정적|체크 포인트|가이드/.test(subtitle)){
      subtitle=`잘 되는 ${kw}에는 반드시 통하는 ${pointCount}가지 공식이 있습니다!`;
    }
  }else if(f==='twist'){
    title=`다들 반대로 알고 있는 [${kw}] *진짜 반전 핵심*`;
    if(!subtitle||/공식이 있습니다|체크 포인트|가이드/.test(subtitle)){
      subtitle='기존 상식을 뒤집는 실사용 비교 결과를 한눈에 정리했습니다!';
    }
  }else if(f==='loss_aversion'){
    title=`모르면 손해 보는 [${kw}] *실패 없는 체크리스트*`;
    if(!subtitle||/공식이 있습니다|체크 포인트|가이드/.test(subtitle)){
      subtitle='선택 전 딱 1분만 투자하면 후회 없는 핵심 기준을 알려드립니다.';
    }
  }else{
    title=`잘 되는 [${kw}] *제작·활용 공식* 정리`;
    if(!subtitle||/지나치는 결정적|체크 포인트|가이드/.test(subtitle)){
      subtitle=`잘 터지는 ${kw}에는 공식이 있습니다! 핵심만 빠르게 확인하세요.`;
    }
  }
  return {title,subtitle,combined:`${title} | ${subtitle}`,badge:coverHookFormulaMeta[f]?.badge||'MAIN COVER'};
}
function readImageFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    if(!file||!String(file.type||'').startsWith('image/')){
      reject(new Error('이미지 파일(PNG, JPG, WEBP 등)만 사용할 수 있습니다.'));
      return;
    }
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(new Error('이미지 파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsDataURL(file);
  });
}
async function readClipboardImageAsDataUrl(){
  if(!navigator.clipboard||!navigator.clipboard.read){
    throw new Error('이 환경에서는 버튼 클릭 클립보드 읽기가 제한되어 있습니다. 화면에서 바로 Ctrl+V를 눌러 붙여넣으세요.');
  }
  const items=await navigator.clipboard.read();
  for(const item of items){
    const imgType=(item.types||[]).find(t=>t.startsWith('image/'));
    if(imgType){
      const blob=await item.getType(imgType);
      return await readImageFileAsDataUrl(blob);
    }
  }
  throw new Error('클립보드에 복사된 이미지가 없습니다. 이미지를 복사(Ctrl+C 또는 우클릭 이미지 복사)한 뒤 다시 시도하거나 Ctrl+V를 누르세요.');
}
let pendingCarouselPhotoMode='replace'; // 'replace' | 'add_slide'
async function applyCarouselCustomPhotoDataUrl(dataUrl,mode='replace',sourceLabel='클립보드/파일 이미지'){
  if(!job)throw new Error('먼저 작업할 영상·소재를 불러오세요.');
  if(!dataUrl||!dataUrl.startsWith('data:image/'))throw new Error('유효한 이미지 데이터가 아닙니다.');
  const slides=job?.carousel?.slides||[];
  if(!slides.length){
    await act(`${sourceLabel}로 캐러셀 세트를 초기화하고 표지 사진에 적용하는 중…`,async()=>{
      if(!($('carousel-cover-title')?.value||'').trim())ensureCarouselStoryAutoPopulated(true);
      $('btn-generate-carousel')?.click();
    });
    return;
  }
  if(mode==='add_slide'){
    await act(`${sourceLabel}로 새 캐러셀 슬라이드를 추가하는 중…`,async()=>{
      await update('carousel-slide-action',{
        action:'add',
        image_data_url:dataUrl,
        title:'[추가 체크 포인트]',
        subtitle:'새로 추가한 이미지의 핵심 설명을 입력하세요',
        body_text:''
      });
      const nextSlides=job?.carousel?.slides||[];
      if(nextSlides.length>=2){
        activeCarouselSlideIndex=nextSlides.length-1;
      }
      renderCarouselPreview();
    },`${sourceLabel}를 기반으로 새 슬라이드를 추가했습니다!`);
  }else{
    const targetIdx=activeCarouselSlideIndex||1;
    canvaCleanBgMemoryCache.set(`${job.id}_${targetIdx}`,dataUrl);
    const curSlide=(job?.carousel?.slides||[]).find(s=>Number(s.index)===Number(targetIdx));
    if(curSlide)curSlide._cleanBgDataUrl=dataUrl;
    await act(`슬라이드 #${targetIdx} 사진을 ${sourceLabel}(으)로 교체하는 중…`,async()=>{
      await update('carousel-slide-update',{
        index:targetIdx,
        image_data_url:dataUrl
      });
      const nextSlide=(job?.carousel?.slides||[]).find(s=>Number(s.index)===Number(targetIdx));
      if(nextSlide)nextSlide._cleanBgDataUrl=dataUrl;
      renderCarouselPreview();
    },`슬라이드 #${targetIdx} 사진을 ${sourceLabel}(으)로 교체했습니다!`);
  }
}
function splitSlideThreeTierText(slideObj){
  if(!slideObj)return {title:'',subtitle:'',bodyText:''};
  const lines=String(slideObj.text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const title=(slideObj.title!==undefined&&String(slideObj.title).trim())?String(slideObj.title).trim():(lines[0]||'');
  const subtitle=(slideObj.subtitle!==undefined&&String(slideObj.subtitle).trim())?String(slideObj.subtitle).trim():(lines[1]||'');
  const bodyText=(slideObj.body_text!==undefined&&String(slideObj.body_text).trim())?String(slideObj.body_text).trim():(lines.length>2?lines.slice(2).join('\n'):'');
  return {title,subtitle,bodyText};
}
let activeCarouselInspectorTab='style'; // 'style' | 'photo' (문구·캡션 탭 제거 — 중앙 캔버스에서 Canva처럼 직접 수정!)
let carouselRealtimeTimer=null;
let carouselSilentInflight=false;
let singleCardModeOverrideJobId=null;

function getSavedCarouselInspectorWidth(){
  try{
    const v=Number(localStorage.getItem('takoh-carousel-inspector-width'));
    if(Number.isFinite(v)&&v>=280&&v<=620)return Math.round(v);
  }catch{}
  return 360;
}
function applyCarouselInspectorWidth(rawPx,{save=true}={}){
  const px=Math.round(Math.max(280,Math.min(620,Number(rawPx)||360)));
  document.documentElement.style.setProperty('--carousel-inspector-width',`${px}px`);
  const pill=$('carousel-inspector-width-pill');
  if(pill)pill.textContent=`${px}px`;
  if(save){
    try{localStorage.setItem('takoh-carousel-inspector-width',String(px));}catch{}
  }
  return px;
}
applyCarouselInspectorWidth(getSavedCarouselInspectorWidth(),{save:false});

function enforceSingleCardModeIfActive(targetJob){
  if(!targetJob||!targetJob.carousel)return;
  const wantSingle=(singleCardModeOverrideJobId===targetJob.id)||(Number($('carousel-count')?.value||0)===1&&Number(targetJob.carousel.count||0)<=2);
  if(wantSingle&&Array.isArray(targetJob.carousel.slides)&&targetJob.carousel.slides.length>1){
    targetJob.carousel.slides=targetJob.carousel.slides.slice(0,1);
    targetJob.carousel.count=1;
  }
}

// === CANVA / MIRICANVAS MULTI-OBJECT DIRECT CANVAS ENGINE ===
const CANVA_THEME_OBJECT_PALETTES={
  editorial_dark:{
    scrim:'linear-gradient(180deg, rgba(10,12,18,0) 38%, rgba(10,12,18,0.68) 62%, rgba(8,10,15,0.92) 84%, rgba(6,8,12,0.97) 100%)',
    counterColor:'#ffffff',counterBg:'rgba(14,17,24,0.78)',
    badgeText:'main cover',badgeColor:'#ee5646',badgeBg:'#101210',badgeRadius:10,
    titleColor:'#ffffff',hlBoxBg:'#facc15',hlBoxText:'#0f172a',hlAccent:'#fde047',
    starsColor:'#faca22',subColor:'#f8fafc'
  },
  magazine_gradient:{
    scrim:'linear-gradient(180deg, rgba(15,12,10,0) 36%, rgba(20,15,12,0.72) 64%, rgba(14,10,8,0.95) 100%)',
    counterColor:'#fef3c7',counterBg:'rgba(24,18,14,0.82)',
    badgeText:'MAGAZINE COVER',badgeColor:'#111827',badgeBg:'#f59e0b',badgeRadius:8,
    titleColor:'#ffffff',hlBoxBg:'#fbbf24',hlBoxText:'#111827',hlAccent:'#fcd34d',
    starsColor:'#fbbf24',subColor:'#f3f4f6'
  },
  clean_white:{
    scrim:'linear-gradient(180deg, rgba(255,255,255,0) 40%, rgba(248,250,252,0.86) 66%, rgba(241,245,249,0.98) 100%)',
    counterColor:'#0f172a',counterBg:'rgba(255,255,255,0.88)',
    badgeText:'CLEAN EDITION',badgeColor:'#ffffff',badgeBg:'#0f172a',badgeRadius:8,
    titleColor:'#0f172a',hlBoxBg:'#0f172a',hlBoxText:'#facc15',hlAccent:'#2563eb',
    starsColor:'#eab308',subColor:'#1e293b'
  },
  highlight_hook:{
    scrim:'linear-gradient(180deg, rgba(12,14,22,0) 36%, rgba(12,14,22,0.75) 62%, rgba(9,11,18,0.96) 100%)',
    counterColor:'#facc15',counterBg:'rgba(15,23,42,0.85)',
    badgeText:'HIGHLIGHT HOOK',badgeColor:'#0f172a',badgeBg:'#facc15',badgeRadius:999,
    titleColor:'#ffffff',hlBoxBg:'#facc15',hlBoxText:'#0f172a',hlAccent:'#fde047',
    starsColor:'#facc15',subColor:'#f1f5f9'
  },
  mint_modern:{
    scrim:'linear-gradient(180deg, rgba(8,20,24,0) 38%, rgba(10,24,30,0.74) 64%, rgba(8,18,24,0.96) 100%)',
    counterColor:'#ccfbf1',counterBg:'rgba(15,23,42,0.82)',
    badgeText:'CURATION NOTE',badgeColor:'#042f2e',badgeBg:'#2dd4bf',badgeRadius:10,
    titleColor:'#ffffff',hlBoxBg:'#2dd4bf',hlBoxText:'#042f2e',hlAccent:'#5eead4',
    starsColor:'#facc15',subColor:'#e2e8f0'
  },
  warm_luxury:{
    scrim:'linear-gradient(180deg, rgba(24,18,14,0) 38%, rgba(28,20,15,0.74) 64%, rgba(18,13,10,0.95) 100%)',
    counterColor:'#fef3c7',counterBg:'rgba(28,25,23,0.82)',
    badgeText:'JOURNAL PICK',badgeColor:'#fef3c7',badgeBg:'#78350f',badgeRadius:8,
    titleColor:'#fffbeb',hlBoxBg:'#f59e0b',hlBoxText:'#1c1917',hlAccent:'#fcd34d',
    starsColor:'#fbbf24',subColor:'#fde68a'
  },
  neon_pop:{
    scrim:'linear-gradient(180deg, rgba(10,10,24,0) 36%, rgba(14,12,34,0.76) 62%, rgba(8,8,20,0.96) 100%)',
    counterColor:'#38bdf8',counterBg:'rgba(15,23,42,0.86)',
    badgeText:'TREND CHECK',badgeColor:'#ffffff',badgeBg:'#ec4899',badgeRadius:999,
    titleColor:'#ffffff',hlBoxBg:'#38bdf8',hlBoxText:'#0f172a',hlAccent:'#f472b6',
    starsColor:'#facc15',subColor:'#e0f2fe'
  },
  minimal_outline:{
    scrim:'linear-gradient(180deg, rgba(12,12,14,0) 40%, rgba(14,14,18,0.72) 66%, rgba(10,10,12,0.94) 100%)',
    counterColor:'#f8fafc',counterBg:'rgba(15,23,42,0.76)',
    badgeText:'EDITORIAL',badgeColor:'#f8fafc',badgeBg:'#1e293b',badgeRadius:6,
    titleColor:'#ffffff',hlBoxBg:'#f8fafc',hlBoxText:'#0f172a',hlAccent:'#cbd5e1',
    starsColor:'#facc15',subColor:'#e2e8f0'
  }
};

let selectedCanvaObjectId='obj_title';
const canvaCleanBgMemoryCache=new Map();

function getCanvaSlideStorageKey(jobId,slideIdx){
  return `takoh_canva_objs_v2_${jobId}_${slideIdx}`;
}
function saveCanvaSlideLocalState(jobId,slideIdx,objects,bgTransform,cleanBgUrl){
  if(!jobId||!slideIdx)return;
  try{
    const payload={objects,bgTransform:bgTransform||{scale:1,x:0,y:0}};
    localStorage.setItem(getCanvaSlideStorageKey(jobId,slideIdx),JSON.stringify(payload));
    if(cleanBgUrl&&cleanBgUrl.startsWith('data:image/')){
      canvaCleanBgMemoryCache.set(`${jobId}_${slideIdx}`,cleanBgUrl);
    }
  }catch{}
}
function loadCanvaSlideLocalState(jobId,slideIdx){
  if(!jobId||!slideIdx)return null;
  try{
    const raw=localStorage.getItem(getCanvaSlideStorageKey(jobId,slideIdx));
    if(!raw)return null;
    return JSON.parse(raw);
  }catch{return null;}
}

function buildDefaultCanvaObjectsForSlide(slide,totalSlides,role,template){
  const pal=CANVA_THEME_OBJECT_PALETTES[template]||CANVA_THEME_OBJECT_PALETTES.editorial_dark;
  const {title:initHead,subtitle:initSubtitle,bodyText:initBodyText}=splitSlideThreeTierText(slide);
  const sIdx=Math.max(1,Number(slide?.index||1));
  const sTot=Math.max(1,Number(totalSlides||1));
  const counterStr=`0${sIdx} / 0${sTot}`;
  const rawBadge=String(slide?.badge||'').trim();
  const defaultBadge=role==='cover'
    ?(template==='editorial_dark'?'main cover':(rawBadge||pal.badgeText))
    :(role==='cta'?(rawBadge||'summary · cta'):(rawBadge||`point 0${Math.max(1,sIdx-1)}`));
  const badgeStr=(template==='editorial_dark'&&(!rawBadge||rawBadge.toUpperCase()==='MAIN COVER'))?'main cover':defaultBadge;
  const cleanHeadline=(initHead||'클릭하여 메인 제목을 입력하세요').trim();
  const combinedSub=[initSubtitle,initBodyText].filter(Boolean).join('\n').trim()||'클릭하여 상세 설명 문구를 입력하세요';
  return [
    {
      id:'obj_counter',
      kind:'counter',
      label:'슬라이드 번호 (01/02)',
      text:counterStr,
      x:80.5,
      y:3.6,
      widthPct:15.5,
      fontSize:20,
      color:pal.counterColor,
      bgColor:pal.counterBg,
      bgEnabled:true,
      borderRadius:999,
      paddingX:14,
      paddingY:6,
      align:'center',
      bold:true,
      visible:true
    },
    {
      id:'obj_badge',
      kind:'badge',
      label:'상단 배지 (main cover)',
      text:badgeStr,
      x:6.8,
      y:58.5,
      widthPct:0,
      fontSize:38,
      color:pal.badgeColor,
      bgColor:pal.badgeBg,
      bgEnabled:true,
      borderRadius:pal.badgeRadius,
      paddingX:18,
      paddingY:8,
      align:'left',
      bold:true,
      visible:true
    },
    {
      id:'obj_title',
      kind:'title',
      label:'메인 헤드라인 제목',
      text:cleanHeadline,
      x:6.8,
      y:66.2,
      widthPct:86.5,
      fontSize:66,
      color:pal.titleColor,
      bgColor:'#0f172a',
      bgEnabled:false,
      borderRadius:10,
      paddingX:6,
      paddingY:4,
      align:'left',
      bold:true,
      lineHeight:1.18,
      visible:true
    },
    {
      id:'obj_stars',
      kind:'stars',
      label:'별점 · 포인트 장식',
      text:'★★★★★',
      x:6.8,
      y:81.8,
      widthPct:0,
      fontSize:38,
      color:pal.starsColor,
      bgColor:'#0f172a',
      bgEnabled:false,
      borderRadius:8,
      paddingX:4,
      paddingY:2,
      align:'left',
      bold:true,
      visible:true
    },
    {
      id:'obj_sub',
      kind:'subtitle',
      label:'하단 서브 설명 문구',
      text:combinedSub,
      x:6.8,
      y:87.4,
      widthPct:86.5,
      fontSize:27,
      color:pal.subColor,
      bgColor:'rgba(15,23,42,0.65)',
      bgEnabled:false,
      borderRadius:8,
      paddingX:6,
      paddingY:4,
      align:'left',
      bold:true,
      lineHeight:1.38,
      visible:true
    }
  ];
}

function ensureCanvaObjectsForSlide(targetJob,slide,totalSlides,role,template){
  if(!slide)return [];
  const localState=loadCanvaSlideLocalState(targetJob?.id,slide.index);
  if(!Array.isArray(slide.canva_objects)||!slide.canva_objects.length){
    if(localState&&Array.isArray(localState.objects)&&localState.objects.length){
      slide.canva_objects=JSON.parse(JSON.stringify(localState.objects));
      if(!slide.bg_transform&&localState.bgTransform)slide.bg_transform=localState.bgTransform;
    }else{
      slide.canva_objects=buildDefaultCanvaObjectsForSlide(slide,totalSlides,role,template);
    }
  }
  if(!slide.bg_transform||typeof slide.bg_transform!=='object'){
    slide.bg_transform={scale:1,x:0,y:0};
  }
  // Keep counter synced with total slide count unless user customized it away from pattern
  const counterObj=slide.canva_objects.find(o=>o.kind==='counter'||o.id==='obj_counter');
  if(counterObj&&/^\d+\s*\/\s*\d+$/.test(String(counterObj.text||'').trim())){
    counterObj.text=`0${slide.index} / 0${Math.max(1,totalSlides)}`;
  }
  return slide.canva_objects;
}

function resolveCleanSlideBackgroundUrl(targetJob,slide,tsCache){
  if(!targetJob||!slide)return '';
  const base=`/studio/jobs/${targetJob.id}/media/`;
  const memCached=canvaCleanBgMemoryCache.get(`${targetJob.id}_${slide.index}`);
  if(slide._cleanBgDataUrl&&slide._cleanBgDataUrl.startsWith('data:image/'))return slide._cleanBgDataUrl;
  if(memCached)return memCached;
  if(slide.bg_file){
    return `${base}${slide.bg_file}?t=${tsCache}_${slide.sha256||''}`;
  }
  if(targetJob.kind==='image'){
    return `${base}original?t=${tsCache}`;
  }
  const frames=targetJob.evidence?.frames||[];
  if(frames.length){
    const targetTs=Number(slide.timestamp||0);
    let bestFrame=frames[0];
    let bestDiff=Math.abs(Number(bestFrame.timestamp||0)-targetTs);
    for(const fr of frames){
      const d=Math.abs(Number(fr.timestamp||0)-targetTs);
      if(d<bestDiff){bestDiff=d;bestFrame=fr;}
    }
    if(bestFrame?.file){
      return `${base}${bestFrame.file}?t=${tsCache}`;
    }
  }
  const fName=String(slide.file||'frame-0.jpg');
  if(/^frame-\d+\.jpg$/i.test(fName)||fName==='original'){
    return `${base}${fName}?t=${tsCache}`;
  }
  return `${base}frame-0.jpg?t=${tsCache}`;
}

function renderObjectFormattedDisplayHtml(rawText,pal){
  const safe=String(rawText||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const boxBg=pal?.hlBoxBg||'#facc15';
  const boxFg=pal?.hlBoxText||'#0f172a';
  const accFg=pal?.hlAccent||'#fde047';
  return safe
    .replace(/\[([^\]]+)\]/g,`<span class="canva-inline-box-hl" style="background:${boxBg};color:${boxFg};padding:0 0.22em;border-radius:0.16em;display:inline-block;">$1</span>`)
    .replace(/\*([^\*]+)\*/g,`<span class="canva-inline-color-hl" style="color:${accFg};">$1</span>`)
    .replace(/\r?\n/g,'<br>');
}

async function renderCanvaSlideObjectsToDataUrl(targetJob,slide,aspect='4:5',template='editorial_dark',fontKey='heavy_kr',s1W=0,s1C='#000000',s2W=0,s2C='#facc15',cleanImgElement=null){
  const W=1080;
  const H=(aspect==='1:1')?1080:1350;
  const canvas=document.createElement('canvas');
  canvas.width=W;
  canvas.height=H;
  const ctx=canvas.getContext('2d');
  const pal=CANVA_THEME_OBJECT_PALETTES[template]||CANVA_THEME_OBJECT_PALETTES.editorial_dark;

  // 1. Draw Clean Background Photo with cover crop + bg_transform pan/zoom
  ctx.fillStyle='#0b0f17';
  ctx.fillRect(0,0,W,H);
  let imgToDraw=cleanImgElement;
  if(!imgToDraw||!imgToDraw.complete||!imgToDraw.naturalWidth){
    const bgUrl=resolveCleanSlideBackgroundUrl(targetJob,slide,Date.now());
    imgToDraw=await new Promise(resolve=>{
      const im=new Image();
      im.crossOrigin='anonymous';
      im.onload=()=>resolve(im);
      im.onerror=()=>resolve(null);
      im.src=bgUrl;
    });
  }
  if(imgToDraw&&imgToDraw.naturalWidth>0&&imgToDraw.naturalHeight>0){
    const iw=imgToDraw.naturalWidth,ih=imgToDraw.naturalHeight;
    const bgT=slide.bg_transform||{scale:1,x:0,y:0};
    const userScale=Math.max(0.5,Math.min(3,Number(bgT.scale||1)));
    const baseScale=Math.max(W/iw,H/ih)*userScale;
    const dw=iw*baseScale,dh=ih*baseScale;
    const dx=(W-dw)/2+(Number(bgT.x||0)/100)*W;
    const dy=(H-dh)/2+(Number(bgT.y||0)/100)*H;
    ctx.save();
    ctx.drawImage(imgToDraw,dx,dy,dw,dh);
    ctx.restore();
  }

  // 2. Draw Theme Bottom Gradient Scrim (matching Image 1)
  const grad=ctx.createLinearGradient(0,Math.round(H*0.36),0,H);
  if(template==='clean_white'){
    grad.addColorStop(0,'rgba(255,255,255,0)');
    grad.addColorStop(0.45,'rgba(248,250,252,0.85)');
    grad.addColorStop(1,'rgba(241,245,249,0.98)');
  }else{
    grad.addColorStop(0,'rgba(10,12,18,0)');
    grad.addColorStop(0.42,'rgba(10,12,18,0.68)');
    grad.addColorStop(0.76,'rgba(8,10,15,0.92)');
    grad.addColorStop(1,'rgba(6,8,12,0.97)');
  }
  ctx.fillStyle=grad;
  ctx.fillRect(0,Math.round(H*0.36),W,H-Math.round(H*0.36));

  // 3. Draw Each Visible Object in slide.canva_objects
  const fCss=(CSS_FONT_MAP[fontKey]||CSS_FONT_MAP.heavy_kr).replace(/"/g,"'");
  const objs=Array.isArray(slide.canva_objects)?slide.canva_objects:[];

  const wrapCanvasTextLines=(rawLine,maxPx,fontSpec)=>{
    ctx.font=fontSpec;
    const cleanLine=String(rawLine||'').replace(/\[([^\]]+)\]/g,'$1').replace(/\*([^\*]+)\*/g,'$1');
    if(!maxPx||maxPx<=0||ctx.measureText(cleanLine).width<=maxPx)return [cleanLine];
    const words=cleanLine.split(/\s+/);
    if(words.length<=1){
      const chars=[...cleanLine];
      const out=[];let cur='';
      for(const ch of chars){
        if(cur&&ctx.measureText(cur+ch).width>maxPx){out.push(cur);cur=ch;}
        else cur+=ch;
      }
      if(cur)out.push(cur);
      return out;
    }
    const out=[];let cur='';
    for(const w of words){
      const cand=cur?`${cur} ${w}`:w;
      if(cur&&ctx.measureText(cand).width>maxPx){out.push(cur);cur=w;}
      else cur=cand;
    }
    if(cur)out.push(cur);
    return out;
  };

  const drawRoundedRect=(x,y,w,h,r)=>{
    const rad=Math.max(0,Math.min(r,w/2,h/2));
    ctx.beginPath();
    ctx.moveTo(x+rad,y);
    ctx.lineTo(x+w-rad,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+rad);
    ctx.lineTo(x+w,y+h-rad);
    ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);
    ctx.lineTo(x+rad,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-rad);
    ctx.lineTo(x,y+rad);
    ctx.quadraticCurveTo(x,y,x+rad,y);
    ctx.closePath();
  };

  for(const obj of objs){
    if(!obj||obj.visible===false)continue;
    const rawTxt=String(obj.text||'').trim();
    if(!rawTxt)continue;
    const fSize=Math.max(12,Math.min(180,Math.round(Number(obj.fontSize||32))));
    const weight=obj.bold===false?'600':'900';
    const fontSpec=`${weight} ${fSize}px ${fCss}, "Malgun Gothic", sans-serif`;
    ctx.font=fontSpec;
    ctx.textBaseline='top';

    const xPx=Math.round((Number(obj.x||0)/100)*W);
    const yPx=Math.round((Number(obj.y||0)/100)*H);
    const maxW=obj.widthPct&&Number(obj.widthPct)>5?Math.round((Number(obj.widthPct)/100)*W):0;
    const padX=Math.round(Number(obj.paddingX??(obj.bgEnabled?16:4)));
    const padY=Math.round(Number(obj.paddingY??(obj.bgEnabled?8:2)));
    const lineH=Math.round(fSize*Number(obj.lineHeight||(obj.kind==='title'?1.18:1.35)));

    const rawParagraphs=rawTxt.split(/\r?\n/);
    const lines=[];
    for(const p of rawParagraphs){
      const wrapped=wrapCanvasTextLines(p,maxW?Math.max(80,maxW-padX*2):0,fontSpec);
      lines.push(...wrapped);
    }
    let maxLineW=0;
    for(const ln of lines){
      const m=ctx.measureText(ln).width;
      if(m>maxLineW)maxLineW=m;
    }
    const boxW=maxW&&obj.kind==='counter'?maxW:Math.ceil(maxLineW+padX*2);
    const boxH=Math.ceil(lines.length*lineH-(lineH-fSize)+padY*2);

    ctx.save();
    if(obj.bgEnabled&&obj.bgColor){
      ctx.fillStyle=obj.bgColor;
      drawRoundedRect(xPx,yPx,boxW,boxH,Number(obj.borderRadius??10));
      ctx.fill();
    }

    for(let i=0;i<lines.length;i++){
      const ln=lines[i];
      const ly=yPx+padY+i*lineH;
      let lx=xPx+padX;
      if(obj.align==='center'){
        const lw=ctx.measureText(ln).width;
        lx=xPx+Math.round((boxW-lw)/2);
      }else if(obj.align==='right'){
        const lw=ctx.measureText(ln).width;
        lx=xPx+boxW-padX-Math.round(lw);
      }
      if(!obj.bgEnabled&&(s2W>0||s1W>0)){
        ctx.lineJoin='round';
        ctx.miterLimit=2;
        if(s2W>0){
          ctx.strokeStyle=s2C||'#facc15';
          ctx.lineWidth=(s1W+s2W)*2;
          ctx.strokeText(ln,lx,ly);
        }
        if(s1W>0){
          ctx.strokeStyle=s1C||'#000000';
          ctx.lineWidth=s1W*2;
          ctx.strokeText(ln,lx,ly);
        }
      }else if(!obj.bgEnabled){
        ctx.shadowColor='rgba(0,0,0,0.75)';
        ctx.shadowBlur=10;
        ctx.shadowOffsetY=3;
      }
      ctx.fillStyle=obj.color||'#ffffff';
      ctx.fillText(ln,lx,ly);
    }
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg',0.93);
}

function renderCarouselPreview(){
  renderCarouselIntelBar();
  const wrap=$('carousel-slides-wrap'),grid=$('carousel-slides-preview'),label=$('carousel-slides-label'),workbench=$('carousel-active-workbench');
  const globalDrawer=$('carousel-global-plan-drawer');
  const storyboardDock=$('carousel-storyboard-dock');
  if(!wrap||!grid)return;
  if(!grid.dataset.wheelBound){
    grid.dataset.wheelBound='1';
    grid.addEventListener('wheel',e=>{
      if(grid.scrollWidth<=grid.clientWidth+2)return;
      if(Math.abs(e.deltaY)>=Math.abs(e.deltaX)&&e.deltaY!==0){
        e.preventDefault();
        grid.scrollLeft+=e.deltaY;
      }
    },{passive:false});
  }
  if(storyboardDock&&workbench&&workbench.contains(storyboardDock))wrap.append(storyboardDock);
  if(globalDrawer&&workbench&&workbench.contains(globalDrawer))wrap.after(globalDrawer);
  grid.replaceChildren();
  if(workbench)workbench.replaceChildren();
  enforceSingleCardModeIfActive(job);
  const slides=job?.carousel?.slides||[];
  if(!job){wrap.hidden=true;return;}
  wrap.hidden=false;
  const tplLabel=carouselTemplateNames[job.carousel?.template||'editorial_dark']||'시네마 리뷰 다크';
  const base=`/studio/jobs/${job.id}/media/`;
  const tsCache=Math.floor((job.carousel?.updated_at||Date.now())*1000);
  const maxDur=Math.max(0.5,Number(job.media?.duration||5));

  const hasRealSlides=slides.length>0;
  let effectiveSlides=slides;
  if(!hasRealSlides){
    const countVal=Math.max(1,Math.min(10,Number($('carousel-count')?.value||5)));
    const story=buildEditorialStoryboardLines(countVal);
    const coverParts=String(story.cover||'').split('|').map(p=>p.trim());
    const initTitle=coverParts[0]||job.name||'여기를 클릭해 제목을 수정하세요';
    const initSub=coverParts[1]||'캔버스 위의 각 객체(배지·제목·별점·설명)를 마우스로 드래그해 이동하거나 클릭해 바로 수정하세요';
    const initBody=(story.bodySlides&&story.bodySlides[0])||story.cta||'';
    const fallbackFrameFile=job.kind==='image'?'original':(job.evidence?.frames?.[0]?.file||'frame-0.jpg');
    effectiveSlides=[{
      index:1,
      role:'cover',
      timestamp:Number(job.evidence?.frames?.[0]?.timestamp||0.5),
      title:initTitle,
      subtitle:initSub,
      body_text:initBody,
      text:[initTitle,initSub,initBody].filter(Boolean).join('\n'),
      badge:'main cover',
      template:job.carousel?.template||$('carousel-template')?.value||'editorial_dark',
      font_family:job.carousel?.font_family||$('carousel-font')?.value||'heavy_kr',
      file:fallbackFrameFile,
      bg_file:fallbackFrameFile,
      _isVirtualPreview:true
    }];
  }
  if(globalDrawer)globalDrawer.open=false;
  if(storyboardDock)storyboardDock.hidden=false;
  if(!effectiveSlides.some(s=>Number(s.index)===activeCarouselSlideIndex)){
    activeCarouselSlideIndex=Number(effectiveSlides[0]?.index||1);
  }
  const activeSlide=effectiveSlides.find(s=>Number(s.index)===activeCarouselSlideIndex)||effectiveSlides[0];
  const isSingleCard=(effectiveSlides.length===1&&Number($('carousel-count')?.value||0)===1);
  if(label)label.textContent=!hasRealSlides
    ?`하단 슬라이드 스토리보드 (가로 스크롤 · 중앙 카드에서 객체를 이동·수정한 뒤 [이미지 저장] 클릭)`
    :(isSingleCard
      ?`단독 카드 스토리보드 (1장 · ${job.carousel?.aspect||'4:5'} · 테마: ${tplLabel.split(' (')[0]})`
      :`하단 슬라이드 스토리보드 (${effectiveSlides.length}장 · 마우스 휠로 좌우 이동 · ${job.carousel?.aspect||'4:5'} · 기본 테마: ${tplLabel.split(' (')[0]})`);

  // 1. Render Bottom Horizontal Storyboard Filmstrip Deck
  for(const s of effectiveSlides){
    const sRole=s.role||(s.index===1?'cover':(s.index===effectiveSlides.length&&effectiveSlides.length>=3?'cta':'body'));
    const isSelected=(Number(s.index)===Number(activeSlide?.index));
    const fig=document.createElement('figure');
    fig.className='carousel-storyboard-card'+(sRole==='cover'?' is-cover-slide':'')+(sRole==='cta'?' is-cta-slide':'')+(isSelected?' is-selected-slide':'');
    fig.dataset.slideIndex=String(s.index);
    fig.onclick=()=>{
      activeCarouselSlideIndex=s.index;
      renderCarouselPreview();
    };

    const headRow=document.createElement('div');
    headRow.className='storyboard-card-head';
    const roleShort=isSingleCard?'단독 카드(1장)':(sRole==='cover'?'표지(90%훅)':(sRole==='cta'?'마지막장':'본문'));
    const roleBadgeEl=text('span',`0${s.index} ${roleShort}`);
    roleBadgeEl.className=`storyboard-role-badge role-badge-${sRole}`;
    const sourceTag=s.custom_image?'내 사진':`${Number(s.timestamp||0).toFixed(1)}s`;
    const editPill=text('span',isSelected?'편집 중':sourceTag);
    editPill.className='storyboard-select-pill'+(isSelected?' active':'');
    headRow.append(roleBadgeEl,editPill);

    const thumbWrap=document.createElement('div');
    thumbWrap.className='storyboard-thumb-wrap';
    const img=document.createElement('img');
    img.className='storyboard-thumb-img';
    img.src=s._compositedThumbDataUrl||`${base}${s.file}?t=${tsCache}_${s.sha256||''}`;
    img.alt=`슬라이드 ${s.index}`;
    thumbWrap.append(img);

    const tier=splitSlideThreeTierText(s);
    const captionSummary=document.createElement('div');
    captionSummary.className='storyboard-card-summary';
    const sumHead=text('strong',(tier.title||tier.subtitle||tier.bodyText||'문구 없음').slice(0,24));
    captionSummary.append(sumHead);

    fig.append(headRow,thumbWrap,captionSummary);
    grid.append(fig);
  }

  if(effectiveSlides.length<10){
    const addCard=document.createElement('button');
    addCard.type='button';
    addCard.className='carousel-storyboard-add-card';
    addCard.title='새 본문 슬라이드 추가 (또는 이미지 파일로 새 슬라이드 추가)';
    const plusIcon=text('span','+');
    plusIcon.className='storyboard-add-plus';
    const addTxt=text('strong',hasRealSlides?'슬라이드 추가':'세트 즉시 생성');
    const addSub=text('small',hasRealSlides?'현재 장면 / 사진 추가':'클릭하여 카드 합성');
    addCard.append(plusIcon,addTxt,addSub);
    addCard.onclick=()=>hasRealSlides?$('btn-carousel-add-slide')?.click():$('btn-generate-carousel')?.click();
    grid.append(addCard);
  }

  // 2. Render Center True Canva/MiriCanvas Multi-Object Stage + Right Inspector
  if(workbench&&activeSlide){
    const activeRole=activeSlide.role||(activeSlide.index===1?'cover':(activeSlide.index===effectiveSlides.length&&effectiveSlides.length>=3?'cta':'body'));
    const activeTpl=activeSlide.template||job.carousel?.template||'editorial_dark';
    const activeAspect=job.carousel?.aspect||$('carousel-ratio')?.value||'4:5';
    const pal=CANVA_THEME_OBJECT_PALETTES[activeTpl]||CANVA_THEME_OBJECT_PALETTES.editorial_dark;
    const canvaObjects=ensureCanvaObjectsForSlide(job,activeSlide,effectiveSlides.length,activeRole,activeTpl);
    if(!canvaObjects.some(o=>o.id===selectedCanvaObjectId&&o.visible!==false)){
      selectedCanvaObjectId=(canvaObjects.find(o=>o.kind==='title')||canvaObjects[0])?.id||'obj_title';
    }

    const wbGrid=document.createElement('div');
    wbGrid.className='carousel-wb-grid carousel-3zone-grid';

    // === CENTER COLUMN: CANVA MULTI-OBJECT INTERACTIVE STAGE ===
    const wbPreviewCol=document.createElement('div');
    wbPreviewCol.className='carousel-wb-preview-col';
    const wbPreviewZoneTag=document.createElement('div');
    wbPreviewZoneTag.className='wb-zone-kicker-bar';
    wbPreviewZoneTag.innerHTML='<span class="wb-zone-pill">가운데 · Canva/미리캔버스식 객체 레이아웃 캔버스 (모든 요소 개별 드래그 이동 · 크기 조절 · 더블클릭 수정)</span>';
    const wbPreviewHeader=document.createElement('div');
    wbPreviewHeader.className='carousel-wb-preview-head';
    const rolePillText=isSingleCard
      ?'01 단독 카드 (1장)'
      :(activeRole==='cover'?'01 첫장 표지 (90% 후킹)':(activeRole==='cta'?`0${activeSlide.index} 마지막장 요약·CTA`:`0${activeSlide.index} 본문 슬라이드`));
    const rolePill=text('span',rolePillText);
    rolePill.className=`wb-role-pill role-${activeRole}`;

    const liveSyncBadge=text('span','모든 객체 자유 이동·수정 가능');
    liveSyncBadge.id='wb-live-sync-badge';
    liveSyncBadge.className='wb-live-sync-badge';

    const slideNavWrap=document.createElement('div');
    slideNavWrap.className='wb-slide-nav-btns';
    const btnPrevSlide=text('button','이전');btnPrevSlide.type='button';btnPrevSlide.className='secondary btn-xs';
    btnPrevSlide.disabled=activeSlide.index<=1;
    btnPrevSlide.onclick=()=>{activeCarouselSlideIndex=Math.max(1,activeSlide.index-1);renderCarouselPreview();};
    const slideIdxLabel=text('strong',`0${activeSlide.index} / 0${effectiveSlides.length}`);
    slideIdxLabel.style.cssText='font-size:12px;white-space:nowrap;';
    const btnNextSlide=text('button','다음');btnNextSlide.type='button';btnNextSlide.className='secondary btn-xs';
    btnNextSlide.disabled=activeSlide.index>=effectiveSlides.length;
    btnNextSlide.onclick=()=>{activeCarouselSlideIndex=Math.min(effectiveSlides.length,activeSlide.index+1);renderCarouselPreview();};
    slideNavWrap.append(liveSyncBadge,btnPrevSlide,slideIdxLabel,btnNextSlide);
    wbPreviewHeader.append(rolePill,slideNavWrap);

    // Canva Floating Object Toolbar above the canvas
    const canvaToolbar=document.createElement('div');
    canvaToolbar.className='canva-canvas-floating-toolbar';

    const wbStage=document.createElement('div');
    wbStage.className='carousel-wb-stage wb-canvas-frame wb-large-center-frame canva-direct-stage canva-multi-object-stage';
    wbStage.style.aspectRatio=(activeAspect==='1:1')?'1 / 1':'4 / 5';
    wbStage.title='각 요소(배지, 제목, 별점, 설명, 번호)를 클릭·드래그하여 원하는 위치로 옮기거나 모서리 핸들로 크기를 조절하세요.';

    // 1. Clean Un-baked Background Image (ZERO ghost baked text!)
    const bigImg=document.createElement('img');
    bigImg.id='wb-active-slide-big-img';
    bigImg.className='canva-clean-bg-img';
    bigImg.crossOrigin='anonymous';
    bigImg.src=resolveCleanSlideBackgroundUrl(job,activeSlide,tsCache);
    bigImg.alt=`선택된 슬라이드 #${activeSlide.index} 깨끗한 배경`;
    const applyBgTransformStyle=()=>{
      const bgT=activeSlide.bg_transform||{scale:1,x:0,y:0};
      bigImg.style.transform=`translate(${Number(bgT.x||0)}%, ${Number(bgT.y||0)}%) scale(${Number(bgT.scale||1)})`;
    };
    applyBgTransformStyle();

    // If this is a video job and we don't have a custom image or exact bg_file yet, extract exact crisp frame from left video if available
    if(job.kind!=='image'&&!activeSlide.custom_image&&!activeSlide._cleanBgDataUrl&&!canvaCleanBgMemoryCache.has(`${job.id}_${activeSlide.index}`)){
      bigImg.addEventListener('error',()=>{
        const fallbackFr=job.evidence?.frames?.[0]?.file||'frame-0.jpg';
        if(!bigImg.src.includes(fallbackFr))bigImg.src=`${base}${fallbackFr}?t=${tsCache}`;
      },{once:true});
    }

    // 2. Theme Gradient Scrim Layer (matches Image 1's clean dark bottom gradient)
    const scrimLayer=document.createElement('div');
    scrimLayer.className='canva-stage-scrim';
    scrimLayer.style.background=pal.scrim;

    // 3. Magnetic Alignment Guide Lines (hidden until dragging near center/left margin)
    const snapLineX=document.createElement('div');
    snapLineX.className='canva-snap-line canva-snap-line-x';
    snapLineX.hidden=true;
    const snapLineY=document.createElement('div');
    snapLineY.className='canva-snap-line canva-snap-line-y';
    snapLineY.hidden=true;

    // 4. Interactive Object Layer (`#wb-live-typing-overlay` container for compatibility)
    const liveOverlay=document.createElement('div');
    liveOverlay.id='wb-live-typing-overlay';
    liveOverlay.className='wb-live-typing-overlay canva-objects-layer';
    liveOverlay.hidden=false;

    wbStage.append(bigImg,scrimLayer,snapLineX,snapLineY,liveOverlay);

    // Hidden compatibility inputs so all existing helper functions & tests work seamlessly
    const {title:initHead,subtitle:initSubtitle,bodyText:initBodyText}=splitSlideThreeTierText(activeSlide);
    const initBadge=activeSlide.badge||'main cover';
    const headInput=document.createElement('input');headInput.type='hidden';headInput.id='wb-active-head-input';headInput.value=initHead;
    const subtitleInput=document.createElement('input');subtitleInput.type='hidden';subtitleInput.id='wb-active-subtitle-input';subtitleInput.value=initSubtitle;
    const bodyTextarea=document.createElement('textarea');bodyTextarea.id='wb-active-body-input';bodyTextarea.hidden=true;bodyTextarea.value=initBodyText;
    const badgeInput=document.createElement('input');badgeInput.type='hidden';badgeInput.id='wb-active-badge-input';badgeInput.value=initBadge;
    const legacySubHidden=document.createElement('textarea');legacySubHidden.id='wb-active-sub-input';legacySubHidden.hidden=true;legacySubHidden.value=[initSubtitle,initBodyText].filter(Boolean).join('\n');

    // Forward declare style controls & selected object inspector controls
    let roleSelect,tplSelect,fontSelectEl,s1Num,s1Color,s2Num,s2Color;
    let objLabelPill,objFontSizeRange,objFontSizeNum,objColorInput,objBgToggle,objBgColorInput,objAlignBtns=[];
    const domNodeByObjId=new Map();
    const textElByObjId=new Map();

    const getSelectedObject=()=>{
      return canvaObjects.find(o=>o.id===selectedCanvaObjectId)||canvaObjects[0]||null;
    };

    const syncCanvaObjectsToSlideFields=()=>{
      const badgeObj=canvaObjects.find(o=>o.kind==='badge'&&o.visible!==false);
      const titleObj=canvaObjects.find(o=>o.kind==='title'&&o.visible!==false);
      const subObj=canvaObjects.find(o=>o.kind==='subtitle'&&o.visible!==false);
      const extraObjs=canvaObjects.filter(o=>o.kind==='custom'&&o.visible!==false);

      const bVal=String(badgeObj?.text||'').replace(/\r?\n/g,' ').trim();
      const tVal=String(titleObj?.text||'').trim();
      const sVal=String(subObj?.text||'').trim();
      const bodyVal=extraObjs.map(o=>String(o.text||'').trim()).filter(Boolean).join('\n');

      badgeInput.value=bVal;
      headInput.value=tVal;
      subtitleInput.value=sVal;
      bodyTextarea.value=bodyVal;
      legacySubHidden.value=[sVal,bodyVal].filter(Boolean).join('\n');

      activeSlide.badge=bVal;
      activeSlide.title=tVal;
      activeSlide.subtitle=sVal;
      activeSlide.body_text=bodyVal;
      activeSlide.text=[tVal,sVal,bodyVal].filter(Boolean).join('\n');
      saveCanvaSlideLocalState(job.id,activeSlide.index,canvaObjects,activeSlide.bg_transform,activeSlide._cleanBgDataUrl);
      return {bVal,tVal,sVal,bodyVal};
    };

    const refreshSelectedObjectInspectorUI=()=>{
      const selObj=getSelectedObject();
      if(!selObj)return;
      if(objLabelPill)objLabelPill.textContent=selObj.label||selObj.kind||'텍스트 객체';
      if(objFontSizeRange)objFontSizeRange.value=String(Math.round(Number(selObj.fontSize||32)));
      if(objFontSizeNum)objFontSizeNum.value=String(Math.round(Number(selObj.fontSize||32)));
      if(objColorInput&&/^#[0-9a-fA-F]{6}$/.test(String(selObj.color||''))){
        objColorInput.value=selObj.color;
      }
      if(objBgToggle)objBgToggle.checked=Boolean(selObj.bgEnabled);
      if(objBgColorInput&&/^#[0-9a-fA-F]{6}$/.test(String(selObj.bgColor||''))){
        objBgColorInput.value=selObj.bgColor;
      }
      objAlignBtns.forEach(b=>b.classList.toggle('active',b.dataset.align===(selObj.align||'left')));
    };

    const selectCanvaObject=(objId,{focusText=false}={})=>{
      selectedCanvaObjectId=objId;
      for(const [id,node] of domNodeByObjId.entries()){
        node.classList.toggle('is-selected-object',id===objId);
        if(id!==objId){
          node.classList.remove('is-editing-text');
          const tEl=textElByObjId.get(id);
          if(tEl){
            tEl.contentEditable='false';
            const oData=canvaObjects.find(x=>x.id===id);
            if(oData)tEl.innerHTML=renderObjectFormattedDisplayHtml(oData.text,pal);
          }
        }
      }
      refreshSelectedObjectInspectorUI();
      if(focusText){
        const node=domNodeByObjId.get(objId);
        const tEl=textElByObjId.get(objId);
        const oData=canvaObjects.find(x=>x.id===objId);
        if(node&&tEl&&oData){
          node.classList.add('is-editing-text');
          tEl.contentEditable='true';
          tEl.textContent=oData.text||'';
          tEl.focus();
        }
      }
    };

    const applyObjectVisualStyleToDom=(obj,node,tEl)=>{
      const stageRect=wbStage.getBoundingClientRect();
      const stageW=stageRect.width||460;
      const scaleRatio=stageW/1080;
      const curFontKey=fontSelectEl?.value||activeSlide.font_family||job?.carousel?.font_family||'heavy_kr';
      const fCss=(CSS_FONT_MAP[curFontKey]||CSS_FONT_MAP.heavy_kr).replace(/"/g,"'");
      const s1W=Number(s1Num?.value||0);
      const s1C=s1Color?.value||'#000000';
      const s2W=Number(s2Num?.value||0);
      const s2C=s2Color?.value||'#facc15';

      node.style.left=`${Number(obj.x||0)}%`;
      node.style.top=`${Number(obj.y||0)}%`;
      if(obj.widthPct&&Number(obj.widthPct)>5){
        node.style.width=`${Number(obj.widthPct)}%`;
      }else{
        node.style.width='auto';
        node.style.maxWidth='90%';
      }
      node.hidden=(obj.visible===false);

      const scaledFontPx=Math.max(10,Number(obj.fontSize||32)*scaleRatio);
      const padX=Math.max(2,Number(obj.paddingX??(obj.bgEnabled?16:4))*scaleRatio);
      const padY=Math.max(1,Number(obj.paddingY??(obj.bgEnabled?8:2))*scaleRatio);
      const radPx=Number(obj.borderRadius??10)>=900?999:Math.max(2,Number(obj.borderRadius??10)*scaleRatio);

      tEl.style.fontFamily=fCss;
      tEl.style.fontSize=`${scaledFontPx.toFixed(1)}px`;
      tEl.style.fontWeight=obj.bold===false?'600':'900';
      tEl.style.lineHeight=String(obj.lineHeight||(obj.kind==='title'?1.18:1.35));
      tEl.style.color=obj.color||'#ffffff';
      tEl.style.textAlign=obj.align||'left';
      tEl.style.padding=`${padY.toFixed(1)}px ${padX.toFixed(1)}px`;
      tEl.style.borderRadius=`${radPx}px`;
      if(obj.bgEnabled&&obj.bgColor){
        tEl.style.background=obj.bgColor;
        tEl.style.textShadow='none';
      }else{
        tEl.style.background='transparent';
        tEl.style.textShadow=buildLiveDoubleStrokeTextShadow(s1W,s1C,s2W,s2C,stageW,'0 2px 8px rgba(0,0,0,0.82)');
      }
    };

    const renderAllCanvaObjectNodes=()=>{
      liveOverlay.replaceChildren();
      domNodeByObjId.clear();
      textElByObjId.clear();

      for(const obj of canvaObjects){
        if(obj.visible===false)continue;
        const node=document.createElement('div');
        node.className=`canva-object-node canva-obj-kind-${obj.kind||'custom'}`+(obj.id===selectedCanvaObjectId?' is-selected-object':'');
        node.dataset.objectId=obj.id;
        node.dataset.objectKind=obj.kind||'custom';
        if(obj.kind==='badge')node.id='canva-edit-badge-wrap';
        if(obj.kind==='title')node.id='canva-edit-title-wrap';
        if(obj.kind==='subtitle')node.id='canva-edit-subtitle-wrap';

        const tEl=document.createElement('div');
        tEl.className='canva-object-text canva-editable-field';
        if(obj.kind==='badge')tEl.id='canva-edit-badge';
        else if(obj.kind==='title')tEl.id='canva-edit-title';
        else if(obj.kind==='subtitle')tEl.id='canva-edit-subtitle';
        else if(obj.kind==='stars')tEl.id='canva-edit-stars';
        else if(obj.kind==='counter')tEl.id='canva-edit-counter';
        tEl.contentEditable='false';
        tEl.spellcheck=false;
        tEl.innerHTML=renderObjectFormattedDisplayHtml(obj.text,pal);

        // Resize handles (4 corners for font scaling + 2 sides for width wrapping) + floating delete button
        const handles=['nw','ne','sw','se','w','e'];
        for(const dir of handles){
          const hEl=document.createElement('span');
          hEl.className=`canva-resize-handle handle-${dir}`;
          hEl.dataset.handleDir=dir;
          hEl.title=dir.length===2?'모서리 드래그: 글자 크기 비율 조절':'양옆 드래그: 텍스트 가로 폭 조절';
          hEl.addEventListener('pointerdown',e=>{
            e.preventDefault();
            e.stopPropagation();
            selectCanvaObject(obj.id,{focusText:false});
            const stageRect=wbStage.getBoundingClientRect();
            const startX=e.clientX,startY=e.clientY;
            const startFontSize=Number(obj.fontSize||32);
            const startWidthPct=Number(obj.widthPct||Math.round((node.getBoundingClientRect().width/Math.max(1,stageRect.width))*100));
            const startObjX=Number(obj.x||0);
            hEl.setPointerCapture?.(e.pointerId);
            const onMove=ev=>{
              const dx=ev.clientX-startX;
              const dy=ev.clientY-startY;
              if(dir==='e'){
                obj.widthPct=Math.max(18,Math.min(96,startWidthPct+(dx/Math.max(1,stageRect.width))*100));
              }else if(dir==='w'){
                const deltaPct=(dx/Math.max(1,stageRect.width))*100;
                obj.x=Math.max(0,Math.min(85,startObjX+deltaPct));
                obj.widthPct=Math.max(18,Math.min(96,startWidthPct-deltaPct));
              }else{
                const sign=(dir==='se'||dir==='ne')?1:-1;
                const scaleDelta=((dx*sign)+(dy*(dir.startsWith('s')?1:-1)))*0.18;
                obj.fontSize=Math.max(14,Math.min(140,Math.round(startFontSize+scaleDelta)));
              }
              applyObjectVisualStyleToDom(obj,node,tEl);
              refreshSelectedObjectInspectorUI();
            };
            const onUp=()=>{
              hEl.removeEventListener('pointermove',onMove);
              hEl.removeEventListener('pointerup',onUp);
              scheduleRealtimeSlideSync({},220);
            };
            hEl.addEventListener('pointermove',onMove);
            hEl.addEventListener('pointerup',onUp);
          });
          node.append(hEl);
        }

        // Delete button (`×`) on selected object
        const delBtn=document.createElement('button');
        delBtn.type='button';
        delBtn.className='canva-object-delete-btn';
        delBtn.textContent='×';
        delBtn.title='이 객체 숨기기/삭제 (Delete)';
        delBtn.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          obj.visible=false;
          renderAllCanvaObjectNodes();
          scheduleRealtimeSlideSync({},180);
        };

        // Pointer drag to move object freely across the canvas (`x`, `y` in %)
        let isDraggingObj=false,movedDuringPress=false,dragStartClientX=0,dragStartClientY=0,objStartX=0,objStartY=0;
        node.addEventListener('pointerdown',e=>{
          if(e.target===delBtn||e.target.classList?.contains('canva-resize-handle'))return;
          if(node.classList.contains('is-editing-text'))return;
          e.preventDefault();
          e.stopPropagation();
          const wasAlreadySelected=(selectedCanvaObjectId===obj.id);
          selectCanvaObject(obj.id,{focusText:false});
          isDraggingObj=true;
          movedDuringPress=false;
          dragStartClientX=e.clientX;
          dragStartClientY=e.clientY;
          objStartX=Number(obj.x||0);
          objStartY=Number(obj.y||0);
          node.classList.add('is-dragging-object');
          node.dataset.wasSelected=wasAlreadySelected?'1':'0';
          node.setPointerCapture?.(e.pointerId);
        });
        node.addEventListener('pointermove',e=>{
          if(!isDraggingObj)return;
          const dx=e.clientX-dragStartClientX;
          const dy=e.clientY-dragStartClientY;
          if(Math.abs(dx)>3||Math.abs(dy)>3)movedDuringPress=true;
          if(!movedDuringPress)return;
          const stageRect=wbStage.getBoundingClientRect();
          let nextX=objStartX+(dx/Math.max(1,stageRect.width))*100;
          let nextY=objStartY+(dy/Math.max(1,stageRect.height))*100;
          nextX=Math.max(-5,Math.min(94,nextX));
          nextY=Math.max(1,Math.min(94,nextY));

          // Magnetic snap to left editorial margin (6.8%) or horizontal center
          if(Math.abs(nextX-6.8)<1.4){
            nextX=6.8;
            snapLineX.style.left='6.8%';
            snapLineX.hidden=false;
          }else if(Math.abs(nextX-50)<1.4){
            nextX=50;
            snapLineX.style.left='50%';
            snapLineX.hidden=false;
          }else{
            snapLineX.hidden=true;
          }
          if(Math.abs(nextY-50)<1.4){
            nextY=50;
            snapLineY.style.top='50%';
            snapLineY.hidden=false;
          }else{
            snapLineY.hidden=true;
          }

          obj.x=Number(nextX.toFixed(2));
          obj.y=Number(nextY.toFixed(2));
          node.style.left=`${obj.x}%`;
          node.style.top=`${obj.y}%`;
        });
        const finishObjPointer=e=>{
          if(!isDraggingObj)return;
          isDraggingObj=false;
          node.classList.remove('is-dragging-object');
          snapLineX.hidden=true;
          snapLineY.hidden=true;
          try{node.releasePointerCapture?.(e.pointerId);}catch{}
          if(movedDuringPress){
            scheduleRealtimeSlideSync({},220);
          }else if(node.dataset.wasSelected==='1'){
            // Clicking an already-selected object enters inline text editing immediately!
            selectCanvaObject(obj.id,{focusText:true});
          }
        };
        node.addEventListener('pointerup',finishObjPointer);
        node.addEventListener('pointercancel',finishObjPointer);

        // Double-click always enters inline text editing immediately
        node.addEventListener('dblclick',e=>{
          e.preventDefault();
          e.stopPropagation();
          selectCanvaObject(obj.id,{focusText:true});
        });

        // Live text editing synchronization
        tEl.addEventListener('input',()=>{
          obj.text=tEl.innerText||'';
          scheduleRealtimeSlideSync({},420);
        });
        tEl.addEventListener('blur',()=>{
          obj.text=(tEl.innerText||'').trim();
          node.classList.remove('is-editing-text');
          tEl.contentEditable='false';
          tEl.innerHTML=renderObjectFormattedDisplayHtml(obj.text,pal);
          syncCanvaObjectsToSlideFields();
        });

        node.append(tEl,delBtn);
        liveOverlay.append(node);
        domNodeByObjId.set(obj.id,node);
        textElByObjId.set(obj.id,tEl);
        applyObjectVisualStyleToDom(obj,node,tEl);
      }
    };

    // Clicking empty stage background deselects active text editing or pans background photo if dragged
    let isPanningBg=false,bgStartClientX=0,bgStartClientY=0,bgOrigX=0,bgOrigY=0;
    wbStage.addEventListener('pointerdown',e=>{
      if(e.target!==wbStage&&e.target!==bigImg&&e.target!==scrimLayer&&e.target!==liveOverlay)return;
      // Deselect editing state
      for(const [id,node] of domNodeByObjId.entries()){
        node.classList.remove('is-editing-text');
        const tEl=textElByObjId.get(id);
        const oData=canvaObjects.find(x=>x.id===id);
        if(tEl&&oData){
          tEl.contentEditable='false';
          tEl.innerHTML=renderObjectFormattedDisplayHtml(oData.text,pal);
        }
      }
      isPanningBg=true;
      bgStartClientX=e.clientX;
      bgStartClientY=e.clientY;
      bgOrigX=Number(activeSlide.bg_transform?.x||0);
      bgOrigY=Number(activeSlide.bg_transform?.y||0);
    });
    wbStage.addEventListener('pointermove',e=>{
      if(!isPanningBg)return;
      const dx=e.clientX-bgStartClientX;
      const dy=e.clientY-bgStartClientY;
      if(Math.abs(dx)<4&&Math.abs(dy)<4)return;
      const stageRect=wbStage.getBoundingClientRect();
      activeSlide.bg_transform=activeSlide.bg_transform||{scale:1,x:0,y:0};
      activeSlide.bg_transform.x=Math.max(-40,Math.min(40,Number((bgOrigX+(dx/Math.max(1,stageRect.width))*100).toFixed(1))));
      activeSlide.bg_transform.y=Math.max(-40,Math.min(40,Number((bgOrigY+(dy/Math.max(1,stageRect.height))*100).toFixed(1))));
      applyBgTransformStyle();
    });
    wbStage.addEventListener('pointerup',()=>{
      if(!isPanningBg)return;
      isPanningBg=false;
      saveCanvaSlideLocalState(job.id,activeSlide.index,canvaObjects,activeSlide.bg_transform,activeSlide._cleanBgDataUrl);
    });

    // Support Drag-and-Drop image onto the preview stage
    wbStage.addEventListener('dragover',e=>{e.preventDefault();wbStage.classList.add('drag-over');});
    wbStage.addEventListener('dragleave',()=>wbStage.classList.remove('drag-over'));
    wbStage.addEventListener('drop',async e=>{
      e.preventDefault();
      wbStage.classList.remove('drag-over');
      const f=e.dataTransfer?.files?.[0];
      if(!f)return;
      try{
        const dataUrl=await readImageFileAsDataUrl(f);
        activeSlide._cleanBgDataUrl=dataUrl;
        canvaCleanBgMemoryCache.set(`${job.id}_${activeSlide.index}`,dataUrl);
        bigImg.src=dataUrl;
        await applyActiveSlideUpdate({clean_bg_data_url:dataUrl},true);
      }catch(err){
        message(err.message,true);
      }
    });

    const composeThreeTierText=()=>{
      const {tVal,sVal,bodyVal}=syncCanvaObjectsToSlideFields();
      return [tVal,sVal,bodyVal].filter(Boolean).join('\n');
    };

    const buildSlidePayload=(extra={})=>{
      const {bVal,tVal,sVal,bodyVal}=syncCanvaObjectsToSlideFields();
      return {
        index:activeSlide.index,
        slide_total:effectiveSlides.length,
        timestamp:extra.timestamp!==undefined?extra.timestamp:activeSlide.timestamp,
        title:extra.title!==undefined?extra.title:tVal,
        subtitle:extra.subtitle!==undefined?extra.subtitle:sVal,
        body_text:extra.body_text!==undefined?extra.body_text:bodyVal,
        text:extra.text!==undefined?extra.text:[tVal,sVal,bodyVal].filter(Boolean).join('\n'),
        badge:extra.badge!==undefined?extra.badge:bVal,
        role:extra.role!==undefined?extra.role:(roleSelect?.value||activeRole),
        template:extra.template!==undefined?extra.template:(tplSelect?.value||activeTpl),
        overlay_position:extra.overlay_position||activeSlide.overlay_position||($('carousel-text-pos')?.value||'bottom'),
        font_family:extra.font_family!==undefined?extra.font_family:(fontSelectEl?.value||'heavy_kr'),
        stroke_width:extra.stroke_width!==undefined?extra.stroke_width:Number(s1Num?.value||0),
        stroke_color:extra.stroke_color!==undefined?extra.stroke_color:(s1Color?.value||'#000000'),
        double_stroke_width:extra.double_stroke_width!==undefined?extra.double_stroke_width:Number(s2Num?.value||0),
        double_stroke_color:extra.double_stroke_color!==undefined?extra.double_stroke_color:(s2Color?.value||'#facc15'),
        canva_objects:canvaObjects,
        bg_transform:activeSlide.bg_transform||{scale:1,x:0,y:0},
        ...(extra.rendered_card_data_url?{rendered_card_data_url:extra.rendered_card_data_url}:{}),
        ...(extra.image_data_url?{image_data_url:extra.image_data_url}:{}),
        ...(extra.erase_mode?{erase_mode:extra.erase_mode}:{}),
        ...(extra.clear_custom_image?{clear_custom_image:true}:{}),
        ...(extra.hook_formula?{hook_formula:extra.hook_formula}:{})
      };
    };

    const updateCanvaLiveVisualStyle=(keepStatusLabel=false)=>{
      const {tVal,sVal,bodyVal}=syncCanvaObjectsToSlideFields();
      for(const obj of canvaObjects){
        const node=domNodeByObjId.get(obj.id);
        const tEl=textElByObjId.get(obj.id);
        if(node&&tEl){
          applyObjectVisualStyleToDom(obj,node,tEl);
          if(!node.classList.contains('is-editing-text')){
            tEl.innerHTML=renderObjectFormattedDisplayHtml(obj.text,pal);
          }
        }
      }
      const sumCard=grid.querySelector(`.carousel-storyboard-card[data-slide-index="${activeSlide.index}"] .storyboard-card-summary strong`);
      if(sumCard)sumCard.textContent=(tVal||sVal||bodyVal||'문구 없음').slice(0,24);
      if(!keepStatusLabel&&liveSyncBadge){
        liveSyncBadge.textContent='실시간 객체 편집 중 (자동 합성)';
        liveSyncBadge.classList.add('syncing');
      }
    };

    const runSilentSlideUpdate=async(extra={},showSavedToast=false)=>{
      const targetJobId=job?.id;
      if(!targetJobId)return;
      if(liveSyncBadge){
        liveSyncBadge.textContent='고해상도 카드 합성 저장 중…';
        liveSyncBadge.classList.add('syncing');
      }
      carouselSilentInflight=true;
      try{
        if(!job?.carousel?.slides?.length){
          const reqCount=Math.max(1,Math.min(10,Number($('carousel-count')?.value||1)));
          if(reqCount===1)singleCardModeOverrideJobId=targetJobId;
          const genJob=await api(`jobs/${targetJobId}/carousel-generate`,{
            count:reqCount,
            aspect:$('carousel-ratio')?.value||'4:5',
            erase_mode:$('carousel-erase-mode')?.value||'cover_box',
            template:tplSelect?.value||activeTpl||'editorial_dark',
            cover_title:headInput.value||'핵심 포인트',
            font_family:fontSelectEl?.value||'heavy_kr'
          });
          enforceSingleCardModeIfActive(genJob);
          job=genJob;
        }
        // Render exact 1080x1350 WYSIWYG composite from our Canva objects + clean background!
        const curAspect=job.carousel?.aspect||$('carousel-ratio')?.value||'4:5';
        const curTpl=extra.template||tplSelect?.value||activeTpl||'editorial_dark';
        const curFont=extra.font_family||fontSelectEl?.value||activeSlide.font_family||'heavy_kr';
        const compositedDataUrl=await renderCanvaSlideObjectsToDataUrl(
          job,
          activeSlide,
          curAspect,
          curTpl,
          curFont,
          Number(s1Num?.value||0),
          s1Color?.value||'#000000',
          Number(s2Num?.value||0),
          s2Color?.value||'#facc15',
          bigImg
        );
        activeSlide._compositedThumbDataUrl=compositedDataUrl;
        const thumbImg=grid.querySelector(`.carousel-storyboard-card[data-slide-index="${activeSlide.index}"] .storyboard-thumb-img`);
        if(thumbImg&&compositedDataUrl)thumbImg.src=compositedDataUrl;

        const payload=buildSlidePayload({
          ...extra,
          rendered_card_data_url:compositedDataUrl,
          // Also support pre-restart running port 5006 servers by passing composited image with empty text overlay if no raw image replacement was requested:
          ...(extra.image_data_url?{}:{image_data_url:compositedDataUrl,erase_mode:'keep',text:''})
        });
        const nextJob=await api(`jobs/${targetJobId}/carousel-slide-update`,payload);
        if(job?.id!==targetJobId)return;
        enforceSingleCardModeIfActive(nextJob);
        job=nextJob;
        const updatedSlide=(job.carousel?.slides||[]).find(s=>Number(s.index)===Number(payload.index));
        if(updatedSlide){
          const preservedObjs=canvaObjects;
          const preservedBgT=activeSlide.bg_transform;
          const preservedCleanBg=activeSlide._cleanBgDataUrl;
          Object.assign(activeSlide,updatedSlide);
          activeSlide.canva_objects=preservedObjs;
          activeSlide.bg_transform=preservedBgT;
          if(preservedCleanBg)activeSlide._cleanBgDataUrl=preservedCleanBg;
          activeSlide._compositedThumbDataUrl=compositedDataUrl;
          delete activeSlide._isVirtualPreview;
          saveCanvaSlideLocalState(job.id,activeSlide.index,canvaObjects,activeSlide.bg_transform,activeSlide._cleanBgDataUrl);
          if(liveSyncBadge){
            liveSyncBadge.textContent='캔버스 레이아웃 저장 완료';
            liveSyncBadge.classList.remove('syncing');
          }
          if(showSavedToast){
            message(`슬라이드 #${updatedSlide.index} Canva 객체 레이아웃이 고해상도 카드 이미지로 저장되었습니다!`);
          }
        }
      }catch(err){
        if(liveSyncBadge){
          liveSyncBadge.textContent='저장 대기';
          liveSyncBadge.classList.remove('syncing');
        }
      }finally{
        carouselSilentInflight=false;
      }
    };

    const scheduleRealtimeSlideSync=(extra={},delayMs=380)=>{
      updateCanvaLiveVisualStyle(false);
      if(carouselRealtimeTimer)clearTimeout(carouselRealtimeTimer);
      carouselRealtimeTimer=setTimeout(()=>{
        runSilentSlideUpdate(extra,false);
      },delayMs);
    };

    const applyActiveSlideUpdate=(extra={},showSavedToast=false)=>{
      if(carouselRealtimeTimer)clearTimeout(carouselRealtimeTimer);
      return runSilentSlideUpdate(extra,showSavedToast);
    };

    // Populate Canva Floating Toolbar above the canvas (Add Text Object, Add Badge/Stars, Box Highlight, Color Highlight, Reset Layout, Save Image)
    const wrapSelectedCanvaText=(openChar,closeChar,fallbackWord)=>{
      const selObj=getSelectedObject()||canvaObjects.find(o=>o.kind==='title')||canvaObjects[0];
      if(!selObj)return;
      const tEl=textElByObjId.get(selObj.id);
      const sel=window.getSelection();
      if(tEl&&sel&&sel.rangeCount>0&&tEl.contains(sel.anchorNode)){
        const selectedStr=sel.toString().trim();
        if(selectedStr){
          document.execCommand('insertText',false,`${openChar}${selectedStr}${closeChar}`);
          selObj.text=tEl.innerText||'';
          scheduleRealtimeSlideSync({},160);
          return;
        }
      }
      selObj.text=`${String(selObj.text||'').trim()} ${openChar}${fallbackWord}${closeChar}`.trim();
      renderAllCanvaObjectNodes();
      scheduleRealtimeSlideSync({},160);
    };

    const btnAddTextObj=text('button','+ 텍스트 객체 추가');
    btnAddTextObj.type='button';
    btnAddTextObj.id='btn-canva-add-text-object';
    btnAddTextObj.className='secondary btn-xs';
    btnAddTextObj.onclick=()=>{
      const newId=`obj_custom_${Date.now().toString(36)}`;
      const lines=extractBestHookLines();
      const sampleTxt=lines[(canvaObjects.length)%Math.max(1,lines.length)]||'드래그하여 원하는 위치로 이동하세요';
      canvaObjects.push({
        id:newId,
        kind:'custom',
        label:`추가 텍스트 #${canvaObjects.length+1}`,
        text:sampleTxt,
        x:10,
        y:48,
        widthPct:80,
        fontSize:34,
        color:'#ffffff',
        bgColor:'#0f172a',
        bgEnabled:true,
        borderRadius:10,
        paddingX:14,
        paddingY:8,
        align:'left',
        bold:true,
        visible:true
      });
      selectedCanvaObjectId=newId;
      renderAllCanvaObjectNodes();
      selectCanvaObject(newId,{focusText:false});
      scheduleRealtimeSlideSync({},180);
    };

    const btnAddStarsOrBadge=text('button','+ 별점·배지 복원/추가');
    btnAddStarsOrBadge.type='button';
    btnAddStarsOrBadge.id='btn-canva-add-decor-object';
    btnAddStarsOrBadge.className='secondary btn-xs';
    btnAddStarsOrBadge.onclick=()=>{
      const hiddenObj=canvaObjects.find(o=>o.visible===false);
      if(hiddenObj){
        hiddenObj.visible=true;
        selectedCanvaObjectId=hiddenObj.id;
      }else{
        const newId=`obj_badge_${Date.now().toString(36)}`;
        canvaObjects.push({
          id:newId,
          kind:'badge',
          label:'추가 포인트 배지',
          text:'POINT CHECK',
          x:6.8,
          y:52,
          widthPct:0,
          fontSize:30,
          color:pal.badgeColor,
          bgColor:pal.badgeBg,
          bgEnabled:true,
          borderRadius:10,
          paddingX:16,
          paddingY:6,
          align:'left',
          bold:true,
          visible:true
        });
        selectedCanvaObjectId=newId;
      }
      renderAllCanvaObjectNodes();
      refreshSelectedObjectInspectorUI();
      scheduleRealtimeSlideSync({},180);
    };

    const btnCanvaBoxHl=text('button','+ [박스 강조]');btnCanvaBoxHl.type='button';btnCanvaBoxHl.className='secondary btn-xs';
    btnCanvaBoxHl.title='선택한 객체 텍스트에 [박스 강조]를 적용합니다';
    btnCanvaBoxHl.onclick=()=>wrapSelectedCanvaText('[',']','핵심키워드');

    const btnCanvaColorHl=text('button','+ *색상 강조*');btnCanvaColorHl.type='button';btnCanvaColorHl.className='secondary btn-xs';
    btnCanvaColorHl.title='선택한 객체 텍스트에 *색상 강조*를 적용합니다';
    btnCanvaColorHl.onclick=()=>wrapSelectedCanvaText('*','*','강조단어');

    const btnResetObjects=text('button','레이아웃 초기화');
    btnResetObjects.type='button';
    btnResetObjects.id='btn-canva-reset-objects';
    btnResetObjects.className='secondary btn-xs';
    btnResetObjects.title='모든 객체 위치를 기본 템플릿 레이아웃으로 초기화합니다';
    btnResetObjects.onclick=()=>{
      activeSlide.canva_objects=buildDefaultCanvaObjectsForSlide(activeSlide,effectiveSlides.length,activeRole,tplSelect?.value||activeTpl);
      activeSlide.bg_transform={scale:1,x:0,y:0};
      canvaObjects.length=0;
      canvaObjects.push(...activeSlide.canva_objects);
      applyBgTransformStyle();
      renderAllCanvaObjectNodes();
      refreshSelectedObjectInspectorUI();
      scheduleRealtimeSlideSync({},160);
    };

    const btnCanvaSaveImg=text('button','이미지 저장 (현재 카드 확정)');
    btnCanvaSaveImg.type='button';
    btnCanvaSaveImg.id='btn-canva-save-slide-image';
    btnCanvaSaveImg.className='btn-xs canva-save-image-btn';
    btnCanvaSaveImg.onclick=()=>applyActiveSlideUpdate({},true);

    const btnCanvaDownloadImg=text('button','내 PC로 다운로드');
    btnCanvaDownloadImg.type='button';
    btnCanvaDownloadImg.id='btn-canva-download-slide-image';
    btnCanvaDownloadImg.className='secondary btn-xs';
    btnCanvaDownloadImg.onclick=async()=>{
      await applyActiveSlideUpdate({},false);
      const dlUrl=activeSlide._compositedThumbDataUrl||`/studio/jobs/${job.id}/media/${activeSlide.file||`carousel-${activeSlide.index}.jpg`}?t=${Date.now()}`;
      const a=document.createElement('a');
      a.href=dlUrl;
      a.download=`${(job.name||'card').replace(/[^a-zA-Z0-9가-힣_-]/g,'_')}_slide_${activeSlide.index}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      message(`슬라이드 #${activeSlide.index} 이미지를 저장하고 다운로드를 시작했습니다!`);
    };

    canvaToolbar.append(btnAddTextObj,btnAddStarsOrBadge,btnCanvaBoxHl,btnCanvaColorHl,btnResetObjects,btnCanvaSaveImg,btnCanvaDownloadImg);

    // Slide Order & Quick Action Bar right below the Large Preview
    const wbPreviewFooter=document.createElement('div');
    wbPreviewFooter.className='wb-preview-quick-footer';
    const orderGroup=document.createElement('div');
    orderGroup.style.cssText='display:flex;gap:5px;flex-wrap:wrap;align-items:center;';
    if(hasRealSlides&&activeSlide.index>1){
      const bLeft=text('button','앞으로 이동');bLeft.type='button';bLeft.className='secondary btn-xs';
      bLeft.onclick=()=>act('슬라이드 순서 이동 중…',async()=>{
        const nextIdx=activeSlide.index-1;
        await update('carousel-slide-action',{action:'move',index:activeSlide.index,direction:-1});
        activeCarouselSlideIndex=nextIdx;
        renderCarouselPreview();
      });
      orderGroup.append(bLeft);
    }
    if(hasRealSlides&&activeSlide.index<effectiveSlides.length){
      const bRight=text('button','뒤로 이동');bRight.type='button';bRight.className='secondary btn-xs';
      bRight.onclick=()=>act('슬라이드 순서 이동 중…',async()=>{
        const nextIdx=activeSlide.index+1;
        await update('carousel-slide-action',{action:'move',index:activeSlide.index,direction:1});
        activeCarouselSlideIndex=nextIdx;
        renderCarouselPreview();
      });
      orderGroup.append(bRight);
    }
    if(hasRealSlides&&effectiveSlides.length>1){
      const bDel=text('button','슬라이드 삭제');bDel.type='button';bDel.className='secondary btn-xs btn-subtle-danger';
      bDel.onclick=()=>act(`슬라이드 #${activeSlide.index} 삭제 중…`,async()=>{
        if(effectiveSlides.length===2){
          singleCardModeOverrideJobId=job.id;
          if($('carousel-count'))$('carousel-count').value='1';
          if(activeSlide.index===1&&effectiveSlides[1]){
            await update('carousel-slide-action',{action:'move',index:2,direction:-1});
          }
          enforceSingleCardModeIfActive(job);
          activeCarouselSlideIndex=1;
          renderCarouselPreview();
          return;
        }
        await update('carousel-slide-action',{action:'delete',index:activeSlide.index});
        activeCarouselSlideIndex=Math.max(1,activeSlide.index-1);
        renderCarouselPreview();
      });
      orderGroup.append(bDel);
    }
    const bAttachCurrent=text('button',isSingleCard?'이 카드 이미지를 게시 첨부로 반영':`이 카드(#${activeSlide.index})만 동반 첨부 추가`);
    bAttachCurrent.type='button';
    bAttachCurrent.className='secondary btn-xs';
    bAttachCurrent.onclick=()=>act(`슬라이드 #${activeSlide.index} 카드를 이미지로 저장하고 게시 첨부 목록에 추가하는 중…`,async()=>{
      await runSilentSlideUpdate({},false);
      if(isSingleCard){
        await update('attachments-config',{action:'preset_video_plus_images',image_count:1});
      }else{
        const tier=splitSlideThreeTierText(activeSlide);
        const capLabel=tier.title||tier.subtitle||`캐러셀 카드 #${activeSlide.index}`;
        await update('attachments-config',{
          action:'add_frame',
          file:activeSlide.file||`carousel-${activeSlide.index}.jpg`,
          label:`캐러셀 #${activeSlide.index}: ${capLabel.slice(0,26)}`
        });
      }
      if($('upload-format'))$('upload-format').value='combo';
    },isSingleCard?'단독 카드 이미지를 저장하여 게시 첨부 묶음에 반영했습니다!':`슬라이드 #${activeSlide.index} 카드를 이미지로 저장하여 게시 첨부 목록에 추가했습니다!`);
    orderGroup.append(bAttachCurrent);

    const wbHint=text('span','요소 드래그: 자유 이동 · 모서리 핸들: 크기 조절 · 클릭/더블클릭: 글자 수정 · 배경 드래그: 사진 위치 이동');
    wbHint.className='hint';
    wbHint.style.margin='0';
    wbPreviewFooter.append(orderGroup,wbHint);
    wbPreviewCol.append(wbPreviewZoneTag,wbPreviewHeader,canvaToolbar,wbStage,wbPreviewFooter);

    // === RIGHT COLUMN: OBJECT INSPECTOR + THEME & PHOTO INSPECTOR ===
    const wbInspectorCol=document.createElement('div');
    wbInspectorCol.className='carousel-wb-inspector-col carousel-wb-inspector carousel-tabbed-inspector';

    const wbInspZoneTag=document.createElement('div');
    wbInspZoneTag.className='wb-zone-kicker-bar';
    wbInspZoneTag.innerHTML='<span class="wb-zone-pill wb-zone-pill-right">우측 · 선택 객체 속성 · 디자인 테마 · 배경 사진 편집</span>';

    const inspHead=document.createElement('div');
    inspHead.className='wb-inspector-head';
    const photoStatusText=activeSlide.custom_image?'내 사진 적용됨':(job.kind==='image'?'원본 이미지':`영상 ${Number(activeSlide.timestamp||0).toFixed(1)}초`);
    inspHead.append(
      text('h4',`슬라이드 #${activeSlide.index} 객체 · 스타일 설정 (${activeRole==='cover'?'첫장 표지':activeRole==='cta'?'마지막장 요약':'본문 카드'})`),
      text('span',photoStatusText)
    );

    if(activeCarouselInspectorTab!=='style'&&activeCarouselInspectorTab!=='photo'){
      activeCarouselInspectorTab='style';
    }
    const inspTabsBar=document.createElement('div');
    inspTabsBar.className='wb-inspector-tabs wb-inspector-tabs-2col';
    inspTabsBar.setAttribute('role','tablist');
    const tabDefs=[
      {id:'style',label:'① 선택 객체 · 테마 · 글꼴'},
      {id:'photo',label:'② 사진 · 배경 교체 · 확대'}
    ];
    const tabPanels={};
    const switchCarouselInspectorTab=tabId=>{
      activeCarouselInspectorTab=tabId;
      inspTabsBar.querySelectorAll('.wb-insp-tab-btn').forEach(b=>{
        const isAct=(b.dataset.wbTab===tabId);
        b.classList.toggle('active',isAct);
        b.setAttribute('aria-selected',String(isAct));
      });
      for(const [k,panelEl] of Object.entries(tabPanels)){
        if(panelEl)panelEl.hidden=(k!==tabId);
      }
    };
    for(const td of tabDefs){
      const tBtn=text('button',td.label);
      tBtn.type='button';
      tBtn.className='wb-insp-tab-btn'+(td.id===activeCarouselInspectorTab?' active':'');
      tBtn.dataset.wbTab=td.id;
      tBtn.setAttribute('role','tab');
      tBtn.setAttribute('aria-selected',String(td.id===activeCarouselInspectorTab));
      tBtn.onclick=()=>switchCarouselInspectorTab(td.id);
      inspTabsBar.append(tBtn);
    }

    const tabStylePanel=document.createElement('div');
    tabStylePanel.className='wb-tab-panel';
    tabPanels.style=tabStylePanel;

    const styleSheet=document.createElement('div');
    styleSheet.className='pro-prop-sheet';

    const makePropRow=(labelText,subStr='')=>{
      const row=document.createElement('div');
      row.className='pro-prop-row';
      const lbl=document.createElement('div');
      lbl.className='pro-prop-label';
      lbl.append(text('span',labelText));
      if(subStr){
        const sm=text('small',subStr);
        sm.className='pro-prop-sub';
        lbl.append(sm);
      }
      const ctrl=document.createElement('div');
      ctrl.className='pro-prop-ctrl pro-prop-ctrl-inline';
      row.append(lbl,ctrl);
      return {row,ctrl};
    };

    // === SELECTED OBJECT DIRECT PROPERTY CONTROLS (Canva Inspector) ===
    const {row:rSelObj,ctrl:cSelObj}=makePropRow('선택된 캔버스 객체','클릭/드래그 중');
    objLabelPill=text('span','메인 헤드라인 제목');
    objLabelPill.id='canva-selected-object-pill';
    objLabelPill.className='wb-role-pill';
    const objQuickSwitchWrap=document.createElement('div');
    objQuickSwitchWrap.style.cssText='display:flex;gap:4px;flex-wrap:wrap;align-items:center;';
    for(const [kKind,kShort] of [['badge','배지'],['title','제목'],['stars','별점'],['subtitle','설명'],['counter','번호']]){
      const qBtn=text('button',kShort);
      qBtn.type='button';
      qBtn.className='secondary btn-xs';
      qBtn.onclick=()=>{
        const found=canvaObjects.find(o=>o.kind===kKind);
        if(found){
          found.visible=true;
          renderAllCanvaObjectNodes();
          selectCanvaObject(found.id,{focusText:false});
        }
      };
      objQuickSwitchWrap.append(qBtn);
    }
    cSelObj.append(objLabelPill,objQuickSwitchWrap);

    // Selected Object Font Size + Text Color + Background Box Toggle/Color
    const {row:rObjSize,ctrl:cObjSize}=makePropRow('선택 객체 크기 · 색상','개별 조절');
    cObjSize.className='pro-prop-ctrl pro-prop-ctrl-slider';
    objColorInput=document.createElement('input');
    objColorInput.type='color';
    objColorInput.id='canva-obj-color-input';
    objColorInput.className='stroke-color-picker';
    objColorInput.title='선택 객체 글자 색상';
    objColorInput.value='#ffffff';
    objFontSizeRange=document.createElement('input');
    objFontSizeRange.type='range';
    objFontSizeRange.min='14';
    objFontSizeRange.max='120';
    objFontSizeRange.step='1';
    objFontSizeRange.value='66';
    objFontSizeNum=document.createElement('input');
    objFontSizeNum.type='number';
    objFontSizeNum.id='canva-obj-fontsize-num';
    objFontSizeNum.className='capcut-num-input';
    objFontSizeNum.min='12';
    objFontSizeNum.max='140';
    objFontSizeNum.value='66';
    const applySelObjSizeColor=()=>{
      const selObj=getSelectedObject();
      if(!selObj)return;
      selObj.fontSize=Math.max(12,Math.min(140,Number(objFontSizeNum.value||32)));
      selObj.color=objColorInput.value||'#ffffff';
      updateCanvaLiveVisualStyle(false);
      scheduleRealtimeSlideSync({},220);
    };
    objFontSizeRange.oninput=()=>{objFontSizeNum.value=objFontSizeRange.value;applySelObjSizeColor();};
    objFontSizeNum.oninput=()=>{objFontSizeRange.value=objFontSizeNum.value;applySelObjSizeColor();};
    objColorInput.oninput=applySelObjSizeColor;
    cObjSize.append(objColorInput,objFontSizeRange,objFontSizeNum);

    const {row:rObjBg,ctrl:cObjBg}=makePropRow('객체 배경 박스 · 정렬','배지·강조 배경');
    objBgToggle=document.createElement('input');
    objBgToggle.type='checkbox';
    objBgToggle.id='canva-obj-bg-toggle';
    objBgToggle.style.cssText='width:16px;height:16px;cursor:pointer;';
    const bgToggleLbl= document.createElement('label');
    bgToggleLbl.style.cssText='display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;cursor:pointer;';
    bgToggleLbl.append(objBgToggle,text('span','배경 켜기'));
    objBgColorInput=document.createElement('input');
    objBgColorInput.type='color';
    objBgColorInput.id='canva-obj-bgcolor-input';
    objBgColorInput.className='stroke-color-picker';
    objBgColorInput.value='#101210';
    const alignGroup=document.createElement('div');
    alignGroup.className='capcut-toggle-group';
    objAlignBtns=[];
    for(const [aKey,aLbl] of [['left','좌'],['center','중'],['right','우']]){
      const aBtn=text('button',aLbl);
      aBtn.type='button';
      aBtn.className='capcut-toggle-btn';
      aBtn.dataset.align=aKey;
      aBtn.onclick=()=>{
        const selObj=getSelectedObject();
        if(!selObj)return;
        selObj.align=aKey;
        objAlignBtns.forEach(b=>b.classList.toggle('active',b===aBtn));
        updateCanvaLiveVisualStyle(false);
        scheduleRealtimeSlideSync({},220);
      };
      objAlignBtns.push(aBtn);
      alignGroup.append(aBtn);
    }
    const applySelObjBg=()=>{
      const selObj=getSelectedObject();
      if(!selObj)return;
      selObj.bgEnabled=Boolean(objBgToggle.checked);
      selObj.bgColor=objBgColorInput.value||'#101210';
      updateCanvaLiveVisualStyle(false);
      scheduleRealtimeSlideSync({},220);
    };
    objBgToggle.onchange=applySelObjBg;
    objBgColorInput.oninput=()=>{objBgToggle.checked=true;applySelObjBg();};
    cObjBg.append(bgToggleLbl,objBgColorInput,alignGroup);

    // Row 0: 바이럴 후킹 공식 (클릭 시 캔버스 문구 즉시 변환)
    const {row:rHook,ctrl:cHook}=makePropRow(activeSlide.index===1?'첫 장 90% 후킹 공식':'슬라이드 후킹 공식','클릭 시 캔버스 즉시 반영');
    const hookChipsRow=document.createElement('div');
    hookChipsRow.className='pro-preset-inline-bar';
    const curFormula=$('carousel-cover-hook-formula')?.value||'number';
    for(const [fKey,fMeta] of Object.entries(coverHookFormulaMeta)){
      const chip=document.createElement('button');
      chip.type='button';
      chip.className='pro-preset-pill'+(fKey===curFormula?' active':'');
      chip.title=fMeta.desc;
      chip.textContent=fMeta.name;
      chip.onclick=()=>{
        if($('carousel-cover-hook-formula'))$('carousel-cover-hook-formula').value=fKey;
        hookChipsRow.querySelectorAll('.pro-preset-pill').forEach(c=>c.classList.toggle('active',c===chip));
        const prod=($('product-name')?.value||job?.product?.name||'').trim();
        const lines=extractBestHookLines();
        const titleObj=canvaObjects.find(o=>o.kind==='title')||canvaObjects[0];
        const subObj=canvaObjects.find(o=>o.kind==='subtitle');
        const badgeObj=canvaObjects.find(o=>o.kind==='badge');
        const seedTopic=(titleObj?.text||'').trim()||lines[0]||'핵심 포인트';
        const seedSub=(subObj?.text||'').trim()||lines[1]||'';
        const formatted=formatCoverHookByFormula(fKey,seedTopic,seedSub,prod,effectiveSlides.length);
        if(titleObj)titleObj.text=formatted.title;
        if(subObj)subObj.text=formatted.subtitle;
        if(badgeObj&&activeRole==='cover')badgeObj.text=formatted.badge.toLowerCase();
        if(activeSlide.index===1&&$('carousel-cover-title')){
          $('carousel-cover-title').value=formatted.combined;
        }
        renderAllCanvaObjectNodes();
        applyActiveSlideUpdate({
          title:formatted.title,
          subtitle:formatted.subtitle,
          badge:badgeObj?.text||formatted.badge,
          hook_formula:fKey
        });
      };
      hookChipsRow.append(chip);
    }
    cHook.append(hookChipsRow);

    // Row 1: 슬라이드 역할
    const {row:rRole,ctrl:cRole}=makePropRow('슬라이드 역할');
    const roleQuickBar=document.createElement('div');
    roleQuickBar.className='capcut-toggle-group';
    for(const [rKey,rShort] of [['cover','표지 (Cover)'],['body','본문 (Body)'],['cta','요약 (CTA)']]){
      const rBtn=text('button',rShort);
      rBtn.type='button';
      rBtn.className='capcut-toggle-btn'+(rKey===activeRole?' active':'');
      rBtn.onclick=()=>{
        roleSelect.value=rKey;
        roleQuickBar.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===rBtn));
        applyActiveSlideUpdate({role:rKey});
      };
      roleQuickBar.append(rBtn);
    }
    roleSelect=document.createElement('select');
    roleSelect.id='wb-active-role-select';
    roleSelect.className='pro-inline-select';
    roleSelect.style.cssText='flex:1;min-width:160px;';
    for(const [rKey,rName] of Object.entries(carouselRoleLabels)){
      const opt=text('option',rName);opt.value=rKey;if(rKey===activeRole)opt.selected=true;
      roleSelect.append(opt);
    }
    cRole.append(roleQuickBar,roleSelect);

    // Row 2: 레이아웃 테마 (8종 고유 연출)
    const {row:rTheme,ctrl:cTheme}=makePropRow('레이아웃 테마 (8종)');
    tplSelect=document.createElement('select');
    tplSelect.id='wb-active-tpl-select';
    tplSelect.className='pro-font-select';
    tplSelect.style.cssText='flex:1;width:100%;';
    for(const [tKey,tName] of Object.entries(carouselTemplateNames)){
      const opt=text('option',tName);opt.value=tKey;if(tKey===activeTpl)opt.selected=true;
      tplSelect.append(opt);
    }
    cTheme.append(tplSelect);

    // Per-slide Font + 1st & 2nd Double-Stroke Controls
    const activeFontKey=activeSlide.font_family||job.carousel?.font_family||$('carousel-font')?.value||'heavy_kr';
    const activeStrokeW=Number(activeSlide.stroke_width??job.carousel?.stroke_width??$('carousel-stroke-width')?.value??0);
    const activeStrokeC=activeSlide.stroke_color||job.carousel?.stroke_color||$('carousel-stroke-color')?.value||'#000000';
    const activeDStrokeW=Number(activeSlide.double_stroke_width??job.carousel?.double_stroke_width??$('carousel-double-stroke-width')?.value??0);
    const activeDStrokeC=activeSlide.double_stroke_color||job.carousel?.double_stroke_color||$('carousel-double-stroke-color')?.value||'#facc15';

    // Row 3: 슬라이드 글꼴
    const {row:rFont,ctrl:cFont}=makePropRow('슬라이드 글꼴');
    fontSelectEl=document.createElement('select');
    fontSelectEl.id='wb-active-font-select';
    fontSelectEl.className='studio-font-select pro-font-select';
    fontSelectEl.style.cssText='flex:1;';
    if($('carousel-font')){
      fontSelectEl.innerHTML=$('carousel-font').innerHTML;
    }
    fontSelectEl.value=activeFontKey;
    if(!fontSelectEl.value)fontSelectEl.value='heavy_kr';
    const applyWbFontPreview=(fKey)=>{
      const fCss=CSS_FONT_MAP[fKey]||CSS_FONT_MAP.heavy_kr;
      if(fontSelectEl)fontSelectEl.style.fontFamily=fCss;
    };
    applyWbFontPreview(fontSelectEl.value);
    const btnWbUploadFont=text('button','+ 내 폰트 추가');
    btnWbUploadFont.type='button';
    btnWbUploadFont.className='secondary btn-xs btn-upload-custom-font';
    btnWbUploadFont.onclick=()=>triggerCustomFontUpload('wb-active-font-select');
    cFont.append(fontSelectEl,btnWbUploadFont);

    // Row 4: 1차 안쪽 테두리
    const {row:rS1,ctrl:cS1}=makePropRow('1차 안쪽 획 (테두리)');
    cS1.className='pro-prop-ctrl pro-prop-ctrl-slider';
    s1Color=document.createElement('input');s1Color.type='color';s1Color.id='wb-active-stroke-color';s1Color.className='stroke-color-picker';s1Color.value=activeStrokeC;
    const s1Range=document.createElement('input');s1Range.type='range';s1Range.min='0';s1Range.max='24';s1Range.step='1';s1Range.value=String(activeStrokeW);
    s1Num=document.createElement('input');s1Num.type='number';s1Num.id='wb-active-stroke-width';s1Num.className='capcut-num-input';s1Num.min='0';s1Num.max='24';s1Num.step='1';s1Num.value=String(activeStrokeW);
    const s1Tag=text('span',`${activeStrokeW}px`);s1Tag.className='pro-unit-tag';
    s1Range.oninput=()=>{s1Num.value=s1Range.value;s1Tag.textContent=`${s1Range.value}px`;scheduleRealtimeSlideSync({},160);};
    s1Num.oninput=()=>{s1Range.value=s1Num.value;s1Tag.textContent=`${s1Num.value}px`;scheduleRealtimeSlideSync({},160);};
    s1Color.oninput=()=>scheduleRealtimeSlideSync({},160);
    cS1.append(s1Color,s1Range,s1Num,s1Tag);

    // Row 5: 2중 바깥 테두리
    const {row:rS2,ctrl:cS2}=makePropRow('2중 바깥 획 (테두리)');
    cS2.className='pro-prop-ctrl pro-prop-ctrl-slider';
    s2Color=document.createElement('input');s2Color.type='color';s2Color.id='wb-active-double-stroke-color';s2Color.className='stroke-color-picker';s2Color.value=activeDStrokeC;
    const s2Range=document.createElement('input');s2Range.type='range';s2Range.min='0';s2Range.max='24';s2Range.step='1';s2Range.value=String(activeDStrokeW);
    s2Num=document.createElement('input');s2Num.type='number';s2Num.id='wb-active-double-stroke-width';s2Num.className='capcut-num-input';s2Num.min='0';s2Num.max='24';s2Num.step='1';s2Num.value=String(activeDStrokeW);
    const s2Tag=text('span',`${activeDStrokeW}px`);s2Tag.className='pro-unit-tag';
    s2Range.oninput=()=>{s2Num.value=s2Range.value;s2Tag.textContent=`${s2Range.value}px`;scheduleRealtimeSlideSync({},160);};
    s2Num.oninput=()=>{s2Range.value=s2Num.value;s2Tag.textContent=`${s2Num.value}px`;scheduleRealtimeSlideSync({},160);};
    s2Color.oninput=()=>scheduleRealtimeSlideSync({},160);
    cS2.append(s2Color,s2Range,s2Num,s2Tag);

    // Row 6: 전체 객체 그룹 빠른 위치 프리셋 (상단 / 중앙 / 하단)
    const {row:rPos,ctrl:cPos}=makePropRow('전체 객체 빠른 배치','드래그 또는 일괄 정렬');
    const posQuickBar=document.createElement('div');
    posQuickBar.className='capcut-toggle-group';
    const curPos=activeSlide.overlay_position||($('carousel-text-pos')?.value||'bottom');
    for(const [pKey,pLabel] of [['top','상단 배너'],['center','중앙 포스터'],['bottom','하단 매거진']]){
      const pBtn=text('button',pLabel);
      pBtn.type='button';
      pBtn.className='capcut-toggle-btn'+(pKey===curPos?' active':'');
      pBtn.onclick=()=>{
        activeSlide.overlay_position=pKey;
        if($('carousel-text-pos'))$('carousel-text-pos').value=pKey;
        const shift=pKey==='top'?-46:(pKey==='center'?-24:0);
        const bObj=canvaObjects.find(o=>o.kind==='badge');if(bObj)bObj.y=Math.max(6,58.5+shift);
        const tObj=canvaObjects.find(o=>o.kind==='title');if(tObj)tObj.y=Math.max(14,66.2+shift);
        const stObj=canvaObjects.find(o=>o.kind==='stars');if(stObj)stObj.y=Math.max(24,81.8+shift);
        const sObj=canvaObjects.find(o=>o.kind==='subtitle');if(sObj)sObj.y=Math.max(30,87.4+shift);
        posQuickBar.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===pBtn));
        renderAllCanvaObjectNodes();
        applyActiveSlideUpdate({overlay_position:pKey});
      };
      posQuickBar.append(pBtn);
    }
    cPos.append(posQuickBar);

    styleSheet.append(rSelObj,rObjSize,rObjBg,rHook,rRole,rTheme,rFont,rS1,rS2,rPos);
    tabStylePanel.append(styleSheet);

    // =========================================================================
    // TAB 2 PANEL: ② 사진 · 배경 교체 · 배경 확대/위치 조절
    // =========================================================================
    const tabPhotoPanel=document.createElement('div');
    tabPhotoPanel.className='wb-tab-panel';
    tabPanels.photo=tabPhotoPanel;

    const photoBox=document.createElement('div');
    photoBox.className='wb-structured-section wb-photo-edit-box';
    const photoHead=document.createElement('div');
    photoHead.className='wb-section-head';
    const photoTitle=text('strong','슬라이드 배경 사진 교체 및 확대/위치 조절');
    const photoBadge=text('span',activeSlide.custom_image?'외부 사진 적용됨':'영상/원본 프레임');
    photoBadge.className='wb-section-pill'+(activeSlide.custom_image?' active':'');
    photoHead.append(photoTitle,photoBadge);

    const bgZoomRow=document.createElement('div');
    bgZoomRow.className='pro-prop-ctrl pro-prop-ctrl-slider';
    bgZoomRow.style.margin='8px 0';
    const bgZoomLbl=text('span','배경 사진 확대/축소:');
    bgZoomLbl.style.cssText='font-size:12px;font-weight:700;';
    const bgZoomRange=document.createElement('input');
    bgZoomRange.type='range';bgZoomRange.min='100';bgZoomRange.max='220';bgZoomRange.step='5';
    bgZoomRange.value=String(Math.round(Number(activeSlide.bg_transform?.scale||1)*100));
    const bgZoomVal=text('span',`${bgZoomRange.value}%`);
    bgZoomVal.className='pro-unit-tag';
    const btnBgResetPan=text('button','배경 위치 초기화');
    btnBgResetPan.type='button';btnBgResetPan.className='secondary btn-xs';
    bgZoomRange.oninput=()=>{
      activeSlide.bg_transform=activeSlide.bg_transform||{scale:1,x:0,y:0};
      activeSlide.bg_transform.scale=Number(bgZoomRange.value)/100;
      bgZoomVal.textContent=`${bgZoomRange.value}%`;
      applyBgTransformStyle();
      scheduleRealtimeSlideSync({},260);
    };
    btnBgResetPan.onclick=()=>{
      activeSlide.bg_transform={scale:1,x:0,y:0};
      bgZoomRange.value='100';
      bgZoomVal.textContent='100%';
      applyBgTransformStyle();
      scheduleRealtimeSlideSync({},200);
    };
    bgZoomRow.append(bgZoomLbl,bgZoomRange,bgZoomVal,btnBgResetPan);

    const photoActionRow=document.createElement('div');
    photoActionRow.className='wb-photo-action-row';
    const btnUploadPhoto=text('button','+ 내 PC 이미지 파일로 교체');
    btnUploadPhoto.type='button';
    btnUploadPhoto.className='secondary btn-xs';
    btnUploadPhoto.onclick=()=>{
      pendingCarouselPhotoMode='replace';
      $('carousel-slide-photo-input')?.click();
    };
    const btnPastePhoto=text('button','클립보드 이미지 붙여넣기 (Ctrl+V)');
    btnPastePhoto.type='button';
    btnPastePhoto.className='secondary btn-xs wb-paste-highlight-btn';
    btnPastePhoto.onclick=async()=>{
      try{
        const dataUrl=await readClipboardImageAsDataUrl();
        activeSlide._cleanBgDataUrl=dataUrl;
        canvaCleanBgMemoryCache.set(`${job.id}_${activeSlide.index}`,dataUrl);
        bigImg.src=dataUrl;
        await applyActiveSlideUpdate({},true);
      }catch(err){
        message(err.message,true);
      }
    };
    const btnAddSlideWithPhoto=text('button','+ 새 슬라이드로 사진 추가');
    btnAddSlideWithPhoto.type='button';
    btnAddSlideWithPhoto.className='secondary btn-xs';
    btnAddSlideWithPhoto.onclick=()=>{
      pendingCarouselPhotoMode='add_slide';
      $('carousel-slide-photo-input')?.click();
    };
    photoActionRow.append(btnUploadPhoto,btnPastePhoto,btnAddSlideWithPhoto);

    if(job.kind!=='image'){
      const videoCaptureBox=document.createElement('div');
      videoCaptureBox.className='wb-structured-section';
      videoCaptureBox.style.marginTop='8px';
      const vcHead=document.createElement('div');
      vcHead.className='wb-section-head';
      vcHead.append(text('strong','좌측 원본 영상에서 깨끗한 장면 가져오기'),text('span',`현재 슬라이드 시점: ${Number(activeSlide.timestamp||0).toFixed(1)}초`));
      const vcBtns=document.createElement('div');
      vcBtns.className='wb-photo-action-row';
      const captureCleanVideoFrameToBg=async(targetTime)=>{
        const vid=$('preview');
        if(vid&&vid.readyState>=2&&vid.videoWidth>0){
          try{
            if(typeof targetTime==='number'&&Math.abs(vid.currentTime-targetTime)>0.08){
              vid.currentTime=targetTime;
              await new Promise(r=>setTimeout(r,140));
            }
            const c=document.createElement('canvas');
            c.width=vid.videoWidth;c.height=vid.videoHeight;
            c.getContext('2d').drawImage(vid,0,0);
            const dUrl=c.toDataURL('image/jpeg',0.92);
            activeSlide._cleanBgDataUrl=dUrl;
            canvaCleanBgMemoryCache.set(`${job.id}_${activeSlide.index}`,dUrl);
            bigImg.src=dUrl;
          }catch{}
        }
      };
      const btnTsCapture=text('button','좌측 영상의 현재 재생 시점으로 배경 즉시 교체');
      btnTsCapture.type='button';
      btnTsCapture.className='btn-xs';
      btnTsCapture.onclick=async()=>{
        const cur=$('preview')?.currentTime;
        const rawTs=(typeof cur==='number'&&Number.isFinite(cur))?cur:Number(activeSlide.timestamp||0);
        const nextTs=Math.min(Math.max(0,maxDur-0.1),rawTs);
        activeSlide.timestamp=nextTs;
        await captureCleanVideoFrameToBg(nextTs);
        applyActiveSlideUpdate({timestamp:nextTs,clear_custom_image:true},true);
      };
      const btnTsMinus=text('button','-0.5초 이전 장면');btnTsMinus.type='button';btnTsMinus.className='secondary btn-xs';
      btnTsMinus.onclick=async()=>{
        const nextTs=Math.max(0,Number(activeSlide.timestamp||0)-0.5);
        activeSlide.timestamp=nextTs;
        await captureCleanVideoFrameToBg(nextTs);
        applyActiveSlideUpdate({timestamp:nextTs,clear_custom_image:true});
      };
      const btnTsPlus=text('button','+0.5초 다음 장면');btnTsPlus.type='button';btnTsPlus.className='secondary btn-xs';
      btnTsPlus.onclick=async()=>{
        const nextTs=Math.min(Math.max(0,maxDur-0.1),Number(activeSlide.timestamp||0)+0.5);
        activeSlide.timestamp=nextTs;
        await captureCleanVideoFrameToBg(nextTs);
        applyActiveSlideUpdate({timestamp:nextTs,clear_custom_image:true});
      };
      vcBtns.append(btnTsCapture,btnTsMinus,btnTsPlus);
      videoCaptureBox.append(vcHead,vcBtns);
      tabPhotoPanel.append(videoCaptureBox);
    }
    if(activeSlide.custom_image){
      const btnResetFrame=text('button','원본 영상/이미지 배경으로 복원');
      btnResetFrame.type='button';
      btnResetFrame.className='secondary btn-xs btn-subtle-danger';
      btnResetFrame.onclick=()=>{
        delete activeSlide._cleanBgDataUrl;
        canvaCleanBgMemoryCache.delete(`${job.id}_${activeSlide.index}`);
        applyActiveSlideUpdate({clear_custom_image:true});
      };
      photoActionRow.append(btnResetFrame);
    }
    const photoHint=text('p','팁: 캔버스 빈 배경을 드래그하면 사진 구도를 상하좌우로 움직일 수 있으며, Ctrl+V로 클립보드 이미지를 즉시 배경에 넣을 수 있습니다.');
    photoHint.className='hint';
    photoBox.append(photoHead,bgZoomRow,photoActionRow,photoHint);
    tabPhotoPanel.prepend(photoBox);

    roleSelect.onchange=()=>{
      roleQuickBar.querySelectorAll('button').forEach((b,idx)=>{
        const k=['cover','body','cta'][idx];
        b.classList.toggle('active',k===roleSelect.value);
      });
      applyActiveSlideUpdate({role:roleSelect.value});
    };
    tplSelect.onchange=()=>{
      const nextPal=CANVA_THEME_OBJECT_PALETTES[tplSelect.value]||CANVA_THEME_OBJECT_PALETTES.editorial_dark;
      scrimLayer.style.background=nextPal.scrim;
      const bObj=canvaObjects.find(o=>o.kind==='badge');
      if(bObj){bObj.color=nextPal.badgeColor;bObj.bgColor=nextPal.badgeBg;bObj.borderRadius=nextPal.badgeRadius;}
      const tObj=canvaObjects.find(o=>o.kind==='title');
      if(tObj){tObj.color=nextPal.titleColor;}
      const stObj=canvaObjects.find(o=>o.kind==='stars');
      if(stObj){stObj.color=nextPal.starsColor;}
      const sObj=canvaObjects.find(o=>o.kind==='subtitle');
      if(sObj){sObj.color=nextPal.subColor;}
      const cObj=canvaObjects.find(o=>o.kind==='counter');
      if(cObj){cObj.color=nextPal.counterColor;cObj.bgColor=nextPal.counterBg;}
      renderAllCanvaObjectNodes();
      refreshSelectedObjectInspectorUI();
      applyActiveSlideUpdate({template:tplSelect.value});
    };
    fontSelectEl.onchange=()=>{
      applyWbFontPreview(fontSelectEl.value);
      updateCanvaLiveVisualStyle();
      applyActiveSlideUpdate({font_family:fontSelectEl.value});
    };

    // Render all interactive Canva objects onto the stage and bind inspector
    renderAllCanvaObjectNodes();
    refreshSelectedObjectInspectorUI();
    switchCarouselInspectorTab(activeCarouselInspectorTab);
    updateCanvaLiveVisualStyle(true);

    // Re-scale object fonts smoothly if center preview stage resizes
    requestAnimationFrame(()=>{
      updateCanvaLiveVisualStyle(true);
    });

    // Prominent Save Bar at bottom of Right Inspector
    const wbFooter=document.createElement('div');
    wbFooter.className='wb-inspector-footer wb-inspector-actions';
    const autoSyncHint=text('span','캔버스 위에서 각 요소를 드래그해 배치하고 저장하면 100% 동일한 고해상도 카드 이미지로 완성됩니다.');
    autoSyncHint.className='hint';
    autoSyncHint.style.margin='0';
    const btnApplySlide=text('button',`슬라이드 #${activeSlide.index} 이미지로 저장`);
    btnApplySlide.type='button';
    btnApplySlide.className='btn-xs canva-save-image-btn';
    btnApplySlide.onclick=()=>applyActiveSlideUpdate({},true);
    wbFooter.append(autoSyncHint,btnApplySlide);

    wbInspectorCol.append(wbInspZoneTag,inspHead,inspTabsBar,tabStylePanel,tabPhotoPanel,headInput,subtitleInput,bodyTextarea,badgeInput,legacySubHidden,wbFooter);
    if(storyboardDock){
      wbPreviewCol.append(storyboardDock);
    }
    if(globalDrawer){
      wbInspectorCol.append(globalDrawer);
    }
    const curInspW=applyCarouselInspectorWidth(getSavedCarouselInspectorWidth(),{save:false});
    const inspResizer=document.createElement('div');
    inspResizer.id='carousel-inspector-resizer';
    inspResizer.className='studio-player-resizer carousel-inspector-resizer';
    inspResizer.setAttribute('role','separator');
    inspResizer.setAttribute('aria-orientation','vertical');
    inspResizer.setAttribute('aria-label','우측 디자인·사진 편집 폭 조절바');
    inspResizer.title='좌우로 드래그하여 가운데 미리보기 창과 우측 편집 폭을 조절하세요 (더블클릭: 기본 360px 초기화)';
    inspResizer.innerHTML=`<div class="resizer-rail-line"></div><div class="resizer-grip" aria-hidden="true"><span class="resizer-arrows">&lt;&gt;</span><span class="resizer-dots">⋮⋮</span><span id="carousel-inspector-width-pill" class="resizer-width-pill">${curInspW}px</span></div>`;
    let inspDragging=false,inspStartX=0,inspStartW=curInspW,inspLastW=curInspW;
    inspResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      inspDragging=true;
      inspStartX=e.clientX;
      inspStartW=wbInspectorCol.getBoundingClientRect().width||getSavedCarouselInspectorWidth();
      inspLastW=inspStartW;
      inspResizer.classList.add('dragging');
      document.body.classList.add('resizing-studio-player');
      try{inspResizer.setPointerCapture(e.pointerId);}catch{}
    });
    inspResizer.addEventListener('pointermove',e=>{
      if(!inspDragging)return;
      e.preventDefault();
      // Moving resizer to the left increases right inspector width; moving right decreases right inspector width
      const nextW=inspStartW-(e.clientX-inspStartX);
      inspLastW=applyCarouselInspectorWidth(nextW,{save:false});
    });
    const endInspResize=e=>{
      if(!inspDragging)return;
      inspDragging=false;
      inspResizer.classList.remove('dragging');
      document.body.classList.remove('resizing-studio-player');
      try{inspResizer.releasePointerCapture(e.pointerId);}catch{}
      applyCarouselInspectorWidth(inspLastW,{save:true});
    };
    inspResizer.addEventListener('pointerup',endInspResize);
    inspResizer.addEventListener('pointercancel',endInspResize);
    inspResizer.addEventListener('dblclick',()=>{
      applyCarouselInspectorWidth(360,{save:true});
      message('우측 디자인·배경 편집 폭을 기본(360px)으로 초기화했습니다.');
    });

    wbGrid.append(wbPreviewCol,inspResizer,wbInspectorCol);
    workbench.append(wbGrid);
  }
}
function isThreadsVideoCoverFrameUrl(urlStr){
  if(!urlStr||typeof urlStr!=='string')return false;
  if(urlStr.includes('/t51.71878-15/'))return true;
  if(/video_default_cover_frame|vts_vod_urlgen/i.test(urlStr))return true;
  try{
    const m=urlStr.match(/[?&]efg=([^&]+)/);
    if(m&&m[1]){
      const dec=atob(decodeURIComponent(m[1]).replace(/-/g,'+').replace(/_/g,'/'));
      if(/video_default_cover_frame|vts_vod_urlgen/i.test(dec))return true;
    }
  }catch{}
  return false;
}

function canonicalMediaAssetFilename(urlStr){
  if(!urlStr||typeof urlStr!=='string')return '';
  try{
    const parsed=new URL(urlStr);
    const segs=parsed.pathname.split('/').filter(Boolean);
    return segs[segs.length-1]||urlStr;
  }catch{
    const raw=urlStr.split('?')[0];
    const segs=raw.split('/').filter(Boolean);
    return segs[segs.length-1]||urlStr;
  }
}

function cleanAndDeduplicateCompanionImageUrls(imageUrls,ref=null){
  const rawList=Array.isArray(imageUrls)?imageUrls:[];
  const filtered=rawList.filter(u=>{
    if(!u||typeof u!=='string')return false;
    if(/(?:ytimg\.com|ggpht\.com)/i.test(u))return false;
    if(isThreadsVideoCoverFrameUrl(u))return false;
    if(ref&&(ref.mediaKind==='video'||(ref.videoUrls&&ref.videoUrls.length>0))&&(u===ref.thumbnailUrl||u===ref.poster))return false;
    return true;
  });
  const byKey=new Map();
  for(const u of filtered){
    const key=canonicalMediaAssetFilename(u)||u;
    const prev=byKey.get(key);
    if(!prev){
      byKey.set(key,u);
    }else if(/_s\d+x\d+|[?&]stp=[^&]*s\d+x\d+/i.test(prev)&&!/_s\d+x\d+|[?&]stp=[^&]*s\d+x\d+/i.test(u)){
      byKey.set(key,u);
    }
  }
  return [...byKey.values()];
}

async function normalizeAcquiredComboJob(acquiredJob,context={}){
  if(!acquiredJob||!acquiredJob.id)return acquiredJob;
  let currentJob=acquiredJob;
  const sourceUrl=context.url||currentJob.source||'';
  const isThreadsUrl=/(?:threads\.com|threads\.net)\//i.test(sourceUrl);
  const explicitChoice=Boolean(context.explicitMediaChoice);

  // 1) If a Threads post with Video + Image was previously cached as an image job with a video attachment,
  // automatically re-acquire with kind='video' so the video becomes 1st-priority primary media and the image becomes 2nd-priority companion attachment!
  if(!explicitChoice&&currentJob.kind==='image'){
    const videoAtt=(currentJob.attachments||[]).find(a=>a&&a.kind==='video');
    if(videoAtt||isThreadsUrl){
      try{
        const retryPayload={
          url:sourceUrl,
          kind:'video',
          source_text:context.sourceText||currentJob.source_text||'',
          image_urls:cleanAndDeduplicateCompanionImageUrls(context.cleanImageUrls||[])
        };
        if(videoAtt?.source_url){
          retryPayload.media_url=videoAtt.source_url;
          retryPayload.video_urls=[videoAtt.source_url];
        }
        const promoted=await api('acquire',retryPayload);
        if(promoted&&promoted.id&&promoted.kind!=='image'){
          currentJob=promoted;
        }
      }catch{}
    }
  }

  // 2) Clean up any video cover frame or duplicate resolution attachments on the job
  const atts=Array.isArray(currentJob.attachments)?currentJob.attachments:[];
  if(atts.length>0){
    const seenAssetKeys=new Map();
    atts.forEach((att,idx)=>{
      if(!att)return;
      const src=att.source_url||'';
      if(att.kind==='image'&&isThreadsVideoCoverFrameUrl(src)){
        return;
      }
      const key=att.name||canonicalMediaAssetFilename(src)||att.file||`idx_${idx}`;
      const prevIdx=seenAssetKeys.get(key);
      if(prevIdx===undefined){
        seenAssetKeys.set(key,idx);
      }else{
        const prevSrc=atts[prevIdx]?.source_url||'';
        if(/_s\d+x\d+|[?&]stp=[^&]*s\d+x\d+/i.test(prevSrc)&&!/_s\d+x\d+|[?&]stp=[^&]*s\d+x\d+/i.test(src)){
          seenAssetKeys.set(key,idx);
        }
      }
    });
    const keepIndices=new Set(seenAssetKeys.values());
    const removeIndices=[];
    for(let i=atts.length-1;i>=0;i--){
      const src=atts[i]?.source_url||'';
      if((atts[i]?.kind==='image'&&isThreadsVideoCoverFrameUrl(src))||!keepIndices.has(i)){
        removeIndices.push(i);
      }
    }
    for(const rmIdx of removeIndices){
      try{
        currentJob=await api(`jobs/${currentJob.id}/attachments-config`,{action:'remove',index:rmIdx});
      }catch{}
    }
  }
  return currentJob;
}

function renderPlayerCompanionMediaBar(){
  const bar=$('player-companion-media-bar');
  if(!bar)return;
  bar.replaceChildren();
  const atts=(job?.attachments||[]).filter(a=>a&&!isThreadsVideoCoverFrameUrl(a.source_url||''));
  if(!job||!atts.length){
    bar.hidden=true;
    return;
  }
  bar.hidden=false;
  const base=`/studio/jobs/${job.id}/media/`;
  const ts=Math.floor((job.text_edit?.updated_at||Date.now())*1000);
  const isPrimaryImage=job.kind==='image';
  const imgAttCount=atts.filter(a=>a.kind==='image').length;
  const vidAttCount=atts.filter(a=>a.kind==='video').length;

  const head=document.createElement('div');
  head.className='companion-media-bar-head';
  const titleWrap=document.createElement('div');
  titleWrap.className='companion-media-title-wrap';
  const badge=text('span',isPrimaryImage?`복합 미디어 (메인 이미지 + 추가 ${atts.length}개)`:`복합 게시물 완료 (메인 영상 1 + 동반 이미지 ${imgAttCount||atts.length} · 총 ${atts.length+1}개)`);
  badge.className='companion-combo-pill';
  const sub=text('span','쓰레드 게시 시 영상과 동반 이미지가 함께 업로드됩니다');
  sub.className='companion-combo-sub';
  titleWrap.append(badge,sub);

  const headActions=document.createElement('div');
  headActions.className='companion-media-head-actions';
  const btnOpenBundle=text('button','묶음 순서·구성 편집');
  btnOpenBundle.type='button';
  btnOpenBundle.className='secondary btn-xs';
  btnOpenBundle.onclick=()=>{
    document.querySelector('[data-workspace="create"]')?.click();
    document.querySelector('[data-production-stage="editing"]')?.click();
    selectEditTab('bundle');
  };
  headActions.append(btnOpenBundle);
  head.append(titleWrap,headActions);

  const strip=document.createElement('div');
  strip.className='companion-media-strip';

  // Card 1: Primary Media (Video)
  const primaryChip=document.createElement('div');
  primaryChip.className='companion-media-chip active-primary';
  const pThumb=document.createElement('img');
  const firstFrame=job.evidence?.frames?.[0]?.file||'frame-0.jpg';
  pThumb.src=`${base}${firstFrame}?t=${ts}`;
  pThumb.alt='1순위 메인 미디어';
  const pInfo=document.createElement('div');
  pInfo.className='companion-chip-info';
  pInfo.append(
    text('strong',isPrimaryImage?'1순위 · 메인 이미지':`1순위 · 메인 영상 (${Number(job.media?.duration||0).toFixed(1)}초)`),
    text('small','현재 좌측 플레이어에서 재생·편집 중')
  );
  primaryChip.append(pThumb,pInfo);
  primaryChip.onclick=()=>{
    if(!isPrimaryImage&&$('preview')){
      $('preview').hidden=false;
      if($('image-preview'))$('image-preview').hidden=true;
      $('preview').play().catch(()=>{});
    }
  };
  strip.append(primaryChip);

  // Companion Media Cards (2nd, 3rd...)
  atts.forEach((att,idx)=>{
    const chip=document.createElement('div');
    chip.className='companion-media-chip companion-item';
    if(att.kind==='image'){
      const img=document.createElement('img');
      img.src=`${base}${att.file}?t=${ts}`;
      img.alt=`${idx+2}순위 동반 이미지`;
      chip.append(img);
    }else{
      const vBadge=text('span','VIDEO');
      vBadge.className='companion-chip-vbadge';
      chip.append(vBadge);
    }
    const info=document.createElement('div');
    info.className='companion-chip-info';
    info.append(
      text('strong',`${idx+2}순위 · 동반 ${att.kind==='video'?'영상':'이미지'} #${idx+1}`),
      text('small',att.label||'원본 게시물 두 번째 미디어 · 함께 게시됨')
    );
    const btnGroup=document.createElement('div');
    btnGroup.className='companion-chip-btns';
    if(att.kind==='image'){
      const btnPreviewImg=text('button','크게 보기');
      btnPreviewImg.type='button';
      btnPreviewImg.className='secondary btn-xs';
      btnPreviewImg.title='좌측 미리보기 창에서 이 동반 이미지를 확인합니다 (다시 메인 영상을 클릭하면 영상으로 돌아옵니다)';
      btnPreviewImg.onclick=e=>{
        e.stopPropagation();
        if($('preview')){$('preview').pause();$('preview').hidden=true;}
        if($('image-preview')){
          $('image-preview').hidden=false;
          $('image-preview').src=`${base}${att.file}?t=${Date.now()}`;
        }
        strip.querySelectorAll('.companion-media-chip').forEach(c=>c.classList.remove('active-primary'));
        chip.classList.add('active-primary');
        message(`${idx+2}순위 동반 이미지를 미리보기 창에 표시했습니다. [1순위 · 메인 영상] 카드를 누르면 다시 영상으로 돌아옵니다.`);
      };
      const btnUseInCarousel=text('button','캐러셀 카드로 편집');
      btnUseInCarousel.type='button';
      btnUseInCarousel.className='btn-xs';
      btnUseInCarousel.title='이 동반 이미지를 캐러셀·뉴스카드 스튜디오의 슬라이드 배경으로 바로 불러와 문구를 편집합니다';
      btnUseInCarousel.onclick=e=>{
        e.stopPropagation();
        act('동반 이미지를 캐러셀 슬라이드로 불러오는 중…',async()=>{
          const resp=await fetch(`${base}${att.file}?t=${Date.now()}`);
          const blob=await resp.blob();
          const dataUrl=await readImageFileAsDataUrl(blob);
          document.querySelector('[data-workspace="create"]')?.click();
          document.querySelector('[data-production-stage="carousel"]')?.click();
          const hasSlides=Array.isArray(job?.carousel?.slides)&&job.carousel.slides.length>0;
          await applyCarouselCustomPhotoDataUrl(dataUrl,hasSlides?'add_slide':'replace',`동반 이미지 #${idx+1}`);
        },`동반 이미지 #${idx+1}을(를) 캐러셀·뉴스카드 편집 화면으로 불러왔습니다!`);
      };
      btnGroup.append(btnPreviewImg,btnUseInCarousel);
    }
    primaryChip.onclick=()=>{
      if(!isPrimaryImage&&$('preview')){
        $('preview').hidden=false;
        if($('image-preview'))$('image-preview').hidden=true;
      }
      strip.querySelectorAll('.companion-media-chip').forEach(c=>c.classList.remove('active-primary'));
      primaryChip.classList.add('active-primary');
    };
    chip.append(info,btnGroup);
    strip.append(chip);
  });

  bar.append(head,strip);
}

function renderAttachmentsPreview(){
  renderPlayerCompanionMediaBar();
  const builder=$('media-bundle-builder'),box=$('attachments-box'),list=$('attachments-list');
  if(!box||!list)return;
  list.replaceChildren();
  if(!job){if(builder)builder.hidden=true;box.hidden=true;return;}
  if(builder)builder.hidden=false;
  box.hidden=false;
  const base=`/studio/jobs/${job.id}/media/`;
  const ts=Math.floor((job.text_edit?.updated_at||Date.now())*1000);
  const isPrimaryImage=job.kind==='image';
  const durStr=isPrimaryImage?'단일 이미지':`${Number(job.media?.duration||0).toFixed(1)}초`;
  const resStr=(job.media?.width&&job.media?.height)?`${job.media.width}×${job.media.height}`:'원본 해상도';

  // 1st slot: Primary video or image
  const primaryCard=document.createElement('div');
  primaryCard.className='attachment-item primary-slot';
  const pBadge=document.createElement('div');
  pBadge.className='attachment-slot-badge';
  const pOrder=text('span','1순위 · 메인 '+(isPrimaryImage?'이미지':'영상'));
  pOrder.className='attachment-rank-pill primary';
  const pType=text('span',isPrimaryImage?'IMAGE':'VIDEO');
  pType.className='attachment-kind-tag';
  pBadge.append(pOrder,pType);

  const pThumbWrap=document.createElement('div');
  pThumbWrap.className='attachment-thumb-frame';
  const pImg=document.createElement('img');
  const firstFrame=job.evidence?.frames?.[0]?.file||'frame-0.jpg';
  pImg.src=`${base}${firstFrame}?t=${ts}`;
  pImg.alt='1순위 메인 미디어 미리보기';
  pThumbWrap.append(pImg);

  const pMeta=document.createElement('div');
  pMeta.className='attachment-meta-info';
  const pTitle=text('strong',job.name||(isPrimaryImage?'메인 이미지':'메인 편집 영상'));
  pTitle.className='attachment-item-title';
  const pSub=text('small',`${isPrimaryImage?'원본/편집 이미지':'메인 업로드 영상'} · ${durStr} · ${resStr}`);
  pSub.className='attachment-item-sub';
  pMeta.append(pTitle,pSub);

  primaryCard.append(pBadge,pThumbWrap,pMeta);
  list.append(primaryCard);

  const items=job?.attachments||[];
  for(const [idx,att] of items.entries()){
    const card=document.createElement('div');
    card.className='attachment-item companion-slot';
    const slotHead=document.createElement('div');
    slotHead.className='attachment-slot-badge';
    const rankPill=text('span',`${idx+2}순위 · 동반 ${att.kind==='video'?'영상':'이미지'}`);
    rankPill.className='attachment-rank-pill';
    const kindTag=text('span',att.kind==='video'?'VIDEO':'IMAGE');
    kindTag.className='attachment-kind-tag';
    slotHead.append(rankPill,kindTag);

    const thumbWrap=document.createElement('div');
    thumbWrap.className='attachment-thumb-frame';
    if(att.kind==='image'){
      const img=document.createElement('img');
      img.src=`${base}${att.file}?t=${ts}`;
      img.alt=`${idx+2}순위 동반 이미지`;
      thumbWrap.append(img);
    }else{
      const badge=text('span',`추가 영상 #${idx+2}`);
      badge.className='attachment-video-badge';
      thumbWrap.append(badge);
    }

    const meta=document.createElement('div');
    meta.className='attachment-meta-info';
    const titleStr=att.label||(att.file?.startsWith('carousel-')?`캐러셀 슬라이드 (${att.file})`:`동반 이미지 #${idx+1} (${att.file||'첨부'})`);
    const aTitle=text('strong',titleStr);
    aTitle.className='attachment-item-title';
    const aSub=text('small',`쓰레드 우측 동반 첨부 · 파일: ${att.file||'image'}`);
    aSub.className='attachment-item-sub';
    meta.append(aTitle,aSub);

    const actions=document.createElement('div');
    actions.className='attachment-slot-actions';
    if(idx>0){
      const btnLeft=text('button','앞으로');btnLeft.type='button';btnLeft.className='secondary btn-xs';
      btnLeft.title='순서 앞으로 이동';
      btnLeft.onclick=()=>act('첨부 순서 변경 중…',()=>update('attachments-config',{action:'move',from_index:idx,to_index:idx-1}));
      actions.append(btnLeft);
    }
    if(idx<items.length-1){
      const btnRight=text('button','뒤로');btnRight.type='button';btnRight.className='secondary btn-xs';
      btnRight.title='순서 뒤로 이동';
      btnRight.onclick=()=>act('첨부 순서 변경 중…',()=>update('attachments-config',{action:'move',from_index:idx,to_index:idx+1}));
      actions.append(btnRight);
    }
    const btnDel=text('button','첨부 제외');btnDel.type='button';btnDel.className='secondary btn-xs btn-danger-ghost';
    btnDel.onclick=()=>act('첨부 미디어 제외 중…',()=>update('attachments-config',{action:'remove',index:idx}));
    actions.append(btnDel);

    card.append(slotHead,thumbWrap,meta,actions);
    list.append(card);
  }
}
const CSS_FONT_MAP={
  heavy_kr:'"StudioFont_heavy_kr","Malgun Gothic","Pretendard","Apple SD Gothic Neo",Impact,sans-serif',
  malgun_bold:'"StudioFont_heavy_kr","Malgun Gothic","Pretendard",sans-serif',
  black_han_sans:'"StudioFont_black_han_sans","Black Han Sans","Malgun Gothic",Impact,sans-serif',
  gasoek_one:'"StudioFont_gasoek_one","Gasoek One","Black Han Sans","Malgun Gothic",Impact,sans-serif',
  do_hyeon:'"StudioFont_do_hyeon","Do Hyeon","BM DoHyeon","Malgun Gothic",sans-serif',
  jua:'"StudioFont_jua","Jua","BM JUA","Malgun Gothic",sans-serif',
  bagel_fat_one:'"StudioFont_bagel_fat_one","Bagel Fat One","Malgun Gothic",cursive,sans-serif',
  hy_headline:'"StudioFont_hy_headline","HYHeadLine-Medium","HY헤드라인M","Malgun Gothic",Impact,sans-serif',
  hy_gothic_extra:'"StudioFont_hy_gothic_extra","HYGothic-Extra","HY견고딕","Malgun Gothic",sans-serif',
  pyeongchang_peace_bold:'"StudioFont_pyeongchang_peace_bold","Headline R","휴먼둥근헤드라인","Malgun Gothic",sans-serif',
  sans:'"StudioFont_sans","Noto Sans KR","Pretendard","Malgun Gothic",sans-serif',
  malgun_regular:'"StudioFont_malgun_regular","Malgun Gothic","Apple SD Gothic Neo",sans-serif',
  gowun_dodum:'"StudioFont_gowun_dodum","Gowun Dodum","Malgun Gothic",sans-serif',
  orbit:'"StudioFont_orbit","Orbit","Malgun Gothic",monospace,sans-serif',
  gulim_clean:'"StudioFont_gulim_clean","New Gulim","새굴림","Gulim","굴림","Malgun Gothic",sans-serif',
  serif:'"StudioFont_serif","StudioFont_gowun_batang_bold","Gowun Batang","Batang","바탕",Georgia,serif',
  gowun_batang:'"StudioFont_gowun_batang_bold","Gowun Batang","Batang",Georgia,serif',
  gowun_batang_bold:'"StudioFont_gowun_batang_bold","Gowun Batang","Batang",Georgia,serif',
  batang_kr:'"StudioFont_batang_kr","Noto Serif KR","Batang","바탕","Gowun Batang",serif',
  hy_myeongjo_extra:'"StudioFont_hy_myeongjo_extra","HYMyeongJo-Extra","HY견명조","Batang",serif',
  hy_sin_myeongjo:'"StudioFont_hy_sin_myeongjo","HYSinMyeongJo-Medium","HY신명조","Batang",serif',
  brush_kr:'"StudioFont_brush_kr","StudioFont_nanum_pen","Nanum Pen Script","Gungsuh","궁서",cursive,serif',
  nanum_pen:'"StudioFont_nanum_pen","Nanum Pen Script","Gungsuh",cursive,serif',
  gungseo_kr:'"StudioFont_gungseo_kr","Pyunji R","휴먼편지체","Gungsuh","궁서",serif',
  hy_pyunji:'"StudioFont_gungseo_kr","Pyunji R","휴먼편지체","Gungsuh",serif',
  hy_gungseo_bold:'"StudioFont_hy_gungseo_bold","HYGungSo-Bold","HY궁서B","Gungsuh","궁서",serif',
  magic_kr:'"StudioFont_magic_kr","Magic R","휴먼매직체","Gungsuh",cursive,sans-serif',
  hy_mokgak:'"StudioFont_hy_mokgak","HYPMokGak-Bold","HY목각파임B","Malgun Gothic",serif',
  yet_hangul:'"StudioFont_yet_hangul","Yet R","휴먼옛체","Batang",serif',
  hy_yet:'"StudioFont_yet_hangul","Yet R","휴먼옛체","Batang",serif',
  pyeongchang_regular:'"StudioFont_pyeongchang_regular","HYGraphic-Medium","HY그래픽M","Malgun Gothic",sans-serif',
  hy_graphic:'"StudioFont_pyeongchang_regular","HYGraphic-Medium","HY그래픽M","Malgun Gothic",sans-serif'
};
let pendingCustomFontTargetSelect='overlay-title-font';
function ensureDynamicFontStyleSheet(){
  let styleEl=$('studio-dynamic-fonts-style');
  if(!styleEl){
    styleEl=document.createElement('style');
    styleEl.id='studio-dynamic-fonts-style';
    document.head.appendChild(styleEl);
  }
  return styleEl;
}
function registerCustomFontInDom(fontKey,fontLabel,fontUrl){
  if(!fontKey)return;
  const familyName=`StudioFont_${fontKey}`;
  CSS_FONT_MAP[fontKey]=`"${familyName}","Malgun Gothic","Pretendard",sans-serif`;
  if(fontUrl){
    const styleEl=ensureDynamicFontStyleSheet();
    const rule=`@font-face { font-family: "${familyName}"; src: url("${fontUrl}"); font-display: swap; }`;
    if(!styleEl.textContent.includes(familyName)){
      styleEl.textContent+=`\n${rule}`;
    }
    if(window.FontFace&&document.fonts){
      try{
        const ff=new FontFace(familyName,`url("${fontUrl}")`);
        ff.load().then(loaded=>{document.fonts.add(loaded);syncDraggableOverlayCanvas();}).catch(()=>{});
      }catch{}
    }
  }
  const selectIds=['overlay-title-font','overlay-font','inspector-font-select','carousel-font','wb-active-font-select'];
  for(const sid of selectIds){
    const sel=$(sid);
    if(!sel)continue;
    let customGroup=sel.querySelector('optgroup[data-custom-fonts="1"]');
    if(!customGroup){
      customGroup=document.createElement('optgroup');
      customGroup.label='내 커스텀 추가 폰트 (.ttf/.otf)';
      customGroup.dataset.customFonts='1';
      sel.prepend(customGroup);
    }
    let existingOpt=sel.querySelector(`option[value="${fontKey}"]`);
    if(!existingOpt){
      existingOpt=document.createElement('option');
      existingOpt.value=fontKey;
      existingOpt.textContent=`[내 폰트] ${fontLabel||fontKey}`;
      customGroup.appendChild(existingOpt);
    }else{
      existingOpt.textContent=`[내 폰트] ${fontLabel||fontKey}`;
    }
  }
}
async function loadAvailableStudioFonts(){
  try{
    const rawLocal=localStorage.getItem('takoh-custom-fonts-cache');
    if(rawLocal){
      const cached=JSON.parse(rawLocal);
      if(Array.isArray(cached)){
        for(const item of cached){
          if(item&&item.key)registerCustomFontInDom(item.key,item.label,item.dataUrl||`/studio/fonts/file/${encodeURIComponent(item.key)}`);
        }
      }
    }
  }catch{}
  try{
    const res=await api('fonts');
    const customList=Array.isArray(res?.custom)?res.custom:(Array.isArray(res?.fonts)?res.fonts.filter(f=>f.source==='custom'||f.custom):[]);
    for(const f of customList){
      if(f&&f.key){
        registerCustomFontInDom(f.key,f.label||f.name||f.key,f.url||`/studio/fonts/file/${encodeURIComponent(f.key)}`);
      }
    }
  }catch{}
}
function triggerCustomFontUpload(targetSelectId){
  pendingCustomFontTargetSelect=targetSelectId||'overlay-title-font';
  const fileInput=$('custom-font-upload-input');
  if(fileInput){
    fileInput.value='';
    fileInput.click();
  }
}
window.triggerCustomFontUpload=triggerCustomFontUpload;
document.querySelectorAll('.btn-upload-custom-font').forEach(btn=>{
  btn.addEventListener('click',()=>{
    triggerCustomFontUpload(btn.dataset.targetSelect||'overlay-title-font');
  });
});
if($('custom-font-upload-input')){
  $('custom-font-upload-input').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const baseLabel=file.name.replace(/\.(ttf|otf|ttc)$/i,'').trim()||'사용자 폰트';
    const readAsDataUrl=f=>new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(new Error('폰트 파일을 읽지 못했습니다.'));
      reader.readAsDataURL(f);
    });
    await act(`사용자 폰트 [${baseLabel}] 등록 및 적용 중…`,async()=>{
      let dataUrl='';
      try{dataUrl=await readAsDataUrl(file);}catch{}
      let fontKey=`custom_${baseLabel.toLowerCase().replace(/[^a-z0-9가-힣]+/g,'_').replace(/^_+|_+$/g,'')||'user_font'}`;
      let fontLabel=baseLabel;
      let fontUrl=dataUrl;
      try{
        const form=new FormData();
        form.append('font',file);
        form.append('label',baseLabel);
        const uploaded=await api('fonts/upload',form);
        if(uploaded?.font?.key){
          fontKey=uploaded.font.key;
          fontLabel=uploaded.font.label||baseLabel;
          fontUrl=dataUrl||uploaded.font.url||`/studio/fonts/file/${encodeURIComponent(fontKey)}`;
        }
      }catch{}
      registerCustomFontInDom(fontKey,fontLabel,fontUrl);
      try{
        const rawLocal=localStorage.getItem('takoh-custom-fonts-cache');
        const list=rawLocal?JSON.parse(rawLocal):[];
        const filtered=Array.isArray(list)?list.filter(x=>x&&x.key!==fontKey):[];
        filtered.push({key:fontKey,label:fontLabel,dataUrl:dataUrl.length<1800000?dataUrl:''});
        localStorage.setItem('takoh-custom-fonts-cache',JSON.stringify(filtered.slice(-12)));
      }catch{}
      const targetSel=$(pendingCustomFontTargetSelect);
      if(targetSel){
        targetSel.value=fontKey;
        targetSel.dispatchEvent(new Event('change'));
      }
      syncDraggableOverlayCanvas();
      saveActiveJobLocalDraft();
    },`내 폰트 [${baseLabel}] 등록 완료! 타이틀·자막·캐러셀 글씨체 목록에 즉시 반영되었습니다.`);
  });
}
loadAvailableStudioFonts().catch(()=>{});

function buildLiveDoubleStrokeTextShadow(strokeW,strokeColor,doubleStrokeW,doubleStrokeColor,stageWidth,extraShadow=''){
  const scale=Math.max(0.32,Math.min(0.88,(stageWidth||360)/1080));
  const s1=Math.max(0,Number(strokeW||0))*scale;
  const s2=Math.max(0,Number(doubleStrokeW||0))*scale;
  const c1=strokeColor||'#000000';
  const c2=doubleStrokeColor||'#facc15';
  const shadows=[];
  const pushRing=(radius,color,steps=16)=>{
    if(radius<=0.1)return;
    for(let i=0;i<steps;i++){
      const angle=(Math.PI*2*i)/steps;
      const dx=(Math.cos(angle)*radius).toFixed(1);
      const dy=(Math.sin(angle)*radius).toFixed(1);
      shadows.push(`${dx}px ${dy}px 0 ${color}`);
    }
  };
  if(s1>0){
    if(s1>1.6)pushRing(s1*0.55,c1,12);
    pushRing(s1,c1,16);
  }
  if(s2>0){
    const outerR=s1+s2;
    if(s2>1.6)pushRing(s1+s2*0.5,c2,16);
    pushRing(outerR,c2,20);
  }
  if(extraShadow)shadows.push(extraShadow);
  return shadows.join(', ');
}

let isApplyingDraftOrUndo=false;
const editorUndoStack=[];
let lastUndoSnapshotJson='';
let videoTextLayers=[];
let activeTextLayerId='';
let activeTextLayer='title';
function escapeHtml(str){
  return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function createDefaultVideoTextLayer(arg1={},arg2={}){
  const overrides=(typeof arg1==='number')?(arg2||{}):(arg1||{});
  const idx=(typeof arg1==='number')?(arg1+1):((videoTextLayers.length||0)+1);
  const defaultYs=[22,78,50,34,64,16,84];
  const defaultY=defaultYs[(idx-1)%defaultYs.length]||50;
  return {
    id:overrides.id||('text_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),
    text:overrides.text!==undefined?String(overrides.text):'클릭해서 문구 수정',
    badge:overrides.badge!==undefined?String(overrides.badge):'',
    preset:overrides.preset||'reels_giant_yellow_impact',
    font:overrides.font||'heavy_kr',
    size:Number(overrides.size||54),
    scale_pct:Number(overrides.scale_pct||100),
    opacity:Number(overrides.opacity??100),
    letter_spacing:Number(overrides.letter_spacing??0),
    line_spacing:Number(overrides.line_spacing||1.20),
    align:overrides.align||'center',
    bold:overrides.bold!==undefined?Boolean(overrides.bold):true,
    italic:Boolean(overrides.italic),
    underline:Boolean(overrides.underline),
    text_color:overrides.text_color||'#ffea18',
    bg_enabled:overrides.bg_enabled!==undefined?Boolean(overrides.bg_enabled):true,
    bg_color:overrides.bg_color||'#0e1018',
    bg_opacity:Number(overrides.bg_opacity??88),
    box_radius:Number(overrides.box_radius??18),
    stroke_width:Number(overrides.stroke_width??4),
    stroke_color:overrides.stroke_color||'#000000',
    double_stroke_width:Number(overrides.double_stroke_width??0),
    double_stroke_color:overrides.double_stroke_color||'#facc15',
    x:Number(overrides.x??50),
    y:Number(overrides.y??defaultY),
    box_w:Number(overrides.box_w||0),
    box_h:Number(overrides.box_h||0),
    duration:Number(overrides.duration||0)
  };
}

function getActiveVideoTextLayer(){
  if(!Array.isArray(videoTextLayers)||!videoTextLayers.length)return null;
  let found=videoTextLayers.find(l=>l&&l.id===activeTextLayerId);
  if(!found){
    found=videoTextLayers[0];
    activeTextLayerId=found.id;
  }
  return found;
}

function syncLegacyBackingStoreFromVideoTextLayers(){
  const first=videoTextLayers[0]||null;
  const second=videoTextLayers[1]||null;
  if($('overlay-title-text'))$('overlay-title-text').value=first?first.text:'';
  if($('overlay-title-badge'))$('overlay-title-badge').value=first?(first.badge||''):'';
  if($('overlay-title-color')&&first)$('overlay-title-color').value=first.preset||'reels_giant_yellow_impact';
  if($('overlay-title-bg')&&first)$('overlay-title-bg').value=first.bg_enabled?'1':'0';
  if($('overlay-title-size')&&first)$('overlay-title-size').value=String(first.size||54);
  if($('overlay-title-font')&&first)$('overlay-title-font').value=first.font||'heavy_kr';
  if($('overlay-title-x')&&first)$('overlay-title-x').value=String(first.x??50);
  if($('overlay-title-y')&&first)$('overlay-title-y').value=String(first.y??18);
  if($('overlay-korean-text'))$('overlay-korean-text').value=second?second.text:'';
  if($('overlay-sub-x'))$('overlay-sub-x').value=second?String(second.x??50):'';
  if($('overlay-sub-y'))$('overlay-sub-y').value=second?String(second.y??78):'';
}

function renderDynamicLayerPills(){
  const container=$('inspector-dynamic-layer-pills');
  if(!container)return;
  container.replaceChildren();
  if(!videoTextLayers.length){
    const emptyBadge=document.createElement('span');
    emptyBadge.className='inspector-empty-layer-hint';
    emptyBadge.textContent='텍스트 없음 ([+ 텍스트 추가] 또는 아래 문구 입력 시 생성)';
    container.appendChild(emptyBadge);
    return;
  }
  videoTextLayers.forEach((lyr,idx)=>{
    const pill=document.createElement('button');
    pill.type='button';
    const isAct=(lyr.id===activeTextLayerId);
    pill.className='capcut-layer-pill'+(isAct?' active':'');
    pill.dataset.layerId=lyr.id;
    const snippet=(lyr.text||'').replace(/\s+/g,' ').trim().slice(0,12)||`텍스트 #${idx+1}`;
    pill.innerHTML=`<span class="layer-dot ${idx===0?'title-dot':'sub-dot'}"></span><strong>#${idx+1} ${escapeHtml(snippet)}</strong><span class="layer-pill-del" data-del-layer-id="${escapeHtml(lyr.id)}" title="이 텍스트 삭제">×</span>`;
    pill.addEventListener('click',e=>{
      const delBtn=e.target.closest('[data-del-layer-id]');
      if(delBtn){
        e.stopPropagation();
        deleteVideoTextLayer(delBtn.dataset.delLayerId);
        return;
      }
      selectVideoTextLayer(lyr.id,{openInspectorTab:true,focusInput:true});
    });
    container.appendChild(pill);
  });
}

function syncCapcutInspectorFromBacking(){
  renderDynamicLayerPills();
  const lyr=getActiveVideoTextLayer();
  const idx=lyr?videoTextLayers.indexOf(lyr):-1;
  const setValIfNotFocused=(id,val)=>{
    const el=$(id);
    if(el&&document.activeElement!==el){
      el.value=String(val??'');
    }
  };
  if($('btn-inspector-delete-layer'))$('btn-inspector-delete-layer').disabled=!lyr;
  if($('btn-inspector-duplicate-layer'))$('btn-inspector-duplicate-layer').disabled=!lyr;
  if($('btn-inspector-clear-all-layers'))$('btn-inspector-clear-all-layers').disabled=!videoTextLayers.length;
  if($('btn-canvas-delete-selected-text'))$('btn-canvas-delete-selected-text').disabled=!lyr;
  if($('btn-canvas-delete-all-texts'))$('btn-canvas-delete-all-texts').disabled=!videoTextLayers.length;

  if(!lyr){
    if($('inspector-active-layer-title'))$('inspector-active-layer-title').textContent='문구 입력 (새 텍스트)';
    if($('inspector-active-layer-sub'))$('inspector-active-layer-sub').textContent='입력 시 텍스트 #1 자동 추가';
    setValIfNotFocused('inspector-text-input','');
    setValIfNotFocused('inspector-badge-input','');
    return;
  }

  if($('inspector-active-layer-title')){
    $('inspector-active-layer-title').textContent=`문구 입력 (텍스트 #${idx+1})`;
  }
  if($('inspector-active-layer-sub')){
    $('inspector-active-layer-sub').textContent=`위치 (${Math.round(lyr.x)}%, ${Math.round(lyr.y)}%) · 실시간 반영`;
  }
  if($('inspector-badge-wrap'))$('inspector-badge-wrap').style.display='';
  if($('inspector-duration-wrap'))$('inspector-duration-wrap').style.display='';

  if($('inspector-text-input')){
    const ti=$('inspector-text-input');
    if(document.activeElement!==ti||ti.dataset.boundLayerId!==lyr.id){
      ti.value=String(lyr.text||'');
      ti.dataset.boundLayerId=lyr.id;
    }
  }
  if($('inspector-badge-input')){
    const bi=$('inspector-badge-input');
    if(document.activeElement!==bi||bi.dataset.boundLayerId!==lyr.id){
      bi.value=String(lyr.badge||'');
      bi.dataset.boundLayerId=lyr.id;
    }
  }
  setValIfNotFocused('inspector-duration-select',String(lyr.duration||0));

  const fontVal=lyr.font||'heavy_kr';
  const activeFontCss=CSS_FONT_MAP[fontVal]||CSS_FONT_MAP.sans;
  if($('inspector-font-select')){
    $('inspector-font-select').value=fontVal;
    $('inspector-font-select').style.fontFamily=activeFontCss;
  }
  if($('inspector-text-input')){
    $('inspector-text-input').style.fontFamily=activeFontCss;
  }

  const isBold=Boolean(lyr.bold);
  const isItalic=Boolean(lyr.italic);
  const isUnderline=Boolean(lyr.underline);
  if($('inspector-btn-bold')){
    $('inspector-btn-bold').classList.toggle('active',isBold);
    $('inspector-btn-bold').setAttribute('aria-pressed',String(isBold));
  }
  if($('inspector-btn-italic')){
    $('inspector-btn-italic').classList.toggle('active',isItalic);
    $('inspector-btn-italic').setAttribute('aria-pressed',String(isItalic));
  }
  if($('inspector-btn-underline')){
    $('inspector-btn-underline').classList.toggle('active',isUnderline);
    $('inspector-btn-underline').setAttribute('aria-pressed',String(isUnderline));
  }
  const alignVal=lyr.align||'center';
  document.querySelectorAll('[data-inspector-align]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.inspectorAlign===alignVal);
  });

  const sizeVal=Math.round(Number(lyr.size||54));
  setValIfNotFocused('inspector-font-size',sizeVal);
  setValIfNotFocused('inspector-font-size-range',sizeVal);
  if($('inspector-font-size-val'))$('inspector-font-size-val').textContent=`${sizeVal}px`;

  const scaleVal=Math.round(Number(lyr.scale_pct||100));
  setValIfNotFocused('inspector-scale-pct',scaleVal);
  setValIfNotFocused('inspector-scale-pct-range',scaleVal);
  if($('inspector-scale-pct-val'))$('inspector-scale-pct-val').textContent=`${scaleVal}%`;

  const opacityVal=Math.round(Number(lyr.opacity??100));
  setValIfNotFocused('inspector-opacity',opacityVal);
  setValIfNotFocused('inspector-opacity-range',opacityVal);
  if($('inspector-opacity-val'))$('inspector-opacity-val').textContent=`${opacityVal}%`;

  const letterSpacingVal=Number(lyr.letter_spacing??0);
  setValIfNotFocused('inspector-letter-spacing',letterSpacingVal);
  setValIfNotFocused('inspector-letter-spacing-range',letterSpacingVal);
  if($('inspector-letter-spacing-val'))$('inspector-letter-spacing-val').textContent=`${letterSpacingVal}px`;

  const lineSpacingVal=Number(lyr.line_spacing||1.20);
  setValIfNotFocused('inspector-line-spacing',lineSpacingVal);
  setValIfNotFocused('inspector-line-spacing-range',lineSpacingVal);
  if($('inspector-line-spacing-val'))$('inspector-line-spacing-val').textContent=String(lineSpacingVal);

  const radiusVal=Math.round(Number(lyr.box_radius??18));
  setValIfNotFocused('inspector-box-radius',radiusVal);
  setValIfNotFocused('inspector-box-radius-range',radiusVal);
  if($('inspector-box-radius-val'))$('inspector-box-radius-val').textContent=`${radiusVal}px`;

  const textColorVal=lyr.text_color||'#ffea18';
  setValIfNotFocused('inspector-text-color',textColorVal);

  const bgColorVal=lyr.bg_color||'#0e1018';
  setValIfNotFocused('inspector-bg-color',bgColorVal);

  const bgOpacityVal=Math.round(Number(lyr.bg_opacity??88));
  setValIfNotFocused('inspector-bg-opacity',bgOpacityVal);
  setValIfNotFocused('inspector-bg-opacity-range',bgOpacityVal);
  if($('inspector-bg-opacity-val'))$('inspector-bg-opacity-val').textContent=`${bgOpacityVal}%`;

  const bgEnabled=Boolean(lyr.bg_enabled)&&(lyr.preset!=='outline');
  if($('inspector-bg-enabled'))$('inspector-bg-enabled').checked=bgEnabled;
  if($('inspector-bg-enabled-quick'))$('inspector-bg-enabled-quick').checked=bgEnabled;

  const s1W=Math.round(Number(lyr.stroke_width??4));
  const s1C=lyr.stroke_color||'#000000';
  const s2W=Math.round(Number(lyr.double_stroke_width??0));
  const s2C=lyr.double_stroke_color||'#facc15';
  setValIfNotFocused('inspector-stroke-width',s1W);
  setValIfNotFocused('inspector-stroke-width-range',s1W);
  setValIfNotFocused('inspector-stroke-color',s1C);
  setValIfNotFocused('inspector-double-stroke-width',s2W);
  setValIfNotFocused('inspector-double-stroke-width-range',s2W);
  setValIfNotFocused('inspector-double-stroke-color',s2C);

  const presetVal=lyr.preset||'reels_giant_yellow_impact';
  document.querySelectorAll('[data-inspector-preset]').forEach(chip=>{
    const p=chip.dataset.inspectorPreset;
    const match=(p===presetVal)||(presetVal==='black'&&p==='clean_white_card')||(presetVal==='outline'&&p==='minimal_outline');
    chip.classList.toggle('active',match);
  });
}

function selectVideoTextLayer(layerIdOrAlias,opts={}){
  if(layerIdOrAlias==='title'&&videoTextLayers[0]){
    activeTextLayerId=videoTextLayers[0].id;
  }else if(layerIdOrAlias==='subtitle'&&(videoTextLayers[1]||videoTextLayers[0])){
    activeTextLayerId=(videoTextLayers[1]||videoTextLayers[0]).id;
  }else if(layerIdOrAlias){
    const found=videoTextLayers.find(l=>l&&l.id===layerIdOrAlias);
    if(found)activeTextLayerId=found.id;
  }
  if(opts.openInspectorTab){
    const curStage=window.currentProductionStage||'analysis';
    if(curStage!=='editing'){
      const editStageBtn=document.querySelector('[data-production-stage="editing"]');
      if(editStageBtn)editStageBtn.click();
    }
    if(activeEditTab!=='subtitle'){
      selectEditTab('subtitle');
    }
  }
  syncDraggableOverlayCanvas();
  if(opts.focusInput&&$('inspector-text-input')){
    $('inspector-text-input').focus();
  }
}

function addVideoTextLayer(overrides={},opts={select:true,focus:true}){
  pushEditorUndoSnapshot();
  const base=getActiveVideoTextLayer();
  const nextIdx=videoTextLayers.length+1;
  const defaultYs=[22,78,50,34,64,16,84];
  const nextY=overrides.y!==undefined?Number(overrides.y):(defaultYs[(nextIdx-1)%defaultYs.length]||50);
  const newLayer=createDefaultVideoTextLayer({
    ...(base?{
      preset:base.preset,
      font:base.font,
      size:base.size,
      bold:base.bold,
      italic:base.italic,
      underline:base.underline,
      text_color:base.text_color,
      bg_enabled:base.bg_enabled,
      bg_color:base.bg_color,
      bg_opacity:base.bg_opacity,
      box_radius:base.box_radius,
      stroke_width:base.stroke_width,
      stroke_color:base.stroke_color,
      double_stroke_width:base.double_stroke_width,
      double_stroke_color:base.double_stroke_color,
    }:{}),
    text:overrides.text!==undefined?overrides.text:`텍스트 #${nextIdx}`,
    badge:overrides.badge||'',
    x:overrides.x!==undefined?Number(overrides.x):50,
    y:nextY,
    ...overrides
  });
  videoTextLayers.push(newLayer);
  activeTextLayerId=newLayer.id;
  syncLegacyBackingStoreFromVideoTextLayers();
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  if(opts.select){
    selectVideoTextLayer(newLayer.id,{openInspectorTab:true,focusInput:Boolean(opts.focus)});
  }
  message(`텍스트 #${videoTextLayers.length} 레이어를 추가했습니다. 미리보기 화면에서 클릭·드래그하거나 우측에서 수정하세요.`);
  return newLayer;
}

function duplicateActiveVideoTextLayer(){
  const cur=getActiveVideoTextLayer();
  if(!cur){
    return addVideoTextLayer({},{select:true,focus:true});
  }
  return addVideoTextLayer({
    ...cur,
    id:'text_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    x:Math.min(88,Math.max(12,Number(cur.x||50))),
    y:Math.min(88,Math.max(12,Number(cur.y||50)+10))
  },{select:true,focus:true});
}

function deleteVideoTextLayer(layerId){
  const targetId=layerId||activeTextLayerId;
  const idx=videoTextLayers.findIndex(l=>l&&l.id===targetId);
  if(idx<0)return;
  pushEditorUndoSnapshot();
  videoTextLayers.splice(idx,1);
  if(videoTextLayers.length){
    const nextIdx=Math.min(idx,videoTextLayers.length-1);
    activeTextLayerId=videoTextLayers[nextIdx].id;
  }else{
    activeTextLayerId='';
  }
  syncLegacyBackingStoreFromVideoTextLayers();
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message(videoTextLayers.length?`선택한 텍스트를 삭제했습니다. (남은 텍스트 ${videoTextLayers.length}개)`:'모든 텍스트가 삭제되었습니다. [+ 텍스트 추가]로 언제든 새 텍스트를 넣을 수 있습니다.');
}

function clearAllVideoTextLayers(){
  if(!videoTextLayers.length&&!($('overlay-title-text')?.value||'').trim()&&!($('overlay-korean-text')?.value||'').trim()){
    message('화면에 삭제할 텍스트가 없습니다.');
    return;
  }
  pushEditorUndoSnapshot();
  videoTextLayers=[];
  activeTextLayerId='';
  if($('overlay-title-text'))$('overlay-title-text').value='';
  if($('overlay-title-badge'))$('overlay-title-badge').value='';
  if($('overlay-korean-text'))$('overlay-korean-text').value='';
  if($('inspector-text-input'))$('inspector-text-input').value='';
  if($('inspector-badge-input'))$('inspector-badge-input').value='';
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('화면의 모든 텍스트를 전부 삭제했습니다.');
}

window.selectVideoTextLayer=selectVideoTextLayer;
window.syncCapcutInspectorFromBacking=syncCapcutInspectorFromBacking;
window.addVideoTextLayer=addVideoTextLayer;
window.deleteVideoTextLayer=deleteVideoTextLayer;
window.clearAllVideoTextLayers=clearAllVideoTextLayers;
window.getVideoTextLayers=()=>videoTextLayers;

function captureEditorStateSnapshot(){
  return {
    jobId:job?.id||'',
    text_layers:JSON.parse(JSON.stringify(videoTextLayers||[])),
    active_layer_id:activeTextLayerId||'',
    erase_mode:$('text-erase-mode')?.value||'none',
    mask_x:$('mask-x')?.value||'6',
    mask_y:$('mask-y')?.value||'72',
    mask_w:$('mask-w')?.value||'88',
    mask_h:$('mask-h')?.value||'18',
    mask_color:$('erase-mask-color')?.value||'#0f172a',
    mask_opacity:$('erase-mask-opacity')?.value||'92',
    toggle_mask_box:Boolean($('toggle-mask-box')?.checked),
    video_zoom:$('video-zoom-scale')?.value||'100',
    focus_x:$('video-zoom-focus-x')?.value||'50',
    focus_y:$('video-zoom-focus-y')?.value||'50',
    script:$('script')?.value||''
  };
}
function applyEditorStateSnapshot(snap){
  if(!snap)return;
  isApplyingDraftOrUndo=true;
  try{
    if(Array.isArray(snap.text_layers)){
      videoTextLayers=snap.text_layers.map(l=>createDefaultVideoTextLayer(l));
      activeTextLayerId=snap.active_layer_id||(videoTextLayers[0]?.id||'');
    }else{
      const migrated=[];
      if((snap.title_text||'').trim()){
        migrated.push(createDefaultVideoTextLayer({
          id:'text_legacy_title',
          text:snap.title_text,
          badge:snap.title_badge||'',
          preset:snap.title_color||'reels_giant_yellow_impact',
          bg_enabled:(snap.title_bg??'1')!=='0',
          size:Number(snap.title_size||54),
          font:snap.title_font||'heavy_kr',
          box_w:Number(snap.title_box_w||0)===84?0:Number(snap.title_box_w||0),
          box_h:Number(snap.title_box_h||0),
          box_radius:Number(snap.title_box_radius??18),
          stroke_width:Number(snap.title_stroke_width??4),
          stroke_color:snap.title_stroke_color||'#000000',
          double_stroke_width:Number(snap.title_double_stroke_width??0),
          double_stroke_color:snap.title_double_stroke_color||'#facc15',
          bold:(snap.title_bold??'1')!=='0',
          italic:snap.title_italic==='1',
          underline:snap.title_underline==='1',
          text_color:snap.title_text_color||'#ffea18',
          bg_color:snap.title_bg_color||'#0e1018',
          bg_opacity:Number(snap.title_bg_opacity??88),
          letter_spacing:Number(snap.title_letter_spacing||0),
          line_spacing:Number(snap.title_line_spacing||1.18),
          align:snap.title_align||'center',
          scale_pct:Number(snap.title_scale_pct||100),
          opacity:Number(snap.title_opacity??100),
          x:Number(snap.title_x??50),
          y:Number(snap.title_y??18)
        }));
      }
      if((snap.overlay_text||'').trim()){
        migrated.push(createDefaultVideoTextLayer({
          id:'text_legacy_sub',
          text:snap.overlay_text,
          preset:snap.overlay_style==='highlight'?'black':(snap.overlay_style==='outline'?'outline':'reels_rounded_black'),
          bg_enabled:(snap.overlay_bg??'1')!=='0'&&snap.overlay_style!=='outline',
          size:Number(snap.overlay_size||42),
          font:snap.overlay_font||'sans',
          box_w:Number(snap.overlay_box_w||0),
          box_h:Number(snap.overlay_box_h||0),
          box_radius:Number(snap.overlay_box_radius??22),
          stroke_width:Number(snap.overlay_stroke_width??3),
          stroke_color:snap.overlay_stroke_color||'#000000',
          double_stroke_width:Number(snap.overlay_double_stroke_width??0),
          double_stroke_color:snap.overlay_double_stroke_color||'#facc15',
          bold:(snap.overlay_bold??'1')!=='0',
          italic:snap.overlay_italic==='1',
          underline:snap.overlay_underline==='1',
          text_color:snap.overlay_text_color||'#ffffff',
          bg_color:snap.overlay_bg_color||'#0e1018',
          bg_opacity:Number(snap.overlay_bg_opacity??88),
          letter_spacing:Number(snap.overlay_letter_spacing||0),
          line_spacing:Number(snap.overlay_line_spacing||1.22),
          align:snap.overlay_align||'center',
          scale_pct:Number(snap.overlay_scale_pct||100),
          opacity:Number(snap.overlay_opacity??100),
          x:snap.overlay_x!==''&&snap.overlay_x!==undefined?Number(snap.overlay_x):50,
          y:snap.overlay_y!==''&&snap.overlay_y!==undefined?Number(snap.overlay_y):78
        }));
      }
      videoTextLayers=migrated;
      activeTextLayerId=videoTextLayers[0]?.id||'';
    }
    syncLegacyBackingStoreFromVideoTextLayers();
    if($('text-erase-mode')&&snap.erase_mode)$('text-erase-mode').value=snap.erase_mode;
    if($('mask-x')&&snap.mask_x!==undefined)$('mask-x').value=snap.mask_x;
    if($('mask-y')&&snap.mask_y!==undefined)$('mask-y').value=snap.mask_y;
    if($('mask-w')&&snap.mask_w!==undefined)$('mask-w').value=snap.mask_w;
    if($('mask-h')&&snap.mask_h!==undefined)$('mask-h').value=snap.mask_h;
    if($('erase-mask-color')&&snap.mask_color)$('erase-mask-color').value=snap.mask_color;
    if($('erase-mask-opacity')&&snap.mask_opacity!==undefined){
      $('erase-mask-opacity').value=snap.mask_opacity;
      if($('erase-mask-opacity-range'))$('erase-mask-opacity-range').value=snap.mask_opacity;
    }
    if($('toggle-mask-box')&&snap.toggle_mask_box!==undefined)$('toggle-mask-box').checked=Boolean(snap.toggle_mask_box)&&(activeEditTab==='erase');
    if($('video-zoom-scale')&&snap.video_zoom!==undefined){
      $('video-zoom-scale').value=snap.video_zoom;
      if($('video-zoom-scale-range'))$('video-zoom-scale-range').value=snap.video_zoom;
    }
    if($('video-zoom-focus-x')&&snap.focus_x!==undefined)$('video-zoom-focus-x').value=snap.focus_x;
    if($('video-zoom-focus-y')&&snap.focus_y!==undefined)$('video-zoom-focus-y').value=snap.focus_y;
    if($('script')&&snap.script!==undefined){$('script').value=snap.script;if($('body'))$('body').value=snap.script;writingCounts();}
  }finally{
    isApplyingDraftOrUndo=false;
  }
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
}
function pushEditorUndoSnapshot(){
  if(isApplyingDraftOrUndo||!job)return;
  const snap=captureEditorStateSnapshot();
  const json=JSON.stringify(snap);
  if(json===lastUndoSnapshotJson)return;
  if(lastUndoSnapshotJson){
    try{
      const prev=JSON.parse(lastUndoSnapshotJson);
      if(prev.jobId===job.id){
        editorUndoStack.push(prev);
        if(editorUndoStack.length>40)editorUndoStack.shift();
      }
    }catch{}
  }
  lastUndoSnapshotJson=json;
}
function performEditorUndo(){
  if(!job)return false;
  while(editorUndoStack.length){
    const prev=editorUndoStack.pop();
    if(prev&&prev.jobId===job.id){
      lastUndoSnapshotJson=JSON.stringify(prev);
      applyEditorStateSnapshot(prev);
      message('이전 편집 상태로 되돌렸습니다 (Ctrl+Z).');
      return true;
    }
  }
  message('되돌릴 이전 편집 내역이 없습니다.');
  return false;
}
window.pushEditorUndoSnapshot=pushEditorUndoSnapshot;
window.performEditorUndo=performEditorUndo;
function saveActiveJobLocalDraft(){
  if(!job?.id||isApplyingDraftOrUndo)return;
  try{
    localStorage.setItem('takoh-active-job-id',job.id);
    const snap=captureEditorStateSnapshot();
    localStorage.setItem('takoh-job-draft-'+job.id,JSON.stringify({updatedAt:Date.now(),snap}));
  }catch{}
}
function restoreActiveJobLocalDraft(jobId){
  if(!jobId)return false;
  try{
    const raw=localStorage.getItem('takoh-job-draft-'+jobId);
    if(!raw)return false;
    const parsed=JSON.parse(raw);
    if(parsed?.snap&&parsed.snap.jobId===jobId){
      const serverUpdated=Math.max(Number(job?.text_edit?.updated_at||0),Number(job?.draft?.generated_at||0))*1000;
      if(!serverUpdated||parsed.updatedAt>=serverUpdated-1000){
        applyEditorStateSnapshot(parsed.snap);
        return true;
      }
    }
  }catch{}
  return false;
}
function resolvePreviewFontSizePx(rawVal,defaultPx,stageWidth){
  let px=Number(rawVal);
  if(!Number.isFinite(px)||px<=0)px=defaultPx;
  if(px<15)px=Math.round((px/100)*1080);
  const scale=Math.max(0.28,Math.min(0.88,(stageWidth||360)/1080));
  return Math.max(8,Math.min(96,Math.round(px*scale*10)/10));
}
function hexToRgbaCss(hexStr,alpha){
  const h=String(hexStr||'#0f172a').replace('#','').trim();
  let r=15,g=23,b=42;
  if(h.length===3){
    r=parseInt(h[0]+h[0],16)||15;
    g=parseInt(h[1]+h[1],16)||23;
    b=parseInt(h[2]+h[2],16)||42;
  }else if(h.length>=6){
    r=parseInt(h.slice(0,2),16)||15;
    g=parseInt(h.slice(2,4),16)||23;
    b=parseInt(h.slice(4,6),16)||42;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0.15,Math.min(1,Number(alpha)||0.92))})`;
}

function bindMultiTextLayerChipEvents(chip,lyr){
  const canvas=$('player-overlay-canvas');
  if(!chip||!canvas)return;
  let mode=null,resizeDir='',grabOffsetX=0,grabOffsetY=0;
  let startClientX=0,startClientY=0,startW=0,startH=0,startFontPx=54;
  let movedDistance=0;
  const updateFromEvent=e=>{
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=10||rect.height<=10)return;
    movedDistance+=Math.hypot(e.clientX-startClientX,e.clientY-startClientY);
    if(mode==='resize'){
      const dxPct=((e.clientX-startClientX)/rect.width)*100;
      const dyPct=((e.clientY-startClientY)/rect.height)*100;
      let nextW=startW,nextH=startH;
      if(resizeDir.includes('e'))nextW=startW+dxPct*2;
      if(resizeDir.includes('w'))nextW=startW-dxPct*2;
      if(resizeDir.includes('s'))nextH=startH+dyPct*2;
      if(resizeDir.includes('n'))nextH=startH-dyPct*2;
      const hasHoriz=resizeDir.includes('e')||resizeDir.includes('w');
      const hasVert=resizeDir.includes('n')||resizeDir.includes('s');
      let clampedW=startW,clampedH=startH;
      if(hasHoriz){
        clampedW=Math.round(Math.max(20,Math.min(96,nextW)));
        lyr.box_w=clampedW;
      }
      if(hasVert){
        clampedH=Math.round(Math.max(6,Math.min(60,nextH)));
        lyr.box_h=clampedH;
      }
      const ratioW=startW>0?(clampedW/startW):1;
      const ratioH=startH>0?(clampedH/startH):1;
      let scaleRatio=1;
      if(hasHoriz&&hasVert)scaleRatio=(ratioW*0.65)+(ratioH*0.35);
      else if(hasHoriz)scaleRatio=ratioW;
      else if(hasVert)scaleRatio=ratioH;
      lyr.size=Math.round(Math.max(18,Math.min(140,startFontPx*scaleRatio)));
      syncLegacyBackingStoreFromVideoTextLayers();
      syncDraggableOverlayCanvas();
      return;
    }
    const cRect=chip.getBoundingClientRect();
    let minX=8,maxX=92,minY=8,maxY=92;
    if(cRect.width>0){
      const halfW=((cRect.width/2+6)/rect.width)*100;
      minX=Math.min(50,Math.max(6,halfW));
      maxX=Math.max(50,Math.min(94,100-halfW));
    }
    if(cRect.height>0){
      const halfH=((cRect.height/2+6)/rect.height)*100;
      minY=Math.min(50,Math.max(6,halfH));
      maxY=Math.max(50,Math.min(94,100-halfH));
    }
    const rawX=(((e.clientX-grabOffsetX)-rect.left)/rect.width)*100;
    const rawY=(((e.clientY-grabOffsetY)-rect.top)/rect.height)*100;
    let clampedX=Math.round(Math.max(minX,Math.min(maxX,rawX)));
    let clampedY=Math.round(Math.max(minY,Math.min(maxY,rawY)));
    const guideX=$('magnetic-guide-x'),guideY=$('magnetic-guide-y'),guideYLabel=$('magnetic-guide-y-label');
    let snappedX=false,snappedY=false;
    if(!e.altKey){
      if(Math.abs(clampedX-50)<=4.5){
        clampedX=50;
        snappedX=true;
      }
      if(Math.abs(clampedY-50)<=3.5){
        clampedY=50;
        snappedY=true;
        if(guideY){guideY.style.top='50%';if(guideYLabel)guideYLabel.textContent='정중앙 (50%)';}
      }else if(Math.abs(clampedY-18)<=2.8){
        clampedY=18;
        snappedY=true;
        if(guideY){guideY.style.top='18%';if(guideYLabel)guideYLabel.textContent='상단 기준선 (18%)';}
      }else if(Math.abs(clampedY-78)<=2.8){
        clampedY=78;
        snappedY=true;
        if(guideY){guideY.style.top='78%';if(guideYLabel)guideYLabel.textContent='하단 기준선 (78%)';}
      }
    }
    if(guideX)guideX.hidden=!snappedX;
    if(guideY)guideY.hidden=!snappedY;
    chip.classList.toggle('snapped-center-x',snappedX);
    chip.classList.toggle('snapped-center-y',snappedY);
    lyr.x=clampedX;
    lyr.y=clampedY;
    syncLegacyBackingStoreFromVideoTextLayers();
    syncDraggableOverlayCanvas();
  };
  chip.addEventListener('pointerdown',e=>{
    const delBtn=e.target.closest('[data-chip-delete-id]');
    if(delBtn){
      e.preventDefault();
      e.stopPropagation();
      deleteVideoTextLayer(lyr.id);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    pushEditorUndoSnapshot();
    movedDistance=0;
    activeTextLayerId=lyr.id;
    const handle=e.target.closest('.resize-handle');
    const rect=canvas.getBoundingClientRect();
    const chipRect=chip.getBoundingClientRect();
    startClientX=e.clientX;
    startClientY=e.clientY;
    if(handle&&rect.width>10&&rect.height>10){
      mode='resize';
      resizeDir=handle.dataset.resizeDir||'se';
      startW=Number(lyr.box_w)>0?Number(lyr.box_w):((chipRect.width/rect.width)*100)||50;
      startH=Number(lyr.box_h)>0?Number(lyr.box_h):((chipRect.height/rect.height)*100)||14;
      startFontPx=Number(lyr.size||54);
      chip.classList.add('resizing');
    }else{
      mode='move';
      const chipCenterX=chipRect.left+chipRect.width/2;
      const chipCenterY=chipRect.top+chipRect.height/2;
      grabOffsetX=e.clientX-chipCenterX;
      grabOffsetY=e.clientY-chipCenterY;
      chip.classList.add('dragging');
    }
    try{chip.setPointerCapture(e.pointerId);}catch{}
    updateFromEvent(e);
  });
  chip.addEventListener('pointermove',e=>{
    if(!mode)return;
    e.preventDefault();
    updateFromEvent(e);
  });
  const stopDrag=e=>{
    if(!mode)return;
    const wasTap=(movedDistance<6);
    mode=null;
    chip.classList.remove('dragging','resizing','snapped-center-x','snapped-center-y');
    const guideX=$('magnetic-guide-x'),guideY=$('magnetic-guide-y');
    if(guideX)guideX.hidden=true;
    if(guideY)guideY.hidden=true;
    try{chip.releasePointerCapture(e.pointerId);}catch{}
    saveActiveJobLocalDraft();
    if(wasTap){
      selectVideoTextLayer(lyr.id,{openInspectorTab:true,focusInput:true});
    }
  };
  chip.addEventListener('pointerup',stopDrag);
  chip.addEventListener('pointercancel',stopDrag);
}

function renderSingleTextLayerBoxStyle(chip,txtEl,kickerEl,lyr,stageW,stageScale,cRect){
  const tVal=(lyr.text||'').trim();
  const tBadge=(lyr.badge||'').trim();
  const tCol=lyr.preset||'reels_giant_yellow_impact';
  const tUseBg=Boolean(lyr.bg_enabled)&&tCol!=='outline';
  const tFontKey=lyr.font||'heavy_kr';
  const tFontCss=CSS_FONT_MAP[tFontKey]||CSS_FONT_MAP.heavy_kr;
  const tScalePct=Math.max(50,Math.min(200,Number(lyr.scale_pct||100)));
  const rawSizePx=Number(lyr.size||54)*(tScalePct/100);
  const basePx=resolvePreviewFontSizePx(rawSizePx,54,stageW);
  const l1Px=Math.max(9,Math.round(basePx*0.82*10)/10);
  const l2Px=Math.max(10,Math.round(basePx*1.12*10)/10);
  const tBoxRadRaw=Math.max(0,Math.min(80,Number(lyr.box_radius??18)));
  const tBoxRadCss=`${Math.round(tBoxRadRaw*stageScale*1.15)}px`;
  const tStrokeW=Math.max(0,Math.min(24,Number(lyr.stroke_width??4)));
  const tStrokeC=lyr.stroke_color||'#000000';
  const tDStrokeW=Math.max(0,Math.min(24,Number(lyr.double_stroke_width??0)));
  const tDStrokeC=lyr.double_stroke_color||'#facc15';
  const tStrokeShadow=buildLiveDoubleStrokeTextShadow(tStrokeW,tStrokeC,tDStrokeW,tDStrokeC,stageW,'0 2px 6px rgba(0,0,0,0.85)');

  const tBold=Boolean(lyr.bold);
  const tItalic=Boolean(lyr.italic);
  const tUnderline=Boolean(lyr.underline);
  const tTextColor=lyr.text_color||'';
  const tBgColor=lyr.bg_color||'#0e1018';
  const tBgOpacity=Math.max(0,Math.min(100,Number(lyr.bg_opacity??88)));
  const tLetterSpacing=Math.max(-4,Math.min(24,Number(lyr.letter_spacing||0)));
  const tLineSpacing=Math.max(0.85,Math.min(2.2,Number(lyr.line_spacing||1.20)));
  const tAlign=lyr.align||'center';
  const tOpacity=Math.max(15,Math.min(100,Number(lyr.opacity??100)));

  const fwCss=tBold?'900':'400';
  const fsCss=tItalic?'italic':'normal';
  const tdCss=tUnderline?'underline':'none';
  const lsCss=`${(tLetterSpacing*stageScale).toFixed(1)}px`;
  const commonTypoStyle=`font-weight:${fwCss};font-style:${fsCss};text-decoration:${tdCss};letter-spacing:${lsCss};line-height:${tLineSpacing};text-align:${tAlign};`;

  chip.style.fontFamily=tFontCss;
  chip.style.textAlign=tAlign;
  chip.style.opacity=String(tOpacity/100);
  chip.classList.toggle('no-bg-box',!tUseBg);
  chip.classList.toggle('active-selected-layer',lyr.id===activeTextLayerId);
  txtEl.style.fontFamily=tFontCss;
  txtEl.style.fontSize=`${basePx}px`;
  txtEl.style.textAlign=tAlign;

  const boxW=Number(lyr.box_w||0);
  const boxH=Number(lyr.box_h||0);
  if(boxW>=20&&boxW<=98){
    chip.style.width=`${boxW}%`;
    chip.style.maxWidth=`${boxW}%`;
  }else{
    chip.style.width='fit-content';
    chip.style.maxWidth='92%';
  }
  if(boxH>=6&&boxH<=65){
    chip.style.minHeight=`${boxH}%`;
  }else{
    chip.style.minHeight='';
  }

  const rawLines=tVal.replace(/\|/g,'\n').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const l1=rawLines[0]||tVal;
  const l2=rawLines.slice(1).join(' ');
  const primaryTextCol=tTextColor||'#ffea18';
  const tFontInline=tFontCss.replace(/"/g,"'");
  if(tCol==='reels_giant_yellow_impact'){
    txtEl.innerHTML=l2?`<div style="color:#ffffff;font-size:${l1Px}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div><div style="color:${primaryTextCol};font-size:${l2Px}px;font-family:${tFontInline};margin-top:2px;${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l2)}</div>`:`<div style="color:${primaryTextCol};font-size:${basePx}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div>`;
    chip.style.background=tUseBg?hexToRgbaCss(tBgColor||'#080a10',tBgOpacity/100):'transparent';
    chip.style.border=tUseBg?'1px solid rgba(255,234,24,0.65)':'1px dashed rgba(255,255,255,0.28)';
  }else if(tCol==='reels_rounded_black'){
    const cCol=tTextColor||'#ffffff';
    txtEl.innerHTML=rawLines.map(ln=>`<div style="color:${cCol};font-size:${basePx}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(ln)}</div>`).join('');
    chip.style.background=tUseBg?hexToRgbaCss(tBgColor||'#0a0a0c',tBgOpacity/100):'transparent';
    chip.style.border=tUseBg?'1.5px solid rgba(255,255,255,0.22)':'1px dashed rgba(255,255,255,0.28)';
  }else if(tCol==='reels_top_banner_pink'){
    txtEl.innerHTML=l2?`<div style="color:#ffffff;font-size:${l1Px}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div><div style="display:inline-block;background:${tUseBg?'#eab0d5':'transparent'};color:${tUseBg?'#111114':'#f5b4c8'};font-size:${basePx}px;font-family:${tFontInline};padding:${tUseBg?'1px 7px':'0'};border-radius:${tBoxRadCss};margin-top:2px;${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l2)}</div>`:`<div style="display:inline-block;background:${tUseBg?'#eab0d5':'transparent'};color:${tUseBg?'#111114':'#f5b4c8'};font-size:${basePx}px;font-family:${tFontInline};padding:${tUseBg?'1px 7px':'0'};border-radius:${tBoxRadCss};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div>`;
    chip.style.background=tUseBg?hexToRgbaCss(tBgColor||'#050508',tBgOpacity/100):'transparent';
    chip.style.border=tUseBg?'1px solid rgba(234,176,213,0.6)':'1px dashed rgba(255,255,255,0.28)';
  }else if(tCol==='reels_3d_pop_shadow'){
    const popShadow=buildLiveDoubleStrokeTextShadow(Math.max(3,tStrokeW),tStrokeC,tDStrokeW,tDStrokeC,stageW,'3px 4px 0 #000');
    const cCol=tTextColor||'#ffffff';
    txtEl.innerHTML=rawLines.map(ln=>`<div style="color:${cCol};font-size:${basePx}px;font-family:${tFontInline};transform:rotate(-3deg);${commonTypoStyle}text-shadow:${popShadow};">${formatHighlightPreviewHtml(ln)}</div>`).join('');
    chip.style.background=tUseBg?hexToRgbaCss(tBgColor||'#0c0e16',tBgOpacity/100):'transparent';
    chip.style.border=tUseBg?'1px solid rgba(255,255,255,0.35)':'1px dashed rgba(255,255,255,0.28)';
  }else if(tCol==='reels_neon_green_glow'){
    const neonShadow=buildLiveDoubleStrokeTextShadow(tStrokeW,tStrokeC,tDStrokeW,tDStrokeC,stageW,'0 0 10px rgba(50,255,80,0.85), 0 2px 4px #000');
    const cCol=tTextColor||'#52ff5c';
    txtEl.innerHTML=l2?`<div style="color:#ffffff;font-size:${l1Px}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div><div style="color:${cCol};font-size:${l2Px}px;font-family:${tFontInline};margin-top:2px;${commonTypoStyle}text-shadow:${neonShadow};">${formatHighlightPreviewHtml(l2)}</div>`:`<div style="color:${cCol};font-size:${basePx}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${neonShadow};">${formatHighlightPreviewHtml(l1)}</div>`;
    chip.style.background=tUseBg?hexToRgbaCss(tBgColor||'#0a0e12',tBgOpacity/100):'transparent';
    chip.style.border=tUseBg?'1px solid rgba(82,255,92,0.55)':'1px dashed rgba(255,255,255,0.28)';
  }else if(tCol==='reels_editorial_split'){
    txtEl.innerHTML=l2?`<div style="color:#ffffff;font-size:${l1Px}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div><div style="display:inline-block;background:${tUseBg?'rgba(12,14,18,0.92)':'transparent'};color:${primaryTextCol};border:${tUseBg?`1.5px solid ${primaryTextCol}`:'none'};font-size:${basePx}px;font-family:${tFontInline};padding:${tUseBg?'1px 7px':'0'};border-radius:${tBoxRadCss};margin-top:2px;${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l2)}</div>`:`<div style="color:${primaryTextCol};font-size:${basePx}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(l1)}</div>`;
    chip.style.background=tUseBg?hexToRgbaCss(tBgColor||'#0e1018',tBgOpacity/100):'transparent';
    chip.style.border=tUseBg?'1px solid rgba(255,234,24,0.6)':'1px dashed rgba(255,255,255,0.28)';
  }else{
    const fallbackCol=tTextColor||(tCol==='black'?'#141418':(tCol==='white'?'#ffffff':(tCol==='mint'?'#6effd8':'#ffe840')));
    txtEl.innerHTML=`<div style="color:${fallbackCol};font-size:${basePx}px;font-family:${tFontInline};${commonTypoStyle}text-shadow:${tStrokeShadow};">${formatHighlightPreviewHtml(tVal)}</div>`;
    chip.style.color=fallbackCol;
    chip.style.background=(!tUseBg||tCol==='outline')?'transparent':(tCol==='black'?'rgba(255,255,255,0.95)':hexToRgbaCss(tBgColor||'#0e1018',tBgOpacity/100));
    chip.style.border=tUseBg?'1px solid rgba(255,255,255,0.22)':'1px dashed rgba(255,255,255,0.28)';
  }
  chip.style.borderRadius=tBoxRadCss;
  if(kickerEl){
    kickerEl.hidden=!tBadge;
    kickerEl.textContent=tBadge||'';
  }
  const bRect=chip.getBoundingClientRect();
  let minX=8,maxX=92,minY=8,maxY=92;
  if(cRect&&cRect.width>20&&bRect.width>0){
    const halfW=((bRect.width/2+6)/cRect.width)*100;
    minX=Math.min(50,Math.max(6,halfW));
    maxX=Math.max(50,Math.min(94,100-halfW));
  }
  if(cRect&&cRect.height>20&&bRect.height>0){
    const halfH=((bRect.height/2+6)/cRect.height)*100;
    minY=Math.min(50,Math.max(6,halfH));
    maxY=Math.max(50,Math.min(94,100-halfH));
  }
  const tx=Number(lyr.x??50);
  const ty=Number(lyr.y??50);
  chip.style.left=`${Math.max(minX,Math.min(maxX,tx))}%`;
  chip.style.top=`${Math.max(minY,Math.min(maxY,ty))}%`;
}

function syncDraggableOverlayCanvas(){
  const titleBox=$('drag-title-box');
  const subBox=$('drag-subtitle-box');
  const maskBox=$('drag-mask-box'),maskBadge=$('drag-mask-badge'),maskLabel=$('drag-mask-label');
  if(titleBox)titleBox.hidden=true;
  if(subBox)subBox.hidden=true;
  const curStage=window.currentProductionStage||'analysis';
  const hideForCarousel=(curStage==='carousel');
  const canvas=$('player-overlay-canvas');
  const cRect=canvas?.getBoundingClientRect();
  const stageW=(cRect&&cRect.width>40)?cRect.width:360;
  const stageScale=Math.max(0.32,Math.min(0.88,stageW/1080));

  for(const [rId,nId,defV] of [
    ['carousel-stroke-width-range','carousel-stroke-width','0'],
    ['carousel-double-stroke-width-range','carousel-double-stroke-width','0'],
    ['erase-mask-opacity-range','erase-mask-opacity','92'],
    ['video-zoom-scale-range','video-zoom-scale','100']
  ]){
    const rEl=$(rId),nEl=$(nId);
    if(rEl&&nEl&&document.activeElement!==rEl){
      rEl.value=nEl.value||defV;
    }
  }

  // Sync Erase Mode Chips, Mask Box, and Live Video Zoom on Preview
  const eraseMode=$('text-erase-mode')?.value||'none';
  document.querySelectorAll('.erase-mode-chip').forEach(chip=>{
    const pick=chip.dataset.eraseModePick;
    const isMatch=(pick===eraseMode)||(pick==='auto_subtitles'&&(eraseMode==='auto_text'||eraseMode==='local_fill'));
    chip.classList.toggle('active',isMatch);
  });
  const maskToggleChecked=Boolean($('toggle-mask-box')?.checked);
  const onEraseTab=(curStage==='editing'&&activeEditTab==='erase');
  const showMaskBox=Boolean(job)&&!hideForCarousel&&(maskToggleChecked||(onEraseTab&&eraseMode!=='none'));
  const mx=Math.max(0,Math.min(95,Number($('mask-x')?.value??6)));
  const my=Math.max(0,Math.min(95,Number($('mask-y')?.value??72)));
  const mw=Math.max(5,Math.min(100-mx,Number($('mask-w')?.value??88)));
  const mh=Math.max(4,Math.min(100-my,Number($('mask-h')?.value??18)));
  const maskColor=$('erase-mask-color')?.value||'#0f172a';
  const maskOpacityPct=Math.max(20,Math.min(100,Number($('erase-mask-opacity')?.value??92)));
  if(maskBox){
    maskBox.hidden=!showMaskBox;
    const visualMode=eraseMode==='none'?'blur_subtitles':eraseMode;
    maskBox.dataset.eraseMode=visualMode;
    maskBox.style.setProperty('--mask-cover-bg',hexToRgbaCss(maskColor,maskOpacityPct/100));
    const cx=mx+mw/2;
    const cy=my+mh/2;
    maskBox.style.left=`${cx}%`;
    maskBox.style.top=`${cy}%`;
    maskBox.style.width=`${mw}%`;
    maskBox.style.maxWidth=`${mw}%`;
    maskBox.style.height=`${mh}%`;
    maskBox.style.minHeight=`${mh}%`;
    const modeLabelMap={
      none:'마스크 영역 미리보기',
      blur_subtitles:'자막 흐림(블러) 마스크',
      cover_subtitles:`덮어씌우기 마스크 (${maskOpacityPct}%)`,
      auto_subtitles:'AI 자막 완전 삭제 영역',
      auto_text:'AI 전체 글자 완전 삭제',
      local_fill:'지정 마스크 정밀 삭제'
    };
    const lbl=modeLabelMap[eraseMode]||'자막·워터마크 마스크';
    if(maskBadge)maskBadge.textContent=lbl;
    if(maskLabel)maskLabel.textContent=`${lbl} (${Math.round(mx)}%, ${Math.round(my)}% · ${Math.round(mw)}×${Math.round(mh)}%)`;
  }

  // Live Video / Image Zoom Preview
  const zoomScalePct=Math.max(100,Math.min(160,Number($('video-zoom-scale')?.value||100)));
  const focusX=Math.max(0,Math.min(100,Number($('video-zoom-focus-x')?.value??50)));
  const focusY=Math.max(0,Math.min(100,Number($('video-zoom-focus-y')?.value??50)));
  if($('video-zoom-badge')){
    $('video-zoom-badge').textContent=zoomScalePct>100.4?`${Math.round(zoomScalePct)}% 확대 (초점 ${Math.round(focusX)}%, ${Math.round(focusY)}%)`:'100% (원본)';
  }
  const vidEl=$('preview'),imgEl=$('image-preview');
  const zoomFactor=zoomScalePct/100;
  for(const mediaEl of [vidEl,imgEl]){
    if(!mediaEl)continue;
    if(!hideForCarousel&&zoomFactor>1.004){
      mediaEl.style.transformOrigin=`${focusX}% ${focusY}%`;
      mediaEl.style.transform=`scale(${zoomFactor.toFixed(3)})`;
    }else{
      mediaEl.style.transformOrigin='50% 50%';
      mediaEl.style.transform='';
    }
  }
  if($('text-erase-summary-readonly')){
    const eraseSummaryMap={
      none:'원본 유지',
      blur_subtitles:`흐림(블러) [마스크 ${Math.round(mw)}×${Math.round(mh)}%]`,
      cover_subtitles:`덮어씌우기 [색상 ${maskColor} · ${maskOpacityPct}%]`,
      auto_subtitles:'완전 삭제 (AI 하단 자막 복원)',
      auto_text:'완전 삭제 (AI 화면 전체 글자 제거)',
      local_fill:`지정 마스크 복원 [${Math.round(mx)}%, ${Math.round(my)}%]`
    };
    $('text-erase-summary-readonly').value=`${eraseSummaryMap[eraseMode]||'원본 유지'} · 화면 확대 ${Math.round(zoomScalePct)}%`;
  }

  // Render Multi-Text Layer Chips on Preview Stage
  const stageContainer=$('multi-text-layers-stage');
  if(stageContainer){
    if(!job||hideForCarousel||!videoTextLayers.length){
      stageContainer.replaceChildren();
    }else{
      const existingMap=new Map();
      stageContainer.querySelectorAll('.draggable-multi-text-chip').forEach(el=>{
        existingMap.set(el.dataset.layerId,el);
      });
      const activeIds=new Set();
      videoTextLayers.forEach((lyr,idx)=>{
        const tVal=(lyr.text||'').trim();
        if(!tVal)return;
        activeIds.add(lyr.id);
        let chip=existingMap.get(lyr.id);
        if(!chip){
          chip=document.createElement('div');
          chip.className='draggable-overlay-chip draggable-title-chip draggable-multi-text-chip';
          chip.dataset.layerId=lyr.id;
          chip.title='클릭하여 텍스트 편집 · 드래그해 위치 이동 · 모서리 핸들로 크기 조절';
          chip.innerHTML=`<button type="button" class="chip-floating-del-btn" data-chip-delete-id="${escapeHtml(lyr.id)}" title="이 텍스트 삭제">×</button><span class="drag-chip-badge" hidden></span><div class="drag-chip-content"></div><span class="resize-handle handle-n" data-resize-dir="n"></span><span class="resize-handle handle-s" data-resize-dir="s"></span><span class="resize-handle handle-w" data-resize-dir="w"></span><span class="resize-handle handle-e" data-resize-dir="e"></span><span class="resize-handle handle-nw" data-resize-dir="nw"></span><span class="resize-handle handle-ne" data-resize-dir="ne"></span><span class="resize-handle handle-sw" data-resize-dir="sw"></span><span class="resize-handle handle-se" data-resize-dir="se"></span>`;
          stageContainer.appendChild(chip);
          bindMultiTextLayerChipEvents(chip,lyr);
        }
        const txtEl=chip.querySelector('.drag-chip-content');
        const kickerEl=chip.querySelector('.drag-chip-badge');
        renderSingleTextLayerBoxStyle(chip,txtEl,kickerEl,lyr,stageW,stageScale,cRect);
      });
      existingMap.forEach((el,id)=>{
        if(!activeIds.has(id))el.remove();
      });
    }
  }

  syncCapcutInspectorFromBacking();
  if($('overlay-coord-readout')){
    const parts=[];
    if(showMaskBox){
      parts.push(`마스크 영역 (${Math.round(mx)}%, ${Math.round(my)}% · ${Math.round(mw)}×${Math.round(mh)}%)`);
    }
    if(zoomScalePct>100.4){
      parts.push(`화면 확대 ${Math.round(zoomScalePct)}%`);
    }
    videoTextLayers.forEach((lyr,idx)=>{
      if(!(lyr.text||'').trim())return;
      parts.push(`텍스트 #${idx+1} (${Math.round(lyr.x)}%, ${Math.round(lyr.y)}% · ${Math.round(lyr.size)}px)`);
    });
    $('overlay-coord-readout').textContent=parts.length?`현재 배치: ${parts.join(' · ')} (텍스트 클릭=수정, 드래그=이동, [+ 텍스트 추가]로 자유 추가, [전부 삭제] 지원)`:'현재 추가된 텍스트가 없습니다. 상단 [+ 텍스트 추가]를 누르거나 문구 입력란에 타이핑하면 텍스트가 생성됩니다.';
  }
}
window.syncDraggableOverlayCanvas=syncDraggableOverlayCanvas;
let activeEditTab='subtitle';
try{const savedTab=localStorage.getItem('takoh-active-edit-tab');if(savedTab&&['subtitle','erase','hook','bundle'].includes(savedTab))activeEditTab=savedTab;}catch{}
function selectEditTab(tabName){
  if(tabName==='carousel'){
    document.querySelector('[data-production-stage="carousel"]')?.click();
    return;
  }
  activeEditTab=tabName||'subtitle';
  try{localStorage.setItem('takoh-active-edit-tab',activeEditTab);}catch{}
  document.querySelectorAll('[data-edit-tab]').forEach(btn=>{
    const isMatch=btn.dataset.editTab===activeEditTab;
    btn.classList.toggle('active',isMatch);
    btn.setAttribute('aria-selected',String(isMatch));
  });
  document.querySelectorAll('[data-edit-panel]').forEach(panel=>{
    panel.hidden=(panel.dataset.editPanel!==activeEditTab);
  });
  if(activeEditTab!=='erase'&&$('toggle-mask-box')){
    $('toggle-mask-box').checked=false;
  }
  syncDraggableOverlayCanvas();
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
    }else if(window.selectStage){
      window.selectStage(stage);
    }
  });
});

function render(){
  if(job?.id){
    try{localStorage.setItem('takoh-active-job-id',job.id);}catch{}
  }
  if($('publish-job-summary'))$('publish-job-summary').textContent=job?'현재 작업: '+(job.name||job.id)+' · '+(names[job.status]||job.status):'콘텐츠 제작에서 작업을 선택해 주세요. 작업 없이도 게시 화면을 살펴볼 수 있습니다.';
  if($('production-job-summary'))$('production-job-summary').textContent=job?'현재 작업 · '+(job.name||job.id)+' · '+(names[job.status]||job.status):'먼저 레퍼런스를 고르거나 원본 파일을 불러오세요.';
  productDirty=false;
  renderEditor();
  updateProductionStepBadges();
  $('media').hidden=!job;
  const carouselTabBtn=document.querySelector('[data-edit-tab="carousel"]');
  const hookTabBtn=document.querySelector('[data-edit-tab="hook"]');
  if(carouselTabBtn){
    carouselTabBtn.disabled=!job;
  }
  if(hookTabBtn){
    hookTabBtn.disabled=!job||job.kind==='image';
    if(job?.kind==='image'&&activeEditTab==='hook')activeEditTab='subtitle';
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
  if($('source-post-translated-text')){
    $('source-post-translated-text').value=job?.source_text_ko||job?.analysis?.result?.source_translation||'';
  }
  if($('ocr-original-text')){
    const ocrCombined=job?.media_ocr?.combined_text||(job?.media_ocr?.texts||[]).join('\n')||'';
    $('ocr-original-text').value=ocrCombined;
  }
  const ocrTrans=job?.media_ocr?.translated_text||job?.media_ocr?.korean_translation||'';
  if($('overlay-korean-text')){
    if(job?.text_edit?.overlay_text!==undefined){
      $('overlay-korean-text').value=job.text_edit.overlay_text||'';
    }else if(ocrTrans){
      $('overlay-korean-text').value=ocrTrans;
    }
  }
  if($('overlay-title-text')){
    $('overlay-title-text').value=job?.text_edit?.title_text||'';
  }
  if($('overlay-title-badge')){
    $('overlay-title-badge').value=job?.text_edit?.title_badge||'';
  }
  if($('overlay-title-x'))$('overlay-title-x').value=job?.text_edit?.title_x??50;
  if($('overlay-title-y'))$('overlay-title-y').value=job?.text_edit?.title_y??14;
  if($('overlay-sub-x'))$('overlay-sub-x').value=job?.text_edit?.overlay_x??'';
  if($('overlay-sub-y'))$('overlay-sub-y').value=job?.text_edit?.overlay_y??'';
  if($('overlay-title-box-w')){
    const rawBw=Number(job?.text_edit?.title_box_w??0);
    const bw=(rawBw===84)?0:rawBw;
    $('overlay-title-box-w').value=String(bw);
    if($('overlay-title-box-w-val'))$('overlay-title-box-w-val').textContent=bw>=20?`${Math.round(bw)}%`:'자동';
  }
  if($('overlay-title-box-h')){
    const bh=job?.text_edit?.title_box_h??0;
    $('overlay-title-box-h').value=String(bh||0);
    if($('overlay-title-box-h-val'))$('overlay-title-box-h-val').textContent=Number(bh)>=6?`${Math.round(Number(bh))}%`:'자동';
  }
  if($('overlay-sub-box-w'))$('overlay-sub-box-w').value=job?.text_edit?.overlay_box_w??'';
  if($('overlay-sub-box-h'))$('overlay-sub-box-h').value=job?.text_edit?.overlay_box_h??'';
  if(job?.carousel){
    enforceSingleCardModeIfActive(job);
    if($('carousel-erase-mode'))$('carousel-erase-mode').value=job.carousel.erase_mode==='keep'?'none':(job.carousel.erase_mode||'cover_box');
    if($('carousel-ratio')&&job.carousel.aspect)$('carousel-ratio').value=job.carousel.aspect;
    if($('carousel-count')&&job.carousel.count)$('carousel-count').value=String(job.carousel.count);
    if($('carousel-text-pos')&&job.carousel.overlay_position)$('carousel-text-pos').value=job.carousel.overlay_position==='middle'?'center':job.carousel.overlay_position;
    if($('carousel-template')&&job.carousel.template){
      $('carousel-template').value=job.carousel.template;
      document.querySelectorAll('.carousel-tpl-chip').forEach(c=>c.classList.toggle('active',c.dataset.carouselTpl===job.carousel.template));
    }
    if($('carousel-font')&&job.carousel.font_family)$('carousel-font').value=job.carousel.font_family;
    if($('carousel-stroke-width')&&job.carousel.stroke_width!==undefined){
      $('carousel-stroke-width').value=String(job.carousel.stroke_width);
      if($('carousel-stroke-width-range'))$('carousel-stroke-width-range').value=String(job.carousel.stroke_width);
    }
    if($('carousel-stroke-color')&&job.carousel.stroke_color)$('carousel-stroke-color').value=job.carousel.stroke_color;
    if($('carousel-double-stroke-width')&&job.carousel.double_stroke_width!==undefined){
      $('carousel-double-stroke-width').value=String(job.carousel.double_stroke_width);
      if($('carousel-double-stroke-width-range'))$('carousel-double-stroke-width-range').value=String(job.carousel.double_stroke_width);
    }
    if($('carousel-double-stroke-color')&&job.carousel.double_stroke_color)$('carousel-double-stroke-color').value=job.carousel.double_stroke_color;
    if($('carousel-cover-title')&&job.carousel.cover_title){
      $('carousel-cover-title').value=job.carousel.cover_title.replace(/\n/g,' | ');
    }
    if(Array.isArray(job.carousel.slides)&&job.carousel.slides.length>1){
      const allAfterCover=job.carousel.slides.slice(1).map(s=>(s.text||'').replace(/\n/g,' | ')).filter(Boolean);
      if($('carousel-custom-texts')&&allAfterCover.length)$('carousel-custom-texts').value=allAfterCover.join('\n');
      if(job.carousel.slides.length>=3){
        if($('carousel-body-texts'))$('carousel-body-texts').value=allAfterCover.slice(0,-1).join('\n');
        if($('carousel-cta-text'))$('carousel-cta-text').value=allAfterCover[allAfterCover.length-1]||'';
      }else if(allAfterCover.length){
        if($('carousel-cta-text'))$('carousel-cta-text').value=allAfterCover[0]||'';
      }
    }
  }
  ensureCarouselStoryAutoPopulated(false);
  if($('toggle-mask-box'))$('toggle-mask-box').checked=false;
  if(job?.text_edit){
    if($('text-erase-mode')&&job.text_edit.erase_mode){
      const rawEm=job.text_edit.erase_mode;
      const emMap={keep:'none',cover_box:'none',blur_mask:'blur_subtitles',cover_mask:'cover_subtitles',inpaint_subtitles:'auto_subtitles',inpaint_all:'auto_text',inpaint_mask:'local_fill'};
      $('text-erase-mode').value=emMap[rawEm]||rawEm||'none';
    }
    if(job.text_edit.rectangle&&typeof job.text_edit.rectangle==='object'){
      const r=job.text_edit.rectangle;
      if($('mask-x')&&Number(r.w||0)>0)$('mask-x').value=String(Math.round(Number(r.x??6)));
      if($('mask-y')&&Number(r.h||0)>0)$('mask-y').value=String(Math.round(Number(r.y??72)));
      if($('mask-w')&&Number(r.w||0)>0)$('mask-w').value=String(Math.round(Number(r.w??88)));
      if($('mask-h')&&Number(r.h||0)>0)$('mask-h').value=String(Math.round(Number(r.h??18)));
    }
    if($('erase-mask-color')&&job.text_edit.mask_color)$('erase-mask-color').value=job.text_edit.mask_color;
    if($('erase-mask-opacity')&&job.text_edit.mask_opacity!==undefined){
      const opPct=Number(job.text_edit.mask_opacity)<=1?Math.round(Number(job.text_edit.mask_opacity)*100):Math.round(Number(job.text_edit.mask_opacity));
      $('erase-mask-opacity').value=String(opPct);
      if($('erase-mask-opacity-range'))$('erase-mask-opacity-range').value=String(opPct);
    }
    if($('video-zoom-scale')&&job.text_edit.video_zoom!==undefined){
      const vz=Math.round(Number(job.text_edit.video_zoom||100));
      $('video-zoom-scale').value=String(vz);
      if($('video-zoom-scale-range'))$('video-zoom-scale-range').value=String(vz);
    }
    if($('video-zoom-focus-x')&&job.text_edit.focus_x!==undefined)$('video-zoom-focus-x').value=String(Math.round(Number(job.text_edit.focus_x??50)));
    if($('video-zoom-focus-y')&&job.text_edit.focus_y!==undefined)$('video-zoom-focus-y').value=String(Math.round(Number(job.text_edit.focus_y??50)));
    if($('overlay-position')&&job.text_edit.overlay_position)$('overlay-position').value=job.text_edit.overlay_position==='middle'?'center':job.text_edit.overlay_position;
    if($('overlay-title-color')&&job.text_edit.title_color){
      $('overlay-title-color').value=job.text_edit.title_color;
      document.querySelectorAll('.video-hook-chip').forEach(c=>{
        const chipHook=c.dataset.videoHook||c.dataset.videoHookTpl;
        c.classList.toggle('active',chipHook===job.text_edit.title_color);
      });
    }
    if($('overlay-title-bg')&&job.text_edit.title_bg!==undefined)$('overlay-title-bg').value=job.text_edit.title_bg?'1':'0';
    if($('overlay-bg')&&job.text_edit.overlay_bg!==undefined)$('overlay-bg').value=job.text_edit.overlay_bg?'1':'0';
    if($('overlay-title-size')&&job.text_edit.title_size){
      const ts=Number(job.text_edit.title_size);
      $('overlay-title-size').value=String(ts<15?Math.round((ts/100)*1080):Math.round(ts));
    }
    if($('overlay-size')&&job.text_edit.overlay_size){
      const os=Number(job.text_edit.overlay_size);
      $('overlay-size').value=String(os<15?Math.round((os/100)*1080):Math.round(os));
    }
    if($('overlay-title-font')&&job.text_edit.title_font)$('overlay-title-font').value=job.text_edit.title_font;
    if($('overlay-font')&&job.text_edit.overlay_font)$('overlay-font').value=job.text_edit.overlay_font;
    if($('overlay-title-box-radius')&&job.text_edit.title_box_radius!==undefined&&job.text_edit.title_box_radius!==null){
      $('overlay-title-box-radius').value=String(job.text_edit.title_box_radius);
      if($('overlay-title-box-radius-range'))$('overlay-title-box-radius-range').value=String(job.text_edit.title_box_radius);
    }
    if($('overlay-box-radius')&&job.text_edit.overlay_box_radius!==undefined&&job.text_edit.overlay_box_radius!==null){
      $('overlay-box-radius').value=String(job.text_edit.overlay_box_radius);
      if($('overlay-box-radius-range'))$('overlay-box-radius-range').value=String(job.text_edit.overlay_box_radius);
    }
    if($('overlay-title-stroke-width')&&job.text_edit.title_stroke_width!==undefined&&job.text_edit.title_stroke_width!==null){
      $('overlay-title-stroke-width').value=String(job.text_edit.title_stroke_width);
      if($('overlay-title-stroke-width-range'))$('overlay-title-stroke-width-range').value=String(job.text_edit.title_stroke_width);
    }
    if($('overlay-title-stroke-color')&&job.text_edit.title_stroke_color)$('overlay-title-stroke-color').value=job.text_edit.title_stroke_color;
    if($('overlay-title-double-stroke-width')&&job.text_edit.title_double_stroke_width!==undefined){
      $('overlay-title-double-stroke-width').value=String(job.text_edit.title_double_stroke_width);
      if($('overlay-title-double-stroke-width-range'))$('overlay-title-double-stroke-width-range').value=String(job.text_edit.title_double_stroke_width);
    }
    if($('overlay-title-double-stroke-color')&&job.text_edit.title_double_stroke_color)$('overlay-title-double-stroke-color').value=job.text_edit.title_double_stroke_color;
    if($('overlay-stroke-width')&&job.text_edit.overlay_stroke_width!==undefined&&job.text_edit.overlay_stroke_width!==null){
      $('overlay-stroke-width').value=String(job.text_edit.overlay_stroke_width);
      if($('overlay-stroke-width-range'))$('overlay-stroke-width-range').value=String(job.text_edit.overlay_stroke_width);
    }
    if($('overlay-stroke-color')&&job.text_edit.overlay_stroke_color)$('overlay-stroke-color').value=job.text_edit.overlay_stroke_color;
    if($('overlay-double-stroke-width')&&job.text_edit.overlay_double_stroke_width!==undefined){
      $('overlay-double-stroke-width').value=String(job.text_edit.overlay_double_stroke_width);
      if($('overlay-double-stroke-width-range'))$('overlay-double-stroke-width-range').value=String(job.text_edit.overlay_double_stroke_width);
    }
    if($('overlay-double-stroke-color')&&job.text_edit.overlay_double_stroke_color)$('overlay-double-stroke-color').value=job.text_edit.overlay_double_stroke_color;
    if($('overlay-title-bold')&&job.text_edit.title_bold!==undefined)$('overlay-title-bold').value=job.text_edit.title_bold?'1':'0';
    if($('overlay-title-italic')&&job.text_edit.title_italic!==undefined)$('overlay-title-italic').value=job.text_edit.title_italic?'1':'0';
    if($('overlay-title-underline')&&job.text_edit.title_underline!==undefined)$('overlay-title-underline').value=job.text_edit.title_underline?'1':'0';
    if($('overlay-title-text-color')&&job.text_edit.title_text_color)$('overlay-title-text-color').value=job.text_edit.title_text_color;
    if($('overlay-title-bg-color')&&job.text_edit.title_bg_color)$('overlay-title-bg-color').value=job.text_edit.title_bg_color;
    if($('overlay-title-bg-opacity')&&job.text_edit.title_bg_opacity!==undefined)$('overlay-title-bg-opacity').value=String(Math.round(Number(job.text_edit.title_bg_opacity)));
    if($('overlay-title-letter-spacing')&&job.text_edit.title_letter_spacing!==undefined)$('overlay-title-letter-spacing').value=String(job.text_edit.title_letter_spacing);
    if($('overlay-title-line-spacing')&&job.text_edit.title_line_spacing!==undefined)$('overlay-title-line-spacing').value=String(job.text_edit.title_line_spacing);
    if($('overlay-title-align')&&job.text_edit.title_align)$('overlay-title-align').value=job.text_edit.title_align;
    if($('overlay-title-scale-pct')&&job.text_edit.title_scale_pct!==undefined)$('overlay-title-scale-pct').value=String(Math.round(Number(job.text_edit.title_scale_pct)));
    if($('overlay-title-opacity')&&job.text_edit.title_opacity!==undefined)$('overlay-title-opacity').value=String(Math.round(Number(job.text_edit.title_opacity)));
    if($('overlay-bold')&&job.text_edit.overlay_bold!==undefined)$('overlay-bold').value=job.text_edit.overlay_bold?'1':'0';
    if($('overlay-italic')&&job.text_edit.overlay_italic!==undefined)$('overlay-italic').value=job.text_edit.overlay_italic?'1':'0';
    if($('overlay-underline')&&job.text_edit.overlay_underline!==undefined)$('overlay-underline').value=job.text_edit.overlay_underline?'1':'0';
    if($('overlay-text-color')&&job.text_edit.overlay_text_color)$('overlay-text-color').value=job.text_edit.overlay_text_color;
    if($('overlay-bg-color')&&job.text_edit.overlay_bg_color)$('overlay-bg-color').value=job.text_edit.overlay_bg_color;
    if($('overlay-bg-opacity')&&job.text_edit.overlay_bg_opacity!==undefined)$('overlay-bg-opacity').value=String(Math.round(Number(job.text_edit.overlay_bg_opacity)));
    if($('overlay-letter-spacing')&&job.text_edit.overlay_letter_spacing!==undefined)$('overlay-letter-spacing').value=String(job.text_edit.overlay_letter_spacing);
    if($('overlay-line-spacing')&&job.text_edit.overlay_line_spacing!==undefined)$('overlay-line-spacing').value=String(job.text_edit.overlay_line_spacing);
    if($('overlay-align')&&job.text_edit.overlay_align)$('overlay-align').value=job.text_edit.overlay_align;
    if($('overlay-scale-pct')&&job.text_edit.overlay_scale_pct!==undefined)$('overlay-scale-pct').value=String(Math.round(Number(job.text_edit.overlay_scale_pct)));
    if($('overlay-opacity')&&job.text_edit.overlay_opacity!==undefined)$('overlay-opacity').value=String(Math.round(Number(job.text_edit.overlay_opacity)));
    if(Array.isArray(job.text_edit.text_layers)){
      videoTextLayers=job.text_edit.text_layers.map((l,idx)=>createDefaultVideoTextLayer(idx,l));
      activeTextLayerId=videoTextLayers[0]?.id||'';
    }else{
      const migrated=[];
      const legTitle=(job.text_edit.title_text||'').trim();
      const legSub=(job.text_edit.overlay_text||'').trim();
      if(legTitle){
        migrated.push(createDefaultVideoTextLayer(0,{
          id:'text-layer-title',
          text:legTitle,
          badge:job.text_edit.title_badge||'',
          preset:job.text_edit.title_color||'reels_giant_yellow_impact',
          font:job.text_edit.title_font||'heavy_kr',
          size:Number(job.text_edit.title_size||54),
          scale_pct:Number(job.text_edit.title_scale_pct||100),
          opacity:Number(job.text_edit.title_opacity??100),
          letter_spacing:Number(job.text_edit.title_letter_spacing||0),
          line_spacing:Number(job.text_edit.title_line_spacing||1.18),
          align:job.text_edit.title_align||'center',
          bold:job.text_edit.title_bold!==false,
          italic:Boolean(job.text_edit.title_italic),
          underline:Boolean(job.text_edit.title_underline),
          text_color:job.text_edit.title_text_color||'#ffea18',
          bg_enabled:job.text_edit.title_bg!==false&&job.text_edit.title_color!=='outline',
          bg_color:job.text_edit.title_bg_color||'#0e1018',
          bg_opacity:Number(job.text_edit.title_bg_opacity??88),
          box_radius:Number(job.text_edit.title_box_radius??18),
          box_w:Number(job.text_edit.title_box_w||0),
          box_h:Number(job.text_edit.title_box_h||0),
          stroke_width:Number(job.text_edit.title_stroke_width??4),
          stroke_color:job.text_edit.title_stroke_color||'#000000',
          double_stroke_width:Number(job.text_edit.title_double_stroke_width||0),
          double_stroke_color:job.text_edit.title_double_stroke_color||'#facc15',
          x:Number(job.text_edit.title_x??50),
          y:Number(job.text_edit.title_y??18),
          duration:Number(job.text_edit.title_end||0)
        }));
      }
      if(legSub){
        migrated.push(createDefaultVideoTextLayer(migrated.length,{
          id:'text-layer-sub',
          text:legSub,
          badge:'',
          preset:job.text_edit.overlay_color==='black'?'black':(job.text_edit.overlay_bg===false?'outline':'reels_rounded_black'),
          font:job.text_edit.overlay_font||'sans',
          size:Number(job.text_edit.overlay_size||42),
          scale_pct:Number(job.text_edit.overlay_scale_pct||100),
          opacity:Number(job.text_edit.overlay_opacity??100),
          letter_spacing:Number(job.text_edit.overlay_letter_spacing||0),
          line_spacing:Number(job.text_edit.overlay_line_spacing||1.22),
          align:job.text_edit.overlay_align||'center',
          bold:job.text_edit.overlay_bold!==false,
          italic:Boolean(job.text_edit.overlay_italic),
          underline:Boolean(job.text_edit.overlay_underline),
          text_color:job.text_edit.overlay_text_color||'#ffffff',
          bg_enabled:job.text_edit.overlay_bg!==false,
          bg_color:job.text_edit.overlay_bg_color||'#0e1018',
          bg_opacity:Number(job.text_edit.overlay_bg_opacity??88),
          box_radius:Number(job.text_edit.overlay_box_radius??22),
          box_w:Number(job.text_edit.overlay_box_w||0),
          box_h:Number(job.text_edit.overlay_box_h||0),
          stroke_width:Number(job.text_edit.overlay_stroke_width??3),
          stroke_color:job.text_edit.overlay_stroke_color||'#000000',
          double_stroke_width:Number(job.text_edit.overlay_double_stroke_width||0),
          double_stroke_color:job.text_edit.overlay_double_stroke_color||'#facc15',
          x:Number(job.text_edit.overlay_x??50),
          y:Number(job.text_edit.overlay_y??78),
          duration:0
        }));
      }
      videoTextLayers=migrated;
      activeTextLayerId=videoTextLayers[0]?.id||'';
    }
  }else{
    videoTextLayers=[];
    activeTextLayerId='';
  }
  if(job?.id)restoreActiveJobLocalDraft(job.id);
  lastUndoSnapshotJson=job?JSON.stringify(captureEditorStateSnapshot()):'';
  syncDraggableOverlayCanvas();
  renderAttachmentsPreview();
  renderCarouselPreview();
  if($('writing-context-text')){
    if(job?.analysis){
      const sum=job.analysis.result?.summary||job.name||'분석 완료';
      const srcNote=job.source_text?` · 원본 글: "${job.source_text.slice(0,60)}${job.source_text.length>60?'…':''}"`:'';
      const prod=job.product?.name?` · 연결 상품: ${job.product.name}`:'';
      $('writing-context-text').textContent=`분석 요약: ${sum}${srcNote}${prod}`;
    }else if(job&&job.source_text){
      $('writing-context-text').textContent=`원본 게시물 본문: "${job.source_text.slice(0,90)}${job.source_text.length>90?'…':''}" · 바로 한국 스타일 3안 작성이 가능합니다.`;
    }else if(job){
      $('writing-context-text').textContent=`현재 미디어: ${job.name} · 원본 글을 입력하거나 [한국 스타일 초안 3안 작성]을 누르면 화면과 내용을 바탕으로 3안을 작성합니다.`;
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
    const select=text('button',index===selectedIdx?'현재 선택된 초안':'이 초안으로 편집하기');
    select.type='button';
    select.className=index===selectedIdx?'secondary btn-variant-selected':'secondary';
    select.onclick=()=>{
      pushEditorUndoSnapshot();
      $('script').value=value;$('body').value=value;job.draft.selected=index;
      document.querySelectorAll('#draft-variants .draft-variant').forEach((el,i)=>{
        el.classList.toggle('selected',i===index);
        const btn=el.querySelector('button');
        if(btn){btn.textContent=i===index?'현재 선택된 초안':'이 초안으로 편집하기';btn.className=i===index?'secondary btn-variant-selected':'secondary';}
      });
      writingCounts();$('extension-upload').disabled=true;if($('extension-batch-upload'))$('extension-batch-upload').disabled=true;
      saveActiveJobLocalDraft();
      message(`${index+1}안을 편집창에 불러왔습니다. 내용을 다듬은 뒤 [게시·예약]에서 확정하세요.`);
    };
    card.append(head,bodyP,select);
    $('draft-variants').append(card);
  }
  if(!isApplyingDraftOrUndo){
    const draftScript=job?.draft?.script||'';
    if(draftScript||!$('script').value){
      $('script').value=draftScript;$('body').value=job?.draft?.body||'';
    }
  }
  const product=job?.product;
  $('platform').value=product?.platform||'coupang';$('product-name').value=product?.name||'';
  $('product-url').value=product?.url||'';$('affiliate-url').value=product?.affiliate_url||'';
  $('confirmed').checked=['user_confirmed','api_issued'].includes(product?.attribution);if($('affiliate-entry-mode'))$('affiliate-entry-mode').value=product?.link_entry_mode||(product?.affiliate_method==='coupang_api'||product?.url&&!product?.affiliate_url?'api':'manual');
  $('disclosure').value=job?.disclosure||(product?.affiliate_url?(disclosureDefaults[product?.platform]||''):'');
  $('comment').value=job?.comment||buildDefaultComment();
  productDirty=false;
  if(window.syncJobScriptHistory)window.syncJobScriptHistory(job);
  writingCounts();
  updateProductionStepBadges();
  $('draft-style').value=job?.draft?.style||$('draft-style').value||'two_line';
  fillStyle();
  const qEl = $('draft-quality');
  if(qEl){
    if(job?.draft?.needs_review){
      qEl.hidden = false;
      qEl.style.display = 'block';
      qEl.style.background = '#fff3cd';
      qEl.style.color = '#856404';
      qEl.style.border = '1px solid #ffeeba';
      qEl.style.padding = '8px 12px';
      qEl.style.borderRadius = '4px';
      qEl.textContent = `${job.draft.review_reason || '연결된 상품 정보가 변경되었습니다. 초안 내용 및 상품명을 재검토해 주세요.'}`;
    }else{
      const qNotes=(job?.draft?.quality_notes||[]).join(' · ');
      qEl.textContent=qNotes;
      qEl.style.display = '';
      qEl.style.background = '';
      qEl.style.color = '';
      qEl.style.border = '';
      qEl.style.padding = '';
      qEl.style.borderRadius = '';
      qEl.hidden=!qNotes;
    }
  }
  $('publication').textContent=job?.status==='publish_ready'?'게시 준비 완료 · 원하는 플랫폼으로 바로 업로드하세요.':'아직 게시하지 않았습니다.';
  renderIntegrations();
  renderVisual();
  if(!job){
    $('preview').pause();
    $('preview').removeAttribute('src');
    $('preview').removeAttribute('poster');
    $('preview').load();
    if($('source-link'))$('source-link').hidden=true;
    if($('video-timeline-scrubber-bar'))$('video-timeline-scrubber-bar').hidden=true;
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
  const stageFrame=$('analysis-player-stage');
  if(stageFrame){
    const mw=Number(job.media?.width||0),mh=Number(job.media?.height||0);
    stageFrame.style.aspectRatio=(mw>0&&mh>0)?`${mw}/${mh}`:'';
  }
  $('preview').hidden=isImage;$('image-preview').hidden=!isImage;
  if($('video-timeline-scrubber-bar'))$('video-timeline-scrubber-bar').hidden=isImage;
  if(isImage){
    $('preview').pause();
    $('preview').removeAttribute('src');
    $('preview').removeAttribute('poster');
    $('image-preview').onload=()=>syncDraggableOverlayCanvas();
    $('image-preview').src=base+'frame-0.jpg?t='+encodeURIComponent(job.sha256||'1');
  }else{
    const firstFrame=job.evidence?.frames?.[0]?.file||'frame-0.jpg';
    $('preview').poster=base+firstFrame+(job.text_edit?.updated_at?'?t='+Math.floor(job.text_edit.updated_at*1000):'');
    const nextSrc=base+'video'+(job.text_edit?.updated_at?'?t='+Math.floor(job.text_edit.updated_at*1000):'');
    const dur=Math.max(0.5,Number(job.media?.duration||10));
    if($('timeline-scrubber-range')){
      $('timeline-scrubber-range').max=String(dur);
    }
    const curT=Number($('preview')?.currentTime||0);
    if(typeof renderNleScrubberTrack==='function')renderNleScrubberTrack(job,base);
    if(typeof syncNleScrubberPlayhead==='function')syncNleScrubberPlayhead(curT,dur);
    $('preview').onloadedmetadata=()=>{
      const realDur=Number($('preview').duration||job.media?.duration||10);
      if($('timeline-scrubber-range')&&Number.isFinite(realDur)&&realDur>0){
        $('timeline-scrubber-range').max=String(realDur);
      }
      if(typeof syncNleScrubberPlayhead==='function')syncNleScrubberPlayhead(Number($('preview').currentTime||0),realDur);
      syncDraggableOverlayCanvas();
    };
    if($('preview').getAttribute('src')!==nextSrc){
      $('preview').src=nextSrc;
      $('preview').load();
    }
  }
  if($('btn-capture-scrubber-carousel')){
    $('btn-capture-scrubber-carousel').hidden=(window.currentProductionStage!=='carousel');
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
    const cap=text('figcaption',isImage?'원본':`${frame.timestamp}초`);
    figure.append(img,cap);
    if(!isImage){
      img.onclick=()=>{
        const tsNum=Number(frame.timestamp||0);
        $('preview').currentTime=tsNum;
        if($('timeline-scrubber-range'))$('timeline-scrubber-range').value=String(tsNum);
        const durNow=Number($('preview')?.duration||job?.media?.duration||10);
        if(typeof syncNleScrubberPlayhead==='function')syncNleScrubberPlayhead(tsNum,durNow);
        $('preview').play().catch(()=>{});
      };
      const frameBtnRow=document.createElement('div');
      frameBtnRow.className='frame-action-stack';
      const addBtn=text('button','+ 첨부 추가');
      addBtn.type='button';
      addBtn.className='secondary btn-xs frame-add-bundle-btn';
      addBtn.title='쓰레드 [영상 1 + 이미지 1] 등 다중 미디어 첨부에 이 장면을 이미지로 추가합니다';
      addBtn.onclick=e=>{
        e.stopPropagation();
        act(`${frame.timestamp}초 장면을 동반 첨부 이미지로 추가 중…`,async()=>{
          await update('attachments-config',{action:'add_frame',file:frame.file,label:`${frame.timestamp}초 추출 장면`});
          if($('upload-format'))$('upload-format').value='combo';
        },`${frame.timestamp}초 장면을 영상 옆 동반 이미지로 추가했습니다.`);
      };
      frameBtnRow.append(addBtn);
      if((job.carousel?.slides||[]).length>0){
        const replaceSlideBtn=text('button','슬라이드 배경');
        replaceSlideBtn.type='button';
        replaceSlideBtn.className='secondary btn-xs frame-add-bundle-btn frame-replace-slide-btn';
        replaceSlideBtn.hidden=(window.currentProductionStage!=='carousel');
        replaceSlideBtn.title='현재 선택된 캐러셀 슬라이드의 배경 사진을 이 프레임 시점으로 즉시 교체합니다';
        replaceSlideBtn.onclick=e=>{
          e.stopPropagation();
          const targetIdx=activeCarouselSlideIndex||1;
          act(`슬라이드 #${targetIdx} 배경을 ${frame.timestamp}초 장면으로 교체 중…`,async()=>{
            await update('carousel-slide-update',{index:targetIdx,timestamp:Number(frame.timestamp||0)});
          },`슬라이드 #${targetIdx} 배경 장면을 ${frame.timestamp}초 화면으로 교체했습니다.`);
        };
        frameBtnRow.append(replaceSlideBtn);
      }
      figure.append(frameBtnRow);
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

    const rawPostCaption=(job?.source_text||$('source-post-text')?.value||'').trim();
    const koPostCaption=(data.source_translation||job?.source_text_ko||$('source-post-translated-text')?.value||'').trim();
    if(rawPostCaption||koPostCaption){
      const captionBox=document.createElement('div');
      captionBox.className='analysis-block analysis-post-caption-block';
      captionBox.append(text('h4','참고한 원본 게시물 제목·설명(캡션)·본문 및 한국어 번역'));
      if(rawPostCaption){
        const origWrap=document.createElement('div');
        origWrap.className='analysis-caption-subitem';
        origWrap.append(text('strong','원본 게시물 제목·설명·본문'),text('p',rawPostCaption));
        captionBox.append(origWrap);
      }
      if(koPostCaption&&koPostCaption!==rawPostCaption){
        const transWrap=document.createElement('div');
        transWrap.className='analysis-caption-subitem translated';
        transWrap.append(text('strong','한국어 자연 번역 · 핵심 정리'),text('p',koPostCaption));
        captionBox.append(transWrap);
      }
      $('analysis').append(captionBox);
    }

    if(Array.isArray(data.observations)&&data.observations.length){
      const obsSection=document.createElement('div');
      obsSection.className='analysis-block';
      obsSection.append(text('h4','시간대별 주요 관찰 장면'));
      const list=document.createElement('div');
      list.className='analysis-timeline-list';
      for(const item of data.observations){
        const row=document.createElement('div');
        row.className='analysis-timeline-row';
        const timeBtn=text('button',`${item.timestamp}초`);
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
        const chip=text('button',`${term}`);
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
      text('strong','아직 AI 장면·음성·본문 통합 분석을 실행하지 않았습니다'),
      text('p','위 [STEP 0]에서 사용할 AI 모델을 고른 뒤 [선택한 AI 모델로 장면·음성·본문 통합 분석 시작]을 누르면 영상 장면·내레이션과 함께 원본 게시물 제목·설명(캡션)·본문을 참고하여 요약·후킹 구간·한국어 번역·상품 검색 키워드를 추출합니다.')
    );
    $('analysis').append(placeholder);
  }
  const hasSceneAnalysis=Boolean(job?.analysis?.result);
  const hasOcr=Boolean(job?.media_ocr?.translated_text||job?.media_ocr?.raw_text||($('ocr-original-text')?.value||'').trim());
  const rawSourceTxt=(job?.source_text||$('source-post-text')?.value||'').trim();
  const koSourceTxt=(job?.source_text_ko||job?.analysis?.result?.source_translation||$('source-post-translated-text')?.value||'').trim();
  const hasCaption=Boolean(rawSourceTxt||koSourceTxt);
  const langInfo=detectPostLanguageClient(rawSourceTxt);
  if($('badge-status-scene')){
    $('badge-status-scene').textContent=hasSceneAnalysis?'분석 완료':'분석 대기';
    $('badge-status-scene').className='analysis-state-badge'+(hasSceneAnalysis?' done':'');
  }
  if($('badge-status-ocr')){
    $('badge-status-ocr').textContent=hasOcr?'인식·번역됨':'선택 실행';
    $('badge-status-ocr').className='analysis-state-badge'+(hasOcr?' done':'');
  }
  if($('badge-status-caption')){
    $('badge-status-caption').textContent=koSourceTxt?'원문·한국어번역 준비됨':(hasCaption?'본문 준비됨':'입력 대기');
    $('badge-status-caption').className='analysis-state-badge'+(hasCaption?' done':'');
  }
  if($('badge-source-lang')){
    $('badge-source-lang').textContent=langInfo.label;
    $('badge-source-lang').className='analysis-state-badge'+(langInfo.needsTranslation?' foreign-lang':(hasCaption?' done':''));
  }
  if($('overview-step-scene'))$('overview-step-scene').classList.toggle('done',hasSceneAnalysis);
  if($('overview-scene-status')){
    const obsCount=(job?.analysis?.result?.observations||[]).length;
    $('overview-scene-status').textContent=hasSceneAnalysis?`완료 · 주요 장면 ${obsCount}개 & 본문·키워드 추출됨`:'실행 전 · 줄거리·내레이션·원본 캡션·후킹 구간 추출';
  }
  if($('overview-step-ocr'))$('overview-step-ocr').classList.toggle('done',hasOcr);
  if($('overview-ocr-status')){
    $('overview-ocr-status').textContent=hasOcr?'완료 · 화면 글자 추출 및 번역 완료':'선택 실행 · 외국어 자막 추출 및 한국어 번역';
  }
  if($('overview-step-caption'))$('overview-step-caption').classList.toggle('done',hasCaption);
  if($('overview-caption-status')){
    if(koSourceTxt){
      $('overview-caption-status').textContent=`준비됨 · ${langInfo.label} → 한국어 자연 번역 완료 (${Array.from(koSourceTxt).length}자)`;
    }else if(hasCaption){
      $('overview-caption-status').textContent=`준비됨 · ${langInfo.label} (${Array.from(rawSourceTxt).length}자 보관 중)`;
    }else{
      $('overview-caption-status').textContent='쓰레드·인스타·유튜브 제목·본문 확인 및 일본어·영어 자연 번역';
    }
  }
}
function detectPostLanguageClient(textStr){
  const clean=String(textStr||'').replace(/https?:\/\/\S+/g,'').trim();
  if(!clean)return {lang:'empty',label:'본문 없음',needsTranslation:false};
  const jaCount=(clean.match(/[\u3040-\u30ff]/g)||[]).length;
  const koCount=(clean.match(/[가-힣]/g)||[]).length;
  const zhCount=(clean.match(/[\u4e00-\u9fff]/g)||[]).length;
  const enCount=(clean.match(/[A-Za-z]/g)||[]).length;
  if(jaCount>=2&&jaCount>=koCount){
    return {lang:'ja',label:'일본어 원문 감지됨 (한국어 번역 추천)',needsTranslation:true};
  }
  if(zhCount>=4&&koCount<zhCount&&jaCount===0){
    return {lang:'zh',label:'중국어·한자 원문 감지됨 (한국어 번역 추천)',needsTranslation:true};
  }
  if(enCount>=10&&koCount*2<enCount){
    return {lang:'en',label:'영어 원문 감지됨 (한국어 번역 추천)',needsTranslation:true};
  }
  if(koCount>=2){
    return {lang:'ko',label:'한국어 본문',needsTranslation:false};
  }
  return {lang:'other',label:'다국어·기호 원문',needsTranslation:enCount>0||jaCount>0||zhCount>0};
}
async function translateSourcePostTextWithFallback(rawText,tone='natural'){
  if(!job?.id)throw new Error('먼저 원본 미디어를 불러와 주세요.');
  const textToTranslate=String(rawText||$('source-post-text')?.value||job?.source_text||'').trim();
  if(!textToTranslate)throw new Error('번역할 원본 게시물 제목·설명(캡션)·본문이 비어 있습니다.');
  try{
    const next=await api(`jobs/${job.id}/source-text-translate`,{...credentials('analysis'),text:textToTranslate,tone});
    job=next;
  }catch(err){
    // Fallback for in-memory helper process started before /source-text-translate route was registered
    const fallbackPromptText=`[원본 게시물 제목·설명·본문 번역 요청]\n${textToTranslate}`;
    const ocrRes=await api(`jobs/${job.id}/ocr-translate`,{...credentials('analysis'),text:fallbackPromptText,tone});
    const translated=(ocrRes?.media_ocr?.translated_text||ocrRes?.media_ocr?.korean_translation||'').trim();
    const saved=await api(`jobs/${job.id}/repost-meta`,{source_text:textToTranslate,source_text_ko:translated});
    saved.source_text_ko=translated;
    job=saved;
  }
  if($('source-post-translated-text')){
    $('source-post-translated-text').value=job?.source_text_ko||job?.analysis?.result?.source_translation||'';
  }
  render();
  await refreshJobs();
  return job?.source_text_ko||'';
}
async function fetchSourcePostCaptionWithFallback(){
  if(!job?.id)throw new Error('먼저 미디어를 선택해 주세요.');
  try{
    const next=await api(`jobs/${job.id}/fetch-source-text`,{url:job.source||$('fetch-url')?.value||''});
    job=next;
  }catch(err){
    const targetUrl=(job.source||$('fetch-url')?.value||'').trim();
    if(!targetUrl||!/^https?:\/\//i.test(targetUrl))throw new Error('원본 게시물 URL 정보가 없습니다.');
    const acquired=await api('acquire',{url:targetUrl});
    const extracted=(acquired?.source_text||'').trim();
    if(extracted){
      job=await api(`jobs/${job.id}/repost-meta`,{source_text:extracted});
    }else{
      throw new Error('해당 링크에서 공개된 제목·설명(캡션)을 찾지 못했습니다. 직접 입력하거나 붙여넣어 주세요.');
    }
  }
  if($('source-post-text'))$('source-post-text').value=job?.source_text||'';
  render();
  await refreshJobs();
  const lang=detectPostLanguageClient(job?.source_text||'');
  if(lang.needsTranslation&&!(job?.source_text_ko||'').trim()){
    await translateSourcePostTextWithFallback(job.source_text,$('source-translate-tone')?.value||'natural');
  }
}
async function update(path,data){const targetId=job?.id;if(!targetId)return;const next=await api(`jobs/${targetId}/${path}`,data);if(job?.id!==targetId)return;job=next;render();await refreshJobs();}
if($('url-fetch-form'))$('url-fetch-form').onsubmit=event=>{event.preventDefault();act('게시물에서 미디어와 본문을 가져오는 중…',async()=>{const url=$('fetch-url').value.trim();let acquired=await api('acquire',{url});job=await normalizeAcquiredComboJob(acquired,{url,cleanImageUrls:[]});if((job?.attachments||[]).length>0&&$('upload-format'))$('upload-format').value='combo';render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();},'영상·이미지와 게시물 정보를 불러왔습니다.');};
$('upload-form').onsubmit=event=>{event.preventDefault();const file=$('video-file').files[0];if(!file){message('영상 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('영상과 음성·프레임을 추출하는 중…',async()=>{const data=new FormData();data.append('video',file);data.append('source',$('source').value);job=await api('jobs',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
$('image-form').onsubmit=event=>{event.preventDefault();const file=$('image-file').files[0];if(!file){message('이미지 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('원본 이미지 불러오는 중…',async()=>{const data=new FormData();data.append('image',file);data.append('source',$('source').value);job=await api('images',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
if($('btn-save-source-text'))$('btn-save-source-text').onclick=()=>act('원본 게시물 본문 및 한국어 번역 저장 중…',async()=>{
  const rawTxt=$('source-post-text')?.value||'';
  const koTxt=$('source-post-translated-text')?.value||'';
  await update('repost-meta',{source_text:rawTxt,source_text_ko:koTxt});
  if(job)job.source_text_ko=koTxt;
  render();
},'원본 게시물 제목·본문과 한국어 번역문을 저장했습니다.');
if($('btn-fetch-source-caption'))$('btn-fetch-source-caption').onclick=()=>act('원본 게시물(쓰레드·인스타·유튜브)에서 제목·설명(캡션)·본문을 불러오는 중…',async()=>{
  await fetchSourcePostCaptionWithFallback();
},'원본 게시물 제목·설명(캡션)·본문을 불러왔습니다.');
if($('btn-translate-source-text'))$('btn-translate-source-text').onclick=()=>act('일본어·영어 등 원본 게시물 제목·설명·본문을 자연스러운 한국어로 번역하는 중…',async()=>{
  const tone=$('source-translate-tone')?.value||'natural';
  await translateSourcePostTextWithFallback($('source-post-text')?.value||job?.source_text||'',tone);
},'원본 게시물 제목·설명(캡션)·본문을 자연스러운 한국어로 번역했습니다!');
if($('btn-apply-translated-to-source'))$('btn-apply-translated-to-source').onclick=()=>act('한국어 번역문을 메인 본문으로 적용하는 중…',async()=>{
  const koTxt=($('source-post-translated-text')?.value||job?.source_text_ko||'').trim();
  if(!koTxt)throw new Error('먼저 [일본어·영어 원문 → 한국어 자연 번역]을 실행하거나 번역문을 입력해 주세요.');
  if($('source-post-text'))$('source-post-text').value=koTxt;
  await update('repost-meta',{source_text:koTxt,source_text_ko:koTxt});
},'한국어 번역문을 메인 본문 및 대본 작성 재료로 적용했습니다!');
if($('btn-send-caption-to-editor'))$('btn-send-caption-to-editor').onclick=()=>{
  const captionTxt=($('source-post-translated-text')?.value||job?.source_text_ko||$('source-post-text')?.value||job?.source_text||'').trim();
  const firstLine=captionTxt.split(/[\r\n]+/).map(s=>s.replace(/^\[.*?\]\s*/,'').trim()).find(Boolean)||'';
  document.querySelector('[data-production-stage="editing"]')?.click();
  if(firstLine){
    addVideoTextLayer({text:firstLine.slice(0,64),y:78,size:42,preset:'reels_rounded_black',text_color:'#ffffff'});
  }
  syncDraggableOverlayCanvas();
  message('원본 게시물(한국어 번역) 핵심 문구를 02-A 미디어 편집 스튜디오 자막 레이어로 보냈습니다.');
};
if($('btn-send-caption-to-carousel'))$('btn-send-caption-to-carousel').onclick=()=>{
  document.querySelector('[data-production-stage="carousel"]')?.click();
  $('btn-autofill-carousel-texts')?.click();
  message('원본 게시물 제목·설명(한국어 번역)을 반영하여 02-B 캐러셀 대본을 구성했습니다.');
};
if($('source-post-text')){
  $('source-post-text').addEventListener('input',()=>{
    const langInfo=detectPostLanguageClient($('source-post-text').value);
    if($('badge-source-lang')){
      $('badge-source-lang').textContent=langInfo.label;
      $('badge-source-lang').className='analysis-state-badge'+(langInfo.needsTranslation?' foreign-lang':(($('source-post-text').value||'').trim()?' done':''));
    }
  });
}

// --- Media Bundle Presets (Threads Video 1 + Image 1, etc.) ---
if($('btn-preset-threads-1v1i'))$('btn-preset-threads-1v1i').onclick=()=>act('쓰레드 [영상 1 + 이미지 1] 조합을 구성하는 중…',async()=>{
  await update('attachments-config',{action:'preset_video_plus_images',image_count:1});
  if($('upload-platform'))$('upload-platform').value='threads';
  if($('upload-format'))$('upload-format').value='combo';
},'쓰레드 추천 [영상 1개 + 동반 이미지 1장] 구성을 완료했습니다!');
if($('btn-preset-threads-1v2i'))$('btn-preset-threads-1v2i').onclick=()=>act('쓰레드 [영상 1 + 이미지 2장] 조합을 구성하는 중…',async()=>{
  await update('attachments-config',{action:'preset_video_plus_images',image_count:2});
  if($('upload-platform'))$('upload-platform').value='threads';
  if($('upload-format'))$('upload-format').value='combo';
},'[영상 1개 + 동반 이미지 2장] 구성을 완료했습니다!');
if($('btn-preset-video-only'))$('btn-preset-video-only').onclick=()=>act('동반 이미지를 비우고 단독 미디어로 전환 중…',async()=>{
  await update('attachments-config',{action:'clear'});
  if($('upload-format'))$('upload-format').value='video';
},'영상 1개 단독 구성으로 변경했습니다.');

// --- Interactive Draggable Title & Subtitle Overlay on Preview Canvas ---
function extractBestHookLines(){
  const pool=[];
  const prod=($('product-name')?.value||job?.product?.name||'').trim();
  const translatedCaption=($('source-post-translated-text')?.value||job?.source_text_ko||job?.analysis?.result?.source_translation||'').trim();
  const body=($('script')?.value||job?.draft?.body||translatedCaption||$('source-post-text')?.value||job?.source_text||'').trim();
  const summary=(job?.analysis?.result?.summary||'').trim();
  const audioSum=(job?.analysis?.result?.audio_summary||'').trim();
  const ocrTxt=(job?.media_ocr?.translated_text||job?.media_ocr?.raw_text||$('ocr-original-text')?.value||'').trim();

  const pushClean=raw=>{
    const clean=String(raw||'').replace(/^(#광고|\[광고\]|\[자세한 정보.*?\]|\[제목\]|\[설명·본문\])\s*/,'').replace(/https?:\/\/\S+/g,'').replace(/(?:^|\s)#[0-9A-Za-z가-힣_]+/g,'').trim();
    if(clean.length>=4&&!pool.includes(clean))pool.push(clean.slice(0,84));
  };

  for(const chunk of [translatedCaption,body,summary,ocrTxt,audioSum]){
    if(!chunk)continue;
    for(const raw of chunk.split(/[\r\n]+|(?<=[.!?])\s+/)){
      pushClean(raw);
    }
  }
  for(const o of (job?.analysis?.result?.observations||[])){
    pushClean(o?.description||o);
  }
  if(!pool.length&&prod)pool.push(`[${prod}] 실사용 핵심 포인트 완벽 정리`);
  if(!pool.length)pool.push('[핵심 요약] 놓치면 아쉬운 실사용 체크 포인트');
  return pool;
}
function buildEditorialStoryboardLines(count){
  const total=Math.max(1,Math.min(10,Number(count||5)));
  const lines=extractBestHookLines();
  const prod=($('product-name')?.value||job?.product?.name||'').trim();
  const summary=(job?.analysis?.result?.summary||'').trim();
  const toTwoTier=(head,sub)=>{
    head=String(head||'').trim();
    sub=String(sub||'').trim();
    if(head.includes('|'))return head;
    if(!sub&&head.length>26){
      const parts=head.split(/[,·—\-]\s*|\s+(?=그래서|특히|실제로|덕분에|비결은|핵심은)/);
      if(parts.length>=2&&parts[0].trim().length>=5&&parts.slice(1).join(' ').trim().length>=5){
        return `${parts[0].trim()} | ${parts.slice(1).join(' ').trim()}`;
      }
    }
    return sub?`${head} | ${sub}`:head;
  };

  const firstRaw=lines[0]||'핵심 포인트 한눈에 보기';
  const secondRaw=lines[1]||(summary?summary.slice(0,60):'잘 되는 캐러셀에는 공식이 있습니다! 슬라이드를 넘겨 확인하세요');
  const hookFormula=($('carousel-cover-hook-formula')?.value||job?.carousel?.hook_formula||'number').trim();
  const formattedCover=formatCoverHookByFormula(hookFormula,firstRaw,lines.length>1?secondRaw:'잘 되는 캐러셀에는 공식이 있습니다!',prod,total);
  const coverOut=formattedCover.combined;

  if(total===1){
    const captionLines=lines.slice(1,4).length?lines.slice(1,4):(summary?[summary.slice(0,90)]:['실사용에서 검증된 핵심 특징과 포인트를 한 장에 정리했습니다.']);
    const singleCaption=captionLines.join(' · ');
    return {
      cover:coverOut,
      bodySlides:[],
      cta:singleCaption,
      body:[]
    };
  }

  const bodyFallbacks=[
    ['첫눈에 체감되는 [핵심 차별점]','기존 방식과 비교했을 때 가장 먼저 느껴지는 변화'],
    ['실사용에서 검증된 *디테일 포인트*','매일 직접 써보며 확인한 실용성과 편의성 체크'],
    ['만족도를 높이는 [활용 꿀팁]','알아두면 200% 더 편리하게 쓰는 실전 노하우'],
    ['놓치기 쉬운 [실전 체크리스트]','구매 전 미리 확인하면 실패 없는 선택 포인트']
  ];
  const bodyTargetCount=total>=3?(total-2):0;
  const bodySlidesOut=[];
  let cursor=1;
  for(let i=0;i<bodyTargetCount;i++){
    const primary=lines[cursor]||'';
    cursor++;
    const secondary=(cursor<lines.length&&lines.length-cursor>=bodyTargetCount-i)?lines[cursor++]:'';
    if(primary){
      bodySlidesOut.push(toTwoTier(primary,secondary||bodyFallbacks[i%bodyFallbacks.length][1]));
    }else{
      const fb=bodyFallbacks[i%bodyFallbacks.length];
      bodySlidesOut.push(`${prod?prod+' · ':''}${fb[0]} | ${fb[1]}`);
    }
  }

  const lastObservation=lines[cursor]||summary||'';
  let ctaHead=prod?`[${prod}] 핵심 요약 · 추천 정리`:'[핵심 요약] 꼭 기억할 체크 포인트 총정리';
  let ctaSub=lastObservation?lastObservation.slice(0,68):'실사용 검증 포인트 요약 완료 · 첫 댓글에서 상세 정보를 확인하세요';
  if(lastObservation&&lastObservation.includes('|')){
    const parts=lastObservation.split('|');
    ctaHead=parts[0].trim()||ctaHead;
    ctaSub=parts.slice(1).join(' ').trim()||ctaSub;
  }
  const ctaOut=toTwoTier(ctaHead,ctaSub);
  const allBodyAndCta=[...bodySlidesOut,ctaOut];
  return {
    cover:coverOut,
    bodySlides:bodySlidesOut,
    cta:ctaOut,
    body:allBodyAndCta
  };
}
function updateCarouselStorySlotLabels(countVal){
  const total=Math.max(1,Math.min(10,Number(countVal||$('carousel-count')?.value||5)));
  const bodyLbl=$('carousel-body-slot-label');
  const ctaLbl=$('carousel-cta-slot-label');
  const bodyBox=$('carousel-body-texts')?.closest('.carousel-story-slot');
  const ctaBox=$('carousel-cta-text')?.closest('.carousel-story-slot');
  if(total===1){
    if(bodyBox)bodyBox.hidden=true;
    if(ctaBox)ctaBox.hidden=false;
    if(ctaLbl)ctaLbl.textContent='01 카드 캡션 · 상세 설명 (본문 문구)';
    if($('carousel-cta-text'))$('carousel-cta-text').placeholder='예: 이미지 1장 카드 하단에 함께 들어갈 캡션(상세 설명 · 핵심 요약)을 입력하세요';
  }else if(total===2){
    if(bodyBox)bodyBox.hidden=true;
    if(ctaBox)ctaBox.hidden=false;
    if(ctaLbl)ctaLbl.textContent='02 마지막장 (CTA · 핵심 요약·결론)';
  }else{
    if(bodyBox)bodyBox.hidden=false;
    if(ctaBox)ctaBox.hidden=false;
    const endBodyIdx=total-1;
    if(bodyLbl){
      bodyLbl.textContent=endBodyIdx===2?'02 본문 (Body · 핵심 포인트 1장)':`02~0${endBodyIdx} 본문 (Body · 핵심 포인트 ${endBodyIdx-1}장)`;
    }
    if(ctaLbl){
      const padTotal=total<10?`0${total}`:String(total);
      ctaLbl.textContent=`${padTotal} 마지막장 (CTA · 핵심 요약·결론)`;
    }
  }
}
function syncCombinedCarouselCustomTexts(){
  const bodyRaw=($('carousel-body-texts')?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ctaRaw=($('carousel-cta-text')?.value||'').trim();
  const total=Math.max(1,Math.min(10,Number($('carousel-count')?.value||5)));
  const combined=total===1?[]:total===2?(ctaRaw?[ctaRaw]:bodyRaw):[...bodyRaw,...(ctaRaw?[ctaRaw]:[])];
  if($('carousel-custom-texts')){
    $('carousel-custom-texts').value=combined.join('\n');
  }
  return combined;
}
function applyCarouselStoryPlanToInputs(story,statusLabel='영상 분석 내용 자동 반영됨'){
  if(!story)return;
  const count=Math.max(1,Math.min(10,Number($('carousel-count')?.value||5)));
  updateCarouselStorySlotLabels(count);
  if($('carousel-cover-title')&&story.cover!==undefined){
    $('carousel-cover-title').value=story.cover;
  }
  if($('carousel-body-texts')&&Array.isArray(story.bodySlides)){
    $('carousel-body-texts').value=story.bodySlides.join('\n');
  }
  if($('carousel-cta-text')&&story.cta!==undefined){
    $('carousel-cta-text').value=story.cta;
  }
  syncCombinedCarouselCustomTexts();
  const badge=$('carousel-story-auto-status');
  if(badge&&statusLabel){
    badge.textContent=statusLabel;
    badge.className='analysis-state-badge done';
  }
}
let lastAutoPopulatedCarouselSignature='';
function ensureCarouselStoryAutoPopulated(force=false){
  const count=Math.max(1,Math.min(10,Number($('carousel-count')?.value||5)));
  updateCarouselStorySlotLabels(count);
  if(!job)return;
  const hasExistingSlides=Array.isArray(job.carousel?.slides)&&job.carousel.slides.length>0;
  if(!force&&hasExistingSlides){
    const slides=job.carousel.slides;
    const coverStr=(slides[0]?.text||job.carousel.cover_title||'').replace(/\n/g,' | ');
    const middleSlides=slides.length>=3?slides.slice(1,-1):[];
    const lastSlide=slides.length>=2?slides[slides.length-1]:null;
    if($('carousel-cover-title')&&coverStr)$('carousel-cover-title').value=coverStr;
    if($('carousel-body-texts'))$('carousel-body-texts').value=middleSlides.map(s=>(s.text||'').replace(/\n/g,' | ')).filter(Boolean).join('\n');
    if($('carousel-cta-text')){
      if(slides.length===1){
        const tier=splitSlideThreeTierText(slides[0]);
        if(tier.bodyText)$('carousel-cta-text').value=tier.bodyText.replace(/\n/g,' · ');
      }else if(lastSlide){
        $('carousel-cta-text').value=(lastSlide.text||'').replace(/\n/g,' | ');
      }
    }
    syncCombinedCarouselCustomTexts();
    const badge=$('carousel-story-auto-status');
    if(badge){
      badge.textContent=slides.length===1?'현재 단독 카드(1장 + 캡션) 연동됨':`현재 슬라이드(${slides.length}장) 대본 연동됨`;
      badge.className='analysis-state-badge done';
    }
    return;
  }
  const savedDraft=job.carousel_story_draft;
  if(!force&&savedDraft&&Number(savedDraft.count)===count&&savedDraft.cover_title){
    const bLines=Array.isArray(savedDraft.body_lines)?savedDraft.body_lines:[];
    const bodySlides=count>=3?bLines.slice(0,-1):[];
    const ctaLine=bLines.length?bLines[bLines.length-1]:'';
    applyCarouselStoryPlanToInputs({
      cover:savedDraft.cover_title,
      bodySlides,
      cta:ctaLine,
      body:bLines
    },savedDraft.ai_used?`AI(${savedDraft.model||'모델'}) 구성 완료`:'영상 분석 내용 자동 반영됨');
    return;
  }
  const analysisSig=`${job.id}:${count}:${job.analysis?.result?.summary||''}:${(job.analysis?.result?.observations||[]).length}:${job.media_ocr?.translated_text||''}:${job.source_text||''}:${job.product?.name||''}`;
  const coverEmpty=!($('carousel-cover-title')?.value||'').trim();
  const bodyEmpty=count>=3&&!($('carousel-body-texts')?.value||'').trim();
  const ctaEmpty=!($('carousel-cta-text')?.value||'').trim();
  if(force||coverEmpty||bodyEmpty||ctaEmpty||lastAutoPopulatedCarouselSignature!==analysisSig){
    lastAutoPopulatedCarouselSignature=analysisSig;
    const story=buildEditorialStoryboardLines(count);
    const hasAnalysis=Boolean(job.analysis?.result||job.media_ocr?.translated_text||job.source_text);
    applyCarouselStoryPlanToInputs(story,hasAnalysis?'영상 소재 분석 내용 자동 반영됨':'기본 스토리 구성됨');
  }
}
window.ensureCarouselStoryAutoPopulated=ensureCarouselStoryAutoPopulated;

if($('toggle-safe-zone-guide'))$('toggle-safe-zone-guide').addEventListener('change',e=>{
  const guide=$('player-safe-zone-guide');
  if(guide)guide.hidden=!e.target.checked;
});
if($('btn-overlay-undo'))$('btn-overlay-undo').addEventListener('click',()=>{
  performEditorUndo();
});
window.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){
    const activeEl=document.activeElement;
    const isNativeInput=activeEl&&(activeEl.tagName==='INPUT'||activeEl.tagName==='TEXTAREA');
    if(editorUndoStack.length&&job){
      e.preventDefault();
      performEditorUndo();
    }else if(!isNativeInput&&job){
      e.preventDefault();
      performEditorUndo();
    }
  }
});
document.querySelectorAll('[data-px-step]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const targetId=btn.dataset.pxTarget;
    const step=Number(btn.dataset.pxStep||0);
    const input=$(targetId);
    if(!input)return;
    pushEditorUndoSnapshot();
    const min=Number(input.min||18),max=Number(input.max||140);
    const cur=Number(input.value||48);
    const next=Math.max(min,Math.min(max,cur+step));
    input.value=String(next);
    const rangeEl=$(targetId+'-range');
    if(rangeEl)rangeEl.value=String(next);
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
});
for(const [rangeId,numId] of [
  ['overlay-title-size-range','overlay-title-size'],
  ['overlay-size-range','overlay-size'],
  ['overlay-title-box-radius-range','overlay-title-box-radius'],
  ['overlay-box-radius-range','overlay-box-radius'],
  ['overlay-title-stroke-width-range','overlay-title-stroke-width'],
  ['overlay-title-double-stroke-width-range','overlay-title-double-stroke-width'],
  ['overlay-stroke-width-range','overlay-stroke-width'],
  ['overlay-double-stroke-width-range','overlay-double-stroke-width'],
  ['carousel-stroke-width-range','carousel-stroke-width'],
  ['carousel-double-stroke-width-range','carousel-double-stroke-width'],
  ['erase-mask-opacity-range','erase-mask-opacity'],
  ['video-zoom-scale-range','video-zoom-scale']
]){
  const rEl=$(rangeId),nEl=$(numId);
  if(rEl&&nEl){
    rEl.addEventListener('focus',()=>{if(job&&!lastUndoSnapshotJson)lastUndoSnapshotJson=JSON.stringify(captureEditorStateSnapshot());});
    rEl.addEventListener('input',()=>{
      pushEditorUndoSnapshot();
      nEl.value=rEl.value;
      syncDraggableOverlayCanvas();
      saveActiveJobLocalDraft();
    });
    rEl.addEventListener('change',()=>{
      pushEditorUndoSnapshot();
      nEl.value=rEl.value;
      syncDraggableOverlayCanvas();
      saveActiveJobLocalDraft();
    });
  }
}
if($('btn-reset-title-box-dim'))$('btn-reset-title-box-dim').addEventListener('click',()=>{
  pushEditorUndoSnapshot();
  if($('overlay-title-box-w'))$('overlay-title-box-w').value='84';
  if($('overlay-title-box-h'))$('overlay-title-box-h').value='0';
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('타이틀 박스 가로·세로 크기를 자동 맞춤으로 초기화했습니다.');
});
// Video Timeline Scrubber Bar & Capture Handlers
function formatNleTimecode(seconds,fps=30){
  const s=Math.max(0,Number(seconds||0));
  const totalFrames=Math.floor(s*fps);
  const ff=totalFrames%fps;
  const totalSec=Math.floor(s);
  const ss=totalSec%60;
  const mm=Math.floor(totalSec/60)%60;
  const hh=Math.floor(totalSec/3600);
  const pad=n=>String(n).padStart(2,'0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

function syncNleScrubberPlayhead(curSec,durSec){
  const cur=Math.max(0,Number(curSec||0));
  const dur=Math.max(0.1,Number(durSec||job?.media?.duration||10));
  const pct=Math.max(0,Math.min(100,(cur/dur)*100));
  const line=$('scrubber-playhead-line');
  if(line)line.style.left=`${pct.toFixed(2)}%`;
  const tc=$('scrubber-clip-timecode');
  if(tc)tc.textContent=formatNleTimecode(cur,30);
  const tm=$('timeline-scrubber-time');
  if(tm)tm.textContent=`${cur.toFixed(2)}초 / ${dur.toFixed(2)}초`;
}

function renderNleScrubberTrack(currentJob,basePath){
  if(!currentJob)return;
  const clipNameEl=$('scrubber-clip-name');
  if(clipNameEl){
    clipNameEl.textContent=currentJob.name||currentJob.id||'video_clip.mp4';
  }
  const filmstripRow=$('scrubber-filmstrip-row');
  if(filmstripRow){
    const frames=Array.isArray(currentJob.evidence?.frames)&&currentJob.evidence.frames.length
      ?currentJob.evidence.frames
      :[{file:'frame-0.jpg',timestamp:0}];
    const signature=`${currentJob.id||''}:${currentJob.sha256||''}:${frames.length}:${currentJob.text_edit?.updated_at||''}`;
    if(filmstripRow.dataset.renderSig!==signature){
      filmstripRow.dataset.renderSig=signature;
      filmstripRow.replaceChildren();
      const cellCount=16;
      const cacheBust=encodeURIComponent(currentJob.sha256||'1')+(currentJob.text_edit?.updated_at?'_'+Math.floor(currentJob.text_edit.updated_at*1000):'');
      for(let i=0;i<cellCount;i++){
        const fIdx=Math.min(frames.length-1,Math.floor((i/cellCount)*frames.length));
        const frameObj=frames[fIdx]||frames[0];
        const cell=document.createElement('div');
        cell.className='nle-filmstrip-cell';
        const img=document.createElement('img');
        img.src=`${basePath}${frameObj.file}?t=${cacheBust}`;
        img.alt='';
        img.loading='eager';
        cell.appendChild(img);
        filmstripRow.appendChild(cell);
      }
    }
  }
  const canvas=$('scrubber-waveform-canvas');
  if(canvas&&canvas.getContext){
    const w=canvas.width||960;
    const h=canvas.height||36;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#042930';
    ctx.fillRect(0,0,w,h);
    const seedStr=String(currentJob.sha256||currentJob.id||currentJob.name||'takoh');
    let seed=2166136261;
    for(let i=0;i<seedStr.length;i++){
      seed^=seedStr.charCodeAt(i);
      seed=Math.imul(seed,16777619);
    }
    const nextRand=()=>{
      seed^=seed<<13;
      seed^=seed>>>17;
      seed^=seed<<5;
      return ((seed>>>0)%1000)/1000;
    };
    const hasAudio=currentJob.media?.has_audio!==false;
    const barStep=3;
    const barWidth=2;
    for(let x=2;x<w-2;x+=barStep){
      const r1=nextRand();
      const r2=nextRand();
      const env=0.35+0.65*Math.abs(Math.sin((x/w)*Math.PI*6.5+r2*1.4));
      const amp=hasAudio?Math.max(0.12,Math.min(0.96,(r1*0.75+0.25)*env)):0.12;
      const barH=Math.max(3,Math.round(amp*(h-6)));
      const y=h-barH-1;
      ctx.fillStyle='#2dd4bf';
      ctx.fillRect(x,y,barWidth,barH);
      if(hasAudio&&amp>0.72){
        ctx.fillStyle='#fb923c';
        ctx.fillRect(x,Math.max(1,y-2),barWidth,2);
      }
    }
  }
}

if($('preview')){
  $('preview').addEventListener('timeupdate',()=>{
    const v=$('preview');
    if(!v||v.hidden)return;
    const cur=Number(v.currentTime||0);
    const dur=Number(v.duration||job?.media?.duration||0);
    if($('timeline-scrubber-range')&&document.activeElement!==$('timeline-scrubber-range')){
      $('timeline-scrubber-range').value=String(cur);
    }
    syncNleScrubberPlayhead(cur,dur);
  });
}
if($('timeline-scrubber-range')){
  $('timeline-scrubber-range').addEventListener('input',e=>{
    const val=Number(e.target.value||0);
    const v=$('preview');
    if(v&&!v.hidden&&Number.isFinite(val)){
      v.pause();
      v.currentTime=val;
    }
    const dur=Number(v?.duration||job?.media?.duration||0);
    syncNleScrubberPlayhead(val,dur);
  });
}
let scrubberCaptureTimer=null;
function showScrubberCaptureStatus(text,isError=false){
  const el=$('scrubber-capture-status');
  if(!el)return;
  el.hidden=false;
  el.textContent=text;
  el.className='scrubber-capture-status '+(isError?'is-error':'is-ok');
  if(scrubberCaptureTimer)clearTimeout(scrubberCaptureTimer);
  scrubberCaptureTimer=setTimeout(()=>{el.hidden=true;},4500);
}
async function captureCurrentVideoMomentToBundle({switchToBundleTab=false}={}){
  if(!job||job.kind==='image')throw new Error('영상이 불러와진 상태에서 캡처할 수 있습니다.');
  const targetId=job.id;
  const prevAttCount=(job.attachments||[]).length;
  if(prevAttCount>=9)throw new Error('동반 첨부 이미지는 최대 9장(영상 포함 총 10개)까지 추가할 수 있습니다.');
  const rawTs=Number($('timeline-scrubber-range')?.value||$('preview')?.currentTime||0);
  const dur=Number(job?.media?.duration||$('preview')?.duration||10);
  const ts=Math.max(0,Math.min(Number.isFinite(rawTs)?rawTs:0,Math.max(0,dur-0.08)));
  const tsRound=Math.round(ts*100)/100;
  const label=`영상 캡처 (${tsRound.toFixed(2)}초)`;

  showScrubberCaptureStatus(`현재 시점(${tsRound.toFixed(2)}초) 캡처 중…`);

  // 1) Try native capture_time action first
  let next=await api(`jobs/${targetId}/attachments-config`,{
    action:'capture_time',
    timestamp:tsRound,
    add_to_bundle:true,
    label
  });

  // 2) Fallback if the running helper server on port 5006 was started before capture_time was loaded
  if((next?.attachments||[]).length<=prevAttCount){
    const existingSlides=(next?.carousel?.slides||job?.carousel?.slides||[]);
    if(existingSlides.length>0&&existingSlides.length<10){
      const addedJob=await api(`jobs/${targetId}/carousel-slide-action`,{
        action:'add',
        timestamp:tsRound,
        text:''
      });
      const newSlides=(addedJob?.carousel?.slides||[]);
      const lastSlide=newSlides[newSlides.length-1];
      const slideFile=lastSlide?.file||`carousel-${newSlides.length}.jpg`;
      await api(`jobs/${targetId}/attachments-config`,{
        action:'add_frame',
        file:slideFile,
        label
      });
      next=await api(`jobs/${targetId}/carousel-slide-action`,{
        action:'delete',
        index:lastSlide?.index||newSlides.length
      });
    }else if(existingSlides.length===0){
      await api(`jobs/${targetId}/carousel-generate`,{
        count:2,
        aspect:'original',
        erase_mode:'keep',
        slide_texts:['','']
      });
      await api(`jobs/${targetId}/carousel-slide-update`,{
        index:1,
        timestamp:tsRound,
        erase_mode:'keep',
        text:''
      });
      next=await api(`jobs/${targetId}/attachments-config`,{
        action:'add_frame',
        file:'carousel-1.jpg',
        label
      });
    }else{
      // Carousel already has 10 slides: temporarily update the last slide, copy to bundle, then restore
      const lastSlide=existingSlides[existingSlides.length-1];
      const origTs=Number(lastSlide.timestamp||0);
      const origText=String(lastSlide.text||'');
      const origMode=String(lastSlide.erase_mode||'keep');
      await api(`jobs/${targetId}/carousel-slide-update`,{
        index:lastSlide.index,
        timestamp:tsRound,
        erase_mode:'keep',
        text:''
      });
      await api(`jobs/${targetId}/attachments-config`,{
        action:'add_frame',
        file:lastSlide.file,
        label
      });
      next=await api(`jobs/${targetId}/carousel-slide-update`,{
        index:lastSlide.index,
        timestamp:origTs,
        erase_mode:origMode,
        text:origText
      });
    }
  }

  // Ensure the newly captured frame also appears in the extracted frames timeline (#frames) in memory
  const latestAtt=(next?.attachments||[])[(next?.attachments||[]).length-1];
  if(latestAtt?.file){
    if(!next.evidence)next.evidence={};
    if(!Array.isArray(next.evidence.frames))next.evidence.frames=[];
    const alreadyInFrames=next.evidence.frames.some(f=>f.file===latestAtt.file||f.file===latestAtt.source_file);
    if(!alreadyInFrames){
      next.evidence.frames.push({
        index:next.evidence.frames.length,
        timestamp:tsRound,
        file:latestAtt.file,
        url:`/studio/jobs/${targetId}/media/${latestAtt.file}`
      });
    }
  }

  if(job?.id===targetId){
    job=next;
    render();
    await refreshJobs();
  }
  if($('upload-format'))$('upload-format').value='combo';
  if(switchToBundleTab||(window.currentProductionStage==='editing'&&activeEditTab!=='bundle')){
    selectEditTab('bundle');
  }
  const newCount=(next?.attachments||[]).length;
  showScrubberCaptureStatus(`${tsRound.toFixed(2)}초 장면 캡처 완료 · 동반 이미지 #${newCount} 추가됨`);
}
if($('btn-capture-scrubber-bundle'))$('btn-capture-scrubber-bundle').onclick=()=>act('현재 영상 시점을 고화질 캡처해 동반 첨부 이미지 및 프레임에 추가하는 중…',async()=>{
  await captureCurrentVideoMomentToBundle();
},'현재 시점 장면을 캡처하여 동반 첨부 이미지 및 추출 프레임에 추가했습니다!');
if($('btn-bundle-capture-now'))$('btn-bundle-capture-now').onclick=()=>act('현재 영상 시점을 고화질 캡처해 동반 첨부 이미지에 추가하는 중…',async()=>{
  await captureCurrentVideoMomentToBundle({switchToBundleTab:true});
},'현재 시점 장면을 캡처하여 동반 첨부 이미지에 추가했습니다!');
if($('btn-capture-scrubber-carousel'))$('btn-capture-scrubber-carousel').onclick=()=>act('현재 영상 시점으로 활성 캐러셀 슬라이드 배경을 교체하는 중…',async()=>{
  if(!job||job.kind==='image')throw new Error('영상이 불러와진 상태에서 사용할 수 있습니다.');
  const ts=Number($('timeline-scrubber-range')?.value||$('preview')?.currentTime||0);
  if((job.carousel?.slides||[]).length>0){
    const targetIdx=activeCarouselSlideIndex||1;
    await update('carousel-slide-update',{index:targetIdx,timestamp:ts});
    showScrubberCaptureStatus(`슬라이드 #${targetIdx} 배경을 ${ts.toFixed(2)}초 장면으로 교체 완료`);
  }else{
    await captureCurrentVideoMomentToBundle();
  }
},'선택한 영상 시점으로 장면을 캡처·적용했습니다!');

document.querySelectorAll('[data-snap-target]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const target=btn.dataset.snapTarget;
    const y=Number(btn.dataset.snapY||50);
    if(target==='title'){
      if($('overlay-title-x'))$('overlay-title-x').value='50';
      if($('overlay-title-y'))$('overlay-title-y').value=String(y);
    }else{
      if($('overlay-sub-x'))$('overlay-sub-x').value='50';
      if($('overlay-sub-y'))$('overlay-sub-y').value=String(y);
    }
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
});
document.querySelectorAll('[data-insert-syntax]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const targetId=btn.dataset.targetInput;
    const mode=btn.dataset.insertSyntax;
    const el=$(targetId);
    if(!el)return;
    pushEditorUndoSnapshot();
    const start=el.selectionStart??el.value.length;
    const end=el.selectionEnd??el.value.length;
    const selected=el.value.slice(start,end)||'핵심포인트';
    const wrapped=mode==='box'?`[${selected}]`:`*${selected}*`;
    el.value=el.value.slice(0,start)+wrapped+el.value.slice(end);
    el.focus();
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
});
if($('btn-pull-analysis-subtitle'))$('btn-pull-analysis-subtitle').onclick=()=>{
  pushEditorUndoSnapshot();
  const lines=extractBestHookLines();
  const chosen=lines.slice(0,2).join('\n');
  if($('overlay-korean-text'))$('overlay-korean-text').value=chosen;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('AI 분석·OCR·본문에서 핵심 요약 자막을 가져왔습니다.');
};
if($('btn-fill-hook-title'))$('btn-fill-hook-title').onclick=()=>{
  pushEditorUndoSnapshot();
  const lines=extractBestHookLines();
  const prod=($('product-name')?.value||job?.product?.name||'').trim();
  let raw=lines[0]||'';
  if(raw&&!raw.includes('|')){
    const words=raw.replace(/\[|\]|\*/g,'').trim().split(/\s+/);
    if(words.length>=3){
      const mid=Math.max(1,Math.min(3,Math.ceil(words.length/2)));
      raw=`${words.slice(0,mid).join(' ')} | ${words.slice(mid).join(' ')}`;
    }else if(prod){
      raw=`${prod} | ${raw}`;
    }
  }
  if($('overlay-title-text'))$('overlay-title-text').value=raw;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('분석·본문·상품 정보에서 2줄 바이럴 후킹 타이틀을 자동으로 채웠습니다!');
};
document.querySelectorAll('.video-hook-chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const hookId=btn.dataset.videoHook||btn.dataset.videoHookTpl||'reels_giant_yellow_impact';
    const posY=btn.dataset.hookPosY||'18';
    if($('overlay-title-color'))$('overlay-title-color').value=hookId;
    if($('overlay-title-x'))$('overlay-title-x').value='50';
    if($('overlay-title-y'))$('overlay-title-y').value=String(posY);
    document.querySelectorAll('.video-hook-chip').forEach(c=>c.classList.toggle('active',c===btn));
    if($('overlay-title-text')&&!$('overlay-title-text').value.trim()){
      $('btn-fill-hook-title')?.click();
    }else{
      syncDraggableOverlayCanvas();
      saveActiveJobLocalDraft();
    }
    message(`영상 후킹 템플릿 [${btn.querySelector('strong')?.textContent||hookId}] 스타일을 적용했습니다!`);
  });
});
if($('btn-reset-overlay-pos'))$('btn-reset-overlay-pos').onclick=()=>{
  pushEditorUndoSnapshot();
  if($('overlay-title-x'))$('overlay-title-x').value='50';
  if($('overlay-title-y'))$('overlay-title-y').value='18';
  if($('overlay-sub-x'))$('overlay-sub-x').value='50';
  const pos=$('overlay-position')?.value||'bottom';
  if($('overlay-sub-y'))$('overlay-sub-y').value=String(pos==='top'?14:(pos==='center'?50:82));
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
};
let boxWidthDragBase={w:84,font:54};
if($('overlay-title-box-w')){
  const startBoxWTrack=()=>{
    boxWidthDragBase={
      w:Math.max(25,Number($('overlay-title-box-w')?.value||84)),
      font:Math.max(18,Number($('overlay-title-size')?.value||54))
    };
  };
  $('overlay-title-box-w').addEventListener('pointerdown',startBoxWTrack);
  $('overlay-title-box-w').addEventListener('focus',startBoxWTrack);
  $('overlay-title-box-w').addEventListener('input',()=>{
    const nextW=Math.max(25,Number($('overlay-title-box-w').value||84));
    if(boxWidthDragBase.w>0&&$('overlay-title-size')){
      const scaled=Math.round(Math.max(18,Math.min(140,boxWidthDragBase.font*(nextW/boxWidthDragBase.w))));
      $('overlay-title-size').value=String(scaled);
      if($('overlay-title-size-range'))$('overlay-title-size-range').value=String(scaled);
    }
  });
}
for(const id of [
  'overlay-title-text','overlay-title-badge','overlay-title-color','overlay-title-size','overlay-title-font',
  'overlay-title-box-w','overlay-title-box-h','overlay-title-box-radius',
  'overlay-title-stroke-width','overlay-title-stroke-color','overlay-title-double-stroke-width','overlay-title-double-stroke-color',
  'overlay-korean-text','overlay-size','overlay-font','overlay-style','overlay-box-radius',
  'overlay-stroke-width','overlay-stroke-color','overlay-double-stroke-width','overlay-double-stroke-color',
  'carousel-font','carousel-stroke-width','carousel-stroke-color','carousel-double-stroke-width','carousel-double-stroke-color',
  'text-erase-mode','mask-x','mask-y','mask-w','mask-h','erase-mask-color','erase-mask-opacity','toggle-mask-box',
  'video-zoom-scale','video-zoom-focus-x','video-zoom-focus-y','script'
]){
  $(id)?.addEventListener('focus',()=>{if(job&&!lastUndoSnapshotJson)lastUndoSnapshotJson=JSON.stringify(captureEditorStateSnapshot());});
  $(id)?.addEventListener('input',()=>{
    pushEditorUndoSnapshot();
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
  $(id)?.addEventListener('change',()=>{
    pushEditorUndoSnapshot();
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
}
function disableMaskBoxAndErase(){
  pushEditorUndoSnapshot();
  if($('toggle-mask-box'))$('toggle-mask-box').checked=false;
  if($('text-erase-mode'))$('text-erase-mode').value='none';
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('자막 지우기 마스크 영역을 껐습니다 (원본 유지). 필요할 때만 켜서 사용하세요.');
}
if($('btn-disable-mask-box'))$('btn-disable-mask-box').addEventListener('click',disableMaskBoxAndErase);
if($('text-erase-mode'))$('text-erase-mode').addEventListener('change',()=>{
  if($('text-erase-mode').value==='none'&&$('toggle-mask-box'))$('toggle-mask-box').checked=false;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
document.querySelectorAll('.erase-mode-chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const pick=btn.dataset.eraseModePick||'none';
    if($('text-erase-mode'))$('text-erase-mode').value=pick;
    if($('toggle-mask-box'))$('toggle-mask-box').checked=(pick!=='none');
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
    const modeNames={
      none:'원본 유지 (자막 지우기 안 함)',
      blur_subtitles:'흐림 (블러) — 자막·마스크 영역을 자연스럽게 흐림 처리',
      cover_subtitles:'덮어씌우기 — 지정 마스크 영역을 배경 박스로 가림',
      auto_subtitles:'완전 삭제 (AI 인페인팅) — 프레임별 자막을 감지해 배경으로 복원'
    };
    message(`자막 지우기 모드를 [${modeNames[pick]||pick}](으)로 설정했습니다.`);
  });
});
document.querySelectorAll('[data-mask-preset]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const preset=btn.dataset.maskPreset;
    const presets={
      bottom_sub:{x:6,y:72,w:88,h:18,label:'하단 자막줄 맞춤'},
      bottom_wide:{x:4,y:66,w:92,h:24,label:'하단 2줄 와이드 자막'},
      top_logo:{x:6,y:4,w:42,h:12,label:'상단 워터마크 영역'},
      corner_br:{x:62,y:78,w:34,h:16,label:'우측 하단 로고 영역'},
      center_banner:{x:8,y:40,w:84,h:20,label:'중앙 배너 영역'}
    };
    const p=presets[preset]||presets.bottom_sub;
    if($('mask-x'))$('mask-x').value=String(p.x);
    if($('mask-y'))$('mask-y').value=String(p.y);
    if($('mask-w'))$('mask-w').value=String(p.w);
    if($('mask-h'))$('mask-h').value=String(p.h);
    if($('toggle-mask-box'))$('toggle-mask-box').checked=true;
    if($('text-erase-mode')&&$('text-erase-mode').value==='none'){
      $('text-erase-mode').value='blur_subtitles';
    }
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
    message(`마스크 영역을 [${p.label}] 위치(${p.x}%, ${p.y}% · ${p.w}×${p.h}%)로 맞췄습니다. 좌측 화면에서 직접 드래그해 미세 조정하세요.`);
  });
});
document.querySelectorAll('[data-zoom-preset]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const z=Math.max(100,Math.min(160,Number(btn.dataset.zoomPreset||100)));
    if($('video-zoom-scale'))$('video-zoom-scale').value=String(z);
    if($('video-zoom-scale-range'))$('video-zoom-scale-range').value=String(z);
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
    message(z===100?'화면 배율을 100% 원본 크기로 되돌렸습니다.':`화면을 ${z}%로 확대했습니다. 상하좌우 테두리 워터마크·자막 크롭 효과가 즉시 적용됩니다.`);
  });
});
document.querySelectorAll('[data-zoom-step]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const step=Number(btn.dataset.zoomStep||0);
    const cur=Number($('video-zoom-scale')?.value||100);
    const next=Math.max(100,Math.min(160,cur+step));
    if($('video-zoom-scale'))$('video-zoom-scale').value=String(next);
    if($('video-zoom-scale-range'))$('video-zoom-scale-range').value=String(next);
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
});
if($('btn-reset-erase-mask-zoom'))$('btn-reset-erase-mask-zoom').addEventListener('click',()=>{
  pushEditorUndoSnapshot();
  if($('text-erase-mode'))$('text-erase-mode').value='none';
  if($('toggle-mask-box'))$('toggle-mask-box').checked=false;
  if($('mask-x'))$('mask-x').value='6';
  if($('mask-y'))$('mask-y').value='72';
  if($('mask-w'))$('mask-w').value='88';
  if($('mask-h'))$('mask-h').value='18';
  if($('erase-mask-color'))$('erase-mask-color').value='#0f172a';
  if($('erase-mask-opacity'))$('erase-mask-opacity').value='92';
  if($('erase-mask-opacity-range'))$('erase-mask-opacity-range').value='92';
  if($('video-zoom-scale'))$('video-zoom-scale').value='100';
  if($('video-zoom-scale-range'))$('video-zoom-scale-range').value='100';
  if($('video-zoom-focus-x'))$('video-zoom-focus-x').value='50';
  if($('video-zoom-focus-y'))$('video-zoom-focus-y').value='50';
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('자막 지우기·마스크·화면 확대 설정을 모두 원본 상태로 초기화했습니다.');
});
if($('overlay-position'))$('overlay-position').addEventListener('change',()=>{
  pushEditorUndoSnapshot();
  const pos=$('overlay-position').value;
  if($('overlay-sub-x'))$('overlay-sub-x').value='50';
  if($('overlay-sub-y'))$('overlay-sub-y').value=String(pos==='top'?14:(pos==='center'?50:82));
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
function bindDraggableChip(chipId,xInputId,yInputId,wInputId,hInputId,fontSizeInputId,fontSizeRangeId,defaultFontPx,maxFontPx,layerName){
  const chip=$(chipId),canvas=$('player-overlay-canvas');
  if(!chip||!canvas)return;
  let mode=null,resizeDir='',grabOffsetX=0,grabOffsetY=0;
  let startClientX=0,startClientY=0,startW=84,startH=16,startFontPx=defaultFontPx||54;
  let movedDistance=0;
  const updateFromEvent=e=>{
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=10||rect.height<=10)return;
    movedDistance+=Math.hypot(e.clientX-startClientX,e.clientY-startClientY);
    if(mode==='resize'){
      const dxPct=((e.clientX-startClientX)/rect.width)*100;
      const dyPct=((e.clientY-startClientY)/rect.height)*100;
      let nextW=startW,nextH=startH;
      if(resizeDir.includes('e'))nextW=startW+dxPct*2;
      if(resizeDir.includes('w'))nextW=startW-dxPct*2;
      if(resizeDir.includes('s'))nextH=startH+dyPct*2;
      if(resizeDir.includes('n'))nextH=startH-dyPct*2;
      const hasHoriz=resizeDir.includes('e')||resizeDir.includes('w');
      const hasVert=resizeDir.includes('n')||resizeDir.includes('s');
      let clampedW=startW,clampedH=startH;
      if(hasHoriz){
        clampedW=Math.round(Math.max(25,Math.min(96,nextW)));
        if($(wInputId))$(wInputId).value=String(clampedW);
      }
      if(hasVert){
        clampedH=Math.round(Math.max(8,Math.min(55,nextH)));
        if($(hInputId))$(hInputId).value=String(clampedH);
      }
      if(fontSizeInputId&&$(fontSizeInputId)){
        const ratioW=startW>0?(clampedW/startW):1;
        const ratioH=startH>0?(clampedH/startH):1;
        let scaleRatio=1;
        if(hasHoriz&&hasVert)scaleRatio=(ratioW*0.65)+(ratioH*0.35);
        else if(hasHoriz)scaleRatio=ratioW;
        else if(hasVert)scaleRatio=ratioH;
        const nextFont=Math.round(Math.max(18,Math.min(maxFontPx||140,startFontPx*scaleRatio)));
        $(fontSizeInputId).value=String(nextFont);
        if(fontSizeRangeId&&$(fontSizeRangeId))$(fontSizeRangeId).value=String(nextFont);
      }
      syncDraggableOverlayCanvas();
      return;
    }
    const cRect=chip.getBoundingClientRect();
    let minX=8,maxX=92,minY=8,maxY=92;
    if(cRect.width>0){
      const halfW=((cRect.width/2+6)/rect.width)*100;
      minX=Math.min(50,Math.max(6,halfW));
      maxX=Math.max(50,Math.min(94,100-halfW));
    }
    if(cRect.height>0){
      const halfH=((cRect.height/2+6)/rect.height)*100;
      minY=Math.min(50,Math.max(6,halfH));
      maxY=Math.max(50,Math.min(94,100-halfH));
    }
    let xPct=Math.max(minX,Math.min(maxX,((e.clientX-grabOffsetX-rect.left)/rect.width)*100));
    let yPct=Math.max(minY,Math.min(maxY,((e.clientY-grabOffsetY-rect.top)/rect.height)*100));
    const guideX=$('magnetic-guide-x'),guideY=$('magnetic-guide-y'),guideYLabel=$('magnetic-guide-y-label');
    let snappedX=false,snappedY=false,snapYTarget=50,snapYText='세로 중앙 (50%)';
    if(!e.altKey){
      if(Math.abs(xPct-50)<=4.5){
        xPct=50;
        snappedX=true;
      }
      if(Math.abs(yPct-50)<=3.5){
        yPct=50;
        snappedY=true;
        snapYTarget=50;
        snapYText='세로 정중앙 (50%)';
      }else if(Math.abs(yPct-18)<=2.8){
        yPct=18;
        snappedY=true;
        snapYTarget=18;
        snapYText='상단 훅 기준선 (18%)';
      }else if(Math.abs(yPct-78)<=2.8){
        yPct=78;
        snappedY=true;
        snapYTarget=78;
        snapYText='하단 자막 기준선 (78%)';
      }
    }
    if(guideX)guideX.hidden=!snappedX;
    if(guideY){
      guideY.hidden=!snappedY;
      if(snappedY){
        guideY.style.setProperty('--snap-y',`${snapYTarget}%`);
        if(guideYLabel)guideYLabel.textContent=snapYText;
      }
    }
    chip.classList.toggle('snapped-center-x',snappedX);
    chip.classList.toggle('snapped-center-y',snappedY);
    if($(xInputId))$(xInputId).value=String(Math.round(xPct*10)/10);
    if($(yInputId))$(yInputId).value=String(Math.round(yPct*10)/10);
    syncDraggableOverlayCanvas();
  };
  chip.addEventListener('pointerdown',e=>{
    e.preventDefault();
    e.stopPropagation();
    pushEditorUndoSnapshot();
    movedDistance=0;
    if(layerName){
      selectVideoTextLayer(layerName,{openInspectorTab:true,focusInput:false});
    }
    const handle=e.target.closest('.resize-handle');
    const rect=canvas.getBoundingClientRect();
    const chipRect=chip.getBoundingClientRect();
    startClientX=e.clientX;
    startClientY=e.clientY;
    if(handle&&rect.width>10&&rect.height>10){
      mode='resize';
      resizeDir=handle.dataset.resizeDir||'se';
      startW=Number($(wInputId)?.value)||((chipRect.width/rect.width)*100)||80;
      startH=Number($(hInputId)?.value)>0?Number($(hInputId)?.value):((chipRect.height/rect.height)*100)||16;
      startFontPx=Number($(fontSizeInputId)?.value||defaultFontPx||54);
      chip.classList.add('resizing');
    }else{
      mode='move';
      const chipCenterX=chipRect.left+chipRect.width/2;
      const chipCenterY=chipRect.top+chipRect.height/2;
      grabOffsetX=e.clientX-chipCenterX;
      grabOffsetY=e.clientY-chipCenterY;
      chip.classList.add('dragging');
    }
    try{chip.setPointerCapture(e.pointerId);}catch{}
    updateFromEvent(e);
  });
  chip.addEventListener('pointermove',e=>{
    if(!mode)return;
    e.preventDefault();
    updateFromEvent(e);
  });
  const stopDrag=e=>{
    if(!mode)return;
    const wasTap=(movedDistance<6);
    mode=null;
    chip.classList.remove('dragging','resizing','snapped-center-x','snapped-center-y');
    const guideX=$('magnetic-guide-x'),guideY=$('magnetic-guide-y');
    if(guideX)guideX.hidden=true;
    if(guideY)guideY.hidden=true;
    try{chip.releasePointerCapture(e.pointerId);}catch{}
    saveActiveJobLocalDraft();
    if(wasTap&&layerName){
      selectVideoTextLayer(layerName,{openInspectorTab:true,focusInput:true});
      message(layerName==='title'?'[상단 후킹 타이틀] 텍스트 편집창이 열렸습니다. 우측에서 문구·글꼴·패턴·색상·획을 바로 수정하세요.':'[하단 한글 자막] 텍스트 편집창이 열렸습니다. 우측에서 문구·글꼴·패턴·색상·획을 바로 수정하세요.');
    }
  };
  chip.addEventListener('pointerup',stopDrag);
  chip.addEventListener('pointercancel',stopDrag);
  chip.addEventListener('dblclick',e=>{
    e.preventDefault();
    e.stopPropagation();
    if(layerName){
      selectVideoTextLayer(layerName,{openInspectorTab:true,focusInput:true});
    }
  });
}
bindDraggableChip('drag-title-box','overlay-title-x','overlay-title-y','overlay-title-box-w','overlay-title-box-h','overlay-title-size','overlay-title-size-range',54,140,'title');
bindDraggableChip('drag-subtitle-box','overlay-sub-x','overlay-sub-y','overlay-sub-box-w','overlay-sub-box-h','overlay-size','overlay-size-range',42,110,'subtitle');

// --- CapCut-Style Multi-Text Layer Inspector Event Bindings ---
function ensureEditableTextLayer(seedOverrides={}){
  let lyr=getActiveVideoTextLayer();
  if(!lyr){
    const created=createDefaultVideoTextLayer(videoTextLayers.length,{
      text:'텍스트를 입력하세요',
      ...seedOverrides
    });
    videoTextLayers.push(created);
    activeTextLayerId=created.id;
    lyr=created;
  }
  return lyr;
}
for(const addBtnId of ['btn-inspector-add-text','btn-canvas-add-text']){
  if($(addBtnId))$(addBtnId).addEventListener('click',()=>{
    addVideoTextLayer();
  });
}
if($('btn-inspector-duplicate-layer'))$('btn-inspector-duplicate-layer').addEventListener('click',()=>{
  duplicateActiveVideoTextLayer();
});
for(const delBtnId of ['btn-inspector-delete-layer','btn-canvas-delete-selected-text']){
  if($(delBtnId))$(delBtnId).addEventListener('click',()=>{
    if(!activeTextLayerId){
      message('삭제할 텍스트가 선택되지 않았습니다.');
      return;
    }
    deleteVideoTextLayer(activeTextLayerId);
  });
}
for(const clearBtnId of ['btn-inspector-clear-all-layers','btn-canvas-delete-all-texts']){
  if($(clearBtnId))$(clearBtnId).addEventListener('click',()=>{
    clearAllVideoTextLayers();
  });
}
if($('btn-canvas-select-mask'))$('btn-canvas-select-mask').addEventListener('click',()=>{
  const curStage=window.currentProductionStage||'analysis';
  if(curStage!=='editing')document.querySelector('[data-production-stage="editing"]')?.click();
  selectEditTab('erase');
  if($('toggle-mask-box'))$('toggle-mask-box').checked=true;
  syncDraggableOverlayCanvas();
});
if($('btn-inspector-upload-font'))$('btn-inspector-upload-font').addEventListener('click',()=>{
  triggerCustomFontUpload('inspector-font-select');
});
if($('inspector-text-input'))$('inspector-text-input').addEventListener('input',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer({text:e.target.value});
  lyr.text=e.target.value;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
if($('inspector-badge-input'))$('inspector-badge-input').addEventListener('input',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.badge=e.target.value;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
if($('inspector-duration-select'))$('inspector-duration-select').addEventListener('change',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.duration=Number(e.target.value||0);
  saveActiveJobLocalDraft();
});
for(const boxBtnId of ['btn-inspector-insert-box','btn-inspector-wrap-box']){
  if($(boxBtnId))$(boxBtnId).addEventListener('click',()=>{
    const el=$('inspector-text-input');
    if(!el)return;
    pushEditorUndoSnapshot();
    const lyr=ensureEditableTextLayer();
    const start=el.selectionStart??el.value.length;
    const end=el.selectionEnd??el.value.length;
    const selected=el.value.slice(start,end)||'핵심강조';
    el.value=el.value.slice(0,start)+`[${selected}]`+el.value.slice(end);
    lyr.text=el.value;
    el.focus();
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
}
for(const starBtnId of ['btn-inspector-insert-star','btn-inspector-wrap-star']){
  if($(starBtnId))$(starBtnId).addEventListener('click',()=>{
    const el=$('inspector-text-input');
    if(!el)return;
    pushEditorUndoSnapshot();
    const lyr=ensureEditableTextLayer();
    const start=el.selectionStart??el.value.length;
    const end=el.selectionEnd??el.value.length;
    const selected=el.value.slice(start,end)||'포인트';
    el.value=el.value.slice(0,start)+`*${selected}*`+el.value.slice(end);
    lyr.text=el.value;
    el.focus();
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
}
if($('btn-inspector-autofill'))$('btn-inspector-autofill').addEventListener('click',()=>{
  pushEditorUndoSnapshot();
  const lines=extractBestHookLines();
  const prod=($('product-name')?.value||job?.product?.name||'').trim();
  let raw=lines[0]||'핵심 요약 텍스트';
  if(raw&&!raw.includes('|')){
    const words=raw.replace(/\[|\]|\*/g,'').trim().split(/\s+/);
    if(words.length>=3){
      const mid=Math.max(1,Math.min(3,Math.ceil(words.length/2)));
      raw=`${words.slice(0,mid).join(' ')} | ${words.slice(mid).join(' ')}`;
    }else if(prod){
      raw=`${prod} | ${raw}`;
    }
  }
  const lyr=ensureEditableTextLayer({text:raw});
  lyr.text=raw;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('AI 분석·본문에서 추천 문구를 현재 선택된 텍스트에 채웠습니다.');
});
if($('btn-inspector-tight-box'))$('btn-inspector-tight-box').addEventListener('click',()=>{
  pushEditorUndoSnapshot();
  const lyr=getActiveVideoTextLayer();
  if(lyr){
    lyr.box_w=0;
    lyr.box_h=0;
  }
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('박스 여백을 글자 길이에 딱 맞게 초기화했습니다.');
});
if($('btn-reset-overlay-pos'))$('btn-reset-overlay-pos').onclick=()=>{
  pushEditorUndoSnapshot();
  const lyr=getActiveVideoTextLayer();
  if(lyr){
    const idx=Math.max(0,videoTextLayers.findIndex(l=>l.id===lyr.id));
    const defaultYSlots=[18,78,50,32,64];
    lyr.x=50;
    lyr.y=defaultYSlots[idx%defaultYSlots.length];
  }
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message('선택한 텍스트 위치를 정중앙 기준선으로 초기화했습니다.');
};
document.querySelectorAll('[data-inspector-preset]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const rawPreset=btn.dataset.inspectorPreset||'reels_giant_yellow_impact';
    const preset=rawPreset==='clean_white_card'?'black':(rawPreset==='minimal_outline'?'outline':rawPreset);
    const lyr=ensureEditableTextLayer();
    // IMPORTANT: Never overwrite or modify lyr.text when changing preset styles!
    lyr.preset=preset;
    lyr.bg_enabled=(preset!=='outline');
    const presetTextColors={
      reels_giant_yellow_impact:'#ffea18',
      reels_rounded_black:'#ffffff',
      reels_top_banner_pink:'#111114',
      reels_3d_pop_shadow:'#ffffff',
      reels_neon_green_glow:'#52ff5c',
      reels_editorial_split:'#ffea18',
      black:'#141418',
      outline:'#ffffff'
    };
    const presetBgColors={
      reels_giant_yellow_impact:'#0e1018',
      reels_rounded_black:'#0a0c12',
      reels_top_banner_pink:'#eab0d5',
      reels_3d_pop_shadow:'#12141c',
      reels_neon_green_glow:'#080e0a',
      reels_editorial_split:'#0e1018',
      black:'#ffffff',
      outline:'#0e1018'
    };
    if(presetTextColors[preset])lyr.text_color=presetTextColors[preset];
    if(presetBgColors[preset])lyr.bg_color=presetBgColors[preset];
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
    message(`선택한 텍스트의 스타일만 [${btn.textContent.trim()}] 테마로 변경했습니다. (입력된 문구는 그대로 유지됩니다)`);
  });
});
if($('inspector-font-select'))$('inspector-font-select').addEventListener('change',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.font=e.target.value||'heavy_kr';
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
for(const [btnId,propKey] of [
  ['inspector-btn-bold','bold'],
  ['inspector-btn-italic','italic'],
  ['inspector-btn-underline','underline']
]){
  if($(btnId))$(btnId).addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const lyr=ensureEditableTextLayer();
    lyr[propKey]=!Boolean(lyr[propKey]);
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
}
document.querySelectorAll('[data-inspector-align]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const lyr=ensureEditableTextLayer();
    lyr.align=btn.dataset.inspectorAlign||'center';
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
});
for(const [rangeId,numId,propKey] of [
  ['inspector-font-size-range','inspector-font-size','size'],
  ['inspector-scale-pct-range','inspector-scale-pct','scale_pct'],
  ['inspector-opacity-range','inspector-opacity','opacity'],
  ['inspector-letter-spacing-range','inspector-letter-spacing','letter_spacing'],
  ['inspector-line-spacing-range','inspector-line-spacing','line_spacing'],
  ['inspector-box-radius-range','inspector-box-radius','box_radius'],
  ['inspector-bg-opacity-range','inspector-bg-opacity','bg_opacity'],
  ['inspector-stroke-width-range','inspector-stroke-width','stroke_width'],
  ['inspector-double-stroke-width-range','inspector-double-stroke-width','double_stroke_width']
]){
  const syncPair=val=>{
    pushEditorUndoSnapshot();
    if($(rangeId))$(rangeId).value=String(val);
    if($(numId))$(numId).value=String(val);
    const lyr=ensureEditableTextLayer();
    lyr[propKey]=Number(val);
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  };
  if($(rangeId))$(rangeId).addEventListener('input',e=>syncPair(e.target.value));
  if($(numId))$(numId).addEventListener('input',e=>syncPair(e.target.value));
}
if($('inspector-text-color'))$('inspector-text-color').addEventListener('input',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.text_color=e.target.value;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
document.querySelectorAll('[data-swatch-target="text"] .swatch-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const col=btn.dataset.color||'#ffea18';
    if($('inspector-text-color')){
      $('inspector-text-color').value=col;
      $('inspector-text-color').dispatchEvent(new Event('input'));
    }
  });
});
function applyBackgroundBoxCheckboxToggle(enabled){
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.bg_enabled=Boolean(enabled);
  if(enabled&&lyr.preset==='outline'){
    lyr.preset='reels_rounded_black';
  }
  if($('inspector-bg-enabled'))$('inspector-bg-enabled').checked=enabled;
  if($('inspector-bg-enabled-quick'))$('inspector-bg-enabled-quick').checked=enabled;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
  message(enabled?'배경 박스를 켰습니다. 글자 길이에 딱 맞는 여백으로 배경 박스가 표시됩니다.':'배경 박스를 해제했습니다. 투명 배경에 글자와 테두리(획)만 표시됩니다.');
}
if($('inspector-bg-enabled'))$('inspector-bg-enabled').addEventListener('change',e=>{
  applyBackgroundBoxCheckboxToggle(Boolean(e.target.checked));
});
if($('inspector-bg-enabled-quick'))$('inspector-bg-enabled-quick').addEventListener('change',e=>{
  applyBackgroundBoxCheckboxToggle(Boolean(e.target.checked));
});
if($('inspector-bg-color'))$('inspector-bg-color').addEventListener('input',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.bg_color=e.target.value;
  lyr.bg_enabled=true;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
if($('inspector-stroke-color'))$('inspector-stroke-color').addEventListener('input',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.stroke_color=e.target.value;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
if($('inspector-double-stroke-color'))$('inspector-double-stroke-color').addEventListener('input',e=>{
  pushEditorUndoSnapshot();
  const lyr=ensureEditableTextLayer();
  lyr.double_stroke_color=e.target.value;
  syncDraggableOverlayCanvas();
  saveActiveJobLocalDraft();
});
document.querySelectorAll('[data-snap-active]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pushEditorUndoSnapshot();
    const y=Number(btn.dataset.snapActive||50);
    const lyr=ensureEditableTextLayer();
    lyr.x=50;
    lyr.y=y;
    syncDraggableOverlayCanvas();
    saveActiveJobLocalDraft();
  });
});

// --- Left Studio Preview Width Resizer (01 Analysis / 02-A Video Edit / 02-B Carousel Edit) ---
function applyStudioPreviewWidth(rawPx,{save=true}={}){
  const px=Math.round(Math.max(280,Math.min(680,Number(rawPx)||430)));
  document.documentElement.style.setProperty('--studio-player-width',`${px}px`);
  const mediaCard=$('media');
  if(mediaCard)mediaCard.style.setProperty('--studio-player-width',`${px}px`);
  if($('studio-preview-width-range'))$('studio-preview-width-range').value=String(px);
  if($('studio-preview-width-val'))$('studio-preview-width-val').textContent=`${px}px`;
  if($('studio-resizer-width-pill'))$('studio-resizer-width-pill').textContent=`${px}px`;
  document.querySelectorAll('.btn-preview-size').forEach(btn=>{
    const targetPx=Number(btn.dataset.previewWidth||btn.dataset.previewSize||0);
    btn.classList.toggle('active',Math.abs(targetPx-px)<=14);
  });
  if(save){
    try{localStorage.setItem('takoh-studio-player-width',String(px));}catch{}
  }
  requestAnimationFrame(()=>syncDraggableOverlayCanvas());
}
(function initStudioPreviewWidthResizer(){
  let savedPx=430;
  try{
    const stored=Number(localStorage.getItem('takoh-studio-player-width'));
    if(Number.isFinite(stored)&&stored>=280&&stored<=680)savedPx=stored;
  }catch{}
  applyStudioPreviewWidth(savedPx,{save:false});
  document.querySelectorAll('.btn-preview-size').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const targetPx=Number(btn.dataset.previewWidth||btn.dataset.previewSize||430);
      applyStudioPreviewWidth(targetPx,{save:true});
    });
  });
  if($('studio-preview-width-range')){
    $('studio-preview-width-range').addEventListener('input',e=>{
      applyStudioPreviewWidth(e.target.value,{save:true});
    });
  }
  const resizer=$('studio-player-resizer');
  const playerCol=$('studio-player-column');
  if(resizer&&playerCol){
    let dragging=false,startX=0,startW=430,lastW=savedPx;
    resizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      dragging=true;
      startX=e.clientX;
      startW=playerCol.getBoundingClientRect().width||430;
      lastW=startW;
      resizer.classList.add('dragging');
      document.body.classList.add('resizing-studio-player');
      try{resizer.setPointerCapture(e.pointerId);}catch{}
    });
    resizer.addEventListener('pointermove',e=>{
      if(!dragging)return;
      e.preventDefault();
      const nextW=startW+(e.clientX-startX);
      lastW=nextW;
      applyStudioPreviewWidth(nextW,{save:false});
    });
    const endResize=e=>{
      if(!dragging)return;
      dragging=false;
      resizer.classList.remove('dragging');
      document.body.classList.remove('resizing-studio-player');
      try{resizer.releasePointerCapture(e.pointerId);}catch{}
      const curW=playerCol.getBoundingClientRect().width||lastW||430;
      applyStudioPreviewWidth(curW,{save:true});
    };
    resizer.addEventListener('pointerup',endResize);
    resizer.addEventListener('pointercancel',endResize);
    resizer.addEventListener('dblclick',()=>{
      applyStudioPreviewWidth(430,{save:true});
      message('미리보기 화면 크기를 표준(430px)으로 초기화했습니다.');
    });
  }
})();

function bindDraggableMaskBox(){
  const chip=$('drag-mask-box'),canvas=$('player-overlay-canvas');
  if(!chip||!canvas)return;
  let mode=null,resizeDir='',startClientX=0,startClientY=0;
  let startX=6,startY=72,startW=88,startH=18;
  const updateMaskFromEvent=e=>{
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=10||rect.height<=10)return;
    const dxPct=((e.clientX-startClientX)/rect.width)*100;
    const dyPct=((e.clientY-startClientY)/rect.height)*100;
    let nx=startX,ny=startY,nw=startW,nh=startH;
    if(mode==='move'){
      nx=Math.max(0,Math.min(100-nw,startX+dxPct));
      ny=Math.max(0,Math.min(100-nh,startY+dyPct));
    }else if(mode==='resize'){
      if(resizeDir.includes('e'))nw=Math.max(6,Math.min(100-startX,startW+dxPct));
      if(resizeDir.includes('s'))nh=Math.max(5,Math.min(100-startY,startH+dyPct));
      if(resizeDir.includes('w')){
        const maxDelta=startW-6;
        const clampedDx=Math.max(-startX,Math.min(maxDelta,dxPct));
        nx=startX+clampedDx;
        nw=startW-clampedDx;
      }
      if(resizeDir.includes('n')){
        const maxDelta=startH-5;
        const clampedDy=Math.max(-startY,Math.min(maxDelta,dyPct));
        ny=startY+clampedDy;
        nh=startH-clampedDy;
      }
    }
    if($('mask-x'))$('mask-x').value=String(Math.round(nx));
    if($('mask-y'))$('mask-y').value=String(Math.round(ny));
    if($('mask-w'))$('mask-w').value=String(Math.round(nw));
    if($('mask-h'))$('mask-h').value=String(Math.round(nh));
    syncDraggableOverlayCanvas();
  };
  chip.addEventListener('pointerdown',e=>{
    const closeBtn=e.target.closest('[data-close-mask-box]');
    if(closeBtn){
      e.preventDefault();
      e.stopPropagation();
      disableMaskBoxAndErase();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    pushEditorUndoSnapshot();
    const handle=e.target.closest('.resize-handle');
    startClientX=e.clientX;
    startClientY=e.clientY;
    startX=Number($('mask-x')?.value??6);
    startY=Number($('mask-y')?.value??72);
    startW=Number($('mask-w')?.value??88);
    startH=Number($('mask-h')?.value??18);
    if(handle){
      mode='resize';
      resizeDir=handle.dataset.resizeDir||'se';
      chip.classList.add('resizing');
    }else{
      mode='move';
      chip.classList.add('dragging');
    }
    try{chip.setPointerCapture(e.pointerId);}catch{}
    updateMaskFromEvent(e);
  });
  chip.addEventListener('pointermove',e=>{
    if(!mode)return;
    e.preventDefault();
    updateMaskFromEvent(e);
  });
  const stopMaskDrag=e=>{
    if(!mode)return;
    mode=null;
    chip.classList.remove('dragging','resizing');
    try{chip.releasePointerCapture(e.pointerId);}catch{}
    saveActiveJobLocalDraft();
  };
  chip.addEventListener('pointerup',stopMaskDrag);
  chip.addEventListener('pointercancel',stopMaskDrag);
}
bindDraggableMaskBox();

if($('btn-ocr-media-text'))$('btn-ocr-media-text').onclick=()=>act('화면 속 글자(OCR)를 인식하고 자연스러운 한국어로 번역하는 중…',async()=>{
  const tone=$('ocr-translate-tone')?.value||'natural';
  await update('media-text-ocr',{...credentials('analysis'),tone});
  const trans=job?.media_ocr?.translated_text||job?.media_ocr?.korean_translation||'';
  if(trans)$('overlay-korean-text').value=trans;
  syncDraggableOverlayCanvas();
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
  syncDraggableOverlayCanvas();
},'선택한 말투로 자연스러운 한국어 자막 번역을 완료했습니다!');
if($('btn-send-ocr-to-editor'))$('btn-send-ocr-to-editor').onclick=()=>{
  const trans=(job?.media_ocr?.translated_text||job?.media_ocr?.korean_translation||$('ocr-original-text')?.value||'').trim();
  document.querySelector('[data-production-stage="editing"]')?.click();
  if(trans){
    addVideoTextLayer({text:trans,y:78,size:42,preset:'reels_rounded_black',text_color:'#ffffff'});
  }
  syncDraggableOverlayCanvas();
  message('02-A 미디어 편집 스튜디오로 이동했습니다! 좌측 화면에서 텍스트를 클릭하거나 드래그해 배치하고 합성하세요.');
};
if($('btn-send-ocr-to-carousel'))$('btn-send-ocr-to-carousel').onclick=()=>{
  document.querySelector('[data-production-stage="carousel"]')?.click();
  if($('carousel-cover-title')&&!$('carousel-cover-title').value.trim()){
    $('btn-autofill-carousel-texts')?.click();
  }
  message('02-B 매거진 캐러셀·뉴스카드 스튜디오로 이동했습니다! 표지·본문·요약 스토리를 확인하고 세트를 생성하세요.');
};
if($('btn-apply-media-text-edit'))$('btn-apply-media-text-edit').onclick=()=>act('추가한 멀티 텍스트 레이어(글꼴·패턴·색상·자간/행간·정렬·확대·불투명도·2중 획) 및 자막 지우기·마스크·확대를 영상/이미지에 합성하는 중…',async()=>{
  const sourceId=job.id;
  const eraseMode=$('text-erase-mode')?.value||'none';
  const cleanLayers=videoTextLayers.filter(l=>Boolean((l.text||'').trim())).map(l=>({
    id:l.id,
    text:(l.text||'').trim(),
    badge:(l.badge||'').trim(),
    preset:l.preset||'reels_giant_yellow_impact',
    font:l.font||'heavy_kr',
    size:Math.max(16,Math.min(180,Number(l.size||54))),
    scale_pct:Math.max(50,Math.min(200,Number(l.scale_pct||100))),
    opacity:Math.max(15,Math.min(100,Number(l.opacity??100))),
    letter_spacing:Math.max(-4,Math.min(24,Number(l.letter_spacing||0))),
    line_spacing:Math.max(0.85,Math.min(2.2,Number(l.line_spacing||1.18))),
    align:l.align||'center',
    bold:Boolean(l.bold),
    italic:Boolean(l.italic),
    underline:Boolean(l.underline),
    text_color:l.text_color||'#ffea18',
    bg_enabled:Boolean(l.bg_enabled)&&l.preset!=='outline',
    bg_color:l.bg_color||'#0e1018',
    bg_opacity:Math.max(0,Math.min(100,Number(l.bg_opacity??88))),
    box_radius:Math.max(0,Math.min(80,Number(l.box_radius??18))),
    box_w:Number(l.box_w||0)>=20?Number(l.box_w):null,
    box_h:Number(l.box_h||0)>=6?Number(l.box_h):null,
    stroke_width:Math.max(0,Math.min(24,Number(l.stroke_width??4))),
    stroke_color:l.stroke_color||'#000000',
    double_stroke_width:Math.max(0,Math.min(24,Number(l.double_stroke_width||0))),
    double_stroke_color:l.double_stroke_color||'#facc15',
    x:Math.max(0,Math.min(100,Number(l.x??50))),
    y:Math.max(0,Math.min(100,Number(l.y??50))),
    duration:Math.max(0,Number(l.duration||0))
  }));
  const rectangle={
    x:Math.max(0,Math.min(95,Number($('mask-x')?.value??6))),
    y:Math.max(0,Math.min(95,Number($('mask-y')?.value??72))),
    w:Math.max(5,Math.min(100,Number($('mask-w')?.value??88))),
    h:Math.max(4,Math.min(100,Number($('mask-h')?.value??18)))
  };
  const maskColor=$('erase-mask-color')?.value||'#0f172a';
  const maskOpacity=Math.max(0.2,Math.min(1,Number($('erase-mask-opacity')?.value??92)/100));
  const videoZoom=Math.max(100,Math.min(160,Number($('video-zoom-scale')?.value||100)));
  const focusX=Math.max(0,Math.min(100,Number($('video-zoom-focus-x')?.value??50)));
  const focusY=Math.max(0,Math.min(100,Number($('video-zoom-focus-y')?.value??50)));
  const timer=(job.kind!=='image'&&(eraseMode.startsWith('auto_')||eraseMode==='local_fill'))?setInterval(async()=>{try{const progress=await api(`jobs/${sourceId}/text-clean-progress`);if(progress.stage==='detecting')message(`자막 처리 중… ${progress.total>0?Math.min(100,Math.floor(progress.frame/progress.total*100)):0}% (${progress.frame} / ${progress.total} 프레임)`);else if(progress.stage==='encoding')message('자막 지우기·화면 확대·타이포그래피 합성 인코딩 중…');}catch{}},2000):null;
  try{
    job=await api(`jobs/${sourceId}/media-text-edit`,{
      erase_mode:eraseMode,
      text_layers:cleanLayers,
      overlay_text:'',
      title_text:'',
      rectangle,
      mask_color:maskColor,
      mask_opacity:maskOpacity,
      video_zoom:videoZoom,
      focus_x:focusX,
      focus_y:focusY
    });
    saveActiveJobLocalDraft();
    render();await refreshJobs();
  }finally{if(timer)clearInterval(timer);}
},'추가한 텍스트 레이어 및 자막 지우기·마스크·확대 합성이 완료되었습니다!');
if($('btn-apply-media-text-edit-from-erase')&&$('btn-apply-media-text-edit')){
  $('btn-apply-media-text-edit-from-erase').addEventListener('click',()=>$('btn-apply-media-text-edit').click());
}

// --- Carousel Template Selector, 90% Cover Hook Formula & Cover/Body Storyboard Auto-Fill ---
document.querySelectorAll('.carousel-tpl-chip').forEach(chip=>{
  chip.addEventListener('click',()=>{
    const tpl=chip.dataset.carouselTpl||'editorial_dark';
    if($('carousel-template'))$('carousel-template').value=tpl;
    document.querySelectorAll('.carousel-tpl-chip').forEach(c=>c.classList.toggle('active',c===chip));
    message(`캐러셀 테마를 [${carouselTemplateNames[tpl]||tpl}](으)로 선택했습니다.`);
  });
});
document.querySelectorAll('[data-cover-hook-formula]').forEach(chip=>{
  chip.addEventListener('click',()=>{
    const formulaKey=chip.dataset.coverHookFormula||'number';
    if($('carousel-cover-hook-formula'))$('carousel-cover-hook-formula').value=formulaKey;
    document.querySelectorAll('[data-cover-hook-formula]').forEach(c=>c.classList.toggle('active',c===chip));
    const count=Number($('carousel-count')?.value||5);
    const prod=($('product-name')?.value||job?.product?.name||'').trim();
    const lines=extractBestHookLines();
    const curCover=($('carousel-cover-title')?.value||'').trim();
    const curParts=curCover.split('|').map(s=>s.trim());
    const seedTopic=curParts[0]||lines[0]||'핵심 포인트';
    const seedSub=curParts.slice(1).join(' ').trim()||lines[1]||'';
    const formatted=formatCoverHookByFormula(formulaKey,seedTopic,seedSub,prod,count);
    if($('carousel-cover-title'))$('carousel-cover-title').value=formatted.combined;
    // If slides are already generated and Slide 1 is present, also update Slide 1 in the workbench inputs or trigger update
    if($('wb-active-head-input')&&(activeCarouselSlideIndex===1||!activeCarouselSlideIndex)){
      $('wb-active-head-input').value=formatted.title;
      if($('wb-active-subtitle-input'))$('wb-active-subtitle-input').value=formatted.subtitle;
      if($('wb-active-badge-input'))$('wb-active-badge-input').value=formatted.badge;
    }
    const metaName=coverHookFormulaMeta[formulaKey]?.name||formulaKey;
    message(`첫 장(표지) 90% 후킹 공식을 [${metaName}](으)로 적용했습니다: "${formatted.title}"`);
  });
});
if($('carousel-count')){
  $('carousel-count').addEventListener('change',()=>{
    const count=Number($('carousel-count')?.value||5);
    if(count===1&&job?.id){
      singleCardModeOverrideJobId=job.id;
      enforceSingleCardModeIfActive(job);
      activeCarouselSlideIndex=1;
      renderCarouselPreview();
    }else if(count>1&&singleCardModeOverrideJobId){
      singleCardModeOverrideJobId=null;
    }
    updateCarouselStorySlotLabels(count);
    const story=buildEditorialStoryboardLines(count);
    applyCarouselStoryPlanToInputs(story,count===1?'이미지 1장 + 캡션(설명) 단독 카드 자동 반영됨':`${count}장 구조(표지·본문·마지막장) 자동 반영됨`);
  });
}
if($('carousel-body-texts')){
  $('carousel-body-texts').addEventListener('input',()=>syncCombinedCarouselCustomTexts());
}
if($('carousel-cta-text')){
  $('carousel-cta-text').addEventListener('input',()=>syncCombinedCarouselCustomTexts());
}
if($('btn-autofill-carousel-texts'))$('btn-autofill-carousel-texts').onclick=()=>{
  const count=Number($('carousel-count')?.value||5);
  const story=buildEditorialStoryboardLines(count);
  applyCarouselStoryPlanToInputs(story,count===1?'이미지 1장 + 캡션(설명) 단독 카드 자동 반영됨':'영상 소재 분석 + 첫장 90% 후킹 자동 반영됨');
  if($('carousel-erase-mode')&&$('carousel-erase-mode').value==='none'){
    $('carousel-erase-mode').value='cover_box';
  }
  message(count===1?'영상 소재 분석 내용을 토대로 이미지 1장 + 캡션(설명) 단독 카드 문구를 자동 완성했습니다!':`영상 소재 분석 내용과 첫 장 90% 후킹 공식을 토대로 1번 표지(Cover), 본문(Body), 마지막장 요약(CTA) ${count}장 대본을 자동 완성했습니다!`);
};
if($('btn-ai-compose-carousel-story'))$('btn-ai-compose-carousel-story').onclick=()=>act('선택한 AI 모델로 영상 분석 내용과 첫장 90% 후킹 공식을 바탕으로 표지·본문·마지막장 대본을 구성하는 중…',async()=>{
  if(!job)throw new Error('먼저 영상·소재를 불러와 주세요.');
  const count=Number($('carousel-count')?.value||5);
  const hookFormula=$('carousel-cover-hook-formula')?.value||'number';
  let aiCreds={};
  try{aiCreds=credentials('analysis');}catch{aiCreds={};}
  await update('carousel-story-draft',{
    ...aiCreds,
    count,
    hook_formula:hookFormula,
    use_ai:true
  });
  const draft=job?.carousel_story_draft;
  if(draft&&draft.cover_title){
    const bLines=Array.isArray(draft.body_lines)?draft.body_lines:[];
    const bodySlides=count>=3?bLines.slice(0,-1):[];
    const ctaLine=bLines.length?bLines[bLines.length-1]:'';
    applyCarouselStoryPlanToInputs({
      cover:draft.cover_title,
      bodySlides,
      cta:ctaLine,
      body:bLines
    },draft.ai_used?`AI(${draft.model||'선택 모델'}) 구성 완료`:'영상 분석 내용 자동 반영됨');
  }else{
    ensureCarouselStoryAutoPopulated(true);
  }
},'선택한 AI 모델과 첫 장 90% 후킹 공식으로 표지·본문·마지막장 대본 구성을 완료했습니다!');
if($('carousel-erase-mode')){
  $('carousel-erase-mode').addEventListener('change',()=>{
    const isNone=$('carousel-erase-mode').value==='none';
    if($('carousel-auto-caption')){
      $('carousel-auto-caption').checked=!isNone;
    }
  });
}
if($('btn-carousel-single-card'))$('btn-carousel-single-card').onclick=()=>{
  if($('carousel-count'))$('carousel-count').value='1';
  if(job?.id){
    singleCardModeOverrideJobId=job.id;
    enforceSingleCardModeIfActive(job);
    activeCarouselSlideIndex=1;
    renderCarouselPreview();
  }
  updateCarouselStorySlotLabels(1);
  const story=buildEditorialStoryboardLines(1);
  applyCarouselStoryPlanToInputs(story,'이미지 1장 + 캡션(설명) 단독 카드 자동 반영됨');
  if(!busy){
    $('btn-generate-carousel')?.click();
  }else{
    message('이미지 1장 + 캡션(설명) 단독 카드 모드로 전환했습니다.');
  }
};
if($('btn-generate-carousel'))$('btn-generate-carousel').onclick=()=>act('매거진 디자인 테마와 제목·캡션(설명) 대본을 적용해 카드 이미지를 생성하는 중…',async()=>{
  if(!($('carousel-cover-title')?.value||'').trim()||(!($('carousel-body-texts')?.value||'').trim()&&!($('carousel-cta-text')?.value||'').trim())){
    ensureCarouselStoryAutoPopulated(true);
  }
  syncCombinedCarouselCustomTexts();
  const normalizeTwoTier=str=>String(str||'').split('|').map(p=>p.trim()).filter(Boolean).join('\n');
  const count=Math.max(1,Math.min(10,Number($('carousel-count')?.value||5)));
  const hookFormula=$('carousel-cover-hook-formula')?.value||'number';
  const bodyLinesRaw=($('carousel-body-texts')?.value||'').split(/\r?\n/).map(s=>normalizeTwoTier(s)).filter(Boolean);
  const ctaLineRaw=normalizeTwoTier($('carousel-cta-text')?.value||'');
  let customLines=[];
  if(count===1){
    singleCardModeOverrideJobId=job?.id||null;
    customLines=[];
  }else if(count===2){
    singleCardModeOverrideJobId=null;
    customLines=ctaLineRaw?[ctaLineRaw]:bodyLinesRaw.slice(0,1);
  }else{
    singleCardModeOverrideJobId=null;
    const targetBodyCount=count-2;
    const fallbackStory=buildEditorialStoryboardLines(count);
    const paddedBody=[...bodyLinesRaw];
    while(paddedBody.length<targetBodyCount){
      const fbLine=fallbackStory.bodySlides[paddedBody.length]||fallbackStory.bodySlides[0]||'핵심 체크 포인트';
      paddedBody.push(normalizeTwoTier(fbLine));
    }
    const finalBody=paddedBody.slice(0,targetBodyCount);
    const finalCta=ctaLineRaw||normalizeTwoTier(fallbackStory.cta);
    customLines=[...finalBody,finalCta];
  }
  if($('carousel-custom-texts')){
    $('carousel-custom-texts').value=customLines.map(s=>s.replace(/\n/g,' | ')).join('\n');
  }
  const rawCoverTitle=normalizeTwoTier($('carousel-cover-title')?.value||'');
  const singleCardBodyCaption=count===1?String($('carousel-cta-text')?.value||'').trim():'';
  const coverTitle=(count===1&&singleCardBodyCaption)?[rawCoverTitle,singleCardBodyCaption].filter(Boolean).join('\n'):rawCoverTitle;
  const eraseMode=$('carousel-erase-mode')?.value||'cover_box';
  const template=$('carousel-template')?.value||'editorial_dark';
  const carouselFont=$('carousel-font')?.value||'heavy_kr';
  const carouselStrokeW=Math.max(0,Math.min(24,Number($('carousel-stroke-width')?.value??0)));
  const carouselStrokeC=$('carousel-stroke-color')?.value||'#000000';
  const carouselDStrokeW=Math.max(0,Math.min(24,Number($('carousel-double-stroke-width')?.value??0)));
  const carouselDStrokeC=$('carousel-double-stroke-color')?.value||'#facc15';
  let aiCreds={};
  try{aiCreds=credentials('analysis');}catch{aiCreds={};}
  await update('carousel-generate',{
    ...aiCreds,
    count,
    hook_formula:hookFormula,
    aspect:$('carousel-ratio').value||'4:5',
    erase_mode:eraseMode,
    template,
    cover_title:coverTitle,
    overlay_position:$('carousel-text-pos').value||'bottom',
    overlay_size:4.6,
    overlay_color:'white',
    overlay_bg:true,
    font_family:carouselFont,
    stroke_width:carouselStrokeW,
    stroke_color:carouselStrokeC,
    double_stroke_width:carouselDStrokeW,
    double_stroke_color:carouselDStrokeC,
    auto_caption:(eraseMode==='none'&&!coverTitle&&!customLines.length)?false:Boolean($('carousel-auto-caption')?.checked??true),
    slide_texts:customLines
  });
  if(count===1&&job?.carousel?.slides?.length>1){
    // Compatibility when running helper server on port 5006 was started before count=1 backend update
    const s1=job.carousel.slides[0];
    const tier=splitSlideThreeTierText({text:coverTitle});
    const curVideoTs=(typeof $('preview')?.currentTime==='number'&&Number.isFinite($('preview').currentTime)&&$('preview').currentTime>0)?$('preview').currentTime:s1.timestamp;
    await update('carousel-slide-update',{
      index:1,
      slide_total:1,
      timestamp:curVideoTs,
      title:tier.title,
      subtitle:tier.subtitle,
      body_text:tier.bodyText||singleCardBodyCaption,
      text:coverTitle,
      role:'cover',
      template
    });
    enforceSingleCardModeIfActive(job);
    activeCarouselSlideIndex=1;
    renderCarouselPreview();
  }
  if(count===1){
    if($('upload-format'))$('upload-format').value='combo';
  }else{
    if($('upload-platform'))$('upload-platform').value='instagram_carousel';
    if($('upload-format'))$('upload-format').value='carousel';
  }
},'카드 생성을 완료했습니다! 워크벤치 우측 [① 문구 · 캡션(설명)] 탭에서 제목·부제목·캡션(상세 설명)과 사진을 실시간 편집하세요.');
if($('btn-carousel-upload-photo'))$('btn-carousel-upload-photo').onclick=()=>{
  pendingCarouselPhotoMode='replace';
  $('carousel-slide-photo-input')?.click();
};
if($('btn-carousel-paste-photo'))$('btn-carousel-paste-photo').onclick=async()=>{
  try{
    const dataUrl=await readClipboardImageAsDataUrl();
    await applyCarouselCustomPhotoDataUrl(dataUrl,'replace','클립보드 붙여넣기 이미지');
  }catch(err){
    message(err.message,true);
  }
};
if($('carousel-slide-photo-input')){
  $('carousel-slide-photo-input').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    e.target.value='';
    if(!file)return;
    try{
      const dataUrl=await readImageFileAsDataUrl(file);
      await applyCarouselCustomPhotoDataUrl(dataUrl,pendingCarouselPhotoMode,`불러온 이미지(${file.name})`);
    }catch(err){
      message(err.message,true);
    }
  });
}
window.addEventListener('paste',async e=>{
  if(!job)return;
  const isCarouselStage=(window.currentProductionStage==='carousel')||(!$('stage-carousel-panel')?.hidden);
  if(!isCarouselStage)return;
  const items=e.clipboardData?.items||[];
  let imgFile=null;
  for(const item of items){
    if(item.type&&item.type.startsWith('image/')){
      imgFile=item.getAsFile();
      break;
    }
  }
  if(!imgFile)return;
  e.preventDefault();
  try{
    const dataUrl=await readImageFileAsDataUrl(imgFile);
    await applyCarouselCustomPhotoDataUrl(dataUrl,'replace','Ctrl+V 클립보드 붙여넣기 이미지');
  }catch(err){
    message(err.message,true);
  }
});
if($('btn-carousel-add-slide'))$('btn-carousel-add-slide').onclick=()=>act('현재 재생 화면으로 새 슬라이드를 추가하는 중…',async()=>{
  singleCardModeOverrideJobId=null;
  const cur=$('preview')?.currentTime;
  const ts=(typeof cur==='number'&&Number.isFinite(cur))?cur:null;
  await update('carousel-slide-action',{
    action:'add',
    timestamp:ts,
    title:'[추가 체크 포인트]',
    subtitle:'이 장면에서 주목해야 할 핵심 디테일',
    body_text:''
  });
  if($('carousel-count')&&job?.carousel?.slides?.length){
    $('carousel-count').value=String(Math.min(10,job.carousel.slides.length));
  }
},'새 슬라이드를 추가하고 슬라이드 번호를 갱신했습니다!');
if($('btn-carousel-attach-all'))$('btn-carousel-attach-all').onclick=()=>act('캐러셀 슬라이드를 게시 첨부 묶음으로 구성하는 중…',async()=>{
  enforceSingleCardModeIfActive(job);
  const slideCount=(job?.carousel?.slides||[]).length||1;
  await update('attachments-config',{action:'preset_video_plus_images',image_count:Math.min(9,slideCount)});
  if($('upload-format'))$('upload-format').value='combo';
},'캐러셀 카드를 멀티미디어 게시 첨부 목록에 반영했습니다!');
$('analyze').onclick=()=>act('선택한 영상의 장면·음성 대사와 원본 게시물 제목·설명(캡션)·본문을 통합 분석하는 중…',async()=>{
  let curSourceText=($('source-post-text')?.value||job?.source_text||'').trim();
  if(!curSourceText&&job?.source&&/^https?:\/\//i.test(job.source)){
    try{await fetchSourcePostCaptionWithFallback();curSourceText=($('source-post-text')?.value||job?.source_text||'').trim();}catch{}
  }
  await update('analyze',{...credentials('analysis'),source_text:curSourceText});
  const langInfo=detectPostLanguageClient(curSourceText);
  const existingKo=($('source-post-translated-text')?.value||job?.source_text_ko||job?.analysis?.result?.source_translation||'').trim();
  if(curSourceText&&langInfo.needsTranslation&&!existingKo){
    try{await translateSourcePostTextWithFallback(curSourceText,$('source-translate-tone')?.value||'natural');}catch{}
  }
  render();
},'AI 장면·음성 + 원본 게시물 제목·설명(캡션)·본문 통합 분석이 완료되었습니다!');
$('product-form').onsubmit=event=>{event.preventDefault();const mode=$('affiliate-entry-mode')?.value||'manual';act('상품 저장 중…',()=>{if(mode==='manual'&&!$('affiliate-url').value.trim())throw Error('직접 발급한 제휴 링크를 입력하세요.');return update('product',{platform:$('platform').value,name:$('product-name').value,url:mode==='api'?$('product-url').value:'',link_entry_mode:mode,affiliate_url:$('affiliate-url').value,confirmed:$('confirmed').checked});},'상품과 제휴 링크를 저장했습니다.');};
$('draft').onclick=()=>act('내 스타일로 한국어 게시글 3안을 작성하는 중…',()=>{
  if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');
  const rawTxt=($('source-post-text')?.value||job?.source_text||'').trim();
  const koTxt=($('source-post-translated-text')?.value||job?.source_text_ko||job?.analysis?.result?.source_translation||'').trim();
  const combinedSource=(koTxt&&koTxt!==rawTxt)?`${rawTxt}\n[한국어 자연 번역]\n${koTxt}`.trim():(rawTxt||koTxt);
  return update('draft',{...credentials('writing'),style:$('draft-style').value,include_ad_tag:Boolean($('include-ad-tag')?.checked),source_text:combinedSource});
});
$('writing-save-final').onclick=()=>{$('prepare').click();};
$('prepare').onclick=()=>act('본문과 첫 댓글 확정 저장 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('prepare',{body:$('script').value,script:$('script').value,disclosure:$('disclosure').value,comment:$('comment').value,selected:job?.draft?.selected||0});},'본문과 첫 댓글을 확정 저장했습니다. 이제 원하는 플랫폼(쓰레드·인스타·네이버 클립·틱톡)으로 바로 업로드할 수 있습니다.');
for(const target of ['body','comment']) $('copy-'+target).onclick=()=>act('복사 중…',async()=>{await navigator.clipboard.writeText($(target).value);}, '복사했습니다. 원하는 채널에 붙여 넣어 주세요.');
$('new-job').onclick=()=>{job=null;editJobId=null;render();$('upload-form').reset();if($('fetch-url')){$('fetch-url').value='';$('fetch-url').focus();}refreshJobs().catch(e=>message(e.message,true));};
if($('btn-goto-reference'))$('btn-goto-reference').onclick=()=>document.querySelector('[data-workspace="reference"]')?.click();
if($('btn-toggle-style-drawer')&&$('writing-style-drawer')){
  $('btn-toggle-style-drawer').onclick=()=>{
    const open=$('writing-style-drawer').hidden;
    $('writing-style-drawer').hidden=!open;
    $('btn-toggle-style-drawer').setAttribute('aria-expanded',String(open));
    $('btn-toggle-style-drawer').textContent=`내 스타일 추가·수정 ${open?'▴':'▾'}`;
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
      message(`${btn.textContent} 고지 문구를 첫 댓글에 반영했습니다. [본문 · 첫 댓글 최종 확정 저장]을 눌러 저장하세요.`);
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
   const chip=text('button',`${term}`);
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
    const thumbCandidates=[ref.thumbnailDataUrl,ref.previewUrl,ref.thumbnailUrl,ref.poster,ref.imageUrls?.[0]].filter(u=>typeof u==='string'&&u.trim());
    const uniqueCandidates=[...new Set(thumbCandidates)];
    let candidateIdx=0;
    const thumbUrl=uniqueCandidates[0]||'';
    const cardIdx=list.children.length;
    const img=document.createElement('img');img.alt='콘텐츠 썸네일';img.className='ref-thumb-img';img.loading=cardIdx<16?'eager':'lazy';img.decoding='async';img.referrerPolicy='no-referrer';
    const fallback=document.createElement('div');fallback.className='ref-thumb-fallback';fallback.hidden=Boolean(thumbUrl);
    const fallbackText=document.createElement('span');fallbackText.textContent=thumbUrl?'썸네일 로드 실패':'썸네일 없음';
    const retryBtn=document.createElement('button');retryBtn.type='button';retryBtn.className='btn-retry-thumb secondary';retryBtn.textContent='다시 가져오기';
    retryBtn.onclick=e=>{
      e.stopPropagation();
      candidateIdx=0;
      const first=uniqueCandidates[0];
      if(!first)return;
      fallback.hidden=true;img.hidden=false;
      img.src=first.startsWith('data:')?first:(first+(first.includes('?')?'&':'?')+'_t='+Date.now());
    };
    fallback.append(fallbackText);if(thumbUrl)fallback.append(retryBtn);
    if(thumbUrl){
      img.onload=()=>{img.hidden=false;fallback.hidden=true;};
      img.onerror=()=>{
        candidateIdx++;
        if(candidateIdx<uniqueCandidates.length){
          img.src=uniqueCandidates[candidateIdx];
        }else{
          img.hidden=true;fallback.hidden=false;
        }
      };
      img.src=thumbUrl;
    }else{img.hidden=true;fallback.hidden=false;}
    thumbBox.append(img,fallback);

    const badge=document.createElement('span');badge.className='media-badge';
    const hasCoverFrameInRef=(ref.imageUrls||[]).some(u=>isThreadsVideoCoverFrameUrl(u));
    const isVideoRef=ref.mediaKind==='video'||hasCoverFrameInRef||/(?:youtube\.com|youtu\.be)/i.test(ref.permalink||'');
    const cleanVideoUrls=(ref.videoUrls||[]).filter(u=>u&&u!==ref.permalink&&!/(?:youtube\.com|youtu\.be)/i.test(u));
    const cleanImageUrls=cleanAndDeduplicateCompanionImageUrls(ref.imageUrls||[],ref);
    const vCount=cleanVideoUrls.length||(hasCoverFrameInRef?1:0), iCount=cleanImageUrls.length;
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
      ...(cleanVideoUrls.length?cleanVideoUrls.map((u,idx)=>({url:u,kind:'video',label:iCount>0?`영상 #${idx+1} + 동반 이미지 ${iCount}장`:`영상 #${idx+1}`})):(isVideoRef?[{url:'',kind:'video',label:iCount>0?`메인 영상 + 동반 이미지 ${iCount}장 (2개 모두)`:`메인 영상`}]:[])),
      ...cleanImageUrls.map((u,idx)=>({url:u,kind:'image',label:`이미지 #${idx+1} 단독`}))
    ];
    const hasExplicitUserMediaChoice=referenceMediaChoices.has(ref.permalink);
    let chosenMedia=allMedia.find(m=>m.url===referenceMediaChoices.get(ref.permalink))||allMedia[0]||null;
    if(allMedia.length>1){
      const selectorWrap=document.createElement('div');selectorWrap.className='media-selector-wrap';
      selectorWrap.append(text('label','사용할 미디어 선택:'));
      const selectEl=document.createElement('select');
      allMedia.forEach((m,idx)=>{const opt=document.createElement('option');opt.value=idx;opt.textContent=m.label;selectEl.append(opt);});
      selectEl.value=String(Math.max(0,allMedia.indexOf(chosenMedia)));
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
          const isThreadsUrl=/(?:threads\.com|threads\.net)\//i.test(ref.permalink||'');
          const explicitPick=referenceMediaChoices.has(ref.permalink);
          const payload={
            url:ref.permalink,
            kind:isVideoRef?'video':(isThreadsUrl?'auto':(ref.mediaKind||'auto')),
            source_text:ref.text||'',
            video_urls:cleanVideoUrls,
            image_urls:cleanImageUrls
          };
          if(chosenMedia&&chosenMedia.url&&(chosenMedia.kind==='video'||explicitPick||!isThreadsUrl)){
            payload.media_url=chosenMedia.url;
            payload.kind=chosenMedia.kind;
            if(explicitPick)payload.explicit_media_choice=true;
          }
          try{
            const acquired=await api('acquire',payload);
            job=await normalizeAcquiredComboJob(acquired,{
              url:ref.permalink,
              sourceText:ref.text||'',
              cleanImageUrls,
              explicitMediaChoice:explicitPick&&chosenMedia?.kind==='image'
            });
            if((job?.attachments||[]).length>0&&$('upload-format'))$('upload-format').value='combo';
          }catch(err){statusText.textContent='획득 실패: '+err.message;referenceStates.set(ref.permalink,statusText.textContent);throw err;}
          statusText.textContent='준비 완료!';referenceStates.set(ref.permalink,statusText.textContent);
          render();await refreshJobs();
          document.querySelector('[data-workspace="create"]')?.click();
          document.querySelector('[data-production-stage="analysis"]')?.click();
        },'원본을 획득하여 [콘텐츠 제작 › 01 영상·소재 분석] 준비를 마쳤습니다.');
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
document.querySelectorAll('[data-style-mode]').forEach(btn=>{btn.addEventListener('click',()=>{const mode=btn.dataset.styleMode;if($('draft-style')&&mode){$('draft-style').value=mode;fillStyle();message('말투를 선택했습니다. [초안 3개 만들기]를 누르면 AI 작성을 시작합니다.');}});});
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
 const packet=await exportPlatformPacket(job.id,{when,automatic:$('extension-mode').value==='auto',platform,publish_format});
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
   const packet=await exportPlatformPacket(job.id,{when,automatic,platform,publish_format});
   await uploadBridge('upload',packet);
 }
 await refreshUploadQueue();
},'선택한 모든 플랫폼을 휴먼터치 업로드 대기열에 등록했습니다.');

$('save-commerce').onclick=()=>act('검색·제휴 설정 암호화 저장 중…',async()=>{const state=await api('commerce-settings',{serp_key:$('serp-key').value,coupang_access:$('coupang-access').value,coupang_secret:$('coupang-secret').value});$('commerce-status').textContent='등록됨: '+state.configured.join(', ');for(const id of ['serp-key','coupang-access','coupang-secret'])$(id).value='';if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();},'API 설정을 암호화하여 저장했습니다.');
if($('clear-coupang-keys'))$('clear-coupang-keys').onclick=()=>act('쿠팡파트너스 API 키 삭제 중…',async()=>{await api('connections-status',{coupang_access:'',coupang_secret:'',clear_coupang_access:true,clear_coupang_secret:true});$('coupang-access').value='';$('coupang-secret').value='';if(window.refreshCommerceSettings)await window.refreshCommerceSettings();else if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();},'쿠팡파트너스 API 키를 삭제했습니다.');

$('platform').addEventListener('change',()=>{if(!job?.disclosure)$('disclosure').value=disclosureDefaults[$('platform').value]||'';});

function uploadBridge(kind,packet){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('브라우저 브리지 또는 확장 프로그램을 새로고침한 뒤 다시 연결하세요.'));},5000);function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);event.data.success?resolve(event.data.data):reject(new Error(event.data.error));}window.addEventListener('message',receive);window.postMessage({source:'takoh-studio-ui',kind,packet,requestId},location.origin);});}
async function refreshUploadQueue(){
  const queue=await uploadBridge('upload-status');
  document.dispatchEvent(new CustomEvent('studio-upload-queue',{detail:queue}));
  const container=$('upload-queue');
  container.replaceChildren();
  const states={
    queued:'예약 대기',
    running:'휴먼터치 업로드 중',
    awaiting_confirmation:'본문 입력 완료 · 직접 게시 확인 대기',
    posted:'게시 완료 확인됨',
    partial_success:'본문 게시 완료 · 첫 댓글 확인 필요',
    uncertain:'결과 확인 필요 · 자동 재시도 중지',
    missed:'예약 시각 경과 · 실행 안 함',
    cancelled:'예약 취소됨'
  };
  const platformDefaultUrls={
    threads:'https://www.threads.com/',
    instagram:'https://www.instagram.com/',
    instagram_reels:'https://www.instagram.com/reels/',
    instagram_carousel:'https://www.instagram.com/',
    naver_clip:'https://m.blog.naver.com/GoClipWrite.naver',
    tiktok:'https://www.tiktok.com/tiktokstudio/upload'
  };
  for(const item of queue){
    const card=document.createElement('div');
    card.className='upload-verify-card';
    card.dataset.state=item.state||'queued';
    const top=document.createElement('div');
    top.className='upload-verify-top';
    const titleRow=document.createElement('div');
    titleRow.className='upload-verify-title';
    const platBadge=text('span',platformNames[item.platform]||item.platform||'Threads');
    platBadge.className='upload-verify-plat-badge';
    const nameEl=text('strong',item.name||'제목 없음');
    const stateBadge=text('span',states[item.state]||item.state||'대기');
    stateBadge.className='upload-verify-state-badge';
    stateBadge.dataset.state=item.state||'queued';
    titleRow.append(platBadge,nameEl,stateBadge);
    const timeEl=text('span',item.when?new Date(item.when).toLocaleString():'방금');
    timeEl.className='upload-verify-meta';
    top.append(titleRow,timeEl);
    card.append(top);
    if(item.error){
      const errEl=text('div',''+item.error);
      errEl.className='upload-verify-error';
      card.append(errEl);
    }
    const actions=document.createElement('div');
    actions.className='upload-verify-actions';
    if(item.permalink&&/^https?:\/\//i.test(item.permalink)){
      const openLink=document.createElement('a');
      openLink.className='btn-verify-open';
      openLink.href=item.permalink;
      openLink.target='_blank';
      openLink.rel='noopener';
      openLink.textContent='↗ 게시물 바로 열기';
      const copyBtn=text('button','링크 복사');
      copyBtn.type='button';
      copyBtn.className='secondary btn-xs';
      copyBtn.onclick=()=>act('게시물 링크 복사 중…',async()=>{
        await navigator.clipboard.writeText(item.permalink);
      },'게시물 링크를 클립보드에 복사했습니다.');
      actions.append(openLink,copyBtn);
    }
    const openTabBtn=text('button','앱 내 플랫폼 화면으로 이동');
    openTabBtn.type='button';
    openTabBtn.className='secondary btn-xs';
    openTabBtn.onclick=()=>act('플랫폼 화면으로 이동 중…',async()=>{
      try{
        await uploadBridge('open-platform',{platform:item.platform||'threads',url:item.permalink||''});
      }catch{
        window.open(item.permalink||platformDefaultUrls[item.platform]||'https://www.threads.com/','_blank','noopener');
      }
    },'플랫폼 화면을 열었습니다.');
    actions.append(openTabBtn);
    if(item.state==='queued'){
      const cancel=text('button','예약 취소');
      cancel.type='button';
      cancel.className='secondary btn-xs btn-subtle-danger';
      cancel.onclick=()=>act('예약 취소 중…',async()=>{
        await uploadBridge('upload-cancel',{id:item.id});
        await refreshUploadQueue();
      },'예약을 취소했습니다.');
      actions.append(cancel);
    }
    card.append(actions);
    container.append(card);
  }
  if(!queue.length){
    const empty=text('p','아직 등록된 업로드·예약 내역이 없습니다. 위에서 업로드를 시작하면 진행 상태와 게시물 바로가기 버튼이 여기에 카드 형태로 표시됩니다.');
    empty.className='hint';
    empty.style.margin='0';
    container.append(empty);
  }
}
$('upload-queue-refresh').onclick=()=>act('휴먼터치 업로드·예약 상태 확인 중…',refreshUploadQueue,'업로드 상태를 확인했습니다.');
document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('[data-open-browser-platform]');
  if(!btn)return;
  const plat=btn.getAttribute('data-open-browser-platform')||'threads';
  const fallbackUrls={
    coupang:'https://www.coupang.com/',
    smartstore:'https://shopping.naver.com/',
    naver_explore:'https://m.naver.com/',
    naver_clip:'https://clipcreators.naver.com/web',
    threads:'https://www.threads.com/',
    instagram:'https://www.instagram.com/',
    tiktok:'https://www.tiktok.com/'
  };
  const labelMap={
    coupang:'쿠팡 리뷰',
    smartstore:'네이버 스마트스토어',
    naver_explore:'네이버 클립',
    naver_clip:'네이버 클립 업로드',
    threads:'Threads',
    instagram:'Instagram',
    tiktok:'TikTok'
  };
  act((labelMap[plat]||plat)+' 화면으로 이동 중…',async()=>{
    try{
      await uploadBridge('open-platform',{platform:plat,url:fallbackUrls[plat]||''});
    }catch{
      window.open(fallbackUrls[plat]||'https://www.threads.com/','_blank','noopener');
    }
  },(labelMap[plat]||plat)+' 화면을 열었습니다. 영상이나 리뷰 이미지 위의 [다운로드], [수집], [바로 제작] 버튼을 사용하세요.');
});

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
      const badge=text('span',c.ok?'등록됨 (숨김)':'미등록');
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
      const dirtyLabel=vi.is_dirty===true?' (로컬 변경 있음)':(vi.is_dirty===false?' (클린)':` (${vi.is_dirty})`);
      const vDesc=text('div',`커밋: ${vi.commit_id}${dirtyLabel} · 스키마: ${vi.schema_version} · 도우미 포트: ${vi.helper_port}`);
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
    document.querySelectorAll('#create-workspace [data-stage-view]').forEach(panel=>{
      panel.hidden=false;
    });
  }else{
    const activeStage=document.querySelector('[data-production-stage][aria-pressed="true"]')?.getAttribute('data-production-stage')||window.currentProductionStage||'analysis';
    const isMediaStage=(activeStage==='analysis'||activeStage==='editing'||activeStage==='carousel');
    document.querySelectorAll('#create-workspace [data-production-section]').forEach(sec=>{
      const key=sec.getAttribute('data-production-section');
      const show=(key===activeStage)||(isMediaStage&&key==='analysis');
      sec.hidden=!show;
      sec.dataset.stageHidden=String(!show);
    });
    if(isMediaStage){
      document.querySelectorAll('#create-workspace [data-stage-view]').forEach(panel=>{
        const v=panel.getAttribute('data-stage-view');
        panel.hidden=(v!==activeStage);
      });
    }
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
  setQuickSidebarMode(false);
  document.querySelector('[data-workspace="create"]')?.click();
  document.querySelector('[data-production-stage="analysis"]')?.click();
  if($('source'))$('source').value=ref.permalink;
  if($('fetch-url'))$('fetch-url').value=ref.permalink;
  act('선택한 게시물에서 미디어와 본문을 바로 가져오는 중…',async()=>{
    const isThreadsUrl=/(?:threads\.com|threads\.net)\//i.test(ref.permalink||'');
    const hasCoverFrameInRef=(ref.imageUrls||[]).some(u=>isThreadsVideoCoverFrameUrl(u));
    const cleanVideoUrls=(ref.videoUrls||[]).filter(u=>u&&u!==ref.permalink&&!/(?:youtube\.com|youtu\.be)/i.test(u));
    const cleanImageUrls=cleanAndDeduplicateCompanionImageUrls(ref.imageUrls||[],ref);
    const payload={
      url:ref.permalink,
      kind:(cleanVideoUrls.length||hasCoverFrameInRef||ref.mediaKind==='video')?'video':(isThreadsUrl?'auto':(ref.mediaKind||'auto')),
      source_text:ref.text||'',
      video_urls:cleanVideoUrls,
      image_urls:cleanImageUrls
    };
    if(cleanVideoUrls[0]){
      payload.media_url=cleanVideoUrls[0];
      payload.kind='video';
    }else if(cleanImageUrls[0]&&!isThreadsUrl&&!hasCoverFrameInRef){
      payload.media_url=cleanImageUrls[0];
      payload.kind='image';
    }
    const acquired=await api('acquire',payload);
    job=await normalizeAcquiredComboJob(acquired,{
      url:ref.permalink,
      sourceText:ref.text||'',
      cleanImageUrls
    });
    if((job?.attachments||[]).length>0&&$('upload-format'))$('upload-format').value='combo';
    render();
    await refreshJobs();
    await refreshReferences().catch(()=>{});
    document.querySelector('[data-workspace="create"]')?.click();
    document.querySelector('[data-production-stage="analysis"]')?.click();
  },'게시물 미디어와 본문을 불러왔습니다! [콘텐츠 제작] 화면에서 자막·캐러셀·본문을 편집해 업로드하세요.');
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
  let syncingAnalysisBar=false;
  function syncSingleInlineAiBar(prefix){
    const provSel=byId(prefix+'-ai-provider');
    const modSel=byId(prefix+'-model-choice');
    const custIn=byId(prefix+'-model-custom');
    const connBadge=byId(prefix+'-ai-conn-badge');
    const scopeBadge=byId(prefix+'-model-scope-badge');
    const subNote=byId(prefix+'-model-sub-note');
    if(!provSel||!modSel)return;
    const r=routeFor('analysis');
    const activeProv=r.provider||byId('ai-provider')?.value||'gemini_api';
    if([...provSel.options].some(o=>o.value===activeProv)){
      provSel.value=activeProv;
    }
    const providerModels=(typeof allModels!=='undefined'&&Array.isArray(allModels))?allModels.filter(m=>m.provider===activeProv):[];
    modSel.replaceChildren();
    for(const m of providerModels){
      const cap=activeProv==='kie_api'?'스키마 확인':(m.has_audio?'음성+프레임':'프레임만');
      const opt=new Option(`${m.name} (${m.model_id}) [${cap}]`,m.model_id);
      opt.dataset.hasAudio=m.has_audio?'1':'0';
      modSel.add(opt);
    }
    const custOpt=new Option(activeProv==='kie_api'?'계정 모델 목록 갱신 필요':'+ 직접 모델 ID 입력...','custom');
    if(activeProv==='kie_api')custOpt.disabled=true;
    modSel.add(custOpt);

    const targetModel=r.model||byId('model')?.value||(providerModels[0]?.model_id||'');
    const matched=providerModels.find(m=>m.model_id===targetModel);
    if(matched){
      modSel.value=matched.model_id;
      if(custIn){custIn.value=matched.model_id;custIn.hidden=true;}
    }else if(targetModel&&targetModel!=='custom'){
      modSel.value='custom';
      if(custIn){custIn.value=targetModel;custIn.hidden=false;}
    }else if(providerModels.length){
      modSel.value=providerModels[0].model_id;
      if(custIn){custIn.value=providerModels[0].model_id;custIn.hidden=true;}
    }
    const resolvedModel=(modSel.value==='custom'?(custIn?.value?.trim()||''):modSel.value)||targetModel;
    const modelEntry=providerModels.find(m=>m.model_id===resolvedModel);
    if(scopeBadge){
      const hasAudio=Boolean(modelEntry?.has_audio||activeProv==='gemini_api');
      scopeBadge.textContent=hasAudio?'음성(내레이션) + 영상 프레임 통합 분석':'영상 핵심 프레임 시각 분석 (음성 제외)';
    }
    if(subNote){
      subNote.textContent=prefix==='carousel'
        ?`현재 캐러셀 AI 모델: ${(names[activeProv]||activeProv)} / ${resolvedModel||'모델 미선택'}`
        :`현재 분석·번역 배정: ${(names[activeProv]||activeProv)} / ${resolvedModel||'모델 미선택'}`;
    }
    if(connBadge){
      const isCli=activeProv.endsWith('_cli');
      const st=isCli?connections.clis?.[activeProv]:connections.apis?.[activeProv];
      const isReady=Boolean(isCli?st?.logged_in:st?.configured);
      connBadge.textContent=isCli
        ?(isReady?'구독 CLI 연결됨':(st?.installed?'CLI 로그인 확인 필요':'CLI 상태 확인 대기'))
        :(isReady?'API 키 등록됨':'API 키 확인/등록 필요');
      connBadge.className='analysis-conn-pill '+(isReady?'ok':'warn');
    }
  }
  function syncAnalysisBarUi(){
    if(syncingAnalysisBar)return;
    syncingAnalysisBar=true;
    try{
      syncSingleInlineAiBar('analysis');
      syncSingleInlineAiBar('carousel');
    }finally{
      syncingAnalysisBar=false;
    }
  }
  function applyAnalysisBarSelection(newProvider,newModel){
    if(syncingAnalysisBar)return;
    const prov=newProvider||byId('analysis-ai-provider')?.value||byId('carousel-ai-provider')?.value||'gemini_api';
    if(byId('ai-provider')&&byId('ai-provider').value!==prov){
      byId('ai-provider').value=prov;
      if(typeof chooseProvider==='function')chooseProvider();
    }
    const providerModels=(typeof allModels!=='undefined'&&Array.isArray(allModels))?allModels.filter(m=>m.provider===prov):[];
    const chosenModel=newModel!==undefined?newModel:(providerModels[0]?.model_id||byId('model')?.value||'');
    if(chosenModel&&byId('model')){
      byId('model').value=chosenModel;
      if(byId('model-choice')){
        byId('model-choice').value=[...byId('model-choice').options].some(o=>o.value===chosenModel)?chosenModel:'custom';
        byId('model').hidden=byId('model-choice').value!=='custom';
      }
      try{localStorage.setItem('takoh-ai-model-'+prov,chosenModel);}catch{}
    }
    const fbVal=byId('fallback-model')?.value?.trim()||'';
    const nextRoute={provider:prov,model:chosenModel||byId('model')?.value?.trim()||'',fallback_model:fbVal};
    if(nextRoute.model){
      routes={...routes,analysis:nextRoute};
      try{localStorage.setItem(storageKey,JSON.stringify(routes));}catch{}
    }
    refresh();
  }
  for(const prefix of ['analysis','carousel']){
    if(byId(prefix+'-ai-provider')){
      byId(prefix+'-ai-provider').addEventListener('change',e=>{
        const nextProv=e.target.value;
        const providerModels=(typeof allModels!=='undefined'&&Array.isArray(allModels))?allModels.filter(m=>m.provider===nextProv):[];
        const savedM=localStorage.getItem('takoh-ai-model-'+nextProv)||providerModels[0]?.model_id||'';
        applyAnalysisBarSelection(nextProv,savedM);
        message(`${prefix==='carousel'?'캐러셀 제작':'분석'} AI 연결 방식을 [${names[nextProv]||nextProv}](으)로 변경했습니다.`);
      });
    }
    if(byId(prefix+'-model-choice')){
      byId(prefix+'-model-choice').addEventListener('change',e=>{
        const val=e.target.value;
        const custIn=byId(prefix+'-model-custom');
        if(val==='custom'){
          if(custIn){custIn.hidden=false;custIn.focus();}
          return;
        }
        if(custIn)custIn.hidden=true;
        applyAnalysisBarSelection(byId(prefix+'-ai-provider')?.value,val);
        message(`${prefix==='carousel'?'캐러셀 제작':'분석'} AI 모델을 [${val}](으)로 선택했습니다.`);
      });
    }
    if(byId(prefix+'-model-custom')){
      byId(prefix+'-model-custom').addEventListener('change',e=>{
        const v=e.target.value.trim();
        if(v){
          applyAnalysisBarSelection(byId(prefix+'-ai-provider')?.value,v);
          message(`${prefix==='carousel'?'캐러셀 제작':'분석'} 사용자 지정 AI 모델을 [${v}](으)로 설정했습니다.`);
        }
      });
    }
    if(byId('btn-open-ai-settings-from-'+prefix)){
      byId('btn-open-ai-settings-from-'+prefix).addEventListener('click',()=>{
        if(window.selectWorkspace)window.selectWorkspace('settings');
        else byId('workspace-settings-tab')?.click();
        byId('settings-tab-ai')?.click();
      });
    }
  }
  function refresh(){
    const c=current();selected.textContent='지금 편집 중: '+describe(c);
    for(const [role,card]of Object.entries(cards)){const r=routeFor(role);card.main.textContent='메인 · '+describe(r);card.sub.textContent='서브 · '+subLabel(r);const state=r.provider.endsWith('_cli')?connections.clis?.[r.provider]:connections.apis?.[r.provider];card.connection.textContent=r.provider.endsWith('_cli')?(state?.logged_in?'구독 계정 로그인 확인됨':state?.installed?'CLI 설치됨 · 로그인 미확인':'CLI 연결 상태 미확인'):(state?.configured?'키 등록됨 · 생성 성공은 실행 시 확인':'키 등록 상태 미확인');card.mode.textContent=routes[role]?'작업별 배정 저장됨 · 연결 편집과 독립':'아직 별도 배정 없음 · 현재 공통 선택을 따릅니다';card.assign.disabled=!c.model;}
    searchDetail();
    for(const [role,ids]of [['writing',['draft']],['analysis',['analyze','recommend-hook','btn-generate-carousel']]])for(const id of ids){const button=byId(id);if(!button)continue;let hint=byId(id+'-ai-route');if(!hint){hint=document.createElement('p');hint.id=id+'-ai-route';hint.className='hint ai-execution-route';button.after(hint);}hint.textContent=roles[role]+' 메인: '+describe(routeFor(role))+' · 서브: '+subLabel(routeFor(role));}
    syncAnalysisBarUi();
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
    panel.innerHTML='<div class="preview-heading"><h2>실시간 미리보기</h2><span>모바일 게시 화면</span></div><div class="preview-platform-tabs" role="group" aria-label="미리보기 플랫폼"></div><p class="preview-note">게시될 화면을 확인하세요. 반응 수는 게시 전이므로 표시하지 않습니다.</p><article class="platform-preview"><div class="preview-view-top"></div><header><strong class="preview-service"></strong><span class="preview-account">내 계정</span><span class="preview-follow">팔로우</span><span class="preview-more" aria-hidden="true">•••</span></header><p class="preview-body"></p><div class="preview-media"></div><span class="preview-ad-label" hidden>[광고]</span><div class="preview-player"><button type="button" class="preview-play" aria-label="미리보기 영상 재생">재생</button><button type="button" class="preview-mute" aria-label="미리보기 음소거 해제">음소거</button></div><div class="preview-dots" aria-label="미디어 페이지"></div><button type="button" class="preview-expand" hidden>더 보기</button><div class="preview-media-nav"><button type="button" class="secondary preview-prev" aria-label="이전 미디어">←</button><span class="preview-media-count"></span><button type="button" class="secondary preview-next" aria-label="다음 미디어">→</button></div><footer class="preview-engagement"></footer><div class="preview-audio"><span>AUDIO</span><span class="preview-audio-label">원본 오디오</span><i></i></div><div class="preview-bottom-nav"></div><div class="preview-comment"><strong>첫 댓글</strong><p></p></div></article><div class="preview-quick-copy-bar"><button type="button" class="secondary btn-xs preview-quick-copy-body">본문 복사</button><button type="button" class="secondary btn-xs preview-quick-copy-comment">첫 댓글 복사</button></div><p class="preview-source-note hint"></p>';
    panel.querySelector('.preview-quick-copy-body').onclick=()=>act('본문 복사 중…',async()=>{const raw=get('script')?.value?.trim()||'';if(!raw)throw new Error('복사할 본문이 없습니다.');await navigator.clipboard.writeText(raw);},'본문을 클립보드에 복사했습니다.');
    panel.querySelector('.preview-quick-copy-comment').onclick=()=>act('첫 댓글 복사 중…',async()=>{const raw=(get('comment')?.value?.trim()||buildDefaultComment()||'').trim();if(!raw)throw new Error('복사할 첫 댓글이 없습니다.');await navigator.clipboard.writeText(raw);},'첫 댓글을 클립보드에 복사했습니다.');
    panel.querySelector('.preview-play').onclick=async()=>{const v=panel.querySelector('video');if(!v)return;try{if(v.paused)await v.play();else v.pause();}catch{panel.querySelector('.preview-source-note').textContent='영상을 재생하지 못했습니다. 파일 상태를 확인하세요.';}};
    panel.querySelector('.preview-mute').onclick=()=>{const v=panel.querySelector('video');if(v){v.muted=!v.muted;panel.querySelector('.preview-mute').setAttribute('aria-label',v.muted?'미리보기 음소거 해제':'미리보기 음소거');panel.querySelector('.preview-mute').textContent=v.muted?'음소거':'소리';}};
    panel.querySelector('.preview-expand').onclick=()=>{panel.classList.toggle('preview-expanded');panel.querySelector('.preview-expand').textContent=panel.classList.contains('preview-expanded')?'접기':'더 보기';};
    const state={panel,context,platform:'threads',index:0,mediaKey:''};
    for(const [key,label]of Object.entries(platforms)){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.previewPlatform=key;b.setAttribute('aria-pressed',String(key==='threads'));b.onclick=()=>{state.platform=key;state.index=0;refreshPreview(state);};panel.querySelector('.preview-platform-tabs').append(b);}
    panel.querySelector('.preview-prev').onclick=()=>{state.index--;refreshPreview(state);};panel.querySelector('.preview-next').onclick=()=>{state.index++;refreshPreview(state);};instances.push(state);return panel;
  }
  const createArticle=create.querySelector(':scope > article'),createLayout=document.createElement('div');createLayout.className='content-studio-layout';create.append(createLayout);const createPrevPanel=previewPanel('create');const initMediaStage=['analysis','editing','carousel'].includes(window.currentProductionStage||'analysis');createPrevPanel.hidden=initMediaStage;createLayout.classList.toggle('full-width-studio-stage',initMediaStage);createLayout.append(createPrevPanel,createArticle);createArticle.classList.add('content-studio-controls');
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
    const carousel=(selected==='instagram_carousel'&&state.platform==='instagram')||fmt==='carousel';
    const carTs=Math.floor((job.carousel?.updated_at||0)*1000);
    if(carousel&&(job.carousel?.slides||[]).length){
      return (job.carousel?.slides||[]).map(s=>({kind:'image',url:base+encodeURIComponent(s.file)+(carTs?'?t='+carTs:'')}));
    }
    const editTs=Math.floor((job.text_edit?.updated_at||0)*1000);
    const qs=editTs?'?t='+editTs:'';
    const first=job.kind==='image'?{kind:'image',url:base+'original'+qs}:{kind:'video',url:base+'video'+qs,poster:base+encodeURIComponent(job.evidence?.frames?.[0]?.file||'frame-0.jpg')+qs};
    if(fmt==='video')return [first];
    const extra=(job.attachments||[]).map(a=>({kind:a.kind,url:base+encodeURIComponent(a.file)}));
    return [first,...extra];
  }
  function refreshPreview(state){
    const p=state.panel;p.dataset.platform=state.platform;p.dataset.adPosition=job?.edit?.ad_position==='right'?'right':'left';p.querySelector('.preview-service').textContent=platforms[state.platform];
    for(const b of p.querySelectorAll('[data-preview-platform]'))b.setAttribute('aria-pressed',String(b.dataset.previewPlatform===state.platform));
    const isCarouselMode=get('upload-format').value==='carousel'||(state.platform==='instagram'&&get('upload-platform').value==='instagram_carousel');
    const shortView=(['tiktok','naver_clip'].includes(state.platform)&&!isCarouselMode)||(state.platform==='instagram'&&!isCarouselMode);p.dataset.view=shortView?'short':'feed';
    p.querySelector('.preview-account').textContent=state.platform==='threads'?'내 계정　· 지금':'내 계정';
    p.querySelector('.preview-follow').hidden=state.platform==='threads';
    p.querySelector('.preview-view-top').innerHTML=state.platform==='threads'?'<span class="preview-threads-mark">@</span><span>추천 <small>⌄</small></span><span>⋯</span>':state.platform==='instagram'?(shortView?'<strong>Reels</strong><span>검색</span>':'<strong class="preview-instagram-mark">Instagram</strong><span>DM</span>'):state.platform==='tiktok'?'<span>LIVE</span><strong>팔로잉　<span class="preview-active-tab">추천</span></strong><span>검색</span>':'<strong class="preview-clip-mark">Clip</strong><span>×</span>';
    const icon=(path)=>'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
    const home=icon('<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z"/>'),searchIcon=icon('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'),plus=icon('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7v10M7 12h10"/>'),profile=icon('<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>');
    const heart=icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'),commentIcon=icon('<path d="M21 11.5a8.5 8.5 0 1 1-3.7-7L21 3v8.5Z"/>'),share=icon('<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>'),repost=icon('<path d="m3 7 3-3 3 3M6 4v12h8m7 1-3 3-3-3m3 3V8h-8"/>'),save=icon('<path d="M6 3h12v18l-6-4-6 4V3Z"/>');
    const bubble=icon('<path d="M21 11a9 9 0 0 1-9 9H5l-3 2 1-6a9 9 0 1 1 18-5Z"/><circle cx="8" cy="11" r=".6" fill="#111" stroke="#111"/><circle cx="12" cy="11" r=".6" fill="#111" stroke="#111"/><circle cx="16" cy="11" r=".6" fill="#111" stroke="#111"/>'),forward=icon('<path d="m14 3 8 8-8 8v-5C7 14 4 17 2 21c0-9 3-14 12-14V3Z"/>');
    const labels=state.platform==='threads'?[[heart,'좋아요'],[commentIcon,'답글'],[repost,'리포스트'],[share,'공유']]:state.platform==='instagram'?(shortView?[[heart,'좋아요'],[commentIcon,'댓글'],[repost,'리포스트'],[share,'공유'],[save,'저장']]:[[heart,'좋아요'],[commentIcon,'댓글'],[share,'공유'],[save,'저장']]):state.platform==='naver_clip'?[[heart,'좋아요'],[commentIcon,'댓글'],[forward,'공유']]:[[heart,'좋아요'],[bubble,'댓글'],[save,'저장'],[forward,'공유']];
    const engagement=p.querySelector('.preview-engagement');engagement.replaceChildren();for(const [svg,label]of labels){const el=document.createElement('span');el.innerHTML=svg;el.append(text('small',shortView?label:''));el.setAttribute('aria-label',label+' 위치 미리보기');engagement.append(el);}
    p.querySelector('.preview-audio').hidden=!shortView;
    p.querySelector('.preview-audio-label').textContent=job?.media?.has_audio?'원본 오디오 · 내 콘텐츠':'이미지·슬라이드 미디어';
    p.querySelector('.preview-more').hidden=shortView;
    const reelIcon=icon('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m10 8 6 4-6 4V8ZM3 7h18M8 3l3 4m4-4 3 4"/>');
    const navItems=state.platform==='threads'?[[home,'홈'],[searchIcon,'검색'],[plus,'만들기'],[heart,'활동'],[profile,'프로필']]:state.platform==='instagram'?[[home,'홈'],[reelIcon,'릴스'],[share,'메시지'],[searchIcon,'검색'],[profile,'프로필']]:[[home,'홈'],[profile,'친구'],[plus,'만들기'],[commentIcon,'받은 편지함'],[profile,'프로필']];

    const bottom=p.querySelector('.preview-bottom-nav');bottom.replaceChildren();bottom.hidden=state.platform==='naver_clip';for(const [svg,label]of navItems){const el=document.createElement('span');el.innerHTML=svg;el.setAttribute('aria-label',label);if(state.platform==='tiktok')el.append(text('small',label));bottom.append(el);}
    const previewBody=get('script').value.replace(/^\s*(?:(?:#광고|\[광고\])\s*)+/u,'').trim();
    p.querySelector('.preview-body').textContent=previewBody?(state.platform==='threads'?'#광고 ':'[광고] ')+previewBody:'본문을 작성하면 여기에 바로 표시됩니다.';p.querySelector('.preview-ad-label').hidden=state.platform==='threads'||job?.kind==='image'||isCarouselMode||!job;
    p.querySelector('.preview-expand').hidden=get('script').value.length<90;
    const comment=get('comment').value||'';p.querySelector('.preview-comment p').textContent=comment||'첫 댓글 없음';
    p.querySelector('.preview-comment').hidden=state.platform!=='threads'&&state.platform!=='instagram';
    const items=mediaItems(state);state.index=Math.max(0,Math.min(state.index,items.length-1));const item=items[state.index];
    const key=JSON.stringify([state.platform,job?.id,job?.edit,job?.text_edit?.updated_at,job?.carousel?.updated_at,(job?.attachments||[]).length,get('upload-format').value,state.platform==='threads'?items:item]);p.dataset.mediaCount=items.length;p.querySelector('.preview-media').classList.toggle('preview-thread-gallery',state.platform==='threads'&&items.length>1);
    if(key!==state.mediaKey){state.mediaKey=key;const box=p.querySelector('.preview-media');for(const v of box.querySelectorAll('video'))v.pause();box.replaceChildren();if(item){for(const shown of (state.platform==='threads'?items:[item])){const item=shown;const el=document.createElement(item.kind==='video'?'video':'img');el.src=item.url;if(item.kind==='video'){el.controls=false;el.muted=true;el.preload='metadata';el.playsInline=true;el.onplay=()=>{p.querySelector('.preview-play').textContent='일시정지';p.querySelector('.preview-play').setAttribute('aria-label','미리보기 영상 일시 정지');};el.onpause=el.onended=()=>{p.querySelector('.preview-play').textContent='재생';p.querySelector('.preview-play').setAttribute('aria-label','미리보기 영상 재생');};if(item.poster)el.poster=item.poster;}else el.alt='게시 미디어 '+(state.index+1);el.onerror=()=>{p.querySelector('.preview-source-note').textContent='미디어를 표시하지 못했습니다. 원본 준비와 파일 상태를 확인하세요.';};el.onclick=()=>{if(el.tagName==='VIDEO'){if(el.paused)el.play().catch(()=>{});else el.pause();}};box.append(el);}}else box.append(text('p',job?'선택한 미디어 구성에 준비된 파일이 없습니다.':'레퍼런스를 선택하거나 원본을 불러오세요.'));}
    const currentVideo=p.querySelector('video');p.querySelector('.preview-play').textContent=currentVideo&&!currentVideo.paused?'일시정지':'재생';p.querySelector('.preview-player').hidden=item?.kind!=='video';p.querySelector('.preview-media-nav').hidden=items.length<2||state.platform==='threads';const dots=p.querySelector('.preview-dots');dots.replaceChildren();dots.hidden=items.length<2||state.platform==='threads';for(let i=0;i<items.length;i++){const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',(i+1)+'번째 미디어');dot.setAttribute('aria-pressed',String(i===state.index));dot.onclick=()=>{state.index=i;refreshPreview(state);};dots.append(dot);}
    p.querySelector('.preview-media-count').textContent=items.length?(state.index+1)+' / '+items.length:'미디어 없음';p.querySelector('.preview-prev').disabled=state.index<=0;p.querySelector('.preview-next').disabled=state.index>=items.length-1;
    p.querySelector('.preview-source-note').textContent=job?(job.name||'선택한 작업')+(isCarouselMode?' · 캐러셀 슬라이드 미리보기 ('+items.length+'장)':items.length>1?' · 다중 미디어 묶음 ('+items.length+'개)':' · 현재 준비된 미디어'):'아직 선택한 작업이 없습니다.';
  }
  let reviewSignature='';
  function updateStart(){get('writing-save-final').disabled=get('prepare').disabled||!job||!get('script').value.trim()||productDirty;const signature=JSON.stringify([job?.id,job?.sha256,job?.edit,job?.carousel?.updated_at,get('script').value,get('comment').value,get('upload-platform').value,get('upload-format').value,get('extension-mode').value,get('extension-when').value,get('publish-target-mode').value,[...document.querySelectorAll('.batch-platform-cb:checked')].map(b=>b.value)]);if(signature!==reviewSignature)get('publish-final-confirm').checked=false;reviewSignature=signature;const batch=get('publish-target-mode').value==='batch';const target=batch?[...document.querySelectorAll('.batch-platform-cb:checked')].map(b=>platformNames[b.value]).join(', '):platformNames[get('upload-platform').value];const when=get('extension-when').value;get('publish-start-summary').textContent=(target||'대상 미선택')+' · '+(when?new Date(when).toLocaleString():'지금 실행')+' · '+(get('extension-mode').value==='auto'?'자동 게시':'반자동 입력');get('publish-start').textContent=when?'예약 등록 시작':'게시 준비 시작';get('publish-start').disabled=!get('publish-final-confirm').checked||originals[batch?1:0].disabled||busy;}
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
  let tab=get('workspace-scheduler-tab');
  if(!tab){
    tab=document.createElement('button');tab.id='workspace-scheduler-tab';tab.dataset.workspace='scheduler';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','scheduler-workspace');tab.textContent='예약 달력';get('workspace-publish-tab')?.after(tab);
  }
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

  // 1) Per-job body undo history (up to 10 snapshots per job, backed by job.draft_history)
  const jobScriptHistories=new Map();
  const getJobHistory=targetJob=>{
    const jid=targetJob?.id;
    if(!jid)return [];
    if(!jobScriptHistories.has(jid)){
      const seeded=[];
      for(const entry of (targetJob.draft_history||[])){
        const b=String(entry?.body||'').trim();
        if(b&&seeded[seeded.length-1]!==b)seeded.push(b);
      }
      const cur=String(targetJob.draft?.body||targetJob.draft?.script||'').trim();
      if(cur&&seeded[seeded.length-1]!==cur)seeded.push(cur);
      jobScriptHistories.set(jid,seeded.slice(-10));
    }
    return jobScriptHistories.get(jid);
  };
  const updateUndoButtonState=()=>{
    const undoBtn=get('btn-undo-script');
    if(!undoBtn)return;
    const hist=getJobHistory(job);
    undoBtn.disabled=hist.length<2;
  };
  const pushScriptHistory=val=>{
    if(!job?.id)return;
    const clean=String(val||'').trim();
    const hist=getJobHistory(job);
    if(!clean||hist[hist.length-1]===clean){updateUndoButtonState();return;}
    hist.push(clean);
    if(hist.length>10)hist.shift();
    updateUndoButtonState();
  };
  window.syncJobScriptHistory=targetJob=>{
    if(targetJob?.id){
      const hist=getJobHistory(targetJob);
      for(const entry of (targetJob.draft_history||[])){
        const b=String(entry?.body||'').trim();
        if(b&&hist[hist.length-1]!==b)hist.push(b);
      }
      const cur=String(targetJob.draft?.body||targetJob.draft?.script||'').trim();
      if(cur&&hist[hist.length-1]!==cur)hist.push(cur);
      if(hist.length>10)hist.splice(0,hist.length-10);
    }
    updateUndoButtonState();
  };
  const scriptActions=document.querySelector('.writing-editor-actions');
  if(scriptActions&&!get('btn-undo-script')){
    const undoBtn=text('button','이전 본문 복원');
    undoBtn.id='btn-undo-script';
    undoBtn.type='button';
    undoBtn.className='secondary btn-xs';
    undoBtn.disabled=true;
    undoBtn.title='현재 작업의 이전 본문으로 되돌립니다';
    undoBtn.onclick=()=>{
      if(!job?.id)return;
      const hist=getJobHistory(job);
      if(hist.length<2)return;
      hist.pop();
      const prev=hist[hist.length-1]||'';
      get('script').value=prev;
      get('body').value=prev;
      if(get('copy-body'))get('copy-body').disabled=true;
      if(get('copy-comment'))get('copy-comment').disabled=true;
      if(get('publish-api'))get('publish-api').disabled=true;
      if(get('extension-upload'))get('extension-upload').disabled=true;
      if(get('extension-batch-upload'))get('extension-batch-upload').disabled=true;
      if(get('publish-final-confirm'))get('publish-final-confirm').checked=false;
      if(get('prepare'))get('prepare').disabled=!prev.trim();
      writingCounts();
      refreshPreviews();
      updateUndoButtonState();
      message('현재 작업의 이전 본문으로 복원했습니다. [본문·댓글 확정 저장]을 눌러 반영하세요.');
    };
    scriptActions.prepend(undoBtn);
  }
  get('script')?.addEventListener('focus',()=>pushScriptHistory(get('script').value));
  get('script')?.addEventListener('blur',()=>pushScriptHistory(get('script').value));
  get('draft')?.addEventListener('click',()=>pushScriptHistory(get('script')?.value));
  window.syncJobScriptHistory(job);

  // 2) Saved Product Library (frequent affiliate products backed by /studio/saved-products)
  const prodForm=get('product-form');
  const prodStorageKey='takoh-saved-products-v1';
  let savedProductList=[];
  const readLegacyLocalProducts=()=>{try{const raw=localStorage.getItem(prodStorageKey);const arr=JSON.parse(raw||'[]');return Array.isArray(arr)?arr:[];}catch{return [];}};
  if(prodForm&&!get('saved-product-library-bar')){
    const libBar=document.createElement('div');
    libBar.id='saved-product-library-bar';
    libBar.className='saved-product-library-bar';
    libBar.innerHTML='<label style="flex:1;margin:0;font-size:12px;font-weight:600;color:#284634;">내 주력 상품 보관함에서 빠른 불러오기<select id="saved-product-select" style="margin-top:4px;"><option value="">저장된 주력 상품 선택…</option></select></label><div style="display:flex;gap:6px;align-self:flex-end;"><button id="btn-save-product-preset" type="button" class="secondary btn-xs">+ 현재 상품 보관</button><button id="btn-delete-product-preset" type="button" class="secondary btn-xs">삭제</button></div>';
    prodForm.querySelector('.product-block-head')?.after(libBar);
    const sel=get('saved-product-select');
    const renderProdPresets=(selectedId='')=>{
      const prev=selectedId||sel.value;
      sel.replaceChildren(new Option(savedProductList.length?`저장된 주력 상품 선택 (${savedProductList.length}개)…`:'저장된 주력 상품 없음 (+ 현재 상품 보관 클릭)',''));
      savedProductList.forEach(item=>{
        sel.add(new Option(`[${item.platform||'기타'}] ${item.name||'이름 없음'}`,String(item.id||'')));
      });
      if(prev&&savedProductList.some(x=>String(x.id)===String(prev)))sel.value=String(prev);
      else sel.value='';
    };
    const loadServerProducts=async()=>{
      try{
        const legacy=readLegacyLocalProducts();
        let res;
        if(legacy.length){
          res=await api('saved-products',{migrate:legacy});
          try{localStorage.removeItem(prodStorageKey);}catch{}
        }else{
          res=await api('saved-products');
        }
        savedProductList=Array.isArray(res?.products)?res.products:[];
        renderProdPresets();
      }catch{
        renderProdPresets();
      }
    };
    sel.onchange=()=>{
      if(sel.value==='')return;
      const item=savedProductList.find(x=>String(x.id)===String(sel.value));
      if(!item)return;
      if(get('platform'))get('platform').value=item.platform||'coupang';
      if(get('affiliate-entry-mode'))get('affiliate-entry-mode').value=item.link_entry_mode||'manual';
      syncAffiliateEntry();
      if(get('product-name'))get('product-name').value=item.name||'';
      if(get('product-url'))get('product-url').value=item.url||'';
      if(get('affiliate-url'))get('affiliate-url').value=item.affiliate_url||'';
      // Require explicit user verification that the loaded product matches the current job's video
      if(get('confirmed'))get('confirmed').checked=false;
      if(get('comment'))get('comment').value=buildDefaultComment();
      productDirty=true;
      updateProductionStepBadges();
      refreshPreviews();
      message(`주력 상품 “${item.name}” 정보를 입력칸에 불러왔습니다. 현재 영상의 제품과 맞는지 확인 체크 후 [상품 및 제휴 링크 저장]을 눌러 반영하세요.`);
    };
    get('btn-save-product-preset').onclick=async()=>{
      const name=get('product-name')?.value?.trim()||'';
      const mode=get('affiliate-entry-mode')?.value||'manual';
      const aff=get('affiliate-url')?.value?.trim()||'';
      const url=get('product-url')?.value?.trim()||'';
      if(!name){message('보관할 상품명을 입력해 주세요.',true);return;}
      if(mode==='manual'&&!aff){message('보관할 제휴 링크를 입력해 주세요.',true);return;}
      if(mode==='api'&&!url&&!aff){message('보관할 원본 상품 URL 또는 제휴 링크를 입력해 주세요.',true);return;}
      try{
        const res=await api('saved-products',{
          name,
          platform:get('platform')?.value||'coupang',
          link_entry_mode:mode,
          url,
          affiliate_url:aff
        });
        savedProductList=Array.isArray(res?.products)?res.products:[];
        renderProdPresets(res?.saved_id||'');
        message(`“${name}”을(를) 내 주력 상품 보관함에 저장했습니다.`);
      }catch(err){
        message(err.message||'주력 상품 보관에 실패했습니다.',true);
      }
    };
    get('btn-delete-product-preset').onclick=async()=>{
      if(sel.value===''){message('삭제할 주력 상품을 먼저 선택해 주세요.',true);return;}
      const targetId=sel.value;
      const targetItem=savedProductList.find(x=>String(x.id)===String(targetId));
      try{
        const response=await fetch('/studio/saved-products',{
          method:'DELETE',
          headers:{'X-Studio-Token':token,'Content-Type':'application/json'},
          body:JSON.stringify({id:targetId})
        });
        const res=await response.json();
        if(!response.ok)throw new Error(res.error||`삭제 실패 (${response.status})`);
        savedProductList=Array.isArray(res?.products)?res.products:[];
        renderProdPresets('');
        message(`“${targetItem?.name||'선택한 상품'}”을(를) 주력 상품 보관함에서 삭제했습니다.`);
      }catch(err){
        message(err.message||'주력 상품 삭제에 실패했습니다.',true);
      }
    };
    loadServerProducts();
  }

  // 3) Global Dark Mode / Light Mode Toggle (persisted in localStorage)
  const THEME_STORAGE_KEY='takoh-theme-mode';
  function applyStudioTheme(mode,{save=true}={}){
    const resolved=mode==='dark'?'dark':'light';
    document.documentElement.dataset.theme=resolved;
    document.body.dataset.theme=resolved;
    const btn=get('btn-theme-toggle');
    if(btn){
      btn.textContent=resolved==='dark'?'라이트 모드':'다크 모드';
      btn.setAttribute('aria-pressed',String(resolved==='dark'));
      btn.title=resolved==='dark'?'클릭하여 라이트 모드로 전환':'클릭하여 다크 모드로 전환';
    }
    if(save){
      try{localStorage.setItem(THEME_STORAGE_KEY,resolved);}catch{}
    }
    return resolved;
  }
  window.applyStudioTheme=applyStudioTheme;
  let initTheme='light';
  try{
    const savedTheme=localStorage.getItem(THEME_STORAGE_KEY);
    if(savedTheme==='dark'||savedTheme==='light')initTheme=savedTheme;
  }catch{}
  applyStudioTheme(initTheme,{save:false});
  const themeBtn=get('btn-theme-toggle');
  if(themeBtn){
    themeBtn.onclick=()=>{
      const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
      applyStudioTheme(next,{save:true});
    };
  }
})();
