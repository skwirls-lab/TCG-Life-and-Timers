"use client";
/**
 * Toolbar player-count popover (LAY-001, LAY-003, SET-011, CMD-006): player-count chips, layout
 * variant thumbnails, and the quick commander-damage mode switch. Changing the count starts a new
 * game (same preset/options, seats kept by index) after a confirm; switching variant doesn't reset.
 */
import { Swords } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipRow, type ChipOption } from "@/components/ui/ChipRow";
import { HoldButton } from "@/components/ui/HoldButton";
import { Sheet } from "@/components/ui/Sheet";
import { getLayout, layoutVariants, type BoardLayout } from "@/engine/layout";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useGameValue } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { changePlayerCount, setLayoutVariant } from "./boardActions";
import { hasCommanderDamage } from "./boardHelpers";
import { useBoardUi } from "./boardStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PlayersSheet({ open, onClose }: Props) {
  const info = useGameValue((g) => ({
    players: g.seats.length,
    layoutId: g.layoutId,
    min: g.preset.minPlayers,
    max: g.preset.maxPlayers,
    cmd: hasCommanderDamage(g),
  }));
  const confirmStyle = useSetting("confirmStyle");
  const setCmdMode = useBoardUi((s) => s.setCmdMode);
  const [pending, setPending] = useState<number | null>(null);
  const [variant, setVariant] = useState<string | null>(null);

  const close = () => {
    setPending(null);
    setVariant(null);
    onClose();
  };

  if (!info) return null;
  const count = pending ?? info.players;
  const changing = count !== info.players;
  const options: ChipOption<number>[] = [];
  for (let n = Math.max(2, info.min); n <= Math.min(8, info.max); n++) options.push({ value: n });
  const viewport =
    typeof window !== "undefined"
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 360, h: 740 };
  const variants = layoutVariants(count);
  const current = changing
    ? (variant ?? variants[0]!.id)
    : getLayout({ players: count, variantId: info.layoutId, viewport }).variantId;

  const confirm = () => {
    changePlayerCount(count, current);
    close();
  };

  return (
    <Sheet open={open} onClose={close} title={t("board.players.title")} testId="players-popover">
      <div className="flex flex-col gap-4">
        <ChipRow
          label={t("board.players.count")}
          testId="players-count"
          options={options}
          value={count}
          onChange={(n) => {
            setPending(n);
            setVariant(null);
          }}
        />
        <div>
          <h3 className="mb-2 text-sm font-semibold text-fg-muted">{t("board.players.layout")}</h3>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t("board.players.layout")}
          >
            {variants.map((v) => {
              const selected = v.id === current;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t(v.label as MessageKey)}
                  data-testid={`players-layout-${v.id}`}
                  onClick={() => (changing ? setVariant(v.id) : setLayoutVariant(v.id))}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl p-2 text-xs",
                    selected ? "bg-surface-2 ring-2 ring-accent" : "bg-surface-2/60",
                  )}
                >
                  <LayoutThumb
                    layout={getLayout({ players: count, variantId: v.id, viewport })}
                    aspect={viewport.w / viewport.h}
                  />
                  <span>{t(v.label as MessageKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
        {changing && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            <p className="text-sm text-fg-muted">{t("board.players.resetWarning")}</p>
            {confirmStyle === "hold" ? (
              <HoldButton
                onConfirm={confirm}
                label={t("board.players.confirmHold", { count })}
                testId="players-confirm"
                className="min-h-12 rounded-xl bg-danger/15 px-4 font-semibold text-danger"
              >
                {t("board.players.confirmHold", { count })}
              </HoldButton>
            ) : (
              <Button variant="danger" data-testid="players-confirm" onClick={confirm}>
                {t("board.players.confirm", { count })}
              </Button>
            )}
          </div>
        )}
        {info.cmd && !changing && (
          <Button
            variant="secondary"
            block
            data-testid="players-cmd-mode"
            icon={<Swords size={20} />}
            onClick={() => {
              setCmdMode(true);
              close();
            }}
          >
            {t("board.cmd.quickMode")}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/** Tiny diagram of a layout: tiles with a bar on the edge their player sits at. */
function LayoutThumb({ layout, aspect }: { layout: BoardLayout; aspect: number }) {
  const H = 64;
  const W = Math.round(H * aspect);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {layout.seats.map((s) => {
        const x = s.rect.x * W + 1.5;
        const y = s.rect.y * H + 1.5;
        const w = s.rect.w * W - 3;
        const h = s.rect.h * H - 3;
        const bar =
          s.rotation === 0
            ? { x, y: y + h - 3, w, h: 3 }
            : s.rotation === 180
              ? { x, y, w, h: 3 }
              : s.rotation === 90
                ? { x, y, w: 3, h }
                : { x: x + w - 3, y, w: 3, h };
        return (
          <g key={s.index}>
            <rect x={x} y={y} width={w} height={h} rx={3} className="fill-surface-3" />
            <rect {...bar} rx={1} className="fill-accent" />
          </g>
        );
      })}
      <rect
        x={layout.toolbar.rect.x * W + 1}
        y={layout.toolbar.rect.y * H + 1}
        width={Math.max(1, layout.toolbar.rect.w * W - 2)}
        height={Math.max(1, layout.toolbar.rect.h * H - 2)}
        rx={1}
        className="fill-fg-subtle/50"
      />
    </svg>
  );
}
