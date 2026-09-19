import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fromCsv, toCsv } from "./csv.ts";
import { bValue, bValueWindows, fmd, mcGoodnessOfFit, mcMaxCurvature } from "./gr.ts";
import { CHOCO_SWARM_BBOX, MAINSHOCK_DATE, MAINSHOCK_ID, fetchCatalog } from "./seiscomp.ts";
import type { BBox, SeismicEvent } from "./types.ts";

const USAGE = `usage:
  pnpm cli fetch  [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--bbox lonMin,latMin,lonMax,latMax] --out events.csv
  pnpm cli bvalue --input events.csv [--mc 2.3] [--manual-only] [--exclude-mainshock] [--windows]`;

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
    options: { start: { type: "string" }, end: { type: "string" }, bbox: { type: "string" }, out: { type: "string" } },
  });
  if (!values.out) throw new Error("--out is required");
  const page = await fetchCatalog({
    start: values.start ? parseDate(values.start) : MAINSHOCK_DATE,
    end: values.end ? parseDate(values.end) : new Date(Date.now() + 86_400_000),
    bbox: values.bbox ? parseBBox(values.bbox) : CHOCO_SWARM_BBOX,
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
    mcOverride !== undefined ? [["given", mcOverride]] : [["MAXC", maxc], ["GFT90", gft]];
  for (const [name, mc] of candidates) {
    if (mc === null) { console.log(`  Mc[${name}] not found`); continue; }
    const r = bValue(mags, mc);
    console.log(`  Mc[${name}]=${mc.toFixed(1)}  b=${r.b.toFixed(3)} ± ${r.sigmaB.toFixed(3)}  a=${r.a.toFixed(2)}  n=${r.n}`);
  }
  return mcOverride ?? maxc;
}

async function cmdBvalue(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: "string" }, mc: { type: "string" },
      "manual-only": { type: "boolean" }, "exclude-mainshock": { type: "boolean" }, windows: { type: "boolean" },
    },
  });
  if (!values.input) throw new Error("--input is required");
  let events = fromCsv(await readFile(values.input, "utf8"));
  if (values["manual-only"]) events = events.filter((e) => e.status === "manual");
  if (values["exclude-mainshock"]) {
    events = events.filter((e) => e.id !== MAINSHOCK_ID);
  }
  if (events.length === 0) throw new Error("no events after filtering");
  const mcOverride = values.mc !== undefined ? Number(values.mc) : undefined;

  const byType = new Map<string, number>();
  for (const e of events) byType.set(e.magType, (byType.get(e.magType) ?? 0) + 1);
  console.log("magnitude types:", [...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(" "));

  const mc = report("all events", events, mcOverride);

  console.log("\n  FMD (lowest bins):");
  for (const b of fmd(events.map((e) => e.mag)).slice(0, 12)) {
    console.log(`    M${b.mag.toFixed(1)}  n=${String(b.count).padStart(4)}  N>=${b.cumulative}`);
  }

  if (values.windows) {
    console.log(`\n  b over time (150-event windows, step 25, fixed Mc=${mc.toFixed(1)}):`);
    for (const w of bValueWindows(events, mc)) {
      console.log(`    ${w.from.slice(0, 16)} .. ${w.to.slice(0, 16)}  b=${w.b.toFixed(2)} ± ${w.sigmaB.toFixed(2)}`);
    }
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "fetch") await cmdFetch(rest);
  else if (cmd === "bvalue") await cmdBvalue(rest);
  else { console.error(USAGE); process.exit(2); }
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  if ((err as Error).cause) console.error(`cause: ${String((err as Error).cause)}`);
  process.exit(1);
}
