"use client";
/**
 * HIST-002 life chart: lightweight inline SVG (no chart library). One 2px step line per seat in
 * the seat color, direct name labels at the line ends plus a legend (identity never by color
 * alone), ☠ markers at eliminations, recessive grid. Accessible: <title>/<desc> and a
 * visually-hidden data table.
 */
import { useId } from "react";
import type { Game } from "@/engine";
import { t } from "@/lib/i18n";
import { formatDuration, lifeChartData, niceTicks, stepPath } from "./format";

const W = 340;
const H = 220;
const M = { top: 12, right: 70, bottom: 30, left: 34 };
const LABEL_GAP = 13;

export function LifeChart({ game, now }: { game: Game; now: number }) {
  const id = useId();
  const data = lifeChartData(game, now || (game.startedAt ?? game.createdAt));
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const sx = (x: number) => M.left + ((x - data.xMin) / (data.xMax - data.xMin)) * pw;
  const sy = (y: number) => M.top + (1 - (y - data.yMin) / (data.yMax - data.yMin)) * ph;
  const yTicks = niceTicks(data.yMin, data.yMax, 4);
  const xTicks =
    data.axis === "turn"
      ? niceTicks(data.xMin, data.xMax, 4).filter((v) => Number.isInteger(v))
      : niceTicks(data.xMin, data.xMax, 4);
  const title =
    data.axis === "turn"
      ? t("history.chart.titleTurns", { counter: data.counterName })
      : t("history.chart.title", { counter: data.counterName });

  // Direct labels: sorted by final y, nudged apart so names never overlap.
  const labels = data.series
    .map((s) => ({ s, y: sy(s.points[s.points.length - 1]!.y) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i]!.y - labels[i - 1]!.y < LABEL_GAP) labels[i]!.y = labels[i - 1]!.y + LABEL_GAP;
  }
  const fmtX = (v: number) => (data.axis === "turn" ? String(v) : formatDuration(v * 60_000));

  return (
    <section className="mt-4 rounded-2xl bg-surface p-3" data-testid="life-chart">
      <h2 className="mb-2 text-base font-semibold" id={`${id}-h`}>
        {title}
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        data-testid="life-chart-svg"
      >
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{t("history.chart.desc")}</desc>
        <g className="text-fg-muted" fontSize={11} fill="currentColor">
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line
                x1={M.left}
                x2={M.left + pw}
                y1={sy(v)}
                y2={sy(v)}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeWidth={1}
              />
              <text x={M.left - 6} y={sy(v)} textAnchor="end" dominantBaseline="central">
                {v}
              </text>
            </g>
          ))}
          {xTicks
            .filter((v, i) => i === 0 || fmtX(v) !== fmtX(xTicks[i - 1]!))
            .map((v) => (
              <text key={`x${v}`} x={sx(v)} y={H - M.bottom + 14} textAnchor="middle">
                {fmtX(v)}
              </text>
            ))}
          <text x={M.left + pw / 2} y={H - 3} textAnchor="middle">
            {data.axis === "turn" ? t("history.chart.xTurn") : t("history.chart.xTime")}
          </text>
        </g>
        {data.series.map((s) => (
          <path
            key={s.seatId}
            d={stepPath(s.points, sx, sy)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-testid="chart-line"
            data-seat-id={s.seatId}
          >
            <title>{s.name}</title>
          </path>
        ))}
        {data.series.map((s) =>
          s.eliminatedAt ? (
            <text
              key={`k${s.seatId}`}
              x={sx(s.eliminatedAt.x)}
              y={sy(s.eliminatedAt.y)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fill="currentColor"
              className="text-fg"
              data-testid="chart-skull"
            >
              {"☠"}
            </text>
          ) : null,
        )}
        <g fontSize={11} className="text-fg" fill="currentColor">
          {labels.map(({ s, y }) => (
            <g key={`l${s.seatId}`}>
              <circle cx={M.left + pw + 8} cy={y} r={3.5} fill={s.color} />
              <text x={M.left + pw + 15} y={y} dominantBaseline="central">
                {s.name.length > 9 ? `${s.name.slice(0, 8)}…` : s.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden>
        {data.series.map((s) => (
          <li key={s.seatId} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name}
            {s.eliminatedAt ? " ☠" : ""}
          </li>
        ))}
      </ul>
      <table className="sr-only" data-testid="life-chart-table">
        <caption>{t("history.chart.tableCaption", { counter: data.counterName })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("history.chart.colPlayer")}</th>
            <th scope="col">{t("history.chart.colValues")}</th>
            <th scope="col">{t("history.chart.colFinal")}</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((s) => (
            <tr key={s.seatId}>
              <th scope="row">{s.name}</th>
              <td>{s.points.map((p) => p.y).join(", ")}</td>
              <td>
                {s.points[s.points.length - 1]!.y}
                {s.eliminatedAt ? ` ☠ ${t("history.eliminated")}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
