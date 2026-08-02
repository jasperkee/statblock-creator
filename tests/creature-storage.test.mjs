import assert from "node:assert/strict";
import test from "node:test";
import {
  createResilientCreatureStorage,
  mergeCreatureRecords,
  STORAGE_MODE,
} from "../app/creature-storage.js";

const creature = (id, updatedAt, name = id) => ({
  id,
  updatedAt,
  creature: { name },
});

function fakeStore(initial = [], failures = {}) {
  let records = structuredClone(initial);
  return {
    async getAll() {
      if (failures.getAll) throw new DOMException("Internal error.", "UnknownError");
      return structuredClone(records);
    },
    async putMany(next) {
      if (failures.putMany) throw new DOMException("Internal error.", "UnknownError");
      records = mergeCreatureRecords(records, structuredClone(next));
    },
    async delete(id) {
      if (failures.delete) throw new DOMException("Internal error.", "UnknownError");
      records = records.filter((record) => record.id !== id);
    },
    async replaceAll(next) {
      if (failures.replaceAll) throw new Error("Storage unavailable");
      records = structuredClone(next);
    },
    async clear() {
      if (failures.clear) throw new Error("Storage unavailable");
      records = [];
    },
    async reset(onBlocked) {
      if (failures.blocked) onBlocked?.();
      if (failures.reset) throw new DOMException("Internal error.", "UnknownError");
      records = [];
    },
    records: () => structuredClone(records),
  };
}

test("merges primary and fallback records by id while keeping the newest copy", () => {
  const merged = mergeCreatureRecords(
    [creature("shared", 1, "Old"), creature("primary", 2)],
    [creature("shared", 3, "New"), creature("fallback", 2)],
  );
  assert.deepEqual(merged.map(({ id }) => id), ["shared", "primary", "fallback"]);
  assert.equal(merged[0].creature.name, "New");
});

test("uses fallback storage when IndexedDB loading fails and keeps CRUD working", async () => {
  const primary = fakeStore([], { getAll: true });
  const fallback = fakeStore([creature("saved", 2)]);
  const storage = createResilientCreatureStorage(primary, fallback);

  const loaded = await storage.load([creature("seed", 1)]);
  assert.equal(loaded.mode, STORAGE_MODE.FALLBACK);
  assert.deepEqual(loaded.records.map(({ id }) => id), ["saved"]);

  const snapshot = [creature("new", 3), ...loaded.records];
  assert.equal(await storage.putMany([snapshot[0]], snapshot), STORAGE_MODE.FALLBACK);
  assert.deepEqual(fallback.records().map(({ id }) => id), ["new", "saved"]);

  assert.equal(await storage.delete("saved", [snapshot[0]]), STORAGE_MODE.FALLBACK);
  assert.deepEqual(fallback.records().map(({ id }) => id), ["new"]);
});

test("merges fallback records into IndexedDB and clears fallback only after recovery", async () => {
  const primary = fakeStore([creature("shared", 1, "Old"), creature("primary", 2)]);
  const fallback = fakeStore([creature("shared", 3, "New"), creature("fallback", 2)]);
  const storage = createResilientCreatureStorage(primary, fallback);

  const loaded = await storage.load([creature("seed", 0)]);
  assert.equal(loaded.mode, STORAGE_MODE.PRIMARY);
  assert.deepEqual(primary.records().map(({ id }) => id), ["shared", "primary", "fallback"]);
  assert.deepEqual(fallback.records(), []);
});

test("switches an active session to fallback when an IndexedDB write fails", async () => {
  const primary = fakeStore([creature("saved", 1)], { putMany: true });
  const fallback = fakeStore();
  const storage = createResilientCreatureStorage(primary, fallback);
  await storage.load([creature("seed", 0)]);

  const snapshot = [creature("new", 2), creature("saved", 1)];
  assert.equal(await storage.putMany([snapshot[0]], snapshot), STORAGE_MODE.FALLBACK);
  assert.deepEqual(fallback.records(), snapshot);
});

test("keeps records in memory when IndexedDB and fallback storage both fail", async () => {
  const primary = fakeStore([], { getAll: true });
  const fallback = fakeStore([], { getAll: true, replaceAll: true });
  const storage = createResilientCreatureStorage(primary, fallback);
  const seed = [creature("seed", 1)];

  const loaded = await storage.load(seed);
  assert.equal(loaded.mode, STORAGE_MODE.MEMORY);
  assert.deepEqual(loaded.records, seed);

  const snapshot = [creature("new", 2), ...seed];
  assert.equal(await storage.putMany([snapshot[0]], snapshot), STORAGE_MODE.MEMORY);
  assert.deepEqual(storage.getMemoryRecords(), snapshot);
});

test("resets IndexedDB and restores the current bestiary before clearing fallback", async () => {
  const primary = fakeStore([creature("inaccessible", 1)]);
  const fallback = fakeStore();
  const storage = createResilientCreatureStorage(primary, fallback);
  const snapshot = [creature("visible", 3), creature("imported", 2)];
  await storage.load([creature("seed", 0)]);

  const result = await storage.resetPrimary(snapshot);
  assert.deepEqual(result, { ok: true, mode: STORAGE_MODE.PRIMARY });
  assert.deepEqual(primary.records(), snapshot);
  assert.deepEqual(fallback.records(), []);
});

test("reports blocked reset attempts and retains fallback data when recreation fails", async () => {
  const primary = fakeStore([], { blocked: true, reset: true });
  const fallback = fakeStore();
  const storage = createResilientCreatureStorage(primary, fallback);
  const snapshot = [creature("visible", 2)];
  let blocked = false;

  const result = await storage.resetPrimary(snapshot, () => {
    blocked = true;
  });
  assert.equal(blocked, true);
  assert.equal(result.ok, false);
  assert.equal(result.mode, STORAGE_MODE.FALLBACK);
  assert.deepEqual(fallback.records(), snapshot);
});
