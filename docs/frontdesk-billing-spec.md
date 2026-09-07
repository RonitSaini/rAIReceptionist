# FrontDesk AI — billing enforcement spec

What happens to an account that stops paying, and when. Owner's policy, set 2026-09-06.

## 1. The states

`billingState(account)` in `src/lib/billing-state.ts` is the single answer, and it is pure:

| State    | When                                                                                   | The agent                                          | The owner sees                                  |
| -------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `exempt` | `BILLING_REQUIRED` is not `"true"`, or `Account.isInternal`, or setup is not finished (`onboardingStepId != "done"`) | normal | nothing |
| `ok`     | subscription `active` or `trialing`                                                    | normal                                             | nothing                                         |
| `grace`  | `past_due` and fewer than **10 days** since `paymentFailedAt`                          | normal                                             | red dunning banner with days left, a notification |
| `paused` | everything else: `none`, `cancelled`, or grace ran out unpaid                          | **billing-paused mode** (§2)                       | red "taking messages only" banner, a notification, and one per fielded call |

## 2. Billing-paused mode

The agent still answers, still takes the caller's name, number and what they need, and **never hangs up** — the never-hang-up rule is unconditional. It books nothing: no reservations, orders, visits, appointments, work orders or dispatches, and it does not offer times it cannot book.

Enforced in two layers that cannot drift apart, both reading `billingState`:

1. **The prompt.** `buildGeneralPrompt` appends a `BILLING PAUSED` section for a paused account. It is appended, never woven in, so a non-paused prompt is byte-identical to before — the goldens in `tests/snapshots` prove it. The agent is re-synced the moment the state crosses the paused boundary in either direction (`applySubscription`, and the sweep for a grace that ran out).
2. **The function endpoint.** `/api/retell/functions/[name]` refuses every creating or availability function for a paused account with an instruction to take a message instead. A stale agent that never got the re-synced prompt still cannot book.

Every call fielded this way creates one urgent notification for the owner (`Call.billingPausedNotifiedAt` keeps a webhook retry from making two).

## 3. The clocks

All set in `applySubscription` (`src/lib/billing.ts`), the one place Stripe state is mirrored, and **all cleared the moment a subscription is active again** — a reactivation inside any window keeps everything.

| Column                | Set when                                                     | Starts                                  |
| --------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `paymentFailedAt`     | status becomes `past_due` (first failure of this lapse)      | the 10-day grace                        |
| `billingPausedAt`     | the sweep sees `paused` for the first time             | nothing — it is the "owner told, agent re-synced" marker |
| `subscriptionEndedAt` | status becomes `cancelled`                                   | the 30-day reclamation clock            |
| `reclamationWarnedAt` | the sweep sent the day-20 warning                            | —                                       |
| `numberReleasedAt`    | the sweep released the number                                | —                                       |

The reclamation clock starts at `subscriptionEndedAt`, or — for a lapse Stripe never cancelled — at the end of grace (`paymentFailedAt` + 10 days). "Ends unpaid or cancelled", both.

## 4. Number reclamation

The daily sweep (`src/lib/reclamation.ts`, run by `/api/cron/escalations` at 13:00 UTC — see §7 for why daily), for paused accounts that still hold a number:

- **Day 20** — one warning notification: the number goes in 10 days.
- **Day 30** — the Twilio number is removed from the A2P sender pool and released, the Retell agent and its LLM are deleted, the account's number and agent columns are cleared, and the owner gets a notification **and an email** (`sendNumberReleasedEmail`) — the email because an owner a month past their last payment is probably not opening the app.

A released number cannot be reclaimed. Re-subscribing issues a fresh one through the normal phone step.

## 5. The browser demo cap

An account that has not paid may make **`DEMO_CALL_LIMIT` (3) browser test calls of `DEMO_CALL_MAX_MS` (3 minutes) each.** Enough to hear the greeting and book something; not enough to run metered Retell minutes forever on an account that never pays.

Independent of `BILLING_REQUIRED` — this is about minutes nobody is paying for, not enforcement policy — and it shares the phone gate's two exemptions: `Account.isInternal`, and deployments with no Stripe (a cap nobody can lift is a demo that just stops working). `demoCapped()` in `billing-state.ts` decides.

Two layers:

1. **The count** — `/api/retell/web-call` counts the account's browser test calls (`Call.isTest` with no Twilio leg; an unpaid account cannot make the other kind) and refuses the fourth with a 403 that names the payment step, *before* the agent is built, so a capped account causes no Retell activity at all.
2. **The length** — `buildAgentConfig` sets the agent's own `max_call_duration_ms` to three minutes for an unpaid account, so Retell ends the call whatever the browser does. `applySubscription` re-syncs the agent when the subscription goes active, which lifts it to the full twenty.

The component tells the owner where they stand from the moment a call is requested ("Test call 2 of 3 · up to 3 minutes each until you subscribe"), so the limit is never a surprise mid-sentence.

## 6. The rules

1. **`billingState` is the only source of truth.** Never compare `subscriptionStatus` to decide behaviour at a call site; ask the function, and pass `now` in tests.
2. **The agent answers in every state.** Enforcement changes what it may *do*, never whether it picks up. A refusal at the function layer tells the agent to take a message, never to end the call.
3. **Nothing about billing reaches the caller.** The paused prompt says to pass details on and promise a call back; it does not say why.
4. **Clocks are set from Stripe events this app witnessed, never backfilled.** A countdown nobody was warned about is worse than none — see the migration comment.
5. **Reactivation keeps everything.** Every clock clears on `active`; nothing is released until the day-30 sweep actually runs.
6. **The exemption is a column, not a list.** `Account.isInternal` — set it on the owner's and test accounts; never special-case an id in code.
7. **Non-paused prompts stay byte-identical.** The paused section is appended by `buildGeneralPrompt`, and only then. `tests/snapshots` are the check.
8. **Setup is exempt, because the demo is the sale.** The voice step's browser test call runs before the payment step; a prospect hearing an agent that refuses to book buys nothing. No number exists before payment, so nothing but the owner's own tests can reach the agent — enforcement starts the moment `onboardingStepId` becomes `done`. Lives in `billingState`, not at a call site (rule 1).

## 7. Scheduling is daily, by platform constraint

Vercel Hobby allows one cron run per day, and the deployment stays on Hobby by decision (2026-09-07 — a five-minute cadence was built, rejected by Vercel at deploy time, and reverted). `/api/cron/escalations` therefore runs **once, at 13:00 UTC**, and everything in it is written to be correct at that cadence: reclamation is measured in days, and every job is idempotent so a missed run is made up by the next.

**Any future feature that assumes sub-daily scheduling needs a different mechanism, not a shorter cron.** The two in use today: piggybacking on traffic (the escalation and stale-SMS sweeps also run `after()` every Retell webhook, which is what keeps their latency at minutes while the business is busy), and doing the work at the moment of the event (the paused-boundary re-sync happens inside `applySubscription`, not in a sweep). Do not put `*/N` in `vercel.json`: Vercel rejects the whole deployment at validation, silently — no deployment record is created, and every commit behind it is blocked.

## 8. Where things live

| Concern                              | File                                        |
| ------------------------------------ | ------------------------------------------- |
| State machine, clocks, day counts    | `src/lib/billing-state.ts`                  |
| Setting the clocks from Stripe       | `src/lib/billing.ts` (`applySubscription`)  |
| Paused prompt section                | `src/lib/agent-config.ts`                   |
| Function-layer refusal               | `src/app/api/retell/functions/[name]/route.ts` |
| Per-call owner notification          | `src/app/api/retell/webhook/route.ts`       |
| Daily sweep: pause + reclamation     | `src/lib/reclamation.ts` (§7: daily by constraint) |
| Dunning / paused banners             | `src/app/(app)/layout.tsx`                  |
| The release email                    | `src/lib/email.ts`                          |
