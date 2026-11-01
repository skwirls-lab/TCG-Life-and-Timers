"use client";
/**
 * T1.17 "Dice & Misc" page (PRD §16, LifeTap baseline): randomize player / opponent, coin,
 * custom die (Set N → Roll), d4–d20 + d100, ×1…×10 multi-dice stepper, result overlay,
 * quick-access tip and links to the Mana & Storm and scratch counters (TOOL-012) pages.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { ChevronRight, Lightbulb, Shuffle, Swords } from "lucide-react";
import { Button, PageShell, SectionHeader, Stepper } from "@/components/ui";
import { aliveSeats, seatById } from "@/engine";
import { t } from "@/lib/i18n";
import {
  ALL_DICE,
  CUSTOM_DIE_MAX,
  CUSTOM_DIE_MIN,
  MULTI_DICE_MAX,
  MULTI_DICE_MIN,
  clampDieSides,
} from "@/lib/random";
import { cn } from "@/lib/ui/cn";
import { useGameStore } from "@/state/gameStore";
import { CoinIcon, DieIcon } from "./DieIcon";
import { useGameBootstrap, useKvValue, useQueryParam } from "./hooks";
import { SeatPicker } from "./SeatPicker";
import { ToolResultOverlay } from "./ToolResultOverlay";
import { ensureSettingsLoaded, useToolResult } from "./useToolRunner";

export const CUSTOM_DIE_KEY = "tools.customDie";
const customSchema = z.number().int().min(CUSTOM_DIE_MIN).max(CUSTOM_DIE_MAX);

function Tile({
  label,
  onClick,
  children,
  testId,
  disabled,
  wide,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl bg-surface p-3 text-fg transition active:scale-[0.97] disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        wide && "col-span-full flex-row justify-start gap-4 px-5 text-left",
      )}
    >
      {children}
      <span className="text-base font-medium">{label}</span>
    </button>
  );
}

export function ToolsPage() {
  useGameBootstrap();
  const router = useRouter();
  const from = useQueryParam("from");
  const run = useToolResult((s) => s.run);
  const hasGame = useGameStore((s) => s.session !== null);
  const aliveCount = useGameStore((s) => (s.session ? aliveSeats(s.session.game).length : 0));
  const chooserValid = useGameStore((s) =>
    s.session && from ? !!seatById(s.session.game, from) : false,
  );
  const [count, setCount] = useState(1);
  const [picker, setPicker] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const custom = useKvValue(CUSTOM_DIE_KEY, 20, customSchema);
  const [draft, setDraft] = useState("");

  useEffect(() => ensureSettingsLoaded(), []);

  const roll = (sides: number) => run({ kind: "dice", sides, count });
  const randomizeOpponent = () => {
    if (from && chooserValid) run({ kind: "opponent", chooserId: from });
    else setPicker(true);
  };
  const openCustom = () => {
    setDraft(String(custom.value));
    setCustomOpen((o) => !o);
  };
  const rollCustom = () => {
    const n = clampDieSides(Number(draft), custom.value);
    custom.set(n);
    setCustomOpen(false);
    run({ kind: "dice", sides: n, count });
  };

  return (
    <PageShell title={t("tools.title")} backHref="/play" testId="tools-page">
      <div
        data-testid="tools-root"
        data-kv-saved={custom.saved ? "true" : "false"}
        data-chooser={from && chooserValid ? from : ""}
      >
        <SectionHeader title={t("tools.randomizers")} />
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label={t("tools.randomPlayer")}
            testId="tool-random-player"
            disabled={!hasGame || aliveCount === 0}
            onClick={() => run({ kind: "player" })}
          >
            <Shuffle size={40} aria-hidden />
          </Tile>
          <Tile
            label={t("tools.randomOpponent")}
            testId="tool-random-opponent"
            disabled={!hasGame || aliveCount < 2}
            onClick={randomizeOpponent}
          >
            <Swords size={40} aria-hidden />
          </Tile>
        </div>
        {!hasGame && <p className="mt-2 text-sm text-fg-muted">{t("tools.needsGame")}</p>}
        {picker && (
          <SeatPicker
            onCancel={() => setPicker(false)}
            onPick={(seatId) => {
              setPicker(false);
              run({ kind: "opponent", chooserId: seatId });
            }}
          />
        )}

        <SectionHeader title={t("tools.coinsDice")} />
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2">
          <span className="text-base text-fg-muted">{t("tools.count")}</span>
          <Stepper
            label={t("tools.count")}
            value={count}
            min={MULTI_DICE_MIN}
            max={MULTI_DICE_MAX}
            onChange={setCount}
            testId="tool-count"
            format={(v) => t("tools.countValue", { count: v })}
          />
        </div>
        {customOpen && (
          <form
            className="mb-3 flex items-end gap-2 rounded-2xl bg-surface p-3"
            data-testid="custom-die-form"
            onSubmit={(e) => {
              e.preventDefault();
              rollCustom();
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm text-fg-muted">{t("tools.customLabel")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={CUSTOM_DIE_MIN}
                max={CUSTOM_DIE_MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                data-testid="custom-n-input"
                className="min-h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-2xl tabular"
              />
            </label>
            <Button type="submit" variant="primary" size="md" data-testid="custom-n-roll">
              {t("tools.customRoll")}
            </Button>
          </form>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Tile
            label={t("tools.flipCoin")}
            testId="tool-coin"
            onClick={() => run({ kind: "coin", count })}
          >
            <CoinIcon size={56} className="text-warning" />
          </Tile>
          <Tile
            label={t("tools.flipUntilTails")}
            testId="tool-until-tails"
            onClick={() => run({ kind: "untilTails" })}
          >
            <CoinIcon size={56} face="tails" className="text-warning" />
          </Tile>
          <div className="flex min-h-28 flex-col items-stretch overflow-hidden rounded-3xl bg-surface">
            <button
              type="button"
              data-testid="tool-custom"
              onClick={() => roll(custom.value)}
              className="flex flex-1 flex-col items-center justify-center gap-1 p-2 active:scale-[0.97]"
            >
              <DieIcon sides={custom.value} size={48} className="text-accent" />
              <span className="text-base font-medium">
                {t("tools.customDie", { sides: custom.value })}
              </span>
            </button>
            <button
              type="button"
              data-testid="tool-custom-set"
              onClick={openCustom}
              className="min-h-12 border-t border-border text-sm text-accent"
            >
              {t("tools.customSet")}
            </button>
          </div>
          {ALL_DICE.map((sides) => (
            <Tile
              key={sides}
              label={t("tools.die", { sides })}
              testId={`tool-d${sides}`}
              onClick={() => roll(sides)}
            >
              <DieIcon sides={sides} size={56} className="text-accent" />
            </Tile>
          ))}
        </div>

        <section
          className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4"
          data-testid="tools-tip"
        >
          <Lightbulb size={24} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <div>
            <h2 className="font-semibold">{t("tools.tipTitle")}</h2>
            <p className="text-fg-muted">{t("tools.tip")}</p>
          </div>
        </section>

        <Link
          href="/tools/mana"
          data-testid="tools-mana-link"
          className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl bg-surface px-4 py-2"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg">{t("tools.manaLink")}</span>
            <span className="text-sm text-fg-muted">{t("tools.manaLinkHint")}</span>
          </span>
          <ChevronRight aria-hidden />
        </Link>
        <Link
          href="/tools/counters"
          data-testid="tools-counters-link"
          className="mt-3 flex min-h-16 items-center gap-3 rounded-2xl bg-surface px-4 py-2"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg">{t("tools.countersLink")}</span>
            <span className="text-sm text-fg-muted">{t("tools.countersLinkHint")}</span>
          </span>
          <ChevronRight aria-hidden />
        </Link>

        <Button
          block
          size="lg"
          className="mt-6"
          data-testid="tools-close"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
        >
          {t("tools.close")}
        </Button>
      </div>

      <ToolResultOverlay />
    </PageShell>
  );
}
