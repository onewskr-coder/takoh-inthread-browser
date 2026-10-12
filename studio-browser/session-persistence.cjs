function manageSessions(session,report=console.error){
  const sessions=['persist:sites','persist:studio'].map(partition=>session.fromPartition(partition));
  let pending=null,timer=null;
  async function flush(){
    if(pending)return pending;
    pending=Promise.all(sessions.map(async current=>{current.flushStorageData();await current.cookies.flushStore();})).catch(error=>{report('로그인 저장 실패: '+error.message);throw error;}).finally(()=>pending=null);
    return pending;
  }
  const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),500);timer.unref?.();};
  for(const current of sessions)current.cookies.on('changed',changed);
  const periodic=setInterval(()=>flush().catch(()=>{}),30000);periodic.unref?.();
  return {flush,dispose(){clearTimeout(timer);clearInterval(periodic);for(const current of sessions)current.cookies.removeListener('changed',changed);}};
}
module.exports={manageSessions};
