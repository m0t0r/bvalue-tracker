/**
 * USGS's aftershock forecast for Chocó's mainshock, relayed in its own box inside "¿Viene uno más
 * grande?". The page computes no probability: `usgsForecast` in `../claims.ts` decides what may be
 * shown and when it is stale, and every sentence with a USGS figure is a claim in `../copy.ts`.
 * Nothing of the page's own is drawn inside the box, and it points to SGC as the authority.
 */
import { useId } from "react";
import { fmtDay, fmtNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Forecast } from "../claims";
import { insightsCopy } from "../copy";
import { questionsCopy, type Named } from "./copy";
import { P } from "./ui";

/** USGS's figure as it gives it, to two decimals at most and never fewer than one: "4.45", "1.0". */
const given = (v: number) => {
  const two = fmtNum(v, 2);
  return two.endsWith("0") ? fmtNum(v, 1) : two;
};

export function ForecastBox({ forecast, named, feltShown }: { forecast: Forecast; named: Named; feltShown: boolean }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].bigger.forecast;
  const claims = insightsCopy[lang].claims;
  const headingId = useId();
  const day = (iso: string) => fmtDay(Date.parse(iso), lang);
  const { model, page } = forecast;
  const limits = [
    ...(model.holdsBothGroups ? [c.area(model.radiusKm)] : []),
    c.catalogue(given(model.mc)),
    ...(page.b !== null && page.mc !== null
      ? [c.bValue(given(model.b), given(model.mc), page.b.toFixed(2), page.mc.toFixed(1))]
      : []),
  ];
  const howToRead = claims.forecastHowToRead(forecast.windows.flatMap((w) => w.rows.map((r) => r.probability)));

  return (
    <>
      <P>{c.lede(named.date)}</P>
      <section aria-labelledby={headingId} className="my-8 max-w-prose rounded-xl border bg-card p-4 sm:p-6">
        <h4 id={headingId} className="text-lg font-semibold tracking-tight">
          {c.heading}
        </h4>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {c.byline(day(forecast.issuedAt), forecast.nextUpdateAt ? day(forecast.nextUpdateAt) : null)}
        </p>

        {forecast.windows.map((w) => (
          <div key={w.end} className="mt-6">
            <h5 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {c.window(day(w.start), day(w.end))}
            </h5>
            <dl className="mt-3 flex flex-col gap-4">
              {w.rows.map((r) => (
                <div key={r.magnitude}>
                  <dt className="font-semibold">{c.magnitude(r.magnitude)}</dt>
                  <dd className="mt-1 text-base/7 text-pretty">{claims.forecastChance(r.probability)}</dd>
                  <dd className="text-base/7 text-pretty text-muted-foreground">{claims.forecastCount(r)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        {forecast.aboveMainshock ? (
          <p className="mt-6 text-base/7 text-pretty">
            {claims.forecastAbove(
              forecast.aboveMainshock,
              day(forecast.aboveMainshock.start),
              day(forecast.aboveMainshock.end),
            )}
          </p>
        ) : null}
        {howToRead ? <p className="mt-4 text-sm text-pretty text-muted-foreground">{howToRead}</p> : null}

        <p className="mt-6 text-base/7 text-pretty">
          {c.notShaking}
          {page.farKm !== null ? <> {c.far(page.farKm)}</> : null}
          {feltShown ? (
            <>
              {" "}
              {c.pereiraFelt(named.date)}{" "}
              <a href="#q-shaking" className="font-medium underline underline-offset-2">
                {lang === "es" ? "«" : '"'}
                {questionsCopy[lang].shaking.short}
                {lang === "es" ? "»" : '"'}
              </a>
              .
            </>
          ) : null}
        </p>

        <p className="mt-6 text-sm font-semibold">{c.limitsTitle(limits.length)}</p>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base/7">
          {limits.map((l) => (
            <li key={l.title}>
              <strong className="font-semibold">{l.title}</strong> {l.body}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-base/7 text-pretty">{c.sgc}</p>
        <p className="mt-4 text-xs text-pretty text-muted-foreground">
          {c.source}
          {forecast.usgsUrl ? (
            <>
              {" "}
              <a
                href={forecast.usgsUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {c.sourceLink}
              </a>
            </>
          ) : null}
        </p>
      </section>
    </>
  );
}
