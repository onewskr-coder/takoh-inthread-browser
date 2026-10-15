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
function updateProductionStepBadges(){
  const checks={
    reference:Boolean(displayedReferences?.length||job),
    analysis:Boolean(job?.analysis),
    writing:Boolean(job?.draft),
    product:Boolean(job?.product?.affiliate_url||job?.product?.name),
    publish:job?.status==='publish_ready'||job?.status==='published'||job?.publication?.status==='published'
  };
  document.querySelectorAll('[data-production-stage]').forEach(btn=>{
    const key=btn.dataset.productionStage;
    btn.classList.toggle('step-done',Boolean(checks[key]));
  });
}
function render(){
  productDirty=false;
  renderEditor();
  updateProductionStepBadges();
  $('media').hidden=!job;
  if($('analysis-empty-state'))$('analysis-empty-state').hidden=Boolean(job);
  $('analyze').disabled=!job;$('save-product').disabled=!job;
  $('draft').disabled=!job?.analysis;$('prepare').disabled=!job?.draft;
  $('copy-body').disabled=job?.status!=='publish_ready';$('copy-comment').disabled=job?.status!=='publish_ready';
  $('video-download').hidden=!job;
  $('analysis').replaceChildren();$('frames').replaceChildren();
  $('extension-upload').disabled=job?.status!=='publish_ready';
  if($('writing-context-text')){
    if(job?.analysis){
      const sum=job.analysis.result?.summary||job.name||'분석 완료';
      const prod=job.product?.name?` · 연결 상품: ${job.product.name}`:' · 상품 미연결 (선택 사항)';
      $('writing-context-text').textContent=`📌 분석 요약: ${sum}${prod}`;
    }else if(job){
      $('writing-context-text').textContent=`현재 미디어: ${job.name} · 먼저 [1 원본 분석]에서 AI 장면 분석을 실행해 주세요.`;
    }else{
      $('writing-context-text').textContent='원본 분석을 완료하면 장면 요약과 상품 정보가 여기에 표시됩니다.';
    }
  }
  $('draft-variants').replaceChildren();
  const selectedIdx=Number(job?.draft?.selected||0);
  for(const [index,value] of (job?.draft?.variants||[]).entries()){
    const card=document.createElement('div');
    card.className='draft-variant'+(index===selectedIdx?' selected':'');
    const head=document.createElement('div');
    head.className='draft-variant-head';
    head.append(text('h3',`소개 글 ${index+1}안`),text('span',`${Array.from(value).length}자`));
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
      writingCounts();$('extension-upload').disabled=true;
      message(`${index+1}안을 편집창에 불러왔습니다. 내용을 다듬은 뒤 [4 Threads 게시]에서 본문·첫 댓글을 확정하세요.`);
    };
    card.append(head,bodyP,select);
    $('draft-variants').append(card);
  }
  $('script').value=job?.draft?.script||'';$('body').value=job?.draft?.body||'';$('comment').value=job?.comment||'';
  writingCounts();
  $('disclosure').value=job?.disclosure||disclosureDefaults[job?.product?.platform]||'';
  $('draft-style').value=job?.draft?.style||$('draft-style').value||'observation';
  fillStyle();
  const qNotes=(job?.draft?.quality_notes||[]).join(' · ');
  $('draft-quality').textContent=qNotes;
  $('draft-quality').hidden=!qNotes;
  const product=job?.product;
  $('platform').value=product?.platform||'coupang';$('product-name').value=product?.name||'';
  $('product-url').value=product?.url||'';$('affiliate-url').value=product?.affiliate_url||'';
  $('confirmed').checked=['user_confirmed','api_issued'].includes(product?.attribution);
  $('publication').textContent=job?.status==='publish_ready'?'게시 준비 완료 · Threads에서 게시하거나 휴먼터치를 실행하세요.':'아직 게시하지 않았습니다.';
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
    $('image-preview').src=base+'frame-0.jpg';
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
  $('metadata').textContent=`[${kindBadge}] ${job.name} · ${durText} · ${resText}${audioText}`;
  if(job.edit?.text_clean)$('metadata').textContent+=` · 텍스트 처리 ${job.edit.text_clean.repaired_frames}/${job.edit.text_clean.frames}프레임`;
  for(const frame of (job.evidence?.frames||[])){
    const figure=document.createElement('figure');
    figure.className='analysis-frame-item';
    figure.title=isImage?'원본 이미지':`${frame.timestamp}초 시점으로 이동`;
    const img=document.createElement('img');
    img.src=base+frame.file;
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
      text('strong','원본 미디어가 준비되었습니다'),
      text('p','우측 상단의 [✦ 영상 분석 시작] 버튼을 누르면 AI가 추출 프레임과 음성을 분석하여 시간대별 장면 요약, 상품 키워드, 후킹 편집 구간을 자동으로 도출합니다.')
    );
    $('analysis').append(placeholder);
  }
}
async function update(path,data){const targetId=job?.id;if(!targetId)return;const next=await api(`jobs/${targetId}/${path}`,data);if(job?.id!==targetId)return;job=next;render();await refreshJobs();}
if($('url-fetch-form'))$('url-fetch-form').onsubmit=event=>{event.preventDefault();act('게시물에서 미디어를 가져오는 중…',async()=>{const url=$('fetch-url').value.trim();job=await api('acquire',{url});render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();},'영상·이미지를 불러왔습니다. 원본 분석을 시작할 수 있습니다.');};
$('upload-form').onsubmit=event=>{event.preventDefault();const file=$('video-file').files[0];if(!file){message('영상 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('영상과 음성·프레임을 추출하는 중…',async()=>{const data=new FormData();data.append('video',file);data.append('source',$('source').value);job=await api('jobs',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
$('image-form').onsubmit=event=>{event.preventDefault();const file=$('image-file').files[0];if(!file){message('이미지 파일을 선택하거나 URL로 불러오기를 사용하세요.',true);return;}act('원본 이미지 불러오는 중…',async()=>{const data=new FormData();data.append('image',file);data.append('source',$('source').value);job=await api('images',data);render();await refreshJobs();document.querySelector('[data-production-stage="analysis"]')?.click();});};
$('analyze').onclick=()=>act('선택한 영상 데이터를 분석하는 중…',()=>update('analyze',credentials()));
$('product-form').onsubmit=event=>{event.preventDefault();act('상품 저장 중…',()=>update('product',{platform:$('platform').value,name:$('product-name').value,url:$('product-url').value,affiliate_url:$('affiliate-url').value,confirmed:$('confirmed').checked}),'상품과 제휴 링크를 저장했습니다.');};
$('draft').onclick=()=>act('영상 관찰 근거로 대본을 작성하는 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('draft',{...credentials(),style:$('draft-style').value});});
$('prepare').onclick=()=>act('게시 내용 준비 중…',()=>{if(productDirty) throw new Error('변경한 상품을 먼저 저장해 주세요.');return update('prepare',{body:$('script').value,script:$('script').value,disclosure:$('disclosure').value,selected:job?.draft?.selected||0});},'본문과 첫 댓글을 확정 저장했습니다. 이제 복사하거나 휴먼터치 업로드를 실행할 수 있습니다.');
for(const target of ['body','comment']) $('copy-'+target).onclick=()=>act('복사 중…',async()=>{await navigator.clipboard.writeText($(target).value);}, '복사했습니다. Threads에서 붙여 넣어 주세요.');
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
      $('copy-body').disabled=true;$('copy-comment').disabled=true;
      $('publish-api').disabled=true;$('extension-upload').disabled=true;
      message(`${btn.textContent} 표준 경제적 이해관계 고지 문구를 입력했습니다. [본문·첫 댓글 확정 저장]을 눌러 반영하세요.`);
    }
  };
});
$('script').addEventListener('input',()=>{$('body').value=$('script').value;});
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
  if(candidate.kind==='product'||/(^|\.)coupang\.com$/.test(new URL(candidate.url).hostname)){const choose=text('button','상품 입력으로 선택');choose.disabled=!!job.publication?.account_id;choose.onclick=()=>act('상품 저장·제휴 링크 확인 중…',async()=>{const coupang=/(^|\.)coupang\.com$/.test(new URL(candidate.url).hostname);$('platform').value=coupang?'coupang':$('platform').value;$('product-name').value=candidate.name;$('product-url').value=candidate.url;await update('product',{platform:$('platform').value,name:candidate.name,url:candidate.url,affiliate_url:'',confirmed:false});if(coupang&&job)await update('affiliate-auto',{});},'상품 후보를 저장했습니다. 영상 속 제품과 같은지 확인하고 필요하면 제휴 링크를 직접 입력하세요.');card.append(choose);}
  $('visual-results').append(card);
 }
 if(job?.visual_search&&!job.visual_search.candidates.length)$('visual-results').append(text('p','이 이미지의 검색 후보가 없습니다. 다른 프레임으로 검색해 보세요.'));
}
function showVisualOriginal(){const frame=job?.visual_search?.frame?.file||$('visual-frame').value;$('visual-original').hidden=!job||!frame;if(job&&frame)$('visual-original').src=`/studio/jobs/${job.id}/media/${frame}`;}
$('visual-frame').onchange=showVisualOriginal;
$('visual-search').onclick=()=>act('원본 이미지를 업로드하고 시각 검색하는 중…',()=>update('visual-search',{frame:$('visual-frame').value,mode:$('visual-mode').value,key:$('serp-key').value.trim()}));
let incoming=null;
if(location.hash.startsWith('#reference=')&&location.hash.length<50000){try{incoming=JSON.parse(decodeURIComponent(location.hash.substring(11)));$('incoming-reference').hidden=false;$('incoming-text').textContent=`@${incoming.username||''}: ${String(incoming.text||'').substring(0,500)}`;history.replaceState(null,'',location.pathname);}catch{message('전달된 레퍼런스를 읽지 못했습니다.',true);}}
let selectedReference=null, referenceCollection='collected', displayedReferences=[];
const referenceMediaChoices=new Map(),referenceStates=new Map(),checkedReferenceIds=new Set();
const getRefKey=ref=>ref?.reference_id||ref?.permalink||'';
function updateReferenceSelectionUi(){
  const validKeys=new Set(displayedReferences.map(getRefKey).filter(Boolean));
  for(const key of Array.from(checkedReferenceIds))if(!validKeys.has(key))checkedReferenceIds.delete(key);
  const count=checkedReferenceIds.size,total=displayedReferences.length;
  const selectAll=$('select-all-references');
  if(selectAll){
    selectAll.disabled=!total;
    selectAll.checked=total>0&&count===total;
    selectAll.indeterminate=count>0&&count<total;
  }
  const saveSelected=$('save-selected-references');
  if(saveSelected){
    saveSelected.hidden=referenceCollection==='saved';
    saveSelected.disabled=referenceCollection==='saved'||count===0;
    saveSelected.textContent=count>0?`선택 보관함에 담기 (${count})`:'선택 보관함에 담기';
  }
  const deleteSelected=$('delete-selected-references');
  if(deleteSelected){
    deleteSelected.disabled=count===0;
    deleteSelected.textContent=count>0?`선택 삭제 (${count})`:'선택 삭제';
  }
  const summary=$('reference-summary-count');
  if(summary)summary.textContent=`${referenceCollection==='saved'?'보관함':'수집한 레퍼런스'} ${total}개`+(count>0?` · ${count}개 선택됨`:'');
}
async function refreshReferences(){
  const refs=await api(referenceCollection==='saved'?'saved-references':'references');
  displayedReferences=refs;
  updateProductionStepBadges();
  for(const [id,value] of [['show-collected-references','collected'],['show-saved-references','saved']])$(id)?.setAttribute('aria-pressed',String(referenceCollection===value));
  if($('delete-all-references'))$('delete-all-references').disabled=!refs.length;
  const list=$('references');if(!list)return;
  list.replaceChildren();
  updateReferenceSelectionUi();
  for(const ref of refs){
    const refKey=getRefKey(ref);
    const isChecked=Boolean(refKey&&checkedReferenceIds.has(refKey));
    const card=document.createElement('div');
    card.className='reference-card'+(selectedReference?.permalink===ref.permalink?' selected':'')+(isChecked?' checked':'');
    const thumbBox=document.createElement('div');
    thumbBox.className='ref-thumb-wrap';
    const checkLabel=document.createElement('label');
    checkLabel.className='ref-check-badge';
    checkLabel.onclick=e=>e.stopPropagation();
    const checkInput=document.createElement('input');
    checkInput.type='checkbox';
    checkInput.className='ref-select-checkbox';
    checkInput.dataset.refId=refKey;
    checkInput.checked=isChecked;
    checkInput.setAttribute('aria-label',(ref.username?'@'+ref.username+' ':'')+'레퍼런스 선택');
    checkInput.onchange=e=>{
      e.stopPropagation();
      if(!refKey)return;
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
          const payload={url:ref.permalink,kind:isVideoRef?'video':(ref.mediaKind||'auto')};
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
    removeBtn.onclick=e=>{e.stopPropagation();const collection=referenceCollection;if(!confirm('이 목록에서 레퍼런스를 삭제할까요? 준비한 원본과 작업은 유지됩니다.'))return;act('삭제 중…',async()=>{await api('references/delete',{collection,ids:[ref.reference_id]});checkedReferenceIds.delete(refKey);if(selectedReference?.permalink===ref.permalink)selectedReference=null;await refreshReferences();},'목록에서 삭제했습니다.');};
    if(referenceCollection==='collected'){
      const saveBtn=text('button','보관함 저장');saveBtn.type='button';saveBtn.className='secondary btn-card-save';
      saveBtn.onclick=e=>{e.stopPropagation();act('보관함에 저장 중…',async()=>{const result=await api('references/save',{reference_id:ref.reference_id});message(result.already_saved?'이미 보관된 자료를 갱신했습니다.':'보관함에 저장했습니다.');},'보관함에 저장했습니다.');};itemActions.append(saveBtn);
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
  if(!refs.length)list.append(text('p',referenceCollection==='saved'?'보관함이 비어 있습니다. 수집한 레퍼런스에서 [보관함에 저장]을 누르세요.':'수집된 레퍼런스가 없습니다. 게시물의 [수집] 버튼을 누르면 여기에 나타납니다.'));
}
for(const [id,collection] of [['show-collected-references','collected'],['show-saved-references','saved']])if($(id))$(id).onclick=()=>{referenceCollection=collection;checkedReferenceIds.clear();refreshReferences().catch(e=>message(e.message,true));};
if($('select-all-references'))$('select-all-references').onchange=e=>{
  checkedReferenceIds.clear();
  if(e.target.checked)for(const ref of displayedReferences){const k=getRefKey(ref);if(k)checkedReferenceIds.add(k);}
  document.querySelectorAll('#references .reference-card').forEach(card=>{
    const cb=card.querySelector('.ref-select-checkbox');
    if(cb){cb.checked=e.target.checked;card.classList.toggle('checked',Boolean(e.target.checked));}
  });
  updateReferenceSelectionUi();
};
if($('save-selected-references'))$('save-selected-references').onclick=()=>{
  const selectedRefs=displayedReferences.filter(ref=>checkedReferenceIds.has(getRefKey(ref)));
  const ids=selectedRefs.map(ref=>ref.reference_id).filter(Boolean);
  if(!ids.length)return;
  act('선택한 레퍼런스를 보관함에 담는 중…',async()=>{
    const result=await api('references/save',{ids});
    checkedReferenceIds.clear();
    await refreshReferences();
    const total=result.total||ids.length;
    message(result.already_saved?`선택한 ${total}개 레퍼런스(이미 보관됨)를 최신 상태로 갱신했습니다.`:`선택한 ${total}개 레퍼런스를 보관함에 담았습니다.`);
  });
};
if($('delete-selected-references'))$('delete-selected-references').onclick=()=>{
  const collection=referenceCollection;
  const selectedRefs=displayedReferences.filter(ref=>checkedReferenceIds.has(getRefKey(ref)));
  const ids=selectedRefs.map(ref=>ref.reference_id).filter(Boolean);
  if(!ids.length||!confirm(`선택한 레퍼런스 ${ids.length}개를 ${collection==='saved'?'보관함':'수집한 레퍼런스'}에서 삭제할까요? 준비한 원본과 작업은 유지됩니다.`))return;
  act('선택한 레퍼런스 삭제 중…',async()=>{
    await api('references/delete',{collection,ids});
    if(selectedReference&&selectedRefs.some(r=>r.permalink===selectedReference.permalink))selectedReference=null;
    checkedReferenceIds.clear();
    await refreshReferences();
  },`선택한 레퍼런스 ${ids.length}개를 삭제했습니다.`);
};
if($('delete-all-references'))$('delete-all-references').onclick=()=>{
  const collection=referenceCollection,ids=displayedReferences.map(ref=>ref.reference_id);
  if(!ids.length||!confirm(`${collection==='saved'?'보관함':'수집한 레퍼런스'} ${ids.length}개를 모두 삭제할까요? 다른 목록과 준비한 원본·작업은 유지됩니다.`))return;
  act('목록 전체 삭제 중…',async()=>{await api('references/delete',{collection,ids,all:true,confirm_all:true});selectedReference=null;checkedReferenceIds.clear();await refreshReferences();},'확인한 목록을 삭제했습니다.');
};
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
  if(provider==='kie_api'){$('api-key-label').hidden=true;$('fallback-model').value='';$('fallback-model').disabled=true;}else $('fallback-model').disabled=false;
  const providerModels=allModels.filter(m=>m.provider===provider);
  $('model-choice').replaceChildren();
  for(const m of providerModels){
    const opt=text('option',`${m.name} [${m.has_audio?'음성+프레임':'프레임만'}]${m.verified?'':' ⚠️'}`);
    opt.value=m.model_id;opt.dataset.modelEntryId=m.id;$('model-choice').append(opt);
  }
  const custom=text('option','모델 이름 직접 입력');custom.value='custom';if(provider==='kie_api')custom.disabled=true;$('model-choice').append(custom);
  const savedModel=localStorage.getItem('takoh-ai-model-'+provider);
  const matching=providerModels.find(m=>m.model_id===savedModel);
  if(matching){$('model-choice').value=matching.model_id;$('model').value=matching.model_id;}
  else if(savedModel&&savedModel!=='custom'){$('model-choice').value='custom';$('model').value=savedModel;}
  else if(providerModels.length){$('model-choice').value=providerModels[0].model_id;$('model').value=providerModels[0].model_id;}
  $('cli-login-help').textContent=provider==='codex_cli'?'최초 로그인: 터미널에서 codex login 실행 후 ChatGPT 계정으로 로그인하세요. 인증은 공식 CLI가 보관합니다.':'최초 로그인: 터미널에서 agy 실행 → Google 계정 로그인 → 구독 계정으로 로그인하세요. 인증은 공식 CLI가 보관합니다.';
  if(provider==='kie_api'&&!providerModels.length){$('model').value='';$('model').hidden=true;}
  try{localStorage.setItem('takoh-ai-provider',provider);}catch{}
}

$('ai-provider').onchange=()=>{$('key').value='';chooseProvider();refreshKieStatus().catch(()=>{});};
$('model-choice').onchange=()=>{
  if($('ai-provider').value==='kie_api')$('kie-model-status').textContent='모델이 바뀌었습니다. 스키마·요금 확인 버튼을 눌러주세요.';
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

try{const prev=localStorage.getItem('takoh-ai-provider')==='gemini_cli'?'antigravity_cli':localStorage.getItem('takoh-ai-provider');if(prev&&['gemini_api','antigravity_cli','openai_api','codex_cli','kie_api'].includes(prev))$('ai-provider').value=prev;}catch{}
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

$('extension-upload').onclick=()=>act('휴먼터치 직접 업로드 작업 저장 중…',async()=>{
 const when=$('extension-when').value?new Date($('extension-when').value).getTime():Date.now();
 const packet=await api(`jobs/${job.id}/extension-export`,{when,automatic:$('extension-mode').value==='auto'});
 await new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('브라우저 브리지 또는 확장 프로그램을 새로고침하고 다시 연결하세요.'));},5000);function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);event.data.success?resolve(event.data.data):reject(new Error(event.data.error));}window.addEventListener('message',receive);window.postMessage({source:'takoh-studio-ui',kind:'upload',requestId,packet},location.origin);});
},'휴먼터치 업로드 작업을 등록했습니다. 지금 바로 업로드하거나 예약 시각에 실행합니다.');

$('save-commerce').onclick=()=>act('검색·제휴 설정 암호화 저장 중…',async()=>{const state=await api('commerce-settings',{serp_key:$('serp-key').value,coupang_access:$('coupang-access').value,coupang_secret:$('coupang-secret').value});$('commerce-status').textContent='등록됨: '+state.configured.join(', ');for(const id of ['serp-key','coupang-access','coupang-secret'])$(id).value='';},'API 설정을 암호화하여 저장했습니다.');

$('platform').addEventListener('change',()=>{if(!job?.disclosure)$('disclosure').value=disclosureDefaults[$('platform').value]||'';});

function uploadBridge(kind,packet){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('브라우저 브리지 또는 확장 프로그램을 새로고침한 뒤 다시 연결하세요.'));},5000);function receive(event){if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge'||event.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);event.data.success?resolve(event.data.data):reject(new Error(event.data.error));}window.addEventListener('message',receive);window.postMessage({source:'takoh-studio-ui',kind,packet,requestId},location.origin);});}
async function refreshUploadQueue(){const queue=await uploadBridge('upload-status');$('upload-queue').replaceChildren();const states={queued:'예약 대기',running:'휴먼터치 업로드 중',awaiting_confirmation:'휴먼터치 본문 입력 완료 · 직접 게시 확인',posted:'휴먼터치 본문·댓글 게시 확인',partial_success:'본문 게시 · 댓글 확인 필요',uncertain:'결과 확인 필요 · 자동 재시도 중지',missed:'예약 시각 경과 · 실행 안 함',cancelled:'예약 취소'};for(const item of queue){const row=document.createElement('div');row.append(text('p',`${item.name} · ${new Date(item.when).toLocaleString()} · ${states[item.state]||item.state}${item.error?' · '+item.error:''}`));if(item.state==='queued'){const cancel=text('button','예약 취소');cancel.onclick=()=>act('예약 취소 중…',async()=>{await uploadBridge('upload-cancel',{id:item.id});await refreshUploadQueue();});row.append(cancel);}if(item.permalink){const link=text('a','게시물 확인');link.href=item.permalink;link.target='_blank';link.rel='noopener';row.append(link);}$('upload-queue').append(row);}if(!queue.length)$('upload-queue').append(text('p','등록된 휴먼터치 업로드 작업이 없습니다.'));}
$('upload-queue-refresh').onclick=()=>act('휴먼터치 업로드·예약 상태 확인 중…',refreshUploadQueue,'업로드 상태를 확인했습니다.');

async function refreshCommerceSettings(){const state=await api('commerce-settings');if(!Array.isArray(state.configured))return;$('commerce-status').textContent=state.configured.length?'등록됨: '+state.configured.join(', '):'아직 등록한 검색·제휴 API가 없습니다.';for(const [id,key] of [['serp-key','serp_key'],['coupang-access','coupang_access'],['coupang-secret','coupang_secret']])$(id).placeholder=state.configured.includes(key)?'암호화 등록됨 · 변경할 때만 입력':'';}
window.refreshCommerceSettings=refreshCommerceSettings;window.refreshReferences=refreshReferences;
$('ai-provider').addEventListener('change',()=>{$('fallback-model').value=localStorage.getItem('studio-fallback-'+$('ai-provider').value)||'';});
$('fallback-model').value=localStorage.getItem('studio-fallback-'+$('ai-provider').value)||'';
$('fallback-model').addEventListener('change',()=>localStorage.setItem('studio-fallback-'+$('ai-provider').value,$('fallback-model').value.trim()));

async function refreshKieStatus(){
  const data=await api('kie/settings');
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
    groups[section===ai||section===kie?'ai':/사용량|등록 현황/.test(title)?'usage':'search'].panel.append(section);
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
  byId('ai-provider').addEventListener('change',update);update();groups.ai.button.click();
})();
