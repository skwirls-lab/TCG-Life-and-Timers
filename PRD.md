# PRD — TCG Life & Timers (working title)

| Field | Value |
|---|---|
| Document | Product Requirements Document |
| Version | 0.3 (draft for owner review). v0.2 added the full Settings spec (§13.1) and the selectable seat count (LAY-001, LAY-009). v0.3 expands History & Stats (§12), Tools / Dice & Misc / Mana counter (§16), adds Decks (PROF-010), and sets the free vs. Pro split (§17.2). |
| Date | 2026-11-01 |
| Owner | John (skwirls) |
| Status | **Draft: awaiting review.** After sign-off, this PRD becomes the input for `instructions.md` (execution plan with loops and gates). |

---

## 0. How to read this document

- Every requirement has a **stable ID** (e.g. `TMR-012`), a **priority**, and a **phase**. `instructions.md` will cite these IDs so every build step and gate traces back to one requirement.
  - **P0**: must ship in the MVP. The app is not usable without it.
  - **P1**: ships in v1.0 (public launch).
  - **P2**: after launch, or premium expansion.
- **Phases** (see §20): `M0` Foundation → `M1` Core board and MTG → `M2` Timers → `M3` Multi-TCG presets and custom builder → `M4` Auth and sync → `M5` Art (Scryfall and uploads) → `M6` History and stats → `M7` Monetization → `M8` Hardening and launch.
- Requirements marked **⚠ VERIFY** contain game-rule numbers I am not fully sure are current. They must be checked against official rules before launch. All such values live in preset data, not code, so changing them later is cheap.
- **"Seat"** means a player position on the physical device. **"Player"** means the person in that seat. **"Preset"** means a game configuration (e.g. "MTG Commander").
- §22 lists **open questions** that need your decisions. Recommended defaults are given so the build is never blocked.

---

## 1. Summary

A mobile-first **Progressive Web App** that combines a **full-featured TCG life/counter tracker** (on par with LifeTap for Magic: The Gathering) with **multiplayer chess-style turn timers** on one shared device. The phone or tablet lies in the middle of the table. Each player has a seat on screen, rotated to face them, where they track life and counters and control their own clock.

The app is MTG-first but **game-agnostic**: every game is a data-driven **preset** made of counter definitions, win/loss rules, layout defaults and timer defaults. Built-in presets cover MTG formats, Pokémon TCG, Yu-Gi-Oh!, Final Fantasy TCG, and several others. A **custom preset builder** lets users define any game, and it is the basis for premium features.

Hosted on **Firebase App Hosting**, with **Google sign-in** for cloud sync of profiles, presets, art and game history. Each user's data is strictly separated. The app is **fully usable offline and without an account**.

## 2. Problem statement

- Players who want both life tracking and turn clocks today need **two apps on two devices**, or a phone plus a physical chess clock. Neither handles multiplayer (3–6 players) or "responding out of turn".
- Chess clocks assume strict alternating turns. TCGs, especially MTG, have **out-of-turn interaction** (instants, triggered abilities, priority passes). The time a player spends thinking about a response should be charged to the responder, not to the active player.
- Slow play is a real social problem in casual Commander pods. A lightweight, fair, opt-in clock helps without needing a judge.
- Life apps are MTG-centric and hard-code MTG concepts. Players of other TCGs (or homebrew games) get poor support.

## 3. Goals and non-goals

### 3.1 Goals
1. **G1:** Life and counter tracking for MTG that is at least as good as LifeTap (see the reference screenshots): life, poison, commander damage per opponent and per commander, commander tax, monarch, initiative, day/night, energy, experience, treasure, rad, city's blessing, and more.
2. **G2:** Multiplayer chess clocks with **turn passing** and **priority/response handoff**, tied to the life board on the same screen.
3. **G3:** A game-agnostic preset engine, with built-in presets for at least 6 TCGs and a custom builder.
4. **G4:** Mobile-first, installable, offline-first PWA. Opens in under 2 s on a mid-range phone and stays awake during play.
5. **G5:** Google auth with per-user data isolation and cross-device sync. Guest mode works without an account.
6. **G6:** Personalization: player names, saved player profiles, Scryfall card art, uploaded images, colors.
7. **G7:** A monetization-ready architecture: entitlement-gated features, with billing added in a later phase.

### 3.2 Non-goals (v1)
- Online or remote play across multiple devices (one shared device only; see §21 for the future "multi-device mirror" idea).
- Deck building, card collection management, card price tracking.
- Rules enforcement or a rules engine. The app tracks numbers; players apply the rules.
- Tournament pairing and event management.
- Native iOS/Android store apps. A Trusted Web Activity wrapper for Google Play is a P2 consideration.
- Full MTG phase/step tracking (untap, upkeep, combat steps) is P2 and premium.

## 4. Target users and personas

| Persona | Description | Key needs |
|---|---|---|
| **Casual Commander pod** (primary) | 4 friends, weekly game night, one phone in the middle | Fast setup, commander damage, art, names, an optional clock to stop slow play, easy reset with random starter |
| **Competitive 1v1 player** | Plays Modern/Pioneer/Standard or other TCGs at locals | 2-player layout, accurate chess clock with increment, match timer |
| **Multi-TCG player** | Plays Pokémon, Lorcana, One Piece and MTG | Switch presets quickly, game-specific counters |
| **Homebrew / niche game player** | Plays games with no tracker | Custom preset builder |
| **Store organizer / content creator** (P2) | Runs casual events or streams | Large readable display, themes, stats export |

## 5. Platform and technical architecture

### 5.1 Recommended stack

| Layer | Choice | Rationale |
|---|---|---|
| Hosting | **Firebase App Hosting** | You asked for it. It supports Next.js natively, with a GitHub-connected rollout. **It requires the Blaze (pay-as-you-go) plan.** |
| Framework | **Next.js (App Router) + React + TypeScript (strict)** | A first-class App Hosting framework. The game board is fully client-side; server rendering only helps marketing and landing pages. |
| Styling | Tailwind CSS + CSS variables for theming | Fast to build, good for responsive and rotated layouts |
| State | **Zustand** store + a pure **event-sourced game reducer** | Deterministic, testable, gives undo and history for free |
| Local persistence | **IndexedDB via Dexie** | Active game, profiles, presets, art blobs, history; works offline |
| Service worker | **Serwist** (`@serwist/next`) | Maintained successor to next-pwa: precache, runtime caching, offline |
| Auth | **Firebase Authentication**: Google provider (+ anonymous for guests) | Required by brief |
| Database | **Cloud Firestore** with offline persistence | Sync of profiles, presets, history, settings |
| File storage | **Cloud Storage for Firebase** | Uploaded art |
| Billing (M7) | **Stripe** via the Firebase "Run Payments with Stripe" extension | Works for web/PWA. See §17. |
| Analytics | Firebase Analytics (consent-gated) | Funnel and feature usage |
| Errors | Firebase Crashlytics doesn't support web, so use **Sentry** (free tier) | Client error reporting |
| Testing | Vitest (unit), Playwright (e2e, mobile viewports), Firebase Emulator Suite (rules), Lighthouse CI | Feeds the quality gates in `instructions.md` |

> **Alternative noted:** Because the app is almost entirely client-side, plain **Firebase Hosting** with a static export would also work, and would be cheaper and simpler. App Hosting is kept as the recommendation because you asked for it and it leaves room for server features later (share links, OG images, Stripe webhooks). See open question Q1.

### 5.2 Architectural principles
- **ARCH-001 (P0, M0):** **Offline-first.** Every in-game feature works with no network. Network is needed only for sign-in, sync, Scryfall search, and purchase.
- **ARCH-002 (P0, M0):** **The game engine is pure TypeScript with no React or browser dependencies.** It is a reducer `(GameState, GameAction) → GameState`, plus pure timer math. It is 100% unit-testable.
- **ARCH-003 (P0, M0):** **Presets are data (JSON/TS objects validated by a schema such as Zod), not code.** No game-specific `if (game === 'mtg')` branches in UI components. The UI renders from counter definitions.
- **ARCH-004 (P0, M1):** **Event log.** Every state change is an action appended to the game's log. Undo means replaying the log without the last N actions, or applying a stored inverse. History views are derived from the log.
- **ARCH-005 (P0, M2):** **Timer state is timestamp-based**, never accumulated from `setInterval` ticks. Remaining time = `bank − (now − runningSince)`. Rendering uses `requestAnimationFrame` or a 100–250 ms interval only for display. This survives tab backgrounding, throttling, reloads, and device sleep.
- **ARCH-006 (P0, M1):** **Active game state is persisted to IndexedDB** on every committed action (debounced at most 250 ms) and restored on load. A crash or refresh must never lose a game.
- **ARCH-007 (P1, M4):** **Cloud sync is additive.** The local store is the source of truth for the active game. Firestore syncs durable entities (profiles, presets, settings, completed games). Active games are **not** synced in real time in v1.
- **ARCH-008 (P0, M0):** **Entitlements module.** One `can(feature)` function gates premium features from day one, backed by a hard-coded "everything free" policy until M7.

### 5.3 Supported environments
- **ENV-001 (P0):** Android Chrome (latest two versions) and iOS Safari 16.4+ (installed to Home Screen and in-browser). Tablets in both orientations.
- **ENV-002 (P1):** Desktop Chrome, Edge, Safari and Firefox. Usable, but not optimized.
- **ENV-003 (P0):** Minimum viewport 320×568 CSS px. The 2–4 player layouts must be fully usable at 360×740.
- **Known platform limits to design around:**
  - iOS Safari has **no Vibration API**. Haptics are Android-only, so every haptic cue must have a visual (and optional audio) equivalent.
  - **Screen Wake Lock API** support in iOS Home-Screen PWAs only became reliable in recent iOS versions. Provide a fallback (a silent looping video, as the NoSleep.js technique does) behind a setting.
  - Audio requires a user gesture first. Unlock the audio context on the "Start game" tap.
  - `screen.orientation.lock()` is unsupported on iOS. The design must work in whatever orientation the device is in; the app does not depend on orientation locking.

## 6. Domain model

### 6.1 Core concepts

```
Preset ──< CounterDefinition
  │            (scope: player | playerVsOpponent | global | token)
  ├── LossRules / WinRules
  ├── TimerDefaults
  └── LayoutDefaults

Game ──< Seat ──> PlayerProfile (optional)
  ├── PresetSnapshot (frozen copy of preset at game start + per-game overrides)
  ├── CounterValues (keyed by counterId × seatId [× sourceSeatId × sourceIndex])
  ├── TimerState
  ├── TurnState (turnOrder, activeSeat, turnNumber, roundNumber)
  └── EventLog
```

### 6.2 Counter definition (the heart of game agnosticism)

Every number the app tracks is a `CounterDefinition`:

```ts
type CounterScope =
  | 'player'             // one value per seat (life, poison, energy)
  | 'playerVsOpponent'   // matrix: value per (target seat × source seat × source index) — commander damage
  | 'global'             // one value for the whole game (day/night, Digimon memory gauge, turn count)
  | 'token';             // exclusive marker held by at most one seat (monarch, initiative)

type CounterKind =
  | 'number'             // integer counter
  | 'boolean'            // on/off per seat (e.g. city's blessing, "VSTAR power used")
  | 'enum'               // cycle through states (day/night/none; Pokémon special conditions)
  | 'token';             // see scope 'token'

interface CounterDefinition {
  id: string;                    // stable, e.g. 'mtg.poison'
  name: string;                  // display, e.g. 'Poison'
  shortName?: string;            // e.g. 'C.Tax' for small badges
  icon: IconId;                  // from built-in icon set; custom presets pick from list
  kind: CounterKind;
  scope: CounterScope;
  isPrimary?: boolean;           // the big number on the seat (life, lore, prizes). Exactly one per preset.
  start: number;                 // starting value (overridable per game)
  min?: number | null;           // null = unbounded
  max?: number | null;
  step: number;                  // tap step (default 1; Yu-Gi-Oh LP might use 100)
  holdStep?: number;             // step while press-and-hold repeats (default 10 for life)
  direction: 'up' | 'down';      // which way "progress toward the threshold" goes; drives UI emphasis
  enumValues?: string[];         // for kind 'enum'
  sourcesPerOpponent?: number;   // for playerVsOpponent; 1 normally, 2 for partner commanders
  linkedTo?: {                   // side effects
    counterId: string;           // e.g. commander damage also changes life
    factor: number;              // -1 → +1 cmd damage applies −1 life
    optional: true;              // user setting can disable the link
  };
  threshold?: ThresholdRule;     // win/loss condition
  visibility: 'board' | 'badge' | 'panel'; // big on seat | small badge on seat when non-default | only in counters panel
  showWhenDefault?: boolean;     // badges hidden while at start value unless true
  enabledByDefault: boolean;     // optional counters can be toggled on per game
  description?: string;          // help text
}

interface ThresholdRule {
  comparator: '<=' | '>=';
  value: number;                 // e.g. life <= 0, poison >= 10, cmd damage >= 21 (from a single source)
  outcome: 'lose' | 'win';
  perSource?: boolean;           // playerVsOpponent: evaluate each source independently (commander damage)
  autoApply: 'auto' | 'prompt' | 'off'; // auto-mark eliminated, ask, or ignore
}
```

- **CTR-001 (P0, M1):** The board, counters panel, badges, history and stats render **only** from `CounterDefinition` data.
- **CTR-002 (P0, M1):** Every counter value is clamped to `[min, max]` when those are set.
- **CTR-003 (P0, M1):** Threshold rules are evaluated after every action. When a rule triggers with `autoApply: 'auto'`, the seat is marked **eliminated** (or **winner**), and the event log records the cause (e.g. "Eliminated: 21 commander damage from Conner").
- **CTR-004 (P0, M1):** Elimination can be reversed. If a counter moves back across the threshold (e.g. life gained back above 0 after a misclick), the seat is automatically revived, or revived with a prompt, depending on the setting.
- **CTR-005 (P1, M3):** `linkedTo` side effects (e.g. commander damage → life loss) are applied atomically in a single action, so one undo reverts both.

### 6.3 Game state (abridged)

```ts
interface Game {
  id: string;
  createdAt: number; startedAt?: number; endedAt?: number;
  preset: PresetSnapshot;          // frozen definitions + overrides (e.g. life 30 instead of 40)
  seats: Seat[];                   // ordered clockwise around the table == default turn order
  layoutId: LayoutId;
  values: Record<CounterKey, number>; // CounterKey = `${counterId}|${seatId}|${sourceSeatId?}|${sourceIdx?}`
  tokens: Record<counterId, seatId | null>;
  turn: { order: SeatId[]; firstSeat: SeatId; activeSeat: SeatId; turnNumber: number; round: number };
  timer: TimerState;               // §9
  status: 'setup' | 'ready' | 'running' | 'paused' | 'ended';
  result?: { winners: SeatId[]; eliminated: { seatId: SeatId; cause: string; at: number }[] };
  log: GameEvent[];
}

interface Seat {
  id: SeatId;
  name: string;
  profileId?: string;
  art?: ArtRef;                    // scryfall | upload | gradient | solid
  color: string;                   // accent color
  teamId?: string;                 // P2: Two-Headed Giant etc.
  eliminated: boolean;
  rotation: 0 | 90 | 180 | 270;    // derived from layout, user-overridable
}
```

## 7. Game board and layouts

### 7.1 Layouts
The board fills the whole viewport with no browser chrome when installed. Seats are tiles. Each tile's contents are rotated to face the player sitting on that side of the device. A **center toolbar** sits between seat rows (as in LifeTap screenshot 1).

- **LAY-001 (P0, M1):** The **number of seats is user-selectable for every game**: **2–6** for all users (matching LifeTap), plus **1** via One-player mode (SET-032), and **7–8** as P1 (proposed Pro, Q8). Each preset limits the range with `minPlayers`/`maxPlayers` (e.g. 1v1-only formats can still allow 2–4 for casual multiplayer). The count can be changed from the Settings "Players" chip row (§13.1-A), from the toolbar player-count button, and in the setup flow. Changing it mid-game resets with confirmation (SET-011).
- **LAY-009 (P1, M1):** **Add/remove a seat mid-game without a full reset** (e.g. a late-arriving player): a new seat gets the preset start values and is inserted into the turn order at its position. Removing a seat counts as a concession and is recorded in history.
- **LAY-002 (P0, M1):** Default layouts (portrait device):

| Players | Default layout | Rotations |
|---|---|---|
| 1 | Single full-screen tile (goldfishing/solo) | 0° |
| 2 | Top/bottom halves, facing each other | 180° / 0° |
| 3 | One top tile + two side-by-side bottom tiles, **or** one tile on each long side + one at the bottom | Variant-dependent |
| 4 | **2×2 grid, left column rotated 90°, right column rotated 270°** (matches LifeTap screenshot) | 90/270 |
| 4 (alt) | 2 top (180°) + 2 bottom (0°) | 180/0 |
| 5 | 2 left (90°) + 2 right (270°) + 1 bottom or top (0°/180°) | mixed |
| 6 | 3 left (90°) + 3 right (270°) | 90/270 |
| 7–8 | 4+3 / 4+4 split along both long sides | 90/270 |

- **LAY-003 (P0, M1):** Each player count offers 1–3 **layout variants**, chosen in setup or from the player-count menu in the toolbar.
- **LAY-004 (P1, M1):** **Manual seat rotation override**: long-press a seat's settings, then "Rotate seat" cycles 0/90/180/270.
- **LAY-005 (P0, M1):** **Seat reordering**: in setup (and from the board menu), drag seats to match where people physically sit. Seat order, clockwise around the device, **defines the turn order**.
- **LAY-006 (P0, M1):** Landscape device orientation is supported. Layouts re-flow (e.g. 4 players becomes 2 top + 2 bottom).
- **LAY-007 (P0, M1):** Tile visuals: rounded corners, full-bleed background art with an automatic dark scrim for legibility, the name tag in a pill (as in the screenshots), the primary counter as a very large number, and `+` / `−` affordance glyphs at the tile ends.
- **LAY-008 (P0, M1):** Typography scales with tile size. The primary number is as large as possible while still fitting 3 digits plus sign (or 5 digits for Yu-Gi-Oh 8000 LP).

### 7.2 Center toolbar
The toolbar sits between seat groups. It is compact and icon-only, with labels shown on long-press. From the screenshot, adapted:

| Icon | Action | Req |
|---|---|---|
| ⟳ Reset | Reset / new game (§8.6) | GAME-010 |
| (n) Player count | Change player count / layout | LAY-003 |
| 🕒 History | Life / event history (§12) | HIST-001 |
| ▶/⏸ Clock | Start game / pause all clocks (only when timers are enabled) | TMR-020 |
| 🎲 Tools | Dice, coin, random player, (P2) planechase | TOOL-001 |
| ⚙ Settings | Full settings screen (§13.1) | SET-001, SET-010 |
| ☀/☾ (contextual) | Day/Night global state (MTG). Shown only when enabled. | CTR (MTG) |

- **LAY-010 (P0, M1):** The toolbar orientation follows the layout: a horizontal strip for 2×2 and side layouts, or a central pill for 2-player.
- **LAY-011 (P1, M1):** Toolbar actions that destroy state (reset, change player count) require confirmation (a hold-to-confirm or confirm dialog).

### 7.3 Touch and input handling (critical for a shared device)
- **INP-001 (P0, M1):** **Multi-touch independence.** Four people tapping four different seats at the same moment must all register. Use Pointer Events with per-pointer tracking, never a single global "current touch".
- **INP-002 (P0, M1):** Disable double-tap zoom, pinch zoom, pull-to-refresh, text selection, the long-press context menu, and the iOS callout on the board (`touch-action: manipulation`, `user-select: none`, `overscroll-behavior: none`, `-webkit-touch-callout: none`).
- **INP-003 (P0, M1):** Each seat tile is split into a **"+" half and a "−" half** along its long axis, relative to the player's rotation. Tapping anywhere in a half applies ±step, so it is not limited to the glyph. This is the LifeTap pattern.
- **INP-004 (P0, M1):** **Press-and-hold** (default 500 ms) applies `holdStep` (default ±10), then repeats every 400 ms while held. Hold delay and repeat rate are configurable.
- **INP-005 (P1, M1):** **Swipe** up/down on the primary number (relative to rotation) is an alternative ±1. This is a setting and is off by default to avoid accidental input.
- **INP-006 (P0, M1):** A **pending-change bubble** ("−3", "+7") appears beside the number. It accumulates consecutive taps and fades after **2 s** of no input. It then commits as **one** history entry (e.g. "Conner: 24 → 21 (−3)"). The underlying value updates immediately; only the history entry is batched.
- **INP-007 (P1, M3):** **Direct entry / calculator mode**: tap the number itself (configurable) to open a keypad. Enter `−1500`, `+800`, `/2` (halve, rounded up, for Yu-Gi-Oh), or `=4000`. Essential for Yu-Gi-Oh.
- **INP-008 (P0, M1):** Tap feedback: a scale/flash micro-animation (respecting `prefers-reduced-motion`), an optional haptic tick on Android, and an optional click sound.
- **INP-009 (P0, M1):** Interactive zones are at least 48×48 CSS px. The seat settings button (the name pill) and the timer controls are visually distinct from the +/− zones so they are hard to hit by accident.

## 8. Life and counter tracking: features

### 8.1 Seat tile anatomy

```
┌─────────────────────────────────────────┐
│ [timer chip 12:34 ▶]        [⚡Respond] │ ← timer row (only when timers enabled)
│                                         │
│   −            40             +         │ ← primary counter, huge
│              (−3)                       │ ← pending-change bubble
│ [Name pill]                             │ ← tap = seat menu
│ [cmd-dmg mini grid]  [badges: ☠3 💰2 👑]│ ← commander damage summary + active badges
└─────────────────────────────────────────┘
(The whole tile is rotated to face its player.)
```

- **LIFE-001 (P0, M1):** The primary counter shows in the center of the tile, very large.
- **LIFE-002 (P0, M1):** **Badges** show secondary counters with non-default values (e.g. poison 3, treasure 2, C.Tax 1), each with an icon and value. This matches the screenshot, where JP's tile shows the commander-tax castle icon and "1".
- **LIFE-003 (P0, M1):** Tapping a badge opens the counters panel focused on that counter.
- **LIFE-004 (P0, M1):** The **eliminated state** shows a large skull overlay and desaturated art (as in Josh's tile in the screenshot). The seat stays interactive so mistakes can be corrected.
- **LIFE-005 (P1, M1):** A **winner state** with a crown/trophy overlay and a confetti animation (reduced-motion aware).
- **LIFE-006 (P0, M1):** The **first-player / active-turn indicator** is a glowing border or a small "▶ Turn 3" chip on the active seat. It shows even when timers are off, if turn tracking is enabled.

### 8.2 Seat menu (tap the name pill)
A bottom sheet **rotated to face the seat's player**. The LifeTap screenshots show the sheet rendered sideways for JP; we do the same. It has tabs:

1. **Player:** name field, **Load** a saved profile, **Save as profile**, background picker (**Backgrounds** = art via Scryfall or upload; **Colors** = gradients/solids), "Increase contrast" toggle (stronger scrim), seat rotation override.
2. **Counters:** a grid of all available counters for the preset (Monarch, Initiative, Ascend, Day/Night, Energy, Exp, Treasure, Poison, Rad, C.Tax, K.O. …). Counters with a non-default value are highlighted. **Tap = increment, hold = options** (decrement, reset, set exact value, enable/disable for this game). The helper text "Tap to increment. Hold for additional options." matches the screenshot.
3. **Commander damage:** a grid of opponent tiles (thumbnail art + name). For partners, each tile is split into two halves. Tap = +1 damage *received from* that commander, hold = options (−1, set, reset). The seat's own tile shows **"me"** and is used to track **self-inflicted** commander damage, as LifeTap does.
4. **Timer** (when timers are enabled): remaining time, time used, add/remove time (with confirmation; judge/house-rule adjustment), "Concede", and "Eliminate/Revive".

- **SEAT-001 (P0, M1):** The seat menu has the Player and Counters tabs.
- **SEAT-002 (P0, M1):** Commander damage tab (MTG commander-type presets only).
- **SEAT-003 (P0, M2):** Timer tab.
- **SEAT-004 (P0, M1):** **Concede**: marks the seat eliminated, cause = "Conceded".
- **SEAT-005 (P0, M1):** The menu closes with X, a tap outside, or Android back (via history state). The board underneath dims, as in the screenshot.

### 8.3 Commander damage (detail)
- **CMD-001 (P0, M1):** The damage matrix is tracked per **target seat × source seat × source commander index**.
- **CMD-002 (P0, M1):** The **on-tile mini grid** mirrors the LifeTap pattern from the screenshot. It shows one small cell per seat at the table, laid out spatially to match the board, each with that seat's art thumbnail and the damage received from it. The owner's own cell shows "me". The mini grid is **always visible** in Commander-type presets, and tapping it opens the commander damage tab.
- **CMD-003 (P0, M1):** **Partner / Background / Friends Forever support.** In setup or seat options, a seat can declare **2 commanders**. Damage from each is tracked separately, and the loss threshold (21) applies **per commander**.
- **CMD-004 (P0, M1):** **Auto-life-link** setting (default **ON**): adding commander damage also subtracts the same amount of life from the target. Removing it restores life. This is one atomic action (CTR-005).
- **CMD-005 (P0, M1):** **Threshold**: 21 or more from any single commander means loss. The value can be overridden per game.
- **CMD-006 (P1, M1):** **Quick commander-damage mode**: a toolbar toggle turns every tile into "commander damage view". Each tile shows the opponent grid directly, so a big combat step can be entered without opening menus.

### 8.4 Commander tax
- **CMD-010 (P0, M1):** Commander tax is a counter per commander (×2 for partners). **Each tap adds one cast**, and the display shows the **tax amount** (casts × 2), e.g. "C.Tax 4 (2 casts)". Matches the `C.Tax 1` cell in the screenshot.
- **CMD-011 (P1, M3):** **Oathbreaker** tracks tax separately for the Oathbreaker and the Signature Spell.

### 8.5 Global and token counters (MTG)
- **TOK-001 (P0, M1):** **Monarch** and **Initiative** are `token` scope. Giving one to a seat removes it from any other seat. The holder's tile shows a crown or initiative badge. Tapping the token in another seat's counters panel **transfers** it.
- **TOK-002 (P1, M1):** **Initiative** optionally tracks Undercity room progress (enum: Secret Entrance → Forge/Lost Well → Trap!/Arena/Stash → Archives/Catacombs → Throne of the Dead Three). This is P2 if time is short.
- **TOK-003 (P0, M1):** **Day/Night** is a `global` enum: *Neither → Day → Night → Day…*. Once day/night has started it never returns to *Neither*, except by reset or explicit hold-option. It shows as a sun/moon in the center toolbar.
- **TOK-004 (P1, M1):** **City's Blessing (Ascend)** is a per-player boolean. It is permanent once gained (the hold-menu allows a manual undo).
- **TOK-005 (P2):** **Dungeon / Venture** progress per player (Tomb of Annihilation, Lost Mine of Phandelver, Dungeon of the Mad Mage, Undercity) is P2.

### 8.6 New game / reset
- **GAME-001 (P0, M1):** The **setup flow** is launcher → choose preset → player count and layout → seats (names, profiles, art, reorder) → options (starting life override, which optional counters are enabled, timer config) → **Start**. The last configuration is remembered, and **"Quick start: same as last game"** is one tap from the launcher.
- **GAME-010 (P0, M1):** The **Reset** button resets all counter values, tokens, eliminations, timers and the turn state to preset/game defaults. It **keeps** player names, art, seat order, layout, and enabled counters. It requires confirmation (hold-to-confirm 1 s, or a dialog).
- **GAME-011 (P0, M1):** **Random first player on every reset/new game.** An animation (a highlight cycles around the seats and decelerates, ~1.5–2 s, skippable with a tap) lands on the starter. That seat becomes **Player 1 / active seat**, and turn order proceeds **clockwise** from it.
- **GAME-012 (P1, M1):** First-player options in game settings: **Random** (default), **Choose manually**, **Loser of previous game** (or the player eliminated first), **Winner of previous game**, **Roll-off** (each seat gets a d20 roll shown on its tile; ties reroll).
- **GAME-013 (P0, M1):** Starting values can be overridden per game (e.g. Commander at 30 life, poison threshold 15). This is the "customize totals" requirement.
- **GAME-014 (P0, M1):** **Game end detection**: when only one seat (or one team) is not eliminated, show the **game over** overlay (winner, duration, turns, timer stats) with **Rematch** (= reset with a random or loser-first starter), **New setup**, and **Save/Discard** for history (auto-save by default).
- **GAME-015 (P0, M1):** **Undo / redo** comes from the toolbar history (last 50 actions at minimum), plus a 5 s snackbar "Undo" after destructive actions (reset, eliminate, pass turn).
- **GAME-016 (P0, M1):** **Resume game.** On app open with an unfinished game, show "Resume game (Commander · 4 players · 34 min)" or "New game".

## 9. Timers (chess-clock system)

This is the differentiating feature. It must be **fair, accurate, hard to misuse by accident, and readable from across the table.**

### 9.1 Concepts
- **Turn holder (active player):** the seat whose turn it is.
- **Clock holder (priority holder):** the seat whose clock is currently running. Normally this is the turn holder. During a response it is the responder.
- **Response stack:** an ordered list of seats who have taken priority out of turn. The top of the stack holds the clock.
- **Bank:** a seat's remaining time.

### 9.2 Timer modes (chosen per game; default comes from the preset)

| Mode | Description | Example config | Priority |
|---|---|---|---|
| **Off** | No clocks. Turn tracking can still be on (the active-seat indicator and turn counter). | — | P0 |
| **Chess clock (bank)** | Each seat has a time bank that counts down only while that seat holds the clock. | 20 min each | P0 |
| **Chess clock + increment (Fischer)** | Bank plus N seconds added on each turn pass. | 15 min + 10 s | P1 |
| **Chess clock + delay (Bronstein / simple delay)** | The first N seconds of each hold are free. | 15 min, 5 s delay | P2 |
| **Per-turn timer** | Each turn gets a fixed allotment that resets when passed; unused time is lost. | 3 min per turn | P1 |
| **Per-turn + bank (hybrid)** | The per-turn time runs first, then eats into the bank (byo-yomi style). | 2 min/turn + 10 min reserve | P2 |
| **Count-up (stopwatch only)** | No limit. Tracks time used per seat for stats and social pressure. | — | P0 |
| **Match / round timer (overlay)** | One global countdown (e.g. 50 min tournament round) shown in the toolbar. **Can be combined** with any per-seat mode. | 50 min | P1 |

### 9.3 Core flows
- **TMR-001 (P0, M2):** **Pre-game state.** With clocks configured, the board shows a big **"START"** button in the toolbar area and a "Waiting to start" chip on every seat. Life tracking works before the clocks start (e.g. for mulligan decisions).
- **TMR-002 (P0, M2):** **Start.** Tapping START begins the first player's clock (the seat picked by GAME-011). It also unlocks audio and requests the wake lock.
- **TMR-003 (P0, M2):** **Pass turn.** The active seat shows a large **"PASS TURN"** control at its edge (the timer chip expands into a button). Tapping it stops their clock (and applies the increment if configured), advances `activeSeat` to the next **non-eliminated** seat clockwise, starts that seat's clock, and increments `turnNumber` (and `round` when it wraps past the first player).
- **TMR-004 (P0, M2):** **Pass-turn safety.** The default is a single tap followed by a 3 s **undo snackbar** on the passing seat ("Passed to Josh · Undo"). A setting enables **hold-to-pass** (600 ms) instead, for groups that misclick. Undo restores the clocks to their exact state as if the pass had not happened (the time elapsed since the pass is charged to the original holder).
- **TMR-005 (P0, M2):** **Respond / take priority.** Every non-clock-holding, non-eliminated seat shows a **"⚡ Respond"** button while clocks run. Tapping it:
  1. Pauses the current clock holder's clock.
  2. Pushes the responder onto the response stack and starts the responder's clock.
  3. Shows a banner on all seats: "⚡ Bethany responding" with an elapsed timer, so everyone knows whose time is being spent.
- **TMR-006 (P0, M2):** **Pass back.** The current responder's button changes to **"↩ Pass back"**. Tapping it pops them off the stack and resumes the clock of the previous holder (either the previous responder or the turn holder).
- **TMR-007 (P0, M2):** **Nested responses.** While a response is in progress, any other seat, **including the turn holder**, can tap Respond to push onto the stack (MTG players respond to responses). The stack depth is shown as a small indicator ("⚡×2").
- **TMR-008 (P0, M2):** **Return to active player.** A secondary action, available in the banner and on the turn holder's seat, clears the whole stack and resumes the turn holder's clock. This is the common "everything resolved, back to you" case.
- **TMR-009 (P0, M2):** **Pass turn is disabled while the stack is non-empty**, with a tooltip saying "Resolve responses first". Alternatively, the turn holder holding the clock again via the stack may pass. A pass from the turn holder while they are the stack top clears the stack.
- **TMR-010 (P1, M2):** **Response time accounting option**: *Charge responder* (default, as described above) **or** *Freeze all* (a response pauses every clock; nobody is charged). This suits groups who only want to stop the active player being punished.
- **TMR-011 (P0, M2):** Tapping the clock holder's own timer chip does nothing destructive. It shows remaining and used time large for 2 s.

### 9.4 Pause, adjust, and interruptions
- **TMR-020 (P0, M2):** **Global pause** (toolbar ⏸) freezes all clocks, including the match timer, and shows a full-screen-dim "PAUSED" overlay with a big Resume button. This covers pizza arriving, a judge call, or a rules lookup.
- **TMR-021 (P0, M2):** **Auto-pause** when the app is hidden (`visibilitychange`), for example when someone takes a call on the device. This is a setting, default ON, and it shows a "Paused because app was in background" notice. If it is OFF, time keeps elapsing correctly based on timestamps (ARCH-005).
- **TMR-022 (P1, M2):** **Manual time adjustment** per seat (+/− 30 s, 1 min, 5 min, or set exact) from the seat's Timer tab. The adjustment is logged in the event log with "adjusted" visible in history, to keep things honest.
- **TMR-023 (P0, M2):** **Elimination interplay.** When the clock holder is eliminated (by life, poison, commander damage, timeout or concession), their clock stops. If they were the turn holder, the turn passes to the next living seat. If they were in the response stack, they are removed and the clock returns to the next stack entry.
- **TMR-024 (P0, M2):** Changing counters never affects clocks, and vice versa.

### 9.5 Running out of time
Configurable per game (the preset sets the default):

| Option | Behaviour |
|---|---|
| **Lose immediately** | At 0:00 the seat is eliminated, with cause "Time". |
| **Grace period** (default for casual presets) | At 0:00 the seat enters **Overtime**: the tile border flashes red, and a separate grace countdown (default 60 s, configurable) runs while they hold the clock. Grace does not reset between turns unless configured. When grace ends, apply the final action (lose or flag). |
| **Flag only** | The clock keeps counting **negative** (−0:45) in red. Nobody is eliminated. It is social pressure only. |
| **Add time once** | At 0:00 the seat gets a one-time extension of N minutes (e.g. "+5 min, once per game"). Then the final action applies. |

- **TMR-030 (P0, M2):** Timeout options *Lose immediately*, *Grace period* and *Flag only* are P0. *Add time once* is P1.
- **TMR-031 (P0, M2):** **Warnings** at configurable thresholds (default 5:00, 1:00, 0:10). Warnings include a visual pulse on the tile, an optional sound, and an optional vibration. Under 10 s, the display shows tenths (`9.4`).
- **TMR-032 (P1, M2):** **Match timer end** (tournament style): when the round timer hits 0, show "TIME — Extra turns: N" (preset default, e.g. MTG 5 turns ⚠ VERIFY, Pokémon 3 turns ⚠ VERIFY). The app counts down the extra turns as turns are passed.

### 9.6 Display
- **TMR-040 (P0, M2):** The format is `m:ss` under 1 hour, `h:mm:ss` at 1 hour or more, and `s.t` under 10 s. Digits are tabular (monospaced numerals) so they don't jitter.
- **TMR-041 (P0, M2):** Clock holder: a bright, animated chip (a pulsing dot) and a highlighted tile border. Paused seats: a dimmed chip. Responder: a ⚡ accent color.
- **TMR-042 (P0, M2):** **Readability.** The clock holder's time is shown at least 1/3 the size of the primary counter. Other seats' times are smaller.
- **TMR-043 (P1, M2):** An optional **"time used this turn"** sub-label on the active seat.
- **TMR-044 (P0, M2):** **Accuracy.** Drift is under 100 ms over 60 minutes compared to wall-clock time, verified by unit tests with fake timers and an e2e test. Reload mid-game resumes with the correct remaining time.

### 9.7 Turn tracking without timers
- **TURN-001 (P0, M2):** Turn tracking (active seat, turn number, round number, pass turn) can be **enabled independently of clocks**. Many groups want "whose turn is it / what turn is it" without the pressure of a clock.
- **TURN-002 (P1, M2):** Per-seat stats: number of turns taken, and average turn length (when clocks or count-up are on).

### 9.8 Timer state model (for implementers)

```ts
interface TimerState {
  mode: TimerMode;
  config: TimerConfig;                 // bank, increment, delay, perTurn, grace, timeoutAction, warnings, matchTimer
  status: 'idle' | 'running' | 'paused' | 'ended';
  clocks: Record<SeatId, {
    bankMs: number;                    // remaining as of `since` (may go negative in flag mode)
    graceMs?: number;
    usedMs: number;                    // total time charged (stats)
    turnUsedMs: number;
    state: 'normal' | 'overtime' | 'flagged' | 'timedOut';
  }>;
  holder: SeatId | null;               // whose clock is running
  runningSince: number | null;         // epoch ms (Date.now()) when holder's clock last (re)started
  responseStack: SeatId[];             // bottom = first responder; top = current holder if non-empty
  pausedReason?: 'user' | 'background' | 'setup';
  match?: { totalMs: number; remainingMs: number; extraTurnsRemaining?: number };
}
// remaining(seat) = clocks[seat].bankMs − (holder === seat && status==='running' ? now − runningSince : 0)
```

- **TMR-050 (P0, M2):** All timer transitions are reducer actions: `START`, `PASS_TURN`, `RESPOND`, `PASS_BACK`, `RETURN_TO_ACTIVE`, `PAUSE`, `RESUME`, `ADJUST`, `TIMEOUT`, `ELIMINATE`. Each takes `now` as a parameter, never reading the clock internally, so the logic is deterministic and testable.
- **TMR-051 (P0, M2):** A lightweight scheduler (main thread) computes the time to the next significant event (warning threshold, timeout) and dispatches `TIMEOUT` at the right moment. It re-arms after every action and on `visibilitychange`.

## 10. Game presets

### 10.1 Preset structure
```ts
interface Preset {
  id: string; version: number;
  name: string; game: string; format?: string;   // 'Magic: The Gathering' / 'Commander'
  description: string;
  minPlayers: number; maxPlayers: number; defaultPlayers: number;
  counters: CounterDefinition[];
  defaults: {
    layoutByPlayers?: Record<number, LayoutId>;
    timer: TimerConfig;                 // recommended defaults (users can override)
    firstPlayerRule: FirstPlayerRule;
    teams?: TeamConfig;                 // P2
  };
  tools?: ToolId[];                     // e.g. pokemon → coin flip prominent
  quickStartValues?: number[];          // chip row in Settings, e.g. MTG [20,25,30,40,60]
  capabilities?: PresetCapability[];    // drives which Settings rows show: 'commanderDamage','partners','planechase','perTurnFlags','calculator',...
  builtIn: boolean;
  premium?: boolean;
}
```

- **PRE-001 (P0, M1):** Built-in presets ship in the bundle, are versioned, and are validated against the schema at build time (a CI gate).
- **PRE-002 (P0, M1):** Users can **duplicate** any built-in preset into a custom preset and edit it (§11).
- **PRE-003 (P1, M3):** The preset picker groups presets by game, offers search, has a "Recent" section, and lets users mark favorites.

### 10.2 Magic: The Gathering presets

**Shared MTG counter library** (each preset enables a subset by default; the rest stay available as optional):

| Counter | Scope / kind | Start | Threshold | Default visibility | Notes |
|---|---|---|---|---|---|
| Life | player number, **primary** | per format | ≤ 0 lose | board | step 1, hold 10 |
| Poison | player number | 0 | ≥ 10 lose (15 in 2HG) | badge | |
| Commander damage | playerVsOpponent ×1 or ×2 | 0 | ≥ 21 from one commander, lose | mini grid | links to life (CMD-004) |
| Commander tax | player number (per commander) | 0 | — | badge | displays casts × 2 |
| Energy | player number | 0 | — | badge | |
| Experience | player number | 0 | — | badge | |
| Treasure | player number | 0 | — | badge | convenience tracker |
| Rad | player number | 0 | — | badge | Fallout |
| Monarch | token | none | — | crown badge | |
| Initiative | token (+ room enum, P1) | none | — | badge | |
| Day/Night | global enum | Neither | — | toolbar | |
| City's Blessing | player boolean | off | — | badge | Ascend |
| Speed | player number, min 0, max 4 | 0 | — | badge | "Start your engines!" (Aetherdrift). ⚠ VERIFY max value |
| The Ring tempts you | player number | 0 | — | badge | ring-bearer level (LotR), capped at 4 ⚠ VERIFY |
| Storm count | global number, resets on pass turn | 0 | — | Mana & Storm page (TOOL-011) | auto-reset when turn passes, if turn tracking is on |
| Mana pool (WUBRGC) | device-level numbers ×6 (per seat in P2) | 0 | — | Mana & Storm page (TOOL-011) | P1 |
| K.O. / custom tally | player number | 0 | — | badge | generic; LifeTap has "K.O." |
| Dungeon progress | player enum per dungeon | — | — | panel | P2 |

**Formats:**

| Preset | Players | Life | Enabled by default | Other rules |
|---|---|---|---|---|
| **Commander (EDH)** (default MTG preset) | 2–8 (default 4) | 40 | Life, Poison, Cmd dmg, Cmd tax, Monarch, Initiative | Partner toggle per seat. Default timer: Off (casual). Suggested clock: 25 min bank + 15 s increment ⚠ product guess. |
| **Standard / 60-card constructed** (Modern, Pioneer, Legacy, Vintage, Pauper) | 2 (1–4) | 20 | Life, Poison | Suggested clock: 25 min each (best-of-1) |
| **Limited (Draft/Sealed)** | 2 | 20 | Life, Poison | |
| **Brawl** | 2–6 | 25 (configurable) ⚠ VERIFY | Life, Cmd tax | **No commander damage** |
| **Oathbreaker** | 2–6 | 20 | Life, Poison, tax ×2 (Oathbreaker + Signature Spell) | no commander damage |
| **Two-Headed Giant** (P2: needs teams) | 4 (2 teams) | 30 shared per team | Life (team), Poison (team, ≥15) | team scope |
| **Planechase** (P2) | 2–8 | per base format | + planar die tool | |
| **Archenemy** (P2) | 3–5 | archenemy 40, others 20 | | asymmetric start values |

### 10.3 Pokémon TCG (suggestions, since you don't play it currently)
Pokémon has **no life total**. You win by taking all your **Prize cards** (6 in standard play), by your opponent having no Pokémon in play, or by your opponent being unable to draw at the start of their turn. Damage sits on individual Pokémon in **damage counters of 10 HP**. Coin flips are very common.

| Counter | Scope / kind | Start | Threshold | Notes |
|---|---|---|---|---|
| **Prizes remaining** (**primary**) | player number, direction down | 6 | ≤ 0 → **win** | big number. Tap "−" when you take a prize. |
| **Active Pokémon damage** | player number, step 10, hold 50 | 0 | — | shown as "HP damage 120". Quick "KO'd / reset" option. |
| **Bench damage** (5 slots, P1) | player numbers ×5 | 0 | — | optional "damage board" panel listing Active + Bench 1–5 |
| **Special Conditions** on Active | player multi-flag: Asleep, Confused, Paralyzed (mutually exclusive rotation conditions), plus Burned, Poisoned (stackable) | none | — | badges. Auto-clear prompt when the Active retreats/evolves. |
| **VSTAR Power used** | player boolean (once per game) | off | — | |
| **GX attack used** (legacy formats) | player boolean | off | — | optional |
| **Per-turn reminders**: Supporter played, Energy attached, Retreated, Stadium played | player booleans, **auto-reset on pass turn** | off | — | the "auto-reset on pass turn" property is generic (see CUS-008) |
| **Stadium in play** | global enum/text | none | — | optional |

- **Tools:** **Coin flip** is prominent (single, and "flip N coins until tails"). There is also an "opening coin flip decides who chooses to go first" flow.
- **First turn rule reminder:** the player going first can't attack or play a Supporter on turn 1 ⚠ VERIFY. Shown as a dismissible hint.
- **Timers:** Play! Pokémon best-of-three rounds are 50 min + 3 turns ⚠ VERIFY. The preset default is a match timer of 50 min plus **per-seat chess clock off**. Suggested casual option: 15 min chess clock each.
- **Variant preset: Pokémon TCG Pocket-style** (P2): points to win = 3 (a KO gives 1 point, or 2 for ex). Primary counter: Points, direction up, ≥ 3 → win.

### 10.4 Yu-Gi-Oh!
| Counter | Scope / kind | Start | Threshold | Notes |
|---|---|---|---|---|
| **Life Points** (**primary**) | player number | 8000 | ≤ 0 lose | step **100**, hold **1000**; **calculator entry required** (INP-007), including "halve" |
| Spell counters / generic counters | player number | 0 | — | optional |
| Turn count | global | 1 | — | |

- **Tools:** coin flip, a d6 die, and an LP calculator with a "history tape" (Yu-Gi-Oh players expect to see the arithmetic).
- **Timers:** official matches are 40 min ⚠ VERIFY, and the round ends with an end-of-match procedure. Default: a 40 min match timer. Chess clock optional.
- **Variants:** **Speed Duel** (4000 LP) ⚠ VERIFY, **Rush Duel** (8000 LP). Rush Duel is a separate game with its own rules, so it may be grouped separately.

### 10.5 Final Fantasy TCG
In FFTCG, a player **loses upon receiving their 7th point of damage**. Damage is dealt by taking cards from the top of the deck into the Damage Zone (with EX Burst triggers).

| Counter | Scope / kind | Start | Threshold | Notes |
|---|---|---|---|---|
| **Damage** (**primary**) | player number, direction up | 0 | ≥ 7 lose ⚠ VERIFY | big pips display (7 slots filling) instead of a plain number |
| CP (optional helper) | player number, reset on pass | 0 | — | P2 |

- **Timers:** chess clock default 20 min each (product suggestion).

### 10.6 Other games (recommended for v1, cheap to add since presets are data)

| Game | Primary counter | Start / threshold | Other counters | Notes |
|---|---|---|---|---|
| **Disney Lorcana** | **Lore**, direction up | 0, **≥ 20 win** ⚠ VERIFY | — | very popular, low effort |
| **One Piece Card Game** | **Life** (cards in life area) | Leader's life value (usually 4 or 5, set per seat), ≤ 0 → can lose on the next hit | **DON!! available/attached** (0–10) | per-seat starting life is set per game |
| **Star Wars: Unlimited** | **Base damage**, direction up | 0, **≥ base HP lose** (base HP per seat: 25/28/30) ⚠ VERIFY | **Initiative** (token) | the per-seat threshold shows the need for `thresholdOverridePerSeat` |
| **Digimon Card Game** | **Security** remaining | 5 ⚠ VERIFY | **Memory gauge**: a **global bidirectional** counter from −10 to +10, shown as a shared track in the center (one side is "your memory" for each player) | showcases the global counter type |
| **Flesh and Blood** | **Life** | hero's life (e.g. 20 Blitz / 40 Classic, varies by hero) ⚠ VERIFY | Action points (reset per turn), resources | per-seat start value |
| **Sorcery: Contested Realm** | **Life** | 20; at 0 → **Death's Door** state (enum), next damage = lose ⚠ VERIFY | mana / thresholds (P2) | showcases the multi-stage threshold |
| **Generic life counter** | Life | 20 | — | for any game |

- **PRE-010 (P0, M3):** v1.0 ships with MTG (Commander, Constructed 20, Limited, Brawl, Oathbreaker), Pokémon, Yu-Gi-Oh!, FFTCG, Lorcana, One Piece, Star Wars: Unlimited, Digimon, and Generic.
- **PRE-011 (P1, M3):** Flesh and Blood, Sorcery, and the MTG team/asymmetric formats (2HG, Archenemy) follow in v1.x.
- **PRE-012 (P0, M3):** Each built-in preset has a "Rules quick ref" line (win/loss conditions) shown in setup, plus a link to the official rules page.
- **PRE-013 (P1, M3):** **Per-seat start/threshold overrides** (One Piece leader life, SWU base HP, FaB hero life). In setup, each seat can set its own start and threshold for the primary counter.

### 10.7 Trademark note
Preset names reference third-party trademarks (Magic: The Gathering, Pokémon, Yu-Gi-Oh!, etc.). Use **plain-text names only**, with no logos, card frames, mana symbol fonts copied from WotC, or official icons. Add a disclaimer: "Not affiliated with or endorsed by …". See §18 and Q7.

## 11. Custom preset builder

This is the agnostic core, and a likely premium anchor.

- **CUS-001 (P0, M3):** **Create a preset** from scratch, or by duplicating an existing one. Fields: name, game name, description, min/max/default players, and default layout per player count.
- **CUS-002 (P0, M3):** **Add counter** with the fields:
  - Name and short name (≤ 6 chars for badges)
  - Icon (picked from a built-in icon library of about 80 icons: heart, skull, shield, star, coin, flame, droplet, crown, sun/moon, sword, potion, clock, flag, gem, …)
  - **Starting value**
  - **Min / max** (optional)
  - **Direction**: *Counts down* (like life) or *Counts up* (like poison or lore)
  - **Step** (tap) and **hold step**
  - **Scope**: *Each player* / *Each player, from each opponent* (matrix like commander damage) / *Shared by everyone* (global) / *One holder at a time* (token)
  - **Type**: number / on-off / list of states (enter state names)
  - **Win/loss rule**: none, **lose when ≤ X**, **lose when ≥ X**, **win when ≥ X**, **win when ≤ X**, plus auto/prompt/off
  - **Primary** (the big number on the tile): exactly one counter must be primary
  - **Display**: on the tile (badge) or in the panel only. Hide when at the starting value: yes/no.
  - **Reset every turn**: yes/no (requires turn tracking). Example: Pokémon "Supporter played", FaB action points.
  - **Linked counter** (P1): "when this changes by N, change [counter] by N × factor"
- **CUS-003 (P0, M3):** **Timer defaults** for the preset (mode, bank, increment, per-turn time, timeout behaviour, match timer).
- **CUS-004 (P0, M3):** **Live preview** of a seat tile while editing.
- **CUS-005 (P0, M3):** **Validation**: exactly one primary counter; start within [min, max]; threshold reachable; unique counter names; at least 1 player. Show inline errors.
- **CUS-006 (P0, M3):** Custom presets are stored locally, and synced to the account when signed in.
- **CUS-007 (P1, M3):** **Export/import** a preset as a JSON file and as a **share code / link** (`/p/{code}`). Share links need a server-side record (Firestore `sharedPresets/{code}`, public read). Importing creates a copy owned by the importer.
- **CUS-008 (P1, M3):** Counter property **"auto-reset on turn pass"** (see Pokémon). It is also available to built-ins.
- **CUS-009 (P2, M7):** Presets marked public can be published to a community gallery (moderation needed; out of v1).
- **CUS-010 (P1, M3):** Reordering counters by drag; ordering defines badge and panel order.

## 12. History, log, and stats

LifeTap's history screens (third batch of reference screenshots) are the baseline. Most people don't know these features exist, so **we make them visible**: the game-over screen links to stats, and the launcher shows a "Your stats" card once there are 3 or more games. The history screen opens from the toolbar 🕒 as a full-screen page. It has two top-level segments: **Current Game** and **Past Games**.

### 12.1 Current Game tab
- **HIST-001 (P0, M1):** **Game header card**: "Game 8", start date/time (relative: "Yesterday at 10:05 AM"), player count, starting value of the primary counter (♡ 40), preset name, and elapsed time. A chevron expands it to show the settings used (thresholds, timer mode).
- **HIST-010 (P0, M1):** **Standings list**, one row per seat, sorted by current primary value (eliminated seats last, dimmed, with ☠). Each row shows a left color bar in the seat's color, the name, a **deck / commander name subtitle** (e.g. "Toxrill, the Corrosive"; see PROF-010), and the current value. Tapping a row filters the log to that seat.
- **HIST-011 (P0, M1):** **Event log**, newest first. Each row shows:
  - a colored dot in the **affected** seat's color, then the name. For matrix counters it reads **"Source → Target"** (e.g. "Josh → Conner" for commander damage).
  - the **counter icon** (♡ life, poison, commander-tax castle, commander damage, …).
  - a **delta chip** color-coded by counter category: life loss red, life gain green, poison purple, commander damage orange, timers blue, and other counters neutral. Colors come from the counter definition, not hard-coded.
  - "→ new value".
  - the timestamp, revealed by tapping the row or by a "show times" toggle.
  - Batched taps appear as one row (INP-006).
  - Linked effects appear as **two rows grouped together** (commander damage +9 and life −9), matching the LifeTap screenshot.
- **HIST-012 (P0, M2):** Non-counter events appear inline with distinct styling: turn passes ("Turn 7 → Josh · 2:41"), responses ("⚡ Bethany responded · 0:42"), pauses, timeouts, eliminations (with cause), token transfers (👑 Monarch → JP), day/night changes, dice/coin results, resets, and undo markers.
- **HIST-013 (P1, M1):** **Edit from history**: long-press a row to see "Undo to here" (reverts this and all later actions, with confirmation) or "Delete this change" (only for independent counter changes; it recomputes later values).
- **HIST-002 (P1, M1):** A **life chart** toggle (List | Chart): primary counter over time, or by turn when turn tracking is on, with one line per seat in the seat color. Elimination points are marked ☠.

### 12.2 Past Games tab
Sub-tabs: **Games · Players · Decks · Insights**, plus a **Filter** bar and an **Export** (⤓) button. LifeTap's "Profiles" tab is player + commander pairs. We call these **Decks**, since we also cover non-MTG games.

- **HIST-003 (P0, M6):** **Completed game records** are saved locally (and to the cloud when signed in). A record holds: preset, players (names, profile IDs, deck IDs, commander names), seat order, **turn position of each player**, starting player, winner(s), elimination order with cause and turn, duration, **active play time** (excluding pauses and idle gaps), turns and rounds, per-seat time used and average turn time (when timers or turn tracking are on), final counter values, and the full event log (compressed).
- **HIST-020 (P0, M6):** **Games list**: cards with game number, date/time, player count, starting value, duration, and the winner (🏆 name with an accent left bar), or "No winner". Tapping a card opens **Game detail**: the read-only Current-Game view (standings, log, chart) for that game, plus "Rematch with same setup" and "Delete game".
- **HIST-021 (P0, M6):** **Players list**: one row per **player identity** with W / L and win %. Tapping opens the player detail: games, win % by preset, by deck, and by turn position, average turn time, favorite opponents, head-to-head records, and most common elimination cause.
- **HIST-022 (P1, M6):** **Decks list**: thumbnail art, player name, deck/commander name, W / L, and win %. Tapping opens deck detail: win % by turn position, average finish position, games list, and "most damage dealt to / taken from".
- **HIST-023 (P1, M6):** **Insights** (dashboard):
  - **Summary tiles**: games, total play time, average game.
  - **Turn order advantage**: win % by starting position (goes first, position 2, …, position N), with counts (e.g. 1/3, 33%).
  - **Game duration**: average, longest, shortest. Also average turns per game and average turn length.
  - **Our additions**:
    - win % by preset/format;
    - **elimination causes** (life / poison / commander damage / time / concede, as a breakdown);
    - **first blood** (who is usually eliminated first);
    - **commander damage leaderboard** (most total commander damage dealt);
    - **clock stats**: slowest and fastest player by average turn time, total time spent responding, and timeouts. This is unique to our app and good for friendly banter.
    - **Playgroup** view: the same players together over time.
  - A "Suggest a stat" link to the feedback form (SET-041).
- **HIST-024 (P0, M6):** **Filter** (applies to all four sub-tabs): date range, preset/game, player count, players included, decks included, starting value, timer on/off, and "has winner only". The active filter shows as chips.
- **HIST-006 (P1, M6):** **Export** (⤓): CSV (one row per game-seat) and JSON (full records), using the current filter. Also **import JSON** (to restore or move between guest devices).

### 12.3 Data quality (fixing problems visible in LifeTap's screenshots)
The LifeTap screenshots show durations like "171 hr 17 min" and "204 hr 59 min", most games marked "No winner", generic names ("Player 1…5") counted as real players, and the same person ("Declan") listed twice. We avoid these:

- **HIST-030 (P0, M6):** **Active play time.** The duration counts only active time. Clock pauses are excluded, and so are **idle gaps longer than 15 minutes** with no input (configurable). A game left open overnight doesn't record 171 hours. Wall-clock duration is stored separately.
- **HIST-031 (P0, M6):** **"Who won?" prompt.** When the user resets or starts a new game while the current game has meaningful activity (≥ 3 counter changes or ≥ 5 minutes active) and no winner was detected, ask: "Who won?" with seat buttons, plus "Draw", "No winner", and "Don't save this game". The prompt is skippable. A setting can make it "Always ask", "Ask if unclear" (default), or "Never".
- **HIST-032 (P0, M6):** **Abandoned-game handling.** A game with trivial activity (e.g. under 1 minute and no changes) is discarded automatically and never pollutes stats.
- **HIST-033 (P0, M6):** **Player identity.** Stats group by **profile ID** when a profile is loaded, otherwise by normalized name (case- and whitespace-insensitive). Default names ("Player 1", "Player 2", …) are **excluded from Players and Decks stats** by default (a filter toggle can show them).
- **HIST-034 (P1, M6):** **Merge / rename players.** In Players, long-press to merge two identities (e.g. two "Declan" rows), or to link a name-only identity to a profile. The merge rewrites the stored records' identity references, and can be undone right after.
- **HIST-035 (P1, M6):** Edit a past game: winner, player names/profiles, and deck. You can't edit the event log, but you can delete the whole game.

### 12.4 Storage and tiers
- **HIST-007 (P0, M6):** All game records are **kept locally** (soft cap 1,000 games; older ones are compacted to summaries without logs). Free users can **view the most recent 5** games in the Games list; older games stay stored, and a "34 more games saved — unlock with Pro" row shows at the end. Upgrading reveals them immediately with nothing lost. See §17.2 for which stats views are free.
- **HIST-008 (P0, M6):** When the "Game history" setting is Off (§13.1-B), the app keeps no records and hides the history button.

## 13. Player profiles, personalization, and settings

- **PROF-001 (P0, M1):** A **player profile** holds a name, default art, accent color, preferred contrast, and an optional "default commanders" list (P2). It is created from the seat menu with "Save as profile", or from the Profiles screen.
- **PROF-002 (P0, M1):** **Load** (as in the screenshot's Load button) assigns a saved profile to a seat. Recently used profiles appear first.
- **PROF-003 (P1, M4):** Profiles sync to the account. One "**me**" profile is designated for the account owner and pre-fills seat 1 by default.
- **PROF-004 (P2):** Friends / linked accounts (shared profiles between users) are out of scope for v1.
- **PROF-010 (P0, M1):** **Decks.** A profile can own several **decks**. Each deck has a name, the game/preset it belongs to, optional commander name(s) (MTG; partners allowed), default art, and an optional color identity. In the seat menu, after loading a profile, pick the deck (or "New deck…"). Selecting Scryfall art for a commander-type preset **offers to save that card as the deck's commander**, which is how LifeTap gets the "Toxrill, the Corrosive" subtitles. Decks drive the history subtitles (HIST-010), Decks stats (HIST-022), and one-tap setup ("Load JP · Toxrill" sets name, art, and commander).
- **PROF-011 (P0, M1):** **Seats without a profile** still record a name (and optional deck name) for stats. When a name-only player is used 2 or more times, offer "Save Declan as a profile?".
- **SET-001 (P0, M1):** A full **Settings screen** with Game, Preset-default and App scopes. It covers everything in LifeTap's settings plus multi-TCG, custom-preset, timer, account and Pro settings. Full specification in §13.1.
- **SET-002 (P0, M1):** **Seat background options**:
  1. **Scryfall art** (§14)
  2. **Uploaded image** (§14.2)
  3. **Gradients/colors** (the "Colors" picker in the screenshot): 12–20 curated gradients plus a solid color picker
  4. **Default**: a per-seat palette color
- **SET-003 (P0, M1):** **Increase contrast** per seat: a stronger dark scrim and a text outline over busy art.

### 13.1 Settings screen (full specification)

LifeTap's settings (second batch of reference screenshots) are the **baseline**: we include essentially all of them. We then add settings for **multiple TCGs, custom presets, timers, accounts and Pro**.

**Presentation.** The ⚙ button in the center toolbar opens Settings as a **full-screen page, upright for the bottom of the device** (not rotated per seat). It has a back arrow, works with Android back, and is a scrollable list grouped into sections with divider headers. As in LifeTap, slivers of the seats' art peek at the top and bottom edges as a visual tie back to the board. Controls follow the LifeTap visual language: chip rows for small numeric choices, layout thumbnails, toggles, and dropdown values on the right.

**Three setting scopes.** Every row belongs to exactly one scope, and the scope decides where its value is stored:

| Scope | Applies to | Stored | Example |
|---|---|---|---|
| **Game** | The current game. On the next game it falls back to the preset defaults, unless saved. | In the active game in IndexedDB | Starting life 30 this game |
| **Preset default** | Every new game of that preset | Locally per preset, and synced when signed in | Commander always starts with a 20-min chess clock |
| **App** | The whole app on this device / account | Locally, and synced when signed in | Theme, haptics, keep awake |

- **SET-010 (P0, M1):** The settings page implements the sections and rows below. A row appears only if it applies to the active preset (e.g. commander rows only in presets with a commander-damage counter). Rows are generated from preset capabilities, not hard-coded per game (ARCH-003).
- **SET-011 (P0, M1):** **Structural changes mid-game** (preset, player count, starting values, thresholds, enabling or disabling counters) show "This will reset the current game. Continue?" and then perform GAME-010 reset semantics, keeping names and art where seats still exist. **Non-structural changes** apply live with no reset. These include the layout variant, appearance, input, device, timer display options, and auto-KO. Changing the timer **mode** mid-game asks whether to restart the clocks.
- **SET-012 (P0, M1):** Under the Game Setup section there are two buttons. **"Save as default for <preset name>"** copies the current game-scope values into the preset defaults. **"Restore <preset> defaults"** reverts them.
- **SET-013 (P0, M2):** **Opening Settings while clocks are running auto-pauses all clocks.** Clocks stay paused on return, with a Resume prompt. This prevents someone's time burning while settings are being changed.
- **SET-014 (P1, M4):** App-scope settings and preset defaults sync to the signed-in account. Device-specific settings (keep awake method, fullscreen, haptics) stay local only.
- **SET-015 (P1, M1):** Each setting has a one-line subtitle explaining it, as LifeTap does ("Commander damage also reduces life"). Complex settings have a **"?" help popover** (as LifeTap does for One-player mode).

#### A. Game setup (scope: Game, savable as Preset default)

| Row | Control | Options and default | Req |
|---|---|---|---|
| **Game** | Row with value (e.g. "MTG · Commander") → preset picker | Any built-in or custom preset. A change resets the game. | PRE-003 |
| **Players** | Chip row, as in LifeTap | Chips span the preset's `minPlayers`…`maxPlayers`, capped at **2–6 for everyone**, with **7 and 8** shown with a Pro lock (Q8). 1 player is handled by One-player mode (§E). Default = preset `defaultPlayers` (Commander 4, 1v1 formats 2). | LAY-001 |
| **Layout** | Layout thumbnails for the selected player count, as in LifeTap (4 players: "2 columns rotated" vs "rows") | The variants from LAY-002/LAY-003. Selected shows a highlight ring. | LAY-003 |
| **Seats** | Row → seat order screen | Drag to reorder seats and set names quickly. Turn order follows seat order. | LAY-005 |
| **Starting <primary>** | Chip row + **Custom** link (as LifeTap's "Starting life") | The label is dynamic, using the primary counter's name ("Starting life", "Life points", "Prize cards"). Chip values come from the preset's `quickStartValues`: MTG `20 25 30 40 60`; Yu-Gi-Oh `4000 8000`; Pokémon `4 6`; One Piece `4 5`; Generic `10 20 30 40`. **Custom** opens a numeric keypad. | GAME-013 |
| **Per-player starting values** | Row → per-seat list (only when the preset allows it) | One Piece leader life, Star Wars: Unlimited base HP, Flesh and Blood hero life, Archenemy 40 | PRE-013 |
| **Win / loss conditions** | Row → sub-page | Every threshold in the preset is editable: life ≤ 0, poison ≥ 10, commander damage ≥ 21, lore ≥ 20, damage ≥ 7, … Each has a value, plus On/Off. | CTR-003 |
| **Counters in this game** | Row → sub-page | Turn optional counters on or off (Energy, Exp, Rad, Speed, Ring, Storm…). For each counter, choose to show it on the tile as a badge or keep it in the panel only. | CTR-001 |
| **Starting player** | Dropdown (LifeTap "Starting player: Random") | **Random** (default) / Choose each game / Loser of last game / Winner of last game / Roll-off (d20) | GAME-012 |
| **Turn order** | Dropdown | **Clockwise** (default) / Counter-clockwise | TURN-001 |

#### B. Gameplay (scope: Game; rows depend on the preset)

| Row | Control | Options and default | Req |
|---|---|---|---|
| **Auto-KO** | Toggle (LifeTap) + mode | **On** (default) / Ask first / Off. The subtitle is built from the preset's thresholds, e.g. "From life, poison, or commander damage" (MTG) or "From base damage" (Star Wars: Unlimited). | CTR-003 |
| **Auto-revive** | Toggle | **On**: a KO'd seat revives when its value moves back across the threshold (fixing misclicks). | CTR-004 |
| **Commander damage life loss** | Toggle (LifeTap) | **On**: "Commander damage also reduces life". Commander presets only. | CMD-004 |
| **Partner commanders** | Toggle | **On**: seats may declare 2 commanders. Commander presets only. | CMD-003 |
| **Turn tracking** | Toggle | Shows the active seat, the turn and round number, and a Pass turn control even when timers are off. Default **On** when any timer is on, otherwise **Off**. (LifeTap's "Turn timer" covers part of this; our full timer settings are in §C.) | TURN-001 |
| **Game history** | Toggle (LifeTap) | **On**: "Track and display game history" (the log, life chart, and saving the completed game). When Off, the history button is hidden and no record is saved. The undo buffer is still kept. | HIST-001, HIST-003 |
| **Planechase** | Toggle (LifeTap) | Off. MTG only. Adds a planar deck (plane and phenomenon cards loaded from Scryfall) and the planar die. "Internet required for first download; works offline afterwards." **P2.** | TOOL-005 |
| **Archenemy** | Toggle (LifeTap) | Off. MTG only. Choose the archenemy seat (starting life 40 by default ⚠ VERIFY) and a scheme deck loaded from Scryfall. **P2.** | §10.2 |
| **Bounty** | Toggle (LifeTap) | Off. MTG Commander. A bounty deck from Scryfall, with the current bounty shown in the center. **P2.** ⚠ VERIFY card set and rules. | new: **SET-020** |
| **Pokémon: first-turn reminder** | Toggle | **On**: shows the "player going first can't attack or play a Supporter" hint. | §10.3 |
| **Reset per-turn flags on pass** | Toggle | **On** for presets with per-turn counters (Pokémon Supporter/Energy/Retreat, Flesh and Blood action points) | CUS-008 |
| **Tap number for calculator** | Toggle | **On** for Yu-Gi-Oh! and high-total presets, Off otherwise | INP-007 |

> Supplemental decks (Planechase, Archenemy, Bounty) use Scryfall data, so per ART-007 they **stay free**. They are P2 and are recorded here so the settings structure has room for them.

#### C. Timers (scope: Game, savable as Preset default)

This section is unique to our app. It replaces LifeTap's single "Turn timer" dropdown. When the mode is Off, only the first row shows. The other rows appear depending on the mode chosen.

| Row | Control | Options and default | Req |
|---|---|---|---|
| **Timer mode** | Dropdown | **Off** / Count-up (stopwatch only) / Chess clock / Chess clock + increment / Chess clock + delay / Per-turn timer / Per-turn + reserve. The default comes from the preset. | §9.2 |
| **Time per player** | Chip row + Custom | `5 10 15 20 25 30 45 60` min, plus Custom (h:mm). Shown for chess-clock modes. | TMR-001 |
| **Increment / delay** | Chip row + Custom | `0 5 10 15 30` s. Shown for increment and delay modes. | §9.2 |
| **Time per turn** | Chip row + Custom | `30s 1m 2m 3m 5m`. Shown for per-turn modes. | §9.2 |
| **Different time per player** (handicap) | Row → per-seat list | Off. Lets a new player have more time. **P2.** | new: **TMR-060** |
| **Round / match timer** | Dropdown + Custom | **Off** / 40 / 50 / 60 min / Custom. Can be combined with any mode. | TMR-032 |
| **Extra turns after time** | Stepper | 0–10 (the preset's default: MTG 5, Pokémon 3 ⚠ VERIFY). Shown when a match timer is set. | TMR-032 |
| **When time runs out** | Dropdown | Lose immediately / **Grace period** (casual default) / Flag only / Add time once | TMR-030 |
| **Grace period length** / **Extra time amount** | Chip row | `30s 60s 2m 5m` | §9.5 |
| **Responses** | Dropdown | **Charge responder** (default) / Freeze all clocks / Disabled (no Respond button) | TMR-005, TMR-010 |
| **Pass turn by** | Dropdown | **Tap (with 3 s undo)** / Hold to pass | TMR-004 |
| **Pause when app is in background** | Toggle | **On** | TMR-021 |
| **Pause when opening settings or menus** | Toggle | **On** | SET-013 |
| **Low-time warnings** | Row → sub-page | Thresholds (default 5:00, 1:00, 0:10; add or remove), each with sound / vibrate / flash | TMR-031 |
| **Show tenths under 10 s** | Toggle | On | TMR-040 |
| **Show time used this turn** | Toggle | Off | TMR-043 |

#### D. Appearance (scope: App)

| Row | Control | Options and default | Req |
|---|---|---|---|
| **Theme** | Dropdown | **Dark** / Light / High contrast / Pro themes (locked) | SET-001 |
| **Player card layout** | Three preview thumbnails (LifeTap) | **Default** (name + number + mini-grid + badges) / **Name only** (name + number; badges and mini-grid hidden until tapped) / **Big font** (number only, maximum size) | new: **SET-030** |
| **Colorize commander mini-grids** | Toggle (LifeTap) | **On**: "Mini-grids reflect player backgrounds" (each cell shows the source seat's art or color). Off gives neutral gray cells. Commander presets only. | CMD-002 |
| **Badges** | Dropdown | **Non-default only** / Always show enabled counters / Hidden | LIFE-002 |
| **Change bubble duration** | Chip row | `1s 2s 3s 5s` (default 2 s) | INP-006 |
| **Auto-hide menu** | Toggle (LifeTap) | **Off**. When On, the center toolbar collapses to a slim handle after 5 s idle; tapping the handle reveals it. Turn controls on the seats stay visible. | new: **SET-031** |
| **Dice & randomizer animations** | Toggle (LifeTap) | **On**. When Off, results show instantly (first-player pick, dice, coin). | GAME-011, TOOL-001 |
| **Reduce motion** | Dropdown | **Follow system** / Always reduce / Never reduce | A11Y-003 |
| **One-player mode** | Toggle + "?" help (LifeTap) | **Off**. See SET-032 below. | new: **SET-032** |
| **Camera mode** | Dropdown (LifeTap) | **Off** / Face bottom / Face top: "All players face one direction". It overrides seat rotations so the whole board reads one way, for recording, streaming, or everyone sitting on one side. | new: **SET-033** |
| **Language** | Row → list (LifeTap) | English in v1. All strings are externalized (i18n-ready). P2 adds Spanish, Portuguese, German, French, Italian, and Japanese. | new: **SET-034** |

- **SET-032 One-player mode (P1, M1):** the device tracks **only your own seat**, full screen and upright. This is for pods where every player uses their own phone. You still get commander damage tracking: enter the **number of opponents** (and optionally their names or commander art), which builds your damage-received grid. Tokens like Monarch become a simple "I have it" toggle. Timer options are limited to Count-up and a personal chess clock, controlled by a big tap-to-start/stop button. The multi-device sync version is a future idea (§21).
- **SET-033 Camera mode (P1, M1):** keeps the layout geometry but sets every seat's rotation to the chosen direction. Commander mini-grids keep their spatial arrangement.
- **SET-030 Player card layout (P0, M1):** applies to all seats. A per-seat override is available in the seat menu (P2).

#### E. Input (scope: App)

| Row | Control | Options and default | Req |
|---|---|---|---|
| **Tap zones** | Dropdown | **Halves of the tile** (LifeTap style) / Buttons only (+/− glyphs) | INP-003 |
| **Hold delay** | Chip row | `300 500 700 1000` ms (default 500) | INP-004 |
| **Hold repeat speed** | Chip row | Slow / **Normal** / Fast | INP-004 |
| **Hold amount** | Stepper | Default from the preset (10 for life, 1000 for Yu-Gi-Oh! LP) | INP-004 |
| **Swipe to change** | Toggle | Off | INP-005 |
| **Confirm destructive actions** | Dropdown | **Hold to confirm** / Dialog | LAY-011 |

#### F. Device (scope: App, local only)

| Row | Control | Options and default | Req |
|---|---|---|---|
| **Keep display awake** | Toggle (LifeTap) | **On**. A sub-option uses the "compatibility method" (video fallback) when the Wake Lock API is unavailable. | PWA-005 |
| **Haptic feedback** | Toggle (LifeTap) | **On**. On iOS the row shows disabled with "Not supported on this device". | INP-008 |
| **Sounds** | Toggle + volume slider | Timer alerts **On**; tap clicks **Off** | TMR-031, INP-008 |
| **Hide navigation and status bars** | Toggle (LifeTap) | **On**. Enters fullscreen (Fullscreen API) on the next tap in a game, since browsers require a user gesture. On iOS, it shows "Install to Home Screen for full screen". | PWA-006 |
| **Install app** | Button (only when not installed) | Android install prompt / iOS instructions | PWA-003 |

#### G. Account and data (scope: App)

| Row | Control | Notes | Req |
|---|---|---|---|
| **Account** | "Sign in with Google", or avatar + email + Sign out | | AUTH-001, AUTH-004 |
| **Sync status** | Status line | "Synced · 2 min ago" / "Offline — will sync" | SYNC-004 |
| **Pro** | Upgrade button, or "Pro · renews …" + Manage subscription | Hidden until M7 | PAY-004 |
| **Player profiles** | Row → Profiles screen | | PROF-001 |
| **My presets** | Row → Custom presets list / builder | | CUS-001 |
| **My images** | Row → image library | | ART-023 |
| **Game history and stats** | Row → History screen | | HIST-004 |
| **Export my data** | Button | JSON download | AUTH-006 |
| **Clear image cache** | Button | Shows the size used | ART-006 |
| **Remove my data from this device** / **Delete account** | Destructive buttons with confirmation | | AUTH-004, AUTH-005 |

#### H. Support and about (scope: App)

LifeTap's support section has Review / Donate / Send feedback / Send diagnostics / version. Ours:

| Row | Notes | Req |
|---|---|---|
| **Upgrade to Pro / Support the app** | Takes the place of LifeTap's Donate card | PAY-004 |
| **Share the app** | Web Share API, falling back to copying a link | new: **SET-040** |
| **Send feedback** | An in-app form (category + text + optional email) written to a write-only Firestore `feedback` collection; works for guests via App Check | new: **SET-041** |
| **Send diagnostics** | Bundles the app version, browser/OS, settings, active preset, and the last 200 events of the current game. **The user sees exactly what will be sent before sending.** No images, emails, or names unless the user ticks "include player names". | new: **SET-042** |
| **What's new** | Changelog for the current version | new: **SET-043** |
| **About** | Version, credits (Scryfall, card artists), open-source licenses, privacy policy, terms, trademark disclaimer | LEG-001..003 |

## 14. Card art and custom images

### 14.1 Scryfall integration (MTG)
- **ART-001 (P0, M5):** In seat menu → Backgrounds → "Search card", a **search box with autocomplete** uses `GET https://api.scryfall.com/cards/autocomplete?q=` (debounced ~300 ms, min 2 chars).
- **ART-002 (P0, M5):** When a card name is picked, show **all distinct artworks/printings** with `GET /cards/search?q=!"<name>"&unique=art&order=released`, as a scrollable grid of `art_crop` thumbnails with set name and artist.
- **ART-003 (P0, M5):** Use the **`art_crop`** image for backgrounds. **Double-faced and modal cards** take their art from `card_faces[i].image_uris`, and the user can pick the face.
- **ART-004 (P0, M5):** **Focal point / crop adjust**: the user drags and pinches to position the art within the rotated tile. The setting is stored as `{ x, y, zoom }`.
- **ART-005 (P0, M5):** **Attribution**: show the artist name (small, "Art: <artist>") in the seat menu and an About/credits screen. Do not obscure or remove artist credit. Don't present Scryfall data as your own.
- **ART-006 (P0, M5):** **Scryfall API etiquette** (their published guidelines): keep to ~10 requests/second or fewer (add 50–100 ms between calls), send an `Accept` header, **cache responses** (24 h minimum for card data), and set a descriptive app identifier where the platform allows it (browsers can't set `User-Agent`, so it is fine to omit it client-side; if a server proxy is used, it must set `User-Agent` and `Accept`). Image URLs are served from `cards.scryfall.io` and must be cached by the service worker (cache-first, LRU limit ~200 images).
- **ART-007 (P0, M5):** **Scryfall data must not be paywalled.** Scryfall's terms prohibit requiring payment to access their data or images. **Scryfall art search therefore stays in the free tier.** Premium can't be "unlock Scryfall art". See §17.
- **ART-008 (P1, M5):** **Commander auto-art**: when a seat declares its commander(s) by name (used for commander damage labels), offer "Use commander art" with one tap. Partners get a split background (P2).
- **ART-009 (P0, M5):** Offline: art already chosen stays available offline (cached blob in IndexedDB, with the service worker as backup). Search shows "Offline — search unavailable".

### 14.2 Uploaded images
- **ART-020 (P0, M5):** "Upload from device" uses `<input type="file" accept="image/*">`, which also offers the camera on mobile.
- **ART-021 (P0, M5):** **Client-side processing**: decode, apply EXIF orientation, resize to a max 1600 px long edge, encode WebP (fallback JPEG) at quality ~0.8, and **strip metadata (EXIF/GPS) for privacy**. Target size is under 400 KB.
- **ART-022 (P0, M5):** Stored as a blob in IndexedDB (works for guests). When signed in, it also uploads to Cloud Storage at `users/{uid}/art/{artId}.webp` and is referenced from profiles.
- **ART-023 (P1, M5):** **My images** library: reuse, rename, and delete uploaded images.
- **ART-024 (P1, M7):** Storage quotas: free 5 images synced (unlimited locally); premium 200 synced (Q5).
- **ART-025 (P0, M5):** Uploads are validated: image MIME only, max 15 MB raw before processing. Storage rules enforce `contentType` `image/.*` and size under 2 MB post-processing.

## 15. Authentication, accounts, data separation, and sync

- **AUTH-001 (P0, M4):** **Google sign-in** via Firebase Auth. On mobile/PWA use `signInWithRedirect`, or popup with a redirect fallback. iOS standalone PWAs have quirks with popups, so test both. Configure an authorized domain for the custom domain.
- **AUTH-002 (P0, M4):** **Guest mode by default.** The app works fully without signing in (the local-only data model). A firebase **anonymous** user may be created lazily, only when a cloud feature is needed (e.g. creating a share link).
- **AUTH-003 (P0, M4):** **Account linking / migration.** When a guest signs in with Google, local data (profiles, custom presets, history, art) is **merged** into the account. If the Google account already has data, offer "Merge" (default) or "Keep cloud only". No silent data loss.
- **AUTH-004 (P0, M4):** **Sign-out** keeps the local active game. Account data cached on the device is cleared or kept per the user's choice ("Remove my data from this device").
- **AUTH-005 (P0, M4):** **Account deletion** in-app: deletes the Firestore subtree, Storage folder and Auth user (via a callable Cloud Function or the "Delete User Data" extension). Required for privacy compliance and store policies.
- **AUTH-006 (P1, M4):** **Data export** (JSON of all the user's data).

### 15.1 Firestore data model
```
users/{uid}                                   // profile doc: displayName, createdAt, settings, meProfileId
users/{uid}/profiles/{profileId}              // player profiles
users/{uid}/profiles/{profileId}/decks/{deckId} // decks (name, presetId, commanders[], art)
users/{uid}/presets/{presetId}                // custom presets
users/{uid}/games/{gameId}                    // completed game summaries (+ compressed log)
users/{uid}/art/{artId}                       // metadata for uploaded art (storage path, dims, focal)
users/{uid}/private/entitlements              // READ-ONLY to client; written by server/Stripe ext
customers/{uid}/...                           // Stripe extension collections (M7)
sharedPresets/{code}                          // public read, create by signed-in user, immutable
```

### 15.2 Security rules (data separation)
- **SEC-001 (P0, M4):** `users/{uid}/**` can be read and written **only** when `request.auth.uid == uid`.
- **SEC-002 (P0, M4):** `users/{uid}/private/entitlements` and `customers/**` cannot be written by the client.
- **SEC-003 (P0, M4):** Document validation in rules: field types, string length limits (names ≤ 40 chars), array size limits, and a max document size so one user can't abuse storage.
- **SEC-004 (P0, M4):** Storage: `users/{uid}/**` read/write only by the owner, `image/*` only, under 2 MB.
- **SEC-005 (P1, M4):** `sharedPresets/{code}`: anyone can read; a signed-in user can create only with `ownerUid == request.auth.uid`; no updates; the owner can delete. Payload validated against a size cap.
- **SEC-006 (P0, M4):** **Rules unit tests** with the Firebase Emulator cover cross-user read/write denial, entitlement write denial, and oversize/invalid writes. This is a CI gate.
- **SEC-007 (P0, M4):** **App Check** (reCAPTCHA Enterprise / v3 web provider) is enforced on Firestore, Storage and Functions before launch.

### 15.3 Sync behaviour
- **SYNC-001 (P0, M4):** Firestore offline persistence (`persistentLocalCache`, multi-tab manager) is used for user collections.
- **SYNC-002 (P0, M4):** Conflict policy is **last-write-wins** per document, using `updatedAt` server timestamps. Profiles and presets are small, independent documents, so LWW is acceptable.
- **SYNC-003 (P0, M4):** Game records are write-once.
- **SYNC-004 (P1, M4):** A sync status indicator in Settings/Account shows "Synced · 2 min ago", "Offline — will sync", or an error.

## 16. Tools ("Dice & Misc")

LifeTap's "Dice & Misc" screen (third batch of screenshots) is the baseline. It opens as a full-screen page from the toolbar 🎲 tap. **Hold** the 🎲 button for the **quick-access radial menu** (described below).

**Randomizers**
- **TOOL-003 (P0, M1):** **Randomize player** picks a random seat among living seats, with the same highlight-cycling animation as the first-player pick (GAME-011).
- **TOOL-008 (P0, M1):** **Randomize opponent** picks a random **opponent** of a given seat, among living seats other than that seat. It is used for "choose an opponent at random" card effects. If opened from a seat menu, that seat is the chooser. If opened from the toolbar, a quick "Who's choosing?" seat picker appears first.

**Coins and dice**
- **TOOL-002 (P0, M1):** **Flip coin**: single flip (heads/tails, animated), plus "Flip N" and "Flip until tails" (Pokémon), which report the count of heads.
- **TOOL-001 (P0, M1):** **Dice**: d4, d6, d8, d10, d12, d20 (one button each, as in LifeTap), plus d100.
  - **Custom die**: "Set N → Roll", rolling 1..N for any N from 2 to 1000. The last N is remembered.
  - **Multiple dice**: a stepper (×1…×10) for rolling e.g. 3d6; the result shows each die and the sum.
- **TOOL-009 (P0, M1):** **Result overlay**: a large card in the center of the screen showing the die face or number (the LifeTap d6 "6" overlay). Tap anywhere to dismiss, or tap "Roll again". Results face the invoking seat (TOOL-007), and the roll is logged to the game history (HIST-012). When "Dice & randomizer animations" is off, the result appears instantly.
- **TOOL-010 (P0, M1):** **Quick access**: press and hold the toolbar 🎲 to open a radial or compact popover with every die, the coin, randomize player, and randomize opponent. Releasing on an item fires it. This matches LifeTap's "Hold the die button for instant access to all dice and randomizers" tip, and we show the same tip on the Tools page.

**Game-specific and other tools**
- **TOOL-004 (P1, M3):** **Roll-off for first player**: each seat rolls a d20 on its own tile; ties re-roll.
- **TOOL-005 (P2):** **Planar die** (Planechase: blank / chaos / planeswalk).
- **TOOL-006 (P1, M3):** **Yu-Gi-Oh! LP calculator** (INP-007).
- **TOOL-011 (P1, M1):** **Mana & Storm counter** (MTG presets; LifeTap has a "Mana Counter" page):
  - A full-screen page with six rows: **W, U, B, R, G, C** (colorless). Each row has − / mana symbol / value / +.
  - A **Storm counter** row below them.
  - **Clear** (resets all to 0) and **Close** buttons.
  - The mana pool belongs to **the device user**, not a seat, matching LifeTap. In P2 it becomes per seat, opened from the seat menu.
  - The storm count **resets automatically when the turn passes**, if turn tracking is on.
  - Mana symbols: use **Scryfall's symbology SVGs** (`/symbology` endpoint, cached for offline use) or the open-source community "Mana" font. **Do not** use symbols ripped from official assets. Keep the attribution. (WotC Fan Content Policy; see §18.)
- **TOOL-012 (P1, M3):** **Generic counter page** for non-MTG presets: the preset can declare a "scratch counters" set (e.g. Pokémon damage calculator, Lorcana ink) using the same row UI.
- **TOOL-007 (P0, M1):** Tool results are shown **rotated toward the seat that invoked them**, or in the center if invoked from the toolbar. Randomness uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias.
- **TOOL-013 (P0, M1):** **Icons.** Dice icons come from an open-licensed set (e.g. game-icons.net, CC BY 3.0) or are custom-drawn SVGs, with attribution on the About screen (LifeTap credits "Dicefont").

## 17. Monetization

### 17.1 Principles
- The free tier must be a **complete, great app** for the common case (an MTG Commander pod, with life, commander damage, art, and a basic clock). Paywalling core life tracking would lose to free competitors.
- Premium sells **power, customization, and convenience**: advanced timers, custom presets, cloud sync breadth, stats, themes.
- **Do not paywall Scryfall-sourced data/images** (ART-007). Also be cautious with WotC's **Fan Content Policy**, which restricts charging for access to content that uses their IP. Premium features should be **game-agnostic** features (timers, builder, stats, themes, sync), not "premium MTG content". This is another reason your agnostic design is the right call. **Get a legal review before launch (Q7).**

### 17.2 Free vs. Pro split (owner delegated this decision; revisit before M7)

**How I split it.** Everything you need to **play** a game is free: tracking, art, tools, every clock mode, and the full current-game history. Pro sells **depth**: unlimited customization, and the **long-term stats** people love but rarely know exist. Free users get a real **taste** of stats (recent games, W/L, summary tiles, and a blurred preview of the locked Insights), so they find out the value before they meet the paywall. Nothing a free user records is ever deleted. Upgrading reveals it all (HIST-007).

| Area | Feature | Free | Pro |
|---|---|---|---|
| **Play** | All built-in presets, 2–6 players, One-player mode | ✅ | ✅ |
| | 7–8 players | — | ✅ |
| | Life and all counters, commander damage, partners, tokens, day/night | ✅ | ✅ |
| | Scryfall art (must stay free, ART-007), local image uploads, gradients | ✅ | ✅ |
| | Camera mode, player card layouts, all LifeTap-equivalent settings | ✅ | ✅ |
| **Tools** | Dice, custom die, coin, randomize player/opponent, quick access, Mana & Storm | ✅ | ✅ |
| **Timers** | Turn tracking, count-up, chess clock (bank), Respond/Pass back, global pause, timeout: lose / grace / flag | ✅ | ✅ |
| | Increment, delay, per-turn, hybrid, match timer + extra turns, "add time once", per-seat handicap, custom warning thresholds, declare-blockers window | ✅ (owner decision 2026-11-18: all clocks free) | ✅ |
| **Customize** | Custom presets | 1 | Unlimited + share links + import |
| | Player profiles / decks | 4 profiles, 1 deck each | Unlimited |
| | Themes, seat frames, sound packs | Default themes | ✅ |
| **History** | Current game: log, standings, life chart, edit from history | ✅ | ✅ |
| | Past games list | Most recent 5 viewable (all kept) | All |
| | Players tab (W/L, win %) | ✅ | ✅ + player detail pages and head-to-head |
| | Decks tab | Preview (top 3) | ✅ |
| | Insights | Summary tiles (games, total time, avg game) | Full: turn-order advantage, durations, elimination causes, first blood, commander-damage leaderboard, clock stats, by-preset |
| | Filters | Date range only | All filters |
| | Export / import (CSV/JSON) | — | ✅ |
| **Sync** | Sign in with Google; sync of settings, profiles, decks, presets | ✅ | ✅ |
| | Sync of game history across devices | — (kept on device) | ✅ |
| | Cloud sync of uploaded art | 5 images | 200 images |
| **Ads** | | **None** | None |

> **Why history sync is Pro but profile sync is free:** profile sync is the reason to create an account at all, and accounts help retention and later conversion. Cross-device history and deep stats are what power users will pay for.
>
> Open question Q5 (free-tier limits) is now **answered by this table** unless you change it.

- **PAY-001 (P0, M0):** Entitlement plumbing (`can(feature)`) exists from M0. All features are free until M7 (ARCH-008).
- **PAY-002 (P1, M7):** **Stripe Checkout** via the Firebase "Run Payments with Stripe" extension. Products: monthly (e.g. $1.99), yearly (e.g. $14.99), lifetime (e.g. $29.99). Prices are placeholders (Q4).
- **PAY-003 (P1, M7):** Entitlements are derived from Stripe subscription status (extension → custom claims or the `entitlements` doc) and are cached offline with a grace period (an offline premium user keeps premium for 14 days since last verification).
- **PAY-004 (P1, M7):** The paywall screen is reachable from locked features ("This is a Pro feature"), with a feature comparison. A **restore purchases** flow comes via sign-in.
- **PAY-005 (P2):** If the app is later wrapped for Google Play (TWA), Play Billing rules apply to digital goods. Plan for Google Play Billing via the Digital Goods API at that point. For iOS App Store wrapping, the IAP rules apply.

## 18. Legal, privacy, and compliance

- **LEG-001 (P0, M8):** **Privacy policy** and **Terms** pages covering the data collected (Google profile name/email, user content, analytics), its storage location (Firebase region), retention, deletion, and export.
- **LEG-002 (P0, M8):** **Disclaimer**: "Not affiliated with, endorsed, sponsored, or approved by Wizards of the Coast, The Pokémon Company, Konami, Square Enix, Disney/Ravensburger, Bandai, Fantasy Flight/Asmodee, Legend Story Studios, Erik's Curiosa… All trademarks belong to their owners." Include the WotC Fan Content Policy notice text if relying on that policy.
- **LEG-003 (P0, M5):** **Scryfall attribution** on the About screen, and artist credit per ART-005.
- **LEG-004 (P0, M8):** **Analytics consent** banner (EU/UK/CA). Analytics stays off until consent.
- **LEG-005 (P0, M5):** Uploaded images are private to the user and never public. A share-link preset carries no images in v1.
- **LEG-006 (P1, M8):** **Age**: the app is not directed at children under 13. Google sign-in age gating applies.

## 19. Non-functional requirements

### 19.1 Performance
- **PERF-001 (P0):** First load on a Moto G-class device over Fast 3G: **LCP < 2.5 s**. Repeat load (service-worker cached): **< 1 s to an interactive board**.
- **PERF-002 (P0):** A tap updates the number in **< 50 ms** (one frame budget plus overhead). The board sustains 60 fps during animations, with four simultaneous tappers.
- **PERF-003 (P0):** JS bundle for the board route: **< 200 KB gzipped** (excluding art). Firebase SDKs are lazy-loaded only when the user opens account/sync features.
- **PERF-004 (P0):** Battery: no continuous high-frequency work when clocks are off. When clocks run, only the holder's display updates (about 4 Hz, or 10 Hz under 10 s).
- **PERF-005 (P1):** Lighthouse scores: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90 on the launcher route (CI gate).

### 19.2 PWA
- **PWA-001 (P0, M0):** A web app manifest with name, short_name, icons (192, 512, maskable), `display: standalone` (try `fullscreen` on Android), theme/background color, `orientation: any`, start_url, and an id.
- **PWA-002 (P0, M0):** A service worker precaches the app shell and all routes needed offline, with a runtime cache for Scryfall images (cache-first, LRU) and Scryfall API responses (stale-while-revalidate, 24 h).
- **PWA-003 (P0, M0):** An **install prompt UX**: a custom "Install app" button (Android `beforeinstallprompt`) and an iOS "Add to Home Screen" instruction sheet, shown after the first completed game, not on first open.
- **PWA-004 (P0, M0):** An **update flow**. When a new service worker is waiting, show "Update available — Reload" **only when no game is in progress**, or on the launcher. Never auto-reload during a game.
- **PWA-005 (P0, M1):** **Screen Wake Lock** while on the game board (re-acquired on `visibilitychange`), with a fallback setting for unsupported browsers (§5.3).
- **PWA-006 (P1, M1):** A **Fullscreen API** toggle on Android, and safe-area insets (`env(safe-area-inset-*)`) respected for notches and gesture bars.

### 19.3 Accessibility
- **A11Y-001 (P0):** All controls have accessible names (e.g. "Conner life 21, increase"). Value changes are announced via an `aria-live="polite"` region, throttled.
- **A11Y-002 (P0):** WCAG AA contrast for UI chrome. A high-contrast theme option. A per-seat "increase contrast" option.
- **A11Y-003 (P0):** `prefers-reduced-motion` disables spin/confetti and pulse animations, using static highlights instead.
- **A11Y-004 (P1):** Color is never the only signal (the active clock has a ▶ icon and a border, not just a color; responders have ⚡).
- **A11Y-005 (P1):** Keyboard support on desktop (arrow keys adjust the focused seat, space passes the turn).

### 19.4 Reliability and quality
- **REL-001 (P0):** No game state loss on reload, crash, or OS process kill (ARCH-006). Verified by an e2e test that reloads mid-game and checks values and timers.
- **REL-002 (P0):** Engine unit test coverage **≥ 90 %** of lines and branches for `engine/` (reducer, timers, thresholds, presets).
- **REL-003 (P0):** E2E tests (Playwright) on Pixel 7 and iPhone 14 viewports (WebKit) for the critical flows: setup → play → commander damage → elimination → game end; timer start → pass → respond → pass back → timeout; reset with random first player; offline reload.
- **REL-004 (P0):** Error boundary on the board. If a render error occurs, offer "Recover game", which reloads state from IndexedDB.
- **REL-005 (P1):** Sentry error rate under 0.5 % of sessions.

### 19.5 Observability and analytics (consent-gated)
Key events: `game_start` (preset, players, timers on/off, mode), `game_end` (duration, turns), `timer_respond`, `timer_timeout`, `preset_custom_created`, `art_scryfall_selected`, `art_uploaded`, `sign_in`, `paywall_view`, `purchase`.

### 19.6 Security
- Content Security Policy that allows only self, Firebase, Google auth, Scryfall API/images, Stripe, and Sentry.
- No secrets in the client bundle. Firebase web config is public by design; App Check plus rules protect data.
- Dependencies scanned in CI (npm audit / Dependabot).

## 20. Release plan and milestones

| Milestone | Scope | Exit criteria (summary; `instructions.md` will expand these into gates) |
|---|---|---|
| **M0 Foundation** | Repo, Next.js + TS strict, Tailwind, lint/format, Vitest, Playwright, CI, Firebase project and App Hosting backend, PWA manifest + SW, entitlement stub, design tokens, icon set | CI green; deployed "hello board" on App Hosting is installable; Lighthouse PWA checks pass |
| **M1 Core board + MTG** | Engine (reducer, counters, thresholds, undo, log), layouts 1–6, touch handling, seat menu, MTG Commander/Constructed/Limited/Brawl/Oathbreaker presets, commander damage incl. partners, tax, tokens, day/night, reset + random first player, game end, local persistence, profiles (local), gradients/colors, dice/coin, settings, wake lock | Can play a full 4-player Commander game offline matching LifeTap's capabilities in the screenshots; engine coverage ≥ 90 % |
| **M2 Timers** | All P0/P1 timer modes, respond/pass-back stack, pause/auto-pause, timeout options, warnings, turn tracking, match timer, timer tab | Timer e2e scenarios pass; drift < 100 ms/60 min; reload-resume correct |
| **M3 Multi-TCG + builder** | Pokémon, Yu-Gi-Oh (calculator), FFTCG, Lorcana, One Piece, SWU, Digimon, Generic; per-seat overrides; custom preset builder with preview; export/import JSON | Each preset playable end-to-end by an e2e smoke test; builder validation tests |
| **M4 Auth + sync** | Google sign-in, guest→account merge, Firestore model, rules + tests, Storage rules, App Check, sync status, delete account, export | Rules tests green; cross-user access denied; merge flow e2e |
| **M5 Art** | Scryfall search/prints/art_crop/DFC, focal point editor, caching, attribution; uploads with resize/strip EXIF; cloud art sync | Art persists offline; Scryfall etiquette verified; uploads under 400 KB |
| **M6 History + stats** | Game records, history list, life chart, player stats | Records sync; stats correct against fixtures |
| **M7 Monetization** | Stripe extension, products, paywall, entitlements, gating, share links | Test-mode purchase → entitlement → feature unlocked; offline grace |
| **M8 Hardening + launch** | Perf budgets, a11y audit, legal pages, consent, analytics, Sentry, CSP, custom domain, store-like screenshots, landing page | All NFR gates pass; production deploy |

**MVP = M0 + M1 + M2 + a minimal M4 (Google sign-in + profile/preset sync).** This is the first version worth putting in your pod's hands. M3 can begin in parallel once the engine is stable.

## 21. Future ideas (not in scope, recorded for later)
- **Multi-device mode**: each player's phone shows their own seat and clock, synced in real time via Firestore or WebRTC. Great for big tables or streams.
- **Spectator / stream overlay** (OBS browser source showing life and timers).
- MTG **phase/step tracker** with a "stop at" setting.
- **Voice commands** ("Conner minus five").
- **Planechase / Archenemy** card decks built in.
- **Community preset gallery** with ratings.
- **Tablet "tabletop" mode** with circular seat placement for 6–8 players.
- **Team play** in general (2HG, Star Wars Twin Suns, 2v2 Lorcana).
- Apple Watch / Wear OS companion for a personal clock.

## 22. Open questions (with recommended defaults)

| # | Question | Recommended default |
|---|---|---|
| Q1 | App Hosting (Next.js, Blaze plan) vs. Firebase Hosting static export? | **App Hosting + Next.js** as you asked. It leaves room for share-link pages, OG images and Stripe webhooks. |
| Q2 | App name and domain? | Placeholder "TCG Life & Timers". Candidates: *TurnTap*, *ClockTap*, *Life & Clock*, *PodClock*, *TableClock*. Check trademark and domain availability. |
| Q3 | Default timeout behaviour for casual presets? | **Grace period 60 s → eliminate**, with "Flag only" one tap away in setup. Competitive presets: **lose immediately**. |
| Q4 | Pricing model and price points? | Freemium + **Pro**: $1.99/mo, $14.99/yr, $29.99 lifetime. Decide before M7. |
| Q5 | Free-tier limits? | **Decided in §17.2** (owner delegated): 4 profiles × 1 deck, 1 custom game type, 1 preset, 5 most recent games viewable (all kept), 5 cloud images (owner revision 2026-11-20) |
| Q6 | Should response time be charged to the responder (default) or freeze all clocks? | **Charge responder** by default, with "Freeze all" as an option (TMR-010) |
| Q7 | Legal review of trademark use and the WotC Fan Content Policy against paid tiers? | Get a short consult before M7. Keep premium features game-agnostic. |
| Q8 | Do you want the 7–8 player layouts to be premium? | Yes (low cost to free users, nice upsell) |
| Q9 | Do you want ads in the free tier? | **No.** Ads on a shared table device are a bad experience. |
| Q10 | Should the "me" profile auto-fill seat 1 (bottom-right or bottom-left)? | Yes, the seat nearest the device's bottom edge in portrait |
| Q11 | Is MTG mana pool tracking wanted? | P2 / opt-in only |
| Q12 | Should active games sync to the cloud (resume on another device)? | Not in v1 (ARCH-007) |
| Q13 | Pokémon, Yu-Gi-Oh!, FFTCG etc. rule numbers marked ⚠ VERIFY: do you have players in your community who can validate? | Validate during M3 with one player per game |

## 23. Glossary
- **Seat**: an on-screen player area rotated to face its player.
- **Preset**: data defining counters, rules and defaults for a game or format.
- **Primary counter**: the large number on a seat (life, prizes, lore …).
- **Token counter**: a marker held by at most one seat (Monarch, Initiative).
- **Matrix counter (`playerVsOpponent`)**: a value per (target, source) pair (commander damage).
- **Turn holder**: the seat whose turn it is.
- **Clock holder**: the seat whose clock is currently running.
- **Response stack**: seats that took priority out of turn, in order.
- **Bank**: a seat's remaining chess-clock time.
- **Increment (Fischer)**: time added to a bank after each turn pass.
- **Delay (Bronstein/simple)**: a free period at the start of each hold before the bank decreases.
- **Grace period**: extra time after a bank hits zero before the timeout action applies.

## 24. Appendix A: Reference screenshots (LifeTap) and what we take from them

| Observation in screenshot | Requirement |
|---|---|
| 2×2 layout, side columns rotated toward players, toolbar row in the middle (reset, player count, history, colors, dice) | LAY-002, §7.2 |
| Full-bleed card art per seat with a rounded tile and name pill | LAY-007, SET-002, ART-001 |
| Huge rotated life number; `+`/`−` glyphs at the tile ends | LIFE-001, INP-003 |
| Mini commander-damage grid on each tile with opponent art thumbnails and a "me" cell | CMD-002 |
| Badge (poison icon "8", commander-tax castle "1") on tiles | LIFE-002 |
| Skull overlay on an eliminated player (Josh) | LIFE-004 |
| Seat menu rotated toward the player, with **Player** tab: name, **Load**, Backgrounds, Colors, Increase contrast | §8.2, PROF-002, SET-003 |
| **Counters** tab: Monarch, Initiative, Ascend, Day/night, Energy, Exp, Treasure, Poison, Rad, C.Tax, K.O.; "Tap to increment. Hold for additional options."; commander-damage grid with "me" | §8.2, §10.2, CMD-010 |
| *Settings screenshots:* Players 2–6 chips, Layout thumbnails, Starting life 20/25/30/40/60 + Custom, Planechase/Archenemy/Bounty, Auto-KO, Commander damage life loss, Turn timer, Game history, Starting player, Colorize mini-grids, Player card layout, Auto-hide menu, Dice animations, One-player mode, Camera mode, Language, Keep awake, Haptics, Hide system bars, Feedback/Diagnostics | §13.1 (all included; Planechase/Archenemy/Bounty as P2) |
| *Dice & Misc:* Randomize player, Randomize opponent, Flip coin, Custom die (Set N → Roll), d4–d20, large result overlay, hold-the-die quick access | §16 TOOL-001..013 |
| *Mana Counter:* WUBRGC rows with −/+, Storm counter, Clear | TOOL-011 |
| *Game History, Current Game:* header card (game #, date, players, starting life), standings with commander subtitle and ☠, log with icons, colored delta chips, "Source → Target" | HIST-001, HIST-010..013 |
| *Past Games:* Games / Players / Profiles / Insights tabs, filter, export; turn-order advantage; duration stats | HIST-020..024, HIST-006; Profiles = our **Decks** (PROF-010) |
| *Problems seen:* 171-hour durations, mostly "No winner", "Player 1–5" counted as players, duplicate "Declan" | Fixed by HIST-030..034 |

**Additions beyond LifeTap:** chess clocks with respond/pass-back, turn tracking, multi-TCG presets, a custom builder, accounts and sync, stats, a calculator for high-LP games, and per-seat thresholds.

## 25. Appendix B: Key acceptance scenarios (seed for `instructions.md` gates)

1. **Commander pod, full game.** Setup 4 players with names and art → random first player animation picks Bethany → Bethany's tile shows the turn indicator. JP takes 5 commander damage from Conner: the mini grid shows 5 under Conner's cell, and JP's life goes 40 → 35. Undo reverts both. Josh's life reaches 0, so he shows a skull and is skipped in turn order. One survivor remains → game-over screen → Rematch → the new random starter is announced and all values are reset, with names and art kept.
2. **Partners.** Conner declares partners A and B. JP takes 12 from A and 12 from B: no elimination (24 total, but under 21 per commander). JP takes 9 more from A (21): eliminated, cause "21 commander damage from Conner (A)".
3. **Clock with response.** A 4-player chess clock at 10:00 each with 0 s increment. Start → P1 runs. After 30 s, P3 taps Respond: P1 paused at 9:30 and P3 running. After 20 s, P1 taps Respond (nested, stack depth 2). After 10 s, P1 taps Pass back → P3 resumes. P3 taps Pass back → P1 resumes. P1 passes the turn → P2 runs. Final banks: P1 = 10:00 − 30 s − 10 s − (time after returning) etc. All match to ±100 ms.
4. **Timeout with grace.** P2 bank 0:05, grace 0:10. Let it run: at 0 the tile shows overtime and red. After 10 s more, P2 is eliminated with cause "Time", and the turn advances to P3 automatically.
5. **Reload resilience.** Mid-game with P2's clock running, reload the page: the board restores, and P2's remaining time accounts for the elapsed time (or the game is paused if auto-pause-on-background is on, with remaining time equal to the time at hide).
6. **Offline.** Airplane mode → open the installed app → start a new game, play, and finish it. The history record is stored locally and syncs after reconnecting (when signed in).
7. **Custom preset.** Build "Lore Race": primary "Lore", up, start 0, win ≥ 20; a second counter "Ink", resets each turn. Play a 2-player game: reaching 20 shows the winner.
8. **Data separation.** User A cannot read or write `users/B/**` (rules test). The client cannot write entitlements (rules test).
9. **Yu-Gi-Oh calculator.** LP 8000 → enter `−2300` → 5700 → `/2` → 2850 → history shows the tape.
10. **Pokémon.** Prizes 6 → take 6 → win. Active damage +30 (3 taps at step 10) → "KO'd/reset" clears it.
11. **History and stats.** Play 3 games with profiles and decks: one with a clear winner, one reset mid-game (the "Who won?" prompt picks a winner), and one left idle for 2 hours before finishing. Past Games shows 3 games. The idle game's duration excludes the idle gap. Players shows W/L with no "Player N" rows. Insights turn-order advantage matches the fixtures. Merging two same-name players combines their records. CSV export has one row per game-seat.
12. **Dice.** Hold 🎲 → the quick menu → release on d20 → the result overlay faces the toolbar, and the roll appears in the history log. Randomize opponent from JP's seat never returns JP or an eliminated seat (property test, 10k runs).

---

*End of PRD v0.1. Next step after your review: convert it into `instructions.md` (phased execution with loops, gates, test commands and done-criteria per requirement ID).*
