import { z } from "zod";
import type { ClassifiedReason } from "./types";
import { shopAppointmentVertical } from "./archetypes/shop-appointment";

/**
 * Veterinary.
 *
 * The hardest call this product handles. An animal is in trouble, the person on the phone is
 * frightened, and the single most dangerous thing the agent can do is sound helpful: offer a
 * reassurance, suggest waiting until morning, name a dose. Every one of those is a decision only a
 * vet can make, and getting it wrong kills the animal.
 *
 * So the emergency branch is the whole design. During opening hours it means bring them in now and
 * wake someone. Outside them it means the referral number, said before any other question — a dog
 * that cannot breathe is not a form to be filled in first — and if the number was somehow never
 * configured, it still means saying something useful rather than nothing at all.
 *
 * "Straining to urinate" is on the list because in a male cat it is hours from fatal and sounds to
 * an owner like constipation. That is exactly the kind of thing an answering service gets wrong.
 */

export const VET_EMERGENCIES: readonly ClassifiedReason[] = [
  { key: "breathing", label: "Difficulty breathing" },
  { key: "hit_by_car", label: "Hit by a car" },
  { key: "toxin", label: "Swallowed something poisonous" },
  { key: "seizure", label: "Seizure" },
  { key: "bloat", label: "Bloated or distended abdomen" },
  { key: "urinary_blockage", label: "Straining to urinate, especially a male cat" },
  { key: "bleeding", label: "Bleeding that will not stop" },
];

export const VET_ESCALATIONS: readonly ClassifiedReason[] = [
  { key: "quote_request", label: "Quote for a procedure" },
  { key: "complaint", label: "Complaint about previous care" },
  { key: "insurance", label: "Pet insurance claim" },
  { key: "press_vendor", label: "Press or vendor" },
];

const VET_GUARDRAILS: readonly string[] = [
  "NEVER give medical advice of any kind. No dosages, no medicines, no home remedies, no first aid beyond what is written above, and never an opinion on whether something is serious or how urgent it is. You are not a veterinarian and a wrong answer here kills animals.",
  "NEVER tell a caller to wait and see, to monitor it overnight, or that it can probably wait until morning. If you are unsure whether something is urgent, treat it as urgent.",
  "NEVER say what might be wrong with an animal, however obvious it sounds and however much the caller presses. Record what they told you in their own words and let a veterinarian decide.",
  "Never confirm or deny that an animal will be alright, and never tell a caller not to worry.",
  "Never quote the cost of treatment. You may state a starting price for a listed service, and only when it is written above.",
  "If the caller is distressed, keep your replies short and calm and get to the point. Do not fill the silence with reassurance.",
  "Phone numbers must be 10-digit US or Canadian numbers. Read numbers back digit by digit to confirm.",
];

export const veterinary = shopAppointmentVertical({
  slug: "veterinary",
  label: "Veterinary",
  blurb: "Appointments booked around a pet.",
  tradeDescription: "a veterinary clinic",

  vocabulary: {
    booking: { one: "appointment", many: "appointments", One: "Appointment", Many: "Appointments" },
    customer: { one: "client", many: "clients", One: "Client", Many: "Clients" },
    staff: { one: "veterinarian", many: "veterinarians", One: "Veterinarian", Many: "Veterinarians" },
    business: { one: "clinic", many: "clinics", One: "Clinic", Many: "Clinics" },
    subject: { one: "pet", many: "pets", One: "Pet", Many: "Pets" },
  },

  shopWords: { staff: "veterinarian", visit: "appointment" },

  emergencies: VET_EMERGENCIES,
  escalations: VET_ESCALATIONS,
  guardrails: VET_GUARDRAILS,

  intakeSchema: z
    .object({
      pet_name: z.string().optional(),
      species: z.string().optional(),
      breed: z.string().optional(),
      pet_age: z.string().optional(),
      symptom: z.string().optional(),
      patient_status: z.enum(["new", "existing"]).optional(),
    })
    .strip(),
  intakeProperties: {
    pet_name: { type: "string", description: "The animal's name." },
    species: { type: "string", description: "Dog, cat, rabbit and so on." },
    breed: { type: "string", description: "Breed, if they know it." },
    pet_age: { type: "string", description: "Rough age. Do not press for an exact date." },
    symptom: { type: "string", description: "What is wrong, in the caller's own words. Do not interpret it and do not name a condition." },
    patient_status: { type: "string", enum: ["new", "existing"], description: "Whether the animal has been seen here before." },
  },

  referral: {
    field: "emergencyReferralPhone",
    label: "Emergency referral number",
    hint: "Given out immediately when an animal is in trouble and the clinic is closed. Required.",
    required: true,
    fallback: "Tell them to call the nearest emergency animal hospital straight away, and to search for one now if they do not know of one. Do not leave them without an instruction.",
  },

  emergencyMeansComeInNow: true,
  emergencyExtra: [
    "Do not take any details before giving the instruction above. Name, pet and symptoms can wait; the animal cannot.",
    "Never delay an urgent case to check whether they are an existing client.",
  ],

  firstThing:
    "FIRST THING: ask what is wrong with the animal. Check it against the urgent list below before anything else - before the name, before whether they are an existing client, before the diary.",

  bookingToolDescription: "Book the pet in after the caller has confirmed the details and the time. Only call with a time get_available_slots reported as free.",

  defaults: { slotMinutes: 30, intervalMinutes: 30, maxPerDay: 20 },
});
