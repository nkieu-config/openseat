const STORAGE_KEY = "os_hold_key";

export function getHoldKey(): string {
  if (typeof window === "undefined") {
    return "server-render-hold-key";
  }
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const key = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, key);
  return key;
}
