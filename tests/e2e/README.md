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

### Board additions (W2)
`board`, `play`, `toolbar`, `toolbar-handle`, `seat-{i}-cmdgrid`, `seat-{i}-cmdquick`, `seat-{i}-cmd-{src}-{k}` (partner split), `players-popover`, `players-count-{n}`, `players-layout-{id}`, `players-confirm`, `players-cmd-mode`, `cmd-mode-exit`, `reset-dialog`, `reset-confirm`, `quick-tools`, `quick-d{n}`, `quick-coin`, `quick-player`, `quick-opponent`, `tool-result-value`, `tool-result-total`.
Test builds: `/play?...&s.cameraMode=bottom&s.onePlayerMode=1` apply settings in memory.

### Timers (W3, TIMER-UI)
Test-only timer config after a quick start on `/play` (applied with `TIMER_SET_CONFIG`; see
`src/features/timer/model.ts` `parseTimerParams`):
`t.mode` (off/countup/bank/bankIncrement/bankDelay/perTurn/perTurnReserve), `t.bankMs`,
`t.incrementMs`, `t.delayMs`, `t.perTurnMs`, `t.reserveMs`, `t.graceMs`, `t.addOnceMs`,
`t.timeoutAction` (lose/grace/flag/addOnce), `t.finalAction`, `t.responses` (charge/freeze/disabled),
`t.passMode` (tap/hold), `t.autoPauseBackground`, `t.autoPauseMenus`, `t.showTenths`,
`t.showTurnTime` (1/0), `t.warnings=300000,60000`, `t.matchMs` + `t.extraTurns`,
`t.blockersWindow` (1/0), `t.blockersMs`, `t.blockersTimeout` (wait/return) and the TMR-060 handicap
`t.seatExtra=s2:300000,s3:-60000` (extra ms per seat id).
Example: `/play?quick=mtg.commander&players=4&seed=7&t.mode=bank&t.bankMs=600000&t.timeoutAction=grace&t.graceMs=10000`.

Helpers in `support/timer.ts`: `gotoClockBoard` (installs `page.clock` before navigation, then
pauses time so it only moves with `runFor`), `timerState`, `storedTimer`, `setHidden`. To come back
to the board after visiting another page use `page.goto("/play")` (the quick-start URL would start
a new game). axe needs real timers: call `page.clock.resume()` before it.

| Element | testid |
|---|---|
| Timer bar / clock chip / time text | `seat-{i}-timerbar`, `seat-{i}-clock` (`data-state`, `data-holder`, `data-running`, `data-responder`, `data-flash`), `seat-{i}-clock-time` |
| Turn chip (clocks off) / PASS TURN | `seat-{i}-turn`, `seat-{i}-pass` (`data-hold="1"` in hold mode) |
| Respond / Pass back / Return to active | `seat-{i}-respond`, `seat-{i}-passback`, `seat-{i}-return` |
| Response banner / stack depth / chip details | `seat-{i}-banner`, `seat-{i}-depth`, `seat-{i}-clock-peek` |
| Holder / overtime tile border | `seat-{i}-frame` |
| START / Pause-Resume / match clock | `timer-start`, `toolbar-clock` (`data-state`), `match-clock`, `match-clock-time`, `match-time-called` |
| PAUSED overlay | `timer-paused` (`data-reason`), `timer-resume` |
| Settings section C | `setting-timer.{mode,bank,step,perTurn,match,extraTurns,timeoutAction,grace,responses,passMode,autoPauseBackground,autoPauseMenus,warnings,showTenths,showTurnTime}`, `timer-restart-confirm`, `timer-restart-continue`, `timer-restart-cancel`, `timer-custom-keypad` |
| Low-time warnings sub-page (TMR-031) | `settings-sub-warnings`, `timer-warnings-preset`, `timer-warning-{i}` (`data-ms`), `timer-warning-{i}-{sound,vibrate,flash,remove}`, `timer-warning-add-{ms}`, `timer-warnings-empty` |
| Setup Clock section | `setup-clock`, `setup-clock-mode`, `setup-clock-bank-{min}`, `setup-clock-step-{s}`, `setup-clock-perTurn-{ms}`, `setup-clock-timeout` |
| Seat-anchored snackbar | `snackbar` (`data-anchored="1"` when placed at a seat) |
| Seat Timer tab | `seat-timer-tab`, `seat-timer-remaining`, `seat-timer-used`, `seat-timer-stats`, `seat-timer-adjust-{deltaMs}`, `seat-timer-set`, `seat-timer-keypad`, `seat-timer-concede`, `seat-timer-off` |

### Paywall (W5)
`pw=1` → TIERED policy, free user; `pw=pro` → TIERED + Pro; `pw=0` → build default (persisted per tab in sessionStorage). `window.__tcgPay.state()` exposes the entitlement state in test builds.
