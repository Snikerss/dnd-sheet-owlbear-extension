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

// Helper to clean base64 data URLs recursively from any object
export function stripBase64(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string' && obj.startsWith('data:image/')) {
      return ''; // Strip base64 data URL
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

// Merges local base64 images from LocalStorage back into loaded cloud data
const restoreImagesFromLocal = (cloudData: any, localBackup: any) => {
  if (!cloudData) return cloudData;
  if (!localBackup) return cloudData;

  const restored = { ...cloudData };
  for (const [id, item] of Object.entries(restored)) {
    const cloudEntry = item as any;
    const localEntry = localBackup[id];
    if (cloudEntry && localEntry) {
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

      // 2. Restore portraitUrl if it was stripped (is empty in cloud but present as base64 in local)
      if (localEntry.character && localEntry.character.portraitUrl?.startsWith('data:image/')) {
        if (!cloudEntry.character.portraitUrl || cloudEntry.character.portraitUrl === '') {
          cloudEntry.character.portraitUrl = localEntry.character.portraitUrl;
        }
      }

      // 3. Restore inventory item images if they were stripped
      if (Array.isArray(cloudEntry.character.inventory) && Array.isArray(localEntry.character.inventory)) {
        cloudEntry.character.inventory.forEach((invItem: any, idx: number) => {
          const localInvItem = localEntry.character.inventory[idx];
          if (invItem && localInvItem && invItem.item && localInvItem.item) {
            if (localInvItem.item.imageUrl?.startsWith('data:image/') && !invItem.item.imageUrl) {
              invItem.item.imageUrl = localInvItem.item.imageUrl;
            }
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
        const charactersData: Record<string, any> = {};
        let hasGranular = false;
        
        // 1. Read granular characters
        for (const [key, value] of Object.entries(metadata)) {
          if (key.startsWith(GRANULAR_KEY_PREFIX) && value !== null) {
            const charId = key.replace(GRANULAR_KEY_PREFIX, '');
            charactersData[charId] = value;
            hasGranular = true;
          }
        }

        // 2. Read and migrate legacy bulk key if no granular keys exist
        const legacyData = metadata[LEGACY_METADATA_KEY];
        if (!hasGranular && legacyData) {
          console.log('[DND Sheet] Migrating legacy characters to granular metadata keys...');
          const updateObj: Record<string, any> = {};
          for (const [charId, charData] of Object.entries(legacyData)) {
            updateObj[`${GRANULAR_KEY_PREFIX}${charId}`] = charData;
            charactersData[charId] = charData;
          }
          updateObj[LEGACY_METADATA_KEY] = null;
          await OBR.room.setMetadata(updateObj);
        }

        if (hasGranular || legacyData) {
          const parsedCloud = restoreGranularData(charactersData);
          return restoreImagesFromLocal(parsedCloud, localBackup);
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
      const key = `${GRANULAR_KEY_PREFIX}${id}`;
      
      // For OBR cloud VTT metadata, strip base64 to protect room limits
      const cloudCharData = stripBase64(minifiedCharData);
      cloudCharData.imageCache = []; // Clear image cache array in VTT cloud

      if (OBR.isReady) {
        await OBR.room.setMetadata({ [key]: cloudCharData });
        console.log(`[DND Sheet] Successfully saved minified & stripped character ${id} to OBR.`);
      } else {
        await new Promise<void>((resolve) => {
          OBR.onReady(async () => {
            await OBR.room.setMetadata({ [key]: cloudCharData });
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
      const key = `${GRANULAR_KEY_PREFIX}${id}`;
      if (OBR.isReady) {
        await OBR.room.setMetadata({ [key]: null });
      } else {
        await new Promise<void>((resolve) => {
          OBR.onReady(async () => {
            await OBR.room.setMetadata({ [key]: null });
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
