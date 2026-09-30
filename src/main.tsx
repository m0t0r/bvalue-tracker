import { QueryClient } from "@tanstack/react-query";
import { App } from "@/App";
import { getPath, shouldRetry } from "@/lib/api";
import { proto, warm } from "@/lib/local-first";
import { mountPage } from "@/lib/hydrate";
import { tqPersister, tqWarm } from "@/lib/tq-persist";
import { installErrorReporting } from "@/lib/report-error";
import { followSystemTheme } from "@/lib/theme";
import { PageRoot } from "@/page-root";
import "./index.css";

followSystemTheme();
// Before the first render, so a crash while mounting is reported too.
installErrorReporting();

const queryClient = new QueryClient({
  // refetchOnWindowFocus is left at the library default (true): a stale query refetches when the tab
  // becomes visible again. It was switched off here once, which left a background tab showing old data.
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry, ...tqPersister() } },
});

// The built page has the header in its HTML, and React adopts it (`src/lib/hydrate.ts`).
mountPage(
  <PageRoot client={queryClient}>
    <App />
  </PageRoot>,
);

// PROTOTYPE: once the monitor has loaded and is idle, fetch what /insights needs and the store lacks.
const idle = (run: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2000);
const whenLoaded = (run: () => void) =>
  document.readyState === "complete" ? run() : addEventListener("load", run, { once: true });
whenLoaded(() =>
  idle(() => {
    if (proto("warm")) void warm(getPath);
    if (proto("warm")) tqWarm(queryClient);
    // The files /insights loads, read off its HTML and fetched at low priority into the HTTP cache.
    if (proto("pre")) {
      void fetch("/insights")
        .then((res) => res.text())
        .then((html) => {
          for (const [, href] of html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)) {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = href!;
            document.head.append(link);
          }
        })
        .catch(() => {});
    }
    if (proto("sw") && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }),
);
