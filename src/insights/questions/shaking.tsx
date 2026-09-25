/**
 * "¿Qué tan fuerte se sintió?": what USGS publishes about how the zone's mainshock was felt in
 * Pereira, relayed and credited. The page computes no intensity; `feltInPereira` in `../claims.ts`
 * decides what may be shown, and the sentences are `../copy.ts`'s. Every USGS figure is rendered as
 * text, and no USGS string (a place name, a label) is shown at all.
 */
import { fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { FELT_MIN_RESPONSES, type Felt } from "../claims";
import { insightsCopy, intensityName } from "../copy";
import { fmtInt } from "../shared";
import { questionsCopy } from "./copy";
import { Figure, P, Takeaway } from "./ui";

/** SGC's form for reporting an earthquake one felt. */
const SGC_FELT_URL = "https://sismosentido.sgc.gov.co/";

export function Shaking({ felt, mag }: { felt: Felt; mag: number }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].shaking;
  const claims = insightsCopy[lang].claims;
  const day = (iso: string) => fmtDay(Date.parse(iso), lang);
  const { reported, modelled } = felt;
  // The DYFI product exists but Pereira's cell has too few answers (or none): say so in its place.
  const few = reported === null && felt.totalResponses !== null;
  const decimals = [
    ...(reported ? [c.decimalReported(reported.cdi)] : []),
    ...(modelled ? [c.decimalModelled(modelled.mmi)] : []),
  ].join(lang === "es" ? " y " : " and ");
  const dates = [
    ...(reported ? [c.dateReported(day(reported.updatedAt))] : []),
    ...(modelled ? [c.dateModelled(day(modelled.updatedAt))] : []),
  ].join(" ");
  const agreement = claims.feltAgreement(felt);

  return (
    <>
      <P>{c.p1}</P>
      <Figure
        caption={
          <>
            {c.caption(decimals, dates)}
            {felt.usgsEventUrl ? (
              <>
                {" "}
                <a
                  href={felt.usgsEventUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {c.usgsLink}
                </a>
              </>
            ) : null}
          </>
        }
      >
        <dl aria-label={c.figureAria} className="grid gap-6 sm:grid-cols-2">
          {reported || few ? (
            <Reading
              title={c.reportedTitle}
              level={reported?.level ?? null}
              detail={reported ? c.reportedDetail(fmtInt(reported.responses)) : c.reportedFew(FELT_MIN_RESPONSES)}
            />
          ) : null}
          {modelled ? <Reading title={c.modelledTitle} level={modelled.level} detail={c.modelledDetail} /> : null}
        </dl>
      </Figure>
      {agreement ? <P>{agreement}</P> : null}
      {felt.totalResponses !== null ? <P>{c.total(felt.totalResponses)}</P> : null}
      <P>
        {c.sgc}{" "}
        <a href={SGC_FELT_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          {c.sgcLink}
        </a>
      </P>
      <Takeaway label={questionsCopy[lang].inOneSentence}>{claims.feltTakeaway(felt, mag)}</Takeaway>
    </>
  );
}

/** One intensity: its numeral, USGS's term for it, and where it comes from. A dash when it is hidden. */
function Reading({ title, level, detail }: { title: string; level: number | null; detail: string }) {
  const { lang } = useI18n();
  const name = level === null ? null : intensityName(level, lang);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</dt>
      <dd className="flex items-baseline gap-3">
        <span className="text-4xl font-semibold tracking-tight">{name?.roman ?? "—"}</span>
        {name ? <span className="text-lg font-medium first-letter:uppercase">{name.shaking}</span> : null}
      </dd>
      <dd className="text-sm text-pretty text-muted-foreground">{detail}</dd>
    </div>
  );
}
