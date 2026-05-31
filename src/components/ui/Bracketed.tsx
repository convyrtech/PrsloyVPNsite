import type { ReactNode } from "react";

/**
 * Bracketed label for primary CTAs.
 *
 * The square brackets live in their own inline-block spans, so when the host
 * button carries the `group` class they slide outward on hover — a tactile
 * "opening" tick. It is transform-only (no width reflow), so neighbouring
 * layout never shifts. Without `group` on the parent it renders as a plain
 * `[ label ]`.
 */
export function Bracketed({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-200 ease-out-nothing group-hover:-translate-x-[3px]"
      >
        [
      </span>
      <span className="px-[0.5ch]">{children}</span>
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-200 ease-out-nothing group-hover:translate-x-[3px]"
      >
        ]
      </span>
    </span>
  );
}
