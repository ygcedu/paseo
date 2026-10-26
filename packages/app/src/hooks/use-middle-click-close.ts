import { useEffect, useRef } from "react";
import type { View } from "react-native";
import { isWeb } from "@/constants/platform";

export function useMiddleClickClose(onClose: () => void) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!isWeb) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    function handleAuxClick(event: MouseEvent) {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    node.addEventListener("auxclick", handleAuxClick);
    return () => node.removeEventListener("auxclick", handleAuxClick);
  }, [onClose]);
  return ref;
}
