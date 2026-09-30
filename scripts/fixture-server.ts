/**
 * Serve a build with no Worker behind it: the files of `dist/client`, with brotli, and `/api/*`
 * answered from JSON captured once from a local database.
 *
 * It exists for measuring the page (docs/development.md, "Profiling React renders"): two builds
 * served this way get the same catalogue, byte for byte, however long the A/B takes, and nothing in
 * the setup can reach SGC, so the closed-guard bookkeeping of "Checking the page headlessly" is not
 * needed. It is not a preview of production: no CSP, no rate limit, no same-origin check.
 *
 *   1. Capture, once, from a dev server whose local database has data (`pnpm dev --port 5173`).
 *      Only `GET`s are sent, which read the database and never SGC:
 *        pnpm tsx scripts/fixture-server.ts capture --from http://localhost:5173
 *   2. Build, then serve (a second build in another checkout takes `--dir` and its own `--port`):
 *        PROFILE=1 pnpm build
 *        pnpm tsx scripts/fixture-server.ts serve --dir dist-profile --port 4180
 *
 * The fixtures go to `data/api-fixtures.json`, which git ignores: they are a copy of the catalogue.
 * The page's clock still runs, so a capture that is days old shows a quiet "last 7 days"; capture
 * again for figures that look current, and use one capture for both sides of a comparison.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSecureServer, type Http2ServerRequest, type Http2ServerResponse } from "node:http2";
import { dirname, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { brotliCompressSync, constants } from "node:zlib";
import {
  apiAnswer,
  cacheControl,
  CAPTURED,
  compressible,
  contentType,
  type Fixtures,
  staticFile,
} from "./fixture-routes";

const USAGE = `usage: pnpm tsx scripts/fixture-server.ts <capture|serve> [options]

  capture   GET the pages' API requests from a running dev server and save the answers
    --from URL     the dev server (default http://localhost:5173)
    --api FILE     where to save them (default data/api-fixtures.json)

  serve     serve a build's files, and /api/* from the saved answers
    --dir DIR      the build (default dist/client)
    --api FILE     the saved answers (default data/api-fixtures.json)
    --port N       (default 4180)
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string", default: "http://localhost:5173" },
    api: { type: "string", default: "data/api-fixtures.json" },
    dir: { type: "string", default: "dist/client" },
    port: { type: "string", default: "4180" },
    // Research options (instant /insights): a round trip's wait on every answer, the API's extra
    // server time, the speculation rules' eagerness, and a Cache-Control for the pages' HTML.
    latency: { type: "string", default: "0" },
    tls: { type: "string", default: "" },
    "api-delay": { type: "string", default: "0" },
    rules: { type: "string", default: "" },
    "html-cache": { type: "string", default: "" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function capture(): Promise<void> {
  const from = new URL(values.from);
  // A dev server on this machine only: the header below is what a page's own request carries, and
  // sending it to a deployed Worker would be reading the catalogue around its same-origin rule.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(from.hostname)) {
    fail(`capture reads a local dev server; ${from.origin} is not one`);
  }
  const fixtures: Record<string, unknown> = {};
  for (const path of CAPTURED) {
    const res = await fetch(new URL(path, from), { headers: { "Sec-Fetch-Site": "same-origin" } }).catch((err) =>
      fail(`${from.origin} did not answer (${String(err)}). Is \`pnpm dev\` running on that port?`),
    );
    if (!res.ok) fail(`GET ${path}: HTTP ${res.status}. An empty local database answers 500 (no such table).`);
    fixtures[path] = await res.json();
    const events = Array.isArray(fixtures[path]) ? ` (${fixtures[path].length} events)` : "";
    console.log(`GET ${path}${events}`);
  }
  mkdirSync(dirname(values.api), { recursive: true });
  writeFileSync(values.api, JSON.stringify(fixtures));
  console.log(`saved to ${values.api}`);
}

function serve(): void {
  const root = resolve(values.dir);
  if (!existsSync(join(root, "index.html"))) fail(`no build in ${values.dir}: run \`pnpm build\` first`);
  if (!existsSync(values.api)) fail(`no fixtures at ${values.api}: run \`capture\` first\n\n${USAGE}`);
  const fixtures = JSON.parse(readFileSync(values.api, "utf8")) as Fixtures;
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`--port ${values.port} is not a port`);

  const isFile = (file: string) => {
    const path = resolve(root, file);
    return path.startsWith(root + sep) && statSync(path, { throwIfNoEntry: false })?.isFile() === true;
  };
  // Compressed once per file or answer, and again when its bytes change: a build made while this
  // runs rewrites `index.html` under the same name, and the old copy would point at scripts that are
  // gone. The files at the quality a CDN stores them at, the API's answers at the quality an origin
  // compresses live (the catalogue is megabytes).
  const brotli = new Map<string, { raw: Buffer; out: Buffer }>();
  const compressed = (key: string, raw: Buffer, quality: number) => {
    const kept = brotli.get(key);
    if (kept?.raw.equals(raw)) return kept.out;
    const out = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } });
    brotli.set(key, { raw, out });
    return out;
  };

  const latency = Number(values.latency);
  const apiDelay = Number(values["api-delay"]);
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const wait = latency + ((req.url ?? "").startsWith("/api/") ? apiDelay : 0);
    if (wait > 0) setTimeout(() => answer(req, res), wait);
    else answer(req, res);
  };
  // With `--tls DIR` (key.pem, cert.pem) it speaks HTTP/2, as the edge does: over HTTP/1.1 a page's
  // thirty requests queue on six connections, and the delays above then add up request by request.
  const server = values.tls
    ? createSecureServer(
        {
          key: readFileSync(join(values.tls, "key.pem")),
          cert: readFileSync(join(values.tls, "cert.pem")),
          allowHTTP1: true,
        },
        handle as unknown as (req: Http2ServerRequest, res: Http2ServerResponse) => void,
      )
    : createServer(handle);
  const answer = (req: IncomingMessage, res: ServerResponse) => {
    req.headers.host ??= String(req.headers[":authority"] ?? "");
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const { pathname } = new URL(url, "http://localhost");
    const br = /\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""));
    // Asked for by this machine's own name only: another site's page cannot point a name of its own
    // at this port and read the catalogue through the browser (DNS rebinding).
    if (req.headers.host !== `localhost:${port}` && req.headers.host !== `127.0.0.1:${port}`) {
      req.resume();
      return void res.writeHead(403, { "content-type": "text/plain" }).end("forbidden\n");
    }

    if (pathname.startsWith("/api/")) {
      // The page's error reports are the one thing worth seeing here: print them, up to the 4 KB
      // the Worker reads.
      if (pathname === "/api/client-error") {
        let body = "";
        req.on("data", (chunk: Buffer) => (body = (body + chunk.toString()).slice(0, 4096)));
        req.on("end", () => console.error(`page error: ${body}`));
      } else req.resume();
      const answer = apiAnswer(method, url, fixtures);
      if (answer.status === 404) console.error(`404 ${method} ${url}`);
      if (answer.status === 204) return void res.writeHead(204).end();
      const raw = Buffer.from(JSON.stringify(answer.body));
      const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" };
      if (br) {
        const body = compressed(`${method} ${url}`, raw, 5);
        return void res.writeHead(answer.status, { ...headers, "content-encoding": "br" }).end(body);
      }
      return void res.writeHead(answer.status, headers).end(raw);
    }

    if (pathname === "/speculation-rules.json" && values.rules) {
      const rules = { prerender: [{ where: { href_matches: ["/", "/choco", "/insights"] }, eagerness: values.rules }] };
      return void res
        .writeHead(200, { "content-type": "application/speculationrules+json", "cache-control": "no-cache" })
        .end(JSON.stringify(rules));
    }
    const file = method === "GET" || method === "HEAD" ? staticFile(pathname, isFile) : null;
    if (file === null) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
    const raw = readFileSync(join(root, file));
    const headers: Record<string, string> = {
      "content-type": contentType(file),
      "cache-control": cacheControl(file),
      vary: "accept-encoding",
    };
    if (file.endsWith(".html")) {
      if (values.rules) headers["speculation-rules"] = '"/speculation-rules.json"';
      if (values["html-cache"]) headers["cache-control"] = values["html-cache"];
    }
    if (file === "sw.js") headers["cache-control"] = "no-cache";
    const body = br && compressible(file) ? compressed(file, raw, constants.BROTLI_MAX_QUALITY) : raw;
    if (body !== raw) headers["content-encoding"] = "br";
    res.writeHead(200, headers).end(method === "HEAD" ? undefined : body);
  };
  // This machine only: it serves a copy of the catalogue with none of the Worker's checks.
  server.listen(port, "127.0.0.1", () => {
    console.log(`${values.dir} and ${Object.keys(fixtures).length} API answers at http://localhost:${port}`);
  });
  server.on("error", (err) => fail(`could not listen on ${port}: ${String(err)}`));
}

const [command] = positionals;
if (command === "capture") await capture();
else if (command === "serve") serve();
else fail(USAGE);
