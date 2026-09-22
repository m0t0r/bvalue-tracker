import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useI18n } from "@/lib/i18n";

/**
 * The collapsed "Detalle técnico" under a plain-language message: a raw error string, the test behind a
 * sentence, or the fine print under a headline number. `size` sets the body's type size — prose the
 * reader is meant to sit and read takes `sm`; the default `xs` suits a short string.
 */
export function TechnicalDetail({ children, size = "xs" }: { children: ReactNode; size?: "xs" | "sm" }) {
  const { t } = useI18n();
  return (
    <Collapsible className="flex flex-col items-start gap-1">
      <CollapsibleTrigger asChild>
        <Button variant="link-muted" size="inline-touch" className="group">
          <ChevronRightIcon data-icon="inline-start" className="transition-transform duration-150 ease-out group-data-[state=open]:rotate-90" />
          {t.technicalDetail}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={size === "sm" ? "text-sm break-words" : "text-xs break-words"}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
