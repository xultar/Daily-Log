/**
 * The single point where this app touches localStorage.
 *
 * Storage is not merely absent when it is unavailable — it throws. A sandboxed
 * frame or a browser with cookies blocked makes every call raise a
 * SecurityError, and a full quota makes writes raise QuotaExceededError. Those
 * throws used to escape from loadWeek (taking rendering down with them) and
 * from the autosave timeout, where nothing caught them and the user was never
 * told that saving had stopped.
 *
 * Reads degrade to "nothing is there". Writes report whether they landed, so a
 * caller that must not fail silently can say so.
 */

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Every key currently in storage. Empty when storage cannot be enumerated. */
export function listKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}
