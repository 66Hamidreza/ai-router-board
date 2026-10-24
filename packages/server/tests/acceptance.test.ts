import assert from 'node:assert/strict';
import test from 'node:test';
import { checkFreeResult, escalationTarget, MAX_ESCALATIONS } from '../src/services/acceptance.js';

const task = { title: 'Summarize', description: 'A public paragraph about trees.' };

test('accepts a normal answer', () => assert.deepEqual(checkFreeResult(task, 'Trees give shade.'), { ok: true }));
test('rejects empty, refusal and echo answers', () => {
  assert.equal(checkFreeResult(task, '  \n').ok, false);
  assert.equal(checkFreeResult(task, "I'm sorry, I can't help with that.").ok, false);
  assert.equal(checkFreeResult(task, task.description).ok, false);
});
test('translation task into Persian needs Persian output', () => {
  const t = { title: 'ترجمه', description: 'ترجمه کن به فارسی: hello' };
  assert.equal(checkFreeResult(t, 'hello').ok, false);
  assert.equal(checkFreeResult(t, 'سلام').ok, true);
});
test('escalation ladder is bounded and never leaves tier 3', () => {
  assert.deepEqual(escalationTarget(1), { tier: 2, agentType: 'codex' });
  assert.deepEqual(escalationTarget(2), { tier: 3, agentType: 'claude' });
  assert.equal(escalationTarget(3), null);
  assert.equal(MAX_ESCALATIONS, 1);
});

test('enforces explicit word and sentence limits', () => {
  const blurb = { title: 'Draft blurb', description: 'Draft a 30-word product blurb for a bottle.' };
  assert.equal(checkFreeResult(blurb, 'Short.').ok, false);
  assert.equal(checkFreeResult(blurb, Array(30).fill('word').join(' ')).ok, true);
  assert.equal(checkFreeResult(blurb, Array(60).fill('word').join(' ')).ok, false);
  const cap = { title: 't', description: 'Explain it in at most 5 words.' };
  assert.equal(checkFreeResult(cap, 'one two three four five').ok, true);
  assert.equal(checkFreeResult(cap, 'one two three four five six').ok, false);
  const two = { title: 't', description: 'Summarize in two sentences: trees are tall.' };
  assert.equal(checkFreeResult(two, 'Trees are tall. They give shade.').ok, true);
  assert.equal(checkFreeResult(two, 'Trees are tall. They give shade. They are green.').ok, false);
  assert.equal(checkFreeResult({ title: 't', description: 'Write a long essay.' }, 'Any length is fine here.').ok, true);
});
