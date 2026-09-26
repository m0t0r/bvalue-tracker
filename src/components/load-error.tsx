import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The page's data failed to load: what happened, and a way out that is not a reload. The button
 * sits under the text rather than in `AlertAction`, whose corner slot is narrower than
 * "Reintentar" on a phone. While the retry runs (with its own backoff, several seconds) the button
 * says so and a press does nothing. `aria-disabled`, not `disabled`: a disabled button drops the
 * keyboard focus it holds to the page, and the reader would tab back from the top to try again.
 */
export function LoadError({
  title,
  body,
  retry,
  retrying,
  retryingLabel,
  onRetry,
  children,
}: {
  title: string;
  body: string;
  retry: string;
  retrying: boolean;
  retryingLabel: string;
  onRetry: () => void;
  /** Under the button: the technical detail, where the page has one. */
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col items-start gap-2">
          <span>{body}</span>
          <Button
            variant="outline"
            size="sm-touch"
            aria-disabled={retrying}
            onClick={() => {
              if (!retrying) onRetry();
            }}
          >
            {retrying ? (
              <Spinner data-icon="inline-start" aria-hidden="true" role={undefined} aria-label={undefined} />
            ) : (
              <RotateCwIcon data-icon="inline-start" />
            )}
            {retrying ? retryingLabel : retry}
          </Button>
          {children}
        </div>
      </AlertDescription>
    </Alert>
  );
}
