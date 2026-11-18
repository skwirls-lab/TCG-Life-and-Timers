"use client";
/**
 * Seat menu → Backgrounds → card art & images (T5.2/T5.3: ART-001..005, ART-008, ART-020..023,
 * PROF-010). An inline flow inside the (rotated) seat menu:
 *   home → Search card → prints grid → focal editor → saved (commander offers)
 *   home → Upload image / one of My images → focal editor → saved
 *   home → Use commander art (one tap, ART-008) · Adjust crop of the current art
 *
 * `ArtEditor` is the same flow bound to any art value: the Profiles screen edits a profile's or a
 * deck's default background with it (PROF-010). `ArtPicker` binds it to a seat.
 */
import { Crop, Images, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import type { ArtFocal, ArtRef, SeatId } from "@/engine";
import { resolveCommanderArt } from "@/lib/art/commanderArt";
import { DEFAULT_FOCAL, normalizeFocal, roundFocal, seatViewAspect } from "@/lib/art/focal";
import {
  artRefFromOption,
  commanderNameFor,
  commandersWith,
  deckWithCommander,
  lookupCommanderNames,
  optionTitle,
  uploadArtRef,
  usesCommanders,
} from "@/lib/art/picker";
import { cacheRemoteArt, listUploads, type ArtRow } from "@/lib/art/repo";
import { watchArtCloud } from "@/lib/art/cloudRuntime";
import { track } from "@/lib/analytics/telemetry";
import { getScryfall } from "@/lib/art/scryfall";
import { t } from "@/lib/i18n";
import { getDeck, saveDeck } from "@/lib/profiles/repo";
import { artistCredit, type ArtOption } from "@/lib/scryfall";
import { useDispatch, useSeat } from "@/state/gameStore";
import { ArtBackground } from "./ArtBackground";
import { CardSearch } from "./CardSearch";
import { FocalEditor } from "./FocalEditor";
import { PrintsGrid } from "./PrintsGrid";
import { UploadButton } from "./UploadButton";
import { useArtUrl } from "./useArtUrl";

export interface ArtPickerProps {
  seatId: SeatId;
  presetId: string;
}

type Draft =
  | { kind: "scryfall"; option: ArtOption; focal: ArtFocal }
  | { kind: "upload"; id: string; focal: ArtFocal }
  | { kind: "current"; art: ArtRef; focal: ArtFocal };

type Step =
  | { k: "home" }
  | { k: "search" }
  | { k: "prints"; name: string }
  | { k: "focal"; draft: Draft; back: Step }
  | { k: "saved"; option: ArtOption; art: ArtRef };

/** Seat tile size + rotation from the board (when present) → the player's view aspect. */
function measureSeatAspect(index: number): number {
  if (typeof document === "undefined") return 1.5;
  const tile = document.querySelector<HTMLElement>(`[data-testid="seat-${index}"]`);
  if (!tile) return 1.5;
  const rot = Number(tile.querySelector("[data-rotation]")?.getAttribute("data-rotation") ?? 0);
  return seatViewAspect({ width: tile.offsetWidth, height: tile.offsetHeight }, rot);
}

const rowBtn =
  "flex min-h-12 w-full items-center gap-3 rounded-xl border border-border px-4 text-left hover:bg-surface-2";

export function ArtPicker({ seatId, presetId }: ArtPickerProps) {
  const dispatch = useDispatch();
  const seat = useSeat(seatId, (s, g) => ({
    art: s.art,
    commanders: s.commanders,
    profileId: s.profileId,
    deckId: s.deckId,
    index: g.seats.indexOf(s),
    commanderPreset: usesCommanders(g),
  }));
  // Measured once when the picker opens (the board is static behind the seat menu).
  const [aspect] = useState(() => measureSeatAspect(seat?.index ?? -1));
  const [notice, setNotice] = useState<string | null>(null);

  if (!seat) return null;
  const fallbacks = [
    t("seat.commander.fallback", { n: 1 }),
    t("seat.commander.fallback", { n: 2 }),
  ];
  const commanderNames = seat.commanderPreset ? lookupCommanderNames(seat, fallbacks) : [];

  const setAsCommander = (option: ArtOption) => {
    const name = commanderNameFor(option);
    dispatch({
      type: "SEAT_SET_COMMANDERS",
      seatId,
      commanders: commandersWith(seat.commanders, name),
    });
    setNotice(t("art.commander.used", { name }));
  };

  const saveToDeck = async (option: ArtOption, art: ArtRef) => {
    const name = commanderNameFor(option);
    const existing = seat.deckId ? await getDeck(seat.deckId) : undefined;
    const input = deckWithCommander(seat, existing, name, art, presetId);
    if (!input) return;
    const deck = await saveDeck(input);
    dispatch({
      type: "SEAT_SET_PROFILE",
      seatId,
      profileId: deck.profileId,
      deckId: deck.id,
      deckName: deck.name,
    });
    dispatch({ type: "SEAT_SET_COMMANDERS", seatId, commanders: deck.commanders });
    setNotice(t("art.commander.savedDeck", { name, deck: deck.name }));
  };

  const renderSaved = (option: ArtOption, art: ArtRef, done: () => void) => (
    <div className="flex flex-col gap-2" data-testid="art-saved">
      <p>{t("art.commander.offer", { name: commanderNameFor(option) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          data-testid="art-use-commander"
          onClick={() => setAsCommander(option)}
        >
          {t("art.commander.use")}
        </Button>
        {seat.profileId && (
          <Button data-testid="art-save-deck" onClick={() => void saveToDeck(option, art)}>
            {t("art.commander.saveDeck")}
          </Button>
        )}
        <Button variant="ghost" data-testid="art-done" onClick={done}>
          {t("art.picker.done")}
        </Button>
      </div>
    </div>
  );

  return (
    <ArtEditor
      art={seat.art}
      // Art picked here is "by hand" (no origin): it wins over deck / commander / profile art.
      onArt={(art) => dispatch({ type: "SEAT_SET_ART", seatId, art })}
      commanderNames={commanderNames}
      aspect={aspect}
      notice={notice}
      onNotice={setNotice}
      {...(seat.commanderPreset ? { renderSaved } : {})}
    />
  );
}

export interface ArtEditorProps {
  art: ArtRef | undefined;
  onArt: (art: ArtRef) => void;
  /** names offered for one-tap "Use commander art" (ART-008) */
  commanderNames: readonly string[];
  /** width / height of the background as its viewer sees it (focal editor frame) */
  aspect: number;
  /** after a Scryfall pick: extra offers (the seat's commander / deck buttons) */
  renderSaved?: (option: ArtOption, art: ArtRef, done: () => void) => ReactNode;
  /** controlled status line (optional) */
  notice?: string | null;
  onNotice?: (notice: string | null) => void;
  testId?: string;
}

/** The art flow bound to an art value (a seat, profile or deck background). */
export function ArtEditor({
  art: current,
  onArt: setArt,
  commanderNames,
  aspect,
  renderSaved,
  notice: controlledNotice,
  onNotice,
  testId = "art-picker",
}: ArtEditorProps) {
  const [step, setStep] = useState<Step>({ k: "home" });
  const [uploads, setUploads] = useState<ArtRow[]>([]);
  const [ownNotice, setOwnNotice] = useState<string | null>(null);
  const notice = controlledNotice !== undefined ? controlledNotice : ownNotice;
  const setNotice = onNotice ?? setOwnNotice;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    watchArtCloud();
    let live = true;
    void listUploads()
      .then((rows) => live && setUploads(rows.slice(0, 8)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const saveDraft = (draft: Draft) => {
    const focal = roundFocal(normalizeFocal(draft.focal));
    if (draft.kind === "scryfall") {
      const art = artRefFromOption(draft.option, focal);
      setArt(art);
      void cacheRemoteArt(art.value);
      track("art_scryfall_selected"); // LEG-004: no-op without analytics config + consent
      setNotice(t("art.saved"));
      setStep(renderSaved ? { k: "saved", option: draft.option, art } : { k: "home" });
      return;
    }
    if (draft.kind === "upload") setArt(uploadArtRef(draft.id, focal));
    else setArt({ ...draft.art, focal });
    setNotice(t("art.saved"));
    setStep({ k: "home" });
  };

  const applyCommanderArt = async (name: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const art = await resolveCommanderArt(name, getScryfall());
      setArt(art);
      void cacheRemoteArt(art.value);
      track("art_scryfall_selected"); // LEG-004: no-op without analytics config + consent
      setNotice(t("art.saved"));
    } catch {
      setNotice(t("art.picker.commanderArtFailed", { name }));
    } finally {
      setBusy(false);
    }
  };

  const back = (to: Step = { k: "home" }) => (
    <Button
      variant="ghost"
      size="sm"
      icon={<X size={18} />}
      data-testid="art-back"
      onClick={() => setStep(to)}
    >
      {to.k === "home" ? t("art.picker.cancel") : t("art.picker.back")}
    </Button>
  );

  const credit =
    current?.kind === "scryfall" ? artistCredit(current.artist, t("art.credit")) : undefined;
  const hasImage = current?.kind === "scryfall" || current?.kind === "upload";

  return (
    <section
      className="flex flex-col gap-2 rounded-2xl border border-border p-3"
      data-testid={testId}
      data-step={step.k}
      aria-label={t("art.picker.title")}
    >
      {step.k === "home" && (
        <>
          {hasImage && (
            <div className="flex items-center gap-3">
              <ArtBackground
                art={current}
                fallbackColor="#000"
                className="h-14 w-20 shrink-0 rounded-lg"
                testId="art-current-preview"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">
                  {current?.cardName ?? t("art.picker.current")}
                </span>
                {credit && (
                  <span className="truncate text-xs text-fg-muted" data-testid="art-credit">
                    {credit}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Crop size={18} />}
                data-testid="art-adjust"
                onClick={() =>
                  current &&
                  setStep({
                    k: "focal",
                    draft: {
                      kind: "current",
                      art: current,
                      focal: normalizeFocal(current.focal),
                    },
                    back: { k: "home" },
                  })
                }
              >
                {t("art.picker.adjust")}
              </Button>
            </div>
          )}
          <button
            type="button"
            className={rowBtn}
            data-testid="art-search-open"
            onClick={() => {
              setNotice(null);
              setStep({ k: "search" });
            }}
          >
            <Search aria-hidden size={22} />
            <span>{t("art.picker.search")}</span>
          </button>
          {commanderNames.map((name) => (
            <button
              key={name}
              type="button"
              className={rowBtn}
              disabled={busy}
              data-testid="art-commander-art"
              onClick={() => void applyCommanderArt(name)}
            >
              <Sparkles aria-hidden size={22} />
              <span className="flex flex-col">
                <span>{t("art.picker.useCommanderArt")}</span>
                <span className="text-xs text-fg-muted">{name}</span>
              </span>
            </button>
          ))}
          <UploadButton
            onUploaded={(row) => {
              setUploads((u) => [row, ...u.filter((x) => x.id !== row.id)].slice(0, 8));
              setStep({
                k: "focal",
                draft: { kind: "upload", id: row.id, focal: DEFAULT_FOCAL },
                back: { k: "home" },
              });
            }}
          />
          {uploads.length > 0 && (
            <ul className="flex gap-2 overflow-x-auto py-1" aria-label={t("art.picker.myImages")}>
              {uploads.map((row) => (
                <li key={row.id} className="shrink-0">
                  <button
                    type="button"
                    data-testid={`art-upload-pick-${row.id}`}
                    aria-label={row.meta.name ?? t("art.upload.defaultName")}
                    className="block h-14 w-20 overflow-hidden rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() =>
                      setStep({
                        k: "focal",
                        draft: { kind: "upload", id: row.id, focal: DEFAULT_FOCAL },
                        back: { k: "home" },
                      })
                    }
                  >
                    <ArtBackground
                      art={{ kind: "upload", value: row.id }}
                      fallbackColor="#333"
                      className="h-full w-full"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/images"
            className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm text-fg-muted hover:bg-surface-2"
            data-testid="art-my-images"
          >
            <Images aria-hidden size={20} />
            {t("art.picker.myImages")}
          </Link>
        </>
      )}

      {step.k === "search" && (
        <>
          <div className="flex justify-end">{back()}</div>
          <CardSearch onPick={(name) => setStep({ k: "prints", name })} />
        </>
      )}

      {step.k === "prints" && (
        <>
          <div className="flex justify-end">{back({ k: "search" })}</div>
          <PrintsGrid
            name={step.name}
            onChoose={(option) =>
              setStep({
                k: "focal",
                draft: { kind: "scryfall", option, focal: DEFAULT_FOCAL },
                back: step,
              })
            }
          />
        </>
      )}

      {step.k === "focal" && (
        <FocalStep
          draft={step.draft}
          aspect={aspect}
          onChange={(draft) => setStep({ ...step, draft })}
          onSave={() => saveDraft(step.draft)}
          backButton={back(step.back)}
        />
      )}

      {step.k === "saved" && renderSaved?.(step.option, step.art, () => setStep({ k: "home" }))}

      {notice && (
        <p role="status" className="text-sm text-fg-muted" data-testid="art-notice">
          {notice}
        </p>
      )}
    </section>
  );
}

function FocalStep({
  draft,
  aspect,
  onChange,
  onSave,
  backButton,
}: {
  draft: Draft;
  aspect: number;
  onChange: (d: Draft) => void;
  onSave: () => void;
  backButton: ReactNode;
}) {
  const art: ArtRef =
    draft.kind === "scryfall"
      ? { kind: "scryfall", value: draft.option.artCropUrl }
      : draft.kind === "upload"
        ? { kind: "upload", value: draft.id }
        : draft.art;
  const { url } = useArtUrl(art);
  const title = draft.kind === "scryfall" ? optionTitle(draft.option) : undefined;
  const credit =
    draft.kind === "scryfall"
      ? artistCredit(draft.option.artist, t("art.credit"))
      : draft.kind === "current" && draft.art.kind === "scryfall"
        ? artistCredit(draft.art.artist, t("art.credit"))
        : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-base font-semibold">{t("art.focal.title")}</h3>
        {backButton}
      </div>
      {title && <p className="text-sm">{title}</p>}
      {url ? (
        <FocalEditor
          src={url}
          focal={draft.focal}
          aspect={aspect}
          onChange={(focal) => onChange({ ...draft, focal })}
        />
      ) : (
        <p role="status" className="text-sm text-fg-muted">
          {t("art.prints.loading")}
        </p>
      )}
      {credit && (
        <p className="text-xs text-fg-muted" data-testid="art-focal-credit">
          {credit}
        </p>
      )}
      <Button variant="primary" block data-testid="art-focal-save" onClick={onSave} disabled={!url}>
        {t("art.focal.save")}
      </Button>
    </div>
  );
}
