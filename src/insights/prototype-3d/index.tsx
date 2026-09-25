/**
 * PROTOTYPE (unit E1, branch `prototype/3d`, never merged to main).
 *
 * Question: does a 3D block help the reader in Pereira, on a phone, at an acceptable weight?
 * Three structurally different variants of the "3D" tab on `/insights`, switchable with `?variant=`:
 *   A: a preview that opens a full-screen viewer, where every gesture belongs to the block;
 *   B: the block inline in the page, one finger scrolls the page, two fingers turn it, with views
 *      picked by buttons;
 *   C: a guided tour, the block pinned while the reader scrolls steps; no gestures at all.
 *   D: A's preview and full-screen viewer, with B's view buttons inside the viewer (the owner's pick
 *      after seeing A–C, 2026-09-25).
 * Spanish only: this is the reader's language, and the owner judges the look, not the copy.
 */
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Insights } from "../claims";
import { useReducedMotion } from "../use-reduced-motion";
import { ALL_LAYERS, createScene, webglAvailable, type Layer, type Preset, type SceneHandle, type View } from "./scene";

const VARIANTS = {
  D: "A con las vistas de B",
  A: "Visor a pantalla completa",
  B: "Bloque en la página",
  C: "Recorrido guiado",
} as const;
type Variant = keyof typeof VARIANTS;

const readVariant = (): Variant => {
  const v = new URLSearchParams(location.search).get("variant");
  return v === "A" || v === "B" || v === "C" ? v : "D";
};

export default function Prototype3D({ data }: { data: Insights }) {
  const [variant, setVariant] = useState<Variant>(readVariant);
  if (!webglAvailable())
    return (
      <p className="max-w-prose text-muted-foreground">
        Este navegador no puede mostrar 3D. Los cortes de «La historia» muestran lo mismo en dos dimensiones.
      </p>
    );
  return (
    <>
      {variant === "A" && <VariantA data={data} />}
      {variant === "D" && <VariantA data={data} withViews />}
      {variant === "B" && <VariantB data={data} />}
      {variant === "C" && <VariantC data={data} />}
      {import.meta.env.DEV && <Switcher current={variant} onChange={setVariant} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

/** Mounts the scene in a box and keeps it in step with `view`; the variant owns the layout. */
function Block({
  data,
  view,
  onReady,
  className,
  children,
}: {
  data: Insights;
  view: View;
  onReady?: (h: SceneHandle) => void;
  className: string;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const h = createScene(box.current!, data, view);
    handle.current = h;
    onReady?.(h);
    const id = setInterval(() => setFps(h.fps()), 1000);
    return () => {
      clearInterval(id);
      h.dispose();
      handle.current = null;
    };
    // The scene is built once per mount; `view` changes go through setView below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => handle.current?.setView(view), [view]);
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      {children}
      <span className="absolute bottom-1 left-1 z-10 rounded bg-background/80 px-1 text-2xs text-muted-foreground">
        {view.exaggeration === 1 ? "Sin exagerar: escala real" : `Exageración vertical ×${view.exaggeration}`}
      </span>
      <span className="absolute top-1 right-1 z-10 rounded bg-background/80 px-1 font-mono text-2xs text-muted-foreground">
        {fps} fps
      </span>
    </div>
  );
}

function Exaggeration({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div role="group" aria-label="Exageración vertical" className="flex flex-wrap items-center gap-1">
      <span className="me-1 text-xs text-muted-foreground">Exageración vertical</span>
      {[1, 2, 4].map((v) => (
        <Button key={v} size="sm-touch" variant={v === value ? "default" : "outline"} onClick={() => onChange(v)}>
          {v === 1 ? "×1 (real)" : `×${v}`}
        </Button>
      ))}
    </div>
  );
}

const LAYER_NAMES: [Layer, string][] = [
  ["ground", "Relieve"],
  ["plate", "Placa"],
  ["uncertainty", "Margen de error de la placa"],
  ["rupture", "Ruptura del M7.4"],
  ["events", "Sismos"],
  ["labels", "Nombres"],
  ["snapped", "Resaltar profundidades fijas"],
];

function Layers({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {LAYER_NAMES.map(([k, name]) => (
        <Button
          key={k}
          size="sm-touch"
          variant={view.layers[k] ? "secondary" : "outline"}
          aria-pressed={view.layers[k]}
          onClick={() => onChange({ ...view, layers: { ...view.layers, [k]: !view.layers[k] } })}
        >
          {name}
        </Button>
      ))}
    </div>
  );
}

function Legend({ snapped }: { snapped?: SceneHandle["snapped"] }) {
  const dot = (cls: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${cls}`} />
      {text}
    </span>
  );
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {dot("bg-chart-1", "grupo superficial (Istmina–Sipí)")}
        {dot("bg-chart-4", "grupo profundo")}
        {dot("bg-chart-2", "sismo del 10 de agosto, M7.4")}
        {dot("bg-chart-5", "enjambre de Chaparral")}
      </div>
      {snapped && snapped.length > 0 && (
        <p className="max-w-prose">
          {snapped.map((s) => `${s.count} sismos a ${s.depthKm} km`).join(", ")} exactos: el catálogo fija la
          profundidad de muchos sismos pequeños. Las «capas» que se ven ahí no son reales.
        </p>
      )}
      <p className="max-w-prose">
        La placa y la ruptura son modelos del USGS. El USGS sitúa el M7.4 unos 23 km al este y 22 km más profundo que el
        SGC, así que la ruptura no pasa por el punto naranja.
      </p>
    </div>
  );
}

function useReplay(h: SceneHandle | null, view: View, setView: (v: View) => void) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || !h) return;
    const { first, last } = h.times;
    const start = performance.now();
    const ms = 20_000;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setView({ ...view, until: first + (last - first) * t });
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, h]);
  return { playing, play: () => setPlaying(true), stop: () => setPlaying(false) };
}

function TimeRow({ h, view, setView }: { h: SceneHandle | null; view: View; setView: (v: View) => void }) {
  const replay = useReplay(h, view, setView);
  if (!h) return null;
  const { first, last } = h.times;
  const at = view.until ?? last;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm-touch" variant="outline" onClick={replay.playing ? replay.stop : replay.play}>
          {replay.playing ? "Detener" : "Reproducir las semanas"}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          hasta el{" "}
          {new Date(at).toLocaleDateString("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" })}
        </span>
      </div>
      <Slider
        min={first}
        max={last}
        step={3_600_000}
        value={[at]}
        aria-label="Fecha"
        onValueChange={([v]) => setView({ ...view, until: v === last ? null : v! })}
      />
    </div>
  );
}

// --- A: full-screen viewer ---------------------------------------------------------------------

function VariantA({ data, withViews = false }: { data: Insights; withViews?: boolean }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ exaggeration: 2, layers: ALL_LAYERS, until: null });
  const [h, setH] = useState<SceneHandle | null>(null);
  // The view last picked; cleared as soon as the reader turns the block by hand.
  const [preset, setPreset] = useState<Preset | null>("oblique");
  const caption = B_VIEWS.find(([p]) => p === preset)?.[2];
  const ready = (s: SceneHandle) => {
    s.controls.addEventListener("start", () => setPreset(null));
    setPreset("oblique");
    setH(s);
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">Debajo de nuestros pies, en 3D</h2>
      <p className="max-w-prose text-lg text-pretty text-muted-foreground">
        Los sismos del Chocó y de Chaparral dentro de la tierra, la placa de Nazca que se mete bajo Sudamérica y el
        plano donde se rompió el sismo del 10 de agosto.
      </p>
      {!open && (
        <div className="relative">
          <Block
            data={data}
            view={view}
            className="pointer-events-none h-[40svh] rounded-lg border"
            onReady={(p) => p.setAutoRotate(!reduced)}
          />
          <div className="absolute inset-0 flex items-end justify-center p-4">
            <Button variant="floating" onClick={() => setOpen(true)}>
              Explorar en 3D
            </Button>
          </div>
        </div>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bloque en 3D"
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <p className="text-sm font-medium">Arrastra para girar · pellizca para acercar</p>
            <Button size="icon-sm-touch" variant="ghost" aria-label="Cerrar" onClick={() => setOpen(false)}>
              <XIcon />
            </Button>
          </div>
          {withViews && (
            <div role="group" aria-label="Vistas" className="flex gap-1 overflow-x-auto border-b px-3 py-2">
              {B_VIEWS.map(([p, name]) => (
                <Button
                  key={p}
                  size="sm-touch"
                  className="shrink-0"
                  variant={p === preset ? "default" : "outline"}
                  onClick={() => {
                    setPreset(p);
                    h?.goTo(p, !reduced);
                  }}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
          <Block data={data} view={view} className="min-h-0 flex-1" onReady={ready} />
          {withViews && (
            <p aria-live="polite" className="min-h-10 border-t px-3 py-2 text-sm text-pretty">
              {caption ?? "Vista libre: arrastra para girar, o elige una vista arriba."}
            </p>
          )}
          <details className="border-t px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Capas, escala y tiempo</summary>
            <div className="flex max-h-[40svh] flex-col gap-3 overflow-y-auto pt-3">
              <Exaggeration value={view.exaggeration} onChange={(v) => setView({ ...view, exaggeration: v })} />
              <Layers view={view} onChange={setView} />
              <TimeRow h={h} view={view} setView={setView} />
              <Legend snapped={h?.snapped} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

// --- B: inline block, two fingers to turn -----------------------------------------------------

const B_VIEWS: [Preset, string, string][] = [
  [
    "oblique",
    "En diagonal",
    "El bloque desde el sureste: el relieve arriba, los sismos debajo, a su profundidad real.",
  ],
  [
    "south",
    "Desde el sur",
    "De perfil, como los cortes de la historia: la placa baja hacia el este y los dos grupos del Chocó quedan a distinta profundidad.",
  ],
  ["above", "Desde arriba", "Como un mapa: dónde están los sismos, sin la profundidad."],
  [
    "rupture",
    "La ruptura",
    "El plano donde se rompió el M7.4, según el modelo del USGS: más naranja donde se deslizó más.",
  ],
  ["chaparral", "Chaparral", "El enjambre de Chaparral, a menos de 25 km de profundidad, muy por encima de la placa."],
];

function VariantB({ data }: { data: Insights }) {
  const [view, setView] = useState<View>({ exaggeration: 1, layers: ALL_LAYERS, until: null });
  const [h, setH] = useState<SceneHandle | null>(null);
  const [preset, setPreset] = useState<Preset>("oblique");
  const reduced = useReducedMotion();
  const caption = B_VIEWS.find(([p]) => p === preset)![2];

  const ready = (s: SceneHandle) => {
    // One finger scrolls the page; two fingers turn and zoom. The wheel scrolls the page too.
    s.controls.touches = { ONE: null, TWO: 2 /* TOUCH.DOLLY_ROTATE */ };
    s.controls.enableZoom = true;
    s.controls.zoomToCursor = false;
    s.canvas.style.touchAction = "pan-y";
    s.canvas.addEventListener("wheel", (e) => e.stopImmediatePropagation(), { capture: true });
    setH(s);
  };

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">El bloque, en 3D</h2>
      <p className="max-w-prose text-lg text-pretty">
        Un bloque de tierra de 500 km de ancho y 240 de profundidad, del Pacífico hasta más allá de Pereira. Elige una
        vista, o gíralo con dos dedos.
      </p>
      <div role="group" aria-label="Vistas" className="flex flex-wrap gap-1">
        {B_VIEWS.map(([p, name]) => (
          <Button
            key={p}
            size="sm-touch"
            variant={p === preset ? "default" : "outline"}
            onClick={() => {
              setPreset(p);
              h?.goTo(p, !reduced);
            }}
          >
            {name}
          </Button>
        ))}
      </div>
      <Block data={data} view={view} className="h-[45svh] rounded-lg border md:h-[60svh]" onReady={ready} />
      <p className="max-w-prose text-pretty">{caption}</p>
      <Exaggeration value={view.exaggeration} onChange={(v) => setView({ ...view, exaggeration: v })} />
      <Legend snapped={h?.snapped} />
      <p className="text-xs text-muted-foreground">
        En el teléfono, un dedo mueve la página y dos dedos giran el bloque. En el computador, arrastra para girar.
      </p>
    </section>
  );
}

// --- C: guided tour, pinned while the text scrolls --------------------------------------------

interface TourStep {
  title: string;
  body: string;
  preset: Preset;
  layers: Partial<Record<Layer, boolean>>;
  exaggeration: number;
  replay?: boolean;
}

const TOUR: TourStep[] = [
  {
    title: "El mapa, visto desde arriba",
    body: "Así se ven los sismos en un mapa: el grupo de Istmina–Sipí, el del sismo grande y el enjambre de Chaparral. Falta lo más importante: la profundidad.",
    preset: "above",
    layers: { plate: false, rupture: false },
    exaggeration: 1,
  },
  {
    title: "Inclinamos el mapa",
    body: "Ahora el suelo es la tapa de un bloque y cada sismo está a su profundidad real, sin exagerar. El relieve de las cordilleras, de 4 o 5 km, casi no se nota junto a 200 km de profundidad.",
    preset: "oblique",
    layers: { plate: false, rupture: false },
    exaggeration: 1,
  },
  {
    title: "La placa de Nazca",
    body: "La franja gris es la placa, según el modelo Slab2 del USGS: entra por la fosa del Pacífico y baja hacia el este, por debajo de Pereira. Las franjas tenues son su margen de error.",
    preset: "south",
    layers: { rupture: false },
    exaggeration: 1,
  },
  {
    title: "Dónde se rompió el sismo del 10 de agosto",
    body: "El plano naranja es la ruptura según el modelo del USGS, de 150 km de largo; donde es más intenso, se deslizó más. El USGS ubica el sismo unos 22 km más profundo que el SGC, por eso el plano no pasa por el punto naranja.",
    preset: "rupture",
    layers: {},
    exaggeration: 1,
  },
  {
    title: "Chaparral, lejos de la placa",
    body: "El enjambre de Chaparral está en la corteza, a menos de 25 km de profundidad. La placa pasa unos 140 km más abajo.",
    preset: "chaparral",
    layers: {},
    exaggeration: 1,
  },
  {
    title: "Las semanas, una tras otra",
    body: "Pulsa «Reproducir» para ver aparecer los sismos en el orden en que ocurrieron, desde el 10 de agosto.",
    preset: "oblique",
    layers: {},
    exaggeration: 2,
    replay: true,
  },
];

function VariantC({ data }: { data: Insights }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [h, setH] = useState<SceneHandle | null>(null);
  const step = TOUR[active]!;
  const [view, setView] = useState<View>({ exaggeration: 1, layers: ALL_LAYERS, until: null });
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    setView({ exaggeration: step.exaggeration, layers: { ...ALL_LAYERS, ...step.layers }, until: null });
    h?.goTo(step.preset, !reduced);
  }, [active, h, reduced, step]);

  return (
    <section className="relative md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
      <div className="sticky top-0 z-10 h-[50svh] border-b bg-background py-2 md:order-2 md:h-svh md:self-start md:border-b-0 md:py-6">
        <Block data={data} view={view} className="pointer-events-none size-full" onReady={setH} />
      </div>
      <div className="md:order-1">
        {TOUR.map((s, i) => (
          <article
            key={s.title}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-i={i}
            data-active={i === active || undefined}
            className="flex min-h-[70svh] flex-col justify-start pt-10 pb-16 text-muted-foreground transition-colors duration-500 data-active:text-foreground md:min-h-[90svh] md:justify-center"
          >
            <div className="mx-auto flex w-full max-w-prose flex-col gap-4">
              <p className="text-xs font-medium tracking-widest uppercase">
                En 3D · {i + 1} de {TOUR.length}
              </p>
              <h2 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">{s.title}</h2>
              <p className="text-lg leading-relaxed text-pretty">{s.body}</p>
              {s.replay && i === active && <TimeRow h={h} view={view} setView={setView} />}
              {i === 3 && i === active && <Legend snapped={h?.snapped} />}
            </div>
          </article>
        ))}
        <div className="h-[30svh]" />
      </div>
    </section>
  );
}

// --- The prototype's own switcher --------------------------------------------------------------

function Switcher({ current, onChange }: { current: Variant; onChange: (v: Variant) => void }) {
  const keys = Object.keys(VARIANTS) as Variant[];
  const go = (d: number) => {
    const next = keys[(keys.indexOf(current) + d + keys.length) % keys.length]!;
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
    onChange(next);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=slider]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-2 py-1 text-background shadow-lg">
      <button type="button" aria-label="Variante anterior" className="rounded-full p-1.5" onClick={() => go(-1)}>
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-1 text-xs font-medium whitespace-nowrap">
        Prototipo {current} · {VARIANTS[current]}
      </span>
      <button type="button" aria-label="Variante siguiente" className="rounded-full p-1.5" onClick={() => go(1)}>
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
