import { useLayoutEffect, useRef, useCallback } from 'react';

type Deps = readonly unknown[];

// Single implementation: preserves scroll and exposes interaction state
export function usePreserveScrollPosition(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  deps: Deps,
  opts: { disabled?: boolean } = {}
) {
  const prevTop = useRef(0);
  const prevH = useRef(0);
  const userInteracting = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  // Attach via onScrollPositionChange in component
  const onScroll = useCallback((y: number) => {
    userInteracting.current = true;
    prevTop.current = y;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      userInteracting.current = false;
    }, 200);
  }, []);

  // Preserve relative position when content height changes (deps signal content changes)
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || opts.disabled) return;

    const newH = vp.scrollHeight;
    const currentTop = vp.scrollTop;
    const wasAtTop = prevTop.current <= 1;

    // If height didn't change but scrollTop was reset to 0 by re-render, restore
    if (prevTop.current > 0 && currentTop === 0 && newH === prevH.current && !userInteracting.current) {
      vp.scrollTop = Math.min(prevTop.current, vp.scrollHeight - vp.clientHeight);
    } else if (!wasAtTop && !userInteracting.current && newH !== prevH.current) {
      const delta = newH - prevH.current;
      const newScrollTop = Math.max(0, Math.min(
        prevTop.current + delta,
        vp.scrollHeight - vp.clientHeight
      ));
      vp.scrollTop = newScrollTop;
    }

    // Always refresh memory
    prevTop.current = vp.scrollTop;
    prevH.current = newH;
  }, deps);

  // Adjust on viewport size changes
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || opts.disabled || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => {
      if (userInteracting.current) return;
      const newH = vp.scrollHeight;
      if (newH !== prevH.current) {
        const delta = newH - prevH.current;
        const newScrollTop = Math.max(0, Math.min(
          prevTop.current + delta,
          vp.scrollHeight - vp.clientHeight
        ));
        vp.scrollTop = newScrollTop;
        prevTop.current = newScrollTop;
        prevH.current = newH;
      }
    });

    resizeObserver.observe(vp);

    return () => {
      resizeObserver.disconnect();
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [opts.disabled]);

  return { onScroll, isUserInteracting: () => userInteracting.current };
}
