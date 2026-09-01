# FrontDesk AI — Motion Spec

Reverse-engineered from the live header controls on `/dashboard`, plus the animation
utilities already defined in the app's stylesheet. Use this as the reference when
sourcing/adapting components (e.g. from 21st.dev) so new motion matches what's there.

---

## 0. Stack constraints (important for component sourcing)

- **No `framer-motion`, no `motion`, no GSAP on the page.** All animation is
  hand-written CSS keyframes + transitions.
- Tailwind **v4** (uses `@layer properties`, `color-mix(in oklab, …)`, CSS custom
  property color tokens like `--color-brand-400: #3ea684`, `--color-surface`, `--color-ink`).
- Theme switching = `.dark` class toggled on `<html>` (also sets `.js`).
- A full `@media (prefers-reduced-motion: reduce)` block already disables every named
  animation. **Any new component must be added to that block.**

> If you pull a 21st.dev component that depends on `framer-motion`, either (a) add the
> dependency deliberately and standardize on it, or (b) port the animation to CSS
> keyframes in the existing style. Do not end up with two motion systems by accident.

---

## 1. Theme toggle (sun ⇄ moon) — the signature interaction

### What it looks like

One 25×25 SVG holds **both** icons as stroked paths (`.sun`, `.moon`). On toggle they
swap **simultaneously**, and each does two things at once:

- the outgoing icon **shrinks to nothing from its own center** (`scale(1) → scale(0)`)
  while its stroke **un-draws itself** (retracts along the path until it's gone);
- the incoming icon **grows from a point at the center** while its stroke
  **draws itself on** like a pen following the outline.

No opacity fade, no rotation, no crossfade — it reads as one icon *retracting* and the
other *being written*. 700 ms, symmetric, standard `ease`. Slow enough to be legible,
which is the whole charm.

### Implementation

```html
<button type="button" aria-label="Switch to dark mode" aria-pressed="false" title="Dark mode"
  class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300
         bg-surface text-ink transition-colors hover:bg-gray-50
         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
  <svg width="20" height="20" viewBox="0 0 25 25" class="theme-icon" aria-hidden="true">
    <path class="sun"  pathLength="1" d="…" />
    <path class="moon" pathLength="1" d="…" />
  </svg>
</button>
```

```css
.theme-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2px;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;            /* works because pathLength="1" normalizes every path */
  transform-box: view-box;
  transform-origin: 12.5px 12.5px;/* dead center of the 25×25 viewBox */
  transition: stroke-dashoffset .7s, transform .7s;
}
.theme-icon .sun                        { stroke-dashoffset: 0;   transform: scale(1); }
.theme-icon .moon,
.theme-icon.is-dark .sun                { stroke-dashoffset: 1px; transform: scale(0); }
.theme-icon.is-dark .moon               { stroke-dashoffset: 0;   transform: scale(1); }
```

### The reusable trick

`pathLength="1"` + `stroke-dasharray: 1` + animating `stroke-dashoffset` from `1 → 0`
gives you **self-drawing line icons with no per-icon math**, regardless of the path's real
length. This is the core motif of the site — prefer it over opacity fades whenever an icon
changes state.

---

## 2. Notification bell

### What it looks like

Clicking opens the notification popover (native Popover API, see `.notif-panel`); the ring is
not a click animation. The bell **rings when there's something new**: a `.is-ringing` class is added and the bell swings from its top
hanger point in a **damped oscillation** (right, left, right, smaller each time, settling to
rest) while the outline **draws itself on**, with the **clapper drawing in second**, in the
back half of the swing. 700 ms total. It reads like a physical bell being struck.

### Implementation

```html
<button popovertarget="…" aria-expanded="false" aria-label="Notifications, 0 unread" class="…same button chrome…">
  <svg class="bell-icon" aria-hidden="true">
    <path d="…" />                 <!-- bell body -->
    <path class="clapper" d="…" /> <!-- clapper -->
  </svg>
</button>
<div popover="auto" class="notif-panel slide-in">…All · Unread tabs, rows, View all…</div>
```

```css
.bell-icon { transform-box: view-box; transform-origin: 12px 3px; } /* the hanger, not the center */
.bell-icon path {
  fill: none; stroke: currentColor; stroke-width: 2px;
  stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 1; stroke-dashoffset: 0;
}
.bell-icon.is-ringing        { animation: bell-ring .7s ease-in-out; }
.bell-icon.is-ringing path   { animation: bell-draw .7s both; }
.bell-icon.is-ringing .clapper { animation-duration: .35s; animation-delay: .35s; }

@keyframes bell-ring {
  0%{transform:rotate(0)}   15%{transform:rotate(16deg)}  30%{transform:rotate(-13deg)}
  45%{transform:rotate(10deg)} 60%{transform:rotate(-6deg)} 75%{transform:rotate(3deg)}
  100%{transform:rotate(0)}
}
@keyframes bell-draw { from { stroke-dashoffset: 1px } to { stroke-dashoffset: 0 } }
```

### Companion: unread badge

```css
.badge-pop { animation: badge-pop .5s cubic-bezier(.34,1.56,.64,1); }
@keyframes badge-pop { 0%{transform:scale(.4)} 60%{transform:scale(1.25)} 100%{transform:scale(1)} }
```

A **back-out overshoot** — the badge overshoots to 125% then settles. Used for
"a number just changed" moments.

---

## 3. Button chrome (both header buttons, and the pattern to keep)

```
inline-flex h-10 w-10 items-center justify-center rounded-xl
border border-gray-300 bg-surface text-ink
transition-colors hover:bg-gray-50
focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
```

- Hover is **colors only**, 150 ms `cubic-bezier(0.4,0,0.2,1)` (Tailwind default).
- **No scale, no lift, no press feedback** on the button itself — all the personality
  lives in the icon. Keep it that way; don't bolt hover-scale onto icon buttons.
- `rounded-xl`, 40×40 (`h-10 w-10`), 1px border, `focus-visible` ring in brand green.
- Press feedback lives in `.press` (`scale(.97)` on `:active`, 150 ms) on every `Button` /
  `LinkButton`; the two header icon buttons don't use it and shouldn't need to.

---

## 4. Existing motion vocabulary (already in the stylesheet — reuse, don't reinvent)

| Class | Effect | Timing |
|---|---|---|
| `.reveal` → `.reveal.is-visible` | scroll reveal: `opacity 0→1`, `blur(6px)→0`, `translateY(12px)→0` | `.55s cubic-bezier(.22,1,.36,1)`, stagger via `--reveal-delay` |
| `.page-enter` | route/page mount: `opacity 0→1`, `translateY(6px)→0` | `.35s cubic-bezier(.22,1,.36,1)` |
| `.slide-in` | dropdown/toast: `opacity 0→1`, `translateY(-4px)→0` | `.3s cubic-bezier(.22,1,.36,1)` |
| `.skeleton::after` | loading shimmer sweep, `translateX(-100%)→100%`, gradient via `color-mix(in oklab, var(--color-surface) 70%, transparent)` | `1.4s ease-in-out infinite` |
| `.status-dot::before` | live pulse ripple, `scale(1)→2.6`, `opacity .6→0` | `1.8s cubic-bezier(.2,.7,.3,1) infinite` |
| `.progress-fill` | onboarding bar fill, `scaleX(.05)→1` | `.55s cubic-bezier(.22,1,.36,1)` |
| `claude-pulse` | idle breathing, `opacity .6↔1` | — |
| `.nav-highlight` / `.nav-bar` | sidebar hover highlight + active bar glide to an item, **transform only** | `.3s cubic-bezier(.22,1,.36,1)` |
| `.draw-icon.is-drawing` | `<DrawIcon>` self-draws: outline `.7s`, detail paths `.35s` delayed `.35s`; row stagger via `--draw-delay` | `ease` |
| `.digit-in` | `<CountUp live>`: only changed digits blur-slide in, direction via `--digit-dir` | `.35s cubic-bezier(.22,1,.36,1)` |
| `.lift` | interactive card/row hover: `translateY(-2px)` + border color; the shadow lives on a `::after` faded via `opacity` (rule 5 — `box-shadow` itself never animates) | `.15s ease` |
| `.press` | button press: `scale(.97)` on `:active` | `.15s ease` |
| `.bar-grow` / `.bar-label` | chart bars `scaleY(0→1)` from the baseline (`transform-box: fill-box`), labels fade after; paused until the enclosing `.reveal` is visible, then delayed `--reveal-delay + 250ms + --bar-delay` (40 ms/column, 15 ms/hour bar) | `.55s cubic-bezier(.22,1,.36,1)` |
| `.notif-panel` | bell popover (native Popover API): `.slide-in` under the bell ≥ md, `sheet-in` (`translateY(16px)` + fade) as a bottom sheet < md | `.3s cubic-bezier(.22,1,.36,1)` |

### Usage counts (repo greps, 2026-08-30)

Counts are **source usages** (`git grep` in `src/`, excluding the stylesheet). Runtime counts
on a loaded dashboard read differently — skeletons are gone post-hydration, so they show as 0
there. Don't mix the two.

| Class | Source usages | Where |
|---|---|---|
| `.reveal` | 10 (+ per-row list staggers) | `<Reveal>` on dashboard sections, sidebar cards, notification rows, and now Recent calls / Callbacks owed / Today's reservations / Open takeout rows |
| `.skeleton` | 7 + dashboard & sidebar skeletons | `(app)/loading.tsx` (generic), `(app)/dashboard/loading.tsx` (dashboard-shaped), `<SidebarPanelSkeleton>` (Suspense fallback in the app layout) |
| `.lift` | 8 | `StatTile`, notification grid cards, Recent calls rows, Callbacks owed rows |
| `.status-dot` | 8 | live calls, open now, host answering, unread rows, peak hour, **closed right now**, **host not on a line yet** |
| `.press` | 3 | every `Button` / `LinkButton` |
| `.badge-pop` | 2 | bell badge, `<CountUp>` container on post-mount change |
| `.slide-in` | 2 | `Alert`, bell popover panel |
| `.page-enter` | 1 | `(app)/template.tsx` |

---

## 5. The design rules to hand to a component search

1. **Icons animate by drawing, not by fading.** `pathLength="1"` + `stroke-dasharray:1` +
   `stroke-dashoffset` transitions. Stroked line icons, `stroke-width: 2`, round caps/joins,
   `stroke: currentColor`.
2. **`transform-origin` is chosen semantically**, not defaulted: the sun/moon scale from the
   viewBox center; the bell rotates from its hanger (`12px 3px`). Always set
   `transform-box: view-box` alongside it.
3. **Two easing families, used consistently:**
   - `cubic-bezier(.22,1,.36,1)` (expo-out) → entrances, reveals, anything arriving.
   - `cubic-bezier(.34,1.56,.64,1)` (back-out) → "pops": badges, counts, confirmations.
   - Plain `ease` / `ease-in-out` → state swaps and oscillations.
4. **Duration ladder:** 150 ms hover colors · 300–350 ms entrances · 500 ms pops ·
   550 ms scroll reveals · 700 ms icon state swaps and physical motions.
5. **Only `transform`, `opacity`, `filter: blur()`, and stroke properties animate.** Nothing
   animates layout. No `width`/`height`/`top`/`left` transitions.
   - Sliding indicators (nav highlight, active bar, tab pill) **translate only**. Items are
     uniform height, so no `scaleY` — it would squash a rounded pill's corners.
   - *Pre-registered sole exception, not yet used anywhere:* collapsible content may animate
     `grid-template-rows: 0fr → 1fr`, because collapse has no transform-only solution (scaleY
     squashes the contents). It is an exception for collapse specifically, not a precedent.
   - **Entrance distortion is fine; steady-state distortion is not.** The corner objection is
     about persistent elements moving in steady state (a highlight gliding between items).
     A bar's `rx` stretching while it grows in, or a badge overshooting on a pop, is transient
     and reads as growth — don't relitigate it per component.
   - **Variable-width tab strips** (if one is ever needed): the sanctioned indicator is a 2 px
     underline animated with `translateX` + `scaleX` — a line has no corners to distort. A
     sliding *pill* across variable widths cannot be done transform-only, so it isn't done.
     Unused for now: the notification filter chips are independent toggles with a 150 ms
     color swap and nothing else (a filter toggling is minor state, not an event).
6. **Sequencing over simultaneity for compound icons** — the bell's clapper is delayed
   350 ms behind the body. Multi-part icons should stagger. `<DrawIcon>` generalizes this:
   the first path is the outline (700 ms), every later path is a detail (350 ms, delayed 350 ms).
7. **Everything is opt-out-able**: add each new animated class to the existing
   `prefers-reduced-motion: reduce` rule that sets `transition: none; animation: none`.
   **Reduced motion lands on the end state, never the hidden state.** If a class sets a
   hidden initial state (`.reveal`'s `opacity: 0`, `.bar-grow`'s `scaleY(0)`, `.digit-in`'s
   blur), the reduce block must also reset that initial state (`opacity: 1; transform: none;
   filter: none`) — `animation: none` alone would leave the element invisible. Applies to
   every entrance, present and future.
8. **Icons draw on active-state change, and on mount only in the navigation rail — never on
   hover.** The theme toggle draws because state changed; the bell draws because something
   happened. A cursor passing over the sidebar is neither, and a 700 ms redraw every time is
   exhausting. Hover stays colors-only, 150 ms. Icon hover never scales or shifts either —
   that would contradict "buttons stay inert".
   - Mount-draw is reserved for the rail (desktop sidebar, mobile tab bar): the navigation
     spine, ≥18 px, staggered via `--draw-delay` (70 ms per item). Everything else renders
     `<DrawIcon draw={false}>` and just appears: at 14–16 px a 700 ms draw reads as a glyph
     flickering in, and an icon inside a `.reveal` card would be a second entrance stacked on
     the same spot — the card's reveal already covers the icon's arrival (rule 6: sequence).
   - Non-interactive icons (stat tiles, notification rows, quick actions) are **gray**
     (`text-gray-400`). Brand green is for interactive and active-state only; saturated icons
     in the KPI row compete with the real affordances (+ Reservation, + Add, Confirm).
   - **Legibility floor: no draw animation below 18 px rendered size.** Under that, a 700 ms
     stroke draw reads as a glyph flickering in, not as drawing. Badges, chips, 14–16 px
     inline icons: never drawn, they just appear.
9. **Counters: no overshoot on a value tween — a number that reads 13 then settles to 12 is
   a data lie.** Back-out easing is for containers and badges, never for the digits
   themselves. A count-up arrives with expo-out (550 ms); a post-mount change pops the
   *container* (`.badge-pop`) and, for live values, blur-slides only the changed digits.
   Count-ups also **threshold**: below a distance of ~10 (the `threshold` prop, default 10)
   they snap and let the surrounding `.reveal` carry the value in — animating to 0 is a no-op
   with latency attached, and counting to 3 is a flicker. Known consequence: for a small
   venue the mount tween never fires anywhere on the dashboard. That is intended — the real
   payoff is `digit-in` on change. Don't invest further in the mount tween.
10. **Ripple means live or wants-you; steady state gets a steady dot.** `.status-dot` (ripple)
   goes on things that are happening now (live call, open now, host answering, unread) or
   that are actionable (host not connected yet — amber). A restaurant closed at 3 pm on a
   Sunday is the expected state, so "Closed right now" gets a plain `bg-gray-400` dot: a
   pulse there would say the opposite of what's true.
11. **Motion never claims a state the server hasn't confirmed.** Rule 9 generalized: a
   checkmark drawn while a mutation is pending is "13 settling to 12" with a verb instead of
   a number — the mutation can fail, and then we've animated a lie next to an error message.
   Pending = the label dims via opacity (allowed list), nothing more. The `.badge-pop` on the
   new status badge, rendered from the server's response, is THE success signal — one signal
   per event, never a pending animation *and* a success pop.
12. **Hover on a non-interactive surface is a false affordance.** `Card` is a `<section>`;
   it gets no hover state. `.lift` goes on things that navigate: `StatTile`, notification grid
   cards, list rows that are links.
13. **Above-the-fold initial content never enters via `opacity: 0`.** Chrome excludes
   opacity-0-at-first-paint elements from Largest Contentful Paint entirely — a hero wrapped in
   `.reveal` hands LCP to whatever tiny element never hid (measured on the landing page: the logo,
   then the eyebrow pill at 2.7s). Content in the load-time viewport enters with transform + blur
   only (`.hero-enter`); `.reveal` stays a *scroll* reveal for content below the fold, where LCP
   can't see it.

---

## 6. Component search — status per category

Searched on 21st.dev via the MCP (2026-08-30). Status: ✅ done · 🔍 to research · — n/a.

| Search | Where it goes on this dashboard | Status |
|---|---|---|
| animated number counter / count-up on mount | the four stat tiles — `<CountUp>` (port of unlumen *Count Up* #20068; changed-digit behaviour from unlumen *Animate Digits* #20071). Expo-out 550 ms mount, threshold 10, pop + digit slide on post-mount change | ✅ |
| animated sidebar nav / active indicator that slides between items | left rail — `<SidebarNav>` (port of unlumen *Animated Sidebar* #21517), fixed in place: translate-only, expo-out 300 ms, reduced-motion covered. Mobile tab bar got the same bar | ✅ |
| animated line-icon set, self-drawing SVG icons | **21st.dev has no runtime-free self-drawing icon set** (only path primitives — dqnamo *Animated Signature* #16799, pulkitxm *Line Draw SVG* #18352 — and `motion`-based icon packs). Built the house `<DrawIcon>` with inlined Lucide paths (`icon-paths.ts`, ISC notice kept). Also replaced the notification-type emoji so the inbox and the rail are one system | ✅ |
| bar chart with grow-in / staggered bars | **21st.dev has no CSS-only grow-in** (only chart libraries: visx, reaviz, Recharts wrappers; framer stats cards). In-house `.bar-grow` on the server-rendered SVG rects; stacked columns scale as a `<g>` from the baseline | ✅ (in-house) |
| notification popover | Bell is now a `<button popovertarget>` opening a **native Popover API** panel (zero deps: light-dismiss, Escape, top layer from the browser; non-modal so no focus trap owed). Shape copied from patrick-xin's *Vercel Notification Popover* (#10479, retrieved 2026-08-30): popover ≥ md / bottom sheet < md, All · Unread tabs, row hover action, View-all footer — its implementation was Radix + tailwindcss-animate, so only the shape was taken. ~8 items passed from the layout, refreshed on the 30 s poll, mark-read via the existing action | ✅ (in-house) |
| toasts | **Out of scope.** The app has no flash mechanism (actions redirect; feedback is inline `Alert`), so a toast system is app plumbing, not motion. Don't let it creep back in under a motion ticket | — |
| card hover elevation + border glow | Rejected as a category: every candidate was a pointer-tracking gradient / spotlight / 3D tilt (aceternity *Glowing Effect* #1567, *Glow Card Grid* #25283, *Spotlight Card* #2220) — a third motion idiom. `Card` stays inert (rule 12); `.lift` retuned to 150 ms with the shadow on `::after`, extended to link rows | ✅ (in-house) |
| animated success / confirm button | Checkmark morph **rejected** (rule 11 + the 18 px floor). Candidates were motion.dev *Copy Button* #24659 (pathLength check on `motion`), ddoemonn *Loading Button* #23536 (no-layout-shift label morph — the constraint kept). Ours: `useFormStatus` pending → label dims; the new status `Badge` pops (`?changed=` on the action redirect) | ✅ (in-house) |
| animated segmented control / tabs | Target was the notifications filter chips. Sliding-pill controls (ddoemonn *Segmented Control* #23552, educalvolpz *Animated Tabs* #24930, cnippet #24931) all need `width`/`scaleX` across variable-width chips — rule 5 forbids it. Chips stay independent toggles, 150 ms color swap only; the 2 px underline pattern is recorded under rule 5 for any future tab strip | ✅ (decided, no code) |
| skeleton loading cards | `(app)/dashboard/loading.tsx` mirrors the dashboard; `<SidebarPanel>` streams behind a Suspense skeleton so the shell paints before the panel's queries finish | ✅ (in-house) |
| live/pulse status indicator | "isn't on a line yet" uses `.status-dot` (amber, actionable); "Closed right now" keeps a steady gray dot (rule 10) | ✅ (in-house) |
| staggered list reveal | Recent calls, Callbacks owed, Today's reservations, Open takeout rows: `<Reveal as="li" index={i + 1}>` | ✅ (in-house) |

**Rejection criteria when reviewing candidates:** anything that fades icons instead of
drawing them; anything with bouncy spring physics on entrances (springs are reserved for
badge/count pops); anything animating layout properties; anything pulling in a motion
runtime unless that's a deliberate decision; anything without a reduced-motion path.

### Landing page pass (2026-09-01)

Searched on 21st.dev via the MCP for the `/` revamp. framer-motion was pre-approved for this pass
but not needed — every pattern ported to the house CSS (option (b) from §0), so the site still has
one motion system. New classes (`.hero-enter`, `.beam-path`, `.word-stack`, `.cd-item`, `.cd-seg`,
`.cd-chip`, `.cd-fade`, `.faq-panel`, `.faq-chevron`) are all in the reduced-motion block, landing
on end states; the `.cd-*` demo is laid out at final positions server-side (opacity/transform in
place → zero CLS, complete without JS).

| Search | Where it went | Status |
|---|---|---|
| hero + animated background beams | `<HeroBeams>` — shape of aceternity *Background Beams* #1152, redrawn as the pathLength/dashoffset motif at ambient scale (`.beam-path`); canvas versions (kokonutd #1637, easemize #25483) rejected — a second idiom. Hidden < md (crossed hero text on phones) | ✅ (in-house port) |
| chat conversation in a phone frame | `<CallDemo>` — the one paid retrieval (solaceui *Chat Messages* #20130): its util files (motion internals) weren't returned by the API, so only the shape was taken (message list, side-switching, frame, fade mask); step-rail auto-advance per ayushmxxn *Feature Section* #1368 (metadata only). Step icons redraw on activation (rule 8's sanctioned trigger, 18px) | ✅ |
| rotating word headline | `<WordCarousel>` — behavior of animbits *Word Carousel Text* #19230 as `.word-stack`: one grid cell, widest word sets the width, word placed sentence-FINAL so the reserved width reads as pill padding, frozen under reduced motion | ✅ (in-house) |
| FAQ accordion | `<Faq>` — first use of rule 5's pre-registered `grid-template-rows` collapse exception; collapse gated on `.js` (no-JS reads every answer), delayed `visibility` swap keeps closed panels out of the a11y tree. 21st.dev candidates were Radix/spring/height-animated — shape only | ✅ (in-house) |
| feature bento / steps / CTA blocks | plain Tailwind grids + existing `.reveal` and colors-only hovers; nothing pulled. CTA banner gradient + button text use brand-500/600 ONLY — the stops `.dark` doesn't remap (brand-800 flips light in dark and had inverted the banner) | ✅ (in-house) |

Verified: CLS 0 in 6 viewport/theme/motion configs (loop + scroll pass), LCP 52–96ms unthrottled
(rule 13 came from this pass), Lighthouse on the build 98/100/100/100, no-JS and reduced-motion
complete, goldens byte-identical.
