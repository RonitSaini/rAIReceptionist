# CallCover

AI phone receptionist for restaurants. The AI answers the restaurant's line, takes reservations and takeout orders, answers common questions, and surfaces everything in this web app.

**Stack:** Next.js (App Router) · TypeScript · Tailwind · Prisma · PostgreSQL · NextAuth · Retell AI · Twilio · Stripe · Google Calendar · Vercel

## Status: Phase 1

Phase 1 is complete and needs **no API keys** — only a Postgres database.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Scaffold, schema, auth, onboarding 1–6, settings, reservation book, reservations/takeout CRUD, notifications, dashboard | ✅ Done |
| 2 | Twilio number provisioning, Retell agent + prompt generation, call webhooks, calls page | ✅ Done |
| 3 | Call outcomes → notifications, manager escalation (outbound call + acknowledge), guest SMS with reply-to-cancel | ✅ Done |
| 4 | Stripe setup fee + subscription, billing webhooks, subscription gating | ✅ Done |
| 5 | Google Calendar OAuth + sync | ✅ Done |

Step 7 (phone number) is live once the Phase 2 keys are set — see [Phase 2 setup](#phase-2-setup-phone-number--ai-host). Step 8 (payment) is live once the Phase 4 keys are set — see [Phase 4 setup](#phase-4-setup-billing-stripe); without them it stays a skippable placeholder.

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

## Phase 4 setup: billing (Stripe)

One-time setup fee + monthly subscription through Stripe-hosted Checkout, self-service card/invoice/cancel through the Stripe Customer Portal, and webhooks keeping `Account.subscriptionStatus` in sync. `src/lib/stripe.ts` wraps the official `stripe` SDK, pinned to the SDK's own API version (`2026-08-26.dahlia`) so types and wire format agree — bump both together via the `upgrade-stripe` skill.

### 1. Products and prices

In the Stripe Dashboard (start in a **sandbox**): **Product catalog → Add product**.

- *FrontDesk AI subscription* — recurring, monthly → copy the price id into `STRIPE_PRICE_MONTHLY`.
- *FrontDesk AI setup* — one-time → `STRIPE_PRICE_SETUP_FEE` (optional; leave empty for no setup fee).

Both appear on the first Checkout; only the subscription renews. The plan card reads the amounts from Stripe, so there is nothing to hardcode.

### 2. API key

**Developers → API keys → Create restricted key.** Give it *write* on Customers, Checkout Sessions, Subscriptions, Invoices, Customer portal and *read* on Prices; leave the rest at *none*. Put it in `STRIPE_SECRET_KEY` (an `sk_` secret key also works, but the restricted key limits the blast radius if it leaks). On Vercel mark the variable **sensitive**.

### 3. Webhook

**Developers → Webhooks → Add destination**, URL `https://<your app>/api/stripe/webhook`, events:

```
checkout.session.completed        checkout.session.async_payment_succeeded   checkout.session.async_payment_failed
customer.subscription.created     customer.subscription.updated              customer.subscription.deleted
invoice.paid                      invoice.payment_failed                     invoice.payment_action_required
```

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Every event is verified with the SDK's `constructEvent` against the raw body and recorded by id (`StripeEvent`), so Stripe's redeliveries are acknowledged without running twice. Register the endpoint **after** the code is deployed — Stripe disables endpoints that keep failing — then send a test event from the Dashboard to see it go green.

**Local testing** — install the [Stripe CLI](https://docs.stripe.com/stripe-cli/install) and run:

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the `whsec_…` it prints as `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`, any future date, any CVC. If you skip the listener, the **Refresh status** button on the billing screen pulls the state from Stripe on demand.

### 4. Customer portal

**Settings → Billing → Customer portal**: turn on *update payment method*, *invoice history* and *cancel subscription* (at period end). The **Open billing portal** button in Settings → Billing uses this configuration.

### 5. Apply the schema and run

```powershell
npm run db:push
npm run dev
```

Then **Settings → Billing** (or onboarding step 8) → **Pay with Stripe**. The webhook flips the status to *Active* and drops a "Payment received" notification; failed renewals set *Past due* and raise an urgent notification; the app shell shows a banner until billing is fixed. `npm test` includes a webhook signature/dedupe check that runs when `STRIPE_WEBHOOK_SECRET` is set.

### Gating

Set `BILLING_REQUIRED="true"` in production to make the AI host stop answering calls for accounts without an *active* / *trialing* subscription (callers hear a short "currently unavailable" message). Leave it unset in development so demo accounts keep working.

### Tax and Managed Payments — decision pending

New Stripe accounts have **Managed Payments** on by default: Stripe (via Link) is merchant of record, collects and remits sales tax, handles disputes and refunds, and charges **3.5% on top of** processing fees. It only covers fully automated digital products with an eligible product tax code, so it is a fit for the AI subscription only if onboarding is self-serve; a human-delivered setup fee is not eligible. The alternative is to turn Managed Payments off (Dashboard → Settings → Managed Payments), keep the tax codes, and enable **Stripe Tax** plus a registration in each state where nexus requires it — without a registration Stripe silently collects nothing. See [Managed Payments eligibility](https://docs.stripe.com/payments/managed-payments/eligibility) and [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes). The app works in either mode.

## Phase 3: what happens after a call

Everything below is wired from the Retell function handlers (`src/lib/call-handlers.ts` → `src/lib/outcomes.ts`) and the call webhook. The restaurant is only ever notified **in-app**; guests are the only people who get texts.

| Event | In-app | Guest SMS | Manager |
| --- | --- | --- | --- |
| Reservation / waitlist booked | Notification (links to the booking) | "You're booked… Reply CANCEL" | — |
| Takeout / delivery order | Notification | "Order received… Reply CANCEL" | — |
| Message taken | Notification | — | — |
| Escalation (large party, private event, complaint…) | **Urgent** notification with an **Acknowledge** button | If nobody acknowledges within `ESCALATION_ACK_TIMEOUT_MINUTES` (10): "the manager will call you when we next open (tomorrow at 11:30 AM)" | Outbound call to the owner's cell during manager hours: reads the details, **press 1 to acknowledge** from the phone |
| Missed call | Notification | — | — |
| Guest texts CANCEL | Notification "Cancelled by guest" | Confirmation of the cancellation | — |

- **Acknowledge window sweep:** `GET /api/cron/escalations` (Bearer `CRON_SECRET`), run after every Retell webhook (so during service it fires within minutes) plus a daily safety-net cron in `vercel.json` (`0 13 * * *`, 9 AM ET — Vercel's Hobby plan rejects anything more frequent). For exact 10-minute timing when the line is quiet, change the schedule to `*/5 * * * *` on Vercel Pro, or hit the route from any external scheduler with the Bearer secret.
- **SMS requirements:** texts go from the restaurant's Twilio number (or `TWILIO_MESSAGING_SERVICE_SID`). Twilio trial accounts can only text verified numbers, and US application-to-person SMS from local numbers needs **A2P 10DLC** registration in the Twilio Console. Failed sends never break a call — they're logged and noted on the record.
- **Inbound texts:** `POST /api/twilio/sms` cancels the guest's next upcoming reservation or order on CANCEL; any other text is saved as a message notification with a polite auto-reply.

## Phase 5: Google Calendar sync (and Google sign-in)

Both use one Google OAuth client. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (locally and on Vercel) and the **Sign in with Google** button and **Connect Google Calendar** appear on their own.

1. Google Cloud Console → create a project → **APIs & Services → Library** → enable **Google Calendar API**.
2. **OAuth consent screen**: External, add the scopes `calendar.events`, `calendar.readonly`, `userinfo.email`; add yourself as a test user while the app is unverified.
3. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URIs:
   - `https://r-ai-receptionist.vercel.app/api/auth/callback/google` (sign-in)
   - `https://r-ai-receptionist.vercel.app/api/google-calendar/callback` (calendar)
   - the same two with `http://localhost:3000` for local dev.
4. Optionally set `TOKEN_ENCRYPTION_KEY` (any long random string); stored calendar tokens are AES-256-GCM encrypted with it.

How it works: **Settings → Reservations → Connect Google Calendar** runs the OAuth flow (signed, 10-minute state), stores the refresh token encrypted, and backfills upcoming reservations as events. From then on every reservation created/edited/cancelled — by staff or by the AI — is mirrored (`src/lib/google-calendar.ts`, best-effort, errors shown on the settings card). Availability reads the calendar too: any *other* event on the chosen calendar blocks those times for phone bookings (our own events are tagged and ignored). You can pick which calendar to use, re-sync, or disconnect (which revokes the token). The built-in book remains the source of truth.

## Google Maps: address suggestions + delivery area

With `GOOGLE_MAPS_API_KEY` set, the restaurant-address form (sign-up step 2 / Settings → Business) suggests US addresses as you type via **Places API (New)**; picking one fills street, city, state and ZIP and pins exact coordinates. Every delivery-area check on a call geocodes the caller's spoken address with the **Geocoding API** (falling back to the free US Census geocoder), measures straight-line miles from that pin and compares it to the radius — the AI only promises delivery inside it. With `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` set, the Menu & policies step draws the radius on a Google map that updates as you edit it.

Setup (same Google Cloud project as sign-in): enable *Places API (New)*, *Geocoding API*, *Maps JavaScript API*; create a server key (API-restricted to the first two) and a browser key (restricted to Maps JavaScript API + your site's URLs). Both keys are read from the environment; the server key is never sent to the browser — suggestions go through `/api/places/*`, which require a signed-in session.

## Project layout

```
prisma/schema.prisma        Data models (all times stored in UTC)
prisma/seed.js              Demo data
src/proxy.ts                Route protection (Next.js proxy / middleware)
src/app/(auth)/             /login, /signup
src/app/onboarding/[step]   Onboarding steps 1–8 (one screen per step)
src/app/(app)/              Dashboard shell: /dashboard, /notifications, /calls, /reservations, /takeout, /settings
src/app/api/                NextAuth, notification polls, availability lookup, Twilio/Retell/Stripe webhooks
src/actions/                Server actions (auth, onboarding, phone, billing, reservations, takeout, notifications)
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
