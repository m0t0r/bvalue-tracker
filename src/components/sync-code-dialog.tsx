import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n";
import type { Refusal } from "@/lib/sync-code";

const SLOTS = [0, 1, 2, 3];

/**
 * The 4-digit code "Sincronizar ahora" asks for until the Worker has accepted one (worker/sync-guard.ts).
 * It sends nothing by itself when the fourth digit lands: a slip on the last digit would cost one of
 * the three tries before a lock, so the press is the reader's, by the button or Enter. The form lives
 * inside the dialog's content, which Radix unmounts on close, so every opening starts empty.
 */
export function SyncCodeDialog({
  open,
  onOpenChange,
  refusal,
  pending,
  onSubmit,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Why the last code was turned away, said under the field; null before any. */
  refusal: Refusal | null;
  /** The press is under way: the code has gone and the Worker has not answered yet. */
  pending: boolean;
  onSubmit: (code: string) => void;
  /** Puts focus back where it belongs once the dialog has closed: it has no trigger for Radix to return to. */
  onClosed: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.syncCode.close}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <CodeForm refusal={refusal} pending={pending} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}

function CodeForm({
  refusal,
  pending,
  onSubmit,
}: {
  refusal: Refusal | null;
  pending: boolean;
  onSubmit: (code: string) => void;
}) {
  const { t } = useI18n();
  const errorId = useId();
  const [code, setCode] = useState("");
  // A new refusal empties the field for the next try, in the same render (not from an effect, which
  // would draw the turned-away digits once more).
  const [seen, setSeen] = useState(refusal);
  if (seen !== refusal) {
    setSeen(refusal);
    setCode("");
  }
  const message =
    refusal === null || refusal.kind === "ask"
      ? null
      : refusal.kind === "wrong"
        ? t.syncCode.wrong(refusal.attemptsLeft)
        : refusal.kind === "locked"
          ? t.syncCode.locked(refusal.minutes)
          : t.syncCode.unset;
  const complete = code.length === SLOTS.length;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (complete && !pending) onSubmit(code);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t.syncCode.title}</DialogTitle>
        <DialogDescription>{t.syncCode.description}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={message !== null}>
          <InputOTP
            maxLength={SLOTS.length}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={setCode}
            aria-label={t.syncCode.input}
            aria-invalid={message !== null}
            aria-describedby={message === null ? undefined : errorId}
          >
            <InputOTPGroup>
              {SLOTS.map((i) => (
                <InputOTPSlot key={i} index={i} aria-invalid={message !== null} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {message === null ? null : <FieldError id={errorId}>{message}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" size="default-touch" aria-disabled={!complete || pending} aria-busy={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {t.syncCode.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
