# FrontDesk AI — billing enforcement spec

What happens to an account that stops paying, and when. Owner's policy, set 2026-09-06.

## 1. The states

`billingState(account)` in `src/lib/billing-state.ts` is the single answer, and it is pure:

| State    | When                                                                                   | The agent                                          | The owner sees                                  |
| -------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `exempt` | `BILLING_REQUIRED` is not `"true"`, or `Account.isInternal`                            | normal                                             | nothing                                         |
| `ok`     | subscription `active` or `trialing`                                                    | normal                                             | nothing                                         |
| `grace`  | `past_due` and fewer than **10 days** since `paymentFailedAt`                          | normal                                             | red dunning banner with days left, a notification |
| `paused` | everything else: `none`, `cancelled`, or grace ran out unpaid                          | **billing-paused mode** (§2)                       | red "taking messages only" banner, a notification, and one per fielded call |

## 2. Billing-paused mode

The agent still answers, still takes the caller's name, number and what they need, and **never hangs up** — the never-hang-up rule is unconditional. It books nothing: no reservations, orders, visits, appointments, work orders or dispatches, and it does not offer times it cannot book.

Enforced in two layers that cannot drift apart, both reading `billingState`:

1. **The prompt.** `buildGeneralPrompt` appends a `BILLING PAUSED` section for a paused account. It is appended, never woven in, so a non-paused prompt is byte-identical to before — the goldens in `tests/snapshots` prove it. The agent is re-synced the moment the state crosses the paused boundary in either direction (`applySubscription`, and the daily sweep for a grace that ran out).
2. **The function endpoint.** `/api/retell/functions/[name]` refuses every creating or availability function for a paused account with an instruction to take a message instead. A stale agent that never got the re-synced prompt still cannot book.

Every call fielded this way creates one urgent notification for the owner (`Call.billingPausedNotifiedAt` keeps a webhook retry from making two).

## 3. The clocks

All set in `applySubscription` (`src/lib/billing.ts`), the one place Stripe state is mirrored, and **all cleared the moment a subscription is active again** — a reactivation inside any window keeps everything.

| Column                | Set when                                                     | Starts                                  |
| --------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `paymentFailedAt`     | status becomes `past_due` (first failure of this lapse)      | the 10-day grace                        |
| `billingPausedAt`     | the daily sweep sees `paused` for the first time             | nothing — it is the "owner told, agent re-synced" marker |
| `subscriptionEndedAt` | status becomes `cancelled`                                   | the 30-day reclamation clock            |
| `reclamationWarnedAt` | the sweep sent the day-20 warning                            | —                                       |
| `numberReleasedAt`    | the sweep released the number                                | —                                       |

The reclamation clock starts at `subscriptionEndedAt`, or — for a lapse Stripe never cancelled — at the end of grace (`paymentFailedAt` + 10 days). "Ends unpaid or cancelled", both.

## 4. Number reclamation

Daily sweep (`src/lib/reclamation.ts`, run by `/api/cron/escalations`), for paused accounts that still hold a number:

- **Day 20** — one warning notification: the number goes in 10 days.
- **Day 30** — the Twilio number is removed from the A2P sender pool and released, the Retell agent and its LLM are deleted, the account's number and agent columns are cleared, and the owner gets a notification **and an email** (`sendNumberReleasedEmail`) — the email because an owner a month past their last payment is probably not opening the app.

A released number cannot be reclaimed. Re-subscribing issues a fresh one through the normal phone step.

## 5. The rules

1. **`billingState` is the only source of truth.** Never compare `subscriptionStatus` to decide behaviour at a call site; ask the function, and pass `now` in tests.
2. **The agent answers in every state.** Enforcement changes what it may *do*, never whether it picks up. A refusal at the function layer tells the agent to take a message, never to end the call.
3. **Nothing about billing reaches the caller.** The paused prompt says to pass details on and promise a call back; it does not say why.
4. **Clocks are set from Stripe events this app witnessed, never backfilled.** A countdown nobody was warned about is worse than none — see the migration comment.
5. **Reactivation keeps everything.** Every clock clears on `active`; nothing is released until the day-30 sweep actually runs.
6. **The exemption is a column, not a list.** `Account.isInternal` — set it on the owner's and test accounts; never special-case an id in code.
7. **Non-paused prompts stay byte-identical.** The paused section is appended by `buildGeneralPrompt`, and only then. `tests/snapshots` are the check.

## 6. Where things live

| Concern                              | File                                        |
| ------------------------------------ | ------------------------------------------- |
| State machine, clocks, day counts    | `src/lib/billing-state.ts`                  |
| Setting the clocks from Stripe       | `src/lib/billing.ts` (`applySubscription`)  |
| Paused prompt section                | `src/lib/agent-config.ts`                   |
| Function-layer refusal               | `src/app/api/retell/functions/[name]/route.ts` |
| Per-call owner notification          | `src/app/api/retell/webhook/route.ts`       |
| Daily sweep: pause + reclamation     | `src/lib/reclamation.ts`                    |
| Dunning / paused banners             | `src/app/(app)/layout.tsx`                  |
| The release email                    | `src/lib/email.ts`                          |
