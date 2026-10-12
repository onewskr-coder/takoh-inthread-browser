const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function watchDevelopment({root,restart,busy=async()=>false,report=console.error,interval=1500}){
  const own=['navigation.cjs','main.cjs','preload.cjs','site-preload.cjs','native-media.cjs','helper-manager.cjs','session-persistence.cjs','dev-restart.cjs','toolbar.js','toolbar.html','shell.css'];
  const media=['content-core.js','content-studio.js','content-meta-main.js','content-threads.js','content-instagram.js','content-pinterest.js','content.css'];
  const files=[...own.map(name=>path.join(root,name)),...media.map(name=>path.join(root,'..','downloader',name))];
  const snapshot=()=>files.map(file=>{try{const s=fs.statSync(file);return `${s.mtimeMs}:${s.size}`;}catch{return 'missing';}}).join('|');
  let baseline=snapshot(),candidate=null,restarting=false,running=false;
  async function tick(){try{if(JSON.parse(fs.readFileSync(path.join(root,'restart-policy.json'),'utf8')).enabled!==true)return;}catch{return;}if(running||restarting)return;running=true;try{const current=snapshot();if(current===baseline){candidate=null;return;}if(current!==candidate){candidate=current;return;}
    try{for(const file of files){const source=fs.readFileSync(file,'utf8');if(/\.(js|cjs)$/.test(file))new vm.Script(source,{filename:file});}}catch(error){baseline=current;candidate=null;report('코드 오류로 자동 재실행 보류: '+error.message);return;}
    if(await busy()){report('작성 중인 내용이 있어 자동 재실행 대기');return;}
    restarting=true;await restart();
  }catch(error){restarting=false;report('자동 재실행 실패: '+error.message);}finally{running=false;}}
  const timer=setInterval(tick,interval);timer.unref?.();return {tick,dispose:()=>clearInterval(timer)};
}
module.exports={watchDevelopment};
