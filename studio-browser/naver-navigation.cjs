// Naver's login finalizer can return an HTTP URL. Upgrade only the known creator host.
function secureNaverTarget(value){
  try{const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='clipcreators.naver.com'||url.port||url.username||url.password)return null;url.protocol='https:';return url.href;}catch{return null;}
}
function installNaverNavigation(contents){
  const navigate=(event,url)=>{const secure=secureNaverTarget(url);if(!secure)return;event.preventDefault();setImmediate(()=>{if(!contents.isDestroyed())contents.loadURL(secure).catch(error=>console.error('Naver HTTPS navigation:',error.message));});};
  contents.on('will-navigate',navigate);contents.on('will-redirect',navigate);
}
module.exports={secureNaverTarget,installNaverNavigation};
