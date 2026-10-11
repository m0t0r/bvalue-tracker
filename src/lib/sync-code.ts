import { HttpError, type SyncRefusal } from "@/lib/api";

/**
 * What the sync code's refusal means for the dialog that asks for it (worker/sync-guard.ts). `ask` is
 * no code or a malformed one: the dialog asks, with nothing to say. Anything else that fails a press is
 * not a refusal (null): the rate limit's 429, an outage, the connection. Those rest the button
 * (`refresh-backoff.ts`); a refusal never does, since nothing about it is a request failing.
 */
export type Refusal =
  | { kind: "wrong"; attemptsLeft: number }
  | { kind: "locked"; minutes: number }
  | { kind: "unset" }
  /** The page held the code from before the owner's last change: asked for the new one, not counted. */
  | { kind: "changed" }
  | { kind: "ask" };

export function refusalOf(err: unknown): Refusal | null {
  if (!(err instanceof HttpError) || typeof err.body !== "object" || err.body === null) return null;
  const body = err.body as Partial<SyncRefusal> & { attemptsLeft?: unknown; retryAfterS?: unknown };
  switch (body.error) {
    case "wrong sync code":
      return typeof body.attemptsLeft === "number" ? { kind: "wrong", attemptsLeft: body.attemptsLeft } : null;
    case "too many wrong sync codes":
      return typeof body.retryAfterS === "number"
        ? { kind: "locked", minutes: Math.max(1, Math.ceil(body.retryAfterS / 60)) }
        : null;
    case "sync code not set":
      return { kind: "unset" };
    case "sync code changed":
      return { kind: "changed" };
    case "sync code required":
    case "sync code must be 4 digits":
      return { kind: "ask" };
    default:
      return null;
  }
}

/**
 * The code the Worker last accepted, kept for the page's life so a second press, on either zone, does
 * not ask again. In memory only: never stored, so a reload asks again. Forgotten on any refusal.
 */
let accepted: string | null = null;
export const acceptedCode = () => accepted;
export const acceptCode = (code: string) => {
  accepted = code;
};
export const forgetCode = () => {
  accepted = null;
};
