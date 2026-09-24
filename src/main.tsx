import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { shouldRetry } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";
import { installErrorReporting } from "@/lib/report-error";
import { initTheme } from "@/lib/theme";
import "./index.css";

initTheme();
// Before the first render, so a crash while mounting is reported too.
installErrorReporting();

const queryClient = new QueryClient({
  // refetchOnWindowFocus is left at the library default (true): a stale query refetches when the tab
  // becomes visible again. It was switched off here once, which left a background tab showing old data.
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
