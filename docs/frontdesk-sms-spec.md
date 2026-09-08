# FrontDesk AI — SMS spec

How texts leave this app, what comes back, and which of it an owner is told about.

The rules in §5 are the ones to read before touching anything under `src/app/api/twilio/` or
`src/lib/sms*.ts`. The rest is the reasoning behind them.

---

## 1. Two corrections, written down so they stop coming back

**Twilio does not swallow STOP.** The comment in the inbound route used to say "STOP/HELP are
handled by Twilio itself", and the code acted on it: every reserved keyword fell through to the
generic message path and produced `Text from +1 212 555 0142 — START` in the owner's feed.

What Twilio actually does with a compliance keyword is update *its own* subscription list and send
the carrier-mandated auto-reply. **The inbound webhook still fires**, with the keyword as the body,
exactly like any other text. Anything this app wants to be true about opt-out state has to be made
true by this app, in `src/app/api/twilio/sms/route.ts`. Do not assume a keyword has been intercepted
before it reaches us — it has not.

**There is no SMS acknowledgement of an escalation.** An escalation is acknowledged by keypad on the
outbound call to the owner's cell (`/api/twilio/manager-alert/ack`, `Digits === "1"`) or in the app.
A customer texting "OK" is an ordinary inbound message that notifies through the generic path —
which is the behavior we want, but it is not a feature and there is no "OK" handler to preserve.
Do not add one without deciding what it should mean; "OK" from a customer answers no question the
app ever asked them.

## 2. Direction is not symmetric

Opt-out blocks **outbound only**. Someone who has texted STOP can still text in, and does — most
often to cancel. So the inbound route always works, and every *reply* has to ask whether it can
actually be delivered.

## 3. The reserved vocabulary

Handled in `src/lib/sms-keywords.ts`, matched only as a whole message, case/spacing/punctuation
folded away (`" Stop! "`, `"STOP ALL"` and `"S.T.O.P."` all land; `"stop, I need help"` does not).

| Keyword                                     | Kind      | Effect here                          |
| ------------------------------------------- | --------- | ------------------------------------ |
| `STOP` `STOPALL` `UNSUBSCRIBE` `END` `QUIT` | `opt_out` | sets `Customer.smsOptedOutAt`        |
| `START` `UNSTOP`                            | `opt_in`  | clears `Customer.smsOptedOutAt`      |
| `HELP` `INFO`                               | `help`    | nothing — recorded, then silence     |

All of them are recorded as inbound `SmsMessage` rows (they are billed segments) and **none of them
creates a notification**. They also get no reply of our own: the carrier has already sent the
mandated one, and after a STOP a reply is a message we are not allowed to send.

**Two of Twilio's defaults are deliberately not in the table**, and both are load-bearing:

- **`CANCEL`** is a carrier opt-out keyword *and* the entire premise of our confirmation texts
  ("Reply CANCEL to cancel a booking"). It keeps its cancellation flow and its notification.
- **`YES`** is a carrier opt-in keyword and a plain English answer to everyone else. Someone
  returning from a STOP types START or UNSTOP; someone typing YES is more often replying to a
  person. It keeps notifying — swallowing a real message is the worse error.

Both still work at the carrier, which is where compliance is actually enforced. Leaving them out
only means this app does not *also* act on them.

## 4. How a text fails, and who hears about it

Three distinct failures, which used to be one indistinguishable silence:

0. **Paused before sending** — no messaging service is configured yet and the recipient is a US
   (or unplaceable) number. Not attempted: the row is recorded with `status: "skipped"` and the plain
   reason "Text confirmations to US numbers are paused until carrier registration completes", no
   notification is filed, and Home carries one dismissable line while the condition holds
   (`src/lib/sms-pause.ts`, 2026-09-08). A Canadian recipient is not paused.
1. **Refused before sending** — the number has opted out. `sendGuestSms` checks
   `Customer.smsOptedOutAt` and never calls Twilio. Recorded at zero segments, `status: "failed"`.
2. **Refused by Twilio** — a synchronous rejection (21610, trial limits, unregistered 10DLC).
   Caught, recorded, reported back.
3. **Accepted, then dropped by the carrier** — arrives minutes later on the StatusCallback at
   `/api/twilio/sms/status`. Without that callback these stayed `queued` forever and read exactly
   like a delivered message: the same invisible failure as an opt-out, with a slower fuse.

All three end as `SmsMessage.status = "failed"` with the raw provider text on the row, and all three
reach the owner through `notifyUndeliveredSms()` as one plain sentence. A 21610 on a delivery
receipt also back-fills `smsOptedOutAt` — that is how a STOP typed to the carrier, or sent while our
webhook was down, gets recorded at all.

Failures 1 and 2 for a `no_number` / `not_configured` reason are deliberately silent: nothing was
ever going to be sent, and an owner mid-setup does not need one notification per booking telling
them they are mid-setup.

## 5. The rules

1. **A carrier keyword never notifies the owner.** It is recorded, it moves opt-out state, and it is
   answered with silence. Add new keywords to the map in `src/lib/sms-keywords.ts`, never to a
   condition at a call site.
2. **Never assume Twilio intercepted anything.** The webhook fires for every inbound message
   including keywords. If this app needs to know something, this app has to record it.
3. **Never text a number without checking opt-out first.** `sendGuestSms` does it for you. A TwiML
   `<Message>` does not — the inbound route checks `isOptedOut()` once and routes every reply
   through `replyOrNotify`, which notifies the owner instead of replying into a void.
4. **A text that did not arrive is a fact about the account.** Record it (`SmsMessage`, `status:
   "failed"`, raw error) *and* say it out loud (`notifyUndeliveredSms`). A booking whose
   confirmation bounced must never look like one that landed.
5. **Raw provider text never reaches an owner.** It stays on the diagnostic row;
   `friendlyProviderError()` returns the one plain clause the owner sees. Pinned by
   `tests/provider-errors.test.mjs`.
6. **Every string literal in `src/lib/sms.ts` and the vertical templates stays inside GSM-7.** One
   em dash re-encodes the whole message as UCS-2 and cuts the segment from 160 characters to 70,
   doubling the cost of every text silently. Use `-`, `...` and straight quotes. Enforced by
   `tests/sms-gsm7.test.mjs` — which reads the whole file, including notification text that is never
   actually sent.
8. **A paused text is not a failed text.** While `TWILIO_MESSAGING_SERVICE_SID` is unset, a US-bound
   send is skipped and recorded (rule 4 still holds: it is a fact on the row) but never raises an
   alert - one known condition is said once, on Home, not once per booking. Canadian-bound sends are
   unchanged. Setting the variable ends the pause everywhere, with no other change.
7. **Opt-out is never backfilled or guessed.** `NULL` means reachable. Recording an opt-out that did
   not happen silently stops a real business from texting a real customer.

## 6. Where things live

| Concern                        | File                                     |
| ------------------------------ | ---------------------------------------- |
| Keyword vocabulary + matcher   | `src/lib/sms-keywords.ts`                |
| Opt-out read/write             | `src/lib/sms-opt-out.ts`                 |
| Sending, recording, notifying  | `src/lib/sms.ts`                         |
| Owner-facing error wording     | `src/lib/provider-errors.ts`             |
| Inbound texts                  | `src/app/api/twilio/sms/route.ts`        |
| Delivery receipts              | `src/app/api/twilio/sms/status/route.ts` |
| Cancel-by-text                 | `src/lib/job-cancel.ts`                  |
