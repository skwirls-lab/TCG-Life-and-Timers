# E2E conventions

- Specs live here; tag emulator-dependent specs with `@emu` in the test title.
- Requirement tags: `// @req ID` comments at the top of each spec (G-TRACE).
- Start a deterministic game: `/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany`
  (test builds only; see `src/state/testHooks.ts`). `window.__tcg.getState()` / `.dispatch()` are available.
- Time: use `page.clock` (Playwright clock API). Never `waitForTimeout` > 250 ms.

## data-testid conventions
| Element | testid |
|---|---|
| Seat tile (index = seat order, 0-based) | `seat-{i}` |
| Seat + / − zones | `seat-{i}-plus`, `seat-{i}-minus` |
| Seat primary value | `seat-{i}-value` |
| Seat pending bubble | `seat-{i}-bubble` |
| Seat name pill | `seat-{i}-name` |
| Seat badges row / badge | `seat-{i}-badges`, `seat-{i}-badge-{counterId}` |
| Commander mini-grid cell | `seat-{i}-cmd-{sourceSeatIndex}` |
| Eliminated / winner overlay | `seat-{i}-eliminated`, `seat-{i}-winner` |
| Toolbar buttons | `toolbar-reset`, `toolbar-players`, `toolbar-history`, `toolbar-clock`, `toolbar-tools`, `toolbar-settings`, `toolbar-daynight` |
| Seat menu | `seat-menu` (+ `seat-menu-tab-{tab}`, `seat-menu-close`) |
| Counter tile in the seat menu | `counter-{counterId}` |
| Commander damage cell in the seat menu | `cmd-cell-{sourceSeatIndex}-{commanderIndex}` |
| First-player overlay / game-over overlay | `first-player-overlay`, `game-over` |
