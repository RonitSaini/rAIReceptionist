/* eslint-disable */
// Demo data so the dashboard has something to show.
// Run with: npm run db:seed   (login: demo@callcover.app / password123)
const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

// Minimal "local time in tz -> UTC" for the seed (matches src/lib/time.ts).
function tzOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - Math.floor(date.getTime() / 1000) * 1000;
}
function zonedToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const guess = new Date(naive - tzOffsetMs(new Date(naive), timeZone));
  return new Date(naive - tzOffsetMs(guess, timeZone));
}
function dateStrInTz(date, timeZone, offsetDays = 0) {
  const d = new Date(date.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
const minutesAgo = (n) => new Date(Date.now() - n * 60000);

async function main() {
  const email = "demo@callcover.app";
  const tz = "America/New_York";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Re-runnable top-up: keep at least one unread notification so the bell ring, badge pop and
    // mark-read → count refresh paths stay demoable after everything has been read.
    const title = "New reservation: Sam Rivera, party of 4";
    // Never stack copies: keep exactly one of our own demo notification, deleting any earlier extras.
    const mine = await prisma.notification.findMany({ where: { accountId: existing.accountId, title }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (mine.length > 1) {
      await prisma.notification.deleteMany({ where: { id: { in: mine.slice(1).map((n) => n.id) } } });
      console.log(`Removed ${mine.length - 1} duplicate demo notification(s).`);
    }
    const unread = await prisma.notification.count({ where: { accountId: existing.accountId, readAt: null } });
    if (unread === 0) {
      const data = { type: "reservation", title, body: "Tonight 7:30 PM · Window table if possible · Celebrating a birthday", readAt: null, createdAt: new Date() };
      if (mine[0]) await prisma.notification.update({ where: { id: mine[0].id }, data });
      else await prisma.notification.create({ data: { accountId: existing.accountId, ...data } });
      console.log(`Demo user already exists — ${mine[0] ? "re-armed" : "added"} one unread notification so the bell has something to ring about.`);
    } else {
      console.log(`Demo user already exists — skipping seed (${unread} unread notification(s) present). Delete the user to re-seed.`);
    }
    return;
  }

  const account = await prisma.account.create({
    data: {
      restaurantName: "Luigi's Trattoria",
      ownerName: "Maria Lopez",
      cellPhone: "+12125550123",
      addressLine1: "142 Mulberry St",
      city: "New York",
      state: "NY",
      zip: "10013",
      timeZone: tz,
      cuisineType: "Italian",
      priceRange: "$$",
      hostName: "Sofia",
      voiceId: "11labs-Sarah",
      greeting: "Thanks for calling Luigi's Trattoria! This is Sofia. Just so you know, this call may be recorded. How can I help you today?",
      canQuotePrices: true,
      largePartyThreshold: 8,
      largePartyDepositFee: "25.00",
      escalatesToManager: true,
      escalationTypes: ["large_party", "private_event", "catering", "complaint"],
      tableTurnMinutes: 90,
      reservationIntervalMinutes: 30,
      seatingCapacity: 48,
      maxCoversPerSlot: 16,
      takesTakeoutOrders: true,
      offersDelivery: true,
      deliveryZip: "10013",
      deliveryRadiusMiles: "3.0",
      onboardingStepId: "done",
      lastSeenAt: minutesAgo(60 * 14),
    },
  });

  const user = await prisma.user.create({ data: { email, name: "Maria Lopez", passwordHash: hashPassword("password123"), accountId: account.id } });

  // A seeded demo is a signed-up user, and signing up now records terms acceptance — without this
  // row the interstitial (correctly) blocks the dashboard. Version read from its single source.
  const TERMS_VERSION = require("node:fs")
    .readFileSync(require("node:path").join(__dirname, "../src/app/terms/terms-version.ts"), "utf8")
    .match(/TERMS_VERSION = "(\d{4}-\d{2}-\d{2})"/)[1];
  await prisma.termsAcceptance.create({ data: { userId: user.id, termsVersion: TERMS_VERSION, ipAddress: null } });

  // Hours: lunch + dinner Tue–Sun, closed Monday
  const hours = [];
  for (let day = 0; day < 7; day++) {
    if (day === 1) {
      hours.push({ accountId: account.id, dayOfWeek: day, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true, sortOrder: 0 });
      continue;
    }
    hours.push({ accountId: account.id, dayOfWeek: day, periodName: "Lunch", open: "11:30", close: "14:30", isClosed: false, sortOrder: 0 });
    hours.push({ accountId: account.id, dayOfWeek: day, periodName: "Dinner", open: "17:00", close: day === 5 || day === 6 ? "23:00" : "22:00", isClosed: false, sortOrder: 1 });
  }
  await prisma.businessHours.createMany({ data: hours });
  await prisma.managerAvailability.createMany({ data: [0, 2, 3, 4, 5, 6].map((d) => ({ accountId: account.id, dayOfWeek: d, start: "10:00", end: "23:00" })) });

  await prisma.menuItem.createMany({
    data: [
      { name: "Bruschetta", category: "Appetizers", price: "11.00", description: "Grilled bread, tomato, basil, garlic", dietaryTags: ["vegetarian", "vegan"] },
      { name: "Calamari Fritti", category: "Appetizers", price: "16.00", description: "Crispy calamari with lemon aioli", dietaryTags: ["contains shellfish"] },
      { name: "Caesar Salad", category: "Salads", price: "13.00", description: "Romaine, parmesan, house croutons", dietaryTags: ["vegetarian"] },
      { name: "Spaghetti Carbonara", category: "Entrees", price: "22.00", description: "Guanciale, egg, pecorino, black pepper", dietaryTags: [] },
      { name: "Margherita Pizza", category: "Entrees", price: "18.00", description: "San Marzano tomato, mozzarella, basil", dietaryTags: ["vegetarian"] },
      { name: "Chicken Parmigiana", category: "Entrees", price: "26.00", description: "Breaded chicken, marinara, mozzarella, side of spaghetti", dietaryTags: [] },
      { name: "Eggplant Parmigiana", category: "Entrees", price: "21.00", description: "Layered eggplant, marinara, mozzarella", dietaryTags: ["vegetarian"] },
      { name: "Gluten-Free Penne Pomodoro", category: "Entrees", price: "19.00", description: "GF penne with tomato and basil", dietaryTags: ["gluten-free", "vegetarian", "vegan"] },
      { name: "Tiramisu", category: "Desserts", price: "10.00", description: "Classic espresso-soaked ladyfingers", dietaryTags: ["vegetarian"] },
      { name: "Cannoli", category: "Desserts", price: "8.00", description: "Two ricotta cannoli with pistachio", dietaryTags: ["vegetarian", "nut-free"] },
    ].map((m, i) => ({ ...m, accountId: account.id, sortOrder: i })),
  });

  const now = new Date();
  const today = dateStrInTz(now, tz);
  const tomorrow = dateStrInTz(now, tz, 1);
  const yesterday = dateStrInTz(now, tz, -1);
  const turn = 90 * 60000;
  const res = (dateStr, time, data) => {
    const startTime = zonedToUtc(dateStr, time, tz);
    return { accountId: account.id, startTime, endTime: new Date(startTime.getTime() + turn), status: "booked", isWaitlist: false, source: "ai", ...data };
  };

  const reservations = await Promise.all([
    prisma.reservation.create({ data: res(today, "12:30", { guestName: "Dana Whitfield", guestPhone: "+12125550101", partySize: 2, status: "confirmed", seatingPreference: "Window" }) }),
    prisma.reservation.create({ data: res(today, "18:00", { guestName: "The Nguyen Family", guestPhone: "+19175550142", partySize: 5, specialRequests: "High chair for a toddler", seatingPreference: "Booth" }) }),
    prisma.reservation.create({ data: res(today, "19:30", { guestName: "Marcus Bell", guestPhone: "+16465550177", partySize: 4, specialRequests: "Anniversary — dessert with a candle if possible" }) }),
    prisma.reservation.create({ data: res(today, "20:00", { guestName: "Priya Raman", guestPhone: "+17185550188", partySize: 2, isWaitlist: true }) }),
    prisma.reservation.create({ data: res(tomorrow, "18:30", { guestName: "Jordan Kim", guestPhone: "+13475550199", partySize: 6, seatingPreference: "Outdoor / patio" }) }),
    prisma.reservation.create({ data: res(tomorrow, "13:00", { guestName: "Elena Rossi", guestPhone: "+12125550166", partySize: 3, source: "manual" }) }),
    prisma.reservation.create({ data: res(yesterday, "19:00", { guestName: "Sam Ortiz", guestPhone: "+12125550155", partySize: 2, status: "completed" }) }),
    prisma.reservation.create({ data: res(yesterday, "20:30", { guestName: "Chris Park", guestPhone: "+12125550144", partySize: 4, status: "no_show" }) }),
  ]);

  const orders = await Promise.all([
    prisma.takeoutOrder.create({
      data: { accountId: account.id, guestName: "Alex Turner", guestPhone: "+12125550133", items: "2x Margherita Pizza\n1x Caesar Salad (no croutons)\n1x Tiramisu", notes: "Ring the bell at pickup", pickupTime: new Date(now.getTime() + 40 * 60000), isDelivery: false, status: "new", source: "ai" },
    }),
    prisma.takeoutOrder.create({
      data: { accountId: account.id, guestName: "Nina Patel", guestPhone: "+16465550122", items: "1x Eggplant Parmigiana\n1x Gluten-Free Penne Pomodoro", pickupTime: new Date(now.getTime() + 55 * 60000), isDelivery: true, deliveryAddress: "88 Kenmare St, Apt 3C, New York, NY 10012", status: "confirmed", source: "ai" },
    }),
    prisma.takeoutOrder.create({
      data: { accountId: account.id, guestName: "Leo Marsh", guestPhone: "+17185550111", items: "1x Chicken Parmigiana\n2x Cannoli", pickupTime: minutesAgo(90), isDelivery: false, status: "picked_up", source: "manual" },
    }),
  ]);

  const calls = await Promise.all([
    prisma.call.create({
      data: {
        accountId: account.id,
        retellCallId: "demo_call_1",
        callerPhone: "+19175550142",
        startedAt: minutesAgo(45),
        endedAt: minutesAgo(43),
        duration: 128,
        classification: "reservation",
        summary: "Booked a table for 5 tonight at 6:00 PM under Nguyen. Requested a high chair and a booth.",
        transcript: "Sofia: Thanks for calling Luigi's Trattoria! This is Sofia. Just so you know, this call may be recorded. How can I help you today?\nCaller: Hi, I'd like a table for five tonight around six.\nSofia: Of course. I have 6:00 PM available for a party of five. Would that work?\nCaller: Perfect. We'll have a toddler with us, could we get a high chair and a booth?\nSofia: Absolutely, I've noted a high chair and a booth. May I have a name and phone number for the reservation?\nCaller: Nguyen, 917-555-0142.\nSofia: You're all set, Nguyen, party of five at 6:00 PM tonight. You'll get a text confirmation shortly. Anything else?\nCaller: No, that's it. Thanks!\nSofia: Thank you for calling. See you tonight!",
        reservationId: reservations[1].id,
      },
    }),
    prisma.call.create({
      data: {
        accountId: account.id,
        retellCallId: "demo_call_2",
        callerPhone: "+12125550133",
        startedAt: minutesAgo(25),
        endedAt: minutesAgo(22),
        duration: 174,
        classification: "takeout",
        summary: "Takeout order for Alex: 2 Margherita pizzas, 1 Caesar salad without croutons, 1 tiramisu. Pickup in about 40 minutes.",
        transcript: "Sofia: Thanks for calling Luigi's Trattoria! This is Sofia. Just so you know, this call may be recorded. How can I help you today?\nCaller: I'd like to place a pickup order.\nSofia: Happy to help. What would you like?\nCaller: Two Margherita pizzas, a Caesar salad with no croutons, and a tiramisu.\nSofia: Two Margherita pizzas at $18 each, one Caesar salad with no croutons at $13, and one tiramisu at $10. Can I get a name and number?\nCaller: Alex, 212-555-0133.\nSofia: Thanks, Alex. Your order will be ready for pickup in about 40 minutes. You'll receive a text confirmation.",
        takeoutOrderId: orders[0].id,
      },
    }),
    prisma.call.create({
      data: {
        accountId: account.id,
        retellCallId: "demo_call_3",
        callerPhone: "+13475550100",
        startedAt: minutesAgo(12),
        endedAt: minutesAgo(10),
        duration: 96,
        classification: "escalation",
        summary: "Caller wants to book a private buyout for 40 guests on the 14th. Took name and number; promised a manager call-back within 15 minutes.",
        transcript: "Sofia: Thanks for calling Luigi's Trattoria! This is Sofia. Just so you know, this call may be recorded. How can I help you today?\nCaller: I'm planning a company dinner for about forty people and wondered about renting out the restaurant.\nSofia: That sounds wonderful. A private event like that is something our manager handles personally. Can I take your name and number so they can call you back within fifteen minutes?\nCaller: Sure, it's Taylor Brooks, 347-555-0100.\nSofia: Thank you, Taylor. Our manager will call you back shortly.",
      },
    }),
    prisma.call.create({
      data: {
        accountId: account.id,
        retellCallId: "demo_call_4",
        callerPhone: "+16465550188",
        startedAt: minutesAgo(180),
        endedAt: minutesAgo(179),
        duration: 52,
        classification: "question",
        summary: "Asked whether the restaurant has gluten-free pasta. Confirmed the Gluten-Free Penne Pomodoro is available.",
        transcript: "Sofia: Thanks for calling Luigi's Trattoria! This is Sofia. Just so you know, this call may be recorded. How can I help you today?\nCaller: Do you have any gluten-free pasta?\nSofia: Yes, we have a Gluten-Free Penne Pomodoro at $19. Would you like to make a reservation or place an order?\nCaller: Not right now, thanks.\nSofia: Of course. Thanks for calling!",
      },
    }),
  ]);

  await prisma.notification.createMany({
    data: [
      { accountId: account.id, type: "escalation", priority: "urgent", title: "Manager call-back needed: private event for 40", body: "Taylor Brooks (347) 555-0100 wants a buyout for ~40 guests on the 14th. Promised a call-back within 15 minutes.", callId: calls[2].id, createdAt: minutesAgo(10) },
      { accountId: account.id, type: "takeout", title: "New takeout order: Alex Turner", body: "Pickup in ~40 min · 2x Margherita Pizza, 1x Caesar Salad (no croutons), 1x Tiramisu", takeoutOrderId: orders[0].id, callId: calls[1].id, createdAt: minutesAgo(22) },
      { accountId: account.id, type: "reservation", title: "New reservation: The Nguyen Family, party of 5", body: "Tonight 6:00 PM · Booth · High chair for a toddler", reservationId: reservations[1].id, callId: calls[0].id, createdAt: minutesAgo(43) },
      { accountId: account.id, type: "takeout", title: "New delivery order: Nina Patel", body: "Deliver in ~55 min to 88 Kenmare St · Eggplant Parmigiana, GF Penne Pomodoro", takeoutOrderId: orders[1].id, createdAt: minutesAgo(70) },
      { accountId: account.id, type: "waitlist", title: "Waitlist: Priya Raman, party of 2", body: "Wanted 8:00 PM tonight — fully booked. Call if a table opens.", reservationId: reservations[3].id, createdAt: minutesAgo(95) },
      { accountId: account.id, type: "message", title: "Message from a caller", body: "Rosa Delgado (212) 555-0190 asked whether you can do a vegan tasting menu for 6 next Saturday. Asked for a call-back.", createdAt: minutesAgo(150) },
      { accountId: account.id, type: "reservation", title: "New reservation: Jordan Kim, party of 6", body: "Tomorrow 6:30 PM · Outdoor / patio", reservationId: reservations[4].id, readAt: minutesAgo(200), createdAt: minutesAgo(240) },
      { accountId: account.id, type: "missed_call", title: "Missed call", body: "(646) 555-0170 hung up before the greeting finished.", readAt: minutesAgo(400), createdAt: minutesAgo(60 * 20) },
      { accountId: account.id, type: "system", title: "Welcome to FrontDesk AI!", body: "Your AI host Sofia is ready. Everything she does shows up here.", readAt: minutesAgo(60 * 30), createdAt: minutesAgo(60 * 48) },
    ],
  });

  console.log(`Seeded ${account.restaurantName}. Log in with ${email} / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
