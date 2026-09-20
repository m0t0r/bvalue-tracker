import { describe, expect, it } from "vitest";
import { dicts, type Lang } from "./i18n.tsx";

const langs = Object.keys(dicts) as Lang[];

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
  // \b so that a stray "15 minutos" here cannot pass as the cron's own five.
  it.each(langs)("names the cron's own five minutes, in %s", (lang) => {
    expect(dicts[lang].autoUpdate).toMatch(/\b5 min/);
  });
});

/**
 * Three stand-down messages, three different truths. refreshWait claims SGC answered in the
 * last five minutes, so it must never appear beside the failure alert; refreshStillFailing
 * is what replaces it there, and must not tell the reader to try again — while SGC is
 * refusing us the Worker's own wait is an hour.
 */
describe("the stand-down messages", () => {
  it.each(langs)("keep refreshWait's claim of a recent successful query, in %s", (lang) => {
    expect(dicts[lang].refreshWait).toMatch(/5 min/);
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
