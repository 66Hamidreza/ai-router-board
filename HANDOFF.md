# ai-router-board — HANDOFF (read first)

> Written 2026-11-08. **This repo is PUBLIC** — never add private project names, server names or secrets here.

## What it is
Public MIT fork of DanWahlin/ai-agent-board with a tier router and confidentiality gate: a local Kanban board that routes explicitly-public text tasks to a free-provider pool (Groq → Gemini → OpenRouter), coding tasks to agents (Codex for mechanical/frontend, Claude for backend/security/architecture), and keeps confidential tasks away from free models. Bilingual README (EN/FA, `README.fa.md`). Release v0.1.0 + GHCR image, CI green, branch protection on `main`. A private working twin exists (see the owner's workspace index).

## State
Done (see local `STATUS.md`, git-excluded): clean public copy, bilingual docs, Dockerfile smoke-tested, CI + e2e, release, branch protection. Remaining: enable private vulnerability reporting in repo settings. Nothing else scheduled.

## Work rules
Change the public repo only through PRs/commits that pass CI (`npm test`, e2e). Keep it free of private data; develop private features in the private twin, then port cleaned versions here. Node ≥ 22. Dockerfile at root; `.env.example` files under packages are templates only.

## Not in git
Local `STATUS.md` (excluded on purpose), `.collab/`, `.remember/`. Nothing secret is needed to build.

## فارسی
نسخهٔ عمومی (MIT) برد مسیریاب. هیچ نام یا رمز خصوصی در آن ننویسید. فقط فعال‌کردن گزارش خصوصی آسیب‌پذیری در تنظیمات GitHub باقی مانده.
