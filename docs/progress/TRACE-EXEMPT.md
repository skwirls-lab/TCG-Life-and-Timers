# Trace exemptions (requirement → how it is verified instead)

- ARCH-003: enforced structurally (presets are data, validated by G-PRESETS; UI renders from definitions). Reviewed in G-REVIEW.
- ARCH-007: design constraint (no real-time sync of active games), verified by review.

## Pending (temporary; must be empty for `check:trace -- --all`)
- INP-005: PENDING(T8.8) swipe-to-change input (P1, off by default) — not built in W2

## Gate-enforced (verified by a gate rather than a tagged test)
- PERF-001: G-LH (Lighthouse Performance 100 on /, /setup, /settings; prod build) + PERF-003 bundle gate; real-network LCP is a post-deploy check (DEPLOY.md)
- PERF-005: G-LH thresholds in lighthouserc.json (`npm run lhci`)
- REL-002: G-UNIT coverage thresholds in vitest.config.ts (engine ≥90 % lines/branches; measured ~99/96)
- REL-003: playwright.config.ts projects pixel7 + iphone14-emu (+ real WebKit in CI)
- ENV-002: desktop usable — G-LH runs desktop preset; FINAL-POLISH keyboard specs run at 1280×800
