"use client";
/**
 * /account (PRD §13.1-G): sign in with Google (optional), sync status, sign out with "Remove my
 * data from this device", export, delete account, feedback link. Works without cloud config.
 */
import {
  ChevronRight,
  CloudOff,
  Download,
  LogIn,
  LogOut,
  MessageSquare,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Button, ListRow, PageShell, SectionHeader } from "@/components/ui";
import { startCloud, deleteMyAccount } from "@/lib/account/cloud";
import { downloadExport } from "@/lib/account/export";
import { useEntitlements } from "@/lib/entitlements/store";
import { signInWithGoogle, signOut, useAuth } from "@/lib/auth/store";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t } from "@/lib/i18n";
import { describeSyncStatus, useSyncStatus } from "@/lib/sync/status";
import { MergePrompt } from "./MergePrompt";

export function AccountScreen() {
  const configured = isCloudConfigured();
  const { status, user, error, initialized } = useAuth();
  useEffect(() => {
    void startCloud();
  }, []);
  const google = user && !user.isAnonymous ? user : null;

  return (
    <PageShell title={t("account.title")} testId="account-page" backHref="/">
      <SectionHeader title={t("account.section.account")} />
      {!configured ? (
        <p
          className="flex items-start gap-3 rounded-xl bg-surface p-4 text-fg-muted"
          data-testid="account-unconfigured"
        >
          <CloudOff aria-hidden className="mt-0.5 shrink-0" size={22} />
          <span>{t("account.unconfigured")}</span>
        </p>
      ) : google ? (
        <SignedIn email={google.email} displayName={google.displayName} />
      ) : (
        <SignedOut busy={status === "signingIn" || !initialized} anonymous={!!user} />
      )}
      {error && configured && (
        <p role="alert" className="mt-2 text-danger" data-testid="account-error">
          {t("account.error", { code: error })}
        </p>
      )}
      <MergePrompt />
      <DataSection />
      <SectionHeader title={t("account.section.support")} />
      <Link
        href="/feedback"
        className="flex min-h-16 items-center gap-3 rounded-xl py-2 hover:bg-surface/60"
        data-testid="account-feedback-link"
      >
        <span className="flex size-8 items-center justify-center text-fg-muted">
          <MessageSquare aria-hidden size={22} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg leading-tight">{t("account.feedbackLink")}</span>
          <span className="text-sm text-fg-muted">{t("account.feedbackLinkHint")}</span>
        </span>
        <ChevronRight aria-hidden className="text-fg-muted" />
      </Link>
    </PageShell>
  );
}

function SignedOut({ busy, anonymous }: { busy: boolean; anonymous: boolean }) {
  return (
    <div className="flex flex-col gap-3 py-2" data-testid="account-signed-out">
      <p className="text-fg-muted">{t("account.signInExplain")}</p>
      {anonymous && <p className="text-fg-muted">{t("account.guestNote")}</p>}
      <Button
        variant="primary"
        size="lg"
        icon={<LogIn aria-hidden size={22} />}
        disabled={busy}
        onClick={() => void signInWithGoogle()}
        data-testid="account-signin"
      >
        {busy ? t("account.signingIn") : t("account.signIn")}
      </Button>
    </div>
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(h);
  }, [intervalMs]);
  return now;
}

function SyncLine() {
  const s = useSyncStatus();
  const now = useNow(30_000);
  const line = describeSyncStatus(s, now);
  const text =
    line.key === "account.sync.synced"
      ? t(line.key, { minutes: line.minutes })
      : line.key === "account.sync.error"
        ? t(line.key, { error: line.error })
        : t(line.key);
  return (
    <ListRow
      title={t("account.sync.title")}
      subtitle={text}
      testId="account-sync-status"
      className={s.state === "error" ? "text-danger" : undefined}
    />
  );
}

function SignedIn({ email, displayName }: { email: string | null; displayName: string | null }) {
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();
  const [confirming, setConfirming] = useState(false);
  const [removeData, setRemoveData] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useSyncStatus((s) => s.pending);
  const checkId = useId();
  return (
    <div className="flex flex-col gap-1" data-testid="account-signed-in">
      <div className="flex min-h-16 items-center gap-3 py-2">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-fg"
        >
          {initial}
        </span>
        <span className="flex min-w-0 flex-col">
          {displayName && <span className="truncate text-lg">{displayName}</span>}
          <span className="truncate text-fg-muted" data-testid="account-email">
            {email ? t("account.signedInAs", { email }) : t("account.noEmail")}
          </span>
        </span>
      </div>
      <SyncLine />
      {!confirming ? (
        <Button
          variant="outline"
          icon={<LogOut aria-hidden size={20} />}
          onClick={() => setConfirming(true)}
          data-testid="account-signout"
        >
          {t("account.signOut")}
        </Button>
      ) : (
        <div
          className="flex flex-col gap-3 rounded-xl bg-surface p-4"
          data-testid="account-signout-panel"
        >
          <label htmlFor={checkId} className="flex min-h-12 items-center gap-3 text-lg">
            <input
              id={checkId}
              type="checkbox"
              className="size-6 accent-accent"
              checked={removeData}
              onChange={(e) => setRemoveData(e.target.checked)}
              data-testid="account-signout-remove"
            />
            {t("account.signOut.removeData")}
          </label>
          <p className="text-sm text-fg-muted">{t("account.signOut.removeDataHint")}</p>
          {removeData && pending > 0 && (
            <p className="text-sm text-warning">{t("account.signOut.pending")}</p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)} block>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              block
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void signOut({ removeLocalData: removeData }).finally(() => {
                  setBusy(false);
                  setConfirming(false);
                  setRemoveData(false);
                });
              }}
              data-testid="account-signout-confirm"
            >
              {t("account.signOut.confirm")}
            </Button>
          </div>
        </div>
      )}
      <DeleteAccount />
    </div>
  );
}

/** B-3: a Pro user is told to cancel the subscription first, with a link to the portal. */
export function SubscriptionWarning() {
  const pro = useEntitlements((s) => s.pro);
  if (!pro) return null;
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-xl border border-warning/50 p-3"
      data-testid="account-delete-subscription"
    >
      <p className="text-sm">{t("account.delete.subscription")}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void import("@/lib/entitlements/checkout").then((m) => m.openBillingPortal());
        }}
        data-testid="account-delete-manage"
      >
        {t("account.delete.manage")}
      </Button>
    </div>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const inputId = useId();
  const word = t("account.delete.word");
  return (
    <div className="mt-4">
      {!open ? (
        <Button
          variant="danger"
          icon={<Trash2 aria-hidden size={20} />}
          onClick={() => setOpen(true)}
          data-testid="account-delete"
          block
        >
          {t("account.delete")}
        </Button>
      ) : (
        <div
          className="flex flex-col gap-3 rounded-xl border border-danger/40 p-4"
          data-testid="account-delete-panel"
        >
          <p className="text-fg">{t("account.delete.hint")}</p>
          <SubscriptionWarning />
          <label htmlFor={inputId} className="text-sm text-fg-muted">
            {t("account.delete.typeToConfirm")}
          </label>
          <input
            id={inputId}
            value={typed}
            autoComplete="off"
            autoCapitalize="characters"
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-12 rounded-xl border border-border bg-bg px-3 text-lg outline-none focus:border-danger"
            data-testid="account-delete-input"
          />
          {state.error && (
            <p role="alert" className="text-danger">
              {t("account.delete.failed", { error: state.error })}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              block
              disabled={typed.trim() !== word || state.busy}
              onClick={() => {
                setState({ busy: true, error: null });
                deleteMyAccount().then(
                  () => setState({ busy: false, error: null }),
                  (err: unknown) =>
                    setState({
                      busy: false,
                      error: err instanceof Error ? err.message : String(err),
                    }),
                );
              }}
              data-testid="account-delete-confirm"
            >
              {state.busy ? t("account.delete.working") : t("account.delete.confirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DataSection() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <SectionHeader title={t("account.section.data")} />
      <ListRow
        icon={<Download aria-hidden size={22} />}
        title={t("account.export")}
        subtitle={msg ?? t("account.export.hint")}
        testId="account-export"
        onClick={() => {
          downloadExport().then(
            (file) => setMsg(t("account.export.done", { file })),
            () => setMsg(t("account.export.failed")),
          );
        }}
      />
    </>
  );
}
