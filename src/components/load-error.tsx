import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The page's data failed to load: what happened, and a way out that is not a reload. The button is
 * the alert's `AlertAction`: beside the text from `sm`, under it on a phone. While the retry runs (with its own backoff, several seconds) the button
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
  /** The technical detail, where the page has one: after the button on a phone. */
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
      <AlertAction>
        <Button
          variant="outline"
          size="sm-touch"
          aria-disabled={retrying}
          aria-busy={retrying}
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
      </AlertAction>
      {/* After the action, so on a phone the fine print comes after the way out; from `sm` it sits
          under the description, the action beside both. */}
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  );
}
