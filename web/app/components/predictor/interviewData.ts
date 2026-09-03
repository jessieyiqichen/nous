import type { ConflictData } from "./types";

// Get contradiction data from Interview tab's localStorage
export const getConflicts = (): ConflictData[] => {
  try {
    const raw = localStorage.getItem("nous_interview_conflicts");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

// Get signal data from Interview tab's localStorage
export const getSignals = (): unknown[] => {
  try {
    const raw = localStorage.getItem("nous_interview_signals");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};
