import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { shouldRetry } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";
import { installErrorReporting } from "@/lib/report-error";
import { followSystemTheme } from "@/lib/theme";
import "./index.css";

followSystemTheme();
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
      {/* No TooltipProvider here: the page's one tooltip (`InfoTip`) brings its own in a lazy chunk,
          and importing one here would put Radix's Popper, 14 kB gzipped, back in the first. */}
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
