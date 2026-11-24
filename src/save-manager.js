import { normalizeWorldSave } from './save.js';

const PREFIX = 'aislopcraft:world:';

export function createWorldSaveStore(storage) {
  const key = id => PREFIX + id;
  const read = id => {
    try {
      const save = normalizeWorldSave(JSON.parse(storage?.getItem(key(id)) ?? 'null'));
      return save?.worldId === id ? save : null;
    } catch { return null; }
  };
  const write = payload => {
    const save = normalizeWorldSave(payload);
    if (!save) throw new Error('The current world state is incomplete.');
    if (!storage) throw new Error('Browser storage is unavailable.');
    storage.setItem(key(save.worldId), JSON.stringify(save));
  };

  return {
    read, write,
    has: id => Boolean(storage?.getItem(key(id))),
    remove: id => storage?.removeItem(key(id)),
    rename(id, name) {
      const save = read(id);
      if (!save) throw new Error('Could not find that saved world.');
      write({ ...save, worldName: String(name || '').trim() || save.worldName });
    },
    list() {
      const worlds = [];
      try {
        for (let i = 0; i < (storage?.length ?? 0); i++) {
          const storageKey = storage.key(i);
          if (!storageKey?.startsWith(PREFIX)) continue;
          const save = read(storageKey.slice(PREFIX.length));
          if (save) worlds.push({ id: save.worldId, seed: save.seed, name: save.worldName, gameMode: save.gameMode, edition: save.edition });
        }
      } catch { /* Return readable saves when browser storage is unavailable. */ }
      return worlds;
    },
  };
}
