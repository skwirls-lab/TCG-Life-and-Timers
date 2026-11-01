// @req PWA-004
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "./UpdatePrompt";
import { useActiveGameFlag } from "@/lib/app/activeGame";

function mockServiceWorker(waiting: { postMessage: ReturnType<typeof vi.fn> } | null) {
  const listeners: Record<string, () => void> = {};
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller: {},
      getRegistration: () => Promise.resolve({ waiting, addEventListener: () => {} }),
      addEventListener: (t: string, cb: () => void) => (listeners[t] = cb),
      removeEventListener: () => {},
    },
  });
  return listeners;
}

describe("UpdatePrompt", () => {
  afterEach(() => act(() => useActiveGameFlag.getState().setInProgress(false)));

  it("offers reload when a worker is waiting and no game is in progress", async () => {
    const waiting = { postMessage: vi.fn() };
    mockServiceWorker(waiting);
    render(<UpdatePrompt />);
    const btn = await screen.findByRole("button");
    act(() => btn.click());
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("stays hidden while a game is in progress", async () => {
    mockServiceWorker({ postMessage: vi.fn() });
    act(() => useActiveGameFlag.getState().setInProgress(true));
    render(<UpdatePrompt />);
    await waitFor(() => expect(screen.queryByTestId("update-prompt")).toBeNull());
  });

  it("does not reload on controllerchange unless the user asked", async () => {
    const listeners = mockServiceWorker(null);
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<UpdatePrompt />);
    await waitFor(() => expect(listeners.controllerchange).toBeDefined());
    act(() => listeners.controllerchange!());
    expect(reload).not.toHaveBeenCalled();
  });
});
