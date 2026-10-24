# Contributing to AI Router Board

Contributions should solve a focused problem, preserve confidentiality checks, and remain easy to review. This project builds on [DanWahlin/ai-agent-board](https://github.com/DanWahlin/ai-agent-board) (MIT); retain its license and attribution. Participation follows our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Use Node.js 22+, npm 10+, and Git. From your checkout:

```bash
npm ci
cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
npm run dev
```

Open [localhost:8081](http://localhost:8081). SQLite is the default. Configure credentials outside the repository; authenticate coding CLIs separately. See [README](README.md#quick-start) and [Docker installation](docs/DOCKER.md).

## Checks

```bash
npm run build:shared
npm test -w @ai-agent-board/server
npm run build:server
npm run build:client
# Once per development environment:
npx playwright install --with-deps chromium
# Server contracts, Hermes checks, builds, and required browser suite:
npm run gate:required
```

Report actual outcomes and environment limitations in the PR. The full gate must not claim success when browser checks could not run. Live provider evaluation is optional and separate from deterministic tests; see [EVAL.md](docs/EVAL.md).

## Changes and review

1. Work on a focused branch from `main`. Describe the trigger, expected behavior, and implementation in your PR.
2. Follow the existing strict TypeScript style. Shared contracts live in `shared`; database behavior must remain consistent for SQLite and PostgreSQL. Keep the existing `@ai-agent-board/*` workspace names.
3. Add meaningful regression tests for changed behavior. Routing changes need tests for default confidential sensitivity, explicit public-only free dispatch, confidential roots, explicit agent/tier precedence, and any changed fallback or escalation. Provider changes also need quota, abort, failover, and unsafe-credential cases. See [ROUTING.md](docs/ROUTING.md).
4. Update English and Persian documentation together. Keep English identifiers in code font and code fences outside RTL blocks.
5. Use concise imperative commits, preferably `type: summary` (for example, `fix: reject confidential free routing` or `docs: explain key permissions`). Keep unrelated changes separate.

Never submit credentials, `.env` files, private prompts, database snapshots, uploads, or unredacted logs. Use synthetic issue reproductions. Report vulnerabilities through [private advisories](https://github.com/66Hamidreza/ai-router-board/security/advisories/new), following [SECURITY.md](SECURITY.md).

<div dir="rtl">

## راهنمای کوتاه فارسی

تغییر را محدود و قابل بازبینی نگه دارید، آزمون مرتبط و دروازهٔ الزامی را اجرا کنید و راهنمای هر دو زبان را به‌روز کنید. تغییر مسیریاب باید آزمون حفظ محرمانگی داشته باشد. کلید و دادهٔ خصوصی را ثبت نکنید و انتساب MIT بالادستی را حفظ کنید.

گام بعد: [راهنمای کامل مشارکت](docs/fa/contributing.md) · [امنیت](docs/fa/security.md).

</div>
