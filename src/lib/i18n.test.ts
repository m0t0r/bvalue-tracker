import { describe, expect, it } from "vitest";
import { WIDE_TICK_EVERY_MIN } from "../../worker/plan.ts";
import { dicts, type Lang } from "./i18n.tsx";

/**
 * The failed-ingest alert is the one place on the page that quotes a cadence other than the
 * cron's five minutes, and it has to: a failed run stands the fast lane down, so from that
 * moment the wide tick is the only lane still asking SGC. It used to promise "cada 5
 * minutos" in exactly the state where that had stopped being true (2026-09-20).
 */
describe("the failed-ingest alert", () => {
  const langs = Object.keys(dicts) as Lang[];

  it.each(langs)("quotes the wide tick's interval, not the cron's, in %s", (lang) => {
    expect(dicts[lang].ingestFailedBody).toMatch(new RegExp(`\\b${WIDE_TICK_EVERY_MIN} min`));
  });

  // And the standing note under the button still describes the ordinary cadence, which is
  // why the two must not be shown at once — status-bar.tsx hides it while a run has failed.
  it.each(langs)("leaves the standing note on the cron's own five minutes in %s", (lang) => {
    // \b so that a stray "15 minutos" here cannot pass as the cron's own five.
    expect(dicts[lang].autoUpdate).toMatch(/\b5 min/);
  });
});
