// @req PERF-003
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { lazyComponent } from "./lazyComponent";

function Hello({ name }: { name: string }) {
  return <p>hello {name}</p>;
}

describe("lazyComponent (PERF-003)", () => {
  it("renders nothing until loaded, then the component; later mounts are synchronous", async () => {
    const load = vi.fn(async () => Hello);
    const Lazy = lazyComponent(load);
    const first = render(<Lazy name="a" />);
    expect(first.container.textContent).toBe("");
    await waitFor(() => expect(screen.getByText("hello a")).toBeTruthy());
    first.unmount();
    const second = render(<Lazy name="b" />);
    expect(second.container.textContent).toBe("hello b");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("preload warms the cache and retries after a failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let fail = true;
    const Lazy = lazyComponent(async () => {
      if (fail) throw new Error("offline");
      return Hello;
    });
    await expect(Lazy.preload()).rejects.toThrow("offline");
    const r = render(<Lazy name="x" />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    r.unmount();
    fail = false;
    await Lazy.preload();
    expect(render(<Lazy name="y" />).container.textContent).toBe("hello y");
    warn.mockRestore();
  });
});
