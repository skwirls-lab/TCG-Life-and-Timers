"use client";
/**
 * /feedback (PRD §13.1-H): feedback form (SET-041), diagnostics with an exact preview (SET-042)
 * and Share the app (SET-040). Offline keeps the draft.
 */
import { Share2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button, ListRow, PageShell, SectionHeader, Segmented } from "@/components/ui";
import { startCloud } from "@/lib/account/cloud";
import { FEEDBACK_CATEGORIES, LIMITS, type FeedbackData } from "@/lib/firebase/docs";
import { buildDiagnostics, diagnosticsJson } from "@/lib/feedback/diagnostics";
import { shareApp, type ShareResult } from "@/lib/feedback/share";
import { CloudUnavailableError, OfflineError, submitFeedback } from "@/lib/feedback/submit";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t } from "@/lib/i18n";

type Category = FeedbackData["category"];
type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "offline" }
  | { kind: "unavailable" }
  | { kind: "failed"; error: string };

const inputCls =
  "min-h-12 w-full rounded-xl border border-border bg-bg px-3 py-2 text-lg text-fg outline-none focus:border-accent";

const SHARE_MESSAGES: Record<
  ShareResult,
  "account.feedback.shared" | "account.feedback.copied" | "account.feedback.shareFailed" | null
> = {
  shared: "account.feedback.shared",
  copied: "account.feedback.copied",
  failed: "account.feedback.shareFailed",
  cancelled: null,
};

export function FeedbackScreen() {
  const configured = isCloudConfigured();
  const [category, setCategory] = useState<Category>("bug");
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [withDiagnostics, setWithDiagnostics] = useState(false);
  const [includeNames, setIncludeNames] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const ids = { text: useId(), email: useId(), diag: useId(), names: useId(), hint: useId() };

  useEffect(() => {
    if (configured) void startCloud();
  }, [configured]);

  useEffect(() => {
    if (!withDiagnostics) return;
    let live = true;
    void buildDiagnostics({ includeNames }).then((d) => {
      if (live) setPreview(diagnosticsJson(d));
    });
    return () => {
      live = false;
    };
  }, [withDiagnostics, includeNames]);

  const canSend = text.trim().length > 0 && send.kind !== "sending";

  const onSubmit = async () => {
    setSend({ kind: "sending" });
    try {
      await submitFeedback({
        category,
        text,
        email,
        diagnostics: withDiagnostics && preview ? preview : undefined,
      });
      setSend({ kind: "sent" });
      setText("");
      setEmail("");
      setWithDiagnostics(false);
      setIncludeNames(false);
      setPreview(null);
    } catch (err) {
      if (err instanceof OfflineError) setSend({ kind: "offline" });
      else if (err instanceof CloudUnavailableError) setSend({ kind: "unavailable" });
      else setSend({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  };

  const status =
    send.kind === "sent"
      ? t("account.feedback.sent")
      : send.kind === "offline"
        ? t("account.feedback.offline")
        : send.kind === "unavailable"
          ? t("account.feedback.unavailable")
          : send.kind === "failed"
            ? t("account.feedback.failed", { error: send.error })
            : null;

  return (
    <PageShell title={t("account.feedback.title")} testId="feedback-page" backHref="/account">
      <form
        className="flex flex-col gap-4 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) void onSubmit();
        }}
      >
        <Segmented
          label={t("account.feedback.category")}
          value={category}
          onChange={setCategory}
          options={FEEDBACK_CATEGORIES.map((c) => ({
            value: c,
            label: t(`account.feedback.category.${c}`),
          }))}
          testId="feedback-category"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.text} className="text-fg-muted">
            {t("account.feedback.text")}
          </label>
          <textarea
            id={ids.text}
            value={text}
            maxLength={LIMITS.feedbackTextMax}
            rows={6}
            placeholder={t("account.feedback.textPlaceholder")}
            onChange={(e) => setText(e.target.value)}
            className={inputCls}
            data-testid="feedback-text"
          />
          <span className="self-end text-sm text-fg-muted">
            {t("account.feedback.chars", { count: text.length, max: LIMITS.feedbackTextMax })}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.email} className="text-fg-muted">
            {t("account.feedback.email")}
          </label>
          <input
            id={ids.email}
            type="email"
            value={email}
            maxLength={LIMITS.emailMax}
            autoComplete="email"
            aria-describedby={ids.hint}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            data-testid="feedback-email"
          />
          <span id={ids.hint} className="text-sm text-fg-muted">
            {t("account.feedback.emailHint")}
          </span>
        </div>
        <label htmlFor={ids.diag} className="flex min-h-12 items-center gap-3 text-lg">
          <input
            id={ids.diag}
            type="checkbox"
            className="size-6 accent-accent"
            checked={withDiagnostics}
            onChange={(e) => {
              setWithDiagnostics(e.target.checked);
              if (!e.target.checked) setPreview(null);
            }}
            data-testid="feedback-diagnostics"
          />
          {t("account.feedback.diagnostics")}
        </label>
        {withDiagnostics && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
            <p className="text-sm text-fg-muted">{t("account.feedback.diagnosticsHint")}</p>
            <label htmlFor={ids.names} className="flex min-h-12 items-center gap-3">
              <input
                id={ids.names}
                type="checkbox"
                className="size-6 accent-accent"
                checked={includeNames}
                onChange={(e) => setIncludeNames(e.target.checked)}
                data-testid="feedback-include-names"
              />
              {t("account.feedback.includeNames")}
            </label>
            <p className="text-sm text-fg-muted">{t("account.feedback.preview")}</p>
            <pre
              tabIndex={0}
              className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-2 text-xs text-fg"
              data-testid="feedback-diagnostics-preview"
            >
              {preview ?? "…"}
            </pre>
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!canSend || !configured || (withDiagnostics && !preview)}
          data-testid="feedback-send"
        >
          {send.kind === "sending" ? t("account.feedback.sending") : t("account.feedback.send")}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={send.kind === "sent" ? "text-success" : "text-fg-muted"}
          data-testid="feedback-status"
        >
          {!configured ? t("account.feedback.unavailable") : status}
        </p>
      </form>
      <SectionHeader title={t("account.section.support")} />
      <ListRow
        icon={<Share2 aria-hidden size={22} />}
        title={t("account.feedback.share")}
        subtitle={shareMsg ?? t("account.feedback.shareHint")}
        testId="feedback-share"
        onClick={() => {
          void shareApp({
            title: t("account.feedback.shareTitle"),
            text: t("account.feedback.shareText"),
          }).then((r) => {
            const key = SHARE_MESSAGES[r];
            setShareMsg(key ? t(key) : null);
          });
        }}
      />
    </PageShell>
  );
}
