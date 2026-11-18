"use client";
/**
 * AUTH-003 guest → account merge choice. Shown wherever a Google sign-in can start (the Account
 * page and the launcher), so a first sign-in never waits on a prompt the user can't see.
 */
import { useId } from "react";
import { Button } from "@/components/ui";
import { resolveMerge, useCloud } from "@/lib/account/cloud";
import { t } from "@/lib/i18n";

export function MergePrompt() {
  const plan = useCloud((s) => s.mergePrompt);
  const titleId = useId();
  if (!plan) return null;
  return (
    <section
      aria-labelledby={titleId}
      className="mt-4 flex flex-col gap-3 rounded-xl border border-accent/50 bg-surface p-4"
      data-testid="account-merge"
    >
      <h2 id={titleId} className="text-xl">
        {t("account.merge.title")}
      </h2>
      <p className="text-fg-muted">
        {t("account.merge.body", { local: plan.counts.local, remote: plan.counts.remote })}
      </p>
      <Button
        variant="primary"
        size="lg"
        onClick={() => resolveMerge("merge")}
        data-testid="account-merge-merge"
      >
        {t("account.merge.merge")}
      </Button>
      <p className="text-sm text-fg-muted">{t("account.merge.mergeHint")}</p>
      <Button
        variant="outline"
        onClick={() => resolveMerge("cloudOnly")}
        data-testid="account-merge-cloud"
      >
        {t("account.merge.cloudOnly")}
      </Button>
      <p className="text-sm text-fg-muted">{t("account.merge.cloudOnlyHint")}</p>
    </section>
  );
}
