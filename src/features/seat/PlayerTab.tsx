"use client";
import { Download, Flag, HeartPulse, RotateCw, Save, Undo2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button, ListRow, SectionHeader, Toggle, useSnackbar } from "@/components/ui";
import type { Game, Rotation, Seat } from "@/engine";
import { ColorsPicker } from "@/features/backgrounds/ColorsPicker";
import { CommanderInput } from "@/features/profiles/CommanderInput";
import { ProfilePicker } from "@/features/profiles/ProfilePicker";
import { t } from "@/lib/i18n";
import { selectionToSeatActions, seatToDeckInput, seatToProfileInput } from "@/lib/profiles/apply";
import {
  dismissProfileSuggestion,
  getDeck,
  getProfile,
  MAX_PROFILE_NAME,
  recordNameUse,
  saveDeck,
  saveProfile,
  shouldSuggestProfile,
} from "@/lib/profiles/repo";
import { nextRotation } from "@/lib/ui/rotation";
import { canCreateProfile } from "@/lib/entitlements/quota";
import { useDispatch } from "@/state/gameStore";
import { ArtPickerSlot } from "./ArtPickerSlot";

interface Props {
  game: Game;
  seat: Seat;
  /** effective rotation of the seat (override or layout) */
  rotation: Rotation;
}

/** Seats declare commanders only in presets with commander-indexed counters (data-driven). */
function usesCommanders(game: Game): boolean {
  return game.preset.counters.some(
    (d) =>
      game.enabledCounters.includes(d.id) && (d.scope === "playerVsOpponent" || d.perCommander),
  );
}

const inputCls =
  "min-h-12 w-full rounded-xl border border-border bg-bg px-3 text-lg text-fg outline-none focus:border-accent";

/** Player tab (§8.2-1, SEAT-004, PROF-001/002/011, SET-002/003, LAY-004, CMD-003). */
export function PlayerTab({ game, seat, rotation }: Props) {
  const dispatch = useDispatch();
  const snack = useSnackbar((s) => s.show);
  const nameId = useId();
  const [name, setName] = useState(seat.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** PROF-011: the seat name for which "Save {name} as a profile?" applies (null = none). */
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [c0, setC0] = useState(seat.commanders[0] ?? "");
  const [c1, setC1] = useState(seat.commanders[1] ?? "");
  const [partner, setPartner] = useState(seat.commanders.length >= 2);
  // The commander inputs follow external changes (art picker "Use as commander" / "Save to deck",
  // undo); `cmdKey` is the last commanders value the inputs reflect or committed (CMD-003).
  const seatCmdKey = seat.commanders.join("\u0000");
  const [cmdKey, setCmdKey] = useState(seatCmdKey);
  if (cmdKey !== seatCmdKey) {
    setCmdKey(seatCmdKey);
    setC0(seat.commanders[0] ?? "");
    setC1(seat.commanders[1] ?? "");
    setPartner(seat.commanders.length >= 2);
  }

  const hasProfile = seat.profileId !== undefined;
  const suggest = !hasProfile && suggestFor === seat.name;
  useEffect(() => {
    if (hasProfile) return;
    let live = true;
    const name = seat.name;
    void shouldSuggestProfile(name).then((v) => {
      if (live) setSuggestFor(v ? name : null);
    });
    return () => {
      live = false;
    };
  }, [hasProfile, seat.name]);

  const commitName = async () => {
    if (!name.trim()) setName(seat.name);
    if (hasProfile || !seat.name.trim()) return;
    const committed = seat.name;
    await recordNameUse(committed, game.id);
    setSuggestFor((await shouldSuggestProfile(committed)) ? committed : null);
  };

  const commitCommanders = (isPartner: boolean, a: string, b: string) => {
    const next = isPartner
      ? [
          a.trim() || t("seat.commander.fallback", { n: 1 }),
          b.trim() || t("seat.commander.fallback", { n: 2 }),
        ]
      : a.trim()
        ? [a.trim()]
        : [];
    const key = next.join("\u0000");
    if (key === seatCmdKey) return;
    setCmdKey(key); // our own commit: keep what the user typed (e.g. an empty partner name)
    dispatch({ type: "SEAT_SET_COMMANDERS", seatId: seat.id, commanders: next });
  };

  const saveAsProfile = async () => {
    // PAY (T7.1): a NEW profile counts against the free plan's 4 profiles (§17.2).
    if (!seat.profileId && !(await canCreateProfile())) return;
    const existing = seat.profileId ? await getProfile(seat.profileId) : undefined;
    const profile = await saveProfile({
      ...seatToProfileInput(seat, existing),
      ...(seat.profileId ? { id: seat.profileId } : {}),
    });
    const existingDeck = seat.deckId ? await getDeck(seat.deckId) : undefined;
    const deckInput = seatToDeckInput(seat, profile.id, game.preset.id, existingDeck);
    const deck = deckInput
      ? await saveDeck({ ...deckInput, ...(seat.deckId ? { id: seat.deckId } : {}) })
      : undefined;
    dispatch({
      type: "SEAT_SET_PROFILE",
      seatId: seat.id,
      profileId: profile.id,
      ...(deck ? { deckId: deck.id, deckName: deck.name } : {}),
    });
    setSuggestFor(null);
    snack({ message: t("seat.player.saved", { name: profile.name }), rotation });
  };

  const concede = () => {
    dispatch({ type: "CONCEDE", seatId: seat.id });
    snack({
      message: t("seat.player.conceded", { name: seat.name }),
      actionLabel: t("common.undo"),
      onAction: () => dispatch({ type: "UNDO" }),
      durationMs: 5000,
      rotation,
    });
  };

  if (pickerOpen) {
    return (
      <ProfilePicker
        embedded
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        rotation={rotation}
        presetId={game.preset.id}
        onPick={(sel) => {
          for (const a of selectionToSeatActions(seat.id, sel, seat)) dispatch(a);
          setName(sel.profile.name);
          if (sel.deck?.commanders.length) {
            setC0(sel.deck.commanders[0] ?? "");
            setC1(sel.deck.commanders[1] ?? "");
            setPartner(sel.deck.commanders.length >= 2);
          }
          setPickerOpen(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={nameId} className="text-sm text-fg-muted">
        {t("seat.player.name")}
      </label>
      <input
        id={nameId}
        data-testid="seat-name-input"
        className={inputCls}
        value={name}
        maxLength={MAX_PROFILE_NAME}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => {
          const v = e.target.value.slice(0, MAX_PROFILE_NAME);
          setName(v);
          if (v.trim()) dispatch({ type: "SEAT_RENAME", seatId: seat.id, name: v });
        }}
        onBlur={() => void commitName()}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />

      {suggest && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3"
          data-testid="seat-profile-suggest"
        >
          <span className="min-w-0 flex-1">{t("seat.player.suggest", { name: seat.name })}</span>
          <Button size="sm" variant="primary" onClick={() => void saveAsProfile()}>
            {t("common.save")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSuggestFor(null);
              void dismissProfileSuggestion(seat.name);
            }}
          >
            {t("seat.player.notNow")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          icon={<Download size={20} />}
          onClick={() => setPickerOpen(true)}
          data-testid="seat-load-profile"
        >
          {t("seat.player.load")}
        </Button>
        <Button
          icon={<Save size={20} />}
          onClick={() => void saveAsProfile()}
          data-testid="seat-save-profile"
        >
          {hasProfile ? t("seat.player.updateProfile") : t("seat.player.saveProfile")}
        </Button>
      </div>
      {seat.deckName && (
        <p className="text-sm text-fg-muted" data-testid="seat-deck-name">
          {t("seat.player.deck", { deck: seat.deckName })}
        </p>
      )}

      {usesCommanders(game) && (
        <>
          <SectionHeader title={t("seat.commander.title")} />
          <CommanderInput
            label={t("seat.commander.nameN", { n: 1 })}
            placeholder={t("seat.commander.placeholder")}
            testId="seat-commander-0"
            className={inputCls}
            value={c0}
            onChange={setC0}
            onPick={(pick) => {
              setC0(pick.name);
              commitCommanders(partner, pick.name, c1);
            }}
            onBlur={() => commitCommanders(partner, c0, c1)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          {game.options.partnersAllowed && (
            <ListRow
              title={t("seat.commander.partner")}
              subtitle={t("seat.commander.partnerHelp")}
              control={
                <Toggle
                  checked={partner}
                  label={t("seat.commander.partner")}
                  testId="seat-partner-toggle"
                  onChange={(v) => {
                    setPartner(v);
                    commitCommanders(v, c0, c1);
                  }}
                />
              }
            />
          )}
          {partner && game.options.partnersAllowed && (
            <CommanderInput
              partner
              label={t("seat.commander.nameN", { n: 2 })}
              placeholder={t("seat.commander.placeholder2")}
              testId="seat-commander-1"
              className={inputCls}
              value={c1}
              onChange={setC1}
              onPick={(pick) => {
                setC1(pick.name);
                commitCommanders(true, c0, pick.name);
              }}
              onBlur={() => commitCommanders(true, c0, c1)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          )}
        </>
      )}

      <SectionHeader title={t("seat.bg.title")} />
      <ArtPickerSlot seatId={seat.id} presetId={game.preset.id} />
      <ColorsPicker seatId={seat.id} art={seat.art} />
      <ListRow
        title={t("seat.player.contrast")}
        subtitle={t("seat.player.contrastHelp")}
        control={
          <Toggle
            checked={seat.contrast}
            label={t("seat.player.contrast")}
            testId="seat-contrast-toggle"
            onChange={(v) => dispatch({ type: "SEAT_SET_CONTRAST", seatId: seat.id, contrast: v })}
          />
        }
      />

      <SectionHeader title={t("seat.player.seat")} />
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<RotateCw size={20} />}
          data-testid="seat-rotate"
          onClick={() =>
            dispatch({
              type: "SEAT_SET_ROTATION",
              seatId: seat.id,
              rotation: nextRotation(rotation),
            })
          }
        >
          {t("seat.player.rotate")}
        </Button>
        {seat.rotationOverride !== undefined && (
          <Button
            icon={<Undo2 size={20} />}
            variant="ghost"
            data-testid="seat-rotate-reset"
            onClick={() => dispatch({ type: "SEAT_SET_ROTATION", seatId: seat.id })}
          >
            {t("seat.player.rotateReset")}
          </Button>
        )}
        {seat.eliminated ? (
          <Button
            icon={<HeartPulse size={20} />}
            variant="primary"
            data-testid="seat-revive"
            onClick={() => dispatch({ type: "REVIVE", seatId: seat.id })}
          >
            {t("seat.player.revive")}
          </Button>
        ) : (
          <Button
            icon={<Flag size={20} />}
            variant="danger"
            data-testid="seat-concede"
            onClick={concede}
          >
            {t("seat.player.concede")}
          </Button>
        )}
      </div>
    </div>
  );
}
