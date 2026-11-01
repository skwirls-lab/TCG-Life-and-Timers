// @vitest-environment node
// @req ART-006
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestQueue, defaultSleep } from "./queue";

afterEach(() => vi.useRealTimers());

describe("createRequestQueue", () => {
  it("waits for the spacing between task starts using the injected clock", async () => {
    let t = 0;
    const waits: number[] = [];
    const q = createRequestQueue({
      spacingMs: 100,
      now: () => t,
      sleep: async (ms) => {
        waits.push(ms);
        t += ms;
      },
    });
    const starts: number[] = [];
    const task = async () => {
      starts.push(t);
      t += 30; // the request itself takes 30 ms
    };
    await Promise.all([q.run(task), q.run(task), q.run(task)]);
    expect(starts).toEqual([0, 100, 200]);
    expect(waits).toEqual([70, 70]);
    expect(q.pending).toBe(0);
  });

  it("does not wait when the previous start is old enough", async () => {
    let t = 0;
    const sleep = vi.fn(async () => {});
    const q = createRequestQueue({ now: () => t, sleep });
    await q.run(async () => {
      t += 500;
    });
    await q.run(async () => {});
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps running after a task rejects and tracks pending", async () => {
    const q = createRequestQueue({ spacingMs: 0 });
    const a = q.run(async () => {
      throw new Error("x");
    });
    const b = q.run(async () => 2);
    expect(q.pending).toBe(2);
    await expect(a).rejects.toThrow("x");
    await expect(b).resolves.toBe(2);
    expect(q.pending).toBe(0);
  });

  it("propagates task rejections through the abort-aware path", async () => {
    const q = createRequestQueue({ spacingMs: 0 });
    const ac = new AbortController();
    await expect(
      q.run(async () => {
        throw new Error("y");
      }, ac.signal),
    ).rejects.toThrow("y");
    await expect(q.run(async () => 3, ac.signal)).resolves.toBe(3);
  });

  it("throws synchronously-rejected AbortError for an already-aborted signal", () => {
    const q = createRequestQueue();
    const ac = new AbortController();
    ac.abort();
    expect(() => q.run(async () => 1, ac.signal)).toThrow(
      expect.objectContaining({ name: "AbortError" }),
    );
  });

  it("uses a custom abort reason when it is an AbortError", async () => {
    const q = createRequestQueue({ spacingMs: 0 });
    let release!: () => void;
    const blocker = q.run(() => new Promise<void>((r) => (release = r)));
    const ac = new AbortController();
    const reason = new DOMException("mine", "AbortError");
    const p = q.run(async () => 1, ac.signal);
    ac.abort(reason);
    await expect(p).rejects.toBe(reason);
    release();
    await blocker;
  });
});

describe("defaultSleep", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = defaultSleep(100).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it("rejects when aborted before or during the wait", async () => {
    const pre = new AbortController();
    pre.abort();
    await expect(defaultSleep(10, pre.signal)).rejects.toMatchObject({ name: "AbortError" });

    vi.useFakeTimers();
    const ac = new AbortController();
    const p = defaultSleep(1000, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves with a signal that never aborts", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const p = defaultSleep(5, ac.signal);
    await vi.advanceTimersByTimeAsync(5);
    await expect(p).resolves.toBeUndefined();
  });
});
