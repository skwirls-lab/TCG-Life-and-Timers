import { describe, expect, it } from "vitest";
import { createGame, seededRng, type Preset } from "@/engine";
import { hasKey } from "@/lib/i18n";
import { getBuiltInPreset, listBuiltInPresets } from "@/presets";
import { defaultAppSettings } from "@/state/settingsStore";
import { draftFromDefaults, draftFromGame } from "./draft";
import {
  AVAILABLE_ROUTES,
  SECTIONS,
  hasPerSeatOverrides,
  allSettings,
  getSetting,
  registerSettings,
  settingSubtitle,
  settingTitle,
  thresholdSourceList,
  unregisterSettings,
  visibleSettings,
  type SettingsContext,
} from "./registry";

const commander = getBuiltInPreset("mtg.commander")!;
const constructed = getBuiltInPreset("mtg.constructed")!;
const brawl = getBuiltInPreset("mtg.brawl")!;

function ctxFor(preset: Preset, opts: { game?: boolean; pro?: boolean } = {}): SettingsContext {
  const game = opts.game ? createGame({ preset }, seededRng(1), 1) : null;
  return {
    preset,
    game,
    draft: game ? draftFromGame(game) : draftFromDefaults(preset, undefined),
    app: defaultAppSettings(),
    env: { haptics: true, fullscreen: true, standalone: false },
    can: () => opts.pro ?? false,
    version: "1.2.3",
  };
}

const ids = (ctx: SettingsContext) =>
  SECTIONS.flatMap((s) => visibleSettings(s, ctx).map((r) => r.id));

describe("settings registry", () => {
  // @req SET-010 @req ARCH-003
  it("shows commander rows only for presets with commander damage / partners", () => {
    const cmd = ids(ctxFor(commander));
    expect(cmd).toEqual(
      expect.arrayContaining([
        "commanderDamageLifeLoss",
        "partnersAllowed",
        "colorizeMiniGrids",
        "bounty",
      ]),
    );
    const con = ids(ctxFor(constructed));
    expect(con).not.toContain("commanderDamageLifeLoss");
    expect(con).not.toContain("partnersAllowed");
    expect(con).not.toContain("colorizeMiniGrids");
    expect(con).not.toContain("bounty");
    expect(con).toContain("planechase");
    const br = ids(ctxFor(brawl));
    expect(br).toContain("partnersAllowed");
    expect(br).not.toContain("commanderDamageLifeLoss");
  });

  // @req SET-010
  it("hides preset-irrelevant rows (calculator, first-turn reminder) for MTG", () => {
    const cmd = ids(ctxFor(commander));
    expect(cmd).not.toContain("tapForCalculator");
    expect(cmd).not.toContain("firstTurnReminder");
    expect(cmd).not.toContain("perSeatStart");
    const calc: Preset = {
      ...constructed,
      capabilities: [...constructed.capabilities, "calculator", "firstTurnReminder"],
    };
    expect(ids(ctxFor(calc))).toEqual(
      expect.arrayContaining(["tapForCalculator", "firstTurnReminder"]),
    );
  });

  it("shows game-only rows (seats) only with an active game", () => {
    expect(ids(ctxFor(commander))).not.toContain("seats");
    expect(ids(ctxFor(commander, { game: true }))).toContain("seats");
    const archenemy = getBuiltInPreset("mtg.archenemy")!;
    expect(ids(ctxFor(archenemy, { game: true }))).toContain("perSeatStart");
  });

  it("hides the Players row when the preset has a fixed player count", () => {
    expect(ids(ctxFor(getBuiltInPreset("mtg.limited")!))).not.toContain("players");
  });

  // @req SET-015 @req SET-034
  it("gives every row a title and subtitle with existing i18n keys", () => {
    for (const preset of listBuiltInPresets({ includeHidden: true })) {
      const ctx = ctxFor(preset, { game: true });
      for (const def of allSettings()) {
        expect(hasKey(def.titleKey), def.titleKey).toBe(true);
        expect(hasKey(def.subtitleKey), def.subtitleKey).toBe(true);
        if (def.helpKey) expect(hasKey(def.helpKey)).toBe(true);
        expect(settingTitle(def, ctx)).not.toMatch(/\{\w+\}/);
        expect(settingSubtitle(def, ctx).length).toBeGreaterThan(3);
        expect(settingSubtitle(def, ctx), def.id).not.toMatch(/\{\w+\}/);
        const c = def.control;
        if (c.kind === "action") expect(hasKey(`shell.settings.action.${c.action}`)).toBe(true);
        if (c.kind === "select" || c.kind === "chips" || c.kind === "segmented") {
          for (const o of c.options(ctx)) expect(o.label).not.toMatch(/^shell\./);
        }
      }
    }
  });

  // @req SET-001
  it("mirrors app-setting defaults and writes app patches", () => {
    const app = defaultAppSettings() as unknown as Record<string, unknown>;
    for (const def of allSettings().filter((d) => d.scope === "app" && d.default !== undefined)) {
      if (def.id.startsWith("sounds.")) continue;
      expect(def.default, def.id).toEqual(app[def.id]);
    }
    const ctx = ctxFor(commander);
    expect(getSetting("cardLayout")!.set!(ctx, "nameOnly")).toEqual({
      kind: "app",
      patch: { cardLayout: "nameOnly" },
    });
    expect(getSetting("sounds.volume")!.get!(ctx)).toBe(80);
    expect(getSetting("sounds.volume")!.set!(ctx, 50)).toEqual({
      kind: "app",
      patch: { sounds: { volume: 0.5 } },
    });
  });

  // @req SET-011 @req GAME-013
  it("marks structural game rows and writes game drafts", () => {
    for (const id of ["preset", "players", "startValue", "thresholds", "counters"]) {
      expect(getSetting(id)!.structural, id).toBe(true);
    }
    for (const id of ["layout", "autoKO", "firstPlayerRule", "turnOrder"]) {
      expect(getSetting(id)!.structural ?? false, id).toBe(false);
    }
    const ctx = ctxFor(commander, { game: true });
    const start = getSetting("startValue")!;
    expect(start.get!(ctx)).toBe(40);
    const change = start.set!(ctx, 30);
    expect(change.kind === "game" && change.draft.startOverrides).toEqual({ "mtg.life": 30 });
    const back = start.set!(
      { ...ctx, draft: { ...ctx.draft, startOverrides: { "mtg.life": 30 } } },
      40,
    );
    expect(back.kind === "game" && back.draft.startOverrides).toEqual({});
    const ko = getSetting("autoKO")!.set!(ctx, "prompt");
    expect(ko.kind === "game" && ko.draft.options.autoKO).toBe("prompt");
    expect(settingTitle(start, ctx)).toBe("Starting Life");
  });

  // @req LAY-001 @req PAY-001
  it("locks 7 and 8 players without Pro", () => {
    const c = getSetting("players")!.control;
    if (c.kind !== "chips") throw new Error("players is a chip row");
    const free = c.options(ctxFor(commander));
    expect(free.filter((o) => o.locked).map((o) => o.value)).toEqual([7, 8]);
    expect(c.options(ctxFor(commander, { pro: true })).some((o) => o.locked)).toBe(false);
  });

  it("builds the Auto-KO subtitle from the preset thresholds", () => {
    expect(thresholdSourceList(commander)).toBe("life, poison, or commander damage");
    expect(settingSubtitle(getSetting("autoKO")!, ctxFor(commander))).toContain(
      "life, poison, or commander damage",
    );
    expect(thresholdSourceList(constructed)).toBe("life or poison");
  });

  it("disables unsupported device rows and P2 rows", () => {
    const ctx = {
      ...ctxFor(commander),
      env: { haptics: false, fullscreen: false, standalone: true },
    };
    expect(getSetting("haptics")!.disabledIf!(ctx)).toBe("shell.settings.badge.unsupported");
    expect(getSetting("hideSystemBars")!.disabledIf!(ctx)).toBe(
      "shell.settings.badge.installForFullscreen",
    );
    expect(ids(ctx)).not.toContain("install");
    expect(getSetting("planechase")!.disabledIf!(ctx)).toBe("shell.settings.badge.p2");
    expect(getSetting("profiles")!.disabledIf!(ctx)).toBeNull();
    expect(getSetting("myImages")!.disabledIf!(ctx)).toBe("shell.settings.badge.soon");
    // @req CUS-001 G-row entry points to the builder, account and feedback pages
    expect(getSetting("myPresets")!.disabledIf!(ctx)).toBeNull();
    expect(getSetting("myPresets")!.control).toEqual({ kind: "link", href: "/builder" });
    for (const id of ["signIn", "exportData", "removeData", "deleteAccount"])
      expect(getSetting(id)!.control).toEqual({ kind: "link", href: "/account" });
    for (const id of ["feedback", "diagnostics"])
      expect(getSetting(id)!.control).toEqual({ kind: "link", href: "/feedback" });
    expect(AVAILABLE_ROUTES).toEqual(expect.arrayContaining(["/builder", "/account", "/feedback"]));
    expect(getSetting("about")!.get!(ctx)).toBe("Version 1.2.3");
  });

  it("lets other lanes register and replace rows (section C)", () => {
    expect(visibleSettings("C", ctxFor(commander)).map((r) => r.id)).toEqual(["timer.mode"]);
    registerSettings([
      { ...getSetting("timer.mode")!, subtitleKey: "shell.settings.layout.subtitle" },
      {
        id: "timer.test",
        scope: "game",
        section: "C",
        control: { kind: "toggle" },
        titleKey: "shell.settings.layout.title",
        subtitleKey: "shell.settings.layout.subtitle",
      },
    ]);
    const c = visibleSettings("C", ctxFor(commander));
    expect(c.map((r) => r.id)).toEqual(["timer.mode", "timer.test"]);
    expect(c[0]!.subtitleKey).toBe("shell.settings.layout.subtitle");
    unregisterSettings(["timer.test"]);
    registerSettings([
      { ...getSetting("timer.mode")!, subtitleKey: "shell.settings.timerMode.subtitle" },
    ]);
    expect(visibleSettings("C", ctxFor(commander)).map((r) => r.id)).toEqual(["timer.mode"]);
  });
});

describe("per-seat overrides row (PRE-013)", () => {
  // @req PRE-013 @req GAME-013
  it("shows Per-player starting values for perSeatStart / perSeatOverride presets", () => {
    const swu = getBuiltInPreset("swu.premier")!;
    const op = getBuiltInPreset("onepiece.standard")!;
    expect(hasPerSeatOverrides(swu)).toBe(true);
    expect(hasPerSeatOverrides(op)).toBe(true);
    expect(hasPerSeatOverrides(commander)).toBe(false);
    const row = getSetting("perSeatStart")!;
    const game = createGame({ preset: swu, players: 2 }, seededRng(1), 1);
    const ctx = ctxFor(swu);
    expect(row.visibleIf!(swu, game, ctx)).toBe(true);
    expect(row.visibleIf!(swu, null, ctx)).toBe(false);
    expect(row.visibleIf!(commander, game, ctx)).toBe(false);
  });
});
