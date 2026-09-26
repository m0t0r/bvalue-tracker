/**
 * Writes `src/insights/durations.json`: how long the fault took to break, for the story's
 * "¿Cuánto duró?" step. Run once, by hand, and commit the output:
 *
 *   pnpm tsx scripts/insights-durations.ts && pnpm format
 *
 * The measure is the same for every event: when 5% and when 95% of the moment was out, on its source
 * time function (the rate at which the fault released its seismic moment; `releaseTimes`). The page
 * compares the 90% between them, which does not depend on where each source puts its zero (USGS at
 * the hypocentral time, SCARDEC at the first significant release). Two sources, each a model of the
 * rupture fitted to recorded waves:
 * - The M7.4: USGS's finite-fault model for us6000tjl2 (product `us6000tjl2_1`, reviewed), its
 *   `moment_rate.mr` pinned by URL, as `scripts/insights-block.ts` pins the same product's plane.
 *   USGS's work, public domain.
 * - Past events: the SCARDEC database of source time functions (Vallée & Douet 2016, PEPI 257,
 *   doi:10.1016/j.pepi.2016.05.012), M ≥ 5.8 from 1992, its whole archive downloaded once (~32 MB)
 *   and the named events' average functions (`fctmoysource_*`) read from it. SCARDEC covers only
 *   two of `history.json`'s events: Neira and Calima, both 1995. Páez 1994 and Armenia 1999 are not
 *   in it, and the others are older than it. Only the two derived times are committed, with the
 *   citation. SCARDEC serves no HTTPS and the archive changes with each yearly update, so it cannot be
 *   pinned by hash: its member names are checked before tar sees them, and any change to the figures
 *   shows in the committed JSON's diff and fails the test that pins them.
 *
 * Checked on 2026-09-26 against both files by hand (Python).
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseTimes } from "../src/insights/release";

const OUT = new URL("../src/insights/durations.json", import.meta.url);
const USGS_MR = "https://earthquake.usgs.gov/product/finite-fault/us6000tjl2_1/us/1786734841617/moment_rate.mr";
const SCARDEC_ARCHIVE = "http://scardec.projects.sismo.ipgp.fr/sourcefunction_archive_all.tar.bz2";
/** ISC-GEM ids of `history.json`'s events, and SCARDEC's directory for each. */
const PAST = [
  { id: "iscgem89834", scardec: "FCTs_19950819_214331_COLOMBIA" },
  { id: "iscgem118073", scardec: "FCTs_19950208_184025_COLOMBIA" },
] as const;

/** `[seconds, rate]` rows from whitespace-separated text, skipping the first `header` lines. */
function rows(text: string, header: number) {
  return text
    .split("\n")
    .slice(header)
    .filter((l) => l.trim())
    .map((l) => {
      const [t, r] = l.trim().split(/\s+/).map(Number);
      if (!Number.isFinite(t) || !Number.isFinite(r)) throw new Error(`not a number in "${l}"`);
      return [t!, r!] as const;
    });
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const sig4 = (v: number) => Number(v.toPrecision(4));

async function get(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// USGS: two header lines ("dt: 0.01", then the column names), then time and moment rate in N·m/s.
const mrText = await (await get(USGS_MR)).text();
if (!mrText.startsWith("dt:")) throw new Error("moment_rate.mr: unexpected header");
const main = releaseTimes(rows(mrText, 2));

// SCARDEC: the whole archive, then only the named events' directories.
const dir = await mkdtemp(join(tmpdir(), "scardec-"));
const archive = join(dir, "archive.tar.bz2");
await writeFile(archive, Buffer.from(await (await get(SCARDEC_ARCHIVE)).arrayBuffer()));
const listing = execFileSync("tar", ["tjf", archive], { maxBuffer: 1 << 26 })
  .toString()
  .split("\n");
const past = [];
try {
  for (const p of PAST) {
    // The archive comes over plain HTTP, so a member name is untrusted: only a plain relative path of
    // the expected shape is used, and `--` stops tar reading it as an option (`--use-compress-program=…`
    // would run a command).
    const member = listing.find((l) => l.includes(`/${p.scardec}/fctmoysource_`));
    if (!member) throw new Error(`SCARDEC no longer holds ${p.scardec}`);
    if (!/^[A-Za-z0-9_]+\/FCTs_\d{8}_\d{6}_[A-Z_-]+\/fctmoysource_\d{8}_\d{6}_[A-Z_-]+$/.test(member))
      throw new Error(`SCARDEC: unexpected member name ${JSON.stringify(member)}`);
    execFileSync("tar", ["xjf", archive, "-C", dir, "--", member]);
    // Two header lines: origin (from NEIC-PDE), then depth, moment (N·m), Mw and mechanism (SCARDEC's).
    const text = await readFile(join(dir, member), "utf8");
    const r = releaseTimes(rows(text, 2));
    past.push({ id: p.id, scardec: p.scardec, t5: r2(r.t5), t95: r2(r.t95), momentNm: sig4(r.moment) });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

const out = {
  source: { retrieved: new Date().toISOString().slice(0, 10) },
  main: {
    sgcId: "SGC2026pqqmro",
    usgsId: "us6000tjl2",
    product: "us6000tjl2_1",
    url: USGS_MR,
    t5: r2(main.t5),
    t95: r2(main.t95),
    momentNm: sig4(main.moment),
  },
  past,
};
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}:`, JSON.stringify(out));
