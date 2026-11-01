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

## W3 complete (TIMER-UI + INTEGRATE-A + board calculator)
| Gate | Result |
|---|---|
| G-STATIC | ✅ |
| G-UNIT | ✅ 841 tests |
| G-E2E + G-A11Y | ✅ 489 passed, 0 failed, 0 flaky (incl. Scenarios 3, 4, 5, 7, 9, 10 through the UI) |
| G-E2E-EMU | ✅ 15 (W3 partial run; account/sync unchanged since) |

## Final acceptance (clean checkout, after FIX-A + FIX-B)
Commit `2c77488`, run on a fresh worktree after `npm ci` (root and `functions/`).

| Gate | Command | Result |
|---|---|---|
| G-STATIC | `npm run typecheck && npm run lint && npm run format:check` | ✅ |
| G-UNIT | `npm run test:unit -- --coverage` | ✅ 1160 tests in 127 files; logic coverage 97.65 % lines, 96.55 % statements |
| G-PRESETS | `npm run check:presets` | ✅ 20 presets |
| G-RULES | `npm run test:rules` | ✅ 93 |
| G-FUNCS | `npm run test:functions` | ✅ 48 |
| G-SYNC | `npm run test:sync` | ✅ 8 |
| G-BUILD | `npm run build && npm run check:bundle` | ✅ /play 295.2 KB gzip total, / 271.8 KB; no Firebase SDK in /play chunks |
| G-E2E + G-A11Y | `npm run test:e2e` | ✅ 852 passed (pixel7, iphone14-emu, landscape) |
| G-E2E-EMU | `npm run test:e2e:emu` | ✅ 30 passed |
| G-LH | `npm run lhci` | ✅ 100/100/100/100 on /, /settings and /setup (3 runs each) |
| G-TRACE | `npm run check:trace -- --all` | ✅ 229 P0/P1 requirements in scope, all traced or exempt |
| Acceptance | `npm run test:acceptance` | ✅ Scenarios 1–12: 171 e2e + 21 unit + 93 rules |
