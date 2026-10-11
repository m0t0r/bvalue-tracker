import { describe, expect, it } from "vitest";
import { SHARE_META } from "../../core/zone-pages.ts";
import { ZONE_IDS } from "../../core/zones.ts";
import { REFRESH_MIN_INTERVAL_S } from "../../worker/plan.ts";
import { dicts, type Lang } from "./i18n.tsx";
import { browserLang } from "./startup.ts";

const langs = Object.keys(dicts) as Lang[];
const each = langs.flatMap((lang) => ZONE_IDS.map((zone) => [lang, zone] as const));

/**
 * The failed-ingest alert names no interval: three rules decide the Worker's wait (the throttle, a
 * refusal's hour, a 429's cooldown) and the line under the button gives the one that applies
 * (`syncRetryIn`). Since syncs are on demand nothing retries by itself, so the alert no longer promises
 * a retry: it says how to try again, and still that there is no need to reload.
 */
describe("the failed-ingest alert", () => {
  it.each(langs)("names no interval, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).not.toMatch(/\d+\s*(min|minut)/i);
  });

  it.each(langs)("says how to try again, by the button's own label, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).toContain(dicts[lang].sync);
    expect(dicts[lang].ingestFailedBody).not.toMatch(/automátic|by itself|solo|sola/i);
  });

  it.each(langs)("still tells the reader not to reload, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).toMatch(/recargar|reload/i);
  });
});

/**
 * The note under the button gives the last sync that worked. Beside "La última sincronización con el
 * SGC falló" it must say so, or the two lines read as a contradiction.
 */
describe("the last-sync note while a run has failed", () => {
  it.each(langs)("says the sync it dates was the one that worked, at both widths, in %s", (lang) => {
    for (const label of [dicts[lang].lastSyncOk, dicts[lang].lastSyncOkShort])
      expect(label).toMatch(/correcta|successful|good/i);
  });
});

/**
 * Nothing reads SGC on a schedule any more (docs/ingest.md, "On demand only"), and the footer says so
 * rather than quoting a cadence: no interval, and the button by its own label.
 */
describe("the footer's note on how the data arrives", () => {
  it.each(langs)("names no interval and no real-time tracking, in %s", (lang) => {
    expect(dicts[lang].syncNote).not.toMatch(/\d+\s*(min|minut)/i);
    expect(dicts[lang].syncNote).toMatch(/no sigue la actividad en tiempo real|does not track activity in real time/);
  });

  it.each(langs)("names the button as it is labelled, in %s", (lang) => {
    expect(dicts[lang].syncNote).toContain(dicts[lang].sync);
  });
});

/**
 * Two stand-down answers, two different truths. syncWait claims the zone was synced inside the
 * throttle, so it may only appear while nothing has failed; syncRetryIn replaces it while the last sync
 * has failed, and gives the Worker's own wait, since nothing retries by itself.
 */
describe("the stand-down messages", () => {
  it.each(langs)("keep syncWait's claim of a recent sync, with the throttle's own number, in %s", (lang) => {
    const min = REFRESH_MIN_INTERVAL_S / 60;
    for (const wait of [dicts[lang].syncWait, dicts[lang].syncWaitShort])
      expect(wait(min)).toMatch(new RegExp(`\\b${min}\\smin`));
  });

  it.each(langs)("say how long the Worker waits while the last sync has failed, in %s", (lang) => {
    expect(dicts[lang].syncRetryIn(15)).toMatch(/15\smin/);
    expect(dicts[lang].syncRetryIn(15)).not.toMatch(/SGC/);
  });

  // It sits directly above the alert. Checked in a browser: saying the alert's sentence again, thirty
  // pixels apart, reads as the page repeating itself. This one says what the press came to.
  it.each(langs)("say what the press came to rather than repeating the alert, in %s", (lang) => {
    expect(dicts[lang].syncRetryIn(15).length).toBeLessThan(dicts[lang].ingestFailedBody.length / 2);
  });
});

/** A catch-up's progress names the zone's own chunk, which is a week on Chocó and a day on Chaparral. */
describe("the line under the button while a sync catches up", () => {
  it.each(langs)("counts weeks on Chocó and days on Chaparral, in %s", (lang) => {
    expect(dicts[lang].zones.choco.syncStep(3, 12)).toMatch(/semana\s3\sde\s12|week\s3\sof\s12/);
    expect(dicts[lang].zones.tolima.syncStep(3, 12)).toMatch(/día\s3\sde\s12|day\s3\sof\s12/);
  });

  // On a phone the line is two lines beside the button; "17…" alone on the second read as a stray number.
  it.each(langs)("keeps the count in one piece, in %s", (lang) => {
    expect(dicts[lang].zones.tolima.syncStep(2, 17)).toMatch(/\S+ 2 \S+ 17…/);
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
describe("a failed press on the sync button", () => {
  it.each(langs)("does not blame SGC, in %s", (lang) => {
    expect(dicts[lang].syncFailed).not.toMatch(/SGC/);
  });

  // The button rests after a failure (`refresh-backoff.ts`); the line says for how long, on screen as a
  // countdown and to a screen reader once, in words it does not read as a letter ("s").
  it.each(langs)("says how long the button rests, without blaming SGC, in %s", (lang) => {
    for (const line of [dicts[lang].syncCooldown(20), dicts[lang].syncCooldownSr(20)]) {
      expect(line).toContain("20");
      expect(line).not.toMatch(/SGC|recarga|reload/i);
    }
    expect(dicts[lang].syncCooldownSr(20)).toMatch(/segundos|seconds/);
  });
});

/** With no status the page does not know when the zone was last synced; "nunca" claimed it never was. */
describe("the last-sync note without a status", () => {
  it.each(langs)("does not say never, in %s", (lang) => {
    expect(dicts[lang].lastSyncUnknown).not.toBe(dicts[lang].never);
  });
});

/**
 * The hint under "Eventos" used to be a bare "/ 1037": a total with no word saying what it is the total
 * of (issue #142). It says so, as the scope bar's "Mostrando 639 de 786 eventos" does, and only while a
 * filter narrows the count (unfiltered, the figure above is the whole catalogue). The phone's form is its
 * own key and may not be longer than the wide one: it shares a row with "Sismo principal".
 */
describe("the events hint under the count", () => {
  it.each(langs)("says what the total is the total of, in %s", (lang) => {
    const n = (1037).toLocaleString(lang);
    for (const hint of [dicts[lang].eventsOfCatalogue(n), dicts[lang].eventsOfCatalogueShort(n)]) {
      expect(hint).toMatch(/1037|1,037/);
      expect(hint).not.toMatch(/^\s*\//);
    }
    expect(dicts[lang].eventsOfCatalogue(n)).toMatch(/catálogo|catalogue/);
  });

  it.each(langs)("is no longer on the phone than in the wide form, in %s", (lang) => {
    const { eventsOfCatalogue, eventsOfCatalogueShort } = dicts[lang];
    const n = (1037).toLocaleString(lang);
    expect(eventsOfCatalogueShort(n).length).toBeLessThanOrEqual(eventsOfCatalogue(n).length);
  });
});

/**
 * The notice for a gap in the history. Nothing fills it but a sync (docs/ingest.md, "On demand only"),
 * so it says so in the words /insights uses, and its button names what a press loads.
 */
describe("the back-fill notice", () => {
  it.each(langs)("says the next sync completes it, in the words /insights uses, in %s", (lang) => {
    expect(dicts[lang].completesOnSync).toMatch(/próxima sincronización|next sync/);
    for (const zone of ZONE_IDS) {
      expect(dicts[lang].zones[zone].backfillBody).toContain(dicts[lang].completesOnSync);
    }
  });

  it.each(langs)("counts what is still to load, singular and plural, in %s", (lang) => {
    for (const zone of ZONE_IDS) {
      expect(dicts[lang].zones[zone].backfillTitle(1)).toMatch(/\b1\b/);
      expect(dicts[lang].zones[zone].backfillTitle(4)).toMatch(/\b4\b/);
      expect(dicts[lang].zones[zone].backfillTitle(1)).not.toMatch(/semanas|días|weeks|days/);
    }
  });

  it.each(langs)("names what the button loads, in %s", (lang) => {
    expect(dicts[lang].backfillAction).toMatch(/lo que falta|the rest/);
  });
});
