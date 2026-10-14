'use strict';
(() => {
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
  const stages=['reference','analysis','writing','product','publish'],stageNames=['수집한 레퍼런스','원본 분석','대본·게시문','상품·제휴 링크','Threads 게시'];
  let stage='analysis';
  function selectStage(name){
    if(!stages.includes(name))return;
    stage=name;
    document.querySelectorAll('[data-production-section]').forEach(section=>section.dataset.stageHidden=String(section.dataset.productionSection!==name));
    document.querySelectorAll('[data-production-stage]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.productionStage===name)));
    const next=stages.indexOf(name)+1;$('production-next').hidden=next===stages.length;
    $('production-next').textContent='다음: '+stageNames[next]+' →';
  }
  document.querySelectorAll('[data-production-stage]').forEach(button=>button.onclick=()=>selectStage(button.dataset.productionStage));
  $('new-job').addEventListener('click',()=>{selectStage('analysis');$('video-file').focus();});
  $('production-next').onclick=()=>selectStage(stages[stages.indexOf(stage)+1]);
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
  function selectWorkspace(name){
    const download=name==='download';
    $('download-workspace').hidden=!download;
    if($('discovery-workspace'))$('discovery-workspace').hidden=name!=='discovery';
    $('create-workspace').hidden=name!=='create';
    $('settings-workspace').hidden=name!=='settings';
    document.querySelectorAll('[data-workspace]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.workspace===name)));
    try{localStorage.setItem('takoh-workspace',name);}catch{}
    if(download)refreshDownloads();
    if(name==='discovery')refreshDiscovery();
    if(name==='settings'){refreshUsage();refreshCommerceSettings().catch(error=>{$('commerce-status').textContent=error.message;});refreshYoutubeSettings();}
  }
  let discoveryLoading=false;
  let currentDiscoveryPage=1;
  let currentDiscoveryItems=[];
  let currentDiscoveryHasMore=false;
  let currentDiscoveryLimit=30;
  const checkedDiscoveryUrls=new Set();

  function buildDiscoveryReferencePayload(item, country, category){
    return {
      permalink:item.url,
      username:item.channel,
      text:`${item.title}\n\n[추천 유형] ${item.intent||'제품 시연'}\n[카테고리] ${item.category_name||'생활·주방'}\n[추천 사유] ${item.recommendation_reason}\n[권리 상태] ${item.license_label}${item.attribution_draft?'\n[출처 표기] '+item.attribution_draft:''}`,
      mediaKind:'video',
      videoUrls:[item.url],
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
    meta.append(
      text('strong',`조회수 ${item.view_count_display}`),
      text('span',` · ${item.published_at.slice(0,10)}`)
    );
    if(item.days_ago_str){
      const daysBadge=text('span',item.days_ago_str);
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
          saveBtn.textContent='✓ 보관함 담김';
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
    const queryParams=`archive=${discoveryArchiveMode?1:0}&unseen=${$('discovery-unseen')?.checked?1:0}&provider=${provider}&country=${country}&mode=${mode}&category=${category}&q=${q}&intent=${encodeURIComponent(intent)}&type=${type}&license=${license}&published_range=${publishedRange}&published_after=${encodeURIComponent(customAfter)}&published_before=${encodeURIComponent(customBefore)}&min_views=${minViews}&sort_by=${sortBy}&limit=${limit}&page=${currentDiscoveryPage}${refreshParam}`;

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
    const rangeText={'7d':'최근 7일','30d':'최근 30일','90d':'최근 90일','1y':'최근 1년','all':'전체 기간','custom':'직접 지정'}[range]||range;
    const preview=$('discovery-quota-preview');
    if(!preview)return;

    if(['gemini_search','antigravity_search'].includes(provider)){
      preview.textContent=provider==='gemini_search'?'Gemini API 요청 최대 1회 + YouTube 상세 확인 최대 1유닛 · Google 검색어 수는 모델이 결정하며 별도 과금될 수 있음 · SerpAPI 사용 없음 · 자동 재시도 없음':'Antigravity CLI 세션 1회 (최대 120초 · 내부 모델/검색 횟수는 CLI가 결정) + YouTube 상세 확인 최대 1유닛 · 계정 한도 사용 · SerpAPI 사용 없음 · 자동 API 전환 없음';return;
    }
    if(provider === 'serpapi'){
      const planDesc = q ? `제품 한정 검색 [${q}]` : `카테고리 탐색 [${CATEGORY_SUBPRODUCTS[category]||'주방·수납·조리 도구'}]`;
      const serpCalls = country === 'ALL' ? 6 : 2;
      preview.textContent=`검색 계획: [SerpAPI YouTube] ${planDesc} (${rangeText} · 목표 ${limit}개 · 기간/라이선스 사후 적용) | 호출 상한: 언어별 최대 2페이지 · 총 ${serpCalls}회 요청 (실패 시 자동 재시도 0회 · 사용자 명시 선택 시에만 추가 키 재시도 허용, 총 호출 상한 ${serpCalls}회) · YouTube 상세 확인 최대 6회 · 실제 표시 수는 필터 통과 후보 수`;
      return;
    }

    if(mode==='popular'){
      preview.textContent='검색 계획: [YouTube API] 선택 국가 공식 인기 순위 차트 | 호출 상한: 최초 1회 요청 (재시도 0회 · 총 호출 상한 1회, 1 유닛)';
    }else if(mode==='shopping'){
      const planDesc = q ? `제품 한정 검색 [${q}]` : `카테고리 탐색 [${CATEGORY_SUBPRODUCTS[category]||'주방·수납·조리 도구'}]`;
      if(country==='ALL'){
        const estimatedCalls = limit <= 30 ? 6 : (limit <= 60 ? 9 : 12);
        const estimatedQuota = estimatedCalls * 100 + estimatedCalls;
        preview.textContent=`검색 계획: [YouTube API] ${planDesc} (${rangeText} · 목표 ${limit}개 · 한/영/일 다국어 교차 · nextPageToken 연속 탐색) | 호출 상한: 최초 및 연속 탐색 포함 총 호출 상한 ${estimatedCalls}회 (최대 ${estimatedQuota} 유닛, 자동 재시도 0회)`;
      }else{
        const estimatedCalls = limit <= 30 ? 2 : (limit <= 60 ? 3 : 4);
        const estimatedQuota = estimatedCalls * 100 + 1;
        preview.textContent=`검색 계획: [YouTube API] ${planDesc} (${rangeText} · 목표 ${limit}개 · nextPageToken 연속 탐색) | 호출 상한: 총 호출 상한 ${estimatedCalls}회 (최대 ${estimatedQuota} 유닛, 자동 재시도 0회)`;
      }
    }else{
      const planDesc = q ? `키워드 검색 [${q}]` : '전체 키워드 검색';
      const maxCalls = country === 'ALL' ? 6 : 2;
      const maxQuota = country === 'ALL' ? 603 : 201;
      preview.textContent=`검색 계획: [YouTube API] ${planDesc} (${rangeText} · 목표 ${limit}개) | 호출 상한: 총 호출 상한 ${maxCalls}회 (최대 ${maxQuota} 유닛, 자동 재시도 0회)`;
    }
  }

  if($('save-youtube-key'))$('save-youtube-key').onclick=()=>act('YouTube API 키 암호화 저장 중…',async()=>{
    const key=$('youtube-api-key').value.trim();
    await api('youtube-settings',{youtube_api_key:key});
    $('youtube-api-key').value='';
    await refreshYoutubeSettings();
  },'YouTube API 키를 암호화하여 저장했습니다.');

  if($('refresh-youtube-stats'))$('refresh-youtube-stats').onclick=refreshYoutubeSettings;
  async function refreshGeminiSearchSettings(){
    const data=await api('discovery/gemini-settings');
    $('gemini-search-model').value=data.model;
    $('antigravity-search-model').value=data.cli_model;
    $('gemini-search-settings-status').textContent=`API 키 ${data.api_configured?'저장됨':'미등록'} · Antigravity CLI ${data.cli_installed?'설치 확인 (로그인·검색 미검증)':'미설치'}`;
  }
  if($('save-gemini-search-settings'))$('save-gemini-search-settings').onclick=async()=>{
    try{await api('discovery/gemini-settings',{key:$('gemini-search-key').value,model:$('gemini-search-model').value,cli_model:$('antigravity-search-model').value});$('gemini-search-key').value='';await refreshGeminiSearchSettings();}
    catch(error){$('gemini-search-settings-status').textContent=error.message;}
  };
  refreshGeminiSearchSettings().catch(()=>{});
  async function refreshCatalogueSummary(){
    const data=await api('discovery/catalogue');
    $('discovery-catalogue-summary').textContent=`누적 영상 ${data.videos}개 · 등록 채널 ${data.channels}개 · 미열람 ${data.unseen}개`;
    const list=$('discovery-registered-channels');list.replaceChildren();
    for(const channel of data.registered_channels||[]){
      const link=document.createElement('a');link.href='https://www.youtube.com/channel/'+encodeURIComponent(channel.id);link.target='_blank';link.rel='noopener';link.textContent=channel.name||channel.id;
      const row=document.createElement('p');row.append(link);list.append(row);
    }
  }
  if($('discovery-archive-btn'))$('discovery-archive-btn').onclick=()=>{discoveryArchiveMode=true;refreshDiscovery(false);};
  if($('discovery-unseen'))$('discovery-unseen').onchange=()=>{discoveryArchiveMode=true;refreshDiscovery(false);};
  if($('discovery-subscribers-refresh'))$('discovery-subscribers-refresh').onclick=async()=>{
    const button=$('discovery-subscribers-refresh');button.disabled=true;
    try{const data=await api('discovery/subscribers/refresh',{});discoveryArchiveMode=true;await refreshDiscovery(false);$('discovery-status-banner').textContent+=` · 구독자 ${data.checked_channels}채널 확인 · YouTube ${data.youtube_requests}회 · SerpAPI 0회`;}
    catch(error){$('discovery-status-banner').textContent=error.message;}
    finally{button.disabled=false;}
  };
  if($('discovery-channel-shorts-refresh'))$('discovery-channel-shorts-refresh').onclick=async()=>{
    const button=$('discovery-channel-shorts-refresh');button.disabled=true;button.textContent='등록 채널 숏폼 확인 중…';
    try{
      const data=await api('discovery/channels/shorts/refresh',{});
      discoveryArchiveMode=true;
      $('discovery-type').value='shorts';$('discovery-sort-by').value='views';
      $('discovery-published-range').value='all';$('discovery-unseen').checked=false;
      await refreshDiscovery(false);
      $('discovery-status-banner').textContent+=` · 채널 ${data.checked_channels}/${data.registered_channels}개 확인 · 숏폼 후보 ${data.matched}개 · 신규 저장 ${data.added}개 · YouTube ${data.youtube_requests}유닛 · SerpAPI 0회 · ${data.scope}`;
    }catch(error){$('discovery-status-banner').textContent=error.message;}
    finally{button.disabled=false;button.textContent='등록 채널 숏폼 수집 · 조회수 순';await refreshCatalogueSummary();}
  };
  if($('discovery-channel-refresh'))$('discovery-channel-refresh').onclick=async()=>{
    const button=$('discovery-channel-refresh');button.disabled=true;
    try{const data=await api('discovery/channels/refresh',{});discoveryArchiveMode=true;await refreshDiscovery(false);$('discovery-status-banner').textContent+=` · 채널 ${data.checked_channels}개 확인 · 신규 ${data.added}개 · YouTube ${data.youtube_requests}회 · SerpAPI 0회`;}
    catch(error){$('discovery-status-banner').textContent=error.message;}
    finally{button.disabled=false;await refreshCatalogueSummary();}
  };
  refreshCatalogueSummary().catch(()=>{});
  if($('reload-discovery'))$('reload-discovery').onclick=()=>{discoveryArchiveMode=true;refreshDiscovery(false);};
  if($('discovery-fetch-btn'))$('discovery-fetch-btn').onclick=()=>{discoveryArchiveMode=false;refreshDiscovery(true, false);};
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
    if(catGroup)catGroup.style.display=(mode==='shopping')?'flex':'none';
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
    refreshDiscovery(false);
  };
  if($('discovery-custom-views-input'))$('discovery-custom-views-input').onchange=()=>refreshDiscovery(false);
  if($('discovery-sort-by'))$('discovery-sort-by').onchange=()=>refreshDiscovery(false);
  if($('discovery-limit'))$('discovery-limit').onchange=()=>{
    updateQuotaPreview();
    refreshDiscovery(false);
  };
  if($('discovery-intent'))$('discovery-intent').onchange=()=>refreshDiscovery(false);
  if($('discovery-type'))$('discovery-type').onchange=()=>refreshDiscovery(false);
  if($('discovery-license'))$('discovery-license').onchange=()=>refreshDiscovery(false);
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
          if(btn)btn.textContent='✓ 보관함 담김';
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

  updateQuotaPreview();




  async function refreshUsage(){try{const result=await api('usage');$('usage-note').textContent=result.scope+' · '+result.note;$('ai-usage').replaceChildren();if(!result.groups?.length){$('ai-usage').append(text('p','아직 기록된 AI 요청이 없습니다.'));return;}const table=document.createElement('table');table.className='usage-table';const header=document.createElement('tr');for(const label of ['연결 / 모델','시도 / 반환 / 오류','입력 토큰','출력 토큰','전체 토큰','토큰 기록'])header.append(text('th',label));table.append(header);for(const group of result.groups){const row=document.createElement('tr');const known=group.reported_calls>0;for(const value of [group.provider+' / '+group.model,`${group.calls} / ${group.successful} / ${group.failed}`,group.token_available?.input_tokens?group.input_tokens.toLocaleString():'미제공',group.token_available?.output_tokens?group.output_tokens.toLocaleString():'미제공',group.token_available?.total_tokens?group.total_tokens.toLocaleString():'미제공',`${group.reported_calls}/${group.calls}회`])row.append(text('td',String(value)));table.append(row);}$('ai-usage').append(table);}catch(error){$('usage-note').textContent=error.message;}}
  $('reload-usage').onclick=refreshUsage;
  document.querySelectorAll('[data-workspace]').forEach(button=>button.onclick=()=>selectWorkspace(button.dataset.workspace));
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
    const badge=text('span',item.type==='image'?'이미지':'▶ 영상');badge.className='download-thumbnail-badge';badge.setAttribute('aria-hidden','true');
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
      const button=text('button','이 콘텐츠로 제작 →');button.onclick=async()=>{selectedReference=ref;selectWorkspace('create');selectStage('reference');$('source').value=ref.permalink;$('fetch-url').value=ref.permalink;await refreshReferences();message('사용할 영상 또는 이미지를 선택하고 원본 준비를 눌러 주세요.');};
      row.append(left,button);$('collected-files').append(row);
    }
    $('collection-connection').textContent=`수집 ${refs.length}개 · 제작 화면과 동기화 완료`;
  }catch(error){$('collection-connection').textContent=error.message;}finally{syncing=false;}}
  $('reload-downloads').onclick=()=>{refreshDownloads();syncCollections();};
  window.addEventListener('focus',()=>{refreshDownloads();syncCollections();});
  $('choose-local-file').onclick=()=>{selectWorkspace('create');$('video-file').focus();};
  const transfer=location.hash.startsWith('#reference=');
  let saved='download';try{saved=localStorage.getItem('takoh-workspace')||'download';}catch{}
  const requested=location.hash.startsWith('#workspace=')?location.hash.slice(11):null;
  selectWorkspace(transfer||$('incoming-reference').hidden===false?'create':requested==='create'?'create':requested==='discovery'?'discovery':requested==='download'?'download':saved);
  selectStage('reference');
  syncCollections();
})();
