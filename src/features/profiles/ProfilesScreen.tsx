"use client";
/** /profiles: local player profiles and their decks (PROF-001, PROF-010). */
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Button,
  HoldButton,
  IconButton,
  ListRow,
  PageShell,
  SectionHeader,
  Toggle,
} from "@/components/ui";
import type { ArtRef, Preset } from "@/engine";
import { PALETTE } from "@/features/backgrounds/gradients";
import { deckArtForCommander } from "@/lib/art/commanderArt";
import { cacheRemoteArt } from "@/lib/art/repo";
import { t, tp } from "@/lib/i18n";
import {
  deleteDeck,
  deleteProfile,
  getProfile,
  listDecks,
  listProfiles,
  MAX_PROFILE_NAME,
  saveDeck,
  saveProfile,
} from "@/lib/profiles/repo";
import type { Deck, PlayerProfile } from "@/lib/profiles/types";
import { cn } from "@/lib/ui/cn";
// PAY (T7.1): free plan = 4 profiles, 3 decks each (§17.2); over-limit creation opens the paywall.
import { canCreateDeck, canCreateProfile } from "@/lib/entitlements/quota";
import { getBuiltInPreset, listBuiltInPresets } from "@/presets";
import { ArtThumb, BackgroundField } from "./BackgroundField";
import { CommanderInput, type CommanderPick } from "./CommanderInput";

type View =
  | { mode: "list" }
  | { mode: "profile"; id?: string }
  | { mode: "deck"; profileId: string; id?: string };

const inputCls =
  "min-h-12 w-full rounded-xl border border-border bg-bg px-3 text-lg text-fg outline-none focus:border-accent";

/** Commander names apply to presets with commander-indexed counters (or decks for any game). */
function presetUsesCommanders(preset: Preset | undefined): boolean {
  if (!preset) return true;
  return preset.counters.some((d) => d.scope === "playerVsOpponent" || d.perCommander);
}

export function ProfilesScreen() {
  const [view, setView] = useState<View>({ mode: "list" });
  const back =
    view.mode === "deck"
      ? () => setView({ mode: "profile", id: view.profileId })
      : view.mode === "profile"
        ? () => setView({ mode: "list" })
        : undefined;
  return (
    <PageShell
      title={t("seat.profiles.title")}
      testId="profiles-page"
      onBack={back}
      actions={
        view.mode === "list" ? (
          <IconButton
            label={t("seat.profiles.new")}
            data-testid="profile-new"
            onClick={() => void canCreateProfile().then((ok) => ok && setView({ mode: "profile" }))}
          >
            <Plus size={28} />
          </IconButton>
        ) : undefined
      }
    >
      {view.mode === "list" && <ProfileList onOpen={(id) => setView({ mode: "profile", id })} />}
      {view.mode === "profile" && (
        <ProfileEditor
          key={view.id ?? "new"}
          id={view.id}
          onSaved={(id) => setView({ mode: "profile", id })}
          onDeleted={() => setView({ mode: "list" })}
          onOpenDeck={(profileId, id) =>
            void (id ? Promise.resolve(true) : canCreateDeck(profileId)).then(
              (ok) => ok && setView({ mode: "deck", profileId, id }),
            )
          }
        />
      )}
      {view.mode === "deck" && (
        <DeckEditor
          key={view.id ?? "new"}
          profileId={view.profileId}
          id={view.id}
          onDone={() => setView({ mode: "profile", id: view.profileId })}
        />
      )}
    </PageShell>
  );
}

function ProfileList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<{ profile: PlayerProfile; decks: number }[] | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const profiles = await listProfiles();
      const out = await Promise.all(
        profiles.map(async (profile) => ({
          profile,
          decks: (await listDecks(profile.id)).length,
        })),
      );
      if (live) setRows(out);
    })();
    return () => {
      live = false;
    };
  }, []);
  if (rows === null) return null;
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-fg-muted" data-testid="profiles-empty">
          {t("seat.profiles.empty")}
        </p>
      </div>
    );
  return (
    <div className="mt-2 flex flex-col">
      {rows.map(({ profile, decks }, i) => (
        <ListRow
          key={profile.id}
          testId={`profile-row-${i}`}
          onClick={() => onOpen(profile.id)}
          icon={
            profile.art ? (
              <ArtThumb
                art={profile.art}
                fallbackColor={profile.color}
                testId={`profile-row-${i}-art`}
              />
            ) : (
              <span
                aria-hidden
                className="size-6 rounded-full"
                style={{ background: profile.color }}
              />
            )
          }
          title={profile.name}
          subtitle={tp("seat.profiles.deckCount", decks)}
          control={<ChevronRight aria-hidden className="text-fg-muted" />}
        />
      ))}
    </div>
  );
}

function ProfileEditor({
  id,
  onSaved,
  onDeleted,
  onOpenDeck,
}: {
  id?: string;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onOpenDeck: (profileId: string, deckId?: string) => void;
}) {
  const nameId = useId();
  const [loaded, setLoaded] = useState<PlayerProfile | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]!);
  const [contrast, setContrast] = useState(false);
  const [art, setArt] = useState<ArtRef | undefined>(undefined);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    void (async () => {
      const p = await getProfile(id);
      const d = await listDecks(id);
      if (!live || !p) return;
      setLoaded(p);
      setName(p.name);
      setColor(p.color);
      setContrast(p.contrast);
      setArt(p.art);
      setDecks(d);
    })();
    return () => {
      live = false;
    };
  }, [id]);

  const save = async () => {
    if (!name.trim()) {
      setError(true);
      return;
    }
    if (!id && !(await canCreateProfile())) return;
    const { art: _old, ...rest } = loaded ?? ({} as Partial<PlayerProfile>);
    const p = await saveProfile({
      ...rest,
      ...(id ? { id } : {}),
      name,
      color,
      contrast,
      ...(art ? { art } : {}),
    });
    onSaved(p.id);
  };

  return (
    <div className="flex flex-col gap-3 pt-4" data-testid="profile-editor">
      <label htmlFor={nameId} className="text-sm text-fg-muted">
        {t("seat.profiles.name")}
      </label>
      <input
        id={nameId}
        data-testid="profile-name-input"
        className={inputCls}
        value={name}
        maxLength={MAX_PROFILE_NAME}
        aria-invalid={error}
        onChange={(e) => {
          setName(e.target.value);
          setError(false);
        }}
      />
      {error && <p className="text-sm text-danger">{t("seat.profiles.nameRequired")}</p>}
      <span className="text-sm text-fg-muted">{t("seat.profiles.color")}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("seat.profiles.color")}>
        {PALETTE.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={t("seat.profiles.colorN", { n: i + 1 })}
            data-testid={`profile-color-${i}`}
            className={cn(
              "size-12 rounded-full border border-white/20",
              color === c && "ring-4 ring-accent",
            )}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <ListRow
        title={t("seat.player.contrast")}
        subtitle={t("seat.player.contrastHelp")}
        control={
          <Toggle
            checked={contrast}
            onChange={setContrast}
            label={t("seat.player.contrast")}
            testId="profile-contrast"
          />
        }
      />
      <BackgroundField
        art={art}
        onChange={setArt}
        fallbackColor={color}
        help={t("profiles.bg.profileHelp")}
        testId="profile-bg"
      />
      <Button variant="primary" data-testid="profile-save" onClick={() => void save()}>
        {t("seat.profiles.save")}
      </Button>

      {id && (
        <>
          <SectionHeader title={t("seat.profiles.decks")} />
          {decks.length === 0 && <p className="text-fg-muted">{t("seat.profiles.noDecks")}</p>}
          {decks.map((d, i) => (
            <ListRow
              key={d.id}
              testId={`deck-row-${i}`}
              onClick={() => onOpenDeck(id, d.id)}
              {...(d.art
                ? {
                    icon: (
                      <ArtThumb art={d.art} fallbackColor={color} testId={`deck-row-${i}-art`} />
                    ),
                  }
                : {})}
              title={d.name}
              subtitle={[
                d.presetId ? getBuiltInPreset(d.presetId)?.name : undefined,
                d.commanders.join(" · ") || undefined,
              ]
                .filter(Boolean)
                .join(" — ")}
              control={<ChevronRight aria-hidden className="text-fg-muted" />}
            />
          ))}
          <Button icon={<Plus size={20} />} data-testid="deck-new" onClick={() => onOpenDeck(id)}>
            {t("seat.profiles.addDeck")}
          </Button>
          <HoldButton
            label={t("seat.profiles.delete")}
            testId="profile-delete"
            className="mt-6 min-h-12 rounded-xl border border-danger/40 px-4 text-danger"
            onConfirm={() => void deleteProfile(id).then(onDeleted)}
          >
            {t("seat.profiles.delete")}
          </HoldButton>
        </>
      )}
    </div>
  );
}

function DeckEditor({
  profileId,
  id,
  onDone,
}: {
  profileId: string;
  id?: string;
  onDone: () => void;
}) {
  const nameId = useId();
  const presetId = useId();
  const presets = listBuiltInPresets();
  const [loaded, setLoaded] = useState<Deck | null>(null);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<string>("");
  const [c0, setC0] = useState("");
  const [c1, setC1] = useState("");
  const [partner, setPartner] = useState(false);
  const [art, setArt] = useState<ArtRef | undefined>(undefined);
  /** the art was filled in from a commander pick in this edit (a later pick may replace it) */
  const [artAuto, setArtAuto] = useState(false);
  const [profileColor, setProfileColor] = useState<string>(PALETTE[0]!);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const p = await getProfile(profileId);
      if (live && p) setProfileColor(p.color);
      if (!id) return;
      const d = (await listDecks(profileId)).find((x) => x.id === id);
      if (!live || !d) return;
      setLoaded(d);
      setName(d.name);
      setPreset(d.presetId ?? "");
      setC0(d.commanders[0] ?? "");
      setC1(d.commanders[1] ?? "");
      setPartner(d.commanders.length >= 2);
      setArt(d.art);
    })();
    return () => {
      live = false;
    };
  }, [id, profileId]);

  const showCommanders = presetUsesCommanders(preset ? getBuiltInPreset(preset) : undefined);

  /** PROF-010: picking the first commander gives an art-less deck that commander's art. */
  const pickFirst = (pick: CommanderPick) => {
    setC0(pick.name);
    const next = deckArtForCommander(art, artAuto, pick.card);
    if (next !== art && next) {
      setArt(next);
      setArtAuto(true);
      void cacheRemoteArt(next.value);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setError(true);
      return;
    }
    if (!id && !(await canCreateDeck(profileId))) return;
    const { presetId: _old, art: _oldArt, ...rest } = loaded ?? ({} as Partial<Deck>);
    await saveDeck({
      ...rest,
      profileId,
      ...(id ? { id } : {}),
      name,
      ...(preset ? { presetId: preset } : {}),
      commanders: showCommanders ? (partner ? [c0, c1] : [c0]) : [],
      ...(art ? { art } : {}),
    });
    onDone();
  };
  const commanderNames = showCommanders
    ? [c0, partner ? c1 : ""].map((c) => c.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-3 pt-4" data-testid="deck-editor">
      <label htmlFor={nameId} className="text-sm text-fg-muted">
        {t("seat.profiles.deckName")}
      </label>
      <input
        id={nameId}
        data-testid="deck-name-input"
        className={inputCls}
        value={name}
        maxLength={MAX_PROFILE_NAME}
        aria-invalid={error}
        onChange={(e) => {
          setName(e.target.value);
          setError(false);
        }}
      />
      {error && <p className="text-sm text-danger">{t("seat.profiles.nameRequired")}</p>}
      <label htmlFor={presetId} className="text-sm text-fg-muted">
        {t("seat.profiles.preset")}
      </label>
      <select
        id={presetId}
        data-testid="deck-preset"
        className={inputCls}
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
      >
        <option value="">{t("seat.profiles.presetAny")}</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {showCommanders && (
        <>
          <SectionHeader title={t("seat.commander.title")} />
          <CommanderInput
            label={t("seat.commander.nameN", { n: 1 })}
            placeholder={t("seat.commander.placeholder")}
            testId="deck-commander-0"
            className={inputCls}
            value={c0}
            onChange={setC0}
            onPick={pickFirst}
          />
          <ListRow
            title={t("seat.commander.partner")}
            subtitle={t("seat.commander.partnerHelp")}
            control={
              <Toggle
                checked={partner}
                onChange={setPartner}
                label={t("seat.commander.partner")}
                testId="deck-partner"
              />
            }
          />
          {partner && (
            <CommanderInput
              partner
              label={t("seat.commander.nameN", { n: 2 })}
              placeholder={t("seat.commander.placeholder2")}
              testId="deck-commander-1"
              className={inputCls}
              value={c1}
              onChange={setC1}
              onPick={(pick) => setC1(pick.name)}
            />
          )}
        </>
      )}
      <BackgroundField
        art={art}
        onChange={(next) => {
          setArt(next);
          setArtAuto(false);
        }}
        fallbackColor={profileColor}
        help={t("profiles.bg.deckHelp")}
        commanderNames={commanderNames}
        testId="deck-bg"
      />
      <Button variant="primary" data-testid="deck-save" onClick={() => void save()}>
        {t("seat.profiles.saveDeck")}
      </Button>
      {id && (
        <Button
          variant="danger"
          data-testid="deck-delete"
          onClick={() => void deleteDeck(id).then(onDone)}
        >
          {t("seat.profiles.deleteDeck")}
        </Button>
      )}
    </div>
  );
}
