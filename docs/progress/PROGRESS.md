# PROGRESS (master checklist; see instructions.md §3)

Statuses: TODO → IN_PROGRESS → VERIFYING → DONE | BLOCKED_FALLBACK | DEFERRED_P2

| Task | Title | Wave | Lane | Status | Req | Gate evidence |
|---|---|---|---|---|---|---|
| T0.1 | Scaffold app | W0 | ORCH | DONE | ARCH-001..003, ENV-001..003. | see GATES.md#w0 |
| T0.2 | Tooling and scripts | W0 | ORCH | DONE | REL-002, REL-003. | see GATES.md#w0 |
| T0.3 | Firebase emulator scaffolding | W0 | ORCH | DONE | ARCH-008, SEC-001 (baseline). | see GATES.md#w0 |
| T0.4 | PWA shell | W0 | ORCH | DONE | PWA-001..004. | see GATES.md#w0 |
| T0.5 | Design system | W0 | ORCH | DONE | LAY-007, INP-009, A11Y-002. | see GATES.md#w0 |
| T0.6 | i18n scaffold | W0 | ORCH | DONE | SET-034. | see GATES.md#w0 |
| T0.7 | Entitlements stub | W0 | ORCH | DONE | ARCH-008, PAY-001. | see GATES.md#w0 |
| T0.8 | CI workflows | W0 | ORCH | DONE | REL-003. | see GATES.md#w0 |
| T0.9 | Progress files + trace exemptions | W0 | ORCH | DONE |  | see GATES.md#w0 |
| T1.1 | Engine types and schemas | W1 | ENGINE | DONE | §6.2, §6.3, CTR-001, PRE-001. | 357 unit ✅ cov 99.3/95.4 presets ✅ |
| T1.2 | Reducer | W1 | ENGINE | DONE | CTR-002..005, CMD-001, CMD-003..005, CMD-010, TOK-001, TOK-003, TOK-004, GAME-01 | 357 unit ✅ cov 99.3/95.4 presets ✅ |
| T1.3 | MTG presets | W1 | ENGINE | DONE | §10.2, PRE-001, PRE-002, CMD-011, TOK-002. | 357 unit ✅ cov 99.3/95.4 presets ✅ |
| T1.4 | Persistence | W1 | ENGINE | DONE | ARCH-006, GAME-016, REL-001. | 357 unit ✅ cov 99.3/95.4 presets ✅ |
| T1.5 | Store | W1 | ENGINE | DONE | PERF-002, REL-004. | 357 unit ✅ cov 99.3/95.4 presets ✅ |
| T1.6 | Layout engine | W2 | BOARD | DONE | LAY-001..004, LAY-006, LAY-009, LAY-010. | board e2e 87 ✅; integrated e2e 192+9 ✅ |
| T1.7 | Seat tile | W2 | BOARD | DONE | LIFE-001..006, INP-001..004, INP-006, INP-008, INP-009, LAY-007, LAY-008, SET-00 | board e2e 87 ✅; integrated e2e 192+9 ✅ |
| T1.8 | Center toolbar | W2 | BOARD | DONE | §7.2, LAY-010, LAY-011, SET-031. | board e2e 87 ✅; integrated e2e 192+9 ✅ |
| T1.9 | Seat menu (rotated sheet) | W2 | BOARD | DONE | SEAT-001, SEAT-002, SEAT-004, SEAT-005, §8.2. | lane e2e 54/54, full 66/66 ✅ |
| T1.10 | Commander damage | W2 | BOARD | DONE | CMD-002..006, CMD-010. | board e2e 87 ✅; integrated e2e 192+9 ✅ |
| T1.11 | Tokens and global counters UI | W2 | BOARD | DONE | TOK-001, TOK-003, TOK-004. | board e2e 87 ✅; integrated e2e 192+9 ✅ |
| T1.12 | Launcher and setup flow | W2 | SHELL | DONE | GAME-001, GAME-016, LAY-005, PRE-003 (basic picker for MTG presets only; the ful | shell e2e 78 ✅; integrated 279 ✅ |
| T1.13 | Reset, first player, game over | W2 | SHELL | DONE | GAME-010..015, LIFE-005, SET-012 (Dice & randomizer animations toggle). | shell e2e 78 ✅; integrated 279 ✅ |
| T1.14 | Settings screen | W2 | SHELL | DONE | SET-001, SET-010..015, §13.1 sections A, B, D, E, F (G and H get placeholders; F | shell e2e 78 ✅; integrated 279 ✅ |
| T1.15 | Profiles and decks (local) | W2 | SHELL | DONE | PROF-001, PROF-002, PROF-010, PROF-011. | lane e2e 54/54, full 66/66 ✅ |
| T1.16 | Backgrounds (non-art) | W2 | SHELL | DONE | SET-002 (gradients/colors/default), SET-003. | lane e2e 54/54, full 66/66 ✅ |
| T1.20 | One-player mode and camera mode | W2 | SHELL | DONE | SET-032, SET-033. | board e2e 87 ✅; integrated e2e 192+9 ✅ |
| T1.17 | Tools page and quick access | W2 | TOOLS-HIST | DONE | TOOL-001..003, TOOL-007..011, TOOL-013. | e2e 39 ✅ |
| T1.18 | Current-game history | W2 | TOOLS-HIST | DONE | HIST-001, HIST-002, HIST-010..013. | e2e 39 ✅ |
| T1.19 | Device services | W2 | TOOLS-HIST | DONE | PWA-005, PWA-006, INP-008, SET (Device section). | device lib 12 unit ✅ (wiring in BOARD) |
| T2.1 | Timer engine | W2 | TIMER-CORE | DONE | TMR-001..011, TMR-020..024, TMR-030..032, TMR-040, TMR-044, TMR-050, TURN-001, T | 71 unit ✅ Scen 3/4 |
| T2.2 | Scheduler | W2 | TIMER-CORE | DONE | TMR-021, TMR-031, TMR-051. | 17 unit ✅ |
| T2.3 | Turn tracking UI | W3 | TIMER-UI | DONE | TURN-001, LIFE-006, TMR-003, TMR-004, TMR-009. | timer e2e 78 ✅; integrated 489 ✅ |
| T2.4 | Clock chips and the response stack | W3 | TIMER-UI | DONE | TMR-005..008, TMR-010, TMR-011, TMR-041..043. | timer e2e 78 ✅; integrated 489 ✅ |
| T2.5 | Start, pause and overlays | W3 | TIMER-UI | DONE | TMR-001, TMR-002, TMR-020, TMR-021, SET-013. | timer e2e 78 ✅; integrated 489 ✅ |
| T2.6 | Timeout and warnings | W3 | TIMER-UI | DONE | TMR-030, TMR-031, §9.5. | timer e2e 78 ✅; integrated 489 ✅ |
| T2.7 | Match timer | W3 | TIMER-UI | DONE | TMR-032. | timer e2e 78 ✅; integrated 489 ✅ |
| T2.8 | Timer settings and the seat timer tab | W3 | TIMER-UI | DONE | §13.1-C, SEAT-003, TMR-022, TMR-060 (P2: data model only, UI hidden). | timer e2e 78 ✅; integrated 489 ✅ |
| T2.9 | Reload resilience | W3 | TIMER-UI | DONE | REL-001, TMR-044. | timer e2e 78 ✅; integrated 489 ✅ |
| T3.1 | Pokémon | W3 | PRESETS | DONE | §10.3, CUS-008. | presets e2e 78 ✅ (board/setup wiring in D-046) |
| T3.2 | Yu-Gi-Oh! + calculator | W3 | PRESETS | DONE | §10.4, INP-007, TOOL-006. | presets e2e 78 ✅ (board/setup wiring in D-046) |
| T3.3 | FFTCG, Lorcana, One Piece, SWU, Digimon, Generic (+ FaB, Sorcery as P1) | W3 | PRESETS | DONE | §10.5, §10.6, PRE-010, PRE-011, TOOL-012. | presets e2e 78 ✅ (board/setup wiring in D-046) |
| T3.4 | Per-seat overrides | W3 | PRESETS | DONE | PRE-013, GAME-013. | integration-setup e2e ✅ |
| T3.5 | Preset picker | W3 | PRESETS | DONE | PRE-003, PRE-012. | presets e2e 78 ✅ (board/setup wiring in D-046) |
| T3.7 | Roll-off | W3 | PRESETS | DONE | TOOL-004, GAME-012. | integration-setup e2e ✅ |
| T3.6 | Custom preset builder | W3 | BUILDER | DONE | CUS-001..008, CUS-010. | builder e2e 21 ✅ Scenario 7 |
| T4.1 | Auth | W3 | FIREBASE | DONE | AUTH-001, AUTH-002, AUTH-004. | unit+sync 5+emu e2e 15 ✅ |
| T4.2 | Rules and rules tests | W3 | FIREBASE | DONE | SEC-001..006, LEG-005. | rules ✅ functions 21 ✅ client export+delete ✅ |
| T4.3 | Sync engine | W3 | FIREBASE | DONE | ARCH-007, SYNC-001..004, PROF-003, SET-014. | unit+sync 5+emu e2e 15 ✅ |
| T4.4 | Guest → account merge | W3 | FIREBASE | DONE | AUTH-003. | unit+sync 5+emu e2e 15 ✅ |
| T4.5 | Account data functions | W3 | FIREBASE | DONE | AUTH-005, AUTH-006. | rules ✅ functions 21 ✅ client export+delete ✅ |
| T4.6 | App Check | W3 | FIREBASE | DONE | SEC-007. | unit+sync 5+emu e2e 15 ✅ |
| T4.7 | Feedback and diagnostics | W3 | FIREBASE | DONE | SET-040..043, §13.1-H. | unit+sync 5+emu e2e 15 ✅ |
| T5.1 | Scryfall client | W4 | ART | DONE | ART-001..003, ART-006. | art e2e 39 ✅ sync 8 ✅ |
| T5.2 | Art picker and focal editor | W4 | ART | DONE | ART-001..005, ART-008, PROF-010. | art e2e 39 ✅ sync 8 ✅ |
| T5.3 | Uploads | W4 | ART | DONE | ART-020..023, ART-025. | art e2e 39 ✅ sync 8 ✅ |
| T5.4 | Cloud art sync | W4 | ART | DONE | ART-022, ART-024, SEC-004. | art e2e 39 ✅ sync 8 ✅ |
| T5.5 | Offline art caching | W4 | ART | DONE | ART-009, PWA-002. | art e2e 39 ✅ sync 8 ✅ |
| T5.6 | Attribution | W4 | ART | DONE | ART-005, LEG-003, TOOL-013. | art e2e 39 ✅ sync 8 ✅ |
| T6.1 | Game records | W4 | HISTORY | DONE | HIST-003, HIST-030, HIST-032. | history e2e 42 ✅ + integration-records ✅ |
| T6.2 | "Who won?" prompt | W4 | HISTORY | DONE | HIST-031. | history e2e 42 ✅ + integration-records ✅ |
| T6.3 | Past Games UI | W4 | HISTORY | DONE | HIST-020..024, HIST-007. | history e2e 42 ✅ + integration-records ✅ |
| T6.4 | Stats library | W4 | HISTORY | DONE | HIST-005, HIST-021..023. | history e2e 42 ✅ + integration-records ✅ |
| T6.5 | Identity, merge and edit | W4 | HISTORY | DONE | HIST-033..035, PROF-011. | history e2e 42 ✅ + integration-records ✅ |
| T6.6 | Export/import | W4 | HISTORY | DONE | HIST-006. | history e2e 42 ✅ + integration-records ✅ |
| T6.7 | Game history toggle and limits | W4 | HISTORY | DONE | HIST-008, HIST-007. | history e2e 42 ✅ + integration-records ✅ |
| T7.1 | Gating UI | W5 | PAY | DONE | PAY-004, §17.2. | pay e2e 27 + emu 15 ✅ functions 32 ✅ |
| T7.2 | Stripe checkout and entitlements | W5 | PAY | DONE | PAY-002, PAY-003. | pay e2e 27 + emu 15 ✅ functions 32 ✅ |
| T7.3 | Share links | W5 | PAY | DONE | CUS-007, SEC-005. | pay e2e 27 + emu 15 ✅ functions 32 ✅ |
| T7.4 | Pricing config | W5 | PAY | DONE | PAY-002, Q4. | pay e2e 27 + emu 15 ✅ functions 32 ✅ |
| T8.6 | i18n completeness | W5 | POLISH-A | DONE |  | final clean-checkout gates ✅ |
| T8.7 | Landing, about, install UX, what's new | W5 | POLISH-A | DONE | PWA-003, LEG-002, SET-043. | final clean-checkout gates ✅ |
| T8.1 | Performance | W6 | HARDEN + ORCH | DONE | PERF-001..004. | final clean-checkout gates ✅ |
| T8.2 | Accessibility | W6 | HARDEN + ORCH | DONE | A11Y-001..005. | final clean-checkout gates ✅ |
| T8.3 | Legal, consent, analytics, errors | W6 | HARDEN + ORCH | DONE | LEG-001, LEG-002, LEG-004, LEG-006, §19.5, REL-005. | final clean-checkout gates ✅ |
| T8.4 | Security headers | W6 | HARDEN + ORCH | DONE | §19.6. | final clean-checkout gates ✅ |
| T8.5 | Lighthouse CI | W6 | HARDEN + ORCH | DONE | PERF-005. | final clean-checkout gates ✅ |
| T8.8 | Final acceptance | W6 | HARDEN + ORCH | DONE |  | final clean-checkout gates ✅ |
| T8.9 | Deliverables | W6 | HARDEN + ORCH | DONE |  | final clean-checkout gates ✅ |
