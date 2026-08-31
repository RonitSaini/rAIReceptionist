import type { Vertical } from "@prisma/client";
import type { IconName } from "@/components/icon-paths";
import { verticalFor } from "@/verticals";
import type { DashboardModule, Vocabulary } from "@/verticals/types";

/**
 * Navigation, assembled from the account's `dashboardModules`.
 *
 * Resolved on the server and handed to <AppNav> as data, deliberately: the nav component is a
 * client component, and importing the vertical registry there would ship every profession's
 * prompt text and Zod schemas to the browser to render six links.
 *
 * Labels are functions of the vocabulary rather than plain strings so a module can be named in
 * the account's own words where that reads better ("Work orders", "Dispatch"). Restaurant's are
 * fixed literals, which is why its nav is unchanged.
 */

export type NavItem = { href: string; label: string; icon: IconName };

const MODULE_NAV: Record<DashboardModule, { href: string; icon: IconName; label: (v: Vocabulary) => string }> = {
  home: { href: "/dashboard", icon: "home", label: () => "Home" },
  notifications: { href: "/notifications", icon: "bell", label: () => "Notifications" },
  book: { href: "/reservations", icon: "calendar", label: () => "Book" },
  takeout: { href: "/takeout", icon: "bag", label: () => "Takeout" },
  calls: { href: "/calls", icon: "phone", label: () => "Calls" },
  settings: { href: "/settings", icon: "settings", label: () => "Settings" },
};

/**
 * `sidebar` shows every module; `tabs` drops Notifications, which lives in the header bell on
 * mobile. Order follows the vertical's own module list.
 */
export function navItemsFor(source: Vertical | { vertical: Vertical }, variant: "sidebar" | "tabs"): NavItem[] {
  const definition = verticalFor(source);
  return definition.dashboardModules
    .filter((m) => variant === "sidebar" || m !== "notifications")
    .map((m) => {
      const nav = MODULE_NAV[m];
      return { href: nav.href, label: nav.label(definition.vocabulary), icon: nav.icon };
    });
}
