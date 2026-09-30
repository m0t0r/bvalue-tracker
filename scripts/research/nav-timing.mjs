// RESEARCH (issue: instant /insights). Measures a navigation to /insights in a private headless
// Chrome, over the DevTools protocol, attached through the tab target so that prerendering stays
// allowed (docs/development.md, "Neither tool can show a prerender").
//
//   node scripts/research/nav-timing.mjs '<json>'
//     { origin, flags, mode: "click"|"repeat"|"cold", hover, hold, cpu, phone, runs, dwell, shots, from, to, cdp }
//
// mode "click": opens `from` (the monitor), waits `dwell` ms, hovers `hover` ms, presses the link to `to`
// for `hold` ms. "repeat": opens `to`, then opens it again and measures the second. Each run is a fresh
// browser context. `flags` is written to localStorage as the prototype's `?proto=` flags. Time 0 is the
// click (or the navigation), and `hero` is the last LCP entry (the story's intro), so a prerendered
// page counts from activation. `shots` is a folder for screencast frames (filmstrip.mjs tiles them).
//
// The Chrome it drives (the SPKI hash makes a self-signed localhost certificate trusted, so HTTP
// caching and service workers behave as on production; `--ignore-certificate-errors` disables both):
//   open -na "Google Chrome" --args --headless=new --remote-debugging-port=9444 \
//     --user-data-dir=<scratch>/chrome --ignore-certificate-errors-spki-list=<hash> about:blank
//   hash: openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der \
//     | openssl dgst -sha256 -binary | base64
// The server it measures: HTTP/2 (over HTTP/1.1 thirty requests queue on six connections and the
// delays add up request by request), production's delays as measured on 2026-09-30:
//   pnpm tsx scripts/fixture-server.ts serve --tls <dir with key.pem, cert.pem> --port 4472 \
//     --latency 100 --api-delay 350 --rules conservative
import { mkdirSync, writeFileSync } from "node:fs";

const opt = {
  origin: "http://localhost:4472",
  flags: "",
  mode: "click",
  hover: 0,
  cpu: 1,
  phone: false,
  runs: 5,
  dwell: 3500,
  shots: "",
  from: "/",
  to: "/insights",
  hold: 100,
  cdp: "http://127.0.0.1:9444",
  ...JSON.parse(process.argv[2] ?? "{}"),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(
  () => {
    console.error("watchdog: gave up");
    process.exit(2);
  },
  opt.runs * 45000 + 10000,
).unref();

const version = await (await fetch(`${opt.cdp}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 1;
const pending = new Map();
const listeners = new Set();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else for (const l of listeners) l(msg);
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const INIT = `(() => {
  try { if (location.origin === ${JSON.stringify(opt.origin)}) localStorage.setItem("sgc-swarm:proto", ${JSON.stringify(opt.flags)}); } catch {}
  const P = (window.__p = { lcp: [], paint: [], frames: [], click: null });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lcp.push({ t: e.startTime, size: e.size, txt: (e.element?.textContent || "").slice(0, 28) }); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.paint.push([e.name, e.startTime]); }).observe({ type: "paint", buffered: true });
  } catch {}
  try { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true }); } catch {}
  addEventListener("click", (e) => { try { window.__clicked(String(performance.timeOrigin + e.timeStamp)); } catch {} }, true);
  P.mo = {};
  new MutationObserver(() => {
    const t = Math.round(performance.now());
    if (!P.mo.tab && document.querySelector('[role="tab"][aria-selected="true"]')) P.mo.tab = [t, document.prerendering];
    if (!P.mo.content && document.querySelector('[role="tabpanel"] h2, [role="tabpanel"] p')) P.mo.content = [t, document.prerendering];
  }).observe(document, { subtree: true, childList: true, attributes: true });
  document.addEventListener("prerenderingchange", () => (P.mo.activated = Math.round(performance.now())));
  let last = "";
  const tick = () => {
    const s = (document.querySelector('div[role="status"].h-svh') ? "S" : "-") + (document.querySelector('[role="tabpanel"] h2, [role="tabpanel"] p') ? "C" : "-");
    if (s !== last) { P.frames.push([Math.round(performance.now()), s]); last = s; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

async function run(i) {
  const { browserContextId } = await send("Target.createBrowserContext", { disposeOnDetach: true });
  const sessions = new Map(); // page sessionId -> targetInfo
  let click = null;
  const shots = [];
  const setup = async (sessionId, info) => {
    sessions.set(sessionId, info);
    // Nothing awaited before the target is resumed: a paused target does not answer.
    const jobs = [
      send("Page.enable", {}, sessionId),
      send("Runtime.enable", {}, sessionId),
      send("Runtime.addBinding", { name: "__clicked" }, sessionId),
      send("Page.addScriptToEvaluateOnNewDocument", { source: INIT }, sessionId),
      opt.cpu > 1 ? send("Emulation.setCPUThrottlingRate", { rate: opt.cpu }, sessionId) : null,
      send(
        "Emulation.setDeviceMetricsOverride",
        opt.phone
          ? { width: 412, height: 823, deviceScaleFactor: 2, mobile: true }
          : { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false },
        sessionId,
      ),
    ];
    await send("Runtime.runIfWaitingForDebugger", {}, sessionId);
    await Promise.all(jobs);
  };
  const listener = (msg) => {
    if (process.env.DEBUG && msg.method?.startsWith("Target."))
      console.error(msg.method, JSON.stringify(msg.params).slice(0, 300));
    if (msg.method === "Target.attachedToTarget") {
      const { sessionId, targetInfo } = msg.params;
      if (targetInfo.browserContextId !== browserContextId) return;
      if (targetInfo.type === "tab") {
        void send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId)
          .then(() => send("Runtime.runIfWaitingForDebugger", {}, sessionId))
          .catch((e) => process.env.DEBUG && console.error("tab", String(e)));
      } else if (targetInfo.type === "page")
        void setup(sessionId, targetInfo).catch((e) => process.env.DEBUG && console.error("setup", String(e)));
      else void send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
    } else if (msg.method === "Target.detachedFromTarget") sessions.delete(msg.params.sessionId);
    else if (msg.method === "Runtime.bindingCalled" && msg.params.name === "__clicked")
      click = Number(msg.params.payload);
    else if (msg.method === "Page.screencastFrame") {
      shots.push({ t: msg.params.metadata.timestamp * 1000, data: msg.params.data });
      void send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }, msg.sessionId).catch(() => {});
    }
  };
  listeners.add(listener);
  await send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter: [{ type: "tab" }],
  });
  await send("Target.createTarget", { url: "about:blank", browserContextId });
  while (sessions.size === 0) await sleep(20);
  await sleep(150);
  const page = () => [...sessions.keys()][0];
  const evalIn = async (sessionId, expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
  // The page whose document is `path` and on screen (a prerender counts once activated).
  const shown = async (path) => {
    // A copy: sessions come and go while each evaluation is awaited.
    for (const s of Array.from(sessions.keys())) {
      const ok = await evalIn(s, `location.pathname === ${JSON.stringify(path)} && !document.prerendering`).catch(
        () => false,
      );
      if (ok) return s;
    }
    return null;
  };
  const waitShown = async (path, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await shown(path);
      if (s) return s;
      await sleep(15);
    }
    throw new Error(`${path} never shown`);
  };

  let start = null; // epoch ms the reader's wait is counted from
  let s;
  if (opt.mode === "click") {
    await send("Page.navigate", { url: opt.origin + opt.from }, page());
    s = await waitShown(opt.from);
    await evalIn(s, `new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)))`);
    await sleep(opt.dwell);
    const box = await evalIn(
      s,
      `(() => { const a = [...document.querySelectorAll('a[href="${opt.to}"]')].find((a) => a.getClientRects().length); const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    if (opt.shots) await send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 }, s);
    const mouse = (type, extra = {}) =>
      send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1, ...extra }, s);
    await mouse("mouseMoved", { button: "none", clickCount: 0 });
    if (opt.hover) await sleep(opt.hover);
    await mouse("mousePressed");
    await sleep(opt.hold);
    await mouse("mouseReleased");
  } else {
    if (opt.mode === "repeat") {
      // A first visit fills the caches; the second is the one measured.
      await send("Page.navigate", { url: opt.origin + opt.to }, page());
      s = await waitShown(opt.to);
      await sleep(opt.dwell);
      await send("Page.navigate", { url: "about:blank" }, s);
      await sleep(300);
    }
    if (opt.shots) await send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 }, page());
    start = Date.now();
    await send("Page.navigate", { url: opt.origin + opt.to }, page());
  }
  s = await waitShown(opt.to);
  if (opt.shots && opt.mode === "click") {
    // An activated prerender is another target: keep filming on it.
    await send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 }, s).catch(() => {});
  }
  await sleep(3000 * Math.max(1, opt.cpu / 2));
  const r = await evalIn(
    s,
    `(() => { const n = performance.getEntriesByType("navigation")[0]; return { origin: performance.timeOrigin, act: n.activationStart || 0, ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, htmlXfer: n.transferSize, lcp: __p.lcp, paint: __p.paint, frames: __p.frames, seeded: "seeded" in document.documentElement.dataset, seed: performance.getEntriesByName("proto:seed")[0]?.duration ?? null, entry: performance.getEntriesByName("proto:entry")[0]?.startTime ?? null, sw: !!navigator.serviceWorker?.controller, res: performance.getEntriesByType("resource").map((e) => [e.name.split("/").pop().slice(0, 22), Math.round(e.startTime), Math.round(e.responseEnd), e.transferSize]), lt: (window.__lt || []), mo: __p.mo, marks: Object.fromEntries(performance.getEntriesByType("mark").filter((m) => m.name.startsWith("proto:")).map((m) => [m.name.slice(6), Math.round(m.startTime)])), api: performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/events")).map((e) => Math.round(e.responseEnd)) }; })()`,
  );
  if (opt.mode === "click") start = click;
  const rel = (t) => Math.round(r.origin + Math.max(t, r.act) - start);
  const hero = r.lcp.at(-1);
  const content = r.frames.find(([, f]) => f.includes("C"));
  const out = {
    run: i,
    prerendered: r.act > 0,
    seeded: r.seeded,
    sw: r.sw,
    fcp: rel(r.paint.find(([n]) => n === "first-contentful-paint")?.[1] ?? NaN),
    hero: hero ? rel(hero.t) : null,
    heroTxt: hero?.txt,
    lcpN: r.lcp.length,
    contentFrame: content ? rel(content[0]) : null,
    frames: r.frames.map(([t, f]) => `${rel(t)}:${f}`).join(" "),
    seedMs: r.seed === null ? null : +r.seed.toFixed(1),
    entry: r.entry === null ? null : rel(r.entry),
    apiEnd: r.api.map((t) => rel(t)),
    mo: Object.fromEntries(
      Object.entries(r.mo ?? {}).map(([k, v]) => [k, Array.isArray(v) ? [rel(v[0]), v[1]] : rel(v)]),
    ),
    raw: { act: Math.round(r.act), marks: r.marks, mo: r.mo, api: r.api },
    ...(process.env.RES ? { act: Math.round(r.act), res: r.res, lt: r.lt } : {}),
  };
  if (opt.shots) {
    mkdirSync(opt.shots, { recursive: true });
    for (const f of shots) {
      const t = Math.round(f.t - start);
      if (t > -200 && t < 4000)
        writeFileSync(`${opt.shots}/${String(t + 1000).padStart(5, "0")}_${t}ms.jpg`, Buffer.from(f.data, "base64"));
    }
  }
  listeners.delete(listener);
  await send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  return out;
}

const results = [];
for (let i = 0; i < opt.runs; i++) {
  try {
    results.push(await Promise.race([run(i), sleep(40000).then(() => ({ run: i, error: "timeout" }))]));
  } catch (e) {
    results.push({ run: i, error: String(e) });
  }
}
const med = (k) => {
  const v = results
    .map((r) => r[k])
    .filter((x) => typeof x === "number")
    .sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : null;
};
console.log(
  JSON.stringify({
    opt: { origin: opt.origin, flags: opt.flags, mode: opt.mode, hover: opt.hover, cpu: opt.cpu, phone: opt.phone },
    median: { fcp: med("fcp"), hero: med("hero"), contentFrame: med("contentFrame") },
    heroAll: results.map((r) => r.hero),
    prerendered: results.filter((r) => r.prerendered).length,
    seeded: results.filter((r) => r.seeded).length,
    sw: results.filter((r) => r.sw).length,
    errors: results.filter((r) => r.error).length,
    sample: results[0],
  }),
);
ws.close();
