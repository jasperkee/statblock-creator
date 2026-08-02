export const STORAGE_MODE = {
  PRIMARY: "primary",
  FALLBACK: "fallback",
  MEMORY: "memory",
};

export function mergeCreatureRecords(primaryRecords, fallbackRecords) {
  const merged = new Map();
  for (const record of [...primaryRecords, ...fallbackRecords]) {
    const current = merged.get(record.id);
    if (!current || record.updatedAt > current.updatedAt) merged.set(record.id, record);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createLocalStorageCreatureStore(storage, key) {
  return {
    async getAll() {
      const source = storage.getItem(key);
      if (!source) return [];
      const records = JSON.parse(source);
      if (!Array.isArray(records)) throw new Error("Fallback bestiary data is invalid.");
      return records;
    },
    async replaceAll(records) {
      storage.setItem(key, JSON.stringify(records));
    },
    async clear() {
      storage.removeItem(key);
    },
  };
}

export function createResilientCreatureStorage(primary, fallback) {
  let mode = STORAGE_MODE.PRIMARY;
  let memoryRecords = [];
  let operationQueue = Promise.resolve();

  const enqueue = (operation) => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const useFallback = async (records) => {
    memoryRecords = records;
    try {
      await fallback.replaceAll(records);
      mode = STORAGE_MODE.FALLBACK;
    } catch {
      mode = STORAGE_MODE.MEMORY;
    }
    return mode;
  };

  return {
    load(seedRecords) {
      return enqueue(async () => {
        let primaryRecords;
        try {
          primaryRecords = await primary.getAll();
        } catch {
          let fallbackRecords = [];
          try {
            fallbackRecords = await fallback.getAll();
          } catch {
            // The editor can still operate in memory when both stores fail.
          }
          const records = fallbackRecords.length ? fallbackRecords : seedRecords;
          await useFallback(records);
          return { records, mode };
        }

        let fallbackRecords = [];
        try {
          fallbackRecords = await fallback.getAll();
        } catch {
          // A broken fallback must not prevent a healthy IndexedDB from loading.
        }

        const records = mergeCreatureRecords(primaryRecords, fallbackRecords);
        const nextRecords = records.length ? records : seedRecords;
        try {
          if (fallbackRecords.length || !primaryRecords.length) {
            await primary.replaceAll(nextRecords);
          }
          if (fallbackRecords.length) {
            try {
              await fallback.clear();
            } catch {
              // Duplicate fallback records are harmless and can be retried next load.
            }
          }
          mode = STORAGE_MODE.PRIMARY;
          memoryRecords = nextRecords;
        } catch {
          await useFallback(nextRecords);
        }
        return { records: nextRecords, mode };
      });
    },

    putMany(records, snapshot) {
      return enqueue(async () => {
        memoryRecords = snapshot;
        if (mode === STORAGE_MODE.PRIMARY) {
          try {
            await primary.putMany(records);
            return mode;
          } catch {
            return useFallback(snapshot);
          }
        }
        if (mode === STORAGE_MODE.FALLBACK) return useFallback(snapshot);
        return STORAGE_MODE.MEMORY;
      });
    },

    delete(id, snapshot) {
      return enqueue(async () => {
        memoryRecords = snapshot;
        if (mode === STORAGE_MODE.PRIMARY) {
          try {
            await primary.delete(id);
            return mode;
          } catch {
            return useFallback(snapshot);
          }
        }
        if (mode === STORAGE_MODE.FALLBACK) return useFallback(snapshot);
        return STORAGE_MODE.MEMORY;
      });
    },

    resetPrimary(snapshot, onBlocked) {
      return enqueue(async () => {
        memoryRecords = snapshot;
        try {
          await fallback.replaceAll(snapshot);
          mode = STORAGE_MODE.FALLBACK;
        } catch {
          mode = STORAGE_MODE.MEMORY;
        }

        try {
          await primary.reset(onBlocked);
          await primary.replaceAll(snapshot);
          try {
            await fallback.clear();
          } catch {
            // The restored IndexedDB remains authoritative if cleanup fails.
          }
          mode = STORAGE_MODE.PRIMARY;
          return { ok: true, mode };
        } catch (error) {
          await useFallback(snapshot);
          return { ok: false, mode, error };
        }
      });
    },

    getMode() {
      return mode;
    },

    getMemoryRecords() {
      return memoryRecords;
    },
  };
}
