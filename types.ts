// --- ENUMS ---
export enum Ability { STR = 'STR', DEX = 'DEX', CON = 'CON', INT = 'INT', WIS = 'WIS', CHA = 'CHA' }

import type { BonusField } from './constants';
export type { BonusField };
export enum ProficiencyLevel { None, Proficient, Expert }
export enum Rarity { Common, Uncommon, Rare, VeryRare, Legendary, Artifact }
export enum Currency { CP = 'CP', SP = 'SP', EP = 'EP', GP = 'GP', PP = 'PP' }
export enum CharacterSize { Tiny, Small, Medium, Large, Huge, Gargantuan }
export enum RecoveryType { ShortRest, LongRest, ShortOrLongRest, Other, Dawn }
export enum AttackType { Melee, Ranged, Spell }
export enum DamageType { Slashing = 'Slashing', Piercing = 'Piercing', Bludgeoning = 'Bludgeoning', Poison = 'Poison', Acid = 'Acid', Fire = 'Fire', Cold = 'Cold', Radiant = 'Radiant', Necrotic = 'Necrotic', Lightning = 'Lightning', Thunder = 'Thunder', Force = 'Force', Psychic = 'Psychic' }
export enum MagicSchool { Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation }
export enum HitDie { d6 = 6, d8 = 8, d10 = 10, d12 = 12 }
export enum RollType { Normal, Advantage, Disadvantage }

// --- INTERFACES & CORE TYPES ---
export interface Skill {
  name: string;
  ability: Ability;
  proficiency: ProficiencyLevel;
}

export interface ItemBonuses {
  ac?: number;
  initiative?: number;
  abilityScores?: Partial<Record<Ability, number>>;
  skills?: Record<string, number>;
  attackHit?: number;
  speed?: number;
  longJump?: number;
  highJump?: number;
  passivePerception?: number;
  passiveInvestigation?: number;
  passiveInsight?: number;
  savingThrows?: Partial<Record<Ability, number>>;
  spellSaveDC?: number;
  carryCapacity?: number;
  maxHp?: number;
  proficiencyBonus?: number;
  attunementMax?: number;
}

export type EquipSlot = 'head' | 'amulet' | 'torso' | 'cloak' | 'hands' | 'feet' | 'ring1' | 'ring2' | 'mainHand' | 'offHand' | 'other';

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  imageUrl: string;
  weight: number;
  cost: { amount: number; currency: Currency };
  rarity: Rarity;
  isChest?: boolean;
  chestInventory?: (InventoryItem | null)[];
  isConsumable?: boolean;
  hasCharges?: boolean;
  totalCharges?: number;
  currentCharges?: number;
  chargeRecovery?: RecoveryType;
  isEquipped?: boolean;
  requiresAttunement?: boolean;
  isAttuned?: boolean;
  attunementTimestamp?: number;
  equippedSlot?: EquipSlot;
  equippedX?: number;
  equippedY?: number;
  attunementOrder?: number;
  chargesOrder?: number;
  bonuses?: ItemBonuses;
}

export interface DropLocation {
  container: 'inventory' | 'attunement' | 'chest' | 'doll';
  index: number;
  chestId?: string;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  totalUses: number;
  currentUses: number;
  recovery: RecoveryType;
}

export interface FeatureGroup {
  id: string;
  name: string;
  isCollapsed?: boolean;
  featureIds: string[];
}

export interface NoteGroup {
  id: string;
  name: string;
  isCollapsed?: boolean;
  noteIds: string[];
}

export interface Attack {
  id: string;
  name: string;
  imageUrl: string;
  attackType: AttackType;
  rangeNormal: number;
  rangeLong: number | null;
  hitAbility: Ability;
  damageAbility: Ability | 'None';
  isProficient: boolean;
  hitBonus: number;
  damageDice: string;
  damageBonus: number;
  damageType: DamageType;
  notes: string;
}

export interface Spell {
  id: string;
  name: string;
  description: string;
  level: number; // 0 for cantrips
  school: MagicSchool;
  castingTime: string;
  range: string;
  duration: string;
  isPrepared: boolean;
  imageUrl: string;
  isRitual: boolean;
  requiresConcentration: boolean;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materialDescription: string;
  };
}

export interface Note {
    id: string;
    title: string;
    content: string;
}

export interface Character {
  name: string;
  race: string;
  characterClass: string;
  level: number;
  experience: number;
  portraitUrl: string;
  scores: Record<Ability, number>;
  skills: Record<string, Skill>;
  savingThrowProficiencies: Record<Ability, boolean>;
  hitDie: HitDie;
  maxHitPoints: number;
  currentHitPoints: number;
  temporaryHitPoints: number;
  abilityBonuses: Record<Ability, number>;
  skillBonuses: Record<string, number>;
  baseAC: number;
  acAbilitySources: Record<Ability, boolean>;
  acBonus: number;
  initiativeBonus: number;
  proficiencyBonusBonus: number;
  speedBonus: number;
  savingThrowBonuses: Record<Ability, number>;
  attunementSlots: number;
  attunementItems: (InventoryItem | null)[];
  inventoryRows: number;
  inventory: (InventoryItem | null)[];
  equippedItems: InventoryItem[];
  totalHitDice: number;
  currentHitDice: number;
  speed: number;
  longJumpBonus: number;
  highJumpBonus: number;
  size: CharacterSize;
  features: Feature[];
  featureGroups?: FeatureGroup[];
  passivePerceptionBonus: number;
  passiveInvestigationBonus: number;
  passiveInsightBonus: number;
  maxHpBonus: number;
  carryCapacityBonus: number;
  attacks: Attack[];
  globalAttackDiceBonusToHitDice: string;
  globalAttackDiceBonusToDamageDice: string;
  spells: Spell[];
  spellSlots: Record<number, { total: number, used: number }>;
  spellcastingAbility: Ability;
  maxPreparedSpells: number;
  spellSaveDcBonus: number;
  spellAttackBonusBonus: number;
  currency: Record<Currency, number>;
  notes: Note[];
  noteGroups?: NoteGroup[];
  activeNoteId: string | null;
  attunementMaxBonus?: number;
  tabOrder?: string[];
  viewMode?: 'tabs' | 'scroll';
  collapsedTabs?: Record<string, boolean>;
}

export interface RollResult {
  id: string;
  name: string;
  roll1: number;
  roll2?: number;
  chosenRoll: number;
  modifier: number;
  total: number;
  rollType: RollType;
  diceType: string;
  bonusDiceRoll?: number;
  bonusDiceFormula?: string;
}

// --- ACTION TYPES for characterReducer ---
export type CharacterAction =
  | { type: 'SET_FIELD'; payload: { field: 'name' | 'race' | 'characterClass' | 'experience' | 'portraitUrl' | 'speed' | 'temporaryHitPoints'; value: any } }
  | { type: 'SET_SCORE'; payload: { ability: Ability; score: number } }
  | { type: 'SET_PROFICIENCY'; payload: string }
  | { type: 'SET_SAVING_THROW_PROF'; payload: Ability }
  | { type: 'APPLY_HEALTH_CHANGE'; payload: { amount: number; type: 'damage' | 'heal' | 'temp' } }
  | { type: 'SET_LEVEL'; payload: number }
  | { type: 'LEVEL_UP'; payload: { method: 'roll' | 'average', hpRoll?: number } }
  | { type: 'SET_HIT_DIE'; payload: HitDie }
  | { type: 'SET_BONUS'; payload: { field: BonusField; value: number } }
  | { type: 'SET_GLOBAL_DICE_BONUS'; payload: { toHitDice: string, toDamageDice: string } }
  | { type: 'SET_ABILITY_BONUS'; payload: { ability: Ability; bonus: number } }
  | { type: 'SET_SAVING_THROW_BONUS'; payload: { ability: Ability; bonus: number } }
  | { type: 'SET_SKILL_BONUS'; payload: { skillName: string; bonus: number } }
  | { type: 'SET_ATTUNEMENT_SLOTS'; payload: number }
  | { type: 'SET_INVENTORY_ROWS'; payload: number }
  | { type: 'UPDATE_ITEM'; payload: { location: DropLocation; itemData: InventoryItem | null } }
  | { type: 'SET_ITEMS_ORDER'; payload: { itemsWithOrder: { container: 'doll' | 'inventory'; index: number; attunementOrder?: number; chargesOrder?: number }[] } }
  | { type: 'MOVE_ITEM'; payload: { source: DropLocation; destination: DropLocation } }
  | { type: 'DELETE_CUSTOM_ICON_REFERENCES'; payload: string }
  | { type: 'SHORT_REST'; payload: { diceResults: number[], conModifier: number } }
  | { type: 'LONG_REST' }
  | { type: 'DAWN_RECOVERY' }
  | { type: 'SET_CURRENT_HIT_DICE', payload: number }
  | { type: 'SET_SIZE', payload: CharacterSize }
  | { type: 'ADD_FEATURE', payload: Feature }
  | { type: 'ADD_FEATURE_TO_GROUP'; payload: { feature: Feature; groupId: string } }
  | { type: 'UPDATE_FEATURE', payload: Feature }
  | { type: 'DELETE_FEATURE', payload: string }
  | { type: 'USE_FEATURE', payload: { id: string, newUses: number } }
  | { type: 'REORDER_FEATURES', payload: { sourceIndex: number, destinationIndex: number } }
  | { type: 'CREATE_FEATURE_GROUP'; payload: { name: string } }
  | { type: 'RENAME_FEATURE_GROUP'; payload: { groupId: string; name: string } }
  | { type: 'DELETE_FEATURE_GROUP'; payload: string }
  | { type: 'TOGGLE_FEATURE_GROUP_COLLAPSE'; payload: string }
  | { type: 'MOVE_FEATURE'; payload: { featureId: string; sourceGroupId: string; targetGroupId: string; targetIndex: number } }
  | { type: 'REORDER_FEATURE_GROUPS'; payload: { sourceIndex: number; destinationIndex: number } }
  | { type: 'ADD_ATTACK', payload: Attack }
  | { type: 'UPDATE_ATTACK', payload: Attack }
  | { type: 'DELETE_ATTACK', payload: string }
  | { type: 'ADD_SPELL', payload: Spell }
  | { type: 'UPDATE_SPELL', payload: Spell }
  | { type: 'DELETE_SPELL', payload: string }
  | { type: 'TOGGLE_SPELL_PREPARED', payload: string }
  | { type: 'SET_SPELL_SLOTS', payload: { level: number, total: number } }
  | { type: 'USE_SPELL_SLOT', payload: { level: number, used: number } }
  | { type: 'SET_SPELLCASTING_ABILITY', payload: Ability }
  | { type: 'SET_MAX_PREPARED_SPELLS', payload: number }
  | { type: 'MOVE_AND_REORDER_SPELL', payload: { spellId: string, targetSpellId?: string, targetLevel?: number } }
  | { type: 'SET_CURRENCY', payload: { currency: Currency, amount: number } }
  | { type: 'SET_BASE_AC'; payload: number }
  | { type: 'TOGGLE_AC_ABILITY_SOURCE'; payload: Ability }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'ADD_NOTE_TO_GROUP'; payload: { note: Note; groupId: string } }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updates: Partial<Omit<Note, 'id'>> } }
  | { type: 'DELETE_NOTE'; payload: string }
  | { type: 'SET_ACTIVE_NOTE'; payload: string }
  | { type: 'CREATE_NOTE_GROUP'; payload: { name: string } }
  | { type: 'RENAME_NOTE_GROUP'; payload: { groupId: string; name: string } }
  | { type: 'DELETE_NOTE_GROUP'; payload: string }
  | { type: 'TOGGLE_NOTE_GROUP_COLLAPSE'; payload: string }
  | { type: 'MOVE_NOTE'; payload: { noteId: string; sourceGroupId: string; targetGroupId: string; targetIndex: number } }
  | { type: 'REORDER_NOTE_GROUPS'; payload: { sourceIndex: number; destinationIndex: number } }
  | { type: 'UNATTUNE_ITEM'; payload: string }
  | { type: 'PLACE_ITEM_ON_DOLL'; payload: { itemIndex: number; x: number; y: number } }
  | { type: 'MOVE_ITEM_ON_DOLL'; payload: { itemIndex: number; x: number; y: number } }
  | { type: 'UNEQUIP_ITEM_FROM_DOLL'; payload: { itemIndex: number; targetInventoryIndex?: number } }
  | { type: 'REORDER_TABS'; payload: string[] }
  | { type: 'SET_VIEW_MODE'; payload: 'tabs' | 'scroll' }
  | { type: 'TOGGLE_TAB_COLLAPSE'; payload: string };

// --- HISTORY TYPES ---
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface LogEntry {
  id: string;
  timestamp: number;
  description: string;
}