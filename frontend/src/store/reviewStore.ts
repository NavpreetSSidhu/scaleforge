import { create } from 'zustand';

interface ReviewState {
  /** The reviewer drawer is open. */
  open: boolean;
  /** Ids of findings whose fix has been applied (so the button can read "Applied"). */
  appliedIds: string[];
  setOpen: (open: boolean) => void;
  markApplied: (id: string) => void;
}

/** Drawer open-state for the AI SRE reviewer. The review itself is fetched by the
 *  drawer via TanStack Query; this only tracks UI state. */
export const useReviewStore = create<ReviewState>((set) => ({
  open: false,
  appliedIds: [],
  setOpen: (open) => set(open ? { open } : { open, appliedIds: [] }),
  markApplied: (id) => set((s) => ({ appliedIds: [...s.appliedIds, id] })),
}));
