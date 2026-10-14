const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('takohNative',{request:message=>ipcRenderer.invoke('native-media',message)});
if(location.origin==='http://127.0.0.1:5006'){
  const actions={'references-list':'studioListReferences','downloads-list':'studioListDownloads','download-file':'studioGetDownload','upload':'studioQueueUpload','upload-status':'studioUploadStatus','upload-cancel':'studioCancelUpload'};
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.source!=='takoh-studio-ui'||typeof event.data.requestId!=='string')return;
    const {kind,requestId,packet,downloadId}=event.data;
    let result;
    try{result=actions[kind]?await ipcRenderer.invoke('native-media',{action:actions[kind],packet,downloadId}):{success:false,error:'전용 앱에서 아직 지원하지 않는 동작입니다.'};}
    catch(error){result={success:false,error:error.message};}
    window.postMessage({source:'takoh-studio-bridge',requestId,...result},location.origin);
  });
  ipcRenderer.on('native-collection-changed',()=>window.postMessage({source:'takoh-studio-bridge',kind:'changed'},location.origin));
  window.addEventListener('load',()=>window.postMessage({source:'takoh-studio-bridge',kind:'ready'},location.origin));
}

