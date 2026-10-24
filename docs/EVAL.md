# Router evaluation

`packages/server/eval/run-eval.ts` contains 20 synthetic tasks. It checks routing locally for every case and runs tier-1 cases through the live free-provider pool and deterministic acceptance checks. Tier-2/3 coding agents are never started. Rejected answers count as “would escalate”; the harness does not execute escalation.

After installing dependencies, run from the repository root:

```bash
npm run build:shared
cd packages/server
npx tsx eval/run-eval.ts
```

Configure protected free-provider key files as described in [ROUTING.md](ROUTING.md). The harness does not import the server's dotenv loader; export model/directory overrides in its launching environment. Missing credentials, quota and network errors are reported as failed/waiting live runs. The harness is not an offline-only unit test and does not assert a failing exit code for every route mismatch.

The script overwrites `docs/EVAL.md` with a generated report containing route checks, live outcomes, known token totals, acceptance rate and optional model-judge scores. Preserve or restore this generic guide after local evaluation; do not publish private output or treat a local report as a benchmark guarantee.

The judge makes additional calls through the same free pool and may share the answerer's model family. Its 1–5 scores can be lenient. Acceptance is heuristic; passing does not establish correctness. Use server unit tests for deterministic regression coverage:

```bash
npm test -w @ai-agent-board/server
```

## Reading the result

Treat route matches, provider availability, and answer acceptance as separate signals. For example, a correctly routed public translation can still fail because its key is missing; a completed answer can still be rejected by the acceptance heuristic. Unknown token counts are not zero, and the harness does not measure coding-agent quality or cost.

## Next steps

Use [ROUTING.md](ROUTING.md) to inspect policy and provider behavior, [contributing](../CONTRIBUTING.md) for the complete regression gate, or the [Persian routing guide](fa/routing.md) for worked examples. AI Router Board builds on DanWahlin/ai-agent-board (MIT).

<div dir="rtl">

## یادداشت فارسی

این ارزیابی از 20 کار ساختگی استفاده می‌کند. قواعد مسیریابی برای همهٔ آن‌ها بررسی می‌شود؛ فقط کار سطح 1 به ارائه‌دهندهٔ واقعی فرستاده می‌شود. عامل برنامه‌نویسی اجرا نمی‌شود و رد پاسخ فقط به معنی «نیاز به ارتقا» در گزارش است. خروجی، فایل همین راهنما را بازنویسی می‌کند؛ نتیجهٔ محلی را بدون بازبینی منتشر نکنید.

گام بعد: [مسیریابی](fa/routing.md) · [پیکربندی کلید](fa/configuration.md).

</div>
