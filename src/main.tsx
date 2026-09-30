import { QueryClient } from "@tanstack/react-query";
import { App } from "@/App";
import { shouldRetry } from "@/lib/api";
import { mountPage } from "@/lib/hydrate";
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
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } },
});

// The built page has the header in its HTML, and React adopts it (`src/lib/hydrate.ts`).
mountPage(
  <PageRoot client={queryClient}>
    <App />
  </PageRoot>,
);
