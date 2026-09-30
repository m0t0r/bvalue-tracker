import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/**
 * Switches to the other theme. Both pages draw it into their HTML before anything knows the theme
 * (`src/static-shell.tsx`), so its icon and name are chosen by the `dark` class, not by React: it must
 * show and say the right one from the first paint, and React hydrates it without redrawing it.
 */
export function ThemeButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant="outline" size="icon-sm-touch" onClick={onClick}>
      {/* The hidden half is out of the accessibility tree too. */}
      <span className="contents not-dark:hidden">
        <SunIcon />
        <span className="sr-only">{t.themeToLight}</span>
      </span>
      <span className="contents dark:hidden">
        <MoonIcon />
        <span className="sr-only">{t.themeToDark}</span>
      </span>
    </Button>
  );
}
