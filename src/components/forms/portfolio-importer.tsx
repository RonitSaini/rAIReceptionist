"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { commitImport, previewImport } from "@/actions/portfolio-import";
import type { ImportOutcome } from "@/actions/portfolio-import";
import type { ImportPlan, RawRow } from "@/lib/portfolio-import";
import { Button } from "@/components/ui";

/**
 * Import a portfolio from a spreadsheet.
 *
 * Dry run first, always. A manager with two hundred units is pasting in an export from whatever
 * they used before, and the first version of that file is never quite right — so the only way to
 * find out what this will do is to be shown, row by row, before anything is written.
 *
 * The file is parsed here in the browser and only parsed rows are sent. Nothing logs the contents.
 */
export function PortfolioImporter() {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setPlan(null);
    setOutcome(null);
    setParseError(null);
    setFileName(file.name);
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (result) => {
        const data = result.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim()));
        if (data.length === 0) {
          setParseError("That file has no rows in it.");
          return;
        }
        setRows(data);
        start(async () => setPlan(await previewImport(data)));
      },
      // Papa reports its own parse problems; we surface the count, never the content.
      error: () => setParseError("That file could not be read as CSV."),
    });
  }

  const problems = plan?.rows.filter((r) => !r.ok) ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-gray-300 bg-surface p-4">
        <p className="text-sm font-semibold text-gray-800">Import from a spreadsheet</p>
        <p className="mt-1 text-xs text-gray-500">
          CSV with columns: property, address, unit, tenant, phone, lease_start, lease_end, permission_to_enter, pet. One row per tenant; a building repeated on
          every row is normal. Nothing is saved until you confirm.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
        />
        {fileName ? <p className="mt-2 text-xs text-gray-500">{fileName}</p> : null}
        {parseError ? <p className="mt-2 text-sm font-semibold text-red-700">{parseError}</p> : null}
      </div>

      {pending && !plan ? <p className="text-sm text-gray-500">Checking the file…</p> : null}

      {plan && !outcome ? (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-surface p-4">
          <p className="text-sm font-semibold">
            {plan.valid} row{plan.valid === 1 ? "" : "s"} ready · {plan.properties} propert{plan.properties === 1 ? "y" : "ies"} · {plan.units} unit
            {plan.units === 1 ? "" : "s"} · {plan.tenants} tenant{plan.tenants === 1 ? "" : "s"}
          </p>
          {plan.duplicates > 0 ? <p className="text-xs text-gray-500">{plan.duplicates} duplicate row{plan.duplicates === 1 ? "" : "s"} in the file will be ignored.</p> : null}

          {problems.length > 0 ? (
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">
                {problems.length} row{problems.length === 1 ? "" : "s"} cannot be imported and will be skipped:
              </p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-red-800">
                {problems.slice(0, 50).map((p) => (
                  <li key={p.row}>
                    Row {p.row}: {!p.ok ? p.errors.join("; ") : ""}
                  </li>
                ))}
              </ul>
              {problems.length > 50 ? <p className="mt-1 text-xs text-red-700">…and {problems.length - 50} more.</p> : null}
            </div>
          ) : (
            <p className="text-xs text-green-700">Every row checks out.</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={pending || plan.valid === 0}
              onClick={() => rows && start(async () => setOutcome(await commitImport(rows)))}
            >
              {pending ? "Importing…" : `Import ${plan.valid} row${plan.valid === 1 ? "" : "s"}`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setPlan(null); setRows(null); setFileName(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <div className={`rounded-2xl border p-4 ${outcome.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          {outcome.ok ? (
            <p className="text-sm font-semibold text-green-800">
              Imported {outcome.created.properties} propert{outcome.created.properties === 1 ? "y" : "ies"}, {outcome.created.units} unit
              {outcome.created.units === 1 ? "" : "s"} and {outcome.created.tenants} tenant{outcome.created.tenants === 1 ? "" : "s"}.
              {outcome.skipped > 0 ? ` ${outcome.skipped} tenancy already existed and was left alone.` : ""}
              {outcome.invalid > 0 ? ` ${outcome.invalid} row was skipped.` : ""}
            </p>
          ) : (
            <p className="text-sm font-semibold text-red-800">{outcome.error}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
