import { useReducer, useEffect, useCallback, useState } from 'react';
import { Character, CharacterAction, HistoryState, LogEntry } from '../types';
import { charactersReducer, CharactersState } from './appReducer';
import { isCharacter, migrateCharacterData } from './initialization';
import { characterReducer } from './characterReducer';
import { generateActionDescription } from '../utils/history';
import { useNotifier } from '../context/NotificationContext';
import { loadCharactersApi, saveCharactersApi } from '../utils/storage';

// The return type of our custom hook, defining its public API.
interface CharacterManager {
  characters: CharactersState;
  isLoading: boolean;
  addCharacter: (id: string, character: Character) => void;
  deleteCharacter: (id: string) => void;
  updateCharacter: (id: string, action: CharacterAction) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
}

/**
 * A custom hook to manage the entire lifecycle of character data.
 * It encapsulates state, persistence, and modification logic.
 *
 * @returns {CharacterManager} An object containing the character state and management functions.
 */
export const useCharacterManager = (): CharacterManager => {
  const [characters, dispatch] = useReducer(charactersReducer, {});
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifier();

  // Load characters from the storage on mount
  useEffect(() => {
    loadCharactersApi()
      .then(data => {
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          const parsedState = Object.entries(data).reduce((acc, [id, charData]) => {
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
          
          dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Не удалось загрузить персонажей:", error);
        addNotification("Ошибка: не удалось загрузить персонажей.", 'error');
        setIsLoading(false);
      });
  }, [addNotification]);

  // Effect for persisting character data to the storage whenever it changes.
  useEffect(() => {
    if (isLoading) return; // Do not save during initial load

    try {
      // Save the present state, action log, history stacks, and image cache (tokenized base64 mapping)
      const charactersToSave = Object.entries(characters).reduce((acc, [id, data]) => {
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

      saveCharactersApi(charactersToSave).catch(error => {
        console.error("Не удалось сохранить персонажей:", error);
        addNotification("Ошибка: не удалось сохранить данные персонажа.", 'error');
      });
    } catch (error) {
      console.error("Критическая ошибка сериализации:", error);
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