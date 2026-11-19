# DEPLOY.md: Taking TCGTempo live

This guide walks you, the owner, through putting the app on the internet with **Firebase Hosting**: the app is a static export (plain HTML, JS and data files) served from Google's CDN, so there is no server to wake up and every screen change is a file download. GitHub Actions builds and deploys it on every push to `main`. Everything was built and tested against the Firebase **emulators** (project `demo-tcg-life`), so none of the steps below were needed during development. You need them now to go live.

> Time needed: about 45–60 minutes for the core launch (Parts 1–5). Payments (Part 7) are optional and can wait; the app ships with the paywall **off**.

---

## Part 0: What you need
- A Google account that will own the Firebase project.
- Admin access to the GitHub repo `skwirls-lab/TCG-Life-and-Timers` (to set the deploy variables).
- A credit card for the **Blaze** plan. Cloud Functions and App Check require it. Set a budget alert; normal hobby traffic costs cents per month.

---

## Part 1: Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `tcg-life-timers`) → you can leave Google Analytics on (it is only used after a user consents).
2. Bottom-left gear → **Usage and billing** → **Modify plan** → **Blaze**. Then **Details & settings → Budgets & alerts** → create a budget (e.g. $10/month) with email alerts.
3. **Project settings → General → Your apps → Add app → Web (</>)**. Name it "web". You can leave "Firebase Hosting" unticked; Part 4 sets Hosting up. Copy the `firebaseConfig` values; you need them in Part 3.

## Part 2: Turn on the services
1. **Authentication → Get started → Sign-in method**:
   - **Google**: Enable → choose a support email → Save.
   - **Anonymous**: Enable. Guests use it for share links and feedback.
2. **Firestore Database → Create database** → **Production mode** → pick a location close to your players (e.g. `nam5` for the US). This location can't be changed later.
3. **Storage → Get started** → Production mode → same region.
4. **App Check** (do this after Part 4, once you have the live URL):
   - Register the web app with **reCAPTCHA Enterprise**. The console creates the key for you.
   - Add `tcgtempo.web.app`, `tcgtempo.firebaseapp.com` and any custom domain to the key's allowed domains.
   - Copy the **site key** into `NEXT_PUBLIC_APPCHECK_SITE_KEY` (Part 3) and redeploy.
   - After the app has run for a day with App Check reporting "verified" requests, click **Enforce** for Firestore, Storage, and Authentication.

## Part 3: Configure environment variables
✅ **Done for project `tcgtempo`**: the Firebase web config (including the measurement id) is in the committed file **`.env.production`**. These are **public** client keys that ship in every page, so they are safe to commit. The production build (`npm run build`, run by GitHub Actions) bakes them into the static files. Edit that file to add the optional values below, then push to `main`:

| Variable | Where it comes from | Required |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | firebaseConfig.apiKey | ✅ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain | ✅ |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | firebaseConfig.projectId | ✅ |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket | ✅ |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId | ✅ |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | firebaseConfig.appId | ✅ |
| `NEXT_PUBLIC_APPCHECK_SITE_KEY` | App Check (Part 2.4) | Recommended |
| `NEXT_PUBLIC_PAYWALL_ENABLED` | `1` to turn Pro gating on (Part 7) | No (default off) |
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` / `_YEARLY` / `_LIFETIME` | Stripe price ids `price_…` (Part 7) | Only with payments |
| `NEXT_PUBLIC_PRICE_DISPLAY_MONTHLY` / `_YEARLY` / `_LIFETIME` | Display prices, e.g. `$1.99` | Optional |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN (Part 8) | Optional |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | firebaseConfig.measurementId (analytics, consent-gated) | Optional |
| `NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS` | Custom domains whose sign-in handler is set up (Part 9) | Optional |

> Never put a secret in `.env.production`: everything in it is public. If cloud config is missing, the app still works fully offline and as a guest. Account features show "Cloud features aren't configured on this deployment".

✅ `.firebaserc` already points at `tcgtempo` (default), with a `demo` alias for `demo-tcg-life`. The test and emulator scripts always pass `--project demo-tcg-life` (or another `demo-` id), so they never touch the real project. The test builds (`npm run build:test`, `build:emu`) blank every value from `.env.production` (`scripts/build.ts`), so tests never see the real project.

**Response headers live in `firebase.json`** (`hosting.headers`): the Content-Security-Policy, HSTS and the other security headers, the caching rules (`/_next/static/**` cached for a year, pages and their data files revalidated on every visit, the service worker never cached) and the `/p/**` share-link rewrite. They are generated from `src/lib/security/headers.ts`: after editing that file run `npm run gen:hosting` and commit `firebase.json`. A unit test and the production build fail when the two drift apart.

## Part 4: Turn on Firebase Hosting (deploys the website)
1. Firebase console → **Build → Hosting → Get started**. Click through the CLI steps (they are already done in this repo). The default site is **`tcgtempo`**, served at `https://tcgtempo.web.app` and `https://tcgtempo.firebaseapp.com`.
2. Finish Part 5, Option A (the GitHub deploy). The same workflow deploys the website.
3. Push to `main`, or open **Actions → Deploy → Run workflow**. When it is green, open `https://tcgtempo.web.app` and check that the app loads and that Settings → Account offers Google sign-in.
4. **Authentication → Settings → Authorized domains**: `tcgtempo.web.app` and `tcgtempo.firebaseapp.com` are listed by default. Add your custom domain there in Part 9. Without this, Google sign-in fails.
5. **Moving from App Hosting** (the site used to run on Firebase App Hosting): this repo no longer has an `apphosting.yaml`, so the App Hosting backend's next automatic rollout from `main` fails (its build can't serve a static export). That failure is harmless, but delete the backend once Hosting works: first move the custom domain (Part 9), then Console → **App Hosting** → your backend → **Settings → Delete backend**. Deleting it also stops its Cloud Run service and its billing.

From now on, every push to `main` builds the site in GitHub Actions and deploys it to Hosting. Pull requests from this repository also get a **preview URL** (a Hosting preview channel `pr-<number>` that expires after 7 days), printed in the "Deploy" job's summary. Google sign-in doesn't work on preview URLs unless you add the preview domain to the authorized domains.

## Part 5: Deploy the website, security rules, indexes and Cloud Functions
One GitHub workflow deploys everything: Hosting, Firestore rules and indexes, Storage rules and Cloud Functions. **Choose one option.**

### Option A (recommended): automatic from GitHub on every push to `main`
This uses **Workload Identity Federation**: GitHub proves who it is to Google, so no key file ever exists. (Downloadable service-account keys are blocked by default on new Google Cloud organizations: policy `iam.disableServiceAccountKeyCreation`. Leave that policy on.)

1. Google Cloud console → **IAM & Admin → Service Accounts** (project `tcgtempo`) → **Create service account** `github-deployer`. Grant these roles:
   - Firebase Rules Admin
   - Cloud Datastore Index Admin
   - Firebase Admin (covers Firebase Hosting too; or Firebase Hosting Admin + Cloud Functions Admin + Cloud Functions Developer + Firebase Extensions Viewer)
   - Service Account User
   - Artifact Registry Writer
   - Cloud Build Editor
   - Cloud Functions Admin and Cloud Run Admin (needed to make the callable functions publicly invokable)
   Do **not** create a key.
2. Open **Cloud Shell** (the `>_` icon at the top of the console) and paste:
   ```bash
   PROJECT_ID=tcgtempo
   PROJECT_NUMBER=726097197982
   REPO=skwirls-lab/TCG-Life-and-Timers
   SA=github-deployer@$PROJECT_ID.iam.gserviceaccount.com

   gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project=$PROJECT_ID

   gcloud iam workload-identity-pools create github \
     --project=$PROJECT_ID --location=global --display-name="GitHub"

   gcloud iam workload-identity-pools providers create-oidc github-repo \
     --project=$PROJECT_ID --location=global --workload-identity-pool=github \
     --display-name="GitHub repo" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition="assertion.repository=='$REPO'"

   gcloud iam service-accounts add-iam-policy-binding $SA --project=$PROJECT_ID \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
   ```
   The attribute condition means only this repository can use the pool.
   **One-time project setup** (same Cloud Shell). It turns on the APIs a deploy needs and makes the permission grants a first functions deploy would otherwise try, and fail, to make itself:
   ```bash
   gcloud services enable firebasehosting.googleapis.com firebasestorage.googleapis.com storage.googleapis.com \
     firestore.googleapis.com firebaserules.googleapis.com cloudfunctions.googleapis.com \
     cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
     eventarc.googleapis.com pubsub.googleapis.com firebaseextensions.googleapis.com \
     cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=$PROJECT_ID

   COMPUTE_SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com
   GCS_SA=$(gcloud storage service-agent --project=$PROJECT_ID)
   gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$GCS_SA" --role=roles/pubsub.publisher --condition=None
   gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com" --role=roles/iam.serviceAccountTokenCreator --condition=None
   gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$COMPUTE_SA" --role=roles/eventarc.eventReceiver --condition=None
   gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$COMPUTE_SA" --role=roles/run.invoker --condition=None
   gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$COMPUTE_SA" --role=roles/cloudbuild.builds.builder --condition=None
   gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-eventarc.iam.gserviceaccount.com" --role=roles/eventarc.serviceAgent --condition=None
   ```
   Also make sure **Storage** is set up in the Firebase console (Build → Storage → Get started; it needs the Blaze plan).

   **If your Google Cloud organization blocks public access** (secure-by-default orgs do; the deploy fails with "Unable to set the invoker" and a manual test says "do not belong to a permitted customer"), allow it for this project only. Callable functions must be publicly invokable; the code itself checks the signed-in user.
   ```bash
   ORG_ID=$(gcloud projects describe $PROJECT_ID --format="value(parent.id)")
   gcloud organizations add-iam-policy-binding $ORG_ID --member="user:$(gcloud config get account)" \
     --role=roles/orgpolicy.policyAdmin --condition=None
   cat > /tmp/p1.yaml <<EOF
   name: projects/tcgtempo/policies/iam.allowedPolicyMemberDomains
   spec:
     rules:
     - allowAll: true
   EOF
   cat > /tmp/p2.yaml <<EOF
   name: projects/tcgtempo/policies/iam.managed.allowedPolicyMembers
   spec:
     rules:
     - enforce: false
   EOF
   gcloud org-policies set-policy /tmp/p1.yaml && gcloud org-policies set-policy /tmp/p2.yaml
   ```
   Policy changes take a few minutes to apply. The very first 2nd-gen functions deploy can also fail with "Permission denied while using the Eventarc Service Agent" while Google finishes setting up; wait a few minutes and run the workflow again.
3. GitHub repo → **Settings → Secrets and variables → Actions → Variables** tab. Add three **variables** (they are not secrets):
   - `GCP_WIF_PROVIDER` = `projects/726097197982/locations/global/workloadIdentityPools/github/providers/github-repo`
   - `GCP_SERVICE_ACCOUNT` = `github-deployer@tcgtempo.iam.gserviceaccount.com`
   - `FIREBASE_PROJECT_ID` = `tcgtempo`
4. Actions → **Deploy** → **Run workflow**. After that it runs on every push to `main`: it builds the static export (`npm run build` → `out/`) and runs `firebase deploy --only hosting,firestore,storage,functions`. The service account needs no extra role for Hosting: Firebase Admin includes it.

The workflow still accepts a JSON key in a `FIREBASE_SERVICE_ACCOUNT` secret, for organizations that allow keys, but you don't need one. Pull-request previews use Workload Identity Federation only, and never run for pull requests from forks.

### Option B: by hand from your computer (fastest to get going)
```bash
npm ci && npm --prefix functions ci
npx firebase login
npx firebase use <your-project-id>
npm run build
npx firebase deploy --only hosting,firestore,storage,functions
```
To look at the production build locally first: `npm run build && npm start` serves `out/` with the Firebase Hosting emulator on http://127.0.0.1:3000, with the same headers and rewrites as the live site.

Functions that get deployed:
- `deleteUserData` (callable; "Delete account") and `onUserDeleted` (cleanup)
- `syncEntitlementsOnSubscription` and `syncEntitlementsOnPayment` (Pro status from Stripe; harmless without Stripe)
- `artQuotaOnFinalize` and `artQuotaOnDelete` (server-side image quota; only enforced when the paywall is on)
- `hello` (health check)

## Part 6: Merge to `main` and verify
1. The finished work is on branch `claude/tcg-life-timer-pwa-d7i37k`, and is merged to `main` at the end of the build. If you're reading this before that merge: on GitHub, **Pull requests → New** → base `main` ← compare that branch → merge.
2. Wait for the GitHub **Deploy** action to go green (Console → Hosting shows the new release), then open `https://tcgtempo.web.app`.
3. Run the **post-deploy checks** below on a real Android phone **and** a real iPhone.

### Post-deploy verification checklist
These couldn't be verified inside the build sandbox. Check them on the live site:
- [ ] **Install**: Android Chrome shows the install prompt after your first completed game; iPhone Safari shows the "Add to Home Screen" instructions. The installed app opens as an app (status bar visible).
- [ ] **Offline**: after one visit, turn on airplane mode → reopen the app → start, play and finish a game.
- [ ] **Screen stays awake** during a game on Android and iPhone. On iPhone, if it dims, enable Settings → Device → Keep display awake → "compatibility method".
- [ ] **Google sign-in** on Android (Chrome) and iPhone (installed app and Safari). Check sync: create a profile on phone A, and it appears on phone B.
- [ ] **Scryfall card art**: search "Atraxa" in a seat's Backgrounds → pick an art → it shows on the tile, then still shows offline. The sandbox couldn't reach Scryfall, so this is the first live test.
- [ ] **Photo upload** from the camera roll and the camera.
- [ ] **Delete account** (with a throwaway Google account): data disappears from Firestore and Storage.
- [ ] **Lighthouse** on the live URL (Chrome DevTools → Lighthouse, Mobile): Performance ≥ 90, Accessibility ≥ 95.
- [ ] **Headers**: `curl -sI https://tcgtempo.web.app/settings` shows `content-security-policy`, `strict-transport-security` and `cache-control: no-cache`; `curl -sI https://tcgtempo.web.app/serwist/sw.js` shows `cache-control: no-cache, no-store, must-revalidate` and `service-worker-allowed: /`.
- [ ] **Share link**: open `https://tcgtempo.web.app/p/<code>` from a link made in the builder; the shared game type shows.
- [ ] **Legal placeholders**: fill the `[bracket]` placeholders in `src/features/legal/content/en.json` (region, retention, contact, jurisdiction, refund policy), have someone review /privacy and /terms, then remove the "Draft" banners.
- [ ] **Rules values**: review `docs/RULES-TO-VERIFY.md` with players of each game and correct the game type data if needed (`src/presets/<game>/presets.ts`).

### Same-origin sign-in (for iPhone users of the installed app)
Sign-in uses a Google popup on every device. An installed app on iPhone can't receive a popup's result, and it falls back to a redirect, which only works when the sign-in handler is on the app's own domain. Firebase Hosting serves that handler (`/__/auth/handler`) on **every** domain of the site, so nothing is proxied:
- On `tcgtempo.web.app` and `tcgtempo.firebaseapp.com` the app uses its own domain automatically. Their redirect URIs are already authorized.
- On a custom domain it does so only once you set it up (Part 9, step 4). Until then sign-in keeps using `tcgtempo.firebaseapp.com`, which works everywhere except the redirect fallback in the installed iPhone app.

## Part 7 (optional, later): Turn on Pro payments with Stripe
1. Create a Stripe account (start in **Test mode**).
2. Stripe → **Products** → create "TCGTempo Pro" with three prices:
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
   - `.env.production`: set `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY/_YEARLY/_LIFETIME`, optional display prices, and `NEXT_PUBLIC_PAYWALL_ENABLED=1`. Push to `main`.
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
- **Sentry**: create a project (platform: JavaScript/Browser) → copy the DSN → `NEXT_PUBLIC_SENTRY_DSN` in `.env.production`. Sentry loads only when this is set.
- **Analytics**: set `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`. Analytics loads only after the user accepts the consent banner.

## Part 9 (optional): Custom domain
Moving `tcgtempo.skwirls.com` from App Hosting to Hosting:
1. Console → **App Hosting** → your backend → **Settings → Domains** → remove `tcgtempo.skwirls.com`.
2. Console → **Hosting** → **Add custom domain** → `tcgtempo.skwirls.com` → follow the steps. At your DNS provider, replace the records App Hosting asked for with the ones Hosting shows (usually A records, plus a TXT record to prove ownership). The certificate can take up to an hour (sometimes longer) after DNS updates.
3. **Authentication → Settings → Authorized domains** → add `tcgtempo.skwirls.com` (if it isn't there already). Also add it to the **App Check** reCAPTCHA key's domains.
4. Optional, for sign-in in the installed iPhone app on the custom domain:
   1. Google Cloud console → **APIs & Services → Credentials** → the OAuth 2.0 client "Web client (auto created by Google Service)". Under **Authorized redirect URIs** add `https://tcgtempo.skwirls.com/__/auth/handler`; under **Authorized JavaScript origins** add `https://tcgtempo.skwirls.com`. Save.
   2. **Only after that**, set `NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS=tcgtempo.skwirls.com` in `.env.production` (comma-separate several domains) and push to `main`. Done in the other order, sign-in on that domain fails with `redirect_uri_mismatch`.
5. When the custom domain works on Hosting, delete the App Hosting backend (Part 4, step 5).

---

### Troubleshooting
| Symptom | Fix |
|---|---|
| "Cloud features aren't configured" | A value in `.env.production` is missing or still `REPLACE_ME`; fix it and push |
| The Deploy action says "No deploy credentials configured" | Add the `GCP_WIF_PROVIDER` and `GCP_SERVICE_ACCOUNT` repository variables (Part 5) |
| Deploy fails with "Hosting site … not found" or a 403 on `firebasehosting.googleapis.com` | Click **Hosting → Get started** in the console (Part 4), or enable the Firebase Hosting API |
| Deploy fails with "firebase.json is out of date" | `src/lib/security/headers.ts` changed: run `npm run gen:hosting` and commit `firebase.json` |
| Sign-in on the custom domain fails with `redirect_uri_mismatch` | `NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS` lists a domain whose `/__/auth/handler` isn't an authorized redirect URI yet (Part 9, step 4) |
| An old App Hosting build fails after this change | Expected: `apphosting.yaml` is gone. Delete the App Hosting backend (Part 4, step 5) |
| A page shows an old version after a deploy | The service worker updates in the background; close and reopen the app (or wait for the "Update available" prompt). Pages themselves are never HTTP-cached |
| A deep link such as `/settings/` redirects to `/settings` | Expected: clean URLs without a trailing slash, as before |
| Google sign-in popup closes with `auth/unauthorized-domain` | Add the domain in Authentication → Settings → Authorized domains |
| Sync shows "permission denied" | Rules not deployed (Part 5) or App Check enforced before the site key was set |
| Paywall never appears | `NEXT_PUBLIC_PAYWALL_ENABLED` isn't `"1"` (intended default) |
| Stripe checkout spins forever | Extension not installed, webhook missing, or price id typo |
