import { normalizeWorldSave, WORLD_SAVE_VERSION } from './save.js';

const PREFIX = 'aislopcraft:world:';
const MODERN_PREFIX = 'aislopcraft:world-v2:'; // Outside the legacy client's keyspace.

export function createWorldSaveStore(storage) {
  const has = id => [PREFIX, MODERN_PREFIX].some(prefix => storage?.getItem(prefix + id) != null);
  const parse = (raw, id) => {
    try {
      const save = normalizeWorldSave(JSON.parse(raw ?? 'null'));
      return save?.worldId === id ? save : null;
    } catch { return null; }
  };
  const records = id => {
    const oldKey = PREFIX + id, modernKey = MODERN_PREFIX + id;
    const oldRaw = storage?.getItem(oldKey) ?? null, modernRaw = storage?.getItem(modernKey) ?? null;
    const old = parse(oldRaw, id), modern = parse(modernRaw, id);
    return { oldKey, modernKey, oldRaw, modernRaw, old, modern: modern?.version === WORLD_SAVE_VERSION ? modern : null };
  };
  const migrate = ({ oldKey, modernKey, oldRaw, modernRaw, old }) => {
    if (old?.version !== WORLD_SAVE_VERSION || (modernRaw != null && modernRaw !== oldRaw)) return;
    try {
      if (modernRaw == null) storage.setItem(modernKey, oldRaw);
      if (storage.getItem(oldKey) === oldRaw) storage.removeItem(oldKey);
    } catch { /* A failed copy keeps the old record readable; never delete it to reclaim quota. */ }
  };
  const readVersions = id => {
    try {
      const entry = records(id);
      migrate(entry);
      const beta = entry.old?.version === 1 ? entry.old : null;
      const modern = entry.modern ?? (entry.old?.version === WORLD_SAVE_VERSION ? entry.old : null);
      return [beta, modern];
    } catch { return [null, null]; }
  };
  const read = (id, version) => {
    const [beta, modern] = readVersions(id);
    return version === 1 ? beta : version === WORLD_SAVE_VERSION ? modern : modern ?? beta;
  };
  const write = (payload, { createOnly = false } = {}) => {
    const save = normalizeWorldSave(payload);
    if (!save) throw new Error('The current world state is incomplete.');
    if (!storage) throw new Error('Browser storage is unavailable.');
    if (createOnly && has(save.worldId)) throw new Error('A save with this world ID already exists.');
    const entry = records(save.worldId);
    const legacy = save.version === 1;
    const current = legacy ? entry.old : entry.modern;
    const currentRaw = legacy ? entry.oldRaw : entry.modernRaw;
    if (currentRaw != null && (current?.version !== save.version || current.seed !== save.seed)) {
      throw new Error('The save key holds a different or unreadable world. Its data is protected.');
    }
    storage.setItem(legacy ? entry.oldKey : entry.modernKey, JSON.stringify(save));
    // Remove a development source only after successfully saving its replacement.
    if (!legacy && entry.old?.version === save.version && entry.old.seed === save.seed && (entry.modernRaw == null || entry.modernRaw === entry.oldRaw)) {
      try { if (storage.getItem(entry.oldKey) === entry.oldRaw) storage.removeItem(entry.oldKey); } catch { /* Keep the recovery copy. */ }
    }
  };

  return {
    read, write,
    has,
    remove(id, version) {
      const entry = records(id);
      const target = version ?? entry.modern?.version ?? entry.old?.version;
      if (target === WORLD_SAVE_VERSION && entry.modern) {
        if (entry.oldRaw === entry.modernRaw) storage.removeItem(entry.oldKey);
        storage.removeItem(entry.modernKey);
      } else if (entry.old?.version === target && entry.old) storage.removeItem(entry.oldKey);
    },
    rename(id, name, version) {
      const save = read(id, version);
      if (!save) throw new Error('Could not find that saved world.');
      write({ ...save, worldName: String(name || '').trim() || save.worldName });
    },
    list() {
      const worlds = [];
      try {
        const ids = new Set();
        for (let i = 0; i < (storage?.length ?? 0); i++) {
          const storageKey = storage.key(i);
          const prefix = [PREFIX, MODERN_PREFIX].find(prefix => storageKey?.startsWith(prefix));
          if (prefix) ids.add(storageKey.slice(prefix.length));
        }
        for (const id of ids) for (const save of readVersions(id)) {
          if (save) worlds.push({ id: save.worldId, seed: save.seed, name: save.worldName, gameMode: save.gameMode, edition: save.edition, ...(save.terrain ? { terrain: save.terrain } : {}) });
        }
      } catch { /* Return readable saves when browser storage is unavailable. */ }
      return worlds;
    },
  };
}
