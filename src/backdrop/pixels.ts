/**
 * The pixel background: the zone drawn as 1-bit pixel art, 3 px to the pixel. The ground is an
 * ordered dither (Bayer 8×8): a faint halftone, strongest at the top of the page, rising to a
 * checkerboard where the swarm's events fall, with the newest event as one hard pixel in it.
 *
 * **Nothing moves on its own** (owner's call): it is a still picture, and every motion answers the
 * reader.
 * - **A mouse** moves an invisible lens over the pattern: it has no shape of its own, only what it
 *   brings out. Under it the events appear as hard pixels (2×2 from M3, 3×3 from M4), fainter
 *   further from the pointer; the one nearest writes its magnitude beside it in a 3×5 bitmap font,
 *   and the largest other one in the lens more quietly. Pointing at the title or the subtitle
 *   switches that whole line to a bitmap font (`pixel-text.ts`), still readable, and back on leaving.
 * - **A finger** has no hover, so a phone draws no swarm: the largest event is an orange pixel disc,
 *   the epicenter, with rings of pixels rolling out from it (the one motion of its own, slow, and
 *   only on screen). A scroll pushes the rings on and brightens them; a tap sends one strong ring, and
 *   on a line of the header switches it to the bitmap font for a moment.
 * - **"Actualizar ahora"** sends one ring out through the pattern from where it was pressed, lighting
 *   the swarm's events as it passes.
 *
 * **No card ever sits on a pixel.** The pattern fills the header, the page's side margins and the
 * footer, and stops short of the cards' column (from the first card to the footer), thinning out
 * over its last 48 px (a dithered edge, not a cut). On a phone, whose margins are too narrow for it,
 * the header and the footer are where it shows. It is drawn over the whole document and scrolls with
 * it, so the header's pixels leave with the header. The swarm sits beside the title where the header
 * has room, else in the right-hand margin; a phone's epicenter goes in the header's most open spot.
 */
import { cubicBezier } from "@/lib/ease";
import { textLayer, type TextLayer } from "./pixel-text";
import {
  type BackdropEvent,
  type BackdropFactory,
  type BackdropInput,
  bayer,
  finePointer,
  isDark,
  onEnvChange,
  reducedMotion,
  tokenRgb,
  valueNoise,
} from "./shared";

const CELL = 3;
/**
 * Timing, as time constants of an exponential approach, so a new target is taken from wherever
 * things are, as a CSS transition retargets. The lens trails the pointer by about a frame and a half;
 * opening and revealing take a little longer than closing and hiding.
 */
const FOLLOW_MS = 28;
const OPEN_MS = 60;
const CLOSE_MS = 40;
const REVEAL_MS = 45;
const HIDE_MS = 28;
/**
 * The header's switch to its bitmap font, a scan whose band travels at one speed on every line: in
 * at 2.2 px/ms (the title ~270 ms, the subtitle ~500 ms at 1440 px, starting 60 ms after the title),
 * out at 3.6 px/ms, both at once. At 4 px/ms the owner found the jitter passing "way too fast" to
 * see what was happening; this is slow enough to follow and still well under a second. On the
 * page's `--ease-slide`, the curve for an edge travelling across, which spends its time mid-distance
 * so the eye can follow the band. The first versions, an exponential approach and then `--ease-out`,
 * read as naive and as a snap with a tail.
 */
const TEXT_IN_PX_MS = 2.2;
const TEXT_OUT_PX_MS = 3.6;
const TEXT_STAGGER_MS = 60;
const easeSlide = cubicBezier([0.32, 0.72, 0, 1]);
export type Tween = { from: number; to: number; t0: number; ms: number };
/**
 * A tween's value at `now`: its start before `t0`, its end once done. One with no duration (reduced
 * motion) is at its end from `t0` itself, not a frame later.
 */
export const textAt = ({ from, to, t0, ms }: Tween, now: number) =>
  now < t0 || (now === t0 && ms > 0)
    ? from
    : ms <= 0 || now >= t0 + ms
      ? to
      : from + (to - from) * easeSlide((now - t0) / ms);
/** Scrolling on a phone: the rings brighten at once and settle back slowly, like dust. */
const SURGE_UP_MS = 40;
const SURGE_DOWN_MS = 320;
/** A tap's hold on the header's bitmap font. */
const TAP_MS = 1600;
/** The refresh ring: how long, how far and how wide, in ms and CSS px. */
const RIPPLE_MS = 900;
const RIPPLE_REACH = 640;
const RIPPLE_BAND = 18;
/**
 * Without hover (a phone), the swarm gives way to its epicenter: the largest event as a pixel mark,
 * with rings of pixels rolling out from it. Rings every 21 px (7 cells) out to 240 px, fading with
 * distance; they roll out at 12 px a second, and a scroll pushes them on by 1.5 times its distance. Stepped
 * at 15 frames a second, like the rest of the pixel motion, and only while the rings are on screen.
 */
const WAVE_SPACING = 21;
const WAVE_REACH = 240;
const WAVE_PX_MS = 0.012;
const WAVE_SCROLL = 1.5;
/** Scroll speed, in px per ms, at which the rings are at their brightest: a slow drag. */
const SURGE_FULL = 0.6;
const WAVE_STEP_MS = 66;
/** How strong the rings are, 0 to 1: at rest, and when a tap or a scroll drives them. */
const WAVE_REST = 0.8;
/** How near the pointer, in CSS px, an event must be to be the one read. */
const FOCUS_R = 36;
/** The lens's radius, in CSS px: this, or a quarter of a narrow window. */
const LENS = 120;
/** Space kept clear around the cards' column, and the width the halftone thins out over before it. */
const GAP = 16;
const EDGE_FADE = 48;
/** The smallest box, in CSS px, the swarm is drawn in; smaller, it would be a blot. */
const MIN_SWARM = 72;

const GLYPHS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["0", "0", "0", "0", "1"],
};

type Box = [x0: number, y0: number, x1: number, y1: number];

/** The epicenter's mark, 7 × 7 cells: a filled pixel disc (owner's call; a ring with a centre came first). */
const TARGET = ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."];

/** The value below which a share `p` of `values` falls. */
function quantile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] ?? 0;
}

/**
 * Where an event sits in the document: the swarm itself (its middle 96 %, so a stray event does not
 * shrink the rest to a dot) fitted into `box`, in CSS px.
 */
export function fit(events: BackdropEvent[], [x0, y0, x1, y1]: Box) {
  const lons = events.map((e) => e.lon);
  const lats = events.map((e) => e.lat);
  const lonMin = quantile(lons, 0.02);
  const lonMax = quantile(lons, 0.98);
  const latMin = quantile(lats, 0.02);
  const latMax = quantile(lats, 0.98);
  const k = Math.min((x1 - x0) / Math.max(0.02, lonMax - lonMin), (y1 - y0) / Math.max(0.02, latMax - latMin));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const midLon = (lonMin + lonMax) / 2;
  const midLat = (latMin + latMax) / 2;
  return (lon: number, lat: number): [number, number] => [cx + (lon - midLon) * k, cy - (lat - midLat) * k];
}

/** How far right the text of `el` reaches, in document px (its lines, not its block's box). */
function textRight(el: Element | null) {
  if (!el) return 0;
  const range = document.createRange();
  range.selectNodeContents(el);
  return Math.max(0, ...[...range.getClientRects()].map((r) => r.right + scrollX));
}

/** The page's layout, in document px: the cards' column and where the cards begin. */
function readLayout() {
  const header = document.querySelector("header");
  const column = header?.parentElement?.getBoundingClientRect();
  const panel = document.querySelector('[role="tabpanel"]')?.getBoundingClientRect();
  const w = document.documentElement.clientWidth;
  const left = column ? column.left + scrollX : Math.max(0, (w - 1280) / 2 + 24);
  const right = column ? column.right + scrollX : w - left;
  // The content starts one row gap below the header, whatever comes first there: a tab panel on the
  // monitor, a notice or a panel on /insights.
  const gap = header?.parentElement ? parseFloat(getComputedStyle(header.parentElement).rowGap) || 0 : 0;
  const headerBox = header?.getBoundingClientRect();
  const cardsTop = headerBox ? headerBox.bottom + scrollY + gap : panel ? panel.top + scrollY : 240;
  // The cards end where the footer begins: below that the column is open to the pattern again.
  const footer = document.querySelector("footer")?.getBoundingClientRect();
  const cardsBottom = footer ? footer.top + scrollY : Infinity;
  const root = document.getElementById("root");
  const height = root ? Math.ceil(root.getBoundingClientRect().bottom + scrollY) : innerHeight;
  // The header's words: the title and subtitle, and the row of controls above them.
  const title = header?.querySelector("h1") ?? null;
  const subtitle = header?.querySelector("p") ?? null;
  const words = Math.max(textRight(title), textRight(subtitle));
  const subtitleTop = subtitle ? subtitle.getBoundingClientRect().top + scrollY : cardsTop - 80;
  const controls = header?.firstElementChild?.getBoundingClientRect();
  const controlsBottom = controls ? controls.bottom + scrollY : 64;
  const key = [w, height, left, right, cardsTop, cardsBottom, words, subtitleTop].map(Math.round).join(":");
  return { w, height, left, right, cardsTop, cardsBottom, words, subtitleTop, controlsBottom, key };
}

/**
 * Where the epicenter's mark goes on a phone, in document px: the header's most open spot, the point
 * whose mark and label lie furthest from every line of text and every control, leaning right. On a
 * phone the header has no room beside the title, and a mark placed by geography fell on the words.
 * Null where no spot keeps the mark 6 px clear.
 */
function openSpot(top: number, bottom: number, left: number, right: number, label: number): [number, number] | null {
  const header = document.querySelector("header");
  if (!header) return null;
  const obstacles: DOMRect[] = [];
  const lines = document.createRange();
  for (const el of header.querySelectorAll("h1, p")) {
    lines.selectNodeContents(el);
    obstacles.push(...lines.getClientRects());
  }
  for (const el of header.querySelectorAll("a, button, [role='tablist']")) obstacles.push(el.getBoundingClientRect());
  const boxes = obstacles.map((r) => [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]);
  let best: [number, number] | null = null;
  let score = -Infinity;
  for (let y = top + 12; y <= bottom - 12; y += 3)
    for (let x = left + 12; x <= right - 16 - label; x += 3) {
      // The mark (a 21 px target) and its label to the right.
      const mark = [x - 11, y - 11, x + 14 + label, y + 11];
      let clear = Infinity;
      for (const [ox0, oy0, ox1, oy1] of boxes) {
        const dx = Math.max(ox0! - mark[2]!, mark[0]! - ox1!, 0);
        const dy = Math.max(oy0! - mark[3]!, mark[1]! - oy1!, 0);
        clear = Math.min(clear, Math.hypot(dx, dy));
      }
      const s = Math.min(clear, 40) + 0.02 * x;
      if (clear >= 6 && s > score) {
        score = s;
        best = [x, y];
      }
    }
  return best;
}

/** Whether a press landed on something the reader can use, which the pattern must not answer. */
const onControl = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("a, button, input, label, select, textarea, [role]");

export const pixels: BackdropFactory = (canvas, first) => {
  const context = canvas.getContext("2d");
  // No 2D canvas (a browser that refuses one): no background, and nothing else changes.
  if (!context) return { update() {}, destroy() {} };
  const ctx: CanvasRenderingContext2D = context;
  const noise = valueNoise(3);
  let input: BackdropInput = first;
  let cols = 0;
  let rows = 0;
  let lensPx = LENS;
  let ground = new Float32Array(0);
  /** Per row, the column ranges [from, to) that can hold a pixel. */
  let open: [number, number][][] = [];
  let density = new Float32Array(0);
  let peak = 1;
  let img: ImageData | null = null;
  let ink: [number, number, number] = [0, 0, 0];
  /** The mainshock's orange, `--chart-2`, for the epicenter, as 0–255. */
  let accent: [number, number, number] = [0, 0, 0];
  let dark = false;
  let text: TextLayer | null = null;
  let order: (BackdropEvent & { cx: number; cy: number })[] = [];
  /** The rows the swarm's pixels and labels can reach, or the epicenter's rings. */
  let swarmRows: [number, number] | null = null;
  /** Without hover: the epicenter, in document cells, and its magnitude; and how far the rings have rolled, in px. */
  let waves = false;
  let epicenter: { x: number; y: number; mag: number } | null = null;
  let wavePhase = 0;
  let waveTick = -1;
  let raf = 0;
  let layoutKey = "";

  // What the reader is doing, and where things are on their way to.
  let client: [number, number] | null = null;
  /** Whether the pointer is on a control (the subtitle's explainer), which the header does not switch under. */
  let clientOnControl = false;
  let tapTimer = 0;
  /** The lens, in document cells, gliding after the pointer; `k` is how open it is, 0 to 1. */
  let lens: { x: number; y: number; k: number } | null = null;
  /** Labels on screen or on their way: event index → how far revealed, 0 to 1, and whether wanted. */
  const labels = new Map<number, { p: number; want: boolean; focus: boolean }>();
  /** How far the swarm has surfaced under a scroll, 0 to 1, and how far it is heading. */
  let surge = 0;
  let surgeGoal = 0;
  let lastScroll = { y: scrollY, t: 0 };
  /** The refresh ring: its centre in document cells and when it set off. */
  let ripple: { x: number; y: number; t0: number } | null = null;
  let lastPress: { at: number; x: number; y: number } | null = null;
  let paintedRows: [number, number] | null = null;
  let lastTick = 0;
  /** Whether anything is still on its way somewhere; the loop stops when nothing is. */
  let settling = false;
  /** How far each header line has switched to its bitmap font, 0 to 1, and the tween taking it there. */
  const textShown: number[] = [];
  const textTweens: Tween[] = [];

  function setup() {
    const L = readLayout();
    layoutKey = L.key;
    // Whole cells that fit, rounded down: rounded up, the canvas was up to 2 px wider than the page
    // wherever the width is not a multiple of 3 (a 412 px phone), and the page scrolled sideways.
    cols = Math.floor(L.w / CELL);
    rows = Math.floor(L.height / CELL);
    lensPx = Math.min(LENS, L.w / 4);
    canvas.width = cols;
    canvas.height = rows;
    // Sized in JS rather than by a class: the document's height is only known here.
    canvas.style.width = `${cols * CELL}px`;
    canvas.style.height = `${rows * CELL}px`;
    img = ctx.createImageData(cols, rows);
    ink = tokenRgb("--foreground");
    accent = tokenRgb("--chart-2");
    dark = isDark();

    // How clear of the cards a pixel is: 0 on them, 1 from `EDGE_FADE` px away. The cards are the
    // column from the first card to the footer; the header above and the footer below are open.
    const clear = (px: number, py: number) => {
      const dx = Math.max(L.left - GAP - px, 0, px - (L.right + GAP));
      const dy = Math.max(L.cardsTop - GAP - py, 0, py - (L.cardsBottom + GAP));
      return Math.min(1, Math.hypot(dx, dy) / EDGE_FADE);
    };
    ground = new Float32Array(cols * rows);
    // Which columns of each row can hold a pixel at all: the whole row above and below the cards,
    // the margins beside them. Every loop over the canvas walks only these, so the cards' column,
    // most of the document and nearly all of it on a phone, costs nothing (a throttled phone spent
    // 135 ms on the first drawing when every cell was visited).
    const margins: [number, number][] = [
      [0, Math.max(0, Math.floor((L.left - GAP) / CELL))],
      [Math.min(cols, Math.ceil((L.right + GAP) / CELL)), cols],
    ];
    const beside = margins.filter(([from, to]) => to > from);
    open = [];
    for (let y = 0; y < rows; y++) {
      const py = (y + 0.5) * CELL;
      open.push(py > L.cardsTop - GAP && py < L.cardsBottom + GAP ? beside : [[0, cols]]);
    }
    for (let y = 0; y < rows; y++) {
      const py = (y + 0.5) * CELL;
      // Strongest in the first screen, then a faint constant down the margins, and back up over the
      // footer, so the page ends as it begins.
      const fall = Math.max(
        0.35 + 0.65 * (1 - Math.min(1, Math.max(0, (py - 200) / 1400))),
        Math.min(1, Math.max(0, (py - (L.cardsBottom - 120)) / 240)),
      );
      for (const [from, to] of open[y]!)
        for (let x = from; x < to; x++) {
          const c = clear((x + 0.5) * CELL, py);
          if (c === 0) continue;
          // Smooth and low, so the dither draws its own regular textures (dots, checks, lines) rather
          // than a scatter of specks.
          const n = noise(x / 64, y / 64) * 0.7 + noise(x / 20, y / 20) * 0.3;
          // Never exactly 0 off the cards, so a pixel with no ground can still take the swarm.
          ground[y * cols + x] = Math.max(0, n - 0.3) * 0.42 * fall * c + c * 1e-6;
        }
    }

    // The swarm: beside the title if the header has room, else in the right-hand margin, else
    // behind the subtitle's right-hand part.
    const top = L.controlsBottom + 8;
    const bottom = L.cardsTop - GAP - 8;
    const inHeader: Box = [Math.max(L.words + 32, L.left + (L.right - L.left) * 0.5), top, L.right, bottom];
    const inMargin: Box = [L.right + GAP + EDGE_FADE / 2, top, L.w - 12, top + 260];
    const inSubtitle: Box = [L.left + (L.right - L.left) * 0.4, L.subtitleTop - 4, L.right, bottom + 4];
    const roomy = ([x0, y0, x1, y1]: Box) => x1 - x0 >= MIN_SWARM && y1 - y0 >= MIN_SWARM * 0.8;
    const box = [inHeader, inMargin, inSubtitle].find(roomy) ?? null;
    const project = box ? fit(input.events, box) : null;
    density = new Float32Array(cols * rows);
    peak = 1;
    waves = !finePointer();
    epicenter = null;
    // Labels are kept by their event's place in `order`, which a new catalogue renumbers: a label held
    // over would name the next event.
    labels.clear();
    if (waves) {
      // No hover to read the swarm by: its largest event stands for it, and the rings carry the motion.
      order = [];
      const largest = input.events.reduce<BackdropEvent | null>((a, e) => (!a || e.mag > a.mag ? e : a), null);
      // The label's width in px: three 3×5 digits and a point, a cell apart.
      const spot = largest ? openSpot(L.controlsBottom - 8, L.cardsTop - GAP, L.left, L.right, 13 * CELL) : null;
      if (spot && largest) epicenter = { x: spot[0] / CELL, y: spot[1] / CELL, mag: largest.mag };
      const reach = WAVE_REACH / CELL + 2;
      swarmRows = epicenter
        ? [Math.max(0, Math.floor(epicenter.y - reach)), Math.min(rows, Math.ceil(epicenter.y + reach))]
        : null;
      return;
    }
    order = project
      ? [...input.events]
          .sort((a, b) => a.t - b.t)
          .map((e) => {
            const [x, y] = project(e.lon, e.lat);
            return { ...e, cx: Math.round(x / CELL), cy: Math.round(y / CELL) };
          })
      : [];
    swarmRows = box
      ? [Math.max(0, Math.floor(box[1] / CELL) - 12), Math.min(rows, Math.ceil(box[3] / CELL) + 12)]
      : null;
    splat();
  }

  /** The epicenter's rings at a cell, 0 to 1: whether it lies on a ring, and how strong the ring is there. */
  function ringsAt(x: number, y: number) {
    if (!epicenter) return 0;
    const d = Math.hypot(x + 0.5 - epicenter.x, y + 0.5 - epicenter.y) * CELL;
    if (d >= WAVE_REACH || d < CELL * 1.5) return 0;
    const m = (((d - wavePhase) % WAVE_SPACING) + WAVE_SPACING) % WAVE_SPACING;
    if (Math.min(m, WAVE_SPACING - m) >= CELL * 0.75) return 0;
    return WAVE_REST * Math.pow(1 - d / WAVE_REACH, 1.5);
  }

  /** Whether the rings are on screen and may roll: a visible tab, motion allowed, the header in view. */
  const rolling = () =>
    !!epicenter &&
    document.visibilityState === "visible" &&
    !reducedMotion() &&
    epicenter.y * CELL + WAVE_REACH > scrollY &&
    epicenter.y * CELL - WAVE_REACH < scrollY + innerHeight;

  /** The density field every event adds to: a soft hill as wide and tall as its magnitude. */
  function splat() {
    for (const e of order) {
      const r = 3 + Math.max(0, e.mag - 1.5) * 2.2;
      const R = Math.ceil(r * 2.5);
      const wgt = Math.pow(10, 0.3 * (e.mag - 2));
      for (let dy = -R; dy <= R; dy++) {
        const y = e.cy + dy;
        if (y < 0 || y >= rows) continue;
        for (let dx = -R; dx <= R; dx++) {
          const x = e.cx + dx;
          if (x < 0 || x >= cols) continue;
          const k = wgt * Math.exp(-(dx * dx + dy * dy) / (2 * r * r));
          const v = (density[y * cols + x]! += k);
          if (v > peak) peak = v;
        }
      }
    }
  }

  /** The refresh ring's strength at a cell, 0 to 1. */
  function ringAt(x: number, y: number, now: number) {
    if (!ripple) return 0;
    const t = (now - ripple.t0) / RIPPLE_MS;
    if (t < 0 || t >= 1) return 0;
    // Out fast and slowing, fading as it goes.
    const radius = (RIPPLE_REACH / CELL) * (1 - Math.pow(1 - t, 3));
    const d = Math.hypot(x - ripple.x, y - ripple.y) - radius;
    return Math.exp(-((d / (RIPPLE_BAND / CELL)) ** 2)) * Math.pow(1 - t, 1.5);
  }

  /** Repaints rows [y0, y1). */
  function paint(now: number, y0 = 0, y1 = rows) {
    y0 = Math.max(0, y0);
    y1 = Math.min(rows, y1);
    if (!img || y1 <= y0) return;
    const data = img.data;
    const [r, g, b] = ink;
    const soft = Math.round((dark ? 0.11 : 0.08) * 255);
    const hard = Math.round((dark ? 0.5 : 0.42) * 255);
    const pulse = Math.round((dark ? 0.3 : 0.24) * 255);
    const strong = Math.round((dark ? 0.72 : 0.6) * 255);
    const lensR = (lensPx / CELL) * (lens?.k ?? 0);
    const rippling = !!ripple && now - ripple.t0 < RIPPLE_MS;
    for (let y = y0; y < y1; y++) {
      // Only the cells that can hold a pixel; the rest of the canvas stays transparent as created.
      for (const [from, to] of open[y]!)
        for (let x = from; x < to; x++) {
          const i = y * cols + x;
          const o = i * 4;
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          const base = ground[i]!;
          if (base === 0) {
            data[o + 3] = 0;
            continue;
          }
          // Capped at a checkerboard, so the swarm stays a texture and its events' own pixels show on it.
          const v = base + Math.min(0.34, 0.6 * Math.sqrt(density[i]! / peak));
          const t = bayer(x, y);
          // The ring's own pixels are a step darker than the halftone, dithered by its strength, so it
          // reads as a pulse passing through the pattern rather than the pattern thickening.
          const ring = rippling ? ringAt(x, y, now) : 0;
          // The epicenter's rings, as bright again at a brisk scroll as at rest.
          const wave = epicenter ? ringsAt(x, y) * (1 + surge) : 0;
          data[o + 3] = ring * 0.7 > t || wave > t ? pulse : v > t ? soft : 0;
        }
    }

    // The epicenter: a target in the mainshock's colour (red is the page's colour for a failure, and
    // Pereira's on /insights), a filled pixel disc, and its magnitude beside it.
    if (epicenter) {
      const [er, eg, eb] = accent;
      const ex = Math.round(epicenter.x - 0.5);
      const ey = Math.round(epicenter.y - 0.5);
      TARGET.forEach((line, dy) =>
        [...line].forEach((bit, dx) => {
          if (bit !== "#") return;
          const x = ex + dx - 3;
          const y = ey + dy - 3;
          if (x < 0 || y < y0 || x >= cols || y >= y1) return;
          const o = (y * cols + x) * 4;
          data[o] = er;
          data[o + 1] = eg;
          data[o + 2] = eb;
          data[o + 3] = 255;
        }),
      );
      let cx = ex + 5;
      for (const ch of epicenter.mag.toFixed(1)) {
        const glyph = GLYPHS[ch]!;
        glyph.forEach((line, gy) =>
          [...line].forEach((bit, gx) => {
            const x = cx + gx;
            const y = ey - 2 + gy;
            if (bit === "1" && x < cols && y >= y0 && y < y1 && ground[y * cols + x] !== 0)
              data[(y * cols + x) * 4 + 3] = strong;
          }),
        );
        cx += glyph[0]!.length + 1;
      }
    }
    const put = (x: number, y: number, a: number) => {
      if (x < 0 || y < y0 || x >= cols || y >= y1 || ground[y * cols + x] === 0) return;
      data[(y * cols + x) * 4 + 3] = a;
    };

    // The events: at rest only the newest has its own pixel; the lens and the refresh ring bring back
    // the others, each in four steps, as a sprite fades.
    for (let i = 0; i < order.length; i++) {
      const e = order[i]!;
      let k = i === order.length - 1 ? 1 : 0;
      if (lens && lensR > 0) {
        const d = Math.hypot(e.cx - lens.x, e.cy - lens.y) / lensR;
        // Nearer the pointer, darker.
        if (d < 1) k = Math.max(k, Math.ceil((1 - d * d) * 4) / 4);
      }
      if (rippling) k = Math.max(k, Math.ceil(ringAt(e.cx, e.cy, now) * 4) / 4);
      if (k <= 0) continue;
      const s = e.mag >= 4 ? 3 : e.mag >= 3 ? 2 : 1;
      // Older events are paler, so the swarm's recent edge reads as the darkest, but none so pale it
      // is lost in the halftone.
      let a = Math.round(k * hard * (0.55 + 0.45 * (i / Math.max(1, order.length - 1))));
      // The event being read is the darkest thing in the pattern, with its label.
      const read = labels.get(i);
      if (read?.focus) a = Math.max(a, Math.round(strong * read.p));
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(e.cx + dx, e.cy + dy, a);
    }

    /** Whether a label's box lies wholly clear of the cards and of the header's lines, and on the canvas. */
    const words = (text?.boxes ?? [])
      .flat()
      .map(([bx0, by0, bx1, by1]): Box => [
        Math.floor(bx0 / CELL),
        Math.floor(by0 / CELL),
        Math.ceil(bx1 / CELL),
        Math.ceil(by1 / CELL),
      ]);
    const free = (box: Box) => {
      const [bx0, by0, bx1, by1] = box;
      if (bx0 < 0 || by0 < 0 || bx1 > cols || by1 > rows) return false;
      if (words.some((o) => bx0 < o[2] && bx1 > o[0] && by0 < o[3] && by1 > o[1])) return false;
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (ground[y * cols + x] === 0) return false;
      return true;
    };
    // The labels: the focus first, so the other takes whichever side the focus left free. Each is
    // revealed through the same Bayer matrix as the ground, so its digits dither in and out rather
    // than fade.
    const boxes: Box[] = [];
    const drawn = [...labels.entries()].sort(([, a], [, b]) => Number(b.focus) - Number(a.focus));
    for (const [i, state] of drawn) {
      const e = order[i];
      if (!e || state.p <= 0) continue;
      const label = e.mag.toFixed(1);
      const width = label.split("").reduce((n, ch) => n + GLYPHS[ch]![0]!.length + 1, -1);
      const s = e.mag >= 4 ? 3 : e.mag >= 3 ? 2 : 1;
      const by = e.cy + Math.floor(s / 2) - 2;
      const spot = [e.cx + s + 1, e.cx - 1 - width]
        .map((bx): Box => [bx - 1, by - 1, bx + width + 1, by + 6])
        .find(
          (box) => free(box) && !boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]),
        );
      if (!spot) continue;
      boxes.push(spot);
      const alpha = Math.round(strong * (state.focus ? 1 : 0.6));
      const shows = (x: number, y: number) => state.p > bayer(x, y);
      // A clear pixel margin, so the digits read over the dither.
      for (let y = spot[1]; y < spot[3]; y++) for (let x = spot[0]; x < spot[2]; x++) if (shows(x, y)) put(x, y, 0);
      let cx = spot[0] + 1;
      for (const ch of label) {
        const glyph = GLYPHS[ch]!;
        glyph.forEach((line, gy) =>
          line.split("").forEach((bit, gx) => bit === "1" && shows(cx + gx, by + gy) && put(cx + gx, by + gy, alpha)),
        );
        cx += glyph[0]!.length + 1;
      }
    }
    ctx.putImageData(img, 0, 0, 0, y0, cols, y1 - y0);
  }

  /**
   * Moves everything one frame on. The lens glides after the pointer and opens only over the
   * pattern, so it shrinks away over a card; the event nearest the pointer is the focus and gets its
   * label, and the largest other event in the lens a quieter one. Labels stay until their event
   * leaves the lens, so they do not flicker as the pointer moves.
   */
  function advance(now: number) {
    const dt = lastTick ? Math.min(64, now - lastTick) : 16;
    lastTick = now;
    const instant = reducedMotion();
    const ease = (tau: number) => (instant ? 1 : 1 - Math.exp(-dt / tau));
    settling = false;

    const target = client ? { x: (client[0] + scrollX) / CELL, y: (client[1] + scrollY) / CELL } : null;
    if (target && !lens) lens = { ...target, k: 0 };
    if (lens) {
      if (target) {
        const a = ease(FOLLOW_MS);
        lens.x += (target.x - lens.x) * a;
        lens.y += (target.y - lens.y) * a;
        if (Math.hypot(target.x - lens.x, target.y - lens.y) > 0.1) settling = true;
      }
      const cx = Math.round(target?.x ?? lens.x);
      const cy = Math.round(target?.y ?? lens.y);
      const over = !!target && cx >= 0 && cy >= 0 && cx < cols && cy < rows && ground[cy * cols + cx] !== 0;
      const want = over ? 1 : 0;
      lens.k += (want - lens.k) * ease(want > lens.k ? OPEN_MS : CLOSE_MS);
      if (Math.abs(want - lens.k) > 0.01) settling = true;
      else lens.k = want;
      if (!target && lens.k === 0) lens = null;
    }

    // Which events are read: the focus within `FOCUS_R` of the lens's centre, and the largest other.
    const radius = (lensPx / CELL) * (lens?.k ?? 0);
    let focus = -1;
    let best = FOCUS_R / CELL;
    let other = -1;
    if (lens && lens.k > 0.6) {
      for (let i = 0; i < order.length; i++) {
        const e = order[i]!;
        const d = Math.hypot(e.cx - lens.x, e.cy - lens.y);
        if (d < best) {
          best = d;
          focus = i;
        }
      }
      for (let i = 0; i < order.length; i++) {
        const e = order[i]!;
        if (i === focus || Math.hypot(e.cx - lens.x, e.cy - lens.y) > radius * 0.8) continue;
        if (other < 0 || e.mag > order[other]!.mag) other = i;
      }
    }
    for (const i of [focus, other]) if (i >= 0 && !labels.has(i)) labels.set(i, { p: 0, want: true, focus: false });
    for (const [i, state] of labels) {
      state.focus = i === focus;
      state.want = i === focus || i === other;
      const goal = state.want ? 1 : 0;
      state.p += (goal - state.p) * ease(state.want ? REVEAL_MS : HIDE_MS);
      if (Math.abs(goal - state.p) > 0.02) settling = true;
      else state.p = goal;
      if (state.p === 0) labels.delete(i);
    }

    // A scroll's surge: up while the page moves, back down once it has stopped for a moment.
    if (now - lastScroll.t > 90) surgeGoal = 0;
    surge += (surgeGoal - surge) * ease(surgeGoal > surge ? SURGE_UP_MS : SURGE_DOWN_MS);
    if (surge < 0.01 && surgeGoal === 0) surge = 0;
    else settling = true;

    if (ripple) {
      if (now - ripple.t0 < RIPPLE_MS) settling = true;
      else ripple = null;
    }

    // The epicenter's rings roll out while they are on screen.
    if (waves && rolling()) {
      wavePhase += dt * WAVE_PX_MS;
      settling = true;
    }

    // The title and subtitle are one block (owner's call): the pointer (or a tap) on any line of either
    // switches both, and they switch back once it leaves them all. The slack around each line bridges
    // the gap between the two, so crossing it does not flicker. Not while the pointer is on something
    // in them the reader can use (the subtitle's "SGC" explainer): its card opens over words that stay
    // words, with the term's own underline.
    const px = client ? client[0] + scrollX : NaN;
    const py = client ? client[1] + scrollY : NaN;
    const on =
      !clientOnControl &&
      !!text?.boxes.flat().some(([x0, y0, x1, y1]) => px >= x0 - 4 && px <= x1 + 4 && py >= y0 - 6 && py <= y1 + 6);
    text?.boxes.forEach((_, i) => {
      const tween = (textTweens[i] ??= { from: 0, to: 0, t0: 0, ms: 0 });
      const goal = on ? 1 : 0;
      if (tween.to !== goal) {
        // Retargeted from wherever the scan is, so leaving half-way sends it back from there. In, the
        // subtitle's scan starts a beat after the title's, so the change travels down the block; out,
        // both at once and quicker: the reader has moved on.
        tween.from = textAt(tween, now);
        tween.to = goal;
        tween.t0 = now + (goal && !instant ? i * TEXT_STAGGER_MS : 0);
        const span = text?.spans[i] ?? 0;
        tween.ms = instant ? 0 : (span / (goal ? TEXT_IN_PX_MS : TEXT_OUT_PX_MS)) * Math.abs(goal - tween.from);
      }
      textShown[i] = textAt(tween, now);
      if (textShown[i] !== goal) settling = true;
    });
  }

  function frame(now: number) {
    const hadRipple = !!ripple;
    advance(now);
    text?.paint(textShown, now);
    // Only the rows that can have changed: the lens's, the swarm's while it surges, the ring's, and
    // whatever was painted last frame.
    const pad = lensPx / CELL + 8;
    const spans: [number, number][] = [];
    if (lens) spans.push([Math.floor(lens.y - pad), Math.ceil(lens.y + pad)]);
    // And every label's, while it fades: a fast flick leaves one behind, beyond the lens's rows.
    for (const i of labels.keys()) {
      const e = order[i];
      if (e) spans.push([e.cy - 8, e.cy + 8]);
    }
    if ((surge > 0 || surgeGoal > 0) && swarmRows) spans.push(swarmRows);
    // The rings are redrawn at 15 frames a second, whatever the display's rate: pixel motion steps.
    const step = Math.floor(now / WAVE_STEP_MS);
    if (epicenter && swarmRows && step !== waveTick) {
      waveTick = step;
      spans.push(swarmRows);
    }
    if (ripple || hadRipple) {
      const reach = (RIPPLE_REACH + RIPPLE_BAND * 2) / CELL;
      const y = ripple?.y ?? lastPress?.y ?? 0;
      spans.push([Math.floor(y - reach), Math.ceil(y + reach)]);
      if (!ripple) spans.push([0, rows]);
    }
    const current: [number, number] | null = spans.length
      ? [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))]
      : null;
    const all = [current, paintedRows].filter((s): s is [number, number] => s !== null);
    paintedRows = current;
    if (!all.length) return;
    paint(now, Math.min(...all.map((s) => s[0])), Math.max(...all.map((s) => s[1])));
  }

  // Nothing runs on its own: a frame is drawn only while something is on its way somewhere, after
  // the reader has moved the pointer, tapped, scrolled or pressed.
  let running = false;
  function step(now: number) {
    frame(now);
    if (settling) raf = requestAnimationFrame(step);
    else {
      running = false;
      lastTick = 0;
    }
  }
  function wake() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(step);
  }

  /**
   * Draws everything again: on load, and after a new catalogue, a resize, a switch of theme or
   * language, or the web font. In three tasks, each after the browser has had the chance to paint,
   * so none is long: the layout and the ground, the header's glyphs, then the drawing. At 4× CPU the
   * whole took ~75 ms in one task, and at a theme switch it would have held back the button's own
   * repaint. A newer redraw that starts meanwhile takes over, and the older one stops where it is.
   */
  let generation = 0;
  const afterPaint = () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));
  async function restart() {
    const mine = ++generation;
    const current = () => mine === generation && !destroyed;
    await afterPaint();
    if (!current()) return;
    cancelAnimationFrame(raf);
    running = false;
    lastTick = 0;
    setup();
    await afterPaint();
    if (!current()) return;
    text?.destroy();
    text = textLayer(canvas.parentElement ?? document.body);
    await afterPaint();
    if (!current()) return;
    paint(performance.now());
    text?.paint(textShown, performance.now());
    if (client || surge > 0 || (waves && rolling())) wake();
  }

  let destroyed = false;
  void restart();

  // A mouse: the lens follows it. Whether it is on a control is read from the event's own target (the
  // canvas takes no pointer events), not by a hit test every frame.
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    client = [e.clientX, e.clientY];
    clientOnControl = onControl(e.target);
    wake();
  };
  const leave = () => {
    client = null;
    wake();
  };
  // A finger: a tap, not on a control and not the end of a scroll, holds the header's bitmap font for
  // a moment if it lands on a line of it, and sends one strong ring from the epicenter.
  let downAt: [number, number] | null = null;
  const down = (e: PointerEvent) => {
    lastPress = { at: performance.now(), x: (e.clientX + scrollX) / CELL, y: (e.clientY + scrollY) / CELL };
    downAt = e.pointerType === "mouse" ? null : [e.clientX, e.clientY];
  };
  const up = (e: PointerEvent) => {
    if (!downAt || onControl(e.target)) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) return;
    if (waves && epicenter && !reducedMotion()) ripple = { x: epicenter.x, y: epicenter.y, t0: performance.now() };
    client = [e.clientX, e.clientY];
    clientOnControl = false;
    clearTimeout(tapTimer);
    tapTimer = window.setTimeout(() => {
      client = null;
      wake();
    }, TAP_MS);
    wake();
  };
  // Scrolling: the lens stays under a resting mouse; on a phone the rings are pushed on and brighten.
  // A phone's header is only on screen for the first stretch of a scroll, so a little goes a long way:
  // the rings travel one and a half times the distance scrolled, and a slow drag already lights them
  // fully (owner: "sensitive to the scroll").
  const scrolled = () => {
    const now = performance.now();
    const moved = Math.abs(scrollY - lastScroll.y);
    if (waves && !reducedMotion()) {
      const speed = moved / Math.max(1, now - lastScroll.t);
      surgeGoal = Math.max(surgeGoal, Math.min(1, speed / SURGE_FULL));
      wavePhase += moved * WAVE_SCROLL;
    }
    lastScroll = { y: scrollY, t: now };
    if (client || surgeGoal > 0 || waves) wake();
  };
  const shown = () => document.visibilityState === "visible" && wake();
  // "Actualizar ahora": a ring from where it was just pressed, or from the focused button when it was
  // pressed from the keyboard. Only a press this last second counts: an older one, a click on a
  // chart before tabbing to the button, would send the ring from somewhere else (code review).
  const rippled = () => {
    if (reducedMotion()) return;
    const focused = document.activeElement?.getBoundingClientRect();
    const from =
      lastPress && performance.now() - lastPress.at < 1000
        ? [lastPress.x, lastPress.y]
        : focused
          ? [(focused.left + focused.width / 2 + scrollX) / CELL, (focused.top + focused.height / 2 + scrollY) / CELL]
          : null;
    if (!from) return;
    ripple = { x: from[0]!, y: from[1]!, t0: performance.now() };
    wake();
  };
  addEventListener("pointermove", move, { passive: true });
  addEventListener("pointerdown", down, { passive: true });
  addEventListener("pointerup", up, { passive: true });
  addEventListener("scroll", scrolled, { passive: true });
  addEventListener("backdrop:ripple", rippled);
  document.addEventListener("visibilitychange", shown);
  document.documentElement.addEventListener("pointerleave", leave);
  // The cards arrive after the page and grow as their drawings load, the web font can land after the
  // first drawing, and the window can be resized: redraw once they settle, if the layout or the
  // header's words moved. A phone's toolbar sliding away resizes the window and moves nothing, and
  // must not redraw the whole background mid-scroll (code review).
  let settle = 0;
  const later = () => {
    clearTimeout(settle);
    settle = window.setTimeout(() => {
      if (readLayout().key !== layoutKey) void restart();
    }, 250);
  };
  const off = onEnvChange(() => void restart(), later);
  const resized = new ResizeObserver(later);
  const root = document.getElementById("root");
  if (root) resized.observe(root);
  const header = document.querySelector("header");
  if (header) resized.observe(header);
  // Only if the web font is still on its way: once it is in, the first drawing already has it.
  if (document.fonts.status !== "loaded") void document.fonts.ready.then(() => !destroyed && void restart());

  return {
    update(next) {
      input = next;
      void restart();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      clearTimeout(tapTimer);
      resized.disconnect();
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
      removeEventListener("scroll", scrolled);
      removeEventListener("backdrop:ripple", rippled);
      document.removeEventListener("visibilitychange", shown);
      document.documentElement.removeEventListener("pointerleave", leave);
      text?.destroy();
      off();
    },
  };
};
