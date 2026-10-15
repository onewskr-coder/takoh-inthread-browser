const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.STUDIO_JSDOM||'jsdom');
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'studio_web/index.html'),'utf8'),{url:'http://127.0.0.1:5005/studio/',runScripts:'outside-only'}),w=dom.window,d=w.document;
 const id1='a'.repeat(64),id2='b'.repeat(64);
 let refs=[
  {reference_id:id1,permalink:'https://www.threads.com/@owner/post/test',previewUrl:'/studio/references/test/thumbnail',videoUrls:['https://cdn.test/one.mp4','https://cdn.test/two.mp4'],imageUrls:[]},
  {reference_id:id2,permalink:'https://www.threads.com/@owner/post/test2',previewUrl:'/studio/references/test2/thumbnail',videoUrls:['https://cdn.test/three.mp4'],imageUrls:[]}
 ];
 const apiCalls=[];
 w.confirm=()=>true;
 w.fetch=async (url,opts)=>{
  const body=opts?.body?JSON.parse(opts.body):null;
  apiCalls.push({url,body});
  if(url==='/studio/acquire')return {ok:false,json:async()=>({error:'접근 제한'})};
  if(url==='/studio/references')return {ok:true,json:async()=>refs};
  if(url==='/studio/references/save')return {ok:true,json:async()=>({saved:true,saved_count:body.ids.length,total:body.ids.length,already_saved:false})};
  if(url==='/studio/references/delete'){refs=refs.filter(r=>!body.ids.includes(r.reference_id));return {ok:true,json:async()=>({deleted:body.ids.length,collection:body.collection})};}
  return {ok:true,json:async()=>[]};
 };
 w.eval(fs.readFileSync(path.join(__dirname,'studio_web/studio.js'),'utf8')+'\nwindow.reviewRefresh=refreshReferences;');

 await flush();await flush();
 assert.equal(d.querySelectorAll('.ref-thumb-wrap').length,2);
 assert.equal(d.querySelectorAll('.ref-card-body').length,2);
 assert.equal(d.querySelectorAll('.ref-select-checkbox').length,2);
 assert.equal(d.querySelector('.ref-thumb-img').getAttribute('src'),refs[0].previewUrl);
 const select=d.querySelector('#references select');select.value='1';select.dispatchEvent(new w.Event('change'));
 await d.querySelector('#references .btn-prepare-ref').onclick(new w.Event('click'));
 assert.match(d.querySelector('.ref-status-text').textContent,/획득 실패.*접근 제한/);
 assert.equal(d.getElementById('source').value,refs[0].permalink);
 await w.reviewRefresh();
 assert.equal(d.querySelector('#references select').value,'1');
 assert.match(d.querySelector('.ref-status-text').textContent,/획득 실패/);

 // Test checking individual checkboxes and batch saving to library
 const checkboxes=d.querySelectorAll('.ref-select-checkbox');
 assert.equal(d.getElementById('save-selected-references').disabled,true);
 assert.equal(d.getElementById('delete-selected-references').disabled,true);
 checkboxes[0].checked=true;checkboxes[0].dispatchEvent(new w.Event('change'));
 assert.equal(d.getElementById('save-selected-references').disabled,false);
 assert.equal(d.getElementById('save-selected-references').textContent,'선택 보관함에 담기 (1)');
 assert.equal(d.getElementById('delete-selected-references').textContent,'선택 삭제 (1)');

 // Test select-all checkbox and batch save
 const selectAll=d.getElementById('select-all-references');
 selectAll.checked=true;selectAll.dispatchEvent(new w.Event('change'));
 assert.equal(d.getElementById('save-selected-references').textContent,'선택 보관함에 담기 (2)');
 d.getElementById('save-selected-references').click();
 await flush();await flush();
 const saveCall=apiCalls.find(c=>c.url==='/studio/references/save');
 assert.deepEqual(saveCall.body,{ids:[id1,id2]});
 assert.equal(d.getElementById('save-selected-references').disabled,true);

 // Test batch delete of checked item
 const checkboxesAfter=d.querySelectorAll('.ref-select-checkbox');
 checkboxesAfter[0].checked=true;checkboxesAfter[0].dispatchEvent(new w.Event('change'));
 d.getElementById('delete-selected-references').click();
 await flush();await flush();
 const deleteCall=apiCalls.find(c=>c.url==='/studio/references/delete');
 assert.deepEqual(deleteCall.body,{collection:'collected',ids:[id1]});
 assert.equal(d.querySelectorAll('.reference-card').length,1);

 // Test rapid tab switching (collected <-> saved) discards stale responses and pins delete targets
 const idSaved1='c'.repeat(64),idSaved2='d'.repeat(64);
 let savedRefs=[
  {reference_id:idSaved1,permalink:'https://www.threads.com/@owner/post/saved1',previewUrl:'/studio/saved-references/saved1/thumbnail',videoUrls:['https://cdn.test/s1.mp4'],imageUrls:[]},
  {reference_id:idSaved2,permalink:'https://www.threads.com/@owner/post/saved2',previewUrl:'/studio/saved-references/saved2/thumbnail',videoUrls:['https://cdn.test/s2.mp4'],imageUrls:[]}
 ];
 let deferredCollectedResolve=null;
 w.fetch=async (url,opts)=>{
  const body=opts?.body?JSON.parse(opts.body):null;
  apiCalls.push({url,body});
  if(url==='/studio/references'){
   if(!deferredCollectedResolve){
    return new Promise(resolve=>{deferredCollectedResolve=()=>resolve({ok:true,json:async()=>refs});});
   }
   return {ok:true,json:async()=>refs};
  }
  if(url==='/studio/saved-references')return {ok:true,json:async()=>savedRefs};
  if(url==='/studio/references/delete'){
   if(body.collection==='saved')savedRefs=savedRefs.filter(r=>!body.ids.includes(r.reference_id));
   else refs=refs.filter(r=>!body.ids.includes(r.reference_id));
   return {ok:true,json:async()=>({deleted:body.ids.length,collection:body.collection})};
  }
  return {ok:true,json:async()=>[]};
 };

 // Trigger slow collected load, then immediately switch to saved tab
 d.getElementById('show-collected-references').click();
 assert.ok(deferredCollectedResolve,'slow collected request should be pending');
 d.getElementById('show-saved-references').click();
 await flush();await flush();
 // Saved tab should be rendered with 2 saved items
 assert.equal(d.getElementById('show-saved-references').getAttribute('aria-pressed'),'true');
 assert.equal(d.querySelectorAll('.reference-card').length,2);
 assert.equal(d.querySelector('.reference-card').dataset.collection,'saved');
 assert.equal(d.querySelector('.reference-card').dataset.refId,idSaved1);

 // Now resolve the stale collected response; it must be discarded and NOT overwrite the saved tab
 deferredCollectedResolve();
 await flush();await flush();
 assert.equal(d.querySelectorAll('.reference-card').length,2);
 assert.equal(d.querySelector('.reference-card').dataset.collection,'saved');
 assert.equal(d.querySelector('.reference-card').dataset.refId,idSaved1);

 // Verify delete-all on saved tab sends fixed saved collection and exact saved IDs
 apiCalls.length=0;
 d.getElementById('delete-all-references').click();
 await flush();await flush();
 const savedDeleteAllCall=apiCalls.find(c=>c.url==='/studio/references/delete');
 assert.deepEqual(savedDeleteAllCall.body,{collection:'saved',ids:[idSaved1,idSaved2],all:true,confirm_all:true});
 assert.equal(d.querySelectorAll('.reference-card').length,0);

 dom.window.close();console.log('Reference flow: acquisition failure, source, selected media, batch save/delete, and stale-response/delete pinning verified.');
})();
