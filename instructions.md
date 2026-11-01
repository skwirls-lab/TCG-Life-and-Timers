# instructions.md: Execution Plan for TCG Life & Timers

| Field | Value |
|---|---|
| Source of truth | `PRD.md` v0.3 (requirement IDs such as `TMR-005` are cited throughout) |
| Executor | Claude Code (the orchestrator), plus a fleet of sub-agents |
| Trigger | The owner says **"go"** |
| Branch | `claude/tcg-life-timer-pwa-d7i37k` (the only branch pushed to `origin`) |
| End state | All P0 + P1 requirements implemented and tested, all gates green, the app deploy-ready on Firebase App Hosting, and `DEPLOY.md` written. Deploying itself needs the owner's Firebase project (§4). |

---

## 0. Prime directives (read before every task, including after context compaction)

1. **Don't stop until §13 "Definition of Done" is met.** Don't ask the owner questions mid-run. When a decision is needed, take the PRD default or the recommended answer (PRD §22), record it in `docs/progress/DECISIONS.md`, and continue.
2. **State lives in files, not memory.** Before starting any work, and after any context compaction, read `docs/progress/PROGRESS.md`, `docs/progress/DECISIONS.md` and `docs/progress/BLOCKERS.md`. Resume from the first task that is not `DONE`.
3. **Every task runs inside a Ralph loop (§6) and must pass its gate (§7)** before it is marked `DONE`. "Looks done" is not done. Done means the gate commands exit 0 and the outputs are recorded.
4. **Never weaken a gate to pass it.** Don't skip, `.only`, `.skip`, or delete tests. Don't lower coverage thresholds. Don't add `eslint-disable` without a written justification on the line. Don't use `@ts-ignore`; use `@ts-expect-error` only with a reason. If a requirement is truly impossible, follow the blocker protocol (§6.3).
5. **Tests trace to requirements.** Every test that verifies a PRD requirement carries a tag comment, `// @req CMD-004`. The trace gate (§7, G-TRACE) enforces this.
6. **Only the designated branch is pushed.** Worker agents work on local worktree branches. The orchestrator merges, runs the gates, and pushes (§5.4).
7. **Commits:** Conventional Commits (`feat(engine): commander damage life link [CMD-004]`). Every commit ends with the attribution lines from the session's system instructions. Never put a model name or identifier in commits, code, or docs.
8. **No real secrets in the repo.** Firebase web config is public by design, but it still comes from env vars. Use the `demo-tcg-life` emulator project for everything until the owner provides real config.
9. **Respect the PRD's legal constraints.** Scryfall data is never paywalled (ART-007). No official logos or mana symbol rips (TOOL-011). Artist attribution is required (ART-005).

---

## 1. Run protocol: what happens when the owner says "go"

```
GO
 ├─ Step 1  Bootstrap progress files (§3) from this document's task list (§9). Commit.
 ├─ Step 2  Execute Wave 0 (M0 Foundation), serially, by the orchestrator. Gate G-M0. Push.
 ├─ Step 3  Execute Wave 1 (engine core), with 1 agent. Gate. Freeze the engine API contract. Push.
 ├─ Step 4  Execute Waves 2–5 with parallel lanes (§5). After each wave: integrate, then full gate, then push.
 ├─ Step 5  Wave 6: hardening and final acceptance (Appendix B scenarios 1–12), plus independent review agents.
 ├─ Step 6  Write DEPLOY.md and FINAL_REPORT.md. Final push.
 └─ Step 7  Report to the owner: what is done, what is deferred (P2), and what owner actions remain (§4).
```

**Progress pings.** At the end of each wave, push and post a short status message in the session: wave, tasks done/total, gates, and anything notable. The owner can interject at any time. An interjection takes priority over the plan.

---

## 2. Environment facts (verified in the build sandbox, 2026-11-01)

| Item | Status | Implication |
|---|---|---|
| Node 22.23, npm 10.9 | ✅ | Use **npm** (no pnpm/yarn). Set `"engines": {"node": ">=22"}`. |
| Java 21 (OpenJDK) | ✅ | The Firebase Emulator Suite (Firestore/Storage) works locally. |
| `firebase-tools` | Not installed globally | Install as a **devDependency** (`firebase-tools@15.x`) and run it via `npx firebase`. |
| storage.googleapis.com | Reachable | Emulator JARs download fine. |
| Playwright | **1.63.0 preinstalled, Chromium only** at `/opt/pw-browsers` | Pin `@playwright/test` to **exactly `1.63.0`**. **Never run `playwright install`.** WebKit runs only in GitHub Actions CI (§8). |
| `api.scryfall.com`, `cards.scryfall.io` | **Blocked by the sandbox network policy** | Unit and e2e tests use **recorded fixtures + MSW** (that is normal test practice regardless). Live Scryfall checks only happen if the owner allows these hosts (§4.3), or after deploy on a preview URL. **Never claim live Scryfall verification that didn't happen.** |
| 4 CPUs, 15 GB RAM, ~30 GB disk | ✅ | Run at most **4 heavy processes** at once (builds and e2e). Agents must not run e2e suites concurrently on the same ports; see the port map in §5.5. |

---

## 3. Progress-tracking files (created in Step 1, updated continuously)

```
docs/progress/
  PROGRESS.md       # master checklist: every task ID, status, owner lane, gate evidence link
  DECISIONS.md      # ADR-lite log: date · decision · reason · PRD ref
  BLOCKERS.md       # open blockers + chosen fallback + status
  GATES.md          # latest output summary of each gate run (command, exit code, key numbers)
  TRACE.md          # generated by `npm run check:trace`: requirement → tests matrix
  REVIEW-<wave>.md  # findings from independent reviewer agents and their resolution
```

**`PROGRESS.md` row format:**
```
| T1.07 | Seat tile component | Lane B | DONE | LIFE-001,INP-001..009 | G-UNIT ✅ G-E2E ✅ (GATES.md#t107) | 3 iterations |
```
Statuses: `TODO` → `IN_PROGRESS` → `VERIFYING` → `DONE` | `BLOCKED_FALLBACK` | `DEFERRED_P2`.

---

## 4. Firebase and external setup: what I need from you, and when

### 4.1 Short answer
**I can build and test the entire app without anything from you.** The whole Firebase stack (Auth with Google sign-in, Firestore, Storage, Cloud Functions) runs on the **Firebase Emulator Suite** inside the sandbox. It uses a `demo-tcg-life` project ID, which needs no real project or credentials. All tests, including security-rules tests and the guest→Google account merge flow, run against the emulators.

**You are only needed to deploy to the real internet** (and later to take real payments). The build won't wait on you. Wave 6 ends with the app "deploy-ready", and `DEPLOY.md` tells you exactly which buttons to press. If you provide the items below earlier, I'll wire them in as they arrive.

### 4.2 Owner checklist (do any time; earliest useful point noted)

| # | Action (Firebase console unless noted) | Why | Give me | Useful by |
|---|---|---|---|---|
| F1 | Create a Firebase project (e.g. `tcg-life-timers`). **Upgrade to Blaze** and set a budget alert (e.g. $10). | App Hosting, Functions and App Check require Blaze | Project ID | Wave 3 |
| F2 | Project settings → **Add app → Web**. Copy the `firebaseConfig`. | Client SDK config (public values) | The 6 config values | Wave 3 |
| F3 | **Authentication** → Get started → Sign-in method → enable **Google** (set the support email). Also enable **Anonymous**. | AUTH-001/002 | Nothing (just do it) | Wave 3 |
| F4 | **Firestore** → Create database (Native mode, region `nam5` or the region closest to your users). **Storage** → Get started (same region). | Data + art | The region you picked | Wave 3 |
| F5 | **App Hosting** → Create backend → connect GitHub → repo `skwirls-lab/TCG-Life-and-Timers` → root `/` → live branch `main` (we'll merge the feature branch to `main` when you're ready). **Only you can authorize the GitHub connection.** | Hosting | The backend URL | Wave 6 |
| F6 | Rules, indexes and Functions deploy. **Option A (recommended):** create a service account with the roles Firebase Rules Admin, Cloud Datastore Index Admin, Cloud Functions Admin, Service Account User and Firebase Extensions Viewer. Add its JSON key as the GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT`; the CI deploy job (§8) then deploys on merge to `main`. **Option B:** run `npx firebase deploy --only firestore,storage,functions` yourself from a laptop. | The sandbox can't do an interactive `firebase login` | Tell me A or B | Wave 6 |
| F7 | **App Check** → register the web app with **reCAPTCHA Enterprise**. | SEC-007 | Site key | Wave 6 |
| F8 | Authentication → Settings → **Authorized domains**: add the App Hosting domain and any custom domain. | Google sign-in on prod | — | Wave 6 |
| F9 | (M7) Create a **Stripe** account. In Firebase, install the **"Run Payments with Stripe"** extension (you enter the Stripe secret key there; never send it to me). In Stripe, create products/prices for monthly, yearly and lifetime. | PAY-002 | The 3 **price IDs** + the Stripe **publishable** key | Wave 5 (test mode is fine) |
| F10 | Optional: a **Sentry** project (DSN), a **custom domain**, and Google Analytics enabled in Firebase | REL-005, LEG-004 | DSN, domain | Wave 6 |
| F11 | Optional: decide the app name (Q2) | Branding | Name | Any time; placeholder until then |

> **Values from F2/F7/F9 go into `apphosting.yaml` as env vars and into GitHub secrets. They are public-safe client keys.** Never paste server secrets (the Stripe secret key, service-account JSON) into chat. Put them in GitHub secrets or the extension config yourself.

### 4.3 Sandbox network (optional, improves verification)
The sandbox currently **blocks `api.scryfall.com` and `cards.scryfall.io`**. If you want me to verify the Scryfall integration against the live API during the build, open this session's environment settings (title bar → environment → Edit → Network access) and add both hosts to **Allowed domains**, leaving package managers allowed. Steps: https://code.claude.com/docs/en/cloud-environments#network-access. Without it, Scryfall is built and tested against recorded fixtures, and the live check happens on your deployed preview (listed in `DEPLOY.md` as a post-deploy check).

---

## 5. Agent fleet model

### 5.1 Roles
| Role | Who | Responsibilities |
|---|---|---|
| **Orchestrator** | Main Claude session | Owns `PROGRESS.md`, the wave plan, merges, full gates, and pushes. Does Wave 0 itself. Resolves conflicts. Spawns and briefs agents. Never hands off the gates. |
| **Lane worker** | `general-purpose` agent with `isolation: "worktree"` | Executes 1 lane (a sequence of task cards) in its own git worktree with its own Ralph loops. Commits locally on `lane/<name>`. Returns a report (§5.3). |
| **Reviewer** | A fresh `general-purpose` agent, read-only by instruction | Independent review of a wave's merged diff against the PRD IDs, the a11y and mobile checklists, and screenshots. Gets the **code and the PRD, not the orchestrator's conclusions**. Returns findings to `REVIEW-<wave>.md`. |
| **Debugger** | A fresh `general-purpose` agent | Spawned only by the blocker protocol (§6.3) with the failing test, logs, and relevant files. |

**Concurrency cap: at most 5 agents running at once** (4 lanes + 1 reviewer), given 4 CPUs. Heavy commands (build, e2e) are serialized through the port/lock rules in §5.5.

### 5.2 Waves and lanes

| Wave | Lanes (parallel within a wave) | Tasks | Gate at end |
|---|---|---|---|
| **W0** | Orchestrator only | M0: T0.1–T0.9 | G-M0 |
| **W1** | Lane **ENGINE** (1 agent; the orchestrator integrates) | T1.1–T1.5 (types, reducer, MTG presets, persistence, store) | G-W1 + **API freeze** (`src/engine/index.ts` public types frozen; later changes need a DECISIONS entry) |
| **W2** | **BOARD** (T1.6–T1.11) · **SHELL** (T1.12–T1.16, T1.20) · **TOOLS-HIST** (T1.17–T1.19) · **TIMER-CORE** (T2.1–T2.2, pure engine only) | M1 UI + timer engine | G-M1 (Scenarios 1, 2, 12) |
| **W3** | **TIMER-UI** (T2.3–T2.9) · **PRESETS** (T3.1–T3.5, T3.7) · **BUILDER** (T3.6) · **FIREBASE** (T4.1–T4.7) | M2 + M3 + M4 | G-M2, G-M3, G-M4 (Scenarios 3–5, 7–10) |
| **W4** | **ART** (T5.1–T5.6) · **HISTORY** (T6.1–T6.7) | M5 + M6 | G-M5, G-M6 (Scenarios 6, 11) |
| **W5** | **PAY** (T7.1–T7.4) · **SHARE** (T7.3 if split) · **POLISH-A** (T8.6 i18n extraction, T8.7 landing/about) | M7 + part of M8 | G-M7 |
| **W6** | Orchestrator + **HARDEN** lane (T8.1–T8.5) + 2 reviewers | M8 + final acceptance (T8.8–T8.9) | G-FINAL |

### 5.3 Worker brief template (the orchestrator fills in the `<…>` parts; this is the agent's only context)

```
You are the <LANE> lane worker for the TCG Life & Timers PWA.
Repo: /home/user/TCG-Life-and-Timers (you are in an isolated git worktree on branch lane/<lane>).
Read first: instructions.md §0, §6, §7, §10, §11; PRD.md sections <list>; src/engine/index.ts (frozen API).
Your tasks, in order: <task cards copied verbatim from §9>.
File ownership — you may create/modify ONLY: <globs>. Shared files you must NOT edit: <list>;
if you need a change there, write it in your report under "Requested shared changes".
Ports for this lane: dev <port>, emulators <ports> (see §5.5). Do not run `playwright install`.
For each task run the Ralph loop (§6.1) and its gate commands; tag tests with // @req IDs.
Commit after each task (Conventional Commits + the attribution lines given to you below).
Do NOT push. Do NOT edit docs/progress/*.
Return a report:
  - tasks: id, status (DONE/BLOCKED_FALLBACK), iterations
  - files changed (summary), tests added (count, @req IDs covered)
  - gate commands run + exit codes + key numbers (coverage %, test counts)
  - requested shared changes, decisions you made (with PRD refs), known gaps
Attribution lines for commits: <copy from the session's system instructions>
```

### 5.4 Integration protocol (orchestrator)
1. When a lane reports, check out the designated branch and run `git merge --no-ff lane/<name>`.
2. Resolve conflicts by **ownership**. The owning lane's version wins, and shared files are merged by hand.
3. Apply the "requested shared changes" yourself.
4. Run the **full gate suite** (§7) on the merged tree. If anything fails, fix it in a Ralph loop on the main branch, or send it back to the lane agent via `SendMessage` with the failure output.
5. Update `PROGRESS.md`, `GATES.md` and `TRACE.md`. Commit as `chore(progress): wave N integration`.
6. `git push -u origin claude/tcg-life-timer-pwa-d7i37k`. Retry network failures 4 times with backoff of 2, 4, 8 and 16 s.

### 5.5 File ownership and ports

| Lane | Owns (globs) | Dev port | Emulator ports (auth/firestore/storage/functions) |
|---|---|---|---|
| ENGINE | `src/engine/**`, `src/presets/mtg/**`, `src/lib/db/**`, `src/state/**` | — | — |
| BOARD | `src/features/board/**`, `src/features/seat/**`, `src/features/commander/**` | 3101 | — |
| SHELL | `src/app/(shell)/**`, `src/features/setup/**`, `src/features/settings/**`, `src/features/profiles/**`, `src/features/launcher/**` | 3102 | — |
| TOOLS-HIST | `src/features/tools/**`, `src/features/history-current/**`, `src/lib/device/**` | 3103 | — |
| TIMER-CORE | `src/engine/timer/**` (new subfolder; ENGINE is finished by then) | — | — |
| TIMER-UI | `src/features/timer/**` | 3104 | — |
| PRESETS | `src/presets/**` (except mtg), `src/features/preset-picker/**` | 3105 | — |
| BUILDER | `src/features/builder/**` | 3106 | — |
| FIREBASE | `src/lib/firebase/**`, `src/lib/sync/**`, `src/features/account/**`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `functions/**`, `tests/rules/**` | 3107 | 9199/8180/9299/5101 |
| ART | `src/features/art/**`, `src/lib/scryfall/**`, `src/lib/image/**`, `tests/fixtures/scryfall/**` | 3108 | 9399/8380/9499/5301 |
| HISTORY | `src/features/history-past/**`, `src/lib/stats/**` | 3109 | — |
| PAY | `src/features/paywall/**`, `src/lib/entitlements/**`, `src/app/p/**` | 3110 | 9599/8580/9699/5501 |
| HARDEN | `next.config.ts`, `lighthouserc.json`, `.size-limit.json`, `src/app/(legal)/**`, `src/lib/analytics/**` | 3111 | — |

**Shared files (orchestrator-owned):** `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/components/ui/**` (design system, built in W0), `src/i18n/en.json` (lanes append keys under their own namespace prefix, e.g. `board.*`; the orchestrator resolves merge conflicts), `tailwind`/CSS tokens, `playwright.config.ts`, `vitest.config.ts`, CI files, `docs/**`.

Lanes request new dependencies in their report. Exception: the lane may `npm install` locally to proceed, but must list the dependency so the orchestrator adds it to the shared `package.json` on merge.

---

## 6. The Ralph loop

### 6.1 Task loop (every task card)
```
RALPH(task):
  read task card + cited PRD IDs + PROGRESS/DECISIONS
  i = 0
  loop:
    i += 1
    1. SPEC    — restate DoD as a checklist in the commit-local scratch (not committed)
    2. TEST    — write/extend tests for the DoD first (unit for logic, e2e for flows); tag @req
    3. BUILD   — implement the smallest change that satisfies the DoD
    4. VERIFY  — run the task's gate commands (§9 card "Gate:" line)
    5. if all exit 0 AND DoD checklist all ✓:
         SELF-REVIEW (§6.2) → fix anything found (go to 4)
         commit → mark DONE with iteration count → break
       else:
         record a 1-line failure note (what failed, hypothesis)
         if i == 5: switch strategy (re-read PRD, simplify approach, isolate with a minimal repro test)
         if i == 8: BLOCKER PROTOCOL (§6.3) → break
```

### 6.2 Self-review checklist (before marking DONE)
- [ ] Every DoD bullet is demonstrably met, and I can point at the test name.
- [ ] No `any`, no unused exports, no TODO without a task ID, no console noise.
- [ ] The UI works at **360×740 portrait** and **740×360 landscape**, in every relevant seat rotation (0/90/180/270).
- [ ] Touch targets are ≥ 48 px. Nothing relies on hover. Reduced-motion is respected.
- [ ] Strings live in `src/i18n/en.json`, with no hard-coded UI copy.
- [ ] Offline: the feature works with the network disabled, unless the PRD says it needs the network.
- [ ] No game-specific `if` branches in UI (ARCH-003). Behavior comes from preset or counter data.

### 6.3 Blocker protocol
1. Spawn a **Debugger** agent with: the failing gate output, the test file, the implicated source files, and the PRD IDs. Give it 1 attempt, with a 30-minute budget.
2. If it is still failing, write `BLOCKERS.md`: `id · task · symptom · what was tried · fallback chosen · follow-up`.
3. **Apply the pre-approved fallback** (table below), or the simplest PRD-compatible alternative. Mark the task `BLOCKED_FALLBACK` and continue with the next task. **Never halt the run for a single blocker.**
4. Revisit all `BLOCKED_FALLBACK` tasks in W6 (T8.8).

| Known risk | Pre-approved fallback |
|---|---|
| `@serwist/next` incompatible with Next 16 Turbopack builds | Build with `next build --webpack`. If that also fails, generate the SW with `@serwist/build` `injectManifest` in a `postbuild` script. |
| iOS Wake Lock unreliable | Video-loop fallback behind a setting (PWA-005) |
| Google sign-in popup fails in the emulator e2e | Test the sign-in logic through the Auth emulator's REST `signInWithIdp` fake / `signInWithCredential` using an emulator-issued credential. Test only the button-to-handler wiring in the UI. |
| Lighthouse CI flaky in the sandbox | Run 3 times and take the median. Record the scores in GATES.md. If Chrome can't run LHCI, run it in GitHub Actions only and mark it local-skip in GATES.md, with a reason. |
| Stripe extension can't be emulated end-to-end | Simulate the extension by writing `customers/{uid}/subscriptions/*` docs via the admin SDK in the emulator, then assert the entitlement flow. Real checkout is a post-deploy check. |
| WebKit not available locally | Chromium device emulation (iPhone 14 viewport + UA) locally. Real WebKit runs in CI. |

---

## 7. Gates (exact commands; all must exit 0)

Defined as npm scripts in T0.2/T0.3:

| Gate | Command | Pass criteria |
|---|---|---|
| **G-STATIC** | `npm run typecheck && npm run lint && npm run format:check` | 0 errors. ESLint `--max-warnings=0`. |
| **G-UNIT** | `npm run test:unit -- --coverage` | All pass. Coverage thresholds in `vitest.config.ts`: **`src/engine/**` ≥ 90 % lines and branches**, `src/lib/**` ≥ 80 %, global ≥ 70 %. |
| **G-PRESETS** | `npm run check:presets` | Every built-in preset passes the Zod schema and semantic validation (exactly one primary counter, reachable thresholds, unique IDs, `quickStartValues` within min/max). |
| **G-RULES** | `npm run test:rules` (= `firebase emulators:exec --only firestore,storage --project demo-tcg-life "vitest run -c vitest.rules.config.ts"`) | All rules tests pass (SEC-001..006). |
| **G-FUNCS** | `npm run test:functions` (emulators:exec with functions) | Function tests pass (account deletion, entitlements). |
| **G-BUILD** | `npm run build && npm run check:bundle` | The build succeeds. `size-limit`: board route JS ≤ **200 KB gzip** (PERF-003). Firebase SDK is not in the board chunk. |
| **G-E2E** | `npm run test:e2e` (Playwright, Chromium, projects `pixel7` 412×915 and `iphone14-emu` 390×844, plus a `landscape` project; starts `next start`) | All specs pass, `retries: 1` maximum. Any spec that only passes on retry is reported as **flaky** in GATES.md and must be fixed before the wave gate. |
| **G-E2E-EMU** | `npm run test:e2e:emu` (e2e with the emulator suite, for auth/sync/art/pay specs) | Pass |
| **G-A11Y** | Part of e2e: `@axe-core/playwright` on launcher, board (2/4/6 players), seat menu, settings, history, tools, builder | 0 serious or critical violations |
| **G-LH** | `npm run lhci` | Launcher: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90. The PWA installability checks pass. |
| **G-TRACE** | `npm run check:trace` | `scripts/trace.ts` parses `PRD.md` IDs with priority and phase, and scans `@req` tags. **Every P0 and P1 requirement of every milestone completed so far has ≥ 1 tagged test**, or an entry in `docs/progress/TRACE-EXEMPT.md` with a reason (e.g. LEG-001 is verified by a page-exists e2e). It writes `TRACE.md`. |
| **G-VISUAL** | `npm run screens` captures PNGs of key screens × 3 viewports (360×740, 412×915, 1024×768 landscape) × layouts 2/3/4/5/6 into `artifacts/screens/`. Then a **Reviewer agent opens the PNGs** and checks them against §10.3. | The reviewer reports no blocking issues: clipping, overlap, unreadable text, wrong rotation, or a mismatch with the LifeTap reference patterns. |
| **G-REVIEW** | Reviewer agent on the wave diff (`git diff <wave-start>..HEAD`) with the PRD | All `blocking` findings fixed. `non-blocking` findings either fixed or logged in REVIEW-<wave>.md with a reason. |

**Wave gate = G-STATIC + G-UNIT + G-PRESETS + G-BUILD + G-E2E + G-A11Y + G-TRACE + G-REVIEW**, plus G-RULES, G-FUNCS and G-E2E-EMU once Wave 3 lands, plus G-VISUAL for any wave touching UI, plus G-LH from W6 (W0 records a baseline only).

Record every gate run in `GATES.md` with the date, commit SHA, command, exit code, and key numbers.

---

## 8. Locked technical decisions

| Area | Decision |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, TypeScript 5 `strict`, `noUncheckedIndexedAccess`). Board and game routes are client components; the launcher and legal pages can be static. |
| Hosting | Firebase App Hosting: `apphosting.yaml` with `runConfig` (minInstances 0, maxInstances 4, concurrency 80, cpu 1, memory 512 MiB) and env vars `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_APPCHECK_SITE_KEY`, `NEXT_PUBLIC_STRIPE_PK`, `NEXT_PUBLIC_SENTRY_DSN`. |
| Styling | Tailwind CSS 4 + CSS custom properties for themes. `font-variant-numeric: tabular-nums` for counters and timers. |
| UI icons | `lucide-react` for app chrome. Game icons are a custom SVG sprite in `src/assets/icons/game/*.svg` (heart, poison, commander-tax tower, crown, initiative, sun/moon, energy, exp, treasure, rad, ascend, speed, ring, storm, skull, KO, prize, lore, damage, DON, memory, shield, …). Drawn originals or game-icons.net (CC BY 3.0) with attribution on About. |
| State | Zustand 5 store wrapping the pure engine reducer. Selectors per seat to avoid re-rendering the whole board. |
| Persistence | Dexie 4 (IndexedDB). DB `tcg-life` with tables `games`, `records`, `profiles`, `decks`, `presets`, `settings`, `art`, `kv`. Versioned migrations. |
| Validation | Zod 4 schemas for presets, game state (on load from IndexedDB), import/export payloads, and Firestore docs. |
| PWA | Serwist (`@serwist/next`). Fallbacks per §6.3. |
| Firebase | `firebase` JS SDK v13 (modular), **lazy-loaded** via dynamic `import()` only for account/sync/art-cloud/pay features. Emulator connection when `NEXT_PUBLIC_USE_EMULATORS=1`. Default project ID `demo-tcg-life`. |
| Functions | `functions/` (Node 22, TypeScript, 2nd gen): `deleteUserData` (callable), `onUserDeleted` cleanup, and (M7) `syncEntitlements` (Firestore trigger on `customers/{uid}/subscriptions/{id}`, writes `users/{uid}/private/entitlements`). |
| Testing | Vitest 5 (+ `@vitest/coverage-v8`, `fake-indexeddb`, `@testing-library/react`, `fast-check` for property tests). `@playwright/test@1.63.0` pinned. `@axe-core/playwright`. MSW 3 for Scryfall fixtures. `@firebase/rules-unit-testing`. |
| Quality | ESLint 9 flat config (`typescript-eslint` strict-type-checked, `react-hooks`, `jsx-a11y`, `no-restricted-imports` so `src/engine/**` can't import react, next, dexie, firebase, or `window`). Prettier. `size-limit`. `@lhci/cli`. |
| CI | `.github/workflows/ci.yml`: install → G-STATIC → G-UNIT → G-PRESETS → G-RULES/G-FUNCS → G-BUILD → G-E2E (chromium + **webkit**) → G-LH. `.github/workflows/deploy.yml`: on push to `main`, deploy rules/indexes/functions if the `FIREBASE_SERVICE_ACCOUNT` secret exists (App Hosting deploys itself from GitHub). |
| Randomness | `src/engine/rng.ts`: injectable RNG interface. Production uses `crypto.getRandomValues` with rejection sampling; tests use a seeded PRNG. |
| Time | The engine never calls `Date.now()`. Every action carries `now` (ARCH-005, TMR-050). |
| IDs | `nanoid` for entity IDs. Stable preset and counter IDs are human-readable strings. |

### 8.1 Repository layout (target)
```
/
├─ PRD.md · instructions.md · DEPLOY.md · FINAL_REPORT.md · README.md
├─ apphosting.yaml · firebase.json · .firebaserc · firestore.rules · storage.rules · firestore.indexes.json
├─ functions/                       # Cloud Functions (TS)
├─ public/ (icons/, manifest assets, offline.html)
├─ scripts/ (trace.ts, check-presets.ts, gen-icons.ts, screens.ts, record-scryfall-fixtures.ts)
├─ src/
│  ├─ app/                          # Next routes: / (launcher), /play, /setup, /settings, /history, /tools, /presets, /builder, /account, /p/[code], /(legal)/privacy|terms|about
│  ├─ engine/                       # PURE TS: types, schemas, reducer, counters, thresholds, turn, timer/, rng, layout math, undo
│  ├─ presets/                      # data: mtg/, pokemon/, yugioh/, fftcg/, lorcana/, onepiece/, swu/, digimon/, fab/, sorcery/, generic/
│  ├─ state/                        # zustand stores, persistence bridge
│  ├─ features/                     # board, seat, commander, timer, setup, settings, profiles, tools, history-current, history-past, builder, preset-picker, art, account, paywall, launcher
│  ├─ components/ui/                # design system primitives (Button, Toggle, ChipRow, Sheet, RotatedSheet, Tabs, Segmented, ListRow, Stepper, Dialog, Snackbar, Keypad, LockBadge)
│  ├─ lib/ (db/, firebase/, sync/, scryfall/, image/, stats/, entitlements/, device/ (wakelock, haptics, audio, fullscreen), analytics/, i18n/)
│  ├─ i18n/en.json
│  └─ assets/icons/game/*.svg
├─ tests/ (e2e/, rules/, functions/, fixtures/)
└─ docs/progress/*
```

---

## 9. Task cards

Card format: **ID · title**. **Req:** PRD IDs. **Do:** steps. **DoD:** verifiable outcomes. **Gate:** commands to run.
"E2E:" names the Playwright spec file to add. Unless noted, every card's gate includes G-STATIC + G-UNIT.

### M0: Foundation (Wave 0, orchestrator)

**T0.1 · Scaffold app.** Req: ARCH-001..003, ENV-001..003.
- Do: `npx create-next-app@16` (TS, App Router, Tailwind, ESLint, `src/`, no Turbopack-only features). Set `strict`, `noUncheckedIndexedAccess`, path alias `@/*`. Remove the boilerplate. Add `README.md` with scripts.
- DoD: `npm run dev` serves a placeholder launcher; `npm run build` succeeds.
- Gate: G-STATIC, G-BUILD (bundle check added in T0.2).

**T0.2 · Tooling and scripts.** Req: REL-002, REL-003.
- Do:
  - ESLint flat config with the engine import restriction (§8). Prettier.
  - Vitest config with coverage thresholds (§7) and `fake-indexeddb/auto` setup.
  - Playwright config with 3 projects, `webServer` = `npm run build && npm run start -p 3100` (reuse the server), and the axe helper.
  - `size-limit` config.
  - Scripts: `typecheck`, `lint`, `format`, `format:check`, `test:unit`, `test:e2e`, `test:e2e:emu`, `test:rules`, `test:functions`, `build`, `check:bundle`, `check:presets`, `check:trace`, `screens`, `lhci`, `emulators`.
  - Stub `scripts/trace.ts` that already parses PRD IDs.
- DoD: each script runs (empty suites pass, with `--passWithNoTests` where needed). `check:trace` prints the PRD ID count (≈ 250+).
- Gate: all scripts exit 0.

**T0.3 · Firebase emulator scaffolding.** Req: ARCH-008, SEC-001 (baseline).
- Do: `firebase-tools` as a devDependency. `firebase.json` (emulators auth/firestore/storage/functions, singleProjectMode). `.firebaserc` default `demo-tcg-life`. Deny-all `firestore.rules`/`storage.rules`. `apphosting.yaml` skeleton with env placeholders. `src/lib/firebase/client.ts` (lazy init and emulator connect). `functions/` skeleton with a hello callable and its own tsconfig and test.
- DoD: `npm run test:rules` boots the emulators and runs 1 smoke test ("unauthenticated read denied").
- Gate: G-RULES, G-FUNCS.

**T0.4 · PWA shell.** Req: PWA-001..004.
- Do:
  - Manifest (name placeholder "TCG Life & Timers", short_name "LifeTimers", `display: standalone`, `orientation: any`, theme `#000`).
  - `scripts/gen-icons.ts` (sharp) generating 192, 512 and maskable icons from `src/assets/brand/logo.svg` (a simple original mark: heart + clock).
  - Serwist SW: precache the shell, and an offline fallback page.
  - `UpdatePrompt` component that shows only when no game is active (subscribes to the game store's `status`).
- DoD: e2e `pwa.spec.ts`: the manifest is served and valid, the SW registers, and an offline reload of `/` works (`context.setOffline(true)`).
- Gate: G-BUILD, G-E2E.

**T0.5 · Design system.** Req: LAY-007, INP-009, A11Y-002.
- Do:
  - Tokens: dark default, light, high-contrast; seat palette of 8 accent colors; type scale.
  - Primitives in `src/components/ui`, all ≥ 48 px targets and accessible names. `RotatedContainer` (rotates content 0/90/180/270 with correct width/height swap). `RotatedSheet` (a bottom sheet anchored to the seat's player edge).
  - `/dev/ui` route showing all primitives, excluded from production via an env flag.
- DoD: unit tests for `RotatedContainer` geometry. e2e axe on `/dev/ui` is clean.
- Gate: G-E2E, G-A11Y.

**T0.6 · i18n scaffold.** Req: SET-034.
- Do: a minimal typed `t('key')` helper over `en.json` (no heavy library). An ESLint rule (or a custom check in `check:trace`) that flags JSX string literals in `src/features/**`.
- DoD: helper tests pass; the check runs.

**T0.7 · Entitlements stub.** Req: ARCH-008, PAY-001.
- Do: `src/lib/entitlements/features.ts` registry (every Pro feature from PRD §17.2 as an enum), plus `can(feature)` returning `true` for all until M7 (policy flag `ALL_FREE`). React `useCan` hook.
- DoD: unit tests for the registry and policy switching.

**T0.8 · CI workflows.** Req: REL-003.
- Do: `ci.yml` and `deploy.yml` per §8. Cache npm and Playwright. WebKit is installed in CI only.
- DoD: workflow YAML passes `actionlint` (run via `npx`, if available; otherwise validate YAML syntax). Document in README that CI runs on push.

**T0.9 · Progress files + trace exemptions.** Create the `docs/progress/*` files, with all task rows in `PROGRESS.md`. Commit and push. **G-M0** = G-STATIC + G-UNIT + G-RULES + G-FUNCS + G-BUILD + G-E2E + G-A11Y, plus a recorded LH baseline.

---

### M1: Engine core (Wave 1, lane ENGINE)

**T1.1 · Engine types and schemas.** Req: §6.2, §6.3, CTR-001, PRE-001.
- Do: TypeScript types and Zod schemas for `CounterDefinition` (all PRD fields plus `resetOnTurnPass`, `category` for log colors, `display: 'number'|'pips'|'track'`), `ThresholdRule` (with `perSeatOverride`), `Preset` (with `quickStartValues`, `capabilities`), `Game`, `Seat`, `GameAction` union, `GameEvent`, `CounterKey` helpers, plus `TimerState` and `TimerConfig` types as stubs for TIMER-CORE.
- DoD: schema tests that accept valid and reject invalid fixtures (≥ 30 cases).

**T1.2 · Reducer.** Req: CTR-002..005, CMD-001, CMD-003..005, CMD-010, TOK-001, TOK-003, TOK-004, GAME-010..016, INP-006 (batching), HIST-012 (event emission), ARCH-002, ARCH-004.
- Do: `reduce(state, action) → state` (immutable; use structural sharing or `immer` without the React dependency). Actions:
  - `COUNTER_ADD`, `COUNTER_SET`, `BOOL_TOGGLE`, `ENUM_NEXT`/`ENUM_SET`, `TOKEN_GIVE`/`TOKEN_CLEAR`, `GLOBAL_*`
  - `CMD_DAMAGE_ADD` (with the linked life change), `CMD_TAX_CAST`
  - `ELIMINATE`/`REVIVE`/`CONCEDE`
  - `RESET_GAME` (with the `rng`-chosen first player and the first-player rule), `SET_FIRST_PLAYER`, `SEAT_*` (rename, art, reorder, add/remove mid-game per LAY-009), `COMMIT_BATCH`
  - `UNDO`/`REDO` (stack ≥ 50), `UNDO_TO(eventId)` (HIST-013)
  - Threshold evaluation after every action (auto/prompt/off; prompt yields a `pendingPrompt` in state). Auto-revive. Game end detection, with `result` and winner.
- DoD:
  - Unit tests for each action.
  - **Property tests** (fast-check): random action sequences never produce out-of-range values. Undo after N actions restores the exact state, and redo re-applies it. A token has at most 1 holder. Eliminated seats never appear in `turn.order` traversal.
  - PRD Appendix B **Scenarios 1 and 2 as engine-level tests**.
  - Coverage ≥ 90 %.

**T1.3 · MTG presets.** Req: §10.2, PRE-001, PRE-002, CMD-011, TOK-002.
- Do: the shared MTG counter library and presets for Commander, Constructed-20, Limited, Brawl and Oathbreaker. 2HG and Archenemy are flagged `deferred: 'P2'` (data stubs, hidden). `scripts/check-presets.ts` handles schema and semantic validation.
- DoD: G-PRESETS passes. Snapshot test of each preset's enabled-by-default counters.

**T1.4 · Persistence.** Req: ARCH-006, GAME-016, REL-001.
- Do: Dexie DB (§8) and a repository layer. Autosave of the active game (debounced to 250 ms, plus flushes on `visibilitychange`/`pagehide`). Load validates with Zod and migrates by schema version. On corrupt state, keep a backup copy and start fresh, with a notice.
- DoD: tests with `fake-indexeddb` (save → reload → equal; corrupt → recovered; migration v1→v2 sample).

**T1.5 · Store.** Req: PERF-002, REL-004.
- Do: a Zustand store exposing `dispatch(action)` (injects `now` and `rng`), seat-scoped selectors, and the persistence subscription.
- Also: export a `GameErrorBoundary` that, on a render error, offers "Recover game" (reloads state from IndexedDB) (REL-004).
- DoD: a render-count test showing that a change to seat A doesn't re-render seat B (React Testing Library + a profiler counter). An error-boundary test: a thrown render error, then Recover, restores the saved state.
- **W1 exit:** freeze `src/engine/index.ts` and record the API in DECISIONS.md. Gate G-W1 = G-STATIC + G-UNIT + G-PRESETS.

---

### M1: Board, shell, tools (Wave 2)

**Lane BOARD**

**T1.6 · Layout engine.** Req: LAY-001..004, LAY-006, LAY-009, LAY-010.
- Do: `src/engine/layout.ts` (pure): `getLayout(playerCount, variantId, viewport: {w,h})` → seat rects (grid areas), rotation per seat, toolbar rect and orientation. Layouts for 1–8 players per PRD §7.1, with landscape re-flow. A `seatOrder` mapping that ensures clockwise physical order.
- Also: a per-seat rotation override (LAY-004) stored on `Seat.rotation` and settable from the seat menu Player tab (BOARD T1.9 adds the control).
- DoD: unit tests per count/variant/orientation, plus a geometry invariant test (rects don't overlap and they cover the viewport minus the toolbar). The override is respected.

**T1.7 · Seat tile.** Req: LIFE-001..006, INP-001..004, INP-006, INP-008, INP-009, LAY-007, LAY-008, SET-003, SET-030.
- Do:
  - A `SeatTile` rendered in a `RotatedContainer`: background layer (art or gradient + scrim; contrast mode), +/− halves relative to rotation, the primary number (auto-fit font size), the pending-change bubble, the name pill, the badges row, a mini-grid slot, and eliminated/winner overlays. The card layouts Default / Name only / Big font.
  - Pointer handling: per-pointer state, hold delay → repeat, cancel on move > 10 px, and no ghost clicks.
- DoD:
  - Unit tests for the hold/repeat logic (fake timers).
  - E2E `board-touch.spec.ts`: 4 simultaneous touch sequences on 4 seats (CDP `Input.dispatchTouchEvent` with multiple touch points) all register. Hold for 1.3 s gives +10 then a repeat. The bubble aggregates −3 and the history has 1 entry.
  - **Rotation correctness**: tapping the visually "upper" half of a 90°-rotated seat is "+" for that seat's player.

**T1.8 · Center toolbar.** Req: §7.2, LAY-010, LAY-011, SET-031.
- Do: the toolbar component positioned via the layout engine, with Reset (hold-to-confirm), player count (opens the count/layout popover), History, Clock (placeholder until M2), Tools (tap = page, hold = quick menu hook-up from TOOLS-HIST), Settings, and the contextual Day/Night icon. The auto-hide behavior.
- DoD: e2e that each button opens its target, and that reset requires the confirm.

**T1.9 · Seat menu (rotated sheet).** Req: SEAT-001, SEAT-002, SEAT-004, SEAT-005, §8.2.
- Do: a `RotatedSheet` per seat with tabs Player / Counters / Commander damage (Timer tab placeholder). Counters grid: tap = increment, hold = options sheet (−1, set exact via keypad, reset, enable/disable for this game). Android back closes it (history state push).
- DoD: e2e `seat-menu.spec.ts` covering rename, counter increment, hold options, and close behaviors.

**T1.10 · Commander damage.** Req: CMD-002..006, CMD-010.
- Do: the on-tile mini grid (spatially mapped to the board; "me" cell; colorized per setting), the commander tab grid with partner split cells, the quick commander-damage board mode, and the tax display (casts × 2).
- DoD: e2e `commander.spec.ts` = **PRD Scenario 1** (commander parts) and **Scenario 2** (partners) through the UI.

**T1.11 · Tokens and global counters UI.** Req: TOK-001, TOK-003, TOK-004.
- Do: monarch/initiative badges with transfer, day/night in the toolbar, and the city's blessing badge.
- DoD: e2e that giving the monarch to B removes it from A, and that day/night cycles Neither → Day → Night → Day.

**Lane SHELL**

**T1.12 · Launcher and setup flow.** Req: GAME-001, GAME-016, LAY-005, PRE-003 (basic picker for MTG presets only; the full picker is T3.5).
- Do:
  - `/` launcher: Resume card (preset · players · elapsed), Quick start (last config), New game, and links to History, Tools, Settings and Presets.
  - `/setup` wizard: preset → players + layout → seats (names, Load profile, color, drag-reorder) → options (starting value, counters, first player) → Start.
- DoD: e2e `setup.spec.ts`: new game in under 6 taps from the launcher, quick start in 1 tap, and Resume after reload.

**T1.13 · Reset, first player, game over.** Req: GAME-010..015, LIFE-005, SET-012 (Dice & randomizer animations toggle).
- Do: the first-player animation (highlight cycling and decelerating, ~1.8 s, skippable; instant when animations are off). A "Player 1" announcement chip. The game-over overlay (winner, duration, turns) with Rematch / New setup. Undo snackbar.
- DoD:
  - e2e: reset keeps names and art and resets values; the starter is uniformly random (engine statistical test, chi-square over 10k seeded runs, in unit tests).
  - The game-over overlay appears on the last elimination; Rematch works.

**T1.14 · Settings screen.** Req: SET-001, SET-010..015, §13.1 sections A, B, D, E, F (G and H get placeholders; FIREBASE and PAY fill them later), SET-030..034.
- Do: `/settings` full page; rows generated from the preset's `capabilities` and the settings registry (`src/features/settings/registry.ts`: id, scope, section, control, options, default, visibleIf). Scope storage (game / preset-default / app). Structural-change confirm and reset. "Save as default for <preset>" and "Restore defaults". The Players chip row, Layout thumbnails, the Starting <primary> chips + Custom keypad, and the Win/loss and Counters-in-this-game sub-pages.
- DoD:
  - Unit tests on the registry (visibility per preset).
  - e2e `settings.spec.ts`: changing players from 4 to 3 resets with confirm; switching the card layout applies live; starting life 30 via the chip resets life to 30; "save as default" persists across a new game.

**T1.15 · Profiles and decks (local).** Req: PROF-001, PROF-002, PROF-010, PROF-011.
- Do: the Profiles screen (CRUD), decks per profile, Load in the seat menu (recent first, then a deck choice), Save as profile, and the "Save Declan as a profile?" suggestion after 2 uses.
- DoD: e2e for profile create → load into seat → deck selected → name/color applied.

**T1.16 · Backgrounds (non-art).** Req: SET-002 (gradients/colors/default), SET-003.
- Do: a curated set of 16 gradients plus a solid color picker, per-seat contrast, and the seat accent color used in the history dots.
- DoD: e2e for selecting a gradient and toggling contrast.

**T1.20 · One-player mode and camera mode.** Req: SET-032, SET-033.
- Do: one-player full-screen seat with an opponents-count/names editor for the commander damage grid. Camera mode overrides rotation.
- DoD: e2e for each.

**Lane TOOLS-HIST**

**T1.17 · Tools page and quick access.** Req: TOOL-001..003, TOOL-007..011, TOOL-013.
- Do: the `/tools` "Dice & Misc" page (randomize player/opponent, coin, custom die, d4–d20 + d100, multi-dice stepper), the result overlay, the hold-🎲 quick menu (exported component for BOARD's toolbar), and the Mana & Storm page (WUBRGC + C, storm, clear; storm resets on turn pass when turn tracking is on). Mana symbols come from fixtures of Scryfall `/symbology` SVGs, bundled in the repo with attribution (or the community Mana font). Record the decision.
- DoD: unit tests for the RNG distribution and opponent exclusion (10k-run property test = **PRD Scenario 12**); e2e for the dice overlay and logging.

**T1.18 · Current-game history.** Req: HIST-001, HIST-002, HIST-010..013.
- Do: `/history` with Current Game and Past Games segments (Past is a placeholder until M6). The header card, standings with the deck subtitle, the event log (icons, colored delta chips by `category`, "Source → Target", grouped linked rows, inline turn/response/dice events), the life chart (lightweight SVG, no heavy chart library; read the `dataviz` skill before building it), and long-press "Undo to here".
- DoD: e2e: after scenario-1 actions, the log rows match the expected texts and colors; undo-to-here reverts.

**T1.19 · Device services.** Req: PWA-005, PWA-006, INP-008, SET (Device section).
- Do: `src/lib/device/`: wake lock (+ video fallback), fullscreen on the first in-game gesture, haptics (feature-detected), and an audio service (unlock on the first gesture; tick, warning and timeout sounds; original synthesized WebAudio tones, so no asset licensing).
- DoD: unit tests with mocked APIs; e2e that the wake lock is requested on the board (stubbed `navigator.wakeLock`).

**Lane TIMER-CORE (pure engine, starts in W2)**

**T2.1 · Timer engine.** Req: TMR-001..011, TMR-020..024, TMR-030..032, TMR-040, TMR-044, TMR-050, TURN-001, TURN-002, §9.8.
- Do: `src/engine/timer/` with modes (off, count-up, bank, bank+increment, bank+delay, per-turn, per-turn+reserve) and an optional match timer. Actions take `now`: `START`, `PASS_TURN`, `UNDO_PASS`, `RESPOND`, `PASS_BACK`, `RETURN_TO_ACTIVE`, `PAUSE`, `RESUME`, `ADJUST`, `TIMEOUT`, `ELIMINATE_SYNC`, `MATCH_END`, `EXTRA_TURN_PASSED`. Also pure helpers `remaining(seat, now)` and `nextSignificantEvent(state, now)` (warnings, timeout, grace end). Integrate into the main reducer: timer actions are game actions, so undo and the history log work.
- DoD:
  - Unit tests for every mode and transition.
  - **PRD Scenarios 3 and 4** as engine tests with exact millisecond expectations.
  - Property tests: total time charged across seats equals the running wall time (excluding pauses and freeze-all responses), and a bank never increases except by increment or adjust.
  - Drift test: simulate 60 min of events at random intervals; |computed − expected| < 1 ms (pure math). 100 ms is the end-to-end budget.

**T2.2 · Scheduler.** Req: TMR-021, TMR-031, TMR-051.
- Do: `src/state/timerScheduler.ts`: arms one `setTimeout` for the next significant event, re-arms after each action, and handles `visibilitychange` (auto-pause or recompute). The display tick hook runs at 4 Hz, or 10 Hz under 10 s, and only for the clock holder.
- DoD: tests with fake timers, plus a background/foreground simulation.

**W2 gate (= G-M1 + timer core):** all wave gates + G-VISUAL (layouts 2–6, seat menu, settings, tools, history) + e2e Scenarios 1, 2, 12 green.

---

### M2/M3/M4 (Wave 3)

**Lane TIMER-UI**

**T2.3 · Turn tracking UI.** Req: TURN-001, LIFE-006, TMR-003, TMR-004, TMR-009.
- Do: the active-seat glow plus a "▶ Turn N" chip, the PASS TURN control on the active seat edge (tap + 3 s undo snackbar, or hold-to-pass), clockwise/counter-clockwise order, and skipping eliminated seats.
- DoD: e2e `turns.spec.ts`.

**T2.4 · Clock chips and the response stack.** Req: TMR-005..008, TMR-010, TMR-011, TMR-041..043.
- Do: the timer chip per seat (holder pulsing; responder in the ⚡ accent), the "⚡ Respond" / "↩ Pass back" buttons, the all-seats banner "⚡ Bethany responding 0:12", the stack depth badge, and "Return to <active>".
- DoD: e2e **Scenario 3** through the UI using `page.clock` (Playwright clock API) to control time.

**T2.5 · Start, pause and overlays.** Req: TMR-001, TMR-002, TMR-020, TMR-021, SET-013.
- Do: the START button, the pause overlay, auto-pause on hidden and on opening settings/menus, and the resume prompt.
- DoD: e2e for start → pause → resume; opening settings pauses.

**T2.6 · Timeout and warnings.** Req: TMR-030, TMR-031, §9.5.
- Do: overtime and grace visuals, negative "flag" display, add-time-once, and the warning pulse/sound/vibrate via device services.
- DoD: e2e **Scenario 4**.

**T2.7 · Match timer.** Req: TMR-032.
- Do: the toolbar match clock, the "TIME — extra turns N" banner, and the extra-turn countdown.
- DoD: e2e with `page.clock`.

**T2.8 · Timer settings and the seat timer tab.** Req: §13.1-C, SEAT-003, TMR-022, TMR-060 (P2: data model only, UI hidden).
- Do: settings section C (rows shown by mode) and the seat Timer tab (remaining, used, adjust with log entry, concede).
- DoD: e2e for changing the mode mid-game (asks to restart the clocks) and for an adjust showing "adjusted" in history.

**T2.9 · Reload resilience.** Req: REL-001, TMR-044.
- Do: verify persistence of timer state and the resume paths.
- DoD: e2e **Scenario 5** (reload with the clock running, with auto-pause both on and off).

**Lane PRESETS**

**T3.1 · Pokémon.** Req: §10.3, CUS-008.
- Do: the preset (prizes primary with **win** at 0, active damage step 10 / hold 50, bench damage panel P1, special conditions as a multi-flag with mutually-exclusive groups, VSTAR/GX booleans, per-turn flags with `resetOnTurnPass`, first-turn hint), the coin-prominent tools, and the TCG Pocket variant (P2: data stub, hidden).
- DoD: G-PRESETS; e2e **Scenario 10**.

**T3.2 · Yu-Gi-Oh! + calculator.** Req: §10.4, INP-007, TOOL-006.
- Do: the YGO, Speed Duel and Rush presets, plus the `Keypad` calculator (±value, `/2` halve rounding up, `=` set, and a tape stored in the history).
- DoD: e2e **Scenario 9**.

**T3.3 · FFTCG, Lorcana, One Piece, SWU, Digimon, Generic (+ FaB, Sorcery as P1).** Req: §10.5, §10.6, PRE-010, PRE-011, TOOL-012.
- Do:
  - Data for each preset. The `pips` display for FFTCG damage. The `track` display for the Digimon global memory gauge (a center bar from −10 to +10, oriented per seat). The Sorcery "Death's Door" multi-stage threshold (enum state + rule).
  - Preset-declared "scratch counters" page (TOOL-012), reusing the Mana & Storm row UI from T1.17.
  - Mark every rule value tagged ⚠ VERIFY in the PRD with a `verify: true` field in the preset data. Generate `docs/RULES-TO-VERIFY.md` listing them for the owner.
- DoD: G-PRESETS; one e2e smoke per preset (`presets-smoke.spec.ts`, parameterized: start → change the primary to its threshold → win/lose detected).

**T3.4 · Per-seat overrides.** Req: PRE-013, GAME-013.
- Do: per-seat start/threshold editing in setup and settings A.
- DoD: e2e: SWU seats with 25 vs. 30 base HP lose at their own thresholds.

**T3.5 · Preset picker.** Req: PRE-003, PRE-012.
- Do: grouped by game, with search, recent, favorites, the rules quick-ref line, and a link to the official rules.
- DoD: e2e for search and favorites.

**T3.7 · Roll-off.** Req: TOOL-004, GAME-012.
- Do: each seat rolls a d20 on its tile; ties re-roll; the winner becomes the starter.
- DoD: unit and e2e tests.

**Lane BUILDER**

**T3.6 · Custom preset builder.** Req: CUS-001..008, CUS-010.
- Do: the `/builder` list and editor: preset meta, a counters list with drag reorder, the counter editor (all fields from PRD §11 including scope, type, threshold, primary, display, reset per turn, link), timer defaults, a **live seat preview** (reuses `SeatTile` read-only), inline validation (Zod + semantic), and JSON export/import (share links come in T7.3).
- DoD: unit tests on validation; e2e **Scenario 7** (Lore Race) built entirely through the UI, then played.

**Lane FIREBASE**

**T4.1 · Auth.** Req: AUTH-001, AUTH-002, AUTH-004.
- Do: lazy Firebase init, Google sign-in (redirect on mobile / popup on desktop with fallback), lazy anonymous sign-in only when needed, the account section G UI, and sign out with the "remove data from this device" option.
- DoD: e2e-emu with the Auth emulator (fallback per §6.3): sign in → account shows email → sign out.

**T4.2 · Rules and rules tests.** Req: SEC-001..006, LEG-005.
- Do: Firestore and Storage rules per PRD §15.1–15.2 (the owner-only subtree, entitlements read-only, field validation, size caps, sharedPresets create/read/delete rules, a write-only `feedback` collection).
- DoD: G-RULES with ≥ 40 cases, including **Scenario 8** (cross-user denial, entitlement write denial).

**T4.3 · Sync engine.** Req: ARCH-007, SYNC-001..004, PROF-003, SET-014.
- Do: `src/lib/sync/`: per-collection bidirectional sync between Dexie and Firestore for profiles, decks, presets, settings and art metadata (game records sync is gated by `can('historySync')`, which is all-free for now). LWW by `updatedAt`, a pending-ops queue for offline use, and a sync status store.
- DoD: unit tests with an in-memory adapter (conflicts, offline queue); e2e-emu across two browser contexts with the same user (a profile created in A appears in B).

**T4.4 · Guest → account merge.** Req: AUTH-003.
- Do: on first sign-in, detect local data. If cloud data exists, offer Merge (default) or Keep cloud only. Merge by ID, then by normalized name for profiles.
- DoD: e2e-emu for the merge scenario with no data loss.

**T4.5 · Account data functions.** Req: AUTH-005, AUTH-006.
- Do: the callable `deleteUserData` (deletes the Firestore subtree, the Storage prefix, and the Auth user) and client export to JSON.
- DoD: G-FUNCS (delete removes everything for user A, nothing for B); e2e-emu for export.

**T4.6 · App Check.** Req: SEC-007.
- Do: init with the reCAPTCHA Enterprise provider when the `NEXT_PUBLIC_APPCHECK_SITE_KEY` env is set; use the debug provider on emulators. Document the enforcement steps in DEPLOY.md.
- DoD: unit test for the conditional init.

**T4.7 · Feedback and diagnostics.** Req: SET-040..043, §13.1-H.
- Do: the feedback form → `feedback` collection; diagnostics preview-then-send; Share (Web Share API); What's new (`CHANGELOG.md` rendered).
- DoD: e2e-emu: feedback is written; diagnostics excludes names unless ticked.

**W3 gate:** all wave gates + G-RULES + G-FUNCS + G-E2E-EMU + G-VISUAL (timer UI, builder, presets) + Scenarios 3, 4, 5, 7, 8, 9, 10.

---

### M5/M6 (Wave 4)

**Lane ART**

**T5.1 · Scryfall client.** Req: ART-001..003, ART-006.
- Do: `src/lib/scryfall/`: a request queue (≥ 100 ms spacing, max 1 in flight per endpoint type), `Accept: application/json`, autocomplete (debounced 300 ms, min 2 chars), prints by `unique=art`, DFC face handling, `/symbology`, and an IndexedDB response cache (24 h TTL). Fixtures in `tests/fixtures/scryfall/` (hand-authored from the documented API shapes, since the sandbox can't reach Scryfall). `scripts/record-scryfall-fixtures.ts` can refresh them where the network allows.
- DoD: unit tests with MSW (rate spacing verified with fake timers, DFC, 404 and 429 handling with backoff).

**T5.2 · Art picker and focal editor.** Req: ART-001..005, ART-008, PROF-010.
- Do: the Backgrounds tab → Search card → prints grid (art_crop thumbnails, set, artist) → choose → the focal/zoom editor (drag + pinch within the rotated tile preview) → save `{x, y, zoom}`. The artist credit. Offer "save as deck commander" for commander presets, plus a commander auto-art shortcut.
- DoD: e2e with MSW fixtures served by a test route handler (or Playwright `route` interception).

**T5.3 · Uploads.** Req: ART-020..023, ART-025.
- Do: `src/lib/image/process.ts`: `createImageBitmap(file, {imageOrientation: 'from-image'})` → canvas resize to 1600 px max → WebP 0.8 (JPEG fallback). Re-encoding strips EXIF. Size checks. Store the blob in Dexie. The My images library.
- DoD: unit tests with sample images (fixtures include an EXIF-rotated JPEG with GPS; the output has no EXIF and the correct orientation); output under 400 KB for a 4000×3000 input.

**T5.4 · Cloud art sync.** Req: ART-022, ART-024, SEC-004.
- Do: upload to `users/{uid}/art/{id}.webp` when signed in, metadata via the sync engine, download-on-demand on other devices, and quota checks via `can()`.
- DoD: e2e-emu across two contexts.

**T5.5 · Offline art caching.** Req: ART-009, PWA-002.
- Do: SW runtime caching for `cards.scryfall.io` (cache-first, 200 entries, LRU) and the API (stale-while-revalidate, 24 h). Chosen art blobs are copied into IndexedDB.
- DoD: e2e that art shows offline after selection; search shows the offline message.

**T5.6 · Attribution.** Req: ART-005, LEG-003, TOOL-013.
- Do: the About/credits screen (Scryfall, artists of the art currently used, icon sets, mana symbols).
- DoD: e2e that the page lists the expected credits.

**Lane HISTORY**

**T6.1 · Game records.** Req: HIST-003, HIST-030, HIST-032.
- Do: a pure `buildRecord(game)`: active time (excluding pauses and gaps > 15 min, configurable), wall time, turn positions, elimination order and causes, per-seat clock stats, final values, and compressed log (`CompressionStream` gzip → base64, with a fallback). Abandoned-game discard rule.
- DoD: unit tests with fixtures, including the idle-gap case from **Scenario 11**.

**T6.2 · "Who won?" prompt.** Req: HIST-031.
- Do: the prompt on reset or new game when meaningful and unresolved; the setting for always / ask if unclear / never.
- DoD: e2e.

**T6.3 · Past Games UI.** Req: HIST-020..024, HIST-007.
- Do: the Games list and game detail (reusing the current-game components read-only, plus Rematch with the same setup), the Players list and detail, the Decks list and detail, and Insights (all metrics from PRD §12.2 including our additions). The filter bar with chips. Locked/blurred previews via `useCan` (all-free until M7, but the lock UI is built and testable by toggling the policy flag in tests).
- DoD: e2e with seeded records (a fixture loader in dev/test builds only).

**T6.4 · Stats library.** Req: HIST-005, HIST-021..023.
- Do: `src/lib/stats/`: pure functions over records with filters (win %, turn-order advantage, durations, elimination causes, first blood, commander-damage leaderboard, clock stats, head-to-head, by preset).
- DoD: unit tests against a hand-computed fixture set (≥ 25 records), ≥ 90 % coverage.

**T6.5 · Identity, merge and edit.** Req: HIST-033..035, PROF-011.
- Do: identity normalization, default-name exclusion, merge/rename with undo, and editing a past game's winner/names/deck.
- DoD: unit + e2e (Scenario 11's merge step).

**T6.6 · Export/import.** Req: HIST-006.
- Do: CSV (one row per game-seat) and JSON export using the current filter; JSON import with validation and dedupe by record ID.
- DoD: unit tests (round trip) + e2e download check.

**T6.7 · Game history toggle and limits.** Req: HIST-008, HIST-007.
- Do: setting Off means no records and a hidden history button. Free view limit 20 with the "N more games saved" row (active when the policy flag is not ALL_FREE).
- DoD: unit + e2e with the policy flag.

**W4 gate:** wave gates + G-E2E-EMU + G-VISUAL (art picker, history screens) + **Scenarios 6 and 11**.

---

### M7 (Wave 5)

**Lane PAY**

**T7.1 · Gating UI.** Req: PAY-004, §17.2.
- Do: switch the policy from `ALL_FREE` to `TIERED` (env-controlled: `NEXT_PUBLIC_PAYWALL_ENABLED`, default **false** until the owner provides the Stripe price IDs). Add lock badges, the paywall sheet with the comparison table, blurred previews (Insights, Decks), and gates for every Pro feature in §17.2 (7–8 players, advanced timer modes, >1 custom preset, >4 profiles / >3 decks, history beyond 20, filters other than date, export, history sync, themes, cloud art > 10).
- DoD: e2e under `PAYWALL_ENABLED=1`: each gated entry point shows the paywall for a free user and is unlocked for Pro (entitlement doc seeded in the emulator).

**T7.2 · Stripe checkout and entitlements.** Req: PAY-002, PAY-003.
- Do:
  - Client: create a `customers/{uid}/checkout_sessions` doc with `price` and the success/cancel URLs, listen for the `url`, and redirect.
  - The `syncEntitlements` function: subscription status `active`/`trialing`, or a one-time lifetime payment, gives `pro: true`, written to `users/{uid}/private/entitlements` (and a custom claim).
  - Client entitlement cache with a 14-day offline grace.
  - The Manage subscription link (the extension's portal link callable).
- DoD: G-FUNCS (simulated subscription docs → entitlement; cancel → removed); e2e-emu with the simulated flow. Real Stripe checkout is a post-deploy check in DEPLOY.md.

**T7.3 · Share links.** Req: CUS-007, SEC-005.
- Do: "Share preset" creates `sharedPresets/{code}` (8-char code). The `/p/[code]` route shows the preset summary with "Import" (works signed out; it imports locally).
- DoD: e2e-emu: user A shares, an anonymous context imports, and a modified copy doesn't affect A.

**T7.4 · Pricing config.** Req: PAY-002, Q4.
- Do: `src/lib/entitlements/pricing.ts` reads the price IDs from env, with display prices as placeholders ($1.99 / $14.99 / $29.99) and a disclaimer that the owner sets the final values.
- DoD: unit test.

**Lane POLISH-A**

**T8.6 · i18n completeness.** All UI strings in `en.json`. The check from T0.6 passes with 0 violations.

**T8.7 · Landing, about, install UX, what's new.** Req: PWA-003, LEG-002, SET-043.
- Do: the launcher's first-run hero, the install prompt after the first completed game (Android `beforeinstallprompt`; iOS instruction sheet), and the About page with the disclaimer.
- DoD: e2e.

**W5 gate:** wave gates + G-FUNCS + G-E2E-EMU.

---

### M8: Hardening and final acceptance (Wave 6)

**T8.1 · Performance.** Req: PERF-001..004.
- Do: bundle analysis; lazy-load Firebase, Scryfall, the builder, history-past, and charts; image `sizes`; font subsetting (system font stack preferred). A tap-latency e2e measurement via the `performance.now()` delta between `pointerdown` and the DOM mutation (≤ 50 ms median on the CI runner, logged). CPU idle check when clocks are off (no intervals running: assert via an instrumented timer registry in test builds).
- DoD: G-BUILD budget and G-LH Performance ≥ 90.

**T8.2 · Accessibility.** Req: A11Y-001..005.
- Do: the aria-live announcer (throttled), focus management in sheets, keyboard controls on desktop, and reduced-motion audit.
- DoD: G-A11Y on all screens + keyboard e2e.

**T8.3 · Legal, consent, analytics, errors.** Req: LEG-001, LEG-002, LEG-004, LEG-006, §19.5, REL-005.
- Do: `/privacy` and `/terms` (template text clearly marked **"Draft: requires owner/legal review"**), the consent banner (analytics off until consent), Firebase Analytics events per §19.5 (lazy, consent-gated), and Sentry init only when a DSN env is present.
- DoD: e2e: no analytics requests before consent (route interception).

**T8.4 · Security headers.** Req: §19.6.
- Do: CSP plus HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` via `next.config.ts` headers. The CSP allows only the origins listed in PRD §19.6.
- DoD: e2e: response headers present; no CSP violations in the console during the full e2e run (a listener fails the test on any violation).

**T8.5 · Lighthouse CI.** Req: PERF-005.
- DoD: G-LH thresholds met (fallback per §6.3).

**T8.8 · Final acceptance.**
- Do:
  1. Run the **entire gate suite** on a clean checkout (`git clean -xfd` equivalent in a fresh worktree; `npm ci`).
  2. Run **PRD Appendix B Scenarios 1–12** as a single tagged e2e suite (`@acceptance`).
  3. G-TRACE: **100 % of P0 and P1** requirements traced or exempted with a reason. List P2 items as deferred.
  4. Revisit every `BLOCKED_FALLBACK` item and resolve it, or document it in FINAL_REPORT.
  5. Two **independent reviewer agents** in parallel, given only the code, the PRD, and the screenshots:
     - **(a) Product/UX reviewer**: compare against PRD §7–§13 and the LifeTap patterns, using G-VISUAL screenshots at all viewports.
     - **(b) Correctness/security reviewer**: engine, timers, rules, sync, payments, CSP.
  6. Fix all blocking findings (Ralph loop), then re-run the full suite.
- DoD: everything green; `REVIEW-final.md` closed.

**T8.9 · Deliverables.**
- Do:
  - `DEPLOY.md`: the owner checklist from §4 in click-by-click form; env var table; the `apphosting.yaml` values to fill in; rules/functions deploy (option A/B); App Check enforcement; Stripe setup; the **post-deploy verification list**: live Scryfall search, real Google sign-in on Android and iOS, a real Stripe test checkout, install to home screen on both platforms, wake lock on iOS, and Lighthouse on prod.
  - `FINAL_REPORT.md`: what was built, the gate results table, trace coverage, deferred P2 list, `RULES-TO-VERIFY.md` link, known limitations, and recommended next steps.
  - `CHANGELOG.md` v1.0.0.
  - Final push.
- DoD: the files exist and are accurate; the push succeeded.

---

## 10. Cross-cutting implementation rules

### 10.1 Engine purity
- `src/engine/**` must be importable in Node with no DOM. ESLint enforces this, and a unit test imports the engine under the `node` environment.
- All randomness goes through `Rng`, and all time comes from action payloads.

### 10.2 Board performance rules
- Each `SeatTile` subscribes to its own slice. Animations use only `transform` and `opacity`. No layout thrash during taps.
- Background art is a CSS `background-image` from an object URL (blob) or the cached URL, with `will-change` only while animating.
- Timer display updates only the holder's chip, via a ref with no React re-render (or a tiny isolated component).

### 10.3 Visual review checklist (G-VISUAL reviewer)
1. Every seat's number, name pill, badges and mini-grid are fully visible and **upright for that seat's player** at 360×740, 412×915 and landscape 1024×768, for layouts 2–6 (7–8 too, once built).
2. The primary number is the dominant element; nothing overlaps it. The pending bubble doesn't cover the name pill.
3. The toolbar doesn't overlap seats. Icons are ≥ 24 px within ≥ 48 px targets.
4. The seat menu sheet faces its seat's player (matching the LifeTap rotated sheet), and is readable without the dimmed board bleeding through.
5. Eliminated seats show a skull overlay and desaturation. The winner overlay is distinct.
6. Timer chips: the holder is unambiguous at arm's length (size, pulse, ▶ icon). The responder has the ⚡ accent. Low time shows red and a pulse.
7. Settings, history, tools and builder pages: no horizontal scroll, consistent spacing, and correct dark theme contrast.
8. Light and high-contrast themes are spot-checked on the board and settings.

### 10.4 Testing conventions
- Unit tests sit beside the source (`*.test.ts`). E2E tests live in `tests/e2e/*.spec.ts`. Rules tests live in `tests/rules/*.test.ts`.
- E2E uses `data-testid` attributes in the form `seat-{index}-plus`, `seat-{index}-value`, `toolbar-reset`, … (documented in `tests/e2e/README.md`).
- Time-based e2e uses Playwright's `page.clock`. Never use `waitForTimeout` longer than 250 ms.
- Seeded RNG in tests is enabled via `?seed=123` in test builds only (`NEXT_PUBLIC_TEST_HOOKS=1`; never enabled in production builds, which a unit test of the build config asserts).

### 10.5 Data and schema versioning
- Every persisted entity has `schemaVersion`. Migrations live in `src/lib/db/migrations.ts` and are unit-tested.
- Preset data has a `version`. Games snapshot their preset (frozen), so preset updates never break saved games.

---

## 11. Commit, merge and push conventions
- Commit messages: `type(scope): summary [REQ-IDs]`. Body: what and why. Trailer: the attribution lines from the session's system instructions.
- One task means ≥ 1 commit. The orchestrator makes merge commits per lane and `chore(progress)` commits per wave.
- Push after: W0, each wave integration, any mid-wave fix touching gates, and the final deliverables. Push only `claude/tcg-life-timer-pwa-d7i37k`.
- **No pull request is opened** unless the owner asks. Merging to `main` (which App Hosting deploys) is the owner's call, and DEPLOY.md explains it.

---

## 12. Risk register (watch items)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Multi-touch on cheap Android devices drops simultaneous taps | Medium | Pointer Events per pointer, no `preventDefault` misuse, CDP multi-touch e2e; post-deploy device check |
| Rotated layouts are confusing at small sizes (5–6 players on 360 px) | Medium | G-VISUAL at 360×740 is mandatory; the auto-fit font; "Name only" and "Big font" card layouts |
| Timer misuse (accidental pass) | Medium | Undo snackbar, hold-to-pass option, undo-to-here in history |
| Next 16 + Serwist friction | Medium | Fallbacks in §6.3 |
| iOS PWA quirks (wake lock, fullscreen, auth popup) | High | Fallbacks + DEPLOY.md post-deploy checks on a real iPhone |
| Rule values in non-MTG presets wrong | Medium | `verify: true` flags, RULES-TO-VERIFY.md for the owner |
| Trademark / Fan Content Policy | Medium | No logos, the disclaimer, game-agnostic Pro features; owner legal review (Q7) |
| Scryfall unavailable in the sandbox | Certain | Fixtures + MSW; live check post-deploy or after the owner allows the hosts (§4.3) |

---

## 13. Definition of Done (the run ends only when ALL are true)

1. Every task in §9 is `DONE`, or `BLOCKED_FALLBACK` with an accepted fallback documented in FINAL_REPORT (which must not break any P0 requirement).
2. On a clean checkout: G-STATIC, G-UNIT, G-PRESETS, G-RULES, G-FUNCS, G-BUILD, G-E2E, G-E2E-EMU, G-A11Y, G-LH and G-TRACE all exit 0, recorded in `GATES.md` with the final commit SHA.
3. PRD Appendix B Scenarios 1–12 pass in the `@acceptance` suite.
4. G-TRACE: 100 % of P0 and P1 requirements traced (or exempted with a reason). P2 is listed as deferred.
5. The final reviewer findings are resolved (`REVIEW-final.md`).
6. `DEPLOY.md`, `FINAL_REPORT.md`, `CHANGELOG.md` and `docs/RULES-TO-VERIFY.md` are written.
7. Everything is pushed to `claude/tcg-life-timer-pwa-d7i37k`.
8. The orchestrator posts the final summary to the owner: what works, gate results, deferred items, and the exact owner actions remaining (F1–F11).

---

## Appendix A: Task index (for bootstrapping PROGRESS.md)

| Wave | Lane | Tasks |
|---|---|---|
| W0 | ORCH | T0.1 T0.2 T0.3 T0.4 T0.5 T0.6 T0.7 T0.8 T0.9 |
| W1 | ENGINE | T1.1 T1.2 T1.3 T1.4 T1.5 |
| W2 | BOARD | T1.6 T1.7 T1.8 T1.9 T1.10 T1.11 |
| W2 | SHELL | T1.12 T1.13 T1.14 T1.15 T1.16 T1.20 |
| W2 | TOOLS-HIST | T1.17 T1.18 T1.19 |
| W2 | TIMER-CORE | T2.1 T2.2 |
| W3 | TIMER-UI | T2.3 T2.4 T2.5 T2.6 T2.7 T2.8 T2.9 |
| W3 | PRESETS | T3.1 T3.2 T3.3 T3.4 T3.5 T3.7 |
| W3 | BUILDER | T3.6 |
| W3 | FIREBASE | T4.1 T4.2 T4.3 T4.4 T4.5 T4.6 T4.7 |
| W4 | ART | T5.1 T5.2 T5.3 T5.4 T5.5 T5.6 |
| W4 | HISTORY | T6.1 T6.2 T6.3 T6.4 T6.5 T6.6 T6.7 |
| W5 | PAY | T7.1 T7.2 T7.3 T7.4 |
| W5 | POLISH-A | T8.6 T8.7 |
| W6 | HARDEN + ORCH | T8.1 T8.2 T8.3 T8.4 T8.5 T8.8 T8.9 |

**Total: 67 tasks, 7 waves, at most 4 parallel lanes per wave.**

## Appendix B: Requirement-to-task coverage check
At bootstrap (Step 1), the orchestrator runs `check:trace --plan`. It cross-references every PRD requirement ID against the `Req:` lines in §9. Any P0/P1 ID not cited by a task is added to the closest task card before W0 begins, and logged in DECISIONS.md. This guarantees the plan covers the whole PRD.
