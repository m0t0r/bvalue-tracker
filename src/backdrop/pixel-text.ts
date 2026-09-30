/**
 * The header's title and subtitle in a bitmap font, shown in their place on hover.
 *
 * The page's own text is set again in a 5×7 font (after the HD44780 character LCD's, with a narrower
 * lowercase, descenders and Spanish accents): each word, found through a `Range`, is set on the page
 * word's baseline and across exactly its width, so the words stay readable in pixels and nothing
 * moves or changes size but the style. A glyph's pixel is sized to the text: 3 px
 * (the background's own cell) for the title, whose capitals are then 21 px as in Geist at 30 px, and
 * 1.5 px (half a cell) for the 16 px subtitle.
 *
 * The page's text stays in the DOM, for selection, search and screen readers. The switch is a scan
 * along the lines (see `paint`), drawn on a canvas of its own over the header, half a cell to the
 * pixel; a crossfade, the first version, showed both whole texts at once half-way and read as naive.
 */

import { bayer, cssRgb } from "./shared";

const HALF = 1.5;
/** The width of the band the switch travels as, in CSS px: wide enough for the letters to be seen resolving. */
const BAND = 72;

// prettier-ignore
const FONT: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11100 10010 10001 10001 10001 10010 11100",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 10001 01010 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  // Lowercase is 4 wide (i, l, t 3; m, v, w 5), narrower than the capitals as in Geist, so a word in
  // pixels is no wider than the word it stands for and the spaces between words survive.
  a: "0000 0000 0110 0001 0111 1001 0111", b: "1000 1000 1110 1001 1001 1001 1110",
  c: "0000 0000 0111 1000 1000 1000 0111", d: "0001 0001 0111 1001 1001 1001 0111",
  e: "0000 0000 0110 1001 1111 1000 0111", f: "0011 0100 1110 0100 0100 0100 0100",
  g: "0000 0000 0111 1001 1001 0111 0001 0110", h: "1000 1000 1110 1001 1001 1001 1001",
  i: "010 000 110 010 010 010 111", j: "001 000 011 001 001 001 101 010",
  k: "1000 1000 1001 1010 1100 1010 1001", l: "110 010 010 010 010 010 111",
  m: "00000 00000 11010 10101 10101 10101 10101", n: "0000 0000 1110 1001 1001 1001 1001",
  o: "0000 0000 0110 1001 1001 1001 0110", p: "0000 0000 1110 1001 1001 1110 1000 1000",
  q: "0000 0000 0111 1001 1001 0111 0001 0001", r: "0000 0000 1011 1100 1000 1000 1000",
  s: "0000 0000 0111 1000 0110 0001 1110", t: "010 010 111 010 010 010 001",
  u: "0000 0000 1001 1001 1001 1001 0111", v: "00000 00000 10001 10001 10001 01010 00100",
  w: "00000 00000 10001 10001 10101 10101 01010", x: "0000 0000 1001 1001 0110 1001 1001",
  y: "0000 0000 1001 1001 1001 0111 0001 0110", z: "0000 0000 1111 0010 0100 1000 1111",
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11111 00010 00100 00010 00001 10001 01110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100", ",": "00000 00000 00000 00000 00000 01100 00100 01000",
  "(": "00010 00100 01000 01000 01000 00100 00010", ")": "01000 00100 00010 00010 00010 00100 01000",
  "-": "00000 00000 00000 11111 00000 00000 00000", ":": "00000 01100 01100 00000 01100 01100 00000",
  "'": "01100 00100 01000 00000 00000 00000 00000", "/": "00000 00001 00010 00100 01000 10000 00000",
  "?": "01110 10001 00001 00010 00100 00000 00100", "¿": "00100 00000 00100 01000 10000 10001 01110",
  "·": "00000 00000 00000 01100 01100 00000 00000",
};
FONT["–"] = FONT["-"]!;
FONT["—"] = FONT["-"]!;
FONT["’"] = FONT["'"]!;
// Accents: a lowercase letter's body is rows 2–6, so the mark takes rows 0–1 (the i loses its dot).
const body = (base: string) => FONT[base]!.split(" ").slice(2).join(" ");
for (const [accented, base] of [
  ["á", "a"],
  ["é", "e"],
  ["ó", "o"],
  ["ú", "u"],
] as const)
  FONT[accented] = `0010 0100 ${body(base)}`;
FONT["í"] = `001 010 ${body("i")}`;
FONT["ñ"] = `0101 1010 ${body("n")}`;
FONT["ü"] = `0000 1001 ${body("u")}`;
// A capital has no room above it on 7 rows: its accent is left off.
for (const [accented, base] of [
  ["Á", "A"],
  ["É", "E"],
  ["Í", "I"],
  ["Ó", "O"],
  ["Ú", "U"],
  ["Ñ", "N"],
] as const)
  FONT[accented] = FONT[base]!;

/** A glyph's rows, trimmed to the columns it uses so narrow letters stay narrow. */
export function glyph(ch: string): { rows: string[]; width: number } | null {
  const spec = FONT[ch];
  if (!spec) return null;
  const rows = spec.split(" ");
  let first = 5;
  let last = -1;
  for (const row of rows)
    for (let i = 0; i < row.length; i++)
      if (row[i] === "1") {
        first = Math.min(first, i);
        last = Math.max(last, i);
      }
  if (last < 0) return null;
  return { rows: rows.map((r) => r.slice(first, last + 1)), width: last - first + 1 };
}

export interface TextLayer {
  elements: HTMLElement[];
  /** Each element's lines of text, as boxes in document px: what pointing at it means. */
  boxes: [x0: number, y0: number, x1: number, y1: number][][];
  /** How far each element's band travels, in CSS px: its text's width and the band's. */
  spans: number[];
  /**
   * Shows each element as far as `progress[i]` (0 its own words, 1 pixels), as a scan: a band
   * `BAND` px wide travels along the lines, pixels behind it and the page's words ahead. Inside the
   * band the words thin out (a mask) while the glyphs come in through the Bayer matrix, each pixel
   * flickering once or twice as the band passes, the jitter the magnitudes have. `now` drives it.
   */
  paint(progress: number[], now: number): void;
  destroy(): void;
}

/** The header's title and subtitle as a bitmap-font layer, or null if the header has neither. */
export function textLayer(parent: HTMLElement): TextLayer | null {
  const header = document.querySelector("header");
  const elements: HTMLElement[] = [header?.querySelector("h1"), header?.querySelector("p")].flatMap((el) =>
    el ? [el] : [],
  );
  if (!elements.length) return null;
  const lines = document.createRange();
  const boxes = elements.map((el) => {
    lines.selectNodeContents(el);
    return [...lines.getClientRects()].map((b): [number, number, number, number] => [
      b.left + scrollX,
      b.top + scrollY,
      b.right + scrollX,
      b.bottom + scrollY,
    ]);
  });
  const all = boxes.flat();
  if (!all.length) return null;
  // The layer's region, on the half-cell grid, with room for descenders and centred glyphs to spill.
  const snap = (v: number) => Math.floor(v / HALF) * HALF;
  const x0 = snap(Math.min(...all.map((b) => b[0])) - 12);
  const y0 = snap(Math.min(...all.map((b) => b[1])) - 6);
  const w = Math.ceil((Math.max(...all.map((b) => b[2])) + 12 - x0) / HALF);
  const h = Math.ceil((Math.max(...all.map((b) => b[3])) + 6 - y0) / HALF);
  const tones = new Uint8Array(w * h);
  const colours: [number, number, number][] = [];
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;

  elements.forEach((el, index) => {
    const style = getComputedStyle(el);
    colours.push(cssRgb(style.color));
    const size = parseFloat(style.fontSize);
    // A glyph pixel in half cells: its 7 rows as tall as the font's capitals (about 0.7 em).
    const px = Math.max(1, Math.round((size * 0.7) / 7 / HALF));
    // Where 7 rows fall short of the capitals by more than a few percent (the 16 px subtitle: 10.5 px
    // against Geist's 11.2, and a lowercase 7.5 px against 8.5), the tall cut: row 5 drawn twice, as
    // pixel fonts are stretched, so capitals are 8 rows and lowercase 6, within ~6 % of Geist's.
    const tall = (size * 0.7) / (px * HALF) > 7.25;
    const height = tall ? 8 : 7;
    const cut = (rows: string[]) => (tall ? [...rows.slice(0, 6), rows[5]!, ...rows.slice(6)] : rows);
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const m = measure.measureText("Hg");
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    // A bold face gets a bold pixel: each stroke half a cell wider, to its right.
    const bold = parseInt(style.fontWeight, 10) >= 600 ? 1 : 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    // Each word is fitted to the page's word, so when the block switches nothing moves and the lines
    // keep their length (owner: set in the font's own spacing the pixel lines came out a tenth shorter,
    // and the text read as jumping). The room the pixel font leaves goes first between the letters, at
    // most half a cell per gap and only where a glyph pixel is two half cells (the title), so letters
    // stay clearly closer than words: spread wider, they ran the words together. What is left is split
    // on both sides of the word, which stays centred on the page's.
    const advance = (g: ReturnType<typeof glyph>) => (g ? g.width + 1 : 3);
    const stretch = px >= 2 ? 1 : 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (const match of text.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        const glyphs = Array.from(match[0], glyph);
        const baseline = rect.top + scrollY + (rect.height - (ascent + descent)) / 2 + ascent;
        // In half cells, from the layer's corner: the last row above the descender on the baseline.
        const gy = Math.round((baseline - height * px * HALF - y0) / HALF);
        const natural = glyphs.reduce((n, g) => n + advance(g), -1) * px + bold;
        // The title's words fall short of the page's by two glyph pixels, so a word space stays about
        // twice a letter gap under its tight tracking and bold strokes; the subtitle's need no help.
        const room = Math.round(rect.width / HALF) - stretch * 2 * px - natural;
        const gaps = glyphs.length - 1;
        const spread = Math.max(0, Math.min(room, gaps * stretch));
        let gx = Math.round((rect.left + scrollX - x0) / HALF) + Math.round((room - spread) / 2);
        const extra = (k: number) => (gaps > 0 ? Math.floor(spread / gaps) + (k < spread % gaps ? 1 : 0) : 0);
        for (const [k, g] of glyphs.entries()) {
          if (g)
            cut(g.rows).forEach((row, ry) => {
              for (let rx = 0; rx < row.length; rx++) {
                if (row[rx] !== "1") continue;
                for (let dy = 0; dy < px; dy++)
                  for (let dx = 0; dx < px + bold; dx++) {
                    const x = gx + rx * px + dx;
                    const y = gy + ry * px + dy;
                    if (x >= 0 && y >= 0 && x < w && y < h) tones[y * w + x] = index + 1;
                  }
              }
            });
          gx += advance(g) * px + extra(k);
        }
      }
    }
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // No 2D canvas: the header keeps its words, and hover does nothing to them.
  if (!ctx) return null;
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "pixelated pointer-events-none absolute -z-10";
  canvas.style.left = `${x0}px`;
  canvas.style.top = `${y0}px`;
  canvas.style.width = `${w * HALF}px`;
  canvas.style.height = `${h * HALF}px`;
  parent.append(canvas);
  const img = ctx.createImageData(w, h);
  let last = "";
  // The empty pixels that touch a glyph, and whose glyph: where the band throws its stray sparks.
  const halo = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (tones[y * w + x]) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const) {
        const t = tones[(y + dy) * w + x + dx];
        if (t) {
          halo[y * w + x] = t;
          break;
        }
      }
    }

  // Where each element's text runs, in document px, and where its own box starts (what its mask is
  // measured from).
  const runs = boxes.map((lines) => [Math.min(...lines.map((b) => b[0])), Math.max(...lines.map((b) => b[2]))]);
  const lefts = elements.map((el) => el.getBoundingClientRect().left + scrollX);
  /** The band's leading edge for a progress, in document px: from the text's start to a band past its end. */
  const front = (i: number, p: number) => runs[i]![0]! + p * (runs[i]![1]! - runs[i]![0]! + BAND);

  return {
    elements,
    boxes,
    spans: runs.map(([a, b]) => b! - a! + BAND),
    paint(progress, now) {
      const moving = progress.some((p) => p > 0 && p < 1);
      // A new flicker every 50 ms (20 a second) while the band is travelling, slow enough for each
      // shimmer to be seen (at 30 a second it read as a blur); nothing to redraw at rest.
      const tick = moving ? Math.floor(now / 50) : -1;
      const key = `${progress.map((p) => p.toFixed(4)).join(",")}:${tick}`;
      if (key === last) return;
      last = key;
      elements.forEach((el, i) => {
        const p = progress[i] ?? 0;
        if (p <= 0) {
          el.style.removeProperty("mask-image");
          el.style.removeProperty("-webkit-mask-image");
          return;
        }
        // The words give way behind the band: gone up to its trailing edge, whole from its leading one.
        const edge = front(i, p) - lefts[i]!;
        const mask = `linear-gradient(to right, transparent ${edge - BAND}px, #000 ${edge}px)`;
        el.style.setProperty("mask-image", mask);
        el.style.setProperty("-webkit-mask-image", mask);
      });
      const data = img.data;
      data.fill(0);
      if (progress.some((p) => p > 0)) {
        const fronts = progress.map((p, i) => front(i, p));
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            let tone = tones[y * w + x]!;
            const spark = !tone ? halo[y * w + x]! : 0;
            if (!tone && !spark) continue;
            // How far behind the band's leading edge this pixel is, across the band: 0 at the edge, 1
            // at its trailing edge, where the glyph is whole.
            const behind = (fronts[(tone || spark) - 1]! - (x0 + (x + 0.5) * HALF)) / BAND;
            if (behind <= 0 || (spark && behind >= 1)) continue;
            // A flicker that changes every tick, the same for a pixel through one tick.
            let n = Math.imul((x * 73856093) ^ (y * 19349663) ^ (tick * 83492791), 2654435761) >>> 0;
            n = (n ^ (n >>> 15)) / 4294967295;
            if (spark) {
              // Beside the letters, stray pixels spark and go out, most near the band's leading edge,
              // as the digits' do while they resolve.
              if (n > 0.3 * (1 - behind)) continue;
              tone = spark;
            } else if (behind < 1) {
              // On the letters, the ordered dither shaken hard, so each glyph resolves out of noise
              // rather than wiping on.
              if (behind <= bayer(x, y) * 0.8 + (n - 0.5) * 0.9) continue;
            }
            const [cr, cg, cb] = colours[tone - 1]!;
            const o = (y * w + x) * 4;
            data[o] = cr;
            data[o + 1] = cg;
            data[o + 2] = cb;
            data[o + 3] = 255;
          }
      }
      ctx.putImageData(img, 0, 0);
    },
    destroy() {
      canvas.remove();
      for (const el of elements) {
        el.style.removeProperty("mask-image");
        el.style.removeProperty("-webkit-mask-image");
      }
    },
  };
}
