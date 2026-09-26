/**
 * The 3D block's fine ground: every 0.01° over `block.json`'s box, land from Mapterhorn and the sea
 * floor from GEBCO (`scripts/insights-relief.ts` writes `relief.bin.gz`; `encodeHeights` in `block.ts`
 * is its format). The scene draws GEBCO's 0.05° grid first and swaps this in once it has loaded.
 */
import { RELIEF, decodeHeights } from "../block";
import reliefUrl from "./relief.bin.gz?url";

export interface Relief {
  nx: number;
  ny: number;
  /** Metres, row by row from the south-west corner, as `GroundGrid`. */
  elevationM: Int16Array;
}

let loading: Promise<Relief> | undefined;

/**
 * Fetched and decoded once per page: the preview and every opening of the viewer share it. A failed
 * load is forgotten, so the next scene tries again.
 */
export function loadRelief(): Promise<Relief> {
  loading ??= decode().catch((e: unknown) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

async function decode(): Promise<Relief> {
  const res = await fetch(reliefUrl);
  if (!res.ok) throw new Error(`relief: HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  // Served as a gzip file. A server that sent it with Content-Encoding has had it unzipped already.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const plain = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(plain).arrayBuffer());
  }
  const { nx, ny } = RELIEF;
  if (bytes.length !== 2 * nx * ny) throw new Error("relief.bin.gz does not match RELIEF");
  return { nx, ny, elevationM: decodeHeights(bytes, nx) };
}
