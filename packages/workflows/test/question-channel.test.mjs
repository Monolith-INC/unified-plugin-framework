import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseQuestionChannel, normalizeQuestionAnswer, prepareQuestion } from '../dist/question-channel.js';

const question = { kind: 'single', explanation: 'Choose', allowOther: true, options: [
  { key: 'first', label: 'First' }, { key: 'preferred', label: 'Preferred', recommended: true },
] };
const context = { instance: 'session/step/1', question, displayedKeys: ['preferred', 'first'], answered: false, channel: 'text' };

test('channel selection requires complete capabilities and a reply channel', () => {
  const capability = { native: { single: true, several: false, consent: false, custom: true }, canvas: { single: true, several: true, consent: true, custom: true }, reply: true };
  assert.equal(chooseQuestionChannel(question, capability), 'native');
  assert.equal(chooseQuestionChannel({ ...question, kind: 'several' }, capability), 'canvas');
  assert.equal(chooseQuestionChannel(question, { ...capability, native: null, canvas: null }), 'text');
  assert.equal(chooseQuestionChannel(question, { ...capability, native: null, canvas: null, reply: false }), 'needs-input');
});

test('display numbers and native keys normalize to the same decision event', () => {
  const text = normalizeQuestionAnswer(context, { channel: 'text', instance: context.instance, value: '1' });
  const native = normalizeQuestionAnswer({ ...context, channel: 'native' }, { channel: 'native', instance: context.instance, keys: ['preferred'] });
  assert.deepEqual(text, native);
  assert.deepEqual(text, { kind: 'answer', instance: context.instance, keys: ['preferred'], custom: null, consent: null });
});

test('custom answers remain literal and invalid or duplicate callbacks never approve', () => {
  assert.equal(normalizeQuestionAnswer(context, { channel: 'text', instance: context.instance, value: '  My choice  ' }).custom, '  My choice  ');
  assert.equal(normalizeQuestionAnswer({ ...context, answered: true }, { channel: 'native', instance: context.instance, keys: ['first'] }).kind, 'ignored');
  assert.equal(normalizeQuestionAnswer({ ...context, channel: 'native' }, { channel: 'native', instance: context.instance, keys: ['missing'] }).kind, 'invalid');
  const confirm = { ...context, question: { kind: 'confirm', explanation: 'Approve?', acceptLabel: 'Yes', declineLabel: 'No', safeDefault: 'decline' }, displayedKeys: ['no', 'yes'], acceptKey: 'yes' };
  assert.equal(normalizeQuestionAnswer(confirm, { channel: 'dismissed', instance: context.instance }).kind, 'dismissed');
  assert.equal(normalizeQuestionAnswer(confirm, { channel: 'text', instance: context.instance, value: '' }).kind, 'invalid');
  assert.equal(normalizeQuestionAnswer(confirm, { channel: 'text', instance: context.instance, value: '1' }).consent, 'declined');
  assert.equal(normalizeQuestionAnswer(confirm, { channel: 'text', instance: context.instance, value: '2' }).consent, 'accepted');
  assert.equal(normalizeQuestionAnswer(context, { channel: 'native', instance: 'old', keys: ['first'] }).kind, 'ignored');
  assert.equal(normalizeQuestionAnswer(context, { channel: 'native', keys: ['first'] }).kind, 'invalid');
});

test('optional-only prompts are not used for required decisions', () => {
  const capability = { native: { single: true, several: true, consent: true, custom: true, optionalOnly: true }, canvas: null, reply: true };
  assert.equal(chooseQuestionChannel(question, capability, true), 'text');
  assert.equal(chooseQuestionChannel(question, capability, false), 'native');
});

test('multi-select channels preserve selected order and literal custom answers', () => {
  const several = { ...context, question: { ...question, kind: 'several' } };
  const expected = { kind: 'answer', instance: context.instance, keys: ['first', 'preferred'], custom: null, consent: null };
  assert.deepEqual(normalizeQuestionAnswer(several, { channel: 'text', instance: context.instance, value: '2, 1' }), expected);
  assert.deepEqual(normalizeQuestionAnswer({ ...several, channel: 'canvas' }, { channel: 'canvas', instance: context.instance, keys: ['first', 'preferred'] }), expected);
  assert.equal(normalizeQuestionAnswer({ ...several, channel: 'native' }, { channel: 'native', instance: context.instance, keys: ['first'], custom: '  custom  ' }).custom, '  custom  ');
  assert.equal(normalizeQuestionAnswer(several, { channel: 'canvas', instance: context.instance, keys: ['first'] }).kind, 'invalid');
  assert.equal(normalizeQuestionAnswer(several, { channel: 'text', instance: context.instance, value: '1, 1' }).kind, 'invalid');
  assert.equal(normalizeQuestionAnswer(several, { channel: 'text', instance: context.instance, value: '1, 9' }).kind, 'invalid');
});

test('preparing a decision exposes one channel and preserves the pending question when input is unavailable', () => {
  const capabilities = { native: null, canvas: null, reply: false };
  assert.deepEqual(prepareQuestion(context, capabilities, true), {
    kind: 'needs-input', instance: context.instance, question, displayedKeys: ['preferred', 'first'],
    answerForms: ['single-key', 'custom'], continuation: { ...context, channel: 'needs-input' },
  });
  assert.equal(prepareQuestion(context, { ...capabilities, reply: true }, true).kind, 'text');
  assert.equal(prepareQuestion({ ...context, displayedKeys: ['preferred', 'preferred'] }, capabilities, true).kind, 'invalid');
});

test('numbered Other requests custom text without treating the selection as an answer', () => {
  assert.deepEqual(normalizeQuestionAnswer(context, { channel: 'text', instance: context.instance, value: '3' }),
    { kind: 'needs-custom', instance: context.instance, keys: [] });
  const several = { ...context, question: { ...question, kind: 'several' } };
  assert.deepEqual(normalizeQuestionAnswer(several, { channel: 'text', instance: context.instance, value: '2,3' }),
    { kind: 'needs-custom', instance: context.instance, keys: ['first'] });
  assert.deepEqual(normalizeQuestionAnswer({ ...several, pendingCustomKeys: ['first'] }, { channel: 'text', instance: context.instance, value: '  custom  ' }),
    { kind: 'answer', instance: context.instance, keys: ['first'], custom: '  custom  ', consent: null });
});

test('empty multi-selection is accepted only when the decision allows none', () => {
  const several = { ...context, question: { ...question, kind: 'several' }, allowNone: true };
  assert.ok(prepareQuestion(several, { native: null, canvas: null, reply: false }, false).answerForms.includes('none'));
  assert.deepEqual(normalizeQuestionAnswer(several, { channel: 'text', instance: context.instance, value: 'none' }),
    { kind: 'answer', instance: context.instance, keys: [], custom: null, consent: null });
  assert.equal(normalizeQuestionAnswer({ ...several, allowNone: false }, { channel: 'text', instance: context.instance, value: 'none' }).kind, 'invalid');
});

test('malformed option maps never produce an answer or request custom text', () => {
  const malformed = { ...context, question: { ...question, options: [{ key: 'first', label: 'A' }, { key: 'first', label: 'B' }] } };
  assert.equal(normalizeQuestionAnswer(malformed, { channel: 'text', instance: context.instance, value: '1' }).kind, 'invalid');
  assert.equal(normalizeQuestionAnswer(malformed, { channel: 'text', instance: context.instance, value: '3' }).kind, 'invalid');
});

test('rejects malformed responses at the host boundary', () => {
  assert.equal(normalizeQuestionAnswer(context, { channel: 'text', instance: context.instance, value: null }).kind, 'invalid');
  assert.equal(normalizeQuestionAnswer({ ...context, channel: 'native' }, { channel: 'native', instance: context.instance, keys: null }).kind, 'invalid');
  assert.equal(normalizeQuestionAnswer({ ...context, channel: 'native' }, { channel: 'native', instance: context.instance, keys: ['first'], custom: 4 }).kind, 'invalid');
});
