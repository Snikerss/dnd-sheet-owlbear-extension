import { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { Character, CharacterAction, HistoryState, LogEntry } from '../types';
import { charactersReducer, CharactersState } from './appReducer';
import { isCharacter, migrateCharacterData } from './initialization';
import { characterReducer } from './characterReducer';
import { generateActionDescription } from '../utils/history';
import { useNotifier } from '../context/NotificationContext';
import { loadCharactersApi, saveCharactersApi, isOwlbear } from '../utils/storage';

const METADATA_KEY = 'com.antigravity.dnd-sheet/characters';

// Helper to safely parse character data structure from raw metadata
const parseCharactersData = (data: any): CharactersState => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {};
  }
  
  return Object.entries(data).reduce((acc, [id, charData]) => {
    const item = charData as {
      character?: any;
      log?: LogEntry[];
      history?: { past?: any[]; future?: any[] };
      imageCache?: [string, string][];
    };
    const characterObject = item.character 
      ? item.character 
      : (item as any).history 
      ? (item as any).history.present 
      : item;

    const migratedData = migrateCharacterData(characterObject);
    if (isCharacter(migratedData)) {
      const past = Array.isArray(item.history?.past)
        ? item.history.past.map(migrateCharacterData).filter(isCharacter)
        : [];
      const future = Array.isArray(item.history?.future)
        ? item.history.future.map(migrateCharacterData).filter(isCharacter)
        : [];

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

  // Track the last serialized metadata string to prevent sync loops and overwrites
  const lastSerializedRef = useRef<string>('');

  // 1. Initial Load of character data
  useEffect(() => {
    loadCharactersApi()
      .then(data => {
        if (data) {
          const parsedState = parseCharactersData(data);
          lastSerializedRef.current = JSON.stringify(data);
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

  // 2. Real-time subscription to room metadata changes (OBR players/GMs sync)
  useEffect(() => {
    if (isOwlbear()) {
      console.log('[DND Sheet] Subscribing to OBR room metadata changes.');
      
      const unsubscribe = OBR.room.onMetadataChange((metadata) => {
        const rawData = metadata[METADATA_KEY];
        if (!rawData) return;

        const serialized = JSON.stringify(rawData);
        // Only update local state if the incoming metadata differs from what we have
        if (serialized !== lastSerializedRef.current) {
          console.log('[DND Sheet] Detected remote metadata changes. Syncing local state...');
          lastSerializedRef.current = serialized;
          const parsedState = parseCharactersData(rawData);
          dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
        }
      });

      return unsubscribe;
    }
  }, []);

  // 3. Save local modifications to the storage/metadata
  useEffect(() => {
    if (isLoading) return; // Do not save during initial loading phase

    try {
      // Serialize the local characters state back to raw storage format
      const rawToSave = Object.entries(characters).reduce((acc, [id, data]) => {
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

      const serialized = JSON.stringify(rawToSave);
      
      // Only call save if our local state actually changed compared to the last sync point
      if (serialized !== lastSerializedRef.current) {
        console.log('[DND Sheet] Local changes detected. Saving to storage...');
        lastSerializedRef.current = serialized;
        saveCharactersApi(rawToSave).catch(error => {
          console.error("Failed to save characters:", error);
          addNotification("Ошибка: не удалось сохранить данные персонажа.", 'error');
        });
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