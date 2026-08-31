"use client";

import { useState } from "react";
import { acceptCurrentTerms } from "@/actions/auth";
import { Button } from "@/components/ui";

/** Same checkbox, same recording as signup — just standing between an older account and its dashboard. */
export function AcceptTermsForm() {
  const [agreed, setAgreed] = useState(false);

  return (
    <form action={acceptCurrentTerms} className="space-y-4">
      <label htmlFor="acceptTerms" className="flex items-start gap-2.5 text-sm text-gray-700">
        <input
          id="acceptTerms"
          name="acceptTerms"
          type="checkbox"
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-600"
        />
        <span>
          I agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      <Button type="submit" size="lg" full disabled={!agreed}>
        Continue to your dashboard
      </Button>
    </form>
  );
}
