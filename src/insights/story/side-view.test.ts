import captured from "../../../test/fixtures/api-events-2026-09-24.json";
import { describe, expect, it } from "vitest";
import { insights, type Catalogues } from "../claims";
import { overlaps, textBox } from "../place";
import { ARC_KM } from "./side";
import { sideLayout } from "./side-view";
import { storyCopy } from "./copy";

const NOW = Date.parse("2026-09-24T14:44:03Z");
const { distances } = insights(captured as Catalogues, NOW);
// The unit tests have no canvas: `textWidth`'s own fallback, as a stand-in face would give.
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.62;

describe("sideLayout on the 2026-09-24 fixture", () => {
  for (const small of [true, false]) {
    const at = small ? { width: 300, height: 340 } : { width: 690, height: 750 };
    const l = sideLayout(distances, { small, ...at, lang: "es", measure })!;
    const s = l.R / ARC_KM;

    it(`draws each line as long as its straight-line figure, at one scale (${small ? "phone" : "desktop"})`, () => {
      expect(l.foci).toHaveLength(3);
      for (const f of l.foci) expect(Math.hypot(l.P[0] - f.x, f.y - l.P[1]) / s).toBeCloseTo(f.km, 9);
      // The deep group is the deepest and, on the map, the nearest; here it is not the shortest line.
      const deep = l.foci.find((f) => f.source === "deep")!;
      const tolima = l.foci.find((f) => f.source === "tolima")!;
      expect(deep.y).toBeGreaterThan(tolima.y);
      expect(deep.km).toBeGreaterThan(tolima.km);
    });

    it(`keeps every mark and label inside the card, and the labels apart (${small ? "phone" : "desktop"})`, () => {
      const boxes = l.foci.map((f) =>
        textBox({ ...f.label, width: measure("126 km", l.fs), fontSize: l.fs, anchor: "end" }),
      );
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.y1).toBeLessThanOrEqual(l.height);
      }
      for (const f of l.foci) expect(f.y).toBeLessThan(l.height);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
      // The plot, the arc's reach included, takes at most a third of the drawing across.
      const reach = l.P[0] - Math.min(l.P[0] - l.R, ...l.foci.map((f) => f.x));
      expect(reach).toBeLessThanOrEqual(at.width * 0.33 + 1e-9);
    });
  }

  it("draws only the sources that have events, and nothing with none", () => {
    const noSwarm = sideLayout(
      { ...distances, tolima: null },
      { small: true, width: 300, height: 340, lang: "en", measure },
    );
    expect(noSwarm!.foci.map((f) => f.source)).toEqual(["shallow", "deep"]);
    expect(
      sideLayout(
        { shallow: null, deep: null, tolima: null },
        { small: false, width: 690, height: 750, lang: "en", measure },
      ),
    ).toBeNull();
  });

  it("moves a label down until it clears the one above when two foci sit close", () => {
    const d = distances.shallow!;
    const l = sideLayout(
      { shallow: d, deep: { ...d, hypocentralKm: d.hypocentralKm + 1, depthKm: d.depthKm + 1 }, tolima: null },
      { small: true, width: 300, height: 340, lang: "es", measure },
    )!;
    const [a, b] = l.foci.map((f) =>
      textBox({ ...f.label, width: measure("126 km", l.fs), fontSize: l.fs, anchor: "end" }),
    );
    expect(overlaps(a!, b!)).toBe(false);
    // Nor does either sit on the other's dot.
    for (const [box, other] of [
      [a!, l.foci[1]!],
      [b!, l.foci[0]!],
    ] as const) {
      const dot = { x0: other.x - l.dotR, x1: other.x + l.dotR, y0: other.y - l.dotR, y1: other.y + l.dotR };
      expect(overlaps(box, dot)).toBe(false);
    }
  });

  it("takes the long title only where it fits over the plot, so the title does not widen the card", () => {
    const at = { small: false, width: 690, height: 750, measure } as const;
    for (const lang of ["es", "en"] as const) {
      const l = sideLayout(distances, { ...at, lang })!;
      const c = storyCopy[lang].graphic;
      const long = measure(c.sideTitle, l.titleFs) + 2 * l.pad;
      expect(l.title).toBe(long <= l.width ? c.sideTitle : c.sideTitleShort);
    }
    // In a narrower face the long one fits, and is taken.
    const narrow = (text: string, fontSize: number) => text.length * fontSize * 0.3;
    const l = sideLayout(distances, { ...at, lang: "en", measure: narrow })!;
    expect(l.title).toBe(storyCopy.en.graphic.sideTitle);
  });

  it("leaves off the arc's figure where a deep source shrinks the arc until it would meet Pereira's name", () => {
    const d = distances.deep!;
    const deep = { ...d, hypocentralKm: 600, depthKm: 590 };
    const l = sideLayout(
      { shallow: null, deep, tolima: null },
      { small: false, width: 690, height: 750, lang: "es", measure },
    )!;
    expect(l.R).toBeLessThan(40);
    expect(l.arcLabel).toBe(false);
    expect(sideLayout(distances, { small: false, width: 690, height: 750, lang: "es", measure })!.arcLabel).toBe(true);
  });
});
