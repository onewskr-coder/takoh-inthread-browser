'use strict';
(() => {
  const pending=new Map();
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
    $('download-workspace').hidden=!download;$('create-workspace').hidden=name!=='create';$('settings-workspace').hidden=name!=='settings';
    document.querySelectorAll('[data-workspace]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.workspace===name)));
    try{localStorage.setItem('takoh-workspace',name);}catch{}
    if(download)refreshDownloads();
    if(name==='settings'){refreshUsage();refreshCommerceSettings().catch(error=>{$('commerce-status').textContent=error.message;});}
  }
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
      if(!old||old.text!==ref.text||JSON.stringify(old.imageUrls)!==JSON.stringify(ref.imageUrls)||JSON.stringify(old.videoUrls)!==JSON.stringify(ref.videoUrls)||old.thumbnailUrl!==ref.thumbnailUrl||old.poster!==ref.poster)await api('references/import',{reference:ref});}
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
  selectWorkspace(transfer||$('incoming-reference').hidden===false?'create':requested==='create'?'create':requested==='download'?'download':saved);
  selectStage('reference');
  syncCollections();
})();
