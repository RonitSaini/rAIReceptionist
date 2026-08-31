import { normalizeUsPhone } from "./form";

/**
 * Validation for a portfolio import, kept pure so the preview and the commit cannot disagree.
 *
 * The rule the whole design turns on: this file is somebody's tenant list. It is never logged, never
 * echoed into an error message wholesale, and never written until a human has looked at the preview
 * and pressed the button. Row errors name the column and the row number, not the contents.
 */

export type RawRow = Record<string, string | undefined>;

export type ParsedRow = {
  row: number;
  property: string;
  address: string | null;
  unit: string;
  tenantName: string | null;
  tenantPhone: string | null;
  leaseStart: Date | null;
  leaseEnd: Date | null;
  permissionToEnter: boolean;
  petOnPremises: boolean;
};

export type RowResult = { row: number; ok: true; value: ParsedRow } | { row: number; ok: false; errors: string[] };

const TRUE = new Set(["y", "yes", "true", "1", "t"]);
const FALSE = new Set(["n", "no", "false", "0", "f", ""]);

const pick = (r: RawRow, ...names: string[]) => {
  for (const n of names) {
    const v = r[n] ?? r[n.toLowerCase()] ?? r[n.replace(/_/g, " ")];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
};

function parseBool(raw: string, field: string, errors: string[]): boolean {
  const v = raw.toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  errors.push(`${field}: expected yes or no`);
  return false;
}

function parseDate(raw: string, field: string, errors: string[]): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    errors.push(`${field}: not a date the importer understands (try YYYY-MM-DD)`);
    return null;
  }
  return d;
}

/** One row. Row numbers are 1-based over the data rows, matching what a spreadsheet shows. */
export function validateRow(raw: RawRow, row: number): RowResult {
  const errors: string[] = [];

  const property = pick(raw, "property", "property_name", "building");
  const unit = pick(raw, "unit", "unit_label", "apartment");
  const tenantName = pick(raw, "tenant", "tenant_name", "resident", "name");
  const tenantPhoneRaw = pick(raw, "phone", "tenant_phone", "mobile");

  if (!property) errors.push("property: required");
  if (!unit) errors.push("unit: required");

  const tenantPhone = tenantPhoneRaw ? normalizeUsPhone(tenantPhoneRaw) : null;
  if (tenantPhoneRaw && !tenantPhone) errors.push("phone: not a 10-digit US or Canadian number");
  if (tenantName && !tenantPhone) errors.push("phone: required when a tenant name is given, because the phone is how a caller is recognised");
  if (tenantPhone && !tenantName) errors.push("tenant: required when a phone is given");

  const permissionToEnter = parseBool(pick(raw, "permission_to_enter", "permission", "entry"), "permission_to_enter", errors);
  const petOnPremises = parseBool(pick(raw, "pet", "pet_on_premises", "pets"), "pet", errors);
  const leaseStart = parseDate(pick(raw, "lease_start", "start"), "lease_start", errors);
  const leaseEnd = parseDate(pick(raw, "lease_end", "end"), "lease_end", errors);

  if (leaseStart && leaseEnd && leaseEnd < leaseStart) errors.push("lease_end: ends before it starts");

  if (errors.length) return { row, ok: false, errors };
  return {
    row,
    ok: true,
    value: { row, property, address: pick(raw, "address", "property_address") || null, unit, tenantName: tenantName || null, tenantPhone, leaseStart, leaseEnd, permissionToEnter, petOnPremises },
  };
}

export type ImportPlan = {
  rows: RowResult[];
  valid: number;
  invalid: number;
  duplicates: number;
  properties: number;
  units: number;
  tenants: number;
};

/**
 * Turn a sheet into a plan.
 *
 * Duplicates within the file are dropped rather than reported as errors: exporting one row per
 * tenant means a twelve-unit building appears twelve times, and that is the normal shape of the
 * data rather than a mistake worth stopping for. The key is property + unit + phone, which is the
 * same key the commit dedupes on against what is already stored.
 */
export function planImport(raws: RawRow[]): ImportPlan {
  const rows: RowResult[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  raws.forEach((raw, i) => {
    const result = validateRow(raw, i + 1);
    if (!result.ok) {
      rows.push(result);
      return;
    }
    const key = `${result.value.property.toLowerCase()}::${result.value.unit.toLowerCase()}::${result.value.tenantPhone ?? ""}`;
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    rows.push(result);
  });

  const ok = rows.filter((r): r is Extract<RowResult, { ok: true }> => r.ok);
  return {
    rows,
    valid: ok.length,
    invalid: rows.length - ok.length,
    duplicates,
    properties: new Set(ok.map((r) => r.value.property.toLowerCase())).size,
    units: new Set(ok.map((r) => `${r.value.property.toLowerCase()}::${r.value.unit.toLowerCase()}`)).size,
    tenants: ok.filter((r) => r.value.tenantPhone).length,
  };
}
