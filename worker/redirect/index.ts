/**
 * The Worker that still answers at the project's old name, `choco.<subdomain>.workers.dev`.
 *
 * The app moved to the Worker `bvalue-tracker` (wrangler.jsonc). A workers.dev hostname is
 * the Worker's name, and Cloudflare's Redirect Rules only apply to a zone of your own, so the
 * old hostname keeps working only by deploying this under the old name. It sends every
 * request to the same path and query on the new host, with a 301 so that links and search
 * results move over for good. Config: worker/redirect/wrangler.jsonc.
 */

export interface RedirectEnv {
  TARGET_ORIGIN: string;
}

export function redirectTo(requestUrl: string, targetOrigin: string): string {
  // Set the parts on the target, not `new URL(path, target)`: a path of `//evil.example/x`
  // would resolve as protocol-relative and make this an open redirect.
  const from = new URL(requestUrl);
  const to = new URL(targetOrigin);
  to.pathname = from.pathname;
  to.search = from.search;
  return to.toString();
}

export default {
  fetch(request: Request, env: RedirectEnv): Response {
    return Response.redirect(redirectTo(request.url, env.TARGET_ORIGIN), 301);
  },
} satisfies ExportedHandler<RedirectEnv>;
