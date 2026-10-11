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
  // No refetch on returning to the tab (from 2026-10-11): the data changes only when someone syncs, and
  // the status poll, which resumes when the tab is shown, is what notices a sync and refetches events.
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry, refetchOnWindowFocus: false } },
});

// The built page has the header in its HTML, and React adopts it (`src/lib/hydrate.ts`).
mountPage(
  <PageRoot client={queryClient}>
    <App />
  </PageRoot>,
);
