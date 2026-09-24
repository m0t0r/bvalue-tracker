import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAINSHOCK_MIN_GAP, mainshockId, zoneMainshock } from "../core/mainshock.ts";
import { MAINSHOCK_ID, parseCatalogHtml } from "../core/seiscomp.ts";

const fixture = parseCatalogHtml(
  readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8"),
).events;

const sgc = (id: string, mag: number, magType: string, status: "manual" | "automatic") => ({
  id,
  mag,
  magType,
  status,
});

describe("zoneMainshock on the captured Chocó catalogue", () => {
  // Recomputed independently in Python from the same 786 events, in exact decimals: the Mw 7.4
  // stands 2.5 above the two MLv 4.9 of 14 September.
  it("finds SGC's M7.4 by the rule alone, with no id pinned", () => {
    const r = zoneMainshock(fixture);
    expect(r.state).toBe("found");
    expect(mainshockId(r)).toBe(MAINSHOCK_ID);
    expect(r.gap).toBe(2.5);
    expect(r.runnerUp).toMatchObject({ mag: 4.9, magType: "MLv" });
  });

  it("uses a gap of 1.0", () => {
    expect(MAINSHOCK_MIN_GAP).toBe(1.0);
  });
});

describe("zoneMainshock on SGC's own fields", () => {
  // The five largest events of the Chaparral swarm on 2026-09-23 (local copy of production).
  const chaparral = [
    sgc("SGC2026stzmyx", 4.5, "M", "manual"),
    sgc("SGC2026sqogax", 4.2, "MLr", "manual"),
    sgc("SGC2026srevfk", 4.2, "MLr", "manual"),
    sgc("SGC2026stdmen", 4.2, "MLr", "manual"),
    sgc("SGC2026snrxex", 4.1, "MLv", "manual"),
  ];

  it("gives the Chaparral swarm no mainshock: its largest is 0.3 above the next", () => {
    const r = zoneMainshock(chaparral);
    expect(r).toMatchObject({ state: "none", gap: 0.3 });
    expect(mainshockId(r)).toBeNull();
  });

  it("reads SGC's `manual` as reviewed and anything else as not", () => {
    const big = (status: "manual" | "automatic") => zoneMainshock([...chaparral, sgc("X", 5.6, "Mw", status)]);
    expect(big("manual").state).toBe("found");
    expect(big("automatic").state).toBe("awaiting-review");
  });

  // Only a reviewed mainshock has an id to exclude or ring: one awaiting review is not called one.
  it("names no mainshock while the candidate awaits review", () => {
    expect(mainshockId(zoneMainshock([...chaparral, sgc("X", 5.6, "Mw", "automatic")]))).toBeNull();
  });
});
