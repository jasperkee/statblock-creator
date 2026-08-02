import assert from "node:assert/strict";
import test from "node:test";
import {
  COLUMN_MODE,
  createSavedCreatureRecords,
  normalizeColumnMode,
  normalizeSavedCreatureRecord,
  resolveColumnLayout,
} from "../app/statblock-layout.js";

test("automatically chooses columns at the 900px cutoff", () => {
  assert.equal(resolveColumnLayout(COLUMN_MODE.AUTO, 899), COLUMN_MODE.SINGLE);
  assert.equal(resolveColumnLayout(COLUMN_MODE.AUTO, 900), COLUMN_MODE.SINGLE);
  assert.equal(resolveColumnLayout(COLUMN_MODE.AUTO, 901), COLUMN_MODE.DOUBLE);
});

test("manual column modes override measured height", () => {
  assert.equal(resolveColumnLayout(COLUMN_MODE.SINGLE, 1800), COLUMN_MODE.SINGLE);
  assert.equal(resolveColumnLayout(COLUMN_MODE.DOUBLE, 300), COLUMN_MODE.DOUBLE);
});

test("legacy or invalid column modes normalize to automatic", () => {
  assert.equal(normalizeColumnMode(undefined), COLUMN_MODE.AUTO);
  assert.equal(normalizeColumnMode("unexpected"), COLUMN_MODE.AUTO);
  assert.equal(normalizeColumnMode(COLUMN_MODE.SINGLE), COLUMN_MODE.SINGLE);
});

test("new saved records keep layout metadata outside the creature YAML data", () => {
  const [record] = createSavedCreatureRecords(
    [{ name: "Bodytaker Podling" }],
    { idFor: () => "podling", now: 42 },
  );
  assert.equal(record.columnMode, COLUMN_MODE.AUTO);
  assert.equal(record.creature.columnMode, undefined);

  const duplicate = createSavedCreatureRecords(
    [record.creature],
    { idFor: () => "podling-copy", now: 43, columnMode: COLUMN_MODE.SINGLE },
  )[0];
  assert.equal(duplicate.columnMode, COLUMN_MODE.SINGLE);
  assert.equal(duplicate.creature.columnMode, undefined);
});

test("legacy saved records gain an automatic mode without changing creature data", () => {
  const legacy = { id: "legacy", updatedAt: 1, creature: { name: "Legacy" } };
  const normalized = normalizeSavedCreatureRecord(legacy);
  assert.equal(normalized.columnMode, COLUMN_MODE.AUTO);
  assert.deepEqual(normalized.creature, legacy.creature);
});
