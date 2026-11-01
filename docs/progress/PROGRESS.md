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
| T1.1 | Engine types and schemas | W1 | ENGINE | IN_PROGRESS | §6.2, §6.3, CTR-001, PRE-001. |  |
| T1.2 | Reducer | W1 | ENGINE | IN_PROGRESS | CTR-002..005, CMD-001, CMD-003..005, CMD-010, TOK-001, TOK-003, TOK-004, GAME-01 |  |
| T1.3 | MTG presets | W1 | ENGINE | IN_PROGRESS | §10.2, PRE-001, PRE-002, CMD-011, TOK-002. |  |
| T1.4 | Persistence | W1 | ENGINE | IN_PROGRESS | ARCH-006, GAME-016, REL-001. |  |
| T1.5 | Store | W1 | ENGINE | IN_PROGRESS | PERF-002, REL-004. |  |
| T1.6 | Layout engine | W2 | BOARD | TODO | LAY-001..004, LAY-006, LAY-009, LAY-010. |  |
| T1.7 | Seat tile | W2 | BOARD | TODO | LIFE-001..006, INP-001..004, INP-006, INP-008, INP-009, LAY-007, LAY-008, SET-00 |  |
| T1.8 | Center toolbar | W2 | BOARD | TODO | §7.2, LAY-010, LAY-011, SET-031. |  |
| T1.9 | Seat menu (rotated sheet) | W2 | BOARD | TODO | SEAT-001, SEAT-002, SEAT-004, SEAT-005, §8.2. |  |
| T1.10 | Commander damage | W2 | BOARD | TODO | CMD-002..006, CMD-010. |  |
| T1.11 | Tokens and global counters UI | W2 | BOARD | TODO | TOK-001, TOK-003, TOK-004. |  |
| T1.12 | Launcher and setup flow | W2 | SHELL | TODO | GAME-001, GAME-016, LAY-005, PRE-003 (basic picker for MTG presets only; the ful |  |
| T1.13 | Reset, first player, game over | W2 | SHELL | TODO | GAME-010..015, LIFE-005, SET-012 (Dice & randomizer animations toggle). |  |
| T1.14 | Settings screen | W2 | SHELL | TODO | SET-001, SET-010..015, §13.1 sections A, B, D, E, F (G and H get placeholders; F |  |
| T1.15 | Profiles and decks (local) | W2 | SHELL | TODO | PROF-001, PROF-002, PROF-010, PROF-011. |  |
| T1.16 | Backgrounds (non-art) | W2 | SHELL | TODO | SET-002 (gradients/colors/default), SET-003. |  |
| T1.20 | One-player mode and camera mode | W2 | SHELL | TODO | SET-032, SET-033. |  |
| T1.17 | Tools page and quick access | W2 | TOOLS-HIST | TODO | TOOL-001..003, TOOL-007..011, TOOL-013. |  |
| T1.18 | Current-game history | W2 | TOOLS-HIST | TODO | HIST-001, HIST-002, HIST-010..013. |  |
| T1.19 | Device services | W2 | TOOLS-HIST | TODO | PWA-005, PWA-006, INP-008, SET (Device section). |  |
| T2.1 | Timer engine | W2 | TIMER-CORE | TODO | TMR-001..011, TMR-020..024, TMR-030..032, TMR-040, TMR-044, TMR-050, TURN-001, T |  |
| T2.2 | Scheduler | W2 | TIMER-CORE | TODO | TMR-021, TMR-031, TMR-051. |  |
| T2.3 | Turn tracking UI | W3 | TIMER-UI | TODO | TURN-001, LIFE-006, TMR-003, TMR-004, TMR-009. |  |
| T2.4 | Clock chips and the response stack | W3 | TIMER-UI | TODO | TMR-005..008, TMR-010, TMR-011, TMR-041..043. |  |
| T2.5 | Start, pause and overlays | W3 | TIMER-UI | TODO | TMR-001, TMR-002, TMR-020, TMR-021, SET-013. |  |
| T2.6 | Timeout and warnings | W3 | TIMER-UI | TODO | TMR-030, TMR-031, §9.5. |  |
| T2.7 | Match timer | W3 | TIMER-UI | TODO | TMR-032. |  |
| T2.8 | Timer settings and the seat timer tab | W3 | TIMER-UI | TODO | §13.1-C, SEAT-003, TMR-022, TMR-060 (P2: data model only, UI hidden). |  |
| T2.9 | Reload resilience | W3 | TIMER-UI | TODO | REL-001, TMR-044. |  |
| T3.1 | Pokémon | W3 | PRESETS | TODO | §10.3, CUS-008. |  |
| T3.2 | Yu-Gi-Oh! + calculator | W3 | PRESETS | TODO | §10.4, INP-007, TOOL-006. |  |
| T3.3 | FFTCG, Lorcana, One Piece, SWU, Digimon, Generic (+ FaB, Sorcery as P1) | W3 | PRESETS | TODO | §10.5, §10.6, PRE-010, PRE-011, TOOL-012. |  |
| T3.4 | Per-seat overrides | W3 | PRESETS | TODO | PRE-013, GAME-013. |  |
| T3.5 | Preset picker | W3 | PRESETS | TODO | PRE-003, PRE-012. |  |
| T3.7 | Roll-off | W3 | PRESETS | TODO | TOOL-004, GAME-012. |  |
| T3.6 | Custom preset builder | W3 | BUILDER | TODO | CUS-001..008, CUS-010. |  |
| T4.1 | Auth | W3 | FIREBASE | TODO | AUTH-001, AUTH-002, AUTH-004. |  |
| T4.2 | Rules and rules tests | W3 | FIREBASE | IN_PROGRESS | SEC-001..006, LEG-005. |  |
| T4.3 | Sync engine | W3 | FIREBASE | TODO | ARCH-007, SYNC-001..004, PROF-003, SET-014. |  |
| T4.4 | Guest → account merge | W3 | FIREBASE | TODO | AUTH-003. |  |
| T4.5 | Account data functions | W3 | FIREBASE | IN_PROGRESS | AUTH-005, AUTH-006. |  |
| T4.6 | App Check | W3 | FIREBASE | TODO | SEC-007. |  |
| T4.7 | Feedback and diagnostics | W3 | FIREBASE | TODO | SET-040..043, §13.1-H. |  |
| T5.1 | Scryfall client | W4 | ART | IN_PROGRESS | ART-001..003, ART-006. |  |
| T5.2 | Art picker and focal editor | W4 | ART | TODO | ART-001..005, ART-008, PROF-010. |  |
| T5.3 | Uploads | W4 | ART | IN_PROGRESS | ART-020..023, ART-025. |  |
| T5.4 | Cloud art sync | W4 | ART | TODO | ART-022, ART-024, SEC-004. |  |
| T5.5 | Offline art caching | W4 | ART | TODO | ART-009, PWA-002. |  |
| T5.6 | Attribution | W4 | ART | TODO | ART-005, LEG-003, TOOL-013. |  |
| T6.1 | Game records | W4 | HISTORY | TODO | HIST-003, HIST-030, HIST-032. |  |
| T6.2 | "Who won?" prompt | W4 | HISTORY | TODO | HIST-031. |  |
| T6.3 | Past Games UI | W4 | HISTORY | TODO | HIST-020..024, HIST-007. |  |
| T6.4 | Stats library | W4 | HISTORY | TODO | HIST-005, HIST-021..023. |  |
| T6.5 | Identity, merge and edit | W4 | HISTORY | TODO | HIST-033..035, PROF-011. |  |
| T6.6 | Export/import | W4 | HISTORY | TODO | HIST-006. |  |
| T6.7 | Game history toggle and limits | W4 | HISTORY | TODO | HIST-008, HIST-007. |  |
| T7.1 | Gating UI | W5 | PAY | TODO | PAY-004, §17.2. |  |
| T7.2 | Stripe checkout and entitlements | W5 | PAY | TODO | PAY-002, PAY-003. |  |
| T7.3 | Share links | W5 | PAY | TODO | CUS-007, SEC-005. |  |
| T7.4 | Pricing config | W5 | PAY | TODO | PAY-002, Q4. |  |
| T8.6 | i18n completeness | W5 | POLISH-A | TODO |  |  |
| T8.7 | Landing, about, install UX, what's new | W5 | POLISH-A | TODO | PWA-003, LEG-002, SET-043. |  |
| T8.1 | Performance | W6 | HARDEN + ORCH | TODO | PERF-001..004. |  |
| T8.2 | Accessibility | W6 | HARDEN + ORCH | TODO | A11Y-001..005. |  |
| T8.3 | Legal, consent, analytics, errors | W6 | HARDEN + ORCH | TODO | LEG-001, LEG-002, LEG-004, LEG-006, §19.5, REL-005. |  |
| T8.4 | Security headers | W6 | HARDEN + ORCH | TODO | §19.6. |  |
| T8.5 | Lighthouse CI | W6 | HARDEN + ORCH | TODO | PERF-005. |  |
| T8.8 | Final acceptance | W6 | HARDEN + ORCH | TODO |  |  |
| T8.9 | Deliverables | W6 | HARDEN + ORCH | TODO |  |  |
