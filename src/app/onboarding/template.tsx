/** Re-mounts on every step, so each step fades in like an app page (see .page-enter in globals.css). */
export default function OnboardingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
