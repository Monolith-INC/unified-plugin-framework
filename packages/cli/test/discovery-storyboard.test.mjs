import assert from 'node:assert/strict';
import test from 'node:test';
import { DISCOVERY_STORYBOARD, resolveDiscoveryStep, validateDiscoveryStoryboard } from '@agent-plugins/workflows';

test('CLI consumers can use the public discovery storyboard contract', () => {
  assert.deepEqual(validateDiscoveryStoryboard(DISCOVERY_STORYBOARD), { ok: true });
  const after = resolveDiscoveryStep('after-elicitation');
  assert.equal(after.kind, 'ready');
  assert.deepEqual(after.node.directions.map((direction) => direction.target), ['conversation', 'playback']);
  assert.equal(resolveDiscoveryStep('unknown').kind, 'invalid-state');
});
