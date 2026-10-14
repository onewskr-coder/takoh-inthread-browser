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
  return raw.split('\n(() => {')[0];
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
      const video=await fetchImpl(item.url+'/video');
      if(!video.ok)throw new Error('저장된 영상을 읽지 못했습니다.');
      const bytes=new Uint8Array(await video.arrayBuffer());
      if(bytes.length>30*1024*1024)throw new Error('영상이 30MB를 넘습니다.');
      payload.video=Buffer.from(bytes).toString('base64');

      const view=await ensureThreadsView();
      const fnSource=uploadSource();
      const script=`(${fnSource})(${JSON.stringify(payload)})`;
      const result=await view.webContents.executeJavaScript(script,true);
      await setState(id,result||{state:'uncertain',error:'화면 실행 결과가 없습니다. Threads에서 직접 확인하세요.'});
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
          item.error='브라우저가 작업 중 종료되었습니다. Threads에서 게시 여부를 확인하세요.';
        }else if(item.state==='queued'){
          schedule(item.id,Math.max(Date.now()+1000,item.when));
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
      queue.push({...packet,url,state:'queued',name:payload.name});
      return true;
    });
    if(added){
      schedule(packet.id,Math.max(Date.now()+600,packet.when));
    }
    return {id:packet.id};
  }

  async function status(){
    const queue=readQueue();
    return queue.map(({id,name,when,state,error,permalink})=>({id,name,when,state,error,permalink}));
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
    for(const timer of timers.values())clearTimeout(timer);
    timers.clear();
  }

  return {init,queueUpload,status,cancel,run,dispose,isBusy:()=>running};
}

module.exports={createThreadsUploadManager,packetUrl};
