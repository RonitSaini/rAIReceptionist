import { cookies } from "next/headers";
import { requireAccount } from "@/lib/current-account";
import { SMS_PAUSE_DISMISS_COOKIE, showSmsPauseBanner } from "@/lib/sms-pause";
import { SmsPauseBanner } from "@/components/sms-pause-banner";
import { verticalFor } from "@/verticals";
import { RestaurantHome } from "./restaurant-home";
import { FieldServiceHome } from "./field-service-home";

export const metadata = { title: "Home" };

/**
 * Home, per archetype.
 *
 * The home page is the one screen that cannot be built out of shared parts alone: a restaurant
 * opens it to see covers and orders, a trade to see today's visits and anything still without a
 * time. So the archetype picks the whole page rather than the page branching a dozen times.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const { account, previousSeenAt } = await requireAccount();
  const { changed } = await searchParams; // id whose status just changed → its badge pops

  const Home = verticalFor(account).archetype === "restaurant" ? RestaurantHome : FieldServiceHome;
  // While texts to US numbers are paused (no messaging service yet), one dismissable line above
  // the home, gone by itself the day TWILIO_MESSAGING_SERVICE_SID is set (src/lib/sms-pause.ts).
  const dismissedFor = (await cookies()).get(SMS_PAUSE_DISMISS_COOKIE)?.value;
  return (
    <>
      {showSmsPauseBanner(account, dismissedFor) ? <SmsPauseBanner /> : null}
      <Home account={account} previousSeenAt={previousSeenAt} changed={changed} />
    </>
  );
}
