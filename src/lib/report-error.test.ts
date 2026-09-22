import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reporter keeps per-page-load state — what it has already sent, and whether it is
 * mid-send — so each test gets a fresh module. Without this the cap and the dedupe would
 * leak across tests and the last few would pass for the wrong reason.
 */
async function fresh() {
  vi.resetModules();
  return import("./report-error");
}

let fetchMock: ReturnType<typeof vi.fn>;
let removeListeners: (() => void)[] = [];

/**
 * happy-dom's `window` outlives each test while `fresh()` hands out a new module every
 * time, so without this every install leaves another pair of listeners attached — each
 * bound to a different module's state — and one dispatched event fans out to all of them.
 */
function install(installErrorReporting: () => void): void {
  const add = window.addEventListener.bind(window);
  const added: [string, EventListener][] = [];
  window.addEventListener = ((type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    added.push([type, fn]);
    add(type, fn, opts);
  }) as typeof window.addEventListener;
  installErrorReporting();
  window.addEventListener = add;
  removeListeners.push(() => {
    for (const [t, fn] of added) window.removeEventListener(t, fn);
  });
}

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const off of removeListeners) off();
  removeListeners = [];
  vi.unstubAllGlobals();
});

/** What the one call carried, as the Worker will read it. */
const sent = (call = 0) => JSON.parse((fetchMock.mock.calls[call]![1] as RequestInit).body as string);

describe("reportError", () => {
  it("posts the report same-origin, as JSON", async () => {
    const { reportError } = await fresh();
    reportError({ message: "TypeError: x is not a function", stack: "at foo", source: "error" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/client-error");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    // A relative path, so the browser sends Sec-Fetch-Site: same-origin itself — which is
    // the only reason /api/client-error answers at all.
    expect(sent()).toMatchObject({ message: "TypeError: x is not a function", stack: "at foo", source: "error" });
  });

  // A broken page breaks repeatedly: a chart that throws on every render would otherwise
  // spend the day's log budget on one reader.
  it("sends one report per distinct message", async () => {
    const { reportError } = await fresh();
    for (let i = 0; i < 4; i++) reportError({ message: "same", source: "error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after five distinct messages", async () => {
    const { reportError } = await fresh();
    for (let i = 0; i < 9; i++) reportError({ message: `different ${i}`, source: "error" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  // The Worker refuses a body over 4 KB, so a long stack must not cost us the whole report.
  it("cuts the message and the stack to what the Worker will accept", async () => {
    const { reportError } = await fresh();
    reportError({ message: "m".repeat(5000), stack: "s".repeat(9000), source: "error" });
    expect(sent().message).toHaveLength(500);
    expect(sent().stack).toHaveLength(2000);
  });

  // The page keeps no state in the URL, so a long query string came from outside — and
  // uncapped it would 413 every report from that tab, silently, for a reader whose page
  // is already broken.
  it("cuts the URL too, however long a link made it", async () => {
    window.history.replaceState({}, "", `/?utm=${"x".repeat(4000)}`);
    const { reportError } = await fresh();
    reportError({ message: "boom", source: "error" });
    expect(sent().path).toHaveLength(200);
    expect(JSON.stringify(sent()).length).toBeLessThan(4096);
    window.history.replaceState({}, "", "/");
  });
});

describe("installErrorReporting", () => {
  it("reports an uncaught error, with its stack", async () => {
    const { installErrorReporting } = await fresh();
    install(installErrorReporting);

    const err = new RangeError("Invalid array length");
    window.dispatchEvent(new ErrorEvent("error", { message: "Uncaught RangeError", error: err }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ message: "Uncaught RangeError", source: "error" });
    expect(sent().stack).toContain("RangeError");
  });

  it("reports an unhandled rejection, and says which it was", async () => {
    const { installErrorReporting } = await fresh();
    install(installErrorReporting);

    const e = new Event("unhandledrejection") as Event & { reason: unknown };
    e.reason = new TypeError("Failed to fetch");
    window.dispatchEvent(e);

    expect(sent()).toMatchObject({ message: "TypeError: Failed to fetch", source: "unhandledrejection" });
  });

  it("describes a rejection that is not an Error at all", async () => {
    const { installErrorReporting } = await fresh();
    install(installErrorReporting);

    const e = new Event("unhandledrejection") as Event & { reason: unknown };
    e.reason = "just a string";
    window.dispatchEvent(e);

    expect(sent().message).toBe("just a string");
  });

  // The reporter's own failure reaches the same listener that called it. Without the guard
  // a Worker that is down turns one page error into a loop against it.
  it("never reports its own failure", async () => {
    fetchMock.mockImplementation(() => {
      window.dispatchEvent(new ErrorEvent("error", { message: "the report itself failed" }));
      return Promise.reject(new Error("network down"));
    });
    const { installErrorReporting } = await fresh();
    install(installErrorReporting);

    window.dispatchEvent(new ErrorEvent("error", { message: "the real error" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent().message).toBe("the real error");
  });
});
