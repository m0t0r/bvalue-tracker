/**
 * GEBCO 2020 (GEBCO Bathymetric Compilation Group 2020, doi:10.5285/a29c5465-b138-234d-e053-6c86abc040b9),
 * land and sea floor at 15″, read through the public Open Topo Data API. Shared by the insights
 * scripts so that the cuts and the 3D block round alike and agree where they meet.
 */

export const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Elevation at each [lon, lat], in whole tens of metres. 100 points a request, one request a second. */
export async function elevations(points: [number, number][]) {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const url = `https://api.opentopodata.org/v1/gebco2020?locations=${batch.map(([lon, lat]) => `${lat},${lon}`).join("|")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open Topo Data: HTTP ${res.status}`);
    const body = (await res.json()) as { status: string; results: { elevation: number | null }[] };
    if (body.status !== "OK" || body.results.length !== batch.length) throw new Error(`Open Topo Data: ${body.status}`);
    for (const p of body.results) {
      if (p.elevation === null) throw new Error("Open Topo Data returned no elevation");
      out.push(Math.round(p.elevation / 10) * 10);
    }
    // The public API allows one request a second.
    if (i + 100 < points.length) await new Promise((ok) => setTimeout(ok, 1100));
  }
  return out;
}
