/**
 * PROTOTYPE — throwaway. Three variants of the status bar's stats, switchable via `?variant=A|B|C`
 * on the monitor (`/`, `/choco`). Question: with "Última consulta al SGC" gone from the stats, how
 * should the newest event lead with its magnitude and place? Not for main.
 */
import { useEffect, useState, type ReactNode } from "react";
import { FlowNumber } from "@/components/flow-number";
import { Badge } from "@/components/ui/badge";
import type { StatusResponse, StoredEvent } from "@/lib/api";
import { fmtDateTime, fmtRegion, fmtUtc, relativeTime, sgcEventUrl } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Same row, what & where",
  B: "Newest event as headline",
  C: "Latest three events",
};

export function useVariant(): Variant | null {
  const read = () => {
    if (!import.meta.env.DEV) return null;
    const v = new URLSearchParams(location.search).get("variant");
    return (VARIANTS as readonly string[]).includes(v ?? "") ? (v as Variant) : null;
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    addEventListener("popstate", on);
    addEventListener("prototype-variant", on);
    return () => {
      removeEventListener("popstate", on);
      removeEventListener("prototype-variant", on);
    };
  }, []);
  return v;
}

/** "Chaparral - Tolima, Colombia" → "Chaparral, Tolima". */
const place = (region: string) => fmtRegion(region).replace(/\s+-\s+/, ", ");

function PlaceLink({ e, children }: { e: { id: string; time: string }; children: ReactNode }) {
  return (
    <a className="underline underline-offset-4" href={sgcEventUrl(e.id)} target="_blank" rel="noreferrer" title={fmtUtc(e.time)}>
      {children}
    </a>
  );
}

type Newest = NonNullable<StatusResponse["newestEvent"]>;

interface Props {
  status: StatusResponse;
  shown: number | null;
  events: StoredEvent[] | undefined;
  now: number;
  mainshock: ReactNode;
  Stat: (p: { label: ReactNode; value: ReactNode | null; hint?: ReactNode }) => ReactNode;
}

function EventsStat({ status, shown, Stat }: Pick<Props, "status" | "shown" | "Stat">) {
  const { t, lang } = useI18n();
  return (
    <Stat
      label={t.events}
      value={shown === null ? null : <FlowNumber value={shown} lang={lang} />}
      hint={`/ ${status.totalEvents.toLocaleString(lang)}`}
    />
  );
}

/** A: the same row of stats, minus the SGC query; the newest event's value is magnitude and place. */
function VariantA({ status, shown, now, mainshock, Stat }: Props) {
  const { t, lang } = useI18n();
  const e = status.newestEvent;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
      <div className="col-span-2 sm:col-span-1">
        <Stat
          label={t.newestEvent}
          value={
            e ? (
              <>
                M{e.mag.toFixed(1)} · <PlaceLink e={e}>{place(e.region)}</PlaceLink>
              </>
            ) : (
              "—"
            )
          }
          hint={e ? `${relativeTime(e.time, lang, now)} · ${fmtDateTime(e.time, lang)}` : undefined}
        />
      </div>
      <EventsStat status={status} shown={shown} Stat={Stat} />
      {mainshock}
    </div>
  );
}

/** B: the newest event is the headline, big magnitude beside its place; the counts sit small beside it. */
function VariantB({ status, shown, now, mainshock, Stat }: Props) {
  const { t, lang } = useI18n();
  const e: Newest | null = status.newestEvent;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-10">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t.newestEvent}</span>
        {e ? (
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-semibold tracking-tight">M{e.mag.toFixed(1)}</span>
            <span className="text-xl font-semibold">
              <PlaceLink e={e}>{place(e.region)}</PlaceLink>
            </span>
          </div>
        ) : (
          <span className="text-xl font-semibold">—</span>
        )}
        <span className="text-xs text-muted-foreground">
          {e ? `${relativeTime(e.time, lang, now)} · ${fmtDateTime(e.time, lang)}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 sm:flex sm:gap-x-8 sm:border-s sm:ps-8">
        <EventsStat status={status} shown={shown} Stat={Stat} />
        {mainshock}
      </div>
    </div>
  );
}

/** C: the three newest events as a short feed, magnitude badge + place + how long ago. */
function VariantC({ status, shown, events, now, mainshock, Stat }: Props) {
  const { lang } = useI18n();
  const recent = (events ?? [])
    .filter((e) => e.removedAt === null)
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 3);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-10">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{lang === "es" ? "Eventos más recientes" : "Newest events"}</span>
        <ol className="flex flex-col gap-1.5">
          {recent.map((e, i) => (
            <li key={e.id} className="flex items-baseline gap-2">
              <Badge variant={i === 0 ? "default" : "secondary"}>M{e.mag.toFixed(1)}</Badge>
              <span className={i === 0 ? "font-semibold" : undefined}>
                <PlaceLink e={e}>{place(e.region)}</PlaceLink>
              </span>
              <span className="text-xs text-muted-foreground">{relativeTime(e.time, lang, now)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:gap-x-10">
        <EventsStat status={status} shown={shown} Stat={Stat} />
        {mainshock}
      </div>
    </div>
  );
}

export function PrototypeStats(p: Props & { variant: Variant }) {
  return p.variant === "A" ? <VariantA {...p} /> : p.variant === "B" ? <VariantB {...p} /> : <VariantC {...p} />;
}

/** PROTOTYPE switcher: ←/→ or the arrows cycle `?variant=`. Dev builds only. */
export function PrototypeSwitcher({ current }: { current: Variant }) {
  const go = (d: number) => {
    const next = VARIANTS[(VARIANTS.indexOf(current) + d + VARIANTS.length) % VARIANTS.length]!;
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
    dispatchEvent(new Event("prototype-variant"));
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable], [role=slider]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span>
        {current} ({VARIANT_NAMES[current]})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
