import { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { Character, CharacterAction, HistoryState, LogEntry } from '../types';
import { applyImages, extractImages } from '../utils/imageStore';
import { charactersReducer, CharactersState } from './appReducer';
import { isCharacter, migrateCharacterData } from './initialization';
import { characterReducer } from './characterReducer';
import { generateActionDescription } from '../utils/history';
import { useNotifier } from '../context/NotificationContext';
import { loadCharactersApi, saveCharacterApi, deleteCharacterApi, isOwlbear, unminifyCharacter, stripBase64, minifyCharacter, loadFromLocalStorage, saveToLocalStorage, stripLargeTexts, decompressData, decodeBase64Sync, restoreLocalData, mergeCharacter, SESSION_CLIENT_ID, broadcastCharacterSync } from '../utils/storage';
import { imageDb } from '../utils/indexedDbStore';
import { localBridge } from '../utils/bridgeService';
import { storageRepository } from '../utils/storageRepository';
import { registerCurrentRoom, getKnownRooms, saveKnownRooms } from '../utils/roomRegistry';
import { p2pRoomBridge } from '../utils/p2pBridge';

const GRANULAR_KEY_PREFIX = 'com.antigravity.dnd-sheet/v2/character/';

const isCharacterOwner = (character: any, currentUserId?: string): boolean => {
  if (!character) return false;
  const myId = currentUserId || (isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '');
  if (!character.ownerId) return true; // Legacy or unclaimed character
  if (!myId) return true;
  return character.ownerId === myId;
};

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

const getTextChecksum = (charData: any): string => {
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

const getImageChecksums = (charData: any): Record<string, string> => {
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

import type { SyncStatusType } from '../components/SyncStatusIndicator';

interface CharacterManager {
  characters: CharactersState;
  isLoading: boolean;
  syncStatus: SyncStatusType;
  syncingCharacters: Record<string, { status: 'images', pendingImages: string[] }>;
  addCharacter: (id: string, character: Character) => void;
  deleteCharacter: (id: string) => void;
  updateCharacter: (id: string, action: CharacterAction) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  syncCharacter: (id: string) => Promise<void>;
  clearLocalCache: (id: string) => Promise<void>;
  exportVaultData: () => void;
  importVaultData: (fileContent: string) => void;
}

const restoreFromMemory = (cloudData: any, memoryBackup: CharactersState) => {
  if (!cloudData || !memoryBackup) return cloudData;

  const restoreItemImages = (cloudItem: any, memoryItem: any) => {
    if (!cloudItem || !memoryItem) return;
    const cloudImgIsToken = typeof cloudItem.imageUrl === 'string' && cloudItem.imageUrl.startsWith('img:ref:');
    if (memoryItem.imageUrl?.startsWith('data:image/') && (!cloudItem.imageUrl || cloudImgIsToken)) {
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

      // 1. Restore imageCache safely
      const cloudCacheMap = new Map<string, string>();
      const cloudCacheList = Array.isArray(cloudEntry.imageCache) ? cloudEntry.imageCache : [];
      for (const [k, v] of cloudCacheList) {
        if (k) cloudCacheMap.set(k, v);
      }

      const memoryCache = memoryEntry.imageCache || new Map();
      for (const [imgId, imgVal] of memoryCache.entries()) {
        if (imgId && imgVal && imgVal.startsWith('data:image/')) {
          const currentVal = cloudCacheMap.get(imgId);
          if (!currentVal || !currentVal.startsWith('data:image/')) {
            cloudCacheMap.set(imgId, imgVal);
          }
        }
      }
      cloudEntry.imageCache = Array.from(cloudCacheMap.entries());

      // 2. Restore portraitUrl if it was stripped in cloud but present in memory
      const cloudPortraitIsToken = typeof cloudChar.portraitUrl === 'string' && cloudChar.portraitUrl.startsWith('img:ref:');
      if (memoryChar.portraitUrl?.startsWith('data:image/') && (!cloudChar.portraitUrl || cloudPortraitIsToken)) {
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
          if (match) {
            restoreItemImages(s, match);
            if (match.description && !s.description) s.description = match.description;
            if (s.components && match.components && match.components.materialDescription && !s.components.materialDescription) {
              s.components.materialDescription = match.components.materialDescription;
            }
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
          if (match) {
            restoreItemImages(a, match);
            if (match.notes && !a.notes) a.notes = match.notes;
          }
        });
      }

      // 7. Restore inventory item images & descriptions
      if (Array.isArray(cloudChar.inventory) && Array.isArray(memoryChar.inventory)) {
        cloudChar.inventory.forEach((invItem: any, idx: number) => {
          const memoryInvItem = memoryChar.inventory[idx];
          if (invItem && memoryInvItem) {
            restoreItemImages(invItem, memoryInvItem);
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
  const [syncStatus, setSyncStatus] = useState<SyncStatusType>('synced');
  const [syncingCharacters, setSyncingCharacters] = useState<Record<string, { status: 'images', pendingImages: string[] }>>({});
  const { addNotification } = useNotifier();

  // Track the serialized state of each character individually (indexed by character ID)
  const lastSerializedRef = useRef<Record<string, string>>({});
  const charactersStateRef = useRef<CharactersState>(characters);
  const incomingChunksRef = useRef<Record<string, { chunks: string[], total: number, updatedAt?: number }>>({});

  useEffect(() => {
    charactersStateRef.current = characters;
  }, [characters]);

  // Garbage collection timer for stale incomplete P2P chunks (older than 30s)
  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();
      const chunks = incomingChunksRef.current;
      for (const [key, item] of Object.entries(chunks)) {
        if (item.updatedAt && now - item.updatedAt > 30000) {
          console.warn(`[DND Sheet] Garbage collecting stale network chunks for ${key}...`);
          delete chunks[key];
        }
      }
    }, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // 1. Initial Load of character data
  useEffect(() => {
    storageRepository.loadCharacters()
      .then(data => {
        if (data) {
          const parsedState = parseCharactersData(data);
          const cache: Record<string, string> = {};
          for (const [id, charData] of Object.entries(data)) {
            cache[id] = serializeForCache(charData);
          }
          lastSerializedRef.current = cache;
          dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
        }

        if (isOwlbear()) {
          if (typeof OBR !== 'undefined' && (OBR as any).room?.id) {
            const roomId = (OBR as any).room.id;
            const roomName = (OBR as any).room?.name || 'Owlbear Room';
            (window as any).__currentRoomName = roomName;
            registerCurrentRoom(roomId, roomName);
          }
          try {
            console.log('[DND Sheet] Owlbear VTT iframe ready. Broadcasting VTT_FRAME_READY to sibling tabs...');
            localBridge.postMessage({ type: 'VTT_FRAME_READY' });
          } catch (e) {}
        }
        
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const charId = urlParams?.get('charId');

        if (!isOwlbear() && charId) {
          console.log(`[DND Sheet] Standalone mode: Requesting latest character data for ${charId}...`);
          setSyncStatus('connected_tab');
          
          try {
            localBridge.postMessage({
              type: 'REQUEST_CHARACTER_DATA',
              charId
            });
            localBridge.postMessage({
              type: 'HANDSHAKE_PING',
              charId
            });
          } catch (e) {}

          // Set a timeout to stop loading if VTT iframe doesn't respond
          const timeoutId = setTimeout(() => {
            console.log(`[DND Sheet] Handshake timeout. Proceeding with local data.`);
            setIsLoading(false);
          }, 1500);

          (window as any).__handshakeTimeoutId = timeoutId;
        } else {
          setIsLoading(false);
        }
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
            const localData = loadFromLocalStorage();
            const cachedVersions = (payload as any).cachedVersions || {};
            const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
            
            for (const [id, charData] of Object.entries(localData)) {
              if (!charData || !(charData as any).character) continue;
              const fullChar = unminifyCharacter((charData as any).character);
              if (!isCharacterOwner(fullChar, myId)) continue;

              const requesterVersion = cachedVersions[id];
                
                if (requesterVersion && typeof requesterVersion === 'object') {
                  const currentTextHash = getTextChecksum(charData);
                  const currentImgHashes = getImageChecksums(charData);
                  
                  const textMatch = requesterVersion.textChecksum === currentTextHash;
                  
                  // Find which images the requester needs
                  const requesterImgHashes = requesterVersion.imageChecksums || {};
                  const missingOrChangedImages: string[] = [];
                  for (const [imgId, imgHash] of Object.entries(currentImgHashes)) {
                    if (requesterImgHashes[imgId] !== imgHash) {
                      missingOrChangedImages.push(imgId);
                    }
                  }
                  
                  if (textMatch && missingOrChangedImages.length === 0) {
                    console.log(`[DND Sheet] Requester already has up-to-date character ${id}. Skipping sync.`);
                    continue;
                  }
                  
                  console.log(`[DND Sheet] Checksum mismatch for character ${id}: Text match: ${textMatch} (Requester text: "${requesterVersion.textChecksum}", Current: "${currentTextHash}"). Requester needs ${missingOrChangedImages.length} images: ${JSON.stringify(missingOrChangedImages)}. Syncing...`);
                  
                  // Broadcast character sheet with only the images the requester needs
                  await broadcastCharacterSync(id, charData, missingOrChangedImages);
                } else {
                  // Legacy or clean client: send everything!
                  console.log(`[DND Sheet] Requester has no version info for ${id}. Syncing everything.`);
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
              const rawChar = incomingData.character ? unminifyCharacter(incomingData.character) : incomingData;
              const isRawValid = isCharacter(rawChar);
              const fullChar = rawChar;
              const charName = fullChar?.name || incomingData.name || charId;
              const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
              const isGM = isOwlbear() && typeof OBR !== 'undefined' ? ((await OBR.player.getRole()) === 'GM') : true;

              const existingEntry = charactersStateRef.current[charId];
              const existingChar = existingEntry?.history.present;
              const targetOwnerId = existingChar?.ownerId || fullChar?.ownerId;
              const senderPlayerId = (incomingData as any).senderPlayerId || (payload as any).senderPlayerId || '';

              // RECEIVER-SIDE VERIFICATION FOR UPDATES:
              // 1. Recipient check: If recipient is a player (not GM) and does not own this character, discard sync.
              if (!isGM && !isCharacterOwner(targetOwnerId ? { ownerId: targetOwnerId } : fullChar, myId)) {
                console.log(`[DND Sheet] Discarding incoming P2P sync for character ${charId} (recipient is a player, not GM or owner).`);
                return;
              }

              // 2. Sender check: If sender is a player (not GM) and is NOT the owner of this character, reject unauthorized update.
              if (senderPlayerId && targetOwnerId && senderPlayerId !== targetOwnerId && !isGM) {
                console.warn(`[DND Sheet] Rejected unauthorized P2P character update for ${charId} from non-owner sender ${senderPlayerId}.`);
                return;
              }

              if (!isRawValid && isGM) {
                console.warn(`[DND Sheet] Received corrupted character sheet structure for "${charName}". Auto-repairing...`);
                addNotification(`[Синхронизация] Внимание: Полученные сетевые данные персонажа "${charName}" повреждены и были автоматически восстановлены.`, 'warning');
              }

              const localData = loadFromLocalStorage();
              
              // Unminify and restore images if we have them cached locally
              const restoredCloud = restoreLocalData({ [charId]: incomingData }, localData);
              const parsedState = parseCharactersData(restoredCloud);
              const entry = parsedState[charId];
              
              if (entry) {
                console.log(`[DND Sheet] Received fully assembled remote character sync via P2P for ${charId}. Merging...`);
                
                if (Array.isArray(incomingData.syncImageIds) && incomingData.syncImageIds.length > 0) {
                  const neededImages = incomingData.syncImageIds.filter((imgId: string) => {
                    const localImage = entry.imageCache?.get(imgId);
                    return !localImage || !localImage.startsWith('data:');
                  });

                  if (neededImages.length > 0) {
                    console.log(`[DND Sheet] Waiting for ${neededImages.length} remote images for ${charId}...`);
                    setSyncingCharacters(prev => ({
                      ...prev,
                      [charId]: {
                        status: 'images',
                        pendingImages: neededImages
                      }
                    }));
                  }
                }

                dispatch({
                  type: 'SYNC_REMOTE_CHARACTER',
                  payload: {
                    id: charId,
                    entry
                  }
                });
                // Broadcast to local channel for standalone tab syncing
                const imageCacheArray = entry.imageCache 
                  ? Array.from(entry.imageCache.entries()) 
                  : [];
                const syncPayload = {
                  type: 'CHARACTER_SYNC',
                  charId,
                  entry: {
                    ...entry,
                    imageCache: imageCacheArray
                  },
                  senderClientId: SESSION_CLIENT_ID,
                  senderId: SESSION_CLIENT_ID
                };
                
                try {
                  localBridge.postMessage(syncPayload);
                } catch (e) {}

                if (typeof window !== 'undefined') {
                  const opened = (window as any).__dndOpenedWindows || [];
                  opened.forEach((win: any) => {
                    if (win && !win.closed) {
                      win.postMessage(syncPayload, '*');
                    }
                  });
                }
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
              } else if (isGM) {
                addNotification(`[Синхронизация] Ошибка: Не удалось загрузить персонажа (${charName}). Данные не прошли валидацию.`, 'error');
              }
            } catch (err) {
              console.error('[DND Sheet] Failed to parse unified character sync JSON:', err);
              addNotification(`[Синхронизация] Ошибка: Получены поврежденные данные персонажа (${charId}). Синхронизация отменена.`, 'error');
            }
          }
        } else if (payload.type === 'IMAGE_CHUNK_SYNC' && payload.id && (payload as any).imgId && (payload as any).chunkData !== undefined) {
          const charId = payload.id;
          const { imgId, isPortrait, chunkIndex, totalChunks, chunkData } = payload as any;
          if ((payload as any).senderClientId === SESSION_CLIENT_ID) {
            return;
          }

          const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
          const isGM = isOwlbear() && typeof OBR !== 'undefined' ? ((await OBR.player.getRole()) === 'GM') : true;
          const charEntry = charactersStateRef.current[charId];
          const fullChar = charEntry?.history.present;

          if (!isGM && !isCharacterOwner(fullChar, myId)) {
            return; // Discard incoming image chunk if recipient is a player and not owner!
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
            
            const saveImageToDbAndCache = async (imgIdKey: string, imgVal: string) => {
              try {
                const currentLocal = loadFromLocalStorage();
                if (currentLocal[charId]) {
                  const imageCacheList = Array.isArray(currentLocal[charId].imageCache) ? currentLocal[charId].imageCache : [];
                  const map = new Map<string, string>(imageCacheList);
                  map.set(imgIdKey, imgVal);
                  const updatedList = Array.from(map.entries());
                  currentLocal[charId].imageCache = updatedList;
                  saveToLocalStorage(currentLocal);
                  await imageDb.set('char-images/' + charId, updatedList);
                }
              } catch (err) {
                console.error(`Failed to cache remote image ${imgIdKey} to IndexedDB:`, err);
              }
            };

            if (isPortrait) {
              console.log(`[DND Sheet] Received fully assembled remote portrait for ${charId}.`);
              dispatch({
                type: 'SYNC_REMOTE_CHARACTER_PORTRAIT',
                payload: { id: charId, portraitUrl: assembledVal }
              });
              saveImageToDbAndCache('img:ref:portrait', assembledVal);
            } else {
              console.log(`[DND Sheet] Received fully assembled remote image ${imgId} for ${charId}.`);
              dispatch({
                type: 'SYNC_REMOTE_CHARACTER_IMAGE',
                payload: { id: charId, imgId, imgVal: assembledVal }
              });
              saveImageToDbAndCache(imgId, assembledVal);
            }
          }
        } else if (payload.type === 'DELETE_CHARACTER_SYNC' && payload.id) {
          const charId = payload.id;
          if ((payload as any).senderClientId === SESSION_CLIENT_ID) {
            return;
          }

          const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
          const isGM = isOwlbear() && typeof OBR !== 'undefined' ? ((await OBR.player.getRole()) === 'GM') : true;
          const senderPlayerId = (payload as any).senderPlayerId || '';
          
          const existingEntry = charactersStateRef.current[charId];
          const existingChar = existingEntry?.history.present;
          const targetOwnerId = existingChar?.ownerId;

          // RECEIVER-SIDE AUTHORIZATION CHECK FOR DELETION:
          // A deletion signal via OBR network broadcast is authorized ONLY if:
          // - The receiver is GM (GM processes legitimate player deletion requests).
          // - OR the sender is the owner of the character (senderPlayerId === targetOwnerId).
          // - OR the character has no owner (!targetOwnerId).
          const isAuthorizedDelete = isGM || !targetOwnerId || (senderPlayerId && targetOwnerId === senderPlayerId);
          if (!isAuthorizedDelete) {
            console.warn(`[DND Sheet] Rejected unauthorized DELETE_CHARACTER_SYNC for character ${charId} from non-owner sender ${senderPlayerId}.`);
            return;
          }

          console.log(`[DND Sheet] Received authorized remote deletion sync via P2P for ${charId}. Removing...`);
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
      const cachedVersions: Record<string, any> = {};
      for (const [id, entry] of Object.entries(localData)) {
        if (entry) {
          cachedVersions[id] = {
            textChecksum: getTextChecksum(entry),
            imageChecksums: getImageChecksums(entry)
          };
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
        const fullChar = rawChar.character;

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
    let charToAdd = character;
    if (isOwlbear() && typeof OBR !== 'undefined' && (OBR as any).room?.id) {
      const roomId = (OBR as any).room.id;
      const roomName = (window as any).__currentRoomName || (OBR as any).room?.name || 'Owlbear Room';
      const boundRooms = character.boundRooms || [];
      if (!boundRooms.some(r => r.roomId === roomId)) {
        charToAdd = {
          ...character,
          boundRooms: [...boundRooms, { roomId, roomName, lastVisited: Date.now() }]
        };
      }
    }
    dispatch({ type: 'ADD_CHARACTER', payload: { id, character: charToAdd } });
  }, []);

  const exportVaultData = useCallback(() => {
    const state = charactersStateRef.current;
    const knownRooms = getKnownRooms();
    const vaultData = {
      version: 2,
      exportedAt: Date.now(),
      knownRooms,
      characters: state,
    };
    const blob = new Blob([JSON.stringify(vaultData, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `Master_Vault_${new Date().toISOString().slice(0, 10)}.dndvault.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    addNotification('Хранилище персонажей успешно экспортировано!', 'info');
  }, [addNotification]);

  const importVaultData = useCallback((fileContent: string) => {
    try {
      const parsed = JSON.parse(fileContent);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Некорректный формат файла хранилища.');
      }
      const incomingState = parsed.characters || parsed;
      const parsedState = parseCharactersData(incomingState);
      dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
      if (Array.isArray(parsed.knownRooms)) {
        saveKnownRooms(parsed.knownRooms);
      }
      addNotification('Хранилище персонажей успешно импортировано!', 'info');
    } catch (e) {
      console.error('[DND Sheet] Failed to import vault:', e);
      addNotification('Ошибка при импорте файла хранилища.', 'error');
    }
  }, [addNotification]);

  const deleteCharacter = useCallback(async (id: string) => {
    const charEntry = charactersStateRef.current[id];
    const fullChar = charEntry?.history.present;
    
    // Check user role & player ID
    let isGM = false;
    let myId = '';
    if (isOwlbear() && typeof OBR !== 'undefined') {
      try {
        const role = await OBR.player.getRole();
        isGM = role === 'GM';
        myId = OBR.player.id;
      } catch (e) {}
    } else if (typeof window !== 'undefined') {
      const urlRole = new URLSearchParams(window.location.search).get('userRole');
      if (urlRole === 'GM') isGM = true;
      myId = new URLSearchParams(window.location.search).get('userId') || '';
    }

    const isOwner = isGM || !fullChar?.ownerId || !myId || fullChar.ownerId === myId;
    if (!isOwner) {
      console.warn('[DND Sheet] Blocked deleteCharacter for unowned character:', id);
      addNotification('Вы не можете удалить персонажа, принадлежащего другому игроку.', 'error');
      return;
    }

    // 1. Delete from local React state
    dispatch({ type: 'DELETE_CHARACTER', payload: { id } });

    // 2. Clear IndexedDB images & LocalStorage for this character
    try {
      await imageDb.delete(`char-images/${id}`);
      const localData = loadFromLocalStorage();
      delete localData[id];
      saveToLocalStorage(localData);
    } catch (err) {
      console.error('[DND Sheet] Failed to clean local storage on delete:', err);
    }

    // 3. Explicitly remove from serialization cache
    if (lastSerializedRef.current[id]) {
      const newCache = { ...lastSerializedRef.current };
      delete newCache[id];
      lastSerializedRef.current = newCache;
    }

    if (isGM) {
      // IF GM: Deletes ONLY locally on GM's machine. Do NOT broadcast deletion or delete room metadata!
      console.log(`[DND Sheet] GM deleted character ${id} locally. Room sync & broadcast skipped.`);
      addNotification('Локальная копия персонажа удалена у ГМа.', 'info');
    } else {
      // IF PLAYER: Delete from room metadata and broadcast deletion to GM/room!
      console.log(`[DND Sheet] Player deleted character ${id}. Deleting room metadata & broadcasting sync to GM...`);
      deleteCharacterApi(id).catch(console.error);

      if (isOwlbear() && typeof OBR !== 'undefined') {
        OBR.broadcast.sendMessage('com.antigravity.dnd-sheet/sync', {
          type: 'DELETE_CHARACTER_SYNC',
          id,
          senderClientId: SESSION_CLIENT_ID,
          senderPlayerId: OBR.player?.id || ''
        }).catch(err => console.warn('[DND Sheet] Delete broadcast failed:', err));
      }

      // Also send over local bridge for sibling tabs
      try {
        localBridge.postMessage({
          type: 'DELETE_CHARACTER_SYNC',
          id,
          senderClientId: SESSION_CLIENT_ID
        });
      } catch (e) {}

      addNotification('Персонаж полностью удален.', 'info');
    }
  }, [addNotification]);

  const updateCharacter = useCallback((id: string, action: CharacterAction) => {
    const actionWithId = {
      ...action,
      actionId: (action as any).actionId || Math.random().toString(36).substring(2) + Date.now().toString(36)
    };

    dispatch({ type: 'DISPATCH_CHARACTER_ACTION', payload: { id, action: actionWithId } });

    // Broadcast to local channel & sibling windows via localBridge
    try {
      localBridge.postMessage({
        type: 'CHARACTER_ACTION',
        charId: id,
        action: actionWithId
      });
    } catch (e) {}
  }, []);

  const undo = useCallback((id: string) => {
    dispatch({ type: 'UNDO', payload: { id } });
  }, []);

  const redo = useCallback((id: string) => {
    dispatch({ type: 'REDO', payload: { id } });
  }, []);

  const isLoadingRef = useRef(isLoading);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Local bridge for multi-tab synchronization
  useEffect(() => {
    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      const sourceWindow = event.source as Window | undefined;
      if (!payload || typeof payload !== 'object') return;

      const senderId = payload.senderClientId || payload.senderId;
      if (senderId === SESSION_CLIENT_ID) {
        return; // Always ignore self messages on the same tab
      }

      if (payload.type === 'CHARACTER_ACTION' && payload.charId && payload.action) {
        const uniqueActId = payload.action.actionId 
          ? `act-${payload.action.actionId}` 
          : (payload.msgId ? `msg-${payload.msgId}` : `raw-${payload.action.type}-${Date.now()}`);

        if (localBridge.isDuplicateMessage(uniqueActId, 1000)) {
          return;
        }

        console.log('[DND Sheet] Bridge Sync: Syncing action from remote tab:', payload.action);
        dispatch({
          type: 'DISPATCH_CHARACTER_ACTION',
          payload: { id: payload.charId, action: payload.action }
        });

        // Proxy incoming action from standalone tab to Owlbear VTT room network & storage
        if (isOwlbear()) {
          const currentState = charactersStateRef.current;
          const currentEntry = currentState[payload.charId];
          if (!currentEntry) {
            console.log('[DND Sheet] Action received for unknown character. Requesting full sync:', payload.charId);
            localBridge.postMessage({ type: 'REQUEST_CHARACTER_DATA', charId: payload.charId });
          } else if (currentEntry.history?.present) {
            const updatedPresent = characterReducer(currentEntry.history.present, payload.action);
            const updatedEntry = {
              ...currentEntry,
              history: {
                ...currentEntry.history,
                present: updatedPresent
              }
            };
            saveCharacterApi(payload.charId, updatedEntry);
          }
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === 'CHARACTER_SYNC' && payload.charId && payload.entry) {
        console.log('[DND Sheet] Bridge Sync: Syncing full character:', payload.charId);
        
        const entryWithMap = {
          ...payload.entry,
          imageCache: Array.isArray(payload.entry.imageCache) 
            ? new Map(payload.entry.imageCache) 
            : (payload.entry.imageCache instanceof Map ? payload.entry.imageCache : new Map())
        };

        const serialized = serializeForCache(entryWithMap);
        if (lastSerializedRef.current[payload.charId] === serialized) {
          return; // Skip no-op duplicate sync
        }
        lastSerializedRef.current[payload.charId] = serialized;

        dispatch({
          type: 'SYNC_REMOTE_CHARACTER',
          payload: { id: payload.charId, entry: entryWithMap }
        });
        saveCharacterApi(payload.charId, entryWithMap);

        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const urlCharId = urlParams?.get('charId');
        if (payload.charId === urlCharId) {
          if (isLoadingRef.current) {
            console.log('[DND Sheet] Received requested character data. Stopping loading.');
            if ((window as any).__handshakeTimeoutId) {
              clearTimeout((window as any).__handshakeTimeoutId);
              delete (window as any).__handshakeTimeoutId;
            }
            setIsLoading(false);
          }
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === 'REQUEST_CHARACTER_DATA' && payload.charId) {
        console.log('[DND Sheet] Bridge Sync: Received request for character data:', payload.charId);

        const state = charactersStateRef.current;
        const entry = state[payload.charId];
        if (entry) {
          const imageCacheArray = entry.imageCache 
            ? Array.from(entry.imageCache.entries()) 
            : [];
          localBridge.postMessage({
            type: 'CHARACTER_SYNC',
            charId: payload.charId,
            entry: {
              ...entry,
              imageCache: imageCacheArray
            }
          });
        } else {
          // Fallback: read directly from local storage if state is still initializing
          const localData = loadFromLocalStorage();
          const localEntry = localData[payload.charId];
          if (localEntry) {
            localBridge.postMessage({
              type: 'CHARACTER_SYNC',
              charId: payload.charId,
              entry: localEntry
            });
          }
        }
        if (isOwlbear()) {
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === 'VTT_FRAME_READY') {
        console.log('[DND Sheet] Bridge Sync: Received VTT_FRAME_READY broadcast.');

        const state = charactersStateRef.current;
        const localData = loadFromLocalStorage();
        const combined = { ...localData, ...state };

        for (const [charId, myEntry] of Object.entries(combined)) {
          if (myEntry) {
            const entryObj = myEntry as any;
            const imageCacheArray = Array.isArray(entryObj.imageCache)
              ? entryObj.imageCache
              : (entryObj.imageCache instanceof Map ? Array.from(entryObj.imageCache.entries()) : []);

            localBridge.postMessage({
              type: 'HANDSHAKE_PING',
              charId,
              entry: { ...entryObj, imageCache: imageCacheArray },
              knownRooms: getKnownRooms()
            });
          }
        }
        setSyncStatus('connected_tab');
      } else if (payload.type === 'HANDSHAKE_PING') {
        console.log('[DND Sheet] Bridge Sync: Received HANDSHAKE_PING for character:', payload.charId);
        if (payload.roomId) {
          registerCurrentRoom(payload.roomId, payload.roomName || 'Доска Owlbear');
        }
        if (Array.isArray(payload.knownRooms)) {
          saveKnownRooms(payload.knownRooms);
        }

        const getEntryTime = (e: any) => {
          if (!e) return 0;
          if (typeof e.lastModified === 'number') return e.lastModified;
          if (Array.isArray(e.log) && e.log[0] && typeof e.log[0].timestamp === 'number') {
            return e.log[0].timestamp;
          }
          return 0;
        };

        const state = charactersStateRef.current;
        const localEntry = payload.charId ? state[payload.charId] : null;
        let finalEntry = localEntry;

        if (payload.entry && payload.charId) {
          const incomingTime = getEntryTime(payload.entry);
          const localTime = getEntryTime(localEntry);

          if (!localEntry || incomingTime >= localTime) {
            finalEntry = payload.entry;
            const entryWithMap = {
              ...payload.entry,
              imageCache: Array.isArray(payload.entry.imageCache) 
                ? new Map(payload.entry.imageCache) 
                : (payload.entry.imageCache instanceof Map ? payload.entry.imageCache : new Map())
            };
            const serialized = serializeForCache(entryWithMap);
            if (lastSerializedRef.current[payload.charId] !== serialized) {
              lastSerializedRef.current[payload.charId] = serialized;
              dispatch({
                type: 'SYNC_REMOTE_CHARACTER',
                payload: { id: payload.charId, entry: entryWithMap }
              });
              saveCharacterApi(payload.charId, entryWithMap);
              if (isOwlbear()) {
                broadcastCharacterSync(payload.charId, entryWithMap);
              }
            }
          }
        }

        const imageCacheArray = finalEntry?.imageCache ? Array.from(finalEntry.imageCache.entries()) : [];
        
        localBridge.postMessage({
          type: 'HANDSHAKE_PONG',
          charId: payload.charId,
          entry: finalEntry ? { ...finalEntry, imageCache: imageCacheArray } : undefined,
          knownRooms: getKnownRooms()
        });

        if (isOwlbear()) {
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === 'HANDSHAKE_PONG') {
        console.log('[DND Sheet] Bridge Sync: Received HANDSHAKE_PONG for character:', payload.charId);
        if (Array.isArray(payload.knownRooms)) {
          saveKnownRooms(payload.knownRooms);
        }

        if (!isOwlbear()) {
          setSyncStatus('connected_tab');
        }

        if (payload.entry && payload.charId) {
          const getEntryTime = (e: any) => {
            if (!e) return 0;
            if (typeof e.lastModified === 'number') return e.lastModified;
            if (Array.isArray(e.log) && e.log[0] && typeof e.log[0].timestamp === 'number') {
              return e.log[0].timestamp;
            }
            return 0;
          };

          const state = charactersStateRef.current;
          const localEntry = state[payload.charId];
          const incomingTime = getEntryTime(payload.entry);
          const localTime = getEntryTime(localEntry);

          if (!localEntry || incomingTime >= localTime) {
            const entryWithMap = {
              ...payload.entry,
              imageCache: Array.isArray(payload.entry.imageCache) 
                ? new Map(payload.entry.imageCache) 
                : (payload.entry.imageCache instanceof Map ? payload.entry.imageCache : new Map())
            };
            const serialized = serializeForCache(entryWithMap);
            if (lastSerializedRef.current[payload.charId] !== serialized) {
              lastSerializedRef.current[payload.charId] = serialized;
              dispatch({
                type: 'SYNC_REMOTE_CHARACTER',
                payload: { id: payload.charId, entry: entryWithMap }
              });
              saveCharacterApi(payload.charId, entryWithMap);
            }
          }
          if (isLoadingRef.current) {
            setIsLoading(false);
          }
        }
      } else if (payload.type === 'STORAGE_EVENT_SYNC') {
        storageRepository.loadCharacters().then(data => {
          if (data) {
            const parsedState = parseCharactersData(data);
            dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
            if (isOwlbear()) {
              for (const [id, entry] of Object.entries(parsedState)) {
                saveCharacterApi(id, entry);
              }
            }
          }
        }).catch(console.error);
      }
    });

    return unsubscribe;
  }, []);

  // 2.7. Heartbeat emitter & standalone window reconnect loop inside Owlbear iframe
  useEffect(() => {
    if (!isOwlbear()) return;

    const emitHeartbeat = () => {
      try {
        const roomId = typeof OBR !== 'undefined' ? OBR.room?.id : '';
        const roomName = (window as any).__currentRoomName || (typeof OBR !== 'undefined' ? (OBR as any).room?.name : '') || 'Owlbear Room';
        if (roomId) {
          registerCurrentRoom(roomId, roomName);
        }
        window.localStorage.setItem('com.antigravity.dnd-sheet/vtt_heartbeat', JSON.stringify({
          roomId,
          roomName,
          timestamp: Date.now(),
          senderClientId: SESSION_CLIENT_ID
        }));

        // Re-discover and re-add child standalone windows using targetName lookups
        const activeIds = Object.keys(charactersStateRef.current);
        localBridge.reconnectStandaloneWindows(activeIds);
        localBridge.postMessage({
          type: 'VTT_FRAME_READY',
          roomId,
          roomName,
          knownRooms: getKnownRooms()
        });
      } catch (e) {}
    };

    emitHeartbeat();
    const interval = setInterval(emitHeartbeat, 2000);
    return () => clearInterval(interval);
  }, []);

  const lastRemoteP2pTimeRef = useRef<number>(0);

  // 2.7. Periodic Heartbeat Emitter & Presence Responder for Owlbear mode
  useEffect(() => {
    if (!isOwlbear()) return;
    const sendHeartbeat = () => {
      try {
        const roomId = typeof OBR !== 'undefined' ? OBR.room?.id : '';
        const roomName = (typeof OBR !== 'undefined' ? (OBR as any).room?.name : '') || 'Owlbear Room';
        localBridge.postMessage({
          type: 'HEARTBEAT_PING',
          roomId,
          roomName
        });
      } catch (e) {}
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 3000);

    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      if (payload && typeof payload === 'object') {
        const senderId = payload.senderClientId || payload.senderId;
        if (senderId && senderId !== SESSION_CLIENT_ID && payload.type === 'PRESENCE_QUERY') {
          const roomId = typeof OBR !== 'undefined' ? OBR.room?.id : '';
          const roomName = (typeof OBR !== 'undefined' ? (OBR as any).room?.name : '') || 'Owlbear Room';
          p2pRoomBridge.broadcast({
            type: 'STATE_RESPONSE',
            roomId,
            roomName,
            activeCharacterId: p2pRoomBridge.getActiveBoardCharacterId(),
            knownRooms: getKnownRooms()
          });
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // 2.8. Heartbeat monitor for standalone tab to detect connection drops
  useEffect(() => {
    if (isOwlbear()) return;

    const checkVttHeartbeat = () => {
      // 1. Если приходило любое сообщение через P2P мост менее 15 секунд назад
      if (lastRemoteP2pTimeRef.current > 0 && Date.now() - lastRemoteP2pTimeRef.current < 15000) {
        setSyncStatus('connected_tab');
        return true;
      }

      // 2. Если есть открытый родительский opener
      if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
        setSyncStatus('connected_tab');
        return true;
      }

      // 3. Иначе автономный режим
      setSyncStatus('synced');
      return false;
    };

    checkVttHeartbeat();
    const interval = setInterval(() => {
      checkVttHeartbeat();
    }, 2000);

    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      if (payload && typeof payload === 'object') {
        const senderId = payload.senderClientId || payload.senderId;
        if (senderId && senderId !== SESSION_CLIENT_ID) {
          lastRemoteP2pTimeRef.current = Date.now();
          setSyncStatus('connected_tab');

          if (payload.type === 'STATE_RESPONSE' && payload.roomId) {
            registerCurrentRoom(payload.roomId, payload.roomName || 'Owlbear Room');
            p2pRoomBridge.connect(payload.roomId, payload.roomName);
          }
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // 2.9. Connect Native Owlbear Room & Standalone Local Bridge
  useEffect(() => {
    if (isOwlbear() && typeof OBR !== 'undefined') {
      OBR.onReady(() => {
        const roomId = OBR.room?.id || 'global_vault_bridge';
        const roomName = (OBR as any).room?.name || 'Owlbear Room';
        console.log(`[DND Sheet P2P] Owlbear VTT Ready. Connecting bridge for room: ${roomId} (${roomName})`);
        registerCurrentRoom(roomId, roomName);
        p2pRoomBridge.connect(roomId, roomName);
        localBridge.reconnectStandaloneWindows();
      });
    } else {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const urlRoomId = urlParams?.get('roomId');
      const knownRooms = getKnownRooms();
      const initialRoom = urlRoomId || (knownRooms.length > 0 && knownRooms[0] ? knownRooms[0].roomId : 'global_vault_bridge');
      const initialRoomName = knownRooms.find(r => r?.roomId === initialRoom)?.roomName || 'Owlbear Room';

      console.log(`[DND Sheet P2P] Standalone mode: Connecting local P2P bridge for room: ${initialRoom}`);
      p2pRoomBridge.connect(initialRoom, initialRoomName);
      localBridge.reconnectStandaloneWindows();
    }
  }, []);

  const syncCharacter = useCallback(async (id: string) => {
    try {
      if (isOwlbear()) {
        const state = charactersStateRef.current;
        const entry = state[id];
        const fullChar = entry?.history.present;
        const myId = typeof OBR !== 'undefined' ? OBR.player?.id : '';
        const isOwner = fullChar && fullChar.ownerId && myId ? fullChar.ownerId === myId : true;

        if (isOwner && entry) {
          console.log(`[DND Sheet] Manual sync triggered by owner for character ${id}...`);
          const localData = loadFromLocalStorage();
          const charData = localData[id];
          if (charData) {
            await broadcastCharacterSync(id, charData, true);
            addNotification('Данные персонажа принудительно отправлены в комнату.', 'info');
            return;
          }
        }

        console.log(`[DND Sheet] Requesting fresh sync for character ${id} from room...`);
        await OBR.broadcast.sendMessage('com.antigravity.dnd-sheet/sync', {
          type: 'REQUEST_FULL_CHARACTERS',
          cachedVersions: {},
          requestedCharId: id,
          senderClientId: SESSION_CLIENT_ID
        });
        addNotification('Отправлен запрос на повторную синхронизацию персонажа.', 'info');
      } else {
        console.log(`[DND Sheet] Standalone mode: Manual sync requesting character data for ${id}...`);
        setSyncStatus('syncing');
        try {
          const localData = loadFromLocalStorage();
          const entry = charactersStateRef.current[id] || localData[id];
          const imageCacheArray = entry?.imageCache ? Array.from(entry.imageCache.entries()) : [];

          localBridge.postMessage({ type: 'VTT_FRAME_READY' });
          localBridge.postMessage({
            type: 'HANDSHAKE_PING',
            charId: id,
            entry: entry ? { ...entry, imageCache: imageCacheArray } : undefined,
            knownRooms: getKnownRooms()
          });
          localBridge.postMessage({
            type: 'REQUEST_CHARACTER_DATA',
            charId: id
          });
        } catch (e) {}
        addNotification('Запрос на синхронизацию отправлен в главное окно Owlbear.', 'info');
      }
    } catch (e) {
      console.error('[DND Sheet] Failed to trigger syncCharacter:', e);
      addNotification('Не удалось запросить синхронизацию.', 'error');
    }
  }, [addNotification]);

  const clearLocalCache = useCallback(async (id: string) => {
    try {
      console.log(`[DND Sheet] Clearing local copy for character ${id}...`);
      
      // 1. Delete images from IndexedDB
      await imageDb.delete(`char-images/${id}`);

      // 2. Delete from LocalStorage
      const localData = loadFromLocalStorage();
      delete localData[id];
      saveToLocalStorage(localData);

      // 3. Clear serialization cache
      delete lastSerializedRef.current[id];

      // 4. Remove from local React state
      dispatch({ type: 'DELETE_CHARACTER', payload: { id } });

      addNotification('Локальная копия персонажа очищена.', 'info');
    } catch (e) {
      console.error('[DND Sheet] Failed to clear local copy:', e);
      addNotification('Ошибка при очистке локальной копии.', 'error');
    }
  }, [addNotification]);

  return {
    characters,
    isLoading,
    syncStatus,
    syncingCharacters,
    addCharacter,
    deleteCharacter,
    updateCharacter,
    undo,
    redo,
    syncCharacter,
    clearLocalCache,
    exportVaultData,
    importVaultData,
  };
};