import { QueryClient } from "@tanstack/react-query";
import { shouldRetry } from "@/lib/api";
import { mountPage } from "@/lib/hydrate";
import { proto, seed } from "@/lib/local-first";
import { tqPersister, tqRestore } from "@/lib/tq-persist";
import { installErrorReporting } from "@/lib/report-error";
import { followSystemTheme } from "@/lib/theme";
import { PageRoot } from "@/page-root";
import { InsightsApp } from "./app";
import "../index.css";

followSystemTheme();
installErrorReporting();

// The monitor's settings (src/main.tsx), so the two pages behave alike.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry, ...tqPersister() } },
});

// PROTOTYPE: the last answers, if the browser kept them, go into the cache before the first render.
performance.mark("proto:entry");
const seeded = (await seed(queryClient)) || (await tqRestore(queryClient));
performance.mark("proto:seeded");
if (seeded) document.documentElement.dataset.seeded = "";
// The skeleton comes back if there was nothing to draw from, and in any case once the story is up.
if (!seeded) delete document.documentElement.dataset.local;
else setTimeout(() => delete document.documentElement.dataset.local, 3000);
if (proto("sw") && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");

// The built page has its header and skeleton in the HTML, and React adopts them, as on the monitor.
mountPage(
  <PageRoot client={queryClient}>
    <InsightsApp />
  </PageRoot>,
);
