import { describe, expect, it } from "vitest";
import { ZONE_IDS } from "../../core/zones.ts";
import { CADENCE, updateEveryMin } from "../../worker/plan.ts";
import { dicts, type Lang } from "./i18n.tsx";

/** The cron in wrangler.jsonc, in minutes. Chocó is asked on every tick, and the page quotes it. */
const CRON_EVERY_MIN = 15;

const langs = Object.keys(dicts) as Lang[];
const each = langs.flatMap((lang) => ZONE_IDS.map((zone) => [lang, zone] as const));

/**
 * The page used to quote the cron's five minutes in the failed-ingest alert, which is the
 * one state where the fast lane has stood down and five minutes is wrong (2026-09-20). It
 * was changed to fifteen, and then SGC started refusing us and the probe dropped to an
 * hour, so fifteen was wrong too. A cadence the reader cannot act on is not worth a number
 * that has to be kept in step with three lane rules: the alert says it retries by itself
 * and stops there. `autoUpdate`, under the button, is the ordinary cadence and keeps its
 * five — it is hidden while anything has failed.
 */
describe("the failed-ingest alert", () => {
  it.each(langs)("promises a retry without naming an interval, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).not.toMatch(/\d+\s*(min|minut)/i);
  });

  it.each(langs)("still tells the reader not to reload, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).toMatch(/recargar|reload/i);
  });
});

describe("the standing note under the refresh button", () => {
  // The interval is the Worker's, read from worker/plan.ts, never written into the copy.
  it("quotes the cron's own interval for Chocó, and the wide tick's for Chaparral", () => {
    expect(updateEveryMin("choco")).toBe(CRON_EVERY_MIN);
    expect(updateEveryMin("tolima")).toBe(30);
  });

  it.each(each)("names the zone's interval, in %s for %s", (lang, zone) => {
    expect(dicts[lang].autoUpdate(updateEveryMin(zone))).toMatch(new RegExp(`\\b${updateEveryMin(zone)} min`));
  });

  // The long form in the footer says the same thing at length, and drifted from it once.
  it.each(each)("says the same interval in the footer, in %s for %s", (lang, zone) => {
    expect(dicts[lang].autoUpdateLong(updateEveryMin(zone))).toMatch(new RegExp(`\\b${updateEveryMin(zone)} min`));
  });
});

/**
 * Three stand-down messages, three different truths. refreshWait claims SGC answered in the
 * last five minutes, so it must never appear beside the failure alert; refreshStillFailing
 * is what replaces it there, and must not tell the reader to try again — while SGC is
 * refusing us the Worker's own wait is an hour.
 */
describe("the stand-down messages", () => {
  // It names the visitor throttle, which is the zone's own period: the two are one number so
  // that a press coincides with a run that was going to happen anyway.
  it.each(ZONE_IDS)("hold %s's throttle to its own update interval", (zone) => {
    expect(CADENCE[zone].refreshMinIntervalS / 60).toBe(updateEveryMin(zone));
  });

  it.each(each)("keep refreshWait's claim of a recent successful query, in %s for %s", (lang, zone) => {
    const min = CADENCE[zone].refreshMinIntervalS / 60;
    expect(dicts[lang].refreshWait(min)).toMatch(new RegExp(`\\b${min} min`));
  });

  it.each(langs)("do not ask the reader to press again while SGC is failing, in %s", (lang) => {
    expect(dicts[lang].refreshStillFailing).not.toMatch(/inténtalo|intenta de nuevo|try again/i);
  });

  // It sits directly above the alert, which already owns "it retries by itself until SGC
  // answers". Checked in a browser: saying that twice, thirty pixels apart, reads as the
  // page repeating itself. This one says what the press did.
  it.each(langs)("say what the press did rather than repeating the alert, in %s", (lang) => {
    expect(dicts[lang].refreshStillFailing.length).toBeLessThan(dicts[lang].ingestFailedBody.length / 2);
  });
});

/**
 * Chaparral is a swarm, and SGC calls it one; Chocó is a mainshock–aftershock sequence, where
 * "enjambre" would read as wrong to a seismologist (docs/science.md). Each tab must use its own.
 */
describe("the two zones' names for themselves", () => {
  it("calls Chocó a sequence and Chaparral a swarm", () => {
    expect(dicts.es.zones.choco.title).toMatch(/secuencia/i);
    expect(dicts.es.zones.choco.title).not.toMatch(/enjambre/i);
    expect(dicts.es.zones.tolima.title).toMatch(/enjambre/i);
    expect(dicts.en.zones.tolima.title).toMatch(/swarm/i);
  });

  // A swarm has no mainshock: the map draws no ring, and the caveats say there is none.
  it.each(langs)("does not promise a mainshock on the Tolima tab, in %s", (lang) => {
    const c = dicts[lang].zones.tolima;
    expect(`${c.mapDesc} ${c.subtitle}`).not.toMatch(/sismo principal|mainshock|anillo|ring/i);
    expect(c.caveats.join(" ")).toMatch(/ningún sismo principal|no mainshock/i);
  });

  it.each(each)("never calls a figure a forecast without saying it is not one, in %s for %s", (lang, zone) => {
    expect(dicts[lang].zones[zone].caveats.join(" ")).toMatch(/no es un pronóstico|not a forecast/i);
  });
});
