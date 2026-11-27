// Safe browser storage wrapper that survives SecurityError / QuotaExceededError
// when cookies, site data, or sandboxed iframe storage are blocked.

export function createMemoryStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] ?? null; },
    getItem(key) { const k = String(key); return store.has(k) ? store.get(k) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
    clear() { store.clear(); },
  };
}

let fallbackStorage = null;

export function getSafeStorage(scope = globalThis) {
  try {
    const storage = scope?.localStorage;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      storage.getItem('__aislopcraft_probe__');
      return storage;
    }
  } catch {
    // Fall through to in-memory session storage.
  }
  if (!fallbackStorage) fallbackStorage = createMemoryStorage();
  return fallbackStorage;
}

export function safeStorageGet(storage, key) {
  if (arguments.length === 1) {
    key = storage;
    storage = getSafeStorage();
  }
  if (!storage || typeof storage.getItem !== 'function') return null;
  try { return storage.getItem(String(key)); } catch { return null; }
}

export function safeStorageSet(storage, key, value) {
  if (arguments.length === 2) {
    value = key;
    key = storage;
    storage = getSafeStorage();
  }
  if (!storage || typeof storage.setItem !== 'function') return false;
  try { storage.setItem(String(key), String(value)); return true; } catch { return false; }
}

export function safeStorageRemove(storage, key) {
  if (arguments.length === 1) {
    key = storage;
    storage = getSafeStorage();
  }
  if (!storage || typeof storage.removeItem !== 'function') return false;
  try { storage.removeItem(String(key)); return true; } catch { return false; }
}
