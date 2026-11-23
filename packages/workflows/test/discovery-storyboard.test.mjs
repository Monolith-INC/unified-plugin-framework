import assert from 'node:assert/strict';
import test from 'node:test';
import { DISCOVERY_STORYBOARD, resolveDiscoveryStep, validateDiscoveryStoryboard } from '../dist/discovery-storyboard.js';

test('discovery route has reachable steps and offers directions after elicitation', () => {
  assert.deepEqual(validateDiscoveryStoryboard(DISCOVERY_STORYBOARD), { ok: true });
  const initial = resolveDiscoveryStep(undefined);
  assert.equal(initial.kind, 'ready');
  assert.equal(initial.node.id, DISCOVERY_STORYBOARD.entry);
  const after = resolveDiscoveryStep('after-elicitation');
  assert.equal(after.kind, 'ready');
  assert.deepEqual(after.node.directions.map((direction) => direction.target), ['conversation', 'playback']);
  assert.deepEqual(resolveDiscoveryStep('unknown'), { kind: 'invalid-state', value: 'unknown', recovery: ['restart', 'pause'] });
  assert.deepEqual(resolveDiscoveryStep(null), { kind: 'invalid-state', value: null, recovery: ['restart', 'pause'] });
});

test('storyboard validation catches invalid references and unreachable steps', () => {
  const broken = { entry: 'start', nodes: [
    { id: 'start', directions: [{ label: 'Continue', target: 'missing' }] },
    { id: 'orphan', directions: [] },
  ] };
  const result = validateDiscoveryStoryboard(broken);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.kind === 'unknown-target'));
  assert.ok(result.issues.some((issue) => issue.kind === 'unreachable'));
  assert.ok(validateDiscoveryStoryboard({ entry: 'absent', nodes: [] }).issues.some((issue) => issue.kind === 'missing-entry'));
});

test('valid cycles terminate and duplicate stages are rejected', () => {
  const cycle = { entry: 'a', nodes: [
    { id: 'a', directions: [{ label: 'Next', target: 'b' }] },
    { id: 'b', directions: [{ label: 'Back', target: 'a' }] },
  ] };
  assert.deepEqual(validateDiscoveryStoryboard(cycle), { ok: true });
  assert.ok(validateDiscoveryStoryboard({ ...cycle, nodes: [...cycle.nodes, cycle.nodes[0]] }).issues.some((issue) => issue.kind === 'duplicate-node'));
});
