import { env } from "cloudflare:test";

/**
 * A made-up sync code for the tests that press "Sincronizar ahora" (worker/sync-guard.ts). The real
 * one lives in production's D1 only: the repo is public.
 */
export const TEST_SYNC_CODE = "4821";

/** The owner's command (docs/deployment.md, "The sync code"), with the test's code, and every lock lifted. */
export const seedSyncCode = (code = TEST_SYNC_CODE) =>
  env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sync_code (id, code, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at",
    ).bind(code),
    env.DB.prepare("DELETE FROM sync_lockouts"),
  ]);
