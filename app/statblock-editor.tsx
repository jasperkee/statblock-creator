"use client";

import {
  ChangeEvent,
  Fragment,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import { deleteDB, openDB } from "idb";
import JSZip from "jszip";
import { parse, stringify } from "yaml";
import {
  COLUMN_MODE,
  createSavedCreatureRecords,
  normalizeColumnMode,
  normalizeSavedCreatureRecord,
  resolveColumnLayout,
} from "./statblock-layout.js";
import {
  createLocalStorageCreatureStore,
  createResilientCreatureStorage,
  STORAGE_MODE,
} from "./creature-storage.js";
import {
  convert5eToolsMonster,
  convertSelectedCandidates,
  parse5eToolsJson,
  setCandidatesSelected,
} from "./fivetools-import.js";
import {
  ABILITIES,
  ABILITY_KEYS,
  ADULT_RED_DRAGON,
  ALIGNMENTS,
  BLANK_CREATURE,
  CONDITIONS,
  CREATURE_TYPES,
  Creature,
  DAMAGE_TYPES,
  Entry,
  LANGUAGES,
  SavedCreature,
  SENSES,
  SKILLS,
  SPELLS,
  SpellcastingConfig,
  StatblockColumnMode,
} from "./statblock-data";

const ENABLE_5ETOOLS_URL_IMPORT =
  import.meta.env.VITE_ENABLE_5ETOOLS_URL_IMPORT === "true";
const loadFiveToolsUrlImporter = ENABLE_5ETOOLS_URL_IMPORT
  ? () => import("./5etools-url-import")
  : null;

type ImportTab = "yaml" | "json" | "link";
type FiveToolsCandidate = ReturnType<typeof parse5eToolsJson>[number];

const TEMP_FIELDS = new Set([
  "creature", "temp", "current_ac", "dirty_ac", "enabled", "hidden", "max",
  "current_max", "status", "initiative", "static", "id", "viewing", "number",
  "friendly", "mtime", "path", "studio_spellcasting",
]);
const GROUPS = [
  ["identity", "Identity"],
  ["core", "Core statistics"],
  ["defenses", "Proficiencies & defenses"],
  ["awareness", "Awareness & communication"],
  ["features", "Features & spellcasting"],
  ["combat", "Combat"],
] as const;

// Retain the original persisted identifiers so the product rename does not orphan saved bestiaries.
const DATABASE_NAME = "statblock-studio";
let databasePromise: ReturnType<typeof openDB> | null = null;
function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDB(DATABASE_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("creatures")) {
          database.createObjectStore("creatures", { keyPath: "id" });
        }
      },
      blocking() {
        resetDatabaseConnection();
      },
      terminated() {
        databasePromise = null;
      },
    });
    void databasePromise.catch(() => {
      databasePromise = null;
    });
  }
  return databasePromise;
}

function resetDatabaseConnection() {
  const failedDatabase = databasePromise;
  databasePromise = null;
  void failedDatabase?.then((database) => database.close()).catch(() => undefined);
}

async function closeDatabaseConnection() {
  const currentDatabase = databasePromise;
  databasePromise = null;
  const database = await currentDatabase?.catch(() => null);
  database?.close();
}

async function useDatabase<T>(operation: (database: Awaited<ReturnType<typeof getDatabase>>) => Promise<T>) {
  try {
    return await operation(await getDatabase());
  } catch (error) {
    resetDatabaseConnection();
    throw error;
  }
}

const indexedDbCreatureStore = {
  getAll: () => useDatabase((database) => database.getAll("creatures") as Promise<SavedCreature[]>),
  putMany: (records: SavedCreature[]) => useDatabase(async (database) => {
    const transaction = database.transaction("creatures", "readwrite");
    await Promise.all([
      ...records.map((record) => transaction.store.put(record)),
      transaction.done,
    ]);
  }),
  delete: (id: string) => useDatabase((database) => database.delete("creatures", id)),
  replaceAll: (records: SavedCreature[]) => useDatabase(async (database) => {
    const transaction = database.transaction("creatures", "readwrite");
    await Promise.all([
      transaction.store.clear(),
      ...records.map((record) => transaction.store.put(record)),
      transaction.done,
    ]);
  }),
  reset: async (onBlocked?: () => void) => {
    await closeDatabaseConnection();
    await deleteDB(DATABASE_NAME, {
      blocked() {
        onBlocked?.();
      },
    });
  },
};

const fallbackCreatureStore = createLocalStorageCreatureStore({
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
}, "statblock-studio-bestiary-fallback-v1");
const creatureStorage = createResilientCreatureStorage(
  indexedDbCreatureStore,
  fallbackCreatureStore,
);

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `creature-${Date.now()}`;
}

function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function proficiencyBonus(cr: Creature["cr"]) {
  const numeric = Number(String(cr ?? "0").split("/")[0]) || 0;
  if (numeric >= 29) return 9;
  if (numeric >= 25) return 8;
  if (numeric >= 21) return 7;
  if (numeric >= 17) return 6;
  if (numeric >= 13) return 5;
  if (numeric >= 9) return 4;
  if (numeric >= 5) return 3;
  return 2;
}

function xpForCr(cr: Creature["cr"]) {
  const table: Record<string, string> = {
    "0": "0–10", "1/8": "25", "1/4": "50", "1/2": "100", "1": "200",
    "2": "450", "3": "700", "4": "1,100", "5": "1,800", "6": "2,300",
    "7": "2,900", "8": "3,900", "9": "5,000", "10": "5,900", "11": "7,200",
    "12": "8,400", "13": "10,000", "14": "11,500", "15": "13,000",
    "16": "15,000", "17": "18,000", "18": "20,000", "19": "22,000",
    "20": "25,000", "21": "33,000", "22": "41,000", "23": "50,000",
    "24": "62,000", "25": "75,000", "26": "90,000", "27": "105,000",
    "28": "120,000", "29": "135,000", "30": "155,000",
  };
  return table[String(cr ?? "0")] ?? "—";
}

function stripLinkTokens(value: string) {
  return value
    .replace(
      /<STATBLOCK-MARKDOWN-LINK>[^|<]*\|([^<]*)<STATBLOCK-MARKDOWN-LINK>/g,
      "$1",
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function markdownHtml(value: string) {
  const escaped = stripLinkTokens(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n- /g, "<br>• ")
    .replace(/\n/g, "<br>");
}

function normalizeEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { name: "", desc: item };
    if (!item || typeof item !== "object") return { name: "", desc: "" };
    const record = item as Record<string, unknown>;
    return { name: String(record.name ?? ""), desc: String(record.desc ?? "") };
  });
}

function defaultSpellcasting(): SpellcastingConfig {
  return {
    ability: "Charisma",
    saveDc: "",
    attackBonus: "",
    notes: "requires no Material components",
    groups: [{ label: "At will", spells: [] }],
  };
}

function parseSpellcasting(actions: Entry[]): SpellcastingConfig | undefined {
  const action = actions.find(
    (entry) => entry.name.trim().toLowerCase() === "spellcasting",
  );
  if (!action) return undefined;
  const text = stripLinkTokens(action.desc);
  const ability =
    ABILITIES.find((item) =>
      new RegExp(`using ${item}`, "i").test(text),
    ) ?? "Charisma";
  const saveDc = text.match(/spell save DC\s*(\d+)/i)?.[1] ?? "";
  const attackBonus = text.match(/([+-]\d+)\s+to hit with spell attacks/i)?.[1] ?? "";
  const groups: SpellcastingConfig["groups"] = [];
  for (const match of text.matchAll(/\*\*([^*]+):\*\*\s*([^\n]+)/g)) {
    groups.push({
      label: match[1],
      spells: match[2].split(",").map((spell) => spell.trim()).filter(Boolean),
    });
  }
  return {
    ability,
    saveDc,
    attackBonus,
    notes: /requiring no Material components/i.test(text)
      ? "requires no Material components"
      : "",
    groups: groups.length ? groups : [{ label: "At will", spells: [] }],
  };
}

function spellcastingDescription(config: SpellcastingConfig) {
  const details = [
    config.notes,
    `using ${config.ability} as the spellcasting ability`,
    config.saveDc ? `spell save DC ${config.saveDc}` : "",
    config.attackBonus ? `${config.attackBonus} to hit with spell attacks` : "",
  ].filter(Boolean);
  const groups = config.groups
    .filter((group) => group.label.trim() || group.spells.length)
    .map((group) => `**${group.label || "Spells"}:** ${group.spells.join(", ")}`)
    .join("\n\n");
  return `The creature casts one of the following spells${
    details.length ? `, ${details.join(" and ")}` : ""
  }${groups ? `:\n\n${groups}` : "."}`;
}

function withSpellcasting(creature: Creature, config: SpellcastingConfig) {
  const actions = [...(creature.actions ?? [])];
  const index = actions.findIndex(
    (entry) => entry.name.trim().toLowerCase() === "spellcasting",
  );
  const action = { name: "Spellcasting", desc: spellcastingDescription(config) };
  if (index >= 0) actions[index] = action;
  else actions.push(action);
  return { ...creature, studio_spellcasting: config, actions };
}

function normalizeCreature(raw: Record<string, unknown>): Creature {
  const stats = Array.isArray(raw.stats)
    ? raw.stats.map((value) => Number(value) || 0).slice(0, 6)
    : [...ADULT_RED_DRAGON.stats];
  while (stats.length < 6) stats.push(10);
  const actions = normalizeEntries(raw.actions);
  const storedConfig =
    raw.studio_spellcasting && typeof raw.studio_spellcasting === "object"
      ? (raw.studio_spellcasting as SpellcastingConfig)
      : parseSpellcasting(actions);
  return {
    ...raw,
    layout: String(raw.layout ?? "Basic 5e Layout"),
    name: String(raw.name ?? "Untitled Creature"),
    size: String(raw.size ?? "Medium"),
    type: String(raw.type ?? "Humanoid"),
    subtype: raw.subtype ? String(raw.subtype) : "",
    alignment: String(raw.alignment ?? "Unaligned"),
    ac: (raw.ac as number | string) ?? 10,
    hp: (raw.hp as number | string) ?? 1,
    hit_dice: String(raw.hit_dice ?? ""),
    stats,
    speed: String(raw.speed ?? "30 ft."),
    traits: normalizeEntries(raw.traits),
    actions,
    bonus_actions: normalizeEntries(raw.bonus_actions),
    reactions: normalizeEntries(raw.reactions),
    lair_actions: normalizeEntries(raw.lair_actions),
    regional_effects: normalizeEntries(raw.regional_effects),
    legendary_actions: normalizeEntries(raw.legendary_actions),
    spells: Array.isArray(raw.spells) ? raw.spells.map(String) : [],
    studio_spellcasting: storedConfig,
  };
}

function cleanCreature(input: unknown): Creature {
  if (!input || typeof input !== "object") {
    throw new Error("The YAML must contain a statblock object.");
  }
  const raw = { ...(input as Record<string, unknown>) };
  const source =
    !raw.name && raw.creature && typeof raw.creature === "object"
      ? { ...(raw.creature as Record<string, unknown>) }
      : raw;
  for (const key of TEMP_FIELDS) {
    if (key !== "studio_spellcasting") delete source[key];
  }
  return normalizeCreature(source);
}

function stripFence(source: string) {
  return source
    .replace(/^\s*```(?:statblock|ya?ml)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function exportableCreature(creature: Creature, includeStudio = false) {
  const output: Record<string, unknown> = structuredClone(creature);
  for (const key of TEMP_FIELDS) {
    if (includeStudio && key === "studio_spellcasting") continue;
    delete output[key];
  }
  for (const key of Object.keys(output)) {
    const value = output[key];
    if (
      value === "" ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete output[key];
    }
  }
  return output;
}

function toYaml(creature: Creature) {
  return stringify(exportableCreature(creature), { lineWidth: 0, indent: 2 }).trim();
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "creature"
  );
}

function download(data: Blob | string, filename: string) {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  if (typeof data !== "string") URL.revokeObjectURL(url);
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineExportImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      if (!image.src || image.src.startsWith("data:")) return;
      try {
        const response = await fetch(image.src, { cache: "force-cache" });
        if (!response.ok) return;
        image.src = await blobToDataUrl(await response.blob());
      } catch {
        // Keep the original URL; html-to-image may still resolve CORS-friendly sources.
      }
    }),
  );
}

function saveRows(value: unknown) {
  if (!Array.isArray(value)) return [] as { key: string; value: string }[];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = Object.entries(item as Record<string, unknown>)[0];
    const ability = ABILITIES.find(
      (option) => option.toLowerCase() === entry?.[0]?.toLowerCase(),
    );
    return entry ? [{ key: ability ?? entry[0], value: String(entry[1]) }] : [];
  });
}

function skillRows(value: unknown) {
  if (!Array.isArray(value)) return [] as { key: string; value: string }[];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return record.name
      ? [{ key: stripLinkTokens(String(record.name)), value: String(record.desc ?? "") }]
      : [];
  });
}

function serializeSaves(rows: { key: string; value: string }[]) {
  return rows.map((row) => ({ [row.key.toLowerCase()]: Number(row.value) || 0 }));
}

function serializeSkills(rows: { key: string; value: string }[]) {
  return rows.map((row) => ({ name: row.key, desc: row.value }));
}

function formatList(value: unknown) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        if ("name" in record) {
          return `${stripLinkTokens(String(record.name ?? ""))} ${String(record.desc ?? "")}`;
        }
        return Object.entries(record)
          .map(([key, entry]) => `${key[0].toUpperCase()}${key.slice(1)} ${signed(Number(entry))}`)
          .join(", ");
      })
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function EntryPreview({ entry }: { entry: Entry }) {
  return (
    <p className="markdown">
      {entry.name ? (
        <strong>
          <em>{entry.name}.</em>{" "}
        </strong>
      ) : null}
      <span dangerouslySetInnerHTML={{ __html: markdownHtml(entry.desc) }} />
    </p>
  );
}

function StatblockPreview({
  creature,
  theme,
  columnMode,
  elementRef,
}: {
  creature: Creature;
  theme: "parchment" | "dark";
  columnMode: StatblockColumnMode;
  elementRef?: MutableRefObject<HTMLElement | null>;
}) {
  const previewRef = useRef<HTMLElement | null>(null);
  const [resolvedColumnMode, setResolvedColumnMode] = useState<"single" | "double">(
    columnMode === COLUMN_MODE.DOUBLE ? COLUMN_MODE.DOUBLE : COLUMN_MODE.SINGLE,
  );
  const subtitle = `${creature.size} ${creature.type}${
    creature.subtype ? ` (${creature.subtype})` : ""
  }, ${creature.alignment}`;
  const sections: [string, Entry[]][] = [
    ["Actions", creature.actions ?? []],
    ["Bonus Actions", creature.bonus_actions ?? []],
    ["Reactions", creature.reactions ?? []],
    ["Legendary Actions", creature.legendary_actions ?? []],
    ["Lair Actions", creature.lair_actions ?? []],
    ["Regional Effects", creature.regional_effects ?? []],
  ];

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (columnMode !== COLUMN_MODE.AUTO) {
      setResolvedColumnMode(columnMode);
      return;
    }

    let cancelled = false;
    const measure = () => {
      if (cancelled || !previewRef.current) return;
      preview.classList.add("statblock-measure-single");
      const singleColumnHeight = preview.scrollHeight;
      preview.classList.remove("statblock-measure-single");
      setResolvedColumnMode(resolveColumnLayout(columnMode, singleColumnHeight));
    };

    measure();
    void document.fonts.ready.then(() => requestAnimationFrame(measure));
    return () => {
      cancelled = true;
      preview.classList.remove("statblock-measure-single");
    };
  }, [columnMode, creature, theme]);

  return (
    <article
      className={`statblock statblock-layout-${resolvedColumnMode} ${theme === "dark" ? "dark" : ""}`}
      data-column-layout={resolvedColumnMode}
      ref={(node) => {
        previewRef.current = node;
        if (elementRef) elementRef.current = node;
      }}
    >
      <div className="statblock-flow">
        <div className="statblock-summary">
          <section className="statblock-basics">
            <header className="statblock-head">
              <div>
                <h1>{creature.name || "Untitled Creature"}</h1>
                <p className="statblock-subtitle">{subtitle}</p>
              </div>
              {creature.image ? (
                <img className="portrait" src={creature.image} alt="" crossOrigin="anonymous" />
              ) : null}
            </header>
            <div className="red-rule" />
            <p><strong>Armor Class</strong> {String(creature.ac)}</p>
            <p>
              <strong>Hit Points</strong> {String(creature.hp)}
              {creature.hit_dice ? ` (${creature.hit_dice})` : ""}
            </p>
            <p><strong>Speed</strong> {creature.speed}</p>
            <div className="red-rule" />
            <div className="ability-grid">
              {ABILITY_KEYS.map((ability, index) => (
                <div className="ability" key={ability}>
                  <strong>{ability.toUpperCase()}</strong>
                  <span>
                    {creature.stats[index]} ({signed(abilityModifier(creature.stats[index]))})
                  </span>
                </div>
              ))}
            </div>
            <div className="red-rule" />
          </section>
          <div className="statblock-details">
            {formatList(creature.saves) ? (
              <p><strong>Saves</strong> {formatList(creature.saves)}</p>
            ) : null}
            {formatList(creature.skillsaves) ? (
              <p><strong>Skills</strong> {formatList(creature.skillsaves)}</p>
            ) : null}
            {[
              ["damage_vulnerabilities", "Vulnerabilities"],
              ["damage_resistances", "Resistances"],
              ["damage_immunities", "Immunities"],
              ["condition_immunities", "Condition Immunities"],
              ["senses", "Senses"],
              ["languages", "Languages"],
            ].map(([key, label]) =>
              creature[key] ? (
                <p key={key}>
                  <strong>{label}</strong> {stripLinkTokens(String(creature[key]))}
                </p>
              ) : null,
            )}
            <p>
              <strong>Challenge</strong> {String(creature.cr ?? "—")} (
              {xpForCr(creature.cr)} XP; PB {signed(proficiencyBonus(creature.cr))})
            </p>
          </div>
        </div>
        {(creature.traits ?? []).map((entry, index) => (
          <EntryPreview entry={entry} key={`trait-${index}`} />
        ))}
        {sections.map(([title, entries]) =>
          entries.length || (title === "Legendary Actions" && creature.legendary_description) ? (
            <Fragment key={title}>
              <h2 className="statblock-section-heading">{title}</h2>
              {title === "Legendary Actions" && creature.legendary_description ? (
                <p className="markdown">{creature.legendary_description}</p>
              ) : null}
              {entries.map((entry, index) => (
                <EntryPreview entry={entry} key={`${title}-${index}`} />
              ))}
            </Fragment>
          ) : null,
        )}
      </div>
    </article>
  );
}

function FormGroup({
  id,
  title,
  summary,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="form-group"
      id={`group-${id}`}
      open={!collapsed}
      onToggle={(event) => onToggle(!event.currentTarget.open)}
    >
      <summary>
        <span className="chevron" aria-hidden="true" />
        <strong>{title}</strong>
        <span>{summary}</span>
      </summary>
      <div className="form-group-content">{children}</div>
    </details>
  );
}

function PickListField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
  const add = (item: string) => {
    const next = item.trim();
    if (!next) return;
    if (!selected.some((current) => current.toLowerCase() === next.toLowerCase())) {
      onChange([...selected, next].join(", "));
    }
    setCustom("");
  };
  return (
    <div className="pick-field">
      <span className="field-label">{label}</span>
      {selected.length ? (
        <div className="chips">
          {selected.map((item, index) => (
            <span className="chip" key={`${item}-${index}`}>
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() =>
                  onChange(selected.filter((_, selectedIndex) => selectedIndex !== index).join(", "))
                }
              >×</button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="picker-row">
        <select value="" aria-label={`Add ${label}`} onChange={(event) => add(event.target.value)}>
          <option value="">Choose a common option…</option>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <input
          value={custom}
          placeholder={placeholder}
          aria-label={`Custom ${label}`}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(custom);
            }
          }}
        />
        <button className="button small" type="button" onClick={() => add(custom)} disabled={!custom.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function SpeedBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const add = (type: string) => {
    const text = type === "Walk" ? "30 ft." : `${type.toLowerCase()} 30 ft.`;
    onChange([...parts, text].join(", "));
  };
  return (
    <div className="builder">
      <span className="field-label">Movement speeds</span>
      {parts.map((part, index) => (
        <div className="builder-row speed-row" key={`speed-${index}`}>
          <input
            aria-label={`Movement ${index + 1}`}
            value={part}
            onChange={(event) => {
              const next = [...parts];
              next[index] = event.target.value;
              onChange(next.join(", "));
            }}
          />
          <button
            className="icon-button"
            type="button"
            aria-label={`Move ${part} up`}
            disabled={index === 0}
            onClick={() => {
              const next = [...parts];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              onChange(next.join(", "));
            }}
          >↑</button>
          <button
            className="icon-button"
            type="button"
            aria-label={`Move ${part} down`}
            disabled={index === parts.length - 1}
            onClick={() => {
              const next = [...parts];
              [next[index], next[index + 1]] = [next[index + 1], next[index]];
              onChange(next.join(", "));
            }}
          >↓</button>
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove ${part}`}
            onClick={() => onChange(parts.filter((_, item) => item !== index).join(", "))}
          >×</button>
        </div>
      ))}
      <div className="quick-buttons">
        {["Walk", "Burrow", "Climb", "Fly", "Swim", "Custom"].map((type) => (
          <button className="button small" type="button" key={type} onClick={() => add(type)}>
            + {type}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModifierRows({
  kind,
  rows,
  creature,
  onChange,
}: {
  kind: "save" | "skill";
  rows: { key: string; value: string }[];
  creature: Creature;
  onChange: (rows: { key: string; value: string }[]) => void;
}) {
  const options = kind === "save" ? ABILITIES : SKILLS.map(([name]) => name);
  const calculated = (key: string) => {
    const index =
      kind === "save"
        ? ABILITIES.indexOf(key)
        : SKILLS.find((skill) => skill[0] === key)?.[1] ?? 0;
    return signed(abilityModifier(creature.stats[index]) + proficiencyBonus(creature.cr));
  };
  return (
    <div className="builder">
      <span className="field-label">{kind === "save" ? "Saving throws" : "Skills"}</span>
      {rows.map((row, index) => (
        <div className="modifier-row" key={`${kind}-${index}`}>
          <select
            aria-label={`${kind} ${index + 1}`}
            value={row.key}
            onChange={(event) => {
              const key = event.target.value;
              const next = [...rows];
              next[index] = { key, value: calculated(key) };
              onChange(next);
            }}
          >
            {options.map((option) => <option key={option}>{option}</option>)}
          </select>
          <input
            aria-label={`${row.key} modifier`}
            value={row.value}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, value: event.target.value };
              onChange(next);
            }}
          />
          <button
            className="button small ghost"
            type="button"
            onClick={() => {
              const next = [...rows];
              next[index] = { ...row, value: calculated(row.key) };
              onChange(next);
            }}
          >Auto</button>
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove ${row.key}`}
            onClick={() => onChange(rows.filter((_, item) => item !== index))}
          >×</button>
        </div>
      ))}
      <button
        className="button small"
        type="button"
        onClick={() => {
          const available = options.find((option) => !rows.some((row) => row.key === option)) ?? options[0];
          onChange([...rows, { key: available, value: calculated(available) }]);
        }}
      >+ Add {kind}</button>
    </div>
  );
}

function RepeatableEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Entry[];
  onChange: (entries: Entry[]) => void;
}) {
  const singular = title.endsWith("s") ? title.slice(0, -1) : title;
  return (
    <div className="repeatable-editor">
      <div className="section-heading">
        <h3>{title}</h3>
        <button
          className="button small"
          type="button"
          onClick={() => onChange([...value, { name: "", desc: "" }])}
        >+ Add</button>
      </div>
      {value.length ? value.map((entry, index) => (
        <details className="entry-editor" open key={`${title}-${index}`}>
          <summary>
            <span>{entry.name || `${singular} ${index + 1}`}</span>
            <span className="subtle">#{index + 1}</span>
          </summary>
          <div className="entry-body">
            <input
              aria-label={`${singular} ${index + 1} name`}
              placeholder={`${singular} name`}
              value={entry.name}
              onChange={(event) => {
                const next = [...value];
                next[index] = { ...entry, name: event.target.value };
                onChange(next);
              }}
            />
            <textarea
              aria-label={`${singular} ${index + 1} description`}
              placeholder="Description (Markdown supported)"
              value={entry.desc}
              onChange={(event) => {
                const next = [...value];
                next[index] = { ...entry, desc: event.target.value };
                onChange(next);
              }}
            />
            <div className="entry-actions">
              <button
                className="button small ghost"
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...value];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  onChange(next);
                }}
              >Move up</button>
              <button
                className="button small ghost"
                type="button"
                disabled={index === value.length - 1}
                onClick={() => {
                  const next = [...value];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  onChange(next);
                }}
              >Move down</button>
              <button
                className="button small ghost"
                type="button"
                onClick={() => onChange([...value.slice(0, index + 1), { ...entry }, ...value.slice(index + 1)])}
              >Duplicate</button>
              <button
                className="button small danger"
                type="button"
                onClick={() => onChange(value.filter((_, item) => item !== index))}
              >Remove</button>
            </div>
          </div>
        </details>
      )) : <div className="empty-state">No {title.toLowerCase()} yet.</div>}
    </div>
  );
}

function SpellcastingEditor({
  config,
  onChange,
}: {
  config: SpellcastingConfig;
  onChange: (config: SpellcastingConfig) => void;
}) {
  const addSpell = (groupIndex: number, spell: string) => {
    const value = spell.trim();
    if (!value) return;
    const groups = config.groups.map((group, index) =>
      index === groupIndex && !group.spells.includes(value)
        ? { ...group, spells: [...group.spells, value] }
        : group,
    );
    onChange({ ...config, groups });
  };
  return (
    <div className="spellcasting-editor">
      <div className="field-grid three">
        <div className="field">
          <label htmlFor="spell-ability">Ability</label>
          <select
            id="spell-ability"
            value={config.ability}
            onChange={(event) => onChange({ ...config, ability: event.target.value })}
          >
            {ABILITIES.map((ability) => <option key={ability}>{ability}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="spell-dc">Save DC</label>
          <input
            id="spell-dc"
            value={config.saveDc}
            onChange={(event) => onChange({ ...config, saveDc: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="spell-attack">Attack bonus</label>
          <input
            id="spell-attack"
            value={config.attackBonus}
            onChange={(event) => onChange({ ...config, attackBonus: event.target.value })}
          />
        </div>
        <div className="field full">
          <label htmlFor="spell-notes">Casting notes</label>
          <input
            id="spell-notes"
            placeholder="e.g. requires no Material components"
            value={config.notes}
            onChange={(event) => onChange({ ...config, notes: event.target.value })}
          />
        </div>
      </div>
      <div className="spell-groups">
        {config.groups.map((group, groupIndex) => (
          <div className="spell-group" key={`spell-group-${groupIndex}`}>
            <div className="spell-group-head">
              <input
                aria-label={`Spell group ${groupIndex + 1} label`}
                value={group.label}
                placeholder="At will, 1/day…"
                onChange={(event) => {
                  const groups = [...config.groups];
                  groups[groupIndex] = { ...group, label: event.target.value };
                  onChange({ ...config, groups });
                }}
              />
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove ${group.label || "spell group"}`}
                onClick={() =>
                  onChange({ ...config, groups: config.groups.filter((_, index) => index !== groupIndex) })
                }
              >×</button>
            </div>
            <div className="chips">
              {group.spells.map((spell, spellIndex) => (
                <span className="chip" key={`${spell}-${spellIndex}`}>
                  {spell}
                  <button
                    type="button"
                    aria-label={`Remove ${spell}`}
                    onClick={() => {
                      const groups = [...config.groups];
                      groups[groupIndex] = {
                        ...group,
                        spells: group.spells.filter((_, index) => index !== spellIndex),
                      };
                      onChange({ ...config, groups });
                    }}
                  >×</button>
                </span>
              ))}
            </div>
            <div className="spell-picker">
              <input
                list="srd-spell-list"
                aria-label={`Add spell to ${group.label}`}
                placeholder="Choose an SRD spell or type a custom entry"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSpell(groupIndex, event.currentTarget.value);
                    event.currentTarget.value = "";
                  }
                }}
              />
              <button
                className="button small"
                type="button"
                onClick={(event) => {
                  const input = event.currentTarget.previousElementSibling as HTMLInputElement;
                  addSpell(groupIndex, input.value);
                  input.value = "";
                }}
              >Add</button>
            </div>
          </div>
        ))}
      </div>
      <datalist id="srd-spell-list">
        {SPELLS.map((spell) => <option value={spell} key={spell} />)}
      </datalist>
      <button
        className="button small"
        type="button"
        onClick={() =>
          onChange({ ...config, groups: [...config.groups, { label: "1/day", spells: [] }] })
        }
      >+ Add spell group</button>
    </div>
  );
}

export default function StatblockEditor() {
  const [records, setRecords] = useState<SavedCreature[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [creature, setCreature] = useState<Creature>(ADULT_RED_DRAGON);
  const [editor, setEditor] = useState<"form" | "yaml">("form");
  const [yamlText, setYamlText] = useState(() => toYaml(ADULT_RED_DRAGON));
  const [yamlError, setYamlError] = useState("");
  const [theme, setTheme] = useState<"parchment" | "dark">("parchment");
  const [siteTheme, setSiteTheme] = useState<"light" | "dark">("light");
  const [previewScale, setPreviewScale] = useState(100);
  const [columnMode, setColumnMode] = useState<StatblockColumnMode>(COLUMN_MODE.AUTO);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageMode, setStorageMode] = useState(STORAGE_MODE.PRIMARY);
  const [fallbackWarningHidden, setFallbackWarningHidden] = useState(false);
  const [storageRepairing, setStorageRepairing] = useState(false);
  const [storageRepairBlocked, setStorageRepairBlocked] = useState(false);
  const [storageRepairError, setStorageRepairError] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>("yaml");
  const [yamlImportText, setYamlImportText] = useState("");
  const [jsonImportText, setJsonImportText] = useState("");
  const [jsonCandidates, setJsonCandidates] = useState<FiveToolsCandidate[]>([]);
  const [jsonSelected, setJsonSelected] = useState<Set<string>>(new Set());
  const [jsonSearch, setJsonSearch] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const undoStack = useRef<Creature[]>([]);
  const redoStack = useRef<Creature[]>([]);
  const recordsRef = useRef<SavedCreature[]>([]);
  const noticeTimer = useRef<number | null>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const importModal = useRef<HTMLElement>(null);
  const yamlFileInput = useRef<HTMLInputElement>(null);
  const jsonFileInput = useRef<HTMLInputElement>(null);
  const urlAbortController = useRef<AbortController | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLElement>(null);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 1800);
  };

  const replaceRecords = (nextRecords: SavedCreature[]) => {
    recordsRef.current = nextRecords;
    setRecords(nextRecords);
  };

  const resetIndexedDatabase = async () => {
    const confirmed = window.confirm(
      `Reset IndexedDB and restore the ${recordsRef.current.length} creature${recordsRef.current.length === 1 ? "" : "s"} currently visible in your bestiary? Any inaccessible records that are not visible here could be lost.`,
    );
    if (!confirmed) return;
    setStorageRepairing(true);
    setStorageRepairBlocked(false);
    setStorageRepairError("");
    const result = await creatureStorage.resetPrimary(
      recordsRef.current,
      () => setStorageRepairBlocked(true),
    );
    setStorageMode(result.mode);
    if (result.ok) {
      setStorageRepairBlocked(false);
      showNotice("Browser storage repaired");
    } else {
      const message = result.error instanceof Error
        ? result.error.message
        : "IndexedDB could not be recreated.";
      setStorageRepairError(message);
    }
    setStorageRepairing(false);
  };

  const closeImport = useCallback(() => {
    urlAbortController.current?.abort();
    urlAbortController.current = null;
    setImportOpen(false);
    setImporting(false);
    window.setTimeout(() => importButton.current?.focus(), 0);
  }, []);

  const openImport = () => {
    setImportTab("yaml");
    setYamlImportText("");
    setJsonImportText("");
    setJsonCandidates([]);
    setJsonSelected(new Set());
    setJsonSearch("");
    setWebsiteUrl("");
    setImportError("");
    setImportOpen(true);
  };

  useEffect(() => {
    if (!importOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeImport();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(importModal.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeImport, importOpen]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      let firstCreature = structuredClone(ADULT_RED_DRAGON);
      try {
        const legacy = localStorage.getItem("statblock-studio-draft");
        if (legacy) firstCreature = cleanCreature(JSON.parse(legacy));
      } catch {
        // IndexedDB or in-memory storage can still initialize without legacy data.
      }
      const first = { id: newId(), updatedAt: Date.now(), creature: firstCreature };
      const loaded = await creatureStorage.load([first]);
      const stored = (loaded.records as SavedCreature[]).map(normalizeSavedCreatureRecord);
      stored.sort((a, b) => b.updatedAt - a.updatedAt);
      replaceRecords(stored);
      setStorageMode(loaded.mode);
      setCurrentId(stored[0].id);
      setCreature(stored[0].creature);
      setColumnMode(stored[0].columnMode ?? COLUMN_MODE.AUTO);
      setYamlText(toYaml(stored[0].creature));
      const savedCollapsed = localStorage.getItem("statblock-studio-collapsed");
      if (savedCollapsed) setCollapsed(JSON.parse(savedCollapsed));
      const savedSiteTheme = localStorage.getItem("statblock-studio-site-theme");
      if (
        savedSiteTheme === "dark" ||
        (!savedSiteTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
      ) {
        setSiteTheme("dark");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || !currentId) return;
    const timer = window.setTimeout(async () => {
      const currentRecord = recordsRef.current.find((item) => item.id === currentId);
      const record: SavedCreature = {
        id: currentId,
        updatedAt: Date.now(),
        columnMode: normalizeColumnMode(currentRecord?.columnMode),
        creature,
      };
      const nextRecords = [
        record,
        ...recordsRef.current.filter((item) => item.id !== currentId),
      ];
      replaceRecords(nextRecords);
      setStorageMode(await creatureStorage.putMany([record], nextRecords));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [creature, currentId, hydrated]);

  const commit = (next: Creature, history = true) => {
    if (history) {
      undoStack.current.push(structuredClone(creature));
      if (undoStack.current.length > 60) undoStack.current.shift();
      redoStack.current = [];
    }
    setCreature(next);
    setYamlText(toYaml(next));
    setYamlError("");
  };

  const update = <K extends keyof Creature>(key: K, value: Creature[K]) => {
    commit({ ...creature, [key]: value });
  };

  const switchCreature = (id: string) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    setCurrentId(id);
    setCreature(record.creature);
    setColumnMode(normalizeColumnMode(record.columnMode));
    setYamlText(toYaml(record.creature));
    setYamlError("");
    undoStack.current = [];
    redoStack.current = [];
  };

  const createCreatures = async (
    creatures: Creature[],
    nextColumnMode: StatblockColumnMode = COLUMN_MODE.AUTO,
  ) => {
    if (!creatures.length) return [];
    const now = Date.now();
    const nextRecords = createSavedCreatureRecords(creatures, {
      idFor: () => newId(),
      now,
      columnMode: nextColumnMode,
    }) as SavedCreature[];
    const allRecords = [...nextRecords, ...recordsRef.current];
    replaceRecords(allRecords);
    setStorageMode(await creatureStorage.putMany(nextRecords, allRecords));
    setCurrentId(nextRecords[0].id);
    setCreature(nextRecords[0].creature);
    setColumnMode(nextRecords[0].columnMode ?? COLUMN_MODE.AUTO);
    setYamlText(toYaml(nextRecords[0].creature));
    setYamlError("");
    undoStack.current = [];
    redoStack.current = [];
    return nextRecords;
  };

  const createCreature = async (
    base = BLANK_CREATURE,
    nextColumnMode: StatblockColumnMode = COLUMN_MODE.AUTO,
  ) => {
    await createCreatures([base], nextColumnMode);
    setBestiaryOpen(false);
  };

  const updateColumnMode = async (nextMode: StatblockColumnMode) => {
    const normalizedMode = normalizeColumnMode(nextMode) as StatblockColumnMode;
    setColumnMode(normalizedMode);
    const currentRecord = recordsRef.current.find((item) => item.id === currentId);
    if (!currentRecord) return;
    const updatedRecord: SavedCreature = {
      ...currentRecord,
      updatedAt: Date.now(),
      columnMode: normalizedMode,
    };
    const nextRecords = [
      updatedRecord,
      ...recordsRef.current.filter((item) => item.id !== currentId),
    ];
    replaceRecords(nextRecords);
    setStorageMode(await creatureStorage.putMany([updatedRecord], nextRecords));
  };

  const deleteCreature = async (id: string) => {
    if (records.length === 1) return;
    const record = records.find((item) => item.id === id);
    if (!window.confirm(`Delete ${record?.creature.name ?? "this creature"}?`)) return;
    const remaining = recordsRef.current.filter((item) => item.id !== id);
    replaceRecords(remaining);
    setStorageMode(await creatureStorage.delete(id, remaining));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (id === currentId) switchCreature(remaining[0].id);
  };

  const applyYaml = (source: string) => {
    setYamlText(source);
    try {
      const next = cleanCreature(parse(stripFence(source)));
      setCreature(next);
      setYamlError("");
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : "Invalid YAML");
    }
  };

  const handleImportFile = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: "yaml" | "json",
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const source = await file.text();
      if (kind === "yaml") setYamlImportText(source);
      else {
        setJsonImportText(source);
        setJsonCandidates([]);
        setJsonSelected(new Set());
      }
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read the file.");
    }
    event.target.value = "";
  };

  const importYaml = async () => {
    try {
      const next = cleanCreature(parse(stripFence(yamlImportText)));
      await createCreatures([next]);
      closeImport();
      showNotice("Creature imported");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import YAML.");
    }
  };

  const prepareJsonImport = () => {
    try {
      const candidates = parse5eToolsJson(jsonImportText);
      setJsonCandidates(candidates);
      setJsonSelected(candidates.length === 1 ? new Set([candidates[0].id]) : new Set());
      setJsonSearch("");
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not parse JSON.");
    }
  };

  const importSelectedJson = async () => {
    try {
      const creatures = convertSelectedCandidates(
        jsonCandidates,
        jsonSelected,
      ) as Creature[];
      if (!creatures.length) throw new Error("Select at least one monster to import.");
      await createCreatures(creatures);
      closeImport();
      showNotice(`Imported ${creatures.length} creature${creatures.length === 1 ? "" : "s"}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import JSON.");
    }
  };

  const importWebsiteLink = async () => {
    if (!loadFiveToolsUrlImporter) return;
    const controller = new AbortController();
    urlAbortController.current?.abort();
    urlAbortController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setImporting(true);
    setImportError("");
    try {
      const { fetchFiveToolsMonsterUrl } = await loadFiveToolsUrlImporter();
      const result = await fetchFiveToolsMonsterUrl(websiteUrl, controller.signal);
      const imported = convert5eToolsMonster(result.monster, {
        legendaryGroup: result.legendaryGroup,
      }) as Creature;
      await createCreatures([imported]);
      closeImport();
      showNotice("Creature imported");
    } catch (error) {
      if (!controller.signal.aborted) {
        setImportError(error instanceof Error ? error.message : "Could not import this website link.");
      } else if (importOpen) {
        setImportError("The external data request timed out.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (urlAbortController.current === controller) urlAbortController.current = null;
      setImporting(false);
    }
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("image", String(reader.result ?? ""));
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(structuredClone(creature));
    commit(previous, false);
    showNotice("Undone");
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(structuredClone(creature));
    commit(next, false);
    showNotice("Redone");
  };

  const renderStatblockPng = async (
    item: Creature,
    exportTheme: "parchment" | "dark",
    exportColumnMode: StatblockColumnMode,
    pixelRatio = 2,
  ) => {
    const mount = document.createElement("div");
    mount.className = "export-render";
    document.body.appendChild(mount);
    const root = createRoot(mount);
    let rootMounted = true;
    let captureMount: HTMLDivElement | null = null;
    try {
      root.render(
        <StatblockPreview
          creature={item}
          theme={exportTheme}
          columnMode={exportColumnMode}
        />,
      );
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const renderedStatblock = mount.querySelector(".statblock") as HTMLElement;
      await inlineExportImages(renderedStatblock);
      const images = Array.from(renderedStatblock.querySelectorAll("img"));
      await Promise.all(
        images.map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          });
        }),
      );

      captureMount = document.createElement("div");
      captureMount.className = "export-render";
      const statblock = renderedStatblock.cloneNode(true) as HTMLElement;
      captureMount.appendChild(statblock);
      document.body.appendChild(captureMount);
      root.unmount();
      rootMounted = false;
      mount.remove();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const flow = statblock.querySelector(".statblock-flow") as HTMLElement;
      const flowBounds = flow.getBoundingClientRect();
      const children = Array.from(flow.children) as HTMLElement[];
      const secondColumn = children.filter(
        (child) => child.getBoundingClientRect().left > flowBounds.left + flowBounds.width / 2,
      );
      if (statblock.dataset.columnLayout === COLUMN_MODE.DOUBLE && secondColumn.length) {
        const secondColumnSet = new Set(secondColumn);
        const first = document.createElement("div");
        const second = document.createElement("div");
        first.className = "statblock-export-column";
        second.className = "statblock-export-column";
        for (const child of children) {
          (secondColumnSet.has(child) ? second : first).appendChild(child);
        }
        flow.classList.add("statblock-flow-export");
        flow.append(first, second);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return await toPng(statblock, {
        cacheBust: true,
        pixelRatio,
        backgroundColor: exportTheme === "dark" ? "#2d2a24" : "#f6f0df",
        width: statblock.scrollWidth,
        height: statblock.scrollHeight,
        style: {
          margin: "0",
          maxWidth: "none",
          transform: "none",
        },
      });
    } finally {
      if (rootMounted) root.unmount();
      mount.remove();
      captureMount?.remove();
    }
  };

  const exportImage = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const dataUrl = await renderStatblockPng(creature, theme, columnMode, 2);
      download(dataUrl, `${slugify(creature.name)}.png`);
      showNotice("Image exported");
    } catch {
      showNotice("Image export failed");
    } finally {
      setExporting(false);
    }
  };

  const creaturePng = async (item: Creature, itemColumnMode: StatblockColumnMode) => {
    const dataUrl = await renderStatblockPng(item, "parchment", itemColumnMode, 1.5);
    return dataUrl.split(",")[1];
  };

  const batchExport = async () => {
    const ids = selected.size ? selected : new Set(records.map((record) => record.id));
    const chosen = records.filter((record) => ids.has(record.id));
    if (!chosen.length) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const combined: string[] = [];
      for (const record of chosen) {
        const name = slugify(record.creature.name);
        const fenced = `\`\`\`statblock\n${toYaml(record.creature)}\n\`\`\``;
        zip.file(`yaml/${name}.md`, fenced);
        combined.push(`# ${record.creature.name}\n\n${fenced}`);
        try {
          zip.file(
            `images/${name}.png`,
            await creaturePng(record.creature, normalizeColumnMode(record.columnMode)),
            { base64: true },
          );
        } catch {
          zip.file(`images/${name}-export-note.txt`, "Image export could not include this creature. Its YAML is available in the yaml folder.");
        }
      }
      zip.file("bestiary.md", combined.join("\n\n---\n\n"));
      zip.file(
        "statblock-creator-backup.json",
        JSON.stringify(chosen.map((record) => ({
          ...record,
          creature: exportableCreature(record.creature, true),
        })), null, 2),
      );
      download(await zip.generateAsync({ type: "blob" }), "statblock-creator-bestiary.zip");
    } finally {
      setExporting(false);
    }
  };

  const toggleGroup = (id: string, isCollapsed: boolean) => {
    const next = { ...collapsed, [id]: isCollapsed };
    setCollapsed(next);
    localStorage.setItem("statblock-studio-collapsed", JSON.stringify(next));
  };

  const jumpTo = (id: string) => {
    if (collapsed[id]) toggleGroup(id, false);
    window.setTimeout(() => {
      document.getElementById(`group-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const saves = saveRows(creature.saves);
  const skills = skillRows(creature.skillsaves);
  const config = creature.studio_spellcasting ?? defaultSpellcasting();
  const filteredRecords = useMemo(
    () => records
      .filter((record) => record.creature.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.creature.name.localeCompare(b.creature.name)),
    [records, search],
  );
  const filteredJsonCandidates = useMemo(() => {
    const query = jsonSearch.trim().toLowerCase();
    if (!query) return jsonCandidates;
    return jsonCandidates.filter((candidate) =>
      `${candidate.name} ${candidate.source} ${candidate.cr}`.toLowerCase().includes(query),
    );
  }, [jsonCandidates, jsonSearch]);
  const importTabs: { id: ImportTab; label: string }[] = [
    { id: "yaml", label: "YAML" },
    { id: "json", label: "5etools JSON" },
    ...(ENABLE_5ETOOLS_URL_IMPORT
      ? [{ id: "link" as const, label: "5etools Link" }]
      : []),
  ];

  const changeImportTab = (tab: ImportTab) => {
    setImportTab(tab);
    setImportError("");
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = importTabs.findIndex((tab) => tab.id === importTab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = importTabs[(current + direction + importTabs.length) % importTabs.length];
    changeImportTab(next.id);
    window.setTimeout(() => {
      document.getElementById(`import-tab-${next.id}`)?.focus();
    }, 0);
  };

  return (
    <main className={`app-shell ${siteTheme === "dark" ? "site-dark" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div className="brand-copy">
            <strong>Statblock Creator</strong>
            <span>
              {storageMode === STORAGE_MODE.MEMORY
                ? "Changes are not persistent"
                : saved ? "Saved locally" : "Autosaves locally"}
            </span>
          </div>
        </div>
        <div className="creature-switcher">
          <select
            aria-label="Current creature"
            value={currentId}
            onChange={(event) => switchCreature(event.target.value)}
          >
            {records.map((record) => (
              <option value={record.id} key={record.id}>{record.creature.name}</option>
            ))}
          </select>
          <button className="button" type="button" onClick={() => createCreature()}>New</button>
          <button className="button" type="button" onClick={() => createCreature({ ...creature, name: `${creature.name} Copy` }, columnMode)}>Duplicate</button>
          <button className="button" type="button" onClick={() => setBestiaryOpen(true)}>Bestiary</button>
        </div>
        <div className="toolbar">
          <input ref={imageInput} className="hidden-input" type="file" accept="image/*" onChange={handleImage} />
          <a
            className="icon-button source-link toolbar-separator"
            href="https://github.com/jasperkee/statblock-creator"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path
                fill="currentColor"
                d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2.1c-3.22.7-3.9-1.38-3.9-1.38-.52-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.72 0-1.27.45-2.3 1.2-3.11-.12-.29-.52-1.48.11-3.07 0 0 .98-.31 3.17 1.19a10.93 10.93 0 0 1 5.76 0c2.19-1.5 3.16-1.19 3.16-1.19.64 1.59.24 2.78.12 3.07.75.82 1.2 1.85 1.2 3.11 0 4.45-2.71 5.43-5.29 5.72.42.36.79 1.07.79 2.16v3.11c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
              />
            </svg>
          </a>
          <button ref={importButton} className="button" type="button" onClick={openImport}>Import</button>
          <button
            className="button"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`\`\`\`statblock\n${toYaml(creature)}\n\`\`\``);
                showNotice("YAML copied");
              } catch {
                showNotice("Could not copy YAML");
              }
            }}
          >Copy YAML</button>
          <button
            className="button theme-toggle"
            type="button"
            aria-label={`Switch website to ${siteTheme === "dark" ? "light" : "dark"} mode`}
            aria-pressed={siteTheme === "dark"}
            onClick={() => {
              const next = siteTheme === "dark" ? "light" : "dark";
              setSiteTheme(next);
              localStorage.setItem("statblock-studio-site-theme", next);
            }}
          >
            {siteTheme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <button className="button primary" type="button" disabled={exporting} onClick={exportImage}>
            {exporting ? "Exporting…" : "Export image"}
          </button>
        </div>
      </header>

      <div className="workspace-controls">
        <div className="control-cluster">
          <div className="segmented" aria-label="Editor view">
            <button className={`segment ${editor === "form" ? "active" : ""}`} onClick={() => setEditor("form")}>Form</button>
            <button className={`segment ${editor === "yaml" ? "active" : ""}`} onClick={() => setEditor("yaml")}>YAML</button>
          </div>
          <button className="icon-button history-button" type="button" aria-label="Undo" title="Undo" onClick={undo}>↺</button>
          <button className="icon-button history-button" type="button" aria-label="Redo" title="Redo" onClick={redo}>↻</button>
          {editor === "form" ? (
            <div className="collapse-actions">
              <button className="button small ghost" onClick={() => {
                const next = Object.fromEntries(GROUPS.map(([id]) => [id, true]));
                setCollapsed(next);
                localStorage.setItem("statblock-studio-collapsed", JSON.stringify(next));
                showNotice("All sections collapsed");
              }}>Collapse all</button>
              <button className="button small ghost" onClick={() => {
                setCollapsed({});
                localStorage.setItem("statblock-studio-collapsed", "{}");
                showNotice("All sections expanded");
              }}>Expand all</button>
            </div>
          ) : null}
        </div>
        {editor === "form" ? (
          <nav className="section-nav" aria-label="Form sections">
            {GROUPS.map(([id, label]) => <button type="button" key={id} onClick={() => jumpTo(id)}>{label}</button>)}
          </nav>
        ) : null}
      </div>

      <div className="workspace">
        <section className="editor-pane" aria-label="Creature editor">
          {editor === "yaml" ? (
            <div className="yaml-wrap">
              <h1 className="pane-title">Fantasy Statblocks YAML</h1>
              <p className="pane-intro">Valid changes update the form and preview while unknown fields are preserved.</p>
              {yamlError ? <div className="error-banner">{yamlError}</div> : null}
              <textarea className="yaml-editor" aria-label="Fantasy Statblocks YAML" spellCheck={false} value={yamlText} onChange={(event) => applyYaml(event.target.value)} />
            </div>
          ) : (
            <div className="form-stack">
              <FormGroup
                id="identity"
                title="Identity"
                summary={`${creature.name} · ${creature.size} ${creature.type}`}
                collapsed={Boolean(collapsed.identity)}
                onToggle={(value) => toggleGroup("identity", value)}
              >
                <div className="section-heading">
                  <h2>Creature identity</h2>
                  <button className="button small ghost" onClick={() => imageInput.current?.click()}>
                    {creature.image ? "Change portrait" : "+ Add portrait"}
                  </button>
                </div>
                <div className="field-grid">
                  <div className="field full">
                    <label htmlFor="name">Name</label>
                    <input id="name" value={creature.name} onChange={(event) => update("name", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="size">Size</label>
                    <select id="size" value={creature.size} onChange={(event) => update("size", event.target.value)}>
                      {["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"].map((size) => <option key={size}>{size}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="type">Type</label>
                    <input id="type" list="creature-type-options" value={creature.type} onChange={(event) => update("type", event.target.value)} />
                    <datalist id="creature-type-options">{CREATURE_TYPES.map((type) => <option value={type} key={type} />)}</datalist>
                  </div>
                  <div className="field">
                    <label htmlFor="subtype">Subtype</label>
                    <input id="subtype" value={creature.subtype ?? ""} onChange={(event) => update("subtype", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="alignment">Alignment</label>
                    <select id="alignment" value={creature.alignment} onChange={(event) => update("alignment", event.target.value)}>
                      {ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}
                    </select>
                  </div>
                </div>
              </FormGroup>

              <FormGroup
                id="core"
                title="Core statistics"
                summary={`AC ${creature.ac} · HP ${creature.hp} · CR ${creature.cr ?? "—"}`}
                collapsed={Boolean(collapsed.core)}
                onToggle={(value) => toggleGroup("core", value)}
              >
                <div className="field-grid three">
                  <div className="field"><label htmlFor="ac">Armor Class</label><input id="ac" value={String(creature.ac)} onChange={(event) => update("ac", event.target.value)} /></div>
                  <div className="field"><label htmlFor="hp">Hit Points</label><input id="hp" value={String(creature.hp)} onChange={(event) => update("hp", event.target.value)} /></div>
                  <div className="field"><label htmlFor="hit-dice">Hit Dice</label><input id="hit-dice" value={creature.hit_dice ?? ""} onChange={(event) => update("hit_dice", event.target.value)} /></div>
                </div>
                <SpeedBuilder value={creature.speed} onChange={(value) => update("speed", value)} />
                <div className="ability-grid">
                  {ABILITY_KEYS.map((ability, index) => (
                    <div className="ability-field" key={ability}>
                      <label htmlFor={`ability-${ability}`}>{ability.toUpperCase()}</label>
                      <input id={`ability-${ability}`} type="number" value={creature.stats[index]} onChange={(event) => {
                        const stats = [...creature.stats];
                        stats[index] = Number(event.target.value);
                        update("stats", stats);
                      }} />
                      <span>{signed(abilityModifier(creature.stats[index]))}</span>
                    </div>
                  ))}
                </div>
                <div className="field-grid three">
                  <div className="field"><label htmlFor="cr">Challenge Rating</label><input id="cr" value={String(creature.cr ?? "")} onChange={(event) => update("cr", event.target.value)} /></div>
                  <div className="field"><span className="field-label">XP</span><input readOnly value={xpForCr(creature.cr)} /></div>
                  <div className="field"><span className="field-label">Proficiency Bonus</span><input readOnly value={signed(proficiencyBonus(creature.cr))} /></div>
                </div>
              </FormGroup>

              <FormGroup
                id="defenses"
                title="Proficiencies & defenses"
                summary={`${saves.length} saves · ${skills.length} skills`}
                collapsed={Boolean(collapsed.defenses)}
                onToggle={(value) => toggleGroup("defenses", value)}
              >
                <ModifierRows kind="save" rows={saves} creature={creature} onChange={(rows) => update("saves", serializeSaves(rows))} />
                <ModifierRows kind="skill" rows={skills} creature={creature} onChange={(rows) => update("skillsaves", serializeSkills(rows))} />
                <div className="picker-stack">
                  <PickListField label="Vulnerabilities" value={String(creature.damage_vulnerabilities ?? "")} options={DAMAGE_TYPES} placeholder="Custom vulnerability" onChange={(value) => update("damage_vulnerabilities", value)} />
                  <PickListField label="Resistances" value={String(creature.damage_resistances ?? "")} options={DAMAGE_TYPES} placeholder="Custom resistance" onChange={(value) => update("damage_resistances", value)} />
                  <PickListField label="Immunities" value={String(creature.damage_immunities ?? "")} options={DAMAGE_TYPES} placeholder="Custom immunity" onChange={(value) => update("damage_immunities", value)} />
                  <PickListField label="Condition immunities" value={String(creature.condition_immunities ?? "")} options={CONDITIONS} placeholder="Custom condition" onChange={(value) => update("condition_immunities", value)} />
                </div>
              </FormGroup>

              <FormGroup
                id="awareness"
                title="Awareness & communication"
                summary={`${String(creature.senses ?? "No senses")} · ${String(creature.languages ?? "No languages")}`}
                collapsed={Boolean(collapsed.awareness)}
                onToggle={(value) => toggleGroup("awareness", value)}
              >
                <div className="picker-stack">
                  <PickListField label="Senses" value={String(creature.senses ?? "")} options={SENSES} placeholder="e.g. Passive Perception 16" onChange={(value) => update("senses", value)} />
                  <PickListField label="Languages" value={String(creature.languages ?? "")} options={LANGUAGES} placeholder="Custom language or telepathy" onChange={(value) => update("languages", value)} />
                </div>
              </FormGroup>

              <FormGroup
                id="features"
                title="Features & spellcasting"
                summary={`${(creature.traits ?? []).length} traits · ${config.groups.reduce((count, group) => count + group.spells.length, 0)} spells`}
                collapsed={Boolean(collapsed.features)}
                onToggle={(value) => toggleGroup("features", value)}
              >
                <RepeatableEditor title="Traits" value={creature.traits ?? []} onChange={(value) => update("traits", value)} />
                <div className="divider" />
                <div className="section-heading"><h3>Spellcasting</h3><span className="subtle">SRD 5.2.1 list + custom entries</span></div>
                <SpellcastingEditor config={config} onChange={(next) => commit(withSpellcasting(creature, next))} />
              </FormGroup>

              <FormGroup
                id="combat"
                title="Combat"
                summary={`${(creature.actions ?? []).length} actions · ${(creature.legendary_actions ?? []).length} legendary`}
                collapsed={Boolean(collapsed.combat)}
                onToggle={(value) => toggleGroup("combat", value)}
              >
                <RepeatableEditor title="Actions" value={creature.actions ?? []} onChange={(value) => update("actions", value)} />
                <RepeatableEditor title="Bonus Actions" value={creature.bonus_actions ?? []} onChange={(value) => update("bonus_actions", value)} />
                <RepeatableEditor title="Reactions" value={creature.reactions ?? []} onChange={(value) => update("reactions", value)} />
                <RepeatableEditor title="Lair Actions" value={creature.lair_actions ?? []} onChange={(value) => update("lair_actions", value)} />
                <RepeatableEditor title="Regional Effects" value={creature.regional_effects ?? []} onChange={(value) => update("regional_effects", value)} />
                <div className="field">
                  <label htmlFor="legendary-description">Legendary action introduction</label>
                  <textarea id="legendary-description" value={creature.legendary_description ?? ""} onChange={(event) => update("legendary_description", event.target.value)} />
                </div>
                <RepeatableEditor title="Legendary Actions" value={creature.legendary_actions ?? []} onChange={(value) => update("legendary_actions", value)} />
              </FormGroup>
            </div>
          )}
        </section>

        <section className="preview-pane" aria-label="Live statblock preview">
          <div className="preview-header">
            <div>
              <h2>Live preview</h2>
            </div>
            <div className="preview-tools">
              <select aria-label="Preview theme" value={theme} onChange={(event) => setTheme(event.target.value as "parchment" | "dark")}>
                <option value="parchment">Parchment</option>
                <option value="dark">Dark</option>
              </select>
              <select
                aria-label="Preview columns"
                value={columnMode}
                onChange={(event) => void updateColumnMode(event.target.value as StatblockColumnMode)}
              >
                <option value="auto">Auto</option>
                <option value="single">1 column</option>
                <option value="double">2 columns</option>
              </select>
              <select aria-label="Preview zoom" value={previewScale} onChange={(event) => setPreviewScale(Number(event.target.value))}>
                <option value="75">75%</option><option value="90">90%</option><option value="100">100%</option><option value="115">115%</option>
              </select>
            </div>
          </div>
          <div className="preview-scroll">
            <div className="preview-scale" style={{ width: `${10000 / previewScale}%`, transform: `scale(${previewScale / 100})` }}>
              <StatblockPreview
                creature={creature}
                theme={theme}
                columnMode={columnMode}
                elementRef={previewRef}
              />
            </div>
          </div>
        </section>
      </div>

      {importOpen ? (
        <div className="import-backdrop" role="presentation" onMouseDown={closeImport}>
          <section
            ref={importModal}
            className="import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="import-head">
              <div>
                <h2 id="import-dialog-title">Import creature</h2>
                <p>Choose a format, then upload a file or paste its contents.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close import" onClick={closeImport}>×</button>
            </div>
            <div className="import-tabs" role="tablist" aria-label="Import format">
              {importTabs.map((tab, index) => (
                <button
                  key={tab.id}
                  id={`import-tab-${tab.id}`}
                  className={`import-tab ${importTab === tab.id ? "active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={importTab === tab.id}
                  aria-controls={`import-panel-${tab.id}`}
                  tabIndex={importTab === tab.id ? 0 : -1}
                  disabled={importing}
                  autoFocus={index === 0}
                  onKeyDown={handleTabKeyDown}
                  onClick={() => changeImportTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div
              id={`import-panel-${importTab}`}
              className="import-body"
              role="tabpanel"
              aria-labelledby={`import-tab-${importTab}`}
            >
              {importTab === "yaml" ? (
                <>
                  <div className="import-copy">
                    <h3>Fantasy Statblocks YAML</h3>
                    <p>Upload or paste one Obsidian Fantasy Statblocks-compatible YAML object or fenced <code>statblock</code> block.</p>
                  </div>
                  <input
                    ref={yamlFileInput}
                    className="hidden-input"
                    type="file"
                    accept=".md,.txt,.yaml,.yml,text/plain,application/yaml"
                    onChange={(event) => handleImportFile(event, "yaml")}
                  />
                  <div className="import-source-row">
                    <button className="button small" type="button" onClick={() => yamlFileInput.current?.click()}>Choose YAML file</button>
                    <span>or paste and edit below</span>
                  </div>
                  <textarea
                    className="import-textarea"
                    aria-label="YAML to import"
                    placeholder={'```statblock\nname: Example Creature\n...\n```'}
                    spellCheck={false}
                    value={yamlImportText}
                    onChange={(event) => {
                      setYamlImportText(event.target.value);
                      setImportError("");
                    }}
                  />
                  <div className="import-disclaimer">
                    Only import content you own or are licensed or otherwise permitted to use.
                  </div>
                </>
              ) : null}

              {importTab === "json" ? (
                <>
                  <div className="import-copy">
                    <h3>5etools-compatible JSON</h3>
                    <p>Upload or paste monster JSON that you created or are authorized to use. Statblock Creator converts the data locally and does not provide third-party game content.</p>
                  </div>
                  <div className="import-disclaimer">
                    <strong>Disclaimer</strong>
                    Only import content you own or are licensed or otherwise permitted to use. Statblock Creator is not affiliated with or endorsed by Wizards of the Coast or 5etools.
                  </div>
                  {!jsonCandidates.length ? (
                    <>
                      <input
                        ref={jsonFileInput}
                        className="hidden-input"
                        type="file"
                        accept=".json,application/json,text/json"
                        onChange={(event) => handleImportFile(event, "json")}
                      />
                      <div className="import-source-row">
                        <button className="button small" type="button" onClick={() => jsonFileInput.current?.click()}>Choose JSON file</button>
                        <span>or paste and edit below</span>
                      </div>
                      <textarea
                        className="import-textarea"
                        aria-label="5etools-compatible JSON to import"
                        placeholder={'{\n  "monster": [\n    ...\n  ]\n}'}
                        spellCheck={false}
                        value={jsonImportText}
                        onChange={(event) => {
                          setJsonImportText(event.target.value);
                          setImportError("");
                        }}
                      />
                    </>
                  ) : (
                    <div className="candidate-panel">
                      <div className="candidate-toolbar">
                        <input
                          className="search-input"
                          type="search"
                          aria-label="Search imported monsters"
                          placeholder="Search monsters…"
                          value={jsonSearch}
                          onChange={(event) => setJsonSearch(event.target.value)}
                        />
                        <span className="candidate-count">{jsonSelected.size} of {jsonCandidates.length} selected</span>
                      </div>
                      <div className="candidate-actions">
                        <button className="button small" type="button" onClick={() => setJsonSelected((current) => setCandidatesSelected(current, jsonCandidates, true))}>Select all</button>
                        <button className="button small ghost" type="button" onClick={() => setJsonSelected((current) => setCandidatesSelected(current, jsonCandidates, false))}>Deselect all</button>
                        <button className="button small ghost" type="button" onClick={() => {
                          setJsonCandidates([]);
                          setJsonSelected(new Set());
                          setImportError("");
                        }}>Edit JSON</button>
                      </div>
                      <div className="candidate-list" aria-label="Monsters available to import">
                        {filteredJsonCandidates.length ? filteredJsonCandidates.map((candidate) => (
                          <label className="candidate-row" key={candidate.id}>
                            <input
                              type="checkbox"
                              checked={jsonSelected.has(candidate.id)}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setJsonSelected((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(candidate.id);
                                  else next.delete(candidate.id);
                                  return next;
                                });
                              }}
                            />
                            <span>{candidate.name}</span>
                            <small>{candidate.source || "Unknown source"} · CR {candidate.cr || "—"}</small>
                          </label>
                        )) : <div className="empty-state">No monsters match this search.</div>}
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              {importTab === "link" && ENABLE_5ETOOLS_URL_IMPORT ? (
                <>
                  <div className="import-copy">
                    <h3>5etools website link</h3>
                    <p>Paste a standard 5e.tools bestiary link. This self-hosted feature contacts the external 5etools GitHub mirror from your browser.</p>
                  </div>
                  <input
                    className="import-url-input"
                    type="url"
                    aria-label="5etools bestiary URL"
                    placeholder="https://5e.tools/bestiary.html#adult%20red%20dragon_xmm"
                    value={websiteUrl}
                    onChange={(event) => {
                      setWebsiteUrl(event.target.value);
                      setImportError("");
                    }}
                  />
                  <div className="import-disclaimer">
                    <strong>Disclaimer</strong>
                    Only import content you own or are licensed or otherwise permitted to use. Statblock Creator is not affiliated with or endorsed by Wizards of the Coast or 5etools.
                  </div>
                  {importing ? <div className="import-loading" role="status">Fetching and converting monster data…</div> : null}
                </>
              ) : null}

              {importError ? <div className="error-banner" role="alert">{importError}</div> : null}
              <div className="import-actions">
                <button className="button ghost" type="button" onClick={closeImport}>Cancel</button>
                {importTab === "yaml" ? (
                  <button className="button primary" type="button" disabled={!yamlImportText.trim()} onClick={importYaml}>Import YAML</button>
                ) : null}
                {importTab === "json" && !jsonCandidates.length ? (
                  <button className="button primary" type="button" disabled={!jsonImportText.trim()} onClick={prepareJsonImport}>Review monsters</button>
                ) : null}
                {importTab === "json" && jsonCandidates.length ? (
                  <button className="button primary" type="button" disabled={!jsonSelected.size} onClick={importSelectedJson}>Import {jsonSelected.size || "selected"}</button>
                ) : null}
                {importTab === "link" && ENABLE_5ETOOLS_URL_IMPORT ? (
                  <button className="button primary" type="button" disabled={importing || !websiteUrl.trim()} onClick={importWebsiteLink}>{importing ? "Importing…" : "Import from link"}</button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {bestiaryOpen ? (
        <div className="drawer-backdrop" role="presentation" onMouseDown={() => setBestiaryOpen(false)}>
          <aside className="bestiary-drawer" aria-label="Local bestiary" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div><h2>Local bestiary</h2><p>{records.length} creature{records.length === 1 ? "" : "s"} saved on this device</p></div>
              <button className="icon-button" aria-label="Close bestiary" onClick={() => setBestiaryOpen(false)}>×</button>
            </div>
            <input className="search-input" placeholder="Search creatures…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="drawer-actions">
              <button className="button small" onClick={() => createCreature()}>New creature</button>
              <button className="button small" onClick={() => setSelected(new Set(records.map((record) => record.id)))}>Select all</button>
              <button className="button small ghost" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
            <div className="creature-list">
              {filteredRecords.map((record) => (
                <div className={`creature-row ${record.id === currentId ? "current" : ""}`} key={record.id}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${record.creature.name}`}
                    checked={selected.has(record.id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(record.id);
                      else next.delete(record.id);
                      setSelected(next);
                    }}
                  />
                  <button className="creature-name" onClick={() => { switchCreature(record.id); setBestiaryOpen(false); }}>
                    <strong>{record.creature.name}</strong>
                    <span>{record.creature.size} {record.creature.type} · CR {String(record.creature.cr ?? "—")}</span>
                  </button>
                  <button className="icon-button" aria-label={`Delete ${record.creature.name}`} disabled={records.length === 1} onClick={() => deleteCreature(record.id)}>×</button>
                </div>
              ))}
            </div>
            <button className="button primary batch-button" disabled={exporting} onClick={batchExport}>
              {exporting ? "Building export…" : `Export ${selected.size || records.length} creature${(selected.size || records.length) === 1 ? "" : "s"} as ZIP`}
            </button>
            <section className="storage-recovery" aria-labelledby="storage-recovery-title">
              <div>
                <h3 id="storage-recovery-title">Storage &amp; recovery</h3>
                <p>
                  {storageMode === STORAGE_MODE.PRIMARY
                    ? "Using IndexedDB for local bestiary storage."
                    : storageMode === STORAGE_MODE.FALLBACK
                      ? "Using fallback browser storage because IndexedDB is unavailable."
                      : "Browser storage is unavailable; changes are currently held in memory."}
                </p>
              </div>
              {storageRepairBlocked ? (
                <p className="storage-recovery-note" role="status">Close other Statblock Creator tabs to continue.</p>
              ) : null}
              {storageRepairError ? (
                <p className="storage-recovery-error" role="alert">{storageRepairError}</p>
              ) : null}
              <button
                className="button danger"
                type="button"
                disabled={storageRepairing}
                onClick={resetIndexedDatabase}
              >
                {storageRepairing ? "Repairing…" : "Reset IndexedDB"}
              </button>
            </section>
          </aside>
        </div>
      ) : null}
      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-check" aria-hidden="true">✓</span>
          {notice}
        </div>
      ) : null}
      {hydrated && (
        storageMode === STORAGE_MODE.MEMORY ||
        (storageMode === STORAGE_MODE.FALLBACK && !fallbackWarningHidden)
      ) ? (
        <div
          className={`storage-warning ${storageMode === STORAGE_MODE.MEMORY ? "storage-warning-memory" : ""}`}
          role="status"
          aria-live="polite"
        >
          {storageMode === STORAGE_MODE.FALLBACK ? (
            <button
              className="storage-warning-dismiss"
              type="button"
              aria-label="Hide fallback storage warning"
              title="Hide warning until this page is reloaded"
              onClick={() => setFallbackWarningHidden(true)}
            >
              ×
            </button>
          ) : null}
          <strong>{storageMode === STORAGE_MODE.FALLBACK ? "Fallback storage active" : "Storage unavailable"}</strong>
          <span>
            {storageMode === STORAGE_MODE.FALLBACK
              ? "Your bestiary is being saved in backup browser storage until IndexedDB recovers."
              : "The editor will keep working, but changes will be lost when this page closes."}
          </span>
          {storageRepairBlocked ? (
            <span>Close other Statblock Creator tabs to continue.</span>
          ) : null}
          {storageRepairError ? <span role="alert">{storageRepairError}</span> : null}
          <button
            className="button small storage-repair-button"
            type="button"
            disabled={storageRepairing}
            onClick={resetIndexedDatabase}
          >
            {storageRepairing ? "Repairing…" : "Repair storage"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
