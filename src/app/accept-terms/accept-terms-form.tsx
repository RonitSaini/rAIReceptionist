"use client";

import { useState } from "react";
import { acceptCurrentTerms } from "@/actions/auth";
import { Button } from "@/components/ui";
import { TermsCheckbox } from "@/components/terms-checkbox";

/** Same checkbox, same recording as signup — just standing between an older account and its dashboard. */
export function AcceptTermsForm() {
  const [agreed, setAgreed] = useState(false);

  return (
    <form action={acceptCurrentTerms} className="space-y-4">
      <TermsCheckbox checked={agreed} onChange={setAgreed} />
      <Button type="submit" size="lg" full disabled={!agreed}>
        Continue to your dashboard
      </Button>
    </form>
  );
}
