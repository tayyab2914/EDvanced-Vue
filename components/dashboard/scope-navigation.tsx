"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/sidebar-shell";

/**
 * Every navigation that changes what slice a dashboard is showing, with its wait made
 * visible.
 *
 * ---------------------------------------------------------------------------
 * WHY A HOOK AND NOT A `router.push` PER CONTROL
 *
 * Changing a filter is a NAVIGATION — the figures are computed on the server, so the whole
 * page re-renders (see components/dashboard/filter-bar.tsx). Three controls start one: the
 * filter panel's Apply, a chip's ×, Clear filters, and the saved-views menu. Each of them
 * used `router.push` directly, which returns immediately and tells nobody anything, so the
 * page sat unchanged for the length of a `loadCore` — a second or more against a database on
 * another continent — with no sign the click had landed.
 *
 * `useTransition` is what turns that into a state a component can render: `pending` stays
 * true from the push until the new server render is on screen. Wrapping it here means the
 * four controls cannot disagree about what "applying" looks like, and a control added later
 * gets the behaviour by using the hook rather than by remembering to.
 *
 * The flag is published to the shell as well as returned, because the two halves of the
 * feedback live on opposite sides of the tree: the control shows a spinner, and the main
 * column dims. See `busy` in components/sidebar-shell.tsx.
 * ---------------------------------------------------------------------------
 */
export function useScopeNavigation(): {
  /** True from the moment a scope change is pushed until its server render lands. */
  pending: boolean;
  go: (href: string, opts?: { replace?: boolean }) => void;
} {
  const router = useRouter();
  const { setBusy } = useShell();
  const [pending, startTransition] = useTransition();

  /**
   * Held for as long as the transition runs, and released on unmount.
   *
   * The cleanup is not defensive tidying — the self-correcting `replace` in the filter bar
   * can land a navigation that unmounts this component while its transition is still open,
   * and without the release the shell would stay dimmed with nothing left to undim it.
   */
  useEffect(() => {
    if (!pending) return;
    setBusy(true);
    return () => setBusy(false);
  }, [pending, setBusy]);

  const go = useCallback(
    (href: string, opts?: { replace?: boolean }) => {
      startTransition(() => {
        // `scroll: false` on both: a filter narrows what is already on screen, and throwing
        // the reader back to the top of the page is not part of what they asked for.
        if (opts?.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router],
  );

  return { pending, go };
}

/**
 * The in-control half of the feedback — a ring that spins where the chevron was.
 *
 * `currentColor`, so one component serves the brand-blue "Clear filters" link and the
 * grey-bordered Filters button without either passing a colour. `motion-reduce` stops it
 * dead rather than hiding it: someone who has asked for less motion still needs to know the
 * page is working, and a static ring beside a disabled control says that much.
 */
export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="inline-block flex-none animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70 motion-reduce:animate-none"
    />
  );
}
