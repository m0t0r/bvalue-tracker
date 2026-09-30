import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";

/**
 * What both pages' trees sit in, as their `main.tsx` hydrates them over the static copy
 * (`src/lib/hydrate.ts`): the monitor's `App` and the insights page's `InsightsApp`.
 */
export function PageRoot({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        {/* No TooltipProvider here: the page's one tooltip (`InfoTip`) brings its own in a lazy chunk,
            and importing one here would put Radix's Popper, 14 kB gzipped, back in the first. */}
        <I18nProvider>{children}</I18nProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
