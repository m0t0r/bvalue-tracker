import { AlertTriangleIcon, ArrowLeftIcon, MoonIcon, SunIcon } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { toggleTheme, useIsDark } from "@/lib/theme";
import { BackToTop } from "./back-to-top";
import { insightsCopy } from "./copy";
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
    return <View {...props} />;
  });
}
const StoryTab = tab(chunks.story, (m) => m.Story);
const QuestionsTab = tab(chunks.questions, (m) => m.Questions);
const Block3DTab = tab(chunks["3d"], (m) => m.Block3D);

const TABS = ["story", "questions", "3d"] as const;
type Tab = (typeof TABS)[number];

/**
 * The tab lives in the query string (`/insights?tab=questions`), so a link can open either one.
 * The story is the bare URL. Switching replaces the entry rather than pushing one: the back button
 * should leave the page, not step between two views of it.
 */
const readTab = (): Tab => {
  const t = new URLSearchParams(location.search).get("tab");
  return t === "questions" || t === "3d" ? t : "story";
};

// The tab the page opens on is fetched now, beside the data, rather than once the data has arrived
// and the tab first renders: the two downloads overlap instead of following each other. A failure
// is the tab's to report: `use` throws it when the tab renders.
chunks[readTab()]();

export function InsightsApp() {
  const { lang, setLang } = useI18n();
  const c = insightsCopy[lang];
  const dark = useIsDark();
  const [tab, setTab] = useState<Tab>(readTab);
  const { data, context, forecast, isPending, isError, incomplete } = useInsights();
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
  const other = lang === "es" ? "en" : "es";
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
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 px-4 py-8 tabular-nums sm:px-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v === "questions" || v === "3d" ? v : "story")} className="gap-8">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Pulled out by its own inline padding, so the arrow lines up with the title below it. */}
            <Button variant="ghost" size="sm-touch" className="-ms-2.5 pointer-coarse:-ms-4" asChild>
              <a href="/">
                <ArrowLeftIcon />
                {c.back}
              </a>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm-touch" lang={other} onClick={() => setLang(other)}>
                {/* The code the page switches to, in its own language; the name spells it out, and keeps the
                    code in it so a voice command for what is on screen still finds the button. */}
                {lang === "es" ? "EN" : "ES"}
                <span className="sr-only">{lang === "es" ? " (English)" : " (Español)"}</span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm-touch"
                aria-label={dark ? c.themeToLight : c.themeToDark}
                onClick={toggleTheme}
              >
                {dark ? (
                  <SunIcon className="size-4 pointer-coarse:size-5" />
                ) : (
                  <MoonIcon className="size-4 pointer-coarse:size-5" />
                )}
              </Button>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.title}</h1>
          <p className="max-w-prose text-muted-foreground text-pretty">{c.subtitle}</p>
          <TabsList ref={tabList} aria-label={c.tabsLabel}>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {c.tabs[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        <main className="contents">
          {incomplete && !isError ? (
            <Alert variant="caution" role="status">
              <AlertTriangleIcon />
              <AlertTitle>{c.incompleteTitle}</AlertTitle>
              <AlertDescription>{c.incompleteBody}</AlertDescription>
            </Alert>
          ) : null}
          {isError ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>{c.loadFailed}</AlertTitle>
              <AlertDescription>{c.loadFailedBody}</AlertDescription>
            </Alert>
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
        </main>
      </Tabs>

      {shown && <BackToTop label={c.backToTop} tabs={tabList} end={footer} />}
      {shown && (
        <footer ref={footer} className="mt-auto flex flex-col gap-1 border-t pt-6 text-sm text-muted-foreground">
          {shown.data.dataEnd !== null && <p>{c.dataUpTo(shown.data.dataEnd, lang)}</p>}
          <p className="max-w-prose text-pretty">{c.footer}</p>
          <p>{c.timeNote}</p>
        </footer>
      )}
    </div>
  );
}

/** A viewport tall, like the monitor's, so nothing below it is on screen when the page replaces it. */
function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex h-svh flex-col gap-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="flex-1" />
    </div>
  );
}
