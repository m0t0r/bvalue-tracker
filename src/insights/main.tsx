import { QueryClient } from "@tanstack/react-query";
import { shouldRetry } from "@/lib/api";
import { mountPage } from "@/lib/hydrate";
import { installErrorReporting } from "@/lib/report-error";
import { followSystemTheme } from "@/lib/theme";
import { PageRoot } from "@/page-root";
import { InsightsApp } from "./app";
import "../index.css";

followSystemTheme();
installErrorReporting();

// The monitor's settings (src/main.tsx), so the two pages behave alike.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } } });

// The built page has its header and skeleton in the HTML, and React adopts them, as on the monitor.
mountPage(
  <PageRoot client={queryClient}>
    <InsightsApp />
  </PageRoot>,
);
