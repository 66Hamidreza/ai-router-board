import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { migrateSqliteDatabase } from '../src/db.js';
import { SqliteTaskRepository } from '../src/repositories/sqlite.js';
import { PostgresTaskRepository } from '../src/repositories/postgres.js';
import { SqliteTaskGroupRepository } from '../src/repositories/sqlite-groups.js';
import { createTaskRouter } from '../src/routes/tasks.js';
import type { Task, Project } from '../src/types.js';
import type { TaskUsage } from '../../../shared/types.js';
import type { ProjectRepository } from '../src/repositories/project-types.js';
import type { AgentManager } from '../src/services/agent-manager.js';

const project: Project = { id: 'default', name: 'Default', aliases: [], isDefault: true, createdAt: 1, updatedAt: 1 };
const projects = {
  getDefault: async () => project,
  getById: async (id: string) => id === project.id ? project : undefined,
} as ProjectRepository;
const agents = {
  getAvailableAgents: () => [{ name: 'hermes', displayName: 'Hermes', available: true }],
  isRunning: () => false,
} as unknown as AgentManager;

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateSqliteDatabase(db);
  return db;
}

const task = (id: string): Task => ({
  id, projectId: 'default', title: id, description: '', priority: 'medium', columnId: 'backlog',
  agentStatus: 'idle', agentType: 'hermes', createdAt: 1,
});

interface ApiResponse {
  status: number;
  json: () => Promise<unknown>;
}
type ApiRequest = (url: string, init?: { method: string; headers: Record<string, string>; body: string }) => Promise<ApiResponse>;

// Exercise the real Express router with already-parsed requests, without opening
// a socket so these data-model tests also run in restricted environments.
async function withApi(repo: SqliteTaskRepository, run: (base: string, request: ApiRequest) => Promise<void>) {
  const router = createTaskRouter(repo, agents, projects);
  const base = '/api/tasks';
  const request: ApiRequest = (url, init) => new Promise((resolve, reject) => {
    const headers = init?.headers ?? {};
    const req = {
      method: init?.method ?? 'GET', url: url.slice(base.length) || '/',
      body: init?.body ? JSON.parse(init.body) : {}, query: {}, headers,
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      set() { return this; },
      json(body: unknown) {
        const serialized = JSON.parse(JSON.stringify(body));
        resolve({ status: this.statusCode, json: async () => serialized });
        return this;
      },
    } as unknown as Response;
    router(req, res, (err?: unknown) => reject(err ?? new Error(`No route for ${req.method} ${req.url}`)));
  });
  await run(base, request);
}

const jsonRequest = (method: string, body: unknown) => ({
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('task creation defaults sensitivity to confidential in the API and repository', async () => {
  const db = makeDb();
  const repo = new SqliteTaskRepository(db);
  try {
    await repo.create(task('repository-default'));
    assert.equal((await repo.getById('repository-default'))?.sensitivity, 'confidential');
    await withApi(repo, async (base, request) => {
      const response = await request(base, jsonRequest('POST', { title: 'API default', agentType: 'hermes' }));
      assert.equal(response.status, 201);
      const created = await response.json() as Task;
      assert.equal(created.sensitivity, 'confidential');
      assert.equal(created.requestedTier, undefined);
      assert.equal(created.effectiveTier, undefined);
      assert.equal(created.agentType, 'hermes');
      assert.equal((await repo.getById(created.id))?.sensitivity, 'confidential');
    });
  } finally { db.close(); }
});

test('task create and update reject invalid sensitivity and requestedTier without changing the task', async () => {
  const db = makeDb();
  const repo = new SqliteTaskRepository(db);
  try {
    await repo.create(task('unchanged'));
    const before = await repo.getById('unchanged');
    const invalidValues = [
      ...['private', '', null, 0, false, {}, ['public']].map((sensitivity) => ({ sensitivity })),
      ...[-1, 4, 1.5, '0', null, false, {}, [0]].map((requestedTier) => ({ requestedTier })),
    ];
    await withApi(repo, async (base, request) => {
      for (const values of invalidValues) {
        const created = await request(base, jsonRequest('POST', { title: 'Invalid task', agentType: 'hermes', ...values }));
        assert.equal(created.status, 400, `create ${JSON.stringify(values)}`);
        // PATCH requestedTier:null is valid: it clears the override (covered in router.test.ts).
        if ('requestedTier' in values && values.requestedTier === null) continue;
        const updated = await request(`${base}/unchanged`, jsonRequest('PATCH', values));
        assert.equal(updated.status, 400, `update ${JSON.stringify(values)}`);
      }
    });
    assert.equal(await repo.count(), 1);
    assert.deepEqual(await repo.getById('unchanged'), before);
  } finally { db.close(); }
});

test('all requested tiers and both sensitivities roundtrip through task create and update', async () => {
  const db = makeDb();
  const repo = new SqliteTaskRepository(db);
  try {
    await withApi(repo, async (base, request) => {
      for (const requestedTier of [0, 1, 2, 3]) {
        const response = await request(base, jsonRequest('POST', { title: `Tier ${requestedTier}`, agentType: 'hermes', sensitivity: 'public', requestedTier }));
        assert.equal(response.status, 201);
        const created = await response.json() as Task;
        assert.equal(created.sensitivity, 'public');
        assert.equal(created.requestedTier, requestedTier);
        assert.equal(created.agentType, 'hermes');
        assert.equal((await repo.getById(created.id))?.requestedTier, requestedTier);
        const update = await request(`${base}/${created.id}`, jsonRequest('PATCH', { sensitivity: 'confidential', requestedTier: 0 }));
        assert.equal(update.status, 200);
        const updated = await update.json() as Task;
        assert.equal(updated.sensitivity, 'confidential');
        assert.equal(updated.requestedTier, 0);
        assert.equal(updated.agentType, 'hermes');
      }
    });
    await repo.create({ ...task('decision'), sensitivity: 'public', requestedTier: 0, effectiveTier: 3, routingReason: 'Explicit decision' });
    let decision = await repo.getById('decision');
    assert.equal(decision?.effectiveTier, 3);
    assert.equal(decision?.routingReason, 'Explicit decision');
    await repo.update('decision', { effectiveTier: 0, routingReason: null });
    decision = await repo.getById('decision');
    assert.equal(decision?.effectiveTier, 0);
    assert.equal(decision?.routingReason, null);
  } finally { db.close(); }
});

test('legacy SQLite upgrades add routing columns and preserve their values across the foreign-key rebuild', async () => {
  for (const existingColumns of ['none', 'partial', 'all']) {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec(`CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium', column_id TEXT NOT NULL DEFAULT 'backlog',
        agent_status TEXT NOT NULL DEFAULT 'idle', created_at INTEGER NOT NULL,
        started_at INTEGER, completed_at INTEGER
      )`);
      db.prepare("INSERT INTO tasks (id, title, created_at) VALUES ('legacy', 'Legacy', 1)").run();
      if (existingColumns !== 'none') {
        db.exec("ALTER TABLE tasks ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'confidential'");
        db.exec('ALTER TABLE tasks ADD COLUMN requested_tier INTEGER');
        db.exec("UPDATE tasks SET sensitivity = 'public', requested_tier = 0");
      }
      if (existingColumns === 'all') {
        db.exec('ALTER TABLE tasks ADD COLUMN effective_tier INTEGER');
        db.exec('ALTER TABLE tasks ADD COLUMN routing_reason TEXT');
        db.exec("UPDATE tasks SET effective_tier = 3, routing_reason = 'Preserved legacy decision'");
      }
      migrateSqliteDatabase(db);
      const repo = new SqliteTaskRepository(db);
      const upgraded = await repo.getById('legacy');
      assert.equal(upgraded?.sensitivity, existingColumns === 'none' ? 'confidential' : 'public');
      assert.equal(upgraded?.requestedTier, existingColumns === 'none' ? undefined : 0);
      assert.equal(upgraded?.effectiveTier, existingColumns === 'all' ? 3 : undefined);
      if (existingColumns === 'all') assert.equal(upgraded?.routingReason, 'Preserved legacy decision');
      const foreignKeys = db.pragma('foreign_key_list(tasks)') as Array<{ from: string }>;
      assert.ok(foreignKeys.some((key) => key.from === 'project_id'), 'legacy tasks table was rebuilt');
      migrateSqliteDatabase(db);
      assert.deepEqual(await repo.getById('legacy'), upgraded, 'second migration preserves routing fields');
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    } finally { db.close(); }
  }
});

test('usage preserves unknown null metrics separately from measured zero and exposes them over the API', async () => {
  const db = makeDb();
  const repo = new SqliteTaskRepository(db);
  try {
    await repo.create(task('usage-task'));
    await repo.create(task('other-task'));
    const unknown: Omit<TaskUsage, 'taskId'> = {
      id: 'unknown', attempt: 1, provider: 'hermes', tier: 0,
      inputTokens: null, outputTokens: null, costUsd: null, startedAt: 10,
    };
    const zero: Omit<TaskUsage, 'taskId'> = {
      id: 'zero', attempt: 2, provider: 'hermes', model: 'example-model', tier: 3,
      inputTokens: 0, outputTokens: 0, costUsd: 0, startedAt: 20, endedAt: 25, outcome: 'complete',
    };
    await repo.addUsage('usage-task', unknown);
    await repo.addUsage('usage-task', zero);
    const usages = await repo.listUsage('usage-task');
    assert.deepEqual(usages.map(({ id, inputTokens, outputTokens, costUsd }) => ({ id, inputTokens, outputTokens, costUsd })), [
      { id: 'unknown', inputTokens: null, outputTokens: null, costUsd: null },
      { id: 'zero', inputTokens: 0, outputTokens: 0, costUsd: 0 },
    ]);
    assert.equal(usages[0].taskId, 'usage-task');
    assert.equal(usages[0].tier, 0);
    assert.equal(usages[0].endedAt, undefined);
    assert.equal(usages[1].attempt, 2);
    assert.equal(usages[1].model, 'example-model');
    assert.equal(usages[1].endedAt, 25);
    assert.equal(usages[1].outcome, 'complete');
    assert.deepEqual(await repo.listUsage('other-task'), []);
    await withApi(repo, async (base, request) => {
      const response = await request(`${base}/usage-task/usage`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(usages)));
      const empty = await request(`${base}/other-task/usage`);
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), []);
      assert.equal((await request(`${base}/missing/usage`)).status, 404);
    });
    await repo.delete('usage-task');
    assert.deepEqual(await repo.listUsage('usage-task'), []);
  } finally { db.close(); }
});

test('PostgreSQL usage writes preserve null and zero and map numeric database strings', async () => {
  const unknown: Omit<TaskUsage, 'taskId'> = {
    id: 'pg-unknown', attempt: 1, provider: 'hermes', tier: 0,
    inputTokens: null, outputTokens: null, costUsd: null, startedAt: 10,
  };
  const zero: Omit<TaskUsage, 'taskId'> = {
    id: 'pg-zero', attempt: 2, provider: 'hermes', model: 'example-model', tier: 3,
    inputTokens: 0, outputTokens: 0, costUsd: 0, startedAt: 20, endedAt: 0, outcome: 'complete',
  };
  const rows = [
    { id: 'pg-unknown', task_id: 'pg-task', attempt: 1, provider: 'hermes', model: null, tier: 0,
      input_tokens: null, output_tokens: null, cost_usd: null, started_at: '10', ended_at: null, outcome: null },
    { id: 'pg-zero', task_id: 'pg-task', attempt: 2, provider: 'hermes', model: 'example-model', tier: 3,
      input_tokens: '0', output_tokens: '0', cost_usd: '0', started_at: '20', ended_at: '0', outcome: 'complete' },
    { id: 'pg-measured', task_id: 'pg-task', attempt: 3, provider: 'hermes', model: null, tier: 2,
      input_tokens: '123', output_tokens: '456', cost_usd: '0.0125', started_at: '30', ended_at: '35', outcome: 'complete' },
  ];
  const writes: unknown[][] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO task_usage')) {
        writes.push(params);
        return { rows: [rows[writes.length - 1]], rowCount: 1 };
      }
      assert.match(sql, /SELECT \* FROM task_usage WHERE task_id = \$1/);
      assert.deepEqual(params, ['pg-task']);
      return { rows, rowCount: rows.length };
    },
  };
  const repo = new PostgresTaskRepository(pool as never);
  const savedUnknown = await repo.addUsage('pg-task', unknown);
  const savedZero = await repo.addUsage('pg-task', zero);
  assert.deepEqual(writes, [
    ['pg-unknown', 'pg-task', 1, 'hermes', null, 0, null, null, null, 10, null, null],
    ['pg-zero', 'pg-task', 2, 'hermes', 'example-model', 3, 0, 0, 0, 20, 0, 'complete'],
  ]);
  assert.equal(savedUnknown.inputTokens, null);
  assert.equal(savedUnknown.outputTokens, null);
  assert.equal(savedUnknown.costUsd, null);
  assert.equal(savedUnknown.endedAt, undefined);
  assert.equal(savedZero.inputTokens, 0);
  assert.equal(savedZero.outputTokens, 0);
  assert.equal(savedZero.costUsd, 0);
  assert.equal(savedZero.endedAt, 0);
  const usages = await repo.listUsage('pg-task');
  assert.deepEqual(usages.slice(0, 2), [savedUnknown, savedZero]);
  assert.equal(usages[2].inputTokens, 123);
  assert.equal(usages[2].outputTokens, 456);
  assert.equal(usages[2].costUsd, 0.0125);
  assert.equal(usages[2].startedAt, 30);
  assert.equal(usages[2].endedAt, 35);
});

test('group children preserve routing metadata and confidential defaults on create and read', async () => {
  const db = makeDb();
  const groups = new SqliteTaskGroupRepository(db);
  try {
    const created = await groups.create({
      id: 'routing-group', projectId: 'default', title: 'Routing group', priority: 'medium',
      columnId: 'backlog', maxConcurrency: 2, createdAt: 1,
    }, [
      task('default-child'),
      { ...task('explicit-child'), sensitivity: 'public', requestedTier: 0, effectiveTier: 0, routingReason: 'Local model requested' },
    ]);
    const read = await groups.getChildTasks('routing-group');
    for (const children of [created.children, read]) {
      assert.equal(children.length, 2);
      assert.equal(children[0].sensitivity, 'confidential');
      assert.equal(children[0].requestedTier, undefined);
      assert.equal(children[0].effectiveTier, undefined);
      assert.equal(children[0].routingReason, null);
      assert.equal(children[1].sensitivity, 'public');
      assert.equal(children[1].requestedTier, 0);
      assert.equal(children[1].effectiveTier, 0);
      assert.equal(children[1].routingReason, 'Local model requested');
      assert.equal(children[1].agentType, 'hermes');
    }
  } finally { db.close(); }
});
