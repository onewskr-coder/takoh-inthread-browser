const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {installShutdown}=require('./shutdown.cjs');
async function mockScenario(prepare,flush,timeout=100){
  const app=new EventEmitter(),win=new EventEmitter();let exits=0,disposed=0;const errors=[];
  app.quit=()=>{let prevented=false;app.emit('before-quit',{preventDefault(){prevented=true;}});if(!prevented)exits++;};
  const control=installShutdown({app,win,prepare,flush,timeout,dispose:()=>disposed++,report:e=>errors.push(e)});
  win.emit('close',{preventDefault(){}});app.quit();await control.pending;
  return {exits,disposed,errors,control,app};
}
(async()=>{
  let calls=0;let r=await mockScenario(async()=>{calls++;return true;},async()=>{});assert.equal(calls,1);assert.equal(r.exits,1);
  r=await mockScenario(async()=>false,async()=>{});assert.equal(r.exits,0);assert.equal(r.disposed,0);
  r=await mockScenario(async()=>true,async()=>{throw Error('flush failed');});assert.equal(r.exits,0);assert.equal(r.errors.length,1);
  r=await mockScenario(async()=>true,()=>new Promise(()=>{}),20);assert.equal(r.exits,0);assert.equal(r.disposed,0);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'takoh-shutdown-'));const profile=path.join(temp,'profile');
  const fixture=path.join(temp,'fixture.cjs');
  fs.writeFileSync(fixture,`const {app,BrowserWindow,session}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.whenReady().then(async()=>{const s=session.fromPartition('persist:test');if(process.env.SHUTDOWN_CHECK==='1'){const c=await s.cookies.get({name:'saved'});app.exit(c.some(x=>x.value==='yes')?0:7);return;}await s.cookies.set({url:'https://example.test',name:'saved',value:'yes',expirationDate:Date.now()/1000+3600});const win=new BrowserWindow({show:false});require(${JSON.stringify(path.join(__dirname,'shutdown.cjs'))}).installShutdown({app,win,prepare:async()=>true,flush:()=>s.cookies.flushStore(),dispose:()=>{},report:e=>{console.error(e);app.exit(8);}});win.close();});`);
  const binary=path.join(__dirname,'node_modules/electron/dist/electron.exe');
  for(const check of ['0','1']){const env={...process.env,SHUTDOWN_CHECK:check};delete env.ELECTRON_RUN_AS_NODE;const child=spawnSync(binary,[fixture],{env,timeout:20000,windowsHide:true,encoding:'utf8'});assert.equal(child.status,0,child.stderr||String(child.error));}
  console.log('PASS: coalesced shutdown, busy/error/timeout protection, actual Electron exit and persisted cookie reload');
})();
