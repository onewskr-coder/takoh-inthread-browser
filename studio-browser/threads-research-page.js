/* Invoke only a visible normal close control offered by the site. Never remove DOM. */
function closeThreadsPrompt(){
  const inView=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;};
  const labels=[...document.querySelectorAll('svg[aria-label],button[aria-label],[role="button"][aria-label]')].filter(e=>/^(닫기|close|dismiss)$/i.test(e.getAttribute('aria-label')||''));
  for(const icon of labels){const button=icon.closest('button,[role="button"]');if(!button||!inView(button))continue;let scope=button.parentElement,belongs=false;for(let n=0;scope&&scope!==document.body&&n<9;n++,scope=scope.parentElement){const text=scope.innerText||scope.textContent||'';if(/Threads에서 소통|Instagram으로 계속|Join Threads|Continue with Instagram|Threads 이용 약관/.test(text)&&text.length<2000){belongs=true;break;}}
    if(!belongs)continue;const r=button.getBoundingClientRect(),x=Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),y=Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)),hit=document.elementFromPoint(x,y);if(!hit||!button.contains(hit))continue;button.click();return {clicked:true,method:'site_close_button'};
  }
  return {clicked:false};
}
if(typeof module!=='undefined')module.exports={closeThreadsPrompt};
