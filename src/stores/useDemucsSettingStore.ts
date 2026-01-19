import { create } from "zustand";

export type DemucsDevice = "cpu" | "gpu";

type State = {
  device: DemucsDevice;
};

type Action = {
  setDevice: (device: DemucsDevice) => void;
};

export const useDemucsSettingStore = create<State & Action>((set) => ({
  device: "gpu", // Default to GPU for better performance when available
  setDevice: (device) => set(() => ({ device })),
}));
