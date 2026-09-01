/**
 * Owner-defined emergencies, stored in `Account.emergencyTypes` beside the vertical's built-in
 * keys as "custom:<slug>". No schema change: the column is already a string list, and the prefix
 * keeps a custom entry from ever colliding with a real key ("custom:" contains a colon, which the
 * slugs never do).
 */

export const CUSTOM_EMERGENCY_PREFIX = "custom:";

export const isCustomEmergency = (key: string): boolean => key.startsWith(CUSTOM_EMERGENCY_PREFIX);

/** "custom:burst_sprinkler" -> "burst_sprinkler" — the value the agent's tool enum carries. */
export const customEmergencySlug = (key: string): string => key.slice(CUSTOM_EMERGENCY_PREFIX.length);

/** "custom:burst_sprinkler" -> "burst sprinkler" — what the prompt and the form show. */
export const customEmergencyLabel = (key: string): string => customEmergencySlug(key).replace(/_/g, " ");

/** "Burst sprinkler!" -> "custom:burst_sprinkler"; null when nothing usable is left. */
export function customEmergencyKey(label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug ? CUSTOM_EMERGENCY_PREFIX + slug : null;
}
