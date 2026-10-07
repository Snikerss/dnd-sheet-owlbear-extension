import OBR from '@owlbear-rodeo/sdk';
import { logger } from './logger';
import { Character, Ability, ProficiencyLevel, Currency, InventoryItem } from '../types';
import { defaultCharacterState } from '../state/defaultCharacterState';
import { INVENTORY_COLUMNS } from '../constants';
import { extractImages } from './imageStore';
import { imageDb } from './indexedDbStore';
import { CHARACTER_BASIC_FIELDS } from './characterSchema';
import { p2pRoomBridge } from './p2pBridge';
import { isOwlbear } from './environment';
import { generateUUID } from './uuid';
import { SYNC_CHANNEL, SyncMessageType } from '../protocol/messages';
import { getCachedRole } from '../auth/roleService';
import { restoreStrippedCharacter, mergeImageCacheEntries } from './restoreStripped';
import type { RawCharacterStorageData } from '../state/persistence';

export { isOwlbear };

const inMemoryCharactersCache: Record<string, Record<string, unknown>> = {};

/**
 * Удаляет персонажа из синхронного in-memory кэша.
 * Вызывается при очистке локальной копии: без этого следующий
 * saveCharacterApi перезаписывал бы «удалённого» обратно в localStorage
 * (баг воскрешения из аудита #5).
 */
export function removeFromMemoryCache(id: string): void {
  delete inMemoryCharactersCache[id];
}

/**
 * Checks if the application is running inside the Owlbear Rodeo iframe environment.
 * Реализация перенесена в utils/environment.ts (реэкспорт выше) — единая точка
 * для auth/модулей без циклических импортов.
 */

const GRANULAR_KEY_PREFIX = 'com.antigravity.dnd-sheet/v2/character/';

/**
 * Гранулярная запись лёгкого зеркала ОДНОГО персонажа в отдельный ключ
 * localStorage. Главное зеркало 'dnd-characters' при обычных сейвах больше
 * НЕ переписывается целиком: вместо сериализации всех персонажей пишется
 * один маленький ключ (главный фикс записи).
 *
 * lightEntry — запись БЕЗ imageCache: { character, log, history:{past,future}, lastModified }.
 */
export function saveCharacterMirrorToGranularKey(id: string, lightEntry: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !id) return;
  const key = GRANULAR_KEY_PREFIX + id;
  try {
    localStorage.setItem(key, JSON.stringify(lightEntry));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      logger.warn(`[DND Sheet] LocalStorage quota exceeded for granular key "${key}". Retrying without base64...`);
      try {
        localStorage.setItem(key, JSON.stringify(stripBase64(lightEntry)));
        logger.debug('[DND Sheet] Granular key saved after stripping base64.');
      } catch (innerErr) {
        logger.error('[DND Sheet] Failed to save granular key even after stripping base64:', innerErr);
      }
    } else {
      logger.error('[DND Sheet] Granular localStorage save failed with unexpected error:', e);
    }
  }
}

/**
 * Удаляет гранулярные ключи зеркала персонажа из localStorage.
 * Вызывается на всех путях удаления персонажа.
 */
export function removeCharacterMirrorKeys(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    localStorage.removeItem(GRANULAR_KEY_PREFIX + id);
  } catch (e) {}
}

import { SESSION_CLIENT_ID } from './sessionId';
export { SESSION_CLIENT_ID };

// isOwlbear импортируется из ./environment и реэкспортируется выше (см. шапку файла)

/**
 * Minifies a full Character sheet to a lightweight format to save space in VTT metadata (under 1KB).
 */
export function minifyCharacter(char: Character): Record<string, unknown> {
  if (!char) return char;
  // If it's already minified (e.g. missing STR in scores or missing savingThrowProficiencies), return it as is
  if (!char.savingThrowProficiencies || !char.scores || typeof char.scores.STR === 'undefined') {
    return char as unknown as Record<string, unknown>;
  }

  const min: Record<string, unknown> = {};

  for (const field of CHARACTER_BASIC_FIELDS) {
    if (char[field as keyof Character] !== undefined) {
      min[field] = char[field as keyof Character];
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
  if (Array.isArray(char.inventory)) {
    const inv: Array<{ index: number; item: InventoryItem }> = [];
    char.inventory.forEach((item, index) => {
      if (item) inv.push({ index, item });
    });
    if (inv.length > 0) min.inv = inv;
  }

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
  if (char.boundRooms && char.boundRooms.length > 0) min.boundRooms = char.boundRooms;

  return min;
}

/**
 * Reconstructs a full Character sheet from minified cloud data, merging it with defaults.
 */
export function unminifyCharacter(min: unknown): Character {
  if (!min || typeof min !== 'object') return structuredClone(defaultCharacterState);
  const m = min as Record<string, unknown>;
  if (m.scores && typeof m.scores === 'object' && !Array.isArray(m.scores) && 'STR' in m.scores) {
    const fullChar = structuredClone(min as Character);
    // Защитная нормализация инвентаря для уже развёрнутого персонажа (legacy-данные со срезанным размером)
    const rows = typeof fullChar.inventoryRows === 'number' && fullChar.inventoryRows > 0 ? fullChar.inventoryRows : 5;
    const invSize = rows * INVENTORY_COLUMNS;
    if (!Array.isArray(fullChar.inventory)) {
      fullChar.inventory = Array(invSize).fill(null);
    } else if (fullChar.inventory.length < invSize) {
      const padded = [...fullChar.inventory];
      while (padded.length < invSize) padded.push(null);
      fullChar.inventory = padded;
    } else if (fullChar.inventory.length > invSize) {
      fullChar.inventory = fullChar.inventory.slice(0, invSize);
    }
    return fullChar;
  }
  
  const char: Character = structuredClone(defaultCharacterState);

  for (const field of CHARACTER_BASIC_FIELDS) {
    if (m[field] !== undefined) {
      (char as unknown as Record<string, unknown>)[field] = m[field];
    }
  }

  // Scores
  if (Array.isArray(m.scores) && m.scores.length === 6) {
    char.scores.STR = Number(m.scores[0]);
    char.scores.DEX = Number(m.scores[1]);
    char.scores.CON = Number(m.scores[2]);
    char.scores.INT = Number(m.scores[3]);
    char.scores.WIS = Number(m.scores[4]);
    char.scores.CHA = Number(m.scores[5]);
  }

  // Saving throw proficiencies
  if (Array.isArray(m.stProf)) {
    for (const ability of m.stProf) {
      if (char.savingThrowProficiencies[ability as Ability] !== undefined) {
        char.savingThrowProficiencies[ability as Ability] = true;
      }
    }
  }

  // Ability bonuses
  if (m.abBonus && typeof m.abBonus === 'object') {
    for (const [ability, bonus] of Object.entries(m.abBonus as Record<string, unknown>)) {
      if (char.abilityBonuses[ability as Ability] !== undefined) {
        char.abilityBonuses[ability as Ability] = Number(bonus);
      }
    }
  }

  // Saving throw bonuses
  if (m.stBonus && typeof m.stBonus === 'object') {
    for (const [ability, bonus] of Object.entries(m.stBonus as Record<string, unknown>)) {
      if (char.savingThrowBonuses[ability as Ability] !== undefined) {
        char.savingThrowBonuses[ability as Ability] = Number(bonus);
      }
    }
  }

  // Skills
  if (m.skillProf && typeof m.skillProf === 'object') {
    for (const [skillName, prof] of Object.entries(m.skillProf as Record<string, unknown>)) {
      if (char.skills[skillName]) {
        char.skills[skillName].proficiency = Number(prof);
      }
    }
  }

  // Skill bonuses
  if (m.skillBonus && typeof m.skillBonus === 'object') {
    for (const [skillName, bonus] of Object.entries(m.skillBonus as Record<string, unknown>)) {
      if (char.skillBonuses[skillName] !== undefined) {
        char.skillBonuses[skillName] = Number(bonus);
      }
    }
  }

  // AC ability sources
  if (Array.isArray(m.acSources)) {
    for (const ability of Object.keys(char.acAbilitySources)) {
      char.acAbilitySources[ability as Ability] = false;
    }
    for (const ability of m.acSources) {
      if (char.acAbilitySources[ability as Ability] !== undefined) {
        char.acAbilitySources[ability as Ability] = true;
      }
    }
  }

  // Inventory (10 колонок на ряд, по умолчанию 5 * 10 = 50 слотов)
  const invRows = typeof char.inventoryRows === 'number' && char.inventoryRows > 0 ? char.inventoryRows : 5;
  const invSize = invRows * INVENTORY_COLUMNS;
  char.inventory = Array(invSize).fill(null);
  if (Array.isArray(m.inv)) {
    for (let i = 0; i < m.inv.length; i++) {
      const entry = m.inv[i];
      if (!entry) continue;
      if (typeof entry === 'object' && 'index' in entry && typeof (entry as { index: unknown }).index === 'number') {
        const itemEntry = entry as { index: number; item: InventoryItem };
        if (itemEntry.index >= 0 && itemEntry.index < invSize) {
          char.inventory[itemEntry.index] = itemEntry.item;
        }
      } else if (i < invSize) {
        // Защитная нормализация: поддержка плоского legacy-массива в m.inv
        char.inventory[i] = entry as InventoryItem;
      }
    }
  } else if (Array.isArray(m.inventory)) {
    // Защитная нормализация: поддержка плоского legacy-поля m.inventory
    const len = Math.min(m.inventory.length, invSize);
    for (let i = 0; i < len; i++) {
      const item = m.inventory[i];
      char.inventory[i] = (item as InventoryItem | undefined) ?? null;
    }
  }

  // Currency
  if (m.cur && typeof m.cur === 'object') {
    for (const [coin, amount] of Object.entries(m.cur as Record<string, unknown>)) {
      if (char.currency[coin as Currency] !== undefined) {
        char.currency[coin as Currency] = Number(amount);
      }
    }
  }

  // Spell slots
  if (m.slots) {
    for (const [lvlStr, slotData] of Object.entries(m.slots as Record<string, [number, number]>)) {
      const lvl = Number(lvlStr);
      if (char.spellSlots[lvl] && Array.isArray(slotData)) {
        const [total, used] = slotData;
        char.spellSlots[lvl] = { total: Number(total), used: Number(used) };
      }
    }
  }

  // Arrays
  if (Array.isArray(m.features)) char.features = m.features as typeof char.features;
  if (Array.isArray(m.featureGroups)) char.featureGroups = m.featureGroups as typeof char.featureGroups;
  if (Array.isArray(m.attacks)) char.attacks = m.attacks as typeof char.attacks;
  if (Array.isArray(m.spells)) char.spells = m.spells as typeof char.spells;
  if (Array.isArray(m.notes)) char.notes = m.notes as typeof char.notes;
  if (Array.isArray(m.noteGroups)) {
    char.noteGroups = (m.noteGroups as Array<Record<string, unknown>>).map((g) => ({
      id: typeof g.id === 'string' ? g.id : '',
      name: typeof g.name === 'string' ? g.name : '',
      ...(typeof g.isCollapsed === 'boolean' ? { isCollapsed: g.isCollapsed } : {}),
      noteIds: Array.isArray(g.noteIds) ? (g.noteIds as string[]).filter((id): id is string => typeof id === 'string') : [],
    }));
  }
  if (Array.isArray(m.tabOrder) && m.tabOrder.length > 0) char.tabOrder = m.tabOrder as typeof char.tabOrder;
  if (m.collapsedTabs) char.collapsedTabs = m.collapsedTabs as typeof char.collapsedTabs;
  if (Array.isArray(m.equippedItems)) char.equippedItems = m.equippedItems as typeof char.equippedItems;
  if (Array.isArray(m.boundRooms)) char.boundRooms = m.boundRooms as typeof char.boundRooms;

  return char;
}

// Compresses any JSON object into a Gzip base64 string if supported
// (compressData/decompressData удалены вместе с мёртвым metadata-слоем:
// Room Metadata больше не используется для хранения персонажей — только
// локальные localStorage + IndexedDB.)

// Helper to clean base64 data URLs recursively from any object
export function stripBase64<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      if (obj.startsWith('data:')) {
        return '' as unknown as T; // Strip base64 data URL to protect OBR limits
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stripBase64) as unknown as T;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = stripBase64(value);
  }
  return cleaned as T;
}

// Merges local base64 images and stripped description texts from LocalStorage back into loaded cloud data.
// (План 2.5: логика восстановления вынесена в utils/restoreStripped.ts —
// единая точка для дискового и memory-бэкапов.)
export const restoreLocalData = <T extends Record<string, unknown>>(cloudData: T, localBackup: Record<string, unknown> | null | undefined): T => {
  if (!cloudData) return cloudData;
  if (!localBackup) return cloudData;

  const restored = { ...cloudData };
  for (const [id, item] of Object.entries(restored)) {
    const cloudEntry = item as Record<string, unknown> | null | undefined;
    const localEntry = localBackup[id] as Record<string, unknown> | null | undefined;
    if (cloudEntry && localEntry && cloudEntry.character && localEntry.character) {
      cloudEntry.imageCache = mergeImageCacheEntries(
        Array.isArray(cloudEntry.imageCache) ? (cloudEntry.imageCache as [string, string][]) : [],
        Array.isArray(localEntry.imageCache) ? (localEntry.imageCache as [string, string][]) : [],
      );
      // Обе стороны — минифицированные записи инвентаря {index,item}.
      restoreStrippedCharacter(
        cloudEntry.character as Parameters<typeof restoreStrippedCharacter>[0],
        localEntry.character as Parameters<typeof restoreStrippedCharacter>[1],
        true,
        true
      );
    }
  }
  return restored;
};

/**
 * Loads character data from local stores (IndexedDB primary + localStorage mirror)
 * / Vite dev server fallback.
 */
export async function loadCharactersApi(): Promise<Record<string, Record<string, unknown>> | null> {
  const restoreGranularData = (rawData: Record<string, Record<string, unknown>> | null): Record<string, Record<string, unknown>> | null => {
    if (!rawData) return null;
    const restored: Record<string, Record<string, unknown>> = {};
    for (const [id, item] of Object.entries(rawData)) {
      const entry = item;
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
  const rawData: Record<string, Record<string, unknown>> = { ...localBackup };

  // 1. Auto-recover characters from granular localStorage keys
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(GRANULAR_KEY_PREFIX)) {
          const charId = key.replace(GRANULAR_KEY_PREFIX, '');
          if (charId && (!rawData[charId] || !rawData[charId].character)) {
            const rawVal = localStorage.getItem(key);
            if (rawVal) {
              try {
                rawData[charId] = JSON.parse(rawVal);
                logger.debug(`[DND Sheet Recovery] Restored character ${charId} from granular localStorage key.`);
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {}
  }

  // 2. IndexedDB — ПЕРВИЧНОЕ долговременное хранилище записей (решение аудита:
  // Room Metadata не используется из-за малого лимита; localStorage — лишь
  // лёгкое зеркало без base64). Записи в IDB приоритетнее зеркала.
  const idbKeys = await imageDb.keys().catch(() => [] as string[]);
  const idbCoveredIds = new Set<string>();
  for (const key of idbKeys) {
    if (typeof key !== 'string' || !key.startsWith(CHAR_FULL_PREFIX)) continue;
    const charId = key.slice(CHAR_FULL_PREFIX.length);
    if (!charId) continue;
    try {
      const fullEntry = await imageDb.get<Record<string, unknown>>(key);
      if (fullEntry && typeof fullEntry === 'object' && fullEntry.character) {
        rawData[charId] = { ...fullEntry };
        idbCoveredIds.add(charId);
      }
    } catch (e) {}
  }

  // 3. Одноразовая миграция легаси-записей (есть локально, нет в IDB) → IDB.
  let migratedCount = 0;
  for (const [id, entry] of Object.entries(rawData)) {
    if (idbCoveredIds.has(id) || !entry?.character) continue;
    try {
      await saveCharacterFullToIndexedDb(id, entry);
      migratedCount++;
    } catch (e) {}
  }

  // Save recovered/migrated items back to the light localStorage mirror
  if (Object.keys(rawData).length > Object.keys(localBackup).length || migratedCount > 0) {
    saveToLocalStorage(toLightMirror(rawData));
  }

  // Asynchronously load imageCache lists from IndexedDB and merge them with local storage
  for (const id of Object.keys(rawData)) {
    try {
      const existingCacheMap = new Map<string, string>();
      const rawCache = rawData[id]?.imageCache;
      if (Array.isArray(rawCache)) {
        for (const [k, v] of rawCache) {
          if (k && v) existingCacheMap.set(k, v);
        }
      } else if (rawCache instanceof Map) {
        for (const [k, v] of rawCache.entries()) {
          if (k && v) existingCacheMap.set(k, v);
        }
      } else if (rawCache && typeof rawCache === 'object') {
        for (const [k, v] of Object.entries(rawCache)) {
          if (k && typeof v === 'string') existingCacheMap.set(k, v);
        }
      }

      const imageCacheArray = await imageDb.get('char-images/' + id);
      if (imageCacheArray && Array.isArray(imageCacheArray)) {
        for (const [k, v] of imageCacheArray) {
          if (k && v) existingCacheMap.set(k, v);
        }
      }

      if (rawData[id]) {
        rawData[id].imageCache = Array.from(existingCacheMap.entries());
      }
    } catch (err) {
      logger.error(`Failed to load images from IndexedDB for ${id}:`, err);
    }

    // Update our synchronous in-memory cache with the full data
    if (rawData[id]) {
      inMemoryCharactersCache[id] = rawData[id];
    }
  }

  return restoreGranularData(rawData);
}

/** Префикс ключей полного хранения записей персонажей в IndexedDB. */
const CHAR_FULL_PREFIX = 'char-full/';

/**
 * Сохраняет запись персонажа в IndexedDB БЕЗ base64-изображений
 * (они живут отдельно в `char-images/{id}`). Это первичное долговременное
 * хранилище: у IndexedDB нет лимитов localStorage.
 */
async function saveCharacterFullToIndexedDb(id: string, characterData: Record<string, unknown>): Promise<void> {
  const { imageCache, ...lightEntry } = characterData ?? {};
  void imageCache;
  await imageDb.set(CHAR_FULL_PREFIX + id, lightEntry);
}

/**
 * Строит лёгкое зеркало кэша для localStorage: записи без imageCache,
 * чтобы base64-картинки не выедали квоту (аудит #16). Картинки восстанавливаются
 * при загрузке из `char-images/{id}`.
 */
function toLightMirror(cache: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(cache)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const { imageCache, ...rest } = v;
      void imageCache;
      out[k] = rest;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Размер чанка полезной нагрузки при вещании в комнату (лимит VTT ~64KB на пакет). */
export const MAX_BROADCAST_CHUNK_SIZE = 20000;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Global in-memory cache to track what has already been broadcasted to peers in the current session
const lastSentImagesCache: Record<string, { portraitUrl: string, imageCacheKeys: Set<string> }> = {};

// P2 аудита: картинки, отклонённые по размеру (>500KB). Не рекламируются
// повторно, пока не изменятся; очищается вместе с персонажем.
const oversizedImageSkip: Record<string, Set<string>> = {};

// Повторы при rate-limit Owlbear SDK: 3 попытки с экспоненциальной задержкой.
const BROADCAST_SEND_RETRIES = 3;

/**
 * Отправляет сообщение в sync-канал с retry/backoff вместо тихого обрыва
 * (баг аудита #3b): раньше один rate-limit рвал передачу без повторов,
 * и получатель вечно ждал недостающий чанк.
 */
async function sendSyncMessageWithRetry(payload: Record<string, unknown>): Promise<boolean> {
  for (let attempt = 0; attempt < BROADCAST_SEND_RETRIES; attempt++) {
    try {
      await OBR.broadcast.sendMessage(SYNC_CHANNEL, payload);
      return true;
    } catch {
      if (attempt === BROADCAST_SEND_RETRIES - 1) break;
      await delay(250 * Math.pow(2, attempt)); // 250 → 500 → 1000ms
    }
  }
  return false;
}

/**
 * Broadcasts a large string by splitting it into smaller chunks under the 64KB VTT broadcast limit.
 *
 * @param syncId Идентификатор передачи — все чанки одной картинки/листа несут его,
 *               чтобы получатель собирал их вместе и отличал от других передач.
 * @returns true, если все чанки доставлены; false — если передача оборвалась
 *          (получатель подчистит частичный буфер через stale-GC).
 */
export async function broadcastLargeString(
  id: string,
  imgId: string,
  isPortrait: boolean,
  fullString: string,
  syncId: string = generateUUID(),
): Promise<boolean> {
  if (!fullString) return true;
  const totalLength = fullString.length;
  const chunkCount = Math.ceil(totalLength / MAX_BROADCAST_CHUNK_SIZE);

  for (let i = 0; i < chunkCount; i++) {
    const chunkStr = fullString.slice(i * MAX_BROADCAST_CHUNK_SIZE, (i + 1) * MAX_BROADCAST_CHUNK_SIZE);
    // Фикс бага #1 аудита: тип 'CHARACTER_IMAGE_CHUNK_SYNC' — ровно тот же литерал,
    // что слушает приёмник. Раньше отправитель слал 'IMAGE_CHUNK_SYNC' и картинки
    // никогда не доходили.
    const ok = await sendSyncMessageWithRetry({
      type: SyncMessageType.CHARACTER_IMAGE_CHUNK_SYNC,
      id,
      senderClientId: SESSION_CLIENT_ID,
      imgId,
      isPortrait,
      syncId,
      chunkIndex: i,
      totalChunks: chunkCount,
      chunkData: chunkStr,
    });
    if (!ok) return false;
    // Add a small delay between chunks to avoid RateLimitHit (Too many requests)
    await delay(80);
  }
  return true;
}

/**
 * Broadcasts character data. Sends the sheet data (without base64 images) on every edit,
 * but ONLY sends portrait or item images if they have actually changed or are new.
 */
export async function broadcastCharacterSync(id: string, minifiedCharData: RawCharacterStorageData | Record<string, unknown>, forceSyncImages: boolean | string[] = false): Promise<void> {
  if (!isOwlbear()) return;

  // Фикс бага #2 аудита: роль берётся из roleService (кэш + OBR.player.onChange),
  // а не из window.__userRole, который никогда нигде не записывался.
  const isGM = getCachedRole() === 'GM';
  const activeBroadcastId = p2pRoomBridge.getActiveBoardCharacterId();

  if (!isGM && activeBroadcastId !== id) {
    logger.debug(`[DND Sheet] Skipping broadcastCharacterSync for character ${id} (GM Broadcast toggle is OFF).`);
    return;
  }

  try {
    // Initialize our sent tracker for this character if not present
    if (!lastSentImagesCache[id]) {
      lastSentImagesCache[id] = { portraitUrl: '', imageCacheKeys: new Set() };
    }

    // Create the lightweight sheet data by extracting images into tokens.
    const fullChar = unminifyCharacter(minifiedCharData.character);
    const { light, images: newExtractedImages } = extractImages(fullChar);

    // Merge new extracted images with the existing imageCache list
    const combinedImageCacheMap = new Map<string, string>();
    if (Array.isArray(minifiedCharData.imageCache)) {
      for (const [imgId, imgVal] of minifiedCharData.imageCache) {
        combinedImageCacheMap.set(imgId, imgVal);
      }
    }
    for (const [imgId, imgVal] of newExtractedImages.entries()) {
      combinedImageCacheMap.set(imgId, imgVal);
    }

    // Determine which images actually need to be sent (changed or forced)
    const oversizeSkipped = oversizedImageSkip[id];
    const imagesToSync: string[] = [];
    for (const [imgId, imgVal] of combinedImageCacheMap.entries()) {
      if (imgVal && imgVal.startsWith('data:')) {
        // P2 аудита: недоставляемые (>500KB) картинки не рекламируем повторно
        if (oversizeSkipped?.has(imgId)) continue;

        const isPortrait = imgId === 'img:ref:portrait';
        const hasChanged = isPortrait
          ? imgVal !== lastSentImagesCache[id].portraitUrl
          : !lastSentImagesCache[id].imageCacheKeys.has(imgId);

        const mustSync = (forceSyncImages === true) ||
                         (Array.isArray(forceSyncImages) && forceSyncImages.includes(imgId)) ||
                         hasChanged;

        if (mustSync) {
          imagesToSync.push(imgId);
        }
      }
    }

    const minifiedLight = minifyCharacter(light);
    const strippedData = {
      ...minifiedCharData,
      character: minifiedLight,
      imageCache: [],
      syncImageIds: imagesToSync,
      history: {
        past: [],
        future: []
      }
    };

    // Все чанки этой передачи (лист + картинки) несут общий syncId — приёмник
    // собирает их в отдельном буфере и не смешивает со следующей версией листа.
    const syncId = generateUUID();

    // Broadcast the lightweight sheet (extremely small, usually <3KB, so it's 1 chunk)
    const jsonStr = JSON.stringify(strippedData);
    const totalLength = jsonStr.length;
    const chunkCount = Math.ceil(totalLength / MAX_BROADCAST_CHUNK_SIZE);

    let senderPlayerId = '';
    try {
      senderPlayerId = OBR.player?.id || '';
    } catch {
      /* player API недоступен */
    }

    for (let i = 0; i < chunkCount; i++) {
      const chunkStr = jsonStr.slice(i * MAX_BROADCAST_CHUNK_SIZE, (i + 1) * MAX_BROADCAST_CHUNK_SIZE);
      const ok = await sendSyncMessageWithRetry({
        type: SyncMessageType.CHARACTER_CHUNK_SYNC,
        id,
        senderClientId: SESSION_CLIENT_ID,
        senderPlayerId,
        syncId,
        chunkIndex: i,
        totalChunks: chunkCount,
        chunkData: chunkStr,
      });
      if (!ok) {
        logger.warn(`[DND Sheet] Не удалось доставить лист ${id} (чанк ${i}/${chunkCount}) после ${BROADCAST_SEND_RETRIES} попыток.`);
        return; // частичная передача будет подчистена stale-GC у приёмников
      }
    }

    // Broadcast portrait and all other imageCache entries that need syncing.
    // ВАЖНО: изображение помечается «отправленным» ТОЛЬКО после успешной доставки
    // (раньше метка ставилась до отправки — сбой сети навсегда терял картинку).
    for (const imgId of imagesToSync) {
      const imgVal = combinedImageCacheMap.get(imgId);
      if (!imgVal) continue;

      const isPortrait = imgId === 'img:ref:portrait';

      // Only attempt room broadcast if image size is within reasonable VTT limits.
      // P2 аудита: заносим в skip-list, чтобы не спамить warn и syncImageIds
      // на каждом сейве — картинка физически недоставляема этим каналом.
      if (imgVal.length >= 500000) {
        if (!oversizedImageSkip[id]) oversizedImageSkip[id] = new Set();
        oversizedImageSkip[id].add(imgId);
        logger.warn(`[DND Sheet] Изображение ${imgId} (${Math.round(imgVal.length / 1024)}KB) превышает лимит вещания — исключено из синка до изменения.`);
        continue;
      }

      const ok = await broadcastLargeString(id, imgId, isPortrait, imgVal, syncId);
      if (!ok) {
        logger.warn(`[DND Sheet] Доставка изображения ${imgId} для ${id} прервана — будет повторено при следующем синке.`);
        break; // последующие картинки тоже считаются неотправленными
      }

      if (isPortrait) {
        lastSentImagesCache[id].portraitUrl = imgVal;
      } else {
        lastSentImagesCache[id].imageCacheKeys.add(imgId);
      }
      await delay(150);
    }
  } catch (error) {
    logger.warn(`[DND Sheet] Owlbear broadcast skipped for ${id} (VTT room offline or disconnected).`);
  }
}

/**
 * Saves a single character's data to local storage backup and broadcasts it to other players in the room.
 */
export async function saveCharacterApi(id: string, characterData: RawCharacterStorageData | Record<string, unknown>): Promise<void> {
  const fullChar = unminifyCharacter(characterData.character);
  const { light, images: newExtractedImages } = extractImages(fullChar);

  const combinedImageCacheMap = new Map<string, string>();
  if (Array.isArray(characterData.imageCache)) {
    for (const [imgId, imgVal] of characterData.imageCache) {
      if (imgId && imgVal) combinedImageCacheMap.set(imgId, imgVal);
    }
  } else if (characterData.imageCache instanceof Map) {
    for (const [imgId, imgVal] of characterData.imageCache.entries()) {
      if (imgId && imgVal) combinedImageCacheMap.set(imgId, imgVal);
    }
  } else if (characterData.imageCache && typeof characterData.imageCache === 'object') {
    for (const [imgId, imgVal] of Object.entries(characterData.imageCache)) {
      if (imgId && typeof imgVal === 'string') combinedImageCacheMap.set(imgId, imgVal);
    }
  }
  for (const [imgId, imgVal] of newExtractedImages.entries()) {
    if (imgId && imgVal) combinedImageCacheMap.set(imgId, imgVal);
  }

  // Preserve pre-existing images from IndexedDB if present
  try {
    const existingDbImages = await imageDb.get('char-images/' + id);
    if (Array.isArray(existingDbImages)) {
      for (const [imgId, imgVal] of existingDbImages) {
        if (imgId && imgVal && imgVal.startsWith('data:image/') && !combinedImageCacheMap.has(imgId)) {
          combinedImageCacheMap.set(imgId, imgVal);
        }
      }
    }
  } catch (e) {}

  const imageCacheArray = Array.from(combinedImageCacheMap.entries());
  const minifiedCharData = {
    ...characterData,
    character: minifyCharacter(light),
    imageCache: imageCacheArray
  };

  // 1. Update in-memory cache with full representation (including images)
  inMemoryCharactersCache[id] = minifiedCharData;

  // 2. Save imageCache array to IndexedDB
  try {
    await imageDb.set('char-images/' + id, imageCacheArray);
  } catch (err) {
    logger.error(`Failed to save images to IndexedDB for ${id}:`, err);
  }

  // 3. Save the full entry (без base64) в PRIMARY хранилище — IndexedDB.
  try {
    await saveCharacterFullToIndexedDb(id, minifiedCharData);
  } catch (err) {
    logger.error(`Failed to save character entry to IndexedDB for ${id}:`, err);
  }

  // 4. Лёгкое зеркало (без base64 и без imageCache) — ОДИН гранулярный ключ
  // для этого персонажа. Главное зеркало 'dnd-characters' при обычных сейвах
  // больше НЕ переписывается (читается с наложением гранулярных записей).
  const entryLog = Array.isArray(characterData.log) ? characterData.log : [];
  const charHistory = characterData.history as { past?: unknown[]; future?: unknown[] } | undefined;
  saveCharacterMirrorToGranularKey(id, {
    character: minifiedCharData.character,
    log: entryLog,
    history: {
      past: charHistory?.past || [],
      future: charHistory?.future || [],
    },
    lastModified: (typeof characterData.lastModified === 'number' ? characterData.lastModified : undefined) || (entryLog[0]?.timestamp) || Date.now(),
  });

  if (isOwlbear()) {
    await broadcastCharacterSync(id, minifiedCharData);
  } else {
    await saveToLocalDevApi(inMemoryCharactersCache);
  }
}

/**
 * ПОЛНАЯ зачистка персонажа со ВСЕХ локальных хранилищ (P0 финального аудита).
 *
 * Единственная точка правды для всех путей удаления. До этого три из четырёх
 * путей чистили подмножество сторов, из-за чего персонаж «воскресал»:
 *  - memory-cache overlay в loadFromLocalStorage возвращал его живой вкладке;
 *  - IndexedDB `char-full/{id}` как PRIMARY хранилище воскрешал после reload.
 *
 * Порядок важен: removeFromMemoryCache СТРОГО до чтения зеркала, иначе
 * memory-overlay запишет «удалённого» обратно при сохранении.
 */
export async function purgeLocalCharacter(id: string): Promise<void> {
  // 1. Память первой (см. порядок выше)
  removeFromMemoryCache(id);

  // 2. Главное зеркало
  const localData = loadFromLocalStorage();
  if (localData[id]) {
    delete localData[id];
    saveToLocalStorage(localData);
  }

  // 3. Granular ключ-зеркало
  removeCharacterMirrorKeys(id);

  // 4. IndexedDB: картинки + полная запись
  try {
    await imageDb.delete('char-images/' + id);
    await imageDb.delete(CHAR_FULL_PREFIX + id);
  } catch (err) {
    logger.error(`Failed to purge IndexedDB data for ${id}:`, err);
  }

  // 5. Сессионный кеш отправленных картинок + skip-list недоставляемых
  delete lastSentImagesCache[id];
  delete oversizedImageSkip[id];
}

/**
 * Deletes a single character's data from local storage.
 */
export async function deleteCharacterApi(id: string): Promise<void> {
  await purgeLocalCharacter(id);

  if (!isOwlbear()) {
    const localData = loadFromLocalStorage();
    await saveToLocalDevApi(localData);
  }
}

export function loadFromLocalStorage(): Record<string, Record<string, unknown>> {
  if (typeof window === 'undefined') return {};
  let diskData: Record<string, Record<string, unknown>> = {};
  try {
    const raw = localStorage.getItem('dnd-characters');
    if (raw) {
      diskData = JSON.parse(raw);
    }
  } catch (e) {}

  // Гранулярные записи свежее главного зеркала: обычные сейвы пишут только
  // в отдельные ключи. Накладываем их ПОВЕРХ 'dnd-characters', чтобы все
  // читатели loadFromLocalStorage() видели актуальные данные без правок.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(GRANULAR_KEY_PREFIX)) continue;
      const charId = key.slice(GRANULAR_KEY_PREFIX.length);
      if (!charId) continue;
      const rawVal = localStorage.getItem(key);
      if (!rawVal) continue;
      try {
        diskData[charId] = JSON.parse(rawVal);
      } catch (e) {}
    }
  } catch (e) {}

  return { ...diskData, ...inMemoryCharactersCache };
}

export function saveToLocalStorage(characters: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const serializeSafely = (data: unknown) =>
    JSON.stringify(data, (_key, val) => (val instanceof Map ? Object.fromEntries(val.entries()) : val));

  try {
    localStorage.setItem('dnd-characters', serializeSafely(characters));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      logger.warn('[DND Sheet] LocalStorage quota exceeded. Stripping base64 from all local backups to free space...');
      // Strip base64 from all characters in the object to shrink them down
      const cleaned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(characters)) {
        cleaned[key] = stripBase64(val);
      }
      try {
        localStorage.setItem('dnd-characters', serializeSafely(cleaned));
        logger.debug('[DND Sheet] LocalStorage successfully cleared of giant images and saved.');
      } catch (innerErr) {
        logger.error('[DND Sheet] Failed to save even after stripping base64:', innerErr);
      }
    } else {
      logger.error('[DND Sheet] LocalStorage save failed with unexpected error:', e);
    }
  }
}

async function saveToLocalDevApi(characters: Record<string, unknown>): Promise<unknown> {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    saveToLocalStorage(characters);
    return { success: true };
  }
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
    saveToLocalStorage(characters);
    return { success: true };
  }
}

// Synchronous base64 encoding/decoding удалены: единственный потребитель
// (URL payload) больше не использует их.

const KNOWN_ROOMS_KEY = 'com.antigravity.dnd-sheet/known_rooms';

export function getKnownRooms(): Array<{ id: string; name: string; lastSeen: number }> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KNOWN_ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function registerCurrentRoom(id: string, name: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    const current = getKnownRooms();
    const filtered = current.filter(r => r.id !== id);
    const updated = [{ id, name: name || 'Owlbear Room', lastSeen: Date.now() }, ...filtered].slice(0, 10);
    localStorage.setItem(KNOWN_ROOMS_KEY, JSON.stringify(updated));
  } catch (e) {}
}
