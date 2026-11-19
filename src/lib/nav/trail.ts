/**
 * In-app Back: a breadcrumb trail instead of raw browser history.
 *
 * Browser history ping-pongs when a page sends you to a page you came from (Settings → Builder →
 * Settings → Back → Builder → Back → Settings …). The trail records the pages you went through;
 * arriving at a page that is already on the trail cuts the trail back to it, so loops vanish and
 * Back always retraces a loop-free path to where you started. With no trail (deep link, reload of
 * an old tab) Back goes to the page's parent in the site structure, ending at Home.
 *
 * Pure functions here; `useUpNavigation` / `NavTracker` wire them to the router.
 */

export interface TrailEntry {
  /** pathname only; identifies the page */
  path: string;
  /** pathname + search, used to navigate back to it */
  href: string;
  /** true when the browser history entry right below this one is the previous trail entry */
  linked: boolean;
}

export const TRAIL_MAX = 20;

/** Structural parent of each page (where Back goes when there is no trail). */
const PARENTS: Record<string, string> = {
  "/setup": "/",
  "/play": "/",
  "/history": "/",
  "/tools": "/",
  "/tools/counters": "/tools",
  "/tools/mana": "/tools",
  "/profiles": "/",
  "/settings": "/",
  "/account": "/settings",
  "/about": "/settings",
  "/feedback": "/settings",
  "/whats-new": "/settings",
  "/images": "/settings",
  "/builder": "/settings",
  "/builder/edit": "/builder",
  "/pro": "/settings",
  "/privacy": "/about",
  "/terms": "/about",
};

export function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function parentOf(path: string): string {
  const p = normalizePath(path);
  if (p === "/") return "/";
  return PARENTS[p] ?? "/";
}

/**
 * How the route change happened: `push` (a link, router.push), `pop` (browser Back/Forward or
 * router.back()), or `replace` (the in-app Back replacing the current history entry).
 */
export type NavKind = "push" | "pop" | "replace";

/** Update the trail for a route change to `path` (`href` = path + search). */
export function visit(
  trail: readonly TrailEntry[],
  path: string,
  href: string,
  kind: NavKind = "push",
): TrailEntry[] {
  const p = normalizePath(path);
  // A replace swaps out the current page: it leaves the trail before we look at the target.
  const base = kind === "replace" ? trail.slice(0, -1) : trail;
  const top = base.at(-1);
  const unlinked = kind !== "push";
  if (top?.path === p) {
    // same page (a query change, a reload, or Back replaced us onto the previous trail page)
    return [...base.slice(0, -1), { ...top, href, linked: unlinked ? false : top.linked }];
  }
  if (kind === "pop" && base.at(-2)?.path === p) return base.slice(0, -1); // a real step back
  const at = base.findIndex((e) => e.path === p);
  if (at >= 0) {
    // revisiting a page on the trail: drop the loop; history no longer mirrors the trail here
    return [...base.slice(0, at), { ...base[at]!, href, linked: false }];
  }
  const next = [...base, { path: p, href, linked: !unlinked && base.length > 0 }];
  return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
}

export type BackPlan = { kind: "history" } | { kind: "replace"; href: string } | { kind: "none" };

/**
 * What Back on `path` should do: pop real history when it mirrors the trail, otherwise replace
 * the current entry with the previous trail page, or with the structural parent when there is no
 * trail. Home has nowhere to go back to.
 */
export function backPlan(trail: readonly TrailEntry[], path: string): BackPlan {
  const p = normalizePath(path);
  const top = trail.at(-1);
  const prev = trail.at(-2);
  if (top?.path === p && prev)
    return top.linked ? { kind: "history" } : { kind: "replace", href: prev.href };
  if (p === "/") return { kind: "none" };
  return { kind: "replace", href: parentOf(p) };
}
