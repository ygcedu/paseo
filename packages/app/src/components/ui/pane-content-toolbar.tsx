import { useCallback, useMemo, type ReactNode } from "react";
import {
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  type IconButtonChromeState,
  iconButtonChromeGlyphSize,
  iconButtonChromeStyle,
  useIconButtonChromeStyle,
  smallIconButtonChromeFrameSize,
} from "@/components/ui/icon-button-chrome";
import { WORKSPACE_PANE_TRAILING_GLYPH_RAIL } from "@/components/tree-primitives";

/** Shared chrome at the boundary between a workspace pane's tabs and content. */
export function PaneContentToolbar({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.toolbar, style]} testID={testID}>
      {children}
    </View>
  );
}

/** A consistently spaced group of controls within any workspace toolbar or tab track. */
export function ToolbarControls({
  children,
  style,
  ...props
}: ViewProps & { children: ReactNode }) {
  return (
    <View {...props} style={[styles.controls, style]}>
      {children}
    </View>
  );
}

interface ToolbarButtonCommonProps extends Omit<
  PressableProps,
  "accessibilityLabel" | "accessibilityRole" | "children" | "style"
> {
  children: ReactNode;
  label: string;
  /** What the tooltip says when it is not the label, e.g. a status. Defaults to the label. */
  tooltip?: ReactNode;
  selected?: boolean;
  selectedTone?: "neutral" | "blue";
  compact?: boolean;
  /** A circular highlight, for buttons inside a pill-shaped container. */
  round?: boolean;
  shortcut?: ShortcutKey[][] | null;
  tooltipSide?: "left" | "right" | "top" | "bottom";
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
}

type ToolbarButtonProps = ToolbarButtonCommonProps &
  (
    | { kind?: "action"; onPress: NonNullable<PressableProps["onPress"]> }
    | { kind: "menu"; onPress?: never }
  );

/**
 * The icon action used by pane toolbars and tab tracks. It owns the hitbox,
 * interaction states, tooltip, and action/menu trigger composition.
 */
export function ToolbarButton({
  children,
  label,
  tooltip: tooltipBody,
  selected = false,
  selectedTone = "neutral",
  compact = false,
  round = false,
  shortcut,
  tooltipSide = "bottom",
  style,
  hoverStyle,
  kind = "action",
  onPress,
  disabled,
  testID,
  ...props
}: ToolbarButtonProps) {
  const buttonStyle = useIconButtonChromeStyle({
    size: "small",
    compact,
    active: selected,
    disabled: Boolean(disabled),
    round,
    style,
  });
  const resolvedStyle = useCallback(
    (state: IconButtonChromeState) => [
      buttonStyle(state),
      selected && selectedTone === "blue" && styles.selectedBlue,
      (state.hovered || state.pressed) && hoverStyle,
    ],
    [buttonStyle, selected, selectedTone, hoverStyle],
  );
  const accessibilityState = useMemo(
    () => ({ disabled: Boolean(disabled), selected }),
    [disabled, selected],
  );
  const tooltip = (
    <TooltipContent side={tooltipSide} align="center" offset={8} style={styles.tooltipSurface}>
      <View style={styles.tooltipRow}>
        {tooltipBody ?? <Text style={styles.tooltipText}>{label}</Text>}
        {shortcut ? <Shortcut chord={shortcut} /> : null}
      </View>
    </TooltipContent>
  );

  if (kind === "menu") {
    return (
      <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild triggerRefProp="triggerRef">
          <DropdownMenuTrigger
            {...props}
            disabled={disabled}
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={accessibilityState}
            style={resolvedStyle}
          >
            {children}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
    );
  }

  return (
    <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        {...props}
        disabled={disabled}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
        onPress={onPress}
        style={resolvedStyle}
      >
        {children}
      </TooltipTrigger>
      {tooltip}
    </Tooltip>
  );
}

export function paneContentToolbarIconSize(isCompact: boolean): number {
  return iconButtonChromeGlyphSize("small", isCompact);
}

/**
 * What the last control in a toolbar row ends with. A `glyph` control paints an icon
 * inside a larger invisible hitbox; a `framed` control (bordered trigger, split button)
 * paints its own frame, so the frame is the ink.
 */
export type ToolbarTrailingControl = "glyph" | "framed";

/**
 * Keeps the last control in a toolbar row on the same trailing rail as tree-row glyphs.
 * A bare glyph's hitbox overhangs its ink, so the row pads by less than the rail and lets
 * the hitbox run off the edge; a framed control's ink reaches its own edge, so it pads by
 * the full rail.
 */
export function paneContentToolbarTrailingPadding(
  isCompact: boolean,
  trailing: ToolbarTrailingControl,
): number {
  if (trailing === "framed") {
    return WORKSPACE_PANE_TRAILING_GLYPH_RAIL;
  }
  const buttonSize = smallIconButtonChromeFrameSize(isCompact);
  return (
    WORKSPACE_PANE_TRAILING_GLYPH_RAIL - (buttonSize - paneContentToolbarIconSize(isCompact)) / 2
  );
}

/** @deprecated Use `ToolbarButton`; retained while remaining pane toolbars migrate. */
export function paneContentToolbarIconButtonStyle(
  { hovered, pressed }: { hovered?: boolean; pressed: boolean },
  selected = false,
  isCompact = false,
) {
  return [
    iconButtonChromeStyle({
      size: "small",
      compact: isCompact,
      state: { hovered, pressed, active: selected },
    }),
  ];
}

const styles = StyleSheet.create((theme) => ({
  selectedBlue: { backgroundColor: theme.colors.palette.blue[600] },
  toolbar: {
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexShrink: 0,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  tooltipSurface: {
    backgroundColor: theme.colors.palette.black,
    borderColor: theme.colors.palette.black,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.palette.white,
  },
}));
