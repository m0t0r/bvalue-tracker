import { Fragment, type ReactNode } from "react";

/**
 * A sentence from `copy.ts` with `{name}` placeholders, filled with the figures and coloured labels
 * the page computes. The copy stays whole sentences in each language, so word order is the
 * translation's, not the code's. A placeholder with no value is left visible, which a test would
 * catch sooner than a reader.
 */
export function Rich({ text, parts = {} }: { text: string; parts?: Record<string, ReactNode> }) {
  const pieces = text.split(/\{(\w+)\}/);
  return (
    <>
      {pieces.map((p, i) =>
        i % 2 === 0 ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <Fragment key={i}>{p in parts ? parts[p] : `{${p}}`}</Fragment>
        ),
      )}
    </>
  );
}

/** The placeholder names in a template, for the test that holds both languages to the same ones. */
export const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
