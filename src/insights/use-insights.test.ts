import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSIGHTS_LOAD } from "../../core/page-data";
import { useInsights } from "./use-insights";

afterEach(() => vi.unstubAllGlobals());

describe("useInsights", () => {
  // insights.html preloads INSIGHTS_LOAD on a wide screen. A request the page makes that is not in
  // it is simply not preloaded; one in it that the page no longer makes is downloaded for nothing
  // and warned about in the console. So the two must be the same set.
  it("asks for exactly what insights.html preloads", async () => {
    const asked: string[] = [];
    // Never answers: only the requests matter here, not what the page computes from them.
    vi.stubGlobal("fetch", (url: string) => {
      asked.push(url);
      return new Promise(() => {});
    });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    renderHook(() => useInsights(), { wrapper });
    await waitFor(() => expect(asked).toHaveLength(INSIGHTS_LOAD.length));
    expect([...asked].sort()).toEqual([...INSIGHTS_LOAD].sort());
    client.clear();
  });
});
