import { useCallback, useState, type FocusEvent, type ReactNode, type CSSProperties } from "react";
import { useIsCompactFormFactor } from "@/constants/layout";

const frame: CSSProperties = { display: "flex", flex: 1, minWidth: 0, alignSelf: "stretch" };

export function TerminalTabTrack({ children }: { children: (showAdd: boolean) => ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const compact = useIsCompactFormFactor();
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const focus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    setFocused(event.target.matches(":focus-visible"));
  }, []);
  const blur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }, []);
  return (
    <div
      data-testid="terminal-session-tabs"
      style={frame}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocusCapture={focus}
      onBlurCapture={blur}
    >
      {children(hovered || focused || compact)}
    </div>
  );
}
