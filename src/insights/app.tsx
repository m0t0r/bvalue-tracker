import {
  Suspense,
  memo,
  use,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactPromise,
} from "react";
import { Backdrop } from "@/backdrop/backdrop";
import { LoadError } from "@/components/load-error";
import { TechnicalDetail } from "@/components/technical-detail";
import { TabsContent } from "@/components/ui/tabs";
import { useHydrated } from "@/lib/hydrate";
import { useI18n } from "@/lib/i18n";
import { toggleTheme } from "@/lib/theme";
import { BackToTop } from "./back-to-top";
import { insightsCopy } from "./copy";
import { InsightsMain, InsightsShell, PageSkeleton, toTab, type Tab } from "./shell";
import { useInsights } from "./use-insights";

/**
 * `load`, called once, its promise marked as it settles with the `status` and `value` (or `reason`)
 * that React's `use` reads to return a settled promise's result without suspending.
 */
function once<T>(load: () => Promise<T>): () => ReactPromise<T> {
  let p: ReactPromise<T> | undefined;
  return () => {
    if (p === undefined) {
      const promise = load();
      promise.then(
        (value) => void Object.assign(promise, { status: "fulfilled", value }),
        (reason: unknown) => void Object.assign(promise, { status: "rejected", reason }),
      );
      p = promise;
    }
    return p;
  };
}

// Each tab is its own chunk, so only the tab being read pulls in its drawings. The 3D block and its
// engine (OGL) load only when that tab is opened.
//
// Read with `use` rather than `lazy`. `lazy` suspends the first time it renders even when the chunk
// has already arrived, since it learns that from a `then` callback; React shows the fallback, and
// then holds the tab back until 300 ms after it (FALLBACK_THROTTLE_MS). On a phone that was most of
// the wait between the data and the story's first paint. `use` reads a promise marked settled in
// the same render, so a tab whose chunk is already here appears with the data; one still loading
// suspends as before.
const chunks = {
  story: once(() => import("./story")),
  questions: once(() => import("./questions")),
  "3d": once(() => import("./block3d")),
};

/**
 * A tab's component, read from its chunk. Memoized, so that a render of the page that leaves the
 * tab's props alone (the deferred copy below still holding the old data) skips the tab entirely:
 * without it every new `data` drew the tab twice, the first time uninterruptibly.
 */
function tab<M, P extends object>(chunk: () => ReactPromise<M>, pick: (m: M) => ComponentType<P>) {
  return memo(function Tab(props: P) {
    const View = pick(use(chunk()));
    // oxlint-disable-next-line react-hooks-js/static-components -- Not created here: the chunk's own export, the same one every render.
    return <View {...props} />;
  });
}
const StoryTab = tab(chunks.story, (m) => m.Story);
const QuestionsTab = tab(chunks.questions, (m) => m.Questions);
const Block3DTab = tab(chunks["3d"], (m) => m.Block3D);

/**
 * The tab lives in the query string (`/insights?tab=questions`), so a link can open either one.
 * The story is the bare URL. Switching replaces the entry rather than pushing one: the back button
 * should leave the page, not step between two views of it.
 */
const readTab = (): Tab => toTab(new URLSearchParams(location.search).get("tab"));

// The tab the page opens on is fetched now, beside the data, rather than once the data has arrived
// and the tab first renders: the two downloads overlap instead of following each other. A failure
// is the tab's to report: `use` throws it when the tab renders.
chunks[readTab()]();

export function InsightsApp() {
  const { lang, t } = useI18n();
  const c = insightsCopy[lang];
  const [tab, setTab] = useState<Tab>(readTab);
  // The static copy in the HTML selects no tab, since it cannot see the query string, and hydration
  // must draw what it has. The tab is chosen in the render after, in the same frame (`useHydrated`).
  const hydrated = useHydrated();
  const { data, context, forecast, isPending, isError, error, retrying, retry, incomplete, staleSince, catalogues } =
    useInsights();
  // The tabs are drawn from a deferred copy, so the render the data triggers (hundreds of ms of it
  // on a phone) runs as a transition React can interrupt, not one task that blocks input. It used
  // to be interruptible by accident: `lazy`'s retry after its suspension was (see `chunks`). And a
  // transition that meets a chunk still in flight waits for it rather than showing the fallback, so
  // React's 300 ms hold does not come back through `use`. The three values travel as one, so a tab
  // never pairs the claims of one catalogue with a forecast worked out from the next.
  const loaded = useMemo(
    () => (isPending || !data ? undefined : { data, context, forecast }),
    [isPending, data, context, forecast],
  );
  const shown = useDeferredValue(loaded);
  // One notice at a time, and never beside the load error, which replaces the page. Data that stopped
  // updating comes before an unfinished history: it is the one the reader cannot see for themselves,
  // and it holds for the back-fill's own progress too, which is as old.
  const notice = isError
    ? null
    : staleSince !== null && data
      ? { title: c.staleTitle, body: c.staleBody(staleSince, data.now, lang) }
      : incomplete
        ? { title: c.incompleteTitle, body: c.incompleteBody }
        : null;
  const tabList = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = c.docTitle;
  }, [c.docTitle]);
  useEffect(() => {
    const url = new URL(location.href);
    if (tab === "story") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    history.replaceState(null, "", url);
  }, [tab]);

  return (
    <InsightsShell
      tab={hydrated ? tab : null}
      onTab={setTab}
      onToggleTheme={toggleTheme}
      tabList={tabList}
      after={
        shown && (
          <>
            {/* The pixel background, as on the monitor (src/backdrop). The page is about both zones,
                so it draws both: Chocó's sequence and Chaparral's swarm, and on a phone the larger
                epicenter, the M7.4. */}
            <Backdrop events={catalogues} />
            <BackToTop label={c.backToTop} tabs={tabList} end={footer} />
            <footer ref={footer} className="mt-auto flex flex-col gap-1 border-t pt-6 text-sm text-muted-foreground">
              {shown.data.dataEnd !== null && <p>{c.dataUpTo(shown.data.dataEnd, lang)}</p>}
              <p className="max-w-md text-pretty">{c.footer}</p>
              <p>{c.timeNote}</p>
            </footer>
          </>
        )
      }
    >
      <InsightsMain notice={notice}>
        {isError ? (
          <LoadError
            title={t.loadFailed}
            body={t.loadFailedBody}
            retry={t.loadRetry}
            retrying={retrying}
            retryingLabel={t.loadRetrying}
            onRetry={retry}
          >
            <TechnicalDetail>{String(error)}</TechnicalDetail>
          </LoadError>
        ) : !shown ? (
          <PageSkeleton label={c.loading} />
        ) : (
          <>
            <TabsContent value="story">
              <Suspense fallback={<PageSkeleton label={c.loading} />}>
                <StoryTab data={shown.data} forecastShown={shown.forecast !== null} />
              </Suspense>
            </TabsContent>
            <TabsContent value="questions">
              <Suspense fallback={<PageSkeleton label={c.loading} />}>
                <QuestionsTab data={shown.data} context={shown.context} forecast={shown.forecast} />
              </Suspense>
            </TabsContent>
            <TabsContent value="3d">
              <Suspense fallback={<PageSkeleton label={c.loading} />}>
                <Block3DTab data={shown.data} />
              </Suspense>
            </TabsContent>
          </>
        )}
      </InsightsMain>
    </InsightsShell>
  );
}
