import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response as ExpressResponse } from 'express';
import Database from 'better-sqlite3';
import { migrateSqliteDatabase } from '../src/db.js';
import { SqliteTaskRepository } from '../src/repositories/sqlite.js';
import type { ProjectRepository } from '../src/repositories/project-types.js';
import { createTaskRouter } from '../src/routes/tasks.js';
import { AgentManager } from '../src/services/agent-manager.js';
import { FreeProviderPool } from '../src/services/free-provider.js';
import type { Project, Task } from '../src/types.js';

async function eventually(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, 'free runtime did not reach expected state');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const response = (text = 'Translated text') => new Response(JSON.stringify({
  choices: [{ message: { content: text } }],
  usage: { prompt_tokens: 7, completion_tokens: 3 },
}), { status: 200 });

function fixture(fetchImpl: typeof fetch, keys: string[] = ['groq', 'gemini']) {
  const dir = mkdtempSync(join(tmpdir(), 'free-runtime-'));
  const oldDir = process.env.LLM_KEY_DIR;
  process.env.LLM_KEY_DIR = dir;
  for (const name of keys) writeFileSync(join(dir, `${name}.key`), `fake-${name}-runtime-secret`, { mode: 0o600 });
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateSqliteDatabase(db);
  const repo = new SqliteTaskRepository(db);
  const manager = new AgentManager(new FreeProviderPool({ fetchImpl }));
  manager.initEventPersistence(repo);
  const project: Project = { id: 'default', name: 'Default', aliases: [], isDefault: true, createdAt: 1, updatedAt: 1 };
  const projects = { getDefault: async () => project, getById: async () => project } as ProjectRepository;
  const router = createTaskRouter(repo, manager, projects);
  const request = (body: unknown): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    const req = { method: 'POST', url: '/', body, query: {}, headers: {}, header: () => undefined } as unknown as Request;
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      set() { return this; },
      json(value: unknown) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(value)) }); return this; },
    } as unknown as ExpressResponse;
    router(req, res, (error?: unknown) => reject(error ?? new Error('Task creation route not found')));
  });
  const create = async (overrides: Partial<Task> = {}): Promise<Task> => repo.create({
    id: 'free-runtime-task', projectId: 'default', title: 'Translate this', description: 'A public sentence',
    priority: 'medium', columnId: 'in-progress', agentStatus: 'idle', agentType: 'claude',
    sensitivity: 'public', effectiveTier: 1, createdAt: Date.now(), ...overrides,
  });
  return { repo, manager, request, create, close() {
    manager.shutdownAll();
    db.close();
    if (oldDir === undefined) delete process.env.LLM_KEY_DIR;
    else process.env.LLM_KEY_DIR = oldDir;
    rmSync(dir, { recursive: true, force: true });
  } };
}

test('tier 1 resolves free despite persisted Claude placeholder, records answer and free usage', async () => {
  let calls = 0;
  const f = fixture(async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.match(body.messages[0].content, /Translate this/);
    assert.match(body.messages[0].content, /A public sentence/);
    assert.doesNotMatch(body.messages[0].content, /private-attachment|private-worktree/);
    return response();
  });
  try {
    const task = await f.create({ useWorktree: true, worktreePath: '/private-worktree', attachments: [{ id: 'private-attachment' } as any] });
    const statuses: Task['agentStatus'][] = [];
    let worktrees = 0;
    f.manager.startAgent(task, status => { statuses.push(status); }, () => { worktrees++; });
    await eventually(() => statuses.includes('complete'));
    assert.equal(calls, 1);
    assert.equal(worktrees, 0);
    assert.equal(f.manager.isRunning(task.id), false);
    assert.equal((await f.repo.getById(task.id))?.summary, 'Translated text');
    const events = await f.manager.getEvents(task.id);
    assert.ok(events.some(e => e.type === 'thinking' && /started/.test(e.content)));
    assert.ok(events.some(e => e.type === 'output' && e.content === 'Translated text'));
    assert.ok(events.some(e => e.type === 'complete'));
    assert.doesNotMatch(JSON.stringify(events), /fake-.*-runtime-secret/);
    const usage = await f.repo.listUsage(task.id);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].provider, 'groq');
    assert.equal(usage[0].tier, 1);
    assert.equal(usage[0].costUsd, 0);
    assert.equal(usage[0].inputTokens, 7);
    assert.equal(usage[0].outputTokens, 3);
    assert.ok(usage[0].model);
  } finally { f.close(); }
});

test('quota fallback records a separate usage attempt for each free provider', async () => {
  const urls: string[] = [];
  const f = fixture(async url => {
    urls.push(String(url));
    return urls.length === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '3' } }) : response('Gemini answer');
  });
  try {
    const task = await f.create();
    let complete = false;
    f.manager.startAgent(task, status => { complete = status === 'complete'; });
    await eventually(() => complete);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /api\.groq\.com/);
    assert.match(urls[1], /generativelanguage\.googleapis\.com/);
    const usage = await f.repo.listUsage(task.id);
    assert.deepEqual(usage.map(u => u.provider), ['groq', 'gemini']);
    assert.deepEqual(usage.map(u => u.attempt), [1, 2]);
    assert.ok(usage.every(u => u.costUsd === 0 && u.tier === 1));
    assert.equal(usage[0].inputTokens, null);
    assert.equal(usage[0].outputTokens, null);
    assert.equal((await f.repo.getById(task.id))?.summary, 'Gemini answer');
  } finally { f.close(); }
});

test('all free quotas exhausted leaves task idle with retry time and cleared run claim', async () => {
  const f = fixture(async () => new Response('', { status: 503, headers: { 'Retry-After': '2' } }));
  try {
    const created = await f.request({ title: 'translate', description: 'Public text', sensitivity: 'public', columnId: 'in-progress', autoRun: true });
    assert.equal(created.status, 201);
    await eventually(async () => (await f.manager.getEvents(created.body.id)).some(e => /free quota exhausted, retry at /.test(e.content)));
    await eventually(async () => (await f.repo.getById(created.body.id))?.agentStatus === 'idle');
    const task = await f.repo.getById(created.body.id);
    assert.equal(task?.runRequestedAt, undefined);
    assert.equal(task?.runClaimedAt, undefined);
    assert.equal(f.manager.isRunning(created.body.id), false);
    const events = await f.manager.getEvents(created.body.id);
    assert.ok(events.some(e => /free quota exhausted, retry at \d{4}-\d\d-\d\dT/.test(e.content)));
    assert.equal(events.some(e => e.type === 'complete'), false);
    assert.equal((await f.repo.listUsage(created.body.id)).length, 2);
  } finally { f.close(); }
});

test('stopping a free request aborts it and discards a late response', async () => {
  let release!: (value: Response) => void;
  let signal: AbortSignal | null | undefined;
  const f = fixture(async (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>(resolve => { release = resolve; });
  });
  try {
    const task = await f.create();
    const statuses: Task['agentStatus'][] = [];
    f.manager.startAgent(task, status => { statuses.push(status); });
    await eventually(() => Boolean(release));
    assert.equal(await f.manager.stopAgent(task.id), true);
    assert.equal(signal?.aborted, true);
    release(response('Should never be saved'));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.manager.isRunning(task.id), false);
    assert.equal(statuses.includes('complete'), false);
    assert.equal((await f.repo.getById(task.id))?.summary, null);
    assert.equal((await f.manager.getEvents(task.id)).some(e => e.type === 'complete' || e.content === 'Should never be saved'), false);
  } finally { f.close(); }
});

test('free runtime timeout aborts fetch and records a sanitized failure with unknown usage', async () => {
  const oldTimeout = process.env.AGENT_TIMEOUT_MS;
  process.env.AGENT_TIMEOUT_MS = '10';
  let aborted = false;
  const f = fixture(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      aborted = true;
      reject(new Error('fake-groq-runtime-secret transport abort details'));
    }, { once: true });
  }));
  try {
    const task = await f.create();
    const statuses: Task['agentStatus'][] = [];
    f.manager.startAgent(task, status => { statuses.push(status); });
    await eventually(() => statuses.includes('failed') && !f.manager.isRunning(task.id));
    assert.equal(aborted, true);
    assert.equal(statuses.includes('complete'), false);
    const usage = await f.repo.listUsage(task.id);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].provider, 'groq');
    assert.equal(usage[0].inputTokens, null);
    assert.equal(usage[0].outputTokens, null);
    assert.equal(usage[0].costUsd, 0);
    assert.equal(usage[0].outcome, 'failed');
    const events = await f.manager.getEvents(task.id);
    assert.ok(events.some(e => e.type === 'error' && /abort/i.test(e.content)));
    assert.doesNotMatch(JSON.stringify(events), /fake-groq-runtime-secret|transport abort details/);
  } finally {
    f.close();
    if (oldTimeout === undefined) delete process.env.AGENT_TIMEOUT_MS;
    else process.env.AGENT_TIMEOUT_MS = oldTimeout;
  }
});

test('provider HTTP error response body never appears in runtime events or usage', async () => {
  const f = fixture(async () => new Response('fake-groq-runtime-secret private request details', { status: 401 }));
  try {
    const task = await f.create();
    let failed = false;
    f.manager.startAgent(task, status => { failed = status === 'failed'; });
    await eventually(() => failed && !f.manager.isRunning(task.id));
    const events = await f.manager.getEvents(task.id);
    assert.ok(events.some(e => e.type === 'error' && /401/.test(e.content)));
    assert.doesNotMatch(JSON.stringify(events), /fake-groq-runtime-secret|private request details/);
    const usage = await f.repo.listUsage(task.id);
    // Hard failure falls through to the next keyed provider (groq, gemini) before the task fails.
    assert.deepEqual(usage.map(u => [u.provider, u.outcome]), [['groq', 'failed'], ['gemini', 'failed']]);
    assert.doesNotMatch(JSON.stringify(usage), /fake-groq-runtime-secret|private request details/);
  } finally { f.close(); }
});

test('quota-waiting task can retry through free provider and continues usage attempt numbering', async () => {
  let exhausted = true;
  const f = fixture(async () => exhausted
    ? new Response('', { status: 429, headers: { 'Retry-After': '0' } })
    : response('Retry answer'));
  try {
    const task = await f.create();
    await f.repo.requestRun(task.id, Date.now());
    await f.repo.claimRun(task.id, Date.now());
    const statuses: Task['agentStatus'][] = [];
    const onStatus = async (status: Task['agentStatus']) => {
      await f.repo.update(task.id, { agentStatus: status });
      statuses.push(status);
    };
    f.manager.startAgent(task, onStatus);
    await eventually(() => statuses.includes('idle') && !f.manager.isRunning(task.id));
    exhausted = false;
    const retry = await f.repo.getById(task.id);
    assert.ok(retry);
    f.manager.startAgent(retry, onStatus);
    await eventually(() => statuses.includes('complete'));
    const usage = await f.repo.listUsage(task.id);
    assert.deepEqual(usage.map(u => u.attempt), [1, 2, 3]);
    assert.deepEqual(usage.map(u => u.provider), ['groq', 'gemini', 'groq']);
    assert.equal((await f.repo.getById(task.id))?.summary, 'Retry answer');
    assert.equal(f.manager.isRunning(task.id), false);
  } finally { f.close(); }
});

test('quota-waiting group child releases its slot so the next text task can complete', async () => {
  let calls = 0;
  const f = fixture(async () => ++calls <= 2
    ? new Response('', { status: 429, headers: { 'Retry-After': '0' } })
    : response('Next child answer'));
  try {
    const first = await f.create({ id: 'waiting-child' });
    const second = await f.create({ id: 'next-child' });
    const completed: string[] = [];
    f.manager.startGroup({
      id: 'free-group', projectId: 'default', title: 'Public text', priority: 'medium',
      columnId: 'in-progress', maxConcurrency: 1, createdAt: Date.now(),
    }, [first, second], task => async status => {
      await f.repo.update(task.id, { agentStatus: status });
    }, () => () => assert.fail('free group child must not create a worktree'), id => { completed.push(id); });
    await eventually(() => completed.includes(second.id));
    assert.equal((await f.repo.getById(first.id))?.agentStatus, 'idle');
    assert.equal((await f.repo.getById(second.id))?.summary, 'Next child answer');
    assert.deepEqual(completed, [second.id]);
    assert.equal(f.manager.isGroupRunning('free-group'), false);
    assert.equal((await f.repo.listUsage(first.id)).length, 2);
    assert.equal((await f.repo.listUsage(second.id)).length, 1);
    const retry = await f.repo.getById(first.id);
    assert.ok(retry);
    f.manager.startGroup({
      id: 'free-group', projectId: 'default', title: 'Public text', priority: 'medium',
      columnId: 'in-progress', maxConcurrency: 1, createdAt: Date.now(),
    }, [retry], task => async status => {
      await f.repo.update(task.id, { agentStatus: status });
    }, () => () => assert.fail('free retry must not create a worktree'), id => { completed.push(id); });
    await eventually(() => completed.includes(first.id));
    assert.equal(f.manager.isGroupRunning('free-group'), false);
    assert.equal((await f.repo.getById(first.id))?.agentStatus, 'complete');
    assert.deepEqual((await f.repo.listUsage(first.id)).map(u => u.attempt), [1, 2, 3]);
  } finally { f.close(); }
});

test('create routing keeps available free target and autoRun bypasses missing Claude CLI', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return response(); }, ['gemini']);
  try {
    const created = await f.request({ title: 'translate', description: 'Public text', sensitivity: 'public', columnId: 'in-progress', autoRun: true });
    assert.equal(created.status, 201);
    assert.equal(created.body.agentType, 'claude');
    assert.equal(created.body.effectiveTier, 1);
    assert.ok(created.body.routingReason);
    await eventually(async () => (await f.repo.getById(created.body.id))?.agentStatus === 'complete');
    assert.equal(calls, 1);
    assert.equal((await f.repo.listUsage(created.body.id))[0].provider, 'gemini');
    const agents = f.manager.getAvailableAgents();
    assert.ok(agents.some(a => String(a.name) === 'gemini' && a.available));
    assert.ok(agents.some(a => String(a.name) === 'groq' && !a.available && a.reason === 'no key'));
    assert.doesNotMatch(JSON.stringify(agents), /fake-.*-runtime-secret/);
  } finally { f.close(); }
});

test('create routing falls back to Claude when no free keys are available', async () => {
  const f = fixture(async () => { assert.fail('unavailable providers must never fetch'); }, []);
  try {
    const created = await f.request({ title: 'translate', description: 'Public text', sensitivity: 'public' });
    assert.equal(created.status, 201);
    assert.equal(created.body.agentType, 'claude');
    assert.equal(created.body.effectiveTier, 3);
    assert.match(created.body.routingReason, /free.*available|available.*free/i);
  } finally { f.close(); }
});

test('confidential tier 1 task fails policy before free fetch or worktree setup', async () => {
  const f = fixture(async () => { assert.fail('confidential text cannot reach free endpoint'); });
  try {
    const task = await f.create({ sensitivity: 'confidential', repoPath: '/private-repo', useWorktree: true });
    let failed = false;
    f.manager.startAgent(task, status => { failed = status === 'failed'; }, () => assert.fail('policy must run before worktree setup'));
    await eventually(() => failed);
    assert.equal((await f.repo.listUsage(task.id)).length, 0);
    assert.equal(f.manager.isRunning(task.id), false);
  } finally { f.close(); }
});

test('rejected free answer escalates to tier 2 internally without a free-path completion', async () => {
  const f = fixture(async () => response("I'm sorry, I can't help with that."), ['gemini']);
  try {
    const task = await f.create();
    const statuses: string[] = [];
    f.manager.startAgent(task, status => { statuses.push(String(status)); });
    await eventually(async () => (await f.repo.getById(task.id))?.effectiveTier === 2);
    const saved = await f.repo.getById(task.id);
    assert.match(String(saved?.routingReason), /escalated from tier 1: refusal-style answer/);
    const events = await f.manager.getEvents(task.id);
    assert.ok(events.some(e => /acceptance check failed/.test(e.content)));
    assert.ok(!events.some(e => e.type === 'output' && /sorry/i.test(e.content)));
    assert.ok(!events.some(e => e.type === 'complete' && e.metadata?.agentType === 'claude'));
  } finally { f.close(); }
});
