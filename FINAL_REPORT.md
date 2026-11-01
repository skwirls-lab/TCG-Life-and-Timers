# Final report: TCG Life & Timers v1.0.0

The app is built to [PRD.md](PRD.md) v0.3 by following [instructions.md](instructions.md). Every task card, from wave W0 through W6, is merged. The gate results below come from a **clean checkout** of the merged branch, with `npm ci` run fresh.

## What was built

**Life tracking board.** 1 to 8 seats, with layout variants for portrait and landscape and a "facing" rotation for each player. Each seat has:
- Tap ±1 and hold ±10 (the hold step is configurable), with a running delta badge.
- A seat menu with tabs for counters, commander damage, art, name and profile.
- A mini-grid for commander damage per opponent and per partner. It can be coloured by opponent.
- Thresholds, auto-KO, and a configurable "commander damage also costs life".
- An undo/redo history (100 steps) and a per-game event log.

**Counters and tokens.** Poison, energy, experience, rad, commander tax, storm, the mana pool and a treasure-style token counter. Monarch and initiative, with Undercity room progress. Day/night. Custom counters per preset.

**Timers.** A multiplayer chess clock for every seat:
- Modes: per-turn, bank, and bank + increment. Grace periods with an overtime display.
- Elimination on timeout, after which the turn moves on automatically.
- A **Respond / take priority** stack. Responses can be nested, with "Pass back" and "Return".
- A match/round timer that works even when per-seat clocks are off, plus extra turns.
- Warnings by sound, vibration or flash. Auto-pause when the app goes to the background.
- Clocks survive a reload: elapsed time is accounted for, and the engine stores time in its actions.

**Presets.** 20 presets, all validated by `check:presets`:
- MTG: Commander, Brawl, Oathbreaker, Constructed, Limited, Two-Headed Giant, Archenemy.
- Pokémon: Standard and Pocket.
- Yu-Gi-Oh!: Advanced, Speed Duel and Rush.
- Lorcana, Flesh and Blood, Final Fantasy TCG (damage pips), Star Wars: Unlimited (Base HP), One Piece, Digimon (shared memory gauge), Sorcery (Death's Door), and a generic life counter.

A **Custom builder** handles everything else: counters, thresholds, timer defaults, and share links (Pro).

**Game flow.** Choose the first player at random (crypto-seeded), by d20 roll-off, by coin flip, or manually. The first player is shown on the tiles. Reset asks "Who won?" first, then asks for confirmation and offers Undo. Other features:
- Players can be added or removed during a game.
- Camera mode, one-player mode, and keep-awake.
- Hidden system bars, haptics, and swipe input.
- Desktop keyboard controls.

**Art.** Scryfall search with card prints, a focal-point and zoom editor, and attribution. Commander auto-art. Your own uploads go to Firebase Storage with a quota. Art is cached for offline use, and you can clear the cache.

**Accounts and sync.** Google sign-in, with each user's data kept separate (Firestore rules are tested in the emulator). Synced data: settings, profiles, custom presets, game history and art. Offline comes first: everything is in IndexedDB, and the cloud is optional and loads lazily. Two other safeguards:
- An account merge on first sign-in.
- Two open tabs can't overwrite each other ("Use here").

**History and stats.** Current-game log, Past Games with filters, per-player and per-deck stats, merge/edit of player identities, and JSON export and import.

**Tools.** Dice (d4 to d20, plus custom), a coin, a random player, a counters page, a mana and storm page, and a life calculator for Yu-Gi-Oh! and similar games.

**Pro (Stripe).** Monthly, yearly and lifetime plans through the Firebase Stripe extension. The client gates features, and the server enforces them through `config/billing.paywallEnabled`. Refunds and disputes revoke lifetime Pro. Deleting an account cancels Stripe subscriptions. The paywall is **off by default**, so everything is free until you turn it on. Scryfall art is never paywalled. The free/Pro split is in PRD §17.2.

**PWA and hardening.** A Serwist service worker with offline precache and an update prompt. Install prompt and What's new. CSP and security headers. Consent-gated analytics and Sentry. Legal pages (drafts). Accessibility: axe-clean, a live announcer, and signals that don't rely on colour. Works at 320 px.

## Gate results (clean checkout)

GATE_TABLE

Bundle (PERF-003, revised in D-067): the `/play` app JS is ~162 KB gzip on top of the ~131 KB shared React/Next runtime, for a total of ~294 KB against the 300 KB cap. That leaves about **6 KB** of headroom; the next large feature should be lazy-loaded.

Traceability: `npm run check:trace -- --all` passes. Every P0/P1 requirement in milestones M0–M4 is cited by at least one test, or is listed in `docs/progress/TRACE-EXEMPT.md` (ARCH-003 and ARCH-007 are exempt; PERF-001, PERF-005, REL-002, REL-003 and ENV-002 are enforced by gates). See `docs/progress/TRACE.md`.

## Independent reviews
- **Review A** (product/UX): 12 findings. All fixed in lane `fix-a` (D-073). See `docs/progress/REVIEW-final-A.md`.
- **Review B** (security/correctness): 9 findings. All fixed in lane `fix-b` (D-072). See `docs/progress/REVIEW-final-B.md`.

## Not verified in this sandbox
- **Live Scryfall**: the sandbox network blocks `api.scryfall.com` and `cards.scryfall.io`. Art search runs against recorded fixtures through MSW. To refresh the fixtures, run `scripts/record-scryfall-fixtures.ts` on a machine with network access.
- **Real devices**: tests ran in Playwright Chromium (Pixel 7, an emulated iPhone 14, and landscape). WebKit runs in CI only. Haptics, wake lock and install prompts need a check on real phones.
- **Real Firebase and Stripe**: everything ran against the emulator suite (`demo-tcg-life`). There is no live project or live Stripe yet.
- **Game rules**: values marked `verify` are listed in [docs/RULES-TO-VERIFY.md](docs/RULES-TO-VERIFY.md). Production builds hide the hints unless `NEXT_PUBLIC_SHOW_VERIFY=1` is set.

## Deferred (P2, by design)
- Planechase, Bounty, and dungeon/venture tracking (TOK-005).
- Team play beyond Two-Headed Giant's shared life.
- Bronstein/simple delay and hybrid byo-yomi clocks, and a different time per player.
- A per-seat mana pool and per-seat layout overrides.
- Languages other than English (all strings are already externalized).
- A community preset gallery, friends and linked accounts, full MTG phase tracking, and a TWA/Play Billing wrapper.

## Your next steps
Follow **[DEPLOY.md](DEPLOY.md)**:
1. Create the Firebase project and enable Auth (Google), Firestore, Storage, Functions and App Hosting (Blaze plan).
2. Fill in the `NEXT_PUBLIC_FIREBASE_*` values in `apphosting.yaml` and connect App Hosting to `main`.
3. Deploy the rules, indexes and functions. Either use the GitHub Action with the `FIREBASE_SERVICE_ACCOUNT` secret and the `FIREBASE_PROJECT_ID` variable, or deploy manually.
4. Go through the post-deploy checklist in Part 6.
5. Later: Stripe (Part 7), Sentry and analytics (Part 8), and a custom domain (Part 9).
6. Before charging money:
   - Fill the legal `[bracket]` placeholders, have the pages reviewed, and remove the Draft banners.
   - Check RULES-TO-VERIFY.

Decisions are in `docs/progress/DECISIONS.md` (D-001…D-073).
