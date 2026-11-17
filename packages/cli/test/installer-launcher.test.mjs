import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import test from 'node:test';
const launcher=resolve(import.meta.dirname,'../../../scripts/install.sh');
test('shell launcher keeps working directory, forwards args/version and propagates failures',{skip:process.platform==='win32'},()=>{
 const project=mkdtempSync(join(tmpdir(),'upf-launcher-'));const bin=join(project,'bin');mkdirSync(bin);
 const log=join(project,'calls');
 writeFileSync(join(bin,'curl'),'#!/bin/sh\nprintf "%s\\n" "$@" > "$UPF_TEST_LOG.curl"\n',{mode:0o755});
 writeFileSync(join(bin,'node'),'#!/bin/sh\npwd > "$UPF_TEST_LOG.cwd"\nprintf "%s\\n" "$@" > "$UPF_TEST_LOG.node"\nexit 7\n',{mode:0o755});
 const result=spawnSync('bash',[launcher,'--dest',project,'--input','accepted.json'],{cwd:project,env:{...process.env,PATH:`${bin}:${process.env.PATH}`,UPF_VERSION:'v0.2.2',UPF_TEST_LOG:log},encoding:'utf8'});
 assert.equal(result.status,7);assert.equal(readFileSync(`${log}.cwd`,'utf8').trim(),project);
 assert.match(readFileSync(`${log}.curl`,'utf8'),/releases\/download\/v0.2.2\/install.mjs/);
 assert.match(readFileSync(`${log}.node`,'utf8'),/--dest\n.*\n--input\naccepted.json/);
});
test('interactive default refuses absent terminal before download',()=>{
 const installer=resolve(import.meta.dirname,'../../../scripts/install-release.mjs');
 const run=spawnSync(process.execPath,[installer],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
 assert.equal(run.status,1);assert.match(run.stderr,/needs a terminal/);
});
