# ReGear

A marketplace for pre-owned electronics (phones, laptops, tablets, cameras, PC components, audio, gaming, smartwatches) built around **structured condition reports** instead of free-text seller descriptions.

## Features

- **Structured listings.** Each category defines typed spec fields and a condition checklist (`src/lib/catalog.ts`). Every listing records a grade, a per-check result (pass / minor / fail / n/a, with notes), battery health, cosmetic score, a derived functional score, accessories, known issues, serial/IMEI check, warranty terms and a return window. The validation rejects inconsistent reports; for example, a failed check cannot be graded "Like New".
- **Search & browse.** Filter by category, condition, price, brand, verified sellers and warranty, with four sort orders. The filters are plain GET forms, so they work without JavaScript and give crawlable URLs.
- **Comparison.** Compare up to 4 listings side by side across specs, grading, battery, warranty, returns and seller. The best value in each row is highlighted.
- **Seller verification.** Sellers upload an ID document, which goes to private storage and is reviewed by an admin. Only the last 4 characters of the document number are kept. Verified sellers get a badge and can be filtered for; unverified sellers are capped at 5 active listings.
- **Orders & escrow.** Checkout reserves the item atomically, so it can't be double-sold. Payment is held in escrow until the buyer accepts the item. The order then moves through shipping with a carrier and tracking number, delivery, and completion. A full event timeline is kept. Unpaid orders expire after 30 minutes; orders auto-complete after the return window closes.
- **Returns.** Buyers can request a return within the window. The seller approves or rejects it, the buyer ships it back with tracking, and the seller confirms receipt, which triggers the refund.
- **Disputes.** The buyer or seller opens a case, which freezes the payout. Buyer, seller and admin share a message thread, and the admin resolves it with a full refund, a partial refund, or a release to the seller.
- **Reviews.** Only buyers with a completed order can review, which keeps ratings tied to real transactions.
- **Admin console.** Verification queue, disputes, listing moderation, marketplace stats and an audit log.
- **Indonesian and English.** Indonesian is the default; visitors can switch to English, and the choice is remembered. Prices are in rupiah (IDR) in both languages.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Cache Components / PPR, Turbopack) |
| Language | TypeScript (strict) |
| DB / ORM | Prisma 7 + PostgreSQL (`pg` driver adapter) |
| Validation | Zod 4 on every input boundary |
| Styling | Tailwind CSS 4 |
| Images | sharp (validate, re-encode to WebP, strip metadata) + `next/image` (AVIF/WebP) |
| Tests | Vitest: unit tests plus integration tests against a real migrated PostgreSQL DB |

## Getting started

Requires Node.js 22 or newer and PostgreSQL (tested with 17).

```bash
npm install                  # also runs `prisma generate`
cp .env.example .env         # then set DATABASE_URL, TEST_DATABASE_URL and CRON_SECRET
                             # (`npm run db:migrate` and `npm test` create the databases if missing)
npm run setup                # migrate + generate + seed demo data
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run db:deploy            # apply migrations only; never `setup` or `db:seed` here
npm run build && npm start
```

The seed wipes the database and creates a demo admin with the public password below, so it
refuses to run when `NODE_ENV=production` or when the database holds accounts it didn't
create. `ALLOW_SEED=true` overrides that, for a deliberate wipe.

Run production behind a reverse proxy with `TRUST_PROXY=true` (and `TRUST_PROXY_HOPS` set to
the number of proxies); otherwise every visitor shares one sign-in/sign-up rate limit, and the
whole site shares one search limit.

Storefront searches are limited to 120 per minute per visitor IP (`SEARCHES_PER_MINUTE` in
`src/proxy.ts`), answered with a 429 page beyond that. Each address that goes over is logged
once a minute as `[search-limit] <ip> … (signed in|anonymous)`; signed-in entries mean real
customers are reaching it and the limit should go up. The count is kept in memory per server process, so it only applies to
production builds (`next start`), and with several instances each counts its own traffic. A CDN
or proxy rate limit (Cloudflare, nginx `limit_req`) is the stronger place for this once deployed.

The migrations enable the `pg_trgm` extension, whose trigram indexes keep "contains" searches
(storefront and admin) fast as tables grow. It ships with PostgreSQL and the database owner can
enable it on managed hosts (Neon, Supabase, RDS, Cloud SQL); the migration fails if it isn't
installed.

### Demo accounts

These demo accounts use the password `Gear-Demo-2026!`.

| Role | Email |
|---|---|
| Buyer | `buyer@regear.test` |
| Buyer with an open dispute | `dana@regear.test` |
| Verified seller | `techhaven@regear.test`, `camerabay@regear.test` |
| Seller pending verification | `pcparts@regear.test` |

The admin account, `admin@regear.test`, gets its own password: `SEED_ADMIN_PASSWORD` if set, otherwise a random one the seed prints once. A deployed demo shares its database with the seed, so the admin password must not be one published here.

Without Midtrans keys, payments run in **simulated mode**: "Pay" succeeds at once and no money moves.

### Payments (Midtrans)

Set `MIDTRANS_SERVER_KEY` (and `MIDTRANS_ENV`, `sandbox` by default) to take payments through
[Midtrans Snap](https://docs.midtrans.com). The buyer pays on Midtrans's page (GoPay, ShopeePay
or QRIS: methods Midtrans can refund through its API, which escrow needs) and is sent back to
`/api/payments/return`. An order becomes paid only when Midtrans's status API says so.

1. Sandbox dashboard (https://dashboard.sandbox.midtrans.com) → **Settings → Access Keys**: copy the
   server key (`SB-Mid-server-...`) into `MIDTRANS_SERVER_KEY`.
2. **Settings → Payment → Notification URL**: `https://<your site>/api/payments/midtrans`. Midtrans
   can't reach `localhost`; locally the return page and the maintenance job pick up payments instead.
3. Pay test orders with the [Midtrans simulator](https://simulator.sandbox.midtrans.com).

The order page labels sandbox payments as tests. Production refuses to start payments without
a key rather than falling back to simulated mode.

### Seller payouts

A completed order credits the seller's balance (total minus the platform fee and any refund).
Sellers add a bank account and withdraw from **Seller dashboard → Payouts**; the amount leaves
their balance at once.

- Withdrawals are paid by hand. Each one waits in **Admin → Payouts**: transfer the amount from
  the company bank account (check the holder name your bank shows), then **Mark paid** with the
  transfer reference, or **Mark failed** to return the money to the seller's balance. The seller
  is emailed either way.
- A withdrawal first needs approval when it's the seller's first, over Rp 10.000.000, within 48
  hours of a bank account change, to an account whose holder doesn't match the verified name, or
  while the seller has an open dispute.
- Development simulates the transfer, so approving pays at once; `PAYOUTS_MODE=manual` gives the
  production flow locally. Midtrans settles buyer payments into your bank account: keep that
  account above **Owed to sellers** on the admin page.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest (unit + integration; resets the `TEST_DATABASE_URL` database) |
| `npm run typecheck` / `lint` | Type and lint checks |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Database |

### File storage (optional Supabase)

Uploaded images live under `STORAGE_DIR` unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; then they go to Supabase Storage. Use Supabase on hosts without a lasting disk, such as Vercel. Two private buckets, `listing-photos` and `id-documents`, are created on first upload. Visitors still get listing photos from `/media/...`, and only admins can open ID documents, so neither bucket is public.

The browser scales photos over 2 MB down to 2000px before uploading, which keeps each request under host limits (Vercel's is 4.5 MB). The server still re-encodes every image.

### Google sign-in (optional)

Sign-in with Google uses OAuth 2.0 Authorization Code + PKCE with OpenID Connect (`src/lib/auth/google.ts`, `src/app/api/auth/google/`). The button appears automatically once both variables are set.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project.
2. **Google Auth Platform → Branding**: set the app name (ReGear), support email and, for production, your domain. Audience: *External*. While in *Testing*, add your Google account under **Audience → Test users**.
3. **Data Access**: add the scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (all non-sensitive, no Google review needed).
4. **Clients → Create client** → *Web application*:
   - Authorized JavaScript origins: `http://localhost:3000` (plus your production origin)
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback` (plus `https://your-domain/api/auth/google/callback`)
5. Copy the **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart the server.

How accounts are matched: an already-linked Google account signs straight in; otherwise an existing ReGear account with the same email is linked, but only if Google reports the email as verified; otherwise a new account is created without a password (the user can add one later in Settings).

Note: `NEXT_PUBLIC_SITE_URL` is inlined at build time and defines the redirect URI, so rebuild after changing it.

### Email

ReGear sends account and order emails: email confirmation, password reset, order, return and dispute updates, and seller verification results. Each email is worded in the recipient's language (the one they last signed in with).

- **Delivery.** Set `SMTP_URL` (for example `smtps://user:pass@smtp.example.com:465`) and `EMAIL_FROM`; any SMTP provider works (Brevo, Mailgun, Amazon SES, Resend, ...). Use a domain with SPF, DKIM and DMARC set up so mail isn't marked as spam.
- **Development.** Without `SMTP_URL`, emails are written to `STORAGE_DIR/dev-mail` and listed at http://localhost:3000/api/dev/mail, so you can click confirmation and reset links. That page doesn't exist in production. In production without `SMTP_URL`, emails stay queued and an error is logged.
- **How it works.** Emails are written to the `EmailOutbox` table in the same transaction as the change that causes them (`src/lib/email/`), so a rolled-back change sends nothing. They're delivered right after the response, and the maintenance job retries failures (up to 5 attempts, with backoff). Order notifications only go to confirmed addresses. Who gets which order email is defined in `src/lib/email/notify.ts`.
- **Email confirmation.** New accounts get a confirmation link (valid 24 hours). Buying and publishing listings need a confirmed address; drafts and browsing don't. Google sign-ins count as confirmed. A banner offers to resend the link.
- **Password reset.** "Lupa kata sandi?" on the sign-in page emails a link that works once, for 1 hour. The answer is the same whether or not the email has an account. Setting the new password ends every session and clears a sign-in lockout.

### Scheduled maintenance

Call this endpoint every ~5 minutes from cron or your platform scheduler:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/maintenance
```

It expires unpaid orders, auto-delivers long-shipped orders, auto-completes orders after the return window, and purges expired sessions, rate-limit rows, orphaned uploads and security logs older than 2 years. It also sends queued emails, retries failed ones, and deletes the sent-email record after 30 days and used or expired email links.

## Deploying to Vercel + Supabase

Both free plans are enough for a demo. `vercel.json` runs the app in Singapore (`sin1`); create the Supabase project in Singapore (`ap-southeast-1`) too, so they sit next to each other.

**1. Database.** Point `DATABASE_URL` at Supabase's **Session pooler** URL (port 5432) on your machine, then run `npm run db:deploy` (and `npm run db:seed` once, for demo data; it wipes the database first). Run migrations this way before each deploy that adds one; Vercel's build doesn't run them.

**2. Vercel project.** Import the Git repository and add these environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler** URL (port 6543): many short-lived app instances share its connections |
| `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app` (read at build time: redeploy after changing it) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | as in `.env`; uploads go to Supabase Storage |
| `CRON_SECRET` | a new random string of 32+ characters |
| `TRUST_PROXY` | `true` (Vercel sets `X-Forwarded-For` to the visitor's address) |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_ENV` | your Midtrans key, and `sandbox` or `production` to match it |
| `SMTP_URL`, `EMAIL_FROM` | an SMTP service (Brevo's free plan works with a verified sender address). Without it, nobody can confirm their email, and buying and publishing need a confirmed email. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional; add `https://<project>.vercel.app/api/auth/google/callback` as a redirect URI |

**3. Midtrans.** In the Midtrans dashboard, set the payment notification URL to `https://<project>.vercel.app/api/payments/midtrans`.

**4. Maintenance every 5 minutes.** Vercel's free plan runs cron jobs only once a day, so let Supabase call the endpoint. In Supabase's SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<your CRON_SECRET>', 'regear_cron_secret');
select cron.schedule('regear-maintenance', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<project>.vercel.app/api/cron/maintenance',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'regear_cron_secret')),
    timeout_milliseconds := 60000
  );
$$);
```

Check it with `select status_code, created from net._http_response order by created desc limit 5;` (200 means it ran; 401 means the secret doesn't match).

**Limits of this setup.** The storefront search limit (120 a minute) is counted per app instance, and Vercel runs several, so it is looser than the number says; the limits stored in the database (sign-in, checkout, uploads, payments) are unaffected.

## Architecture

```
src/
  actions/          Server Actions (auth, listings, seller, orders, admin): thin, validated entry points
  app/              Routes: pages under [lang]/ (catalogue, account, sell, admin, disputes); API and media at the root
  components/       UI (server components by default; small client islands)
  i18n/             languages: dictionaries, locale helpers, server/client access, translated server messages
  lib/
    auth/           password hashing, sessions, Data Access Layer (getCurrentUser/requireX)
    data/           read models: catalog.ts (cached, public) and orders.ts (per-user, uncached)
    orders/         state.ts (pure state machine) + service.ts (transactional domain logic)
    security/       rate limiting, origin checks, safe redirects
    catalog.ts      category specs & condition checklists
    validation.ts   all Zod schemas
    storage.ts      image processing & storage (local disk, or Supabase Storage)
    payments.ts     payment provider interface (Midtrans, or simulated without keys)
prisma/             schema, migrations, seed
tests/              unit + integration tests
```

- **Order lifecycle.** All state changes go through `assertTransition()` (`src/lib/orders/state.ts`) plus optimistic concurrency on the status column, so illegal or racing transitions fail loudly.
- **Money** is stored as whole rupiah (IDR has no minor unit in practice). Prices run from Rp 10.000 to Rp 200.000.000. The platform fee is 5%, charged to the seller.

## Languages

The app is fully available in Indonesian (default) and English.

- **URLs.** Indonesian pages live at clean URLs (`/listings`), English pages under `/en` (`/en/listings`). The proxy (`src/proxy.ts`) rewrites clean URLs to the `[lang]` route segment, redirects `/id/...` to the clean URL, and remembers the visitor's choice in the `regear_lang` cookie. A first visit is always Indonesian. Each page declares both versions with `hreflang`, and the sitemap lists both.
- **Text.** All UI text lives in `src/i18n/dictionaries/`. `en.ts` defines the shape and `id.ts` must match it, so a missing Indonesian entry fails `npm run typecheck`. Entries that take values are functions. Server Components read them with `getDictionary()`; Client Components use `useT()` with the smaller `client.*.ts` dictionaries. Use `Link` from `@/i18n/client` and `localePath()` so links and redirects keep the language.
- **Catalogue labels** (categories, spec fields, checks, grades, statuses) are `{ en, id }` pairs next to their definitions in `src/lib/catalog.ts` and `src/lib/constants.ts`, read with `pick()`. Stored values such as slugs and status codes never change between languages.
- **Server messages.** Validation messages are stored as keys (`vmsg()`), business-rule errors carry a code (`DomainError`), and order events store their details as JSON. All three are worded in the visitor's language when shown (`src/i18n/messages.ts`). Seller-written text (titles, descriptions, notes) is shown as written.
- **Adding a language** means adding it to `LOCALES` in `src/i18n/locales.ts`, writing its dictionaries, and adding its text to the `{ en, id }` labels.

## Privacy and legal pages

- **Pages.** The Privacy Policy (`/privacy`) and Terms & Conditions (`/terms`, with a prohibited-items section) are linked from the footer, in both languages. The text lives in `src/lib/legal-documents.ts` and describes what the code actually does: its two cookies, session length, what Google sign-in shares, who sees which data and how long each kind is kept. When that behaviour changes (a new cookie, provider or retention period), update the text and `LEGAL_VERSION` in `src/lib/legal.ts`.
- **Before launch**, fill in the operator's legal name, address, privacy contact email and court in `LEGAL_DETAILS` (`src/lib/legal.ts`). Until then the pages show a draft notice. Have an Indonesian lawyer review both documents.
- **Consent.** Registration requires ticking the Terms and Privacy Policy, and the account stores the version accepted and when (`termsVersion`, `termsAcceptedAt`). Google sign-up records the same, with the terms stated under the button. Seller verification asks for explicit consent before an ID document is sent. Checkout says the address goes to the seller after payment, and publishing a listing states what the seller confirms.
- **Retention.** The maintenance endpoint also deletes security logs older than `AUDIT_RETENTION_DAYS` (2 years), as the Privacy Policy states.

## Security

- **Authentication.** Passwords are hashed with scrypt (memory-hard; parameters are encoded in the hash and upgraded transparently). Sessions are opaque 256-bit tokens; the DB stores only their SHA-256, so they can be revoked. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` with the `__Host-` prefix over HTTPS. A password change revokes every session.
- **Brute force protection.** Login is rate-limited per IP and per email. Accounts lock for 15 minutes after 5 failures. Unknown emails take the same time as wrong passwords, so emails can't be enumerated. Registration, checkout, uploads, verification and dispute messages are also rate-limited, with the limits stored in the DB.
- **Authorization.** Every page, action and route handler re-checks the session through the Data Access Layer (`src/lib/auth/dal.ts`). The proxy only does optimistic redirects. Each query is scoped to the caller, and other users' resources return "not found" (IDOR protection). Admin actions re-check the role server-side.
- **CSRF.** Server Actions get Next.js' built-in Origin/Host check. Route handlers verify `Origin` explicitly, and SameSite cookies add another layer.
- **Input handling.** Zod validates everything, with lengths bounded and control characters rejected. React escaping prevents XSS. The only raw HTML is JSON-LD, which is serialised with `<` and the U+2028/U+2029 characters escaped. Redirect targets are restricted to same-site paths.
- **Uploads.** Size is capped, and files are decoded by sharp with a pixel limit. Anything that isn't a real raster image is rejected. Images are re-encoded to WebP, which removes EXIF/GPS data and neutralises polyglot files. Storage keys are random, and the key format is validated to block path traversal. Media is served with `nosniff` and a sandboxed CSP. Identity documents live outside the public store; only admins can fetch them, and every view is audited.
- **Row-level security.** RLS is on for every table, with no policies, so Supabase's Data API (reachable with the project's publishable key) returns no rows. The app connects as the tables' owner, so RLS doesn't restrict it. A migration that adds a table must also run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- **Headers.** CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`), HSTS (over HTTPS), `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy, Permissions-Policy, COOP and CORP. `poweredByHeader` is disabled. Private areas send `Cache-Control: private, no-store`.
- **CSP trade-off.** Partial Prerendering serves static shells that can't carry per-request nonces, so `script-src` includes `'unsafe-inline'` for Next's inline bootstrap scripts. The other XSS defences above still apply. If your threat model requires a nonce-based CSP, disable `cacheComponents`, generate a nonce in `src/proxy.ts`, and accept fully dynamic rendering. See the Next.js CSP guide in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
- **Audit log.** Logins, lockouts, password changes, verification decisions, document views, dispute openings and resolutions, and listing moderation are all recorded.

## Performance & SEO

- **Cache Components / PPR.** Static shells are served instantly. Per-user UI (header menu, buy box) streams in behind Suspense.
- **Data caching.** Public catalogue reads use `'use cache'` with `cacheLife` and `cacheTag`. Mutations call `updateTag` for precise read-your-own-writes invalidation; background jobs use `revalidateTag`. Private data is never put in the shared cache.
- **Database.** Composite indexes back the browse, sort and dashboard queries. Every query selects only the fields it needs and uses a denormalised lower-case `searchText` column.
- **Images.** `next/image` serves AVIF/WebP at responsive sizes. Media gets `Cache-Control: immutable`, one year.
- **SEO.** Per-page metadata, canonical URLs and Open Graph tags. Product and BreadcrumbList JSON-LD includes `UsedCondition`, offer availability and return policy. There's also a dynamic `sitemap.xml`, `robots.txt` (private areas disallowed), `noindex` on private and sold pages, and semantic, accessible markup with a skip link, labels and ARIA states.

## Going further in production

- **Automatic payouts.** Implement `PayoutProvider` (`src/lib/payouts/provider.ts`) with a disbursement API (Midtrans Iris, Xendit, Flip) to send withdrawals without an admin.
- **Multi-instance.** Set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, use a shared cache handler (`'use cache: remote'`), and move rate limiting to Redis if load warrants it.
- **Not yet built:** email notifications (order and dispute events), carrier tracking webhooks, and 2FA for admin accounts.
