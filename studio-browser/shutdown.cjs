function installShutdown({app,win,prepare,flush,dispose,report,timeout=10000}) {
  let approved=false,pending=null;
  async function finish() {
    if(!await prepare())return;
    let timer;
    try {
      await Promise.race([Promise.resolve().then(flush),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('로그인 저장이 완료되지 않아 종료를 취소했습니다. 다시 시도해 주세요.')),timeout);})]);
    } finally {clearTimeout(timer);}
    dispose();
    approved=true;
    app.quit();
  }
  app.on('before-quit',event=>{
    if(approved)return;
    event.preventDefault();
    if(!pending)pending=finish().catch(error=>report(error.message)).finally(()=>{pending=null;});
  });
  win.on('close',event=>{if(!approved){event.preventDefault();app.quit();}});
  return {get pending(){return pending;},get approved(){return approved;}};
}
module.exports={installShutdown};
