import { AlertTriangleIcon, ArrowLeftIcon, MoonIcon, SunIcon } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { toggleTheme, useIsDark } from "@/lib/theme";
import { insightsCopy } from "./copy";
import { useInsights } from "./use-insights";

// Each tab is its own chunk, so the shell and the data arrive first and only the tab being read
// pulls in its drawings.
const Story = lazy(() => import("./story").then((m) => ({ default: m.Story })));
const Questions = lazy(() => import("./questions").then((m) => ({ default: m.Questions })));

const TABS = ["story", "questions"] as const;
type Tab = (typeof TABS)[number];

/**
 * The tab lives in the query string (`/insights?tab=questions`), so a link can open either one.
 * The story is the bare URL. Switching replaces the entry rather than pushing one: the back button
 * should leave the page, not step between two views of it.
 */
const readTab = (): Tab => (new URLSearchParams(location.search).get("tab") === "questions" ? "questions" : "story");

export function InsightsApp() {
  const { lang, setLang } = useI18n();
  const c = insightsCopy[lang];
  const dark = useIsDark();
  const [tab, setTab] = useState<Tab>(readTab);
  const { data, isPending, isError, incomplete } = useInsights();
  const other = lang === "es" ? "en" : "es";

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
      <Tabs value={tab} onValueChange={(v) => setTab(v === "questions" ? "questions" : "story")} className="gap-8">
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
          <TabsList aria-label={c.tabsLabel}>
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
          ) : isPending || !data ? (
            <PageSkeleton label={c.loading} />
          ) : (
            <>
              <TabsContent value="story">
                <Suspense fallback={<PageSkeleton label={c.loading} />}>
                  <Story data={data} />
                </Suspense>
              </TabsContent>
              <TabsContent value="questions">
                <Suspense fallback={<PageSkeleton label={c.loading} />}>
                  <Questions data={data} />
                </Suspense>
              </TabsContent>
            </>
          )}
        </main>
      </Tabs>

      {data && (
        <footer className="mt-auto flex flex-col gap-1 border-t pt-6 text-sm text-muted-foreground">
          {data.dataEnd !== null && <p>{c.dataUpTo(data.dataEnd, lang)}</p>}
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
