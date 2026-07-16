import { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { Character, CharacterAction, HistoryState, LogEntry } from '../types';
import { charactersReducer, CharactersState } from './appReducer';
import { isCharacter, migrateCharacterData } from './initialization';
import { characterReducer } from './characterReducer';
import { generateActionDescription } from '../utils/history';
import { useNotifier } from '../context/NotificationContext';
import { loadCharactersApi, saveCharacterApi, deleteCharacterApi, isOwlbear, unminifyCharacter, stripBase64, minifyCharacter, loadFromLocalStorage, saveToLocalStorage, stripLargeTexts, decompressData, restoreLocalData, mergeCharacter } from '../utils/storage';

const GRANULAR_KEY_PREFIX = 'com.antigravity.dnd-sheet/character/';

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
      
      acc[id] = {
        history: {
          past,
          present: migratedData as Character,
          future,
        },
        log: item.log || [],
        imageCache: item.imageCache ? new Map(item.imageCache) : new Map(),
      };
    }
    return acc;
  }, {} as CharactersState);
};

// Consistent serialization cache builder
const serializeForCache = (charData: any): string => {
  if (!charData) return '';
  const minified = {
    ...charData,
    character: minifyCharacter(charData.character)
  };
  const stripped = stripLargeTexts(stripBase64(minified));
  stripped.imageCache = [];
  return JSON.stringify(stripped);
};

interface CharacterManager {
  characters: CharactersState;
  isLoading: boolean;
  addCharacter: (id: string, character: Character) => void;
  deleteCharacter: (id: string) => void;
  updateCharacter: (id: string, action: CharacterAction) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
}

export const useCharacterManager = (): CharacterManager => {
  const [characters, dispatch] = useReducer(charactersReducer, {});
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifier();

  // Track the serialized state of each character individually (indexed by character ID)
  const lastSerializedRef = useRef<Record<string, string>>({});

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
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to load characters initially:", error);
        addNotification("Ошибка: не удалось загрузить персонажей.", 'error');
        setIsLoading(false);
      });
  }, [addNotification]);

  // 2. Real-time subscription to room metadata changes (granular key updates)
  useEffect(() => {
    if (isOwlbear()) {
      console.log('[DND Sheet] Subscribing to OBR room metadata changes.');
      
      const unsubscribe = OBR.room.onMetadataChange(async (metadata) => {
        let hasChanges = false;
        const currentCache = { ...lastSerializedRef.current };
        const rawData: Record<string, any> = {};
        
        // A. Read all granular character keys from metadata
        for (const [key, value] of Object.entries(metadata)) {
          if (key.startsWith(GRANULAR_KEY_PREFIX)) {
            const path = key.replace(GRANULAR_KEY_PREFIX, '');
            if (path.includes('/')) {
              continue; // Skip chunked parts of legacy saves
            }
            
            const id = path;
            if (value !== null && value !== undefined) {
              const decompressed = await decompressData(value);
              if (decompressed) {
                rawData[id] = decompressed;
                const serialized = serializeForCache(decompressed);
                if (currentCache[id] !== serialized) {
                  currentCache[id] = serialized;
                  hasChanges = true;
                }
              }
            }
          }
        }

        // B. Handle deleted keys (present in local cache but removed/undefined in metadata)
        for (const id of Object.keys(currentCache)) {
          const metadataKey = `${GRANULAR_KEY_PREFIX}${id}`;
          if (metadata[metadataKey] === null || metadata[metadataKey] === undefined) {
            delete currentCache[id];
            hasChanges = true;

            // Remove from local storage backup immediately to prevent it from resurrecting on reload
            try {
              const localData = loadFromLocalStorage();
              if (localData[id]) {
                console.log(`[DND Sheet] Deletion sync: Removing character ${id} from local storage backup.`);
                delete localData[id];
                saveToLocalStorage(localData);
              }
            } catch (err) {
              console.error('Failed to sync deletion to LocalStorage:', err);
            }
          }
        }

        if (hasChanges) {
          console.log('[DND Sheet] Remote granular changes detected. Syncing local state...');
          lastSerializedRef.current = currentCache;
          const localBackup = loadFromLocalStorage();
          const restoredCloud = restoreLocalData(rawData, localBackup);
          const parsedState = parseCharactersData(restoredCloud);
          dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
        }
      });

      return unsubscribe;
    }
  }, []);

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
          // Someone requested full sheets (e.g. GM joined). Broadcast all our local sheets!
          try {
            const localData = loadFromLocalStorage();
            for (const [id, charData] of Object.entries(localData)) {
              if (charData) {
                // Strip base64 to save WebSocket bandwidth, but keep all notes/descriptions!
                const stripped = stripBase64(charData);
                await OBR.broadcast.sendMessage(SYNC_CHANNEL, {
                  type: 'FULL_CHARACTER_SYNC',
                  id,
                  data: stripped
                });
              }
            }
          } catch (err) {
            console.error('[DND Sheet] Failed to respond to sheet request:', err);
          }
        } else if (payload.type === 'FULL_CHARACTER_SYNC' && payload.id && payload.data) {
          const charId = payload.id;
          const incomingData = payload.data;
          
          // Only update if we don't own this character locally (we are not the source of truth)
          const localData = loadFromLocalStorage();
          if (localData[charId]) {
            return; 
          }
          
          // Unminify and restore images if we have them cached locally
          const restoredCloud = restoreLocalData({ [charId]: incomingData }, localData);
          const parsedState = parseCharactersData(restoredCloud);
          const entry = parsedState[charId];
          
          if (entry) {
            console.log(`[DND Sheet] Received full character sync via P2P for ${charId}. Merging...`);
            dispatch({
              type: 'SYNC_REMOTE_CHARACTER',
              payload: {
                id: charId,
                entry
              }
            });
            // Also update serialization cache to match so we don't trigger save
            const obrCharData = {
              character: entry.history.present,
              log: entry.log || [],
              history: { past: [], future: [] },
              imageCache: entry.imageCache ? Array.from(entry.imageCache.entries()) : []
            };
            lastSerializedRef.current[charId] = serializeForCache(obrCharData);
          }
        }
      };

      console.log('[DND Sheet] Subscribing to P2P sync channel:', SYNC_CHANNEL);
      const unsubscribe = OBR.broadcast.onMessage(SYNC_CHANNEL, handleMessage);
      
      // Request full sheets on startup to sync with already online players
      OBR.broadcast.sendMessage(SYNC_CHANNEL, { type: 'REQUEST_FULL_CHARACTERS' })
        .catch(err => console.warn('[DND Sheet] Initial request broadcast failed:', err));

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
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    dispatch({ type: 'DELETE_CHARACTER', payload: { id } });
    deleteCharacterApi(id).catch(console.error);
    
    // Explicitly remove from serialization cache
    if (lastSerializedRef.current[id]) {
      const newCache = { ...lastSerializedRef.current };
      delete newCache[id];
      lastSerializedRef.current = newCache;
    }
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
    addCharacter,
    deleteCharacter,
    updateCharacter,
    undo,
    redo,
  };
};