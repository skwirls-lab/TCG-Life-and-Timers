"use client";
/**
 * Wires the breadcrumb trail (./trail.ts) to the Next router. `NavTracker` (mounted once in the
 * root layout) records every route change; `useUpNavigation()` returns the Back handler pages use.
 * The trail is kept in sessionStorage so a reload keeps it; access is guarded (private mode).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { backPlan, visit, type NavKind, type TrailEntry } from "./trail";

const KEY = "tcg.nav.trail.v1";
let memory: TrailEntry[] | null = null;
/** Set right before Back calls router.replace(). */
let replacing = false;
/** Set by popstate (browser Back/Forward, router.back()) before the route change is rendered. */
let popped = false;
/** Set when this document came from a full page load that wasn't Back/Forward (see NavKind). */
let loaded = false;
let listening = false;

function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", () => {
    popped = true;
  });
  // A full page load that came from Back/Forward counts as a pop too. Any other full load (and a
  // reload of a page another site sent us to) may sit on top of another site's history entry.
  try {
    const type = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming)
      ?.type;
    if (type === "back_forward") popped = true;
    else if (
      type === "navigate" ||
      (type === "reload" && !!document.referrer && !document.referrer.startsWith(location.origin))
    )
      loaded = true;
  } catch {
    /* no Navigation Timing: treat the first load as a push */
  }
}

function load(): TrailEntry[] {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    memory = Array.isArray(parsed) ? (parsed as TrailEntry[]) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function save(trail: TrailEntry[]): void {
  memory = trail;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    /* storage unavailable: the in-memory trail still works for this tab */
  }
}

export function recordVisit(path: string, href: string): void {
  const kind: NavKind = replacing ? "replace" : popped ? "pop" : loaded ? "load" : "push";
  replacing = false;
  popped = false;
  loaded = false;
  save(visit(load(), path, href, kind));
}

/** Test/diagnostic access. */
export function currentTrail(): readonly TrailEntry[] {
  return load();
}

/** Records route changes into the trail. Render once, inside a Suspense boundary. */
export function NavTracker(): null {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(listen, []);
  useEffect(() => {
    if (!pathname) return;
    const q = search?.toString();
    recordVisit(pathname, q ? `${pathname}?${q}` : pathname);
  }, [pathname, search]);
  return null;
}

/** router.replace that the trail records as a replace (e.g. dropping a handled query string). */
export function replaceRoute(router: { replace: (href: string) => void }, href: string): void {
  replacing = true;
  router.replace(href);
}

/**
 * The in-app Back: retraces the loop-free trail, else goes up to the page's parent (or to
 * `fallbackHref` when given).
 */
export function useUpNavigation(fallbackHref?: string): () => void {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  return useCallback(() => {
    let plan = backPlan(load(), pathname);
    if (fallbackHref && plan.kind === "replace" && load().length < 2) {
      plan = { kind: "replace", href: fallbackHref };
    }
    if (plan.kind === "history") router.back();
    else if (plan.kind === "replace") {
      replacing = true;
      router.replace(plan.href);
    }
  }, [router, pathname, fallbackHref]);
}
