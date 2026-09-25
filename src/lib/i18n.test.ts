import { describe, expect, it } from "vitest";
import { SHARE_META } from "../../core/zone-pages.ts";
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
  it("quotes the cron's own interval for Chaparral, and the wide tick's for Chocó", () => {
    expect(updateEveryMin("tolima")).toBe(CRON_EVERY_MIN);
    expect(updateEveryMin("choco")).toBe(30);
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
  it.each(langs)("does not promise a mainshock on the Tolima tab while it has none, in %s", (lang) => {
    const d = dicts[lang];
    expect(`${d.mapDesc} ${d.zones.tolima.subtitle}`).not.toMatch(/sismo principal|mainshock|anillo|ring/i);
    expect(d.zones.tolima.caveats("none").join(" ")).toMatch(/ningún sismo principal|no clearly dominant mainshock/i);
  });

  it.each(ZONE_IDS)("gives %s the same title in the tab and in a link preview", (zone) => {
    expect(dicts.es.zones[zone].docTitle).toBe(SHARE_META[zone].title);
  });
});

/**
 * The caveats follow the mainshock the page detects (`core/mainshock.ts`), not the one a zone's copy
 * was written about. Beside a notice about a mainshock, "no dominant event" would contradict it.
 */
describe("the caveats, for each state of the mainshock", () => {
  const STATES = ["found", "awaiting-review", "none"] as const;
  const all = langs.flatMap((lang) => ZONE_IDS.flatMap((zone) => STATES.map((m) => [lang, zone, m] as const)));

  it.each(all)("never call a figure a forecast without saying it is not one, in %s for %s (%s)", (lang, zone, m) => {
    expect(dicts[lang].zones[zone].caveats(m).join(" ")).toMatch(/no es un pronóstico|not a forecast/i);
  });

  it.each(all)("state the rule the page uses to name a mainshock, in %s for %s (%s)", (lang, zone, m) => {
    // The threshold is MAINSHOCK_MIN_GAP, written out: it is the one number the reader can check.
    expect(dicts[lang].zones[zone].caveats(m).join(" ")).toMatch(
      /al menos 1 unidad de magnitud|at least 1 magnitude unit/,
    );
  });

  it.each(langs)("say 'no dominant event' on the Tolima tab only while none is found, in %s", (lang) => {
    const c = dicts[lang].zones.tolima.caveats;
    const swarm = /ningún sismo principal|no clearly dominant mainshock/i;
    expect(c("none").join(" ")).toMatch(swarm);
    expect(c("found").join(" ")).not.toMatch(swarm);
    expect(c("awaiting-review").join(" ")).not.toMatch(swarm);
  });

  it.each(each)("warn about missed small events only once a mainshock is found, in %s for %s", (lang, zone) => {
    const c = dicts[lang].zones[zone].caveats;
    const after = dicts[lang].zones[zone].caveats("found").filter((s) => !c("none").includes(s));
    expect(after.join(" ")).toMatch(/se pierden eventos pequeños|small events are missed/);
  });
});

/**
 * The status bar's "Sismo principal" is on every tab in every state, so it must read as a reading of
 * the catalogue: never a forecast, never an alarm, and the one automatic state said to be one.
 */
describe("the mainshock stat", () => {
  const m = (lang: Lang) => dicts[lang].mainshock;
  const all = (lang: Lang) => [
    m(lang).label,
    m(lang).none,
    m(lang).gapHint("24 sept", "1.1"),
    m(lang).pendingHint("24 sept"),
    m(lang).noneHint("0.3"),
  ];

  it.each(langs)("never forecasts, in %s", (lang) => {
    for (const s of all(lang))
      expect(s).not.toMatch(/pronóstico|forecast|probab|próxim|next large|se espera|expected/i);
  });

  it.each(langs)("says an event awaiting review is automatic, in %s", (lang) => {
    expect(m(lang).pendingHint("24 sept")).toMatch(/automático|automatic/);
  });

  it.each(langs)("reads the swarm's state as 'none clear', never as 'swarm', in %s", (lang) => {
    // A gap under the threshold means no clear mainshock; it does not make a sequence a swarm.
    expect(`${m(lang).none} ${m(lang).noneHint("0.3")}`).toMatch(/claro|clear/i);
    expect(`${m(lang).none} ${m(lang).noneHint("0.3")}`).not.toMatch(/enjambre|swarm/i);
  });

  // With a mainshock in the status bar, the Tolima tab's "enjambre" needs its reason beside it.
  it.each(langs)("keeps the Tolima tab's name explained while something stands clear, in %s", (lang) => {
    const c = dicts[lang].zones.tolima.caveats;
    const keeps = /sigue llamando enjambre|keeps calling it a swarm/;
    expect(c("found").join(" ")).toMatch(keeps);
    expect(c("awaiting-review").join(" ")).toMatch(keeps);
    expect(c("none").join(" ")).not.toMatch(keeps);
  });
});
