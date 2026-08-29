/** Re-mounts on every navigation, so each page fades in (see .page-enter in globals.css). */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
