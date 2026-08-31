/**
 * Guardrails every vertical inherits, whatever it does for a living.
 *
 * A vertical's own `guardrails` are its profession's hard rules — never diagnose remotely, never
 * quote a price, leave the building before booking. These are the ones that hold regardless: they
 * are about how the agent behaves when the machinery underneath it misbehaves, which is identical
 * for a restaurant and a locksmith.
 *
 * Rendered verbatim into the prompt under "HARD RULES:", after the vertical's own.
 */
export const SHARED_GUARDRAILS: readonly string[] = [
  // A failed tool call is the moment an agent is most likely to invent something: it asked for a
  // fact, got nothing back, and still has a caller waiting. The 401 that a renamed shared-secret
  // header would cause returns JSON, not an exception — so from the model's side a broken booking
  // endpoint looks exactly like a normal, unhelpful reply. Say so and hand off to a human instead.
  'If a function call fails, times out, or comes back with an error: never invent an answer, never guess what it would have said, and never tell the caller something was done when it was not. Apologize, collect their name and phone number, promise a call back, and call take_message with reason "callback_request".',
];
