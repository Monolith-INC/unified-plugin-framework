import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapTooling, resumeTooling, ok, fail } from '../dist/index.js';

const fixture = () => {
  // Test effect interpreter: this boundary records installs; business planning stays immutable.
  const installed = new Set(['settings']);
  const calls = [];
  return { calls, io: {
    inspect: (step) => async () => ok(installed.has(step)
      ? {status:'ready',evidence:`Verified ${step}`} : {status:'missing',recovery:`Configure ${step}`}),
    configure: (step) => async () => {calls.push(step); installed.add(step); return ok('Configured');},
  }};
};

test('planning performs no installations; accepted setup verifies and re-entry reuses working capabilities', async () => {
  const {io,calls}=fixture();
  const plan=await bootstrapTooling(io,false,['settings','cli','skills'])();
  assert.equal(plan.value.status,'action-required');
  assert.deepEqual(calls,[]);
  assert.equal((await bootstrapTooling(io,true,['settings','cli','skills'])()).value.status,'ready');
  assert.deepEqual(calls,['cli','skills']);
  assert.equal((await bootstrapTooling(io,true,['settings','cli','skills'])()).value.status,'ready');
  assert.deepEqual(calls,['cli','skills']);
});

test('failed setup retains successful steps, reports recovery and holds the original request', async () => {
  const {io,calls}=fixture();
  const failed={...io,configure:(step)=>step==='skills'?async()=>fail('install-failed','Missing package.','Provide the pinned package.'):io.configure(step)};
  const result=await bootstrapTooling(failed,true,['settings','cli','skills'])();
  assert.equal(result.value.steps.find(s=>s.step==='cli').status,'ready');
  assert.equal(result.value.steps.find(s=>s.step==='skills').failure.code,'install-failed');
  assert.deepEqual(calls,['cli']);
  assert.equal((await resumeTooling(result.value,async()=>{throw new Error('Must not resume');})()).ok,false);
});

test('configuration is not readiness evidence and an accepted request resumes once only after verification', async () => {
  const io={inspect:()=>async()=>ok({status:'missing',recovery:'Still missing.'}),configure:()=>async()=>ok('Claimed installed')};
  assert.equal((await bootstrapTooling(io,true,['skills'])()).value.status,'action-required');
  const calls=[];
  const result=await resumeTooling({status:'ready',steps:[]},async()=>{calls.push('resume');return ok('done');})();
  assert.equal(result.value.resumed,'done');
  assert.deepEqual(calls,['resume']);
});
