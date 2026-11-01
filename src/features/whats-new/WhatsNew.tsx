/**
 * What's new (SET-043): the release notes from CHANGELOG.md. A server component; the changelog is
 * read and parsed at build time (the route is static), so no markdown parser ships to the client.
 */
import { PageShell } from "@/components/ui";
import { appVersion } from "@/lib/feedback/version";
import { t } from "@/lib/i18n";
import type { ChangelogRelease } from "./changelog";

export function WhatsNew({ releases }: { releases: ChangelogRelease[] }) {
  const version = appVersion();
  return (
    <PageShell title={t("whatsnew.title")} backHref="/settings" testId="whats-new">
      <div className="flex flex-col gap-4 pt-4">
        <p className="text-sm text-fg-muted" data-testid="whats-new-installed">
          {t("whatsnew.current", { version })}
        </p>
        {releases.length === 0 ? <p>{t("whatsnew.empty")}</p> : null}
        {releases.map((r) => (
          <article
            key={r.version}
            data-testid={`release-${r.version}`}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-4"
          >
            <h2 className="text-xl font-semibold">
              {t("whatsnew.version", { version: r.version })}
              {r.date ? <span className="ml-2 text-sm text-fg-muted">{r.date}</span> : null}
            </h2>
            {r.groups.map((g, gi) => (
              <section key={gi} className="flex flex-col gap-1">
                {g.title ? <h3 className="font-semibold">{g.title}</h3> : null}
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {g.items.map((item, ii) => (
                    <li key={ii}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        ))}
      </div>
    </PageShell>
  );
}
