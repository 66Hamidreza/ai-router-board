<div dir="rtl">

# پیکربندی

[بازگشت](../../README.fa.md) · [امنیت](security.md)

سرور از `dotenv/config` و پوشهٔ کاری خودش استفاده می‌کند؛ اجرای workspace از ریشه، تنظیم آن را در `packages/server/.env` می‌خواند. Vite تنظیم رابط را از `packages/client/.env` می‌خواند. فایل نمونهٔ ریشه به‌خودی‌خود برای هر دو بخش بارگذاری نمی‌شود. متغیرهای صادرشده در محیط فرایند نیز قابل استفاده‌اند. تمام مقادیر زیر نمونه‌اند؛ هیچ کلید واقعی در این راهنما وجود ندارد.

## سرور، شبکه و داده

| متغیر | نمونه | کاربرد و پیش‌فرض |
|---|---|---|
| `HOST` | `127.0.0.1` | نشانی اتصال سرور و Vite؛ پیش‌فرض حلقهٔ محلی |
| `PORT` | `8080` | درگاه API؛ پیش‌فرض 8080؛ درگاه Vite جداگانه 8081 است |
| `API_URL` | `http://localhost:8080` | مقصد پراکسی API و WebSocket در Vite؛ همین مقدار پیش‌فرض است |
| `ALLOWED_ORIGINS` | `http://localhost:8081` | فهرست مبدأهای CORS و WebSocket؛ پیش‌فرض درگاه‌های محلی 8081، 4175 و 4176 |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | نام میزبان مجاز برای ارتقای WebSocket سرور؛ همین مقدار پیش‌فرض است |
| `VITE_ALLOWED_HOSTS` | `localhost,127.0.0.1` | میزبان‌های HTTP و پراکسی WebSocket رابط؛ از الگوی همه‌میزبان استفاده نکنید |
| `DATABASE_URL` | `postgresql://agentboard:replace-me@localhost:5433/agentboard` | اتصال PostgreSQL؛ بدون آن SQLite انتخاب می‌شود |
| `DB_PATH` | `./data/agentboard.db` | مسیر SQLite نسبت به پوشهٔ کاری سرور؛ پیش‌فرض همین مسیر است |
| `AGENTBOARD_HOME` | `~/agentboard` | محل تنظیم سرور؛ پیش‌فرض `~/agentboard` و محل پیش‌فرض کلون زیرپوشهٔ `projects` آن است |
| `ALLOWED_REPO_ROOTS` | `~/projects,/tmp` | ریشه‌های مجاز مخزن؛ پیش‌فرض شامل خانه، پوشهٔ موقت و فضای کاری است؛ محل کلون تنظیم‌شده همیشه افزوده می‌شود |
| `PROJECTS_DIR` | `~/projects` | ریشهٔ اضافی هنگام ساخت فهرست مجاز پیش‌فرض؛ مقدار پیش‌فرض ندارد |
| `AGENT_BOARD_PUBLIC_URL` | `https://kanban.example.com` | نشانی عمومی برای پیوند مستقیم کارت‌های orchestration؛ بدون آن از درخواست ساخته می‌شود |

## احراز هویت

| متغیر | نمونه | کاربرد |
|---|---|---|
| `API_KEY` | `replace-me` | کلید با دسترسی کامل برای API و WebSocket؛ پیش‌فرض خالی |
| `VITE_API_KEY` | `replace-me` | کلید رابط که باید با سرور یکسان باشد؛ در کد مرورگر قابل مشاهده است |
| `SERVICE_TOKENS` | `[]` | آرایهٔ JSON اعتبارنامه‌های محدود؛ پیش‌فرض بدون اعتبارنامه |

هر عضو آرایه یکی از فیلدهای `token` یا `sha256` و فهرست `scopes` دارد. ذخیرهٔ چکیدهٔ SHA-256 ترجیح دارد. حوزه‌های معتبر دقیقاً این‌ها هستند:

</div>

```text
projects:read
agents:read
orchestrations:create
orchestrations:read
orchestrations:message
tasks:relationships
```

<div dir="rtl">

فقط تنظیم توکن سرویس جایگزین حفاظت کامل رابط نیست؛ بعضی خواندن‌ها و مسیرهای عادی در این حالت باز می‌مانند. برای حفاظت کامل API از کلید اصلی و برای دسترسی شبکه از مرز احراز هویت بیرونی استفاده کنید.

## مسیریاب و مدل متنی

| متغیر | نمونه | کاربرد و پیش‌فرض |
|---|---|---|
| `CONFIDENTIAL_REPO_ROOTS` | `~/projects/private` | ریشه‌های محرمانه با جداسازی ویرگول؛ پیش‌فرض خالی؛ `~` گسترش می‌یابد |
| `LLM_KEY_DIR` | `/var/lib/llm-keys` | محل فایل کلید؛ پیش‌فرض `~/.config/llm`؛ در مقدار سفارشی از مسیر گسترش‌یافته استفاده کنید، چون خود متغیر `~` را گسترش نمی‌دهد |
| `FREE_GROQ_MODEL` | `llama-3.3-70b-versatile` | مدل Groq؛ پیش‌فرض همین مقدار |
| `FREE_GEMINI_MODEL` | `gemini-flash-latest` | مدل Gemini؛ پیش‌فرض همین مقدار |
| `FREE_OPENROUTER_MODEL` | `openrouter/free` | نمونهٔ مسیر رایگان؛ پیش‌فرض کد `google/gemini-3.5-flash-lite` است |
| `AGENT_TIMEOUT_MS` | `3600000` | مهلت پیش‌فرض یک ساعت؛ مقدار هر کارت می‌تواند 1 تا 240 دقیقه باشد |
| `AGENTBOARD_DISABLE_AGENT_STARTUP` | `1` | مقدار `1` یا `true` راه‌اندازی عامل‌های برنامه‌نویسی را برای آزمون غیرفعال می‌کند |

کلیدها باید بیرون مخزن، در فایل‌های زیر باشند:

</div>

```text
~/.config/llm/groq.key
~/.config/llm/gemini.key
~/.config/llm/openrouter.key
```

<div dir="rtl">

پوشه را با دسترسی محدود بسازید و فایل کلید را با ویرایشگر محلی پر کنید. کلید را در فرمان قابل ثبت در تاریخچه نگذارید:

</div>

```bash
mkdir -p ~/.config/llm
chmod 700 ~/.config/llm
# After creating each key file with a local editor:
chmod 600 ~/.config/llm/groq.key
```

<div dir="rtl">

برای فایل‌های دیگر نیز همین دسترسی لازم است. کد هر فایل دارای دسترسی گروه یا دیگران را رد می‌کند؛ فایل باید معمولی باشد. نتیجهٔ خواندن کلید، حتی نبودن آن، در حافظه می‌ماند؛ پس از تغییر کلید سرور را بازراه‌اندازی کنید. مجموعهٔ ارائه‌دهندگان رایگان مستقیماً متغیرهایی مانند `GROQ_API_KEY` را نمی‌خواند. اگر کلید را در محیط نگه می‌دارید، خارج از مخزن با سازوکار خودتان فایل امن بسازید؛ مسیر مستقیم از env برای کلید پیاده نشده است.

OpenRouter فقط مسیرهای `:free`، مقدار `openrouter/free` یا مدل‌های `google/` با مسیر محدود Google BYOK را می‌پذیرد. حالت آخر به تنظیم کلید شخصی در خود ارائه‌دهنده نیاز دارد؛ نام «رایگان» تضمین صورتحساب صفر نیست.

## تنظیمات عامل‌ها

`HERMES_COMMAND` با پیش‌فرض `hermes` در خود سرور برای تشخیص و اجرا خوانده می‌شود. مقدار نمونه همان `hermes` است.

متغیرهای زیر در SDK نصب‌شده و محیط فرزند آن بررسی شده‌اند؛ سرور مستقیماً آن‌ها را تفسیر نمی‌کند. اگر مدل‌های سه عامل اصلی را تعیین نکنید، SDK از تنظیم پیش‌فرض خود عامل استفاده می‌کند؛ شناسه‌های فایل نمونه پیش‌فرض اجباری برنامه نیستند:

| متغیر | مقدار نمونه | منظور |
|---|---|---|
| `COPILOT_MODEL` | `claude-opus-4-20250514` | انتخاب مدل Copilot در نمونهٔ تنظیم |
| `CLAUDE_MODEL` | `claude-opus-4-20250514` | انتخاب مدل Claude در نمونهٔ تنظیم |
| `CODEX_MODEL` | `gpt-5.2-codex` | انتخاب مدل Codex در نمونهٔ تنظیم |
| `OPENCODE_MODEL` | `provider/model` | مدل OpenCode با شناسهٔ ارائه‌دهنده و مدل |
| `GROK_COMMAND` / `GROK_BIN` | `grok` | فرمان Grok؛ اولی بر دومی مقدم است |
| `GROK_MODEL` | `grok-4.5` | مدل پیش‌فرض Grok در SDK |
| `HERMES_INFERENCE_MODEL` | `configured-default` | جایگزین مدل Hermes در نبود `HERMES_MODEL` |
| `OPENCLAW_MODEL` | `gateway-default` | برچسب مدل OpenClaw؛ پیش‌فرض از Gateway |
| `OPENCLAW_TOKEN` / `OPENCLAW_PASSWORD` | `replace-me` | نام‌های سازگار قدیمی برای اعتبارنامهٔ Gateway |
| `HERMES_MODEL` | `configured-default` | برچسب یا تنظیم مدل Hermes؛ تنظیم فعال ACP تعیین‌کننده است |
| `HERMES_ACCEPT_HOOKS` | `true` | گزینهٔ راه‌اندازی Hermes در لایهٔ ارائه‌دهنده |
| `OPENCLAW_COMMAND` | `openclaw` | فرمان ارائه‌دهندهٔ OpenClaw |
| `OPENCLAW_GATEWAY_URL` | `ws://localhost:18789` | نمونهٔ نشانی Gateway در محیط CLI؛ ارائه‌دهندهٔ ACP آن را به محیط فرزند منتقل می‌کند |
| `OPENCLAW_GATEWAY_TOKEN` | `replace-me` | اعتبارنامهٔ Gateway |
| `OPENCLAW_GATEWAY_PASSWORD` | `replace-me` | اعتبارنامهٔ جایگزین Gateway |
| `COPILOT_DENIED_TOOLS` | `example-tool` | نام ابزارهای ممنوع، در صورت پشتیبانی SDK |

## یکپارچه‌سازی و آزمون

افزونهٔ Hermes متغیرهای `AGENT_BOARD_URL`، `AGENT_BOARD_TOKEN_FILE` و `AGENT_BOARD_TOKEN` را می‌خواند؛ نمونه‌ها به‌ترتیب `http://localhost:8080`، `~/.config/llm/service.token` و `replace-me` هستند. فایل توکن با دسترسی 0600 ترجیح دارد. `HERMES_HOME` مسیر پروفایل میزبان افزونه است، نه تنظیم API تابلو. `HERMES_PROFILE=default` نام پروفایل ثبت‌شده در فرادادهٔ درخواست افزونه را مشخص می‌کند. SDK متغیرهای خانوادهٔ `GROK_` و `XAI_` را به ابزار Grok منتقل می‌کند؛ کلیدهای احراز هویت خود CLI را طبق تنظیم همان ابزار نگه دارید.

`E2E_SERVER_PORT=3002` و `E2E_CLIENT_PORT=4176` درگاه‌های پیش‌فرض آزمون‌اند. `E2E_TEST_REPO_ROOT=./test-results/repos` محل مخزن آزمایشی را تغییر می‌دهد. `CI=true` منع آزمون‌های اختصاصی و تکرار تلاش مرورگر را فعال می‌کند. `TEMP`، `TMP` و `TMPDIR` مسیرهای موقت سیستم‌اند و اسکریپت آزمون آن‌ها را به فهرست مسیرهای مجاز اضافه می‌کند. `PATH` و `PATHEXT` برای تشخیص فرمان‌ها در سیستم استفاده می‌شوند؛ معمولاً نیازی به تغییر آن‌ها نیست. `AI_AGENT_BOARD_INITIAL_DIR` متغیر داخلی راه‌انداز ترمینال است و از مسیر اولیهٔ پروژه ساخته می‌شود.

## نمونهٔ کمینه و گام بعد

برای اجرای محلی، SQLite به تنظیم اتصال نیاز ندارد. اگر فقط مسیر متن عمومی را می‌آزمایید، فایل کلید امن را آماده و در محیط Bash اجرا کنید:

</div>

```bash
export LLM_KEY_DIR="$HOME/.config/llm"
npm run dev
```

<div dir="rtl">

سپس کارت عمومی بدون مسیر مخزن بسازید. مقدار `LLM_KEY_DIR` در این نمونه پیش از رسیدن به سرور توسط شل گسترش می‌یابد. برای Compose و مسیر داخل کانتینر از [نصب](install.md) استفاده کنید.

گام بعد: [عامل‌ها](agents.md) · [مسیریابی](routing.md) · [پرسش‌های رایج](faq.md).

</div>
