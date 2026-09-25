import { describe, expect, it } from "vitest";
import type { Felt } from "./claims";
import { insightsCopy, intensityName } from "./copy";

describe("intensityName", () => {
  // USGS's perceived-shaking terms for the Modified Mercalli scale, as its ShakeMap and PAGER
  // legends print them (checked 2026-09-24): II and III share "Weak", and X is written "X+".
  it("names each level as USGS does, in English", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => intensityName(l, "en"))).toEqual([
      { roman: "I", shaking: "not felt" },
      { roman: "II", shaking: "weak" },
      { roman: "III", shaking: "weak" },
      { roman: "IV", shaking: "light" },
      { roman: "V", shaking: "moderate" },
      { roman: "VI", shaking: "strong" },
      { roman: "VII", shaking: "very strong" },
      { roman: "VIII", shaking: "severe" },
      { roman: "IX", shaking: "violent" },
      { roman: "X+", shaking: "extreme" },
    ]);
  });

  it("and in Spanish, with the same numerals", () => {
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => intensityName(l, "es").shaking)).toEqual([
      "no sentido",
      "débil",
      "leve",
      "moderado",
      "fuerte",
      "muy fuerte",
      "severo",
      "violento",
      "extremo",
    ]);
    expect(intensityName(8, "es").roman).toBe("VIII");
  });

  it("keeps a level past the scale's ends on the scale: DYFI never goes under I, PAGER can pass X", () => {
    expect(intensityName(0, "en").roman).toBe("I");
    expect(intensityName(12, "en")).toEqual({ roman: "X+", shaking: "extreme" });
  });
});

const felt = (over: Partial<Felt>): Felt => ({
  reported: { level: 8, cdi: 8, responses: 41, updatedAt: "2026-09-23T20:15:00.000Z" },
  modelled: { level: 8, mmi: 8.43, updatedAt: "2026-08-12T02:00:00.000Z" },
  totalResponses: 1249,
  agreement: { case: "same", levels: 0 },
  usgsEventUrl: null,
  ...over,
});

describe("the felt sentences", () => {
  for (const lang of ["es", "en"] as const) {
    const c = insightsCopy[lang].claims;

    it(`${lang}: says the two agree only when they do, and by how much they differ otherwise`, () => {
      expect(c.feltAgreement(felt({}))).toContain("VIII");
      const one = c.feltAgreement(
        felt({
          reported: { level: 7, cdi: 7.3, responses: 9, updatedAt: "" },
          agreement: { case: "within-one", levels: 1 },
        }),
      );
      expect(one).toMatch(/VII\b.*VIII|VIII.*VII\b/);
      const lower = c.feltAgreement(
        felt({
          reported: { level: 6, cdi: 6, responses: 9, updatedAt: "" },
          agreement: { case: "lower", levels: 2 },
        }),
      );
      const higher = c.feltAgreement(
        felt({
          modelled: { level: 6, mmi: 6.1, updatedAt: "" },
          agreement: { case: "higher", levels: 2 },
        }),
      );
      expect(lower).toContain(lang === "es" ? "2 grados" : "2 levels");
      expect(lower).not.toBe(higher);
      expect(lower).toContain(lang === "es" ? "menos" : "less");
      expect(higher).toContain(lang === "es" ? "más" : "more");
    });

    it(`${lang}: credits USGS in the sentence comparing the two, whatever it says`, () => {
      for (const agreement of [
        { case: "same", levels: 0 },
        { case: "within-one", levels: 1 },
        { case: "lower", levels: 2 },
        { case: "higher", levels: 2 },
      ] as const)
        expect(c.feltAgreement(felt({ agreement }))).toContain("USGS");
    });

    it(`${lang}: credits USGS in every takeaway, and names the numeral the page shows`, () => {
      const cases = [
        felt({}),
        felt({ agreement: { case: "lower", levels: 2 }, reported: { level: 6, cdi: 6, responses: 9, updatedAt: "" } }),
        felt({ reported: null, agreement: null }),
        felt({ modelled: null, agreement: null }),
      ];
      for (const f of cases) {
        const t = c.feltTakeaway(f, 7.4);
        expect(t).toContain("USGS");
        expect(t).toContain(intensityName((f.reported ?? f.modelled)!.level, lang).roman);
        expect(t).toContain("M7.4");
      }
    });
  }
});

describe("the shaking question's count", () => {
  it("says one person in the singular", async () => {
    const { questionsCopy } = await import("./questions/copy");
    expect(questionsCopy.es.shaking.total(1)).toContain("1 persona le contó");
    expect(questionsCopy.en.shaking.total(1)).toContain("1 person told");
    expect(questionsCopy.es.shaking.total(1249)).toContain("personas le contaron");
  });
});

describe("the Spanish terms", () => {
  it("are not put in quotes, since they are the page's translation and not USGS's words", () => {
    const t = insightsCopy.es.claims.feltTakeaway(felt({}), 7.4);
    expect(t).toContain("VIII (severo)");
    expect(t).not.toContain("«");
  });
});
