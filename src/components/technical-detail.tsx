import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useI18n } from "@/lib/i18n";

/** The collapsed "Detalle técnico" under a plain-language message: a raw error string, or the test behind a sentence. */
export function TechnicalDetail({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Collapsible className="flex flex-col items-start gap-1">
      <CollapsibleTrigger asChild>
        <Button variant="link" size="sm" // On touch the trigger itself grows to 40px, and its hit area to 44px, like the page's other controls.
          className="group h-auto p-0 text-xs text-muted-foreground has-data-[icon=inline-start]:pl-0 pointer-coarse:h-10 pointer-coarse:pr-4 pointer-coarse:text-sm pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-0.5">
          <ChevronRightIcon data-icon="inline-start" className="transition-transform duration-150 ease-out group-data-[state=open]:rotate-90" />
          {t.technicalDetail}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="text-xs break-words">{children}</CollapsibleContent>
    </Collapsible>
  );
}
