import type { Lang } from "@/lib/i18n";
import type { Source } from "./claims";

/**
 * What every key and label on `/insights` calls each of the three sources: the story's legend, the
 * questions tab's map, calendar and chart keys, the 3D viewer's key. One table, so the tabs cannot
 * drift apart again (issue #143: Chocó's shallow group was "Istmina–Sipí" in one key, "Chocó,
 * superficial" in another and "Chocó superficial" in a third). No comma form.
 *
 * Prose goes by "el grupo superficial" and "el grupo profundo" and gives the place once, where a group
 * is introduced; these are for a mark that has to say which source it is in a few words.
 */
export const sourceShort: Record<Lang, Record<Source, string>> = {
  es: { shallow: "Chocó superficial", deep: "Chocó profundo", tolima: "Chaparral" },
  en: { shallow: "Chocó shallow", deep: "Chocó deep", tolima: "Chaparral" },
};
