import { RECORDING_DISCLOSURE } from "./constants";

/** Default greeting the AI reads at the start of every call. Must include the recording disclosure. */
export function generateGreeting(businessName: string, hostName: string): string {
  const name = businessName.trim() || "the business";
  const host = hostName.trim() || "Alex";
  return `Thanks for calling ${name}! This is ${host}. Just so you know, this call may be recorded. How can I help you today?`;
}

export function greetingHasDisclosure(greeting: string): boolean {
  return greeting.toLowerCase().includes(RECORDING_DISCLOSURE);
}
