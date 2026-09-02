/** Join class names, dropping the falsy ones. Shared by the server UI kit and the client motion pieces. */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
