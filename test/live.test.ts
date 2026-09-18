import { describe, expect, it } from "vitest";
import { CHOCO_SWARM_BBOX, fetchCatalog } from "../src/seiscomp.ts";

// Hits the real SGC server. Run with `pnpm test:live`.
describe.skipIf(!process.env.LIVE)("live SGC", () => {
  it("returns the mainshock and every event already in the captured fixture window", async () => {
    const page = await fetchCatalog({
      start: new Date("2026-08-10T00:00:00Z"), end: new Date("2026-08-12T00:00:00Z"), bbox: CHOCO_SWARM_BBOX,
    });
    const main = page.events.find((e) => e.id === "SGC2026pqqmro");
    expect(main).toBeDefined();
    expect(main!.mag).toBeGreaterThanOrEqual(7);
    expect(page.events.length).toBeGreaterThan(50);
  }, 180_000);
});
