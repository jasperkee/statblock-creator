export type Entry = { name: string; desc: string };
export type SpellGroup = { label: string; spells: string[] };
export type SpellcastingConfig = {
  ability: string;
  saveDc: string;
  attackBonus: string;
  groups: SpellGroup[];
  notes: string;
};

export type Creature = {
  layout?: string;
  image?: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  ac: number | string;
  hp: number | string;
  hit_dice?: string;
  modifier?: number | string;
  stats: number[];
  speed: string;
  saves?: unknown;
  skillsaves?: unknown;
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  cr?: string | number;
  traits?: Entry[];
  actions?: Entry[];
  bonus_actions?: Entry[];
  reactions?: Entry[];
  lair_actions?: Entry[];
  regional_effects?: Entry[];
  legendary_description?: string;
  legendary_actions?: Entry[];
  spells?: string[];
  studio_spellcasting?: SpellcastingConfig;
  [key: string]: unknown;
};

export type SavedCreature = {
  id: string;
  updatedAt: number;
  creature: Creature;
};

export const ABILITIES = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
];

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

export const SKILLS = [
  ["Acrobatics", 1],
  ["Animal Handling", 4],
  ["Arcana", 3],
  ["Athletics", 0],
  ["Deception", 5],
  ["History", 3],
  ["Insight", 4],
  ["Intimidation", 5],
  ["Investigation", 3],
  ["Medicine", 4],
  ["Nature", 3],
  ["Perception", 4],
  ["Performance", 5],
  ["Persuasion", 5],
  ["Religion", 3],
  ["Sleight of Hand", 1],
  ["Stealth", 1],
  ["Survival", 4],
] as const;

export const CREATURE_TYPES = [
  "Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental",
  "Fey", "Fiend", "Giant", "Humanoid", "Monstrosity", "Ooze", "Plant", "Undead",
];

export const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "Neutral",
  "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned",
];

export const DAMAGE_TYPES = [
  "Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic",
  "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder",
];

export const CONDITIONS = [
  "Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled",
  "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone",
  "Restrained", "Stunned", "Unconscious",
];

export const SENSES = [
  "Blindsight 10 ft.", "Blindsight 30 ft.", "Blindsight 60 ft.",
  "Darkvision 60 ft.", "Darkvision 120 ft.", "Tremorsense 30 ft.",
  "Tremorsense 60 ft.", "Truesight 30 ft.", "Truesight 60 ft.",
  "Truesight 120 ft.",
];

export const LANGUAGES = [
  "Common", "Common Sign Language", "Draconic", "Dwarvish", "Elvish", "Giant",
  "Gnomish", "Goblin", "Halfling", "Orc", "Abyssal", "Celestial", "Deep Speech",
  "Druidic", "Infernal", "Primordial", "Sylvan", "Thieves’ Cant", "Undercommon",
];

export const SPELLS = [
  "Acid Splash", "Aid", "Alarm", "Alter Self", "Animal Friendship",
  "Animal Messenger", "Animal Shapes", "Animate Dead", "Animate Objects",
  "Antilife Shell", "Antimagic Field", "Antipathy/Sympathy", "Arcane Eye",
  "Arcane Lock", "Astral Projection", "Augury", "Aura of Life", "Awaken",
  "Bane", "Banishment", "Barkskin", "Beacon of Hope", "Befuddlement",
  "Bestow Curse", "Bigby’s Hand", "Blade Barrier", "Bless", "Blight",
  "Blindness/Deafness", "Blink", "Blur", "Burning Hands", "Call Lightning",
  "Calm Emotions", "Chain Lightning", "Charm Monster", "Charm Person",
  "Chill Touch", "Chromatic Orb", "Circle of Death", "Clairvoyance", "Clone",
  "Cloudkill", "Color Spray", "Command", "Commune", "Commune with Nature",
  "Comprehend Languages", "Compulsion", "Cone of Cold", "Confusion",
  "Conjure Animals", "Conjure Celestial", "Conjure Elemental", "Conjure Fey",
  "Conjure Minor Elementals", "Conjure Woodland Beings", "Contact Other Plane",
  "Contagion", "Contingency", "Continual Flame", "Control Water",
  "Control Weather", "Counterspell", "Create Food and Water", "Create Undead",
  "Create or Destroy Water", "Creation", "Cure Wounds", "Dancing Lights",
  "Darkness", "Darkvision", "Daylight", "Death Ward", "Delayed Blast Fireball",
  "Demiplane", "Detect Evil and Good", "Detect Magic",
  "Detect Poison and Disease", "Detect Thoughts", "Dimension Door",
  "Disguise Self", "Disintegrate", "Dispel Evil and Good", "Dispel Magic",
  "Dissonant Whispers", "Divination", "Divine Favor", "Divine Smite",
  "Divine Word", "Dominate Beast", "Dominate Monster", "Dominate Person",
  "Dragon’s Breath", "Drawmij’s Instant Summons", "Dream", "Druidcraft",
  "Earthquake", "Eldritch Blast", "Elementalism", "Enhance Ability",
  "Enlarge/Reduce", "Ensnaring Strike", "Entangle", "Enthrall", "Etherealness",
  "Evard’s Black Tentacles", "Expeditious Retreat", "Eyebite", "Fabricate",
  "Faerie Fire", "False Life", "Fear", "Feather Fall", "Find Familiar",
  "Find Steed", "Find Traps", "Find the Path", "Finger of Death", "Fire Bolt",
  "Fire Shield", "Fire Storm", "Fireball", "Flame Blade", "Flame Strike",
  "Flaming Sphere", "Flesh to Stone", "Fly", "Fog Cloud", "Forbiddance",
  "Forcecage", "Foresight", "Freedom of Movement", "Gaseous Form", "Gate",
  "Geas", "Gentle Repose", "Giant Insect", "Glibness",
  "Globe of Invulnerability", "Glyph of Warding", "Goodberry", "Grease",
  "Greater Invisibility", "Greater Restoration", "Guardian of Faith",
  "Guards and Wards", "Guidance", "Guiding Bolt", "Gust of Wind", "Hallow",
  "Hallucinatory Terrain", "Harm", "Haste", "Heal", "Healing Word",
  "Heat Metal", "Hellish Rebuke", "Heroes’ Feast", "Heroism", "Hex",
  "Hold Monster", "Hold Person", "Holy Aura", "Hunter’s Mark",
  "Hypnotic Pattern", "Ice Knife", "Ice Storm", "Identify", "Illusory Script",
  "Imprisonment", "Incendiary Cloud", "Inflict Wounds", "Insect Plague",
  "Invisibility", "Jump", "Knock", "Legend Lore", "Leomund’s Secret Chest",
  "Leomund’s Tiny Hut", "Lesser Restoration", "Levitate", "Light",
  "Lightning Bolt", "Locate Animals or Plants", "Locate Creature",
  "Locate Object", "Longstrider", "Mage Armor", "Mage Hand", "Magic Circle",
  "Magic Jar", "Magic Missile", "Magic Mouth", "Magic Weapon", "Major Image",
  "Mass Cure Wounds", "Mass Heal", "Mass Healing Word", "Mass Suggestion",
  "Maze", "Meld into Stone", "Melf’s Acid Arrow", "Mending", "Message",
  "Meteor Swarm", "Mind Blank", "Mind Spike", "Minor Illusion",
  "Mirage Arcane", "Mirror Image", "Mislead", "Misty Step", "Modify Memory",
  "Moonbeam", "Mordenkainen’s Faithful Hound",
  "Mordenkainen’s Magnificent Mansion", "Mordenkainen’s Private Sanctum",
  "Mordenkainen’s Sword", "Move Earth", "Nondetection", "Nystul’s Magic Aura",
  "Otiluke’s Freezing Sphere", "Otiluke’s Resilient Sphere",
  "Otto’s Irresistible Dance", "Pass without Trace", "Passwall",
  "Phantasmal Force", "Phantasmal Killer", "Phantom Steed", "Planar Ally",
  "Planar Binding", "Plane Shift", "Plant Growth", "Poison Spray", "Polymorph",
  "Power Word Heal", "Power Word Kill", "Power Word Stun", "Prayer of Healing",
  "Prestidigitation", "Prismatic Spray", "Prismatic Wall", "Produce Flame",
  "Programmed Illusion", "Project Image", "Protection from Energy",
  "Protection from Evil and Good", "Protection from Poison",
  "Purify Food and Drink", "Raise Dead", "Rary’s Telepathic Bond",
  "Ray of Enfeeblement", "Ray of Frost", "Ray of Sickness", "Regenerate",
  "Reincarnate", "Remove Curse", "Resistance", "Resurrection",
  "Reverse Gravity", "Revivify", "Rope Trick", "Sacred Flame", "Sanctuary",
  "Scorching Ray", "Scrying", "Searing Smite", "See Invisibility", "Seeming",
  "Sending", "Sequester", "Shapechange", "Shatter", "Shield", "Shield of Faith",
  "Shillelagh", "Shining Smite", "Shocking Grasp", "Silence", "Silent Image",
  "Simulacrum", "Sleep", "Sleet Storm", "Slow", "Sorcerous Burst",
  "Spare the Dying", "Speak with Animals", "Speak with Dead",
  "Speak with Plants", "Spider Climb", "Spike Growth", "Spirit Guardians",
  "Spiritual Weapon", "Starry Wisp", "Stinking Cloud", "Stone Shape",
  "Stoneskin", "Storm of Vengeance", "Suggestion", "Summon Dragon", "Sunbeam",
  "Sunburst", "Symbol", "Tasha’s Hideous Laughter", "Telekinesis", "Teleport",
  "Teleportation Circle", "Tenser’s Floating Disk", "Thaumaturgy",
  "Thunderwave", "Time Stop", "Tongues", "Transport via Plants", "Tree Stride",
  "True Polymorph", "True Resurrection", "True Seeing", "True Strike",
  "Tsunami", "Unseen Servant", "Vampiric Touch", "Vicious Mockery",
  "Vitriolic Sphere", "Wall of Fire", "Wall of Force", "Wall of Ice",
  "Wall of Stone", "Wall of Thorns", "Warding Bond", "Water Breathing",
  "Water Walk", "Web", "Weird", "Wind Walk", "Wind Wall", "Wish",
  "Word of Recall", "Zone of Truth",
];

export const ADULT_RED_DRAGON: Creature = {
  layout: "Basic 5e Layout",
  name: "Adult Red Dragon (XMM)",
  size: "Huge",
  type: "Dragon",
  subtype: "Chromatic",
  alignment: "Chaotic Evil",
  ac: 19,
  hp: 256,
  hit_dice: "19d12 + 133",
  modifier: 12,
  stats: [27, 10, 25, 16, 13, 23],
  speed: "40 ft., climb 40 ft., fly 80 ft.",
  saves: [{ dexterity: 6 }, { wisdom: 7 }],
  skillsaves: [
    { name: "Perception", desc: "+13" },
    { name: "Stealth", desc: "+6" },
  ],
  damage_immunities: "Fire",
  senses: "Blindsight 60 ft., Darkvision 120 ft., Passive Perception 23",
  languages: "Common, Draconic",
  cr: "17",
  traits: [{
    name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
    desc: "If the dragon fails a saving throw, it can choose to succeed instead.",
  }],
  actions: [
    {
      name: "Multiattack",
      desc: "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting to cast Scorching Ray.",
    },
    {
      name: "Rend",
      desc: "*Melee Attack Roll:* +14, reach 10 ft. *Hit:* 13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage.",
    },
    {
      name: "Fire Breath (Recharge 5-6)",
      desc: "*Dexterity Saving Throw:* DC 21, each creature in a 60-foot Cone. *Failure:* 59 (17d6) Fire damage. *Success:* Half damage.",
    },
    {
      name: "Spellcasting",
      desc: "The dragon casts one of the following spells, requiring no Material components and using Charisma as the spellcasting ability (spell save DC 20, +12 to hit with spell attacks):\n\n**At will:** Command (level 2 version), Detect Magic, Scorching Ray\n\n**1/day:** Fireball",
    },
  ],
  regional_effects: [{
    name: "",
    desc: "The region containing an adult or ancient red dragon's lair is warped by its presence.\n\n- **Burning Heat.** The area within 1 mile of the lair is an area of extreme heat. A burning creature or object takes an additional 1d4 Fire damage at the start of each of its turns.\n- **Smoldering Haze.** The area within 1 mile of the lair is Lightly Obscured with clouds of ash.",
  }],
  legendary_description:
    "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature's turn, the dragon can expend a use to take one of the following actions. The dragon regains all expended uses at the start of each of its turns.",
  legendary_actions: [
    {
      name: "Commanding Presence",
      desc: "The dragon uses Spellcasting to cast Command (level 2 version). The dragon can't take this action again until the start of its next turn.",
    },
    {
      name: "Fiery Rays",
      desc: "The dragon uses Spellcasting to cast Scorching Ray. The dragon can't take this action again until the start of its next turn.",
    },
    {
      name: "Pounce",
      desc: "The dragon moves up to half its Speed, and it makes one Rend attack.",
    },
  ],
  image:
    "https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/bestiary/tokens/XMM/Adult%20Red%20Dragon.webp",
  studio_spellcasting: {
    ability: "Charisma",
    saveDc: "20",
    attackBonus: "+12",
    notes: "requires no Material components",
    groups: [
      { label: "At will", spells: ["Command (level 2 version)", "Detect Magic", "Scorching Ray"] },
      { label: "1/day", spells: ["Fireball"] },
    ],
  },
};

export const BLANK_CREATURE: Creature = {
  layout: "Basic 5e Layout",
  name: "New Creature",
  size: "Medium",
  type: "Humanoid",
  subtype: "",
  alignment: "Unaligned",
  ac: 10,
  hp: 1,
  hit_dice: "1d8",
  stats: [10, 10, 10, 10, 10, 10],
  speed: "30 ft.",
  cr: "0",
  traits: [],
  actions: [],
  bonus_actions: [],
  reactions: [],
  lair_actions: [],
  regional_effects: [],
  legendary_actions: [],
};
