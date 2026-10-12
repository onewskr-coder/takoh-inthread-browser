const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
class HelperManager{
 constructor({dataDir,sourceDir,fetchImpl=fetch,spawnImpl=spawn,pause=ms=>new Promise(r=>setTimeout(r,ms)),timeout=20000,python}={}){Object.assign(this,{dataDir,sourceDir,fetchImpl,spawnImpl,pause,timeout,python});this.status={state:'idle',message:'도우미 대기'};this.child=null;this.pending=null;}
 async probe(){try{const r=await this.fetchImpl('http://127.0.0.1:5006/studio/session',{signal:AbortSignal.timeout(1000)});if(!r.ok)return false;const data=await r.json();return typeof data.token==='string'&&data.token.length>20;}catch{return false;}}
 start(){return this.pending||(this.pending=this.boot().catch(error=>{this.status={state:'failed',message:error.message};throw error;}));}
 async boot(){this.status={state:'starting',message:'도우미 연결 준비 중'};if(await this.probe()){this.status={state:'ready',message:'도우미 연결됨'};return;}
 const python=this.python||path.join(process.env.LOCALAPPDATA||'','Programs','Python','Python311','python.exe');if(!fs.existsSync(python))throw Error('Python 도우미 실행 파일을 찾지 못했습니다.');fs.mkdirSync(this.dataDir,{recursive:true});const out=fs.openSync(path.join(this.dataDir,'helper.log'),'a');
 try{this.child=this.spawnImpl(python,['app.py'],{cwd:this.sourceDir,windowsHide:true,stdio:['ignore',out,out],env:{...process.env,TAKOH_DEV_MODE:'1',PORT:'5006'}});}finally{fs.closeSync(out);}
 let stopped='';this.child.on('error',e=>stopped=e.message);this.child.on('exit',code=>{stopped='도우미가 종료되었습니다 ('+code+').';if(this.status.state==='ready')this.status={state:'failed',message:stopped};});
 const end=Date.now()+this.timeout;while(Date.now()<end){if(stopped)throw Error(stopped);if(await this.probe()){this.status={state:'ready',message:'도우미 연결됨'};return;}await this.pause(300);}throw Error('도우미 연결 시간 초과 · helper.log를 확인하세요.');}
}
module.exports={HelperManager};
