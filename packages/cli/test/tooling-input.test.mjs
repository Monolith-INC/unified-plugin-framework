import assert from 'node:assert/strict';
import test from 'node:test';
import {forHost,NO_CONSENT,parseBootstrap,planFile,requireHost} from '../dist/tooling-input.js';

const base={python:'python3.12',workflows:['continuity'],pluginRoots:[],knowledge:{knowledgeRoot:'knowledge',documentMode:'shared',docsRoot:'docs',vaultRoot:'docs'}};
const message=value=>parseBootstrap(value).error.message;

test('a plan lists several hosts and each host gets its own single-host view',()=>{
  const plan=parseBootstrap({...base,hosts:['codex','claude']});
  assert.equal(plan.ok,true);
  assert.deepEqual(plan.value.hosts,['codex','claude']);
  assert.equal('host' in plan.value,false);
  const claude=forHost(plan.value,'claude');
  assert.equal(claude.host,'claude');
  assert.equal('hosts' in claude,false);
  assert.equal(requireHost(claude).ok,true);
  assert.equal(requireHost(plan.value).error.code,'host-required');
});

test('a saved single-host plan reads as one host, and saved plans keep host for older installers',()=>{
  const legacy=parseBootstrap({...base,host:'codex'});
  assert.deepEqual(legacy.value.hosts,['codex']);
  const saved=planFile(parseBootstrap({...base,hosts:['claude','codex']}).value);
  assert.equal(saved.host,'claude');
  assert.deepEqual(saved.hosts,['claude','codex']);
  assert.deepEqual(parseBootstrap(saved).value.hosts,['claude','codex']);
});

test('invalid host lists are rejected with the valid hosts and an example',()=>{
  [{...base,hosts:[]},{...base,hosts:['codex','codex']},{...base,hosts:'codex'},{...base,hosts:['codex','cursor']},{...base,host:'claude',hosts:['codex']},base]
    .map(value=>assert.match(message(value),/codex, claude.*for example "hosts": \["codex", "claude"\]/,JSON.stringify(value)));
  assert.equal(parseBootstrap({...base,hosts:['codex','\u001b[2J']}).error.message.includes('\u001b'),false);
});

test('each other field fails with its own message',()=>{
  assert.match(message({...base,host:'codex',workflows:[]}),/workflows/);
  assert.match(message({...base,host:'codex',workflows:['continuity','continuity']}),/workflows/);
  assert.match(message({...base,host:'codex',python:''}),/Python/);
  assert.match(message({...base,host:'codex',knowledge:{...base.knowledge,knowledgeRoot:'../outside'}}),/knowledge/);
  assert.match(message({...base,host:'codex',steps:['unknown']}),/steps/);
  assert.match(message({...base,host:'codex',consent:{privatePython:'yes'}}),/consent/);
  assert.equal(parseBootstrap({}).error.code,'invalid-bootstrap');
  assert.equal(parseBootstrap('plan').ok,false);
});

test('consent is off unless the plan turns it on',()=>{
  assert.deepEqual(parseBootstrap({...base,host:'codex'}).value.consent,NO_CONSENT);
  assert.deepEqual(parseBootstrap({...base,host:'codex',consent:{headlessDiscovery:true}}).value.consent,{...NO_CONSENT,headlessDiscovery:true});
});
