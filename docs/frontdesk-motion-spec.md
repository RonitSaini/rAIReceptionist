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
<div popover="auto" class="notif-panel">…All · Unread tabs, rows, View all…</div>  <!-- enters/leaves via its own transitions since §7 -->
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
| `.reveal` → `.reveal.is-visible` | scroll reveal: `opacity 0→1`, `blur(6px)→0`, `translateY(12px)→0`; the class holds the end state, the keyframe only the start (`backwards`), so a settled element's transform is `none` | `.55s cubic-bezier(.22,1,.36,1)`, stagger via `--reveal-delay` |
| `.page-enter` | route/page mount: `opacity 0→1`, `translateY(4px)→0`, ends on `transform: none` | `var(--m-standard)` (480 ms since the 1.6× pick; was 220) `var(--m-ease)` — retuned §7 |
| `.slide-in` | dropdown/toast: `opacity 0→1`, `translateY(-4px)→0` | `.3s cubic-bezier(.22,1,.36,1)` |
| `.skeleton::after` | loading shimmer sweep, `translateX(-100%)→100%`, gradient via `color-mix(in oklab, var(--color-surface) 70%, transparent)` | `1.4s ease-in-out infinite` |
| `.status-dot::before` | live pulse ripple, `scale(1)→2.6`, `opacity .6→0` | `1.8s cubic-bezier(.2,.7,.3,1) infinite` |
| `.progress-fill` | onboarding bar travels from the previous step's width: `scaleX(var(--progress-from))→1` | `var(--m-slow)` (720 ms since the 1.6× pick; was 300) — retuned §7 |
| `claude-pulse` | idle breathing, `opacity .6↔1` | — |
| `.nav-highlight` / `.nav-bar` | sidebar hover highlight + active bar glide to an item, **transform only** | `.3s cubic-bezier(.22,1,.36,1)` |
| `.draw-icon.is-drawing` | `<DrawIcon>` self-draws: outline `.7s`, detail paths `.35s` delayed `.35s`; row stagger via `--draw-delay` | `ease` |
| `.digit-in` | `<CountUp live>`: only changed digits blur-slide in, direction via `--digit-dir` | `.35s cubic-bezier(.22,1,.36,1)` |
| `.lift` | interactive card/row hover: `translateY(-2px)` + border color; the shadow lives on a `::after` faded via `opacity` (rule 5 — `box-shadow` itself never animates) | `.15s ease` |
| `.press` / `.press-soft` | press: `translateY(1px) scale(.97)` (`.99` for rows, chips, labels) on `:active`, 60 ms down | `var(--m-fast)` back, `var(--m-ease)` — §7 |
| `.bar-grow` / `.bar-label` | chart bars `scaleY(0→1)` from the baseline (`transform-box: fill-box`), labels fade after; paused until the enclosing `.reveal` is visible, then delayed `--reveal-delay + 250ms + --bar-delay` (40 ms/column, 15 ms/hour bar) | `.55s cubic-bezier(.22,1,.36,1)` |
| `.notif-panel` | bell popover (native Popover API): transitions on `:popover-open` with `@starting-style` + `allow-discrete`, so it enters from its origin (top-right under the bell; the bottom edge as a sheet < md) and leaves the same way, faster | enter `var(--m-standard)` / `var(--m-slow)` sheet, exit `var(--m-exit)` / `var(--m-exit-slow)` — §7 |

### Usage counts (repo greps, 2026-08-30)

Counts are **source usages** (`git grep` in `src/`, excluding the stylesheet). Runtime counts
on a loaded dashboard read differently — skeletons are gone post-hydration, so they show as 0
there. Don't mix the two.

| Class | Source usages | Where |
|---|---|---|
| `.reveal` | 10 (+ per-row list staggers) | `<Reveal>` on dashboard sections, sidebar cards, notification rows, and now Recent calls / Callbacks owed / Today's reservations / Open takeout rows |
| `.skeleton` | 7 + dashboard & sidebar skeletons | `(app)/(lists)/loading.tsx` (generic), `(app)/(lists)/dashboard/loading.tsx` (dashboard-shaped), `<SidebarPanelSkeleton>` (Suspense fallback in the app layout) |
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
   moves (two 250 ms beats each, so at most two are ever in motion — pass 8). **This ladder is for
   arrivals and signatures. What answers a click lives on the interaction ladder (§7): 150 / 480 /
   720 ms since the §9 rebalance and the owner's 1.6× pick (was 150 / 220 / 300), exits about two thirds, one ease.**
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
     sliding *pill* across variable widths cannot be done transform-only **in one piece** — so
     since 2026-09-02 it is done in three (§7 rule 19, `<SegmentedLinks>`): two round caps that
     translate and a 1 px body that scales between them, overlapping, so no corner ever scales.
     The filter strips (settings tabs, jobs, work orders, notifications, takeout, calls) use it;
     "Unread only" stays an independent toggle with a 150 ms color swap.
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
| toasts | Was out of scope (no flash mechanism). **Brought in by the 2026-09-02 interaction brief**, still without plumbing: `<Toast>` is rendered by the form that received the result (`FormFooter`), for a success sentence that says more than "Saved."; errors stay inline (§7 rule 21) | ✅ (in-house) |
| card hover elevation + border glow | Rejected as a category: every candidate was a pointer-tracking gradient / spotlight / 3D tilt (aceternity *Glowing Effect* #1567, *Glow Card Grid* #25283, *Spotlight Card* #2220) — a third motion idiom. `Card` stays inert (rule 12); `.lift` retuned to 150 ms with the shadow on `::after`, extended to link rows | ✅ (in-house) |
| animated success / confirm button | Checkmark morph **rejected** (rule 11 + the 18 px floor). Candidates were motion.dev *Copy Button* #24659 (pathLength check on `motion`), ddoemonn *Loading Button* #23536 (no-layout-shift label morph — the constraint kept). Ours: `useFormStatus` pending → label dims; the new status `Badge` pops (`?changed=` on the action redirect) | ✅ (in-house) |
| animated segmented control / tabs | Sliding-pill controls (ddoemonn *Segmented Control* #23552, educalvolpz *Animated Tabs* #24930, cnippet #24931) all need `width`/`scaleX` across variable-width chips. **Built in-house 2026-09-02 as a three-piece pill** (`<SegmentedLinks>`, §7 rule 19): caps translate, the body scales, transform-only. Every filter/tab strip uses it | ✅ (in-house) |
| skeleton loading cards | `(app)/(lists)/dashboard/loading.tsx` mirrors the dashboard; `<SidebarPanel>` streams behind a Suspense skeleton so the shell paints before the panel's queries finish | ✅ (in-house) |
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

---

## 7. Interaction vocabulary — the app's answer to every click (2026-09-02)

Design read (taste-skill process; the skill itself declares product UI out of its scope in its §13, so only
its motion rules were applied — motivated motion, transform/opacity only, reduced motion, tactile press):
*product UI for owner-operators on phones; every animation is user- or data-triggered; zero scroll theater
and zero entrance choreography are added inside the app.* framer-motion was pre-approved for a third time
and again not needed: one motion system, hand-written CSS plus four small client leaves.

### 7.1 The vocabulary

Constants: `INTERACTION` in `src/lib/motion.ts`. Tokens: `--m-*` on `:root` in `globals.css`. The two are
the same table and `tests/motion-vocabulary.test.mjs` fails if they drift. One ease for everything on this
ladder — the house expo-out, `cubic-bezier(.22,1,.36,1)` — exits included: an exit is the same curve run
shorter, so what leaves is out of the way before what replaces it has landed.

| Step | Entrance | Exit | Used for |
|---|---|---|---|
| **fast** | 150 ms (down-stroke 60 ms) — **clamped, never scaled** | 100 ms | presses, toggles' track colour, hover/colour swaps, chip text, validation errors, the tick's leaving digit; **everything on an urgent row** |
| **standard** | 480 ms (300 at the §9 rebalance, ×1.6 baked; 220 before) | 320 ms | tab/segment indicator, disclosures opening, menus/popovers, toasts, rows arriving and sliding, badge crossfades, fetched content fading in, the page transition, guided groups |
| **slow** | 720 ms (450 at the §9 rebalance, ×1.6 baked; 300 before) | 480 ms | the ceiling: the bottom sheet, the onboarding progress bar's one-step travel, the saved check drawing |
| *toggle* | 220 ms — **clamped** (`--m-toggle`) | — | the toggle thumb's travel only: a toggle answers a flick at the same speed at every scale |

Since 2026-09-02 every standard/slow/exit/stagger/cascade token is its `*-base` times `--m-scale` (§9): the numbers
above are the bases and what ships; the scale is a comparison multiplier that returns to 1 (the knob used for the pick is gone, 9.3).

Holds (JS, same file): a success toast holds 4 s; the "Saved" check holds 2 s before the verb returns.

### 7.2 What the vocabulary does, where

| Interaction | Mechanism | Class / component |
|---|---|---|
| Button, control press | `translateY(1px) scale(.97)` on `:active`, 60 ms down, 150 ms back; rows/chips/labels use `scale(.99)`; lifted tiles press by adoption | `.press`, `.press-soft`, `.lift:active` |
| Toggle | track colour at fast, thumb travels in `--m-toggle` (220 ms, clamped — never scaled), thumb stretches toward its destination while held (`scale`, origin follows the direction) | `.switch` on `<Toggle>` |
| Tabs / segmented filters | one indicator slides to the picked pill: two round caps translate, a 1 px body scales between them (rule 5 amended below); text colour swaps at fast; click moves it before the navigation lands | `<SegmentedLinks>`, `.seg-*` |
| Accordions / disclosure | the fold (grid-rows exception) opens at standard, closes at exit; content mounted only while open or leaving | `<Disclosure>`, `.fold-app` |
| Popover / bottom sheet | enters from its origin (top-right under the bell, bottom edge as a sheet) and leaves the same way, faster; `@starting-style` + `allow-discrete`, so the exit animates too | `.notif-panel` |
| Menus (address suggestions) | grows down from the input at standard, shrinks back at exit | `<Presence>` + `.menu-in` / `.menu-out` |
| Toasts | rise from the bottom edge (above the tab bar on a phone, bottom-right on desktop), hold 4 s, drop faster; portalled to `<body>`; `role=status` | `<Toast>` |
| Rows (add / remove / reorder) | keys diffed after every commit: a new row fades up 4 px; a removed row is kept (its detached node, pinned out of flow to the rect it held) for a fade-and-settle; rows that moved slide from their old offset (FLIP, inline transform) | `<MotionList>`, `.row-enter`, `.row-exit` |
| Status badge change in place | old badge fades out on top (exit) while the new one, already holding the layout, fades in (standard) | `<Badge>` (now a client leaf), `.badge-swap` |
| Bell count | digits tick like an odometer wheel — old rolls out the top, new rolls in from the bottom, reversed when the count fell; the pop on the container stays | `<Tick>`, `.tick-*` |
| Form save | pending = "Saving…" and the disabled fill (text, not motion); saved = a check draws (`slow`, 720 ms since the 1.6× pick) beside "Saved" for 2 s, only after the server answered; a message that says more than "Saved." rises as a toast; errors stay inline | `<FormFooter>`, `.draw-fast`, `.saved-in` |
| Loading | control-shaped skeleton while the reservation slots fetch, then the control fades in; the voice catalogue fades in when it lands | `.skeleton`, `.content-in` |
| Page to page | the new page fades up 4 px at standard, starting after the route has changed (never before); onboarding steps arrive guided and along the corridor instead (§8) | `.page-enter` |
| Onboarding progress | the bar travels from the previous step's width to this one's (`--progress-fwd`) at slow, and back down from the next step's (`--progress-back`) when the owner goes Back (§8.3) | `.progress-fill` |

### 7.3 Adoption: inherited vs wired locally

**By inheritance (no page edits):** every `Button` / `LinkButton` (41 + 21 sites), every `PendingButton`
and `StatusButtons` (9 mount sites), every `Toggle` (7) and `Checkbox` (2), every `Badge` (39 sites
crossfade on in-place change), every `.lift` tile and row (press), every `FormFooter` form (19 settings
and onboarding forms: pending, saved check, toast), the bell popover, the page transition, the onboarding
progress bar.

**Wired locally (one line each, listed so nothing is hidden):** the seven filter/tab strips became
`<SegmentedLinks>` (settings, jobs, work orders, notifications, takeout, calls); nine lists became
`<MotionList>` (dispatch queue, notifications page, bell rows, work orders, properties + units, vendors,
hours periods, menu items, services, custom emergencies); three disclosures became `<Disclosure>`
(delete-account confirmation, a closed day's hours, menu item details, the voice browser); the address
listbox got `<Presence>`; the reservation form's slot control got the skeleton; 25 raw `<button>`s and
links got `.press` / `.press-soft` by hand (they never went through `Button`); dispatch, work-order and
notification rows declare `data-urgent`.

### 7.4 Rules added (continuing §5)

15. **One ease on the interaction ladder, exits shorter.** Entrances and exits share the decelerating
    curve; an exit is about two thirds of its entrance. Back-out (pops) and plain ease (oscillations)
    stay reserved for arrivals and signatures (§5 rule 3); nothing that answers a click overshoots.
16. **Nothing blocks input, delays a click's effect, or masks latency.** The press registers in 60 ms;
    the segment indicator moves on `click`, before navigation; a row's exit plays on top of a layout
    React has already committed; a toast never gates the form. Pending is shown by text and a dimmed
    fill, never by a spinner, and never claims success (rule 11 holds).
17. **Urgent surfaces take only the quiet end.** Dispatch-queue urgency (stale, unreachable, emergency),
    EMERGENCY badges, unacknowledged escalations and "caller not notified" rows are `data-urgent`: they
    arrive instantly (an alarm does not fade in), their badge crossfade and exit run at the fast step,
    and they gain nothing else. Their existing signal is colour; motion must not dilute it.
18. **Reduced motion is the complete state, at once.** Every §7 class is in the reduce block; leaving
    things are simply gone (`display: none` on `.row-exit`, `.badge-out`, `.tick-out`, `.menu-out`,
    `.toast.is-leaving`), arriving things are simply there, and pending / saved / toast still read by
    non-motion means. The JS leaves check `prefersReducedMotion()` before keeping anything around.
19. **Rule 5, amended — a pill can slide across variable widths if it is not one piece.** Two round caps
    that translate plus a 1 px body that scales, overlapping by half a cap: transform-only, no corner
    ever scales. The 2 px underline remains the alternative for strips without a fill.
20. **Below ~14 px, counts tick; they never blur-slide.** `.digit-in` (rule 9) is for stat tiles;
    the bell badge and tab counts use `<Tick>` — translate and opacity only, no filter — because a blur
    at 11 px is smear, not motion.
21. **The check is the verb's state; the toast is the sentence.** A bare "Saved." is the button drawing
    its check; only a message with more to say becomes a toast. Errors are never toasts.
22. **Lists diff by key, never by index.** A row that can leave carries a stable local id (hours
    periods, custom emergencies got them); index keys would animate the wrong row out.
23. **Inside the app nothing enters on load.** Closure 1 in §7.6 records it; numbered here because §8
    (the funnel, where a page may enter) is defined against it.

### 7.5 21st.dev, this pass

Four searches, zero retrievals (the day's two were not spent: nothing here was structurally complex enough
to buy). Candidates read from their descriptions/previews only: *Segmented Control* #23552 and *Animated
Tabs* #24930 (sliding thumb — width-animated, hence the three-piece pill instead); *Toast Notification*
#19994 and *Toast* #24297 (spring-in, stacked; ours is one at a time and never springs); *List Item* #10469
and *Stacked List* #10477 (Motion's `AnimatePresence` / `layout` — the DOM-diff `<MotionList>` does the same
two things without the runtime); *Press Depth* #23547 (spring tilt toward the pointer — rejected, a press
should not wobble) and *Bouncy Toggle* #9634 (bounce — rejected, rule 15).

### 7.6 Closures after review (2026-09-02)

1. **Inside the app nothing enters on load (rule 23).** The pass-1 scroll staggers — `<Reveal>` on every
   list row, dashboard card, sidebar card and the stat-tile grid (27 usages across 19 files) — and the
   settings panel's `<Reveal key={tab}>` are removed. Rows render placed; only data that arrives after
   mount animates (`<MotionList>`). `<Reveal>` and `.reveal` are landing-page-only now; the §4 usage
   counts for `.reveal` and `.lift` staggers describe the landing page. Still animating on load and left
   as they were, flagged: `.bar-grow` chart bars (data drawing itself) and the `<CountUp>` mount tween
   (rule 9's threshold means it rarely fires).
2. **The saved check never gates input.** Measured: a second submit 1,961 ms into the 2 s "Saved" hold
   showed "Saving…" 35 ms after the click, the button was enabled throughout, and a fresh "Saved" hold
   followed; after it the verb returned.
3. **Jobs list at 390 px.** The row's customer line truncates, and the row is `min-w-0`: an implicit
   grid track sizes to its items' min-content, and a `nowrap` line inside a row can force the track past
   the viewport, so the truncation only takes effect once the row itself may shrink. Smoke pass 352/352.
4. The test rows the verification scripts created on vertical-dev (the "Frame Series", "Perf", "Reduce"
   and "Probe" tow jobs, the "Frame Series Guest" reservation and its notification) are deleted.

## 8. Guided arrivals — the funnel (2026-09-02)

Design read (taste-skill process; product wizards are outside the skill's scope by its §13, so only its motion
rules were applied: motivated motion, transform and opacity only, reduced motion, tactile press): *the sign-up
funnel — login, signup, the accept-terms interstitial and every onboarding step — is the one place in the app
where a page may enter, because a new owner arrives here from nowhere and is shown the shape of the page once.
Inside the app rule 23 still holds.* No runtime: CSS on the interaction ladder, plus one client template that
knows which way the owner is walking.

### 8.1 "Guided", defined

A **guided arrival** is the funnel's page entrance. Formally:

- **Entrances are allowed, one per page arrival.** An element takes part in exactly one entrance per arrival;
  nothing inside a guided group starts a second entrance of its own. The picker's cascade is the sanctioned
  exception and is each card's only entrance; an inline alert already on the page at arrival keeps its own
  150 ms slide inside its group's 480 ms, the one tolerated overlap (the two are the same message arriving).
- **At most three staggered groups, in reading order:** heading → form → footer, marked `data-guided="1|2|3"`
  under a `.guided` container (several elements may share a group; they move as one). Group two starts
  `--m-stagger` (144 ms since the 1.6× pick; 90 at the §9 rebalance, 60 before) after group one, group three
  288 ms after; each runs the **standard** step (480 ms; 300, then 220 before) on the house ease. Total 768 ms,
  inside the 700–850 ms window (480 in 450–600 at the rebalance, 340 in 300–400 before).
- **Standard ladder durations only.** No new durations: groups run at `standard`, the cascade's cards at
  `fast`, the leave at `exit`, the progress bar at `slow`. The two new constants are gaps, not durations:
  `INTERACTION.stagger` (144) and `INTERACTION.cascade` (56), mirrored as `--m-stagger` / `--m-cascade` and
  guarded by `tests/motion-vocabulary.test.mjs`.
- **Transform and opacity only, no layout shift.** A group rises 12 px (`--m-rise`) or travels 24 px along the
  corridor (`--m-travel`, 8.3) while fading in — 8 and 16 before §9; `animation-fill-mode: backwards`, so a settled group has `transform: none` again and
  is not a containing block for anything fixed.
- **Chrome is static.** The logo, the theme toggle, the back-to-home button, the onboarding header and the
  progress bar's counter and track never enter: they are the room the page arrives into. That also keeps the
  funnel's largest paint (the logo image) out of an opacity-0 first frame, which is what rule 13 protects.
- **Login is the exception: one settle, not a sequence.** A returning owner has seen this page; the card and
  the footer line are both group one and land together in one standard beat (480 ms).

### 8.2 Where it plays

| Surface | Groups | Showpiece and extras |
|---|---|---|
| Login | one group (card + footer), 480 ms | email is autofocused at mount; the entrance plays around whatever the owner types |
| Signup | 1 the "Step 1 of 8" line · 2 the card, "or", the Google button · 3 the footer link | the profession picker's ten cards **cascade** inside group two: each card at `standard` (480 ms), 56 ms apart (§9 and the 1.6× pick; was fast and 20 ms), so the grid is assembled about 1,130 ms after arrival. Picking a card draws an 18 px check at the slow step (`.draw-fast`) beside the card's colour swap — the house confirmation, not a pop. Ticking the terms box enables the buttons through the existing fast colour swap (`.press` transitions `background-color`), so the unlock is felt |
| Accept-terms interstitial | 1 heading + sentence · 2 the alert and the card | the same box, the same enable |
| Onboarding step | 1 the step title · 2 the form · 3 the footer (Save and continue, Back) | the counter and the track are static; the fill travels one step at `slow`, forward or back (8.3) |
| Stripe return / cancel | a fresh guided arrival with the checkout alert in group two | the hosted Checkout page is Stripe's and out of our control. We animate up to the hand-off (the button's pending dim and "Taking you to Stripe…") and never delay the redirect |

### 8.3 The corridor: direction

Step to step is one corridor, not nine pages. `src/app/onboarding/template.tsx` (client) remembers the last
step it mounted for and, in a layout effect before first paint, stamps the container `data-dir="forward"` or
`"back"` from the comparison — so a save that redirects, the Back link and the browser's own back button all
read correctly; a hard load has no history and arrives the plain way (the 12 px rise). Direction turns the
groups' axis: forward arrives from +24 px, back from −24 px (`--m-travel`), same stagger, same timings.

- **Exits are shorter and never waited on.** Back (and Skip) marks the current container `data-leaving`,
  which steps it aside half the travel (12 px) in the direction of travel and dims it to 0.5 at `exit` (320 ms), then holds —
  the pending state, in the vocabulary's terms — until the route lands, whenever that is. The navigation goes
  in the same tick; if the route lands within a frame the exit is simply cut.
- **Forward has no separate exit, on purpose (rule 11).** A step leaves forward only once the server has
  saved it, and Next delivers that answer and the next step in one response, so there is no honest window in
  which to animate the old step out. The pending fill is the forward "exit"; the next step arriving from the
  right is the confirmation.
- **The progress bar reads as continuous with the step.** Its `slow` travel (720 ms) starts on the same frame
  as group one and lands with group three. Forward it grows from the previous step's width (`--progress-fwd`);
  under `data-dir="back"` it shrinks from the next step's (`--progress-back`) — both computed on the server by
  `<OnboardingProgress>`, the container's direction choosing which one the fill reads.
- **Validation errors** arrive inline at `fast` (`.slide-in` now runs `--m-fast` on the house ease, 4 px),
  never shake and never block input; the browser's own required / minLength bubbles are untouched.
- **Voice step:** a play button dims (`aria-busy`) between the tap and the first audible frame, then reads
  "■ Stop"; picking a voice swaps the card's colours at `fast` (`.swap`) and, once the server has saved it,
  the status line draws the check (`.saved-in` + `.draw-fast`). **Phone step:** "Call me to test" presses,
  then reads "Calling you…" dimmed until the server answers.

### 8.4 Rules added (continuing §7.4)

24. **A guided arrival never gates input.** Inputs are in the DOM, focusable and typeable from the first
    frame; autofocus fires at mount and the entrance plays around the owner. Nothing in a guided group changes
    `pointer-events` or `visibility`; opacity and transform are the only things moving.
25. **Wrappers animate, never inputs.** The transform rides on the group (`[data-guided]`, a card, a footer),
    never on an `<input>`, `<select>` or `<textarea>`, so a password manager or the browser's autofill overlay
    measures a settled field: any overlay opened after the entrance window (768 ms) positions against the true layout
    box, and the layout box itself never moves (transform only). Verified in 8.6: every input's rect is
    identical before, during and after the entrance, and no input is ever the target of an animation.
26. **Route changes never wait on an exit.** `data-leaving` is set and the navigation proceeds in the same
    tick; the leave plays for as long as the route takes and is cut when it lands.
27. **Reduced motion: complete and static on arrival.** Every §8 class is in the reduce block: groups and
    cascade cards are simply there, `data-leaving` does nothing (the step swap is instant), the progress fill
    snaps (already listed), the check is drawn, the play button's dim still reads.
28. **A guided page's static chrome carries the first paint.** The logo (an image) is never inside a group,
    so LCP lands on it at first paint on login, signup and the interstitial — the funnel's answer to rule 13.

### 8.5 Rejected on the way

- **The View Transitions API** would give a true two-sided cross-slide, but its snapshot overlay swallows
  pointer input for the length of the transition (rule 24) and it is experimental in this Next. Rejected.
- **A forward exit on submit** — sliding the step out while "Saving…" — is rule 11's "13 settling to 12"
  with a verb: the save can fail. Rejected.
- **A shake on validation errors** — rejected by the brief and by rule 15 (nothing that answers a click
  overshoots).
- **Blur on the guided groups** (the hero's `.hero-enter` uses it) — a form's label and placeholder text
  smearing in reads as a rendering fault, not as arrival. Opacity instead.
- **Autofocus on signup's first text field** — the profession picker comes first in reading order, and a
  focus below it scrolls a short viewport past the one question the page exists to ask. Login autofocuses
  (email); signup does not.

### 8.6 Verification (2026-09-02, dev server against the vertical-dev branch, a throwaway restaurant created and deleted)

Harness: `funnel.js` (56 checks: the story at 1280×900 with frame series, then desk/phone × light/dark × motion/reduce,
each logging in and walking steps 3–8 with a hard-load arrival, Back, and the browser's back — a forward move in the
corridor), `funnel-login.js` (login → logout → login at both viewports) and `funnel-extra.js` (Skip, the Stripe button).
Frame series: `1-signup-arrival-desk`, `3-step-forward-3-to-4`, `4-step-back-4-to-3`, plus `2-signup-pick-profession`,
`5-accept-terms-arrival`, `6-login-settle`.

- **Signup arrival:** three groups at 220 ms with delays 0 / 60 / 120 ms; the guided animations start +40 ms after
  navigation start and the last lands at +430 ms; the logo is in the first frame (+20 ms) and never moves. The ten
  cards cascade with `--i` 0…9. A click into Business name at +91 ms — while the groups were still arriving — typed
  "Frame" and the field held it; no input, select or textarea was ever an animation target (13 animations at the
  first probe, 0 on controls). Inputs' layout boxes are identical before, during and after; their visual boxes rode
  the wrapper by 8 px mid-entrance and 0 px after settle.
- **Picking a profession:** press, colour swap, then the 18 px check drawn over 300 ms (`.draw-fast`). Keyboard:
  Tab reaches the radios, ArrowDown picks, and the focused card shows the ring (2 px offset + 4 px brand-400).
- **Terms box → enable:** the submit button went disabled → enabled through one `background-color 150ms` transition.
- **Forward (3 → 4, Save and continue):** "Saving…" dims the fill for the round trip (~250 ms in dev), then step 4
  arrives `data-dir="forward"`: title at +300 ms, form by +397 ms, footer by +498 ms, the bar growing from 0.750 of
  its new width. Inputs' visual shift mid-arrival 16.3 px (the corridor travel), 0.5 px after.
- **Back (4 → 3):** `data-leaving="back"` is set on the click; the old step dims and steps aside by +80 ms, step 3
  arrives `data-dir="back"` with the title at +157 ms and the form by +244 ms, the bar shrinking from 1.333.
  Every step 3–8 repeated the triple (plain → back → forward) with the fill reading `--progress-back` on Back and
  `--progress-fwd` going forward, three groups each time.
- **Skip (hours):** `data-leaving="forward"` and the `guided-aside` 150 ms animation are on the container in the same
  synchronous click, before the hard navigation; step 4 then arrives plain.
- **Voice step:** the play button is `aria-busy` and dimmed 40 ms after the tap and reads "■ Stop"; the pending state
  cleared once the sample played. Picking a voice ran the card's border and background transitions at 150 ms; after
  the server answered the status line drew the check beside "Grace saved — your AI host now uses this voice."
- **Phone step:** "Call me to test" presses; disabled on an account without a number, so the "Calling you…" state
  was not exercised in the browser.
- **Stripe step:** the click read "Taking you to Stripe…" and dimmed; the hand-off did not leave the page because
  Stripe's **test** account refuses `consent_collection` without a Terms of Service URL in Dashboard → Settings →
  Public details ("You cannot collect consent to your terms of service unless a URL is set"). The error arrived
  inline and the button re-enabled — rule 11 held. The cancel landing (`?checkout=cancelled`) arrives guided with
  its alert. The live account was not touched.
- **Accept-terms interstitial:** heading at +93 ms, card at +192 ms, complete by +295 ms; the box enables the
  button; Continue reaches the dashboard.
- **Login:** two elements in group one, same 220 ms, same 0 ms delay; the server HTML carries `autofocus`, so typing
  at +104 ms (desktop) / +116 ms (phone) after navigation already lands in the email field; Enter submits. Logout
  from Settings (desktop) and from the onboarding header (both viewports), login again each time.
- **Matrix:** desk/phone × light/dark × motion/reduce: signup and login arrivals, the settled cascade, no horizontal
  overflow at 390 px, steps 3–8 forward and back — clean, no console errors or hydration warnings. Under reduce:
  zero finite animations at any arrival, every group complete at once, the fill already at its width, and a Back
  click leaves the container at opacity 1 / transform none.
- `npm test`: 80/80, goldens byte-identical. `eslint .` and `tsc --noEmit` clean.

**Found on the way, not changed (pre-existing, outside this pass):**
1. **Login submits natively before hydration.** The login form has no `method`/`action`; an Enter pressed before
   React attaches `onSubmit` performs the browser's GET and lands on `/login?email=…&password=…` — credentials in the
   URL. Reproduced once in dev (hydration ~200 ms); a password manager's autofill-and-Enter can hit that window in
   production. Smallest mitigation: `method="post"`; proper fix: a server action fallback.
2. **Voice step at 390 px shifts when the catalogue lands.** The "Browse all N voices" card is inserted above the
   greeting fields in the stacked layout, moving them 42 px (`.content-in` fade, already there). Same in reduced
   motion — a layout event, not motion. Reserve the space or place the browser below the greeting on phones.
3. **Stripe test account** lacks the Terms of Service URL (above), so local/test checkout cannot start.
4. On the phone run, Settings → Billing showed no Log out within 20 s; the header's Log out was used instead.

## 9. The motion scale and the rebalance for visibility (2026-09-02)

The ladder was set for subtlety; the owner could not see it. This pass makes visibility a number that can be
compared live and then baked, and rebalances the ladder at scale 1 first, because visibility comes from travel
and stagger as much as from duration.

### 9.1 The rebalance at scale 1

| Token | Was | Now | Reads it |
|---|---|---|---|
| `--m-fast` / `--m-exit-fast` | 150 / 100 ms | **unchanged, and clamped** (9.2) | presses, colour swaps, chip text, validation errors, urgent rows |
| `--m-standard` / `--m-exit` | 220 / 150 ms | **480 / 320 ms** (300 / 200 at the rebalance, ×1.6 baked) | toasts, menus, disclosures, list arrivals and FLIP, tab slides, badge crossfades, the page transition, guided groups |
| `--m-slow` / `--m-exit-slow` | 300 / 200 ms | **720 / 480 ms** (450 / 300 at the rebalance) | the bottom sheet, the progress bar's travel, the saved check drawing |
| `--m-toggle` | (was `--m-standard`) | **220 ms, clamped** | the toggle thumb's travel: the response to a flick never slows |
| `--m-stagger` | 60 ms | **144 ms** (90 at the rebalance) | guided groups two and three |
| `--m-cascade` | 20 ms | **56 ms** (35 at the rebalance) | the picker's cards, now at `standard` each: the grid is assembled ~1,130 ms after arrival |
| `--m-travel` / `--m-rise` | 16 / 8 px | **24 / 12 px** | the corridor's entrance travel and the plain rise; the leave steps aside by half the travel (12 px) |
| guided budget | 340 ms | **768 ms** (2 × 144 + 480; 480 at the rebalance) | §8.1's window becomes 700–850 ms |

Exits stay about two thirds of their entrance at every step and every scale. `INTERACTION` in `src/lib/motion.ts`
carries the same table (`toggle`, `travel`, `rise` added) and `tests/motion-vocabulary.test.mjs` fails if the two drift.

### 9.2 The scale

`--m-scale` on `:root` (default `1`) multiplies every **scaled** token: each is declared as
`calc(var(--m-<name>-base) * var(--m-scale))`, and the `*-base` value is the number in the table. The JS timers that
must agree with the CSS (how long a leaving row, badge, tick, menu or toast stays mounted) read the live value
through `scaled()` in `motion.ts`, so a scale change never strands a node.

**Clamped — never read the scale, at any value:** the fast step and its exit (press down-strokes and click
feedback, hover and colour swaps, chip text), the toggle thumb (`--m-toggle`), focus rings (no transition at all),
validation errors (`.slide-in` at fast), route-change initiation (a Link navigates in the same tick; the leave
and the page fade are never waited on), and every urgent-surface treatment (`[data-urgent]` arrives instantly and
crossfades/exits at the fast step). Raising the scale therefore cannot gate input or dilute the alarm hierarchy;
it only stretches what arrives, slides and leaves. Reduced motion is unchanged: instant and complete, and the
scale is irrelevant to it.

### 9.3 The comparison knob (used for the pick, then removed)

During the pick a development-only pill (`<MotionScale>`, bottom-left, 1.0× / 1.3× / 1.6×) set `--m-scale` on
`<html>` live, remembered the choice in localStorage and applied it before first paint through an inline script,
all inside `NODE_ENV !== "production"` branches. Once the owner picked, the knob was removed with the bake — it
was a comparison tool, not a setting that ships, and nothing on the page should advertise motion as adjustable.
What remains is the mechanism: every scaled token is its `*-base` times `--m-scale`, and `scaled()` reads the
live value, so a future comparison sets `--m-scale` on `<html>` from devtools (or re-adds the knob from history
at the "rebalanced for visibility" unit), compares, bakes and resets to `1`.

**Procedure:** compare full flows at candidate scales on localhost and pick. The chosen value is baked — each
`*-base` token (and `INTERACTION`) multiplied by it and rounded, `--m-scale` back to `1` — and this section
records the pick.

**Pick, 2026-09-03: 1.6×** — the knob's top point, verified in 9.4 (a 1.8× trial was baked and set aside the same
day). Applied on the rebalanced bases: standard 300 → 480, slow 450 → 720, exits 200 / 300 → 320 / 480, stagger
90 → 144, cascade 35 → 56; the clamps (fast 150 / 100, toggle 220), travel and rise unchanged; `--m-scale` back
to 1; the knob removed.

### 9.4 Verification (2026-09-02)

Harness: `scale.js` (scratchpad `6cf24fd4-…`), dev server on the vertical-dev branch; the knob's stored choice set per
browser context and confirmed at the navigation's commit (`--m-scale` already on `<html>`, the pill showing the value,
`--m-standard` resolving to `calc(.3s * scale)`). Durations are read from `document.getAnimations()` while each
interaction runs (finished fill-mode animations ignored).

| Interaction | 1.0× | 1.3× | 1.6× | Reads |
|---|---|---|---|---|
| Settings tab slide (indicator) | 300 | 390 | 480 | standard; a second tab clicked at +80 ms mid-slide won every time; label colour swaps 150 at every scale |
| Save changes: check draws / "Saved" label | 450 / 150 | 585 / 150 | 720 / 150 | slow / fast (clamped); "Saving…" visible by +117 ms in the frame series at both scales |
| Page transition (schedule week arrow) | 300 | 390 | 480 | standard; the route had changed before the fade began |
| Bell popover open / close | 300 / 200 | 390 / 260 | 480 / 320 | standard / exit; Escape at +60 ms into the open still closed it |
| Hours: period row arrives / leaves / rows below slide | 300 / 200 / 300 | 390 / 260 / 390 | 480 / 320 / 480 | standard / exit / standard (MotionList) |
| Onboarding 3 → 4: groups, delays, bar | 300, 0/90/180, 450 | 390, 0/117/234, 585 | 480, 0/144/288, 720 | standard, stagger, slow; typing 50 ms into the arrival landed in the field |
| Onboarding 4 → 3 Back: leave | 200 | 260 | 320 | exit; the bar read `--progress-back` |
| Dispatch, plain row: badge crossfade in / out | 300 / 200 | 390 / 260 | 480 / 320 | standard / exit |
| Dispatch, **urgent** row: button swaps / row exit | 150 / 100 | 150 / 100 | 150 / 100 | **clamped** — unchanged at every scale (its Emergency badge never changes, so there is no crossfade to observe) |

**390 px at 4× CPU throttle** (rAF gaps, 1.0 as the baseline): bell open, settings tab slide and the urgent dispatch
advance ran with at most one frame over 33 ms (worst 50 ms) at every scale. The onboarding forward step's arrival
window had 5–6 frames over 33 ms (worst 117 ms) at **1.0, 1.3 and 1.6 alike**, and the Back arrival 0–2 (worst 50 ms):
the long frames are React committing the menu-and-policies form on a throttled CPU, not the animation, and the
scale does not move them. Nothing here is gated on motion: every click above registered during an animation.

`npm test` 80/80, goldens byte-identical; `eslint .` and `tsc --noEmit` clean. Frame series at 1.0 vs 1.3 for the
onboarding forward step (`A-onboarding-forward@1.0/1.3`) and the toggle + save (`B-toggle-save@1.0/1.3`); the
knob (since removed) is visible bottom-left in every frame, so the scale each sheet ran at is on the sheet.

The table above was measured on the rebalanced bases (standard 300) before the pick; its 1.6× column is what
now ships. **After the 1.6× bake** (2026-09-03) the same probes at scale 1 read those numbers directly — see the
line appended below.

**Re-verified at scale 1 on the baked 1.6× bases (2026-09-03, `scale.js`, SCALES=1):** `--m-standard` resolves to
`calc(.48s * 1)` at the navigation's commit; tab slide 480 ms with a second click at +80 ms winning; "Saving…" at
+46 ms, the check drawing 720 ms, the "Saved" label 150 ms; hours period row in 480 / out 320 ms; bell popover 480 /
320 ms, Escape at +60 ms closing it; page transition 480 ms on a path change (schedule → calls; the week arrow only changes a search param, which never remounts the app template); onboarding forward groups
480 ms at 0 / 144 / 288 ms with the bar at 720 ms and typing 50 ms into the arrival landing in the field; Back leave
320 ms; plain dispatch row badge crossfade 480 / 320 ms; the urgent row's button swaps 150 ms and exit 100 ms,
clamped. 390 px at 4× CPU: bell, tab slide and the urgent advance at most one frame over 33 ms (worst 50 ms); the
onboarding forward step's arrival 8 frames over 33 ms (worst 133 ms) — React committing the menu form, as at every
scale before the pick; its Back arrival none. Goldens byte-identical, lint and typecheck clean.
---

## 10. The navigation gesture — one click on the rail, three beats (2026-09-03)

Design read (taste-skill process; the skill declares product UI out of its scope in its §13, so only its motion
rules were applied — motivated motion, transform/opacity only, reduced motion, tactile press): *clicking a nav
item is one gesture, not three animations that happen to overlap. The rail answers the finger, the page being
left steps out of the way, and the new page's DATA settles in. Everything structural — the header, the filter
strip, the action button — is simply there.* No runtime: hand-written CSS on the interaction ladder, one client
context and one client template.

**The rule this section exists to serve.** Content must become visible **by arriving**. A page that fades in as a
block is fully visible before its rows move, and that reads as static however good the row motion is. So wherever
a page has a data layer, the block fade is switched OFF (`.page-enter:has([data-arrival])`) and the data's own
arrival is the only entrance. Every arrival is `animation: arrive … both`, so the from-keyframe is in force on the
first styled frame: **the first frame that contains content is the first frame of its arrival**. That is the
acceptance test, and it is measured on the animation's own clock, not by eye (§10.5).

### 10.1 The three beats

| Beat | What moves | Timing | Where |
|---|---|---|---|
| **1. The rail answers** | ONE indicator (`.nav-pill`, its edge bar the pill's own `::before`) translates to the clicked row; the row presses (`.press-soft`) | `--m-standard` (480 ms) travel; press clamped at `--m-fast` | `<SidebarNav>`, `<MobileTabs>` |
| **2. The old page goes** | The container steps 6 px aside against the direction of travel and dims to 0.45 | `--m-exit-fast` (**100 ms, CLAMPED** — under the 200 ms ceiling at every scale), **never awaited** | `leavePage()` → `.page-enter[data-leaving]` |
| **3. The new content arrives** | The page's data settles in, by content type | `--m-arrive` (460 ms) each, `--m-arrive-spread` (55 ms) apart, capped at 8 steps → **900 ms budget** | `[data-arrival]` |

**The pill's position is index arithmetic, not measurement.** `.nav-rail` publishes `--nav-row`, `--nav-gap`,
`--nav-pad` and `--nav-inset`; the rows read the same metrics back through `.nav-row`; the pill's transform is
`(row + gap) × --nav-active`, and `--nav-active` is **rendered by the server**. There is no effect, nothing to
measure, and therefore nothing that can jump on load — a transition exists only for a CHANGE of index, which is
exactly the route change it describes. Verified at 0.00 px offset with zero running animations on a hard load of
every item (§10.5). `.nav-row` sets `height`, not `min-height`: the arithmetic assumes uniform rows (rule 5), and
one wrapped label would put the pill half a row out for every item below it.

**The rail sits in the layout, not the template**, so the pill's DOM node survives the navigation and can slide
rather than re-appear.

**The corridor.** `(app)/template.tsx` is a client component: before the new page's first paint it compares this
path's row on the rail against the last one mounted and stamps `data-corridor="down"|"up"`, which sets
`--arrive-from`. That inherits into every arrival container below, so the page's exit and its content's arrival
travel the same way. The rail's order comes from `<NavOrderProvider>` (`src/components/nav-corridor.tsx`), seeded
by the layout — the nav is assembled per profession, so the template cannot hardcode it. A move that is not
between two rail rows (into a detail page, or from a path the rail does not own) arrives the plain way rather
than guessing at a direction.

### 10.2 The mapping — per content TYPE, not per tab

`data-arrival` goes on the element whose **children** settle in. Grandchildren are deliberately untouched, so an
element takes part in exactly one entrance per arrival (§8.1).

| Variant | Behaviour | Content type | Surfaces |
|---|---|---|---|
| `cascade` | children settle in reading order, one `--m-arrive-spread` apart | a list or a grid of rows | Service calls/Jobs, Customers, Calls, Notifications, Dispatch, Work orders, Properties, Residents/Tenants, Vendors, Subjects, Takeout, the reservations day list |
| `columns` | one day column is one arriving element; its visits come **with** it, not after it | a calendar | Schedule, the reservations week |
| `tiles` → `cards` | two groups: the KPI row lands, then the cards trail it by `--m-arrive-group` (110 ms) | a dashboard | both Homes (`<StatTile>` row, then `<DashboardMasonry>`) |
| `fade` | one element, crossfade, **no travel** | an editor / a settings panel | Settings (keyed by tab), Services |
| *(none)* | the page's own `.page-enter` fade | a page with no data layer | forms, detail panes |

Notes on two of them. **A calendar arrives by column** because a week is read left to right; staggering fifty
individual visits would be motion about nothing. **Settings crossfades and does not travel** because a form is a
control, and because rule 25 keeps transforms off inputs — and it is **keyed by tab** since a search-param change
does not remount the app template, so the key is what replays it while the strip's indicator keeps sliding
underneath. That same fact is what makes the no-replay guarantee free everywhere else: **a filter click cannot
replay a page's arrival.**

### 10.3 The non-negotiables, and where each one lives

1. **Urgent and emergency rows arrive complete at t=0**, never staggered behind ordinary content, and keep
   whatever alarm treatment they already have. `[data-arrival] > [data-urgent]` is last in source order so it
   wins the tie with the step rules: `animation: none; opacity: 1; transform: none`. `data-urgent` now also
   marks emergency job rows and emergency/escalation call rows (it already marked dispatch, work-order and
   notification rows). Verified non-vacuously on four pages: exempt children at opacity 1 in the very frame
   ordinary rows are at 0.
2. **Press feedback, toggles and route-change initiation stay instant.** All clamped: `--m-fast`,
   `--m-toggle`, and beat two at `--m-exit-fast`. No scale value can reach them.
3. **Nothing blocks input.** Opacity and transform only — never `pointer-events`, `visibility` or `display`.
   Measured at the first content frame: the filter strip and the header action are at **opacity 1 and
   hit-testable**, and an arriving row at **opacity 0 is still hit-testable**.
4. **Zero layout shift.** The animated property list is asserted per page to be exactly `[transform, opacity]`.
5. **Empty states are instant.** `[data-arrival] > [data-empty]` — a dashed "nothing here yet" has nothing to
   settle in, and animating one would put motion on the absence of data.
6. **Reduced motion renders everything complete and static.** Every new class is in the reduce block landing on
   the END state; the leaving page neither steps aside nor dims; the pill is at the active row with no travel.

### 10.4 The scale knob

`--m-scale` (§9) now covers the arrival too: `--m-arrive`, `--m-arrive-spread` and `--m-arrive-group` are each
their `*-base` times the scale. **One number moves the whole gesture** — set it on `<html>` from devtools (it
survives a client-side navigation and is cleared by a hard reload) or change the one line in `globals.css`.
Measured: 0.6× → 276 / 33 / 288 ms, 1× → 460 / 55 / 480 ms, 1.6× → 736 / 88 / 768 ms, with `--m-fast` 150,
`--m-exit-fast` 100, `--m-toggle` 220 and `--m-hold` 250 **unmoved at every value**.

It ships at **1**, where the budget is 900 ms — the top of the 600–900 ms brief, so the default is as visible as
the brief allows. Above ~1.05 the arrival leaves that window; that is the knob's business, not a regression.

**Rule 29 — the stagger is capped, so the budget is a budget.** Element nine onward all leave with element nine
(`:nth-child(n + 9)`), so `arrive + 8 × spread` holds whether the list has four rows or four hundred. Without the
cap a hundred-row list would take six seconds and "600–900 ms" would be a statement about short lists only.

**Rule 30 — a route skeleton is either absent or complete, never a ghost.** `.route-skeleton` is `opacity: 0`
and appears in ONE STEP (`skeleton-step`, 1 ms — shorter than a frame at any refresh rate) after `--m-hold`,
a CLAMPED threshold set **well past typical route resolution** (700 ms). So an ordinary navigation reveals no
skeleton at all, and only a genuinely slow route reveals one — by which point it stays long enough to read as
intentional. Scaling the hold would turn a fast route into a longer blank rather than a longer animation,
which is why it is clamped.

*Corrected 2026-09-03 after the glitch was measured (§10.6).* The first version held the skeleton invisible for
250 ms and then **faded it up over 480 ms**. That fade was the bug: dev resolves a route about 300 ms after
commit, so the hold expired and the content replaced the skeleton **48 ms into the fade — painting it at 0.292
opacity for two frames and then removing it.** A 29% ghost that appears and vanishes inside 50 ms is exactly the
flash the rule exists to prevent. A threshold alone only makes that rare; a step makes it **unrepresentable**,
which is why the appearance is no longer an animation with intermediate values. `tests/motion-vocabulary.test.mjs`
asserts the step shape, the delay token and the ≥600 ms threshold, so the fade cannot come back by accident.

**Rule 31 — rule 23 is narrowed.** "Inside the app nothing enters on load" becomes **"inside the app nothing
enters on a re-render or an on-page interaction."** A navigation is a deliberate move the owner made and may be
answered; a filter click, a poll landing or a badge changing may not. This is the owner's call, 2026-09-03, and
it is the one rule this section amends.

**Rule 32 — hover never travels.** The rail's gliding hover highlight is retired (`.nav-highlight` is gone). A
cursor crossing the rail is not a state change, and a second travelling element competed with the one that means
something. Hover is colour alone, at the clamped fast beat (§5 rule 8).

### 10.5 Verification (2026-09-03, dev server, plumbing test account)

Harness: `nav.js` (131 checks) + `matrix.js` (29 checks) + `sampler.js`, scratchpad `622959b7-…`. The ladder is
CALIBRATED from the running app (a probe element resolves `var(--m-arrive)` through `transitionDuration`) rather
than hardcoded. The sampler records, per animation frame, the page's **identity** (`.page-enter` is a fresh node
each navigation, stamped with an incrementing id), every arrival container's children's opacities, and the first
arriving child's `animation.currentTime`. Page identity is what makes the test honest: without it the loop
reports the OUTGOING page's settled content as the new page's first frame — a false pass that this harness hit
before the fix went in.

Rail: Home · Notifications · Schedule · Service calls · Customers · Services · Calls · Settings.

| Check | Result |
|---|---|
| **Acceptance test** — first content frame IS the first arrival frame, every item down the rail and back up (14 navigations) | **animation clock 0 ms of 460 ms, `playState` running, every staggered child at opacity 0**, on all 14 |
| Beat one — pill on the active row at first paint, hard load, all 8 items | **0.00 px offset, 0 running animations** |
| Beat one — the pill travels on a click | 29–30 distinct transforms per navigation |
| Beat two — the old page stamped leaving, direction correct | stamped on all 14; 0–20 ms observed, never awaited |
| Arrival inside the budget | 383–834 ms per page vs the 900 ms budget |
| Reading order | cascade / columns confirmed on every multi-child page |
| Only `transform` and `opacity` animate | asserted per page: exactly `[transform, opacity]` |
| Urgent/empty complete at t=0 | Home (in `cards`), Notifications (4), Service calls (2), Calls (1) — exempt `[1,…]` while staggered `[0,0,0,0]` in the same frame |
| The alarm treatment is unchanged | the EMERGENCY row keeps its red, at opacity 1 |
| Chrome instant vs data arriving | filter strip opacity **1** + hit-testable, header action opacity **1** + hit-testable, arriving row opacity **0** + still hit-testable |
| A filter clicked as soon as it exists | navigates (`/jobs?status=requested`) |
| Route skeleton | **absent entirely** at dev speed — distinct sampled opacities `[0]` (was `[0, 0.001, 0.152, 0.292]`) |
| Reduced motion, 4 pages | nothing hidden, nothing running, the leaving page not dimmed |
| 390 px tab bar, all 7 tabs | indicator on the active column at first paint, dx ≤ 0.06 px, 0 running; travels on tap; content still arrives |
| Dark theme | content arrives by arriving |
| 390 px at 4× CPU | arrives by arriving; 1/153 frames over 33 ms, worst 50 ms |
| The knob at 0.6× / 1× / 1.6× | scaled tokens move, clamped tokens do not, the arrival runs at the scaled duration, still arrives by arriving |
| Other archetypes' Home (restaurant `demo`, property management `pm`) | first content frame is the first arrival frame; both groups present; cards trail the KPI row (delay 0 s → 0.165 s) |

Frame series (`shots/series`, 40 frames over ~1.9 s of one click): at **+229 ms** the pill has already travelled
and the skeleton is held invisible — nothing false on screen; at **+413 ms** the header and the whole filter
strip are solid, **both EMERGENCY rows are complete and red**, and every ordinary row is still invisible; by
**+500 ms** rows one and two have landed, three is mid-arrival and four has barely begun.

`npm test` 83/83 (two new: the arrival budget and the alarm exemption, both read out of the stylesheet), `eslint .`
and `tsc --noEmit` clean.

**Observation, not fixed (out of scope):** the mobile tab bar's wrapping `<nav>` has no accessible name — only
the sidebar's carries `aria-label="Main"`. Pre-existing; below `md` the named nav is `display:none`, so a
screen-reader user on a phone gets an unlabelled navigation landmark.
### 10.6 The glitch between the click and the arrival (diagnosed and fixed, 2026-09-03)

Reported as "something flashes or jumps between the click and the content settling in". Diagnosed with
`diagnose.js` + `sampler.js` (scratchpad `622959b7-…`): a CDP `Page.startScreencast` at every frame
(median **17 ms** — `page.screenshot()` tops out near 46 ms, coarser than the thing being measured) driven
from **mousedown**, alongside the rAF DOM sampler. Both are re-based on the click through a wall-clock stamp
the screencast also carries; without that the two instruments sit ~130 ms apart and every reported time is
wrong. The sampler counts **all** `.page-enter` layers, not the first, because "are the old and new layers
ever both painted?" is a question `querySelector` cannot answer.

**Before — three visual states where the rule permits one** (click at t=0, `/dashboard` → `/customers`):

| window | duration | on screen |
|---|---|---|
| 0–58 ms | 58 ms | the old page, opacity 1, press feedback |
| 58–94 ms | 36 ms | the old page dimming 1 → 0.67, stepped aside |
| **94–340 ms** | **246 ms** | **blank `<main>`** — old page unmounted, skeleton mounted but held at opacity 0 |
| **340–392 ms** | **~50 ms** | **partial skeleton ghost, peak effective opacity 0.292** |
| 392 ms → | 460 ms + | content arriving from opacity 0 |

**The two suspects, resolved.** The skeleton's threshold was **confirmed** as the cause of the flash: the hold
expired ~250 ms after commit and the 480 ms fade-up was taken over 48 ms in, at **0.292**, for two frames. The
overlap suspicion was **ruled out** — `0` frames with two `.page-enter` layers, in every run; the old layer is
unmounted before the new one mounts, so old and new are never both painted.

**A third finding, not suspected and larger than the flash:** the **246 ms blank**. It is not a fade artefact —
it is the hold itself. Next mounts the loading fallback at route commit, which unmounts the old page; the fallback
then sits at opacity 0 for the length of the hold. The leave, meanwhile, rendered for only ~36 ms before its node
was unmounted, so the leaving page never covered the wait — it dimmed partway and blinked out.

**The fix.** Threshold raised 250 → **700 ms**, well past typical resolution, and the appearance changed from a
480 ms fade to a **1 ms step** (rule 30). The step is the important half: a higher threshold only makes a partial
opacity rarer, whereas a step makes it unrepresentable.

| case | shell→content gap | skeleton | sampled opacities |
|---|---|---|---|
| dev speed | 301 ms | **none** | `[0]` |
| below threshold (bandwidth-throttled) | 600 ms | **none** | `[0]` |
| above threshold | 817 ms | steps in, 82 ms | `[0, 1]` |
| genuinely slow | 1,251 ms | steps in, **517 ms** | `[0, 1]` |
| very slow (14 kB/s) | > 5 s | steps in, **5.3 s** | `[0, 1]` |
| **before the fix** | 298 ms | ghost, ~50 ms | `[0, 0.001, 0.152, 0.292]` |

Note the instrument: a *request* delay cannot produce the slow case — it holds the whole response back, which
lengthens the phase the leaving page covers and leaves the shell→content gap untouched. Constraining **bandwidth**
(`Network.emulateNetworkConditions`) is what spreads the streamed chunks and stretches that gap.

**Corrected frame series** (`diag/fix-dev`, 17 ms cadence): 0–57 ms the old page at full opacity with the press;
57–90 ms it dims to 0.45 and steps aside; **90 ms** the route commits and the rail's pill is already on Customers;
90–373 ms an empty content area with the rail, header and banner intact — **no skeleton at any opacity**; **391 ms**
the first frame containing content is the first frame of its arrival (clock 0 ms, all children at opacity 0); then
the cascade. The frame that used to hold the 0.292 ghost is now clean.

**Guards re-run after the change:** `nav.js` 132/132, `matrix.js` 29/29, `npm test` 84/84 (one new: the skeleton
step shape), `eslint .` and `tsc --noEmit` clean. Urgent rows still complete at t=0 (exempt `[1,…]` against
staggered `[0,0,0,0]` in the same frame, four pages), chrome still opacity 1 and hit-testable while an arriving
row at opacity 0 is also hit-testable, animated properties still exactly `[transform, opacity]`, reduced motion
still complete and static, and the clamped tokens — `fast` 150, `exit-fast` 100, `toggle` 220, `hold` 700 — are
identical at 0.6× / 1× / 1.6×.

#### The blank is now the whole pre-arrival window, and that is a deliberate trade

At dev speed the sequence is: leaving page (~90 ms) → **empty content area (~300 ms)** → arrival. Nothing
extraneous is painted — no partial skeleton, no unstyled flash, no overlap — but the *leaving page* does not
cover the wait either, and the rule asks for it to.

The blank equals the gap between the streamed shell and the page content, which is the **server render of the
page segment**: ~300 ms in dev, and much shorter in production where the route is compiled and warm. It is not a
motion value and no timing token affects it.

Eliminating it entirely means not mounting a loading fallback at commit, so the old page survives until the data
lands. **Measured** (`diag/experiment-no-loading`, `(app)/(lists)/loading.tsx` — then `(app)/loading.tsx` — temporarily moved aside): route commit and
the first content frame coincide (**gap 0 ms**), **0 blank frames**, and the leave renders for **10 frames /
148 ms** — the leaving page covering the whole wait, which is exactly the rule. The file was restored immediately;
nothing about it is committed.

Not taken, because the cost is real and outside this pass:

- `(app)/(lists)/loading.tsx` is what flushes the streaming shell on a **hard load** of a list page. Removing it
  makes first paint TTFB-bound. (Until 2026-09-08 it sat at `(app)/loading.tsx`, above every page, which is also
  why `notFound()` on a record page returned HTTP 200 — §7.6 note 2's cousin. The four record pages —
  `calls/[id]`, `jobs/[id]`, `reservations/[id]`, `takeout/[id]` — now live in `(app)/(detail)/`, outside the
  boundary: one indexed query before first paint, a real 404 for a missing record, and on navigation the leaving
  page covers the wait, which is the measured-better shape above. The list pages keep the boundary for the
  reason in the next bullet.)
- A genuinely slow route would then show a frozen dimmed page with no progress signal at all.

The principled fix is neither: move each page's **data** query behind its own `<Suspense>` so the page's real
header and filter strip stream immediately and only the data region is pending. That is already the stated
design — "structure and chrome instant, data settling in" — and it would replace the blank with the real chrome.
It is a refactor across a dozen pages and is **the owner's call**.

**One residual, honestly:** a route landing just past the threshold shows a full-opacity skeleton briefly —
**82 ms** at a gap of 817 ms. It is complete rather than partial, so it is not the ghost, but 82 ms is not "long
enough to read as intentional" either. A minimum visible duration cannot be expressed in CSS: React unmounts the
fallback the instant the content commits, and there is no element left to hold or transition. Any threshold has
this boundary band; raising the threshold moves it rather than removing it. Closing it properly needs the
per-page Suspense refactor above, where there is no fallback to flash.

---

## 11. The gap a removed row leaves (2026-09-05)

Reported plainly: *"once a notification is dismissed the animation for the notifications
repositioning is really bad."* It was, and not by a hair — the repositioning was not animating at all.

### 11.1 What was wrong

`<MotionList>` did its two jobs in the wrong order. It put the leaving row back **first**, and put it
back **in flow**, and only then measured the survivors for their FLIP. So:

1. the re-inserted row still occupied its cell, holding the gap open;
2. every survivor therefore measured at its *old* position, `dx`/`dy` came out zero, and no transform
   was ever written;
3. the exit timer fired, the node was dropped, and the list **snapped** into its new layout.

Measured on the notifications grid before the fix: one `row-out@320` running, `absolute: 0`,
**zero** `transform` transitions, then an instant jump at ~500 ms. The rule the implementation was
reaching for is §5 rule 5 — nothing animates layout — and it met the letter of it by animating nothing.

### 11.2 The fix

Measure and FLIP the survivors first, against the layout React has already committed; **then** put the
leaving row back pinned out of flow (`position: absolute` at the `left/top/width/height` it held —
`.motion-list` has been `position: relative` since it was written, for exactly this). The card fades and
settles where it sat while the rows after it close over it. After: `absolute: 1`, `row-out@320` on the
leaver and **three** `transform@480` slides, settled by ~650 ms. Same classes, same beats, no new CSS.

### 11.3 The second bug, found on the way

A commit can land while a list is not laid out at all — the bell popover's list is in a closed
`popover`, so every row measures at the origin. Those zeroes were being written into the position map,
so the next real commit would FLIP every row in from the top-left corner. A list with no width and no
height now skips the commit entirely rather than remembering nonsense.

### 11.4 Rules added (continuing §7.4)

24. **A row that is leaving must not hold its own gap open.** It is re-inserted out of flow, pinned to
    the rect it had, so the layout the survivors animate into is the real one. In flow it is not an
    exit, it is a pause.
25. **FLIP measures before anything is put back.** The committed layout is the truth; anything
    re-inserted for an exit is decoration on top of it and must be added after the measurement.
26. **Never record a measurement taken while the list is not laid out.** Zero width and zero height
    mean hidden, not moved; storing the origin turns the next commit into a scramble.

### 11.5 The same mistake, one component over (2026-09-05)

`<SegmentedLinks>` re-measured its indicator only when the **picked** item changed. But the
notifications strip carries an independent toggle beside the choice, and "Unread only" grows a ✕
when it is on — 16 px wider, which shifts every pill along it. Nothing was picked, so nothing
re-measured: `--seg-x` kept the old offset and the indicator sat 16 px left of the chip it belongs
to. Because the active chip goes `background-color: transparent` to let the indicator BE its fill,
the result was a chip with no fill and a stray filled ring beside it.

Measured: leading toggle 122 → 138 px, "All types" 146 → 162 px, `--seg-x` **146 px**, unmoved.

It now measures after every commit, with a geometry signature so a commit that moved nothing costs
one read and stops — and it snaps rather than slides when nothing was picked, because an indicator
gliding on its own reads as a glitch rather than as an answer to a click.

27. **Re-measure when the layout can change, not when the selection changes.** They are different
    events. A neighbour resizing moves your geometry without touching your state, and an indicator
    keyed to state alone will confidently point at where the thing used to be.

Verified on the notifications grid (2 columns at 1440 px), the bell popover's plain list and the Hours
form's rows; reduced motion still removes the row with no exit node and no slide. `npm test` 106/106
with a dev server up, goldens byte-identical, `eslint` and `tsc --noEmit` clean.

## 12. The row a form adds (2026-09-06)

Reported: *"On the Services tab, clicking Add a service makes the new row appear statically — no
animation."* Design read, as in §7: product UI, outside the taste skill's scope (its §13); only its
motion rules were applied — motion answers the click, transform and opacity only, reduced motion,
nothing decorative.

### 12.1 Diagnosis, measured before anything changed

The two obvious causes were ruled out first, by reading: the Services form already rendered its rows
inside `<MotionList>` (§7.3) and keyed them by a local counter, never by index. Then by measuring: a
rAF sampler on a dev server (1100 × 800, the plumbing test account) recorded every frame after the
click, and the click *did* produce the list-insert treatment — the new `<li>` carried `.row-enter` at
its first painted frame, `row-in` at 0 of 480 ms, opacity 0 → 1 with the 4 px rise, settled 400 ms
later. Identical on the onboarding step (Services & pricing, `/onboarding/5` for a trade). What read
as "static" was everything around the row:

1. **Focus stayed on the button.** Text typed straight after the click went nowhere; a space
   re-clicked the button and added a second row.
2. **Everything under the list jumped.** The add button, the hint and the footer sat outside the
   list, so they moved one row height (111 px) at the first frame. That jump was the one motion on
   screen the eye could catch, while an empty row — white on white, a light border, placeholders —
   has almost nothing to fade in with. The arrival was there; nothing carried it.
3. **Removing the last row dropped the button onto the leaving row.** The pinned exit node (§11)
   faded at opacity 1 under a button that had already jumped into its cell (t = 42 ms).
4. **Every remove moved the neighbours twice.** 103 px at the commit and 8 px more when the exit
   node was dropped (48 + 8 in Hours, 105 + 12 in the menu): `<MotionList>` appended the pinned
   node as the list's *last* child, so Tailwind's `space-y` / `divide-y` (`:not(:last-child)`)
   gave the real last row a phantom margin for the length of the exit — rule 24 broken by 8 px.

The reference, measured the same way: a notification row put back by Undo in the inbox, and a
notification landing in the open bell popover. Both: `row-in` at 0 of 480 ms, opacity 0 → 1, 4 px —
the same class, the same beat. The inbox dismiss beside it showed a fifth thing: of ten survivors,
the four urgent rows slid and the six dismissible ones jumped. Frame by frame, the jumpers still
carried their finished `arrive` animation (`currentTime` 625 of 460 ms, fill `both`), and a finished
animation that still fills outranks an inline style — so the FLIP transform `<MotionList>` wrote was
simply not applied. Urgent rows are exempt from the arrival (rule 17), which is the only reason they
could move. Every `data-arrival` list had this since §10: a row could leave, but nothing after it
could slide.

### 12.2 21st.dev, this pass

Nine searches (animated field array / dynamic list add-delete / staggered form rows / list insert-remove
/ todo add-remove / auto-animate reorder / invoice line items / add-more inputs), zero retrievals; the
two daily retrievals were not spent. Candidates, read from their descriptions and previews:

| Candidate | What it is | Verdict |
|---|---|---|
| *Dynamic Field Array* #25057 (felipemenezes098), *Invoice Form with Line Item Dialog* #25094 | React Hook Form + Zod field arrays; a dialog per line | Form-state logic, no motion pattern to port; RHF/Zod are outside the stack |
| *Animated To-Do List* #6922 (uniquesonu) | AnimatePresence; a removed item fades and moves off-screen | Runtime, and an exit that travels — ours settles where it sat (rule 24) |
| *List Item* #10469, *Stacked List* #10477, *Animated Collection* #10456 (0xUrvish) | Motion `AnimatePresence` + `layout` | Judged in §7.5: the DOM-diff `<MotionList>` does both without the runtime |
| *Animate Presence modes* #24526, *Exit animation* #24551, *Layout animation* #24522, *Reorder items* #24575 (motion.dev) | The runtime's own primitives | The thing `<MotionList>` replaces, not a pattern |
| *Interactive List* #7766, *Animated Table rows* #8312 | Animated removal only | Half the gesture; nothing on insertion |
| *Animated File Upload* #18031, *Animated Tags* #18103 (educalvolpz) | A growing file list; tags with blur + spring | Closest in shape; blur and spring are both refused (rules 15, 20) |
| *Todo List Item* #1138, *Delete Button* #10461, *BeUI Swipeable List* #16172 | Swipe-to-delete, strike-through | Gestures we do not have; decoration |
| *Filter Grid* #23525, *Reorder List* #23550 (ddoemonn) | FLIP reflow on filter; keyboard drag reorder | Reorder, not insert; the FLIP is what we already do |
| *Animated List* #869 (magicui), #4072, *Stagger Reveal Grid* #18357 | Sequential showcase reveals | Landing-page entrance choreography (rule 23) |
| *Invoice Line Items Table* #25157, *Tags Input* #18100, *AI Diff* #23794 | Static table; tag input; a code diff that wipes lines in | Not a form row |

Nothing here beats what `<MotionList>` already does — every animated candidate is the Motion runtime
doing the same two things, several add decoration, and the field-array ones have no motion at all.
So: `<MotionList>`, and the gap closed at the cause.

### 12.3 What changed

**`<MotionList>`, three repairs.** (1) The pinned exit node is inserted *before* the last child, never
as the last child, so no sibling changes pseudo-class for the length of the exit — the two-step move
is gone. (2) The FLIP's cleanup ends only on the row's *own* `transitionend`: the event bubbles, and a
colour or opacity transition ending on a descendant (a dismiss button fading in under the parked
pointer, a press relaxing) cleared the row's transition mid-slide — a latent hazard found on the way,
not the inbox's cause. (3) A companion hook, `useRowFocus`: the row a form just added is scrolled
into view (`scrollIntoView` at `nearest`, instant — the viewport moving to stage the row is not
motion, the row's entrance is) and its first field takes focus with `preventScroll`, in the commit
that mounts it, before the entrance has finished. Reduced motion changes nothing there.

**The arrival fills backwards.** `[data-arrival] > *` was `animation: arrive … both`; it is now
`backwards`. The from-keyframe still holds through the stagger delay, and the end state *is* the
element's own, so a forwards fill had nothing to hold but the transform property itself. Guarded by
`tests/motion-vocabulary.test.mjs` ("an arrived row can still be moved"). Measured after: all ten inbox
survivors slide.

**Nested lists, one per level that grows.** Services (settings and onboarding), Hours, Emergencies and
Menu & policies each became `<MotionList>`s at every level under which a row can be inserted: the rows
in their `<ul>`; the add button and the hint in the section; the day cards in the week; the footer (and
Back, and Skip) in the form. Nothing under an inserted row jumps any more — it makes room at the
standard beat, which is the "making room" the eye reads as an insertion, and the row fades into the room
being made. The properties page got the same treatment for the add-unit form under each unit list.

**Phones.** Under `md` the tab bar is fixed over the bottom of the viewport, so `html` now carries
`scroll-padding-bottom: 6rem` (the space `main` already reserves): whatever the browser scrolls into
view — a focused field, the row a form just added — stops above the bar.

### 12.4 Rules added (continuing §11.4)

28. **What sits under an inserted row makes room at the standard beat.** A list's neighbours are part
    of the insertion. Anything that would jump by a row height is itself a keyed child of a list —
    nested `<MotionList>`s, one per level that grows — so it slides. The FLIP is the "making room"; the
    row's fade is the arrival; without the first, the second is invisible on a row with nothing in it.
29. **A form's new row takes focus and comes into view in the commit that mounts it.** Focus lands
    before the entrance has finished, never after; the scroll is the least the viewport can move and
    is not animated (two motions on one click would blur both); on a phone the fixed bar is reserved
    with `scroll-padding-bottom`. Reduced motion: identical.
30. **An entrance whose end state is the element's own state fills backwards, never forwards.** A
    finished animation that still fills outranks an inline style, and the transform it holds is the
    one every later slide needs. `both` is for an animation whose end state differs from the base.
31. **A leaving row is put back where it cannot change a sibling's pseudo-class** — before the last
    child, never as the last child. `:last-child` is how the utilities space a list, and a row that is
    out of flow must also be out of the selectors.
32. **A row's slide ends only on its own `transitionend`.** The event bubbles; a descendant finishing a
    hover colour is not the row arriving.

### 12.5 Verification (2026-09-06, dev server on 3001, 1100 × 800 unless stated)

Harness in the session scratchpad (`rows.js`; `db.mjs` creates and removes the `[row-check]` rows it
needs; `compare.mjs` the beat table; `sheet.js` the contact sheet). 60 checks: 58 pass, and the two that
do not are the harness's own expectation on an empty portfolio — the first property card mounts a
fresh list and arrives by the page's cascade rather than as a row, and deleting the only card unmounts
the list, so there is no exit node to measure. Both are correct behaviour.

- **Beat for beat.** The service row, the inbox row and the bell row on one relative clock, sampled
  every frame: opacity 0 / .152 / .291 / .415 / .614 / .805 / .927 / .987 / .999 / 1 at 0 / 17 / 33 /
  50 / 83 / 133 / 200 / 300 / 400 / 480 ms, travel 4 → 3.4 → 2.8 → 2.3 → 1.5 → 0.8 → 0.3 → 0.1 → 0 px,
  in all three; worst opacity gap between any two, 0.001. The contact sheet (`out/frame-series.png`)
  shows one add, one remove of the last row, and the inbox re-arrival at the same nine beats.
- **Services, settings and onboarding:** focus in the new row at its first frame and text typed
  straight after the click lands in it; the input hit-testable at row opacity 0; existing rows shift
  0 px; add, hint, footer (and Back) slide 111 px at the standard beat, in both directions; removing
  the last row: nothing lands on the leaving row, no two-step move; removing the first: survivors
  slide, followers slide. A row landing below the fold is scrolled fully into view (scroll 229 → 293,
  focus still first). At 390 × 844 with the add button parked above the tab bar, the new row's bottom
  lands at 744 px against a bar top of 786.
- **Which lists were broken, which already worked.** Broken the same way (arrival fine, focus on the
  button, followers jumping): Services in both places, Hours periods (the next day card and the footer
  jumped 56 px), custom emergencies (the fields below jumped 56), menu items (Policies and the footer
  jumped 117), units (the add-unit form jumped 61). Already working: vendors (a server list; nothing
  sits under the grid) and properties (the cards after a new one slide). All now pass.
- **Reduced motion:** the row is complete at its first frame (opacity 1, no animation), focus and
  typing still land, a removed row is simply gone.
- `npm test` 107/107 (the new fill-mode guard included), goldens byte-identical, `eslint` and
  `tsc --noEmit` clean.

Left as found: after a Remove, focus falls to `<body>` (the control that was clicked is gone); the
inbox's Undo already moves focus deliberately, the forms do not yet.

## 13. The header that moved (2026-09-06)

Reported: *"navigating to Home from another section, the business name in the header shifts slightly
and settles back."* Chrome never enters (§8.1): the logo, the header, the progress track and the
nameplate are outside every arrival, and only the data layer travels. Four suspects were named
before anything was touched — the corridor's `--arrive-from` inheriting into the header on Home; the
header sitting inside Home's `[data-arrival]` boundary; a layout shift from Home's KPI tiles or
count-ups reflowing the header's width; a font or width change in the nameplate landing after first
paint — and the rule for telling them apart was: if it is Home-only, it is the boundary or the reflow.

### 13.1 Measured

A harness (`header.js`, session scratchpad) sampled every frame of every rail transition, down the
rail and back up (14 on desktop, 12 on a phone where Notifications lives in the bell), and beside the
header's and the nameplate's bounding boxes recorded the things that could move them: the viewport's
client width, whether the document had a scrollbar, whether the header sat inside `.page-enter`,
`[data-arrival]` or `[data-guided]`, whether `--arrive-from` reached it, its transform, any animation
running inside it, and the nameplate's font.

The first runs saw nothing move anywhere — and that was the first finding: Playwright launches
headless Chromium with `--hide-scrollbars`, so a document scrollbar takes no width there and the one
suspect that changes the header's width is invisible to a headless harness. With classic scrollbars
back (15 px), at 2560 × 1440 — the one size at which Home's content fits the viewport — exactly one
transition moved: **Home (up)**, the nameplate 7.5 px to the left at 169 ms and back at 470 ms, with
the client width 2560 → 2545 → 2560 beside it. Home's route skeleton (`dashboard/loading.tsx`) is
taller than the viewport; the content that replaces it is not; the scrollbar came and went, and a
centred header reflows by half a gutter each way. At 1920 × 1080 the same reflow changed the header's
box on 9 of 14 transitions, and at 1280 × 800 on 13 of 14 — there the nameplate held, because below
the header container's max-width its left edge is pinned to the column and the 15 px came off the
right, moving the bell and the theme toggle instead. On every run: the header outside every boundary,
no `--arrive-from` on it, no transform, no animation inside it, the font constant.

So: the third suspect, through the document scrollbar rather than the tiles themselves, and Home-only
only where Home fits the viewport.

### 13.2 The fix, at the cause

`html { scrollbar-gutter: stable }`: the viewport reserves its gutter whether or not the document
scrolls, so nothing a page does — its height, its skeleton's height, a list that empties — can change
the header's width. Overlay scrollbars (phones, macOS) have no gutter and are unaffected. Nothing in
the header changed, because nothing in the header was wrong.

33. **Chrome's width is reserved, not observed.** The viewport keeps its scrollbar gutter at all
    times; a page may be any height without the header, the rail or the tab bar learning of it. A
    harness that checks chrome must run with classic scrollbars — hidden ones make the check vacuous.

### 13.3 Verification (2026-09-06, dev server on 3001, plumbing test account)

After: 14 of 14 transitions keep both boxes to the pixel at 1280 × 800, 1920 × 1080 and 2560 × 1440,
light and dark; 12 of 12 on the phone (390 × 844, the tab bar), light and dark; computed
`scrollbar-gutter: stable` on the root in every run. The assertion is now part of the nav regression
harness (`nav.js` + `sampler.js`, the §10 scratchpad): every journey transition checks that the header
and the nameplate never move, prints the client widths it saw, and the harness launches Chromium with
scrollbars kept. `npm test` 107/107, goldens byte-identical.

Left as found: Home's route skeleton is taller than Home's content at 1440p, so a scrollbar thumb
still appears in the reserved gutter for about 300 ms of the arrival. The header no longer sees it.

## 14. The checkbox that switched instead of answering (2026-09-06)

Reported: *"The Quote it and Offered checkboxes on the Services form toggle with no animation."* The
brief named two hypotheses — the form's boxes are not the shared `Checkbox`, or the shared one only
animates the colour swap and not the mark — and asked which. Both, and the second is worse than stated.

### 14.1 Diagnosis, by reading

The Services form's two boxes were raw `<input type="checkbox" className="h-4 w-4">` inside their own
labels — not the shared component. And the shared `Checkbox` in `ui.tsx` was a **native** input with
`accent-color`: §7.3 counted it as "adopted by inheritance", but the only thing it inherited was
`.press-soft` on the wrapping label. The browser paints a native checkbox's mark and fill itself, in
one frame, and `accent-color` only recolours that paint — so the shared component animated neither the
mark nor the colour swap. Nothing about a checkbox anywhere in the app had ever answered a click.

Every checkbox in the app, found by grepping `type="checkbox"` and confirmed in the browser (14.5):

| Where | Was | Rendered through |
|---|---|---|
| Services "Quote it", "Offered" (settings and onboarding step 5) | raw input, 16 px, no accent | outside |
| Hours "24 hours", "Closed" (settings and onboarding step 3) | raw input, 20 px, accent, `.press-soft` label | outside |
| Menu "Available" (restaurant settings and onboarding) | raw input, 16 px, accent | outside |
| Terms consent (`TermsCheckbox`: sign-up, Google step 1, re-consent) | raw input, 16 px, accent, `required` | outside |
| Emergency types (trades, settings and onboarding step 6); urgent cases (auto repair handoffs) | `Checkbox` — native input in a card label | the shared component, native inside |

Not checkboxes, and left alone: `<Toggle>` (a switch on a hidden input, its own §7 treatment); the
profession picker's cards (a radio group; the 18 px check that draws on selection is §8.2's, at the
slow beat); the filter chips ("Unread only", dietary tags, the voice gender filter) are `aria-pressed`
buttons and links. **No indeterminate state exists anywhere** — nothing sets the property and the
component did not expose it.

### 14.2 21st.dev, this pass

Eight searches (animated checkbox / drawn checkmark / checkbox / check-uncheck scale / toggle switch /
indeterminate / card option / todo strike-through), zero retrievals; the two daily retrievals were not
spent — a checkbox is not structurally complex enough to buy. Candidates, from descriptions and previews:

| Candidate | What it is | Verdict |
|---|---|---|
| *Animated Checkbox* #10239 (tom_ui), *Animate Checkbox* #4217 (molecule-lab-rushil), *Animated Check Box* #2174 (ringlabs) | Spring transitions on the box and a strike-through on the text; Radix + Motion | Springs overshoot (rule 15); strike-through is a to-do idiom, not a form's |
| *Checkbox Group* #10365 (micka_design), *Checkbox Group* #25106 (edwinvakayil) | Animated checkmarks with spring, proximity hover, merged selections | The runtime again, and the tick springs |
| *Animated Signature* #16799 (dqnamo), *Line Draw SVG* #18352 (pulkitxm), *Path drawing* #24528 (motion.dev) | `stroke-dashoffset` self-draw of any path | The mechanism we already own (`<DrawIcon>`, rule 1); nothing to port |
| shadcn #1289, coss #11447, Radix #1766, HeroUI #13836, Reshaped #17578, originui #662 / #660, Subframe #5900, Interfaces #11863, sean0205 #2369 | Radix/Base checkboxes: the indicator icon appears when checked | A switch-on — the colour flip the brief refuses; HeroUI's indeterminate and Reshaped's card composition are static states |
| *Select All* #24915 / #24957, *Nested Tree* #24923, *Parent Group* #24909 | Indeterminate parents over child lists | State logic; no motion, and no such list here |
| *Card Style Checkbox* #24954, *Checkbox Card* #5902, *Payment Method Card* #24917 | A bordered card that highlights when selected | Our card variant already is one |
| *Neobrutalism* #733, *Checkbox 02* #9530, *Todo List Item* #1138 | Styling; swipe-to-complete | Decoration, gestures we do not have |

Nothing beats a drawn check on the existing shared component: every animated candidate is a spring or the
Motion runtime, every plain one switches an icon on. So it is built there.

### 14.3 What changed

**One `<Checkbox>`, drawn.** A native `<input type="checkbox">` — so `required`, form data, keyboard, the
validation bubble and the checked state itself stay the browser's and flip the instant of the click — laid
invisibly (`opacity: 0`, `inset: 0`) over a box it is the `peer` of. The **wrapper** presses like a button
(`scale(.92)` in 60 ms, released at the fast beat, via `:has(.check-input:active)` — the codebase's
`has-[]` idiom). The tick is a `<path pathLength="1">` written **left to right** (`M4 12l5 5L20 6` — the
icon set's check runs from the tip, which would draw it backwards) and drawn by `stroke-dashoffset` 1 → 0
over the fast step, on a tint arriving at the same beat. Unticking un-draws it at the fast exit and the
tint follows. A second path, a dash, is the `:indeterminate` mark and draws on the same beat; when an
indeterminate box was checked, the tick gives way to it (tick out at the exit, dash in at the entrance).
Focus is a ring on the box (`peer-focus-visible`); hover darkens an unchecked border (`group-hover`).

**Two looks, four props.** `variant="card"` (default) is the bordered `.press-soft` row the emergency lists
had; `variant="inline"` is the box beside its label; `size="sm"` is a 16 px box for dense rows;
`align="start"` keeps the box on a wrapped label's first line; `label` is a `ReactNode`, so the consent
sentence keeps its two links; `onChange(checked: boolean)` like `<Toggle>`; everything else spreads onto
the input (`id`, `name`, `value`, `required`, `checked`, `defaultChecked`). The six straggler sites became
one-line calls; `TermsCheckbox` is now a thin wrapper that only fixes `id`/`name`/`required`.

**The look changed, on purpose.** Native `accent-color` gave a filled brand box with a white tick. A white
mark drawn on a fill that is itself mid-transition is invisible for its first frames — at 40 ms the fill is
65 % brand, and the draw is 70 % done by then — so the draw could not read as drawn. Considered and
rejected: the mark delayed 40 ms behind the fill (190 ms total, and the first third still masked); the mark
scaling in (rule 1: icons draw); an instant fill with the mark drawn on it (a stepped colour is reduced
motion's answer, not an interaction's). The checked look is now the app's own selected idiom, the picker
card's at box scale: brand border, brand-50 tint, brand-700 mark — visible from its first frame, and the
dark tokens re-light it (`#06212f` tint, `#84afd0` mark on the black surface).

**Timing, in the stylesheet.** `.check` / `.check-box` / `.check-box path` read only `--m-fast` and
`--m-exit-fast`. The rest state declares the exit durations and the checked state the entrance ones — as
`transition-duration` only, never the shorthand, so each direction has its own beat with no JavaScript and
the reduce block still wins. The mark is hidden by a stepped opacity as well as its offset (a round cap at
offset 1 leaves a dot at the path's start); on the way out the step waits two thirds of the exit, where the
retraction is 96 % done — at the full exit the cap sat as a speck for the last three frames of the film.

**Guarded.** `tests/motion-vocabulary.test.mjs`: every checkbox rule reads only the fast tokens; the mark
is a stroke that draws at `--m-fast` and un-draws at `--m-exit-fast`; state rules never re-declare the
shorthand; the wrapper presses with the 60 ms down-stroke; `.check`, `.check-box`, `.check-box path` and
the press are in the reduce block.

### 14.4 Rules added (continuing §13)

34. **A checkbox is press feedback.** Its box presses like a button (60 ms down, released at the fast beat)
    and its mark answers at the fast step, clamped; unchecking leaves at the fast exit. Nothing about a
    checkbox reads the scale, and the state flips before any of it plays.
35. **A control's mark is drawn, never switched on, and it is visible from its first frame.** It is
    drawn in a colour that reads on the surface it lands on, not on a fill that is itself arriving. Rule
    8's 18 px floor governs the 700 ms icon draw; a two-segment tick over 150 ms at 12–14 px reads as a
    tick being made, not as a glyph flickering in (measured, 14.5).
36. **State rules set durations, never the shorthand.** A `:checked` rule that re-declares `transition`
    outranks the reduce block's `transition: none` and brings the motion back for the one visitor who
    asked for none (measured before the fix: the draw ran under reduced motion). The rest state carries the
    exit beat, the state the entrance beat; both as `transition-duration`.
37. **The press lives on an element the state does not style.** A state that flips while the finger is
    still down — a tap — must not borrow the press's 60 ms: measured on a 390 px tap before the fix, the
    tint left in 60 ms instead of 100. The wrapper presses; the box and the mark keep their own beats.

### 14.5 Verification (2026-09-06, dev server on 3001, 1100 × 800 unless stated)

Harness in the session scratchpad (`check.js`, filmed at DPR 2 through the CDP screencast; `db.mjs`
creates and removes the `[row-check]` service it needs; `sheet.js` the contact sheet). 65 checks across
eleven scenarios, all passing; the seven `npm test` failures seen on the way were the server-bound tests
defaulting to port 3000 with nothing listening there (108/108 with `BASE_URL` on 3001).

- **Every checkbox is the shared component.** Audited in the browser: sign-up (1), Services settings and
  step 5 (10 boxes + the prices toggle), Hours settings and step 3 (14), Emergencies settings and step 6
  (6), the restaurant's Menu (10 + 3 toggles), auto repair's Urgent cases (4): no `<input type="checkbox">`
  outside the component remains, and on every one the pointer hits the input over the box.
- **Beat for beat, "Offered" against a Save press** (same clock, sampled every frame; release columns from
  the release, state columns from the click): tick draw 0 / .44 / .72 / .87 / .94 / .98 / .99 / 1 at 0 /
  17 / 33 / 50 / 67 / 83 / 100 / 117 ms, box release .44 / .71 / .86 / .94 / .97 / .99 / 1, button release
  .43 / .73 / .87 / .93 / .97 / 1 / 1 — one curve, worst gap 0.021; tint .45 / .70 / .85 / .95 / 1. The
  button's release is credited to its first frame 29 ms after its mouseup and the box's 5 ms (a composited
  transform starts a frame or two later than a main-thread one; pre-existing, and true of every `.press`).
  Uncheck: un-draw .60 / .87 / .96 / .99 / 1 at 33 / 50 / 67 / 83 / 100, settled ~110 vs the check's ~150.
  The contact sheet (`out/frame-series.png`) shows the held press, check, uncheck, a keyboard check and the
  button press on the same twelve beats.
- **The state is the browser's.** `input.checked` and the form's hidden `services` JSON read the new value
  at the first frame after the click (t = 5–16 ms), every time. A probe row's "Quote it" ticked and the
  form submitted **64–68 ms later** — inside the 150 ms draw — reached the server as `canQuote: true`, and
  the reload rendered it drawn. The consent box: `id`/`name`/`required` intact, the form invalid until
  ticked, `FormData` carrying `acceptTerms=on` at the first frame, both links still inside the label.
- **Keyboard.** Tab lands on the box with a visible ring; Space held presses it (.92) exactly like the
  pointer, and its dash series matches the click's within 0.035 at every beat (1 / .56 / .28 / .13 /
  .02 / .00 / 0 at 0 / 17 / 33 / 50 / 83 / 117 / 150).
- **The card variant.** Pressing the row's *text*, 40 px from the box: the label activates the input, so
  the box presses (.92) and the row presses with it (.99, 1 px), and the mark draws at 150.
- **Indeterminate** (set by script — nothing in the app sets it): the dash draws at 150 on the tint, the
  tick hidden, settled in 151 ms.
- **Reduced motion:** no press while held (scale 1), both directions complete at the first frame with no
  transition running. **390 px tap:** the state flips at the first frame and the un-draw runs at 100.
  **Dark:** tint `rgb(6,33,47)`, mark `rgb(132,175,208)`, surface black, gray border `rgb(69,69,69)`.
- `npm test` 108/108, goldens byte-identical, `eslint` and `tsc --noEmit` clean.

Left as found, flagged: the profession picker's check draws at the **slow** beat (720 ms, §8.2's recorded
choice) while every checkbox now answers at 150 — the one click-answer in the app slower than the fast
step; the picker is a radio group, so it was not migrated. And `<Toggle>` still has no visible focus ring
(its input is `sr-only` and the track carries none) — the checkbox got one; the toggle did not, today.
