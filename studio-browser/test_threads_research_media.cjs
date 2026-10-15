const assert=require('node:assert/strict');
const {mediaState,groupMedia,matchMedia,safeMediaUrl}=require('./threads-research-media.cjs');
const post=(id,views,url='https://scontent.cdninstagram.com/a.jpg?token='+id)=>({id,text:'상품 사용법',media_checked:true,media_assets:[{kind:'image',source_url:url,preview_url:url}],media_preview:{data_url:'data:image/jpeg;base64,test',sha256:id},display_metrics:{views,likes:1}});
assert.equal(mediaState({text:'상품 링크',media_checked:true,media_assets:[]}), 'excluded');
assert.equal(mediaState({thumbnail_url:'https://scontent.cdninstagram.com/avatar.jpg'}),'pending');
assert.equal(mediaState({...post('a',100),evidence_scope:'visible_author_reply'}),'excluded');
assert.equal(mediaState({...post('a',100),media_preview:null}),'pending');
assert.equal(mediaState({...post('a',100),text:'오늘 날씨가 좋다'}),'review');
assert.equal(safeMediaUrl('https://cdninstagram.com.evil.test/a.jpg'),null);
let a=post('a',100),b=post('b',10000),c=post('c',500,'https://scontent.cdninstagram.com/different.jpg');
let groups=groupMedia([a,b,c]);assert.equal(groups.length,2);assert.equal(groups[0].representative.id,'b');assert.equal(groups[0].duplicate_count,1);assert.equal(groups[0].members.length,2);
assert.equal(groupMedia([a,{...b,separate_media:true},c]).length,3);
assert.equal(matchMedia(a,c),null); // Same product wording is never sufficient.
assert.equal(groupMedia([a,{...b,display_metrics:{views:null,likes:1000}}])[0].representative.id,'a');
const x={...a,media_assets:[{kind:'image',source_url:'https://scontent.cdninstagram.com/x.jpg'}],media_preview:{hash:'0f0f0f0f0f0f0f0f',aspect:1}},y={...b,media_assets:[{kind:'image',source_url:'https://scontent.cdninstagram.com/y.jpg'}],media_preview:{hash:'0f0f0f0f0f0f0f0e',aspect:1}};
assert.equal(matchMedia(x,y),'similar_preview');assert.equal(matchMedia(x,{...y,media_preview:{...y.media_preview,aspect:2}}),null);
assert.equal(matchMedia({...x,media_assets:[...x.media_assets,{source_url:'https://scontent.cdninstagram.com/2.jpg'}]},{...y,media_assets:[...y.media_assets,{source_url:'https://scontent.cdninstagram.com/3.jpg'}]}),null);
console.log('PASS: media gate, pending previews, reply exclusion, exact/visual grouping, highest-view representative, separate override, distinct carousel protection');
