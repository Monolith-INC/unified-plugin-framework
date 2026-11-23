import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDiscovery } from '../dist/discovery-next.js';

const initial = { session: 's', occurrence: 2, node: 'elicitation', phase: 'active' };
const event = (action) => ({ kind: 'elicitation', session: 's', occurrence: 2, eventId: action.kind, action });
const offer = event({ kind: 'offer', methods: ['risk', 'premortem'] });
const choose = event({ kind: 'choose', methods: ['risk'] });

test('elicitation selection is immutable, explicit and composes with the storyboard', () => {
  const offered = nextDiscovery(initial, offer).state;
  const selected = nextDiscovery(offered, choose).state;
  assert.equal(offered.elicitation.kind, 'selecting');
  assert.equal(selected.elicitation.kind, 'running');
  assert.deepEqual(nextDiscovery(offered, choose), nextDiscovery(offered, choose));
  const reviewed = nextDiscovery(selected, event({ kind: 'review' })).state;
  const applied = nextDiscovery(reviewed, event({ kind: 'apply' })).state;
  const completed = nextDiscovery(applied, event({ kind: 'proceed' })).state;
  assert.equal(nextDiscovery(completed, { kind: 'advance' }).state.node, 'after-elicitation');
});

test('invalid, repeated and late events preserve the pending state', () => {
  const offered = nextDiscovery(initial, offer).state;
  const invalid = nextDiscovery(offered, event({ kind: 'choose', methods: ['unknown'] }));
  assert.equal(invalid.kind, 'interaction-failure');
  assert.deepEqual(invalid.state, offered);
  const selected = nextDiscovery(offered, choose).state;
  assert.equal(nextDiscovery(selected, choose).kind, 'interaction-failure');
  assert.deepEqual(nextDiscovery(selected, choose).state, selected);
  assert.equal(nextDiscovery(initial, { kind: 'advance' }).kind, 'interaction-failure');
  const paused = nextDiscovery(selected, { kind: 'pause' }).state;
  assert.deepEqual(nextDiscovery(paused, event({ kind: 'review' })).state, paused);
  assert.deepEqual(nextDiscovery(paused, { kind: 'resume' }).state, selected);
  assert.equal(nextDiscovery({ ...initial, node: 'after-elicitation' }, choose).kind, 'invalid-event');
});
