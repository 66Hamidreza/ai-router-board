import type { Task } from '../types.js';

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
function toNumber(raw: string): number | undefined {
  const lower = raw.toLowerCase();
  return /^\d+$/.test(lower) ? Number(lower) : NUMBER_WORDS[lower];
}

// Explicit length limits in the task text. Only unambiguous phrasings are enforced:
// "N-word"/"N words" (about N, +-30%), "at most/under/max N words" (hard cap),
// "in N sentences" / "N-sentence" (hard cap).
const COUNT = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
export function lengthViolation(text: string, out: string): string | null {
  const words = out.split(/\s+/).filter(Boolean).length;
  const sentences = out.split(/[.!?؟]+(?:\s|$)/).filter(s => s.trim()).length;
  const cap = text.match(new RegExp(`(?:at most|no more than|under|within|max(?:imum)?(?: of)?)\\s+${COUNT}\\s+words?`, 'i'));
  if (cap) {
    const n = toNumber(cap[1]);
    if (n !== undefined && words > n) return `answer has ${words} words, limit ${n}`;
  }
  const approx = text.match(new RegExp(`\\b${COUNT}[- ]words?\\b`, 'i'));
  if (approx && !cap) {
    const n = toNumber(approx[1]);
    if (n !== undefined && n >= 5 && (words > Math.ceil(n * 1.3) || words < Math.floor(n * 0.7))) {
      return `answer has ${words} words, asked for about ${n}`;
    }
  }
  const sent = text.match(new RegExp(`(?:\\bin\\s+${COUNT}\\s+sentences?|\\b${COUNT}[- ]sentences?)\\b`, 'i'));
  if (sent) {
    const n = toNumber(sent[1] ?? sent[2]);
    if (n !== undefined && sentences > n) return `answer has ${sentences} sentences, limit ${n}`;
  }
  return null;
}

export interface AcceptanceResult { ok: boolean; reason?: string }

// Max times one task may move up a tier after a failed acceptance check.
export const MAX_ESCALATIONS = 1;

const REFUSAL = /^\s*(i('m| am) sorry|sorry,|i can(no|')t (help|assist|do)|as an ai\b|i('m| am) unable to)/i;

// Cheap, deterministic checks on a tier-1 (text-only) answer. A failure means
// "do not trust this answer", never "the task is wrong".
export function checkFreeResult(task: Pick<Task, 'title' | 'description'>, text: string): AcceptanceResult {
  const out = text.trim();
  if (!out) return { ok: false, reason: 'empty answer' };
  if (REFUSAL.test(out)) return { ok: false, reason: 'refusal-style answer' };
  if (out === task.description.trim() || out === task.title.trim()) return { ok: false, reason: 'answer only repeats the task' };
  const violation = lengthViolation(`${task.title} ${task.description}`, out);
  if (violation) return { ok: false, reason: violation };
  const wantsPersian = /[؀-ۿ]/.test(task.description);
  if (wantsPersian && !/[؀-ۿ]/.test(out) && /ترجمه|فارسی/.test(`${task.title} ${task.description}`)) {
    return { ok: false, reason: 'answer is not in Persian' };
  }
  return { ok: true };
}

// Next tier for an escalation, or null when the ladder is exhausted.
export function escalationTarget(tier: number | undefined): { tier: 2 | 3; agentType: 'codex' | 'claude' } | null {
  if (tier === 1) return { tier: 2, agentType: 'codex' };
  if (tier === 2) return { tier: 3, agentType: 'claude' };
  return null;
}
