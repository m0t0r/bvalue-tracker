/**
 * The event dots the map and the cross-sections share, on a canvas between the drawing's two SVGs (issue
 * #94). As ~1,900 SVG circles, each gliding on its own CSS transition, a scene turn cost a 4× phone
 * ~230 ms of layerizing per frame, so the one-second glide showed about five frames. Here a turn is one
 * canvas redrawn per frame until the last dot lands (~3 ms at 4×), and nothing at all between turns.
 */
import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { EASE_MOVE, cubicBezier } from "@/lib/ease";
import { useIsDark } from "@/lib/theme";
import { TOKEN, token, type Tone } from "../tones";
import { useReducedMotion } from "../use-reduced-motion";
import { at, progress, settled, toward, type Motion, type Tween } from "./glide";
import { star } from "./marks";

/**
 * One mark where the current scene puts it: a dot of radius `r`, or the mainshock's star of that size.
 * `a` is its opacity, 0 for hidden; `delay` holds its glide back, so deeper events move a little later
 * and a turn reads as the earth tipping rather than a cut.
 */
export interface Mark {
  id: string;
  x: number;
  y: number;
  r: number;
  a: number;
  tone: Tone;
  delay: number;
}

/** The glide the SVG dots had: 1 s on the page's `--ease-move`. */
const MOTION: Motion = { ease: cubicBezier(EASE_MOVE), ms: 1000 };
/** The star's outline, in the page's background colour, as the SVG star had it. */
const HALO_PX = 1.5;

const dprQuery = () => window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
/** Listens for the next change of the screen's pixel ratio, whatever it becomes, until unsubscribed. */
function subscribeDpr(cb: () => void) {
  let mq = dprQuery();
  const change = () => {
    mq.removeEventListener("change", change);
    mq = dprQuery();
    mq.addEventListener("change", change);
    cb();
  };
  mq.addEventListener("change", change);
  return () => mq.removeEventListener("change", change);
}
/** The screen's device pixels per CSS pixel, followed when the window moves to another screen or zooms. */
const useDevicePixelRatio = () => useSyncExternalStore(subscribeDpr, () => window.devicePixelRatio);

interface Course {
  pos: Tween;
  a: Tween;
}

interface Paint {
  dark: boolean;
  dpr: number;
  fill: Record<Tone, string>;
  halo: string;
  /** The star at full opacity, per size, for fading it as one piece (see `drawStar`). */
  sprites: Map<number, HTMLCanvasElement>;
}

/**
 * The mainshock's star. Opaque, it is drawn as it was in the SVG: filled, then outlined. While it fades,
 * the fill and the outline must fade together, as an SVG element's opacity fades them; faded one after
 * the other, the outline's inner half showed through the fill as a ring. So a fading star is an image of
 * the opaque one, drawn at the star's opacity.
 */
function drawStar(ctx: CanvasRenderingContext2D, p: Paint, r: number, x: number, y: number, a: number) {
  const path = new Path2D(star(r));
  const opaque = (c: CanvasRenderingContext2D) => {
    c.fillStyle = p.fill.mainshock;
    c.fill(path);
    c.strokeStyle = p.halo;
    c.lineWidth = HALO_PX;
    c.stroke(path);
  };
  if (a >= 1) {
    ctx.globalAlpha = 1;
    ctx.translate(x, y);
    opaque(ctx);
    ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    return;
  }
  const half = r + HALO_PX;
  let sprite = p.sprites.get(r);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = Math.ceil(2 * half * p.dpr);
    const c = sprite.getContext("2d")!;
    c.setTransform(p.dpr, 0, 0, p.dpr, half * p.dpr, half * p.dpr);
    opaque(c);
    p.sprites.set(r, sprite);
  }
  ctx.globalAlpha = a;
  ctx.drawImage(sprite, x - half, y - half, sprite.width / p.dpr, sprite.height / p.dpr);
}

export function DotLayer({ marks, width, height }: { marks: readonly Mark[]; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const courses = useRef(new Map<string, Course>());
  const box = useRef({ width: 0, height: 0, dpr: 0 });
  const paint = useRef<Paint>(null);
  const reduced = useReducedMotion();
  const dpr = useDevicePixelRatio();
  // The colours are the theme's tokens; a switch of theme reads them again and draws again.
  const dark = useIsDark();

  // Drawn before the browser paints, so a new scene's first frame already has its dots.
  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const b = box.current;
    const resized = b.width !== width || b.height !== height || b.dpr !== dpr;
    if (resized) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      box.current = { width, height, dpr };
    }
    // Read once per theme and screen, never in a turn's render.
    if (paint.current?.dark !== dark || paint.current.dpr !== dpr) {
      const fill = Object.fromEntries(Object.entries(TOKEN).map(([tone, name]) => [tone, token(name, canvas)]));
      paint.current = {
        dark,
        dpr,
        fill: fill as Record<Tone, string>,
        halo: token("--background", canvas),
        sprites: new Map(),
      };
    }
    const p = paint.current;

    // A new box moves every mark, and would send them all gliding: they jump there instead.
    const jump = reduced || resized;
    const now = performance.now();
    const next = new Map<string, Course>();
    const list: Course[] = [];
    for (const m of marks) {
      const old = courses.current.get(m.id);
      // A dot hidden now and hidden where it goes has nothing to show on the way: it moves at once, and
      // the canvas does not redraw a second of identical frames for it.
      const hidden = m.a === 0 && (!old || at(old.a, now, MOTION)[0] === 0);
      const c = {
        pos: toward(old?.pos, [m.x, m.y], now, m.delay, MOTION, jump || hidden),
        a: toward(old?.a, [m.a], now, m.delay, MOTION, jump),
      };
      next.set(m.id, c);
      list.push(c);
    }
    courses.current = next;

    let raf = 0;
    const frame = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      let moving = false;
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i]!;
        const { pos, a: fade } = list[i]!;
        if (!settled(pos, t) || !settled(fade, t)) moving = true;
        const a = fade.from[0]! + (fade.to[0]! - fade.from[0]!) * progress(fade, t, MOTION);
        if (a <= 0) continue;
        const k = progress(pos, t, MOTION);
        const x = pos.from[0]! + (pos.to[0]! - pos.from[0]!) * k;
        const y = pos.from[1]! + (pos.to[1]! - pos.from[1]!) * k;
        if (m.tone === "mainshock") {
          drawStar(ctx, p, m.r, x, y, a);
          continue;
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = p.fill[m.tone];
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (moving) raf = requestAnimationFrame(frame);
    };
    frame(now);
    return () => cancelAnimationFrame(raf);
  }, [marks, width, height, dpr, reduced, dark]);

  // Exactly the drawing's box, as the SVGs above and below it are: a canvas stretched to a fractional box
  // would sit up to half a pixel off the map it draws on.
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 h-(--h) w-(--w)"
      style={{ "--w": `${width}px`, "--h": `${height}px` } as CSSProperties}
    />
  );
}
