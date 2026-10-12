const fs=require('node:fs'),path=require('node:path');
function lockProfile(directory,pid=process.pid,alive=id=>{try{process.kill(id,0);return true;}catch(error){return error.code!=='ESRCH';}}){
  const file=path.join(directory,'app-profile.lock');
  for(let attempt=0;attempt<2;attempt++){
    try{const fd=fs.openSync(file,'wx');fs.writeFileSync(fd,String(pid));fs.closeSync(fd);return {acquired:true,release(){try{if(fs.readFileSync(file,'utf8')===String(pid))fs.unlinkSync(file);}catch{}}};}
    catch(error){if(error.code!=='EEXIST')throw error;const owner=Number(fs.readFileSync(file,'utf8'));if(!Number.isInteger(owner)||owner<=0||alive(owner))return {acquired:false,release(){}};fs.unlinkSync(file);}
  }
  return {acquired:false,release(){}};
}
module.exports={lockProfile};
