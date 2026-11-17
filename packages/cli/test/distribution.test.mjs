import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {bundledRoots} from '../dist/distribution.js';
const source={plugin:'kit',version:'1.2.3',repository:'https://github.com/a/b.git',ref:'v1.2.3',path:''};
const root=()=>mkdtempSync(join(tmpdir(),'upf-distribution-'));
test('source checkout alone can use development dependency fetching',()=>{
 const dir=root();writeFileSync(join(dir,'pnpm-workspace.yaml'),'packages: []');
 assert.equal(bundledRoots(dir,[source]),null);
});
test('missing or malformed installed distribution fails without fetch fallback',()=>{
 const dir=root();assert.equal(bundledRoots(dir,[source]).ok,false);
 writeFileSync(join(dir,'distribution.json'),'{}');assert.equal(bundledRoots(dir,[source]).ok,false);
});
test('bundled sources resolve to fixed local roots and fail when missing or changed',()=>{
 const dir=root();const path=join(dir,'dependencies/kit@1.2.3');mkdirSync(path,{recursive:true});writeFileSync(join(path,'LICENSE'),'license');
 const manifest={format:'upf-distribution/1',version:'0.2.1-rc.1',plugins:[{plugin:'kit',version:'1.2.3',files:[{path:'LICENSE',sha256:createHash('sha256').update('license').digest('hex')}]}]};
 writeFileSync(join(dir,'distribution.json'),JSON.stringify(manifest));
 assert.deepEqual(bundledRoots(dir,[source]),{ok:true,value:[{name:'kit',version:'1.2.3',path}]});
 writeFileSync(join(path,'LICENSE'),'changed');
 assert.equal(bundledRoots(dir,[source],'resolve').ok,true,'resolving paths is independent of inventory verification');
 assert.equal(bundledRoots(dir,[source]).ok,false);
 assert.equal(bundledRoots(dir,[{...source,version:'2.0.0'}]).ok,false);
});
test('packaged marker prevents development fallback even with a workspace file',()=>{
 const dir=root();writeFileSync(join(dir,'pnpm-workspace.yaml'),'packages: []');writeFileSync(join(dir,'.upf-distribution'),'upf-distribution/1');
 assert.equal(bundledRoots(dir,[source]).ok,false);
});
test('inventory preserves internal links and rejects links outside a plugin repository',{skip:process.platform==='win32'},async()=>{
 const {symlinkSync}=await import('node:fs');const {distributionFiles}=await import('../dist/distribution.js');
 const dir=root();writeFileSync(join(dir,'LICENSE'),'license');symlinkSync('LICENSE',join(dir,'notice-link'));
 assert.equal(distributionFiles(dir).every(file=>/^[a-f0-9]{64}$/.test(file.sha256)),true);
 const outside=root();writeFileSync(join(outside,'external'),'outside');symlinkSync(join(outside,'external'),join(dir,'escaping-link'));
 assert.equal(distributionFiles(dir).find(file=>file.path==='escaping-link').sha256,'unsupported-link');
});
