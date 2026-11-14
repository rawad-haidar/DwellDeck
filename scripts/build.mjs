import fs from 'node:fs/promises';
const file=new URL('../dwelldeck.js',import.meta.url);
const current=await fs.readFile(file,'utf8');
const marker='// Original layout generator:';
const offset=current.indexOf(marker);
if(offset<0)throw Error('Embedded layout data header not found');
const core=await fs.readFile(new URL('../original-layout-core.mjs',import.meta.url),'utf8');
await fs.writeFile(file,current.slice(0,offset)+core);
console.log('Built dwelldeck.js from embedded layout data and original-layout-core.mjs');
