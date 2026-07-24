const admissionKey = (eventId: string) => `os_admission_${eventId}`;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function getAdmissionToken(eventId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(admissionKey(eventId));
}

export function setAdmissionToken(eventId: string, token: string): void {
  window.sessionStorage.setItem(admissionKey(eventId), token);
  notify();
}

export function clearAdmissionToken(eventId: string): void {
  window.sessionStorage.removeItem(admissionKey(eventId));
  notify();
}

export function isAdmissionValid(token: string | null): boolean {
  if (!token) {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized)) as { exp?: number };
    return Boolean(claims.exp && Date.now() / 1000 < claims.exp);
  } catch {
    return false;
  }
}

export function subscribeAdmission(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
