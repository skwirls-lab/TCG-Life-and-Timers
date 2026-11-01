/**
 * Captures Android/Chromium's `beforeinstallprompt` as early as possible (instrumentation-client)
 * and suppresses the browser's own mini-infobar, so the app decides when to offer installation
 * (PWA-003: after the first completed game, never on first open).
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let captured = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function captureInstallPrompt(target: Window | undefined = globalThis.window): void {
  if (captured || !target) return;
  captured = true;
  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  target.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function deferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function wasInstalled(): boolean {
  return installed;
}

export function subscribeInstall(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Shows the native prompt once (the event can only be used once). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice;
  return choice.outcome;
}

export function resetInstallEventsForTests(): void {
  deferred = null;
  installed = false;
  captured = false;
  listeners.clear();
}
