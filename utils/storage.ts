import OBR from '@owlbear-rodeo/sdk';
import { Character, Ability, Skill, ProficiencyLevel, InventoryItem } from '../types';
import { defaultCharacterState } from '../state/defaultCharacterState';

/**
 * Checks if the application is running inside the Owlbear Rodeo iframe environment.
 */
export const isOwlbear = (): boolean => {
  return typeof window !== 'undefined' && window.parent !== window;
};

const LEGACY_METADATA_KEY = 'com.antigravity.dnd-sheet/characters';
const GRANULAR_KEY_PREFIX = 'com.antigravity.dnd-sheet/character/';

/**
 * Minifies a full Character sheet to a lightweight format to save space in VTT metadata (under 1KB).
 */
export function minifyCharacter(char: Character): any {
  const min: any = {};

  const basicFields = [
    'name', 'race', 'characterClass', 'level', 'experience', 'portraitUrl',
    'hitDie', 'maxHitPoints', 'currentHitPoints', 'temporaryHitPoints', 'speed',
    'baseAC', 'acBonus', 'initiativeBonus', 'proficiencyBonusBonus', 'speedBonus',
    'attunementSlots', 'inventoryRows', 'totalHitDice', 'currentHitDice',
    'longJumpBonus', 'highJumpBonus', 'size',
    'passivePerceptionBonus', 'passiveInvestigationBonus', 'passiveInsightBonus',
    'maxHpBonus', 'carryCapacityBonus',
    'globalAttackDiceBonusToHitDice', 'globalAttackDiceBonusToDamageDice',
    'spellcastingAbility', 'maxPreparedSpells', 'spellSaveDcBonus',
    'spellAttackBonusBonus', 'activeNoteId', 'attunementMaxBonus', 'ownerId', 'viewMode'
  ];

  for (const field of basicFields) {
    if ((char as any)[field] !== undefined) {
      min[field] = (char as any)[field];
    }
  }

  // Scores: flat array [STR, DEX, CON, INT, WIS, CHA]
  min.scores = [
    char.scores.STR, char.scores.DEX, char.scores.CON,
    char.scores.INT, char.scores.WIS, char.scores.CHA
  ];

  // Saving throw proficiencies: array of abilities
  const stProf: string[] = [];
  for (const [ability, prof] of Object.entries(char.savingThrowProficiencies)) {
    if (prof) stProf.push(ability);
  }
  if (stProf.length > 0) min.stProf = stProf;

  // Ability bonuses: only non-zero
  const abBonus: Record<string, number> = {};
  for (const [ability, bonus] of Object.entries(char.abilityBonuses)) {
    if (bonus !== 0) abBonus[ability] = bonus;
  }
  if (Object.keys(abBonus).length > 0) min.abBonus = abBonus;

  // Saving throw bonuses: only non-zero
  const stBonus: Record<string, number> = {};
  for (const [ability, bonus] of Object.entries(char.savingThrowBonuses)) {
    if (bonus !== 0) stBonus[ability] = bonus;
  }
  if (Object.keys(stBonus).length > 0) min.stBonus = stBonus;

  // Skill proficiencies: only those > 0
  const skillProf: Record<string, number> = {};
  for (const [skillName, skill] of Object.entries(char.skills)) {
    if (skill.proficiency !== ProficiencyLevel.None) {
      skillProf[skillName] = skill.proficiency;
    }
  }
  if (Object.keys(skillProf).length > 0) min.skillProf = skillProf;

  // Skill bonuses: only non-zero
  const skillBonus: Record<string, number> = {};
  for (const [skillName, bonus] of Object.entries(char.skillBonuses)) {
    if (bonus !== 0) skillBonus[skillName] = bonus;
  }
  if (Object.keys(skillBonus).length > 0) min.skillBonus = skillBonus;

  // AC ability sources: array of abilities that are true
  const acSources: string[] = [];
  for (const [ability, active] of Object.entries(char.acAbilitySources)) {
    if (active) acSources.push(ability);
  }
  if (acSources.length > 0) min.acSources = acSources;

  // Inventory: store only non-null items with index
  const inv: any[] = [];
  char.inventory.forEach((item, index) => {
    if (item) inv.push({ index, item });
  });
  if (inv.length > 0) min.inv = inv;

  // Attunement items: store only non-null items with index
  const att: any[] = [];
  char.attunementItems.forEach((item, index) => {
    if (item) att.push({ index, item });
  });
  if (att.length > 0) min.att = att;

  // Currency: only non-zero
  const cur: Record<string, number> = {};
  for (const [coin, amount] of Object.entries(char.currency)) {
    if (amount > 0) cur[coin] = amount;
  }
  if (Object.keys(cur).length > 0) min.cur = cur;

  // Spell slots: only non-zero
  const slots: Record<number, [number, number]> = {};
  for (const [levelStr, slot] of Object.entries(char.spellSlots)) {
    const lvl = Number(levelStr);
    if (slot.total > 0 || slot.used > 0) {
      slots[lvl] = [slot.total, slot.used];
    }
  }
  if (Object.keys(slots).length > 0) min.slots = slots;

  // Arrays: save as is if not empty
  if (char.features && char.features.length > 0) min.features = char.features;
  if (char.featureGroups && char.featureGroups.length > 0) min.featureGroups = char.featureGroups;
  if (char.attacks && char.attacks.length > 0) min.attacks = char.attacks;
  if (char.spells && char.spells.length > 0) min.spells = char.spells;
  if (char.notes && char.notes.length > 0) min.notes = char.notes;
  if (char.noteGroups && char.noteGroups.length > 0) min.noteGroups = char.noteGroups;
  if (char.tabOrder && char.tabOrder.length > 0) min.tabOrder = char.tabOrder;
  if (char.collapsedTabs && Object.keys(char.collapsedTabs).length > 0) min.collapsedTabs = char.collapsedTabs;
  if (char.equippedItems && char.equippedItems.length > 0) min.equippedItems = char.equippedItems;

  return min;
}

/**
 * Reconstructs a full Character sheet from minified cloud data, merging it with defaults.
 */
export function unminifyCharacter(min: any): Character {
  if (!min) return structuredClone(defaultCharacterState);
  
  const char: Character = structuredClone(defaultCharacterState);

  const basicFields = [
    'name', 'race', 'characterClass', 'level', 'experience', 'portraitUrl',
    'hitDie', 'maxHitPoints', 'currentHitPoints', 'temporaryHitPoints', 'speed',
    'baseAC', 'acBonus', 'initiativeBonus', 'proficiencyBonusBonus', 'speedBonus',
    'attunementSlots', 'inventoryRows', 'totalHitDice', 'currentHitDice',
    'longJumpBonus', 'highJumpBonus', 'size',
    'passivePerceptionBonus', 'passiveInvestigationBonus', 'passiveInsightBonus',
    'maxHpBonus', 'carryCapacityBonus',
    'globalAttackDiceBonusToHitDice', 'globalAttackDiceBonusToDamageDice',
    'spellcastingAbility', 'maxPreparedSpells', 'spellSaveDcBonus',
    'spellAttackBonusBonus', 'activeNoteId', 'attunementMaxBonus', 'ownerId', 'viewMode'
  ];

  for (const field of basicFields) {
    if (min[field] !== undefined) {
      (char as any)[field] = min[field];
    }
  }

  // Scores
  if (Array.isArray(min.scores) && min.scores.length === 6) {
    char.scores.STR = min.scores[0];
    char.scores.DEX = min.scores[1];
    char.scores.CON = min.scores[2];
    char.scores.INT = min.scores[3];
    char.scores.WIS = min.scores[4];
    char.scores.CHA = min.scores[5];
  }

  // Saving throw proficiencies
  if (Array.isArray(min.stProf)) {
    for (const ability of min.stProf) {
      if (char.savingThrowProficiencies[ability as Ability] !== undefined) {
        char.savingThrowProficiencies[ability as Ability] = true;
      }
    }
  }

  // Ability bonuses
  if (min.abBonus) {
    for (const [ability, bonus] of Object.entries(min.abBonus)) {
      if (char.abilityBonuses[ability as Ability] !== undefined) {
        char.abilityBonuses[ability as Ability] = Number(bonus);
      }
    }
  }

  // Saving throw bonuses
  if (min.stBonus) {
    for (const [ability, bonus] of Object.entries(min.stBonus)) {
      if (char.savingThrowBonuses[ability as Ability] !== undefined) {
        char.savingThrowBonuses[ability as Ability] = Number(bonus);
      }
    }
  }

  // Skills
  if (min.skillProf) {
    for (const [skillName, prof] of Object.entries(min.skillProf)) {
      if (char.skills[skillName]) {
        char.skills[skillName].proficiency = Number(prof);
      }
    }
  }

  // Skill bonuses
  if (min.skillBonus) {
    for (const [skillName, bonus] of Object.entries(min.skillBonus)) {
      if (char.skillBonuses[skillName] !== undefined) {
        char.skillBonuses[skillName] = Number(bonus);
      }
    }
  }

  // AC ability sources
  if (Array.isArray(min.acSources)) {
    for (const ability of Object.keys(char.acAbilitySources)) {
      char.acAbilitySources[ability as Ability] = false;
    }
    for (const ability of min.acSources) {
      if (char.acAbilitySources[ability as Ability] !== undefined) {
        char.acAbilitySources[ability as Ability] = true;
      }
    }
  }

  // Inventory
  const invSize = char.inventoryRows * 5;
  char.inventory = Array(invSize).fill(null);
  if (Array.isArray(min.inv)) {
    for (const entry of min.inv) {
      if (entry && entry.index >= 0 && entry.index < invSize) {
        char.inventory[entry.index] = entry.item;
      }
    }
  }

  // Attunement items
  char.attunementItems = Array(char.attunementSlots).fill(null);
  if (Array.isArray(min.att)) {
    for (const entry of min.att) {
      if (entry && entry.index >= 0 && entry.index < char.attunementSlots) {
        char.attunementItems[entry.index] = entry.item;
      }
    }
  }

  // Currency
  if (min.cur) {
    for (const [coin, amount] of Object.entries(min.cur)) {
      if (char.currency[coin as any] !== undefined) {
        char.currency[coin as any] = Number(amount);
      }
    }
  }

  // Spell slots
  if (min.slots) {
    for (const [lvlStr, [total, used]] of Object.entries(min.slots)) {
      const lvl = Number(lvlStr);
      if (char.spellSlots[lvl]) {
        char.spellSlots[lvl] = { total: Number(total), used: Number(used) };
      }
    }
  }

  // Arrays
  if (Array.isArray(min.features)) char.features = min.features;
  if (Array.isArray(min.featureGroups)) char.featureGroups = min.featureGroups;
  if (Array.isArray(min.attacks)) char.attacks = min.attacks;
  if (Array.isArray(min.spells)) char.spells = min.spells;
  if (Array.isArray(min.notes)) char.notes = min.notes;
  if (Array.isArray(min.noteGroups)) char.noteGroups = min.noteGroups;
  if (Array.isArray(min.tabOrder)) char.tabOrder = min.tabOrder;
  if (min.collapsedTabs) char.collapsedTabs = min.collapsedTabs;
  if (Array.isArray(min.equippedItems)) char.equippedItems = min.equippedItems;

  return char;
}

// Compresses any JSON object into a Gzip base64 string if supported
export async function compressData(data: any): Promise<any> {
  try {
    if (typeof window === 'undefined' || typeof window.CompressionStream === 'undefined') {
      return data;
    }
    const jsonStr = JSON.stringify(data);
    const stream = new Blob([jsonStr]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { compressed: base64 };
  } catch (err) {
    console.error('[DND Sheet] Compression failed, saving raw:', err);
    return data;
  }
}

// Decompresses a Gzip base64 string back into a JSON object if supported
export async function decompressData(data: any): Promise<any> {
  if (data && typeof data === 'object' && typeof data.compressed === 'string') {
    try {
      if (typeof window === 'undefined' || typeof window.DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream not supported');
      }
      const binaryString = atob(data.compressed);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream();
      const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
      const response = new Response(decompressedStream);
      const jsonStr = await response.text();
      return JSON.parse(jsonStr);
    } catch (err) {
      console.error('[DND Sheet] Decompression failed:', err);
      return null;
    }
  }
  return data;
}

// Helper to clean base64 data URLs recursively from any object
export function stripBase64(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      if (obj.startsWith('data:')) {
        return ''; // Strip base64 data URL to protect OBR limits
      }
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(stripBase64);
  }
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = stripBase64(value);
  }
  return cleaned;
}

// Split character into Main, Texts, and Images chunks to bypass OBR 16KB size limit per key/update
export function splitCharacter(characterData: any): { main: any; texts: any; images: any } {
  const char = structuredClone(characterData);
  
  const texts: any = {
    notes: {},
    spells: {},
    features: {},
    attacks: {},
    inventory: {},
    equippedItems: {}
  };

  const images: any = {
    portraitUrl: '',
    inventory: {},
    equippedItems: {},
    imageCache: char.imageCache || []
  };

  // 1. Portrait Image
  if (char.character.portraitUrl?.startsWith('data:')) {
    images.portraitUrl = char.character.portraitUrl;
    char.character.portraitUrl = '';
  }

  // 2. Notes
  if (Array.isArray(char.character.notes)) {
    char.character.notes.forEach((n: any) => {
      texts.notes[n.id] = n.content;
      n.content = '';
    });
  }

  // 3. Spells
  if (Array.isArray(char.character.spells)) {
    char.character.spells.forEach((s: any) => {
      texts.spells[s.id] = {
        description: s.description || '',
        materialDescription: s.components?.materialDescription || ''
      };
      s.description = '';
      if (s.components) s.components.materialDescription = '';
    });
  }

  // 4. Features
  if (Array.isArray(char.character.features)) {
    char.character.features.forEach((f: any) => {
      texts.features[f.id] = f.description || '';
      f.description = '';
    });
  }

  // 5. Attacks
  if (Array.isArray(char.character.attacks)) {
    char.character.attacks.forEach((a: any) => {
      texts.attacks[a.id] = a.notes || '';
      a.notes = '';
    });
  }

  // Helper to extract item texts & images (including chests recursively)
  const extractItemData = (item: any, path: string) => {
    if (!item) return;
    if (item.description) {
      texts.inventory[`${path}.description`] = item.description;
      item.description = '';
    }
    if (item.imageUrl?.startsWith('data:')) {
      images.inventory[`${path}.imageUrl`] = item.imageUrl;
      item.imageUrl = '';
    }
    if (item.isChest && Array.isArray(item.chestInventory)) {
      item.chestInventory.forEach((subItem: any, idx: number) => {
        extractItemData(subItem, `${path}.chestInventory.${idx}`);
      });
    }
  };

  // 6. Inventory Items
  if (Array.isArray(char.character.inventory)) {
    char.character.inventory.forEach((invItem: any, idx: number) => {
      if (invItem && invItem.item) {
        extractItemData(invItem.item, `idx.${idx}`);
      }
    });
  }

  // 7. Equipped Items
  if (Array.isArray(char.character.equippedItems)) {
    char.character.equippedItems.forEach((eqItem: any) => {
      if (eqItem) {
        if (eqItem.description) {
          texts.equippedItems[`id.${eqItem.id}.description`] = eqItem.description;
          eqItem.description = '';
        }
        if (eqItem.imageUrl?.startsWith('data:')) {
          images.equippedItems[`id.${eqItem.id}.imageUrl`] = eqItem.imageUrl;
          eqItem.imageUrl = '';
        }
      }
    });
  }

  char.imageCache = []; // Clear from main chunk to save space

  return {
    main: char,
    texts,
    images
  };
}

// Merge Main, Texts, and Images chunks back into the complete character structure
export function mergeCharacter(main: any, texts: any, images: any): any {
  if (!main) return null;
  const char = structuredClone(main);

  if (!char.character) return char;

  const setNestedProperty = (obj: any, path: string, val: any) => {
    const parts = path.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      const isNextNumber = !isNaN(Number(nextPart));
      if (curr[part] === undefined) {
        curr[part] = isNextNumber ? [] : {};
      }
      curr = curr[part];
    }
    curr[parts[parts.length - 1]] = val;
  };

  const t = texts || {};
  const img = images || {};

  // 1. Restore portrait Url
  if (img.portraitUrl) {
    char.character.portraitUrl = img.portraitUrl;
  }

  // 2. Restore Notes
  if (Array.isArray(char.character.notes) && t.notes) {
    char.character.notes.forEach((n: any) => {
      if (t.notes[n.id] !== undefined) n.content = t.notes[n.id];
    });
  }

  // 3. Restore Spells
  if (Array.isArray(char.character.spells) && t.spells) {
    char.character.spells.forEach((s: any) => {
      const spellText = t.spells[s.id];
      if (spellText) {
        if (spellText.description !== undefined) s.description = spellText.description;
        if (s.components && spellText.materialDescription !== undefined) {
          s.components.materialDescription = spellText.materialDescription;
        }
      }
    });
  }

  // 4. Restore Features
  if (Array.isArray(char.character.features) && t.features) {
    char.character.features.forEach((f: any) => {
      if (t.features[f.id] !== undefined) f.description = t.features[f.id];
    });
  }

  // 5. Restore Attacks
  if (Array.isArray(char.character.attacks) && t.attacks) {
    char.character.attacks.forEach((a: any) => {
      if (t.attacks[a.id] !== undefined) a.notes = t.attacks[a.id];
    });
  }

  // 6. Restore Inventory texts & images
  if (Array.isArray(char.character.inventory)) {
    if (t.inventory) {
      for (const [path, val] of Object.entries(t.inventory)) {
        setNestedProperty(char.character.inventory, path, val);
      }
    }
    if (img.inventory) {
      for (const [path, val] of Object.entries(img.inventory)) {
        setNestedProperty(char.character.inventory, path, val);
      }
    }
  }

  // 7. Restore Equipped items texts & images
  if (Array.isArray(char.character.equippedItems)) {
    char.character.equippedItems.forEach((eqItem: any) => {
      if (eqItem) {
        if (t.equippedItems && t.equippedItems[`id.${eqItem.id}.description`] !== undefined) {
          eqItem.description = t.equippedItems[`id.${eqItem.id}.description`];
        }
        if (img.equippedItems && img.equippedItems[`id.${eqItem.id}.imageUrl`] !== undefined) {
          eqItem.imageUrl = img.equippedItems[`id.${eqItem.id}.imageUrl`];
        }
      }
    });
  }

  // 8. Restore imageCache
  if (img.imageCache) {
    char.imageCache = img.imageCache;
  }

  return char;
}

// Strips heavy properties from minified character data recursively to stay below OBR's 16KB metadata limit
export function stripLargeTexts(minifiedChar: any): any {
  // Strips base64 only, long text descriptions are split into a separate key
  return stripBase64(minifiedChar);
}

// Merges local base64 images and stripped description texts from LocalStorage back into loaded cloud data
export const restoreLocalData = (cloudData: any, localBackup: any) => {
  if (!cloudData) return cloudData;
  if (!localBackup) return cloudData;

  const restoreItemImages = (cloudItem: any, localItem: any) => {
    if (!cloudItem || !localItem) return;
    if (localItem.imageUrl?.startsWith('data:image/') && !cloudItem.imageUrl) {
      cloudItem.imageUrl = localItem.imageUrl;
    }
    if (localItem.description && !cloudItem.description) {
      cloudItem.description = localItem.description;
    }
    if (cloudItem.isChest && Array.isArray(cloudItem.chestInventory) && Array.isArray(localItem.chestInventory)) {
      cloudItem.chestInventory.forEach((subItem: any, idx: number) => {
        restoreItemImages(subItem, localItem.chestInventory[idx]);
      });
    }
  };

  const restored = { ...cloudData };
  for (const [id, item] of Object.entries(restored)) {
    const cloudEntry = item as any;
    const localEntry = localBackup[id];
    if (cloudEntry && localEntry && cloudEntry.character && localEntry.character) {
      const cloudChar = cloudEntry.character;
      const localChar = localEntry.character;

      // 1. Restore imageCache
      const cloudCache = cloudEntry.imageCache || [];
      const localCache = localEntry.imageCache || [];
      const mergedCache = [...cloudCache];
      for (const localImg of localCache) {
        const exists = mergedCache.some(c => c[0] === localImg[0]);
        if (!exists) {
          mergedCache.push(localImg);
        }
      }
      cloudEntry.imageCache = mergedCache;

      // 2. Restore portraitUrl if it was stripped
      if (localChar.portraitUrl?.startsWith('data:image/') && !cloudChar.portraitUrl) {
        cloudChar.portraitUrl = localChar.portraitUrl;
      }

      // 3. Restore note contents if stripped
      if (Array.isArray(cloudChar.notes) && Array.isArray(localChar.notes)) {
        cloudChar.notes.forEach((n: any) => {
          const match = localChar.notes.find((ln: any) => ln.id === n.id);
          if (match && match.content && !n.content) n.content = match.content;
        });
      }

      // 4. Restore spell descriptions & material descriptions if stripped
      if (Array.isArray(cloudChar.spells) && Array.isArray(localChar.spells)) {
        cloudChar.spells.forEach((s: any) => {
          const match = localChar.spells.find((ls: any) => ls.id === s.id);
          if (match) {
            if (match.description && !s.description) s.description = match.description;
            if (s.components && match.components && match.components.materialDescription && !s.components.materialDescription) {
              s.components.materialDescription = match.components.materialDescription;
            }
          }
        });
      }

      // 5. Restore feature descriptions if stripped
      if (Array.isArray(cloudChar.features) && Array.isArray(localChar.features)) {
        cloudChar.features.forEach((f: any) => {
          const match = localChar.features.find((lf: any) => lf.id === f.id);
          if (match && match.description && !f.description) f.description = match.description;
        });
      }

      // 6. Restore attack notes if stripped
      if (Array.isArray(cloudChar.attacks) && Array.isArray(localChar.attacks)) {
        cloudChar.attacks.forEach((a: any) => {
          const match = localChar.attacks.find((la: any) => la.id === a.id);
          if (match && match.notes && !a.notes) a.notes = match.notes;
        });
      }

      // 7. Restore inventory item images & descriptions (including chests)
      if (Array.isArray(cloudChar.inventory) && Array.isArray(localChar.inventory)) {
        cloudChar.inventory.forEach((invItem: any, idx: number) => {
          const localInvItem = localChar.inventory[idx];
          if (invItem && localInvItem && invItem.item && localInvItem.item) {
            restoreItemImages(invItem.item, localInvItem.item);
          }
        });
      }

      // 8. Restore equipped item images & descriptions
      if (Array.isArray(cloudChar.equippedItems) && Array.isArray(localChar.equippedItems)) {
        cloudChar.equippedItems.forEach((eqItem: any) => {
          const match = localChar.equippedItems.find((le: any) => le.id === eqItem.id);
          if (match) {
            restoreItemImages(eqItem, match);
          }
        });
      }
    }
  }
  return restored;
};

/**
 * Loads character data from OBR room metadata (filtering by granular keys) or local storage / Vite dev server fallback.
 */
export async function loadCharactersApi(): Promise<any> {
  const restoreGranularData = (rawData: any) => {
    if (!rawData) return null;
    const restored: Record<string, any> = {};
    for (const [id, item] of Object.entries(rawData)) {
      const entry = item as any;
      if (entry) {
        restored[id] = {
          ...entry,
          character: unminifyCharacter(entry.character)
        };
      }
    }
    return restored;
  };

  const localBackup = loadFromLocalStorage();

  if (isOwlbear()) {
    try {
      const getCharactersFromMetadata = async (metadata: any) => {
        const tempChunks: Record<string, { main?: any; texts?: any; images?: any }> = {};
        let hasGranular = false;
        
        // 1. Read granular character keys (can end with /texts or /images)
        for (const [key, value] of Object.entries(metadata)) {
          if (key.startsWith(GRANULAR_KEY_PREFIX) && value !== null) {
            hasGranular = true;
            const path = key.replace(GRANULAR_KEY_PREFIX, '');
            const parts = path.split('/');
            const charId = parts[0];
            const type = parts[1] || 'main'; // 'main', 'texts', 'images'

            const decompressed = await decompressData(value);
            if (decompressed) {
              if (!tempChunks[charId]) tempChunks[charId] = {};
              tempChunks[charId][type as 'main' | 'texts' | 'images'] = decompressed;
            }
          }
        }

        const charactersData: Record<string, any> = {};
        for (const [charId, chunks] of Object.entries(tempChunks)) {
          if (chunks && chunks.main) {
            // Merge chunks
            const merged = mergeCharacter(chunks.main, chunks.texts, chunks.images);
            charactersData[charId] = merged;
          }
        }

        // 2. Read and migrate legacy bulk key if no granular keys exist
        const legacyData = metadata[LEGACY_METADATA_KEY];
        if (!hasGranular && legacyData) {
          console.log('[DND Sheet] Migrating legacy characters to granular metadata keys...');
          const updateObj: Record<string, any> = {};
          for (const [charId, charData] of Object.entries(legacyData)) {
            const entry = charData as any;
            if (entry) {
              const rawChar = entry.character || entry.history?.present || entry;
              const minified = {
                ...entry,
                character: minifyCharacter(rawChar)
              };
              
              const chunks = splitCharacter(minified);
              const mainCompressed = await compressData(chunks.main);
              const textsCompressed = await compressData(chunks.texts);
              const imagesCompressed = await compressData(chunks.images);

              updateObj[`${GRANULAR_KEY_PREFIX}${charId}`] = mainCompressed;
              updateObj[`${GRANULAR_KEY_PREFIX}${charId}/texts`] = textsCompressed;
              updateObj[`${GRANULAR_KEY_PREFIX}${charId}/images`] = imagesCompressed;

              charactersData[charId] = minified;
            }
          }
          updateObj[LEGACY_METADATA_KEY] = null;
          try {
            await OBR.room.setMetadata(updateObj);
            console.log('[DND Sheet] Legacy migration metadata updated successfully.');
          } catch (err) {
            console.error('[DND Sheet] Failed to write migrated characters to metadata:', err);
            // If the bulk write fails, try deleting the legacy key anyway to unblock the app
            try {
              await OBR.room.setMetadata({ [LEGACY_METADATA_KEY]: null });
            } catch (ignore) {}
          }
        }

        if (hasGranular || legacyData) {
          const parsedCloud = restoreGranularData(charactersData);
          return restoreLocalData(parsedCloud, localBackup);
        }
        return null;
      };

      if (OBR.isReady) {
        const metadata = await OBR.room.getMetadata();
        const data = await getCharactersFromMetadata(metadata);
        return data || restoreGranularData(localBackup);
      } else {
        return new Promise((resolve) => {
          OBR.onReady(async () => {
            try {
              const metadata = await OBR.room.getMetadata();
              const data = await getCharactersFromMetadata(metadata);
              resolve(data || restoreGranularData(localBackup));
            } catch (err) {
              console.error('Error fetching OBR metadata:', err);
              resolve(restoreGranularData(localBackup));
            }
          });
        });
      }
    } catch (error) {
      console.error('Owlbear loadCharacters error, falling back to LocalStorage:', error);
      return restoreGranularData(localBackup);
    }
  } else {
    const rawDev = await loadFromLocalDevApi();
    return restoreGranularData(rawDev);
  }
}

/**
 * Saves a single character's data to OBR room metadata and local storage backup.
 */
export async function saveCharacterApi(id: string, characterData: any): Promise<void> {
  const minifiedCharData = {
    ...characterData,
    character: minifyCharacter(characterData.character)
  };

  // Always write the full representation (including base64 images) to local storage backup
  const localData = loadFromLocalStorage();
  localData[id] = minifiedCharData;
  saveToLocalStorage(localData);

  if (isOwlbear()) {
    try {
      const mainKey = `${GRANULAR_KEY_PREFIX}${id}`;
      const textsKey = `${GRANULAR_KEY_PREFIX}${id}/texts`;
      const imagesKey = `${GRANULAR_KEY_PREFIX}${id}/images`;

      // Split into smaller chunks (main structure, descriptions/notes, and base64 images)
      const chunks = splitCharacter(minifiedCharData);

      const mainCompressed = await compressData(chunks.main);
      const textsCompressed = await compressData(chunks.texts);
      const imagesCompressed = await compressData(chunks.images);

      if (OBR.isReady) {
        // Write in separate metadata updates to keep each payload well under 16KB
        await OBR.room.setMetadata({ [mainKey]: mainCompressed });
        await OBR.room.setMetadata({ [textsKey]: textsCompressed });
        await OBR.room.setMetadata({ [imagesKey]: imagesCompressed });
        console.log(`[DND Sheet] Successfully saved compressed chunks for character ${id} to OBR.`);
      } else {
        await new Promise<void>((resolve) => {
          OBR.onReady(async () => {
            await OBR.room.setMetadata({ [mainKey]: mainCompressed });
            await OBR.room.setMetadata({ [textsKey]: textsCompressed });
            await OBR.room.setMetadata({ [imagesKey]: imagesCompressed });
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`Owlbear saveCharacter error for ${id}:`, error);
    }
  } else {
    await saveToLocalDevApi(localData);
  }
}

/**
 * Deletes a single character's data from OBR room metadata and local storage.
 */
export async function deleteCharacterApi(id: string): Promise<void> {
  const localData = loadFromLocalStorage();
  delete localData[id];
  saveToLocalStorage(localData);

  if (isOwlbear()) {
    try {
      const mainKey = `${GRANULAR_KEY_PREFIX}${id}`;
      const textsKey = `${GRANULAR_KEY_PREFIX}${id}/texts`;
      const imagesKey = `${GRANULAR_KEY_PREFIX}${id}/images`;

      if (OBR.isReady) {
        await OBR.room.setMetadata({ 
          [mainKey]: null,
          [textsKey]: null,
          [imagesKey]: null
        });
      } else {
        await new Promise<void>((resolve) => {
          OBR.onReady(async () => {
            await OBR.room.setMetadata({ 
              [mainKey]: null,
              [textsKey]: null,
              [imagesKey]: null
            });
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`Owlbear deleteCharacter error for ${id}:`, error);
    }
  } else {
    await saveToLocalDevApi(localData);
  }
}

export function loadFromLocalStorage(): any {
  if (typeof window === 'undefined') return {};
  const data = localStorage.getItem('dnd-characters');
  return data ? JSON.parse(data) : {};
}

export function saveToLocalStorage(characters: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('dnd-characters', JSON.stringify(characters));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('[DND Sheet] LocalStorage quota exceeded. Stripping base64 from all local backups to free space...');
      // Strip base64 from all characters in the object to shrink them down
      const cleaned: any = {};
      for (const [key, val] of Object.entries(characters)) {
        cleaned[key] = stripBase64(val);
      }
      try {
        localStorage.setItem('dnd-characters', JSON.stringify(cleaned));
        console.log('[DND Sheet] LocalStorage successfully cleared of giant images and saved.');
      } catch (innerErr) {
        console.error('[DND Sheet] Failed to save even after stripping base64:', innerErr);
      }
    } else {
      console.error('[DND Sheet] LocalStorage save failed with unexpected error:', e);
    }
  }
}

async function loadFromLocalDevApi(): Promise<any> {
  try {
    const res = await fetch('/api/characters');
    if (!res.ok) throw new Error("Сетевая ошибка при загрузке данных.");
    return res.json();
  } catch (err) {
    console.warn("Dev server API unavailable, falling back to LocalStorage:", err);
    return loadFromLocalStorage();
  }
}

async function saveToLocalDevApi(characters: any): Promise<any> {
  try {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(characters),
    });
    if (!res.ok) throw new Error("Сетевая ошибка при сохранении данных.");
    return res.json();
  } catch (err) {
    console.warn("Dev server API unavailable, saving to LocalStorage:", err);
    saveToLocalStorage(characters);
    return { success: true };
  }
}
