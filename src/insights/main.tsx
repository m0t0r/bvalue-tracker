import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { shouldRetry } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";
import { installErrorReporting } from "@/lib/report-error";
import { followSystemTheme } from "@/lib/theme";
import { InsightsApp } from "./app";
import "../index.css";

followSystemTheme();
installErrorReporting();

// The monitor's settings (src/main.tsx), so the two pages behave alike.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* No TooltipProvider, as on the monitor (src/main.tsx): a tooltip brings its own, and
          importing one here put Radix's Popper, 14 kB gzipped, in this page's first chunk. */}
      <I18nProvider>
        <InsightsApp />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
