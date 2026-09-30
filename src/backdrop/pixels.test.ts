import { describe, expect, it } from "vitest";
import { insightsCopy } from "@/insights/copy";
import { dicts } from "@/lib/i18n";
import { ZONE_IDS } from "../../core/zones";
import { glyph } from "./pixel-text";
import { fit, textAt } from "./pixels";

describe("the header's bitmap font", () => {
  // Every header the pixel font redraws on hover: each zone's title and subtitle on the monitor, and
  // /insights', in both languages, with the SGC's name where the subtitle's `{sgc}` stands. A letter
  // with no glyph would be a gap in the pixel line, where the page's own word is masked away.
  const headers = (["es", "en"] as const).flatMap((lang) => [
    ...ZONE_IDS.flatMap((zone) => [
      dicts[lang].zones[zone].title,
      dicts[lang].zones[zone].subtitle.replace("{sgc}", dicts[lang].sgcName),
    ]),
    insightsCopy[lang].title,
    insightsCopy[lang].subtitle.replace("{sgc}", insightsCopy[lang].sgcName),
  ]);

  it("has a glyph for every character of every header, in both languages", () => {
    const missing = new Set(
      headers.flatMap((text) => Array.from(text).filter((ch) => ch.trim() !== "" && glyph(ch) === null)),
    );
    expect([...missing]).toEqual([]);
  });

  it("keeps the lowercase narrower than the capitals, so a pixel word is no wider than the page's", () => {
    const width = (ch: string) => glyph(ch)!.width;
    expect(width("a")).toBeLessThan(width("A"));
    expect(width("i")).toBeLessThan(width("a"));
    expect(width("m")).toBe(5);
  });

  it("puts an accent above a lowercase letter, not on its body", () => {
    const o = glyph("o")!.rows;
    const ó = glyph("ó")!.rows;
    expect(ó.slice(2)).toEqual(o.slice(2));
    expect(ó.slice(0, 2).join("")).toContain("1");
    expect(o.slice(0, 2).join("")).not.toContain("1");
  });

  it("sets a comma on the baseline and below it, not above like a semicolon", () => {
    const rows = glyph(",")!.rows;
    // Rows 0–6 stand on the baseline; row 7 is the descender.
    expect(rows.length).toBe(8);
    expect(rows.slice(0, 5).join("")).not.toContain("1");
  });
});

describe("textAt: the header's switch as a timed scan", () => {
  const tween = { from: 0, to: 1, t0: 100, ms: 200 };

  it("holds its start until its delay has passed", () => {
    expect(textAt(tween, 50)).toBe(0);
    expect(textAt(tween, 100)).toBe(0);
  });

  it("lands exactly on its end, and stays there", () => {
    expect(textAt(tween, 300)).toBe(1);
    expect(textAt(tween, 10_000)).toBe(1);
  });

  it("moves only forward on the way in, and is part-way in the middle", () => {
    const samples = Array.from({ length: 21 }, (_, i) => textAt(tween, 100 + i * 10));
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    expect(textAt(tween, 200)).toBeGreaterThan(0.2);
    expect(textAt(tween, 200)).toBeLessThan(1);
  });

  it("goes back from wherever it was when retargeted half-way", () => {
    const back = { from: textAt(tween, 200), to: 0, t0: 200, ms: 100 };
    expect(textAt(back, 200)).toBe(textAt(tween, 200));
    expect(textAt(back, 300)).toBe(0);
  });

  it("jumps to its end with no duration (reduced motion)", () => {
    expect(textAt({ from: 0, to: 1, t0: 0, ms: 0 }, 0)).toBe(1);
  });
});

describe("fit: the swarm placed in its box", () => {
  const box: [number, number, number, number] = [100, 50, 300, 150];
  const swarm = Array.from({ length: 200 }, (_, i) => ({
    t: i,
    lon: -75.7 + (i % 20) * 0.005,
    lat: 3.8 + Math.floor(i / 20) * 0.005,
    mag: 2,
  }));

  it("puts the swarm inside the box", () => {
    const project = fit(swarm, box);
    for (const e of swarm) {
      const [x, y] = project(e.lon, e.lat);
      expect(x).toBeGreaterThanOrEqual(box[0] - 1e-9);
      expect(x).toBeLessThanOrEqual(box[2] + 1e-9);
      expect(y).toBeGreaterThanOrEqual(box[1] - 1e-9);
      expect(y).toBeLessThanOrEqual(box[3] + 1e-9);
    }
  });

  it("keeps north up and east right", () => {
    const project = fit(swarm, box);
    const [, south] = project(-75.7, 3.8);
    const [, north] = project(-75.7, 3.84);
    const [west] = project(-75.7, 3.8);
    const [east] = project(-75.61, 3.8);
    expect(north).toBeLessThan(south);
    expect(east).toBeGreaterThan(west);
  });

  it("does not let one stray event shrink the rest to a dot", () => {
    const stray = [...swarm, { t: 999, lon: -77, lat: 5.5, mag: 3 }];
    const width = (events: typeof swarm) => {
      const project = fit(events, box);
      return project(-75.605, 3.8)[0] - project(-75.7, 3.8)[0];
    };
    expect(width(stray)).toBeCloseTo(width(swarm), 6);
  });

  it("draws a swarm of one place as a point in the middle, not a division by zero", () => {
    const one = [{ t: 0, lon: -75.7, lat: 3.8, mag: 3 }];
    const [x, y] = fit(one, box)(-75.7, 3.8);
    expect(x).toBe(200);
    expect(y).toBe(100);
  });
});
