# ReGear

A marketplace for pre-owned electronics, built around **structured condition reports** instead of free-text descriptions. Indonesian by default, with English available; prices are in rupiah.

## Features

- **Structured listings**: every listing has a grade, a per-check condition report, battery health, warranty and return window.
- **Search, browse and compare**: filter by category, condition, price and brand; compare up to 4 listings side by side.
- **Escrow orders**: payment is held until the buyer accepts the item, with returns, disputes and refunds.
- **Seller verification and payouts**: verified sellers get a badge; withdrawals are reviewed and paid by an admin.
- **Admin console**: verifications, disputes, moderation, payouts and an audit log.

## Tech stack

Next.js 16 · TypeScript · Prisma 7 + PostgreSQL · Zod 4 · Tailwind CSS 4 · Vitest

## Getting started

Requires **Node.js 22+** and **PostgreSQL**.

```bash
npm install
cp .env.example .env    # set DATABASE_URL, TEST_DATABASE_URL and CRON_SECRET
npm run setup           # migrate + seed demo data
npm run dev             # http://localhost:3000
```

> [!WARNING]
> `npm run setup` and `npm run db:seed` **wipe the database**. Never run them in production; use `npm run db:deploy` there.

Demo accounts (passwords are printed by the seed, or set with `SEED_DEMO_PASSWORD` / `SEED_ADMIN_PASSWORD`):

| Role | Email |
|---|---|
| Buyer | `buyer@regear.test` |
| Seller | `techhaven@regear.test` |
| Admin | `admin@regear.test` |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Run or build the app |
| `npm test` | Unit and integration tests (resets the test database) |
| `npm run typecheck` / `lint` | Type and lint checks |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Database |

## Optional services

Everything works locally without these; each one switches on when its variables are set.

| Service | Variables | Without it |
|---|---|---|
| Payments (Midtrans) | `MIDTRANS_SERVER_KEY`, `MIDTRANS_ENV` | Payments are simulated |
| Email (any SMTP) | `SMTP_URL`, `EMAIL_FROM` | Emails are saved locally at `/api/dev/mail` |
| File storage (Supabase) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Files are stored on local disk |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google button is hidden |

## Deploying (Vercel + Supabase)

1. Point `DATABASE_URL` at Supabase and run `npm run db:deploy`.
2. Import the repo into Vercel and add the environment variables from `.env.example`.
3. Call `POST /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET` **every 5 minutes** (for example with Supabase `pg_cron`). It expires unpaid orders, completes orders and sends queued emails.

> [!IMPORTANT]
> - **Vercel doesn't run migrations.** Run `npm run db:deploy` before deploying any change that adds one.
> - **Production needs `SMTP_URL`.** Without it, sign-up codes never arrive and nobody can register with email.
> - **Production needs a Midtrans key.** It refuses payments instead of falling back to simulated mode.
> - **`NEXT_PUBLIC_SITE_URL` is read at build time**, so redeploy after changing it.
> - **Set `TRUST_PROXY=true`** behind a proxy (including Vercel), or all visitors share one rate limit.
> - **New tables need row-level security:** add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the migration.

> [!CAUTION]
> Before launch, fill in `LEGAL_DETAILS` in `src/lib/legal.ts` and have the Privacy Policy and Terms reviewed by an Indonesian lawyer.

## Project structure

```
src/
  actions/      Server Actions
  app/          Routes (pages under [lang]/, APIs under api/)
  components/   UI
  i18n/         Translations (Indonesian and English)
  lib/          Domain logic: auth, orders, payments, storage, validation
prisma/         Schema, migrations, seed
tests/          Unit and integration tests
```
