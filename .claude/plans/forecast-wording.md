# Part D: the forecast box's wording, draft for the owner's review

Status: **approved by the owner, 2026-09-25; being built as unit D.** The owner answered the open
questions (see "Owner's decisions" at the end): M5+ and M6+, week and month windows, the ≥ M7.4 line
for the month, an unreviewed forecast hidden; 5 and 6 as drafted. The draft of 2026-09-24 follows.
Part D's gate was your review of this wording, in Spanish and English, before any code. Written while A was being built elsewhere, so nothing here
touches `claims.ts` or `copy.ts` yet. Figures in the examples are USGS's forecast for us6000tjl2 as
re-fetched on 2026-09-24 (`forecast.json` of product 1790014817636, issued 2026-09-21 18:03 UTC,
`reviewed`, next due 2026-09-28 16:00 UTC). Unchanged since the fixture. On the page every figure and
date comes from the stored digest; `{…}` marks each one.

## One thing the plan did not see: the windows start at the issue date, not today

USGS's windows all start at **2026-09-21 16:00 UTC** (the forecast's start, two hours before it was
issued): "1 Day" ended on the 22nd, "1 Week" ends on the 28th, "1 Month" on 22 October, "1 Year" on
22 September 2027. A reader on the 24th who reads "15 % in the next week" is reading a week that is
already half gone. So:

- **Each window is named by its dates**, never "the next week": "entre el 21 y el 28 de septiembre".
- **A window that has ended is not shown.** The day window is never shown in practice (it ends before
  the next daily job has even stored the forecast, most weeks).
- **No figure is rescaled to the days left.** That would be computing a forecast, which the page never
  does. The dates say it.

## The box, in order

It is its own question on the questions tab, "¿Puede venir otro grande?", with nothing of the page's
own drawn inside it. The whole box is hidden when: there is no forecast digest; its `sgcEventId` is
not the zone's detected mainshock; `nextUpdateAt` has passed (or, with no `nextUpdateAt`, the forecast
is 14 days old); or the zone is Tolima.

### Spanish

**Question (short, for the index)**: ¿Puede venir otro grande?

**Question (full)**: ¿Puede haber otro sismo grande en el Chocó?

**Lede**:
> Nadie puede predecir un sismo: ni el día, ni el lugar exacto, ni el tamaño. Lo que sí existe es un
> pronóstico de probabilidades. El USGS (Servicio Geológico de EE. UU.) lo calcula para las réplicas
> del sismo del {mainshockDate} y lo hace público. Esta página no lo calcula: lo mostramos tal como
> lo publica el USGS.

**Box heading**: El USGS publica este pronóstico

**Byline under the heading**:
> Publicado por el USGS el {issuedDate} y revisado por uno de sus sismólogos. La próxima
> actualización está prevista para el {nextDate}.

(Without `reviewStatus === "reviewed"`: "Publicado por el USGS el {issuedDate}. Ningún sismólogo lo
ha revisado todavía." Open question 4.)

**The rows** (one per window still open, for M5 or más and M6 o más; see open questions 1 and 2):

> **M5.0 o más, entre el {start} y el {end}**
> {chance}
> {count}

where `{chance}` and `{count}` are the claim rules below. Every `%` and unit takes U+00A0 in Spanish
(`43\u00A0%`), none in English (`43%`), as `share` does in `copy.ts`. Example, 24 September, month window:

> **M5.0 o más, entre el 21 de septiembre y el 22 de octubre**
> La probabilidad de que haya al menos uno es del 43 %: unas 4 de cada 10.
> Lo más probable es que no haya ninguno, aunque según el USGS podría haber hasta 3.

> **M6.0 o más, entre el 21 de septiembre y el 22 de octubre**
> La probabilidad de que haya al menos uno es del 6 %: alrededor de 1 de cada 16.
> Lo más probable es que no haya ninguno, aunque según el USGS podría haber uno.

**How to read "4 de cada 10"** (once, under the rows):
> «4 de cada 10» quiere decir que, si este mismo periodo se repitiera 10 veces, en unas 4 habría al
> menos uno.

**What an M5 means in Pereira** (rule 4, always shown under the rows):
> Una magnitud describe el sismo en su origen, no cuánto se mueve el suelo aquí. Las fuentes del
> Chocó están a más de {km} de Pereira en línea recta, contando la profundidad, y a esa distancia un
> M5 llega muy atenuado. Para saber cómo se sintió de verdad el sismo del {mainshockDate}, mira
> «¿Cuánto se sintió en Pereira?».

(`{km}` is the nearest source's straight-line distance, the far question's figure, ~105 km on the
fixture. It speaks of the sources, not of "an M5": USGS's circle, 125.4 km around 4.57° N, 76.69° W,
**reaches Pereira**, 113 km from its centre, so the forecast's M5 is not bound to be over 100 km away.
The link points to Part A's question; if A is hidden, the last sentence goes.)

**Limits** (a short list under "Tres cosas que conviene saber"):
> - **Una zona, dos grupos.** El USGS cuenta los sismos en un círculo de {radius} alrededor del
>   Chocó, que incluye el grupo profundo, ya casi apagado, y el de Istmina–Sipí, todavía activo. El
>   pronóstico dice qué tan probable es un sismo en esa zona, no en cuál de los dos grupos ocurriría.
> - **Otro catálogo.** Cuenta los sismos de M{mc} o más del catálogo del USGS, no los del SGC. Por
>   eso sus cifras no se pueden comparar con los conteos de esta página.
> - **Otro valor b.** Su modelo usa b = {b}, calculado con sismos desde M{mc}; el de esta página,
>   unos {ourB}, se calcula con sismos desde M{ourMc}. Cada uno vale para lo que describe.

**SGC and what to do** (rule 5; no advice of our own):
> La autoridad en Colombia es el Servicio Geológico Colombiano: para información oficial y para
> saber qué hacer, consulta sus boletines (sgc.gov.co).

**Source line**: Fuente: pronóstico de réplicas del USGS para el evento {sourceEventId}, con el enlace
a `productUrl`'s event page.

**The story's one line** (scene 7, "Lo que nadie sabe todavía", after the item "Si vendrá un sismo más
grande. Nadie puede predecir un sismo…"), shown only when the box is:
> El USGS sí publica un pronóstico de probabilidades para el Chocó; lo encuentras en la pregunta
> «¿Puede venir otro grande?».

### English

**Question (short)**: Could another big one come?

**Question (full)**: Could another large earthquake strike Chocó?

**Lede**:
> Nobody can predict an earthquake: not the day, the exact place or the size. What does exist is a
> forecast of probabilities. The USGS (United States Geological Survey) computes one for the
> aftershocks of the {mainshockDate} earthquake and makes it public. This page does not compute it:
> we show it as the USGS publishes it.

**Box heading**: The USGS publishes this forecast

**Byline**:
> Issued by the USGS on {issuedDate} and reviewed by one of its seismologists. The next update is
> due on {nextDate}.

**A row**:
> **M5.0 or larger, from 21 September to 22 October**
> The chance of at least one is 43%: about 4 in 10.
> Most likely none, though the USGS says there could be up to 3.

> "4 in 10" means that if this same period were repeated 10 times, about 4 of them would have at
> least one.

**What an M5 means in Pereira**:
> A magnitude describes an earthquake at its source, not how much the ground moves here. Chocó's
> sources are over {km} from Pereira in a straight line, counting their depth, and at that distance
> an M5 arrives much weakened. For how the {mainshockDate} earthquake was actually felt, see "How
> strongly was it felt in Pereira?".

**Limits**:
> - **One area, two groups.** The USGS counts earthquakes in a {radius} circle around Chocó, which
>   takes in both the deep group, now almost quiet, and the still-active Istmina–Sipí group. The
>   forecast says how likely an earthquake is in that area, not in which group it would happen.
> - **Another catalogue.** It counts the M{mc} and larger earthquakes in the USGS catalogue, not
>   SGC's. That is why its figures cannot be compared with this page's counts.
> - **Another b-value.** Its model uses b = {b}, from earthquakes of M{mc} and up; this page's, about
>   {ourB}, comes from earthquakes of M{ourMc} and up. Each is right for what it describes.

**SGC**:
> The authority in Colombia is the Servicio Geológico Colombiano: for official information and for
> what to do, see its bulletins (sgc.gov.co).

**Story line**:
> The USGS does publish a forecast of probabilities for Chocó; you'll find it under the question
> "Could another big one come?".

## The claim rules (to go into `claims.ts` with tests, when D is built)

**`{pct}`**: whole percent; "menos del 1 %" under 0.5 %; "más del 99 %" at 99.5 % or more. One decimal
never: USGS's own figures are model output, and 43.47 % would claim a precision it does not have.

**`{chance}`**, "La probabilidad de que haya al menos uno es del {pct}: {natural}." / "The chance of at
least one is {pct}: {natural}.", with `{natural}` from the probability p:

| p | Spanish | English | Example |
|---|---|---|---|
| ≥ 0.95 | es casi seguro | almost certain | M4, month: 99 % |
| 0.2 – 0.95 | unas {round(10p)} de cada 10 | about {round(10p)} in 10 | 43 % → 4; 89 % → 9 |
| 0.001 – 0.2 | alrededor de 1 de cada {N}: 1/p to a whole number under 20, to one significant figure from 20 | about 1 in {N} | 14.8 % → 7; 6.09 % → 16; 1.73 % → 60; 0.33 % → 300 |
| < 0.001 | menos de 1 de cada 1000 | less than 1 in 1,000 | |

Why the bands: "1 en 2" for 43 % would overstate it (50 %), and "4 de cada 10" for 14.8 % is too
coarse (it is 1.5 of 10). A frequency whose words disagree with the percentage beside it is the
failure this rule exists to prevent; the tests hold each band edge.

**`{count}`**, from the median and USGS's 95 % range:

| Median, range | Spanish | English |
|---|---|---|
| 0, 0–0 | Lo más probable es que no haya ninguno. | Most likely none. |
| 0, 0–1 | Lo más probable es que no haya ninguno, aunque según el USGS podría haber uno. | Most likely none, though the USGS says there could be one. |
| 0, 0–n | Lo más probable es que no haya ninguno, aunque según el USGS podría haber hasta {n}. | Most likely none, though the USGS says there could be up to {n}. |
| 1, 0–n | Lo más probable es que haya uno; según el USGS, podrían ser entre 0 y {n}. | Most likely one; the USGS says between 0 and {n}. |
| m, a–b | Lo más probable es que haya unos {m}; según el USGS, entre {a} y {b}. | Most likely about {m}; the USGS says between {a} and {b}. |

USGS calls it a 95 % range. The copy leaves out the 95 %, which a reader would take for a second
probability; the source line links to USGS's page, which states it. (Open question 5.)

**Staleness**: shown while now < `nextUpdateAt`. Without `nextUpdateAt`, while now < `issuedAt` +
14 days. `expiresAt` is ignored (a year after issue). The box is hidden, not greyed, once stale.

## Open questions for the owner

1. **Which magnitudes?** Drafted with M5+ and M6+ (the plan's figures). USGS also gives M3+, M4+ and
   M7+. M4+ is where the story's reader says they start to feel events (the story's default threshold),
   and its month figure is "casi seguro, lo más probable unos 6 (de 1 a 18)". It answers "will I feel
   more?" better than M5 does, but it also invites reading every M4 as felt, which the page never
   claims. Recommendation: M5+ and M6+ only, as drafted.
2. **Which windows?** Drafted with every window still open: this week (until the 28th) and the month
   (until 22 October). The year window (M5+ 89 %, M6+ 26 %, until September 2027) is the most alarming
   and the least useful to a reader today. Recommendation: week and month; no year.
3. **"Larger than the M7.4"**: USGS gives it too (0.3 % in the month, "alrededor de 1 en 300").
   "¿Puede venir otro grande?" is partly that question. Recommendation: one sentence under the rows,
   month window only: "Uno igual o mayor que el M7.4: alrededor de 1 en 300 hasta el 22 de octubre."
4. **An automatic (unreviewed) forecast**: show it with "sin revisión de un sismólogo todavía", or hide
   it? The plan's case for relaying is that USGS reviews it. Recommendation: hide it.
5. **The range without its 95 %**: acceptable, or add "(con un 95 % de confianza)"?
6. **`{mc}` is 4.45**, USGS's own bin edge. The page writes magnitudes with one decimal; "M4.45" is
   exact but unusual, "M4.5" would misstate it. Recommendation: "M4.45", as USGS gives it.

## Writing review (`/better-writing`, 2026-09-24), applied above

| Severity | Before | After | Why |
|---|---|---|---|
| HIGH | "Usa el catálogo del USGS, que solo registra aquí sismos desde M{mc}" | "Cuenta los sismos de M{mc} o más del catálogo del USGS" | False: ComCat records smaller events; M4.45 is the model's cut-off |
| HIGH | "{pct} de probabilidad: unas 4 veces de cada 10" | "La probabilidad de que haya al menos uno es del 43 %: unas 4 de cada 10", plus one line on what "4 de cada 10" means | USGS's probability is of *at least one*; the fragment hid that, and "veces" read as translated |
| MEDIUM | "cuán probable" | "qué tan probable" | Colombian usage |
| MEDIUM | "Próxima actualización prevista: {nextDate}." | "La próxima actualización está prevista para el {nextDate}." | Verbless fragment |
| MEDIUM | "el USGS da un rango de 0 a 3" | "aunque según el USGS podría haber hasta 3" | Reads as translated ("gives a range") |
| MEDIUM | "lo publica para el público" | "lo hace público" | Repeated root |
| MEDIUM | "Nadie puede predecir un sismo." | "…: ni el día, ni el lugar exacto, ni el tamaño." | Same sentence as the story's scene 7; one voice |
| LOW | "¿Puede venir otro sismo grande…?" (full) | "¿Puede haber otro sismo grande…?" | "Venir" is fine in the short index title, stiff in the full one |
| LOW | "Qué tiene en cuenta este pronóstico" | "Tres cosas que conviene saber" | The list is limits, not inputs |
| LOW | "Los dos pueden ser correctos para lo que miden" after "mide" | "Cada uno vale para lo que describe" | Repeated word |

Verdict: Approve for the owner's review; the open questions above remain the owner's.

## Owner's decisions (2026-09-25)

1. **M5+ and M6+ only.**
2. **Week and month windows**; no year; ended windows hidden.
3. **Yes**: one line on "igual o mayor que el M7.4", month window only.
4. **Hide** an automatic (unreviewed) forecast.
5. and 6. As drafted: the range without "95 %" (the source link states it); `{mc}` written "M4.45".
