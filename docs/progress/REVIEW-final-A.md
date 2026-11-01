# Review A: product/UX review of TCG Life & Timers (test build, HEAD 227061f)

Method: `.next-test` build served on 127.0.0.1:3120. I drove it with Playwright scripts (`artifacts/review-a/scripts/*.mjs`) at 360×740 and 915×412 (DSF 2, touch), plus 320×568 for ENV-003. I looked at every screenshot referenced below. Scryfall was intercepted with `tests/fixtures/scryfall`. Quick-start URLs are written as `Q(...)` = `/play?quick=...&seed=7&names=...`.

## Findings

### A-1 (major) Board: after the first-player pick, nothing on the board says who goes first
- Repro 1: `/setup`, Commander, Next ×3, Start game. The centred list cycles, lands on a name, and closes itself 2 s later (`RESULT_MS = 2000`). From then on no seat shows any first-player or active marker.
- Repro 2: `Q(mtg.constructed, players=2)`, hold Reset. "Josh goes first" shows for about 2 s, then the board is plain again.
- Screenshots: `start-firstplayer-anim.png`, `start-after-5s.png`, `reset-landed-2p.png`, `reset-final-2p.png`.
- Expected: GAME-011 says the starter "becomes Player 1 / active seat", and the pick is a highlight cycling around the **seats**. App. B scenario 1 says "Bethany's tile shows the turn indicator" (LIFE-006).
- Actual: Turn tracking defaults Off whenever timers are Off (`engine/options.ts`), so the tile marker never renders in the default Commander game. The pick is an upright list in the centre, so side and top players read it sideways or upside down. Anyone who looks away for 2 s misses the result; it then exists only in the history log.
- Also: the reset "Game reset · Undo" snackbar sits on top of this overlay and hides the "Player 1" chip and the highlighted name (`reset-landed-2p.png`, `rematch-anim.png`).

### A-2 (major) Commander mini-grid: partner damage is clipped and shows wrong numbers
- Repro (done 3 times: 4p, 6p, and the scenario-2 run):
  1. `Q(mtg.commander, players=4)`. Open Conner's menu and turn on Partner commanders.
  2. Open JP's menu, Commander damage tab. Tap Conner A ×14 and Conner B ×12.
  3. Close the menu and look at JP's mini-grid.
- Screenshots: `grid-zoom-4p.png`, `grid-zoom-6p.png`, `partner-21-board.png`.
- Expected: CMD-002/CMD-003 say the mini-grid shows the damage received, per commander for partners.
- Actual: the split cell renders as "4|1" (DOM text "14|12"). At 21|12 it shows "1|1". Two-digit partner values are clipped to their last digit. The grid is the at-a-glance lethal check, so it tells players JP has taken 1 damage when he has taken 21.

### A-3 (major) Pokémon and Yu-Gi-Oh!: the default match timer exists but can't be seen or started
- Repro: `Q(pokemon.standard, players=2)`, then `Q(ygo.advanced, players=2)`.
- Actual: `game.timer.match` is set (50 min with 3 extra turns; 40 min with 2). But `mode` is `off`, so `ClockToolbar` renders only a disabled clock icon, `match-clock` never renders, and START does nothing (reducer returns early when mode is off). Settings › Timers shows only "Timer mode: Off". The round timer row is hidden, so players can't even see that a match timer is configured.
- Expected: §10.3 says "match timer of 50 min plus per-seat chess clock off". §10.4 says "Default: a 40 min match timer". TMR-032 / §9.2 say the match timer "can be combined with any per-seat mode".
- Impact: a round timer with no per-seat clocks, the most common tournament need, is impossible to run.

### A-4 (major) Digimon: the shared memory gauge never appears on the board
- Repro: `Q(digimon.standard, players=2)`. Nothing shows between the seats (`preset-digimon.standard.png`). The gauge is reachable only as a "Memory 0" tile in a seat menu's Counters tab (`digimon-menu-counters.png`).
- Expected: §10.6 says memory is "a shared track in the center", and the preset sets `display:"track"` with `visibility:"board"`.
- Actual: `display: "track"` is never read by any component. `toolbarGlobals()` only shows global **enum** counters. Memory changes every turn in Digimon, so the preset is close to unusable for its signature mechanic.

### A-5 (major) Toolbar overflows at narrow widths: Settings and Tools off-screen before START
- Repro (2p, 3p and 4p): open `Q(mtg.commander, players=2 or 4)&t.mode=bank&t.bankMs=600000` at 320×568.
- Measured: `toolbar-settings` box x=329.7 (2p) or 321.7 (3p/4p), width 48, viewport 320. Settings is fully off-screen and the dice button is cut (`toolbar-320-2p-start.png`).
- At 360 wide, 2p puts the gear 17 px past the edge (`preset-fftcg.standard.png`).
- Expected: ENV-003 (P0) says the minimum viewport is 320×568 and must be "usable". §7.2 lists the toolbar actions.
- Actual: the wide START pill pushes the last icons out of the strip and there is no wrap or scroll. Settings can't be reached from the board until the clock starts.

### A-6 (major) FFTCG: damage is a plain number, not the 7-pip display
- Repro: `Q(fftcg.standard, players=2)`, tap + ×3. The tile shows a big "3" with no slots and no "/7" (`fftcg-3dmg.png`, `preset-fftcg.standard.png`).
- Expected: §10.5 asks for "big pips display (7 slots filling) instead of a plain number". The preset sets `display:"pips"`.
- Actual: no renderer reads `display:"pips"` (validate.ts only). Players can't see how close they are to losing without remembering "7".

### A-7 (minor) Response banner hides the responder's name on 4-player portrait
- Repro: `Q(mtg.commander, players=4)&t.mode=bank&t.bankMs=600000`, START, then tap ⚡ on Josh's tile.
- Actual: the other seats show only "⚡ 0:01" (`timer-respond.png`). The name is `sr-only` when compact (`SeatTimerBar.tsx` ResponseBanner).
- Expected: TMR-005 shows "⚡ Bethany responding" on all seats. Josh's yellow tile ring does help.
- Related: Respond, Pass back and Return are icon-only round buttons (⚡, ↶, ↷) in 4p, portrait and landscape. TMR-005/006 name them "⚡ Respond" and "↩ Pass back", so first-time players have to guess.

### A-8 (minor) Snackbars cover the toolbar and sit above overlays
- "JP eliminated · Undo" and "Bethany eliminated · Undo" cover the History, Players, Pause and Tools buttons for 5 s (`partner-21-board.png`, `timeout-grace-after.png`). With clocks running, that hides the Pause button exactly when a timeout has just happened.
- "Passed to Conner · Undo" stays above the PAUSED dim layer (`timer-paused.png`).
- "Game reset · Undo" overlaps the first-player result (A-1).

### A-9 (minor) Camera mode cuts names short with room to spare
- Repro: `Q(mtg.commander, players=4)&s.cameraMode=bottom`.
- "Conner" shows as "Co…" and "Bethany" as "Bet…" on 175 px tiles (`mode-camera-bottom.png`). SET-033.

### A-10 (minor) Star Wars: Unlimited tile doesn't show the base HP being counted toward
- Repro: `Q(swu.premier, players=2)`. Both tiles show "0" (`preset-swu.premier.png`). The per-seat 25/28/30 chosen in setup appears nowhere on the board or in the seat menu (Counters shows only Initiative).
- Expected: PRE-013 per-seat threshold. Showing "0 / 28" or a ring would make it usable.
- Setup copy is also odd: a "Starting Base damage: 0 | Custom" chip row.

### A-11 (minor) Copy and trust issues
- Almost every preset card in setup, and the setup Options footer, shows the orange "⚠ Some rule values still need checking". Rules summaries contain "⚠ verify" ("Starting life 25 (verify for your group)", "4000 to start, ⚠ verify"). These are internal VERIFY markers shown to end users.
- The About page shows "DRAFT LEGAL TEXT, PENDING REVIEW". Privacy and Terms show "Draft — requires owner/legal review" (D-069 placeholders; fine for now, but they must not ship).
- What's new says "Installed version: 0.1.0" above a "Version 1.0.0" entry (`page_whats-new.png`). About says 0.1.0.
- Pokémon opening flow says "Gary goes first", then offers "Flip a coin to decide" right under it (`poke-fp.png`), which contradicts itself.
- Settings › Time per player subtitle reads "10m each (minutes; … for a custom h:mm)".
- "Share the app" and "Clear image cache" show "Coming soon" (SET-040, ART-006).
- History calls the game "Game JQ95" rather than "Game 8" (HIST-001 example).

### A-12 (minor) Seat menu: content scrolls under a transparent tab bar
- Repro: Conner's menu › Backgrounds › Search card › Sol Ring.
- The "Backgrounds" heading draws through the Player-tab underline (`art-prints.png`).

## Checked and OK (no finding)
- Rotation and clockwise order for 2–6p in portrait and landscape.
- Taps, the pending bubble (−3) and hold (+10 after 500 ms, repeating every 400 ms).
- Commander damage auto-life-link and its grouped history rows.
- Scenario 2 partners: 12+12 does not eliminate; 21 from A does.
- Pass turn with undo; nested response; pause and resume; settings auto-pause with Resume prompt on return (SET-013).
- Grace timeout passes the turn; flag counts negative.
- Yu-Gi-Oh! calculator tape: 8000 − 2300 = 5700, 5700 ÷ 2 = 2850.
- Pokémon: 6 prizes = win.
- Builder Lore Race: create, save, play, win at 20.
- Quick-tools hold → release on d20.
- Who's-choosing picker for Randomize opponent.
- Launcher resume card; light and high-contrast themes; one-player mode.
- Art picker with fixtures; /account unconfigured state; /pro with `pw=1`.

## Five things that work notably well
1. Seat rotation is correct everywhere. The rotated seat menu, calculator and per-seat snackbars face the right player, including in landscape.
2. The chess-clock UX: a strong holder chip and border, RESPONDING tile ring, OVERTIME/FLAG states, a 3 s pass undo on the passer's seat, and auto-pause when Settings opens.
3. Commander damage via the menu: per-commander partner cells, atomic life link, a "Source → Target" log, and correct per-commander 21 elimination.
4. The Yu-Gi-Oh! calculator with a readable arithmetic tape, plus the hold-the-die quick tools (release-to-fire works).
5. The custom builder goes from a blank preset to a playable game with win detection in under a minute, with a live preview and per-turn reset counters.
