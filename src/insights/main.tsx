import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { shouldRetry } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";
import { installErrorReporting } from "@/lib/report-error";
import { initTheme } from "@/lib/theme";
import { InsightsApp } from "./app";
import "../index.css";

initTheme();
installErrorReporting();

// The monitor's settings (src/main.tsx), so the two pages behave alike.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <InsightsApp />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
