// Page init script for agent-browser (`--init-script test/browser/fault.js`): makes chosen requests
// fail the way a server would, which `network route` cannot (it only aborts or answers 200).
// Rules live in localStorage so they can change between reloads without a new session:
//
//   agent-browser eval 'localStorage.fault = JSON.stringify([{ match: "/api/insights", status: 503, delay: 3000 }])'
//   agent-browser reload
//
// A rule: `match` (substring of the URL), then any of `status` (default 500), `delay` in ms before
// answering, `body` (a string; default a JSON error), `once` (only the first match). A rule with
// only `delay` passes the real response through, late. `localStorage.removeItem("fault")` clears them.
// Faked answers never reach the network log; `window.faultLog` lists the URLs a rule answered.
(() => {
  const real = window.fetch.bind(window);
  const used = new Set();
  const rules = () => {
    try {
      return JSON.parse(localStorage.getItem("fault") ?? "[]");
    } catch {
      return [];
    }
  };
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const i = rules().findIndex((r, n) => url.includes(r.match) && !(r.once && used.has(n)));
    if (i < 0) return real(input, init);
    const rule = rules()[i];
    used.add(i);
    (window.faultLog ??= []).push(url);
    if (rule.delay) await new Promise((done) => setTimeout(done, rule.delay));
    if (rule.status === undefined && rule.body === undefined) return real(input, init);
    const status = rule.status ?? 500;
    const body = rule.body ?? JSON.stringify({ error: `fault.js: ${status}` });
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  };
})();
