const assert=require('node:assert/strict');
const {stopResearchWindow}=require('./threads-research.cjs');
stopResearchWindow(null);
stopResearchWindow({isDestroyed:()=>true,get webContents(){throw Error('destroyed window accessed');}});
stopResearchWindow({isDestroyed:()=>false,webContents:{isDestroyed:()=>true,stop(){throw Error('destroyed contents stopped');}}});
let stopped=0;stopResearchWindow({isDestroyed:()=>false,webContents:{isDestroyed:()=>false,stop(){stopped++;}}});assert.equal(stopped,1);
console.log('PASS: closed research windows skipped; live page stopped exactly once');
