/**
 * Words and destinations for the Google Calendar connection, shared by every surface that offers it.
 *
 * Two places offer it now — the settings card and the prompt on each profession's diary — so the
 * blurb, the post-OAuth banners and the "manage it properly" link live here rather than being typed
 * out twice and drifting. Server-safe (no JSX, no client hooks) so the card, which is a client
 * component, and the prompt, which is not, can both import it.
 */

/** Per-archetype pitch. Only where the archetypes genuinely behave differently. */
const CALENDAR_BLURB: Record<string, string> = {
  restaurant:
    "Optional. Every reservation also appears on your calendar, and anything else on that calendar blocks those times for phone bookings. The built-in book stays the source of truth.",
  shop_appointment:
    "Optional. Every appointment also appears on your calendar, and anything else on that calendar blocks those times for phone bookings. The built-in schedule stays the source of truth.",
  property_management:
    "Optional. Work orders appear on your calendar once they have a scheduled time, and emergency dispatches show up as they happen. The built-in work-order list stays the source of truth.",
  field_service:
    "Optional. Every scheduled job also appears on your calendar, emergency dispatches show up as they happen, and anything else on that calendar blocks those times for phone bookings. The built-in schedule stays the source of truth.",
};

export function calendarBlurbFor(archetype: string): string {
  return CALENDAR_BLURB[archetype] ?? CALENDAR_BLURB.field_service;
}

/**
 * Where the full card lives. Restaurants keep theirs inside the Reservations tab, where it has
 * always been; every other profession has its own Calendar tab.
 */
export function calendarSettingsHref(archetype: string): string {
  return archetype === "restaurant" ? "/settings?tab=reservations" : "/settings?tab=calendar";
}

/** What each `?google=` value coming back from the OAuth round trip should say. */
export function googleCalendarBanner(status: string | undefined, itemsLabel: string): { kind: "success" | "error" | "info"; text: string } | null {
  if (!status) return null;
  const messages: Record<string, { kind: "success" | "error" | "info"; text: string }> = {
    connected: { kind: "success", text: `Google Calendar connected. Upcoming ${itemsLabel} were added to your calendar.` },
    denied: { kind: "info", text: "Google access was cancelled. Nothing changed." },
    not_configured: { kind: "info", text: "Google Calendar isn't set up on this deployment yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
    invalid_state: { kind: "error", text: "That connection link expired. Please try again." },
    wrong_account: { kind: "error", text: "That link was started from a different account. Please try again." },
    missing_code: { kind: "error", text: "Google didn't return an authorization code. Please try again." },
    error: { kind: "error", text: "Connecting to Google failed." },
  };
  return messages[status] ?? null;
}

/** An expired or revoked grant is not a sync hiccup: nothing syncs again until a human reconnects. */
export function needsCalendarReconnect(lastError: string | null | undefined): boolean {
  return !!lastError && /invalid_grant|unauthorized|401|invalid_credentials|insufficient/i.test(lastError);
}
