import type {
  Creature,
  SavedCreature,
  StatblockColumnMode,
} from "./statblock-data";

export const COLUMN_MODE: {
  readonly AUTO: "auto";
  readonly SINGLE: "single";
  readonly DOUBLE: "double";
};

export const AUTO_SINGLE_COLUMN_MAX_HEIGHT: 900;

export function normalizeColumnMode(value: unknown): StatblockColumnMode;

export function resolveColumnLayout(
  mode: StatblockColumnMode,
  singleColumnHeight: number,
  cutoff?: number,
): "single" | "double";

export function normalizeSavedCreatureRecord(
  record: SavedCreature,
): SavedCreature & { columnMode: StatblockColumnMode };

export function createSavedCreatureRecords(
  creatures: Creature[],
  options: {
    idFor: (index: number) => string;
    now: number;
    columnMode?: StatblockColumnMode;
  },
): Array<SavedCreature & { columnMode: StatblockColumnMode }>;
