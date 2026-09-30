import { describe, expect, it } from "vitest";
import { questionsCopy } from "./copy";

describe("the questions tab's copy", () => {
  it("says 'inside the crust' about Chaparral only when the crustal rule holds, as the story does", () => {
    const es = questionsCopy.es.swarm.p1;
    const en = questionsCopy.en.swarm.p1;
    expect(es("20 de septiembre", 19, true, 40, "none")).toContain("dentro de la corteza");
    expect(es("20 de septiembre", 45, false, 40, "none")).not.toContain("corteza");
    expect(en("20 September", 19, true, 40, "none")).toContain("inside the crust");
    expect(en("20 September", 45, false, 40, "none")).not.toContain("crust");
  });

  it("counts the strong events after the mainshock, not since it, which would take it in", () => {
    const ref = { mag: 7.4, date: "10 de agosto", short: "10 ago" };
    expect(questionsCopy.es.stats.strongLabel(ref)).toBe("eventos de M4.0 o más después del M7.4");
    expect(questionsCopy.en.stats.strongLabel(ref)).toBe("events of M4.0 or more after the M7.4");
  });

  it("says two largest events of one magnitude as a tie, never as '0.0 above the next'", () => {
    for (const lang of ["es", "en"] as const) {
      const state = questionsCopy[lang].swarm.state;
      expect(state("none", 4.5, 0)).not.toContain("0.0");
      expect(state("none", 4.5, 0)).toMatch(/misma magnitud|same size/);
      expect(state("none", 4.5, 0)).toContain("M4.5");
      expect(state("none", 4.5, 0.3)).toContain("0.3");
    }
  });

  it("never lets a figure part from its unit 's' at a line break", () => {
    for (const lang of ["es", "en"] as const) {
      expect(questionsCopy[lang].far.arrives(19)).toMatch(/19 s$/);
      expect(questionsCopy[lang].far.raceAria(19, 33)).toContain("33 s");
    }
  });
});
