/* Only injected on our local studio origin. Download IDs are checked by the worker. */
(() => {
  try{if(typeof window.__takohStudioBridgeDispose==='function')window.__takohStudioBridgeDispose();}catch{}
  let disconnected=false;
  const onMessage=event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-ui')return;
    const {kind,requestId,downloadId,packet}=event.data;
    if(!['downloads-list','download-file','references-list','upload','upload-status','upload-cancel'].includes(kind)||typeof requestId!=='string')return;
    const actions={'upload-status':'studioUploadStatus','upload-cancel':'studioCancelUpload',upload:'studioQueueUpload','references-list':'studioListReferences','downloads-list':'studioListDownloads','download-file':'studioGetDownload'};
    function respond(success,data,error){window.postMessage({source:'takoh-studio-bridge',requestId,success,data,error},location.origin);}
    function failure(error){const detail=String(error?.message||error||'');return /context invalidated|extension context|receiving end does not exist|message port closed/i.test(detail)?'확장 연결이 갱신되었습니다. Chrome 확장 관리에서 기존 확장을 새로고침한 뒤 제작 화면도 새로고침하세요.':detail||'확장 프로그램 응답이 없습니다. 확장과 제작 화면을 새로고침하세요.';}
    function reject(error){if(/context invalidated/i.test(String(error?.message||error)))disconnected=true;respond(false,null,failure(error));}
    if(disconnected){respond(false,null,failure('Extension context invalidated'));return;}
    try{
      const runtime=typeof chrome==='undefined'?null:chrome.runtime;
      if(!runtime?.id||typeof runtime.sendMessage!=='function'){disconnected=true;respond(false,null,failure('Extension context invalidated'));return;}
      runtime.sendMessage({packet,action:actions[kind],downloadId},response=>{
        try{
          const error=runtime.lastError;
          if(error||!response){reject(error);return;}
          respond(response.success===true,response.data,response.error);
        }catch(error){reject(error);}
      });
    }catch(error){reject(error);}
  };
  window.addEventListener('message',onMessage);
  window.postMessage({source:'takoh-studio-bridge',kind:'ready'},location.origin);
  const onStorage=changes=>{if(changes.studioReferences||changes.history)window.postMessage({source:'takoh-studio-bridge',kind:'changed'},location.origin);};
  try{chrome.storage.onChanged.addListener(onStorage);}catch{}
  window.__takohStudioBridgeDispose=()=>{window.removeEventListener('message',onMessage);try{chrome.storage.onChanged.removeListener(onStorage);}catch{}};
})();
