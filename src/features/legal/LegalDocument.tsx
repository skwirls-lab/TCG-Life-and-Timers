/**
 * /privacy and /terms body (LEG-001, LEG-002, LEG-006). A server component: the text is rendered
 * at build time. The draft banner stays until the owner's legal review replaces the template.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "@/components/ui";
import { t } from "@/lib/i18n";
import { POLICY_UPDATED, policy, type PolicyKind } from "./policy";

const linkClass =
  "inline-flex min-h-12 items-center rounded-xl px-1 font-medium text-accent underline";

export function LegalDocument({ kind, children }: { kind: PolicyKind; children?: ReactNode }) {
  const doc = policy(kind);
  const title = kind === "privacy" ? t("legal.privacy.title") : t("legal.terms.title");
  return (
    <PageShell title={title} backHref="/about" testId={`legal-${kind}`}>
      <article className="flex flex-col gap-4 pt-4">
        <p
          role="note"
          data-testid="legal-draft"
          className="rounded-2xl border border-warning/50 bg-warning/10 p-3 text-sm font-semibold text-warning"
        >
          {t("legal.draft")}
        </p>
        <p className="text-sm text-fg-muted">{t("legal.updated", { date: POLICY_UPDATED })}</p>
        <p>{doc.intro}</p>
        {doc.sections.map((s) => (
          <section
            key={s.id}
            id={s.id}
            data-testid={`legal-section-${s.id}`}
            className="flex flex-col gap-2 rounded-2xl bg-surface p-4"
          >
            <h2 className="text-lg font-semibold">{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {p}
              </p>
            ))}
            {s.id === "analytics" ? children : null}
          </section>
        ))}
        <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-2" data-testid="legal-links">
          <Link href="/about" className={linkClass} data-testid="legal-about-link">
            {t("legal.about")}
          </Link>
          {kind === "privacy" ? (
            <Link href="/terms" className={linkClass}>
              {t("legal.termsLink")}
            </Link>
          ) : (
            <Link href="/privacy" className={linkClass}>
              {t("legal.privacyLink")}
            </Link>
          )}
        </nav>
      </article>
    </PageShell>
  );
}
