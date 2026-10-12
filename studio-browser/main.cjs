const {app,BaseWindow,WebContentsView,ipcMain,shell,dialog,session}=require('electron');
const path=require('node:path');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
const fs=require('node:fs');
// Pin the existing profile location across package names and future updates.
const profilePath=path.join(app.getPath('appData'),'takoh-studio-browser');
fs.mkdirSync(profilePath,{recursive:true});
app.setPath('userData',profilePath);
const {manageSessions}=require('./session-persistence.cjs');
let persistence,devWatcher,restartNotice='';
const {watchDevelopment}=require('./dev-restart.cjs');
const native=require('./native-media.cjs');
const navigation=require('./navigation.cjs');
const {HelperManager}=require('./helper-manager.cjs');
let helperManager,helperReady;
const ownsApp=app.requestSingleInstanceLock();
const {lockProfile}=require('./profile-lock.cjs');
const profileGuard=ownsApp?lockProfile(profilePath):{acquired:false,release(){}};
app.on('will-quit',()=>profileGuard.release());
if(!ownsApp||!profileGuard.acquired){app.quit();}else{app.on('second-instance',()=>{if(win){win.show();win.focus();}});}
const sites={browser:'https://www.facebook.com/',threads:'https://www.threads.com/',instagram:'https://www.instagram.com/',pinterest:'https://www.pinterest.com/',studio:'http://127.0.0.1:5006/studio/'};
let win,toolbar,active,currentWork='';const views=new Map();
function resize(){if(!win)return;const [width,height]=win.getContentSize();toolbar.setBounds({x:0,y:0,width,height});active?.setBounds({x:168,y:96,width:Math.max(0,width-168),height:Math.max(0,height-124)});}
function configurePopups(contents,key){
  const blockedGoogle=url=>{try{return new URL(url).hostname==='accounts.google.com';}catch{return false;}};
  const explainGoogle=()=>{dialog.showMessageBox({type:'info',title:'Google 로그인 안내',message:'Google 로그인은 내장 브라우저에서 제한될 수 있습니다.',detail:'외부 브라우저에서 Pinterest 로그인을 진행할 수 있습니다. 외부 로그인은 이 앱으로 자동 전달되지 않습니다. 앱에서는 Pinterest 이메일 로그인을 사용하세요.',buttons:['닫기','외부 Pinterest 열기'],defaultId:0,cancelId:0}).then(({response})=>{if(response===1)shell.openExternal('https://www.pinterest.com/login/');});};
  contents.setWindowOpenHandler(({url})=>{
    if(blockedGoogle(url)){explainGoogle();return {action:'deny'};}
    let allowed=false;try{allowed=url==='about:blank'||new URL(url).protocol==='https:';}catch{}
    return allowed?{action:'allow',overrideBrowserWindowOptions:{width:620,height:760,title:'사이트 로그인',webPreferences:{partition:key==='studio'?'persist:studio':'persist:sites',nodeIntegration:false,contextIsolation:true,sandbox:true}}}:{action:'deny'};
  });
  contents.on('will-navigate',(event,url)=>{if(blockedGoogle(url)){event.preventDefault();explainGoogle();}});
  contents.on('will-redirect',(event,url)=>{if(blockedGoogle(url)){event.preventDefault();explainGoogle();}});
  contents.on('did-create-window',popup=>{configurePopups(popup.webContents,key);popup.webContents.on('will-navigate',(event,url)=>{try{if(!['https:','about:'].includes(new URL(url).protocol))event.preventDefault();}catch{event.preventDefault();}});});
}
function select(key){if(!sites[key])return;if(active&&active===views.get(key)){currentWork='';resize();return;}currentWork='';if(active)win.contentView.removeChildView(active);let view=views.get(key);if(!view){view=new WebContentsView({webPreferences:{partition:key==='studio'?'persist:studio':'persist:sites',preload:path.join(__dirname,'site-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});views.set(key,view);view.webContents.on('render-process-gone',(_event,details)=>{restartNotice='페이지 표시 중단 · '+details.reason+' · 새로고침으로 다시 열 수 있습니다.';console.error('Renderer stopped:',key,details.reason,details.exitCode);});view.webContents.on('unresponsive',()=>{restartNotice='페이지 응답 대기 중 · 작성 내용 보존을 위해 자동 새로고침하지 않습니다.';});view.webContents.on('responsive',()=>{restartNotice='';});view.webContents.on('dom-ready',async()=>{try{if(native.trusted(view.webContents.getURL())){await helperReady;await view.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'..','downloader','content.css'),'utf8'));const currentPlatform=navigation.platform(view.webContents.getURL());if(currentPlatform)await view.webContents.executeJavaScript(native.injection(currentPlatform));}}catch(error){console.error('Site integration:',error.message);}});configurePopups(view.webContents,key);view.webContents.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.protocol==='http:'&&u.hostname!=='127.0.0.1')event.preventDefault();}catch{event.preventDefault();}});view.initialLoad=view.webContents.loadURL(sites[key]);view.initialLoad.catch(error=>console.error(error.message));}active=view;win.contentView.addChildView(view);resize();}
ipcMain.handle('site-location',event=>{if(event.sender!==toolbar?.webContents)return null;const key=[...views.entries()].find(([,view])=>view===active)?.[0];return {key,url:active?.webContents.getURL()||'',work:currentWork};});
ipcMain.handle('site-navigate',async(event,value)=>{if(event.sender!==toolbar?.webContents)return;try{const url=navigation.address(value);const key=navigation.platform(url)||'browser';select(key);await active.webContents.loadURL(url);return {success:true};}catch(error){return {error:error.message};}});
ipcMain.handle('work-select',async(event,name)=>{if(event.sender!==toolbar?.webContents)return;const destination={library:{workspace:'create',stage:'reference'},create:{workspace:'create',stage:'analysis'},publish:{workspace:'create',stage:'publish'},settings:{workspace:'settings'}}[name];if(!destination)return {error:'알 수 없는 작업 메뉴'};try{await helperReady;select('studio');currentWork=name;const target=active;await target.initialLoad;await target.webContents.executeJavaScript(`document.querySelector('[data-workspace="${destination.workspace}"]')?.click();`+(destination.stage?`document.querySelector('[data-production-stage="${destination.stage}"]')?.click();`:''));return {success:true};}catch(error){return {error:error.message};}});
ipcMain.handle('helper-status',async event=>{if(event.sender!==toolbar?.webContents)return null;if(helperManager?.status.state==='ready'&&!await helperManager.probe())helperManager.status={state:'failed',message:'도우미 연결 끊김 · 앱을 다시 실행하세요.'};return helperManager?{...helperManager.status,message:restartNotice||helperManager.status.message}:null;});
ipcMain.handle('native-media',async(event,message)=>{
  const entry=[...views.entries()].find(([,view])=>view.webContents===event.sender);
  const studioSender=entry?.[0]==='studio'&&new URL(event.sender.getURL()).origin==='http://127.0.0.1:5006';
  if(!entry||event.senderFrame!==event.sender.mainFrame||(!studioSender&&!native.trusted(event.sender.getURL())))return {success:false,error:'사이트 화면에서만 사용할 수 있습니다.'};
  try{
    await helperReady;
    if(studioSender){if(message?.action==='studioListReferences')return {success:true,data:await native.helper('references')};if(message?.action==='studioListDownloads')return {success:true,data:[]};return {success:false,error:'제작 화면의 읽기 동작만 허용합니다.'};}
    if(!message||JSON.stringify(message).length>200000)throw Error('요청 크기 초과');
    if(message.action==='studioSaveReference'){
      if(!native.trusted(message.reference?.permalink))throw Error('지원 사이트 게시물 주소가 필요합니다.');
      await native.helper('references/import',{reference:message.reference});const studioView=views.get('studio');if(studioView&&!studioView.webContents.isDestroyed())studioView.webContents.send('native-collection-changed');return {success:true};
    }
    if(message.action==='getMediaUrls')return {success:true,urls:[]};
    if(message.action==='download'){
      const url=new URL(message.url);if(!['https:','blob:'].includes(url.protocol)||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\])/.test(url.hostname))throw Error('지원하지 않는 미디어 주소');
      event.sender.downloadURL(url.href);return {success:true,downloadId:Date.now()};
    }
    return {success:false,error:'전용 앱에서 아직 지원하지 않는 동작입니다.'};
  }catch(error){return {success:false,error:error.message};}
});
app.whenReady().then(async()=>{if(!ownsApp||!profileGuard.acquired)return;persistence=manageSessions(session);helperManager=new HelperManager({dataDir:app.getPath('userData'),sourceDir:path.join(__dirname,'..','downloader')});helperReady=helperManager.start();helperReady.catch(error=>console.error(error.message));win=new BaseWindow({width:1380,height:920,title:'인스레드 치트키 · 타코 브라우저'});toolbar=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});win.contentView.addChildView(toolbar);toolbar.webContents.loadFile(path.join(__dirname,'toolbar.html'));ipcMain.on('site-select',(event,key)=>{if(event.sender===toolbar.webContents)select(key);});ipcMain.on('site-action',(event,action)=>{if(event.sender!==toolbar.webContents||!active)return;if(action==='reload')active.webContents.reload();if(action==='back'&&active.webContents.navigationHistory.canGoBack())active.webContents.navigationHistory.goBack();if(action==='external')shell.openExternal(active.webContents.getURL());});win.on('resize',resize);let allowClose=false;win.on('close',event=>{if(allowClose)return;event.preventDefault();persistence.flush().catch(error=>console.error(error.message)).finally(()=>{allowClose=true;if(win)win.close();});});win.on('closed',()=>{for(const view of views.values())view.webContents.close();toolbar.webContents.close();views.clear();win=null;});select('threads');if(!app.isPackaged)devWatcher=watchDevelopment({root:__dirname,report:message=>{restartNotice=message;console.error(message);},busy:async()=>{for(const view of views.values()){if(view.webContents.isDestroyed())continue;if(/(?:two_step_verification|auth_platform|challenge|accounts\/login|accounts\.meta\.com|accounts\.google\.com)/i.test(view.webContents.getURL()))return true;try{if(await view.webContents.executeJavaScript(`!!Array.from(document.querySelectorAll('[contenteditable="true"],textarea,input[type="password"]')).find(el=>el.getBoundingClientRect().width>0&&(el.value||el.innerText||'').trim().length>0)`))return true;}catch{return true;}}return false;},restart:async()=>{restartNotice='변경 적용 중 · 앱 자동 재실행';await persistence.flush();app.relaunch();app.quit();}});});
app.on('window-all-closed',()=>app.quit());

let flushing=false;
app.on('before-quit',event=>{if(flushing)return;event.preventDefault();flushing=true;Promise.resolve(persistence?.flush()).catch(error=>console.error(error.message)).finally(()=>{devWatcher?.dispose();persistence?.dispose();app.quit();});});
