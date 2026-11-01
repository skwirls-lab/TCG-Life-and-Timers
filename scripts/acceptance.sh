#!/usr/bin/env bash
# PRD Appendix B acceptance scenarios 1–12 (T8.8 / instructions §13.3).
# Runs the e2e specs that implement each scenario (test build) plus the rules suite (Scenario 8).
#  1 Commander pod: commander.spec (Scenario 1), game-flow.spec (game over, rematch), integration-records
#  2 Partners: commander.spec (Scenario 2)
#  3 Clock with responses: timer-respond.spec (Scenario 3)
#  4 Timeout with grace: timer-timeout.spec (Scenario 4)
#  5 Reload resilience: timer-reload.spec (Scenario 5)
#  6 Offline: acceptance-offline.spec (Scenario 6)
#  7 Custom preset: builder-scenario7.spec (Scenario 7)
#  8 Data separation: tests/rules (npm run test:rules)
#  9 Yu-Gi-Oh! calculator: calculator.spec (Scenario 9), integration-board (board calculator)
# 10 Pokémon: presets-pokemon.spec (Scenario 10)
# 11 History & stats: history-past*.spec (Scenario 11), integration-records
# 12 Dice: tools.spec, integration-board (quick tools), src/lib/random property test (unit)
set -euo pipefail
npm run build:test
npx playwright test --grep-invert @emu --workers=3 \
  tests/e2e/commander.spec.ts tests/e2e/game-flow.spec.ts tests/e2e/integration-records.spec.ts \
  tests/e2e/timer-respond.spec.ts tests/e2e/timer-timeout.spec.ts tests/e2e/timer-reload.spec.ts \
  tests/e2e/acceptance-offline.spec.ts tests/e2e/builder-scenario7.spec.ts \
  tests/e2e/calculator.spec.ts tests/e2e/integration-board.spec.ts tests/e2e/presets-pokemon.spec.ts \
  tests/e2e/history-past*.spec.ts tests/e2e/tools.spec.ts
npx vitest run src/lib/random src/engine/scenarios.test.ts src/engine/timer/scenarios.test.ts
npm run test:rules
echo "ACCEPTANCE: scenarios 1–12 passed"
