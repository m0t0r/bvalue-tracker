declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
  }
}
declare module "*.html?raw" {
  const content: string;
  export default content;
}
declare module "*.json?raw" {
  const content: string;
  export default content;
}
declare module "*.jsonc?raw" {
  const content: string;
  export default content;
}
