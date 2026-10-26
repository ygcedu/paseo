import type { ToolWindowRegion, ToolWindows } from "./model";

export const TOOL_WINDOW_RAIL_WIDTH = 44;
export const TOOL_WINDOW_PANEL_INSET = 4;
export interface ToolWindowFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface ToolWindowGeometryInput {
  width: number;
  height: number;
  tools: ToolWindows;
  hidden: boolean;
}

export function toolWindowGeometry({ width, height, tools, hidden }: ToolWindowGeometryInput) {
  const rail = hidden ? 0 : TOOL_WINDOW_RAIL_WIDTH;
  const available = Math.max(0, width - rail * 2);
  let left = !hidden && tools.activeByRegion.left ? tools.sizes.left : 0;
  let right = !hidden && tools.activeByRegion.right ? tools.sizes.right : 0;
  const maximumSides = Math.max(0, available - 400);
  const totalSides = left + right;
  if (totalSides > maximumSides) {
    left = totalSides > 0 ? (left * maximumSides) / totalSides : 0;
    right = totalSides > 0 ? (right * maximumSides) / totalSides : 0;
  }
  const bottom =
    !hidden && tools.activeByRegion.bottom
      ? Math.min(tools.sizes.bottom, Math.max(0, height - 240))
      : 0;
  const contentHeight = Math.max(0, height - bottom);
  const frames: Record<ToolWindowRegion, ToolWindowFrame> = {
    left: { left: rail, top: 0, width: left, height: contentHeight },
    right: { left: width - rail - right, top: 0, width: right, height: contentHeight },
    bottom: { left: rail, top: contentHeight, width: available, height: bottom },
  };
  return {
    frames,
    main: {
      left: rail + left,
      top: 0,
      width: Math.max(0, available - left - right),
      height: contentHeight,
    },
  };
}

// Keep resize boundaries in the middle of the gutters; persisted sizes describe the slots.
export function insetToolWindowFrame(frame: ToolWindowFrame): ToolWindowFrame {
  const inset = TOOL_WINDOW_PANEL_INSET;
  return {
    left: frame.left + inset,
    top: frame.top + inset,
    width: Math.max(0, frame.width - inset * 2),
    height: Math.max(0, frame.height - inset * 2),
  };
}
