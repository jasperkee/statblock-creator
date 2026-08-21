export const ENCOUNTER_STORAGE_KEY = "statblock-creator-encounter-calculator-v1";
export const ENCOUNTER_STORAGE_VERSION = 1;

export const PARTY_XP_BUDGETS = Object.freeze({
  1: [50, 75, 100],
  2: [100, 150, 200],
  3: [150, 225, 400],
  4: [250, 375, 500],
  5: [500, 750, 1100],
  6: [600, 1000, 1400],
  7: [750, 1300, 1700],
  8: [1000, 1700, 2100],
  9: [1300, 2000, 2600],
  10: [1600, 2300, 3100],
  11: [1900, 2900, 4100],
  12: [2200, 3700, 4700],
  13: [2600, 4200, 5400],
  14: [2900, 4900, 6200],
  15: [3300, 5400, 7800],
  16: [3800, 6100, 9800],
  17: [4500, 7200, 11700],
  18: [5000, 8700, 14200],
  19: [5500, 10700, 17200],
  20: [6400, 13200, 22000],
});

export const CR_XP = Object.freeze({
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
});

export const CR_OPTIONS = Object.freeze([
  "0", "1/8", "1/4", "1/2",
  ...Array.from({ length: 30 }, (_, index) => String(index + 1)),
]);

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function challengeRatingNumber(cr) {
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  return Number(cr);
}

export function createOpponentGroup(id = "opponent-1") {
  return { id, cr: "1/4", quantity: 1, cr0Xp: 10 };
}

export function createDefaultEncounter(id = "opponent-1") {
  return {
    partyLevel: 1,
    heroCount: 4,
    opponents: [createOpponentGroup(id)],
  };
}

export function xpForOpponent(opponent) {
  const xp = opponent.cr === "0" ? opponent.cr0Xp : CR_XP[opponent.cr];
  return (xp ?? 0) * opponent.quantity;
}

export function classifyDifficulty(totalXp, budgets) {
  if (totalXp > budgets.high) return { difficulty: "Above High", target: budgets.high };
  if (totalXp > budgets.moderate) return { difficulty: "High", target: budgets.high };
  if (totalXp > budgets.low) return { difficulty: "Moderate", target: budgets.moderate };
  return { difficulty: "Low", target: budgets.low };
}

export function calculateEncounter(state) {
  const [lowPerHero, moderatePerHero, highPerHero] = PARTY_XP_BUDGETS[state.partyLevel];
  const budgets = {
    low: lowPerHero * state.heroCount,
    moderate: moderatePerHero * state.heroCount,
    high: highPerHero * state.heroCount,
  };
  const totalXp = state.opponents.reduce((total, opponent) => total + xpForOpponent(opponent), 0);
  const creatureCount = state.opponents.reduce((total, opponent) => total + opponent.quantity, 0);
  const { difficulty, target } = classifyDifficulty(totalXp, budgets);

  return {
    totalXp,
    creatureCount,
    budgets,
    difficulty,
    budgetDifference: totalXp > target ? totalXp - target : target - totalXp,
    isOverTarget: totalXp > target,
    tooManyCreatures: creatureCount > state.heroCount * 2,
    hasOverLevelCr: state.opponents.some(
      (opponent) => challengeRatingNumber(opponent.cr) > state.partyLevel,
    ),
  };
}

export function normalizeEncounterState(value, fallbackId = "opponent-1") {
  if (!value || typeof value !== "object") return createDefaultEncounter(fallbackId);
  if (!integerInRange(value.partyLevel, 1, 20)) return createDefaultEncounter(fallbackId);
  if (!integerInRange(value.heroCount, 1, 20)) return createDefaultEncounter(fallbackId);
  if (!Array.isArray(value.opponents)) return createDefaultEncounter(fallbackId);

  const opponents = [];
  for (const opponent of value.opponents) {
    if (!opponent || typeof opponent !== "object") return createDefaultEncounter(fallbackId);
    if (typeof opponent.id !== "string" || !opponent.id) return createDefaultEncounter(fallbackId);
    if (!CR_OPTIONS.includes(opponent.cr)) return createDefaultEncounter(fallbackId);
    if (!integerInRange(opponent.quantity, 1, 99)) return createDefaultEncounter(fallbackId);
    if (opponent.cr0Xp !== 0 && opponent.cr0Xp !== 10) return createDefaultEncounter(fallbackId);
    opponents.push({
      id: opponent.id,
      cr: opponent.cr,
      quantity: opponent.quantity,
      cr0Xp: opponent.cr0Xp,
    });
  }

  return { partyLevel: value.partyLevel, heroCount: value.heroCount, opponents };
}

export function loadEncounterState(storage, fallbackId = "opponent-1") {
  try {
    const raw = storage?.getItem(ENCOUNTER_STORAGE_KEY);
    if (!raw) return createDefaultEncounter(fallbackId);
    const stored = JSON.parse(raw);
    if (stored?.version !== ENCOUNTER_STORAGE_VERSION) {
      return createDefaultEncounter(fallbackId);
    }
    return normalizeEncounterState(stored.state, fallbackId);
  } catch {
    return createDefaultEncounter(fallbackId);
  }
}

export function saveEncounterState(storage, state) {
  try {
    storage?.setItem(ENCOUNTER_STORAGE_KEY, JSON.stringify({
      version: ENCOUNTER_STORAGE_VERSION,
      state,
    }));
    return true;
  } catch {
    return false;
  }
}
