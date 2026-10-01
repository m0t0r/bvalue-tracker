import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Explain } from "@/components/explainer/explain";
import { HeaderControls, PageFrame } from "@/components/page-frame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { Rich } from "@/lib/rich";
import { insightsCopy } from "./copy";

export const TABS = ["story", "questions", "3d"] as const;
export type Tab = (typeof TABS)[number];

/** The tab a value names (a `?tab=` or a pressed trigger's), or the story, which is the bare URL. */
export const toTab = (value: string | null): Tab => TABS.find((t) => t === value) ?? "story";

/**
 * The insights page's frame and header: the way back, the language and theme buttons, the title, the
 * subtitle and the three tabs. The build also draws it into the page's HTML, with the skeleton under
 * it (`insightsStaticShell` in `src/static-shell.tsx`), so a phone paints the header before the bundle
 * has run, and React hydrates that copy rather than drawing its own (issue #120, as the monitor's
 * `MonitorShell`). So it must render exactly the same markup in the build and in the page: nothing in
 * it may reach for the browser or depend on the theme except through the `dark` class.
 *
 * `tab` null selects no tab. The HTML cannot see the query string (`?tab=questions`), so its copy
 * chooses none rather than a wrong one, and the page chooses the query string's once it has hydrated
 * (`src/insights/hydration.test.ts`).
 */
export function InsightsShell({
  tab,
  onTab,
  onToggleTheme,
  tabList,
  children,
  after,
}: {
  tab: Tab | null;
  onTab: (tab: Tab) => void;
  onToggleTheme: () => void;
  tabList?: Ref<HTMLDivElement>;
  /** The page under the header, inside the tabs. */
  children: ReactNode;
  /** After the tabs: the back-to-top button and the footer. */
  after?: ReactNode;
}) {
  const { lang } = useI18n();
  const c = insightsCopy[lang];
  return (
    <PageFrame>
      <Tabs value={tab ?? ""} onValueChange={(v) => onTab(toTab(v))} className="gap-8">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Pulled out by its own inline padding, so the arrow lines up with the title below it. */}
            <Button variant="ghost" size="sm-touch" className="-ms-2.5 pointer-coarse:-ms-4" asChild>
              <a href="/">
                <ArrowLeftIcon data-icon="inline-start" />
                {c.back}
              </a>
            </Button>
            <HeaderControls onToggleTheme={onToggleTheme} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.title}</h1>
          {/* Full width, as the monitor's (owner's call, 2026-09-30): capped at 32rem it left most of a
              desktop header empty. */}
          <p className="text-muted-foreground text-pretty">
            <Rich text={c.subtitle} parts={{ sgc: <Explain id="sgc">{c.sgcName}</Explain> }} />
          </p>
          <TabsList ref={tabList} aria-label={c.tabsLabel}>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {c.tabs[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>
        {children}
      </Tabs>
      {after}
    </PageFrame>
  );
}

/**
 * The page under the header: the notice, if any, the live region that announces it, and `children`.
 * The static copy draws it with no notice and the skeleton, which is React's first render too.
 */
export function InsightsMain({
  notice,
  children,
}: {
  notice: { title: string; body: string } | null;
  children: ReactNode;
}) {
  return (
    <main className="contents">
      {notice ? (
        <Alert variant="caution" role="note">
          <AlertTriangleIcon />
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.body}</AlertDescription>
        </Alert>
      ) : null}
      {/* The notice is announced from here: a live region mounted with its text already in it is
          often not read out, and the notice itself mounts only when its state begins. */}
      <span role="status" className="sr-only">
        {notice ? `${notice.title}. ${notice.body}` : null}
      </span>
      {children}
    </main>
  );
}

/** A viewport tall, like the monitor's, so nothing below it is on screen when the page replaces it. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="flex h-svh flex-col gap-4">
      {/* Text, not a name: a status region announces its content, and a name alone is not read. */}
      <span className="sr-only">{label}</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="flex-1" />
    </div>
  );
}
