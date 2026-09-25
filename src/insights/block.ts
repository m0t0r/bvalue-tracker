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
export const RUPTURE: Rupture = raw.rupture;
