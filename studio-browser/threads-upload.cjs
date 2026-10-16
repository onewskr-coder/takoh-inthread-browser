const fs=require('node:fs');
const path=require('node:path');

function packetUrl(value){
  try{
    const u=new URL(value);
    return /^http:\/\/127\.0\.0\.1:(?:5005|5006)\/studio\/delivery\/[a-f0-9]{48}$/.test(u.href)?u.href:null;
  }catch{
    return null;
  }
}

function uploadSource(){
  const raw=fs.readFileSync(path.join(__dirname,'..','downloader','studio-upload.js'),'utf8');
  return raw.split(/\r?\n\(\(\) => \{/)[0];
}

function inspectMediaBuffer(bytes, label='미디어'){
  if(!bytes || bytes.length === 0){
    throw new Error(`${label} 파일이 비어 있어 게시를 차단했습니다.`);
  }
  if(bytes.length > 30 * 1024 * 1024){
    throw new Error(`${label} 파일이 30MB를 넘어 게시를 차단했습니다.`);
  }
  const sample = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 64))).toLowerCase();
  if(sample.startsWith('<!doctype') || sample.startsWith('<html') || sample.startsWith('<?xml')){
    throw new Error(`${label} 파일이 HTML 오류 응답으로 손상되어 게시를 차단했습니다.`);
  }
}

function createThreadsUploadManager({dataDir,ensureThreadsView,fetchImpl=fetch}){
  const filePath=path.join(dataDir,'upload-queue.json');
  const timers=new Map();
  let running=false;
  let writes=Promise.resolve();

  function readQueue(){
    try{
      if(!fs.existsSync(filePath))return [];
      const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
      return Array.isArray(parsed)?parsed:[];
    }catch{
      return [];
    }
  }

  function writeQueue(queue){
    fs.mkdirSync(path.dirname(filePath),{recursive:true});
    const tmp=filePath+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(queue,null,2),'utf8');
    fs.renameSync(tmp,filePath);
  }

  function updateQueue(change){
    const op=writes.catch(()=>{}).then(async()=>{
      const queue=readQueue();
      const result=await change(queue);
      writeQueue(queue);
      return result;
    });
    writes=op;
    return op;
  }

  async function setState(id,updates){
    return updateQueue(queue=>{
      const item=queue.find(x=>x.id===id);
      if(item)Object.assign(item,updates);
    });
  }

  function schedule(id,when){
    if(timers.has(id)){
      clearTimeout(timers.get(id));
      timers.delete(id);
    }
    const delay=Math.max(500,Math.min(2147483647,when-Date.now()));
    const timer=setTimeout(()=>{
      timers.delete(id);
      run(id).catch(()=>{});
    },delay);
    if(typeof timer.unref==='function')timer.unref();
    timers.set(id,timer);
  }

  async function run(id){
    if(running){
      schedule(id,Date.now()+60000);
      return;
    }
    running=true;
    try{
      const queue=readQueue();
      const item=queue.find(x=>x.id===id);
      if(!item||item.state!=='queued')return;
      if(item.when>Date.now()+1000){
        schedule(id,item.when);
        return;
      }
      if(Date.now()-item.when>600000){
        await setState(id,{state:'missed',error:'예약 시각을 10분 이상 지나 자동 게시하지 않았습니다.'});
        return;
      }
      const claimed=await updateQueue(q=>{
        const current=q.find(x=>x.id===id);
        if(!current||current.state!=='queued')return false;
        current.state='running';
        return true;
      });
      if(!claimed)return;

      const response=await fetchImpl(item.url);
      if(!response.ok)throw new Error('도우미 업로드 작업을 읽지 못했습니다.');
      const payload=await response.json();
      if(Array.isArray(payload.files)&&payload.files.length>0){
        if(payload.files.length>10)throw new Error('캐러셀 미디어가 10개를 초과하여 게시를 차단했습니다.');
        const loadedFiles=[];
        for(let idx=0;idx<payload.files.length;idx++){
          const f=payload.files[idx];
          const partPath=String(f?.part||'').trim();
          if(!partPath)throw new Error(`캐러셀 ${idx+1}번째 파일 경로가 누락되어 게시를 차단했습니다.`);
          const fRes=await fetchImpl(item.url+'/'+partPath);
          if(!fRes||!fRes.ok)throw new Error(`캐러셀 ${idx+1}/${payload.files.length}번째 파일 다운로드 실패로 게시를 차단했습니다.`);
          const fBytes=new Uint8Array(await fRes.arrayBuffer());
          inspectMediaBuffer(fBytes, `캐러셀 ${idx+1}/${payload.files.length}번째`);
          loadedFiles.push({
            name:f.name||`media-${idx+1}.jpg`,
            mime:f.mime||'image/jpeg',
            kind:f.kind||'image',
            base64:Buffer.from(fBytes).toString('base64')
          });
        }
        if(loadedFiles.length!==payload.files.length){
          throw new Error('캐러셀 전체 파일을 확보하지 못해 게시를 차단했습니다.');
        }
        payload.loadedFiles=loadedFiles;
        payload.video=loadedFiles[0].base64;
      }else{
        const video=await fetchImpl(item.url+'/video');
        if(!video.ok)throw new Error('저장된 미디어를 읽지 못했습니다.');
        const bytes=new Uint8Array(await video.arrayBuffer());
        inspectMediaBuffer(bytes, '미디어');
        payload.video=Buffer.from(bytes).toString('base64');
      }

      const targetPlatform=payload.platform||item.platform||'threads';
      const view=await ensureThreadsView(targetPlatform);
      const fnSource=uploadSource();
      const script=`(${fnSource})(${JSON.stringify(payload)})`;
      const result=await view.webContents.executeJavaScript(script,true);
      await setState(id,result||{state:'uncertain',error:'화면 실행 결과가 없습니다. 플랫폼에서 직접 확인하세요.'});
      if(result?.state==='queued')schedule(id,Date.now()+1500);
    }catch(error){
      await setState(id,{state:'uncertain',error:error.message});
    }finally{
      running=false;
    }
  }

  async function init(){
    await updateQueue(queue=>{
      for(const item of queue){
        if(item.state==='running'){
          item.state='uncertain';
          item.error='브라우저가 작업 중 종료되었습니다. 플랫폼에서 게시 여부를 확인하세요.';
        }else if(item.state==='queued'){
          schedule(item.id,Math.max(Date.now()+1000,item.when));
        }
      }
    });
    fs.watchFile(filePath,{interval:1000},()=>{
      const queue=readQueue();
      for(const item of queue){
        if(item.state==='queued'&&!timers.has(item.id)){
          schedule(item.id,Math.max(Date.now()+600,item.when));
        }
      }
    });
  }

  async function queueUpload(packet){
    const url=packetUrl(packet?.url);
    if(!url||!Number.isFinite(packet?.when)){
      throw new Error('업로드 작업 주소 또는 시각이 잘못되었습니다.');
    }
    const result=await fetchImpl(url);
    if(!result.ok)throw new Error('도우미 업로드 내용을 읽지 못했습니다.');
    const payload=await result.json();
    if(payload.id!==packet.id||payload.when!==packet.when){
      throw new Error('예약 정보가 일치하지 않습니다.');
    }
    const added=await updateQueue(queue=>{
      if(queue.some(x=>x.id===packet.id))return false;
      queue.push({...packet,url,state:'queued',name:payload.name,platform:payload.platform||packet.platform||'threads',publish_format:payload.publish_format||packet.publish_format||'video'});
      return true;
    });
    if(added){
      schedule(packet.id,Math.max(Date.now()+600,packet.when));
    }
    return {id:packet.id};
  }

  async function status(){
    const queue=readQueue();
    return queue.map(({id,name,when,state,error,permalink,platform,publish_format})=>({id,name,when,state,error,permalink,platform:platform||'threads',publish_format:publish_format||'video'}));
  }

  async function cancel(packet){
    const id=await updateQueue(queue=>{
      const item=queue.find(x=>x.id===packet?.id);
      if(!item||item.state!=='queued')throw new Error('대기 중인 예약만 취소할 수 있습니다.');
      item.state='cancelled';
      return item.id;
    });
    if(timers.has(id)){
      clearTimeout(timers.get(id));
      timers.delete(id);
    }
    return {id};
  }

  function dispose(){
    fs.unwatchFile(filePath);
    for(const timer of timers.values())clearTimeout(timer);
    timers.clear();
  }

  return {init,queueUpload,status,cancel,run,dispose,isBusy:()=>running};
}

module.exports={createThreadsUploadManager,packetUrl};
