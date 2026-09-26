// The 3D block's committed fine ground (`src/insights/block3d/relief.bin.gz`) decodes to its grid.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { RELIEF, decodeHeights } from "../src/insights/block";

describe("the fine ground's file", () => {
  it("holds the whole grid, from the trench's floor to the highest peak", () => {
    const file = new URL("../src/insights/block3d/relief.bin.gz", import.meta.url);
    const heights = decodeHeights(new Uint8Array(gunzipSync(readFileSync(file))), RELIEF.nx);
    expect(heights).toHaveLength(RELIEF.nx * RELIEF.ny);
    expect(Math.min(...heights)).toBe(-4080);
    expect(Math.max(...heights)).toBe(5195);
  });
});
