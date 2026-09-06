import { useLayoutEffect, useRef, type RefObject } from "react";

export type ScrollMetrics = {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
};

const nearBottomPx = 48;

export const isNearBottom = (metrics: ScrollMetrics, thresholdPx = nearBottomPx): boolean =>
  metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= thresholdPx;

const scrollToBottom = (element: HTMLElement): void => {
  element.scrollTop = element.scrollHeight;
};

export function useStickToBottom(
  ref: RefObject<HTMLDivElement | null>,
  {
    contentKey,
    forceKey,
  }: {
    readonly contentKey: string;
    readonly forceKey: string;
  },
): void {
  const stuckRef = useRef(true);
  const seenForceKey = useRef(forceKey);
  const seenContentKey = useRef(contentKey);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const onScroll = () => {
      stuckRef.current = isNearBottom(element);
    };
    element.addEventListener("scroll", onScroll, { passive: true });

    if (seenForceKey.current !== forceKey) {
      seenForceKey.current = forceKey;
      stuckRef.current = true;
    }
    seenContentKey.current = contentKey;
    if (stuckRef.current) {
      scrollToBottom(element);
    }

    return () => {
      element.removeEventListener("scroll", onScroll);
    };
  }, [contentKey, forceKey, ref]);
}
