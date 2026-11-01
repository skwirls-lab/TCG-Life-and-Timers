"use client";
/**
 * Preset picker (PRE-003, PRE-012): search, Favorites, Recent, then every preset grouped by game.
 * Each row shows the rules quick-ref line, a "verify" hint when a rule value is unverified, and a
 * link to the official rules. Recent / favorites are device-level (Dexie kv).
 */
import { Check, ExternalLink, Search, Star, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { Preset } from "@/engine";
import { GameIcon } from "@/components/icons/GameIcon";
import { IconButton } from "@/components/ui";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { hasUnverifiedValues, listBuiltInPresets } from "@/presets";
import { groupByGame, resolveIds, searchPresets, slug } from "./model";
import { usePresetPrefs } from "./usePresetPrefs";

export interface PresetPickerProps {
  /** Selected preset id. */
  value?: string;
  onChange: (presetId: string, preset: Preset) => void;
  /** Defaults to the visible built-in presets. */
  presets?: readonly Preset[];
  /** Push the chosen preset to "Recent" on select (default true). */
  recordRecent?: boolean;
  testId?: string;
}

export function PresetPicker({
  value,
  onChange,
  presets,
  recordRecent = true,
  testId = "preset-picker",
}: PresetPickerProps) {
  const all = useMemo(() => presets ?? listBuiltInPresets(), [presets]);
  const [query, setQuery] = useState("");
  const prefs = usePresetPrefs();
  const searchId = useId();
  const results = useMemo(() => searchPresets(all, query), [all, query]);
  const groups = useMemo(() => groupByGame(results), [results]);
  const searching = query.trim().length > 0;
  const favorites = resolveIds(prefs.favorites, all);
  const recent = resolveIds(prefs.recent, all);

  const select = (p: Preset) => {
    if (recordRecent) prefs.addRecent(p.id);
    onChange(p.id, p);
  };
  const row = (p: Preset) => (
    <PresetRow
      key={p.id}
      preset={p}
      selected={p.id === value}
      favorite={prefs.favorites.includes(p.id)}
      onSelect={() => select(p)}
      onToggleFavorite={() => prefs.toggleFavorite(p.id)}
    />
  );

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testId}
      data-loaded={String(prefs.loaded)}
      data-saved={String(prefs.saved)}
    >
      <label htmlFor={searchId} className="sr-only">
        {t("presets.picker.search")}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
        <Search aria-hidden size={20} className="text-fg-muted" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("presets.picker.search")}
          className="min-h-12 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-fg-muted"
          data-testid="preset-search"
          autoComplete="off"
        />
      </div>

      {!searching && favorites.length > 0 && (
        <Group title={t("presets.picker.favorites")} id="favorites">
          {favorites.map(row)}
        </Group>
      )}
      {!searching && recent.length > 0 && (
        <Group title={t("presets.picker.recent")} id="recent">
          {recent.map(row)}
        </Group>
      )}
      {groups.map((g) => (
        <Group key={g.game} title={g.game} id={`game-${slug(g.game)}`}>
          {g.presets.map(row)}
        </Group>
      ))}
      {results.length === 0 && (
        <p className="py-6 text-center text-fg-muted" data-testid="preset-no-results">
          {t("presets.picker.noResults", { query: query.trim() })}
        </p>
      )}
      <p className="pt-2 text-xs text-fg-muted">{t("presets.disclaimer")}</p>
    </div>
  );
}

function Group({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid={`preset-section-${id}`} className="mt-3">
      <h3
        id={headingId}
        className="mb-1 text-sm font-semibold uppercase tracking-wide text-fg-muted"
      >
        {title}
      </h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

interface RowProps {
  preset: Preset;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

function PresetRow({ preset: p, selected, favorite, onSelect, onToggleFavorite }: RowProps) {
  const primary = p.counters.find((c) => c.isPrimary);
  const unverified = hasUnverifiedValues(p);
  const players =
    p.minPlayers === p.maxPlayers
      ? t("presets.picker.playersFixed", { min: p.minPlayers })
      : t("presets.picker.players", { min: p.minPlayers, max: p.maxPlayers });
  return (
    <li
      data-testid={`preset-row-${p.id}`}
      data-selected={String(selected)}
      className={cn(
        "flex items-start gap-1 rounded-2xl border bg-surface p-1",
        selected ? "border-accent ring-2 ring-accent" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-testid={`preset-select-${p.id}`}
        className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-xl p-2 text-left hover:bg-surface-2"
      >
        <span className="mt-1 shrink-0 text-fg-muted">
          <GameIcon id={primary?.icon ?? "heart"} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-lg leading-tight text-fg">
            <span className="truncate">{p.name}</span>
            {selected && (
              <>
                <Check aria-hidden size={18} className="shrink-0 text-accent" />
                <span className="sr-only">{t("presets.picker.selected")}</span>
              </>
            )}
          </span>
          <span className="text-sm text-fg-muted">
            {p.format ? `${p.format} · ${players}` : players}
          </span>
          <span className="text-sm leading-snug text-fg" data-testid={`preset-summary-${p.id}`}>
            {p.rulesSummary}
          </span>
          {unverified && (
            <span
              className="flex items-center gap-1 text-xs text-warning"
              data-testid={`preset-verify-${p.id}`}
            >
              <TriangleAlert aria-hidden size={14} />
              {t("presets.picker.verify")}
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-center">
        <IconButton
          label={t(favorite ? "presets.picker.unfavorite" : "presets.picker.favorite", {
            name: p.name,
          })}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          tone={favorite ? "accent" : "default"}
          data-testid={`preset-fav-${p.id}`}
        >
          <Star aria-hidden size={22} fill={favorite ? "currentColor" : "none"} />
        </IconButton>
        {p.rulesUrl && (
          <a
            href={p.rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("presets.picker.rulesFor", { name: p.name })}
            title={t("presets.picker.rules")}
            data-testid={`preset-rules-${p.id}`}
            className="inline-flex size-12 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-2"
          >
            <ExternalLink aria-hidden size={20} />
          </a>
        )}
      </div>
    </li>
  );
}
