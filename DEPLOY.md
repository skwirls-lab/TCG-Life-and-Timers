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
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` / `_YEARLY` / `_LIFETIME` | Stripe price ids `price_…` (Part 7; the server's allowlist `STRIPE_PRICE_IDS` in `functions/.env` must list the same ids) | Only with payments |
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
5. **Moving from App Hosting** (the site used to run on Firebase App Hosting): this repo no longer has an `apphosting.yaml`, but an App Hosting backend keeps building every push to `main` until you delete it. Those builds now have no Firebase config and may fail outright (a static export has no server for App Hosting to run), so the old URL (and the custom domain while it still points there) can show a broken or outdated copy. That doesn't affect Hosting, but delete the backend once Hosting works: first move the custom domain (Part 9), then Console → **App Hosting** → your backend → **Settings → Delete backend**. Deleting it also stops its Cloud Run service and its billing.

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
   - Secret Manager Admin (the payment functions read the Stripe secrets; a deploy grants them access, Part 7)
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
     eventarc.googleapis.com pubsub.googleapis.com firebaseextensions.googleapis.com secretmanager.googleapis.com \
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
- `deleteUserData` (callable; "Delete account": cancels the user's Stripe subscriptions and deletes the Stripe customer first) and `onUserDeleted` (Auth cleanup, 1st gen; the same, best effort)
- `createCheckoutSession`, `createPortalSession`, `refreshEntitlements` (callables: buy Pro, "Manage subscription", "Restore purchases") and `stripeWebhook` (HTTPS endpoint for Stripe), Part 7
- (removed in 1.3.0: `syncEntitlementsOnSubscription` and `syncEntitlementsOnPayment`, which served the Stripe extension; the next deploy deletes them)
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

> **Before anything in this part:** the functions run as the default service accounts, which on secure-by-default Google Cloud organizations get **no** automatic Editor role. Grant them what the functions use, or every callable fails with `PERMISSION_DENIED` (Firestore) and the triggers fail too. In Cloud Shell, one command at a time:
> ```bash
> for SA in 726097197982-compute@developer.gserviceaccount.com tcgtempo@appspot.gserviceaccount.com; do
>   for ROLE in roles/datastore.user roles/firebaseauth.admin roles/storage.objectAdmin; do
>     gcloud projects add-iam-policy-binding tcgtempo --member=serviceAccount:$SA --role=$ROLE --condition=None >/dev/null && echo "ok $SA $ROLE"
>   done
> done
> ```
> (The compute account runs the 2nd-gen functions; the appspot account runs the 1st-gen `onUserDeleted`.)

Payments run on the app's **own** Cloud Functions (`functions/src/logic/billing.ts`). There is **no Firebase extension** to install: Firebase Extensions are deprecated and can't be installed, configured or updated after March 31, 2027. The functions keep the user ↔ Stripe customer link and the Pro status in Firestore, and every change is re-read from Stripe.

> ⚠️ **Do steps 2 and the first part of 5 (both secrets) before this version reaches `main`.** The functions declare the secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. A deploy while either one is missing **fails before anything is deployed** (Hosting included) with: `In non-interactive mode but have no value for the secret STRIPE_SECRET_KEY … Set this secret before deploying: firebase functions:secrets:set STRIPE_SECRET_KEY`. Setting them doesn't turn anything on for users: the paywall stays off until step 7.

1. **Stripe product and prices** ✅ done: product "TCGTempo Pro" with a monthly price ($1.99, `price_1UdwGcArytmUxb6t7Ik7ScRb`) and a yearly price ($19.99, `price_1UdwGcArytmUxb6tJrrS0mpq`). They are in `.env.production` (the buttons) and in `functions/.env` (`STRIPE_PRICE_IDS`, the server's allowlist: the functions refuse any other price). There is no lifetime plan; to add one later, create a one-time price and list it in **both** `LIFETIME_PRICE_IDS` (`functions/.env`) and `NEXT_PUBLIC_STRIPE_PRICE_LIFETIME` (`.env.production`). Only prices in `LIFETIME_PRICE_IDS` ever grant lifetime Pro.

2. **Give the functions a Stripe key** (Cloud Shell, the `>_` icon in the Google Cloud console):
   ```bash
   npx firebase-tools functions:secrets:set STRIPE_SECRET_KEY --project tcgtempo
   ```
   Paste the key at the prompt (it's hidden; never paste it in a chat, a file or a commit). If it asks to enable the Secret Manager API, say yes.
   Use a **restricted key**: Stripe → **Developers → API keys → Create restricted key** ("TCGTempo functions"), in Test mode first. Give it exactly these permissions and leave everything else at **None**:

   | Resource | Permission | Used for |
   |---|---|---|
   | Customers | **Write** | create the buyer's customer, read it, delete it when the account is deleted |
   | Checkout Sessions | **Write** | start Checkout |
   | Subscriptions | **Write** | read the current subscriptions; cancel them when the account is deleted |
   | Customer portal (Billing portal) | **Write** | "Manage subscription" |
   | Prices | **Read** | check a price is active and recurring / one-time before Checkout |
   | PaymentIntents | **Read** | lifetime purchases only (read when `LIFETIME_PRICE_IDS` is set) |
   | Charges | **Read** | refunds and disputes (the charge of a dispute; refund amounts) |

   Webhook signature checks happen locally and need no permission. If you turn on Stripe Tax (step 8) and Checkout reports a missing permission, add the one it names.
   Then create the **webhook secret** with a placeholder for now (step 5 replaces it with the real one), so the next deploy has both secrets:
   ```bash
   npx firebase-tools functions:secrets:set STRIPE_WEBHOOK_SECRET --project tcgtempo
   ```
   Type `whsec_placeholder` at the prompt. Until the real secret is set, the webhook rejects every request (HTTP 400), which is safe.
   **The deployer needs one more role:** Google Cloud console → **IAM** → `github-deployer@tcgtempo.iam.gserviceaccount.com` → add **Secret Manager Admin** (a deploy grants the functions' runtime account access to each secret). Or in Cloud Shell:
   ```bash
   gcloud projects add-iam-policy-binding tcgtempo --member="serviceAccount:github-deployer@tcgtempo.iam.gserviceaccount.com" --role=roles/secretmanager.admin --condition=None
   ```

3. **Deploy**: push to `main` (or Actions → **Deploy** → **Run workflow**). This deploys `createCheckoutSession`, `createPortalSession`, `refreshEntitlements` and `stripeWebhook`, and **deletes** the old `syncEntitlementsOnSubscription` and `syncEntitlementsOnPayment` functions (nothing writes their documents any more; the workflow passes `--force`, which a non-interactive deploy needs to delete functions).
   Optional but recommended, once (Cloud Shell): let Firestore expire the webhook bookkeeping after 30 days:
   ```bash
   gcloud firestore fields ttls update expireAt --collection-group=stripeEvents --enable-ttl --project=tcgtempo
   ```

4. **Webhook endpoint**: Stripe → **Developers → Webhooks → Add endpoint** (in Test mode first).
   - **Endpoint URL**: the `stripeWebhook` function's URL. Find it in the Firebase console → **Functions** → the `stripeWebhook` row (the URL under "Trigger"), or in the deploy log line `Function URL (stripeWebhook(us-central1)): …`. It looks like `https://stripewebhook-<random>-uc.a.run.app`; `https://us-central1-tcgtempo.cloudfunctions.net/stripeWebhook` points at the same function and works too. Use one of them.
   - **API version**: the newest offered (the functions pin `2026-11-18.endive` for their own calls and re-read everything from Stripe, so the payload version doesn't matter).
   - **Events to send** (exactly these 11):
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.paused`
     - `customer.subscription.resumed`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `charge.refunded`
     - `charge.dispute.created`
   - Save, then **Reveal** the **Signing secret** (`whsec_…`) and copy it.

5. **Set the real webhook secret, then redeploy** (a deploy picks up the new secret version):
   ```bash
   npx firebase-tools functions:secrets:set STRIPE_WEBHOOK_SECRET --project tcgtempo
   ```
   Paste the `whsec_…` value, then push to `main` or run the **Deploy** workflow. Check: Stripe → the webhook → **Send test event** → `invoice.paid` answers **200** (unknown customers are acknowledged and ignored). A 400 means the secret doesn't match.

6. **Stripe settings** (dashboard):
   - **Settings → Billing → Customer portal**: activate the portal. Allow customers to **cancel** subscriptions, to **switch plans** (add the product with both prices, monthly ↔ yearly), and to update payment methods; show invoice history. Fill in the **business information** (name, support email/URL, privacy policy `https://tcgtempo.skwirls.com/privacy`, terms `https://tcgtempo.skwirls.com/terms`).
   - **Settings → Customer emails**: turn on **successful payments** (receipts) and **refunds**.
   - **Settings → Billing → Subscriptions and emails**: turn on **Smart Retries** for failed payments, and the emails for failed payments and expiring cards. A failed renewal makes the subscription `past_due`: the app treats that as **not Pro** until the payment succeeds (then Pro comes back by itself), and "Choose a plan" opens the portal instead of a second subscription.

7. **Test, then go live.**
   1. **Test mode** (the steps above use test keys and test prices): on the live site open `https://tcgtempo.skwirls.com/pro` (the plans can be bought even while the paywall is off), sign in with Google, choose Monthly and pay with card `4242 4242 4242 4242`, any future date, any CVC. You land on `/pro?checkout=success…`, which says "Payment received, activating Pro…" and then "Pro is active". **Manage subscription** opens the Stripe portal; cancel there and Pro turns off when the subscription ends. **Restore purchases** (Account and /pro) re-reads Stripe. Test prices must be in `STRIPE_PRICE_IDS` and `.env.production` while you test in test mode.
   2. **Turn the paywall on, in BOTH places** (they must agree):
      - `.env.production`: `NEXT_PUBLIC_PAYWALL_ENABLED=1`, push to `main`.
      - Firestore console → document **`config/billing`** with field `paywallEnabled` (boolean) = `true`. Clients can't write it; while it's absent the server allows everything.
      Then the server enforces Pro for cloud history sync, share links and the image quota (free 5 / Pro 200).
   3. **Live mode**: in Stripe switch to **Live**, create (or copy to live) the product and its two prices, and note the **live** price ids. Then:
      - **Client**: `.env.production` → `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` / `NEXT_PUBLIC_STRIPE_PRICE_YEARLY` = the live ids (and the display prices).
      - **Server**: `functions/.env` → `STRIPE_PRICE_IDS=<live monthly>,<live yearly>` (comma-separated; this is the allowlist, so a price missing here is refused with "Unknown price").
      - Create a **live** restricted key with the same permissions as step 2 and set it: `npx firebase-tools functions:secrets:set STRIPE_SECRET_KEY --project tcgtempo`.
      - Add the same webhook endpoint in **Live** mode (step 4) and set its signing secret (step 5).
      - Commit the two env files and push to `main` (this redeploys with the new secrets too).
      Accounts that bought in test mode keep a test-mode customer id; their next checkout creates a live customer automatically.

8. **Stripe Tax (optional, owner decision)**: set up Stripe Tax in the dashboard (**Settings → Tax**: origin address, registrations, product tax code), then set `STRIPE_AUTOMATIC_TAX=true` in `functions/.env` and push. Checkout then calculates tax (`automatic_tax`) and saves the address the buyer enters on their customer. Leave it `false` until you have decided where you must collect tax.

9. Legal: before charging money, have someone review `/terms`, `/privacy`, the trademark disclaimer, and WotC's Fan Content Policy (PRD §17.1, Q7). Pro features are deliberately game-agnostic, and Scryfall art is never paywalled.
   - **Placeholder banners to remove after review** (they are shown to users on purpose until then):
     - `/privacy` and `/terms`: "Draft — requires owner/legal review" (`legal.draft` in `src/i18n/en/legal.json`, rendered by `src/features/legal/LegalDocument.tsx`; texts in `src/features/legal/content/en.json`).
     - `/about`: "Draft legal text, pending review" (`art.about.draft` in `src/i18n/en/art.json`, rendered by `src/features/art/AboutScreen.tsx`).
   - Rule values marked `verify` (docs/RULES-TO-VERIFY.md) show a "needs checking" hint only in dev/test builds; set `NEXT_PUBLIC_SHOW_VERIFY=1` to see them in a production build while you check.

**How Pro is decided** (`functions/src/logic/entitlements.ts`): an `active` or `trialing` subscription is Pro; `past_due`, `unpaid`, `paused`, `incomplete` and `canceled` are not. A one-time payment grants lifetime Pro only for a price in `LIFETIME_PRICE_IDS`, and a full refund or any dispute revokes it. An owner-granted comp (`users/{uid}/private/entitlements` with `source: "manual"`, set in the console) is never revoked by Stripe. **Refunds and disputes need nothing by hand**: the webhook re-reads the payment and recomputes. **Deleting an account** cancels its subscriptions immediately and deletes the Stripe customer first; if Stripe refuses, nothing is deleted and the user is asked to try again.

**Where things live**: `users/{uid}/private/stripe` `{customerId}` (server-only), `users/{uid}/private/entitlements` `{pro, source, updatedAt}` (the owner can read it), `stripeEvents/{eventId}` (server-only webhook log, expires after 30 days with the TTL policy).

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
| Deploy fails with "no value for the secret STRIPE_SECRET_KEY" (or `STRIPE_WEBHOOK_SECRET`) | Set both secrets (Part 7, step 2); nothing deploys until they exist |
| Deploy fails with a Secret Manager permission error | Give `github-deployer` the **Secret Manager Admin** role (Part 7, step 2) |
| "Checkout could not start: Unknown price" | The price id in `.env.production` isn't in `STRIPE_PRICE_IDS` (`functions/.env`), e.g. test vs live ids |
| "Payments are unavailable right now" | The functions couldn't reach Stripe: check the key in Secret Manager (test vs live, restricted-key permissions) and the function logs |
| Paid, but the Pro page keeps saying "Taking longer than usual" | Webhook missing or its secret wrong (Stripe → Webhooks shows failed deliveries); **Restore purchases** re-reads Stripe meanwhile |
