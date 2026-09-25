/**
 * "En 3D": the region as a block of earth, with every event at its depth, the plate and the rupture.
 * A slowly turning preview opens a full-screen viewer, where the reader turns the block by hand or
 * picks a view (the owner's choice after the E1 prototype, 2026-09-25). The copy is `copy.ts`; the
 * logic without a DOM is `shared.ts`; the drawing is `scene.ts`.
 */
import { XIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useI18n, type Lang } from "@/lib/i18n";
import { useIsDark } from "@/lib/theme";
import { fmtDay } from "@/lib/format";
import type { Insights } from "../claims";
import { CONVERGENCE_CM_PER_YEAR } from "../plate";
import { fmt, fmtKm, fmtMag } from "../shared";
import { BG } from "../tones";
import { useReducedMotion } from "../use-reduced-motion";
import { block3dCopy, type RuptureFacts } from "./copy";
import { createScene, webglAvailable, type SceneHandle } from "./scene";
import {
  ALL_LAYERS,
  FLOOR_KM,
  LENGTH_KM,
  WIDTH_KM,
  blockModel,
  type BlockModel,
  type Layer,
  type Preset,
  type View,
} from "./shared";
import { RUPTURE } from "../block";

const VIEWS: Preset[] = ["oblique", "south", "above", "rupture", "chaparral"];
/** Checked once: each check makes a WebGL context, and browsers keep only a few alive. */
const WEBGL = webglAvailable();
const EXAGGERATIONS = [1, 2, 4];

export function Block3D({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const c = block3dCopy[lang];
  const model = useMemo(() => blockModel(data), [data]);
  const [open, setOpen] = useState(false);
  const explore = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>({ exaggeration: 2, layers: ALL_LAYERS, until: null });
  const [preview, setPreview] = useState<SceneHandle | null>(null);
  // Follows a change of the setting while the tab is open, not only the one at mount.
  useEffect(() => preview?.setAutoRotate(!reduced), [preview, reduced]);
  // Stable, so the viewer's setup (focus, scroll lock, keys) runs once per opening.
  const close = useRef(() => {
    setOpen(false);
    // A date picked in the viewer is not the preview's: it shows the whole catalogue.
    setView((v) => ({ ...v, until: null }));
    // Back to the button that opened it, once the preview is mounted again.
    requestAnimationFrame(() => explore.current?.focus());
  });

  if (!WEBGL) return <p className="max-w-prose text-muted-foreground text-pretty">{c.noWebgl}</p>;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-prose flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">{c.title}</h2>
        <p className="text-lg text-pretty text-muted-foreground">{c.lede(fmtKm(WIDTH_KM), fmtKm(FLOOR_KM))}</p>
      </div>
      {!open && (
        <div className="relative">
          <Block
            data={data}
            view={view}
            lang={lang}
            className="pointer-events-none h-[45svh] rounded-lg border md:h-[55svh]"
            onReady={setPreview}
          />
          <div className="absolute inset-x-0 bottom-10 flex justify-center">
            <Button ref={explore} variant="floating" onClick={() => setOpen(true)}>
              {c.explore}
            </Button>
          </div>
        </div>
      )}
      <Key model={model} data={data} lang={lang} />
      {open && <Viewer data={data} model={model} view={view} setView={setView} lang={lang} onClose={close.current} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

/** The scene in a box. Built once; the view and a newer catalogue go through the handle. */
function Block({
  data,
  view,
  lang,
  className,
  onReady,
  children,
}: {
  data: Insights;
  view: View;
  lang: Lang;
  className: string;
  onReady?: (h: SceneHandle) => void;
  children?: ReactNode;
}) {
  const c = block3dCopy[lang];
  const dark = useIsDark();
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  // What the scene is built from, read when it is built; later changes go through the handle.
  const latest = useRef({ data, view, onReady });
  latest.current = { data, view, onReady };
  const built = useRef<Insights | null>(null);

  // Rebuilt only for a new language or theme: its labels and colours are drawn inside it. Data and
  // view go through the handle below, so a refetch does not reset the camera.
  useEffect(() => {
    const t = block3dCopy[lang];
    const { data: d, view: v, onReady: ready } = latest.current;
    const main = d.mainshock.choco.state === "found" ? d.mainshock.choco.largest : null;
    const h = createScene(box.current!, d, v, {
      trench: t.scene.trench,
      plate: t.scene.plate,
      rupture: t.scene.rupture(main ? fmtDay(Date.parse(main.time), lang) : ""),
      width: t.scene.width(fmtKm(WIDTH_KM)),
      length: t.scene.length(fmtKm(LENGTH_KM)),
      dark,
    });
    h.canvas.setAttribute("role", "img");
    h.canvas.setAttribute("aria-label", t.canvas);
    handle.current = h;
    built.current = d;
    ready?.(h);
    return () => {
      h.dispose();
      handle.current = null;
    };
  }, [lang, dark]);
  useEffect(() => {
    if (data !== built.current) handle.current?.setData(data);
    built.current = data;
  }, [data]);
  useEffect(() => handle.current?.setView(view), [view]);

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      {children}
      <span className="absolute top-1 left-1 z-10 rounded bg-background/80 px-1 text-2xs text-muted-foreground">
        {c.exaggerationTag(view.exaggeration)}
      </span>
      <Credit label={c.credit} />
    </div>
  );
}

function Credit({ label }: { label: string }) {
  const a = "pointer-events-auto underline-offset-2 hover:underline";
  return (
    <span className="absolute right-1 bottom-1 z-10 rounded bg-background/80 px-1 text-2xs text-muted-foreground">
      {label}{" "}
      <a className={a} href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">
        OpenFreeMap
      </a>{" "}
      <a className={a} href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">
        © OpenMapTiles
      </a>{" "}
      <a className={a} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
        © OpenStreetMap
      </a>{" "}
      ·{" "}
      <a className={a} href="https://mapterhorn.com/attribution" target="_blank" rel="noopener noreferrer">
        © Mapterhorn
      </a>
    </span>
  );
}

// --- The full-screen viewer ------------------------------------------------------------------

function Viewer({
  data,
  model,
  view,
  setView,
  lang,
  onClose,
}: {
  data: Insights;
  model: BlockModel;
  view: View;
  setView: (v: View) => void;
  lang: Lang;
  onClose: () => void;
}) {
  const c = block3dCopy[lang];
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [h, setH] = useState<SceneHandle | null>(null);
  // The view last picked; cleared as soon as the reader turns the block by hand.
  const [preset, setPreset] = useState<Preset | null>("oblique");
  const views = VIEWS.filter((p) => p !== "rupture" || model.rupture !== null);

  useEffect(() => {
    close.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Keep Tab inside the dialog.
      if (e.key !== "Tab" || !dialog.current) return;
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>("button, a[href], summary, [role=slider]"),
      ].filter((el) => el.offsetParent !== null);
      const [first, last] = [focusable[0], focusable.at(-1)];
      // Dragging the block leaves focus on the page's body, outside the dialog: bring it back in.
      if (!dialog.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prev;
      removeEventListener("keydown", key);
    };
  }, [onClose]);

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={c.dialog}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-sm font-medium">{c.hint}</p>
        <Button ref={close} size="icon-sm-touch" variant="ghost" aria-label={c.close} onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <div role="group" aria-label={c.views} className="flex gap-1 overflow-x-auto border-b px-3 py-2">
        {views.map((p) => (
          <Button
            key={p}
            size="sm-touch"
            className="shrink-0"
            variant={p === preset ? "default" : "outline"}
            aria-pressed={p === preset}
            onClick={() => {
              setPreset(p);
              h?.goTo(p, !reduced);
            }}
          >
            {c.view[p][0]}
          </Button>
        ))}
      </div>
      <Block
        data={data}
        view={view}
        lang={lang}
        className="min-h-0 flex-1"
        onReady={(s) => {
          s.onInteract(() => setPreset(null));
          setH(s);
        }}
      />
      <p aria-live="polite" className="min-h-10 border-t px-3 py-2 text-sm text-pretty">
        {preset ? c.view[preset][1] : c.freeView}
      </p>
      <details className="border-t px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">{c.more}</summary>
        <div className="flex max-h-[45svh] flex-col gap-4 overflow-y-auto pt-3">
          <div role="group" aria-label={c.exaggeration} className="flex flex-wrap items-center gap-1">
            <span className="me-1 text-xs text-muted-foreground">{c.exaggeration}</span>
            {EXAGGERATIONS.map((n) => (
              <Button
                key={n}
                size="sm-touch"
                variant={n === view.exaggeration ? "default" : "outline"}
                aria-pressed={n === view.exaggeration}
                onClick={() => setView({ ...view, exaggeration: n })}
              >
                {c.exaggerationOption(n)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(c.layers) as Layer[])
              .filter((k) => k !== "rupture" || model.rupture !== null)
              .map((k) => (
                <Button
                  key={k}
                  size="sm-touch"
                  variant={view.layers[k] ? "secondary" : "outline"}
                  aria-pressed={view.layers[k]}
                  onClick={() => setView({ ...view, layers: { ...view.layers, [k]: !view.layers[k] } })}
                >
                  {c.layers[k]}
                </Button>
              ))}
          </div>
          <Replay model={model} view={view} setView={setView} lang={lang} />
          <Key model={model} data={data} lang={lang} />
        </div>
      </details>
    </div>
  );
}

/** The weeks again, in about 20 seconds, only on request. */
function Replay({
  model,
  view,
  setView,
  lang,
}: {
  model: BlockModel;
  view: View;
  setView: (v: View) => void;
  lang: Lang;
}) {
  const c = block3dCopy[lang];
  const [playing, setPlaying] = useState(false);
  const first = model.events[0]?.t ?? 0;
  const last = model.events.at(-1)?.t ?? 0;
  // Read at each frame, so a refetch that adds an event neither restarts the replay nor stops it.
  const latest = useRef({ view, setView, first, last });
  latest.current = { view, setView, first, last };
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 20_000);
      const l = latest.current;
      l.setView({ ...l.view, until: t === 1 ? null : l.first + (l.last - l.first) * t });
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const at = view.until ?? last;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm-touch" variant="outline" onClick={() => setPlaying(!playing)}>
          {playing ? c.stop : c.replay}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">{c.until(fmtDay(at, lang))}</span>
      </div>
      <Slider
        min={first}
        max={last}
        step={3_600_000}
        value={[at]}
        aria-label={c.date}
        onValueChange={([v]) => {
          setPlaying(false);
          setView({ ...view, until: v === undefined || v >= last ? null : v });
        }}
      />
    </div>
  );
}

// --- What is what -------------------------------------------------------------------------------

function Key({ model, data, lang }: { model: BlockModel; data: Insights; lang: Lang }) {
  const c = block3dCopy[lang];
  // The key appears twice while the viewer is open (on the tab and in its drawer).
  const id = useId();
  const main = data.mainshock.choco.state === "found" ? data.mainshock.choco.largest : null;
  const date = main ? fmtDay(Date.parse(main.time), lang) : "";
  const r = model.rupture;
  const facts: RuptureFacts | null = r && {
    date,
    length: fmtKm(r.lengthKm),
    top: fmt(RUPTURE.corners[0]![2]!),
    bottom: fmtKm(RUPTURE.corners[2]![2]!),
    slip: `${fmt(r.maxSlipM)} m`,
    offset: fmtKm(r.offsetKm),
    direction: c.compass[r.compass],
    deeper: fmtKm(Math.abs(r.deeperKm)),
    shallower: r.deeperKm < 0,
  };
  const items: { swatch?: ReactNode; text: [string, string]; more?: ReactNode }[] = [
    { text: c.key.ground },
    {
      text: c.key.dots,
      more: (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <Dot cls={BG.shallow} label={c.groups.shallow} />
          <Dot cls={BG.deep} label={c.groups.deep} />
          {main && <Dot cls={BG.mainshock} label={c.groups.mainshock(date, fmtMag(main.mag))} />}
          <Dot cls={BG.tolima} label={c.groups.tolima} />
        </span>
      ),
    },
    {
      swatch: <span className="h-3 w-5 rounded-sm bg-muted-foreground/40" />,
      text: c.key.plate(`${CONVERGENCE_CM_PER_YEAR} cm`),
    },
    ...(facts
      ? [
          {
            swatch: <span className="h-3 w-5 rounded-sm bg-chart-2/70" />,
            text: c.key.rupture(facts),
            more: c.key.offset(facts),
          },
        ]
      : []),
    { text: c.key.pins },
    { text: c.key.depth(fmtKm(WIDTH_KM), fmtKm(LENGTH_KM), fmtKm(FLOOR_KM)) },
  ];
  const snapped = model.snapped.map((s) => c.snappedItem(s.count, fmtKm(s.depthKm, 1)));
  const list = snapped.length > 1 ? `${snapped.slice(0, -1).join(", ")}${c.and}${snapped.at(-1)}` : snapped[0];
  return (
    <section aria-labelledby={id} className="flex max-w-prose flex-col gap-3">
      <h3 id={id} className="text-lg font-semibold tracking-tight">
        {c.keyTitle}
      </h3>
      <dl className="flex flex-col gap-3 text-sm text-pretty">
        {items.map(({ swatch, text: [term, desc], more }) => (
          <div key={term} className="flex flex-col gap-1">
            <dt className="flex items-center gap-2 font-medium">
              {swatch}
              {term}
            </dt>
            <dd className="text-muted-foreground">{desc}</dd>
            {more && <dd className="text-muted-foreground">{more}</dd>}
          </div>
        ))}
      </dl>
      {list && <p className="text-sm text-muted-foreground text-pretty">{c.key.snapped(list)}</p>}
    </section>
  );
}

function Dot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}
