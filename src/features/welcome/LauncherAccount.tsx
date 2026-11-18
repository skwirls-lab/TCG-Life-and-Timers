"use client";
/**
 * Launcher account area (sign-in first): the first-visit welcome screen, then an always-visible
 * "Sign in to sync" entry while signed out, and the guest → account merge prompt. Loaded lazily by
 * the launcher, and only on deployments with cloud config, so guests on other deployments (and
 * the board) never pay for it.
 *
 * It reuses the one sign-in path: `signInWithGoogle` from the auth store, with `startCloud`
 * running the first-sign-in merge (AUTH-003) exactly as on the Account page.
 */
import { Cloud, CloudCheck, LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MergePrompt } from "@/features/account/MergePrompt";
import { startCloud } from "@/lib/account/cloud";
import { signInWithGoogle, useAuth } from "@/lib/auth/store";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t } from "@/lib/i18n";
import {
  launcherAccountView,
  readWelcomeChoice,
  writeWelcomeChoice,
  type WelcomeChoice,
} from "./welcomeChoice";
import { WelcomeScreen } from "./WelcomeScreen";

const chip =
  "inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function LauncherAccount() {
  const { status, user, error, initialized } = useAuth();
  const [choice, setChoice] = useState<WelcomeChoice | null>(() => readWelcomeChoice());
  const signedIn = !!user && !user.isAnonymous;
  const view = launcherAccountView({
    cloudConfigured: isCloudConfigured(),
    authInitialized: initialized,
    signedIn,
    choice,
  });

  // Start auth now (the app-wide start waits 1.5 s): the welcome must know whether this is a
  // returning signed-in user before it can show. Idempotent.
  useEffect(() => {
    void startCloud().catch((e: unknown) => console.warn("[cloud] start failed", e));
  }, []);

  // A Google sign-in on this device answers the welcome for good (it won't return after sign-out).
  // (Storage only: the view already follows `signedIn`; the launcher re-reads it when it mounts.)
  useEffect(() => {
    if (signedIn && choice === null) writeWelcomeChoice("google");
  }, [signedIn, choice]);

  const busy = status === "signingIn";
  const google = () => void signInWithGoogle();

  return (
    <div className="flex flex-col gap-2" data-testid="launcher-account" data-view={view}>
      {view === "welcome" && (
        <WelcomeScreen
          busy={busy}
          error={error}
          onGoogle={google}
          onGuest={() => {
            writeWelcomeChoice("guest");
            setChoice("guest");
          }}
        />
      )}
      <div className="flex min-h-12 justify-center">
        {view === "signIn" && (
          <button
            type="button"
            onClick={google}
            disabled={busy}
            data-testid="launcher-signin"
            className={`${chip} bg-accent/15 text-fg ring-1 ring-accent/50 hover:bg-accent/25 disabled:opacity-60`}
          >
            {busy ? (
              <LogIn aria-hidden size={20} className="text-accent" />
            ) : (
              <Cloud aria-hidden size={20} className="text-accent" />
            )}
            {busy ? t("account.signingIn") : t("brand.launcher.signIn")}
          </button>
        )}
        {view === "signedIn" && (
          <Link
            href="/account"
            data-testid="launcher-account-link"
            className={`${chip} text-fg-muted hover:bg-surface`}
          >
            <CloudCheck aria-hidden size={20} className="text-success" />
            {t("brand.launcher.signedIn")}
          </Link>
        )}
      </div>
      {error && view === "signIn" && (
        <p
          role="alert"
          className="text-center text-sm text-danger"
          data-testid="launcher-signin-error"
        >
          {t("account.error", { code: error })}
        </p>
      )}
      <MergePrompt />
    </div>
  );
}
