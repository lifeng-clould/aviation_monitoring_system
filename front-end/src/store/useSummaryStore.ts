import { create } from "zustand";
import { fetchOverview, OverviewResponse } from "../api/client";

interface SummaryState {
  summary?: OverviewResponse;
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
}

export const useSummaryStore = create<SummaryState>((set) => ({
  loading: false,
  async load() {
    set({ loading: true, error: undefined });
    try {
      const summary = await fetchOverview();
      set({ summary, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  }
}));
