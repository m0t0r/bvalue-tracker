import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { CLUSTERS, CLUSTER_DEPTH_KM, RECENT_DAYS, computeClusterStats } from "./clusters.ts";
import { fromCsv, toCsv, windowsToCsv } from "./csv.ts";
import { bValue, computeStats, fmd, mcGoodnessOfFit, mcMaxCurvature, WINDOW_SIZE, WINDOW_STEP } from "@bvalue/seismo";
import { MAINSHOCK_MIN_GAP, mainshockId, zoneMainshock } from "./mainshock.ts";
import { fetchCatalog } from "./seiscomp.ts";
import type { BBox, SeismicEvent } from "./types.ts";
import { DEFAULT_ZONE, ZONES, ZONE_IDS, isZoneId } from "./zones.ts";

const USAGE = `usage:
  pnpm cli fetch  [--zone ${ZONE_IDS.join("|")}] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--bbox=lonMin,latMin,lonMax,latMax] --out events.csv
  pnpm cli bvalue --input events.csv [--mc 2.3] [--manual-only] [--exclude-mainshock] [--windows] [--windows-out b-windows.csv] [--cluster shallow|deep]`;

function parseDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`bad date ${s}, want YYYY-MM-DD`);
  return new Date(`${s}T00:00:00Z`);
}

function parseBBox(s: string): BBox {
  const p = s.split(",").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) throw new Error("bad --bbox");
  return { lonMin: p[0]!, latMin: p[1]!, lonMax: p[2]!, latMax: p[3]! };
}

async function cmdFetch(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      zone: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      bbox: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.out) throw new Error("--out is required");
  const zoneId = values.zone ?? DEFAULT_ZONE;
  if (!isZoneId(zoneId)) throw new Error(`bad --zone ${zoneId}, want ${ZONE_IDS.join(" or ")}`);
  const zone = ZONES[zoneId];
  const page = await fetchCatalog({
    start: values.start ? parseDate(values.start) : zone.start,
    end: values.end ? parseDate(values.end) : new Date(Date.now() + 86_400_000),
    bbox: values.bbox ? parseBBox(values.bbox) : zone.bbox,
  });
  const events = [...page.events].sort((a, b) => a.time.localeCompare(b.time));
  await writeFile(values.out, toCsv(events));
  const last = events[events.length - 1];
  console.log(`wrote ${events.length} events -> ${values.out}`);
  if (page.duplicatesDropped > 0) console.log(`dropped ${page.duplicatesDropped} rows the server repeated`);
  if (last) console.log(`span ${events[0]!.time} .. ${last.time}`);
}

function report(label: string, events: SeismicEvent[], mcOverride?: number): number {
  const mags = events.map((e) => e.mag);
  console.log(`\n== ${label}: ${mags.length} events, M ${Math.min(...mags)}..${Math.max(...mags)}`);
  const maxc = mcMaxCurvature(mags);
  const gft = mcGoodnessOfFit(mags);
  const candidates: [string, number | null][] =
    mcOverride !== undefined
      ? [["given", mcOverride]]
      : [
          ["MAXC", maxc],
          ["GFT90", gft],
        ];
  for (const [name, mc] of candidates) {
    if (mc === null) {
      console.log(`  Mc[${name}] not found`);
      continue;
    }
    const r = bValue(mags, mc);
    console.log(
      `  Mc[${name}]=${mc.toFixed(1)}  b=${r.b.toFixed(3)} ± ${r.sigmaB.toFixed(3)}  a=${r.a.toFixed(2)}  n=${r.n}`,
    );
  }
  return mcOverride ?? maxc;
}

const fmtEvent = (e: SeismicEvent) => `${e.id} M${e.mag.toFixed(1)} ${e.magType} ${e.status} ${e.time}`;

function describeMainshock(m: ReturnType<typeof zoneMainshock<SeismicEvent>>, n: number): string {
  const head = `mainshock (largest ≥ ${MAINSHOCK_MIN_GAP.toFixed(1)} above every other of the ${n} events in this file):`;
  if (m.largest === null || m.runnerUp === null) return `${head} none, fewer than two events`;
  const pair = `${fmtEvent(m.largest)}, gap ${m.gap!.toFixed(1)} over ${fmtEvent(m.runnerUp)}`;
  if (m.state === "found") return `${head} ${pair}`;
  if (m.state === "awaiting-review") return `${head} none yet, awaiting review: ${pair}`;
  return `${head} none clear, ${pair}`;
}

async function cmdBvalue(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: "string" },
      mc: { type: "string" },
      "manual-only": { type: "boolean" },
      "exclude-mainshock": { type: "boolean" },
      windows: { type: "boolean" },
      "windows-out": { type: "string" },
      cluster: { type: "string" },
    },
  });
  if (!values.input) throw new Error("--input is required");
  let events = fromCsv(await readFile(values.input, "utf8"));
  // Over the whole file, before any filter, as the page and the API detect over a zone's whole
  // catalogue. A file that is itself a date range gets that range's answer, which is why it is printed.
  const mainshock = zoneMainshock(events);
  console.log(describeMainshock(mainshock, events.length));
  if (values["manual-only"]) events = events.filter((e) => e.status === "manual");
  if (values["exclude-mainshock"]) {
    const id = mainshockId(mainshock);
    if (id === null) console.log("--exclude-mainshock: no mainshock in this file, nothing excluded");
    events = events.filter((e) => e.id !== id);
  }
  if (events.length === 0) throw new Error("no events after filtering");
  const mcOverride = values.mc !== undefined ? Number(values.mc) : undefined;

  const byType = new Map<string, number>();
  for (const e of events) byType.set(e.magType, (byType.get(e.magType) ?? 0) + 1);
  console.log(
    "magnitude types:",
    [...byType]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}=${n}`)
      .join(" "),
  );

  const cluster = values.cluster;
  if (cluster !== undefined && cluster !== "shallow" && cluster !== "deep")
    throw new Error("--cluster must be shallow or deep");

  const mc = report("all events", events, mcOverride);

  // Both clusters are fitted above the Mc of the whole catalogue, exactly as the page does.
  const clusters = computeClusterStats(events, mcOverride ?? null);
  console.log(`\n== depth clusters, cut at ${CLUSTER_DEPTH_KM} km, shared Mc=${mc.toFixed(1)}`);
  for (const c of CLUSTERS) {
    const { stats, recent, ownMcHigher } = clusters[c];
    const fit = stats.fit
      ? `b=${stats.fit.b.toFixed(3)} ± ${stats.fit.sigmaB.toFixed(3)}  n=${stats.fit.n}`
      : "too few events at or above Mc";
    console.log(
      `  ${c.padEnd(8)} ${String(stats.count).padStart(4)} events  ${fit}  last ${RECENT_DAYS} days: ${recent}${ownMcHigher ? `  (own Mc ${stats.mcMaxc} is higher: b may be biased low)` : ""}`,
    );
  }
  if (clusters.difference) {
    const { p } = clusters.difference;
    console.log(
      `  Utsu test: p=${p.toFixed(3)} -> ${p < 0.05 ? "the b-values differ" : "the b-values cannot be told apart"}`,
    );
  }

  console.log("\n  FMD (lowest bins):");
  for (const b of fmd(events.map((e) => e.mag)).slice(0, 12)) {
    console.log(`    M${b.mag.toFixed(1)}  n=${String(b.count).padStart(4)}  N>=${b.cumulative}`);
  }

  // Same pipeline as the page and the API, so the three cannot disagree.
  const { windows } = cluster ? clusters[cluster].stats : computeStats(events, mcOverride ?? null);
  if (values.windows) {
    console.log(
      `\n  b over time${cluster ? `, ${cluster} cluster` : ""} (${WINDOW_SIZE}-event windows, step ${WINDOW_STEP}, fixed Mc=${mc.toFixed(1)}):`,
    );
    for (const w of windows) {
      console.log(`    ${w.from.slice(0, 16)} .. ${w.to.slice(0, 16)}  b=${w.b.toFixed(2)} ± ${w.sigmaB.toFixed(2)}`);
    }
  }
  if (values["windows-out"]) {
    await writeFile(values["windows-out"], windowsToCsv(windows));
    console.log(`\n  wrote ${windows.length} windows to ${values["windows-out"]}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "fetch") await cmdFetch(rest);
  else if (cmd === "bvalue") await cmdBvalue(rest);
  else {
    console.error(USAGE);
    process.exit(2);
  }
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  if ((err as Error).cause) console.error(`cause: ${String((err as Error).cause)}`);
  process.exit(1);
}
