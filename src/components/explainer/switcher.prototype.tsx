// PROTOTYPE (issue #144): throwaway. The floating bar that flips between variants. Only in a build
// made with VITE_PROTOTYPE=1.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

const VARIANTS = [
  ["A", "Hover card"],
  ["B", "Preview · sheet on touch"],
  ["C", "Inline in the text"],
] as const;

function Bar({ event }: { event: string }) {
  const read = () => Math.max(0, VARIANTS.findIndex(([k]) => k === new URLSearchParams(location.search).get("variant")));
  const [i, setI] = useState(read);
  const go = (d: number) => {
    const n = (i + d + VARIANTS.length) % VARIANTS.length;
    const url = new URL(location.href);
    url.searchParams.set("variant", VARIANTS[n]![0]);
    history.replaceState(history.state, "", url);
    setI(n);
    window.dispatchEvent(new Event(event));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=slider], [role=application]")) return;
      if (e.altKey && e.key === "ArrowRight") go(1);
      if (e.altKey && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const [k, name] = VARIANTS[i]!;
  return (
    <div className="fixed top-2 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-1 py-1 text-sm text-white shadow-xl">
      <button type="button" className="rounded-full px-3 py-1 hover:bg-white/20" onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="px-2 font-medium whitespace-nowrap">
        {k} · {name}
      </span>
      <button type="button" className="rounded-full px-3 py-1 hover:bg-white/20" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}

export function mountSwitcher(event: string) {
  const div = document.createElement("div");
  div.dataset.prototypeSwitcher = "";
  document.body.append(div);
  createRoot(div).render(<Bar event={event} />);
}
