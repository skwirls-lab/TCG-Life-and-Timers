# Gate runs

## W0 (M0 Foundation)
| Gate | Command | Result |
|---|---|---|
| G-STATIC | `npm run typecheck && npm run lint && npm run format:check` | ✅ exit 0 |
| G-UNIT | `npm run test:unit -- --coverage` | ✅ 28 tests; logic coverage 96.7 % lines / 90.3 % branches |
| G-PRESETS | `npm run check:presets` | ✅ (0 presets; stub) |
| G-RULES | `npm run test:rules` | ✅ 1 test (baseline deny) |
| G-FUNCS | `npm run test:functions` | ✅ 1 test |
| G-BUILD | `npm run build` | ✅ |
| G-E2E + G-A11Y | `npm run test:e2e` | ✅ 12 passed (3 projects: pixel7, iphone14-emu, landscape) |
| G-TRACE | `npm run check:trace -- --plan` | ✅ all P0/P1 cited by task cards (237 reqs) |
| G-LH | `npm run lhci` | ✅ baseline: Perf 100 · A11y 100 · BP 100 · SEO 100 |

## W2 integration (BOARD + SEATMENU + SHELL + TOOLS-HIST + TIMER-CORE)
| Gate | Result |
|---|---|
| G-STATIC | ✅ |
| G-UNIT | ✅ 612 tests; logic coverage ≥ thresholds (engine ~99/95) |
| G-PRESETS | ✅ 7 presets |
| G-E2E + G-A11Y | ✅ 279 passed (3 projects), 0 flaky — incl. new cross-lane `integration-board.spec.ts` |
| G-VISUAL | ✅ orchestrator review of board 4p, seat menu, history, settings, setup, tools at 360×740. Fixed: thumbnails (theme vars + rect frame), chip-row shape, duplicate snackbar. Board lane reviewed 2–6p in portrait + landscape. |
| G-RULES / G-FUNCS | ✅ (unchanged since W1: 78 / 21) |

## W3 partial integration (PRESETS + BUILDER + FIREBASE-CLIENT on top of W2)
| Gate | Result |
|---|---|
| G-STATIC | ✅ |
| G-UNIT | ✅ 813 tests; logic coverage 97.98 % lines / 93.14 % branches |
| G-PRESETS | ✅ 20 presets |
| G-RULES | ✅ 80 (incl. focal zoom cases) |
| G-SYNC (`npm run test:sync`) | ✅ 5 |
| G-E2E + G-A11Y | ✅ 381 passed, 0 flaky |
| G-E2E-EMU | ✅ 15 passed (@emu account/sync/feedback specs) |
