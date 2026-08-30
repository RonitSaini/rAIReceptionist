import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { backfillUpcoming, completeConnection, parseState } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Google redirects here after consent. This GET does write (it stores the tokens) — an OAuth
 * callback is the one place that's unavoidable; the signed `state` binds it to the account that
 * started the flow and expires after 10 minutes.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const state = parseState(q.get("state"));
  const back = (params: Record<string, string>) => {
    const u = new URL(state?.returnTo || "/settings?tab=reservations", req.url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };

  if (!state) return back({ google: "invalid_state" });
  const session = await auth();
  if (!session?.user?.accountId || session.user.accountId !== state.accountId) return back({ google: "wrong_account" });
  if (q.get("error")) return back({ google: "denied" });
  const code = q.get("code");
  if (!code) return back({ google: "missing_code" });

  try {
    await completeConnection(state.accountId, code);
    const { synced, attempted } = await backfillUpcoming(state.accountId);
    return back({ google: "connected", synced: String(synced), attempted: String(attempted) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return back({ google: "error", message: msg.slice(0, 200) });
  }
}
