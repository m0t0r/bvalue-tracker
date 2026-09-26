/**
 * The 3D block's data besides the plate and the events: the ground over the whole region, from
 * GEBCO 2020, and the plane that ruptured in the M7.4, from USGS's finite-fault model. Committed
 * data (`block.json`, written by `scripts/insights-block.ts`). The plate is `SLAB2` in `plate.ts`.
 */
import raw from "./block.json";

/** Ground and sea floor every `step` degrees, row by row from the south-west corner, in metres. */
export interface GroundGrid {
  lon0: number;
  lat0: number;
  step: number;
  nx: number;
  ny: number;
  elevationM: number[];
}

export interface Rupture {
  /**
   * USGS's id for the M7.4, not SGC's. Show the plane only while the detected mainshock is that event:
   * gate on `USGS_ASSESSED.sgcId` in `story/model.ts` (SGC2026pqqmro), never on this id.
   */
  eventId: string;
  productUrl: string;
  strike: number;
  dip: number;
  rake: number;
  lengthKm: number;
  widthKm: number;
  /** The hypocentre USGS built the model around: neither SGC's location nor USGS's catalogue one. */
  hypocentre: { lat: number; lon: number; depthKm: number };
  /**
   * Four [longitude, latitude, depth in km]: top at the strike's start (north-east), top at its end,
   * bottom at its end, bottom at its start.
   */
  corners: number[][];
  alongStrike: number;
  downDip: number;
  /** Slip of each patch in cm, row by row from the top, each row from the strike's start. */
  slipCm: number[];
}

export const GROUND: GroundGrid = raw.ground;

/**
 * The fine ground's grid: `GROUND`'s box every 0.01°, land from Mapterhorn (`block3d/relief.bin.gz`,
 * written by `scripts/insights-relief.ts`, read by `block3d/relief.ts`).
 */
export const RELIEF = { lon0: -79, lat0: 3.5, step: 0.01, nx: 451, ny: 181 } as const;

/**
 * The fine ground's file, before gzip: whole metres, row by row from the south-west corner as
 * `GroundGrid`, each value the difference from the one west of it (the first of a row is itself), as
 * 16-bit two's complement split into two planes, every low byte and then every high byte. Differences
 * and planes gzip to ~80 kB against ~135 kB raw. A binary file and not an image: a canvas's
 * `getImageData`, the only way to read an image's pixels, gets noise added in private browsing
 * (Safari, Brave, Firefox's fingerprinting protection), and one unit in a height image is 256 m.
 */
export function encodeHeights(heights: ArrayLike<number>, nx: number): Uint8Array {
  const n = heights.length;
  const out = new Uint8Array(2 * n);
  for (let k = 0; k < n; k++) {
    const d = (k % nx === 0 ? heights[k]! : heights[k]! - heights[k - 1]!) & 0xffff;
    out[k] = d & 0xff;
    out[n + k] = d >> 8;
  }
  return out;
}

export function decodeHeights(bytes: Uint8Array, nx: number): Int16Array {
  const n = bytes.length / 2;
  const out = new Int16Array(n);
  for (let k = 0; k < n; k++) {
    const d = (((bytes[n + k]! << 8) | bytes[k]!) << 16) >> 16;
    out[k] = k % nx === 0 ? d : out[k - 1]! + d;
  }
  return out;
}
export const RUPTURE: Rupture = raw.rupture;
