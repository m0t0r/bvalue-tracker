/** Small building blocks the "Preguntas" tab's answers share. */
import { useCallback, useId, useState, type ReactNode } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { Source } from "../claims";
import { BG } from "../tones";

/**
 * The width of an element, following resizes. Drawings take their width from it and keep a fixed
 * height, so nothing below them moves when they measure.
 */
export function useWidth(fallback = 640): [(el: HTMLElement | null) => void, number] {
  const [w, setW] = useState(fallback);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** The frame an interactive sits in: a quiet surface that sets it apart from the prose. */
export function Figure({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="my-8 rounded-xl border bg-card p-4 text-card-foreground sm:p-6">
      {children}
      {caption ? (
        <figcaption className="mt-4 max-w-md text-xs text-pretty text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function P({ children }: { children: ReactNode }) {
  // A cap in pixels, not `ch`: Geist's narrow letters put 65ch at ~95 characters a line. 32rem is ~70.
  return <p className="mt-4 max-w-lg text-base/7 text-pretty first:mt-0">{children}</p>;
}

export function Takeaway({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-8 max-w-lg border-l-2 border-foreground pl-4">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-base/7 font-medium text-balance">{children}</p>
    </div>
  );
}

export function Swatch({ source, square = false }: { source: Source | "mainshock"; square?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0", square ? "rounded-xs" : "rounded-full", BG[source])}
    />
  );
}

/** A row of mutually exclusive choices, the 3D tab's toggles: one tab stop, arrows move within it. */
export function Choice<K extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: K;
  onChange: (k: K) => void;
  options: readonly { key: K; label: ReactNode }[];
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm-touch"
      spacing={1}
      aria-label={label}
      value={value}
      // Empty when the chosen one is pressed again: one is always chosen.
      onValueChange={(v) => v && onChange(v as K)}
      className="flex-wrap"
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.key} value={o.key}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A labelled slider with its value read out beside the label. The thumb is named by the label. */
export function RangeField(props: {
  /** The form name of Radix's hidden input (#73). */
  name: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel className="w-full justify-between">
        <span id={id} className="text-muted-foreground">
          {props.label}
        </span>
        <span className="font-semibold tabular-nums">{props.display}</span>
      </FieldLabel>
      <Slider
        name={props.name}
        aria-labelledby={id}
        aria-valuetext={props.display}
        min={props.min}
        max={props.max}
        step={props.step}
        value={[props.value]}
        onValueChange={([v]) => props.onChange(v ?? props.value)}
      />
    </Field>
  );
}
