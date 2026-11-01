# Reviewer B: correctness and security review

Base commit: 227061f. All tests below are throwaway and uncommitted.
- Unit repros: `npx vitest run -c tests/review-b/vitest.config.ts`
- Rules repros: `npx firebase emulators:exec --only firestore,storage,auth --project demo-tcg-life "npx vitest run -c tests/review-b/rules.vitest.config.ts"`

Every repro test asserts the correct behaviour, so a failing test shows the bug.

## Findings

### B-1 (blocking): Undo across a pause charges the whole paused time to the clock holder and can eliminate them
- **Where:** `src/engine/undo.ts:63-95` (UNDO / UNDO_TO / REDO restore snapshots as they are), and `TIMER_PAUSE`/`TIMER_RESUME` count as normal undo steps (the `default:` branch of `reduceSession`).
- **What happens:** a snapshot taken before a pause has `status: "running"` and an old `runningSince`. Restoring it charges all the time since then to the holder, including the paused time. These paths are common:
  1. **Background auto-pause.** The app is backgrounded (auto-pause), the user comes back and taps Resume, then taps Undo twice to fix a misclick. The 30 background minutes are charged: remaining time goes from 17:00 to −13:00, the scheduler fires `TIMER_TIMEOUT`, and the seat is eliminated under "lose".
  2. **History "Undo to here".** Leaving the board or opening a menu dispatches `TIMER_PAUSE{menu}` (`TimerLayer.tsx:46,100`). On History, "Undo to here" (`EventLog.tsx:218`) restores a running snapshot. The clocks restart while the user is still in the menu, the timer scheduler is stopped (it only runs while the board is mounted), and all the menu time is charged. With a 5-minute bank, the seat is at −2:00 the moment they return to the board.
  This breaks TMR-020/021 (paused time is never charged) and GAME-015.
- **Repro:** `tests/review-b/undo-pause.test.ts` has 2 failing tests: `expected -780000 to be 1020000` and `expected 'running' to be 'paused'`.
- **Fix:**
  - Make pause and resume "sticky" in the timer sense: not undo steps, and they never change status through undo.
  - On UNDO, UNDO_TO and REDO, rebase the restored timer:
    - if the current timer is paused, restore the snapshot settled at its own time, then paused (`runningSince: null`, keeping `pausedReason`);
    - if it is running, set `runningSince = now` after charging only the time that was actually running.
  - Simplest option: carry the current `status`, `pausedReason` and pause intervals across the restore. Add a property test: "undo never charges paused wall time".

### B-2 (major): Two tabs on /play delete each other's active game
- **Where:** `src/lib/db/gameRepo.ts:28-34` (`saveActive` deletes the row the shared `activeGameId` pointer names when it differs from the game being saved). There is no cross-tab coordination (no BroadcastChannel, Web Locks or storage event anywhere in `src`).
- **What happens:** tab A has game g1 open. Tab B starts g2 and saves it. Tab A's next autosave (any tap) hard-deletes g2's row and points the pointer back to g1. The tabs keep deleting each other's game on every autosave, and after a reload only the last writer's game exists. An unfinished game is silently lost, and the record keeper never sees it as replaced.
- **Repro:** `tests/review-b/multitab.test.ts` (two Dexie connections to one database) fails with `expected undefined to be defined`.
- **Fix:** stop hard-deleting by pointer from `saveActive`. Delete only the id this tab's session replaced (pass the previous id from the store). Also add single-writer coordination: a `navigator.locks` / BroadcastChannel "game open in another tab" guard, or reload the store when another tab writes.

### B-3 (major): Account deletion leaves the Stripe subscription billing, and Stripe webhooks recreate data for the deleted uid
- **Where:**
  - `functions/src/logic/deleteUserData.ts:61-62` only deletes Firestore `customers/{uid}` and never cancels anything in Stripe.
  - `functions/src/logic/syncEntitlements.ts:68` writes `users/{uid}/private/entitlements` without checking that the Auth user still exists. Its `getUser` 404 is swallowed after the write.
  - `DEPLOY.md` Part 7 never tells the owner to set the extension's "Automatically delete Stripe customer objects" option.
- **What happens:** a subscriber who uses "Delete account" keeps being charged, and can no longer open the Stripe portal because the account is gone. The next `customer.subscription.updated` or `invoice` webhook makes the extension write `customers/{uid}/subscriptions/*` again. That fires `syncEntitlementsOnSubscription`, which recreates `users/{uid}/private/entitlements` for the deleted user. This contradicts the privacy-policy promise that all cloud data is deleted (AUTH-005). The delete UI says nothing about subscriptions.
- **Repro:** code path above. There is no emulator for the Stripe extension.
- **Fix:**
  - In `deleteUserData`, cancel active subscriptions through the Stripe API (secret held in Functions config), or document and require `DELETE_STRIPE_CUSTOMERS=Auto delete` in DEPLOY.md.
  - Warn in the delete-account dialog when the user has an active subscription.
  - In `syncEntitlements`, return early without writing when `auth.getUser(uid)` is not found.

### B-4 (major): Pro-only cloud features are enforced only on the client; the rules never check the `pro` claim
- **Where:**
  - `firestore.rules:132` (games create) and `:206` (sharedPresets create).
  - `storage.rules:9` (art upload: any signed-in uid, including anonymous users, with no count limit).
  - `syncEntitlements` already mirrors `pro` into the custom claim, but no rule reads `request.auth.token.pro`.
- **What happens:** a free (or tampered-client) user can still use paid server resources:
  - write game history to Firestore (PRD §17.2: history sync is Pro);
  - create share links;
  - upload any number of 2 MB images to Storage (free quota is 10, ART-024). Anonymous users can upload too, although D-059 says cloud art is Google-only.
  This is a server-side effect of client-only gating, and an unlimited Storage and Firestore cost vector (App Check only raises the bar).
- **Repro:** `tests/review-b/gaps.rules.ts` → `B-4 *`. All 3 tests fail: a game write by a free user succeeds, 12/12 uploads succeed, and an anonymous upload succeeds.
- **Fix:**
  - Gate games create, sharedPresets create and art on `request.auth.token.pro == true` (or `get()` the entitlements doc) whenever the paywall is enabled.
  - Require `request.auth.token.firebase.sign_in_provider != 'anonymous'` for Storage art.
  - Enforce the art count server-side: a Function that counts `users/{uid}/art` and deletes over-quota objects, or a counter doc checked with `getAfter`.

### B-5 (minor): sharedPresets payload is not validated, so anonymous users can host arbitrary public text, and the image filter is case-sensitive
- **Where:** `firestore.rules:193-206`. The payload is any string of 200 KB or less. The `name` field (60 chars, shown on `/p/[code]`) is free text. The `data:image/` check is case-sensitive.
- **Repro:** `tests/review-b/gaps.rules.ts` → `B-5 *`. Both fail: an anonymous 200 KB non-JSON payload with a "Free crypto at evil.example" name is accepted, and `DATA:IMAGE/png` passes the LEG-005 filter.
- **Fix:**
  - Require a structural prefix (for example `payload.matches('^\\{"format":"tcg-life-preset".*')`).
  - Use a case-insensitive pattern: `(?is)`.
  - Rate-limit share creation per uid, or require a non-anonymous Pro user (see B-4).

### B-6 (minor): Account deletion leaves the user's feedback documents (uid + email) behind
- **Where:**
  - `functions/src/logic/deleteUserData.ts:61-75` never touches `feedback/*`.
  - `src/lib/feedback/submit.ts:58-66` stores `uid` and the optional `email`.
  - The privacy text (`legal/content/en.json:61,68`) promises that all cloud data is deleted.
- **Fix:** add `feedback where uid == uid` to the deletion (it needs a single-field index), or stop storing `uid`.

### B-7 (minor): Guest→account merge by name leaves game records pointing at the old local profile id
- **Where:** `src/lib/account/merge.ts:138-149` rewrites `profiles` and `decks.profileId` only. Records (`players[].profileId`, `seats[].profileId`) and the active game's seats keep the local id. The record identity is `p:<profileId>` (`src/lib/records/identity.ts:9`).
- **What happens:** after the merge, the guest's history for "Alice" splits off as a separate player row tied to a profile that no longer exists. Profile detail pages and head-to-head stats lose that history until the user merges the identities by hand.
- **Fix:** in the same transaction, rewrite `profileId` in `records` (local-only edits are already allowed for records) and in the active game's seats.

### B-8 (minor): Lifetime Pro survives refunds and disputes
- **Where:** `functions/src/logic/entitlements.ts:51-54`. A lifetime grant requires only `status === "succeeded"`. A refunded PaymentIntent keeps `succeeded`, and the extension does not mirror `charge.refunded` or `charge.dispute.*`. Only a `manual` override exists, and it can only grant.
- **Fix:** also check the `refunded` / `amount_refunded` fields, or add a server-side revoke list (for example `source:"revoked"` honoured like `manual`).

### B-9 (minor): A tombstoned write-once game record can be resurrected
- **Where:** `firestore.rules:134-135` allows `deleted: true → false`.
- **Repro:** `tests/review-b/gaps.rules.ts` → "a tombstoned record cannot be resurrected" fails.
- **Impact:** only the owner's own data, but it breaks the SYNC-003 tombstone semantics (a stale device could un-delete).
- **Fix:** `&& !(resource.data.get('deleted', false) == true && data().get('deleted', false) == false)`.

## Checked and held up
- Engine fuzz (`tests/review-b/engine-props.test.ts`). It ran 6 seeds × 3000 runs over random sequences with 4–6 seats covering:
  - seat add/remove, RESET_GAME, END_GAME;
  - runtime TIMER_SET_CONFIG, TIMER_RESET_CLOCKS;
  - autoKO prompt/accept/decline, commander damage, concede/revive;
  - respond / pass back / return, adjust/set;
  - UNDO / REDO / UNDO_TO.
  The structural invariants held: holder never eliminated, stack entries alive, clocks match the seats, active seat alive while running, tokens and prompts reference live seats, timer status matches game status.
- Undo exactness: for every non-merged step, UNDO returns the identical previous `Game` object.
- Time conservation, including seat add, runtime config changes and prompts: the sum of `usedMs` equals the charged wall time, with no drift.
- Commander damage → life link is one action, one undo step. INP-006 batching merges both events and breaks on elimination and timer events.
- Turn order skips eliminated seats. The round wrap is correct when the first seat is eliminated. PASS_TURN is blocked while another seat holds the stack (TMR-009).
- Rules:
  - `private/entitlements` and `customers/**` are not client-writable.
  - Checkout `metadata` cannot grant Pro: `syncEntitlements` ignores it, and lifetime is granted only for `LIFETIME_PRICE_IDS`.
  - The existing tests cover cross-user denial.
  - sharedPresets are immutable, `list` is limited to the owner, and `get` by code is fine (62^8 code space).
  - Game updates are limited to `updatedAt` / `deleted`.
- `deleteUserData` blocks uid path traversal (`/`, `.`, `..`, empty) and is idempotent (not-found tolerated). `syncEntitlements` never revokes a `manual` grant, and `canceled` → none.
- Client-side Pro tampering stays local. Entitlements come only from server snapshots, and Pro drops on sign-out.
- Imports and the share link:
  - Imports go through zod (`PresetSchema` plus semantic validation; the records schema has size caps).
  - Object spread defines own properties (no prototype pollution).
  - No `dangerouslySetInnerHTML` or `innerHTML` anywhere; React escapes names.
- The CSV export guards cells starting with `= + - @ \t \r` and applies RFC 4180 quoting.
- Anonymous→Google uses `linkWithPopup` / `linkWithRedirect` / `linkWithCredential`, so the uid and its share links are preserved.
- Signing out with "remove data" while ops are pending shows a warning. The sign-out order (stop sync → clear the merged marker → clear data) is safe.
- Corrupt or newer-schema saves are backed up to kv before the active game is cleared, and the store shows a notice.
- The EXIF/RIFF/PNG chunk parsers always advance (no infinite loop on hostile files).
- CSP: `object-src 'none'`, `frame-ancestors 'none'`, script origins allow-listed. `'unsafe-inline'` is documented (D-068).
