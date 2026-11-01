"use client";
/** HIST-023 Insights: summary tiles (free) + the full dashboard (Pro, blurred preview). */
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { t } from "@/lib/i18n";
import type { GameRecord } from "@/lib/records";
import {
  byPreset,
  clockInsights,
  commanderLeaderboard,
  durations,
  eliminationCauses,
  firstBlood,
  playgroups,
  summary,
  turnOrderAdvantage,
  type StatsOptions,
} from "@/lib/stats";
import { causeText, durationText, pctText } from "./format";
import { Bar, Card, Empty, Locked, Section } from "./parts";

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="text-xl font-semibold leading-tight tabular" data-testid={testId}>
        {value}
      </span>
    </Card>
  );
}

function Line({
  label,
  value,
  bar,
  testId,
}: {
  label: string;
  value: string;
  bar?: number;
  testId?: string;
}) {
  return (
    <li
      className="flex min-h-12 flex-col justify-center gap-1 border-t border-border py-1 first:border-t-0"
      data-testid={testId}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="tabular text-fg-muted">{value}</span>
      </span>
      {bar !== undefined && <Bar value={bar} />}
    </li>
  );
}

export function InsightsTab({
  records,
  opts,
  allowed,
}: {
  records: GameRecord[];
  opts: StatsOptions;
  allowed: boolean;
}) {
  const s = summary(records);
  const order = turnOrderAdvantage(records);
  const dur = durations(records);
  const presets = byPreset(records, opts);
  const causes = eliminationCauses(records);
  const blood = firstBlood(records, opts);
  const cmd = commanderLeaderboard(records, opts);
  const clock = clockInsights(records, opts);
  const groups = playgroups(records);
  const none = <Empty text={t("historyPast.ins.noData")} />;
  return (
    <div className="mt-3" data-testid="past-insights">
      <div className="grid grid-cols-3 gap-2" data-testid="insights-summary">
        <Tile label={t("historyPast.ins.games")} value={String(s.games)} testId="ins-games" />
        <Tile
          label={t("historyPast.ins.total")}
          value={durationText(s.totalMs)}
          testId="ins-total"
        />
        <Tile label={t("historyPast.ins.avg")} value={durationText(s.avgMs)} testId="ins-avg" />
      </div>
      <Locked allowed={allowed} testId="insights-locked">
        <Section title={t("historyPast.ins.turnOrder")} testId="ins-turn-order">
          {order.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {order.map((p) => (
                <Line
                  key={p.position}
                  testId={`ins-position-${p.position}`}
                  label={
                    p.position === 1
                      ? t("historyPast.pd.first")
                      : t("historyPast.pd.position", { n: p.position })
                  }
                  value={`${t("historyPast.ins.turnOrderRow", { wins: p.wins, games: p.games })} · ${pctText(p.pct)}`}
                  bar={p.pct ?? 0}
                />
              ))}
            </ul>
          ) : (
            none
          )}
        </Section>
        <Section title={t("historyPast.ins.durations")} testId="ins-durations">
          <ul className="rounded-2xl bg-surface px-3">
            <Line label={t("historyPast.ins.average")} value={durationText(dur.avgMs)} />
            <Line label={t("historyPast.ins.longest")} value={durationText(dur.longest?.ms)} />
            <Line label={t("historyPast.ins.shortest")} value={durationText(dur.shortest?.ms)} />
            <Line
              label={t("historyPast.ins.avgTurns")}
              value={dur.avgTurns === null ? "—" : dur.avgTurns.toFixed(1)}
            />
            <Line label={t("historyPast.ins.avgTurnLength")} value={durationText(dur.avgTurnMs)} />
          </ul>
        </Section>
        <Section title={t("historyPast.ins.byPreset")} testId="ins-presets">
          {presets.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {presets.map((p) => (
                <Line
                  key={p.presetId}
                  label={`${p.presetName} · ${p.games}`}
                  value={
                    p.leader
                      ? t("historyPast.ins.leader", {
                          name: p.leader.name,
                          pct: Math.round(p.leader.winPct * 100),
                        })
                      : "—"
                  }
                />
              ))}
            </ul>
          ) : (
            none
          )}
        </Section>
        <Section title={t("historyPast.ins.causes")} testId="ins-causes">
          {causes.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {causes.map((c) => (
                <Line
                  key={c.kind}
                  label={causeText(c.kind)}
                  value={`${c.count} · ${pctText(c.pct)}`}
                  bar={c.pct}
                />
              ))}
            </ul>
          ) : (
            none
          )}
        </Section>
        <Section title={t("historyPast.ins.firstBlood")} testId="ins-first-blood">
          {blood.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {blood.slice(0, 5).map((b) => (
                <Line
                  key={b.identity}
                  label={b.name}
                  value={t("historyPast.ins.firstBloodRow", { count: b.count, games: b.games })}
                  bar={b.pct}
                />
              ))}
            </ul>
          ) : (
            none
          )}
        </Section>
        {cmd.length > 0 && (
          <Section title={t("historyPast.ins.cmdBoard")} testId="ins-cmd">
            <ul className="rounded-2xl bg-surface px-3">
              {cmd.slice(0, 5).map((c) => (
                <Line
                  key={c.identity}
                  label={c.name}
                  value={t("historyPast.ins.cmdRow", { total: c.total })}
                />
              ))}
            </ul>
          </Section>
        )}
        <Section title={t("historyPast.ins.clock")} testId="ins-clock">
          {clock.rows.length ? (
            <ul className="rounded-2xl bg-surface px-3">
              {clock.slowest && (
                <Line
                  label={`${t("historyPast.ins.slowest")}: ${clock.slowest.name}`}
                  value={durationText(clock.slowest.avgTurnMs)}
                />
              )}
              {clock.fastest && (
                <Line
                  label={`${t("historyPast.ins.fastest")}: ${clock.fastest.name}`}
                  value={durationText(clock.fastest.avgTurnMs)}
                />
              )}
              {clock.responder && (
                <Line
                  label={`${t("historyPast.ins.responder")}: ${clock.responder.name}`}
                  value={durationText(clock.responder.responseMs)}
                />
              )}
              {clock.timeouts && (
                <Line
                  label={`${t("historyPast.ins.timeouts")}: ${clock.timeouts.name}`}
                  value={String(clock.timeouts.timeouts)}
                />
              )}
            </ul>
          ) : (
            none
          )}
        </Section>
        {groups.length > 0 && (
          <Section title={t("historyPast.ins.playgroups")} testId="ins-playgroups">
            <ul className="rounded-2xl bg-surface px-3">
              {groups.slice(0, 5).map((g) => (
                <Line
                  key={g.key}
                  label={g.names.join(", ")}
                  value={t("historyPast.ins.playgroupRow", { games: g.games })}
                />
              ))}
            </ul>
          </Section>
        )}
      </Locked>
      <Link
        href="/feedback"
        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl px-2 text-accent"
        data-testid="ins-suggest"
      >
        <Lightbulb size={18} aria-hidden />
        {t("historyPast.ins.suggest")}
      </Link>
    </div>
  );
}
