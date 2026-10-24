# Security policy

AI Router Board is a local development tool whose agents can run commands and modify repositories. Keep services on loopback. An agent process and a container are not a sandbox for untrusted tasks.

## Supported versions

| Version | Security fixes |
|---|---|
| Latest published 0.1.x release | Supported on a best-effort basis |
| Older releases | Upgrade to the latest patch |
| `main` | Development fixes; no stable-release guarantee |

Before the first release, report issues against `main`. No response deadline is promised; maintenance depends on availability.

## Private reporting

Report through [GitHub private vulnerability reporting](https://github.com/66Hamidreza/ai-router-board/security/advisories/new). Do not open a public issue for an unpatched vulnerability. If private reporting is unavailable, use [GitHub Support](https://support.github.com/contact/security) for guidance on a private reporting channel; do not post the details publicly.

Include affected version, prerequisites, minimal synthetic reproduction, expected and observed behavior, and impact. Remove credentials, identifying paths, private repositories, and customer content. Coordinate disclosure with the maintainer before publishing exploit details.

## Scope and severity

- A bypass sending confidential content to a free provider is **high severity**. Missing sensitivity must remain confidential; a public label must not override configured confidential roots. Normal tier-1 routing requires text without a repository path.
- API/WebSocket authentication or scoped-token bypass, command injection, repository/path traversal, and rendered-output XSS are in scope.
- Dependency vulnerabilities affecting this application are in scope. Report upstream SDK defects to their maintainers as well; describe their impact here without publishing sensitive details.
- Expected privileges of an authenticated coding agent and issues requiring a pre-compromised host are not confidentiality guarantees of this application. Report unexpected access across the documented boundaries.

## Operating safely

Store free-provider key files outside the repository with mode 0600. Restart after key changes; cached credential results include missing keys. Never commit `.env`, key files, service tokens, databases, uploads, or private run logs. Revoke and replace exposed credentials; deleting the latest file does not invalidate them.

`API_KEY` protects the full API and WebSocket; the browser needs matching build-time `VITE_API_KEY`, which is visible in browser assets. Prefer SHA-256 hashes and least-privilege scopes for `SERVICE_TOKENS`; service-only mode does not secure all browser routes. `/api/health` also requires the full token when `API_KEY` is set. Configure TLS, an authenticated outer boundary, and explicit host/origin allowlists for network access.

Confidential routing blocks the free pool; paid coding agents can still use remote services. Review their data policies and repository permissions. `CONFIDENTIAL_REPO_ROOTS` and `ALLOWED_REPO_ROOTS` have different purposes and are not OS isolation. Raw events persist until rerun/deletion; define data retention and backup access rules.

Compose binds PostgreSQL and the app to loopback. Its documented database password default is for local development only. See [Docker deployment](docs/DOCKER.md) for credentials, browser-build limits, and mounts. Preserve upstream MIT attribution from DanWahlin/ai-agent-board.

<div dir="rtl">

## خلاصهٔ فارسی

نسخهٔ منتشرشدهٔ جدید شاخهٔ 0.1.x به‌صورت موردی پشتیبانی امنیتی می‌شود؛ نسخهٔ قدیمی را ارتقا دهید. پیش از اولین انتشار، مشکل را برای `main` گزارش کنید. دور زدن سیاست و ارسال دادهٔ محرمانه به ارائه‌دهندهٔ رایگان شدت بالا دارد.

آسیب‌پذیری را از [مسیر خصوصی GitHub](https://github.com/66Hamidreza/ai-router-board/security/advisories/new) با نمونهٔ ساختگی گزارش کنید. کلید، مسیر شخصی و دادهٔ خصوصی را نفرستید و پیش از هماهنگی جزئیات را عمومی نکنید. اگر این مسیر فعال نیست، از پشتیبانی امنیتی GitHub برای یافتن راه ارتباط خصوصی کمک بگیرید.

تابلو را محلی نگه دارید، اعتبارنامه را بیرون مخزن ذخیره کنید و سیاست سرویس عامل را جدا بررسی کنید. گام بعد: [راهنمای امنیت فارسی](docs/fa/security.md).

</div>
