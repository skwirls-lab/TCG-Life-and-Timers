// @req INP-004 @req INP-001
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHold } from "./useHold";

function Probe(props: { onTap: () => void; onHold: () => void; repeat?: number; testId: string }) {
  const h = useHold({ delay: 500, onHold: props.onHold, onTap: props.onTap, repeat: props.repeat });
  return <div data-testid={props.testId} {...h} />;
}

describe("useHold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires tap on quick release", () => {
    const onTap = vi.fn();
    const onHold = vi.fn();
    const { getByTestId } = render(<Probe onTap={onTap} onHold={onHold} testId="a" />);
    fireEvent.pointerDown(getByTestId("a"), { pointerId: 1, clientX: 0, clientY: 0 });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerUp(getByTestId("a"), { pointerId: 1 });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onHold).not.toHaveBeenCalled();
  });

  it("fires hold then repeats, without a tap", () => {
    const onTap = vi.fn();
    const onHold = vi.fn();
    const { getByTestId } = render(<Probe onTap={onTap} onHold={onHold} repeat={400} testId="a" />);
    fireEvent.pointerDown(getByTestId("a"), { pointerId: 1 });
    act(() => vi.advanceTimersByTime(500));
    expect(onHold).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(800));
    expect(onHold).toHaveBeenCalledTimes(3);
    fireEvent.pointerUp(getByTestId("a"), { pointerId: 1 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it("cancels on movement", () => {
    const onTap = vi.fn();
    const onHold = vi.fn();
    const { getByTestId } = render(<Probe onTap={onTap} onHold={onHold} testId="a" />);
    fireEvent.pointerDown(getByTestId("a"), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(getByTestId("a"), { pointerId: 1, clientX: 40, clientY: 0 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(getByTestId("a"), { pointerId: 1 });
    expect(onHold).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });

  it("tracks independent elements concurrently", () => {
    const tapA = vi.fn();
    const tapB = vi.fn();
    const { getByTestId } = render(
      <>
        <Probe onTap={tapA} onHold={vi.fn()} testId="a" />
        <Probe onTap={tapB} onHold={vi.fn()} testId="b" />
      </>,
    );
    fireEvent.pointerDown(getByTestId("a"), { pointerId: 1 });
    fireEvent.pointerDown(getByTestId("b"), { pointerId: 2 });
    fireEvent.pointerUp(getByTestId("b"), { pointerId: 2 });
    fireEvent.pointerUp(getByTestId("a"), { pointerId: 1 });
    expect(tapA).toHaveBeenCalledTimes(1);
    expect(tapB).toHaveBeenCalledTimes(1);
  });
});
