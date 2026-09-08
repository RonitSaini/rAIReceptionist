import { completePortfolioStep } from "@/actions/onboarding";
import { PortfolioImporter } from "@/components/forms/portfolio-importer";
import { BackLink } from "@/components/form-footer";
import { Button } from "@/components/ui";

/**
 * Property management, onboarding step "portfolio": the same CSV importer the Properties page
 * offers, framed as a step. The importer saves each row as it goes, so the footer's only job is to
 * move on - and it is allowed to move on with nothing imported, because a manager can add
 * buildings by hand later and the agent answers without a portfolio (it takes messages).
 *
 * Until 2026-09-07 this step had no page at all: the onboarding switch fell through to notFound()
 * for "portfolio" and "maintenance", so no property-management signup could get past step 3.
 */
export function PortfolioStep({ backHref }: { backHref?: string }) {
  return (
    <div className="space-y-4">
      <PortfolioImporter />
      <form action={completePortfolioStep} data-guided="3" className="space-y-3 pt-2">
        <p className="text-sm text-gray-500">You can add buildings and units by hand later under Properties. Skipping this now changes nothing else.</p>
        <Button type="submit" size="lg" full>
          Continue
        </Button>
        {backHref ? <BackLink href={backHref} /> : null}
      </form>
    </div>
  );
}
