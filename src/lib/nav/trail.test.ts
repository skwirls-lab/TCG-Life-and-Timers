import { describe, expect, it } from "vitest";
import { backPlan, normalizePath, parentOf, TRAIL_MAX, visit, type TrailEntry } from "./trail";

const walk = (...paths: string[]): TrailEntry[] =>
  paths.reduce<TrailEntry[]>((t, p) => visit(t, p.split("?")[0]!, p), []);

describe("in-app Back trail", () => {
  it("retraces forward navigation with real history", () => {
    const t = walk("/", "/settings", "/account");
    expect(t.map((e) => e.path)).toEqual(["/", "/settings", "/account"]);
    expect(backPlan(t, "/account")).toEqual({ kind: "history" });
    const back = visit(t, "/settings", "/settings", "pop");
    expect(back.map((e) => e.path)).toEqual(["/", "/settings"]);
    expect(backPlan(back, "/settings")).toEqual({ kind: "history" });
    expect(backPlan(visit(back, "/", "/", "pop"), "/")).toEqual({ kind: "none" });
  });

  it("a page that sends you back to where you were cuts the loop (no ping-pong)", () => {
    // Settings → Builder → (Builder sends you to) Settings → Builder → Back → Back
    const t = walk("/", "/settings", "/builder", "/settings", "/builder");
    expect(t.map((e) => e.path)).toEqual(["/", "/settings", "/builder"]);
    const onSettings = visit(t, "/settings", "/settings");
    expect(onSettings.map((e) => e.path)).toEqual(["/", "/settings"]);
    // a loop that never stepped back: history no longer mirrors the trail, so Back replaces
    const loop = walk("/", "/settings", "/profiles", "/builder", "/settings");
    expect(loop.map((e) => e.path)).toEqual(["/", "/settings"]);
    expect(backPlan(loop, "/settings")).toEqual({ kind: "replace", href: "/" });
  });

  it("going forward to the previous page is not a step back (history no longer mirrors)", () => {
    // Home → Settings → Builder → (link) Settings: Back must not pop history onto the Builder
    const t = visit(walk("/", "/settings", "/builder"), "/settings", "/settings", "push");
    expect(t.map((e) => e.path)).toEqual(["/", "/settings"]);
    expect(backPlan(t, "/settings")).toEqual({ kind: "replace", href: "/" });
  });

  it("Back by replace drops the page it leaves, so the trail never points down again", () => {
    // deep link /terms → Back replaces it with /about → Back → /settings → Back → Home
    let t = walk("/terms");
    expect(backPlan(t, "/terms")).toEqual({ kind: "replace", href: "/about" });
    t = visit(t, "/about", "/about", "replace");
    expect(t.map((e) => e.path)).toEqual(["/about"]);
    expect(backPlan(t, "/about")).toEqual({ kind: "replace", href: "/settings" });
    // replacing onto the previous trail page keeps it, unlinked from history
    const u = visit(
      walk("/", "/settings", "/builder", "/settings", "/builder"),
      "/settings",
      "/settings",
      "replace",
    );
    expect(u.map((e) => [e.path, e.linked])).toEqual([
      ["/", false],
      ["/settings", false],
    ]);
    // a pop to a page that isn't the previous one is kept but unlinked
    const v = visit(walk("/", "/settings"), "/history", "/history", "pop");
    expect(v.at(-1)).toMatchObject({ path: "/history", linked: false });
  });

  it("a full page load (e.g. back from Stripe Checkout) never pops history onto another site", () => {
    // Home → Settings → /pro (linked) → Stripe → full load of /pro?checkout=success
    const t = walk("/", "/settings", "/pro");
    expect(backPlan(t, "/pro")).toEqual({ kind: "history" });
    const returned = visit(t, "/pro", "/pro?checkout=success", "load");
    expect(returned.map((e) => [e.path, e.linked])).toEqual([
      ["/", false],
      ["/settings", true],
      ["/pro", false],
    ]);
    expect(backPlan(returned, "/pro")).toEqual({ kind: "replace", href: "/settings" });
    // Dropping the handled query keeps it unlinked.
    const stripped = visit(returned, "/pro", "/pro", "replace");
    expect(stripped.at(-1)).toEqual({ path: "/pro", href: "/pro", linked: false });
    expect(backPlan(stripped, "/pro")).toEqual({ kind: "replace", href: "/settings" });
    // ...and replacing onto Settings unlinks it too, so the next Back replaces again (Home).
    const onSettings = visit(stripped, "/settings", "/settings", "replace");
    expect(backPlan(onSettings, "/settings")).toEqual({ kind: "replace", href: "/" });
  });

  it("a full load of a new page (typed URL, external link) is appended unlinked", () => {
    const t = visit(walk("/", "/settings"), "/pro", "/pro?checkout=cancel", "load");
    expect(t.at(-1)).toMatchObject({ path: "/pro", linked: false });
    expect(backPlan(t, "/pro")).toEqual({ kind: "replace", href: "/settings" });
    // with no trail at all: the structural parent
    const fresh = visit([], "/pro", "/pro?checkout=success", "load");
    expect(backPlan(fresh, "/pro")).toEqual({ kind: "replace", href: "/settings" });
    // a load onto a page further down the trail cuts the loop, unlinked
    const loop = visit(walk("/", "/settings", "/pro"), "/settings", "/settings", "load");
    expect(loop.map((e) => [e.path, e.linked])).toEqual([
      ["/", false],
      ["/settings", false],
    ]);
    // a load is never mistaken for a step back
    const notPop = visit(walk("/", "/settings"), "/", "/", "load");
    expect(notPop.map((e) => e.path)).toEqual(["/"]);
  });

  it("with no trail, Back goes up the site structure to Home", () => {
    expect(backPlan([], "/terms")).toEqual({ kind: "replace", href: "/about" });
    expect(backPlan(walk("/about"), "/about")).toEqual({ kind: "replace", href: "/settings" });
    expect(backPlan(walk("/settings"), "/settings")).toEqual({ kind: "replace", href: "/" });
    expect(parentOf("/builder/edit")).toBe("/builder");
    expect(parentOf("/tools/mana/")).toBe("/tools");
    expect(parentOf("/p/abc123")).toBe("/");
    expect(parentOf("/unknown")).toBe("/");
    expect(parentOf("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });

  it("keeps the game's URL so Back returns to the same game", () => {
    const t = walk("/play?quick=mtg.commander", "/settings");
    expect(backPlan(t, "/settings")).toEqual({ kind: "history" });
    const replaced = visit(t, "/play", "/play?quick=mtg.commander");
    expect(replaced.at(-1)!.href).toBe("/play?quick=mtg.commander");
  });

  it("a query change on the same page only refreshes the href, and the trail is capped", () => {
    const t = walk("/", "/builder/edit?id=a", "/builder/edit?id=b");
    expect(t.map((e) => e.href)).toEqual(["/", "/builder/edit?id=b"]);
    const long = walk(...Array.from({ length: TRAIL_MAX + 5 }, (_, i) => `/p/${i}`));
    expect(long).toHaveLength(TRAIL_MAX);
    expect(long.at(-1)!.path).toBe(`/p/${TRAIL_MAX + 4}`);
  });
});
