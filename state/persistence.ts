import { useEffect, type MutableRefObject } from 'react';
import { Character, LogEntry } from '../types';
import { applyImages, extractImages } from '../utils/imageStore';
import { unminifyCharacter, minifyCharacter, saveCharacterApi } from '../utils/storage';
import { isCharacter, migrateCharacterData } from './initialization';
import { CharactersState } from './appReducer';
import { logger } from '../utils/logger';
import type { NotificationType } from '../components/NotificationToast';

// Helper to safely parse character data structure from raw metadata
export const parseCharactersData = (data: any): CharactersState => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {};
  }
  
  return Object.entries(data).reduce((acc, [id, charData]) => {
    const item = charData as {
      character: any;
      log?: LogEntry[];
      history?: {
        past?: any[];
        future?: any[];
      };
      imageCache?: [string, string][];
    };
    
    if (!item || !item.character) return acc;
    
    const characterObject = item.character;
    const isMinified = characterObject && !('scores' in characterObject && 'STR' in characterObject.scores);
    const fullCharacter = isMinified ? unminifyCharacter(characterObject) : characterObject;

    const migratedData = migrateCharacterData(fullCharacter);
    if (isCharacter(migratedData)) {
      const past = Array.isArray(item.history?.past) ? item.history!.past : [];
      const future = Array.isArray(item.history?.future) ? item.history!.future : [];
      const imageCache = item.imageCache ? new Map(item.imageCache) : new Map();
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
export const serializeForCache = (charData: any): string => {
  if (!charData) return '';
  
  const fullChar = unminifyCharacter(charData.character);
  
  // Extract images to tokenize all raw base64 URLs (like portraitUrl)
  const { light, images: extractedImages } = extractImages(fullChar);
  
  const minifiedChar = minifyCharacter(light);
  
  // Combine stored imageCache and newly extracted images
  const combinedImages = new Map<string, string>();
  
  const storedList = Array.isArray(charData.imageCache) 
    ? charData.imageCache 
    : (charData.imageCache instanceof Map ? Array.from(charData.imageCache.entries()) : []);
    
  for (const [id, val] of storedList) {
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

export const getTextChecksum = (charData: any): string => {
  if (!charData) return '';
  const fullChar = unminifyCharacter(charData.character);
  const { light } = extractImages(fullChar);
  const minifiedChar = minifyCharacter(light);
  const cleanText = {
    character: minifiedChar,
    log: charData.log || []
  };
  return getChecksum(JSON.stringify(cleanText));
};

export const getImageChecksums = (charData: any): Record<string, string> => {
  const checksums: Record<string, string> = {};
  if (!charData) return checksums;
  
  const fullChar = unminifyCharacter(charData.character);
  const { images: extractedImages } = extractImages(fullChar);
  
  const storedList = Array.isArray(charData.imageCache) 
    ? charData.imageCache 
    : (charData.imageCache instanceof Map ? Array.from(charData.imageCache.entries()) : []);
    
  for (const [id, val] of storedList) {
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

interface SaveEffectDeps {
  characters: CharactersState;
  isLoading: boolean;
  addNotification: (message: string, type?: NotificationType) => void;
  lastSerializedRef: MutableRefObject<Record<string, string>>;
  lastPresentRef: MutableRefObject<Record<string, Character>>;
}

export const useSaveEffect = (deps: SaveEffectDeps): void => {
  const { characters, isLoading, addNotification, lastSerializedRef, lastPresentRef } = deps;

  // 3. Save local modifications to the storage/metadata granularly
  useEffect(() => {
    if (isLoading) return; // Do not save during initial loading phase

    try {
      const currentCache = { ...lastSerializedRef.current };
      let cacheUpdated = false;

      // Construct raw character structures from React state
      const rawCharacters = Object.entries(characters).reduce((acc, [id, data]) => {
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
      }, {} as Record<string, any>);

      // A. Save or update characters that have changes.
      // Reference-based dirty detection: если ссылка present не менялась и запись
      // уже сериализована — пропускаем и сериализацию, и сохранение ПОЛНОСТЬЮ
      // (structuredClone + extractImages + minify + JSON.stringify на каждое
      // изменение любого персонажа были главным CPU-расходом).
      for (const [id, rawChar] of Object.entries(rawCharacters)) {
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
  }, [characters, isLoading, addNotification]);
};