import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { App } from "@/App";
import { I18nProvider } from "@/lib/i18n";

/** The monitor's whole tree, as `main.tsx` hydrates it over the static header (`src/lib/hydrate.ts`). */
export function PageRoot({ client }: { client: QueryClient }) {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        {/* No TooltipProvider here: the page's one tooltip (`InfoTip`) brings its own in a lazy chunk,
            and importing one here would put Radix's Popper, 14 kB gzipped, back in the first. */}
        <I18nProvider>
          <App />
        </I18nProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
