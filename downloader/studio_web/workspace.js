'use strict';
(() => {
  const escapeHtml = window.escapeHtml || (str => String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
  // Keep the existing controls and handlers; group infrequent actions into disclosures.
  function organiseDiscovery(){
    const root=document.getElementById('discovery-workspace');if(!root)return;
    const filters=root.querySelector('.discovery-filters');if(!filters)return;
    const primary=document.createElement('div');primary.className='discovery-primary-controls';
    const details=document.createElement('details');details.className='discovery-advanced';
    const summary=document.createElement('summary');summary.textContent='상세 필터 · 검색 공급자 / 국가 / 기간 / 조회수';details.append(summary);
    const advanced=document.createElement('div');advanced.className='discovery-advanced-controls';details.append(advanced);
    const ids=['discovery-query','discovery-category','discovery-type','discovery-sort-by'];
    for(const id of ids){const group=document.getElementById(id)?.closest('.filter-group');if(group)primary.append(group);}
    const queryLabel=primary.querySelector('label[for="discovery-query"]');if(queryLabel)queryLabel.textContent='제품명 · 검색어';
    const buttonGroup=document.getElementById('discovery-fetch-btn')?.closest('.filter-group');
    if(buttonGroup){primary.append(buttonGroup);const estimate=buttonGroup.querySelector('#discovery-quota-preview');if(estimate)advanced.append(estimate);}
    for(const child of Array.from(filters.children))advanced.append(child);
    filters.replaceChildren(primary,details);
    const archive=document.getElementById('discovery-archive-btn');
    const management=archive?.closest('section.discovery-toolbar');
    if(management){
      const drawer=document.createElement('details');drawer.className='discovery-management';
      const title=document.createElement('summary');title.textContent='채널 관리 · 구독자 정보 갱신';drawer.append(title);
      const contents=document.createElement('div');contents.className='discovery-management-controls';drawer.append(contents);
      const summaryCount=document.getElementById('discovery-catalogue-summary');
      for(const child of Array.from(management.children)){
        if(child===archive || child.contains(document.getElementById('discovery-unseen')) || child===summaryCount)continue;
        contents.append(child);
      }
      management.append(drawer);
    }
    const telemetry=document.getElementById('discovery-telemetry-strip');
    if(telemetry){const drawer=document.createElement('details');drawer.className='discovery-diagnostics';const title=document.createElement('summary');title.textContent='조회 내역';drawer.append(title);telemetry.replaceWith(drawer);drawer.append(telemetry);}
    const heading=root.querySelector('.workspace-heading p');if(heading)heading.textContent='쇼핑 영상 찾기 · 누적 자료는 API 사용 없이 다시 볼 수 있습니다.';
    const reload=document.getElementById('reload-discovery');if(reload)reload.textContent='저장 자료 새로고침';
    const fetch=document.getElementById('discovery-fetch-btn');if(fetch)fetch.title='새 외부 검색입니다. 상세 필터에서 공급자와 호출 상한을 확인하세요.';
  }
  organiseDiscovery();
  const pending=new Map();
  let discoveryArchiveMode=true;
  const nativeBrowser=Boolean(window.takohNative);
  const connectionName=nativeBrowser?'전용 앱':'확장';
  const stages=['analysis','editing','carousel','writing','product'],stageNames=['영상소재분석','미디어(영상)편집','캐러셀·뉴스카드 편집','대본·게시문','상품 제휴링크'];
  let stage='analysis';
  let lastSourceSubtab='reference';
  let currentWorkspace='jobs';
  function syncUnifiedTopTabs(){
    const isSourceGroup=sourceSubtabs.includes(currentWorkspace);
    document.querySelectorAll('.workspace-tabs [role="tab"], .workspace-tabs [data-workspace], .workspace-tabs [data-production-stage]').forEach(button=>{
      const bw=button.dataset.workspace;
      const bs=button.dataset.productionStage;
      let selected=false;
      if(bs){
        selected=(currentWorkspace==='create'&&bs===stage);
      }else if(bw){
        selected=(bw===currentWorkspace)||(bw==='source'&&isSourceGroup);
      }
      button.setAttribute('aria-selected',String(selected));
    });
  }
  function selectStage(name){
    if(name==='publish'){selectWorkspace('publish');return;}
    if(name==='reference'){selectWorkspace('reference');return;}
    if(!stages.includes(name))name='analysis';
    stage=name;
    window.currentProductionStage=name;
    document.body.dataset.activeStage=name;
    const isMediaStage=(name==='analysis'||name==='editing'||name==='carousel');
    const createLivePreview=document.querySelector('#create-workspace > .content-studio-layout > .content-live-preview');
    if(createLivePreview){
      createLivePreview.hidden=isMediaStage;
    }
    const createLayout=document.querySelector('#create-workspace > .content-studio-layout');
    if(createLayout){
      createLayout.classList.toggle('full-width-studio-stage',isMediaStage);
    }
    document.querySelectorAll('#create-workspace [data-production-section]').forEach(section=>{
      const secKey=section.dataset.productionSection;
      const show=(secKey===name)||(isMediaStage&&secKey==='analysis');
      const hide=secKey!=='publish'&&!show;
      section.dataset.stageHidden=String(hide);
      if(secKey!=='publish')section.hidden=hide;
    });
    if(isMediaStage){
      document.querySelectorAll('[data-stage-view]').forEach(el=>{
        const view=el.dataset.stageView;
        if(el.id==='analysis-source-bar'){
          el.hidden=(name!=='analysis');
        }else{
          el.hidden=Boolean(!document.body.classList.contains('quick-sidebar-mode')&&view!==name);
        }
      });
    }
    const sourceBar=document.getElementById('analysis-source-bar');
    if(sourceBar)sourceBar.hidden=(name!=='analysis');
    const snapToolbar=document.querySelector('.player-canvas-toolbar-right');
    if(snapToolbar)snapToolbar.hidden=(name==='carousel');
    const carScrubBtn=document.getElementById('btn-capture-scrubber-carousel');
    if(carScrubBtn)carScrubBtn.hidden=(name!=='carousel');
    document.querySelectorAll('.frame-replace-slide-btn').forEach(btn=>{btn.hidden=(name!=='carousel');});
    document.querySelectorAll('[data-production-stage]').forEach(button=>{
      const isCurrent=button.dataset.productionStage===name;
      button.setAttribute('aria-pressed',String(isCurrent));
    });
    syncUnifiedTopTabs();
    const next=stages.indexOf(name)+1;$('production-next').hidden=false;
    $('production-next').textContent=next===stages.length?'게시·예약으로 이동 →':'다음: '+stageNames[next]+' →';
    try{localStorage.setItem('takoh-active-stage',name);}catch{}
    if(name==='carousel'){
      if(window.ensureCarouselStoryAutoPopulated)window.ensureCarouselStoryAutoPopulated(false);
    }
    if(window.syncDraggableOverlayCanvas)setTimeout(()=>window.syncDraggableOverlayCanvas(),20);
  }
  window.selectStage=selectStage;
  document.querySelectorAll('[data-production-stage]').forEach(button=>button.onclick=()=>{
    if(currentWorkspace!=='create')selectWorkspace('create');
    selectStage(button.dataset.productionStage);
  });
  $('new-job').addEventListener('click',()=>{try{localStorage.removeItem('takoh-active-job-id');}catch{}selectWorkspace('create');selectStage('analysis');($('fetch-url')||$('video-file'))?.focus();});
  $('production-next').onclick=()=>stages.indexOf(stage)===stages.length-1?selectWorkspace('publish'):selectStage(stages[stages.indexOf(stage)+1]);
  function bridge(kind,downloadId){return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('타코 확장을 새로고침한 뒤 다시 연결하세요. 다른 위치의 파일은 제작 화면에서 직접 선택할 수 있습니다.'));},5000);
    pending.set(requestId,{resolve,reject,timer,kind,downloadId});window.postMessage({source:'takoh-studio-ui',kind,downloadId,requestId},location.origin);
  });}
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-bridge')return;
    if(event.data.kind==='changed'){refreshDownloads();syncCollections();return;}
    if(event.data.kind==='ready'){
      if(pending.size)for(const [requestId,waiter] of pending)window.postMessage({source:'takoh-studio-ui',kind:waiter.kind,downloadId:waiter.downloadId,requestId},location.origin);
      else refreshDownloads();
      syncCollections();
      return;
    }
    const waiter=pending.get(event.data.requestId);if(!waiter)return;
    clearTimeout(waiter.timer);pending.delete(event.data.requestId);
    if(event.data.success)waiter.resolve(event.data.data);else waiter.reject(new Error(event.data.error||'파일 연결 실패'));
  });
  const sourceSubtabs=['reference','discovery','research','download'];
  const productionTabs=['jobs','create','publish','scheduler'];
  function selectWorkspace(name){
    if(name==='source')name=lastSourceSubtab||'reference';
    if(!['reference','download','discovery','research','jobs','create','publish','scheduler','settings'].includes(name))name='jobs';
    currentWorkspace=name;
    const isSourceGroup=sourceSubtabs.includes(name);
    const isProductionGroup=productionTabs.includes(name);
    if(isSourceGroup)lastSourceSubtab=name;
    const download=name==='download';
    const prodNav=document.querySelector('.workspace-tabs');
    if(prodNav)prodNav.hidden=!isProductionGroup;
    if($('source-hub-subnav'))$('source-hub-subnav').hidden=!isSourceGroup;
    if($('reference-workspace'))$('reference-workspace').hidden=name!=='reference';
    if($('jobs-workspace'))$('jobs-workspace').hidden=name!=='jobs';
    $('download-workspace').hidden=!download;
    if($('discovery-workspace'))$('discovery-workspace').hidden=name!=='discovery';
    if($('research-workspace'))$('research-workspace').hidden=name!=='research';
    $('create-workspace').hidden=name!=='create';if($('publish-workspace'))$('publish-workspace').hidden=name!=='publish';
    $('settings-workspace').hidden=name!=='settings';if($('scheduler-workspace'))$('scheduler-workspace').hidden=name!=='scheduler';
    if(name==='scheduler'&&window.refreshStudioCalendar)window.refreshStudioCalendar();
    syncUnifiedTopTabs();
    document.querySelectorAll('[data-source-subtab]').forEach(button=>{
      const active=button.dataset.sourceSubtab===name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    try{localStorage.setItem('takoh-workspace',name);}catch{}
    if(window.takohNative?.request){
      window.takohNative.request({action:'studioWorkspaceChanged',workspace:name}).catch(()=>{});
    }
    if(name==='jobs'&&typeof refreshJobs==='function')refreshJobs().catch(()=>{});
    if(name==='reference'&&typeof refreshReferences==='function')refreshReferences().catch(()=>{});
    if(download)refreshDownloads();
    if(name==='discovery')refreshDiscovery();
    if(name==='settings'){refreshUsage();refreshCommerceSettings().catch(error=>{$('commerce-status').textContent=error.message;});refreshYoutubeSettings();if(window.refreshConnectionsStatus)window.refreshConnectionsStatus();if(window.populateSearchAndFallbackModels)window.populateSearchAndFallbackModels();}
  }
  window.selectWorkspace=selectWorkspace;
  let discoveryLoading=false;
  let currentDiscoveryPage=1;
  let currentDiscoveryItems=[];
  let currentDiscoveryHasMore=false;
  let currentDiscoveryLimit=30;
  const checkedDiscoveryUrls=new Set();

  function buildDiscoveryReferencePayload(item, country, category){
    const isDirectVideo=/\.(mp4|webm|mov)(\?|$)/i.test(item.url||'');
    return {
      permalink:item.url,
      username:item.channel,
      text:`${item.title}\n\n[추천 유형] ${item.intent||'제품 시연'}\n[카테고리] ${item.category_name||'생활·주방'}\n[추천 사유] ${item.recommendation_reason}\n[권리 상태] ${item.license_label}${item.attribution_draft?'\n[출처 표기] '+item.attribution_draft:''}`,
      mediaKind:'video',
      videoUrls:isDirectVideo?[item.url]:[],
      imageUrls:[],
      thumbnailUrl:item.thumbnail_url,
      poster:item.thumbnail_url,
      discovery:{
        video_id:item.video_id,
        country:item.country||country,
        category_key:item.category_key||category,
        category_name:item.category_name||'생활·주방',
        intent:item.intent||'제품 시연',
        user_query:item.user_query||$('discovery-query')?.value?.trim()||'',
        source_type:item.source_type,
        source_label:item.source_label,
        rank:item.rank,
        view_count:item.view_count,
        view_count_display:item.view_count_display,
        duration_seconds:item.duration_seconds,
        duration_display:item.duration_display,
        shorts_classification:item.shorts_classification,
        shorts_status:item.shorts_status,
        shorts_grounds:item.shorts_grounds,
        growth_display:item.growth_display,
        growth_rate:item.growth_rate,
        license_type:item.license_type,
        license_label:item.license_label,
        license_url:item.license_url,
        attribution_draft:item.attribution_draft,
        legal_notice:item.legal_notice,
        limitation_notice:item.limitation_notice,
        recommendation_reason:item.recommendation_reason,
        fetched_at:item.fetched_at,
        fetched_at_str:item.fetched_at_str
      }
    };
  }

  function updateDiscoverySelectionUi(){
    for(const url of Array.from(checkedDiscoveryUrls)){
      if(!currentDiscoveryItems.some(item=>item.url===url))checkedDiscoveryUrls.delete(url);
    }
    const total=currentDiscoveryItems.length,count=checkedDiscoveryUrls.size;
    const selectAll=$('select-all-discovery'),collectBtn=$('collect-selected-discovery'),saveBtn=$('save-selected-discovery'),summary=$('discovery-selection-summary');
    if(selectAll){
      selectAll.disabled=total===0;
      selectAll.checked=total>0&&count===total;
      selectAll.indeterminate=count>0&&count<total;
    }
    if(collectBtn){
      collectBtn.disabled=count===0;
      collectBtn.textContent=count?`선택 수집함에 담기 (${count})`:'선택 수집함에 담기';
    }
    if(saveBtn){
      saveBtn.disabled=count===0;
      saveBtn.textContent=count?`선택 보관함에 바로 저장 (${count})`:'선택 보관함에 바로 저장';
    }
    if(summary){
      summary.textContent=count?`${count}개 선택됨`:'';
    }
  }

  function renderDiscoveryCard(item, country, category, isCompact){
    const card=document.createElement('div');
    const isChecked=checkedDiscoveryUrls.has(item.url);
    card.className='discovery-card'+(isChecked?' checked':'');
    card.dataset.url=item.url;

    const thumbWrap=document.createElement('div');
    thumbWrap.className='discovery-thumb-wrap';
    const img=document.createElement('img');
    img.src=item.thumbnail_url;
    img.alt=item.title;
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    thumbWrap.append(img);

    const checkLabel=document.createElement('label');
    checkLabel.className='discovery-check-badge';
    checkLabel.onclick=e=>e.stopPropagation();
    const checkInput=document.createElement('input');
    checkInput.type='checkbox';
    checkInput.className='discovery-select-checkbox';
    checkInput.checked=isChecked;
    checkInput.setAttribute('aria-label',(item.title||'영상')+' 선택');
    checkInput.onchange=()=>{
      if(checkInput.checked)checkedDiscoveryUrls.add(item.url);
      else checkedDiscoveryUrls.delete(item.url);
      card.classList.toggle('checked',checkInput.checked);
      updateDiscoverySelectionUi();
    };
    checkLabel.append(checkInput,text('span','선택'));
    thumbWrap.append(checkLabel);

    if(item.rank){
      const rankBadge=text('span',`#${item.rank}`);
      rankBadge.className='badge-rank';
      thumbWrap.append(rankBadge);
    }
    if(item.duration_display){
      const durBadge=text('span',item.duration_display);
      durBadge.className='badge-duration';
      thumbWrap.append(durBadge);
    }
    card.append(thumbWrap);

    const body=document.createElement('div');
    body.className='discovery-card-body';

    const title=text('h3',item.title);
    title.className='discovery-card-title';
    title.title=item.title;

    const channel=text('p',item.channel);
    channel.className='discovery-card-channel';

    const meta=document.createElement('div');
    meta.className='discovery-card-meta';
    const hasIsoDate=Boolean(item.published_at && /^\d{4}-\d{2}-\d{2}/.test(item.published_at));
    meta.append(
      text('strong',`조회수 ${item.view_count_display}`)
    );
    if(hasIsoDate){
      meta.append(text('span',` · ${item.published_at.slice(0,10)}`));
    }
    const badgeLabel=item.days_ago_str || (hasIsoDate ? '' : '게시일 미확인');
    if(badgeLabel){
      const daysBadge=text('span',badgeLabel);
      daysBadge.className='badge-days-ago';
      meta.append(daysBadge);
    }

    body.append(title,channel,meta);
    if(item.shopping_shorts_ground){const shortsBadge=text('p',item.shopping_shorts_ground);shortsBadge.className='discovery-metric-pending';body.append(shortsBadge);}
    const multipleMeta=text('p',item.subscriber_multiple!=null?`구독자 대비 조회수 X${item.subscriber_multiple.toLocaleString()} · 구독자 약 ${item.subscriber_count.toLocaleString()}명`:item.subscriber_hidden?'구독자 대비 배수: 비공개로 계산 불가':item.subscriber_count===0?'구독자 대비 배수: 구독자 0명으로 계산 불가':'구독자 대비 배수: 구독자 수 확인 필요');multipleMeta.className=item.subscriber_multiple!=null?'discovery-multiple-badge':'discovery-metric-pending';body.append(multipleMeta);
    const growthMeta=text('p',item.growth_rate==null?'성장률: 측정 대기':`성장량 ${item.growth_rate>=0?'+':''}${item.growth_rate.toLocaleString()}회/시간 · 성장률 ${item.growth_percent==null?'미확인':item.growth_percent+'%/시간'}`);growthMeta.className='discovery-growth-metric';if(item.growth_rate!=null || ['growth','growth_percent'].includes($('discovery-sort-by')?.value))body.append(growthMeta);

    // 상세 정보 블록 (컴팩트 보기에서는 details 태그로 축소 접기, 상세 보기에서는 기본 펼침)
    const detailsBox=document.createElement(isCompact ? 'details' : 'div');
    detailsBox.className='discovery-card-details';
    if(isCompact){
      const sum=text('summary','추천 근거 · 상세 정보');
      detailsBox.append(sum);
    }

    const tags=document.createElement('div');
    tags.className='discovery-tags';

    if(item.rec_type_label || item.intent){
      const intentTag=text('span',`유형: ${item.rec_type_label||item.intent}`);
      intentTag.className='tag-pill tag-intent';
      tags.append(intentTag);
    }

    if(item.relevance_status){
      const relTag=text('span',`관련성: ${item.relevance_status}`);
      relTag.className='tag-pill '+(item.relevance_status.includes('높음')?'tag-chart':(item.relevance_status.includes('보통')?'tag-search':'tag-shorts-candidate'));
      tags.append(relTag);
    }

    const popTag=text('span',`인기: 조회수 ${item.popularity_display||item.view_count_display}`);
    popTag.className='tag-pill tag-search';
    tags.append(popTag);

    const licTag=text('span',`권한: ${item.license_status||item.license_label}`);
    licTag.className='tag-pill '+(item.license_type==='creative_common'?'tag-cc':'tag-standard');
    tags.append(licTag);

    const srcTag=text('span',item.source_label);
    srcTag.className='tag-pill tag-'+item.source_type;
    tags.append(srcTag);

    const shortsTag=text('span',item.shorts_classification);
    shortsTag.className='tag-pill tag-'+item.shorts_status;
    tags.append(shortsTag);

    const reasonBox=document.createElement('div');
    reasonBox.className='discovery-box reason';
    reasonBox.append(text('strong','추천 근거: '),text('span',item.recommendation_reason));
    if(item.limitation_notice){
      const limitNotice = text('small', ` [${item.limitation_notice}]`);
      limitNotice.style.display = 'block';
      limitNotice.style.marginTop = '4px';
      limitNotice.style.color = '#b45309';
      limitNotice.style.fontWeight = '500';
      reasonBox.append(limitNotice);
    }

    const growthBox=document.createElement('div');
    growthBox.className='discovery-box growth';
    growthBox.append(text('strong','관측 성장률: '),text('span',item.growth_display));

    detailsBox.append(tags,reasonBox,growthBox);
    for(const source of (item.gemini_search_sources||[]).slice(0,3)){if(!/^https:\/\//.test(source.url))continue;const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener';link.textContent='검색 출처: '+(source.title||'Google 웹 검색');detailsBox.append(link);}


    if(item.attribution_draft){
      const attrBox=document.createElement('div');
      attrBox.className='discovery-box attribution';
      attrBox.append(
        text('strong','CC 출처 표시 초안: '),
        text('p',item.attribution_draft),
        text('small',item.legal_notice)
      );
      detailsBox.append(attrBox);
    }

    body.append(detailsBox);

    const actions=document.createElement('div');
    actions.className='discovery-card-actions';

    const viewLink=text('a','원본 ↗');
    viewLink.className='btn-view-src';
    viewLink.href=item.url;
    viewLink.target='_blank';
    viewLink.rel='noopener noreferrer';

    const saveBtn=text('button','레퍼런스 수집 +');
    saveBtn.type='button';
    saveBtn.className='btn-save-ref';
    saveBtn.onclick=async()=>{
      saveBtn.disabled=true;
      saveBtn.textContent='저장 중…';
      try{
        const refPayload=buildDiscoveryReferencePayload(item, country, category);
        const res=await api('references/import',{reference:refPayload});
        saveBtn.disabled=false;
        if(res.already_saved){
          saveBtn.textContent='이미 담겨 있음';
          message('이미 보관함에 저장되어 있는 영상입니다.');
        }else{
          saveBtn.textContent='보관함 담김';
          message('보관함에 담았습니다! [수집한 레퍼런스]에서 원본을 준비할 수 있습니다.');
        }
        if(typeof refreshReferences==='function')refreshReferences();
      }catch(err){
        saveBtn.disabled=false;
        saveBtn.textContent='레퍼런스 수집 +';
        message('보관함 저장 실패: '+err.message,true);
      }
    };

    actions.append(viewLink,saveBtn);
    body.append(actions);
    card.append(body);
    return card;
  }

  function renderDiscoveryList(items, country, category){
    const grid=$('discovery-grid');
    if(!grid)return;
    grid.replaceChildren();
    const isCompact = document.querySelector('input[name="discovery-view-mode"]:checked')?.value !== 'detail';
    for(const item of items){
      grid.append(renderDiscoveryCard(item, country, category, isCompact));
    }
    updateDiscoverySelectionUi();
  }

  let discoveryAbortController = null;
  let discoveryRequestId = 0;
  let activeDiscoveryChannelId = '';
  let activeDiscoveryChannelName = '';

  async function refreshDiscovery(explicitRefresh=false, appendPage=false){
    const grid=$('discovery-grid'),banner=$('discovery-status-banner'),telemetryStrip=$('discovery-telemetry-strip'),paginationBar=$('discovery-pagination-bar'),pageIndicator=$('discovery-page-indicator'),moreBtn=$('discovery-more-btn'),fetchBtn=$('discovery-fetch-btn'),cancelBtn=$('discovery-cancel-btn');
    if(!grid||!banner)return;

    // Handle in-flight request: if already loading, abort previous request if starting explicit refresh
    if(discoveryLoading){
      if((explicitRefresh || discoveryArchiveMode) && discoveryAbortController){
        try{discoveryAbortController.abort();}catch{}
      }else{
        return;
      }
    }

    const thisRequestId = ++discoveryRequestId;
    discoveryAbortController = new AbortController();
    discoveryLoading = true;

    if(fetchBtn){
      fetchBtn.disabled = true;
      fetchBtn.textContent = '조회 진행 중…';
    }
    if(cancelBtn){
      cancelBtn.style.display = 'inline-block';
      cancelBtn.onclick = () => {
        if(discoveryAbortController){
          discoveryAbortController.abort();
        }
      };
    }

    if(!appendPage){
      currentDiscoveryPage=1;
      currentDiscoveryItems=[];
    }else{
      currentDiscoveryPage+=1;
    }

    const provider=$('discovery-provider')?.value||'youtube';
    const providerName = {youtube:'YouTube Data API',serpapi:'SerpAPI YouTube 검색',gemini_search:'Gemini API Google 검색',antigravity_search:'Antigravity CLI Gemini 검색'}[provider]||provider;
    banner.textContent=explicitRefresh?`${providerName} 후보를 새로 불러오는 중…`:'저장된 후보 영상을 불러오는 중…';
    banner.className='discovery-banner';

    const country=$('discovery-country')?.value||'ALL';
    const mode=$('discovery-mode')?.value||'shopping';
    const category=$('discovery-category')?.value||'living_kitchen';
    const q=encodeURIComponent($('discovery-query')?.value?.trim()||'');
    const intent=$('discovery-intent')?.value||'all';
    const type=$('discovery-type')?.value||'all';
    const license=$('discovery-license')?.value||'all';

    const publishedRange=$('discovery-published-range')?.value||'90d';
    const customAfter=$('discovery-published-after')?.value||'';
    const customBefore=$('discovery-published-before')?.value||'';

    let minViews=$('discovery-min-views')?.value||'0';
    if(minViews==='custom'){
      minViews=$('discovery-custom-views-input')?.value?.trim()||'0';
    }
    const sortBy=$('discovery-sort-by')?.value||'relevance';
    const limit=$('discovery-limit')?.value||'30';
    currentDiscoveryLimit=parseInt(limit,10)||30;

    const refreshParam=explicitRefresh?'&refresh=1':'';
    const channelParam=activeDiscoveryChannelId?`&channel_id=${encodeURIComponent(activeDiscoveryChannelId)}`:'';
    const queryParams=`archive=${discoveryArchiveMode?1:0}&unseen=${$('discovery-unseen')?.checked?1:0}&provider=${provider}&country=${country}&mode=${mode}&category=${category}&q=${q}&intent=${encodeURIComponent(intent)}&type=${type}&license=${license}&published_range=${publishedRange}&published_after=${encodeURIComponent(customAfter)}&published_before=${encodeURIComponent(customBefore)}&min_views=${minViews}&sort_by=${sortBy}&limit=${limit}&page=${currentDiscoveryPage}${refreshParam}${channelParam}`;

    if(mode==='popular' && country==='ALL'){
      discoveryLoading=false;
      if(fetchBtn){fetchBtn.disabled=false;fetchBtn.textContent='쇼핑 레퍼런스 찾기';}
      if(cancelBtn)cancelBtn.style.display='none';
      grid.replaceChildren();
      if(paginationBar)paginationBar.style.display='none';
      banner.className='discovery-banner unconfigured';
      banner.textContent='공식 인기 차트는 특정 국가의 공식 순위입니다. [국가·언어 선택]에서 대한민국(KR), 미국(US) 등 국가를 선택해 주세요.';
      grid.append(text('p','국가 제한 없는 상태(ALL)에서는 국가별 인기 차트를 조회할 수 없습니다. 상단에서 특정 국가를 선택하거나, 조회 방식을 [쇼핑 레퍼런스]로 선택해 주세요.'));
      return;
    }

    // 공급자 사전 확인 (구버전 도우미 또는 미지원 공급자 오호출 원천 차단)
    if(explicitRefresh && !discoveryArchiveMode){
      try{
        const statusResp = await fetch('/studio/discovery/status', {
          headers: {'X-Studio-Token': token, 'Accept': 'application/json'},
          signal: discoveryAbortController.signal
        });
        if(!statusResp.ok){
          throw new Error('도우미 상태 확인 불가 (HTTP ' + statusResp.status + ')');
        }
        const statusInfo = await statusResp.json();
        const supported = statusInfo.supported_providers || [];
        if(!supported.includes(provider)){
          discoveryLoading = false;
          if(fetchBtn){fetchBtn.disabled = false; fetchBtn.textContent = '쇼핑 레퍼런스 찾기';}
          if(cancelBtn)cancelBtn.style.display = 'none';
          grid.replaceChildren();
          if(paginationBar)paginationBar.style.display = 'none';
          banner.className = 'discovery-banner unconfigured';
          banner.textContent = `도우미 업데이트 필요: 현재 도우미가 [${providerName}] 공급자를 지원하지 않습니다. (지원: ${supported.join(', ') || '없음'})`;
          grid.append(text('p', `선택하신 [${providerName}] 검색 기능은 최신 도우미에서만 지원됩니다. 구버전 도우미에서는 다른 공급자로 오호출되는 것을 방지하기 위해 검색 실행을 사전에 차단했습니다. 도우미를 최신 코드로 재시작해 주세요.`));
          return;
        }
      }catch(statusErr){
        if(statusErr.name === 'AbortError') return;
        discoveryLoading = false;
        if(fetchBtn){fetchBtn.disabled = false; fetchBtn.textContent = '쇼핑 레퍼런스 찾기';}
        if(cancelBtn)cancelBtn.style.display = 'none';
        grid.replaceChildren();
        if(paginationBar)paginationBar.style.display = 'none';
        banner.className = 'discovery-banner unconfigured';
        banner.textContent = `도우미 업데이트 필요: 도우미 서버의 공급자 지원 여부를 확인할 수 없습니다 (${statusErr.message}).`;
        grid.append(text('p', `도우미 서버가 구버전이거나 응답하지 않아 오호출 방지를 위해 외부 요청을 사전에 차단했습니다. 도우미를 최신 코드로 재시작해 주세요.`));
        return;
      }
    }

    try{
      const response = await fetch(`/studio/discovery?${queryParams}`, {
        headers: {'X-Studio-Token': token, 'Accept': 'application/json'},
        signal: discoveryAbortController.signal
      });
      const data = await response.json();

      // Ignore outdated responses from earlier superseded requests
      if(thisRequestId !== discoveryRequestId) return;

      if(!response.ok){
        grid.replaceChildren();
        if(paginationBar)paginationBar.style.display='none';
        banner.className='discovery-banner unconfigured';
        const errTitle = response.status === 401 ? '인증 실패 (401 Unauthorized)' : (response.status === 403 ? '접근 권한 없음 (403 Forbidden)' : (response.status === 429 ? '요청 한도 초과 (429 Quota Exceeded)' : `조회 오류 (HTTP ${response.status})`));
        banner.textContent = `${errTitle}: ${data.error || '요청 처리 실패'}`;
        grid.append(text('p', data.error || '요청 처리에 실패했습니다. 오류 메시지와 사용 요청 수를 확인하세요.'));
        return;
      }

      if(!appendPage){
        grid.replaceChildren();
      }

      if(!data.configured){
        banner.className='discovery-banner unconfigured';
        banner.innerHTML=`<strong>${data.verification_status}</strong>: ${data.message} <button type="button" class="secondary" style="margin-left:8px;" onclick="document.querySelector('[data-workspace=\\'settings\\']').click()">설정으로 이동 →</button>`;
        grid.append(text('p','API 키 미등록 상태입니다. [설정·사용량] 탭에서 키를 등록하면 실제 영상 데이터를 불러옵니다. (모의 자료를 실제 추천으로 표시하지 않습니다.)'));
        if(paginationBar)paginationBar.style.display='none';
        return;
      }

      if(data.verification_status==='저장된 캐시 없음' || data.items?.length===0 && !data.cached && !explicitRefresh){
        banner.className='discovery-banner unconfigured';
        banner.textContent=`검색 전 · 저장된 캐시 없음 (상단의 [쇼핑 레퍼런스 찾기] 버튼을 누르면 검색 계획대로 조회가 실행됩니다)`;
        if(telemetryStrip)telemetryStrip.textContent='조회 전 · 저장된 캐시 없음';
        grid.append(text('p', data.message || '저장된 캐시가 없습니다. 상단의 [쇼핑 레퍼런스 찾기] 버튼을 누르면 선택한 조건으로 조회를 진행합니다.'));
        if(paginationBar)paginationBar.style.display='none';
        return;
      }

      banner.className=data.expired?'discovery-banner unconfigured':'discovery-banner configured';
      const modeText=data.mode==='popular'?'공식 인기 차트':data.mode==='shopping'?`쇼핑 레퍼런스 [${$('discovery-category')?.selectedOptions[0]?.textContent||'생활·주방'}]`:'키워드 검색 결과';
      const cacheNote=data.cache_status||(data.cached?(data.expired?'캐시 만료됨':'15분 캐시 적용'):'방금 검색 완료');
      const provTag = ['gemini_search','antigravity_search'].includes(data.provider)?'[Gemini]':data.provider === 'serpapi' ? '[SerpAPI]' : '[YouTube API]';
      const thisCalls = data.telemetry?.current_search_requests || data.usage?.current_search_requests || 0;
      const totalCalls = data.telemetry?.cumulative_search_requests || data.usage?.cumulative_search_requests || data.usage?.searches_count || data.usage?.requests_count || 0;
      const quotaInfo = data.provider === 'serpapi' ? `이번 검색 ${thisCalls}회 · 누적 검색 ${totalCalls}회` : `이번 요청 ${thisCalls}회 (누적 쿼터: ${(data.usage?.quota_units||0).toLocaleString()} 유닛)`;
      banner.textContent=`${data.verification_status} · ${provTag} 선택 국가 [${data.country}] · ${modeText} · ${data.total_count||data.count}개 유효 후보 (${cacheNote} · ${quotaInfo})`;

      refreshCatalogueSummary().catch(()=>{});
      if(['growth','growth_percent'].includes(sortBy) && data.growth_measured_count===0){banner.textContent+=' · 성장 지표를 계산할 기록이 아직 없습니다. 현재 순서는 조회수 참고순입니다. 1시간 이상 간격으로 실제 조회수를 다시 확인해야 합니다.';}
      if(data.gemini_session_requests){banner.textContent+=` · Gemini 세션 ${data.gemini_session_requests}회 · 관측 검색어 ${data.gemini_search_queries_observed}개 (AI 과금/계정 한도 별도)`;}
      const newItems = data.items || [];
      if(appendPage){
        currentDiscoveryItems = currentDiscoveryItems.concat(newItems);
      }else{
        currentDiscoveryItems = newItems;
      }
      currentDiscoveryHasMore = Boolean(data.has_more);

      // 텔레메트리 스트립 정확한 집계 및 중단 이유 표시
      const telem = data.telemetry || {};
      const inspected = telem.total_candidates_inspected || 0;
      const dupExcluded = telem.excluded_duplicates_count || 0;
      const filterExcluded = telem.excluded_filters_count || 0;
      const displayed = currentDiscoveryItems.length;
      const sortDesc = data.sort_description || '관련성 순';
      const stopReason = data.stop_reason ? ` · 상태: ${data.stop_reason}` : '';
      if(telemetryStrip){
        telemetryStrip.textContent = `조회 후보 ${inspected}개 · 중복/필터 제외 ${dupExcluded + filterExcluded}개 (중복 ${dupExcluded} / 조건 ${filterExcluded}) · 이미 표시 ${telem.excluded_seen_count||0}개 제외 · 현재 표시 ${displayed}개 (정렬: ${sortDesc})${stopReason}`;
      }

      if(!currentDiscoveryItems.length){
        if(data.empty_reason==='already_seen'){
          grid.append(text('p',`현재 조건에 맞는 ${data.matching_including_seen}개는 이미 표시된 자료입니다. ‘아직 안 본 콘텐츠만’ 옵션으로 제외됐으며, 누적 자료는 그대로 보관되어 있습니다.`));
          const restore=document.createElement('button');restore.type='button';restore.textContent=`이미 본 자료 ${data.matching_including_seen}개 다시 보기 · API 사용 없음`;
          restore.onclick=()=>{$('discovery-unseen').checked=false;discoveryArchiveMode=true;refreshDiscovery(false);};grid.append(restore);
        }else{
          grid.append(text('p','현재 업로드 기간·조회수·쇼핑 관련성 조건을 통과한 자료가 없습니다. 저장된 자료는 유지됩니다. 기간이나 조회수 조건을 조정해 보세요.'));
        }
        if(paginationBar)paginationBar.style.display='none';
        return;
      }

      renderDiscoveryList(currentDiscoveryItems, data.country, category);

      // 페이지네이션 바 처리
      if(paginationBar){
        if(currentDiscoveryHasMore){
          paginationBar.style.display='flex';
          if(moreBtn){
            moreBtn.disabled=false;
            moreBtn.textContent=`더 보기 (저장된 후보 중 다음 ${currentDiscoveryLimit}개 펼치기) ↓`;
          }
          if(pageIndicator)pageIndicator.textContent=`전체 확보 후보 ${data.total_count}개 중 ${displayed}개 표시 중 (페이지 ${currentDiscoveryPage})`;
        }else{
          paginationBar.style.display=displayed > currentDiscoveryLimit ? 'flex' : 'none';
          if(moreBtn)moreBtn.disabled=true;
          if(pageIndicator)pageIndicator.textContent=`확보된 모든 후보 ${displayed}개 표시 완료 (추가 결과 없음)`;
        }
      }

    }catch(err){
      if(thisRequestId !== discoveryRequestId) return;
      if(err.name === 'AbortError'){
        banner.className='discovery-banner unconfigured';
        banner.textContent='사용자에 의해 검색 조회가 취소되었습니다.';
        return;
      }
      banner.className='discovery-banner unconfigured';
      banner.textContent='조회 실패: '+err.message;
      grid.replaceChildren();
      grid.append(text('p','영상 목록을 가져오지 못했습니다. '+err.message));
      if(paginationBar)paginationBar.style.display='none';
    }finally{
      if(thisRequestId === discoveryRequestId){
        discoveryLoading=false;
        if(fetchBtn){
          fetchBtn.disabled = false;
          fetchBtn.textContent = '쇼핑 레퍼런스 찾기';
        }
        if(cancelBtn){
          cancelBtn.style.display = 'none';
        }
      }
    }
  }

  async function refreshYoutubeSettings(){
    try{
      const data=await api('youtube-settings');
      if($('yt-stat-configured'))$('yt-stat-configured').textContent=data.configured?`등록됨 (${data.api_key_masked})`:'미등록 (실서비스 검증 대기)';
      if($('yt-stat-requests'))$('yt-stat-requests').textContent=`${(data.usage?.requests_count||0).toLocaleString()}회`;
      if($('yt-stat-quota'))$('yt-stat-quota').textContent=`${(data.usage?.quota_units||0).toLocaleString()} 유닛 (로컬 추정치)`;
      if($('yt-stat-cache'))$('yt-stat-cache').textContent=`${(data.usage?.cache_hits||0).toLocaleString()}회`;
      if($('yt-stat-last'))$('yt-stat-last').textContent=data.usage?.last_fetched?new Date(data.usage.last_fetched*1000).toLocaleString('ko-KR'):'-';
      if($('youtube-api-status'))$('youtube-api-status').textContent=data.verification_status;
    }catch(err){
      if($('youtube-api-status'))$('youtube-api-status').textContent='설정 조회 실패: '+err.message;
    }
  }

  const CATEGORY_SUBPRODUCTS = {
    "furniture_interior": "수납 가구 · 조명 · 홈데코",
    "bathroom": "샤워 용품 · 욕실 수납 · 위생 도구",
    "automotive": "차량 거치대 · 세차 도구 · 차량 수납",
    "travel": "캐리어 · 여행 파우치 · 휴대용 도구",
    "office": "필기 도구 · 데스크 정리 · 사무 소품",
    "diy_tools": "전동 공구 · 수리 도구 · DIY 소품",
    "gardening": "화분 · 급수 도구 · 원예 도구",
    "health": "마사지 도구 · 자세 보조 · 생활 보조",
    "food_drink": "간편 식품 · 간식 · 음료·커피",
    "hobbies": "완구 · 취미 도구 · 퍼즐·조립",
    'all': '전체 쇼핑 제품군',
    'living_kitchen': '수납 도구 · 청소 도구 · 조리 도구 · 주방 정리 꿀템',
    'cleaning_storage': '틈새 수납선반 · 먼지 청소 도구 · 욕실 정리함 · 다용도 걸레',
    'beauty': '스킨케어 도구 · 클렌징 디바이스 · 메이크업 툴 · 보습 케어',
    'fashion_goods': '가방·파우치 · 보관용 옷걸이 · 신발 관리용품 · 패션 소품',
    'digital_appliances': '소형 가전 · 스마트 기기 · 충전·거치대 · 게이밍 기어',
    'parenting': '수유·이유식 도구 · 유아 안전용품 · 아기 수납함 · 외출 육아템',
    'pets': '반려동물 급식기 · 위생·배변용품 · 털 관리 브러시 · 장난감·훈련용품',
    'sports_outdoor': '홈트 소도구 · 캠핑 조리도구 · 휴대용 텀블러 · 운동 보호대'
  };

  function updateQuotaPreview(){
    const provider=$('discovery-provider')?.value||'youtube';
    const country=$('discovery-country')?.value||'ALL';
    const mode=$('discovery-mode')?.value||'shopping';
    const category=$('discovery-category')?.value||'living_kitchen';
    const q=$('discovery-query')?.value?.trim()||'';
    const limit=parseInt($('discovery-limit')?.value||'30',10);
    const range=$('discovery-published-range')?.value||'90d';
    const minViews=$('discovery-min-views')?.value||'0';
    const intent=$('discovery-intent')?.value||'all';
    const vType=$('discovery-type')?.value||'all';
    const license=$('discovery-license')?.value||'all';

    const rangeText={'7d':'최근 7일','30d':'최근 30일','90d':'최근 90일','1y':'최근 1년','all':'전체 기간','custom':'직접 기간'}[range]||range;
    const providerLabel={'youtube':'YouTube API','serpapi':'SerpAPI','gemini_search':'Gemini 검색','antigravity_search':'Antigravity CLI'}[provider]||provider;
    const countryLabel={'ALL':'전체 국가','KR':'한국(KR)','US':'미국(US)','JP':'일본(JP)','GB':'영국(GB)','TW':'대만(TW)','VN':'베트남(VN)'}[country]||country;
    const typeLabel={'all':'','shopping_shorts':'쇼핑 쇼츠만','shorts':'3분 이하 숏폼','long':'롱폼','unconfirmed':'형식 미확인'}[vType]||'';
    const intentLabel={'all':'','scene':'시연·작동 중심','hook':'후킹·리뷰 중심','reusable':'CC 재사용 후보'}[intent]||'';
    const licenseLabel={'all':'','creative_common':'CC 라이선스','standard':'표준 라이선스','unconfirmed':'라이선스 미확인'}[license]||'';
    const viewsLabel=minViews==='0'?'':(minViews==='custom'?`조회수 ${$('discovery-custom-views-input')?.value||0}회+`:`조회수 ${Number(minViews).toLocaleString()}회+`);

    const isHashtagQuery=/^#|^https?:\/\/(?:www\.|m\.)?youtube\.com\/hashtag\//i.test(q);
    const activeParts=[
      activeDiscoveryChannelName?`채널: ${activeDiscoveryChannelName}`:'',
      (mode==='hashtag'||isHashtagQuery)?'YouTube 해시태그 피드':providerLabel,
      countryLabel,
      rangeText,
      `목표 ${limit}개`,
      viewsLabel,
      typeLabel,
      intentLabel,
      licenseLabel
    ].filter(Boolean);

    const activeSummaryEl=$('discovery-active-filters-summary');
    if(activeSummaryEl)activeSummaryEl.textContent=activeParts.join(' · ');

    const preview=$('discovery-quota-preview');
    const detailEl=$('discovery-plan-detail');
    if(!preview)return;

    if(mode==='hashtag'||isHashtagQuery){
      const tagDesc=q?`해시태그 [${q}]`:`카테고리 인기 해시태그 [${CATEGORY_SUBPRODUCTS[category]||'쇼핑 추천템'}]`;
      preview.textContent='쿼터 0 유닛 (무료 피드)';
      preview.className='discovery-quota-pill zero-quota';
      if(detailEl)detailEl.textContent=`검색 계획: YouTube 해시태그 Shorts 피드 직접 파싱 (${tagDesc}) · API 키 및 유료 쿼터 소모 없음 (0 유닛)`;
      return;
    }

    preview.className='discovery-quota-pill';
    if(['gemini_search','antigravity_search'].includes(provider)){
      preview.textContent=provider==='gemini_search'?'Gemini 1회 + YT 1유닛':'CLI 1회 + YT 1유닛';
      if(detailEl)detailEl.textContent=provider==='gemini_search'?'검색 계획: Gemini Google 검색 최대 1회 + YouTube 상세 확인 최대 1유닛 (SerpAPI 미사용 · 자동 재시도 없음)':'검색 계획: Antigravity CLI 세션 1회(최대 120초) + YouTube 상세 확인 최대 1유닛 (SerpAPI 미사용)';
      return;
    }
    if(provider === 'serpapi'){
      const planDesc = q ? `제품 검색 [${q}]` : `카테고리 [${CATEGORY_SUBPRODUCTS[category]||'주방·수납·조리 도구'}]`;
      const serpCalls = country === 'ALL' ? 6 : 2;
      preview.textContent=`SerpAPI 최대 ${serpCalls}회 + YT 6유닛`;
      if(detailEl)detailEl.textContent=`검색 계획: [SerpAPI] ${planDesc} (${rangeText} · 목표 ${limit}개) · 언어별 최대 2페이지(총 ${serpCalls}회) + YouTube 상세 확인 최대 6유닛`;
      return;
    }

    if(mode==='popular'){
      preview.textContent='예상 1회 · 1 유닛';
      if(detailEl)detailEl.textContent='검색 계획: [YouTube API] 선택 국가 공식 인기 순위 차트 조회 (최초 1회 요청 · 총 1 유닛)';
    }else if(mode==='shopping'){
      const planDesc = q ? `제품 검색 [${q}]` : `카테고리 [${CATEGORY_SUBPRODUCTS[category]||'주방·수납·조리 도구'}]`;
      if(country==='ALL'){
        const estimatedCalls = limit <= 30 ? 6 : (limit <= 60 ? 9 : 12);
        const estimatedQuota = estimatedCalls * 100 + estimatedCalls;
        preview.textContent=`예상 ${estimatedCalls}회 · 최대 ${estimatedQuota} 유닛`;
        if(detailEl)detailEl.textContent=`검색 계획: [YouTube API] ${planDesc} (${rangeText} · 목표 ${limit}개 · 한/영/일 다국어 교차 탐색) · 최대 ${estimatedCalls}회 요청 (최대 ${estimatedQuota} 유닛)`;
      }else{
        const estimatedCalls = limit <= 30 ? 2 : (limit <= 60 ? 3 : 4);
        const estimatedQuota = estimatedCalls * 100 + 1;
        preview.textContent=`예상 ${estimatedCalls}회 · 최대 ${estimatedQuota} 유닛`;
        if(detailEl)detailEl.textContent=`검색 계획: [YouTube API] ${planDesc} (${rangeText} · 목표 ${limit}개 · ${countryLabel}) · 최대 ${estimatedCalls}회 요청 (최대 ${estimatedQuota} 유닛)`;
      }
    }else{
      const planDesc = q ? `키워드 [${q}]` : '전체 키워드';
      const maxCalls = country === 'ALL' ? 6 : 2;
      const maxQuota = country === 'ALL' ? 603 : 201;
      preview.textContent=`예상 ${maxCalls}회 · 최대 ${maxQuota} 유닛`;
      if(detailEl)detailEl.textContent=`검색 계획: [YouTube API] ${planDesc} (${rangeText} · 목표 ${limit}개) · 최대 ${maxCalls}회 요청 (최대 ${maxQuota} 유닛)`;
    }
  }

  if($('save-youtube-key'))$('save-youtube-key').onclick=()=>act('YouTube API 키 암호화 저장 중…',async()=>{
    const key=$('youtube-api-key').value.trim();
    await api('youtube-settings',{youtube_api_key:key});
    $('youtube-api-key').value='';
    await refreshYoutubeSettings();
    if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();
  },'YouTube API 키를 암호화하여 저장했습니다.');

  if($('refresh-youtube-stats'))$('refresh-youtube-stats').onclick=refreshYoutubeSettings;
  async function refreshGeminiSearchSettings(){
    const data=await api('discovery/gemini-settings');
    if(window.populateSearchAndFallbackModels)window.populateSearchAndFallbackModels();
    const ensureOpt=(sel,val)=>{
      if(!sel||!val)return;
      if(sel.tagName==='SELECT'&&!Array.from(sel.options).some(o=>o.value===val)){
        const opt=text('option',val);opt.value=val;sel.append(opt);
      }
      sel.value=val;
    };
    ensureOpt($('gemini-search-model'),data.model);
    ensureOpt($('antigravity-search-model'),data.cli_model);
    document.dispatchEvent(new CustomEvent('ai-search-settings-loaded',{detail:{model:data.model,cli_model:data.cli_model}}));
    $('gemini-search-settings-status').textContent=`API 키 ${data.api_configured?'•••••••• (암호화 저장됨)':'미등록'} · Antigravity CLI ${data.cli_installed?'설치 확인됨':'미설치'}`;
  }
  if($('save-gemini-search-settings'))$('save-gemini-search-settings').onclick=async()=>{
    try{await api('discovery/gemini-settings',{key:$('gemini-search-key').value,model:$('gemini-search-model').value,cli_model:$('antigravity-search-model').value});$('gemini-search-key').value='';await refreshGeminiSearchSettings();if(window.refreshConnectionsStatus)await window.refreshConnectionsStatus();}
    catch(error){$('gemini-search-settings-status').textContent=error.message;}
  };
  refreshGeminiSearchSettings().catch(()=>{});

  let cachedRegisteredChannels=[];
  function formatSubscribersBadge(subCount,hidden){
    if(hidden)return '구독자 비공개';
    if(subCount==null||isNaN(subCount))return '';
    const n=Number(subCount);
    if(n>=10000)return `${(n/10000).toFixed(1).replace(/\.0$/,'')}만명`;
    if(n>=1000)return `${(n/1000).toFixed(1).replace(/\.0$/,'')}천명`;
    return `${n.toLocaleString()}명`;
  }
  function renderRegisteredChannelsList(){
    const list=$('discovery-registered-channels');
    if(!list)return;
    list.replaceChildren();
    const q=($('discovery-channel-filter-input')?.value||'').trim().toLowerCase();
    const filtered=cachedRegisteredChannels.filter(ch=>{
      const name=(ch.name||ch.id||'').toLowerCase();
      return !q||name.includes(q)||String(ch.id||'').toLowerCase().includes(q);
    });
    if(activeDiscoveryChannelId){
      const clearBtn=document.createElement('button');
      clearBtn.type='button';
      clearBtn.className='channel-chip active';
      clearBtn.textContent=`전체 채널 보기 (${activeDiscoveryChannelName} 필터 해제 ×)`;
      clearBtn.onclick=()=>{
        activeDiscoveryChannelId='';
        activeDiscoveryChannelName='';
        updateQuotaPreview();
        renderRegisteredChannelsList();
        discoveryArchiveMode=true;
        refreshDiscovery(false);
      };
      list.append(clearBtn);
    }
    if(!filtered.length){
      const empty=text('span',cachedRegisteredChannels.length?'검색어와 일치하는 채널이 없습니다.':'아직 등록된 채널이 없습니다. 영상을 탐색하면 채널이 자동 등록됩니다.');
      empty.className='hint';
      list.append(empty);
      return;
    }
    for(const channel of filtered){
      const chip=document.createElement('div');
      const isActive=activeDiscoveryChannelId===channel.id;
      chip.className='channel-chip'+(isActive?' active':'');

      const selectBtn=document.createElement('button');
      selectBtn.type='button';
      selectBtn.className='channel-chip-main';
      selectBtn.title=`클릭하여 [${channel.name||channel.id}] 채널의 누적 영상만 모아보기`;
      const nameSpan=text('span',channel.name||channel.id);
      nameSpan.className='channel-chip-name';
      selectBtn.append(nameSpan);
      const subLabel=formatSubscribersBadge(channel.subscribers,channel.hidden);
      if(subLabel){
        const subSpan=text('span',subLabel);
        subSpan.className='channel-chip-sub';
        selectBtn.append(subSpan);
      }
      selectBtn.onclick=()=>{
        if(activeDiscoveryChannelId===channel.id){
          activeDiscoveryChannelId='';
          activeDiscoveryChannelName='';
        }else{
          activeDiscoveryChannelId=channel.id;
          activeDiscoveryChannelName=channel.name||channel.id;
        }
        updateQuotaPreview();
        renderRegisteredChannelsList();
        discoveryArchiveMode=true;
        refreshDiscovery(false);
      };

      const extLink=document.createElement('a');
      extLink.href='https://www.youtube.com/channel/'+encodeURIComponent(channel.id)+'/shorts';
      extLink.target='_blank';
      extLink.rel='noopener';
      extLink.className='channel-chip-ext';
      extLink.title='YouTube 채널 Shorts 탭 열기 (새 창)';
      extLink.textContent='↗';

      const delBtn=document.createElement('button');
      delBtn.type='button';
      delBtn.className='channel-chip-del';
      delBtn.title='등록 채널 목록에서 제외';
      delBtn.textContent='×';
      delBtn.onclick=async(ev)=>{
        ev.stopPropagation();
        try{
          const data=await api('discovery/channels/delete',{channel_id:channel.id});
          if(activeDiscoveryChannelId===channel.id){
            activeDiscoveryChannelId='';
            activeDiscoveryChannelName='';
            updateQuotaPreview();
          }
          applyCatalogueSummaryData(data);
          message(`[${channel.name||channel.id}] 채널을 관리 목록에서 제외했습니다.`);
        }catch(err){
          message(err.message,true);
        }
      };

      chip.append(selectBtn,extLink,delBtn);
      list.append(chip);
    }
  }
  function applyCatalogueSummaryData(data){
    if(!data)return;
    if($('discovery-catalogue-summary')){
      $('discovery-catalogue-summary').textContent=`누적 ${data.videos||0}개 · 채널 ${data.channels||0}개 · 미열람 ${data.unseen||0}개`;
    }
    cachedRegisteredChannels=Array.isArray(data.registered_channels)?data.registered_channels:[];
    const chBtn=$('btn-toggle-channel-drawer');
    const chDrawer=$('discovery-channel-drawer');
    if(chBtn){
      const isOpen=chDrawer&&!chDrawer.hidden;
      chBtn.textContent=`채널 관리 (${cachedRegisteredChannels.length}) ${isOpen?'▴':'▾'}`;
    }
    renderRegisteredChannelsList();
  }
  async function refreshCatalogueSummary(){
    const data=await api('discovery/catalogue');
    applyCatalogueSummaryData(data);
  }
  if($('discovery-channel-filter-input'))$('discovery-channel-filter-input').oninput=renderRegisteredChannelsList;
  if($('discovery-archive-btn'))$('discovery-archive-btn').onclick=()=>{activeDiscoveryChannelId='';activeDiscoveryChannelName='';updateQuotaPreview();renderRegisteredChannelsList();discoveryArchiveMode=true;refreshDiscovery(false);};
  if($('discovery-unseen'))$('discovery-unseen').onchange=()=>{discoveryArchiveMode=true;refreshDiscovery(false);};
  if($('discovery-subscribers-refresh'))$('discovery-subscribers-refresh').onclick=async()=>{
    const button=$('discovery-subscribers-refresh');button.disabled=true;
    try{const data=await api('discovery/subscribers/refresh',{});discoveryArchiveMode=true;await refreshDiscovery(false);await refreshCatalogueSummary();$('discovery-status-banner').textContent+=` · 구독자 ${data.checked_channels}채널 확인 · YouTube ${data.youtube_requests}회 · SerpAPI 0회`;}
    catch(error){$('discovery-status-banner').textContent=error.message;}
    finally{button.disabled=false;}
  };
  if($('discovery-channel-shorts-refresh'))$('discovery-channel-shorts-refresh').onclick=async()=>{
    const button=$('discovery-channel-shorts-refresh');button.disabled=true;button.textContent='채널 숏폼 확인 중…';
    try{
      const data=await api('discovery/channels/shorts/refresh',{});
      discoveryArchiveMode=true;
      $('discovery-type').value='shorts';$('discovery-sort-by').value='views';
      $('discovery-published-range').value='all';$('discovery-unseen').checked=false;
      await refreshDiscovery(false);
      $('discovery-status-banner').textContent+=` · 채널 ${data.checked_channels}/${data.registered_channels}개 확인 · 숏폼 후보 ${data.matched}개 · 신규 저장 ${data.added}개 · YouTube ${data.youtube_requests}유닛 · SerpAPI 0회 · ${data.scope}`;
    }catch(error){$('discovery-status-banner').textContent=error.message;}
    finally{button.disabled=false;button.textContent='채널 숏폼 수집 (조회수 순)';await refreshCatalogueSummary();}
  };
  if($('discovery-channel-refresh'))$('discovery-channel-refresh').onclick=async()=>{
    const button=$('discovery-channel-refresh');button.disabled=true;
    try{const data=await api('discovery/channels/refresh',{});discoveryArchiveMode=true;await refreshDiscovery(false);$('discovery-status-banner').textContent+=` · 채널 ${data.checked_channels}개 확인 · 신규 ${data.added}개 · YouTube ${data.youtube_requests}회 · SerpAPI 0회`;}
    catch(error){$('discovery-status-banner').textContent=error.message;}
    finally{button.disabled=false;await refreshCatalogueSummary();}
  };
  refreshCatalogueSummary().catch(()=>{});
  if($('reload-discovery'))$('reload-discovery').onclick=()=>{discoveryArchiveMode=true;refreshDiscovery(false);};
  if($('discovery-fetch-btn'))$('discovery-fetch-btn').onclick=()=>{activeDiscoveryChannelId='';activeDiscoveryChannelName='';updateQuotaPreview();renderRegisteredChannelsList();discoveryArchiveMode=false;refreshDiscovery(true, false);};
  if($('discovery-more-btn'))$('discovery-more-btn').onclick=()=>refreshDiscovery(false, true);

  if($('discovery-provider'))$('discovery-provider').onchange=()=>{
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-country'))$('discovery-country').onchange=()=>{
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-mode'))$('discovery-mode').onchange=()=>{
    const mode=$('discovery-mode').value;
    const catGroup=$('group-discovery-category');
    if(catGroup)catGroup.style.display=(mode==='shopping'||mode==='hashtag')?'flex':'none';
    if(mode==='hashtag'&&$('discovery-hashtag-drawer')){
      $('discovery-hashtag-drawer').hidden=false;
      if($('btn-toggle-hashtag-drawer'))$('btn-toggle-hashtag-drawer').textContent='인기 해시태그 48개 ▴';
    }
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-category'))$('discovery-category').onchange=()=>{
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-query'))$('discovery-query').oninput=updateQuotaPreview;
  if($('discovery-published-range'))$('discovery-published-range').onchange=()=>{
    const r=$('discovery-published-range').value;
    const cGroup=$('group-discovery-custom-dates');
    if(cGroup)cGroup.style.display=(r==='custom')?'flex':'none';
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-published-after'))$('discovery-published-after').onchange=()=>refreshDiscovery(false);
  if($('discovery-published-before'))$('discovery-published-before').onchange=()=>refreshDiscovery(false);

  if($('discovery-min-views'))$('discovery-min-views').onchange=()=>{
    const v=$('discovery-min-views').value;
    const vGroup=$('group-discovery-custom-views');
    if(vGroup)vGroup.style.display=(v==='custom')?'flex':'none';
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-custom-views-input'))$('discovery-custom-views-input').onchange=()=>{updateQuotaPreview();refreshDiscovery(false);};
  if($('discovery-sort-by'))$('discovery-sort-by').onchange=()=>refreshDiscovery(false);
  if($('discovery-limit'))$('discovery-limit').onchange=()=>{
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-intent'))$('discovery-intent').onchange=()=>{updateQuotaPreview();refreshDiscovery(false);};
  if($('discovery-type'))$('discovery-type').onchange=()=>{updateQuotaPreview();refreshDiscovery(false);};
  if($('discovery-license'))$('discovery-license').onchange=()=>{updateQuotaPreview();refreshDiscovery(false);};
  if($('btn-reset-discovery-filters'))$('btn-reset-discovery-filters').onclick=()=>{
    activeDiscoveryChannelId='';
    activeDiscoveryChannelName='';
    if($('discovery-provider'))$('discovery-provider').value='youtube';
    if($('discovery-country'))$('discovery-country').value='ALL';
    if($('discovery-limit'))$('discovery-limit').value='30';
    if($('discovery-published-range'))$('discovery-published-range').value='90d';
    if($('group-discovery-custom-dates'))$('group-discovery-custom-dates').style.display='none';
    if($('discovery-min-views'))$('discovery-min-views').value='0';
    if($('group-discovery-custom-views'))$('group-discovery-custom-views').style.display='none';
    if($('discovery-intent'))$('discovery-intent').value='all';
    if($('discovery-type'))$('discovery-type').value='all';
    if($('discovery-license'))$('discovery-license').value='all';
    renderRegisteredChannelsList();
    updateQuotaPreview();
    refreshDiscovery(false);
    message('상세 검색 필터를 기본값으로 초기화했습니다.');
  };
  if($('discovery-query'))$('discovery-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();refreshDiscovery(true);}};

  document.querySelectorAll('input[name="discovery-view-mode"]').forEach(radio=>{
    radio.onchange=()=>{
      const isCompact = radio.value !== 'detail';
      const grid = $('discovery-grid');
      if(grid){
        grid.className = 'cards-grid discovery-grid ' + (isCompact ? 'view-compact' : 'view-detail');
      }
      renderDiscoveryList(currentDiscoveryItems, $('discovery-country')?.value||'ALL', $('discovery-category')?.value||'living_kitchen');
    };
  });

  if($('select-all-discovery'))$('select-all-discovery').onchange=e=>{
    const checked=Boolean(e.target.checked);
    checkedDiscoveryUrls.clear();
    if(checked)for(const item of currentDiscoveryItems)checkedDiscoveryUrls.add(item.url);
    document.querySelectorAll('#discovery-grid .discovery-card').forEach(card=>{
      const cb=card.querySelector('.discovery-select-checkbox');
      if(cb)cb.checked=checked;
      card.classList.toggle('checked',checked);
    });
    updateDiscoverySelectionUi();
  };

  async function batchCollectDiscovery(saveToLibrary){
    const selectedItems=currentDiscoveryItems.filter(item=>checkedDiscoveryUrls.has(item.url));
    if(!selectedItems.length)return;
    const country=$('discovery-country')?.value||'ALL';
    const category=$('discovery-category')?.value||'living_kitchen';
    await act(saveToLibrary?'선택한 영상을 보관함에 저장하는 중…':'선택한 영상을 수집함에 담는 중…',async()=>{
      const importedIds=[];
      let addedCount=0;
      for(const item of selectedItems){
        const refPayload=buildDiscoveryReferencePayload(item, country, category);
        const res=await api('references/import',{reference:refPayload});
        if(res?.reference_id)importedIds.push(res.reference_id);
        if(!res?.already_saved)addedCount++;
      }
      if(saveToLibrary&&importedIds.length){
        await api('references/save',{ids:importedIds});
      }
      document.querySelectorAll('#discovery-grid .discovery-card').forEach(card=>{
        if(checkedDiscoveryUrls.has(card.dataset.url)){
          const btn=card.querySelector('.btn-save-ref');
          if(btn)btn.textContent='보관함 담김';
          const cb=card.querySelector('.discovery-select-checkbox');
          if(cb)cb.checked=false;
          card.classList.remove('checked');
        }
      });
      checkedDiscoveryUrls.clear();
      updateDiscoverySelectionUi();
      if(typeof refreshReferences==='function')await refreshReferences();
      message(saveToLibrary?`선택한 영상 ${selectedItems.length}개를 수집함 및 보관함에 저장했습니다.`:`선택한 영상 ${selectedItems.length}개를 수집한 레퍼런스에 담았습니다.`);
    });
  }

  if($('collect-selected-discovery'))$('collect-selected-discovery').onclick=()=>batchCollectDiscovery(false);
  if($('save-selected-discovery'))$('save-selected-discovery').onclick=()=>batchCollectDiscovery(true);

  let popularShoppingHashtags=[
    {tag:'신박한아이템',videos_display:'1.5만개',channels_display:'1.5천개',stats_text:'동영상 1.5만개 • 채널 1.5천개',category:'digital_appliances',url:'https://www.youtube.com/hashtag/%EC%8B%A0%EB%B0%95%ED%95%9C%EC%95%84%EC%9D%B4%ED%85%9C/shorts'},
    {tag:'다이소추천템',videos_display:'1.4만개',channels_display:'3.4천개',stats_text:'동영상 1.4만개 • 채널 3.4천개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EB%8B%A4%EC%9D%B4%EC%86%8C%EC%B6%94%EC%B2%9C%ED%85%9C/shorts'},
    {tag:'올리브영추천템',videos_display:'1.3만개',channels_display:'5.2천개',stats_text:'동영상 1.3만개 • 채널 5.2천개',category:'beauty',url:'https://www.youtube.com/hashtag/%EC%98%AC%EB%A6%AC%EB%B8%8C%EC%98%81%EC%B6%94%EC%B2%9C%ED%85%9C/shorts'},
    {tag:'쿠팡추천템',videos_display:'9.9천개',channels_display:'2.7천개',stats_text:'동영상 9.9천개 • 채널 2.7천개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EC%BF%A0%ED%8C%A1%EC%B6%94%EC%B2%9C%ED%85%9C/shorts'},
    {tag:'쿠팡꿀템',videos_display:'9.7천개',channels_display:'2.4천개',stats_text:'동영상 9.7천개 • 채널 2.4천개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EC%BF%A0%ED%8C%A1%EA%BF%80%ED%85%9C/shorts'},
    {tag:'내돈내산',videos_display:'18만개',channels_display:'6.6만개',stats_text:'동영상 18만개 • 채널 6.6만개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EB%82%B4%EB%8F%88%EB%82%B4%EC%82%B0/shorts'},
    {tag:'제품리뷰',videos_display:'5.5만개',channels_display:'1.6만개',stats_text:'동영상 5.5만개 • 채널 1.6만개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EC%A0%9C%ED%92%88%EB%A6%AC%EB%B7%B0/shorts'},
    {tag:'살림템',videos_display:'9.3천개',channels_display:'2.1천개',stats_text:'동영상 9.3천개 • 채널 2.1천개',category:'living_kitchen',url:'https://www.youtube.com/hashtag/%EC%82%B4%EB%A6%BC%ED%85%9C/shorts'},
    {tag:'육아템',videos_display:'8.5천개',channels_display:'2.8천개',stats_text:'동영상 8.5천개 • 채널 2.8천개',category:'beauty',url:'https://www.youtube.com/hashtag/%EC%9C%A1%EC%95%84%ED%85%9C/shorts'},
    {tag:'꿀템추천',videos_display:'8.2천개',channels_display:'2.5천개',stats_text:'동영상 8.2천개 • 채널 2.5천개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EA%BF%80%ED%85%9C%EC%B6%94%EC%B2%9C/shorts'},
    {tag:'캠핑용품',videos_display:'8.1천개',channels_display:'2.5천개',stats_text:'동영상 8.1천개 • 채널 2.5천개',category:'digital_appliances',url:'https://www.youtube.com/hashtag/%EC%BA%A0%ED%95%91%EC%9A%A9%ED%92%88/shorts'},
    {tag:'다이소꿀템',videos_display:'7.9천개',channels_display:'2.2천개',stats_text:'동영상 7.9천개 • 채널 2.2천개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EB%8B%A4%EC%9D%B4%EC%86%8C%EA%BF%80%ED%85%9C/shorts'},
    {tag:'가성비템',videos_display:'5.5천개',channels_display:'1.8천개',stats_text:'동영상 5.5천개 • 채널 1.8천개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EA%B0%80%EC%84%B1%EB%B9%84%ED%85%9C/shorts'},
    {tag:'주방용품',videos_display:'5.2천개',channels_display:'1.5천개',stats_text:'동영상 5.2천개 • 채널 1.5천개',category:'living_kitchen',url:'https://www.youtube.com/hashtag/%EC%A3%BC%EB%B0%A9%EC%9A%A9%ED%92%88/shorts'},
    {tag:'아이디어상품',videos_display:'4.3천개',channels_display:'1.1천개',stats_text:'동영상 4.3천개 • 채널 1.1천개',category:'living_kitchen',url:'https://www.youtube.com/hashtag/%EC%95%84%EC%9D%B4%EB%94%94%EC%96%B4%EC%83%81%ED%92%88/shorts'},
    {tag:'아마존추천템',videos_display:'2.9천개',channels_display:'164개',stats_text:'동영상 2.9천개 • 채널 164개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EC%95%84%EB%A7%88%EC%A1%B4%EC%B6%94%EC%B2%9C%ED%85%9C/shorts'},
    {tag:'아마존제품',videos_display:'2.4천개',channels_display:'45개',stats_text:'동영상 2.4천개 • 채널 45개',category:'platform_haul',url:'https://www.youtube.com/hashtag/%EC%95%84%EB%A7%88%EC%A1%B4%EC%A0%9C%ED%92%88/shorts'},
    {tag:'amazonfinds',videos_display:'168만개',channels_display:'15만개',stats_text:'동영상 168만개 • 채널 15만개',category:'global',url:'https://www.youtube.com/hashtag/amazonfinds/shorts'},
    {tag:'gadgets',videos_display:'311만개',channels_display:'45만개',stats_text:'동영상 311만개 • 채널 45만개',category:'global',url:'https://www.youtube.com/hashtag/gadgets/shorts'}
  ];

  const CUSTOM_HASHTAGS_STORAGE_KEY='takoh-custom-discovery-hashtags-v1';
  function loadCustomDiscoveryHashtags(){
    try{
      const raw=localStorage.getItem(CUSTOM_HASHTAGS_STORAGE_KEY);
      const parsed=raw?JSON.parse(raw):[];
      return Array.isArray(parsed)?parsed:[];
    }catch{return [];}
  }
  function saveCustomDiscoveryHashtags(list){
    try{localStorage.setItem(CUSTOM_HASHTAGS_STORAGE_KEY,JSON.stringify(list));}catch{}
  }
  function extractCleanHashtag(raw){
    const s=(raw||'').trim();
    if(!s)return '';
    const m=s.match(/youtube\.com\/hashtag\/([^/?&#]+)/i);
    if(m){
      try{return decodeURIComponent(m[1]).replace(/^#+/,'').trim();}catch{return m[1].replace(/^#+/,'').trim();}
    }
    return s.replace(/^#+/,'').trim();
  }
  function matchesDiscoveryHashtagFilter(item,filterCat){
    if(!filterCat||filterCat==='all')return true;
    if(filterCat==='custom')return Boolean(item.custom);
    const c=item.category||'';
    if(filterCat==='platform_haul')return c==='platform_haul';
    if(filterCat==='living_kitchen')return c==='living_kitchen';
    if(filterCat==='cleaning_storage')return ['cleaning_storage','bathroom','furniture_interior'].includes(c);
    if(filterCat==='digital_appliances')return ['digital_appliances','automotive','office','sports_outdoor'].includes(c);
    if(filterCat==='beauty')return ['beauty','fashion_goods','parenting','pets'].includes(c);
    if(filterCat==='global')return c==='global';
    return true;
  }
  function triggerHashtagDiscoverySearch(tagOrQuery){
    const clean=extractCleanHashtag(tagOrQuery);
    if(!clean)return;
    if($('discovery-mode'))$('discovery-mode').value='hashtag';
    const catGroup=$('group-discovery-category');
    if(catGroup)catGroup.style.display='flex';
    if($('discovery-query'))$('discovery-query').value='#'+clean;
    discoveryArchiveMode=false;
    updateQuotaPreview();
    renderDiscoveryHashtagQuickbar();
    refreshDiscovery(true,false);
  }
  function renderDiscoveryHashtagQuickbar(){
    const box=$('discovery-hashtag-chips');
    if(!box)return;
    box.replaceChildren();
    const filterCat=$('discovery-hashtag-category')?.value||'all';
    const customList=loadCustomDiscoveryHashtags().map(tag=>({
      tag,
      videos_display:'직접 추가',
      channels_display:'내 태그',
      stats_text:'내가 직접 추가한 해시태그 Shorts',
      category:'custom',
      custom:true,
      url:`https://www.youtube.com/hashtag/${encodeURIComponent(tag)}/shorts`
    }));
    const builtinMap=new Set(customList.map(x=>x.tag));
    const combined=[...customList,...popularShoppingHashtags.filter(x=>!builtinMap.has(x.tag))];
    const filtered=combined.filter(item=>matchesDiscoveryHashtagFilter(item,filterCat));
    const currentQueryTag=extractCleanHashtag($('discovery-query')?.value||'');

    for(const item of filtered){
      const btn=document.createElement('button');
      btn.type='button';
      const isActive=currentQueryTag&&currentQueryTag.toLowerCase()===item.tag.toLowerCase();
      btn.className='hashtag-chip'+(isActive?' active':'');
      btn.title=`${item.url}\n${item.stats_text||''} (클릭하면 즉시 Shorts 탐색)`;
      const tSpan=text('span','#'+item.tag);tSpan.className='hashtag-chip-name';
      const cSpan=text('span',item.custom?'내 해시태그':`${item.videos_display} · 채널 ${item.channels_display}`);
      cSpan.className='hashtag-chip-count';
      btn.append(tSpan,cSpan);
      if(item.custom){
        const delSpan=text('span',' ×');
        delSpan.style.marginLeft='4px';
        delSpan.style.fontWeight='700';
        delSpan.title='내 해시태그 삭제';
        delSpan.onclick=(ev)=>{
          ev.stopPropagation();
          const next=loadCustomDiscoveryHashtags().filter(t=>t!==item.tag);
          saveCustomDiscoveryHashtags(next);
          renderDiscoveryHashtagQuickbar();
          message(`#${item.tag} 해시태그 칩을 삭제했습니다.`);
        };
        btn.append(delSpan);
      }
      btn.onclick=()=>triggerHashtagDiscoverySearch(item.tag);
      box.append(btn);
    }
  }
  async function initDiscoveryShoppingHashtags(){
    renderDiscoveryHashtagQuickbar();
    try{
      const res=await api('references/hashtags');
      if(Array.isArray(res?.hashtags)&&res.hashtags.length){
        popularShoppingHashtags=res.hashtags;
        renderDiscoveryHashtagQuickbar();
      }
    }catch{}
  }
  function toggleDiscoveryDrawer(targetDrawerId){
    const drawers=[
      {id:'discovery-advanced-drawer',btnId:'btn-toggle-adv-filters',label:()=>'상세 조건'},
      {id:'discovery-hashtag-drawer',btnId:'btn-toggle-hashtag-drawer',label:()=>'인기 해시태그 48개'},
      {id:'discovery-channel-drawer',btnId:'btn-toggle-channel-drawer',label:()=>`채널 관리 (${cachedRegisteredChannels.length})`}
    ];
    const targetDrawer=$(targetDrawerId);
    const willOpen=targetDrawer?targetDrawer.hidden:false;
    for(const d of drawers){
      const el=$(d.id);
      const btn=$(d.btnId);
      if(!el||!btn)continue;
      const open=(d.id===targetDrawerId)&&willOpen;
      el.hidden=!open;
      btn.setAttribute('aria-expanded',String(open));
      btn.textContent=`${d.label()} ${open?'▴':'▾'}`;
    }
  }
  if($('btn-toggle-adv-filters'))$('btn-toggle-adv-filters').onclick=()=>toggleDiscoveryDrawer('discovery-advanced-drawer');
  if($('btn-toggle-hashtag-drawer'))$('btn-toggle-hashtag-drawer').onclick=()=>toggleDiscoveryDrawer('discovery-hashtag-drawer');
  if($('btn-toggle-channel-drawer'))$('btn-toggle-channel-drawer').onclick=()=>toggleDiscoveryDrawer('discovery-channel-drawer');
  if($('discovery-hashtag-category'))$('discovery-hashtag-category').onchange=renderDiscoveryHashtagQuickbar;
  if($('btn-add-custom-hashtag'))$('btn-add-custom-hashtag').onclick=()=>{
    const raw=$('discovery-hashtag-custom-input')?.value?.trim()||'';
    const tags=raw.split(/[,;\n]+/).map(extractCleanHashtag).filter(Boolean);
    if(!tags.length){
      message('추가할 해시태그나 유튜브 해시태그 Shorts URL을 입력해 주세요.',true);
      return;
    }
    const existing=loadCustomDiscoveryHashtags();
    for(const t of tags){
      if(!existing.includes(t))existing.unshift(t);
    }
    saveCustomDiscoveryHashtags(existing);
    if($('discovery-hashtag-custom-input'))$('discovery-hashtag-custom-input').value='';
    renderDiscoveryHashtagQuickbar();
    triggerHashtagDiscoverySearch(tags[0]);
    message(`내 해시태그 칩(${tags.map(t=>'#'+t).join(', ')})을 저장하고 조회를 시작합니다.`);
  };
  if($('btn-search-hashtag-now'))$('btn-search-hashtag-now').onclick=()=>{
    const raw=$('discovery-hashtag-custom-input')?.value?.trim()||$('discovery-query')?.value?.trim()||'';
    const firstTag=raw.split(/[,;\n]+/).map(extractCleanHashtag).filter(Boolean)[0];
    if(!firstTag){
      message('조회할 해시태그 칩을 클릭하거나 입력창에 해시태그/URL을 입력해 주세요.',true);
      return;
    }
    triggerHashtagDiscoverySearch(firstTag);
  };
  if($('discovery-hashtag-custom-input'))$('discovery-hashtag-custom-input').addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){
      ev.preventDefault();
      $('btn-search-hashtag-now')?.click();
    }
  });
  initDiscoveryShoppingHashtags();

  updateQuotaPreview();




  async function refreshUsage(){try{const result=await api('usage');$('usage-note').textContent=result.scope+' · '+result.note;$('ai-usage').replaceChildren();if(!result.groups?.length){$('ai-usage').append(text('p','아직 기록된 AI 요청이 없습니다.'));return;}const table=document.createElement('table');table.className='usage-table';const header=document.createElement('tr');for(const label of ['연결 / 모델','시도 / 반환 / 오류','입력 토큰','출력 토큰','전체 토큰','토큰 기록'])header.append(text('th',label));table.append(header);for(const group of result.groups){const row=document.createElement('tr');const known=group.reported_calls>0;for(const value of [group.provider+' / '+group.model,`${group.calls} / ${group.successful} / ${group.failed}`,group.token_available?.input_tokens?group.input_tokens.toLocaleString():'미제공',group.token_available?.output_tokens?group.output_tokens.toLocaleString():'미제공',group.token_available?.total_tokens?group.total_tokens.toLocaleString():'미제공',`${group.reported_calls}/${group.calls}회`])row.append(text('td',String(value)));table.append(row);}$('ai-usage').append(table);}catch(error){$('usage-note').textContent=error.message;}}
  $('reload-usage').onclick=refreshUsage;
  document.querySelectorAll('[data-workspace]').forEach(button=>{button.onclick=()=>{selectWorkspace(button.dataset.workspace);if(button.dataset.productionStage)selectStage(button.dataset.productionStage);};});document.querySelector('.workspace-tabs')?.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('.workspace-tabs [role=tab]:not([hidden])')];const i=tabs.indexOf(document.activeElement);if(i<0)return;event.preventDefault();const n=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[n].focus();tabs[n].click();});
  async function importFile(downloadId, local){
    await act('다운로드한 실제 파일을 불러오는 중…',async()=>{
      const file=local||await bridge('download-file',downloadId);
      job=await api('imports',file);render();await refreshJobs();selectWorkspace('create');selectStage('analysis');
      $('create-workspace').scrollIntoView({behavior:'smooth',block:'start'});
    },'파일과 원본 주소를 연결했습니다. 원본 분석을 시작할 수 있습니다.');
  }
  let refreshing=false,refreshAgain=false,downloadFolder='';
  $('download-folder-form').onsubmit=async event=>{
    event.preventDefault();
    const button=$('apply-download-folder');button.disabled=true;
    try{
      const settings=await api('downloads/folder',{path:$('download-folder-path').value});
      downloadFolder=settings.path;$('download-folder-path').value=downloadFolder;
      await refreshDownloads();message('최근 저장 파일 폴더를 적용했습니다.');
    }catch(error){message(error.message,true);}finally{button.disabled=false;}
  };
  function appendDownload(item,local){
    const tile=document.createElement('button');tile.type='button';tile.className='download-thumbnail-tile';
    tile.title=item.name+' · 클릭하여 콘텐츠 만들기';
    tile.setAttribute('aria-label',item.name+' · 이 파일로 콘텐츠 만들기');
    tile.onclick=()=>importFile(item.downloadId,local?item:null);
    const fallback=document.createElement('span');fallback.className='download-thumbnail-fallback';
    fallback.append(text('span','미리보기 없음'),text('span',item.name));
    fallback.hidden=Boolean(item.thumbnail_url);
    if(item.thumbnail_url){
      const img=document.createElement('img');img.src=item.thumbnail_url;img.alt=item.name;img.className='download-thumbnail-image';img.loading='lazy';
      img.onerror=()=>{img.hidden=true;fallback.hidden=false;};
      tile.append(img);
    }
    const badge=text('span',item.type==='image'?'이미지':' 영상');badge.className='download-thumbnail-badge';badge.setAttribute('aria-hidden','true');
    tile.append(fallback,badge);$('download-files').append(tile);
  }
  async function refreshDownloads(){
    if(refreshing){refreshAgain=true;return;}refreshing=true;
    $('download-files').replaceChildren();
    try{
      // Folder listing works even without an injected extension or legacy Chrome IDs.
      const chromeResult=bridge('downloads-list').then(items=>({items}),error=>({error}));
      const settings=await api('downloads/folder').catch(()=>null);
      if(settings?.path){downloadFolder=settings.path;if(document.activeElement!==$('download-folder-path'))$('download-folder-path').value=downloadFolder;}
      const local=await api('downloads').catch(()=>[]);
      const localItems=Array.isArray(local)?local:[];
      for(const item of localItems)appendDownload(item,true);
      $('download-connection').textContent='다운로드 폴더의 저장 파일 · '+connectionName+' 연결 확인 중…';
      const result=await chromeResult;
      if(!result.error){$('download-files').replaceChildren();
        const fileKey=item=>String(item.path||'').replace(/\\/g,'/').toLowerCase();
        const used=new Set();
        const folderKey=String(downloadFolder).replace(/\\/g,'/').replace(/\/$/,'').toLowerCase();
        for(const item of result.items){
          const key=fileKey(item),match=key?localItems.find(x=>fileKey(x)===key):null;
          if(folderKey&&!key.startsWith(folderKey+'/'))continue;
          if(match)used.add(key);
          const thumbnail_url=match?.thumbnail_url||(item.path?'/studio/downloads/thumbnail?path='+encodeURIComponent(item.path):'');
          appendDownload({...item,thumbnail_url},false);
        }
        for(const item of localItems)if(!used.has(fileKey(item)))appendDownload(item,true);
        $('download-connection').textContent=connectionName+' 연결됨 · 지정 폴더의 저장 파일';
      }else $('download-connection').textContent='다운로드 폴더의 파일을 표시합니다. 확장 수집함 연결: '+result.error.message;
      if(!$('download-files').children.length)$('download-files').append(text('p','저장 파일이 없습니다. 다른 폴더의 파일은 직접 선택하세요.'));
    }catch(error){$('download-connection').textContent=error.message;}finally{refreshing=false;if(refreshAgain){refreshAgain=false;refreshDownloads();}}
  }
  let syncing=false;
  async function syncCollections(){if(syncing)return;syncing=true;try{
    const refs=await bridge('references-list');const existing=await api('references');
    for(const ref of refs){const old=(Array.isArray(existing)?existing:[]).find(x=>x.permalink===ref.permalink);
      if(!old||old.text!==ref.text||JSON.stringify(old.imageUrls)!==JSON.stringify(ref.imageUrls)||JSON.stringify(old.videoUrls)!==JSON.stringify(ref.videoUrls)||old.thumbnailUrl!==ref.thumbnailUrl||old.poster!==ref.poster)await api('references/import',{reference:ref,automatic:true});}
    await refreshReferences();$('collected-files').replaceChildren();
    for(const ref of refs){
      const row=document.createElement('div');row.className='download-file-row';
      const left=document.createElement('div');left.style.display='flex';left.style.alignItems='center';left.style.gap='14px';left.style.minWidth='0';
      const thumbSrc=ref.poster||ref.thumbnailUrl||ref.imageUrls?.[0];
      if(thumbSrc){
        const img=document.createElement('img');img.src=thumbSrc;img.alt=ref.username||'레퍼런스';img.className='download-thumb';img.loading='lazy';
        img.onerror=()=>{img.style.display='none';};
        left.append(img);
      }
      const info=document.createElement('div');info.style.minWidth='0';
      info.append(text('h3',ref.username?'@'+ref.username:'수집한 게시물'),text('p',ref.text?.slice(0,200)||ref.permalink));
      left.append(info);
      const button=text('button','이 콘텐츠로 제작 →');button.onclick=async()=>{selectedReference=ref;selectWorkspace('reference');$('source').value=ref.permalink;$('fetch-url').value=ref.permalink;await refreshReferences();message('사용할 영상 또는 이미지를 선택하고 원본 준비를 눌러 주세요.');};
      row.append(left,button);$('collected-files').append(row);
    }
    $('collection-connection').textContent=`수집 ${refs.length}개 · 제작 화면과 동기화 완료`;
  }catch(error){$('collection-connection').textContent=error.message;}finally{syncing=false;}}
  $('reload-downloads').onclick=()=>{refreshDownloads();syncCollections();};
  window.addEventListener('focus',()=>{refreshDownloads();syncCollections();});
  $('choose-local-file').onclick=()=>{selectWorkspace('create');$('video-file').focus();};
  const transfer=location.hash.startsWith('#reference=');
  let saved='jobs';try{saved=localStorage.getItem('takoh-workspace')||'jobs';}catch{}
  let savedStage='analysis';try{savedStage=localStorage.getItem('takoh-active-stage')||'analysis';}catch{}
  const requested=location.hash.startsWith('#workspace=')?location.hash.slice(11):null;
  selectWorkspace(transfer||$('incoming-reference').hidden===false?'reference':requested||'jobs'===saved?requested||saved:saved);
  selectStage(savedStage);
  syncCollections();
})();

/* Native app only. Results stay local; fetching is explicit and bounded. */
(()=>{
  const host=document.getElementById('research-workspace');if(!host||document.getElementById('threads-research'))return;
  const panel=document.createElement('section');panel.id='threads-research';panel.className='threads-research';
  panel.innerHTML='<h2>Threads 동일·연관 쇼핑계정 및 영상 레퍼런스 탐색</h2><p class="hint">단순 쇼핑몰 상품 검색이 아니라, 선택한 영상과 동일·유사한 영상을 올리는 쇼핑 콘텐츠 계정들과 연관 게시물(실제 영상·이미지 미디어, 조회수, 좋아요·댓글·재게시 반응)을 정밀 추적하고 수집한 계정의 신규 콘텐츠를 매일 갱신합니다.</p><div class="research-inputs"><label>출발할 쇼핑 영상 게시물 주소<input id="research-url" type="url" placeholder="Threads 게시물 주소 또는 /share/ 공유 링크"></label><label>제품·카테고리 메모<input id="research-product" maxlength="120" placeholder="예: 틈새 청소 도구"></label></div><div class="research-actions"><button id="research-open" type="button">비로그인 관련 화면 열기</button><button id="research-capture" type="button" class="secondary">현재 목록 정밀 수집 (미디어·조회수·반응 확인)</button><button id="research-review-capture" type="button" class="secondary">원문 확인 창의 문구·작성자 댓글 검사</button><button id="research-list" type="button" class="secondary">저장 자료 보기 · 외부 호출 없음</button></div><p id="research-status" role="status">관련 화면에서 목록이 표시되면 수집하세요. 속도가 조금 걸리더라도 미디어·조회수·사용자 반응을 정밀 확인합니다.</p><div class="research-inputs"><label>보기<select id="research-filter"><option value="all">전체 후보</option><option value="commercial">광고 문구 또는 외부 링크 있음</option><option value="both">광고·경제적 이해 문구와 링크 모두 있음</option><option value="disclosure">광고·경제적 이해 문구 있음</option><option value="same">동일 제품 확인됨</option></select></label><label>콘텐츠 언어<select id="research-region"><option value="all">전체</option><option value="korean">한국어 콘텐츠</option><option value="overseas">해외 언어 콘텐츠</option><option value="unknown">언어 미확인</option></select></label><label>정렬<select id="research-sort"><option value="latest">최근 수집순</option><option value="likes">좋아요 많은 순</option><option value="replies">댓글 많은 순</option><option value="reposts">재게시 많은 순</option><option value="views">공개 조회수 많은 순</option></select></label></div><details id="research-accounts-drawer" open><summary id="research-accounts-summary">수집한 쇼핑 계정 0개 · 매일 자동 갱신</summary><div class="research-account-sync-bar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 10px;padding:10px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;"><label class="check" style="margin:0;font-size:12px;color:#f8fafc;"><input id="research-auto-daily-sync" type="checkbox" checked> <span>수집한 계정 매일 자동 갱신 (24시간 주기 신규 콘텐츠·조회수·반응 추가)</span></label><button id="research-sync-accounts-now" type="button" class="secondary btn-xs" style="margin-left:auto;">수집 계정 신규 콘텐츠 지금 일괄 갱신</button><span id="research-account-sync-status" class="hint" style="width:100%;margin:2px 0 0;font-size:11px;">수집된 쇼핑 계정 프로필을 방문해 새로 올라온 영상·이미지 게시물과 조회수·사용자 반응을 자동으로 누적합니다.</span></div><div id="research-accounts"></div></details><div id="research-results" class="research-results"></div>';
  const continuous=document.createElement('div');continuous.className='research-continuous';continuous.innerHTML='<h3>동일·연관 쇼핑계정과 게시물을 이어서 확장 탐색</h3><p class="hint">연관 쇼핑 계정 프로필에서 아직 방문하지 않은 새 게시물을 먼저 열고, 각 게시물의 실제 미디어(영상/이미지)·조회수·좋아요·댓글·재게시 수치를 정밀 수집하며 확장합니다.</p><div class="research-inputs"><label>한 번에 방문할 페이지<input id="research-max-pages" type="number" min="1" max="100" value="20"></label><label>탐색 깊이<select id="research-max-depth"><option value="3">3단계 · 좁게</option><option value="5" selected>5단계 · 기본</option><option value="8">8단계 · 넓게</option></select></label></div><details><summary>탐색 한도 설정</summary><div class="research-inputs"><label>프로필당 게시물 수<input id="research-profile-limit" type="number" min="1" max="30" value="10"></label><label>한 번에 탐색할 시간 · 분<input id="research-time-limit" type="number" min="1" max="10" value="3"></label></div></details><div class="research-actions"><button id="research-crawl-start" type="button">이 링크에서 쇼핑계정·영상 확장 탐색 시작</button><button id="research-crawl-resume" type="button" class="secondary">중단한 탐색 이어서</button><button id="research-crawl-pause" type="button" class="secondary">일시정지</button></div><p id="research-crawl-status" role="status">탐색 대기 중 · 자동 실행하지 않습니다.</p>';
  panel.querySelector('.research-inputs').after(continuous);
  const manual=document.createElement('details');manual.className='research-manual';manual.innerHTML='<summary>직접 화면 확인 · 한 페이지 수집</summary>';const oldActions=panel.querySelector('#research-open').parentElement;if(oldActions){oldActions.before(manual);manual.append(oldActions);}const tools=document.createElement('div');tools.className='research-actions';tools.innerHTML='<button id="research-mobile" type="button" class="secondary">모바일 폭으로 보기</button><button id="research-desktop" type="button" class="secondary">넓게 보기</button><button id="research-close-prompt" type="button" class="secondary">보이는 로그인 안내 X 닫기 · 1회</button>';manual.append(tools);
  const apiBox=document.createElement('details');apiBox.className='research-api-collector';apiBox.innerHTML='<summary>수집 전용 Threads API 설정 및 키워드 수집 (선택 · 업로드 미사용)</summary><div style="padding:10px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;margin-top:6px;"><p class="hint" style="margin:0 0 8px;"><strong>계정 일일 갱신에 Threads API가 필수인가요?</strong> 아닙니다. Meta 공식 Threads API는 타인 계정의 피드 전체 열람이나 타인 게시물의 공개 조회수(Views) 조회를 제한하므로, <strong>수집 계정의 일일 신규 콘텐츠·조회수·반응 갱신은 API 키 없이 내장 브라우저 정밀 수집기로 100% 작동</strong>합니다.<br>다만 본인의 <strong>Threads API 액세스 토큰(수집 전용)</strong>을 입력해 두면, 공식 <code>keyword_search</code> 엔드포인트로 키워드별 최신 쇼핑 게시물을 빠르게 보조 수집할 수 있습니다 (게시·업로드 권한은 일절 사용하지 않으며 오직 읽기 전용 수집에만 사용됩니다).</p><div class="research-inputs"><label>수집 전용 Threads API Access Token<input id="research-api-token" type="password" placeholder="THQ... (읽기·수집 전용 액세스 토큰 입력)" autocomplete="off"></label><label>API 키워드 검색어 (선택)<input id="research-api-query" type="text" maxlength="100" placeholder="예: 쿠팡 추천템, 다이소 꿀템, 청소템"></label></div><div class="research-actions"><button id="research-api-save" type="button" class="secondary">수집 전용 API 키 저장</button><button id="research-api-collect" type="button" class="secondary">API로 키워드 게시물 수집 + 브라우저 정밀 수치 보강</button><span id="research-api-status" class="hint" style="margin:0;">API 키 미설정 (내장 브라우저 수집기로 모든 기능 사용 가능)</span></div></div>';
  const library=document.createElement('div');library.className='research-library';library.innerHTML='<h3>찾은 쇼핑 계정·영상 콘텐츠</h3><p class="hint">새로운 콘텐츠는 수집 목록 안에서 중복이 발견되지 않은 미디어입니다. 같은 제품만으로 묶지 않으며, 각 카드에 미디어 미리보기·조회수·좋아요·댓글·재게시 반응이 표시됩니다.</p><div class="research-inputs"><label>콘텐츠 목록<select id="research-view"><option value="new">새로운 콘텐츠</option><option value="popular">반응 좋은 콘텐츠 · 조회수 순</option><option value="duplicates">동일·유사 영상 묶음 (쇼핑계정 비교)</option><option value="review">제품 관련성 검토</option><option value="pending">미디어·썸네일 확인 대기</option><option value="excluded">미디어 없는 글 · 제외 기록</option></select></label></div><p id="research-media-summary" role="status"></p><button id="research-audit" type="button" class="secondary">미확인 미디어·조회수·반응 정밀 재수집 · 최대 12개</button>';const languageFilters=panel.querySelector('#research-filter').closest('.research-inputs');library.append(languageFilters);const capture=document.createElement('details');capture.className='research-discovery-settings';capture.innerHTML='<summary>탐색 설정 · 직접 주소 입력 · 수집 전용 API (고급)</summary>';const startInputs=panel.querySelector('.research-inputs');capture.append(startInputs,continuous,manual,apiBox,panel.querySelector('#research-status'));panel.querySelector('h2').nextElementSibling.after(library);library.after(capture);const intro=panel.querySelector('h2').nextElementSibling;const guide=document.createElement('details');guide.className='research-guide';guide.innerHTML='<summary>사용 안내 · 수집 기준</summary>';intro.before(guide);guide.append(intro);const entry=document.createElement('div');entry.className='research-entry';entry.innerHTML='<h3>1. Threads에서 동일·연관 쇼핑계정 찾기</h3><p>마음에 드는 쇼핑 영상 게시물 하단의 <strong>동일·연관 쇼핑계정 찾기</strong> 버튼을 누르면, 동일한 영상이나 연관 쇼핑 콘텐츠를 올리는 계정들과 게시물(미디어·조회수·사용자 반응)을 정밀 수집합니다.</p><button id="research-browse" type="button">Threads 열기</button><p id="research-entry-status" role="status">게시물을 선택해 주세요.</p>';guide.after(entry);entry.append(panel.querySelector('#research-crawl-resume'),panel.querySelector('#research-crawl-pause'));const libraryHint=library.querySelector('.hint');const criteria=document.createElement('details');criteria.innerHTML='<summary>목록 구분 기준</summary>';libraryHint.before(criteria);criteria.append(libraryHint);host.append(panel);const q=id=>document.getElementById(id);let data={posts:[],accounts:[]},busy=false,polling=false;
  const native=window.takohNative;
  async function request(action,packet={}){if(!native?.request)throw Error('전용 브라우저에서 사용할 수 있습니다.');const r=await native.request({action:'studioThreadsResearch',packet:{action,...packet}});if(!r?.success)throw Error(r?.error||'연결 실패. 최신 앱으로 정상 재실행한 뒤 확인하세요.');return r.data;}
  async function run(task){if(busy)return;busy=true;for(const id of ['research-open','research-capture','research-list','research-review-capture'])q(id).disabled=true;try{await task();}catch(e){q('research-status').textContent=e.message;q('research-entry-status').textContent=e.message;}finally{busy=false;for(const id of ['research-open','research-capture','research-list','research-review-capture'])q(id).disabled=!native?.request;}}
  const text=(parent,tag,value)=>{const n=document.createElement(tag);n.textContent=value;parent.append(n);return n;};
  const link=(parent,label,url)=>{const a=text(parent,'a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';};
  const number=value=>value===null||value===undefined?'미확인':Number(value).toLocaleString('ko-KR');
  function render(){
    let posts=(data.posts||[]).map(p=>{const body=String(p.text||'').replace(/https?:\/\/\S+/g,'').replace(/\d+\s*(?:초|분|시간|일|주|개월|년)(?:\s*전)?/g,'').replace(/작성자|번역하기|더 보기|답글 보기/g,'');return {...p,content_region:/[가-힣]/.test(body)?'korean':/[A-Za-z\u3040-\u30ff\u4e00-\u9fff]/.test(body)?'overseas':'unknown'};});const view=q('research-view').value;const region=q('research-region').value;if(region!=='all')posts=posts.filter(p=>p.content_region===region);const filter=q('research-filter').value,key=q('research-sort').value;
    if(filter==='commercial')posts=posts.filter(p=>p.checks.commercial_candidate);if(filter==='both')posts=posts.filter(p=>p.checks.disclosure_observed&&p.links.length>0);if(filter==='disclosure')posts=posts.filter(p=>p.checks.disclosure_observed);if(filter==='same')posts=posts.filter(p=>p.product_match==='same');
    const summary=data.media_summary||{};q('research-media-summary').textContent='미디어·미리보기 확인 '+(summary.ready||0)+'개 · 제품 검토 '+(summary.review||0)+'개 · 확인 대기 '+(summary.pending??data.posts.length)+'개 · 미디어 없는 글 '+(summary.excluded||0)+'개 · 썸네일 비교는 영상 전체의 동일성을 확정하지 않습니다.';
    if(q('research-auto-daily-sync')&&data.account_sync){q('research-auto-daily-sync').checked=data.account_sync.auto_daily!==false;}
    if(q('research-api-status')&&data.api_collector){q('research-api-status').textContent=data.api_collector.has_token?('수집 전용 API 토큰 연결됨 ('+data.api_collector.masked_token+') · 읽기 전용'):'API 키 미설정 (내장 브라우저 수집기로 모든 기능 사용 가능)';}
    const byId=new Map(posts.map(p=>[p.id,p]));let groups=(data.media_groups||[]).map(g=>({...g,members:g.member_ids.map(id=>byId.get(id)).filter(Boolean)})).filter(g=>g.members.length);for(const g of groups){g.members.sort((a,b)=>((b.display_metrics||b.metrics).views??-1)-((a.display_metrics||a.metrics).views??-1));g.representative=g.members[0];}if(view==='pending'||view==='excluded'){posts=posts.filter(p=>(p.media_state||'pending')===view);}else{groups=groups.filter(g=>view==='review'?g.members.some(p=>p.media_state==='review'):g.members.some(p=>p.media_state==='ready'));if(view==='new')groups=groups.filter(g=>g.member_ids.length===1);if(view==='duplicates')groups=groups.filter(g=>g.member_ids.length>1);posts=groups.map(g=>({...g.representative,media_group:g}));}
    posts=[...posts].sort((a,b)=>view==='popular'?((b.display_metrics||b.metrics).views??-1)-((a.display_metrics||a.metrics).views??-1):key==='latest'?b.observed_at.localeCompare(a.observed_at):((b.display_metrics||b.metrics)[key]??-1)-((a.display_metrics||a.metrics)[key]??-1));
    q('research-accounts-summary').textContent='수집 계정 '+data.accounts.length+'개 · 콘텐츠 '+data.posts.length+'개 · '+(data.account_sync?.auto_daily!==false?'매일 자동 갱신 켜짐':'수동 갱신');q('research-accounts').replaceChildren();for(const a of data.accounts){const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(148,163,184,0.14);font-size:12px;';link(row,'@'+a.username,'https://www.threads.com/@'+a.username);text(row,'span',' · 수집 '+a.posts+'개 · 상업성 단서 '+a.commercial_candidates+'개 · 문구·링크 모두 '+a.evidence_and_link+'개 · 동일 제품 확인 '+a.confirmed_products+'개'+(a.last_synced_at?' · 최근 갱신 '+new Date(a.last_synced_at).toLocaleDateString('ko-KR')+' (+'+(a.last_added||0)+'개)':' · 미갱신'));const syncBtn=text(row,'button','지금 갱신');syncBtn.type='button';syncBtn.className='secondary btn-xs';syncBtn.style.marginLeft='auto';syncBtn.onclick=()=>run(async()=>{q('research-account-sync-status').textContent='@'+a.username+' 계정의 최신 게시물과 미디어·조회수·반응을 수집하는 중...';data=await request('sync-accounts',{username:a.username,maxAccounts:1,postsPerAccount:6});render();q('research-account-sync-status').textContent='@'+a.username+' 계정 갱신 완료: 신규 게시물 '+(data.added_posts||0)+'개 추가, 상세 수치 '+(data.enriched_posts||0)+'개 보강';});q('research-accounts').append(row);}
    q('research-results').replaceChildren();if(!posts.length)text(q('research-results'),'p','현재 목록에 표시할 콘텐츠가 없습니다. 기존 자료는 미디어·썸네일 확인 대기에서 확인할 수 있습니다.');
    for(const p of posts){const card=document.createElement('article');card.className='research-card';if(view==='pending'||view==='excluded'){card.classList.add('research-pending');link(card,'@'+p.username+' · 원문 확인',p.permalink);text(card,'p',view==='excluded'?'영상·이미지 없는 글 또는 작성자 댓글 · 기본 목록 제외':p.preview_error||'미디어와 미리보기 확인이 필요합니다.');const check=text(card,'button','원문 열어 확인');check.onclick=()=>run(async()=>{await request('review-open',{id:p.id});q('research-status').textContent='원문 확인 후 직접 화면 확인의 원문 검사 버튼을 누르면 미디어와 썸네일을 갱신합니다.';});q('research-results').append(card);continue;}const preview=p.media_preview?.data_url;if(!preview)continue;const image=document.createElement('img');image.className='research-thumbnail';image.alt='@'+p.username+' 실제 미디어 미리보기';image.loading='lazy';image.src=preview;image.onerror=()=>{card.replaceChildren();text(card,'p','미리보기 표시 실패 · 확인 대기');};card.append(image);if(p.media_group?.member_ids.length>1){const g=p.media_group;const duplicates=document.createElement('details');duplicates.className='research-duplicates';text(duplicates,'summary',(g.reason==='same_asset'?'같은 미디어':'썸네일 중복·유사 후보')+' '+(g.member_ids.length-1)+'개 더 있음 · 조회수 높은 글 대표');for(const id of g.member_ids){const other=(data.posts||[]).find(x=>x.id===id);if(!other)continue;const row=document.createElement('div');link(row,'@'+other.username+' · 조회 '+number((other.display_metrics||other.metrics).views),other.permalink);const split=text(row,'button',other.separate_media?'묶음 비교 복원':'다른 콘텐츠로 분리');split.type='button';split.className='secondary';split.onclick=()=>run(async()=>{data=await request('separate-media',{id:other.id});render();});duplicates.append(row);}card.append(duplicates);}
      const metrics=p.display_metrics||p.metrics;const mediaKindLabel=(p.media_assets||[]).some(a=>a.kind==='video')?'영상':'이미지';const details=document.createElement('details');details.className='research-card-detail';text(details,'summary','자세히 보기');link(card,'@'+p.username+' · '+mediaKindLabel+' 원문 확인',p.permalink);text(card,'p','조회 '+number(metrics.views)+' · 좋아요 '+number(metrics.likes)+' · 댓글 '+number(metrics.replies)+' · 재게시 '+number(metrics.reposts));text(details,'p',({korean:'한국어 콘텐츠',overseas:'해외 언어 콘텐츠',unknown:'언어 미확인'}[p.content_region]||'언어 미확인')+' · 본문 언어 기준');text(details,'p','제품 분류: '+(p.products.join(' · ')||'미지정'));text(details,'p',p.text);text(details,'p','재게시 '+number(metrics.reposts)+' · 인용 '+number(metrics.quotes)+' · 관측 '+new Date(p.observed_at).toLocaleString('ko-KR'));text(details,'p','상업성 단서 '+(p.checks.commercial_candidate?'있음':'미확인')+' · '+(p.comments_checked?'표시된 작성자 댓글만 검사':'댓글 미검사'));
      for(const e of p.checks.evidence)text(details,'p',e.kind+': '+e.excerpt);for(const evidence of p.detail_evidence||[])text(details,'p',evidence.scope+' · '+evidence.at+' · '+evidence.text.slice(0,400));for(const url of p.links)link(details,new URL(url).hostname+' 링크',url);for(const source of p.sources)link(details,'출발 게시물',source);card.append(details);
      const controls=document.createElement('div');controls.className='research-actions';const label=text(controls,'label','제품 일치 확인');const select=document.createElement('select');select.setAttribute('aria-label','@'+p.username+' 제품 일치 확인');for(const [value,name]of [['unreviewed','검토 전'],['same','동일 제품'],['similar','유사 제품'],['different','다른 제품']]){const option=text(select,'option',name);option.value=value;}select.value=p.product_match;label.append(select);select.onchange=()=>run(async()=>{data=await request('mark',{id:p.id,match:select.value});render();});
      const inspect=text(controls,'button','로그인 세션으로 원문 확인');inspect.type='button';inspect.className='secondary';inspect.onclick=()=>run(async()=>{await request('review-open',{id:p.id});q('research-status').textContent='원문을 확인한 뒤 이 화면의 원문 문구·작성자 댓글 검사 버튼을 누르세요. 표시된 작성자 댓글만 검사합니다.';});
      const refresh=text(controls,'button','수치·썸네일 갱신');refresh.type='button';refresh.className='secondary';refresh.onclick=()=>run(async()=>{await request('review-open',{id:p.id});for(let attempt=0;attempt<4;attempt++){await new Promise(resolve=>setTimeout(resolve,750));data=await request('review-capture');if(data.status!=='detail_not_observed')break;}render();q('research-status').textContent=data.status==='detail_checked'?'원문에서 확인한 수치와 썸네일을 갱신했습니다.':data.status==='login_required'?'원문 확인 창에 로그인이 필요합니다. 기존 자료는 유지됩니다.':'원문을 아직 읽지 못했습니다. 화면을 확인한 뒤 다시 갱신하세요.';});
      const save=text(controls,'button',p.saved_reference?'레퍼런스 저장됨':'레퍼런스로 수집');save.type='button';save.disabled=p.saved_reference||!['same','similar'].includes(p.product_match);save.onclick=()=>run(async()=>{await request('reference',{id:p.id});data=await request('list');render();q('research-status').textContent='수집한 레퍼런스에 저장했습니다. 콘텐츠 제작 → 수집한 레퍼런스에서 원본을 준비하세요.';});details.append(controls);card.append(save);q('research-results').append(card);
    }
  }
  function paintProgress(){const f=data.frontier;q('research-entry-status').textContent=f?.seed?(f.state==='running'?'선택한 게시물에서 쇼핑계정·영상 탐색 중':'탐색 '+(f.state==='paused'?'일시정지':f.state==='blocked'?'화면 확인 필요':'대기'))+' · 확인 '+f.visited+'페이지 · 남은 후보 '+f.remaining+'개'+(f.profile_fallbacks?' · 관련 미표시로 프로필 탐색 '+f.profile_fallbacks+'회':''):'Threads 게시물의 [동일·연관 쇼핑계정 찾기]를 눌러 시작하세요.';const active=f?.state==='running';const names={idle:'대기',running:'탐색 중',paused:'일시정지 · 이어서 탐색 가능',blocked:'화면 확인 필요 · 대기열 보존',completed:'현재 대기열 완료',finished_with_errors:'탐색 종료 · 오류 항목 있음'};q('research-crawl-status').textContent=f?(names[f.state]||f.state)+' · 정상 X 닫기 '+(f.normal_closes||0)+'회 · 방문 '+f.visited+'/'+f.total+' · 대기 '+f.remaining+' · 누적 계정 '+data.accounts.length+' · 누적 콘텐츠 '+data.posts.length+' · 이번 탐색 새 계정 '+(f.new_accounts||0)+' / 콘텐츠 '+(f.new_posts||0)+(f.pause_reason?' · '+({user:'사용자 일시정지',page_limit:'방문 한도 도달',time_limit:'시간 한도 도달'}[f.pause_reason]||f.pause_reason):'')+(f.current?' · 현재 '+f.current:'')+(f.last_error?' · '+f.last_error:''):'탐색 대기 중 · 자동 실행하지 않습니다.';for(const id of ['research-crawl-start','research-crawl-resume'])q(id).disabled=!native?.request||active;q('research-crawl-pause').disabled=!active;}
  async function updateStatus(){if(polling)return;polling=true;try{const next=await request('crawl-status');const changed=JSON.stringify(next.posts)!==JSON.stringify(data.posts)||next.accounts.length!==data.accounts.length;data=next;paintProgress();if(changed)render();}catch(e){q('research-crawl-status').textContent=e.message;}finally{polling=false;}}
  q('research-crawl-start').onclick=()=>run(async()=>{data=await request('crawl-start',{url:q('research-url').value.trim(),product:q('research-product').value.trim(),limits:{maxPages:Number(q('research-max-pages').value),maxDepth:Number(q('research-max-depth').value),postsPerProfile:Number(q('research-profile-limit').value),maxSeconds:Number(q('research-time-limit').value)*60}});paintProgress();q('research-status').textContent='모바일 폭에서 연속 탐색을 시작했습니다. 각 게시물의 미디어·조회수·반응을 정밀 수집합니다.';});
  q('research-crawl-resume').onclick=()=>run(async()=>{data=await request('crawl-start');paintProgress();});q('research-crawl-pause').onclick=()=>run(async()=>{data=await request('crawl-pause');paintProgress();q('research-status').textContent='일시정지를 요청했습니다. 현재 페이지 처리 후 대기열이 유지됩니다.';});
  q('research-mobile').onclick=()=>run(async()=>{await request('viewport',{mode:'mobile'});q('research-status').textContent='모바일 폭으로 전환했습니다. 페이지와 세션은 그대로 유지됩니다.';});q('research-desktop').onclick=()=>run(async()=>{await request('viewport',{mode:'desktop'});});q('research-close-prompt').onclick=()=>run(async()=>{const r=await request('close-prompt');q('research-status').textContent=r.message;});
  if(q('research-auto-daily-sync'))q('research-auto-daily-sync').onchange=()=>run(async()=>{data=await request('set-account-sync',{auto_daily:q('research-auto-daily-sync').checked});render();});
  if(q('research-sync-accounts-now'))q('research-sync-accounts-now').onclick=()=>run(async()=>{q('research-sync-accounts-now').disabled=true;q('research-account-sync-status').textContent='수집된 쇼핑 계정들을 순서대로 방문해 신규 게시물·미디어·조회수·반응을 정밀 갱신 중입니다...';try{data=await request('sync-accounts',{maxAccounts:10,postsPerAccount:6});render();q('research-account-sync-status').textContent='일괄 갱신 완료: '+data.synced_accounts+'개 계정 확인 · 신규 콘텐츠 '+(data.added_posts||0)+'개 추가 · 상세 수치 '+(data.enriched_posts||0)+'개 보강';}finally{q('research-sync-accounts-now').disabled=false;}});
  if(q('research-api-save'))q('research-api-save').onclick=()=>run(async()=>{const token=q('research-api-token').value.trim();data=await request('save-api-token',{token});q('research-api-token').value='';render();});
  if(q('research-api-collect'))q('research-api-collect').onclick=()=>run(async()=>{const query=q('research-api-query').value.trim()||q('research-product').value.trim();q('research-api-status').textContent='공식 Threads API(수집 전용)로 게시물을 조회하는 중...';data=await request('api-keyword-collect',{query,limit:25});render();q('research-api-status').textContent='API 수집 완료: '+data.api_collected+'개 조회 · 신규 '+(data.added||0)+'개 추가 (조회수는 [미확인 미디어·조회수 정밀 재수집]으로 보강 가능)';});
  setInterval(()=>{if(data.frontier?.state==='running')updateStatus();},2000);
  q('research-browse').onclick=()=>run(async()=>{if(!native?.request)throw Error('전용 브라우저에서 사용할 수 있습니다.');const r=await native.request({action:'studioBrowseThreadsForResearch'});if(!r?.success)throw Error(r?.error||'Threads 화면을 열지 못했습니다.');});window.addEventListener('takoh-research-started',()=>updateStatus());
  paintProgress();
  q('research-open').onclick=()=>run(async()=>{const r=await request('open',{url:q('research-url').value.trim(),product:q('research-product').value.trim()});if(r.canonical_url)q('research-url').value=r.canonical_url;q('research-status').textContent=r.message;});
  q('research-capture').onclick=()=>run(async()=>{q('research-status').textContent='현재 목록과 각 게시물의 미디어·조회수·반응을 정밀 수집 중입니다...';data=await request('capture',{deep:true});render();const states={login_required:'로그인 안내 팝업이 감지되어 중단했습니다. 탐색 창에서 팝업 바깥을 클릭하거나 Esc로 닫은 뒤 [관련 스레드] 영역을 화면에 표시하고 다시 수집하세요. (기존 결과는 보존됨)',related_not_observed:'관련 영역의 게시물을 확인하지 못했습니다. 댓글을 무한 탐색하지 않습니다.',captured:'현재 관련 목록과 상세 미디어·반응을 저장했습니다.',invalid_page:'게시물 상세 화면을 확인하세요.'};q('research-status').textContent=(states[data.status]||'수집 상태를 확인하세요.')+' 새 게시물 '+(data.added||0)+'개'+(data.deep_checked?' · 정밀 확인 '+data.deep_checked+'개':'');});
  q('research-review-capture').onclick=()=>run(async()=>{data=await request('review-capture');render();q('research-status').textContent=data.status==='detail_checked'?'원문과 표시된 작성자 댓글의 근거를 저장했습니다. 접힌 댓글과 프로필 링크는 미검사입니다.':data.status==='login_required'?'원문 확인 창에 로그인이 필요합니다. 기존 결과는 유지됩니다.':'원문 근거를 확인하지 못했습니다. 기존 결과는 유지됩니다.';});
  q('research-list').onclick=()=>run(async()=>{data=await request('list');render();q('research-status').textContent='로컬 저장 자료를 불러왔습니다. 외부 검색 호출 없음.';});q('research-filter').onchange=render;q('research-sort').onchange=render;q('research-view').onchange=render;q('research-audit').onclick=()=>run(async()=>{q('research-audit').disabled=true;q('research-status').textContent='원문을 천천히 확인하고 미디어·조회수·반응을 정밀 저장하는 중입니다. 최대 12개씩 처리합니다.';try{data=await request('audit-media',{limit:12});render();q('research-status').textContent=(data.checked||0)+'개 원문 정밀 확인 완료. 남은 자료는 확인 대기에 보존됩니다.';}finally{q('research-audit').disabled=false;}});q('research-region').onchange=render;
  if(native?.request)request('crawl-status').then(next=>{data=next;render();paintProgress();}).catch(()=>{});
  if(!native?.request){for(const id of ['research-open','research-capture','research-list','research-review-capture'])q(id).disabled=true;q('research-status').textContent='이 기능은 전용 브라우저에서 사용할 수 있습니다.';}render();
})();
