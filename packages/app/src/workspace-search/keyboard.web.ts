import { useEffect } from "react";
import { isWeb } from "@/constants/platform";
import type { SearchKeyboardOptions } from "./keyboard";

export function useSearchKeyboard({ inputRef, onMove, onOpen }: SearchKeyboardOptions): void {
  useEffect(() => {
    if (!isWeb) return;
    const input = inputRef.current?.getNativeRef();
    if (!(input instanceof HTMLInputElement)) return;
    function keyDown(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        onMove(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        onOpen();
      }
    }
    input.addEventListener("keydown", keyDown);
    return () => input.removeEventListener("keydown", keyDown);
  }, [inputRef, onMove, onOpen]);
}
