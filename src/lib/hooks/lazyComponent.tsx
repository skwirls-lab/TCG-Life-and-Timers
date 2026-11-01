"use client";
/**
 * Code-split a client component without Suspense (PERF-003). `next/dynamic` / `React.lazy` reveal
 * suspended content through React's timer-throttled retry, which never fires while time is frozen
 * (e2e `page.clock`, timer specs). Here the module promise resolves into state (a microtask), the
 * loaded component is cached at module level so later mounts render synchronously, and
 * `preload()` lets the board warm sheets while idle. Renders nothing until loaded.
 */
import { useEffect, useState, type ComponentType } from "react";

export interface LazyComponent<P> {
  (props: P): React.ReactElement | null;
  preload: () => Promise<ComponentType<P>>;
}

export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
): LazyComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () => {
    pending ??= load().then(
      (c) => (loaded = c),
      (e: unknown) => {
        pending = null;
        throw e;
      },
    );
    return pending;
  };

  function Lazy(props: P) {
    const [Comp, setComp] = useState<ComponentType<P> | null>(() => loaded);
    useEffect(() => {
      if (Comp) return;
      let live = true;
      preload().then(
        (c) => live && setComp(() => c),
        (e: unknown) => console.warn("[lazy] chunk failed to load", e),
      );
      return () => {
        live = false;
      };
    }, [Comp]);
    return Comp ? <Comp {...props} /> : null;
  }
  Lazy.preload = preload;
  return Lazy;
}
