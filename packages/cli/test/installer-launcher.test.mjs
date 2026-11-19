import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
const launcher=resolve(import.meta.dirname,'../../../scripts/install.sh');
test('shell launcher keeps working directory, forwards args/version and propagates failures',{skip:process.platform==='win32'},()=>{
 const project=mkdtempSync(join(tmpdir(),'upf-launcher-'));const bin=join(project,'bin');mkdirSync(bin);
 const log=join(project,'calls');
 const installer=join(project,'fixture-install.mjs');writeFileSync(installer,'verified installer fixture');
 const digest=createHash('sha256').update(readFileSync(installer)).digest('hex');
 const checksums=join(project,'fixture-SHA256SUMS');writeFileSync(checksums,`${digest}  install.mjs\n`);
 writeFileSync(join(bin,'curl'),'#!/bin/sh\ndest=\nurl=\nwhile [ "$#" -gt 0 ]; do\n case "$1" in -o) dest="$2"; shift 2;; -*) shift;; *) url="$1"; shift;; esac\ndone\nprintf "%s\\n" "$url" >> "$UPF_TEST_LOG.urls"\ncase "$url" in */install.mjs) cp "$UPF_TEST_INSTALLER" "$dest";; */SHA256SUMS) cp "$UPF_TEST_CHECKSUMS" "$dest";; esac\n',{mode:0o755});
 writeFileSync(join(bin,'node'),'#!/bin/sh\nif [ "$1" = "-e" ]; then exec "$UPF_REAL_NODE" "$@"; fi\npwd > "$UPF_TEST_LOG.cwd"\nprintf "%s\\n" "$@" > "$UPF_TEST_LOG.node"\nexit 7\n',{mode:0o755});
 const environment={...process.env,PATH:`${bin}:${process.env.PATH}`,UPF_VERSION:'v0.2.2',UPF_TEST_LOG:log,
  UPF_TEST_INSTALLER:installer,UPF_TEST_CHECKSUMS:checksums,UPF_REAL_NODE:process.execPath};
 const verified=spawnSync('bash',[launcher,'--dest',project,'--input','accepted.json'],{cwd:project,env:environment,encoding:'utf8'});
 assert.equal(verified.status,7);assert.equal(realpathSync(readFileSync(`${log}.cwd`,'utf8').trim()),realpathSync(project),'same folder, whether or not the temp root is a link (macOS /var is /private/var)');
 assert.match(readFileSync(`${log}.urls`,'utf8'),/releases\/download\/v0.2.2\/install.mjs/);
 assert.match(readFileSync(`${log}.urls`,'utf8'),/releases\/download\/v0.2.2\/SHA256SUMS/);
 assert.match(readFileSync(`${log}.node`,'utf8'),/--dest\n.*\n--input\naccepted.json/);
});
test('shell launcher refuses a checksum mismatch without executing the installer',{skip:process.platform==='win32'},()=>{
 const project=mkdtempSync(join(tmpdir(),'upf-launcher-mismatch-'));const bin=join(project,'bin');mkdirSync(bin);
 const log=join(project,'calls');const installer=join(project,'fixture-install.mjs');writeFileSync(installer,'tampered installer');
 const checksums=join(project,'fixture-SHA256SUMS');writeFileSync(checksums,`${'0'.repeat(64)}  install.mjs\n`);
 writeFileSync(join(bin,'curl'),'#!/bin/sh\ndest=\nurl=\nwhile [ "$#" -gt 0 ]; do\n case "$1" in -o) dest="$2"; shift 2;; -*) shift;; *) url="$1"; shift;; esac\ndone\ncase "$url" in */install.mjs) cp "$UPF_TEST_INSTALLER" "$dest";; */SHA256SUMS) cp "$UPF_TEST_CHECKSUMS" "$dest";; esac\n',{mode:0o755});
 writeFileSync(join(bin,'node'),'#!/bin/sh\nif [ "$1" = "-e" ]; then exec "$UPF_REAL_NODE" "$@"; fi\nprintf "%s\\n" "$@" > "$UPF_TEST_LOG.node"\nexit 7\n',{mode:0o755});
 const result=spawnSync('bash',[launcher,'--input','accepted.json'],{cwd:project,env:{...process.env,PATH:`${bin}:${process.env.PATH}`,UPF_VERSION:'v0.2.2',UPF_TEST_LOG:log,
  UPF_TEST_INSTALLER:installer,UPF_TEST_CHECKSUMS:checksums,UPF_REAL_NODE:process.execPath},encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/checksum verification failed/);assert.equal(existsSync(`${log}.node`),false);
});
test('interactive default refuses absent terminal before download',()=>{
 const installer=resolve(import.meta.dirname,'../../../scripts/install-release.mjs');
 const run=spawnSync(process.execPath,[installer],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
 assert.equal(run.status,1);assert.match(run.stderr,/needs a terminal/);
});
test('latest resolution requests JSON metadata before binary archive downloads',()=>{
 const project=mkdtempSync(join(tmpdir(),'upf-latest-'));
 const preload=join(project,'requests.mjs');
 writeFileSync(preload,`globalThis.fetch=async(url,options)=>{
  const metadata=url.startsWith('https://api.github.com/');
  console.log(JSON.stringify({url,accept:options.headers.Accept}));
  return metadata && options.headers.Accept!=='application/vnd.github+json' ? {ok:false,status:415}
   : {ok:true,arrayBuffer:async()=>Buffer.from(metadata ? JSON.stringify({tag_name:'v0.2.3'}) : 'invalid test archive')};
 };`);
 const {UPF_VERSION,...environment}=process.env;
 const run=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,resolve(import.meta.dirname,'../../../scripts/install-release.mjs'),'--input','accepted.json','--project',project],{
  encoding:'utf8',env:environment,timeout:10_000});
 assert.equal(run.status,1);assert.match(run.stderr,/checksum mismatch/);
 const requests=run.stdout.trim().split('\n').map(JSON.parse);
 assert.equal(requests.length,5,'metadata, then the archive and checksums downloaded twice after a mismatch');
 assert.match(requests[0].url,/\/releases\/latest$/);
 assert.equal(requests[0].accept,'application/vnd.github+json');
 assert.equal(requests.slice(1).every(request=>request.accept==='application/octet-stream' && request.url.includes('/download/v0.2.3/')),true);
});
