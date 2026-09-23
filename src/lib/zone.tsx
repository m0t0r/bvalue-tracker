/**
 * Which zone the page shows. It lives in the URL, so a link to the Tolima tab opens the
 * Tolima tab, and the browser's back button undoes a switch. Chocó, the default, keeps the
 * bare URL, so every link shared before there were two zones still lands where it did.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_ZONE, ZONES, isZoneId, type Zone, type ZoneId } from "../../core/zones";

/** The query parameter. In Spanish, like the page: a reader sees it in every link they share. */
export const ZONE_PARAM = "zona";

export function zoneFromUrl(search = window.location.search): ZoneId {
  const v = new URLSearchParams(search).get(ZONE_PARAM);
  return isZoneId(v) ? v : DEFAULT_ZONE;
}

export function useZoneState(): [ZoneId, (z: ZoneId) => void] {
  const [zone, setZone] = useState(() => zoneFromUrl());
  useEffect(() => {
    const onPop = () => setZone(zoneFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const choose = useCallback((z: ZoneId) => {
    const url = new URL(window.location.href);
    if (z === DEFAULT_ZONE) url.searchParams.delete(ZONE_PARAM);
    else url.searchParams.set(ZONE_PARAM, z);
    window.history.pushState(null, "", url);
    setZone(z);
  }, []);
  return [zone, choose];
}

const Ctx = createContext<Zone>(ZONES[DEFAULT_ZONE]);
export const ZoneProvider = Ctx.Provider;
/** The zone the page is showing, for the components that draw something of its own. */
export const useZone = () => useContext(Ctx);
