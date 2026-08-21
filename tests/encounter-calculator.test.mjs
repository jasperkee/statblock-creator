import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEncounter,
  classifyDifficulty,
  createDefaultEncounter,
  ENCOUNTER_STORAGE_KEY,
  loadEncounterState,
  normalizeEncounterState,
  saveEncounterState,
  xpForOpponent,
} from "../app/encounter-calculator/encounter-rules.js";

function encounter(overrides = {}) {
  return {
    partyLevel: 5,
    heroCount: 4,
    opponents: [{ id: "one", cr: "1", quantity: 1, cr0Xp: 10 }],
    ...overrides,
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key),
  };
}

test("uses the published 2024 party budgets at representative levels", () => {
  assert.deepEqual(calculateEncounter(encounter({ partyLevel: 1 })).budgets, {
    low: 200, moderate: 300, high: 400,
  });
  assert.deepEqual(calculateEncounter(encounter()).budgets, {
    low: 2000, moderate: 3000, high: 4400,
  });
  assert.deepEqual(calculateEncounter(encounter({ partyLevel: 20 })).budgets, {
    low: 25600, moderate: 52800, high: 88000,
  });
});

test("converts fractional CRs, quantities, and both CR 0 values without a multiplier", () => {
  assert.equal(xpForOpponent({ cr: "1/8", quantity: 3, cr0Xp: 10 }), 75);
  assert.equal(xpForOpponent({ cr: "0", quantity: 8, cr0Xp: 0 }), 0);
  assert.equal(xpForOpponent({ cr: "0", quantity: 8, cr0Xp: 10 }), 80);
  assert.equal(calculateEncounter(encounter({
    opponents: [
      { id: "a", cr: "1/2", quantity: 4, cr0Xp: 10 },
      { id: "b", cr: "2", quantity: 2, cr0Xp: 10 },
    ],
  })).totalXp, 1300);
});

test("uses budget ceilings for exact boundaries and above-High encounters", () => {
  const budgets = { low: 2000, moderate: 3000, high: 4400 };
  const totals = [
    [2000, "Low"],
    [2001, "Moderate"],
    [3000, "Moderate"],
    [3001, "High"],
    [4400, "High"],
    [4401, "Above High"],
  ];
  for (const [total, difficulty] of totals) {
    assert.equal(classifyDifficulty(total, budgets).difficulty, difficulty);
  }
});

test("reports large groups and CRs above the party level", () => {
  const result = calculateEncounter(encounter({
    partyLevel: 2,
    heroCount: 2,
    opponents: [
      { id: "a", cr: "3", quantity: 1, cr0Xp: 10 },
      { id: "b", cr: "1/8", quantity: 4, cr0Xp: 10 },
    ],
  }));
  assert.equal(result.tooManyCreatures, true);
  assert.equal(result.hasOverLevelCr, true);
});

test("creates and normalizes the requested defaults", () => {
  const defaults = createDefaultEncounter("default-row");
  assert.deepEqual(defaults, {
    partyLevel: 1,
    heroCount: 4,
    opponents: [{ id: "default-row", cr: "1/4", quantity: 1, cr0Xp: 10 }],
  });
  assert.deepEqual(normalizeEncounterState(defaults), defaults);
});

test("persists versioned state and falls back when stored data is malformed", () => {
  const storage = memoryStorage();
  const state = encounter();
  assert.equal(saveEncounterState(storage, state), true);
  assert.deepEqual(loadEncounterState(storage), state);

  const malformed = memoryStorage({ [ENCOUNTER_STORAGE_KEY]: "not json" });
  assert.deepEqual(loadEncounterState(malformed, "fallback"), createDefaultEncounter("fallback"));

  const obsolete = memoryStorage({
    [ENCOUNTER_STORAGE_KEY]: JSON.stringify({ version: 0, state }),
  });
  assert.deepEqual(loadEncounterState(obsolete, "old"), createDefaultEncounter("old"));
});
