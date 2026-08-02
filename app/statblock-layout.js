export const COLUMN_MODE = {
  AUTO: "auto",
  SINGLE: "single",
  DOUBLE: "double",
};

export const AUTO_SINGLE_COLUMN_MAX_HEIGHT = 900;

export function normalizeColumnMode(value) {
  return value === COLUMN_MODE.SINGLE || value === COLUMN_MODE.DOUBLE
    ? value
    : COLUMN_MODE.AUTO;
}

export function resolveColumnLayout(
  mode,
  singleColumnHeight,
  cutoff = AUTO_SINGLE_COLUMN_MAX_HEIGHT,
) {
  const normalized = normalizeColumnMode(mode);
  if (normalized !== COLUMN_MODE.AUTO) return normalized;
  return singleColumnHeight <= cutoff ? COLUMN_MODE.SINGLE : COLUMN_MODE.DOUBLE;
}

export function normalizeSavedCreatureRecord(record) {
  return {
    ...record,
    columnMode: normalizeColumnMode(record?.columnMode),
  };
}

export function createSavedCreatureRecords(
  creatures,
  { idFor, now, columnMode = COLUMN_MODE.AUTO },
) {
  const normalizedMode = normalizeColumnMode(columnMode);
  return creatures.map((creature, index) => ({
    id: idFor(index),
    updatedAt: now - index,
    columnMode: normalizedMode,
    creature: structuredClone(creature),
  }));
}
