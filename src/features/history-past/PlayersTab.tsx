"use client";
/**
 * HIST-021 Players list (W/L, win %) and player detail; HIST-033 identities (default names
 * hidden unless toggled); HIST-034 merge / rename / link to profile with Undo.
 */
import { useEffect, useState } from "react";
import { ChevronRight, MoreVertical, Skull, UserRound } from "lucide-react";
import { Button, Sheet, Toggle, useSnackbar } from "@/components/ui";
import { useHold } from "@/lib/hooks/useHold";
import { t, tp } from "@/lib/i18n";
import { listProfiles } from "@/lib/profiles/repo";
import type { PlayerProfile } from "@/lib/profiles/types";
import {
  linkIdentityToProfile,
  mergeIdentities,
  renameIdentity,
  type GameRecord,
  type IdentityChange,
} from "@/lib/records";
import { playerDetail, playerRows, type IdentityRow, type StatsOptions } from "@/lib/stats";
import { causeText, durationText, pctText } from "./format";
import { BackButton, BucketRow, Card, Empty, Locked, Section } from "./parts";

function PlayerRow({
  row,
  onOpen,
  onActions,
}: {
  row: IdentityRow;
  onOpen: () => void;
  onActions: () => void;
}) {
  const hold = useHold({ delay: 550, onHold: onActions, onTap: onOpen });
  return (
    <li
      className="flex items-center border-t border-border first:border-t-0"
      data-testid="player-row"
      data-identity={row.identity}
    >
      <button
        type="button"
        className="flex min-h-16 min-w-0 flex-1 select-none items-center gap-3 px-3 text-left"
        data-testid="player-open"
        {...hold}
        onClick={(e) => {
          if (e.detail === 0) onOpen();
        }}
      >
        <UserRound size={22} aria-hidden className="shrink-0 text-fg-muted" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg" data-testid="player-name">
            {row.name}
          </span>
          <span className="text-sm text-fg-muted">
            {tp("historyPast.players.games", row.games)} ·{" "}
            <span data-testid="player-wl">
              {t("historyPast.players.wl", { wins: row.wins, losses: row.losses })}
            </span>
          </span>
        </span>
        <span className="text-xl font-semibold tabular" data-testid="player-pct">
          {pctText(row.winPct)}
        </span>
        <ChevronRight size={20} aria-hidden className="text-fg-subtle" />
      </button>
      <button
        type="button"
        onClick={onActions}
        aria-label={t("historyPast.players.actions", { name: row.name })}
        className="flex size-12 shrink-0 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-2"
        data-testid="player-actions"
      >
        <MoreVertical size={20} aria-hidden />
      </button>
    </li>
  );
}

type Mode = "menu" | "merge" | "rename" | "link";

function IdentityActions({
  row,
  rows,
  onClose,
}: {
  row: IdentityRow;
  rows: IdentityRow[];
  onClose: () => void;
}) {
  const show = useSnackbar((s) => s.show);
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState(row.name);
  const [profiles, setProfiles] = useState<PlayerProfile[] | null>(null);
  useEffect(() => {
    if (mode === "link" && profiles === null) {
      void listProfiles().then(setProfiles, () => setProfiles([]));
    }
  }, [mode, profiles]);

  const done = (message: string, change: IdentityChange) => {
    onClose();
    show({
      message,
      actionLabel: t("common.undo"),
      onAction: () => void change.undo(),
      durationMs: 6000,
    });
  };

  const others = rows.filter((r) => r.identity !== row.identity);
  const title =
    mode === "merge"
      ? t("historyPast.players.mergeTitle", { name: row.name })
      : mode === "link"
        ? t("historyPast.players.linkTitle", { name: row.name })
        : row.name;

  return (
    <Sheet open onClose={onClose} title={title} testId="identity-actions">
      {mode === "menu" && (
        <div className="flex flex-col gap-2">
          <Button block onClick={() => setMode("merge")} data-testid="identity-merge">
            {t("historyPast.players.merge")}
          </Button>
          <Button block onClick={() => setMode("rename")} data-testid="identity-rename">
            {t("historyPast.players.rename")}
          </Button>
          {!row.profileId && (
            <Button block onClick={() => setMode("link")} data-testid="identity-link">
              {t("historyPast.players.link")}
            </Button>
          )}
        </div>
      )}
      {mode === "merge" && (
        <>
          <p className="mb-2 text-fg-muted">
            {t("historyPast.players.mergeHint", { name: row.name })}
          </p>
          <ul className="flex flex-col gap-2">
            {others.map((o) => (
              <li key={o.identity}>
                <Button
                  block
                  data-testid="merge-target"
                  data-identity={o.identity}
                  onClick={async () => {
                    const change = await mergeIdentities(row.identity, o.identity, {
                      name: o.name,
                    });
                    done(t("historyPast.players.merged", { from: row.name, into: o.name }), change);
                  }}
                >
                  {o.name} · {tp("historyPast.players.games", o.games)}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {mode === "rename" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const change = await renameIdentity(row.identity, name);
            done(t("historyPast.players.renamed", { name: name.trim() }), change);
          }}
        >
          <label className="flex flex-col gap-1 text-fg-muted">
            {t("historyPast.players.renameLabel")}
            <input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="min-h-12 rounded-xl bg-surface-2 px-3 text-fg"
              data-testid="rename-input"
            />
          </label>
          <Button type="submit" variant="primary" disabled={!name.trim()} data-testid="rename-save">
            {t("common.save")}
          </Button>
        </form>
      )}
      {mode === "link" && (
        <ul className="flex flex-col gap-2">
          {profiles?.length === 0 && <Empty text={t("historyPast.players.noProfiles")} />}
          {profiles?.map((p) => (
            <li key={p.id}>
              <Button
                block
                data-testid="link-profile"
                onClick={async () => {
                  const change = await linkIdentityToProfile(row.identity, p.id, { name: p.name });
                  done(
                    t("historyPast.players.linked", { name: row.name, profile: p.name }),
                    change,
                  );
                }}
              >
                {p.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function PlayersTab({
  records,
  opts,
  onToggleDefaults,
  onOpen,
}: {
  records: GameRecord[];
  opts: StatsOptions;
  onToggleDefaults: (v: boolean) => void;
  onOpen: (identity: string) => void;
}) {
  const rows = playerRows(records, opts);
  const [actions, setActions] = useState<IdentityRow | null>(null);
  return (
    <div className="mt-3" data-testid="past-players">
      <div className="flex min-h-12 items-center justify-between gap-3 px-1">
        <span className="text-sm text-fg-muted">{t("historyPast.players.showDefaults")}</span>
        <Toggle
          checked={opts.includeDefaultNames === true}
          onChange={onToggleDefaults}
          label={t("historyPast.players.showDefaults")}
          testId="players-show-defaults"
        />
      </div>
      {rows.length === 0 ? (
        <Empty text={t("historyPast.players.empty")} testId="players-empty" />
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-surface">
          {rows.map((r) => (
            <PlayerRow
              key={r.identity}
              row={r}
              onOpen={() => onOpen(r.identity)}
              onActions={() => setActions(r)}
            />
          ))}
        </ul>
      )}
      {actions && <IdentityActions row={actions} rows={rows} onClose={() => setActions(null)} />}
    </div>
  );
}

export function PlayerDetailView({
  records,
  identity,
  opts,
  allowed,
  onBack,
}: {
  records: GameRecord[];
  identity: string;
  opts: StatsOptions;
  allowed: boolean;
  onBack: () => void;
}) {
  const d = playerDetail(records, identity, opts);
  if (!d) {
    return (
      <div data-testid="past-player-detail">
        <BackButton onClick={onBack} />
        <Empty text={t("historyPast.noMatch")} />
      </div>
    );
  }
  return (
    <div data-testid="past-player-detail">
      <BackButton onClick={onBack} />
      <Card className="mt-2">
        <h2 className="text-xl font-semibold" data-testid="player-detail-name">
          {d.row.name}
        </h2>
        <p className="text-fg-muted">
          {tp("historyPast.players.games", d.row.games)} ·{" "}
          {t("historyPast.players.wl", { wins: d.row.wins, losses: d.row.losses })} ·{" "}
          {pctText(d.row.winPct)}
        </p>
      </Card>
      <Locked allowed={allowed} testId="player-detail-locked">
        <Section title={t("historyPast.pd.byPosition")} testId="pd-position">
          {d.byPosition.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {d.byPosition.map((b) => (
                <BucketRow
                  key={b.key}
                  b={b}
                  label={
                    b.key === "1"
                      ? t("historyPast.pd.first")
                      : t("historyPast.pd.position", { n: b.key })
                  }
                />
              ))}
            </ul>
          ) : (
            <Empty text={t("historyPast.pd.none")} />
          )}
        </Section>
        <Section title={t("historyPast.pd.byPreset")} testId="pd-preset">
          <ul className="rounded-2xl bg-surface px-3">
            {d.byPreset.map((b) => (
              <BucketRow key={b.key} b={b} />
            ))}
          </ul>
        </Section>
        {d.byDeck.length > 0 && (
          <Section title={t("historyPast.pd.byDeck")} testId="pd-deck">
            <ul className="rounded-2xl bg-surface px-3">
              {d.byDeck.map((b) => (
                <BucketRow key={b.key} b={b} />
              ))}
            </ul>
          </Section>
        )}
        <Section title={t("historyPast.pd.avgTurn")} testId="pd-turn">
          <Card>
            <span className="text-2xl font-semibold tabular">
              {d.avgTurnMs === null ? t("historyPast.pd.none") : durationText(d.avgTurnMs)}
            </span>
          </Card>
        </Section>
        <Section title={t("historyPast.pd.h2h")} testId="pd-h2h">
          {d.headToHead.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {d.headToHead.map((h) => (
                <li
                  key={h.identity}
                  className="flex min-h-12 items-center gap-2 border-t border-border first:border-t-0"
                >
                  <span className="min-w-0 flex-1 truncate">{h.name}</span>
                  <span className="tabular text-fg-muted">
                    {t("historyPast.pd.h2hRow", { wins: h.wins, losses: h.losses, games: h.games })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={t("historyPast.pd.none")} />
          )}
        </Section>
        <Section title={t("historyPast.pd.cause")} testId="pd-cause">
          <Card className="flex items-center gap-2">
            <Skull size={20} aria-hidden className="text-fg-muted" />
            {d.commonCause ? (
              <span>
                {causeText(d.commonCause.kind)} ({d.commonCause.count})
              </span>
            ) : (
              <span className="text-fg-muted">{t("historyPast.pd.none")}</span>
            )}
          </Card>
        </Section>
      </Locked>
    </div>
  );
}
