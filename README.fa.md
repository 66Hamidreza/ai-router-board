<p align="center"><img src="images/logo.png" alt="AI Router Board" width="280"></p>

# AI Router Board — راهنمای فارسی

[English](README.md#english) | [فارسی در صفحهٔ اصلی](README.md#فارسی)

[![CI](https://github.com/66Hamidreza/ai-router-board/actions/workflows/ci.yml/badge.svg)](https://github.com/66Hamidreza/ai-router-board/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Release](https://img.shields.io/github/v/release/66Hamidreza/ai-router-board)](https://github.com/66Hamidreza/ai-router-board/releases)

<div dir="rtl">

## فارسی

این پروژه یک تابلوی کانبان محلی برای مدیریت کار با کمک هوش مصنوعی است. متن عمومی به مجموعهٔ ارائه‌دهندگان رایگان و کار برنامه‌نویسی به عامل مناسب سپرده می‌شود. روند اجرا، نتیجه و مصرف ثبت‌شده در همان کارت دیده می‌شود. بررسی حساسیت، کارهای محرمانه را از مسیر رایگان دور نگه می‌دارد.

بر پایهٔ [DanWahlin/ai-agent-board](https://github.com/DanWahlin/ai-agent-board) با مجوز [MIT](LICENSE).

### امکانات

- ستون‌های کارهای آینده، در حال اجرا، بازبینی و پایان‌یافته؛ الگوهای کار، جست‌وجو و گروه‌های کاری با هم‌زمانی قابل تنظیم.
- نمایش زندهٔ رویدادها و ترمینال با WebSocket، جداسازی اختیاری با Git worktree، ادغام محلی و ساخت درخواست تغییر.
- SQLite بدون تنظیم اولیه و PostgreSQL به‌صورت اختیاری.
- نمایش دلیل مسیریابی، کنترل پاسخ رایگان، یک بار ارتقا و ثبت مصرف هر تلاش در بخش «Routing & usage». مصرف نامعلوم با صفر فرق دارد؛ ثبت هزینهٔ عامل‌های برنامه‌نویسی کامل نیست.
- پاک‌سازی خودکار worktreeهای ثبت‌شده و بدون تغییر؛ مسیرهای دارای تغییر، فعال یا نامنطبق و همچنین شاخه‌ها حفظ می‌شوند.

### سطح‌ها و دروازهٔ محرمانگی

| سطح | مقصد | رفتار فعلی و محدودیت |
|---|---|---|
| 0 | اسکریپت | رزرو شده؛ درخواست رد می‌شود |
| 1 | Groq، سپس Gemini و OpenRouter | فقط متن با حساسیت صریح `public` و بدون `repoPath` |
| 2 | Codex | کار مکانیکی و واژه‌های مربوط به رابط کاربری |
| 3 | Claude | بک‌اند، امنیت، معماری، اشکال‌زدایی و حالت پیش‌فرض |
| دروازه | حساسیت و ریشهٔ محرمانه | حساسیت نامشخص، `confidential` است؛ `CONFIDENTIAL_REPO_ROOTS` با برچسب عمومی دور زده نمی‌شود |

عامل صریح بر سطح درخواستی مقدم است و سپس قواعد واژه‌ای اعمال می‌شوند. عامل پیش‌فرض پروژه ممکن است هنگام ساخت کارت پیش از مسیریابی خودکار انتخاب شود. اگر ارائه‌دهندهٔ رایگان آماده نباشد، مسیر ساخت یا ویرایش کارت می‌تواند Claude را همراه دلیل انتخاب کند. جدول، رفتار کد فعلی را شرح می‌دهد؛ سیاست بازبینی و تقسیم کار تیم همچنان برقرار است.

مجموعهٔ رایگان کلیدها را از فایل‌های امن بیرون مخزن می‌خواند و پیش از ارسال، سیاست را دوباره بررسی می‌کند. خطای سهمیه یا 5xx زمان تلاش بعدی می‌دهد؛ از `Retry-After` عددی یا مقدار پیش‌فرض 60 ثانیه استفاده می‌شود. خطای قطعی، ارائه‌دهنده را ده دقیقه کنار می‌گذارد. کارت منتظر را پس از زمان اعلام‌شده دستی اجرا کنید؛ زمان‌بندی خودکار وجود ندارد. خطای شبکه یا سهمیه باعث ارتقای پولی نمی‌شود.

پاسخ خالی، امتناع، تکرار درخواست، بعضی محدودیت‌های طول و ترجمهٔ فارسی کنترل می‌شوند. رد پاسخ رایگان می‌تواند یک بار کار را به Codex ارتقا دهد. پاسخ عامل برنامه‌نویسی حلقهٔ کنترل و ارتقای خودکار ندارد. این بررسی‌ها تضمین درستی پاسخ یا صورتحساب صفر نیستند. [راهنمای مسیریابی](docs/fa/routing.md) جزئیات را توضیح می‌دهد.

### شروع سریع

Node.js نسخهٔ 22 یا بالاتر، npm نسخهٔ 10 یا بالاتر و Git لازم است. ابزار عامل را جدا نصب و احراز هویت کنید؛ برای متن عمومی، تنظیم کلید یک ارائه‌دهندهٔ رایگان کافی است.

</div>

```bash
git clone https://github.com/66Hamidreza/ai-router-board.git
cd ai-router-board
npm ci
cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
npm run dev
```

<div dir="rtl">

تابلو در [localhost:8081](http://localhost:8081) و API روی درگاه محلی 8080 در دسترس است. پروژه و کارت بسازید، حساسیت و تنظیم مخزن و عامل را بررسی کنید، کارت را به حالت اجرا ببرید و عامل را شروع کنید. پیش از ادغام، خروجی، تغییر فایل‌ها و آزمون‌ها را بازبینی کنید.

### نصب با Docker

</div>

```bash
docker compose --profile app up --build -d app
```

<div dir="rtl">

رابط ساخته‌شده و API در [localhost:8080](http://localhost:8080) در دسترس‌اند. پروفایل اختیاری برنامه از SQLite با حجم ماندگار استفاده می‌کند؛ اجرای سادهٔ Compose فقط PostgreSQL را بالا می‌آورد. ابزارها و اعتبارنامه‌های عامل را جدا در کانتینر آماده کنید. دریافت تصویر GHCR و تنظیم کلید و پایگاه داده: [نصب فارسی](docs/fa/install.md) · [راهنمای Docker](docs/DOCKER.md).

### عامل‌ها و یکپارچه‌سازی

عامل‌های ثبت‌شده شامل GitHub Copilot، Claude Code، OpenAI Codex، OpenCode، Hermes، OpenClaw و Grok هستند. آماده بودن به CLI، حساب و محیط سرور وابسته است. SDK مشترک رویدادها را یکسان می‌کند و سرور زمان اجرا و پاک‌سازی را مدیریت می‌کند. [آماده‌سازی عامل‌ها](docs/fa/agents.md) را بخوانید.

مسیر `POST /api/orchestrations` با سرآیند `Idempotency-Key`، شناسه یا نام یا نام مستعار دقیق پروژه و عامل آماده، کارت را بدون ساخت تکراری ایجاد می‌کند. توکن محدود برای خواندن پروژه و عامل، ساخت و خواندن و پیام کار هماهنگ‌شده و روابط کارت کاربرد دارد؛ اجازهٔ ادغام یا مدیریت پروژه نمی‌دهد. جزئیات در [افزونهٔ Hermes](integrations/hermes-agent-board/README.md) آمده است.

### متغیرهای محیطی

سرور تنظیم را از `packages/server/.env` و رابط از `packages/client/.env` می‌خواند؛ متغیرهای صادرشده در محیط فرایند هم قابل استفاده‌اند. فایل نمونهٔ ریشه بارگذار مشترک نیست.

| تنظیم | متغیرهای اصلی |
|---|---|
| شبکه و احراز هویت | `HOST`، `PORT`، `API_URL`، `API_KEY`، `VITE_API_KEY`، `SERVICE_TOKENS` |
| داده و مخزن | `DATABASE_URL`، `DB_PATH`، `AGENTBOARD_HOME`، `ALLOWED_REPO_ROOTS`، `PROJECTS_DIR` |
| سیاست و مدل رایگان | `CONFIDENTIAL_REPO_ROOTS`، `LLM_KEY_DIR`، `FREE_GROQ_MODEL`، `FREE_GEMINI_MODEL`، `FREE_OPENROUTER_MODEL` |
| دسترسی و زمان اجرا | `ALLOWED_ORIGINS`، `ALLOWED_HOSTS`، `VITE_ALLOWED_HOSTS`، `AGENT_TIMEOUT_MS`، `AGENT_BOARD_PUBLIC_URL` |

پیش‌فرض‌ها و نمونهٔ تنظیم عامل‌ها و آزمون در [راهنمای پیکربندی](docs/fa/configuration.md) و جدول انگلیسی همین صفحه آمده‌اند. کلیدهای رایگان در فایل‌های `groq.key`، `gemini.key` و `openrouter.key` با دسترسی 0600 بیرون مخزن نگهداری می‌شوند. پس از تغییر کلید سرور را بازراه‌اندازی کنید. برای اجرای واقعی عامل، `AGENTBOARD_DISABLE_AGENT_STARTUP` را فعال نکنید.

### آزمون و توسعه

</div>

```bash
npm run build:shared
npm test -w @ai-agent-board/server
npx playwright install --with-deps chromium
npm run gate:required
```

<div dir="rtl">

دروازهٔ الزامی، کنترل قرارداد سرور، آزمون یکپارچه‌سازی Hermes، ساخت و آزمون مرورگر را اجرا می‌کند؛ اگر آزمون لازم قابل اجرا نباشد شکست می‌خورد. فقط آزمون مرورگر با `npm run test:e2e:required` اجرا می‌شود. [ارزیابی مدل](docs/EVAL.md) جداگانه و نیازمند دسترسی ارائه‌دهنده است.

برای توسعه از `npm run dev` یا دو دستور `npm run dev:server` و `npm run dev:client` استفاده کنید. خروجی نهایی به‌ترتیب با `npm run build:shared`، `npm run build:server` و `npm run build:client` ساخته می‌شود. کد رابط در `packages/client`، سرور در `packages/server`، آزمون مرورگر در `packages/e2e` و قراردادها در `shared` هستند. نام workspaceها همچنان `@ai-agent-board/*` است. سرور فایل ایستا ارائه نمی‌کند؛ تصویر Docker برای این کار nginx دارد.

مهلت پیش‌فرض اجرا یک ساعت و بازهٔ قابل تنظیم هر کارت 1 تا 240 دقیقه است. رویدادهای خام تا اجرای دوباره یا حذف در پایگاه داده می‌مانند؛ سیاست نگهداری مناسب تعیین کنید.

### راهنماها و امنیت

[نصب](docs/fa/install.md) · [پیکربندی](docs/fa/configuration.md) · [مسیریابی](docs/fa/routing.md) · [عامل‌ها](docs/fa/agents.md) · [پرسش‌های رایج](docs/fa/faq.md) · [مشارکت](docs/fa/contributing.md) · [امنیت](docs/fa/security.md) · [تاریخچهٔ انتشار](CHANGELOG.md)

تابلو را روی اتصال محلی نگه دارید. عامل‌ها می‌توانند فرمان اجرا و مخزن را تغییر دهند. برچسب محرمانه مسیر رایگان را می‌بندد؛ عامل برنامه‌نویسی ممکن است داده را به سرویس خود بفرستد. کلید را بیرون مخزن نگه دارید، حجم‌های متصل را محدود و نتیجه را بازبینی کنید. دسترسی شبکه به TLS و احراز هویت بیرونی نیاز دارد. `VITE_API_KEY` در مرورگر دیده می‌شود و توکن سرویس به‌تنهایی همهٔ مسیرهای رابط را محافظت نمی‌کند. آسیب‌پذیری را از [گزارش خصوصی GitHub](https://github.com/66Hamidreza/ai-router-board/security/advisories/new) بفرستید.

### سپاس و مشارکت‌کنندگان

با همکاری OpenAI Codex و Claude (Anthropic) به‌عنوان همکاران هوش مصنوعی در برنامه‌نویسی، بر پایهٔ DanWahlin/ai-agent-board با مجوز MIT ساخته شده است.

| مشارکت‌کننده | نقش |
|---|---|
| [@66Hamidreza](https://github.com/66Hamidreza) | نگه‌دارنده |
| OpenAI Codex | همکار هوش مصنوعی در برنامه‌نویسی |
| Claude (Anthropic) | همکار هوش مصنوعی در برنامه‌نویسی |
| [Dan Wahlin](https://github.com/DanWahlin) | نویسندهٔ پروژهٔ بالادستی |

مجوز [MIT](LICENSE) است؛ هنگام بازنشر، انتساب بالادستی را حفظ کنید.

</div>
