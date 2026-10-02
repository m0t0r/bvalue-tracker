import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgress } from "./hooks";

// Every value a drawing was given, render by render: what the reader could have seen.
const drawn = (initial: boolean, ms = 1000) => {
  const seen: [on: boolean, p: number][] = [];
  const view = renderHook(
    ({ on, over = ms }: { on: boolean; over?: number }) => {
      const p = useProgress(on, over);
      seen.push([on, p]);
      return p;
    },
    { initialProps: { on: initial } as { on: boolean; over?: number } },
  );
  return { ...view, seen };
};
const frames = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const reducedMotion = (reduced: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  reducedMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useProgress", () => {
  it("stays at 0 while off and runs to 1 over its time once on", () => {
    const { result, rerender } = drawn(false);
    frames(500);
    expect(result.current).toBe(0);
    rerender({ on: true });
    expect(result.current).toBe(0);
    frames(500);
    expect(result.current).toBeGreaterThan(0.4);
    expect(result.current).toBeLessThan(0.6);
    frames(600);
    expect(result.current).toBe(1);
  });

  it("is 0 in the very render that turns it off, and a replay starts from 0", () => {
    const { result, rerender, seen } = drawn(true);
    frames(1100);
    expect(result.current).toBe(1);
    rerender({ on: false });
    rerender({ on: true });
    frames(100);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(0.2);
    // No render ever drew an off drawing as anything but empty, nor a replay from the last run's end.
    expect(seen.filter(([on, p]) => !on && p !== 0)).toEqual([]);
    const replay = seen.slice(seen.map(([on]) => on).lastIndexOf(false) + 1);
    expect(replay[0]).toEqual([true, 0]);
    expect(replay.every(([, p]) => p < 0.2)).toBe(true);
  });

  it("starts again from 0 when its time changes under way, in that render", () => {
    const { result, rerender } = drawn(true);
    frames(500);
    expect(result.current).toBeGreaterThan(0.4);
    rerender({ on: true, over: 2000 });
    expect(result.current).toBe(0);
    frames(500);
    expect(result.current).toBeGreaterThan(0.2);
    expect(result.current).toBeLessThan(0.3);
  });

  it("leaves no frame pending once it is off or gone", () => {
    const { rerender, unmount } = drawn(true);
    frames(100);
    rerender({ on: false });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ on: true });
    frames(100);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the finished drawing at once to a reader who asked for less motion", () => {
    reducedMotion(true);
    const { result, rerender, seen } = drawn(false);
    expect(result.current).toBe(0);
    rerender({ on: true });
    expect(result.current).toBe(1);
    expect(seen.filter(([on]) => on).every(([, p]) => p === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    rerender({ on: false });
    expect(result.current).toBe(0);
  });
});
