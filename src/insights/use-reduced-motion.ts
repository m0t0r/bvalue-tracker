import { useSyncExternalStore } from "react";

const query = () => window.matchMedia("(prefers-reduced-motion: reduce)");

/** Whether the reader asked for less motion. The drawings then change without travelling. */
export const useReducedMotion = () =>
  useSyncExternalStore(
    (cb) => {
      const mq = query();
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => query().matches,
  );
