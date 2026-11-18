"use client";
/**
 * First-visit welcome on the launcher: brand, value prop, Continue with Google (primary) and
 * Continue without an account (secondary, with what that means). Full-screen and above the
 * consent banner, so the two first-run questions come one at a time.
 */
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { AppMark } from "@/components/brand/AppMark";
import { Button } from "@/components/ui";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";

export interface WelcomeScreenProps {
  busy: boolean;
  error: string | null;
  onGoogle: () => void;
  onGuest: () => void;
}

export function WelcomeScreen({ busy, error, onGoogle, onGuest }: WelcomeScreenProps) {
  const titleId = useId();
  const noteId = useId();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const h = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(h);
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="welcome"
      className={cn(
        "fixed inset-0 z-[70] overflow-y-auto bg-bg transition-opacity duration-200 safe-area",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 text-center landscape:max-w-2xl landscape:flex-row landscape:gap-10 landscape:text-left">
        <div className="flex flex-col items-center gap-3 landscape:flex-1">
          <AppMark size={104} />
          <h1 id={titleId} className="text-4xl font-semibold tracking-tight">
            {t("app.name")}
          </h1>
          <p className="text-lg text-fg-muted landscape:text-center">
            {t("brand.welcome.valueProp")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 landscape:flex-1">
          <Button
            variant="primary"
            size="lg"
            block
            autoFocus
            icon={<LogIn aria-hidden size={22} />}
            disabled={busy}
            onClick={onGoogle}
            data-testid="welcome-google"
          >
            {busy ? t("account.signingIn") : t("brand.welcome.google")}
          </Button>
          <p className="text-sm text-fg-muted">{t("brand.welcome.googleHint")}</p>
          {error && (
            <p role="alert" className="text-danger" data-testid="welcome-error">
              {t("account.error", { code: error })}
            </p>
          )}
          <Button
            variant="outline"
            size="lg"
            block
            disabled={busy}
            onClick={onGuest}
            aria-describedby={noteId}
            data-testid="welcome-guest"
            className="mt-3"
          >
            {t("brand.welcome.guest")}
          </Button>
          <p id={noteId} className="text-sm text-fg-muted" data-testid="welcome-guest-note">
            {t("brand.welcome.guestNote")}
          </p>
          <Link
            href="/privacy"
            className="inline-flex min-h-12 items-center justify-center self-center text-sm text-fg-muted underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t("brand.welcome.privacy")}
          </Link>
        </div>
      </div>
    </div>
  );
}
