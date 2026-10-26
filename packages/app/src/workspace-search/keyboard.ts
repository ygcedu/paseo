import type { RefObject } from "react";
import type { EditingTextInputHandle } from "@/components/ui/text-input";

export interface SearchKeyboardOptions {
  inputRef: RefObject<EditingTextInputHandle | null>;
  onMove: (direction: number) => void;
  onOpen: () => void;
}

export function useSearchKeyboard(_options: SearchKeyboardOptions): void {}
