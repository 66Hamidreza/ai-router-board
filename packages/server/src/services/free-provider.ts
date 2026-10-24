import { openSync, readFileSync, fstatSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPolicy } from './router.js';
import type { Task } from '../types.js';

export type FreeProvider = 'groq' | 'gemini' | 'openrouter';
const providers = ['groq', 'gemini', 'openrouter'] as const;
const endpoints = Object.freeze({
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
});
const hosts = { groq: 'api.groq.com', gemini: 'generativelanguage.googleapis.com',
  openrouter: 'openrouter.ai' } as const;
// Explicit cap: OpenRouter reserves the model's full max output against key credit otherwise (HTTP 402).
const MAX_OUTPUT_TOKENS = 4096;
const MAX_RESPONSE_BYTES = 1024 * 1024;
interface Credential { key?: string; reason?: string }
// Cache once per configured directory; tests use isolated directories, never real keys.
const credentials = new Map<string, Credential>();

export class ProviderError extends Error {
  constructor(message: string) { super(message); this.name = 'ProviderError'; }
}
export class QuotaError extends ProviderError {
  constructor(public readonly retryAfterMs: number) {
    super('Free provider quota exhausted'); this.name = 'QuotaError';
  }
}
function assertProvider(provider: string): asserts provider is FreeProvider {
  if (!Object.hasOwn(endpoints, provider)) throw new ProviderError('Free provider is not allowlisted');
  const url = new URL(endpoints[provider as FreeProvider]);
  if (url.protocol !== 'https:' || url.hostname !== hosts[provider as FreeProvider]) {
    throw new ProviderError('Free provider is not allowlisted');
  }
}
function credential(provider: FreeProvider): Credential {
  const filename = path.join(process.env.LLM_KEY_DIR ?? path.join(os.homedir(), '.config', 'llm'), `${provider}.key`);
  const cached = credentials.get(filename);
  if (cached) return cached;
  let result: Credential;
  let fd: number | undefined;
  try {
    fd = openSync(filename, 'r');
    const stat = fstatSync(fd);
    if ((stat.mode & 0o077) !== 0) result = { reason: 'key file permissions too open' };
    else if (!stat.isFile()) result = { reason: 'no key' };
    else {
      const key = readFileSync(fd, 'utf8').trim();
      result = key ? { key } : { reason: 'no key' };
    }
  } catch { result = { reason: 'no key' }; }
  finally { if (fd !== undefined) closeSync(fd); }
  credentials.set(filename, result);
  return result;
}
export interface FreeProviderInfo {
  name: FreeProvider; displayName: string; available: boolean; reason?: string;
}
export function getFreeProviderAvailability(provider: FreeProvider): FreeProviderInfo {
  assertProvider(provider);
  const value = credential(provider);
  return { name: provider, displayName: provider === 'groq' ? 'Groq (free)' : provider === 'gemini' ? 'Gemini (free)' : 'OpenRouter (free)',
    available: !!value.key, ...(value.reason ? { reason: value.reason } : {}) };
}
function modelFor(provider: FreeProvider): string {
  if (provider === 'groq') return process.env.FREE_GROQ_MODEL || 'llama-3.3-70b-versatile';
  if (provider === 'gemini') return process.env.FREE_GEMINI_MODEL || 'gemini-flash-latest';
  return process.env.FREE_OPENROUTER_MODEL || 'google/gemini-3.5-flash-lite';
}
export interface FreeModelResult {
  text: string; usage: { inputTokens: number | null; outputTokens: number | null }; model: string;
}
function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function retryDelay(header: string | null): number {
  if (header && /^\d+(?:\.\d+)?$/.test(header.trim())) {
    const ms = Number(header) * 1000;
    if (Number.isFinite(ms)) return ms;
  }
  return 60_000;
}
async function cappedBody(response: Response, signal: AbortSignal): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ProviderError('Free provider response exceeds 1MB');
  }
  if (!response.body) throw new ProviderError('Invalid free provider response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError('Free provider response exceeds 1MB');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
export async function callFreeModel({ provider, prompt, signal, fetchImpl = fetch }: {
  provider: FreeProvider; prompt: string; signal: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<FreeModelResult> {
  assertProvider(provider);
  const { key, reason } = credential(provider);
  if (!key) throw new ProviderError(`Free provider unavailable: ${reason}`);
  const model = modelFor(provider);
  // OpenRouter can route to paid endpoints; only allow free routes or the owner's own Google key (BYOK).
  const byokGoogle = provider === 'openrouter' && model.startsWith('google/');
  if (provider === 'openrouter' && !byokGoogle && !model.endsWith(':free') && model !== 'openrouter/free') {
    throw new ProviderError('OpenRouter model is not a free or BYOK route');
  }
  // The transport and model can echo credentials; never propagate their errors or raw text.
  const redact = (text: string) => text.split(key).join('[redacted]');
  try {
    signal.throwIfAborted();
    const response = await fetchImpl(endpoints[provider], {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }],
        ...(provider === 'openrouter' ? { max_tokens: MAX_OUTPUT_TOKENS } : {}),
        ...(byokGoogle ? { provider: { only: ['google-ai-studio'], allow_fallbacks: false } } : {}) }),
    });
    signal.throwIfAborted();
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      throw new QuotaError(retryDelay(response.headers.get('retry-after')));
    }
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      throw new ProviderError(`Free provider HTTP status ${response.status}`);
    }
    const data = JSON.parse(await cappedBody(response, signal));
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ProviderError('Invalid free provider response');
    return { text: redact(content), model: redact(model), usage: {
      inputTokens: tokenCount(data?.usage?.prompt_tokens), outputTokens: tokenCount(data?.usage?.completion_tokens),
    } };
  } catch (err) {
    if (err instanceof QuotaError) throw err;
    if (err instanceof ProviderError) throw new ProviderError(redact(err.message));
    throw new ProviderError(signal.aborted ? 'Free provider request aborted' : 'Free provider request failed');
  }
}
export interface FreeAttempt {
  provider: FreeProvider; model: string; usage: FreeModelResult['usage'];
  startedAt: number; endedAt: number; outcome: 'complete' | 'quota' | 'failed';
}
// After a hard failure (e.g. regional 403, bad key) skip that provider for a while instead of paying its latency on every task.
export const HARD_FAIL_COOLDOWN_MS = 10 * 60_000;

export class FreeProviderPool {
  private retryTimes = new Map<FreeProvider, number>();
  private hardFailUntil = new Map<FreeProvider, number>();
  constructor(private options: { fetchImpl?: typeof fetch; onAttempt?: (attempt: FreeAttempt) => void | Promise<void> } = {}) {}
  getAvailability(): FreeProviderInfo[] { return providers.map(getFreeProviderAvailability); }
  async run(task: Pick<Task, 'title' | 'description' | 'sensitivity'>, signal = AbortSignal.timeout(60_000),
    onAttempt = this.options.onAttempt): Promise<({ status: 'complete'; provider: FreeProvider } & FreeModelResult) | { status: 'waiting'; retryAt: number }> {
    const prompt = `Answer the following text-only task concisely.\nTitle: ${task.title}\nDescription: ${task.description}`;
    const retries: number[] = [];
    let lastFailure: unknown;
    let coolingDown = false;
    // Fail closed even if no credentials are configured.
    checkPolicy(task, { kind: 'free', provider: 'groq' });
    for (const provider of providers) {
      checkPolicy(task, { kind: 'free', provider });
      signal.throwIfAborted();
      if (!getFreeProviderAvailability(provider).available) continue;
      const retryAt = this.retryTimes.get(provider) ?? 0;
      if (retryAt > Date.now()) { retries.push(retryAt); continue; }
      if ((this.hardFailUntil.get(provider) ?? 0) > Date.now()) { coolingDown = true; continue; }
      const startedAt = Date.now();
      let result: FreeModelResult | undefined;
      let failure: unknown;
      try { result = await callFreeModel({ provider, prompt, signal, fetchImpl: this.options.fetchImpl }); }
      catch (err) { failure = err; }
      const safeModel = modelFor(provider).split(credential(provider).key!).join('[redacted]');
      await onAttempt?.({ provider, model: result?.model ?? safeModel,
        usage: result?.usage ?? { inputTokens: null, outputTokens: null }, startedAt, endedAt: Date.now(),
        outcome: result ? 'complete' : failure instanceof QuotaError ? 'quota' : 'failed' });
      if (result) return { status: 'complete', provider, ...result };
      if (!(failure instanceof QuotaError)) {
        // Hard failure (e.g. regional 403): try the next provider, rethrow only if none succeed.
        lastFailure = failure;
        this.hardFailUntil.set(provider, Date.now() + HARD_FAIL_COOLDOWN_MS);
        continue;
      }
      const next = Date.now() + failure.retryAfterMs;
      this.retryTimes.set(provider, next);
      retries.push(next);
    }
    if (!retries.length && lastFailure) throw lastFailure;
    if (!retries.length && coolingDown) throw new ProviderError('Free providers failed recently; retry in a few minutes');
    if (!retries.length) throw new ProviderError('Free providers unavailable: no key or unsafe key file permissions');
    return { status: 'waiting', retryAt: Math.min(...retries) };
  }
}
