import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useZoneState } from "./zone";

const at = (url: string) => window.history.replaceState(null, "", url);

afterEach(() => at("/"));

describe("useZoneState", () => {
  it("moves to the zone's own path on a switch, and back undoes it", async () => {
    at("/");
    const { result } = renderHook(() => useZoneState());
    act(() => result.current[1]("tolima"));
    expect(window.location.pathname).toBe("/tolima");
    expect(result.current[0]).toBe("tolima");
    act(() => result.current[1]("choco"));
    expect(window.location.pathname).toBe("/");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current[0]).toBe("tolima");
  });
});
