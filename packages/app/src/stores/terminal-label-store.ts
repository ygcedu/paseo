import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

const schema = z.object({ labels: z.record(z.string(), z.record(z.string(), z.string())) });
interface TerminalLabelState {
  labels: Record<string, Record<string, string>>;
  setLabel: (serverId: string, terminalId: string, label: string) => void;
  removeLabel: (serverId: string, terminalId: string) => void;
}

// Tab names belong to the user; shell OSC titles describe the running process.
export const useTerminalLabelStore = create<TerminalLabelState>()(
  persist(
    (set) => ({
      labels: {},
      setLabel: (serverId, terminalId, label) =>
        set((state) => ({
          labels: {
            ...state.labels,
            [serverId]: { ...state.labels[serverId], [terminalId]: label },
          },
        })),
      removeLabel: (serverId, terminalId) =>
        set((state) => {
          const labels = { ...state.labels[serverId] };
          delete labels[terminalId];
          return { labels: { ...state.labels, [serverId]: labels } };
        }),
    }),
    {
      name: "terminal-labels",
      storage: createValidatedPersistStorage(AsyncStorage, schema),
      partialize: (state) => ({ labels: state.labels }),
    },
  ),
);
