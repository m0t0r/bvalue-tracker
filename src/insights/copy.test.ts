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

/**
 * USGS's forecast in words. The worked figures are the captured forecast's (week and month, M5 and
 * M6: 0.1478, 0.4347, 0.0173, 0.0609), shown as 15, 43, 2 and 6 %. The frequency is worked out from
 * the percentage shown, so one shown figure always reads the same, checked by hand: 100/15 = 6.7, so
 * "1 in 7"; 100/2 = 50; 100/6 = 16.7, so "1 in 17". Under 1%, where the figure is "less than 1%",
 * from the probability itself: 1/0.0033 = 303, so "1 in 300".
 */
describe("the forecast's chance sentence", () => {
  const es = insightsCopy.es.claims.forecastChance;
  const en = insightsCopy.en.claims.forecastChance;

  it("says the chance of at least one, in whole percent and as a natural frequency", () => {
    expect(es(0.1478)).toBe("La probabilidad de que haya al menos uno es del 15\u00A0%: alrededor de 1 de cada 7.");
    expect(es(0.4347)).toBe("La probabilidad de que haya al menos uno es del 43\u00A0%: unas 4 de cada 10.");
    expect(es(0.0173)).toBe("La probabilidad de que haya al menos uno es del 2\u00A0%: alrededor de 1 de cada 50.");
    expect(es(0.0609)).toBe("La probabilidad de que haya al menos uno es del 6\u00A0%: alrededor de 1 de cada 17.");
    expect(en(0.1478)).toBe("The chance of at least one is 15%: about 1 in 7.");
    expect(en(0.4347)).toBe("The chance of at least one is 43%: about 4 in 10.");
    expect(en(0.0609)).toBe("The chance of at least one is 6%: about 1 in 17.");
  });

  it("gives one shown percentage one phrase, whatever the decimals behind it", () => {
    // Each pair is shown as the same whole percent; code review, 2026-09-25.
    for (const [a, b] of [
      [0.196, 0.2],
      [0.446, 0.454],
      [0.146, 0.154],
      [0.945, 0.9549],
      [0.005, 0.0149],
    ])
      for (const lang of ["es", "en"] as const)
        expect(insightsCopy[lang].claims.forecastChance(a!)).toBe(insightsCopy[lang].claims.forecastChance(b!));
    // The same over every probability from 1%: the sentence depends on the shown percent alone.
    const seen = new Map<string, string>();
    for (let p = 0.005; p < 0.995; p += 0.0003) {
      const s = en(p);
      const shown = /is (\d+)%/.exec(s)![1]!;
      expect([shown, seen.get(shown) ?? s]).toEqual([shown, s]);
      seen.set(shown, s);
    }
  });

  it("holds each band's edges", () => {
    // Almost certain from a shown 95%: 94.5% is shown as 95%; 94.4% is shown as 94% and is 9 in 10.
    expect(es(0.95)).toBe("La probabilidad de que haya al menos uno es del 95\u00A0%: es casi seguro.");
    expect(es(0.945)).toBe("La probabilidad de que haya al menos uno es del 95\u00A0%: es casi seguro.");
    expect(es(0.944)).toBe("La probabilidad de que haya al menos uno es del 94\u00A0%: unas 9 de cada 10.");
    // "More than 99%" from 99.5%, where a whole percent would say 100.
    expect(es(0.995)).toBe("La probabilidad de que haya al menos uno es de más del 99\u00A0%: es casi seguro.");
    expect(es(0.9949)).toContain("es del 99\u00A0%");
    expect(en(0.9996)).toBe("The chance of at least one is over 99%: almost certain.");
    // Tenths from a shown 20% (19.5% is shown as 20%); below that, "1 in N".
    expect(es(0.195)).toContain("del 20\u00A0%: unas 2 de cada 10");
    expect(es(0.1949)).toContain("del 19\u00A0%: alrededor de 1 de cada 5");
    // A shown 45% is 5 in 10 (4.5 rounds up), whichever side of 45% the decimals sit.
    expect(es(0.446)).toContain("unas 5 de cada 10");
    // Under half a percent is "less than 1%", never "0%"; ≥ M7.4 in the month is 0.33%.
    expect(es(0.0033)).toBe(
      "La probabilidad de que haya al menos uno es de menos del 1\u00A0%: alrededor de 1 de cada 300.",
    );
    expect(en(0.0033)).toBe("The chance of at least one is less than 1%: about 1 in 300.");
    expect(es(0.005)).toBe("La probabilidad de que haya al menos uno es del 1\u00A0%: alrededor de 1 de cada 100.");
    // 1 in 1000 is the last frequency, written as the page writes every count; below, "less than".
    expect(es(0.001)).toContain("alrededor de 1 de cada 1000");
    expect(es(0.00099)).toContain("menos de 1 de cada 1000");
    expect(en(0.001)).toContain("about 1 in 1000");
    expect(en(0.00099)).toContain("less than 1 in 1000");
    expect(es(0)).toContain("menos del 1\u00A0%: menos de 1 de cada 1000");
  });

  it("never lets the frequency stray far from the percentage beside it", () => {
    // From 1% (below, the figure is only "less than 1%") to the last shown under 95%.
    for (let p = 0.005; p < 0.945; p += 0.0007) {
      const s = en(p);
      const shown = Number(/is (\d+)%/.exec(s)![1]) / 100;
      const m = /(\d+) in (\d+)/.exec(s)!;
      const implied = Number(m[1]) / Number(m[2]);
      expect(Math.abs(implied - shown)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(implied / shown).toBeGreaterThan(2 / 3);
      expect(implied / shown).toBeLessThan(1.5);
    }
  });
});

/**
 * The count, from USGS's median and 95% range. The first three are the captured forecast's own
 * (M6 in the week 0, 0–0; M6 in the month 0, 0–1; M5 in the month 0, 0–3), the next two its M4 rows
 * (week 1, 0–6; month 6, 1–18), which the page does not show but whose shape a later forecast can take.
 */
describe("the forecast's count sentence", () => {
  const es = insightsCopy.es.claims.forecastCount;
  const en = insightsCopy.en.claims.forecastCount;
  const row = (median: number, p95Min: number, p95Max: number) => ({ median, p95Min, p95Max });

  it("says the most likely number and USGS's range, without calling the range a second probability", () => {
    expect(es(row(0, 0, 0))).toBe("Lo más probable es que no haya ninguno.");
    expect(es(row(0, 0, 1))).toBe("Lo más probable es que no haya ninguno, aunque según el USGS podría haber uno.");
    expect(es(row(0, 0, 3))).toBe("Lo más probable es que no haya ninguno, aunque según el USGS podría haber hasta 3.");
    expect(es(row(1, 0, 6))).toBe("Lo más probable es que haya uno; según el USGS, podrían ser entre 0 y 6.");
    expect(es(row(6, 1, 18))).toBe("Lo más probable es que haya unos 6; según el USGS, entre 1 y 18.");
    expect(en(row(0, 0, 0))).toBe("Most likely none.");
    expect(en(row(0, 0, 1))).toBe("Most likely none, though USGS says there could be one.");
    expect(en(row(0, 0, 3))).toBe("Most likely none, though USGS says there could be up to 3.");
    expect(en(row(1, 0, 6))).toBe("Most likely one; USGS says between 0 and 6.");
    expect(en(row(6, 1, 18))).toBe("Most likely about 6; USGS says between 1 and 18.");
    for (const lang of ["es", "en"] as const)
      for (const r of [row(0, 0, 3), row(6, 1, 18)])
        expect(insightsCopy[lang].claims.forecastCount(r)).not.toMatch(/%/);
  });

  it("leaves out a range with nothing in it", () => {
    expect(es(row(1, 1, 1))).toBe("Lo más probable es que haya uno.");
    expect(en(row(2, 2, 2))).toBe("Most likely about 2.");
  });
});

describe("the forecast's other sentences", () => {
  it("explains a natural frequency with one the box shows, tenths first", () => {
    const es = insightsCopy.es.claims.forecastHowToRead;
    expect(es([0.1478, 0.0173, 0.4347, 0.0609])).toBe(
      "«4 de cada 10» quiere decir que, si este mismo periodo se repitiera 10 veces, en unas 4 habría al menos uno.",
    );
    expect(es([0.1478, 0.0173])).toBe(
      "«1 de cada 7» quiere decir que, si este mismo periodo se repitiera 7 veces, en una de ellas habría al menos uno.",
    );
    expect(insightsCopy.en.claims.forecastHowToRead([0.4347])).toBe(
      '"4 in 10" means that if this same period were repeated 10 times, about 4 of them would have at least one.',
    );
    expect(es([0.99, 0.0001])).toBe("");
  });

  it("gives the chance of one as large as the mainshock or larger, named by both of its window's dates", () => {
    const above = (lang: "es" | "en", probability: number, end: string) =>
      insightsCopy[lang].claims.forecastAbove({ magnitude: 7.4, probability }, "21 sept", end);
    expect(above("es", 0.0033, "22 oct")).toBe(
      "La probabilidad de que haya uno igual o mayor que el M7.4 entre el 21 sept y el 22 oct es de menos del 1\u00A0%: alrededor de 1 de cada 300.",
    );
    expect(above("en", 0.0171, "22 Sept 2027")).toBe(
      "The chance of one as large as the M7.4 or larger from 21 sept to 22 Sept 2027 is 2%: about 1 in 50.",
    );
  });
});

describe("the Spanish terms", () => {
  it("are not put in quotes, since they are the page's translation and not USGS's words", () => {
    const t = insightsCopy.es.claims.feltTakeaway(felt({}), 7.4);
    expect(t).toContain("VIII (severo)");
    expect(t).not.toContain("«");
  });
});
