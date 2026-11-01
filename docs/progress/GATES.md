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
