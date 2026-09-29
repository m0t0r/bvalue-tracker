import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSIGHTS_LOAD } from "../../core/page-data";
import { useInsights } from "./use-insights";

afterEach(() => vi.unstubAllGlobals());

describe("useInsights", () => {
  // insights.html preloads INSIGHTS_LOAD at every width. A request the page makes that is not in
  // it is simply not preloaded; one in it that the page no longer makes is downloaded for nothing,
  // on a phone's connection too, and warned about in the console. So the two must be the same set.
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

  // docs/frontend.md: a failed refetch keeps the data, and the page must say it has stopped updating
  // rather than keep counting "the last 7 days" over a catalogue that stopped growing.
  it("dates the data a failed refetch left on screen, and forgets it once a refetch succeeds", async () => {
    let failing = false;
    const status = { lastSuccessfulRun: null, backfill: { done: 1, total: 1 } };
    vi.stubGlobal("fetch", async (url: string) => {
      if (failing) return new Response("{}", { status: 503 });
      const body = url.includes("/api/status") ? status : url.includes("/api/events") ? [] : {};
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useInsights(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.staleSince).toBeNull();
    const fetchedAt = client.getQueryState(["events", "tolima"])!.dataUpdatedAt;

    failing = true;
    await act(() => client.refetchQueries({ queryKey: ["events", "tolima"] }));
    await waitFor(() => expect(result.current.staleSince).toBe(fetchedAt));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).not.toBeNull();

    failing = false;
    await act(() => client.refetchQueries({ queryKey: ["events", "tolima"] }));
    await waitFor(() => expect(result.current.staleSince).toBeNull());
    client.clear();
  });
});
