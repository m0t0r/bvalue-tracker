import { describe, expect, it } from "vitest";
import { SHARE_META } from "../../core/zone-pages.ts";
import { ZONE_IDS } from "../../core/zones.ts";
import { CADENCE, updateEveryMin } from "../../worker/plan.ts";
import { dicts, type Lang } from "./i18n.tsx";
import { browserLang } from "./startup.ts";

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
 * and stops there. The ordinary cadence is stated once, in the footer (`autoUpdateLong`).
 */
describe("the failed-ingest alert", () => {
  it.each(langs)("promises a retry without naming an interval, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).not.toMatch(/\d+\s*(min|minut)/i);
  });

  it.each(langs)("still tells the reader not to reload, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).toMatch(/recargar|reload/i);
  });
});

/**
 * The note under the refresh button gives the last query that worked. Beside "La última consulta al
 * SGC falló" it must say so, or the two lines read as a contradiction.
 */
describe("the last-query note while a run has failed", () => {
  it.each(langs)("says the query it dates was the one that worked, at both widths, in %s", (lang) => {
    for (const label of [dicts[lang].lastUpdateOk, dicts[lang].lastUpdateOkShort])
      expect(label).toMatch(/correcta|successful|good/i);
  });
});

describe("the update interval in the footer", () => {
  // The interval is the Worker's, read from worker/plan.ts, never written into the copy.
  it("quotes the cron's own interval for Chaparral, and the wide tick's for Chocó", () => {
    expect(updateEveryMin("tolima")).toBe(CRON_EVERY_MIN);
    expect(updateEveryMin("choco")).toBe(30);
  });

  it.each(each)("names the zone's interval, in %s for %s", (lang, zone) => {
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
    for (const wait of [dicts[lang].refreshWait, dicts[lang].refreshWaitShort])
      expect(wait(min)).toMatch(new RegExp(`\\b${min}\\smin`));
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
/**
 * The filters take the same day in both fields, which is how one day is chosen, so the error may not
 * ask for "before"; and it names the fields by their labels, the words the reader sees (issue #141).
 */
describe("the date-order error", () => {
  it.each(langs)("names both fields by their labels and allows the same day, in %s", (lang) => {
    const t = dicts[lang];
    expect(t.dateOrder).toContain(t.from);
    expect(t.dateOrder).toContain(t.to);
    expect(t.dateOrder).not.toMatch(/anterior|before/);
  });
});

describe("the mainshock stat", () => {
  const m = (lang: Lang) => dicts[lang].mainshock;
  const all = (lang: Lang) => [
    m(lang).label,
    m(lang).none,
    m(lang).gapHint("24 sept", "1.1"),
    m(lang).pendingHint("24 sept"),
    m(lang).noneHint("0.3"),
    m(lang).gapHintShort("24 sept", "1.1"),
    m(lang).noneHintShort("0.3"),
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
    for (const hint of [m(lang).noneHint, m(lang).noneHintShort]) {
      expect(`${m(lang).none} ${hint("0.3")}`).toMatch(/claro|clear/i);
      expect(`${m(lang).none} ${hint("0.3")}`).not.toMatch(/enjambre|swarm/i);
    }
  });

  // Two events of one magnitude at the top read "solo 0.0 por encima del siguiente" (issue #141).
  it.each(langs)("says a tie as a tie, never as a gap of 0.0, in %s", (lang) => {
    for (const hint of [m(lang).noneHint, m(lang).noneHintShort]) {
      expect(hint("0.0")).not.toMatch(/0\.0/);
      expect(hint("0.0")).toMatch(/misma|iguales|same|equal/);
      expect(hint("0.1")).toContain("0.1");
    }
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

/**
 * The load error used to say "check your connection and reload" (2026-09-26). The page cannot tell
 * a dropped connection from a failing server, and the alert has its own retry button, so it
 * blames neither and never sends the reader to reload.
 */
describe("the load error", () => {
  it.each(langs)("does not send the reader to reload, in %s", (lang) => {
    expect(dicts[lang].loadFailedBody).not.toMatch(/recarg|reload/i);
    expect(dicts[lang].loadRetry).toBeTruthy();
    expect(dicts[lang].loadRetrying).toBeTruthy();
  });
});

/**
 * A refetch that fails keeps the figures on screen (`loadFailed`), and this line says how old they
 * are instead of the standing "Se actualiza sola cada N minutos", which had gone on promising updates
 * that were not arriving (2026-09-26). It dates the data and says it comes back by itself; the page
 * cannot tell the reader's connection from the server, so it blames neither, and there is nothing
 * for the reader to do.
 */
describe("the line for data that could not be updated", () => {
  it.each(langs)("dates the data by its time, and by its day only when that is not today, in %s", (lang) => {
    const today = dicts[lang].staleSince("12:35", null);
    const earlier = dicts[lang].staleSince("12:35", "25 sept");
    expect(today).toContain("12:35");
    expect(earlier).toContain("12:35");
    expect(earlier).toContain("25 sept");
  });

  it.each(langs)("names no interval and never sends the reader to reload, in %s", (lang) => {
    const s = dicts[lang].staleSince("12:35", null);
    expect(s).not.toMatch(/\d+\s*(min|minut)/i);
    expect(s).not.toMatch(/recarg|reload/i);
  });

  it.each(langs)("says the page picks up again by itself, in the standing note's own words, in %s", (lang) => {
    expect(dicts[lang].staleSince("12:35", null)).toMatch(/solas?|by (itself|themselves)/);
  });

  // The time is when the figures were fetched, not when anything was lost: status polls may still be
  // answering while one catalogue refetch fails (code review, 2026-09-26).
  it.each(langs)("dates the figures and claims no lost connection, in %s", (lang) => {
    const s = dicts[lang].staleSince("12:35", null);
    expect(s).not.toMatch(/conexi|connection|desde las|since/i);
    expect(s).toMatch(/las 12:35|from 12:35/);
  });
});

/** The empty state points at the one control that undoes every filter, by its own label. */
describe("the empty state", () => {
  it.each(langs)("names the clear-filters button as it is labelled, in %s", (lang) => {
    expect(dicts[lang].noEventsBody).toContain(dicts[lang].scopeClear);
  });
});

/** Figures and their units never part at a line break (docs/frontend.md): a no-break space before "km". */
describe("distances in the copy", () => {
  it.each(langs)("keep every number beside its unit, in %s", (lang) => {
    const d = dicts[lang];
    for (const s of [d.clustersDesc(60), d.clusterWhere.shallow(60), d.clusterWhere.deep(60)])
      expect(s).not.toMatch(/\d km/);
  });
});

describe("the language a first visit opens in", () => {
  it.each([
    [["es-CO", "en-US"], "es"],
    [["en-GB", "es"], "en"],
    [["ES-co"], "es"],
    [["pt-BR", "es-419", "en"], "es"],
    [["de-DE", "en"], "en"],
  ] as const)("follows the browser's first language the page has, %j → %s", (languages, lang) => {
    expect(browserLang(languages)).toBe(lang);
  });

  it.each([[["pt-BR", "fr"]], [[]], [[""]]])("falls back to English when the browser has neither, %j", (languages) => {
    expect(browserLang(languages)).toBe("en");
  });
});

/**
 * A press that fails never reached SGC: the request from the page to the Worker failed, which is the
 * connection or the Worker (an SGC failure comes back as a 200 with a failed run). The old copy, "No se
 * pudo consultar al SGC", blamed SGC for it.
 */
describe("a failed press on the refresh button", () => {
  it.each(langs)("does not blame SGC, in %s", (lang) => {
    expect(dicts[lang].refreshFailed).not.toMatch(/SGC/);
  });

  // The button rests after a failure (`refresh-backoff.ts`); the line says for how long, on screen as a
  // countdown and to a screen reader once, in words it does not read as a letter ("s").
  it.each(langs)("says how long the button rests, without blaming SGC, in %s", (lang) => {
    for (const line of [dicts[lang].refreshCooldown(20), dicts[lang].refreshCooldownSr(20)]) {
      expect(line).toContain("20");
      expect(line).not.toMatch(/SGC|recarga|reload/i);
    }
    expect(dicts[lang].refreshCooldownSr(20)).toMatch(/segundos|seconds/);
  });
});

/** With no status the page does not know when SGC was last queried; "nunca" claimed it never was. */
describe("the last-query note without a status", () => {
  it.each(langs)("does not say never, in %s", (lang) => {
    expect(dicts[lang].lastUpdateUnknown).not.toBe(dicts[lang].never);
  });
});
