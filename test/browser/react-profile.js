// Page init script for agent-browser (`--init-script test/browser/react-profile.js`): what React
// DevTools' Profiler tab shows, readable from the terminal. Per commit, which components rendered,
// how often, and for how long. The extension's panel cannot be read through agent-browser or the
// DevTools MCP, but everything in it comes from React itself, through the hook this stands in for.
//
// It needs a profiling build (`PROFILE=1 pnpm build`, see vite.config.ts): the production bundle of
// react-dom records no times, and every duration here would read 0 under minified names. Serve it
// with `scripts/fixture-server.ts serve --dir dist-profile`. It has to be an init script: React
// looks for the hook once, as it loads, and only times its renders if it finds one.
//
//   agent-browser eval '__prof.on = true'     then interact, then:
//   agent-browser eval 'JSON.stringify(__prof.summary())'
//   agent-browser eval '__prof.reset()'       before the next interaction
//
// `summary()` is `{ commits, dur, mounts, updates, top, err }`: `dur` is React's render time summed
// over the commits, in ms (each root's `actualDuration`); `top` lists up to 25 components by their own
// time, as `[name, mounts, updates, selfMs]`. A row is a name: components that share one (every
// insights tab is `Tab`, and an unnamed one is `Anonymous`) are summed into it. `commits` is the list
// behind it. `err` is set if reading a commit threw (the figures are then short), or if this could not
// install itself. docs/development.md ("Profiling React renders") has the method: the same steps on
// both builds, the median of three runs, never one number.
(() => {
  // The real extension is installed (or `--enable react-devtools`): leave its hook alone, it owns the
  // page's renderers, and say so where the figures would have been.
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const err = "react-profile.js: a React DevTools hook is already on this page; nothing is recorded";
    window.__prof = { on: false, commits: [], err, reset() {}, summary: () => ({ commits: 0, err }) };
    return;
  }

  const prof = (window.__prof = {
    on: false,
    commits: [],
    err: undefined,
    reset() {
      this.commits = [];
      this.err = undefined;
    },
  });

  // React's fiber tags for the things the Profiler lists: function and class components,
  // `forwardRef`, `memo` and `memo` of a plain function.
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
  // The fiber flag React sets when a component's render ran, rather than bailing out.
  const PERFORMED_WORK = 1;

  const nameOf = (fiber) => {
    const type = fiber.type;
    if (typeof type === "function") return type.displayName || type.name || "Anonymous";
    if (type && typeof type === "object") {
      // `forwardRef` keeps its function in `render`, `memo` in `type`, and either may wrap the other.
      const inner = type.render || type.type;
      if (typeof inner === "function") return inner.displayName || inner.name || "Anonymous";
      if (inner && typeof inner === "object" && typeof inner.render === "function") {
        return inner.render.displayName || inner.render.name || "Anonymous";
      }
    }
    return "?";
  };

  // A fiber's `actualDuration` includes its children's: its own time is what is left.
  const selfTime = (fiber) => {
    let ms = fiber.actualDuration || 0;
    for (let child = fiber.child; child; child = child.sibling) ms -= child.actualDuration || 0;
    return Math.max(0, ms);
  };

  // The walk the Profiler does: a fiber rendered in this commit if it is new or did work, and a
  // subtree React left alone still has the child it had (`child === alternate.child`).
  const walk = (fiber, mounting, out) => {
    for (; fiber; fiber = fiber.sibling) {
      const previous = fiber.alternate;
      const mount = mounting || previous === null;
      if (COMPONENT_TAGS.has(fiber.tag) && (mount || (fiber.flags & PERFORMED_WORK) === PERFORMED_WORK)) {
        const entry = (out[nameOf(fiber)] ||= { mounts: 0, updates: 0, self: 0 });
        if (mount) entry.mounts++;
        else entry.updates++;
        entry.self += selfTime(fiber);
      }
      if (mount) walk(fiber.child, true, out);
      else if (fiber.child !== previous.child) walk(fiber.child, false, out);
    }
  };

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    checkDCE() {},
    inject(renderer) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    setStrictMode() {},
    onCommitFiberRoot(_rendererId, root) {
      if (!prof.on) return;
      // Inside React's commit: an error thrown here would be the page's.
      try {
        const comps = {};
        walk(root.current, false, comps);
        prof.commits.push({ dur: root.current.actualDuration || 0, comps });
      } catch (err) {
        prof.err = String(err);
      }
    },
  };

  prof.summary = () => {
    const total = {};
    let dur = 0;
    let mounts = 0;
    let updates = 0;
    for (const commit of prof.commits) {
      dur += commit.dur;
      for (const [name, entry] of Object.entries(commit.comps)) {
        const sum = (total[name] ||= { mounts: 0, updates: 0, self: 0 });
        sum.mounts += entry.mounts;
        sum.updates += entry.updates;
        sum.self += entry.self;
        mounts += entry.mounts;
        updates += entry.updates;
      }
    }
    const top = Object.entries(total)
      .sort((a, b) => b[1].self - a[1].self)
      .slice(0, 25)
      .map(([name, entry]) => [name, entry.mounts, entry.updates, +entry.self.toFixed(1)]);
    return { commits: prof.commits.length, dur: +dur.toFixed(1), mounts, updates, top, err: prof.err };
  };
})();
