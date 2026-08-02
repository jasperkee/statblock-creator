import assert from "node:assert/strict";
import test from "node:test";
import {
  convert5eToolsMonster,
  convertSelectedCandidates,
  firstSelectedCandidate,
  parse5eToolsJson,
  selectedCandidateIds,
  setCandidatesSelected,
} from "../app/fivetools-import.js";

const goblin = {
  name: "Goblin", source: "MM", cr: "1/4", size: "S", type: "humanoid", alignment: ["N", "E"],
  ac: [{ ac: 15, from: ["{@item leather armor|phb}"] }], hp: { average: 7, formula: "2d6" },
  speed: { walk: 30 }, str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
  save: { dex: "+4" }, skill: { stealth: "+6" }, resist: ["fire"], conditionImmune: ["{@condition poisoned}"],
  senses: ["darkvision 60 ft."], languages: ["Common", "Goblin"],
  trait: [{ name: "Nimble Escape", entries: ["The goblin can take the {@action Disengage} action."] }],
  action: [{ name: "Scimitar", entries: ["{@atk mw} {@hit +4} to hit. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }],
  bonus: [{ name: "Quick", entries: ["Moves."] }], reaction: [{ name: "Parry", entries: ["Blocks."] }],
  legendary: [{ name: "Command", entries: ["Commands."] }], regional: [{ name: "Mist", entries: ["Mists rise."] }],
};

test("parses arrays, wrappers, and direct 5etools monster objects with stable candidate metadata", () => {
  const fromArray = parse5eToolsJson(JSON.stringify([goblin, { ...goblin, name: "Hobgoblin", cr: "1/2" }]));
  assert.deepEqual(fromArray.map(({ id, name, source, cr }) => ({ id, name, source, cr })), [
    { id: "mm-goblin-0", name: "Goblin", source: "MM", cr: "1/4" },
    { id: "mm-hobgoblin-1", name: "Hobgoblin", source: "MM", cr: "1/2" },
  ]);
  assert.equal(parse5eToolsJson(JSON.stringify({ monster: [goblin] }))[0].name, "Goblin");
  assert.equal(parse5eToolsJson(JSON.stringify(goblin))[0].id, "mm-goblin-0");
});

test("selection helpers select and deselect the complete supplied set without filter loss", () => {
  const candidates = parse5eToolsJson(JSON.stringify([goblin, { ...goblin, name: "Hobgoblin" }]));
  const all = setCandidatesSelected(new Set(), candidates, true);
  assert.deepEqual([...all], candidates.map((candidate) => candidate.id));
  assert.deepEqual(selectedCandidateIds(candidates, all, "goblin"), candidates.map((candidate) => candidate.id));
  assert.deepEqual([...setCandidatesSelected(all, candidates, false)], []);
});

test("converts selected candidates in input order and exposes first-selected metadata", () => {
  const candidates = parse5eToolsJson(JSON.stringify([goblin, { ...goblin, name: "Hobgoblin" }]));
  const selected = new Set([candidates[1].id]);
  assert.equal(firstSelectedCandidate(candidates, selected)?.name, "Hobgoblin");
  assert.deepEqual(convertSelectedCandidates(candidates, selected).map((creature) => creature.name), ["Hobgoblin"]);
});

test("converts core stats, sections, defenses, spellcasting, and inline tags", () => {
  const creature = convert5eToolsMonster({ ...goblin, cr: { cr: "1/4" }, passive: 12, spellcasting: [{ name: "Innate Spellcasting", ability: ["cha"], dc: 13, will: ["{@spell fire bolt|phb}"], daily: { "1e": ["{@spell fireball|phb}"] }, displayAs: "action" }] });
  assert.equal(creature.ac, "15 (leather armor)");
  assert.equal(creature.hit_dice, "2d6");
  assert.equal(creature.size, "Small");
  assert.equal(creature.alignment, "Neutral Evil");
  assert.equal(creature.cr, "1/4");
  assert.match(creature.senses, /Passive Perception 12/);
  assert.deepEqual(creature.stats, [8, 14, 10, 10, 8, 8]);
  assert.equal(creature.actions[0].desc, "*Melee Attack Roll:* +4 to hit. *Hit:* 5 (1d6 + 2) slashing damage.");
  assert.equal(creature.actions[1].name, "Innate Spellcasting");
  assert.equal(creature.bonus_actions[0].name, "Quick");
  assert.equal(creature.reactions[0].name, "Parry");
  assert.equal(creature.legendary_actions[0].name, "Command");
  assert.equal(creature.regional_effects[0].name, "Mist");
  assert.deepEqual(creature.studio_spellcasting.groups, [{ label: "At will", spells: ["fire bolt"] }, { label: "1/day each", spells: ["fireball"] }]);
});

test("renders modern 5etools attack, save, recharge, and nested-list markup", () => {
  const creature = convert5eToolsMonster({
    ...goblin,
    action: [{
      name: "Fire Breath {@recharge 5}",
      entries: [
        "{@actSave dex} {@dc 13}, each creature in a cone. {@actSaveFail} 7 ({@damage 2d6}) Fire damage. {@actSaveSuccess} Half damage.",
        { type: "list", items: [{ name: "Smoke", entry: "The area is {@condition heavily obscured}." }] },
      ],
    }],
  });
  assert.equal(creature.actions[0].name, "Fire Breath (Recharge 5–6)");
  assert.match(creature.actions[0].desc, /\*Dexterity Saving Throw:\* DC 13/);
  assert.match(creature.actions[0].desc, /- \*\*Smoke\.\*\* The area is heavily obscured\./);
});

test("preserves structured defenses and supplemental lair and regional sections", () => {
  const creature = convert5eToolsMonster({
    ...goblin,
    regional: undefined,
    resist: [{ special: "Bludgeoning, Piercing, and Slashing from nonmagical attacks" }],
  }, {
    legendaryGroup: {
      lairActions: [
        "On initiative count 20, the creature uses one lair action:",
        { type: "list", items: ["Smoke fills the room."] },
      ],
      regionalEffects: ["The surrounding region is changed by the creature."],
    },
  });
  assert.equal(creature.damage_resistances, "Bludgeoning, Piercing, and Slashing from nonmagical attacks");
  assert.equal(creature.lair_actions[0].desc, "On initiative count 20, the creature uses one lair action:");
  assert.match(creature.lair_actions[1].desc, /Smoke fills the room/);
  assert.equal(creature.regional_effects[0].desc, "The surrounding region is changed by the creature.");
});

test("reports invalid JSON and unsupported _copy monsters explicitly", () => {
  assert.throws(() => parse5eToolsJson("not json"), /Invalid 5etools JSON/);
  assert.throws(() => convert5eToolsMonster({ name: "Copied Goblin", _copy: { name: "Goblin" } }), /_copy entries require/);
});
