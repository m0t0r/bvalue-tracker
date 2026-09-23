/**
 * Which zone the page shows. It is the URL's path — `/` for Chocó, `/tolima` — because each zone is
 * its own page with its own link preview (`core/zone-pages.ts` says why). Switching tabs moves to
 * the other path without a reload, and the browser's back button undoes a switch.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ZONE_PATHS, zonePath } from "../../core/zone-pages";
import { DEFAULT_ZONE, ZONES, type Zone, type ZoneId } from "../../core/zones";

export const zoneFromUrl = (): ZoneId => zonePath(window.location.pathname);

export function useZoneState(): [ZoneId, (z: ZoneId) => void] {
  const [zone, setZone] = useState(zoneFromUrl);
  useEffect(() => {
    const onPop = () => setZone(zoneFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const choose = useCallback((z: ZoneId) => {
    const url = new URL(window.location.href);
    url.pathname = ZONE_PATHS[z];
    window.history.pushState(null, "", url);
    setZone(z);
  }, []);
  return [zone, choose];
}

const Ctx = createContext<Zone>(ZONES[DEFAULT_ZONE]);
export const ZoneProvider = Ctx.Provider;
/** The zone the page is showing, for the components that draw something of its own. */
export const useZone = () => useContext(Ctx);
