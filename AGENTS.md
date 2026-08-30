<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FrontDesk AI conventions

- **Motion:** every animation follows `docs/frontdesk-motion-spec.md` — read §5 (the rules) before adding or changing any transition, keyframe, or animated component. No motion runtime (no framer-motion / motion / GSAP); hand-written CSS on Tailwind v4, every new animated class added to the `prefers-reduced-motion` block, icons draw (never fade) via `<DrawIcon>`.
- **Dependencies:** ask before adding anything outside Next + React + Prisma + Tailwind + the official `stripe` SDK (approved 2026-08-30: payments code must not be bespoke). No realtime/push — polling only.
- **Theme:** `.dark` on `<html>`; use the color tokens (`--color-brand-*`, `--color-surface`, `--color-ink`, `--color-gray-*`), never hardcoded hex.
- **Reads never write:** GETs, polls, and server-component renders never mutate state; `readAt` changes only via explicit actions (mark read / mark all / acknowledge / open). Enforced by `tests/notifications-poll.test.mjs` (`npm test`, needs a running server + a seeded unread). There is no CI on purpose — if CI ever arrives, that test is its first job.
