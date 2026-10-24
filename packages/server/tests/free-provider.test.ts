import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  callFreeModel, FreeProviderPool, getFreeProviderAvailability, ProviderError, QuotaError,
  type FreeProvider,
} from '../src/services/free-provider.js';
import { PolicyError } from '../src/services/router.js';

const fakeKey = 'offline-fixture-credential';
const publicTask = { title: 'Translate this', description: 'Hello world', sensitivity: 'public' as const };
const signal = () => new AbortController().signal;
const success = (text = 'Translated text', usage?: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: text } }], ...(usage === undefined ? {} : { usage }),
}), { headers: { 'Content-Type': 'application/json' } });

// Each fixture has a unique cache identity, and never consults the real key directory.
async function fixture(keys: Partial<Record<FreeProvider, string>> = { groq: fakeKey }) {
  const dir = await mkdtemp(join(tmpdir(), 'free-provider-test-'));
  const previous = process.env.LLM_KEY_DIR;
  process.env.LLM_KEY_DIR = dir;
  for (const [provider, value] of Object.entries(keys)) {
    await writeFile(join(dir, `${provider}.key`), value!, { mode: 0o600 });
  }
  return {
    dir,
    async close() {
      if (previous === undefined) delete process.env.LLM_KEY_DIR;
      else process.env.LLM_KEY_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

for (const [provider, endpoint] of [
  ['groq', 'https://api.groq.com/openai/v1/chat/completions'],
  ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
] as const) {
  test(`${provider} uses only its allowlisted HTTPS endpoint and trimmed bearer credential`, async () => {
    const f = await fixture({ [provider]: ` \n${fakeKey}\n ` });
    try {
      const calls: unknown[] = [];
      await callFreeModel({ provider, prompt: 'Only this prompt', signal: signal(), fetchImpl: async (url, init) => {
        calls.push(url);
        assert.equal(String(url), endpoint);
        assert.equal(new URL(String(url)).protocol, 'https:');
        assert.equal(init?.method, 'POST');
        assert.equal(init?.redirect, 'error');
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${fakeKey}`);
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(body.messages, [{ role: 'user', content: 'Only this prompt' }]);
        assert.equal(typeof body.model, 'string');
        assert.deepEqual(Object.keys(body).sort(), ['messages', 'model']);
        return success();
      } });
      assert.equal(calls.length, 1);
    } finally { await f.close(); }
  });
}

test('provider defaults and environment model overrides reach the request and result', async () => {
  const f = await fixture({ groq: fakeKey, gemini: 'other-offline-fixture-credential' });
  const previous = { groq: process.env.FREE_GROQ_MODEL, gemini: process.env.FREE_GEMINI_MODEL };
  try {
    for (const [provider, env, defaultModel] of [
      ['groq', 'FREE_GROQ_MODEL', 'llama-3.3-70b-versatile'],
      ['gemini', 'FREE_GEMINI_MODEL', 'gemini-flash-latest'],
    ] as const) {
      for (const override of [undefined, 'offline-model-override']) {
        if (override === undefined) delete process.env[env];
        else process.env[env] = override;
        const model = override ?? defaultModel;
        const result = await callFreeModel({ provider, prompt: 'Hello', signal: signal(), fetchImpl: async (_url, init) => {
          assert.equal(JSON.parse(String(init?.body)).model, model);
          return success();
        } });
        assert.equal(result.model, model);
      }
    }
  } finally {
    for (const [provider, env] of [['groq', 'FREE_GROQ_MODEL'], ['gemini', 'FREE_GEMINI_MODEL']] as const) {
      if (previous[provider] === undefined) delete process.env[env];
      else process.env[env] = previous[provider];
    }
    await f.close();
  }
});

test('runtime unknown providers and URL-like providers are refused before fetch', async () => {
  const f = await fixture();
  try {
    for (const provider of ['https://api.groq.com.attacker.test/chat', 'http://api.groq.com', 'unknown']) {
      await assert.rejects(callFreeModel({ provider: provider as FreeProvider, prompt: 'Hello', signal: signal(),
        fetchImpl: async () => { assert.fail('unallowlisted endpoint reached fetch'); },
      }), ProviderError);
    }
  } finally { await f.close(); }
});

for (const value of [undefined, '', ' \n\t ']) {
  test(`missing or empty credential is unavailable (${JSON.stringify(value)})`, async () => {
    const f = await fixture(value === undefined ? {} : { groq: value });
    try {
      const available = await getFreeProviderAvailability('groq');
      assert.equal(available.available, false);
      assert.equal(available.reason, 'no key');
      await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(),
        fetchImpl: async () => { assert.fail('unavailable provider fetched'); },
      }), ProviderError);
    } finally { await f.close(); }
  });
}

for (const mode of [0o640, 0o604, 0o620, 0o601]) {
  test(`credential mode ${mode.toString(8)} refuses any group/other permission`, async () => {
    const f = await fixture();
    try {
      await chmod(join(f.dir, 'groq.key'), mode);
      const available = await getFreeProviderAvailability('groq');
      assert.equal(available.available, false);
      assert.equal(available.reason, 'key file permissions too open');
      await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(),
        fetchImpl: async () => { assert.fail('insecure credential reached fetch'); },
      }), ProviderError);
    } finally { await f.close(); }
  });
}

test('keys are cached lazily and availability returns only safe metadata', async () => {
  const f = await fixture();
  try {
    const available = await getFreeProviderAvailability('groq');
    assert.equal(available.available, true);
    assert.equal(JSON.stringify(available).includes(fakeKey), false);
    await writeFile(join(f.dir, 'groq.key'), 'changed-fixture-credential');
    await callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${fakeKey}`);
      return success();
    } });
  } finally { await f.close(); }
});

for (const [usage, expected] of [
  [undefined, { inputTokens: null, outputTokens: null }],
  [{ prompt_tokens: 12, completion_tokens: 7 }, { inputTokens: 12, outputTokens: 7 }],
  [{ prompt_tokens: 0, completion_tokens: 0 }, { inputTokens: 0, outputTokens: 0 }],
  [{ prompt_tokens: 12 }, { inputTokens: 12, outputTokens: null }],
] as const) {
  test(`token usage preserves absent vs reported numbers (${JSON.stringify(usage)})`, async () => {
    const f = await fixture();
    try {
      const result = await callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl: async () => success('Answer', usage) });
      assert.equal(result.text, 'Answer');
      assert.deepEqual(result.usage, expected);
      assert.equal(typeof result.model, 'string');
    } finally { await f.close(); }
  });
}

for (const [status, retryAfter, expected] of [[429, '7', 7000], [500, undefined, 60000], [503, 'bad', 60000]] as const) {
  test(`quota HTTP ${status} carries sanitized retry delay`, async () => {
    const f = await fixture();
    try {
      await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl: async () =>
        new Response(fakeKey, { status, headers: retryAfter ? { 'Retry-After': retryAfter } : {} }),
      }), (error: unknown) => {
        assert.ok(error instanceof QuotaError);
        assert.equal(error.retryAfterMs, expected);
        assert.equal(String(error).includes(fakeKey), false);
        return true;
      });
    } finally { await f.close(); }
  });
}

test('errors, response text, attempt events, and logs never expose credentials', async () => {
  const f = await fixture({ groq: fakeKey, gemini: 'other-offline-fixture-credential' });
  const logs: unknown[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    for (const fetchImpl of [
      async () => new Response(`echo ${fakeKey}`, { status: 401 }),
      async () => { throw new Error(`transport ${fakeKey}`); },
      async () => { throw new ProviderError(`transport ${fakeKey}`); },
      async () => new Response(`invalid JSON ${fakeKey}`),
    ]) {
      await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl }), (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(String(error).includes(fakeKey), false);
        assert.equal(JSON.stringify(error).includes(fakeKey), false);
        return true;
      });
    }
    const attempts: unknown[] = [];
    const pool = new FreeProviderPool({ fetchImpl: async () => success(`provider echoed ${fakeKey}`),
      onAttempt: (attempt) => { attempts.push(attempt); },
    });
    const result = await pool.run(publicTask);
    for (const output of [result, attempts, logs]) assert.equal(JSON.stringify(output).includes(fakeKey), false);
  } finally {
    Object.assign(console, originals);
    await f.close();
  }
});

for (const status of [429, 503]) {
  test(`pool falls back from groq HTTP ${status} to gemini and records each attempt`, async () => {
    const f = await fixture({ groq: fakeKey, gemini: 'other-offline-fixture-credential' });
    try {
      const calls: string[] = [];
      const attempts: unknown[] = [];
      const pool = new FreeProviderPool({ fetchImpl: async (url) => {
        calls.push(String(url));
        return calls.length === 1 ? new Response('', { status }) : success('Gemini answer');
      }, onAttempt: (attempt) => { attempts.push(attempt); } });
      const result = await pool.run(publicTask);
      assert.equal(result.status, 'complete');
      if (result.status === 'complete') { assert.equal(result.provider, 'gemini'); assert.equal(result.text, 'Gemini answer'); }
      assert.equal(calls.length, 2);
      assert.equal(new URL(calls[0]).hostname, 'api.groq.com');
      assert.equal(new URL(calls[1]).hostname, 'generativelanguage.googleapis.com');
      assert.equal(attempts.length, 2);
    } finally { await f.close(); }
  });
}

test('pool exhaustion waits with retryAt and never calls a paid provider', async () => {
  const f = await fixture({ groq: fakeKey, gemini: 'other-offline-fixture-credential' });
  try {
    const calls: string[] = [];
    const before = Date.now();
    const pool = new FreeProviderPool({ fetchImpl: async (url) => {
      calls.push(new URL(String(url)).hostname);
      return new Response('', { status: 429, headers: { 'Retry-After': '10' } });
    } });
    const result = await pool.run(publicTask);
    assert.equal(result.status, 'waiting');
    if (result.status === 'waiting') {
      assert.ok(result.retryAt >= before + 10000);
      assert.ok(result.retryAt <= Date.now() + 10000);
    }
    assert.deepEqual(calls, ['api.groq.com', 'generativelanguage.googleapis.com']);
  } finally { await f.close(); }
});

test('confidential task and newly confidential fallback are blocked before network', async () => {
  const f = await fixture({ groq: fakeKey, gemini: 'other-offline-fixture-credential' });
  try {
    const blocked = new FreeProviderPool({ fetchImpl: async () => { assert.fail('confidential task fetched'); } });
    await assert.rejects(blocked.run({ ...publicTask, sensitivity: 'confidential' }), PolicyError);
    const task = { ...publicTask, sensitivity: 'public' as 'public' | 'confidential' };
    let calls = 0;
    const fallback = new FreeProviderPool({ fetchImpl: async () => {
      calls++;
      task.sensitivity = 'confidential';
      return new Response('', { status: 429 });
    } });
    await assert.rejects(fallback.run(task), PolicyError);
    assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('tier 1 prompt contains only fixed prefix, title, and description', async () => {
  const f = await fixture();
  try {
    const task = { ...publicTask, repoPath: '/private/repo-marker', worktreePath: '/private/worktree-marker',
      attachments: [{ path: '/private/attachment-marker', content: 'attachment-content-marker' }],
      branch: 'branch-context-marker', repoContext: 'repo-content-marker',
    };
    const pool = new FreeProviderPool({ fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.messages.length, 1);
      const prompt = body.messages[0].content;
      assert.ok(prompt.includes(task.title));
      assert.ok(prompt.includes(task.description));
      for (const marker of ['repo-marker', 'worktree-marker', 'attachment-marker', 'attachment-content-marker', 'branch-context-marker', 'repo-content-marker']) {
        assert.equal(prompt.includes(marker), false);
      }
      return success();
    } });
    assert.equal((await pool.run(task)).status, 'complete');
  } finally { await f.close(); }
});

test('redirects are refused rather than consuming their response bodies', async () => {
  const f = await fixture();
  try {
    for (const status of [301, 302, 307, 308]) {
      await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl: async (_url, init) => {
        assert.equal(init?.redirect, 'error');
        return new Response(fakeKey, { status, headers: { Location: 'https://attacker.test/' } });
      } }), ProviderError);
    }
  } finally { await f.close(); }
});

test('response cap rejects declared and streamed bodies beyond 1 MiB', async () => {
  const f = await fixture();
  try {
    await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl: async () =>
      new Response('{}', { headers: { 'Content-Length': String(1024 * 1024 + 1) } }),
    }), ProviderError);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700000));
        controller.enqueue(new Uint8Array(700000));
      },
      cancel() { cancelled = true; },
    });
    await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: signal(), fetchImpl: async () => new Response(stream) }), ProviderError);
    assert.equal(cancelled, true);
  } finally { await f.close(); }
});

test('the supplied abort signal reaches fetch and timeout errors are sanitized', async () => {
  const f = await fixture();
  try {
    const controller = new AbortController();
    await assert.rejects(callFreeModel({ provider: 'groq', prompt: 'Hello', signal: controller.signal, fetchImpl: async (_url, init) => {
      assert.equal(init?.signal, controller.signal);
      controller.abort();
      throw new DOMException(`aborted ${fakeKey}`, 'AbortError');
    } }), (error: unknown) => {
      assert.equal(String(error).includes(fakeKey), false);
      return true;
    });
  } finally { await f.close(); }
});

test('openrouter is allowlisted and pool falls through a hard groq failure to it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llm-keys-'));
  for (const n of ['groq', 'openrouter']) await writeFile(join(dir, `${n}.key`), `${n}-key\n`, { mode: 0o600 });
  const prev = process.env.LLM_KEY_DIR;
  process.env.LLM_KEY_DIR = dir;
  try {
    const hosts: string[] = [];
    const fetchImpl = (async (url: string) => {
      hosts.push(new URL(url).hostname);
      return hosts.length === 1 ? new Response('denied', { status: 403 })
        : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    }) as unknown as typeof fetch;
    const out = await new FreeProviderPool({ fetchImpl }).run({ title: 't', description: 'd', sensitivity: 'public' } as never);
    assert.equal(out.status, 'complete');
    assert.deepEqual(hosts, ['api.groq.com', 'openrouter.ai']);
  } finally {
    if (prev === undefined) delete process.env.LLM_KEY_DIR; else process.env.LLM_KEY_DIR = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

test('openrouter defaults to BYOK Google route with no paid fallback and rejects paid models', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llm-keys-'));
  await writeFile(join(dir, 'openrouter.key'), 'or-key\n', { mode: 0o600 });
  const prevDir = process.env.LLM_KEY_DIR, prevModel = process.env.FREE_OPENROUTER_MODEL;
  process.env.LLM_KEY_DIR = dir;
  try {
    let body: any;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    }) as unknown as typeof fetch;
    await callFreeModel({ provider: 'openrouter', prompt: 'x', signal: new AbortController().signal, fetchImpl });
    assert.equal(body.model, 'google/gemini-3.5-flash-lite');
    assert.deepEqual(body.provider, { only: ['google-ai-studio'], allow_fallbacks: false });
    assert.equal(body.max_tokens, 4096);
    process.env.FREE_OPENROUTER_MODEL = 'anthropic/claude-opus-5-5';
    await assert.rejects(callFreeModel({ provider: 'openrouter', prompt: 'x', signal: new AbortController().signal, fetchImpl }), ProviderError);
  } finally {
    if (prevDir === undefined) delete process.env.LLM_KEY_DIR; else process.env.LLM_KEY_DIR = prevDir;
    if (prevModel === undefined) delete process.env.FREE_OPENROUTER_MODEL; else process.env.FREE_OPENROUTER_MODEL = prevModel;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a provider with a hard failure is skipped on later runs (cooldown) and the next one is used directly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llm-keys-'));
  for (const n of ['groq', 'gemini']) await writeFile(join(dir, `${n}.key`), `${n}-key\n`, { mode: 0o600 });
  const prev = process.env.LLM_KEY_DIR;
  process.env.LLM_KEY_DIR = dir;
  try {
    const hosts: string[] = [];
    const fetchImpl = (async (url: string) => {
      const host = new URL(url).hostname; hosts.push(host);
      return host === 'api.groq.com' ? new Response('denied', { status: 403 })
        : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    }) as unknown as typeof fetch;
    const pool = new FreeProviderPool({ fetchImpl });
    const t = { title: 't', description: 'd', sensitivity: 'public' } as never;
    assert.equal((await pool.run(t)).status, 'complete');
    assert.equal((await pool.run(t)).status, 'complete');
    assert.deepEqual(hosts, ['api.groq.com', 'generativelanguage.googleapis.com', 'generativelanguage.googleapis.com']);
  } finally {
    if (prev === undefined) delete process.env.LLM_KEY_DIR; else process.env.LLM_KEY_DIR = prev;
    await rm(dir, { recursive: true, force: true });
  }
});
