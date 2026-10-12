const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
for(const mode of ['success','invalidated','missing','closed','no-runtime','runtime-getter']){
 let listener;const messages=[];let attempts=0;
 const runtime={id:'own',sendMessage:(message,callback)=>{attempts++;assert.equal(message.action,'studioQueueUpload');if(mode==='invalidated')throw new Error('Extension context invalidated.');if(mode==='closed'){runtime.lastError={message:'The message port closed'};callback();runtime.lastError=null;}else callback(mode==='missing'?undefined:{success:true,data:{id:'saved'}});}};
 const window={addEventListener:(type,fn)=>listener=fn,postMessage:message=>messages.push(message)},location={origin:'http://127.0.0.1:5005'};
 const api={runtime:mode==='no-runtime'?undefined:runtime,storage:{onChanged:{addListener:()=>{}}}};if(mode==='runtime-getter')Object.defineProperty(api,'runtime',{get(){throw new Error('Extension context invalidated.');}});
 vm.runInNewContext(fs.readFileSync('studio-local-bridge.js','utf8'),{window,location,chrome:api});
 listener({source:window,origin:location.origin,data:{source:'takoh-studio-ui',kind:'upload',requestId:'request',packet:{id:'saved'}}});
 const result=messages.find(m=>m.requestId==='request');assert.ok(result);assert.equal(result.success,mode==='success');if(mode!=='success')assert.ok(result.error);
 if(['invalidated','no-runtime','runtime-getter'].includes(mode)){listener({source:window,origin:location.origin,data:{source:'takoh-studio-ui',kind:'upload',requestId:'again',packet:{id:'saved'}}});assert.equal(attempts,mode==='invalidated'?1:0);assert.equal(messages.find(m=>m.requestId==='again').success,false);}
}
console.log('Local bridge: success, invalidated context, missing response and closed message port passed.');
