"use client";
/**
 * About / credits (T5.6: ART-005, LEG-002, LEG-003, TOOL-013): version, Scryfall attribution,
 * the artists of the card art in use (active game + saved profiles and decks), icon credits,
 * the (draft) trademark disclaimer and links to the privacy policy and terms.
 */
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PageShell } from "@/components/ui";
import type { ArtRef } from "@/engine";
import { usePageBoot } from "@/features/app-effects/usePageBoot";
import { creditsFromArt } from "@/lib/art/picker";
import { appVersion } from "@/lib/feedback/version";
import { t } from "@/lib/i18n";
import { listDecks, listProfiles } from "@/lib/profiles/repo";
import { scryfallAttribution } from "@/lib/scryfall";
import { useGameValue } from "@/state/gameStore";

async function savedArt(): Promise<(ArtRef | undefined)[]> {
  const profiles = await listProfiles();
  const out: (ArtRef | undefined)[] = profiles.map((p) => p.art);
  for (const p of profiles) for (const d of await listDecks(p.id)) out.push(d.art);
  return out;
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4" data-testid={testId}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function AboutScreen() {
  usePageBoot();
  const gameArt = useGameValue((g) => g.seats.map((s) => s.art)) ?? [];
  const [saved, setSaved] = useState<(ArtRef | undefined)[]>([]);
  useEffect(() => {
    let live = true;
    void savedArt()
      .then((a) => live && setSaved(a))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const credits = creditsFromArt([...gameArt, ...saved]);
  const sf = scryfallAttribution(t("art.about.scryfall"));
  const version = appVersion();

  return (
    <PageShell title={t("art.about.title")} backHref="/settings" testId="about-page">
      <div className="flex flex-col gap-4 pt-4">
        <section className="flex flex-col items-center gap-1 py-2 text-center">
          <p className="text-2xl font-semibold">{t("art.about.app")}</p>
          <p className="text-fg-muted" data-testid="about-version">
            {t("art.about.version", { version })}
          </p>
        </section>

        <Section title={t("art.about.scryfallTitle")} testId="about-scryfall">
          <p className="text-sm">{sf.text}</p>
          <a
            href={sf.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-scryfall-link"
            className="inline-flex min-h-12 items-center gap-2 self-start rounded-xl px-1 font-medium text-accent underline"
          >
            {t("art.about.scryfallLink")}
            <ExternalLink aria-hidden size={16} />
          </a>
        </Section>

        <Section title={t("art.about.artistsTitle")} testId="about-artists">
          <p className="text-sm text-fg-muted">{t("art.about.artistsHelp")}</p>
          {credits.length === 0 ? (
            <p className="text-sm" data-testid="about-artists-none">
              {t("art.about.artistsNone")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {credits.map((c, i) => (
                <li key={c.artist} data-testid={`about-artist-${i}`} data-artist={c.artist}>
                  <p className="font-medium">{t("art.credit", { artist: c.artist })}</p>
                  <p className="text-sm text-fg-muted">{c.works.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("art.about.iconsTitle")} testId="about-icons">
          <p className="text-sm">{t("art.about.lucide")}</p>
          <p className="text-sm">{t("art.about.glyphs")}</p>
        </Section>

        <Section title={t("art.about.licenses")}>
          <p className="text-sm">{t("art.about.licensesText")}</p>
        </Section>

        <Section title={t("art.about.legalTitle")} testId="about-disclaimer">
          <p
            className="text-xs font-semibold uppercase tracking-wide text-warning"
            data-testid="about-draft"
          >
            {t("art.about.draft")}
          </p>
          <p className="text-sm">{t("art.about.disclaimer")}</p>
          <p className="text-sm">{t("art.about.fanContent")}</p>
        </Section>

        <nav className="flex flex-wrap gap-2" aria-label={t("art.about.legalTitle")}>
          <Link
            href="/privacy"
            data-testid="about-privacy"
            className="inline-flex min-h-12 items-center rounded-xl border border-border px-4 hover:bg-surface-2"
          >
            {t("art.about.privacy")}
          </Link>
          <Link
            href="/terms"
            data-testid="about-terms"
            className="inline-flex min-h-12 items-center rounded-xl border border-border px-4 hover:bg-surface-2"
          >
            {t("art.about.terms")}
          </Link>
        </nav>
      </div>
    </PageShell>
  );
}
