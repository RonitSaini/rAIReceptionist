"use server";

import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { str, type ActionState } from "@/lib/form";
import { stripe, stripeErrorMessage } from "@/lib/stripe";
import { releaseNumber } from "@/lib/twilio";
import { stripeConfigured, twilioConfigured } from "@/lib/env";
import { deleteAgent, deleteLlm } from "@/lib/retell";
import { disconnect as disconnectGoogle } from "@/lib/google-calendar";

const LIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

/**
 * Permanently delete the signed-in restaurant: cancel billing, release the phone number, remove the
 * AI agent, revoke Google access, then drop every row (users included) so the email can sign up again.
 *
 * Anything that would keep charging money (Stripe subscription, Twilio number) must succeed before the
 * data goes; the rest is best-effort so an orphaned Retell agent can never block a deletion.
 */
export async function deleteAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  if (str(fd, "confirm").trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };

  // 1. Billing — stop the subscription and remove the customer. Invoices stay in Stripe for your records.
  if (stripeConfigured() && account.stripeCustomerId) {
    try {
      if (account.stripeSubscriptionId && LIVE_SUBSCRIPTION.has(account.subscriptionStatus)) {
        await stripe().subscriptions.cancel(account.stripeSubscriptionId);
      }
      await stripe().customers.del(account.stripeCustomerId);
    } catch (e) {
      return { ok: false, error: `Couldn't close billing: ${stripeErrorMessage(e)}. Nothing was deleted — try again or cancel from the billing portal first.` };
    }
  }

  // 2. Phone number — releasing it stops the monthly rental.
  if (twilioConfigured() && account.twilioNumberSid) {
    try {
      await releaseNumber(account.twilioNumberSid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/not found|20404/i.test(msg)) return { ok: false, error: `Couldn't release the phone number: ${msg}. Nothing was deleted.` };
    }
  }

  // 3. AI agent + prompt on Retell (best-effort).
  if (account.retellAgentId) await deleteAgent(account.retellAgentId).catch(() => {});
  if (account.retellLlmId) await deleteLlm(account.retellLlmId).catch(() => {});

  // 4. Google Calendar tokens (revoked at Google, row removed).
  await disconnectGoogle(account.id).catch(() => {});

  // 5. Data. Users are unlinked (not cascaded) by the schema, so delete them explicitly; everything else cascades.
  await prisma.$transaction([prisma.user.deleteMany({ where: { accountId: account.id } }), prisma.account.delete({ where: { id: account.id } })]);

  return { ok: true, message: "Account deleted." };
}
