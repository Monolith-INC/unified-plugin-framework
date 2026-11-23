import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQuestion } from '../dist/question-catalog.js';
import { renderNativeQuestionGuidance, renderNumberedFallback } from '../dist/questions.js';

const directions = [{ target: 'conversation', label: 'Discuss the request' }, { target: 'execute', label: 'Proceed' }];

test('catalog resolves the used discovery direction question with stable option IDs', () => {
  const result = resolveQuestion('discovery.direction', { language: 'en', instruction: 'Choose for the request.', directions });
  assert.equal(result.ok, true);
  assert.deepEqual(result.question.options.map((option) => option.key), ['conversation', 'execute']);
  assert.match(renderNativeQuestionGuidance(result.question), /Choose for the request/);
  assert.match(renderNumberedFallback(result.question), /1\. Discuss the request/);
});

test('saved language requires caller-supplied wording when no authored translation exists', () => {
  const input = { language: 'pt-br', instruction: 'Choose.', directions };
  assert.equal(resolveQuestion('discovery.direction', input).reason, 'missing-wording');
  const localized = resolveQuestion('discovery.direction', { ...input, wording: {
    explanation: 'Escolha um caminho.', labels: { conversation: 'Conversar', execute: 'Prosseguir' },
  } });
  assert.equal(localized.language, 'pt-br');
  assert.match(renderNumberedFallback(localized.question), /1\. Conversar/);
  assert.equal(resolveQuestion('discovery.direction', { ...input, wording: { explanation: 'Escolha', labels: {} } }).reason, 'missing-wording');
  assert.equal(resolveQuestion('unknown', input).reason, 'unknown-question');
});
