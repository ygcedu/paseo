import type { ReactNode } from "react";
import { View } from "react-native";

const frame = { flex: 1, minWidth: 0, alignSelf: "stretch" } as const;

export function TerminalTabTrack({ children }: { children: (showAdd: boolean) => ReactNode }) {
  return (
    <View style={frame} testID="terminal-session-tabs">
      {children(true)}
    </View>
  );
}
