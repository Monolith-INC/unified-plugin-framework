import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';
const installer=resolve(import.meta.dirname,'../../../scripts/install-release.mjs');
const setup=()=>{
 const project=mkdtempSync(join(tmpdir(),'upf-installer-test-'));const input=join(project,'plan.json');writeFileSync(input,'{}');
 return {project,input,args:[installer,'--version','0.2.1-rc.1','--project',project,'--input',input]};
};
test('installer rejects a bad checksum before extraction or project mutation',()=>{
 const {project,args}=setup();const archive=join(project,'unified-plugin-framework-0.2.1-rc.1.tar.gz');writeFileSync(archive,'invalid archive');
 const checksums=join(project,'SHA256SUMS');writeFileSync(checksums,`${'0'.repeat(64)}  unified-plugin-framework-0.2.1-rc.1.tar.gz\n`);
 assert.throws(()=>execFileSync(process.execPath,[...args,'--source',archive,'--checksums',checksums],{encoding:'utf8',stdio:'pipe'}),/checksum mismatch/);
 assert.equal(existsSync(join(project,'.upf-tools')),false);
});
test('installer preserves linked installation paths',{skip:process.platform==='win32'},()=>{
 const {project,args}=setup();const outside=mkdtempSync(join(tmpdir(),'upf-installer-outside-'));
 symlinkSync(outside,join(project,'.upf-tools'));
 assert.throws(()=>execFileSync(process.execPath,[...args,'--source','absent'],{encoding:'utf8',stdio:'pipe'}),/no linked installation paths/);
 assert.equal(existsSync(join(outside,'distributions')),false);
});
