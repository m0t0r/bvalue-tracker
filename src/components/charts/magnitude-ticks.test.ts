import { describe, expect, it } from "vitest";
import recorded from "../../../test/fixtures/recharts-3.10.1-ticks.json";
import { magnitudeTicks } from "./magnitude-ticks";

// Recharts 3.10.1's own rule (`getTickValuesFixedDomain`), which the chart's labels followed before issue
// #118, recorded before the package was removed: for every one of `domains(2000)` where it gave whole
// tenths (`fixedDomain`), and for the two below where it did not (`offTenths`). How it was recorded, and
// why the generator here must not change without recording again: `recharts-3.10.1-ticks.recorder.txt`.
const recharts: Record<string, string> = recorded.fixedDomain;
const offTenths: Record<string, string> = recorded.offTenths;

const tenths = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

// A small deterministic generator, so a failure names the case that differs.
function* domains(runs: number) {
  let seed = 118;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let run = 0; run < runs; run++) {
    const lo = Math.round(rand() * 40) / 10;
    const hi = Math.round((lo + rand() * 60) * 10) / 10;
    yield { lo, hi, count: 2 + Math.floor(rand() * 10) };
  }
}

describe("the magnitude labels of 'Distribución frecuencia–magnitud'", () => {
  it("steps from the smallest magnitude by a round step, and ends on the largest", () => {
    expect(magnitudeTicks([1.9, 4.5], 8)).toEqual([1.9, 2.3, 2.7, 3.1, 3.5, 3.9, 4.3, 4.5]);
  });

  it("puts every label on a tenth, where Recharts' step of 0.95 or 0.09 did not", () => {
    // Chocó's whole catalogue: Recharts drew "1.8" at 1.75, "3.7" at 3.65.
    expect(offTenths["0.8,7.4,8"]).toBe("0.8,1.75,2.7,3.65,4.6,5.55,6.5,7.4");
    expect(magnitudeTicks([0.8, 7.4], 8)).toEqual([0.8, 1.8, 2.8, 3.8, 4.8, 5.8, 6.8, 7.4]);
    // A narrow catalogue: Recharts wrote "2.5" for both 2.45 and 2.54.
    expect(offTenths["2,2.6,8"]).toBe("2,2.09,2.18,2.27,2.36,2.45,2.54,2.6");
    expect(magnitudeTicks([2, 2.6], 8)).toEqual([2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6]);
  });

  it("gives one label for a single magnitude", () => {
    expect(magnitudeTicks([2.5, 2.5], 8)).toEqual([2.5]);
  });

  it("gives distinct labels, each on a tenth, never more than asked", () => {
    for (const { lo, hi, count } of domains(2000)) {
      const ticks = magnitudeTicks([lo, hi], count);
      const labels = ticks.map((v) => v.toFixed(1));
      expect(new Set(labels).size, `[${lo}, ${hi}] × ${count}`).toBe(labels.length);
      expect(ticks.every(tenths), `[${lo}, ${hi}] × ${count}`).toBe(true);
      expect(ticks.length, `[${lo}, ${hi}] × ${count}`).toBeLessThanOrEqual(Math.max(count, 2));
    }
  });

  it("chooses what Recharts' own rule chose wherever that was whole tenths", () => {
    let compared = 0;
    for (const { lo, hi, count } of domains(2000)) {
      const theirs = recharts[`${lo},${hi},${count}`];
      if (theirs === undefined) continue;
      compared++;
      expect(magnitudeTicks([lo, hi], count).join(","), `[${lo}, ${hi}] × ${count}`).toBe(theirs);
    }
    expect(compared).toBeGreaterThan(1000);
  });
});
