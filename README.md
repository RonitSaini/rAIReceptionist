# CallCover

AI phone receptionist for restaurants. The AI answers the restaurant's line, takes reservations and takeout orders, answers common questions, and surfaces everything in this web app.

**Stack:** Next.js (App Router) · TypeScript · Tailwind · Prisma · PostgreSQL · NextAuth · Retell AI · Twilio · Stripe · Google Calendar · Vercel

## Status: Phase 1

Phase 1 is complete and needs **no API keys** — only a Postgres database.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Scaffold, schema, auth, onboarding 1–6, settings, reservation book, reservations/takeout CRUD, notifications, dashboard | ✅ Done |
| 2 | Twilio number provisioning, Retell agent + prompt generation, call webhooks, calls page | ✅ Done |
| 3 | Call outcomes → notifications, manager escalation (outbound call + acknowledge), guest SMS with reply-to-cancel | ⏳ |
| 4 | Stripe setup fee + subscription, billing webhooks, subscription gating | ⏳ |
| 5 | Google Calendar OAuth + sync | ⏳ |

Onboarding step 8 (payment) is a placeholder screen until Phase 4. Step 7 (phone number) is live once the Phase 2 keys are set — see [Phase 2 setup](#phase-2-setup-phone-number--ai-host).

## Local setup (Windows / PowerShell)

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (`node -v`)
- [Git](https://git-scm.com/)

### 2. Get a free Postgres database from Neon

1. Go to <https://neon.tech> and sign up (free tier is plenty).
2. Click **New Project**. Name it `callcover`, pick the region closest to you (e.g. *US East (Ohio)*), and create it.
3. On the project dashboard click **Connect**. Two connection strings are offered:
   - **Pooled** connection (host contains `-pooler`) — use this for `DATABASE_URL`.
   - **Direct** connection — use this for `DIRECT_URL` (migrations). If you only see one string, use it for both.
4. Copy the string(s). They look like `postgresql://neondb_owner:xxxx@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.

### 3. Configure environment

```powershell
Copy-Item .env.example .env
```

**Shortcut with the Neon CLI** (installed globally with `npm i -g neon`): `neon auth` once, then `neon link` picks the org/project and writes the pooled `DATABASE_URL` and `DATABASE_URL_UNPOOLED` into `.env` (copy the unpooled value into `DIRECT_URL`). `neon env pull` refreshes them later, and `neon checkout <branch>` switches to a database branch for isolated testing. The link is stored in the git-ignored `.neon` file.

Open `.env` and set:

- `DATABASE_URL` and `DIRECT_URL` — from Neon
- `NEXTAUTH_SECRET` — any long random string. Generate one:

  ```powershell
  [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
  ```

- `NEXTAUTH_URL` — leave as `http://localhost:3000`

Everything else in `.env.example` is for later phases; leave it blank for now. Google sign-in is optional — the button only appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

### 4. Install and create the database tables

```powershell
npm install
npm run db:push
```

`db:push` creates all tables in your Neon database from `prisma/schema.prisma`.

### 5. (Optional) Load demo data

```powershell
npm run db:seed
```

Creates a demo restaurant with reservations, takeout orders, calls with transcripts, and notifications.
Log in with **demo@callcover.app** / **password123**.

### 6. Run

```powershell
npm run dev
```

Open <http://localhost:3000>. Sign up (or use the demo login) and walk through onboarding.

To test on your phone, run `ipconfig` to find your PC's IPv4 address, then open `http://<that-ip>:3000` on the same Wi‑Fi. (If you do, set `NEXTAUTH_URL` to that URL while testing.)

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:push` | Sync schema to the database (dev) |
| `npm run db:migrate` | Create a migration (use once you want migration history) |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:seed` | Load demo data |

## Phase 2 setup: phone number + AI host

Phase 2 needs three things in `.env`: `RETELL_API_KEY`, `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`, and a **public https** `NEXT_PUBLIC_APP_URL` (Twilio and Retell call webhooks on it).

### 1. Retell AI

1. Sign up at <https://www.retellai.com>, open the dashboard → **API Keys** → create a key → `RETELL_API_KEY`.
2. Nothing else to configure there: CallCover creates and updates the agent and its prompt for each restaurant through the API, sets the webhook URL on the agent, and verifies webhooks with the same API key.

### 2. Twilio

1. Sign up at <https://www.twilio.com>. Trial accounts work for testing (calls get a trial announcement and can only dial verified numbers).
2. Console → **Account Info** → copy `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. Make sure the account can buy US local numbers (add a payment method if you're past the trial).

### 3. A public URL

- **On Vercel:** set `NEXT_PUBLIC_APP_URL` to your deployment URL (e.g. `https://callcover.vercel.app`).
- **Local testing:** run a tunnel so Twilio/Retell can reach your machine. With [ngrok](https://ngrok.com/download):

  ```powershell
  ngrok http 3000
  ```

  Put the `https://xxxx.ngrok-free.app` URL into `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL`, then restart `npm run dev`. If your tunnel rewrites URLs and Twilio signature checks fail, set `SKIP_WEBHOOK_SIGNATURE_VALIDATION="true"` **only for local dev**.

### 4. Apply the schema changes and provision

```powershell
npm run db:push
npm run dev
```

Then in the app: **Settings → Phone** (or onboarding step 7) → **Get my number**. This creates the Retell LLM + agent from the restaurant's settings, buys a Twilio number in the requested area code, and points its voice/SMS/status webhooks at the app. **Call me to test** rings the owner's cell from the new number. After that, forward the restaurant's real line to the CallCover number (`*72` on most carriers).

If you later change the app URL (e.g. move from ngrok to Vercel), click **Re-link number to this app URL** and **Rebuild AI host** in Settings → Phone.

### How a call flows

1. Twilio receives the call → `POST /api/twilio/voice` (signature-verified).
2. We register the call with Retell (`/v2/register-phone-call`) with the restaurant's agent, today's date/time in the restaurant's time zone and the caller's number, create a `Call` row, and answer with TwiML `<Dial><Sip>` into Retell. Each concurrent call gets its own Retell call, so simultaneous calls just work.
3. During the call the agent invokes custom functions at `POST /api/retell/functions/<name>` (`get_available_times`, `book_reservation`, `join_waitlist`, `take_takeout_order`, `check_delivery_area`, `take_message`), protected by a shared-secret header. These read/write the reservation book, orders and messages directly.
4. After the call Retell posts `call_ended` and `call_analyzed` to `POST /api/retell/webhook` (HMAC-verified): recording URL, transcript, summary, sentiment and classification land on the `Call` row and show on the Calls page.
5. `POST /api/twilio/status` records calls that never connected as missed.

The agent prompt is generated in `src/lib/agent-config.ts` from hours, menu, prices, policies, reservation rules, delivery rules and escalation rules, and re-synced automatically whenever settings are saved. Delivery-area checks geocode addresses with the free US Census geocoder (no key) and compare straight-line miles to the delivery radius.

## Project layout

```
prisma/schema.prisma        Data models (all times stored in UTC)
prisma/seed.js              Demo data
src/proxy.ts                Route protection (Next.js proxy / middleware)
src/app/(auth)/             /login, /signup
src/app/onboarding/[step]   Onboarding steps 1–8 (one screen per step)
src/app/(app)/              Dashboard shell: /dashboard, /notifications, /calls, /reservations, /takeout, /settings
src/app/api/                NextAuth, notification unread-count poll, availability lookup
src/actions/                Server actions (auth, onboarding, reservations, takeout, notifications)
src/lib/                    prisma, auth, availability engine, time-zone helpers, notifications, constants
src/components/             UI primitives, forms, nav, notification bell
```

## How things work

- **Accounts.** A `User` belongs to one `Account` (the restaurant). Notification read state is per account, not per user.
- **Time zones.** Every timestamp is stored in UTC and rendered in `Account.timeZone` (collected in onboarding step 2). Helpers live in `src/lib/time.ts` and use the built-in `Intl` API — no date library.
- **Availability.** `src/lib/availability.ts` turns business hours + reservation interval + table turn + capacity limits into bookable slots. The manual reservation form uses it now; the Retell `get_available_times` function will use it in Phase 2. If no hours are configured, it assumes 11 AM – 9 PM daily so the AI works after steps 1, 2 and 7 alone.
- **Notifications.** `createNotification()` in `src/lib/notifications.ts` is the single entry point. The bell polls `/api/notifications/unread-count` every 30 s and on navigation (no realtime/push). The dashboard's "since you last signed in" panel uses the account's previous `lastSeenAt`, captured in the session at sign-in.
- **Passwords** are hashed with Node's built-in `scrypt` (no bcrypt dependency).
- **Google sign-in** creates/links the `User` by email in the NextAuth `signIn` callback (no adapter tables — the restaurant model is already named `Account`).

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add the environment variables from `.env` (skip `NEXTAUTH_URL` — Vercel sets it).
3. Build command is `npm run build` (already runs `prisma generate`).
4. After the first deploy, run `npx prisma db push` locally against the production `DATABASE_URL`, or switch to `prisma migrate deploy` once you have migrations.
