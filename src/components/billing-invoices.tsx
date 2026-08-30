import { stripeConfigured } from "@/lib/env";
import { listInvoices, stripeErrorMessage, type StripeInvoice } from "@/lib/stripe";
import { invoiceTone } from "@/lib/billing-ui";
import { formatUsd } from "@/lib/form";
import { formatDateLong } from "@/lib/time";
import { humanize } from "@/lib/constants";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";

/** Settings → Billing: the customer's invoice history, read straight from Stripe (never cached in the DB). */
export async function InvoicesCard({ customerId, timeZone }: { customerId: string | null; timeZone: string }) {
  if (!stripeConfigured() || !customerId) {
    return (
      <Card title="Invoices">
        <EmptyState title="No invoices yet" body="Invoices appear here after your first payment." />
      </Card>
    );
  }

  let invoices: StripeInvoice[] = [];
  let error: string | null = null;
  try {
    invoices = (await listInvoices(customerId)).data.filter((i) => i.status !== "draft");
  } catch (e) {
    error = stripeErrorMessage(e);
  }

  return (
    <Card title="Invoices">
      {error ? <Alert>Couldn&apos;t load invoices from Stripe: {error}</Alert> : null}
      {!error && invoices.length === 0 ? <EmptyState title="No invoices yet" body="Invoices appear here after your first payment." /> : null}
      {invoices.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{inv.number ?? inv.id}</p>
                <p className="text-xs text-gray-500">{formatDateLong(new Date(inv.created * 1000), timeZone)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-semibold">{formatUsd(inv.total / 100)}</span>
                <Badge tone={invoiceTone[inv.status ?? "draft"] ?? "gray"}>{humanize(inv.status ?? "draft")}</Badge>
                {inv.hosted_invoice_url ? (
                  <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:text-brand-800">
                    View
                  </a>
                ) : null}
                {inv.invoice_pdf ? (
                  <a href={inv.invoice_pdf} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:text-brand-800">
                    PDF
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
