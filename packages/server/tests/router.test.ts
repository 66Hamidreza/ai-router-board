import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { migrateSqliteDatabase } from '../src/db.js';
import { SqliteTaskRepository } from '../src/repositories/sqlite.js';
import { createTaskRouter } from '../src/routes/tasks.js';
import { AgentManager } from '../src/services/agent-manager.js';
import { checkPolicy, isFreeTarget, PolicyError, routeTask } from '../src/services/router.js';
import type { AgentType, Project, Task } from '../src/types.js';
import type { ProjectRepository } from '../src/repositories/project-types.js';

const free = { kind: 'free', provider: 'groq' } as const;
const input = { title: 'A task', description: '' };

test('free-target policy fails closed for every non-public sensitivity', () => {
  for (const sensitivity of [undefined, null, 'x', 'confidential', '', 'PUBLIC', 0, false, {}, ['public']]) {
    assert.throws(() => checkPolicy({ sensitivity }, free), PolicyError, String(sensitivity));
    assert.doesNotThrow(() => checkPolicy({ sensitivity }, { kind: 'agent', agentType: 'codex' }));
  }
  assert.throws(() => checkPolicy({}, free), PolicyError);
  assert.doesNotThrow(() => checkPolicy({ sensitivity: 'public' }, free));
  assert.equal(isFreeTarget(free), true);
  assert.equal(isFreeTarget({ kind: 'agent', agentType: 'claude' }), false);
});

const keywordRules = [
  { words: ['UI', 'frontend', 'css', 'component', 'layout', 'rtl', 'design', 'صفحه', 'ظاهر', 'طراحی'], tier: 2, agentType: 'codex', reason: /ui|frontend|design/i },
  { words: ['rename', 'refactor', 'boilerplate', 'migrate', 'add tests', 'تست بنویس'], tier: 2, agentType: 'codex', reason: /mechanical|bulk/i },
  { words: ['backend', 'security', 'auth', 'schema', 'rls', 'architecture', 'debug', 'امنیت', 'دیتابیس'], tier: 3, agentType: 'claude', reason: /backend|security|architecture/i },
] as const;
for (const rule of keywordRules) {
  for (const keyword of rule.words) {
    test(`routes title and description keyword ${keyword}`, () => {
      for (const fields of [{ title: keyword, description: '' }, { title: 'Task', description: keyword.toUpperCase() }]) {
        const result = routeTask(fields);
        assert.equal(result.tier, rule.tier);
        assert.deepEqual(result.target, { kind: 'agent', agentType: rule.agentType });
        assert.match(result.reason, rule.reason);
      }
    });
  }
}

for (const keyword of ['summarize', 'translate', 'classify', 'draft', 'خلاصه', 'ترجمه']) {
  test(`routes public text-only ${keyword} to free tier only without a repo`, () => {
    const result = routeTask({ title: keyword, description: '', sensitivity: 'public' });
    assert.equal(result.tier, 1);
    assert.deepEqual(result.target, free);
    assert.match(result.reason, /text/i);
    for (const fields of [{}, { sensitivity: 'confidential' as const }, { sensitivity: 'public' as const, repoPath: '/tmp/repo' }]) {
      assert.equal(routeTask({ title: keyword, description: '', ...fields }).tier, 3);
    }
  });
}

test('backend rules beat UI, mechanical, and public text rules', () => {
  for (const title of ['design auth', 'refactor schema', 'summarize security', 'طراحی امنیت']) {
    assert.deepEqual(routeTask({ title, description: '', sensitivity: 'public' }).target, { kind: 'agent', agentType: 'claude' });
  }
  assert.equal(routeTask({ title: 'summarize frontend', description: '', sensitivity: 'public' }).tier, 2);
  assert.equal(routeTask({ title: 'draft boilerplate', description: '', sensitivity: 'public' }).tier, 2);
  const fallback = routeTask(input);
  assert.equal(fallback.tier, 3);
  assert.deepEqual(fallback.target, { kind: 'agent', agentType: 'claude' });
  assert.match(fallback.reason, /default|safe/i);
});

test('explicit agents take precedence over requested tiers and all heuristics', () => {
  for (const agentType of ['codex', 'claude', 'copilot', 'opencode', 'hermes', 'openclaw', 'grok'] as AgentType[]) {
    const result = routeTask({ title: 'frontend security', description: '', agentType, requestedTier: 0 });
    assert.equal(result.tier, agentType === 'codex' ? 2 : 3);
    assert.deepEqual(result.target, { kind: 'agent', agentType });
    assert.equal(result.reason, 'explicit agent');
  }
});

test('requested tiers override heuristics while tier 0 and unsafe free requests fail', () => {
  assert.throws(() => routeTask({ ...input, requestedTier: 0 }), { name: 'PolicyError', message: 'tier 0 is not routable yet' });
  for (const [requestedTier, agentType] of [[2, 'codex'], [3, 'claude']] as const) {
    const result = routeTask({ title: 'summarize security frontend', description: '', requestedTier });
    assert.equal(result.tier, requestedTier);
    assert.deepEqual(result.target, { kind: 'agent', agentType });
    assert.match(result.reason, /requested|tier/i);
  }
  const publicFree = routeTask({ ...input, requestedTier: 1, sensitivity: 'public' });
  assert.equal(publicFree.tier, 1);
  assert.deepEqual(publicFree.target, free);
  for (const fields of [{}, { sensitivity: 'confidential' as const }, { sensitivity: 'public' as const, repoPath: '/tmp/repo' }]) {
    assert.throws(() => routeTask({ ...input, requestedTier: 1, ...fields }), PolicyError);
  }
});

const project: Project = { id: 'default', name: 'Default', aliases: [], isDefault: true, createdAt: 1, updatedAt: 1 };
const task = (id: string): Task => ({
  id, projectId: 'default', title: id, description: '', priority: 'medium', columnId: 'backlog',
  agentStatus: 'idle', agentType: 'claude', sensitivity: 'confidential', createdAt: 1,
});

function apiFixture(projectOverrides: Partial<Project> = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateSqliteDatabase(db);
  const repo = new SqliteTaskRepository(db);
  const currentProject = { ...project, ...projectOverrides };
  const projects = { getDefault: async () => currentProject, getById: async () => currentProject } as ProjectRepository;
  const agents = { getAvailableAgents: () => [], isRunning: () => false } as unknown as AgentManager;
  const router = createTaskRouter(repo, agents, projects);
  // Exercise the real router without socket access, matching Phase 1 tests.
  const request = (method: string, url: string, body: unknown = {}): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    const req = { method, url, body, query: {}, headers: {}, header: () => undefined } as unknown as Request;
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      set() { return this; },
      json(value: unknown) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(value)) }); return this; },
    } as unknown as Response;
    router(req, res, (error?: unknown) => reject(error ?? new Error(`No route for ${method} ${url}`)));
  });
  return { repo, request, close: () => db.close() };
}

test('route-preview returns decisions without persisting tasks, including future free targets', async () => {
  const f = apiFixture();
  try {
    for (const body of [{ title: 'frontend', description: '' }, { ...input, requestedTier: 3 }, { title: 'ترجمه', description: '', sensitivity: 'public' }]) {
      const response = await f.request('POST', '/route-preview', body);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, routeTask(body as Parameters<typeof routeTask>[0]));
    }
    assert.equal(await f.repo.count(), 0);
  } finally { f.close(); }
});

test('route-preview distinguishes invalid input from policy failures', async () => {
  const f = apiFixture();
  try {
    for (const body of [null, [], {}, { title: '', description: '' }, { title: 1, description: '' }, { title: 'Task' }, { ...input, description: null }, { ...input, sensitivity: 'x' }, { ...input, requestedTier: '1' }, { ...input, requestedTier: 4 }, { ...input, repoPath: 7 }, { ...input, title: 'a'.repeat(201) }, { ...input, description: 'a'.repeat(5001) }]) {
      assert.equal((await f.request('POST', '/route-preview', body)).status, 400, JSON.stringify(body)?.slice(0, 120));
    }
    for (const body of [{ ...input, requestedTier: 0 }, { ...input, requestedTier: 1 }, { ...input, requestedTier: 1, sensitivity: 'public', repoPath: '/tmp/repo' }]) {
      const response = await f.request('POST', '/route-preview', body);
      assert.equal(response.status, 422);
      assert.equal(typeof response.body.error, 'string');
    }
  } finally { f.close(); }
});

test('creation persists routing metadata and falls back from future free providers', async () => {
  const f = apiFixture();
  try {
    for (const [body, agentType, tier] of [
      [{ title: 'frontend', description: '' }, 'codex', 2],
      [{ title: 'auth', description: '' }, 'claude', 3],
      [{ ...input, requestedTier: 2 }, 'codex', 2],
      [{ title: 'translate', description: '', sensitivity: 'public' }, 'claude', 3],
      [{ ...input, requestedTier: 1, sensitivity: 'public' }, 'claude', 3],
    ] as const) {
      const response = await f.request('POST', '/', body);
      assert.equal(response.status, 201);
      assert.equal(response.body.agentType, agentType);
      assert.equal(response.body.effectiveTier, tier);
      assert.equal(typeof response.body.routingReason, 'string');
      if ('requestedTier' in body) assert.equal(response.body.requestedTier, body.requestedTier);
      if ('sensitivity' in body && body.sensitivity === 'public') assert.match(response.body.routingReason, /free.*(?:available|yet)|(?:available|yet).*free/i);
      const saved = await f.repo.getById(response.body.id);
      assert.equal(saved?.effectiveTier, tier);
      assert.equal(saved?.routingReason, response.body.routingReason);
    }
    assert.equal((await f.request('POST', '/', { ...input, requestedTier: 0 })).status, 422);
    assert.equal((await f.request('POST', '/', { ...input, requestedTier: 1 })).status, 422);
  } finally { f.close(); }
});

test('explicit agent and project defaults preserve existing agent behavior', async () => {
  for (const defaultAgentType of [undefined, 'hermes'] as const) {
    const f = apiFixture({ defaultAgentType });
    try {
      const explicit = await f.request('POST', '/', { ...input, agentType: 'copilot', requestedTier: 0, effectiveTier: 1, routingReason: 'spoofed routing' });
      assert.equal(explicit.status, 201);
      assert.equal(explicit.body.agentType, 'copilot');
      assert.equal(explicit.body.requestedTier, 0);
      assert.equal(explicit.body.effectiveTier, undefined);
      assert.equal(explicit.body.routingReason, undefined);
      const saved = await f.repo.getById(explicit.body.id);
      assert.equal(saved?.effectiveTier, undefined);
      assert.equal(saved?.routingReason, null);
      if (defaultAgentType) {
        const inherited = await f.request('POST', '/', { title: 'frontend', requestedTier: 0 });
        assert.equal(inherited.status, 201);
        assert.equal(inherited.body.agentType, defaultAgentType);
        assert.equal(inherited.body.effectiveTier, undefined);
      }
    } finally { f.close(); }
  }
});

test('a null project agent default routes normally', async () => {
  const f = apiFixture({ defaultAgentType: null } as unknown as Partial<Project>);
  try {
    const response = await f.request('POST', '/', { title: 'frontend' });
    assert.equal(response.status, 201);
    assert.equal(response.body.agentType, 'codex');
    assert.equal(response.body.effectiveTier, 2);
  } finally { f.close(); }
});

test('project repository defaults prevent text-only free routing', async () => {
  const f = apiFixture({ repoPath: process.cwd() });
  try {
    const response = await f.request('POST', '/', { title: 'translate', sensitivity: 'public' });
    assert.equal(response.status, 201);
    assert.equal(response.body.agentType, 'claude');
    assert.equal(response.body.effectiveTier, 3);
    assert.match(response.body.routingReason, /safe|default/i);
    assert.equal(response.body.repoPath, process.cwd());
    assert.equal((await f.request('POST', '/', { ...input, sensitivity: 'public', requestedTier: 1 })).status, 422);
  } finally { f.close(); }
});

test('batch tasks receive the same router defaults and reject policy failures atomically', async () => {
  const f = apiFixture();
  try {
    const response = await f.request('POST', '/batch', { tasks: [{ title: 'frontend' }, { title: 'backend' }] });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body.tasks.map((item: Task) => [item.agentType, item.effectiveTier]), [['codex', 2], ['claude', 3]]);
    const count = await f.repo.count();
    assert.equal((await f.request('POST', '/batch', { tasks: [{ title: 'frontend' }, { ...input, requestedTier: 0 }] })).status, 422);
    assert.equal(await f.repo.count(), count);
  } finally { f.close(); }
});

test('sensitivity changes reject running tasks with 409 even when the patch also ends the run', async () => {
  const f = apiFixture();
  try {
    for (const agentStatus of ['planning', 'executing', 'idle', 'complete', 'failed'] as const) {
      await f.repo.create({ ...task(agentStatus), agentStatus });
      const response = await f.request('PATCH', `/${agentStatus}`, { sensitivity: 'public', agentStatus: 'complete' });
      const running = agentStatus === 'planning' || agentStatus === 'executing';
      assert.equal(response.status, running ? 409 : 200);
      assert.equal((await f.repo.getById(agentStatus))?.sensitivity, running ? 'confidential' : 'public');
      if (running) {
        assert.equal((await f.repo.getById(agentStatus))?.agentStatus, agentStatus);
        assert.equal((await f.request('PATCH', `/${agentStatus}`, { title: 'Still running' })).status, 200);
        assert.equal((await f.request('PATCH', `/${agentStatus}`, { sensitivity: 'confidential' })).status, 200);
      }
    }
  } finally { f.close(); }
});

test('startAgent fails a confidential free dispatch before provider lookup and session creation', async () => {
  for (const sensitivity of [undefined, 'confidential'] as const) {
    const manager = new AgentManager();
    const current = { ...task(`gate-${sensitivity}`), sensitivity };
    const providerMap = (manager as unknown as { providers: Map<AgentType, unknown> }).providers;
    providerMap.get = () => { throw new Error('provider lookup must be guarded'); };
    const statuses: Task['agentStatus'][] = [];
    await new Promise<void>((resolve) => {
      manager.startAgent(current, (status) => { statuses.push(status); resolve(); }, undefined, free);
    });
    assert.deepEqual(statuses, ['failed']);
    assert.equal(manager.isRunning(current.id), false);
    const errors = (await manager.getEvents(current.id)).filter((event) => event.type === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0].content, /public|confidential|free/i);
  }
});

test('PATCH clears a tier override with null and re-routes the idle task', async () => {
  const f = apiFixture();
  try {
    const created = await f.request('POST', '/', { title: 'frontend', requestedTier: 3 });
    assert.equal(created.status, 201);
    assert.equal(created.body.effectiveTier, 3);
    const id = created.body.id;
    const cleared = await f.request('PATCH', `/${id}`, { requestedTier: null });
    assert.equal(cleared.status, 200);
    const saved = await f.repo.getById(id);
    assert.equal(saved?.requestedTier, undefined);
    assert.equal(saved?.effectiveTier, 2);
    assert.equal(saved?.agentType, 'codex');
    assert.match(String(saved?.routingReason), /ui|frontend/i);
  } finally { f.close(); }
});

test('PATCH re-route rejects an impossible tier 1 override and keeps the task unchanged', async () => {
  const f = apiFixture();
  try {
    const created = await f.request('POST', '/', { title: 'backend', sensitivity: 'confidential' });
    const res = await f.request('PATCH', `/${created.body.id}`, { requestedTier: 1 });
    assert.equal(res.status, 400);
    assert.equal((await f.repo.getById(created.body.id))?.requestedTier, undefined);
  } finally { f.close(); }
});

test('free targets are refused for confidential repos even when task says public', () => {
  const home = process.env.HOME;
  process.env.CONFIDENTIAL_REPO_ROOTS = '~/projects/secret-app,~/projects/client-site';
  for (const repoPath of [`${home}/projects/secret-app`, `${home}/projects/secret-app/apps/x`, `${home}/projects/client-site`]) {
    assert.throws(() => checkPolicy({ sensitivity: 'public', repoPath }, free), PolicyError, repoPath);
    assert.doesNotThrow(() => checkPolicy({ sensitivity: 'public', repoPath }, { kind: 'agent', agentType: 'claude' }));
  }
  assert.doesNotThrow(() => checkPolicy({ sensitivity: 'public', repoPath: `${home}/projects/secret-app-other` }, free));
  assert.doesNotThrow(() => checkPolicy({ sensitivity: 'public', repoPath: `${home}/projects/other-app` }, free));
});
