const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'takoh-preview-layout-')));
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const css=fs.readFileSync(path.join(__dirname,'../downloader/studio_web/studio.css'),'utf8');
 const image=(w,h)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="red"/></svg>`);
 const win=new BrowserWindow({show:false,width:1600,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true}});
 try{
 for(const width of [1600,1100,800,500,320])for(const [platform,mode] of [['threads','feed'],['instagram','feed'],['instagram','short'],['tiktok','short'],['naver_clip','short']])for(const [iw,ih]of [[720,1280],[1920,1080],[1000,1000]]){
 win.setSize(width,1000);
 const html=`<style>${css}</style><div id="create-workspace"><div class="content-studio-layout"><aside class="content-live-preview" data-platform="${platform}" data-view="${mode}"><article class="platform-preview"><div class="preview-view-top">Reels</div><header><span class="preview-account">account</span></header><p class="preview-body">test caption</p><div class="preview-media"><img src="${image(iw,ih)}"></div><footer class="preview-engagement"><span><svg width="24" height="24" viewBox="0 0 24 24"></svg></span></footer></article></aside><div class="content-studio-controls">Editor</div></div></div>`;
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
 const m=await win.webContents.executeJavaScript(`(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {width:b.width,height:b.height,x:b.x,y:b.y}};return {frame:r('.platform-preview'),image:r('img'),panel:r('aside'),editor:r('.content-studio-controls'),icon:r('svg'),fit:getComputedStyle(document.querySelector('img')).objectFit}})()`);
 assert(Math.abs(m.frame.width-390)<1,JSON.stringify({width,mode,m}));
 assert.equal(m.fit,'contain');assert(Math.abs(m.icon.width-m.icon.height)<1);
 if(mode==='short')assert(Math.abs(m.frame.height-693.333)<1);
 else assert(Math.abs(m.image.width/m.image.height-iw/ih)<0.01,JSON.stringify({width,iw,ih,m}));
 if(width<=800)assert(m.editor.y>=m.panel.y+m.panel.height-1,JSON.stringify({width,m}));
 }
 console.log('PASS Chromium layout: 75 cases; widths 1600/1100/800/500/320; portrait/landscape/square; 390px canvas, 9:16 short viewport, intrinsic feed ratio, stacked controls, square icons');
 }finally{win.destroy();app.quit();}
}).catch(e=>{console.error(e);app.exit(1)});

