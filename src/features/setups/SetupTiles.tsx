"use client";
/**
 * Launcher "Presets" (saved setups): large tiles near the top of `/`. Tap = Start (straight to the
 * board with everything applied); the pencil = Edit before starting (setup at the seats step);
 * the overflow = rename, move up/down, delete. Hidden when there are none: a subtle hint shows in
 * its place, once. A preset whose (custom) game type was deleted shows "Game type missing" and
 * offers delete.
 */
import { liveQuery } from "dexie";
import { ArrowDown, ArrowUp, EllipsisVertical, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { GameIcon } from "@/components/icons/GameIcon";
import { Button, IconButton, Sheet, useSnackbar } from "@/components/ui";
import type { Preset } from "@/engine";
import { getAnyPreset } from "@/lib/customPresets";
import { getDb } from "@/lib/db";
import { t } from "@/lib/i18n";
import {
  MAX_SETUP_NAME,
  cleanSetupName,
  deleteSetup,
  listSetups,
  moveSetup,
  renameSetup,
  type SavedSetup,
} from "@/lib/setups";
import { cn } from "@/lib/ui/cn";
import { seatInitials } from "./initials";

/** kv flag: the "save your setup as a preset" hint was shown (it shows at most once). */
export const SETUPS_HINT_KEY = "setupsHintShown";

type GameTypes = Record<string, Preset | null>;

function useSetups(): { setups: SavedSetup[] | null; types: GameTypes } {
  const [setups, setSetups] = useState<SavedSetup[] | null>(null);
  const [types, setTypes] = useState<GameTypes>({});
  useEffect(() => {
    const sub = liveQuery(() => listSetups()).subscribe({
      next: (list) => setSetups(list),
      error: () => setSetups([]),
    });
    return () => sub.unsubscribe();
  }, []);
  useEffect(() => {
    if (!setups) return;
    let alive = true;
    void Promise.all(
      [...new Set(setups.map((s) => s.presetId))].map(
        async (id) => [id, (await getAnyPreset(id).catch(() => undefined)) ?? null] as const,
      ),
    ).then((pairs) => alive && setTypes(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [setups]);
  return { setups, types };
}

/** The hint shows the first time the launcher has no presets, then never again. */
function useHintOnce(show: boolean): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    let alive = true;
    const db = getDb();
    void db.kv
      .get(SETUPS_HINT_KEY)
      .then(async (row) => {
        if (!alive || row) return;
        setVisible(true);
        await db.kv.put({ key: SETUPS_HINT_KEY, value: true });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [show]);
  return show && visible;
}

export function SetupTiles() {
  const router = useRouter();
  const { setups, types } = useSetups();
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<{ setup: SavedSetup; mode: Mode } | null>(null);
  const show = useSnackbar((s) => s.show);
  const headingId = useId();
  const hint = useHintOnce(setups !== null && setups.length === 0);

  if (setups === null) return null;
  if (setups.length === 0)
    return hint ? (
      <p className="text-center text-sm text-fg-muted" data-testid="launcher-presets-hint">
        {t("setups.hint")}
      </p>
    ) : null;

  const start = async (setup: SavedSetup) => {
    if (busy) return;
    setBusy(true);
    try {
      // Loaded on tap: keeps the setup model and the game-start code out of the launcher's JS.
      const { startFromSetup } = await import("./actions");
      const r = await startFromSetup(setup);
      if (r.kind === "started") router.push("/play");
      else if (r.kind === "players" && r.check.reason !== "pro")
        show({
          message: t("setups.tile.players", {
            game: r.preset.name,
            min: r.check.min,
            max: r.check.max,
          }),
        });
    } catch (e) {
      console.warn("[setups] start failed", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId} data-testid="launcher-presets" className="flex flex-col">
      <h2
        id={headingId}
        className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted"
      >
        {t("setups.title")}
      </h2>
      <ul className="flex flex-col gap-3">
        {setups.map((setup, i) => {
          const type = types[setup.presetId];
          const missing = type === null;
          const icon = type?.counters.find((c) => c.isPrimary)?.icon ?? "heart";
          return (
            <li
              key={setup.id}
              data-testid={`setup-tile-${i}`}
              data-setup-id={setup.id}
              data-missing={missing ? "true" : undefined}
              className="flex items-stretch overflow-hidden rounded-3xl bg-surface ring-1 ring-border"
            >
              <button
                type="button"
                disabled={missing || busy || type === undefined}
                onClick={() => void start(setup)}
                data-testid={`setup-tile-${i}-start`}
                className="flex min-h-24 min-w-0 flex-1 items-center gap-3 p-4 text-left transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full",
                    missing ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent",
                  )}
                >
                  {missing ? <TriangleAlert size={24} /> : <GameIcon id={icon} size={26} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* The visible text names the button; "Start" is read before it. */}
                  <span className="sr-only">{t("setups.tile.startPrefix")}</span>
                  <span
                    className="truncate text-lg font-semibold leading-tight"
                    data-testid={`setup-tile-${i}-name`}
                  >
                    {setup.name}
                  </span>
                  {missing ? (
                    <span className="text-sm text-warning" data-testid={`setup-tile-${i}-missing`}>
                      {t("setups.tile.missing")}
                    </span>
                  ) : (
                    <span
                      className="truncate text-sm text-fg-muted"
                      data-testid={`setup-tile-${i}-summary`}
                    >
                      {t("setups.tile.summary", {
                        game: type?.name ?? setup.presetName,
                        players: setup.seats.length,
                      })}
                    </span>
                  )}
                  <span aria-hidden className="flex flex-wrap gap-1">
                    {setup.seats.map((seat, si) => (
                      <span
                        key={si}
                        className="flex size-7 items-center justify-center rounded-full text-[0.7rem] font-bold text-black"
                        style={{ background: seat.color }}
                      >
                        {seatInitials(seat.name, si)}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-center justify-center border-l border-border/60 px-1">
                {missing ? (
                  <IconButton
                    label={`${t("common.delete")}: ${setup.name}`}
                    data-testid={`setup-tile-${i}-delete`}
                    onClick={() => setManage({ setup, mode: "delete" })}
                  >
                    <Trash2 aria-hidden size={22} />
                  </IconButton>
                ) : (
                  <IconButton
                    label={t("setups.tile.editLabel", { name: setup.name })}
                    data-testid={`setup-tile-${i}-edit`}
                    onClick={() => router.push(`/setup?setup=${encodeURIComponent(setup.id)}`)}
                  >
                    <Pencil aria-hidden size={22} />
                  </IconButton>
                )}
                <IconButton
                  label={t("setups.tile.more", { name: setup.name })}
                  data-testid={`setup-tile-${i}-more`}
                  onClick={() => setManage({ setup, mode: "menu" })}
                >
                  <EllipsisVertical aria-hidden size={22} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      {manage && (
        // Keyed: the sheet starts fresh (mode, name) for each preset it is opened for.
        <ManageSheet
          key={`${manage.setup.id}:${manage.mode}`}
          setup={setups.find((s) => s.id === manage.setup.id) ?? manage.setup}
          initialMode={manage.mode}
          index={setups.findIndex((s) => s.id === manage.setup.id)}
          count={setups.length}
          onClose={() => setManage(null)}
        />
      )}
    </section>
  );
}

type Mode = "menu" | "rename" | "delete";

/** Rename, move up/down and delete one preset. */
function ManageSheet({
  setup,
  initialMode,
  index,
  count,
  onClose,
}: {
  setup: SavedSetup;
  initialMode: Mode;
  index: number;
  count: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState(setup.name);
  const inputId = useId();
  const show = useSnackbar((s) => s.show);

  const move = (dir: -1 | 1) => void moveSetup(setup.id, dir).catch(() => undefined);
  const rowCls = "justify-start";

  return (
    <Sheet open onClose={onClose} title={setup.name} testId="setup-manage">
      {mode === "menu" && (
        <div className="flex flex-col gap-2">
          <Button
            block
            icon={<Pencil aria-hidden size={20} />}
            className={rowCls}
            onClick={() => setMode("rename")}
            data-testid="setup-manage-rename"
          >
            {t("setups.manage.rename")}
          </Button>
          <Button
            block
            icon={<ArrowUp aria-hidden size={20} />}
            className={rowCls}
            disabled={index <= 0}
            onClick={() => move(-1)}
            data-testid="setup-manage-up"
          >
            {t("setups.manage.moveUp")}
          </Button>
          <Button
            block
            icon={<ArrowDown aria-hidden size={20} />}
            className={rowCls}
            disabled={index < 0 || index >= count - 1}
            onClick={() => move(1)}
            data-testid="setup-manage-down"
          >
            {t("setups.manage.moveDown")}
          </Button>
          <Button
            block
            icon={<Trash2 aria-hidden size={20} className="text-danger" />}
            className={rowCls}
            onClick={() => setMode("delete")}
            data-testid="setup-manage-delete"
          >
            {t("common.delete")}
          </Button>
        </div>
      )}
      {mode === "rename" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = cleanSetupName(name);
            if (!clean) return;
            void renameSetup(setup.id, clean)
              .then(onClose)
              .catch(() => show({ message: t("setups.save.failed") }));
          }}
        >
          <label htmlFor={inputId} className="text-sm font-medium">
            {t("setups.save.name")}
          </label>
          <input
            id={inputId}
            type="text"
            value={name}
            maxLength={MAX_SETUP_NAME}
            autoComplete="off"
            data-testid="setup-rename-input"
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 w-full rounded-xl bg-surface-2 px-3 text-lg text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            disabled={!cleanSetupName(name)}
            data-testid="setup-rename-save"
          >
            {t("common.save")}
          </Button>
        </form>
      )}
      {mode === "delete" && (
        <div className="flex flex-col gap-3">
          <p className="text-lg font-semibold">
            {t("setups.manage.deleteTitle", { name: setup.name })}
          </p>
          <p className="text-sm text-fg-muted">{t("setups.manage.deleteBody")}</p>
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => setMode("menu")}>
              {t("common.cancel")}
            </Button>
            <Button
              size="lg"
              variant="danger"
              className="flex-1"
              data-testid="setup-delete-confirm"
              onClick={() => {
                void deleteSetup(setup.id)
                  .then(() => {
                    show({ message: t("setups.manage.deleted", { name: setup.name }) });
                    onClose();
                  })
                  .catch(() => show({ message: t("setups.save.failed") }));
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
