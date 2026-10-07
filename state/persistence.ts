import { useEffect, useCallback, useMemo, useRef, type MutableRefObject } from 'react';
import { Character, LogEntry } from '../types';
import { applyImages, extractImages } from '../utils/imageStore';
import { unminifyCharacter, minifyCharacter, saveCharacterApi } from '../utils/storage';
import { isCharacter, migrateCharacterData } from './initialization';
import { CharactersState } from './appReducer';
import { logger } from '../utils/logger';
import { debounce } from '../utils/debounce';
import { PERSISTENCE_SAVE_DEBOUNCE_MS } from '../constants';
import type { NotificationType } from '../components/NotificationToast';

export interface RawCharacterStorageData {
  character?: Character;
  log?: LogEntry[];
  history?: {
    past?: Character[];
    future?: Character[];
    present?: Character;
  };
  imageCache?: [string, string][] | Map<string, string> | Record<string, string>;
  lastModified?: number;
}

/**
 * Безопасно парсит кеш изображений из различных форматов сериализации:
 * - Map<string, string>
 * - Массив пар [string, string][]
 * - Обычный объект Record<string, string> (включая {} из легаси-экспортов)
 * - При отсутствии или любом другом типе возвращает пустой Map (никогда не выбрасывает исключение)
 */
export function parseImageCache(raw: unknown): Map<string, string> {
  if (!raw) {
    return new Map();
  }
  if (raw instanceof Map) {
    return new Map(raw);
  }
  if (Array.isArray(raw)) {
    try {
      const validPairs = raw.filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string'
      );
      return new Map(validPairs);
    } catch {
      return new Map();
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    try {
      const map = new Map<string, string>();
      for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof val === 'string') {
          map.set(key, val);
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }
  return new Map();
}

// Helper to safely parse character data structure from raw metadata
export const parseCharactersData = (data: unknown): CharactersState => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {};
  }
  
  return Object.entries(data as Record<string, unknown>).reduce((acc, [id, charData]) => {
    const item = charData as {
      character?: Character;
      log?: LogEntry[];
      history?: {
        past?: Character[];
        future?: Character[];
        present?: Character;
      };
      imageCache?: unknown;
    };
    
    if (!item) return acc;

    const characterObject = item.character || item.history?.present;
    if (!characterObject) return acc;
    
    const isMinified = characterObject && !('scores' in characterObject && 'STR' in characterObject.scores);
    const fullCharacter = isMinified ? unminifyCharacter(characterObject) : characterObject;

    const migratedData = migrateCharacterData(fullCharacter);
    if (isCharacter(migratedData)) {
      const past = Array.isArray(item.history?.past) ? item.history!.past : [];
      const future = Array.isArray(item.history?.future) ? item.history!.future : [];
      const imageCache = parseImageCache(item.imageCache);
      const presentWithImages = applyImages(migratedData as Character, imageCache);
      
      acc[id] = {
        history: {
          past,
          present: presentWithImages,
          future,
        },
        log: item.log || [],
        imageCache,
      };
    }
    return acc;
  }, {} as CharactersState);
};

// Consistent serialization cache builder
export const serializeForCache = (charData: RawCharacterStorageData | null | undefined): string => {
  if (!charData || !charData.character) return '';
  
  const fullChar = unminifyCharacter(charData.character);
  
  // Extract images to tokenize all raw base64 URLs (like portraitUrl)
  const { light, images: extractedImages } = extractImages(fullChar);
  
  const minifiedChar = minifyCharacter(light);
  
  // Combine stored imageCache and newly extracted images
  const combinedImages = new Map<string, string>();
  
  const storedImages = parseImageCache(charData.imageCache);
    
  for (const [id, val] of storedImages.entries()) {
    combinedImages.set(id, val);
  }
  for (const [id, val] of extractedImages.entries()) {
    combinedImages.set(id, val);
  }
  
  const imageCacheList = Array.from(combinedImages.entries());
  // Sort image cache by key to ensure order independence
  imageCacheList.sort((a, b) => a[0].localeCompare(b[0]));
  
  const cleanCharData = {
    character: minifiedChar,
    log: charData.log || [],
    imageCache: imageCacheList
  };
  
  return JSON.stringify(cleanCharData);
};

export const getChecksum = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

export const getTextChecksum = (charData: RawCharacterStorageData | null | undefined): string => {
  if (!charData || !charData.character) return '';
  const fullChar = unminifyCharacter(charData.character);
  const { light } = extractImages(fullChar);
  const minifiedChar = minifyCharacter(light);
  const cleanText = {
    character: minifiedChar,
    log: charData.log || []
  };
  return getChecksum(JSON.stringify(cleanText));
};

export const getImageChecksums = (charData: RawCharacterStorageData | null | undefined): Record<string, string> => {
  const checksums: Record<string, string> = {};
  if (!charData || !charData.character) return checksums;
  
  const fullChar = unminifyCharacter(charData.character);
  const { images: extractedImages } = extractImages(fullChar);
  
  const storedImages = parseImageCache(charData.imageCache);
    
  for (const [id, val] of storedImages.entries()) {
    if (val && val.startsWith('data:')) {
      checksums[id] = getChecksum(val);
    }
  }
  for (const [id, val] of extractedImages.entries()) {
    if (val && val.startsWith('data:')) {
      checksums[id] = getChecksum(val);
    }
  }
  return checksums;
};

// (restoreFromMemory удалён — P2.4 финального аудита: мёртвый экспорт после
// переезда логики в utils/restoreStripped.ts. Живой потребитель — syncEngine,
// который восстанавливает данные через restoreLocalData из storage.ts.)

export interface SaveEffectDeps {
  characters: CharactersState;
  isLoading: boolean;
  addNotification: (message: string, type?: NotificationType) => void;
  lastSerializedRef: MutableRefObject<Record<string, string>>;
  lastPresentRef: MutableRefObject<Record<string, Character>>;
}

export interface DebouncedSaveController {
  flush: () => void;
  cancel: () => void;
}

export const useSaveEffect = (deps: SaveEffectDeps): DebouncedSaveController => {
  const { characters, isLoading } = deps;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const performSave = useCallback((charsToSave: CharactersState) => {
    const { isLoading, addNotification, lastSerializedRef, lastPresentRef } = depsRef.current;
    if (isLoading) return; // Do not save during initial loading phase

    try {
      const currentCache = { ...lastSerializedRef.current };
      let cacheUpdated = false;

      // Construct raw character structures from React state
      const rawCharacters = Object.entries(charsToSave).reduce((acc, [id, data]) => {
        acc[id] = {
          character: data.history.present,
          log: data.log || [],
          history: {
            past: data.history.past,
            future: data.history.future,
          },
          imageCache: data.imageCache ? Array.from(data.imageCache.entries()) : [],
        };
        return acc;
      }, {} as Record<string, RawCharacterStorageData>);

      // A. Save or update characters that have changes.
      // Reference-based dirty detection: если ссылка present не менялась и запись
      // уже сериализована — пропускаем и сериализацию, и сохранение ПОЛНОСТЬЮ
      // (structuredClone + extractImages + minify + JSON.stringify на каждое
      // изменение любого персонажа были главным CPU-расходом).
      for (const [id, rawChar] of Object.entries(rawCharacters)) {
        if (!rawChar.character) continue;
        const presentRef = rawChar.character;

        // 1. Персонаж не менялся с прошлого прогона — целиком пропускаем.
        if (lastPresentRef.current[id] === presentRef && currentCache[id] !== undefined) {
          continue;
        }

        // 2. Ссылки нет: новый персонаж или первая разметка после загрузки с диска.
        if (lastPresentRef.current[id] === undefined) {
          lastPresentRef.current[id] = presentRef;
          // Сохраняем только полностью нового персонажа; после загрузки с диска
          // запись уже актуальна — только фиксируем базу, НЕ сохраняем.
          if (currentCache[id] === undefined) {
            logger.debug(`[DND Sheet] New character ${id} detected. Saving...`);
            const obrCharData = {
              character: rawChar.character,
              log: rawChar.log ? rawChar.log.slice(0, 10) : [], // Limit log to last 10 items to save space in VTT metadata
              history: {
                past: [],
                future: []
              },
              imageCache: rawChar.imageCache,
              lastModified: rawChar.lastModified || (rawChar.log && rawChar.log[0]?.timestamp) || 0
            };
            currentCache[id] = serializeForCache(obrCharData);
            cacheUpdated = true;
            saveCharacterApi(id, obrCharData);
          }
          continue;
        }

        // 3. Ссылка изменилась (редактирование, UNDO/REDO, удалённый синк).
        const obrCharData = {
          character: rawChar.character,
          log: rawChar.log ? rawChar.log.slice(0, 10) : [], // Limit log to last 10 items to save space in VTT metadata
          history: {
            past: [],
            future: []
          },
          imageCache: rawChar.imageCache,
          lastModified: rawChar.lastModified || (rawChar.log && rawChar.log[0]?.timestamp) || 0
        };

        const serialized = serializeForCache(obrCharData);

        if (currentCache[id] !== serialized) {
          logger.debug(`[DND Sheet] Local change detected for character ${id}. Saving granularly...`);
          currentCache[id] = serialized;
          cacheUpdated = true;
          saveCharacterApi(id, obrCharData);
        }
        lastPresentRef.current[id] = presentRef;
      }

      if (cacheUpdated) {
        lastSerializedRef.current = currentCache;
      }
    } catch (error) {
      logger.error("Critical serialization error:", error);
      addNotification("Критическая ошибка: не удалось подготовить данные для сохранения.", 'error');
    }
  }, []);

  const debouncedSave = useMemo(() => {
    return debounce((charsToSave: CharactersState) => {
      performSave(charsToSave);
    }, PERSISTENCE_SAVE_DEBOUNCE_MS);
  }, [performSave]);

  // Триггер на изменение characters
  useEffect(() => {
    if (isLoading) return;
    debouncedSave(characters);
  }, [characters, isLoading, debouncedSave]);

  // Flush триггеры: beforeunload, visibilitychange (hidden) и unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      debouncedSave.flush();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        debouncedSave.flush();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  return debouncedSave;
};
