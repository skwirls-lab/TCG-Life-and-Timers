# DEPLOY.md: Taking TCG Life & Timers live

This guide walks you, the owner, through putting the app on the internet with Firebase App Hosting. Everything was built and tested against the Firebase **emulators** (project `demo-tcg-life`), so none of the steps below were needed during development. You need them now to go live.

> Time needed: about 45–60 minutes for the core launch (Parts 1–5). Payments (Part 7) are optional and can wait; the app ships with the paywall **off**.

---

## Part 0: What you need
- A Google account that will own the Firebase project.
- Admin access to the GitHub repo `skwirls-lab/TCG-Life-and-Timers` (to connect App Hosting).
- A credit card for the **Blaze** plan. App Hosting, Functions and App Check require it. Set a budget alert; normal hobby traffic costs cents per month.

---

## Part 1: Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `tcg-life-timers`) → you can leave Google Analytics on (it is only used after a user consents).
2. Bottom-left gear → **Usage and billing** → **Modify plan** → **Blaze**. Then **Details & settings → Budgets & alerts** → create a budget (e.g. $10/month) with email alerts.
3. **Project settings → General → Your apps → Add app → Web (</>)**. Name it "web" and **don't** tick "Firebase Hosting" (we use App Hosting). Copy the `firebaseConfig` values; you need them in Part 3.

## Part 2: Turn on the services
1. **Authentication → Get started → Sign-in method**:
   - **Google**: Enable → choose a support email → Save.
   - **Anonymous**: Enable. Guests use it for share links and feedback.
2. **Firestore Database → Create database** → **Production mode** → pick a location close to your players (e.g. `nam5` for the US). This location can't be changed later.
3. **Storage → Get started** → Production mode → same region.
4. **App Check** (do this after Part 4, once you have the live URL):
   - Register the web app with **reCAPTCHA Enterprise**. The console creates the key for you.
   - Add your App Hosting domain (and any custom domain) to the key's allowed domains.
   - Copy the **site key** into `NEXT_PUBLIC_APPCHECK_SITE_KEY` (Part 3) and redeploy.
   - After the app has run for a day with App Check reporting "verified" requests, click **Enforce** for Firestore, Storage, and Authentication.

## Part 3: Configure environment variables
✅ **Done for project `tcgtempo`**: the Firebase web config (including the measurement id) is already in `apphosting.yaml`. These are **public** client keys, safe to commit. Edit that file only to add the optional values below:

| Variable | Where it comes from | Required |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | firebaseConfig.apiKey | ✅ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain | ✅ |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | firebaseConfig.projectId | ✅ |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket | ✅ |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId | ✅ |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | firebaseConfig.appId | ✅ |
| `NEXT_PUBLIC_APPCHECK_SITE_KEY` | App Check (Part 2.4) | Recommended |
| `NEXT_PUBLIC_PAYWALL_ENABLED` | `"1"` to turn Pro gating on (Part 7) | No (default off) |
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` / `_YEARLY` / `_LIFETIME` | Stripe price ids `price_…` (Part 7) | Only with payments |
| `NEXT_PUBLIC_PRICE_DISPLAY_MONTHLY` / `_YEARLY` / `_LIFETIME` | Display prices, e.g. `$1.99` | Optional |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN (Part 8) | Optional |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | firebaseConfig.measurementId (analytics, consent-gated) | Optional |

> If cloud config is missing, the app still works fully offline and as a guest. Account features show "Cloud features aren't configured on this deployment".

✅ `.firebaserc` already points at `tcgtempo` (default), with a `demo` alias for `demo-tcg-life`. The test and emulator scripts always pass `--project demo-tcg-life`, so they never touch the real project.

## Part 4: Connect App Hosting (deploys the website)
1. Console → **Build → App Hosting → Get started / Create backend**.
2. Region: the same as Firestore if offered.
3. **Connect to GitHub** → authorize the Firebase GitHub app → choose `skwirls-lab/TCG-Life-and-Timers`.
4. Root directory: `/`. Live branch: **`main`**. Automatic rollouts: **on**.
5. Name the backend (e.g. `web`) → **Finish and deploy**. The first build takes ~5–10 minutes. You get a URL like `https://web--tcg-life-timers.us-central1.hosted.app`.
6. **Authentication → Settings → Authorized domains** → add the App Hosting domain (and your custom domain later). Without this, Google sign-in fails.

From now on, every push to `main` redeploys the website automatically.

## Part 5: Deploy security rules, indexes and Cloud Functions
App Hosting deploys only the website. Security rules and functions are deployed separately. **Choose one option.**

### Option A (recommended): automatic from GitHub on every push to `main`
1. Google Cloud console → **IAM & Admin → Service Accounts** (same project) → **Create service account** `github-deployer`. Grant these roles:
   - Firebase Rules Admin
   - Cloud Datastore Index Admin
   - Firebase Admin (or Cloud Functions Admin + Cloud Functions Developer + Firebase Extensions Viewer)
   - Service Account User
   - Artifact Registry Writer
   - Cloud Build Editor
2. Open the account → **Keys → Add key → JSON** → download the file.
3. GitHub repo → **Settings → Secrets and variables → Actions**:
   - New **secret** `FIREBASE_SERVICE_ACCOUNT` = paste the whole JSON file contents.
   - New **variable** `FIREBASE_PROJECT_ID` = your project id.
4. The workflow `.github/workflows/deploy.yml` now deploys Firestore rules + indexes, Storage rules and Functions on every push to `main`. You can also run it by hand: Actions → "Deploy Firebase rules, indexes and functions" → Run workflow.
5. **Delete the downloaded key file** from your computer.

### Option B: by hand from your computer
```bash
npm ci && npm --prefix functions ci
npx firebase login
npx firebase use <your-project-id>
npx firebase deploy --only firestore,storage,functions
```

Functions that get deployed:
- `deleteUserData` (callable; "Delete account") and `onUserDeleted` (cleanup)
- `syncEntitlementsOnSubscription` and `syncEntitlementsOnPayment` (Pro status from Stripe; harmless without Stripe)
- `artQuotaOnFinalize` and `artQuotaOnDelete` (server-side image quota; only enforced when the paywall is on)
- `hello` (health check)

## Part 6: Merge to `main` and verify
1. The finished work is on branch `claude/tcg-life-timer-pwa-d7i37k`, and is merged to `main` at the end of the build. If you're reading this before that merge: on GitHub, **Pull requests → New** → base `main` ← compare that branch → merge.
2. Wait for the App Hosting rollout (Console → App Hosting → Rollouts) and the GitHub "Deploy" action to go green.
3. Run the **post-deploy checks** below on a real Android phone **and** a real iPhone.

### Post-deploy verification checklist
These couldn't be verified inside the build sandbox. Check them on the live site:
- [ ] **Install**: Android Chrome shows the install prompt after your first completed game; iPhone Safari shows the "Add to Home Screen" instructions. The installed app opens full screen.
- [ ] **Offline**: after one visit, turn on airplane mode → reopen the app → start, play and finish a game.
- [ ] **Screen stays awake** during a game on Android and iPhone. On iPhone, if it dims, enable Settings → Device → Keep display awake → "compatibility method".
- [ ] **Google sign-in** on Android (Chrome) and iPhone (installed app and Safari). Check sync: create a profile on phone A, and it appears on phone B.
- [ ] **Scryfall card art**: search "Atraxa" in a seat's Backgrounds → pick an art → it shows on the tile, then still shows offline. The sandbox couldn't reach Scryfall, so this is the first live test.
- [ ] **Photo upload** from the camera roll and the camera.
- [ ] **Delete account** (with a throwaway Google account): data disappears from Firestore and Storage.
- [ ] **Lighthouse** on the live URL (Chrome DevTools → Lighthouse, Mobile): Performance ≥ 90, Accessibility ≥ 95.
- [ ] **Legal placeholders**: fill the `[bracket]` placeholders in `src/features/legal/content/en.json` (region, retention, contact, jurisdiction, refund policy), have someone review /privacy and /terms, then remove the "Draft" banners.
- [ ] **Rules values**: review `docs/RULES-TO-VERIFY.md` with players of each game and correct the preset data if needed (`src/presets/<game>/presets.ts`).

## Part 7 (optional, later): Turn on Pro payments with Stripe
1. Create a Stripe account (start in **Test mode**).
2. Stripe → **Products** → create "TCG Life & Timers Pro" with three prices:
   - Monthly recurring
   - Yearly recurring
   - Lifetime one-time

   Copy the three `price_…` ids.
3. Firebase Console → **Extensions** → install **"Run Payments with Stripe"** (`stripe/firestore-stripe-payments`):
   - Customer details collection: `customers`. Products collection: `products`. Sync new users: **No**.
   - Paste your Stripe **secret key** (or a restricted key) **into the extension config**. Never commit it or paste it in chat.
   - Set **"Automatically delete Stripe customer objects"** to **Auto delete**. Then deleting a user's account cancels their Stripe subscriptions.
   - Follow the extension's post-install steps to create the Stripe **webhook** to the extension's URL with the listed events.
4. Functions config: set `LIFETIME_PRICE_IDS` = your lifetime price id (comma-separated if several). For example, create `functions/.env.<project-id>` with `LIFETIME_PRICE_IDS=price_…` and redeploy functions. **Only these price ids grant lifetime Pro**; client-supplied metadata is ignored for security.
5. **Turn the paywall on, in BOTH places** (they must agree):
   - `apphosting.yaml`: set `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY/_YEARLY/_LIFETIME`, optional display prices, and `NEXT_PUBLIC_PAYWALL_ENABLED: "1"`. Push to `main`.
   - Firestore console → create document **`config/billing`** with field `paywallEnabled` (boolean) = `true`. Clients can't write this doc. While it's absent, the server allows everything, which is the free-for-all default.
   Once both are on, the server enforces Pro for cloud history sync, share links and the image quota (free 10 / Pro 200).
6. Optional, recommended: give the functions a **restricted Stripe key** (`rk_…` with only *Subscriptions: Write*) as `STRIPE_SECRET_KEY` in an **uncommitted** `functions/.env.<project-id>`. "Delete account" then cancels active subscriptions before deleting data, and stops if Stripe refuses.
7. Refunds and disputes: the extension doesn't mirror refunds. When you refund a lifetime purchase or lose a dispute, set that `customers/{uid}/payments/{id}` doc's `status` to `"refunded"` (or add `revoked: true`). Pro is recomputed automatically.
8. Test with Stripe test card `4242 4242 4242 4242`. The account shows Pro within seconds, and **Manage subscription** opens the Stripe portal. Then switch Stripe to Live mode and replace the price ids and key.
9. Legal: before charging money, have someone review `/terms`, `/privacy`, the trademark disclaimer, and WotC's Fan Content Policy (PRD §17.1, Q7). Pro features are deliberately game-agnostic, and Scryfall art is never paywalled.
   - **Placeholder banners to remove after review** (they are shown to users on purpose until then):
     - `/privacy` and `/terms`: "Draft — requires owner/legal review" (`legal.draft` in `src/i18n/en/legal.json`, rendered by `src/features/legal/LegalDocument.tsx`; texts in `src/features/legal/content/en.json`).
     - `/about`: "Draft legal text, pending review" (`art.about.draft` in `src/i18n/en/art.json`, rendered by `src/features/art/AboutScreen.tsx`).
   - Rule values marked `verify` (docs/RULES-TO-VERIFY.md) show a "needs checking" hint only in dev/test builds; set `NEXT_PUBLIC_SHOW_VERIFY=1` to see them in a production build while you check.

## Part 8 (optional): Error reporting and analytics
- **Sentry**: create a project (platform: JavaScript/Browser) → copy the DSN → `NEXT_PUBLIC_SENTRY_DSN` in `apphosting.yaml`. Sentry loads only when this is set.
- **Analytics**: set `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`. Analytics loads only after the user accepts the consent banner.

## Part 9 (optional): Custom domain
App Hosting → your backend → **Settings → Domains → Add custom domain** → follow the DNS steps. Then add the domain to **Authentication → Authorized domains** and to the **App Check** reCAPTCHA key.

---

### Troubleshooting
| Symptom | Fix |
|---|---|
| "Cloud features aren't configured" | An env var in `apphosting.yaml` is still `REPLACE_ME`; fix it and push |
| Google sign-in popup closes with `auth/unauthorized-domain` | Add the domain in Authentication → Settings → Authorized domains |
| Sync shows "permission denied" | Rules not deployed (Part 5) or App Check enforced before the site key was set |
| Paywall never appears | `NEXT_PUBLIC_PAYWALL_ENABLED` isn't `"1"` (intended default) |
| Stripe checkout spins forever | Extension not installed, webhook missing, or price id typo |
