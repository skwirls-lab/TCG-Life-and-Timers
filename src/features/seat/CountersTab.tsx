"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { GameIcon } from "@/components/icons/GameIcon";
import type { Game, SeatId } from "@/engine";
import { t, tp } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch } from "@/state/gameStore";
import {
  counterTiles,
  isTaxDef,
  minusAction,
  resetAction,
  setAction,
  tapAction,
  tileDisplay,
  type CounterTile,
  type TileDisplay,
} from "./counterTiles";
import { OptionsPanel } from "./OptionsPanel";
import { TapHoldButton } from "./TapHoldButton";

interface Props {
  game: Game;
  seatId: SeatId;
  focusCounterId?: string;
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

function displayText(d: TileDisplay): string {
  switch (d.kind) {
    case "number":
      return String(d.value);
    case "tax":
      return tp("seat.counters.tax", d.casts, { tax: d.tax });
    case "boolean":
      return d.on ? t("common.on") : t("common.off");
    case "enum":
      return capitalize(d.label);
    case "token":
      return d.held ? t("seat.counters.held") : t("seat.counters.notHeld");
    case "off":
      return t("seat.counters.disabled");
  }
}

function tileName(tile: CounterTile, game: Game, seatId: SeatId): string {
  const name = tile.def.shortName ?? tile.def.name;
  if (tile.sourceIndex === undefined) return name;
  const seat = game.seats.find((s) => s.id === seatId);
  const cmd = seat?.commanders[tile.sourceIndex];
  const multi = (seat?.commanders.length ?? 0) > 1;
  if (!multi) return name;
  return `${name} · ${cmd || t("seat.commander.fallback", { n: tile.sourceIndex + 1 })}`;
}

/** Counters tab (SEAT-001, CMD-010, TOK-001, TOK-003, TOK-004). */
export function CountersTab({ game, seatId, focusCounterId }: Props) {
  const dispatch = useDispatch();
  const tiles = useMemo(() => counterTiles(game, seatId), [game, seatId]);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusCounterId) return;
    const el = gridRef.current?.querySelector(`[data-counter-id="${CSS.escape(focusCounterId)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [focusCounterId]);

  const current = tiles.find((x) => x.tileId === optionsFor);
  if (current) {
    return (
      <CounterOptions
        game={game}
        tile={current}
        seatId={seatId}
        name={tileName(current, game, seatId)}
        onBack={() => setOptionsFor(null)}
      />
    );
  }

  return (
    <div className="@container flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t("seat.counters.help")}</p>
      <div ref={gridRef} className="grid grid-cols-2 gap-2 @md:grid-cols-3">
        {tiles.map((tile) => {
          const text = displayText(tileDisplay(game, tile, seatId));
          const name = tileName(tile, game, seatId);
          const active = tile.enabled && !tile.isDefault;
          const focused = focusCounterId === tile.def.id;
          return (
            <TapHoldButton
              key={tile.tileId}
              testId={`counter-${tile.tileId}`}
              onTap={() => dispatch(tapAction(tile, seatId))}
              onHold={() => setOptionsFor(tile.tileId)}
              data={{
                "counter-id": tile.def.id,
                active,
                enabled: tile.enabled,
                focused: focused || undefined,
              }}
              className={cn(
                "flex min-h-20 flex-col items-start justify-between gap-1 rounded-2xl p-3 text-left",
                tile.enabled ? "bg-surface-2" : "border border-dashed border-border bg-transparent",
                active && "bg-surface-3 ring-2 ring-accent",
                focused && "ring-4 ring-warning",
              )}
            >
              <span className="flex w-full items-center gap-2">
                <GameIcon id={tile.def.icon} size={22} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-base">{name}</span>
              </span>
              <span
                className={cn(
                  "text-xl tabular",
                  tile.enabled ? "text-fg" : "text-sm text-fg-subtle",
                )}
                data-testid={`counter-${tile.tileId}-value`}
              >
                {text}
              </span>
            </TapHoldButton>
          );
        })}
      </div>
    </div>
  );
}

function CounterOptions({
  game,
  tile,
  seatId,
  name,
  onBack,
}: {
  game: Game;
  tile: CounterTile;
  seatId: SeatId;
  name: string;
  onBack: () => void;
}) {
  const dispatch = useDispatch();
  const { def } = tile;
  const valueLabel = displayText(tileDisplay(game, tile, seatId));
  const isNumber = tile.enabled && def.kind === "number";
  const toggle = (
    <Button
      variant={tile.enabled ? "danger" : "primary"}
      data-testid="counter-options-enable"
      onClick={() => {
        dispatch({ type: "COUNTER_ENABLE", counterId: def.id, enabled: !tile.enabled });
        if (tile.enabled) onBack();
      }}
    >
      {tile.enabled ? t("seat.options.disable") : t("seat.options.enable")}
    </Button>
  );
  return (
    <OptionsPanel
      testId="counter-options"
      title={name}
      valueLabel={valueLabel}
      onBack={onBack}
      onMinus={isNumber ? () => dispatch(minusAction(tile, seatId)) : undefined}
      minusLabel={isTaxDef(def) ? t("seat.options.minusCast") : undefined}
      onSet={
        isNumber
          ? (v) => {
              dispatch(setAction(tile, seatId, v));
              onBack();
            }
          : undefined
      }
      onReset={tile.enabled ? () => dispatch(resetAction(tile, seatId)) : undefined}
    >
      {tile.enabled && def.kind === "boolean" && (
        <Button
          data-testid="counter-options-flip"
          onClick={() => dispatch(tapAction(tile, seatId))}
        >
          {tile.value === 1 ? t("seat.options.turnOff") : t("seat.options.turnOn")}
        </Button>
      )}
      {tile.enabled &&
        def.kind === "enum" &&
        (def.enumValues ?? []).map((label, index) => (
          <Button
            key={label}
            variant={tile.value === index ? "primary" : "secondary"}
            aria-pressed={tile.value === index}
            data-testid={`counter-options-enum-${index}`}
            onClick={() =>
              dispatch({
                type: "ENUM_SET",
                counterId: def.id,
                ...(tile.global ? {} : { seatId }),
                index,
              })
            }
          >
            {capitalize(label)}
          </Button>
        ))}
      {tile.enabled && def.kind === "token" && (
        <Button
          data-testid="counter-options-token"
          onClick={() => dispatch(tapAction(tile, seatId))}
        >
          {tile.value === 1 ? t("seat.options.clearToken") : t("seat.options.takeToken")}
        </Button>
      )}
      {toggle}
    </OptionsPanel>
  );
}
