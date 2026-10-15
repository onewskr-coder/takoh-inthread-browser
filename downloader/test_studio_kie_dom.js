const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.STUDIO_JSDOM||'jsdom');
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'studio_web/index.html'),'utf8').replace('__STUDIO_TOKEN__','fixture-token'),{url:'http://127.0.0.1:5006/studio/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,calls=[];let stored=false,approved=false;
const entry={id:'kie_fixture',provider:'kie_api',model_id:'fixture-model',name:'Fixture',has_audio:false};
w.confirm=()=>approved;
w.fetch=async(url,options={})=>{
  const p=String(url).replace('/studio/','');const body=options.body?JSON.parse(options.body):null;calls.push({p,body});
  let data={};
  if(['models','jobs','references','saved-references','styles'].includes(p))data=[];
  if(p==='kie/settings'){if(body?.key)stored=true;data={configured:stored,auth_verified:false,generation_verified:false,models:[],details:{}};}
  if(p==='models/refresh')data=[entry];
  if(p==='kie/model/inspect')data={has_vision:true,pricing:'fixture price'};
  if(p==='kie/credit')data={credits:25,checked_at:1};
  if(p==='kie/translate')data={text:'한국어 번역 결과'};
  if(p==='kie/plan')data={model:'fixture-model',frame_limit:2,api_usage_estimate:'최대 1회',pricing:'fixture price'};
  if(p==='connections-status')data={apis:{},clis:{}};
  if(p==='usage')data={groups:[]};
  return {ok:true,status:200,json:async()=>data};
};
const tick=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
  try{
    w.eval(fs.readFileSync(path.join(__dirname,'studio_web/studio.js'),'utf8'));await tick();
    assert.equal(calls.some(c=>c.p==='kie/credit'||c.p==='models/refresh'),false,'no automatic credit/model request');
    d.getElementById('ai-provider').value='kie_api';d.getElementById('ai-provider').dispatchEvent(new w.Event('change'));await tick();
    assert.equal(d.getElementById('fallback-model').disabled,true);
    d.getElementById('kie-key').value='fake-local-key';d.getElementById('kie-save-key').click();await tick();
    assert(stored);assert.equal(d.getElementById('kie-key').value,'');
    d.getElementById('refresh-models').click();await tick();
    assert.equal(d.getElementById('model').value,'fixture-model');
    d.getElementById('kie-inspect-model').click();await tick();assert(calls.some(c=>c.p==='kie/model/inspect'));
    const params={provider:'kie_api',model:'fixture-model'};
    await assert.rejects(w.api('jobs/fixture/analyze',params),/취소/);
    assert.equal(calls.some(c=>c.p==='jobs/fixture/analyze'),false);
    approved=true;await w.api('jobs/fixture/analyze',params);
    const generated=calls.find(c=>c.p==='jobs/fixture/analyze');assert.equal(generated.body.kie_frame_limit,2);assert.equal(generated.body.kie_approved,true);
    d.getElementById('kie-translate-input').value='source';d.getElementById('kie-translate').click();await tick();assert.equal(d.getElementById('kie-translation-result').textContent,'한국어 번역 결과');
    d.getElementById('kie-credit').click();await tick();assert(d.getElementById('kie-credit-status').textContent.includes('25'));
    console.log('PASS: KIE UI key save, dynamic models, inspect, confirmation cancel/approve, explicit credit fetch');
  }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
