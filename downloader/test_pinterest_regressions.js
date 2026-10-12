const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const id = '1129488781582830054';
const media = 'https://v1.pinimg.com/videos/iht/expMp4/19/7c/24/197c2474163e86679307ad7bcbbacc18_720w.mp4';
const pin = {'@type':'VideoObject','@id':`https://www.pinterest.com/pin/${id}/`,contentUrl:media};
let scripts = [];
let fetches = 0;
let helperMode = false;
const doc = {querySelectorAll: () => scripts};
const context = {
  window: {TAKCore: {config:{},showToast(){},triggerDownload(){}}},
  location: {href:`https://kr.pinterest.com/pin/${id}/`,origin:'https://kr.pinterest.com'},
  document: doc, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  chrome: {storage:{local:{get:(keys,cb)=>cb({})}}},
  fetch: async url => {fetches++;return String(url).includes('/pinterest/resolve') ?
    {ok:true,json:async()=>({pin_id:id,media_url:media})} : {ok:true,text:async()=> 'fixture'};},
  DOMParser: class {parseFromString() {return {querySelectorAll:()=>helperMode?[]:[{textContent:JSON.stringify(pin)}]};}}
};
vm.createContext(context);
const source = fs.readFileSync('content-pinterest.js','utf8').replace('  // Register Pinterest platform processor',
  '  window.testHooks = {findPinId, structuredVideoUrl, resolveVideoUrl};\n  // Register Pinterest platform processor');
vm.runInContext(source, context);
const {findPinId, structuredVideoUrl, resolveVideoUrl} = context.window.testHooks;
const video = {src:'blob:https://kr.pinterest.com/fixture',currentSrc:'blob:https://kr.pinterest.com/fixture',querySelectorAll:()=>[]};
(async()=>{
  scripts = [{textContent:JSON.stringify(pin)}];
  assert.equal(await resolveVideoUrl(video,id), media, 'real pin blob must resolve to its structured MP4');
  assert.equal(fetches,0);
  scripts = [{textContent:JSON.stringify({'@graph':[pin]})}];
  assert.equal(structuredVideoUrl(doc,id),media);
  assert.equal(structuredVideoUrl(doc,'999'),'','must not use another pin');
  scripts = [{textContent:'invalid JSON'}];
  assert.equal(structuredVideoUrl(doc,id),'');
  assert.equal(await resolveVideoUrl(video,id),media,'detail-page fallback');
  assert.equal(fetches,1);
  assert.equal(await resolveVideoUrl(video,''),'','no ID means no guessed source');
  assert.equal(await resolveVideoUrl({...video,querySelectorAll:()=>[{src:media}]},id),media,'source element');
  const card = {querySelector:()=>({href:'https://kr.pinterest.com/pin/999/'})};
  assert.equal(findPinId({closest:s=>s.startsWith('[data-test-id')?card:null}),'999','recommendation identity');
  assert.equal(findPinId({closest:s=>s.startsWith('[data-test-id')?{querySelector:()=>null}:null}), '','unidentified card must not use detail ID');
  assert.equal(findPinId({closest:()=>null}),id,'detail identity');
  assert.equal(findPinId({getAttribute:()=> 'duplo-hls-video',closest:s=>s.startsWith('[data-test-id')?{querySelector:()=>null}:null}),id,'main player inside anonymous listitem');
  const alias = {'@type':'VideoObject','@id':'https://in.pinterest.com/pin/bathroom-bliss--881016745874551311/',contentUrl:media};
  const aliasDoc = {querySelector:()=>({href:alias['@id']}),querySelectorAll:()=>[{textContent:JSON.stringify(alias)}]};
  assert.equal(structuredVideoUrl(aliasDoc,'901071837963839661',true),media,'canonical repin slug');
  assert.equal(structuredVideoUrl(aliasDoc,'999'),'', 'canonical alias must be explicitly scoped');
  scripts = [];
  helperMode = true;
  assert.equal(await resolveVideoUrl(video,id),media,'empty page metadata falls back to helper API');
  console.log('Pinterest regressions passed: blob, pin identity, graph, malformed JSON, detail fallback, source element');
})().catch(e=>{console.error(e);process.exitCode=1;});
