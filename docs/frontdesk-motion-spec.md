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
   550 ms scroll reveals · 700 ms icon state swaps and physical motions · 500 ms hero-sequence
   moves (two 250 ms beats each, so at most two are ever in motion — pass 8).
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
14. **An entrance's settle window governs content, not codas.** Everything a visitor reads or clicks
   in the hero has landed by ~2.2 s on the sequence clock (pass 8: the phone lands at 2150). Ambient
   and coda motion — the scroll cue, the pill's word rotation — is deliberately post-settle, so it
   never competes with content arriving and never counts against the window. The cue itself is the
   page's one deliberate scroll cue: the hero claims the whole first viewport (pass 6), so a quiet
   arrow at its bottom edge is the recorded exception to the no-scroll-cue default — the user's call,
   2026-09-02.

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

### Landing page pass 2 (2026-09-01) — professions switcher + day timeline

The `/` professions and features sections redone. framer-motion again pre-approved, again not
needed — both patterns ported to the house system, one motion system stands. New classes
(`.pv-rail`, `.pv-pill`, `.pv-underline`, `.pv-stage`/`.pv-panel`, `.day-track`, `.day-fill`) are
all in the reduced-motion block, landing on end states; hidden initial states gated on `.js`
(no-JS reads all ten profession panels stacked and the timeline complete, trackless).

| Search | Where it went | Status |
|---|---|---|
| scroll-driven timeline | `<DayTimeline>` — shape of aceternity *Timeline* #857 (the one paid retrieval): static track + advancing fill, first-node-center → last-node-center geometry. Its framer `useScroll` height scrub replaced by IntersectionObserver activations driving settled 550ms `scaleY` fills on `--day-progress` (rule 5: transform only; "draws once", never rewound). Node icons `<DrawIcon>`-draw on activation (rule 8, 18px) | ✅ (in-house port) |
| segmented control / animated tabs | `<ProfessionSwitcher>` rail — no retrieval: rule 5 already records both sanctioned indicators. ≥ lg a full pill translates over uniform h-11 items (the sidebar `.nav-bar` idiom); < lg the 2px underline (`translateX` + `scaleX`) rides the rail hairline. Candidates (educalvolpz #24930, cnippet #24956, ddoemonn #23552) all slide pills across variable widths — rejected again | ✅ (in-house) |
| text/content crossfade | `.pv-panel` stage — shape of ibelick *Transition Panel* #1649 (metadata only): all panels server-rendered into one grid cell (tallest sets height → zero layout shift), opacity+blur crossfade 350ms, user-triggered only, no timers | ✅ (in-house) |

### Landing page pass 3 (2026-09-01) — call anatomy + visible FAQ

"How it works" is now `<CallAnatomy>` (one plumbing call as an annotated script: gutter numerals,
speaker labels, margin notes; the greeting, the confirmation text and the notification title are
the real templates via `voice-data.ts`) and "Questions, answered" is `<Questions>` (six answers
fully visible, a sticky index ≥ lg, FAQPage JSON-LD built from the same list). Both are server
components with **no motion at all** — the page's motion budget went to the day timeline, and
nothing here needs to move. The FAQ accordion (`<Faq>`, `.faq-panel`, `.faq-chevron`) was retired
with it, so rule 5's pre-registered `grid-template-rows` collapse exception is **unused again**.
21st.dev was searched (annotated-transcript, editorial FAQ, numbered process); the catalog's FAQ
family is accordion-shaped and its process sections are numbered cards — both are exactly what the
brief left behind, so nothing was retrieved.

### Landing page pass 4 (2026-09-01) — the two sections designed

Form pass on pass 3's content (every verified word kept). "How it works" is now a transcript
surface with two voices (receptionist flush in ink under a brand name, caller indented and lighter),
margin notes anchored by a shared numeral and a brand-200 rule, and ONE user-triggered motion
moment: "Play the call" (`.ca-*`) holds lines and beats at opacity 0 and lets them arrive with the
house entrance as the play position passes them, each note lighting 250 ms after its beat's first
line. Nothing moves on scroll. "Questions, answered" is a full-width grid (sticky index ≥ lg with a
translate-only marker `.qi-bar`, question + short answer left, elaboration right) with functional
motion only: an IntersectionObserver scrollspy (shape from 21st.dev ddoemonn *Scroll Spy* #23554,
the second retrieval of the day — its scroll listener was NOT kept), smooth anchor scrolls from the
index (`auto` under reduced motion), and a below-lg fold on each elaboration (`.fold`, the
grid-template-rows exception, back in use; the short answer stays visible). Reduced motion: no play
control, instant fold, instant marker. No-JS: control hidden, folds open, index = plain anchors.
Measured at 1440×900: "How it works" 1074 px, FAQ 1156 px (brief: ≤ 1.5 viewports = 1350 px).

### Landing page pass 5 (2026-09-01) — the FAQ becomes an accordion

"Questions, answered" is now a single-column accordion (`<Questions>`): one row per question
showing the question and its short answer, elaboration folded beneath, all collapsed by default at
every width, rows independent. The index and scrollspy are gone. Motion is the expansion only:
`.fold` (the grid-template-rows exception) with the paragraph fading in, and `.fold-arrow` turning
180° (transform only) while its `<DrawIcon name="arrow-down">` redraws on every toggle — the
profession rail's idiom (rule 8: draw on an active-state change, never on mount; keyed on a
per-row toggle count so the draw restarts; 18px, the floor). Reduced motion toggles instantly with
the arrow fully drawn. Collapsed panels stay in the DOM (crawlable, FAQPage JSON-LD unchanged) and
leave the accessibility tree via the delayed visibility swap; headers are real buttons with
aria-expanded/aria-controls, a visible focus ring, and Up/Down/Home/End. An `arrow-down` glyph
joined `icon-paths.ts`. 21st.dev: the plus/minus accordion
family (cnippet #24907, ddoemonn #23530, coss #11312) was the shape; retrievals were exhausted for
the day, and those are Base UI / spring-height builds anyway, so the pattern was built in-house.

### Landing page pass 6 (2026-09-01) — the hero owns the first screen

Layout only; palette, copy and components unchanged. The hero section is `.hero-fill`
(`min-height: calc(100svh - 4.625rem)`, the header's intrinsic height in rem; min-, never fixed) and
a flex column whose grid centers itself with `my-auto`; columns top-align so the demo sits level
with the headline block. The call demo's conversation now lives in a fixed-height window
(`.cd-window`, 15rem under `.js`, auto without JS) and the list translates up (`--cd-scroll`, set by
the component from measured line bottoms; 550 ms expo-out, `transition: none` while the demo is
faded out for its reset) so the newest lines always fill the frame and the frame's height never
changes while it plays (measured 466 px → 466 px mid-loop). Reduced motion parks the window on the
end of the exchange. The step rail is tucked to the frame (mt-3). A quiet scroll cue (`.hero-cue`,
a 6 px translateY bob, static under reduce, lg and up only) sits at the bottom edge, the one
sanctioned scroll cue on the page because the section now claims the whole first screen. Measured:
hero bottom = viewport bottom at 2560×1440, 1920×1080, 1440×900 and 1440×800; professions heading
below the fold at all four; nothing clipped at 800 tall.

### Landing page pass 7 (2026-09-01) — hero entrance and conversation, final

*The timing in this section is historical: pass 8 (below) rebuilt every beat around one principle
and moved the numbers into `src/lib/motion.ts`. The moves, the guards and the LCP trade stand.*

The phone holds the whole exchange again: the frame is sized by the full seven-line list from
first paint and bubbles fade into reserved space (the pass-6 scroll window is gone). The demo plays
ONCE per page load and holds — no loop, no reset, no IntersectionObserver start/stop; the strip's
nodes light as their beats land. The entrance is one CSS-timed sequence, `.hero-seq` with `--seq`
delays: 350 ms of composed background, then headline block 350, subhead 500, CTAs + check-row 650,
phone 800, cue 2200; conversation from ~1.3 s at 1.4 s a line. Gated on `.js`, opacity/transform
only, `both` fill, so no flash-then-restart and zero layout shift (CLS 0 measured across four
viewports × two motion modes). **Rule 13 re-measured and confirmed:** the headline block entering
from opacity 0 handed LCP to the logo image (~200 ms) in Chromium; it now uses `.hero-seq-lcp`
(translateY + blur 8px, never opacity) and LCP is the H1 at 150–210 ms in both modes. Reduced
motion: the finished hero, immediately, conversation complete. Fit: hero bottom = fold at
2560×1440, 1920×1080 and 1440×800; every line unclipped at 14 px (14.875 px at 3xl); scroll away
and back holds 7/7 lines.

Follow-up (same day, "text gets blurred then loads in later"): the headline's blurred stillness beat
read as text loading late, so `.hero-seq-lcp` is now transform-only (an 8 px lift at 400 ms, never
blur, never opacity) — the headline is legible from the first styled frame. Delays widened (subhead
550, CTAs 700, phone 900, cue 2300, 600 ms each) and the conversation's first line is anchored to
the page clock (`performance.now()`, 1.8 s after navigation, at least 300 ms after mount) so it can
never land in a frame still fading in. Reload repro (3 loads, 40 ms samples): stylesheet and `.js`
applied by ~100 ms, animations start at ~90–145 ms, no console errors, LCP = H1, CLS 0.

Second follow-up ("the headline has no animation"): an 8 px lift is not read as an entrance, so
a masked rise was tried (block translated 108 % below an overflow-hidden wrapper, sliding up) —
**measured: a clipped headline is excluded from LCP exactly like an opacity-0 one** (LCP → logo IMG
at 130–190 ms in every motion-mode run). Rule 13 therefore generalizes: the LCP element must be
painted AND unclipped at first paint; opacity, blur-to-invisible and clip masks all hand LCP to the
next-largest element. The headline now rises 40 px into place over 700 ms at 400 ms — a visible
entrance while it stays legible. The alternative (headline hidden during the stillness beat, LCP
reported as the logo at ~200 ms) is the user's call, not a default.

**Decision (2026-09-01, the user's call): the left group slides in from behind a clip edge.** The
pill, headline line one and headline line two are separate `.hero-slide` elements inside an
`overflow-x: clip` wrapper, each at `translateX(-110%)` from first paint and sliding along the
reading direction on its beat (400 / 520 / 640 ms, 450 ms each, settled by ~1.1 s). Transform only,
clip horizontal only (descenders safe), reduced motion lands everything in place instantly. The
pill's word carousel holds its first rotation until the pill has landed (page clock, ≥ 1.2 s) and
never rotates under reduced motion. **Deliberate LCP trade, measured:** with the headline hidden at
first paint Chromium credits LCP to the logo image at 128–176 ms (reduced motion: the subhead at
144–188 ms, since the headline is now two smaller blocks). CLS 0 across four viewports × two
motion modes; no console errors across three reloads. Rule 13 stands as the default; this hero is
its recorded exception.

Honesty plumbing worth keeping: panel content renders from the vertical registry via
`voice-data.ts` (nouns, intake-schema keys, emergency labels, the greeting and cancellationReply
templates split over a `\u0000` business-name sentinel so the slot stays visible). Known template
bug surfaced by this pass, NOT fixed (SMS goldens): field-service `cancellationReply` says
"a ${staff}", which renders "a engineer" / "a electrician" for vowel-initial staff nouns.

### Landing page pass 8 (2026-09-02) — the hero entrance re-choreographed

Timing only. Every element and every move of pass 7 stands — the left group slides in from the clip
edge, the blocks rise 10 px with opacity, the phone plays once and holds, the cue bobs — and the LCP
trade is unchanged. What was rebuilt is *when* things happen, around one principle, and where that
is written down.

**Principle: one thing moves at a time.** An element (or a tight group: the CTAs with their
check-row; a strip node with its connector and colour swap) begins only once the previous one is at
least three-quarters home. Starts are 250 ms apart — 300 before the subhead, which must not begin
until headline line two has essentially landed — and every move runs 500 ms, exactly two gaps, so at
most two things are ever in motion and the eye can follow the sequence element by element. Every
move keeps the house expo-out (rule 3): 76 % home at a quarter of its duration, 96 % at half, 98 %
at 60 % — fast arrival, soft landing, no bounce. Reading order is strict: pill → headline line one →
line two → subhead → CTAs with the check-row → phone frame → conversation → step-strip lighting on
its own beats → scroll cue. Pass 7 had the subhead (550) starting before headline line one (520)
had landed, starts 30–150 ms apart, and five things moving at once between 700 and 970 ms; that
inversion and that clump are gone.

**One timing map.** `HERO_TIMING` in `src/lib/motion.ts` holds every beat time and duration,
named. The page hands each block its start and duration as `--seq` / `--dur` (`beatVars()`),
`.hero-seq` and `.hero-slide` read `var(--dur)`, `<CallDemo>` and `<WordCarousel>` import the same
object, and the demo passes `--cd-bubble` / `--cd-segment` to the stylesheet. The next adjustment is
numbers in that one file, not archaeology.

**The sequence clock.** Beats count from the first styled frame — the moment the browser creates the
hero's CSS animations (their shared `startTime`), ~100 ms after navigation in production, 170–300 ms
on the dev server. The JS-timed beats (the conversation, the pill's word rotation) read that clock
through `sequenceOrigin()` — the `startTime` of the nearest sequenced ancestor's animation — so the
phone → conversation gap is the same whatever the stylesheet's arrival time. (Pass 7 anchored the
conversation to navigation, so that gap drifted by the stylesheet's latency.) If hydration is later
than the first line's beat, the call still starts `minStart` after mount, never earlier.

| # | Element | Move | Starts | Runs | Lands | Also in motion |
|---|---|---|---|---|---|---|
| — | stillness | composed background, beams | 0 | 350 | — | — |
| 1 | pill | slide from the clip edge | 350 | 500 | 850 | — |
| 2 | headline line one | slide | 600 | 500 | 1100 | pill (96 % home) |
| 3 | headline line two | slide | 850 | 500 | 1350 | line one |
| 4 | subhead | rise + fade | 1150 | 500 | 1650 | line two (98 % home) |
| 5 | CTAs + check-row | rise + fade | 1400 | 500 | 1900 | subhead |
| 6 | phone frame | rise + fade | 1650 | 500 | 2150 | CTAs — **the page is settled**, bar the conversation |
| 7 | bubble 1 (the greeting) | `cd-in` | 1900 | 350 | 2250 | phone |
| 8 | strip: Answered | node draw 700 + colour swap | 2150 | 700 | 2850 | bubble |
| 9 | scroll cue | rise + fade, then the bob | 2400 | 500 | 2900 | strip — post-settle by design (rule 14) |
| — | word rotation 1 | blur-slide | 2900 | 350 | 3250 | — (then every 2800: two conversation beats, in the quiet half of a beat) |
| — | bubble *n* | `cd-in` | 1900 + 1400 (*n* − 1) | 350 | | its strip node lights +250 (fill 550 + draw 700) |
| — | chips | `badge-pop` | 900 apart after line 7 | 500 | | the last node lights +250 after line 7 |

```
beat                                    0    250  500  750  1000 1250 1500 1750 2000 2250 2500 2750 3000 3250 3500 3750 4000 4250
stillness (background, beams)           ░░░░░░░   ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·
pill                                    ·    · ██████████   ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·
headline line one                       ·    ·    · ██████████   ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·
headline line two                       ·    ·    ·    · ██████████   ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·
subhead                                 ·    ·    ·    ·    ·  ██████████  ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·
CTAs + check-row                        ·    ·    ·    ·    ·    ·  ██████████  ·    ·    ·    ·    ·    ·    ·    ·    ·    ·
phone frame                             ·    ·    ·    ·    ·    ·    ·  ██████████  ·    ·    ·    ·    ·    ·    ·    ·    ·
bubble 1 (greeting)                     ·    ·    ·    ·    ·    ·    ·    ·  ███████·    ·    ·    ·    ·    ·    ·    ·    ·
strip: Answered (draw 700)              ·    ·    ·    ·    ·    ·    ·    ·    ·  ██████████████   ·    ·    ·    ·    ·    ·
scroll cue                              ·    ·    ·    ·    ·    ·    ·    ·    ·    ·  ██████████  ·    ·    ·    ·    ·    ·
word rotation 1                         ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·  ███████·    ·    ·    ·    ·
bubble 2                                ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·███████  ·    ·    ·
strip: Qualified (fill 550 + draw 700)  ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·    ·██████████████·
(one cell = 50 ms; never more than two rows filled in any column)
```

**Measured (dev server, 2560×1440, sequence clock; `scratchpad/hero-frames.js`: CDP screencast +
`document.getAnimations()`):** the CSS beats start on the map to the millisecond; the JS beats land
17–34 ms late (timer slop) and the strip a further ~50 ms (React commit). Maximum things in motion 2
(pass 7: 5). Frames at 200 ms show one element mid-flight and at most one settling. LCP: the logo
IMG at 132–212 ms in motion mode (the recorded trade), the subhead at 144–200 ms under reduced
motion; CLS 0 at 2560×1440, 1920×1080, 1440×900, 1440×800 and 390×844 in both modes; 7/7 lines,
3/3 chips and 4/4 nodes at the end everywhere; scroll away and back holds. The headline text is in
the server HTML and the `.js` gating is unchanged, so nothing flashes and restarts. Reduced motion:
the finished hero from the first frame, the step strip included — the server renders the nodes unlit
(it cannot know the preference) and JS lit them at hydration, which read as a 150 ms colour swap
~270 ms in; the reduce block now paints `.cd-node` / `.cd-label` in the strip's "done" colours with no
transition, so the hydration swap changes nothing visible (rule 7; measured: 4/4 nodes and labels lit
at the first styled frame, before hydration, and zero transitions in the hero — the five colour
transitions that remain at hydration belong to the day timeline's nodes below the fold: the same
pattern, not touched here).

**Decisions (2026-09-02, the user's call).** The settle window governs *content*: everything a
visitor reads or clicks has landed at 2150 ms, when the phone lands. The scroll cue is last in the
reading order, after the conversation's first line and the strip's first node, and lands at
2900 ms — deliberately post-settle (rule 14), not a miss. It stays: the hero claims the whole first
viewport, so the quiet arrow at its bottom edge is the page's one deliberate exception to the
no-scroll-cue default.

**Follow-ups (same day, the user's call).** Three fixes on top of the above. *The day timeline's
nodes* get the strip's treatment: the reduce block paints `.day-node` lit with no transition, so the
five colour transitions that used to run at hydration under reduced motion are gone and the section
is complete from the first styled frame. *The strip's nodes default lit without JavaScript*: the page
without JS is the finished hero — every bubble and chip visible, and the connectors already full,
since their `scaleX(0)` is `.js`-gated — so gray nodes beside full connectors were the one thing
claiming a call still in progress. The gray start now belongs to `.js` (`html:not(.js) .cd-node` paints
the finished look). *The first outcome chip stops inventing UI copy*: it read "Booked — today,
2–4 PM", but the app's badge is `humanize(job.status)` → "Scheduled" (there is no "Booked" status) and
`formatDateTime` renders a start time, never a window — a 2-to-4 window is one 120-minute slot
(`Account.jobSlotMinutes` defaults to 120), real in the data but on no screen. The chip is now
"Scheduled · 2:00 PM", separator included (the app joins notification bodies with " · "). The other
two chips quote nothing, so they stand. **The two remaining em-dashes are spoken dialogue** — "Thanks
for calling — how can I help?" and "Okay — today between 2 and 4 is open." — and stay: a bubble is
speech, not an artifact.

**Copy (same day).** The pill and the subhead end their sentences with periods instead of em-dashes:
"Ten professions. Built for HVAC." — each rotating word carries its own period, so the sentence
closes right after the word and the reserved width still reads as pill padding — and "…your business
line 24/7. It books the work…". The pill stays on one line with the longest label in place at every
measured width (see the verification numbers in the pass-8 report).
