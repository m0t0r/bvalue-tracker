import { QueryClient } from "@tanstack/react-query";
import { createRoot, hydrateRoot } from "react-dom/client";
import { shouldRetry } from "@/lib/api";
import { takeStaticShell } from "@/lib/hydrate";
import { installErrorReporting } from "@/lib/report-error";
import { followSystemTheme } from "@/lib/theme";
import { PageRoot } from "@/page-root";
import "./index.css";

followSystemTheme();
// Before the first render, so a crash while mounting is reported too.
installErrorReporting();

const queryClient = new QueryClient({
  // refetchOnWindowFocus is left at the library default (true): a stale query refetches when the tab
  // becomes visible again. It was switched off here once, which left a background tab showing old data.
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } },
});

const page = <PageRoot client={queryClient} />;
// The built page has the header in its HTML, and React adopts it (`src/lib/hydrate.ts`). On a
// mismatch React draws its own header instead, as it always did before, and reports the mismatch
// through `installErrorReporting`. The dev server's page has no static header.
const shell = takeStaticShell(document);
if (shell) hydrateRoot(shell.container, page, { identifierPrefix: shell.identifierPrefix });
else createRoot(document.getElementById("root")!).render(page);
