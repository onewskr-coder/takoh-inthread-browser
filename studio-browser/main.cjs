const {app,BaseWindow,BrowserWindow,WebContentsView,ipcMain,shell,dialog,session}=require('electron');
const path=require('node:path');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
const fs=require('node:fs');
const crashLog = path.join(__dirname, 'crash_reason.log');
process.on('uncaughtException', err => fs.appendFileSync(crashLog, `[uncaughtException] ${err.stack}\n`));
process.on('unhandledRejection', err => fs.appendFileSync(crashLog, `[unhandledRejection] ${err?.stack || err}\n`));
app.on('before-quit', () => fs.appendFileSync(crashLog, `[before-quit] stack: ${new Error().stack}\n`));
app.on('will-quit', () => fs.appendFileSync(crashLog, `[will-quit]\n`));
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
const {createThreadsUploadManager}=require('./threads-upload.cjs');
const {createThreadsResearch}=require('./threads-research.cjs');
let helperManager,helperReady,uploadManager,researchManager;
const ownsApp=app.requestSingleInstanceLock();
const {lockProfile}=require('./profile-lock.cjs');
const profileGuard=ownsApp?lockProfile(profilePath):{acquired:false,release(){}};
app.on('will-quit',()=>profileGuard.release());
if(!ownsApp||!profileGuard.acquired){console.error('QUIT REASON:',{ownsApp,acquired:profileGuard.acquired});app.quit();}else{app.on('second-instance',()=>{if(win){win.show();win.focus();}});}
const sites={browser:'https://www.facebook.com/',threads:'https://www.threads.com/',instagram:'https://www.instagram.com/',naver_clip:'https://clipcreators.naver.com/web',tiktok:'https://www.tiktok.com/tiktokstudio/upload',pinterest:'https://www.pinterest.com/',studio:'http://127.0.0.1:5006/studio/'};
let win,toolbar,active,currentWork='';const views=new Map();const recentDownloads=new Map();
function trackSiteDownloads(contents){
  if(contents.session.__takohDownloadsTracked)return;
  contents.session.__takohDownloadsTracked=true;
  contents.session.on('will-download',(_event,item,webContents)=>{
    const id=Date.now()+Math.floor(Math.random()*1000);
    const source=webContents&&!webContents.isDestroyed()?webContents.getURL():'';
    const updateEntry=()=>{
      const savePath=item.getSavePath();
      if(!savePath)return;
      const name=path.basename(savePath);
      const ext=path.extname(name).toLowerCase();
      const type=['.jpg','.jpeg','.png','.webp','.gif','.bmp'].includes(ext)?'image':'video';
      recentDownloads.set(id,{
        downloadId:id,
        name,
        path:savePath,
        source,
        type,
        completed:item.getState()==='completed',
        modified:Date.now()
      });
    };
    item.on('updated',updateEntry);
    item.once('done',(_e,state)=>{
      updateEntry();
      if(state==='completed'){
        const studioView=views.get('studio');
        if(studioView&&!studioView.webContents.isDestroyed())studioView.webContents.send('native-collection-changed');
      }
    });
  });
}
let quickSidebarOpen=false;
let quickSidebarWidth=560;
function getClampedSidebarWidth(mainW){
  const minW=360;
  const maxW=Math.max(minW,Math.min(1100,mainW-300));
  return Math.max(minW,Math.min(maxW,Math.round(Number(quickSidebarWidth)||560)));
}
function resize(){
  if(!win)return;
  const [width,height]=win.getContentSize();
  toolbar.setBounds({x:0,y:0,width,height});
  const mainX=168,mainY=96,mainW=Math.max(0,width-168),mainH=Math.max(0,height-124);
  const studioView=views.get('studio');
  if(quickSidebarOpen&&active&&active!==studioView&&studioView){
    const sideW=getClampedSidebarWidth(mainW);
    const leftW=Math.max(0,mainW-sideW);
    active.setBounds({x:mainX,y:mainY,width:leftW,height:mainH});
    studioView.setBounds({x:mainX+leftW,y:mainY,width:sideW,height:mainH});
  }else{
    active?.setBounds({x:mainX,y:mainY,width:mainW,height:mainH});
  }
}
async function recoverStudioPage() {
  const view=views.get('studio');
  if(!view||view.webContents.isDestroyed())return;
  const url=view.webContents.getURL();
  // Only recover failed documents; keep working pages and unsaved drafts intact.
  if(view.loadFailed||!url||url.startsWith('chrome-error://')) {
    view.initialLoad=view.webContents.loadURL(sites.studio);
    await view.initialLoad;
  }
}
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
function getOrCreateView(key){
  if(!sites[key])return null;
  let view=views.get(key);
  if(!view){
    view=new WebContentsView({webPreferences:{partition:key==='studio'?'persist:studio':'persist:sites',preload:path.join(__dirname,'site-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    views.set(key,view);
    trackSiteDownloads(view.webContents);
    view.loadFailed=false;
    view.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)view.loadFailed=true;});
    view.webContents.on('did-finish-load',()=>{view.loadFailed=false;});
    view.webContents.on('render-process-gone',(_event,details)=>{restartNotice='페이지 표시 중단 · '+details.reason+' · 새로고침으로 다시 열 수 있습니다.';console.error('Renderer stopped:',key,details.reason,details.exitCode);});
    view.webContents.on('unresponsive',()=>{restartNotice='페이지 응답 대기 중 · 작성 내용 보존을 위해 자동 새로고침하지 않습니다.';});
    view.webContents.on('responsive',()=>{restartNotice='';});
    view.webContents.on('dom-ready',async()=>{try{if(native.trusted(view.webContents.getURL())){await helperReady;await view.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'..','downloader','content.css'),'utf8'));const currentPlatform=navigation.platform(view.webContents.getURL());if(currentPlatform)await view.webContents.executeJavaScript(native.injection(currentPlatform));}}catch(error){console.error('Site integration:',error.message);}});
    configurePopups(view.webContents,key);
    view.webContents.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.protocol==='http:'&&u.hostname!=='127.0.0.1')event.preventDefault();}catch{event.preventDefault();}});
    view.initialLoad=view.webContents.loadURL(sites[key]);
    view.initialLoad.catch(error=>console.error(error.message));
  }
  return view;
}
function select(key){
  if(!sites[key])return;
  const view=getOrCreateView(key);
  const studioView=views.get('studio');
  if(key==='studio'&&quickSidebarOpen){
    quickSidebarOpen=false;
    if(studioView&&!studioView.webContents.isDestroyed()){
      studioView.webContents.send('native-sidebar-mode',{enabled:false});
    }
  }
  if(active&&active===view){currentWork='';resize();return;}
  currentWork='';
  if(active&&!(quickSidebarOpen&&active===studioView))win.contentView.removeChildView(active);
  active=view;
  win.contentView.addChildView(view);
  if(quickSidebarOpen&&studioView&&active!==studioView){
    win.contentView.addChildView(studioView);
  }
  resize();
}
async function ensureThreadsView(platform='threads'){
  const siteKey = (platform==='instagram_reels'||platform==='instagram_carousel'||platform==='instagram') ? 'instagram'
    : platform==='naver_clip' ? 'naver_clip'
    : platform==='tiktok' ? 'tiktok'
    : 'threads';
  select(siteKey);
  const view=views.get(siteKey);
  if(!view||view.webContents.isDestroyed())throw new Error('업로드할 플랫폼 화면을 열지 못했습니다.');
  const currentUrl=view.webContents.getURL();
  const validPattern = siteKey==='instagram' ? /^https:\/\/(?:www\.)?instagram\.com\//i
    : siteKey==='naver_clip' ? /^https:\/\/clipcreators\.naver\.com\/web(?:[/?#]|$)/i
    : siteKey==='tiktok' ? /^https:\/\/(?:www\.)?tiktok\.com\/(?:tiktokstudio\/upload|upload|creator)/i
    : /^https:\/\/(?:www\.)?threads\.(?:com|net)\//i;
  if(view.loadFailed||!validPattern.test(currentUrl)){
    view.initialLoad=view.webContents.loadURL(sites[siteKey]);
  }
  await view.initialLoad;
  const end=Date.now()+60000;
  while(view.webContents.isLoadingMainFrame()){
    if(Date.now()>end)throw new Error('플랫폼 페이지 로딩 시간 초과');
    await new Promise(r=>setTimeout(r,300));
  }
  return view;
}
ipcMain.handle('site-location',event=>{if(event.sender!==toolbar?.webContents)return null;const key=[...views.entries()].find(([,view])=>view===active)?.[0];return {key,url:active?.webContents.getURL()||'',work:currentWork};});
ipcMain.handle('site-navigate',async(event,value)=>{if(event.sender!==toolbar?.webContents)return;try{const url=navigation.address(value);const key=navigation.platform(url)||'browser';select(key);await active.webContents.loadURL(url);return {success:true};}catch(error){return {error:error.message};}});
ipcMain.handle('work-select',async(event,name)=>{if(event.sender!==toolbar?.webContents)return;const destination={discovery:{workspace:'discovery'},library:{workspace:'create',stage:'reference'},create:{workspace:'create',stage:'analysis'},publish:{workspace:'publish'},settings:{workspace:'settings'}}[name];if(!destination)return {error:'알 수 없는 작업 메뉴'};try{await helperReady;select('studio');currentWork=name;const target=active;await recoverStudioPage();await target.initialLoad;await target.webContents.executeJavaScript(`document.querySelector('[data-workspace="${destination.workspace}"]')?.click();`+(destination.stage?`document.querySelector('[data-production-stage="${destination.stage}"]')?.click();`:''));return {success:true};}catch(error){return {error:error.message};}});
ipcMain.handle('helper-status',async event=>{if(event.sender!==toolbar?.webContents)return null;if(helperManager?.status.state==='ready'&&!await helperManager.probe())helperManager.status={state:'failed',message:'도우미 연결 끊김 · 아래 재연결 버튼을 눌러주세요.'};return helperManager?{...helperManager.status,message:restartNotice||helperManager.status.message}:null;});
ipcMain.handle('helper-retry',async event=>{if(event.sender!==toolbar?.webContents||!helperManager)return {error:'도우미 관리자를 찾을 수 없습니다.'};try{helperReady=helperManager.retry();await helperReady;await recoverStudioPage();return {success:true,message:helperManager.status.message};}catch(error){return {error:error.message};}});
ipcMain.handle('native-media',async(event,message)=>{
  const entry=[...views.entries()].find(([,view])=>view.webContents===event.sender);
  const studioSender=entry?.[0]==='studio'&&new URL(event.sender.getURL()).origin==='http://127.0.0.1:5006';
  if(!entry||event.senderFrame!==event.sender.mainFrame||(!studioSender&&!native.trusted(event.sender.getURL())))return {success:false,error:'사이트 화면에서만 사용할 수 있습니다.'};
  try{
    await helperReady;
    if(studioSender){
      if(message?.action==='studioThreadsResearch'&&researchManager){if(JSON.stringify(message).length>10000)throw Error('요청 크기 초과');return {success:true,data:await researchManager.request(message.packet?.action,message.packet)};}
      if(message?.action==='studioBrowseThreadsForResearch'){select('threads');return {success:true};}
      if(message?.action==='studioListReferences')return {success:true,data:await native.helper('references')};
      if(message?.action==='studioListDownloads')return {success:true,data:[...recentDownloads.values()].filter(x=>x.completed&&x.path&&fs.existsSync(x.path)).sort((a,b)=>b.modified-a.modified)};
      if(message?.action==='studioGetDownload'){
        const found=recentDownloads.get(Number(message.downloadId))||[...recentDownloads.values()].find(x=>String(x.downloadId)===String(message.downloadId));
        if(!found||!found.path||!fs.existsSync(found.path))return {success:false,error:'다운로드한 파일을 찾을 수 없습니다.'};
        return {success:true,data:{path:found.path,name:found.name,source:found.source||''}};
      }
      if(message?.action==='studioQueueUpload'&&uploadManager)return {success:true,data:await uploadManager.queueUpload(message.packet)};
      if(message?.action==='studioUploadStatus'&&uploadManager)return {success:true,data:await uploadManager.status()};
      if(message?.action==='studioCancelUpload'&&uploadManager)return {success:true,data:await uploadManager.cancel(message.packet)};
      if(message?.action==='studioCloseSidebar'){
        quickSidebarOpen=false;
        const studioView=views.get('studio');
        if(studioView&&active!==studioView)win.contentView.removeChildView(studioView);
        resize();
        return {success:true};
      }
      if(message?.action==='studioExpandSidebar'){
        quickSidebarOpen=false;
        select('studio');
        currentWork='create';
        return {success:true};
      }
      if(message?.action==='studioResizeSidebar'){
        const reqW=Number(message.width??message.packet?.width);
        if(Number.isFinite(reqW)&&reqW>=340){
          quickSidebarWidth=reqW;
          resize();
        }
        return {success:true,data:{width:quickSidebarWidth}};
      }
      return {success:false,error:'제작 화면에서 지원하지 않는 동작입니다.'};
    }
    if(!message||JSON.stringify(message).length>200000)throw Error('요청 크기 초과');
    if(message.action==='studioFindProducts'){
      const origin=new URL(event.sender.getURL());if(!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(origin.hostname))throw Error('Threads 게시물에서만 제품 찾기를 시작할 수 있습니다.');
      const result=await researchManager.request('start-from-post',{url:message.url});select('studio');currentWork='discovery';await recoverStudioPage();const view=views.get('studio');await view.initialLoad;await view.webContents.executeJavaScript("document.querySelector('[data-workspace=research]')?.click();window.dispatchEvent(new Event('takoh-research-started'));");return {success:true,data:{started:true}};
    }
    if(message.action==='studioSaveReference'){
      if(!native.trusted(message.reference?.permalink))throw Error('지원 사이트 게시물 주소가 필요합니다.');
      await native.helper('references/import',{reference:message.reference});const studioView=views.get('studio');if(studioView&&!studioView.webContents.isDestroyed())studioView.webContents.send('native-collection-changed');return {success:true};
    }
    if(message.action==='studioCreateDirect'){
      if(!native.trusted(message.reference?.permalink))throw Error('지원 사이트 게시물 주소가 필요합니다.');
      await native.helper('references/import',{reference:message.reference}).catch(()=>{});
      const studioView=getOrCreateView('studio');
      if(active&&active!==studioView){
        quickSidebarOpen=true;
        win.contentView.addChildView(studioView);
        resize();
      }else{
        select('studio');
        currentWork='create';
      }
      if(studioView&&!studioView.webContents.isDestroyed()){
        await recoverStudioPage();
        await studioView.initialLoad;
        const end=Date.now()+15000;
        while(studioView.webContents.isLoadingMainFrame()&&Date.now()<end){
          await new Promise(r=>setTimeout(r,200));
        }
        studioView.webContents.send('native-collection-changed');
        studioView.webContents.send('native-create-direct',{...message.reference,quickSidebar:quickSidebarOpen});
      }
      return {success:true};
    }
    if(message.action==='getMediaUrls')return {success:true,urls:[]};
    if(message.action==='download'){
      const url=new URL(message.url);if(!['https:','blob:'].includes(url.protocol)||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\])/.test(url.hostname))throw Error('지원하지 않는 미디어 주소');
      event.sender.downloadURL(url.href);return {success:true,downloadId:Date.now()};
    }
    return {success:false,error:'전용 앱에서 아직 지원하지 않는 동작입니다.'};
  }catch(error){return {success:false,error:error.message};}
});
async function attemptGracefulQuit() {
  await researchManager?.prepareStop();
  if (uploadManager?.isBusy()) {
    const warning = 'Threads 휴먼터치 업로드가 진행 중입니다.';
    restartNotice = warning;
    dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: '업로드 진행 중',
      message: 'Threads 직접 업로드가 진행 중이므로 앱을 종료할 수 없습니다.',
      detail: warning + '\n\n진행 중인 업로드가 완료된 후 다시 종료해 주세요.',
      buttons: ['확인']
    });
    return false;
  }
  if (helperManager) {
    const stopRes = await helperManager.stop().catch(err => ({ stopped: false, warning: err.message }));
    if (stopRes && stopRes.stopped === false) {
      if (stopRes.busy) {
        restartNotice = stopRes.warning;
        dialog.showMessageBoxSync(win, {
          type: 'warning',
          title: '작업 진행 중',
          message: '도우미가 작업 중이므로 앱을 종료할 수 없습니다.',
          detail: stopRes.warning + '\n\n진행 중인 작업이 완료된 후 다시 종료해 주세요.',
          buttons: ['확인']
        });
        return false;
      }
      if (stopRes.warning) {
        restartNotice = stopRes.warning;
        dialog.showMessageBoxSync(win, {
          type: 'warning',
          title: '도우미 종료 안내',
          message: '도우미 프로세스를 안전하게 종료하지 못했습니다.',
          detail: stopRes.warning,
          buttons: ['확인']
        });
        return false;
      }
    }
  }
  return true;
}

app.whenReady().then(async()=>{if(!ownsApp||!profileGuard.acquired)return;persistence=manageSessions(session);researchManager=createThreadsResearch({dataDir:app.getPath('userData'),BrowserWindow,helper:native.helper});helperManager=new HelperManager({dataDir:app.getPath('userData'),sourceDir:path.join(__dirname,'..','downloader')});helperReady=helperManager.start();helperReady.catch(error=>console.error(error.message));uploadManager=createThreadsUploadManager({dataDir:app.getPath('userData'),ensureThreadsView});uploadManager.init().catch(error=>console.error(error.message));win=new BaseWindow({width:1380,height:920,title:'인스레드 치트키 · 타코 브라우저',show:true,skipTaskbar:false});win.setSkipTaskbar(false);win.show();win.moveTop();win.focus();toolbar=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});win.contentView.addChildView(toolbar);toolbar.webContents.loadFile(path.join(__dirname,'toolbar.html'));ipcMain.on('site-select',(event,key)=>{if(event.sender===toolbar.webContents)select(key);});ipcMain.on('site-action',(event,action)=>{if(event.sender!==toolbar.webContents||!active)return;if(action==='reload')active.webContents.reload();if(action==='back'&&active.webContents.navigationHistory.canGoBack())active.webContents.navigationHistory.goBack();if(action==='external')shell.openExternal(active.webContents.getURL());});
win.on('resize',resize);
require('./shutdown.cjs').installShutdown({app,win,prepare:attemptGracefulQuit,flush:()=>persistence.flush(),dispose:()=>{researchManager?.dispose();uploadManager?.dispose();devWatcher?.dispose();persistence?.dispose();},report:message=>{restartNotice=message;dialog.showMessageBoxSync(win,{type:'warning',message,buttons:['확인']});}});
win.on('closed',()=>{for(const view of views.values())if(!view.webContents.isDestroyed())view.webContents.close();if(!toolbar.webContents.isDestroyed())toolbar.webContents.close();views.clear();win=null;});
select('threads');
if(!app.isPackaged){
  devWatcher=watchDevelopment({root:__dirname,report:message=>{restartNotice=message;console.error(message);},busy:async()=>{if(uploadManager?.isBusy())return true;for(const view of views.values()){if(view.webContents.isDestroyed())continue;if(/(?:two_step_verification|auth_platform|challenge|accounts\/login|accounts\.meta\.com|accounts\.google\.com)/i.test(view.webContents.getURL()))return true;try{if(await view.webContents.executeJavaScript(`!!Array.from(document.querySelectorAll('[contenteditable="true"],textarea,input[type="password"]')).find(el=>el.getBoundingClientRect().width>0&&(el.value||el.innerText||'').trim().length>0)`))return true;}catch{return true;}}return false;},restart:async()=>{restartNotice='변경 적용 중 · 앱 자동 재실행';await persistence.flush();app.relaunch();app.quit();}});
  const mediaFiles=['content-core.js','content-studio.js','content-meta-main.js','content-threads.js','content-instagram.js','content-pinterest.js','content.css'].map(f=>path.join(__dirname,'..','downloader',f));
  const mediaSnap=()=>mediaFiles.map(f=>{try{const s=fs.statSync(f);return `${s.mtimeMs}:${s.size}`;}catch{return '';}}).join('|');
  let lastMediaSnap=mediaSnap();
  setInterval(()=>{
    const cur=mediaSnap();
    if(cur===lastMediaSnap)return;
    lastMediaSnap=cur;
    if(uploadManager?.isBusy())return;
    for(const [key,view] of views.entries()){
      if(key==='studio'||view.webContents.isDestroyed())continue;
      if(native.trusted(view.webContents.getURL())){
        view.webContents.reload();
      }
    }
  },1200).unref?.();
}
});
app.on('window-all-closed',()=>app.quit());

