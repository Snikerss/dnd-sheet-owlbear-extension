import { Character, HistoryState, LogEntry } from '../types';
import { extractImages, applyImages, mergeImageMaps, ImageMap } from '../utils/imageStore';

/**
 * Состояние одного персонажа в глобальном сторе.
 * imageCache хранит base64-изображения ВНЕ истории undo/redo,
 * чтобы past[]/future[] содержали лёгкие версии (баг #11).
 * history.present всегда содержит ПОЛНУЮ версию (с реальными data: URLs) для UI.
 */
export interface CharacterEntry {
    history: HistoryState<Character>;
    log: LogEntry[];
    imageCache?: ImageMap;
}

export type CharactersState = Record<string, CharacterEntry>;

export type CharactersAction =
    | { type: 'ADD_CHARACTER'; payload: { id: string, character: Character } }
    | { type: 'DELETE_CHARACTER'; payload: { id: string } }
    | { type: 'UPDATE_CHARACTER'; payload: { id: string; newState: Character; logEntry: LogEntry | null } }
    | { type: 'DISPATCH_CHARACTER_ACTION'; payload: { id: string; action: import('../types').CharacterAction } }
    | { type: 'UNDO'; payload: { id: string } }
    | { type: 'REDO'; payload: { id: string } }
    | { type: 'SET_CHARACTERS'; payload: CharactersState }
    /**
     * Слияние внешнего снимка (localStorage / storage-event / соседняя вкладка).
     * В отличие от SET_CHARACTERS НЕ затирает состояние целиком:
     * пер-персонажно берёт удалённую версию только если она строго новее,
     * сохраняя undo/redo-историю нетронутых записей (баг аудита #9).
     */
    | { type: 'MERGE_REMOTE_CHARACTERS'; payload: CharactersState }
    | { type: 'SYNC_REMOTE_CHARACTER'; payload: { id: string; entry: CharacterEntry } }
    | { type: 'SYNC_REMOTE_CHARACTER_PORTRAIT'; payload: { id: string; portraitUrl: string } }
    | { type: 'SYNC_REMOTE_CHARACTER_IMAGE'; payload: { id: string; imgId: string; imgVal: string } };

const MAX_HISTORY_LENGTH = 20;

import { characterReducer } from './characterReducer';
import { generateActionDescription } from '../utils/history';
import { generateUUID } from '../utils/uuid';

/**
 * Помещает состояние в историю с изоляцией изображений.
 * Извлекает data: URLs в imageCache и хранит в past[] лёгкую версию ПРЕДЫДУЩЕГО состояния.
 * history.present всегда содержит ПОЛНУЮ версию (с картинками).
 */
const pushToHistory = (
    characterState: CharacterEntry,
    newPresent: Character,
): CharacterEntry => {
    // Центральный chokepoint: любая мутация персонажа фиксирует метку времени правки
    const stampedPresent: Character = {
        ...newPresent,
        lastModified: Date.now(),
    };
    const previous = characterState.history.present;
    // 1. Извлекаем картинки из ПРЕДЫДУЩЕГО состояния для помещения в past[]
    const { light: lightPrevious, images: prevImages } = extractImages(previous);
    const { past } = characterState.history;
    const newPast = [...past, lightPrevious].slice(-MAX_HISTORY_LENGTH);

    // 2. Также извлекаем картинки из НОВОГО состояния, чтобы они не потерялись при
    // последующем undo (например, если пользователь только что загрузил новое изображение)
    const { images: newImages } = extractImages(stampedPresent);

    // 3. Объединяем кэш: старый кэш + картинки из previous + картинки из newPresent
    let imageCache = characterState.imageCache ?? new Map();
    if (prevImages.size > 0) {
        imageCache = mergeImageMaps(imageCache, prevImages);
    }
    if (newImages.size > 0) {
        imageCache = mergeImageMaps(imageCache, newImages);
    }

    return {
        ...characterState,
        history: {
            past: newPast,
            present: stampedPresent,
            future: [],
        },
        imageCache,
    };
};

/**
 * Восстанавливает изображения в лёгкую версию из истории (для undo/redo).
 */
const restoreFromHistory = (
    characterState: CharacterEntry,
    newPresent: Character,
    past: Character[],
    future: Character[],
): CharacterEntry => {
    // newPresent из истории — лёгкая версия; подставляем изображения из кэша
    const fullPresent = applyImages(newPresent, characterState.imageCache ?? new Map());
    return {
        ...characterState,
        history: { past, present: fullPresent, future },
    };
};

export const charactersReducer = (state: CharactersState, action: CharactersAction): CharactersState => {
    switch (action.type) {
        case 'SET_CHARACTERS':
            return action.payload;

        /**
         * Пер-персонажное слияние внешнего снимка (баг #9 аудита).
         *
         * Правила:
         *  - новый для нас персонаж → добавляется;
         *  - удалённая версия СТРОГО новее локальной (по верхушке лога) →
         *    заменяет запись целиком (её undo-база устарела);
         *  - в остальных случаях локальная запись сохраняется ПО ССЫЛКЕ —
         *    вместе с past/future. Периодические записи bridge_signal /
         *    storage-event'ы больше не стирают историю отмены посреди сессии.
         */
        case 'MERGE_REMOTE_CHARACTERS': {
            const incoming = action.payload;
            let changed = false;
            const next: CharactersState = { ...state };

            for (const [id, entry] of Object.entries(incoming)) {
                if (!entry?.history?.present) continue;
                const local = state[id];

                if (!local) {
                    next[id] = entry;
                    changed = true;
                    continue;
                }

                // LWW: используем lastModified персонажа с фолбэком на верхушку лога
                const remoteTime = Number(entry.history.present.lastModified) || (entry.log.length > 0 ? entry.log[0]!.timestamp : 0);
                const localTime = Number(local.history?.present?.lastModified) || (local.log.length > 0 ? local.log[0]!.timestamp : 0);

                if (remoteTime > localTime) {
                    next[id] = entry;
                    changed = true;
                }
                // remoteTime <= localTime: оставляем локальную версию как есть.
            }

            // Персонажи, исчезнувшие из внешнего снимка, удалены с диска другой
            // вкладкой — убираем и у себя.
            for (const id of Object.keys(state)) {
                if (!(id in incoming)) {
                    delete next[id];
                    changed = true;
                }
            }

            return changed ? next : state;
        }

        case 'SYNC_REMOTE_CHARACTER': {
            const { id, entry } = action.payload;
            return {
                ...state,
                [id]: entry
            };
        }

        case 'SYNC_REMOTE_CHARACTER_PORTRAIT': {
            const { id, portraitUrl } = action.payload;
            const entry = state[id];
            if (!entry) return state;
            return {
                ...state,
                [id]: {
                    ...entry,
                    history: {
                        ...entry.history,
                        present: {
                            ...entry.history.present,
                            portraitUrl
                        }
                    }
                }
            };
        }

        case 'SYNC_REMOTE_CHARACTER_IMAGE': {
            const { id, imgId, imgVal } = action.payload;
            const entry = state[id];
            if (!entry) return state;
            const imageCache = new Map(entry.imageCache || new Map());
            imageCache.set(imgId, imgVal);
            const present = applyImages(entry.history.present, imageCache);
            return {
                ...state,
                [id]: {
                    ...entry,
                    history: {
                        ...entry.history,
                        present
                    },
                    imageCache
                }
            };
        }

        case 'ADD_CHARACTER': {
            const character: Character = {
                ...action.payload.character,
                lastModified: action.payload.character.lastModified || Date.now(),
            };
            return {
                ...state,
                [action.payload.id]: {
                    history: {
                        past: [],
                        present: character,
                        future: [],
                    },
                    log: [],
                }
            };
        }

        case 'DELETE_CHARACTER': {
            const { id } = action.payload;
            return Object.keys(state).reduce((acc, charId) => {
                if (charId !== id) {
                    const entry = state[charId];
                    if (entry) acc[charId] = entry;
                }
                return acc;
            }, {} as CharactersState);
        }
        
        case 'UPDATE_CHARACTER': {
            const { id, newState, logEntry } = action.payload;
            const characterState = state[id];

            if (!characterState) return state;

            const updated = pushToHistory(characterState, newState);
            return {
                ...state,
                [id]: {
                    ...updated,
                    log: logEntry ? [logEntry, ...characterState.log].slice(0, MAX_HISTORY_LENGTH) : characterState.log,
                },
            };
        }

        case 'DISPATCH_CHARACTER_ACTION': {
            const { id, action: charAction } = action.payload;
            const characterState = state[id];
            if (!characterState) return state;

            const oldState = characterState.history.present;
            const newState = characterReducer(oldState, charAction);

            if (newState === oldState) return state;

            const description = generateActionDescription(charAction, oldState, newState);
            const logEntry: LogEntry | null = description
                ? { id: generateUUID(), timestamp: Date.now(), description }
                : null;

            const updated = pushToHistory(characterState, newState);
            return {
                ...state,
                [id]: {
                    ...updated,
                    log: logEntry ? [logEntry, ...characterState.log].slice(0, MAX_HISTORY_LENGTH) : characterState.log,
                },
            };
        }

        case 'UNDO': {
            const { id } = action.payload;
            const characterState = state[id];
            if (!characterState || characterState.history.past.length === 0) return state;

            const { past, present, future } = characterState.history;
            // past.length > 0 гарантировано проверкой выше
            const previousState = past[past.length - 1]!;
            const newPast = past.slice(0, past.length - 1);
            // previousState — лёгкая версия из истории; восстанавливаем изображения
            const restored = restoreFromHistory(
                characterState,
                previousState,
                newPast,
                [present, ...future],
            );
            return {
                ...state,
                [id]: {
                    ...restored,
                    history: {
                        ...restored.history,
                        present: {
                            ...restored.history.present,
                            lastModified: Date.now(),
                        },
                    },
                },
            };
        }

        case 'REDO': {
            const { id } = action.payload;
            const characterState = state[id];
            if (!characterState || characterState.history.future.length === 0) return state;

            const { present, future } = characterState.history;
            // future.length > 0 гарантировано проверкой выше
            const nextState = future[0]!;
            const newFuture = future.slice(1);
            // nextState — лёгкая версия из истории; восстанавливаем изображения.
            // present (текущий) при помещении в past уже мог быть лёгким — но т.к.
            // он был восстановлен через restoreFromHistory ранее, он содержит полные данные.
            // При помещении в past extractImages снова извлечёт его изображения.
            const updated = pushToHistory(characterState, present);
            const restored = restoreFromHistory(updated, nextState, updated.history.past, newFuture);
            return {
                ...state,
                [id]: {
                    ...restored,
                    history: {
                        ...restored.history,
                        present: {
                            ...restored.history.present,
                            lastModified: Date.now(),
                        },
                    },
                },
            };
        }

        default:
            return state;
    }
};