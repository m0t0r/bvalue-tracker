import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DURATION_MOVE_MS, EASE_MOVE, cssEasing } from "../src/lib/ease.ts";

// Here, not beside `ease.ts`: the page project's vitest empties CSS imports, `?raw` included.
const CSS = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

it("keeps --ease-move and --duration-move what JavaScript moves on: the b card's marks travel on the CSS, the digits and the story's dots on EASE_MOVE", () => {
  expect(CSS).toContain(`--ease-move: ${cssEasing(EASE_MOVE)};`);
  expect(CSS).toContain(`--duration-move: ${DURATION_MOVE_MS}ms;`);
});
