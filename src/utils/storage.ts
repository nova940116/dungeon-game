/** localStorage wrapper that never throws (private mode, blocked storage, etc). */
export const storage = {
  getNumber(key: string, fallback = 0): number {
    try {
      const raw = localStorage.getItem(key);
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  },
  setNumber(key: string, value: number): void {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* storage unavailable: progress simply isn't saved */
    }
  },
};
