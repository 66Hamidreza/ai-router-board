// Phase 6: 20 synthetic public tasks. Routing is checked offline for all 20;
// tasks routed to tier 1 are also run live through the free pool + acceptance checks.
// Paid agents (tier 2/3) are never started here. Run: npx tsx eval/run-eval.ts
import { writeFileSync } from 'node:fs';
import { routeTask, PolicyError } from '../src/services/router.js';
import { FreeProviderPool } from '../src/services/free-provider.js';
import { checkFreeResult } from '../src/services/acceptance.js';

interface Case { title: string; description: string; sensitivity: 'public' | 'confidential'; repoPath?: string; expect: 1 | 2 | 3 }
const cases: Case[] = [
  { title: 'Summarize article', description: 'Summarize in two sentences: Solar panels convert sunlight into electricity using photovoltaic cells. Costs have fallen sharply in a decade.', sensitivity: 'public', expect: 1 },
  { title: 'Translate to Persian', description: 'ترجمه کن به فارسی: The weather is nice today and we will walk in the park.', sensitivity: 'public', expect: 1 },
  { title: 'Classify sentiment', description: 'Classify as positive, negative or neutral: "The delivery was late but support fixed it quickly."', sensitivity: 'public', expect: 1 },
  { title: 'Draft apology email', description: 'Draft a short polite email apologising for a delayed shipment.', sensitivity: 'public', expect: 1 },
  { title: 'Summarize meeting notes', description: 'Summarize: We agreed to ship v2 on Friday, QA needs two more days, marketing will announce Monday.', sensitivity: 'public', expect: 1 },
  { title: 'Translate to Persian', description: 'ترجمه کن: Please restart the router and wait one minute.', sensitivity: 'public', expect: 1 },
  { title: 'Classify ticket', description: 'Classify this support ticket as billing, technical or sales: "I was charged twice this month."', sensitivity: 'public', expect: 1 },
  { title: 'Draft product blurb', description: 'Draft a 30-word product blurb for a reusable water bottle.', sensitivity: 'public', expect: 1 },
  { title: 'Summarize private contract', description: 'Summarize this contract clause about payment terms.', sensitivity: 'confidential', expect: 3 },
  { title: 'Translate customer data', description: 'Translate this customer record to Persian.', sensitivity: 'confidential', expect: 3 },
  { title: 'Summarize repo README', description: 'Summarize the README of this repository.', sensitivity: 'public', repoPath: '/tmp/x', expect: 3 },
  { title: 'Fix auth bug', description: 'Debug the backend auth token expiry check.', sensitivity: 'public', repoPath: '/tmp/x', expect: 3 },
  { title: 'Security review', description: 'Security review of the upload endpoint.', sensitivity: 'public', repoPath: '/tmp/x', expect: 3 },
  { title: 'DB schema change', description: 'Design the schema and RLS for invoices.', sensitivity: 'public', repoPath: '/tmp/x', expect: 3 },
  { title: 'Architecture notes', description: 'Propose architecture for a queue worker.', sensitivity: 'public', repoPath: '/tmp/x', expect: 3 },
  { title: 'Build login component', description: 'Build the login component with RTL layout and CSS.', sensitivity: 'public', repoPath: '/tmp/x', expect: 2 },
  { title: 'Redesign settings page', description: 'Redesign the settings frontend page.', sensitivity: 'public', repoPath: '/tmp/x', expect: 2 },
  { title: 'Rename helper', description: 'Rename the helper function across files, refactor imports.', sensitivity: 'public', repoPath: '/tmp/x', expect: 2 },
  { title: 'Add tests', description: 'add tests for the date utils module.', sensitivity: 'public', repoPath: '/tmp/x', expect: 2 },
  { title: 'Migrate config files', description: 'migrate the config files to the new format.', sensitivity: 'public', repoPath: '/tmp/x', expect: 2 },
];

// LLM judge: same free pool, strict JSON. A model grading its own family may be lenient (see report caveat).
async function judge(c: Case, answer: string): Promise<{ score: number; why: string } | null> {
  try {
    const r = await pool.run({ title: 'Grade an answer', sensitivity: 'public', description:
      `You are a strict grader. Task given to an assistant:\n<<<${c.description}>>>\nAssistant answer:\n<<<${answer}>>>\n`
      + 'Grade 1-5 for correctness and following the instructions (5 = fully correct and complete, 3 = partly, 1 = wrong or ignores the task). '
      + 'Reply with ONLY JSON like {"score":4,"why":"short reason"}.' });
    if (r.status !== 'complete') return null;
    const m = r.text.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    return j && Number.isFinite(j.score) ? { score: Number(j.score), why: String(j.why ?? '').slice(0, 80) } : null;
  } catch { return null; }
}
const scores: number[] = [];
const JUDGE_MIN = 4;
const rows: string[] = [];
let routeOk = 0, freeRuns = 0, accepted = 0, escalated = 0, failedRuns = 0, waiting = 0, tokIn = 0, tokOut = 0, unknownTok = 0;
const pool = new FreeProviderPool();
let n = 0;
for (const c of cases) {
  n++;
  let tier: number | string; let reason = '';
  try { const d = routeTask(c); tier = d.tier; reason = d.reason; } catch (e) { tier = e instanceof PolicyError ? 'policy-block' : 'error'; }
  const ok = tier === c.expect; if (ok) routeOk++;
  let live = '-';
  if (tier === 1) {
    freeRuns++;
    const t0 = Date.now();
    try {
      const r = await pool.run(c);
      if (r.status === 'waiting') { waiting++; live = 'waiting (quota)'; }
      else {
        const v = checkFreeResult(c, r.text);
        if (v.ok) accepted++; else escalated++;
        const { inputTokens: i, outputTokens: o } = r.usage;
        if (i === null || o === null) unknownTok++; else { tokIn += i; tokOut += o; }
        const g = v.ok ? await judge(c, r.text) : null;
        if (g) scores.push(g.score);
        live = `${r.provider}/${r.model} ${v.ok ? 'accepted' : 'REJECTED: ' + v.reason} ${Date.now() - t0}ms tok ${i ?? '?'}/${o ?? '?'} judge ${g ? `${g.score}/5 (${g.why})` : 'n/a'}`;
      }
    } catch (e: any) { failedRuns++; live = `failed: ${e?.message}`; }
  }
  rows.push(`| ${n} | ${c.title} | ${c.sensitivity}${c.repoPath ? '+repo' : ''} | T${c.expect} | ${tier === 'policy-block' || tier === 'error' ? tier : 'T' + tier} | ${ok ? 'ok' : 'MISMATCH'} | ${live} |`);
}
const done = accepted + escalated;
const md = `# Phase 6 evaluation (20 synthetic tasks)

Generated by \`packages/server/eval/run-eval.ts\`. Paid agents are never started; tier 2/3 tasks are only routed, not executed.

- Routing correct: **${routeOk}/${cases.length}**
- Routed to tier 1 and run live: ${freeRuns} (completed ${done}, waiting on quota ${waiting}, failed ${failedRuns})
- Acceptance: ${accepted} accepted, ${escalated} would escalate → escalation rate **${done ? Math.round(100 * escalated / done) : 0}%** of completed free runs
- Tokens (known only): ${tokIn} in / ${tokOut} out; runs with unknown usage: ${unknownTok}
- Judge (LLM, 1-5, same free pool): ${scores.length ? `mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)} over ${scores.length} answers, ${scores.filter(x => x < JUDGE_MIN).length} below ${JUDGE_MIN} → judge-based escalation rate ${Math.round(100 * scores.filter(x => x < JUDGE_MIN).length / scores.length)}%` : 'no judge result'}
- Caveat: the judge is a free model, possibly from the same family as the answerer, so it may grade leniently; treat it as a rough signal.
- Caveat: acceptance checks are cheap heuristics (empty/refusal/echo/Persian), not a quality judge; "accepted" does not prove the answer is correct.

| # | Task | Sensitivity | Expected | Routed | Route check | Live free run |
|---|------|-------------|----------|--------|-------------|---------------|
${rows.join('\n')}
`;
writeFileSync(new URL('../../../docs/EVAL.md', import.meta.url), md);
console.log(md.split('\n').slice(0, 9).join('\n'));
