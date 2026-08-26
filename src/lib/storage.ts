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

/**
 * Learn when another tab changes storage.
 *
 * The `storage` event fires only in OTHER documents of the same origin — never
 * in the tab that wrote — so there is no self-echo to guard against, and no
 * test can produce it by writing to localStorage in the same document.
 *
 * `event.key` is null when another tab calls clear(), meaning "everything
 * changed". It is passed through rather than filtered here: only the caller
 * knows which keys it cares about.
 *
 * Returns an unsubscribe, which stays callable even where there is no window,
 * so an effect cleanup never throws.
 */
export function onExternalChange(handler: (key: string | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: StorageEvent) => handler(event.key);
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
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
