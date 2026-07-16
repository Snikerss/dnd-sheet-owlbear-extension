import { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { Character, CharacterAction, HistoryState, LogEntry } from '../types';
import { applyImages, extractImages } from '../utils/imageStore';
import { charactersReducer, CharactersState } from './appReducer';
import { isCharacter, migrateCharacterData } from './initialization';
import { characterReducer } from './characterReducer';
import { generateActionDescription } from '../utils/history';
import { useNotifier } from '../context/NotificationContext';
import { loadCharactersApi, saveCharacterApi, deleteCharacterApi, isOwlbear, unminifyCharacter, stripBase64, minifyCharacter, loadFromLocalStorage, saveToLocalStorage, stripLargeTexts, decompressData, restoreLocalData, mergeCharacter, SESSION_CLIENT_ID, broadcastCharacterSync } from '../utils/storage';

const GRANULAR_KEY_PREFIX = 'com.antigravity.dnd-sheet/v2/character/';

// Helper to safely parse character data structure from raw metadata
const parseCharactersData = (data: any): CharactersState => {
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
const serializeForCache = (charData: any): string => {
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

const getChecksum = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

interface CharacterManager {
  characters: CharactersState;
  isLoading: boolean;
  syncingCharacters: Record<string, { status: 'images', pendingImages: string[] }>;
  addCharacter: (id: string, character: Character) => void;
  deleteCharacter: (id: string) => void;
  updateCharacter: (id: string, action: CharacterAction) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
}

const restoreFromMemory = (cloudData: any, memoryBackup: CharactersState) => {
  if (!cloudData || !memoryBackup) return cloudData;

  const restoreItemImages = (cloudItem: any, memoryItem: any) => {
    if (!cloudItem || !memoryItem) return;
    if (memoryItem.imageUrl && !cloudItem.imageUrl) {
      cloudItem.imageUrl = memoryItem.imageUrl;
    }
    if (memoryItem.description && !cloudItem.description) {
      cloudItem.description = memoryItem.description;
    }
    if (cloudItem.isChest && Array.isArray(cloudItem.chestInventory) && Array.isArray(memoryItem.chestInventory)) {
      cloudItem.chestInventory.forEach((subItem: any, idx: number) => {
        restoreItemImages(subItem, memoryItem.chestInventory[idx]);
      });
    }
  };

  const restored = { ...cloudData };
  for (const [id, item] of Object.entries(restored)) {
    const cloudEntry = item as any;
    const memoryEntry = memoryBackup[id];
    if (cloudEntry && memoryEntry && cloudEntry.character && memoryEntry.history?.present) {
      const cloudChar = cloudEntry.character;
      const memoryChar = memoryEntry.history.present;

      // 1. Restore imageCache
      const cloudCache = cloudEntry.imageCache || [];
      const memoryCache = memoryEntry.imageCache || new Map();
      const mergedCache = [...cloudCache];
      for (const [imgId, imgVal] of memoryCache.entries()) {
        const exists = mergedCache.some(c => c[0] === imgId);
        if (!exists) {
          mergedCache.push([imgId, imgVal]);
        }
      }
      cloudEntry.imageCache = mergedCache;

      // 2. Restore portraitUrl if it was stripped in cloud but present in memory
      if (memoryChar.portraitUrl && !cloudChar.portraitUrl) {
        cloudChar.portraitUrl = memoryChar.portraitUrl;
      }

      // 3. Restore note contents
      if (Array.isArray(cloudChar.notes) && Array.isArray(memoryChar.notes)) {
        cloudChar.notes.forEach((n: any) => {
          const match = memoryChar.notes.find((ln: any) => ln.id === n.id);
          if (match && match.content && !n.content) n.content = match.content;
        });
      }

      // 4. Restore spell descriptions
      if (Array.isArray(cloudChar.spells) && Array.isArray(memoryChar.spells)) {
        cloudChar.spells.forEach((s: any) => {
          const match = memoryChar.spells.find((ls: any) => ls.id === s.id);
          if (match && match.description && !s.description) s.description = match.description;
          if (s.components && match && match.components && match.components.materialDescription && !s.components.materialDescription) {
            s.components.materialDescription = match.components.materialDescription;
          }
        });
      }

      // 5. Restore feature descriptions
      if (Array.isArray(cloudChar.features) && Array.isArray(memoryChar.features)) {
        cloudChar.features.forEach((f: any) => {
          const match = memoryChar.features.find((lf: any) => lf.id === f.id);
          if (match && match.description && !f.description) f.description = match.description;
        });
      }

      // 6. Restore attack notes
      if (Array.isArray(cloudChar.attacks) && Array.isArray(memoryChar.attacks)) {
        cloudChar.attacks.forEach((a: any) => {
          const match = memoryChar.attacks.find((la: any) => la.id === a.id);
          if (match && match.notes && !a.notes) a.notes = match.notes;
        });
      }

      // 7. Restore inventory item images & descriptions
      if (Array.isArray(cloudChar.inventory) && Array.isArray(memoryChar.inventory)) {
        cloudChar.inventory.forEach((invItem: any, idx: number) => {
          const memoryInvItem = memoryChar.inventory[idx];
          if (invItem && memoryInvItem && invItem.item && memoryInvItem.item) {
            restoreItemImages(invItem.item, memoryInvItem.item);
          }
        });
      }

      // 8. Restore equipped item images & descriptions
      if (Array.isArray(cloudChar.equippedItems) && Array.isArray(memoryChar.equippedItems)) {
        cloudChar.equippedItems.forEach((eqItem: any) => {
          const match = memoryChar.equippedItems.find((le: any) => le.id === eqItem.id);
          if (match) {
            restoreItemImages(eqItem, match);
          }
        });
      }
    }
  }
  return restored;
};

export const useCharacterManager = (): CharacterManager => {
  const [characters, dispatch] = useReducer(charactersReducer, {});
  const [isLoading, setIsLoading] = useState(true);
  const [syncingCharacters, setSyncingCharacters] = useState<Record<string, { status: 'images', pendingImages: string[] }>>({});
  const { addNotification } = useNotifier();

  // Track the serialized state of each character individually (indexed by character ID)
  const lastSerializedRef = useRef<Record<string, string>>({});
  const charactersStateRef = useRef<CharactersState>(characters);
  const incomingChunksRef = useRef<Record<string, { chunks: string[], total: number }>>({});

  useEffect(() => {
    charactersStateRef.current = characters;
  }, [characters]);

  // 1. Initial Load of character data
  useEffect(() => {
    loadCharactersApi()
      .then(data => {
        if (data) {
          const parsedState = parseCharactersData(data);
          const cache: Record<string, string> = {};
          for (const [id, charData] of Object.entries(data)) {
            cache[id] = serializeForCache(charData);
          }
          lastSerializedRef.current = cache;
          dispatch({ type: 'SET_CHARACTERS', payload: parsedState });

          // Initialize owned character IDs if not present
          try {
            const owned = localStorage.getItem('dnd-owned-ids');
            if (!owned) {
              localStorage.setItem('dnd-owned-ids', JSON.stringify(Object.keys(parsedState)));
            }
          } catch (e) {}
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to load characters initially:", error);
        addNotification("Ошибка: не удалось загрузить персонажей.", 'error');
        setIsLoading(false);
      });
  }, [addNotification]);



  // 2.5. Real-time peer-to-peer synchronization via broadcast channels
  useEffect(() => {
    if (isOwlbear()) {
      const SYNC_CHANNEL = 'com.antigravity.dnd-sheet/sync';
      
      const handleMessage = async (event: any) => {
        const payload = event.data as {
          type: string;
          id?: string;
          data?: any;
        };
        
        if (!payload) return;
        
        if (payload.type === 'REQUEST_FULL_CHARACTERS') {
          // Someone requested full sheets (e.g. GM joined). Broadcast all our owned sheets!
          try {
            const owned = localStorage.getItem('dnd-owned-ids');
            const ownedList = owned ? JSON.parse(owned) : [];
            const localData = loadFromLocalStorage();
            const cachedVersions = (payload as any).cachedVersions || {};
            
            for (const id of ownedList) {
              const charData = localData[id];
              if (charData) {
                const serialized = serializeForCache(charData);
                const currentChecksum = getChecksum(serialized);
                
                // Skip syncing if requester already has this exact checksum
                if (cachedVersions[id] === currentChecksum) {
                  console.log(`[DND Sheet] Requester already has up-to-date character ${id} (checksum: ${currentChecksum}). Skipping sync.`);
                  continue;
                }
                
                console.log(`[DND Sheet] Checksum mismatch for character ${id}: Requester checksum: "${cachedVersions[id]}", Current checksum: "${currentChecksum}". Syncing...`);
                // Send in separate chunks to avoid exceeding broadcast limits
                await broadcastCharacterSync(id, charData, true);
              }
            }
          } catch (err) {
            console.error('[DND Sheet] Failed to respond to sheet request:', err);
          }
        } else if (payload.type === 'CHARACTER_CHUNK_SYNC' && payload.id && (payload as any).chunkData !== undefined) {
          const charId = payload.id;
          const { chunkIndex, totalChunks, chunkData } = payload as any;
          if ((payload as any).senderClientId === SESSION_CLIENT_ID) {
            return;
          }
          
          const key = `char-sheet/${charId}`;
          if (!incomingChunksRef.current[key]) {
            incomingChunksRef.current[key] = {
              chunks: Array(totalChunks).fill(''),
              total: totalChunks
            };
          }
          
          incomingChunksRef.current[key].chunks[chunkIndex] = chunkData;
          
          const isComplete = incomingChunksRef.current[key].chunks.every(c => c !== '');
          if (isComplete) {
            const assembledVal = incomingChunksRef.current[key].chunks.join('');
            delete incomingChunksRef.current[key];
            
            try {
              const incomingData = JSON.parse(assembledVal);
              const localData = loadFromLocalStorage();
              
              // Unminify and restore images if we have them cached locally
              const restoredCloud = restoreLocalData({ [charId]: incomingData }, localData);
              const parsedState = parseCharactersData(restoredCloud);
              const entry = parsedState[charId];
              
              if (entry) {
                console.log(`[DND Sheet] Received fully assembled remote character sync via P2P for ${charId}. Merging...`);
                
                if (Array.isArray(incomingData.syncImageIds) && incomingData.syncImageIds.length > 0) {
                  console.log(`[DND Sheet] Waiting for ${incomingData.syncImageIds.length} remote images for ${charId}...`);
                  setSyncingCharacters(prev => ({
                    ...prev,
                    [charId]: {
                      status: 'images',
                      pendingImages: incomingData.syncImageIds
                    }
                  }));
                }

                dispatch({
                  type: 'SYNC_REMOTE_CHARACTER',
                  payload: {
                    id: charId,
                    entry
                  }
                });
                // Cache to our local LocalStorage
                try {
                  const currentLocal = loadFromLocalStorage();
                  currentLocal[charId] = restoredCloud[charId];
                  saveToLocalStorage(currentLocal);
                } catch (err) {
                  console.error('Failed to cache remote character to LocalStorage:', err);
                }
                // Also update serialization cache to match so we don't trigger save
                const obrCharData = {
                  character: entry.history.present,
                  log: entry.log || [],
                  history: { past: [], future: [] },
                  imageCache: entry.imageCache ? Array.from(entry.imageCache.entries()) : []
                };
                lastSerializedRef.current[charId] = serializeForCache(obrCharData);
              }
            } catch (err) {
              console.error('[DND Sheet] Failed to parse unified character sync JSON:', err);
            }
          }
        } else if (payload.type === 'IMAGE_CHUNK_SYNC' && payload.id && (payload as any).imgId && (payload as any).chunkData !== undefined) {
          const charId = payload.id;
          const { imgId, isPortrait, chunkIndex, totalChunks, chunkData } = payload as any;
          if ((payload as any).senderClientId === SESSION_CLIENT_ID) {
            return;
          }
          
          const key = `img-${charId}/${imgId}`;
          console.log(`[DND Sheet] Received chunk ${chunkIndex + 1}/${totalChunks} for image ${imgId} of character ${charId}.`);
          if (!incomingChunksRef.current[key]) {
            incomingChunksRef.current[key] = {
              chunks: Array(totalChunks).fill(''),
              total: totalChunks
            };
          }
          
          incomingChunksRef.current[key].chunks[chunkIndex] = chunkData;
          
          const isComplete = incomingChunksRef.current[key].chunks.every(c => c !== '');
          if (isComplete) {
            const assembledVal = incomingChunksRef.current[key].chunks.join('');
            delete incomingChunksRef.current[key];

            setSyncingCharacters(prev => {
              const current = prev[charId];
              if (!current) return prev;
              const pending = current.pendingImages.filter((id: string) => id !== imgId);
              if (pending.length === 0) {
                console.log(`[DND Sheet] All remote images for character ${charId} received successfully!`);
                const next = { ...prev };
                delete next[charId];
                return next;
              }
              return {
                ...prev,
                [charId]: {
                  ...current,
                  pendingImages: pending
                }
              };
            });
            
            if (isPortrait) {
              console.log(`[DND Sheet] Received fully assembled remote portrait for ${charId}.`);
              dispatch({
                type: 'SYNC_REMOTE_CHARACTER_PORTRAIT',
                payload: { id: charId, portraitUrl: assembledVal }
              });
              try {
                const currentLocal = loadFromLocalStorage();
                if (currentLocal[charId] && currentLocal[charId].character) {
                  currentLocal[charId].character.portraitUrl = assembledVal;
                  saveToLocalStorage(currentLocal);
                }
              } catch (err) {
                console.error('Failed to cache remote character portrait to LocalStorage:', err);
              }
            } else {
              console.log(`[DND Sheet] Received fully assembled remote image ${imgId} for ${charId}.`);
              dispatch({
                type: 'SYNC_REMOTE_CHARACTER_IMAGE',
                payload: { id: charId, imgId, imgVal: assembledVal }
              });
              try {
                const currentLocal = loadFromLocalStorage();
                if (currentLocal[charId]) {
                  const imageCacheList = currentLocal[charId].imageCache || [];
                  const exists = imageCacheList.some((c: any) => c[0] === imgId);
                  if (exists) {
                    currentLocal[charId].imageCache = imageCacheList.map((c: any) => c[0] === imgId ? [imgId, assembledVal] : c);
                  } else {
                    imageCacheList.push([imgId, assembledVal]);
                    currentLocal[charId].imageCache = imageCacheList;
                  }
                  saveToLocalStorage(currentLocal);
                }
              } catch (err) {
                console.error('Failed to cache remote character image to LocalStorage:', err);
              }
            }
          }
        } else if (payload.type === 'DELETE_CHARACTER_SYNC' && payload.id) {
          const charId = payload.id;
          if ((payload as any).senderClientId === SESSION_CLIENT_ID) {
            return;
          }
          console.log(`[DND Sheet] Received remote deletion sync via P2P for ${charId}. Removing...`);
          dispatch({ type: 'DELETE_CHARACTER', payload: { id: charId } });
          
          try {
            const localData = loadFromLocalStorage();
            if (localData[charId]) {
              delete localData[charId];
              saveToLocalStorage(localData);
            }
          } catch (err) {
            console.error('Failed to sync deletion to LocalStorage:', err);
          }
        }
      };

      console.log('[DND Sheet] Subscribing to P2P sync channel:', SYNC_CHANNEL);
      const unsubscribe = OBR.broadcast.onMessage(SYNC_CHANNEL, handleMessage);
      
      // Request full sheets on startup to sync with already online players
      const localData = loadFromLocalStorage();
      const cachedVersions: Record<string, string> = {};
      for (const [id, entry] of Object.entries(localData)) {
        if (entry) {
          cachedVersions[id] = getChecksum(serializeForCache(entry));
        }
      }

      OBR.broadcast.sendMessage(SYNC_CHANNEL, { 
        type: 'REQUEST_FULL_CHARACTERS',
        cachedVersions
      }).catch(err => console.warn('[DND Sheet] Initial request broadcast failed:', err));

      return unsubscribe;
    }
  }, []);

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

      // A. Save or update characters that have changes
      for (const [id, rawChar] of Object.entries(rawCharacters)) {
        // Only save/broadcast if we own this character!
        const owned = localStorage.getItem('dnd-owned-ids');
        const ownedList = owned ? JSON.parse(owned) : [];
        if (!ownedList.includes(id)) {
          continue; 
        }

        const obrCharData = {
          character: rawChar.character,
          log: rawChar.log.slice(0, 10), // Limit log to last 10 items to save space in VTT metadata
          history: {
            past: [],
            future: []
          },
          imageCache: rawChar.imageCache
        };

        const serialized = serializeForCache(obrCharData);
        
        if (currentCache[id] !== serialized) {
          console.log(`[DND Sheet] Local change detected for character ${id}. Saving granularly...`);
          currentCache[id] = serialized;
          cacheUpdated = true;
          saveCharacterApi(id, obrCharData);
        }
      }

      if (cacheUpdated) {
        lastSerializedRef.current = currentCache;
      }
    } catch (error) {
      console.error("Critical serialization error:", error);
      addNotification("Критическая ошибка: не удалось подготовить данные для сохранения.", 'error');
    }
  }, [characters, isLoading, addNotification]);

  // --- MEMOIZED ACTION DISPATCHERS ---

  const addCharacter = useCallback((id: string, character: Character) => {
    dispatch({ type: 'ADD_CHARACTER', payload: { id, character } });
    try {
      const owned = localStorage.getItem('dnd-owned-ids');
      const ownedList = owned ? JSON.parse(owned) : [];
      if (!ownedList.includes(id)) {
        ownedList.push(id);
        localStorage.setItem('dnd-owned-ids', JSON.stringify(ownedList));
      }
    } catch (e) {}
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    dispatch({ type: 'DELETE_CHARACTER', payload: { id } });
    deleteCharacterApi(id).catch(console.error);

    if (isOwlbear()) {
      OBR.broadcast.sendMessage('com.antigravity.dnd-sheet/sync', {
        type: 'DELETE_CHARACTER_SYNC',
        id,
        senderClientId: SESSION_CLIENT_ID
      }).catch(err => console.warn('[DND Sheet] Delete broadcast failed:', err));
    }
    
    // Explicitly remove from serialization cache
    if (lastSerializedRef.current[id]) {
      const newCache = { ...lastSerializedRef.current };
      delete newCache[id];
      lastSerializedRef.current = newCache;
    }

    try {
      const owned = localStorage.getItem('dnd-owned-ids');
      if (owned) {
        const ownedList = JSON.parse(owned).filter((x: string) => x !== id);
        localStorage.setItem('dnd-owned-ids', JSON.stringify(ownedList));
      }
    } catch (e) {}
  }, []);

  const updateCharacter = useCallback((id: string, action: CharacterAction) => {
    dispatch({ type: 'DISPATCH_CHARACTER_ACTION', payload: { id, action } });
  }, []);

  const undo = useCallback((id: string) => {
    dispatch({ type: 'UNDO', payload: { id } });
  }, []);

  const redo = useCallback((id: string) => {
    dispatch({ type: 'REDO', payload: { id } });
  }, []);

  return {
    characters,
    isLoading,
    syncingCharacters,
    addCharacter,
    deleteCharacter,
    updateCharacter,
    undo,
    redo,
  };
};