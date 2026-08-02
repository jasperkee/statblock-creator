/**
 * Pure helpers for importing 5etools monster JSON.  This module intentionally
 * has no React, IndexedDB, or browser dependencies so the picker logic can be
 * tested directly with node:test.
 */

const ABILITY_NAMES = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ALIGNMENT_NAMES = {
  l: "Lawful", n: "Neutral", c: "Chaotic", g: "Good", e: "Evil", u: "Unaligned", a: "Any",
};

const SIZE_NAMES = {
  T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan",
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function text(value) {
  return value == null ? "" : String(value);
}

function title(value) {
  return text(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function alignment(value) {
  const values = list(value);
  if (values.length === 1 && typeof values[0] === "string" && /^[lcngeua]+$/i.test(values[0])) {
    return values[0].split("").map((part) => ALIGNMENT_NAMES[part.toLowerCase()] ?? part).join(" ");
  }
  return values.map((item) => ALIGNMENT_NAMES[text(item).toLowerCase()] ?? title(item)).join(" ") || "Unaligned";
}

/** Convert the compact inline-markup used in 5etools descriptions to readable text. */
export function convert5eToolsTags(value) {
  return text(value)
    .replace(/\{@(?:b|bold) ([^}|]+)(?:\|[^}]*)?\}/gi, "**$1**")
    .replace(/\{@(?:i|italic) ([^}|]+)(?:\|[^}]*)?\}/gi, "*$1*")
    .replace(/\{@actSave ([a-z]+)\}/gi, (_, ability) => `*${ABILITY_NAMES[ability.toLowerCase()] ?? title(ability)} Saving Throw:*`)
    .replace(/\{@actSaveFail\}/gi, "*Failure:*")
    .replace(/\{@actSaveSuccess\}/gi, "*Success:*")
    .replace(/\{@actSaveSuccessOrFail\}/gi, "*Failure or Success:*")
    .replace(/\{@hom\}/gi, "*Hit or Miss:* ")
    .replace(/\{@h\}/gi, "*Hit:* ")
    .replace(/\{@(?:atkr|atk) ([^}]+)\}/gi, (_, rawKind) => {
      const kind = rawKind.toLowerCase();
      if (kind.includes(",") || (kind.includes("m") && kind.includes("r"))) return "*Melee or Ranged Attack Roll:*";
      if (kind.includes("m")) return kind.includes("s") ? "*Melee Spell Attack:*" : "*Melee Attack Roll:*";
      if (kind.includes("r")) return kind.includes("s") ? "*Ranged Spell Attack:*" : "*Ranged Attack Roll:*";
      return "*Attack Roll:*";
    })
    .replace(/\{@hit ([^}]+)\}/gi, (_, bonus) => String(bonus).trim().startsWith("-") || String(bonus).trim().startsWith("+") ? String(bonus).trim() : `+${String(bonus).trim()}`)
    .replace(/\{@dc ([^}]+)\}/gi, "DC $1")
    .replace(/\{@recharge(?: ([^}]+))?\}/gi, (_, start) => start ? `(Recharge ${start}–6)` : "(Recharge 6)")
    .replace(/\{@(?:damage|dice|scaledice|d20|chance) ([^}|]+)(?:\|[^}]*)?\}/gi, "$1")
    .replace(/\{@(?:spell|item|creature|condition|sense|skill|action|status|variantrule|quickref|book|class|race|filter|link|adventure|background|deity|disease|hazard|object|vehicle|feat|citation) ([^}|]+)(?:\|[^}]*)?\}/gi, "$1")
    .replace(/\{@[^ }]+ ([^}|]+)(?:\|[^}]*)?\}/gi, "$1")
    .replace(/\{@[^}]+\}/g, "")
    .replace(/\{@([a-z]+)\}/gi, "$1");
}

function renderEntry(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return convert5eToolsTags(value);
  if (Array.isArray(value)) return value.map(renderEntry).filter(Boolean).join("\n\n");
  const item = object(value);
  if (Array.isArray(item.items)) {
    return item.items.map((listItem) => {
      const listObject = object(listItem);
      const body = renderEntry(listObject.entry ?? listObject.entries ?? listItem);
      const name = convert5eToolsTags(listObject.name);
      return `- ${name ? `**${name.replace(/\.$/, "")}.** ` : ""}${body}`.trimEnd();
    }).join("\n");
  }
  if (Array.isArray(item.rows)) {
    return item.rows.map((row) => list(row).map(renderEntry).join(" | ")).join("\n");
  }
  return renderEntry(item.entry ?? item.entries ?? item.text ?? item.note);
}

function entries(value) {
  return list(value).flatMap((entry) => {
    if (typeof entry === "string") return [{ name: "", desc: convert5eToolsTags(entry) }];
    const item = object(entry);
    const description = renderEntry(item.entries ?? item.entry ?? item.items ?? item.desc);
    return [{ name: convert5eToolsTags(item.name), desc: description }];
  });
}

function defense(value) {
  return list(value).map((item) => {
    if (typeof item === "string") return convert5eToolsTags(item);
    const itemObject = object(item);
    const special = renderEntry(itemObject.special);
    if (special) return special;
    const types = defense(itemObject.resist ?? itemObject.immune ?? itemObject.vulnerable);
    const prefix = convert5eToolsTags(itemObject.preNote);
    const note = convert5eToolsTags(itemObject.note);
    return [prefix, types, note].filter(Boolean).join(" ");
  }).filter(Boolean).join(", ");
}

function speed(value) {
  if (typeof value === "string") return convert5eToolsTags(value);
  return Object.entries(object(value)).filter(([kind]) => ["walk", "burrow", "climb", "fly", "swim"].includes(kind)).map(([kind, amount]) => {
    const detail = typeof amount === "object" ? object(amount).number ?? object(amount).amount ?? "" : amount;
    return kind === "walk" ? `${detail} ft.` : `${kind} ${detail} ft.`;
  }).filter(Boolean).join(", ");
}

function armorClass(value) {
  const first = list(value)[0];
  if (typeof first === "number" || typeof first === "string") return first;
  const item = object(first);
  const base = item.ac ?? 10;
  const from = list(item.from).map(convert5eToolsTags).join(", ");
  return from ? `${base} (${from})` : base;
}

function spellGroups(spellcasting) {
  const groups = [];
  const add = (label, spells) => {
    const names = list(spells).map((spell) => convert5eToolsTags(typeof spell === "string" ? spell : object(spell).name)).filter(Boolean);
    if (names.length) groups.push({ label, spells: names });
  };
  add("At will", spellcasting.will);
  for (const [frequency, spells] of Object.entries(object(spellcasting.daily))) {
    add(`${frequency.replace(/e$/, "")}/day${frequency.endsWith("e") ? " each" : ""}`, spells);
  }
  for (const [frequency, spells] of Object.entries(object(spellcasting.rest))) {
    add(`${frequency.replace(/e$/, "")}/rest${frequency.endsWith("e") ? " each" : ""}`, spells);
  }
  for (const [level, data] of Object.entries(object(spellcasting.spells))) {
    const item = object(data);
    add(`${level}${item.slots ? ` (${item.slots} slots)` : ""}`, item.spells ?? data);
  }
  return groups;
}

function spellcastingEntries(raw) {
  return list(raw.spellcasting).flatMap((item) => {
    const spellcasting = object(item);
    const ability = ABILITY_NAMES[text(list(spellcasting.ability)[0]).toLowerCase()] ?? "Charisma";
    const header = list(spellcasting.headerEntries).map(renderEntry).join("\n");
    const saveDc = text(spellcasting.dc || header.match(/(?:spell save )?DC\s*(\d+)/i)?.[1]);
    const attackBonus = text(spellcasting.attackBonus || header.match(/([+-]\d+)\s+to hit with spell attacks/i)?.[1]);
    const groups = spellGroups(spellcasting);
    const lines = groups.map((group) => `**${group.label}:** ${group.spells.join(", ")}`);
    const desc = [header || `The creature uses ${ability} as its spellcasting ability${saveDc ? ` (spell save DC ${saveDc})` : ""}${attackBonus ? ` (${attackBonus} to hit with spell attacks)` : ""}.`, ...lines].filter(Boolean).join("\n\n");
    return [{
      name: convert5eToolsTags(spellcasting.name || "Spellcasting"),
      desc,
      displayAs: text(spellcasting.displayAs || "trait").toLowerCase(),
      config: {
        ability,
        saveDc,
        attackBonus,
        groups,
        notes: /no Material components/i.test(header) ? "requires no Material components" : "",
      },
    }];
  });
}

function stableId(monster, index) {
  const key = `${text(monster.source)}-${text(monster.name)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "monster";
  return `${key}-${index}`;
}

/** Parse direct monster objects, arrays, or 5etools' {monster: [...]} document shape. */
export function parse5eToolsJson(source) {
  let parsed;
  try {
    parsed = typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    throw new Error("Invalid 5etools JSON.");
  }
  const monsters = Array.isArray(parsed) ? parsed : Array.isArray(object(parsed).monster) ? parsed.monster : object(parsed).name ? [parsed] : [];
  if (!monsters.length || monsters.some((monster) => !object(monster).name)) throw new Error("No 5etools monsters were found in this JSON.");
  return monsters.map((raw, index) => {
    const monster = object(raw);
    return {
      id: stableId(monster, index),
      name: text(monster.name),
      source: text(monster.source),
      cr: text(object(monster.cr).cr ?? monster.cr),
      raw: monster,
    };
  });
}

/** Convert one complete (non-_copy) 5etools monster into Statblock Studio's Creature shape. */
export function convert5eToolsMonster(raw, options = {}) {
  const monster = object(raw);
  if (monster._copy) throw new Error(`Cannot import ${text(monster.name) || "this monster"}: 5etools _copy entries require their source data.`);
  if (!monster.name) throw new Error("A 5etools monster must have a name.");
  const spellEntries = spellcastingEntries(monster);
  const ordinaryTraits = entries(monster.trait);
  // 5etools often keeps lair/regional text in a separately fetched legendary
  // group. The caller may provide that record without mutating the raw monster.
  const legendaryGroup = object(options.legendaryGroup ?? monster.legendaryGroup);
  const regionalEffects = monster.regional ?? legendaryGroup.regionalEffects ?? legendaryGroup.regional;
  const cr = object(monster.cr).cr ?? monster.cr;
  const senses = list(monster.senses).map(convert5eToolsTags);
  if (monster.passive != null) senses.push(`Passive Perception ${monster.passive}`);
  const traitSpellcasting = spellEntries.filter((entry) => entry.displayAs === "trait");
  const actionSpellcasting = spellEntries.filter((entry) => entry.displayAs === "action");
  const bonusSpellcasting = spellEntries.filter((entry) => entry.displayAs === "bonus");
  const reactionSpellcasting = spellEntries.filter((entry) => entry.displayAs === "reaction");
  const asEntries = (items) => items.map(({ name, desc }) => ({ name, desc }));
  return {
    layout: "Basic 5e Layout",
    name: text(monster.name),
    size: SIZE_NAMES[text(list(monster.size)[0]).toUpperCase()] ?? title(list(monster.size)[0] || "Medium"),
    type: typeof monster.type === "string" ? title(monster.type) : title(object(monster.type).type || "Humanoid"),
    subtype: typeof monster.type === "object" ? convert5eToolsTags(object(monster.type).tags?.join(", ") || "") : "",
    alignment: alignment(monster.alignment),
    ac: armorClass(monster.ac),
    hp: object(monster.hp).average ?? monster.hp ?? 1,
    hit_dice: text(object(monster.hp).formula),
    stats: ["str", "dex", "con", "int", "wis", "cha"].map((ability) => Number(monster[ability]) || 10),
    speed: speed(monster.speed) || "30 ft.",
    saves: Object.entries(object(monster.save)).map(([ability, value]) => ({ [ABILITY_NAMES[ability] ?? title(ability)]: Number(value) || Number.parseInt(text(value), 10) || 0 })),
    skillsaves: Object.entries(object(monster.skill)).map(([name, value]) => ({ name: title(name), desc: text(value) })),
    damage_vulnerabilities: defense(monster.vulnerable),
    damage_resistances: defense(monster.resist),
    damage_immunities: defense(monster.immune),
    condition_immunities: defense(monster.conditionImmune),
    senses: senses.join(", "),
    languages: list(monster.languages).map(convert5eToolsTags).join(", "),
    cr: text(cr),
    source: text(monster.source),
    traits: [...ordinaryTraits, ...asEntries(traitSpellcasting)],
    actions: [...entries(monster.action), ...asEntries(actionSpellcasting)],
    bonus_actions: [...entries(monster.bonus), ...asEntries(bonusSpellcasting)],
    reactions: [...entries(monster.reaction), ...asEntries(reactionSpellcasting)],
    regional_effects: entries(regionalEffects),
    lair_actions: entries(monster.lairAction ?? legendaryGroup.lairActions),
    legendary_description: list(monster.legendaryHeader).map(renderEntry).join("\n"),
    legendary_actions: entries(monster.legendary),
    studio_spellcasting: spellEntries[0]?.config,
    ...options.overrides,
  };
}

export function selectedCandidateIds(candidates, selectedIds, query = "") {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const needle = text(query).trim().toLowerCase();
  return candidates.filter((candidate) => !needle || `${candidate.name} ${candidate.source} ${candidate.cr}`.toLowerCase().includes(needle)).map((candidate) => candidate.id).filter((id) => selected.has(id));
}

export function setCandidatesSelected(selectedIds, candidates, shouldSelect) {
  const next = new Set(selectedIds);
  for (const candidate of candidates) {
    if (shouldSelect) next.add(candidate.id);
    else next.delete(candidate.id);
  }
  return next;
}

export function convertSelectedCandidates(candidates, selectedIds, options) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return candidates.filter((candidate) => selected.has(candidate.id)).map((candidate) => convert5eToolsMonster(candidate.raw, options));
}

export function firstSelectedCandidate(candidates, selectedIds) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return candidates.find((candidate) => selected.has(candidate.id));
}
