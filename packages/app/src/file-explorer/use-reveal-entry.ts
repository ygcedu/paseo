import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { FlatList, FlatListProps } from "react-native";

export function useRevealExplorerEntry<T>({
  listRef,
  path,
  revision,
  index,
  ready,
}: {
  listRef: RefObject<FlatList<T> | null>;
  path: string | undefined;
  revision: number;
  index: number;
  ready: boolean;
}): NonNullable<FlatListProps<T>["onScrollToIndexFailed"]> {
  const completedRequest = useRef<string | null>(null);
  const retryScroll = useRef<NonNullable<FlatListProps<T>["onScrollToIndexFailed"]> | null>(null);
  const onScrollToIndexFailed = useCallback<NonNullable<FlatListProps<T>["onScrollToIndexFailed"]>>(
    (failure) => retryScroll.current?.(failure),
    [],
  );
  useEffect(() => {
    if (!ready || !path || index < 0) return;
    const request = `${path}\0${revision}`;
    if (completedRequest.current === request) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let failed = false;
    function scroll() {
      failed = false;
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
      if (!failed) completedRequest.current = request;
    }
    retryScroll.current = ({ averageItemLength }) => {
      failed = true;
      if (++attempts > 8) return;
      // FlatList cannot target an unmeasured row. Move its render window there first.
      listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
      timer = setTimeout(scroll, 50);
    };
    scroll();
    return () => {
      clearTimeout(timer);
      retryScroll.current = null;
    };
  }, [index, listRef, path, ready, revision]);
  return onScrollToIndexFailed;
}
