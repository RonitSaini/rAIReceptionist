import { formatUsd } from "@/lib/form";
import { REFERRAL_CREDIT_CENTS, referralShareUrl, type ReferralSummary } from "@/lib/referrals";
import { Card, Input } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

const credit = formatUsd(REFERRAL_CREDIT_CENTS / 100);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/**
 * Settings → Billing: the account's own code, the link that carries it, and what it has earned.
 *
 * Both the code and the link are shown because they get shared in different rooms — the code is
 * what gets said out loud at a trade counter, the link is what gets texted.
 */
export function ReferralCard({ summary }: { summary: ReferralSummary }) {
  if (!summary.code) return null;
  const shareUrl = referralShareUrl(summary.code);
  const introduced = summary.qualified + summary.awaitingFirstPayment;

  return (
    <Card title="Refer another business">
      <p className="text-sm text-gray-500">
        Give another owner your code before they pay. They get {credit} off their first month, and you get {credit} off your next one as soon as
        their first invoice clears.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 font-mono text-xl font-semibold tracking-[0.2em] text-ink">{summary.code}</span>
        <CopyButton value={summary.code} label="Copy code" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input readOnly value={shareUrl} aria-label="Invite link" className="min-h-9 px-3 text-sm" />
        <CopyButton value={shareUrl} label="Copy link" className="shrink-0" />
      </div>

      <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm">
        <Row label="Businesses that used your code" value={String(introduced)} />
        {summary.awaitingFirstPayment > 0 ? <Row label="Still to pay their first invoice" value={String(summary.awaitingFirstPayment)} /> : null}
        <Row label="Credit waiting to come off a bill" value={formatUsd(summary.pendingCents / 100)} />
        <Row label="Credit already applied" value={formatUsd(summary.appliedCents / 100)} />
      </div>

      {summary.claimedCode ? (
        <p className="mt-3 text-sm text-gray-500">
          You joined with the code <span className="font-mono font-semibold">{summary.claimedCode}</span>
          {summary.claimedCreditApplied ? " — your credit has been applied." : " — your credit comes off at checkout."}
        </p>
      ) : null}
    </Card>
  );
}
