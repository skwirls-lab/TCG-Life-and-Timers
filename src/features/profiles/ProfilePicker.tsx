"use client";
/**
 * "Load" a saved profile (+ optional deck) into a seat (PROF-002, PROF-010). Recent first, then a
 * deck choice ("No deck" / existing decks / "New deck…"). Used by the seat menu Player tab
 * (embedded, so it doesn't stack a second modal) and by the setup flow's seats step (as a Sheet).
 */
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button, IconButton, Sheet } from "@/components/ui";
import { t } from "@/lib/i18n";
import { listDecks, listRecent, markUsed, saveDeck } from "@/lib/profiles/repo";
import type { Deck, PlayerProfile, ProfileSelection } from "@/lib/profiles/types";
import type { Rotation } from "@/lib/ui/rotation";

export interface ProfilePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (selection: ProfileSelection) => void;
  rotation?: Rotation;
  /** filter decks to this preset when choosing a deck */
  presetId?: string;
  /** render inline (inside an already-open sheet such as the seat menu) instead of a Sheet */
  embedded?: boolean;
}

export function ProfilePicker({
  open,
  onClose,
  onPick,
  rotation = 0,
  presetId,
  embedded,
}: ProfilePickerProps) {
  if (!open) return null;
  const body = <PickerBody onPick={onPick} onClose={onClose} presetId={presetId} />;
  if (embedded) return body;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      rotation={rotation}
      title={t("seat.picker.title")}
      testId="profile-picker-sheet"
      className="shrink-0"
    >
      {body}
    </Sheet>
  );
}

function PickerBody({
  onPick,
  onClose,
  presetId,
}: {
  onPick: (s: ProfileSelection) => void;
  onClose: () => void;
  presetId?: string;
}) {
  const [profiles, setProfiles] = useState<PlayerProfile[] | null>(null);
  const [chosen, setChosen] = useState<PlayerProfile | null>(null);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [newDeck, setNewDeck] = useState<string | null>(null);
  const inputId = useId();

  useEffect(() => {
    let live = true;
    void listRecent().then((p) => live && setProfiles(p));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!chosen) return;
    let live = true;
    void listDecks(chosen.id, presetId).then((d) => live && setDecks(d));
    return () => {
      live = false;
    };
  }, [chosen, presetId]);

  const pick = async (profile: PlayerProfile, deck?: Deck) => {
    await markUsed(profile.id, deck?.id);
    onPick(deck ? { profile, deck } : { profile });
  };

  const back = () => {
    if (newDeck !== null) setNewDeck(null);
    else if (chosen) {
      setChosen(null);
      setDecks(null);
    } else onClose();
  };

  const row =
    "flex min-h-14 w-full items-center gap-3 rounded-xl bg-surface-2 px-4 text-left text-lg hover:bg-surface-3";

  return (
    <div className="flex flex-col gap-2" data-testid="profile-picker">
      <div className="flex items-center gap-2">
        <IconButton label={t("common.back")} onClick={back} data-testid="profile-picker-back">
          <ArrowLeft size={24} />
        </IconButton>
        <h3 className="flex-1 truncate text-lg font-semibold">
          {chosen ? t("seat.picker.chooseDeck", { name: chosen.name }) : t("seat.picker.title")}
        </h3>
      </div>

      {!chosen && profiles !== null && profiles.length === 0 && (
        <p className="py-4 text-center text-fg-muted" data-testid="profile-picker-empty">
          {t("seat.picker.empty")}
        </p>
      )}
      {!chosen &&
        profiles?.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={row}
            data-testid={`profile-option-${i}`}
            onClick={() => setChosen(p)}
          >
            <span
              aria-hidden
              className="size-6 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </button>
        ))}

      {chosen && newDeck === null && (
        <>
          <button
            type="button"
            className={row}
            data-testid="deck-option-none"
            onClick={() => void pick(chosen)}
          >
            {t("seat.picker.noDeck")}
          </button>
          {decks?.map((d, i) => (
            <button
              key={d.id}
              type="button"
              className={row}
              data-testid={`deck-option-${i}`}
              onClick={() => void pick(chosen, d)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{d.name}</span>
                {d.commanders.length > 0 && (
                  <span className="truncate text-sm text-fg-muted">{d.commanders.join(" · ")}</span>
                )}
              </span>
            </button>
          ))}
          <button
            type="button"
            className={row}
            data-testid="deck-option-new"
            onClick={() => setNewDeck("")}
          >
            <Plus aria-hidden size={20} />
            {t("seat.picker.newDeck")}
          </button>
        </>
      )}

      {chosen && newDeck !== null && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newDeck.trim()) return;
            void saveDeck({
              profileId: chosen.id,
              name: newDeck,
              ...(presetId ? { presetId } : {}),
            }).then((d) => pick(chosen, d));
          }}
        >
          <label htmlFor={inputId} className="text-sm text-fg-muted">
            {t("seat.profiles.deckName")}
          </label>
          <input
            id={inputId}
            data-testid="deck-new-name"
            className="min-h-12 rounded-xl border border-border bg-bg px-3 text-lg outline-none focus:border-accent"
            value={newDeck}
            maxLength={40}
            onChange={(e) => setNewDeck(e.target.value)}
          />
          <Button type="submit" variant="primary" data-testid="deck-new-create">
            {t("seat.picker.createDeck")}
          </Button>
        </form>
      )}
    </div>
  );
}
