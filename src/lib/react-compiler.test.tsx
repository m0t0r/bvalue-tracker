import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The pages ship compiled by React Compiler, and vitest does not read `vite.config.ts`: this project
 * is given the compiler in `vitest.config.ts`, or every test here would go on passing against code
 * the reader never runs (issue #130). The compiler says nothing when it is not applied, so this
 * checks what compiling is for, by what React does and not by what the compiled code looks like: a
 * parent that renders again does not render a child whose props did not change, with no `memo`
 * written by hand. Left uncompiled, the child renders each time.
 *
 * The one `.tsx` test: the compiler memoises JSX elements, and the same tree written as
 * `createElement` calls, as the other tests write theirs, is not memoised apart from its parent.
 */
afterEach(cleanup);

const childRendered = vi.fn();
function Child({ label }: { label: string }) {
  childRendered();
  return <i>{label}</i>;
}
function Parent() {
  const [presses, setPresses] = useState(0);
  return (
    <button type="button" onClick={() => setPresses(presses + 1)}>
      <b>{presses}</b>
      <Child label="unchanged" />
    </button>
  );
}

describe("the page project", () => {
  it("runs components compiled: a parent's render leaves an unchanged child alone", () => {
    const { container } = render(<Parent />);
    expect(childRendered).toHaveBeenCalledTimes(1);

    act(() => container.querySelector("button")!.click());
    // The parent did render again…
    expect(container.querySelector("b")!.textContent).toBe("1");
    // …and the child did not.
    expect(childRendered).toHaveBeenCalledTimes(1);
  });
});
