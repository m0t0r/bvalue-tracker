import { env } from "cloudflare:test";

/**
 * A made-up sync code for the tests that press "Sincronizar ahora" (worker/sync-guard.ts). The real
 * one lives in production's D1 only: the repo is public.
 */
export const TEST_SYNC_CODE = "4821";

/** The owner's command (docs/deployment.md, "The sync code"), with a test's code. Locks stay as they are. */
export const setSyncCode = (code = TEST_SYNC_CODE) =>
  env.DB.prepare(
    "INSERT INTO sync_code (id, code, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at",
  )
    .bind(code)
    .run();

/** The test's code set, and every lock lifted: what a test that only presses the button starts from. */
export const seedSyncCode = async (code = TEST_SYNC_CODE) => {
  await env.DB.batch([env.DB.prepare("DELETE FROM sync_code"), env.DB.prepare("DELETE FROM sync_lockouts")]);
  await setSyncCode(code);
};
