import type { ReactNode } from "react";
import { LanguageButton } from "@/components/language-button";
import { ThemeButton } from "@/components/theme-button";

/**
 * What both pages are drawn inside: the column's width and gutters, and the page's one numeral style.
 * The pixel background reads where the cards' column lies (`src/backdrop`), so a page that drew its
 * own frame could move it. The headers (`MonitorShell`, `InsightsShell`) are drawn into the HTML by
 * the build as well, and this is markup with no state, so it is the same there and in the page.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 px-4 py-8 tabular-nums sm:px-6">{children}</div>
  );
}

/**
 * The controls every page's header ends in, at its trailing edge: the language and the theme.
 * `children` come before them, for the page's own (the monitor's link to `/insights`).
 */
export function HeaderControls({ onToggleTheme, children }: { onToggleTheme: () => void; children?: ReactNode }) {
  return (
    <div className="ms-auto flex items-center gap-2">
      {children}
      {/* The `-touch` sizes: on touch the controls grow to 40px, and the hit area to 44px, instead of relying on an invisible hit area alone. */}
      <LanguageButton />
      <ThemeButton onClick={onToggleTheme} />
    </div>
  );
}
