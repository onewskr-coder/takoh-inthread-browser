const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.STUDIO_JSDOM||'jsdom');
const html=fs.readFileSync(path.join(__dirname,'studio_web/index.html'),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,20));
async function open(saved){
  const dom=new JSDOM(html,{url:'http://127.0.0.1:5006/studio/',runScripts:'outside-only'}),w=dom.window,d=w.document,calls=[];
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLMediaElement.prototype.load=()=>{};
  if(saved)for(const [key,value]of Object.entries(saved))w.localStorage.setItem(key,value);
  w.fetch=async(url,options={})=>{calls.push({url,options});let result=[];if(/connections-status|kie\/settings/.test(url))result={apis:{},configured:false};if(/discovery\/gemini-settings/.test(url))result={model:'saved-search-api',cli_model:'saved-search-cli'};if(/\/jobs\//.test(url))result={id:'a'.repeat(32),status:'analysis_ready',analysis:{},media:{duration:10},publication:{}};return {ok:true,status:200,json:async()=>result};};
  for(const name of ['studio.js'])w.eval(fs.readFileSync(path.join(__dirname,'studio_web',name),'utf8')+(name==='studio.js'?';window.testCredentials=credentials;window.testSetJob=()=>{job={id:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",analysis:{},source_text:"source",media:{duration:10},publication:{}};productDirty=false;};':''));
  await wait();return {dom,w,d,calls};
}
(async()=>{
  const {dom,w,d,calls}=await open();
  const set=(id,value)=>{d.getElementById(id).value=value;};
  set('ai-provider','codex_cli');d.getElementById('ai-provider').dispatchEvent(new w.Event('change'));set('model','writer-model');set('fallback-model','__none__');
  d.getElementById('ai-role-writing-assign').click();
  set('ai-provider','openai_api');d.getElementById('ai-provider').dispatchEvent(new w.Event('change'));set('model','vision-model');set('key','not-a-real-key');d.getElementById('ai-role-analysis-assign').click();
  const writer=w.testCredentials('writing'),analyzer=w.testCredentials('analysis');
  assert.equal(writer.provider,'codex_cli');assert.equal(writer.model,'writer-model');assert.equal(writer.fallback_model,'writer-model');assert.equal(writer.key,'');
  assert.equal(analyzer.provider,'openai_api');assert.equal(analyzer.model,'vision-model');assert.equal(analyzer.key,'not-a-real-key');assert.equal(analyzer.fallback_model,'');
  set('model','changed-editor-only');assert.equal(w.testCredentials('writing').model,'writer-model');assert.equal(w.testCredentials('analysis').model,'vision-model');
  const saved={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);saved[k]=w.localStorage.getItem(k);}assert(!JSON.stringify(saved).includes('not-a-real-key'));
  const search=d.getElementById('ai-role-search-provider');search.value='serpapi';search.dispatchEvent(new w.Event('change'));assert.equal(d.getElementById('discovery-provider').value,'serpapi');assert.equal(w.localStorage.getItem('takoh-search-provider'),'serpapi');saved['takoh-search-provider']='serpapi';
  w.document.dispatchEvent(new w.CustomEvent('ai-search-settings-loaded',{detail:{model:'confirmed-api',cli_model:'confirmed-cli'}}));search.value='antigravity_search';search.dispatchEvent(new w.Event('change'));assert(d.getElementById('ai-role-search-detail').textContent.includes('confirmed-cli'));
  w.testSetJob();
  await d.getElementById('draft').onclick();await d.getElementById('analyze').onclick();
  const draft=calls.find(c=>c.url.endsWith('/draft')),analysis=calls.find(c=>c.url.endsWith('/analyze'));assert(draft);assert(analysis);assert.equal(JSON.parse(draft.options.body).provider,'codex_cli');assert.equal(JSON.parse(analysis.options.body).model,'vision-model');
  assert(!calls.some(c=>/search\.json|googleapis|\/discovery\?/.test(c.url)));dom.window.close();
  const reload=await open(saved);assert.equal(reload.w.testCredentials('writing').model,'writer-model');assert.equal(reload.w.testCredentials('analysis').key,'');assert.equal(reload.d.getElementById('discovery-provider').value,'serpapi');reload.dom.window.close();
  console.log('PASS: independent writing/analysis routing, actual action payloads, reload, no key storage/leak, CLI sub off, persisted search selection, zero live provider calls');
})().catch(error=>{console.error(error);process.exitCode=1;});
