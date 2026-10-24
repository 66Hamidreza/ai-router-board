<div dir="rtl">

# نصب و اجرا

این راهنما دو روش اجرای محلی از کد و اجرای تصویر Docker را توضیح می‌دهد. SQLite پیش‌فرض است؛ PostgreSQL اختیاری است. پروژه بر پایهٔ DanWahlin/ai-agent-board با مجوز MIT ساخته شده است.

[بازگشت](../../README.fa.md) · [راهنمای Docker انگلیسی](../DOCKER.md)

## اجرا از کد

Node.js نسخهٔ 22 یا بالاتر، npm نسخهٔ 10 یا بالاتر و Git لازم است. مثال‌های فرمان برای Bash هستند. ابزار عامل را جدا نصب و احراز هویت کنید؛ برای متن عمومی می‌توانید فقط کلید یک ارائه‌دهندهٔ رایگان را آماده کنید.

پس از دریافت مخزن طبق [راهنمای اصلی](../../README.md#quick-start):

</div>

```bash
cd ai-router-board
npm ci
cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
npm run dev
```

<div dir="rtl">

تابلو در [localhost:8081](http://localhost:8081) باز می‌شود. دستور توسعه بستهٔ مشترک را می‌سازد و سرور و رابط را اجرا می‌کند. SQLite در مسیر پیش‌فرض `data/agentboard.db` نسبت به پوشهٔ کاری سرور ذخیره می‌شود.

برای اجرای جداگانه، ابتدا `npm run build:shared` و سپس در دو ترمینال `npm run dev:server` و `npm run dev:client` را اجرا کنید. خروجی نهایی با فرمان‌های زیر ساخته می‌شود:

</div>

```bash
npm run build:shared
npm run build:server
npm run build:client
npm start -w @ai-agent-board/server
```

<div dir="rtl">

این دستور آخر فقط API را اجرا می‌کند. خروجی رابط در `packages/client/dist` است؛ برای ارائهٔ آن به وب‌سرور و پراکسی API و WebSocket نیاز دارید. تصویر Docker این بخش را با nginx فراهم می‌کند.

## اجرای کامل با Docker

Docker Engine و Compose نسخهٔ 2 لازم است. از ریشهٔ مخزن اجرا کنید:

</div>

```bash
docker compose --profile app up --build -d app
curl --fail http://localhost:8080/api/health
```

<div dir="rtl">

رابط و API در [localhost:8080](http://localhost:8080) در دسترس‌اند. nginx روی درگاه 8080 فایل‌های رابط را ارائه می‌کند و درخواست API و WebSocket را به سرور داخلی می‌فرستد. برنامه با کاربر غیرریشهٔ UID 1000 اجرا می‌شود. حجم `appdata` دادهٔ SQLite، تنظیم و پروژه‌های کلون‌شده را زیر `/data` نگه می‌دارد. اتصال پوشهٔ میزبان باید برای این کاربر قابل نوشتن باشد.

برای توقف از `docker compose --profile app down` استفاده کنید. حجم‌ها باقی می‌مانند؛ گزینهٔ `-v` آن‌ها را حذف می‌کند. پیش از ارتقا نسخهٔ پشتیبان بگیرید.

### دریافت تصویر انتشار

پس از انتشار نسخه می‌توانید به‌جای ساخت محلی تصویر را دریافت کنید؛ تصویر نسخهٔ منتشرنشده ممکن است هنوز موجود نباشد:

</div>

```bash
docker pull ghcr.io/66hamidreza/ai-router-board:0.1.0
docker run -d --name ai-router-board \
  -p 127.0.0.1:8080:8080 \
  -v ai-router-board-data:/data \
  ghcr.io/66hamidreza/ai-router-board:0.1.0
```

<div dir="rtl">

انتشار پایدار برچسب `latest` هم دارد؛ برای ارتقای کنترل‌شده نسخه یا digest را ثابت کنید. گردش‌کار انتشار برای `linux/amd64` و `linux/arm64` تنظیم شده است.

### کلید و عامل در کانتینر

تصویر، ابزار CLI میزبان یا ورود حساب آن را به ارث نمی‌برد. ابزار لازم را در تصویر مشتق‌شده نصب و اعتبارنامه را هنگام اجرا فراهم کنید. فایل تنظیم، کلید و پایگاه داده نباید داخل تصویر قرار بگیرند. تنظیم سرور را با متغیر محیطی یا `--env-file` بیرون مخزن و کلید مدل رایگان را با اتصال فقط‌خواندنی بدهید:

</div>

```bash
docker run --rm -p 127.0.0.1:8080:8080 \
  -v ai-router-board-data:/data \
  --mount type=bind,src="$HOME/.config/llm",dst=/run/llm-keys,readonly \
  -e LLM_KEY_DIR=/run/llm-keys \
  ghcr.io/66hamidreza/ai-router-board:0.1.0
```

<div dir="rtl">

فایل کلید باید با دسترسی 0600 برای UID 1000 قابل خواندن باشد؛ پوشه نیز به دسترسی عبور نیاز دارد. پس از تغییر کلید، کانتینر را بازراه‌اندازی کنید. برای Compose، اتصال کلید را در فایل override محلی تعریف کنید. مسیرهای `CONFIDENTIAL_REPO_ROOTS` و مسیر مخزن باید مسیر داخل کانتینر باشند.

رابط تصویر آماده، `VITE_API_KEY` ندارد. تنظیم `API_KEY` در زمان اجرا API را محافظت می‌کند، ولی رابط به ساخت جداگانه با مقدار متناظر نیاز دارد؛ متغیر زمان اجرا خروجی ساخته‌شدهٔ مرورگر را تغییر نمی‌دهد. کلید مرورگر قابل مشاهده است. برای محیط مشترک، احراز هویت بیرونی، TLS و فهرست محدود `ALLOWED_HOSTS` و `ALLOWED_ORIGINS` را تنظیم کنید. بررسی سلامت تصویر در صورت وجود `API_KEY` آن را برای API ارسال می‌کند.

## PostgreSQL اختیاری

اجرای `docker compose up -d db` فقط پایگاه داده را روی درگاه محلی 5433 راه می‌اندازد. گذرواژهٔ پیش‌فرض `agentboard-local-only` فقط برای توسعهٔ محلی است؛ پیش از محیط مشترک آن را با `POSTGRES_PASSWORD` عوض کنید. تغییر متغیر برای حجم موجود، گذرواژهٔ نقش پایگاه داده را عوض نمی‌کند.

برای اجرای برنامه و پایگاه داده با هم، گذرواژه و نشانی متناظر را صادر کنید؛ نویسه‌های ویژهٔ گذرواژه در URL باید کدگذاری شوند:

</div>

```bash
export POSTGRES_PASSWORD='replace-with-a-local-password'
export DATABASE_URL='postgresql://agentboard:replace-with-a-local-password@db:5432/agentboard'
docker compose --profile app up --build -d db app
```

<div dir="rtl">

سرور خارج کانتینر باید از `localhost:5433` استفاده کند. اگر پایگاه هنوز آماده نباشد برنامه ممکن است تا برقراری اتصال بازراه‌اندازی شود. تغییر اتصال، داده را بین SQLite و PostgreSQL مهاجرت نمی‌دهد. دادهٔ PostgreSQL در حجم `pgdata` می‌ماند.

## بررسی نصب و گام بعد

</div>

```bash
npm run build:shared
npm test -w @ai-agent-board/server
npx playwright install --with-deps chromium
npm run gate:required
```

<div dir="rtl">

دروازهٔ الزامی، کنترل قرارداد، ساخت و آزمون مرورگر را اجرا می‌کند و به وابستگی‌های Playwright نیاز دارد. برای بررسی کانتینر، فرمان‌های ساخت و آزمون سلامت در [راهنمای Docker](../DOCKER.md#validation-and-release) آمده‌اند.

گام بعد: [پیکربندی](configuration.md)، سپس [عامل‌ها](agents.md) و [مسیریابی](routing.md). برای خطاها [پرسش‌های رایج](faq.md) و پیش از دسترسی شبکه [امنیت](security.md) را بخوانید.

</div>
