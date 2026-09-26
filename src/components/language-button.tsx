import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** Switches the page to the other language. */
export function LanguageButton() {
  const { lang, setLang } = useI18n();
  const other = lang === "es" ? "en" : "es";
  return (
    <Button variant="outline" size="sm-touch" lang={other} onClick={() => setLang(other)}>
      {/* The code the page switches to, in its own language; the name spells it out, and keeps the
          code in it so a voice command for what is on screen still finds the button. */}
      {lang === "es" ? "EN" : "ES"}
      <span className="sr-only">{lang === "es" ? " (English)" : " (Español)"}</span>
    </Button>
  );
}
