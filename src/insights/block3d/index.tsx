/**
 * "En 3D": the region as a block of earth, with every event at its depth, the plate and the rupture.
 * A slowly turning preview opens a full-screen viewer, where the reader turns the block by hand or
 * picks a view (the owner's choice after the E1 prototype, 2026-09-25). The copy is `copy.ts`; the
 * logic without a DOM is `shared.ts`; the drawing is `scene.ts`.
 */
import { InfoIcon, PauseIcon, PlayIcon, SlidersHorizontalIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { VisuallyHidden } from "radix-ui";
import { LanguageButton } from "@/components/language-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  PREVIEW_EXAGGERATION,
  VIEWER_EXAGGERATION,
  pinDistances,
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
  // The viewer's view. The preview shares its layers but always turns at ×2 over the whole catalogue.
  const [view, setView] = useState<View>({
    exaggeration: VIEWER_EXAGGERATION,
    raised: true,
    layers: ALL_LAYERS,
    until: null,
  });
  // Keyed on the layers and the mountains alone: the viewer's date and exaggeration are not the preview's.
  const { layers, raised } = view;
  const previewView = useMemo(
    () => ({ layers, raised, exaggeration: PREVIEW_EXAGGERATION, until: null }),
    [layers, raised],
  );
  const [preview, setPreview] = useState<SceneHandle | null>(null);
  // The reader can stop the turning (WCAG 2.2.2); reduced motion never starts it. Follows a change of
  // the setting while the tab is open, not only the one at mount.
  const [spin, setSpin] = useState(true);
  useEffect(() => preview?.setAutoRotate(spin && !reduced), [preview, spin, reduced]);
  // Stable, so the viewer's setup (focus, scroll lock, keys) runs once per opening.
  const close = useRef(() => {
    setOpen(false);
    // A date picked in the viewer is not the preview's: it shows the whole catalogue.
    setView((v) => ({ ...v, until: null }));
    // Back to the button that opened it, once the preview is mounted again.
    requestAnimationFrame(() => explore.current?.focus());
  });

  if (!WEBGL) return <p className="max-w-lg text-muted-foreground text-pretty">{c.noWebgl}</p>;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">{c.title}</h2>
        <p className="text-lg text-pretty text-muted-foreground">{c.lede(fmtKm(WIDTH_KM), fmtKm(FLOOR_KM))}</p>
      </div>
      {!open && (
        <div className="relative">
          <Block
            data={data}
            view={previewView}
            lang={lang}
            className="pointer-events-none h-[45svh] rounded-lg border md:h-[55svh]"
            onReady={setPreview}
          />
          <div className="absolute inset-x-0 bottom-10 flex justify-center">
            <Button ref={explore} variant="floating" onClick={() => setOpen(true)}>
              {c.explore}
            </Button>
          </div>
          {reduced ? null : (
            <Button
              variant="outline"
              size="icon-sm-touch"
              aria-label={spin ? c.spin.pause : c.spin.resume}
              onClick={() => setSpin(!spin)}
              className="absolute top-2 right-2"
            >
              {spin ? <PauseIcon /> : <PlayIcon />}
            </Button>
          )}
        </div>
      )}
      <Key model={model} data={data} lang={lang} />
      {/* On the body, beside the page rather than inside it, so the page can be made inert under it. */}
      {open &&
        createPortal(
          <Viewer data={data} model={model} view={view} setView={setView} lang={lang} onClose={close.current} />,
          document.body,
        )}
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
  pressablePins = false,
}: {
  data: Insights;
  view: View;
  lang: Lang;
  className: string;
  /** The viewer's: a pin shows its distance from Pereira. The preview's pins are inert. */
  pressablePins?: boolean;
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
      plateShort: t.scene.plateShort,
      ruptureShort: t.scene.ruptureShort,
      widthShort: t.scene.widthShort(fmtKm(WIDTH_KM)),
      lengthShort: t.scene.widthShort(fmtKm(LENGTH_KM)),
      width: t.scene.width(fmtKm(WIDTH_KM)),
      length: t.scene.length(fmtKm(LENGTH_KM)),
      dark,
      distance: pressablePins
        ? { pin: (name, km) => t.scene.pinDistance(name, fmtKm(km)), label: (km) => t.scene.distance(fmtKm(km)) }
        : null,
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
        {c.exaggerationTag(view.exaggeration, view.raised)}
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

const REPLAY_MS = 20_000;
const wideQuery = () => window.matchMedia("(min-width: 64rem)");
/** A desktop gets a side panel; below it the panel is a bottom sheet over the block. */
const useWide = () =>
  useSyncExternalStore(
    (cb) => {
      const mq = wideQuery();
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => wideQuery().matches,
  );

type PanelTab = "key" | "settings";

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
  const wide = useWide();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [h, setH] = useState<SceneHandle | null>(null);
  // The view last picked; cleared as soon as the reader turns the block by hand.
  const [preset, setPreset] = useState<Preset | null>("oblique");
  const views = VIEWS.filter((p) => p !== "rupture" || model.rupture !== null);
  // Kept across a resize between the two layouts, so the reader stays on the tab they chose.
  const [tab, setTab] = useState<PanelTab>("key");
  // A phone's sheet. It is a modal of its own: while it is open, Radix owns Escape and Tab.
  const [sheet, setSheet] = useState(false);
  const sheetOpen = useRef(false);
  sheetOpen.current = sheet;
  const opener = useRef<HTMLButtonElement | null>(null);
  // Widening past the breakpoint unmounts the sheet without closing it; left open, the viewer's keys
  // would stay off, and narrowing again would bring the sheet back unasked.
  if (wide && sheet) setSheet(false);

  useEffect(() => {
    close.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The page behind is out of reach while the viewer is open: no focus, no clicks, not read out.
    const page = document.getElementById("root");
    if (page) page.inert = true;
    const key = (e: KeyboardEvent) => {
      // The sheet's own Escape reaches here after it has closed it, already handled.
      if (sheetOpen.current || e.defaultPrevented) return;
      if (e.key === "Escape") onClose();
      // Keep Tab inside the dialog, looping. Everything Tab can stop on: the panel's tab content
      // (tabindex 0) was left out once, and Tab went from it to the page behind. A roving group's
      // other items (tabindex -1) are not stops.
      if (e.key !== "Tab" || !dialog.current) return;
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && el.offsetParent !== null);
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
      if (page) page.inert = false;
      removeEventListener("keydown", key);
    };
  }, [onClose]);

  const panel = (
    <Panel
      data={data}
      model={model}
      view={view}
      setView={setView}
      lang={lang}
      tab={tab}
      onTab={setTab}
      action={
        wide ? null : (
          <SheetClose asChild>
            <Button size="icon-sm-touch" variant="ghost" aria-label={c.close}>
              <XIcon />
            </Button>
          </SheetClose>
        )
      }
    />
  );

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex items-center gap-2 border-b py-2 ps-3 pe-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {c.dialog}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            <span className="pointer-fine:hidden">{c.hint.touch}</span>
            <span className="pointer-coarse:hidden">{c.hint.pointer}</span>
          </p>
        </div>
        {/* The page's own switch is under the viewer, out of reach while it is open. */}
        <LanguageButton />
        <Button ref={close} size="icon-sm-touch" variant="ghost" aria-label={c.close} onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative border-b">
            <div className="overflow-x-auto px-3 py-2">
              {/* Pressing the view already chosen glides back to it, so the click does the work. */}
              <ToggleGroup type="single" variant="outline" size="sm-touch" aria-label={c.views} value={preset ?? ""}>
                {views.map((p) => (
                  <ToggleGroupItem
                    key={p}
                    value={p}
                    onClick={() => {
                      setPreset(p);
                      h?.goTo(p, !reduced);
                    }}
                  >
                    {c.view[p][0]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {/* Says the row goes on past the edge, where a phone cuts the last view in half. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background lg:hidden" />
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <Block
              data={data}
              view={view}
              lang={lang}
              className="min-h-0 flex-1"
              pressablePins
              onReady={(s) => {
                s.onInteract(() => setPreset(null));
                setH(s);
              }}
            />
            <p aria-live="polite" className="min-h-10 border-t px-3 py-2 text-sm text-pretty">
              {preset ? c.view[preset][1] : c.freeView}
            </p>
            {!wide && (
              <Sheet open={sheet} onOpenChange={setSheet}>
                {/* Each opens the sheet on its own tab. */}
                <div className="flex gap-2 border-t px-3 py-2">
                  {(["key", "settings"] as const).map((t) => (
                    <SheetTrigger key={t} asChild>
                      <Button
                        size="sm-touch"
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => {
                          opener.current = e.currentTarget;
                          setTab(t);
                        }}
                      >
                        {t === "key" ? (
                          <InfoIcon data-icon="inline-start" />
                        ) : (
                          <SlidersHorizontalIcon data-icon="inline-start" />
                        )}
                        {c.tabs[t]}
                      </Button>
                    </SheetTrigger>
                  ))}
                </div>
                <SheetContent
                  side="bottom"
                  showCloseButton={false}
                  aria-describedby={undefined}
                  // Radix returns focus to its one trigger, the last mounted ("Ajustes") whichever
                  // opened it: back to the button that did instead.
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    opener.current?.focus();
                  }}
                  className="data-[side=bottom]:h-4/5"
                >
                  <VisuallyHidden.Root asChild>
                    <SheetTitle>{c.panel}</SheetTitle>
                  </VisuallyHidden.Root>
                  {panel}
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
        {wide && (
          <aside aria-label={c.panel} className="flex w-96 shrink-0 flex-col border-l">
            {panel}
          </aside>
        )}
      </div>
    </div>
  );
}

/** What is what, and the settings: a side panel on a desktop, the sheet's content on a phone. */
function Panel({
  data,
  model,
  view,
  setView,
  lang,
  tab,
  action,
  onTab,
}: {
  data: Insights;
  model: BlockModel;
  view: View;
  setView: (v: View) => void;
  lang: Lang;
  tab: PanelTab;
  /** Beside the tabs: the sheet's close button on a phone. */
  action: ReactNode;
  onTab: (t: PanelTab) => void;
}) {
  const c = block3dCopy[lang];
  const layers = (Object.keys(c.layers) as Layer[]).filter((k) => k !== "rupture" || model.rupture !== null);
  return (
    <Tabs value={tab} onValueChange={(t) => onTab(t as PanelTab)} className="min-h-0 flex-1 gap-0">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <TabsList className="flex-1">
          {(["key", "settings"] as const).map((t) => (
            <TabsTrigger key={t} value={t}>
              {c.tabs[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        {action}
      </div>
      <TabsContent value="key" className="min-h-0 overflow-y-auto px-3 pt-2 pb-8">
        <Key model={model} data={data} lang={lang} heading={false} />
      </TabsContent>
      <TabsContent value="settings" className="min-h-0 overflow-y-auto px-3 pt-2 pb-8">
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{c.exaggeration}</FieldLegend>
            <FieldDescription>{c.exaggerationHelp}</FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm-touch"
              aria-label={c.exaggeration}
              value={String(view.exaggeration)}
              // Empty when the chosen one is pressed again: one is always chosen.
              onValueChange={(v) => v && setView({ ...view, exaggeration: Number(v) })}
            >
              {EXAGGERATIONS.map((n) => (
                <ToggleGroupItem key={n} value={String(n)}>
                  {c.exaggerationOption(n)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{c.relief}</FieldLegend>
            <FieldDescription>{c.reliefHelp}</FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm-touch"
              aria-label={c.relief}
              value={view.raised ? "raised" : "true"}
              onValueChange={(v) => v && setView({ ...view, raised: v === "raised" })}
            >
              {(["raised", "true"] as const).map((k) => (
                <ToggleGroupItem key={k} value={k}>
                  {c.reliefOption[k]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{c.layersTitle}</FieldLegend>
            {/* On touch a switch's hit area is 46 px tall: rows 31 px apart overlapped the next one's. */}
            <FieldGroup className="gap-3 pointer-coarse:gap-7">
              {layers.map((k) => (
                <Field key={k} orientation="horizontal">
                  <FieldLabel htmlFor={`layer-${k}`}>{c.layers[k]}</FieldLabel>
                  <Switch
                    id={`layer-${k}`}
                    checked={view.layers[k]}
                    onCheckedChange={(on) => setView({ ...view, layers: { ...view.layers, [k]: on } })}
                  />
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{c.timeTitle}</FieldLegend>
            <FieldDescription>{c.timeHelp(REPLAY_MS / 1000)}</FieldDescription>
            <Replay model={model} view={view} setView={setView} lang={lang} />
          </FieldSet>
        </FieldGroup>
      </TabsContent>
    </Tabs>
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
      const t = Math.min(1, (now - start) / REPLAY_MS);
      const l = latest.current;
      l.setView({ ...l.view, until: t === 1 ? null : l.first + (l.last - l.first) * t });
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const at = view.until ?? last;
  const shown = c.until(fmtDay(at, lang));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm-touch" variant="outline" onClick={() => setPlaying(!playing)}>
          {playing ? <SquareIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
          {playing ? c.stop : c.replay}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">{shown}</span>
      </div>
      <Slider
        name="until"
        // The date as shown, not the milliseconds the slider runs on.
        aria-valuetext={shown}
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

/** `heading` is off in the viewer's panel, whose tab already names it. */
function Key({
  model,
  data,
  lang,
  heading = true,
}: {
  model: BlockModel;
  data: Insights;
  lang: Lang;
  heading?: boolean;
}) {
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
  const near = pinDistances().map((d) => `${d.name} ~${fmtKm(d.km)}`);
  const pins = `${near.slice(0, -1).join(", ")}${c.and}${near.at(-1)}`;
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
    { text: c.key.pins(pins) },
    { text: c.key.depth(fmtKm(WIDTH_KM), fmtKm(LENGTH_KM), fmtKm(FLOOR_KM)) },
  ];
  const snapped = model.snapped.map((s) => c.snappedItem(s.count, fmtKm(s.depthKm, 1)));
  const list = snapped.length > 1 ? `${snapped.slice(0, -1).join(", ")}${c.and}${snapped.at(-1)}` : snapped[0];
  return (
    <section aria-labelledby={heading ? id : undefined} className="flex max-w-md flex-col gap-3">
      {heading && (
        <h3 id={id} className="text-lg font-semibold tracking-tight">
          {c.keyTitle}
        </h3>
      )}
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
