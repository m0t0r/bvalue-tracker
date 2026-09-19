import { useEffect, useState } from "react";

/**
 * A clock for relative times ("hace 3 minutos"). Without it they only change when their data does,
 * and an unchanged status response re-renders nothing, so the label freezes. Ticks every 30 s and
 * the moment the reader comes back to the tab or window.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
