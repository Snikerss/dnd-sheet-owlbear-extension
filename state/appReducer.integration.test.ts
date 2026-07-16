import { describe, it, expect } from 'vitest';
import { charactersReducer, CharactersState } from './appReducer';
import { makeTestCharacter } from './testFixtures';
import { CharacterAction, Currency, InventoryItem, Rarity } from '../types';

const makeItemWithImage = (id: string, imageUrl: string): InventoryItem => ({
    id,
    name: `Предмет ${id}`,
    description: '',
    quantity: 1,
    imageUrl,
    weight: 0,
    cost: { amount: 0, currency: Currency.GP },
    rarity: Rarity.Common,
});

const makeState = (char: Character, id = 'char-1'): CharactersState => ({
    [id]: {
        history: { past: [], present: char, future: [] },
        log: [],
    },
});

describe('appReducer — интеграция изоляции изображений (баг #11)', () => {
    it('сохраняет лёгкую версию в past, но возвращает полную в present', () => {
        const char = makeTestCharacter({
            portraitUrl: 'data:image/png;base64,portrait_data',
            inventory: [makeItemWithImage('i1', 'data:image/png;base64,item_1_data')],
        });
        const state = makeState(char);

        // Диспатчим любое действие, изменяющее state (например, SET_FIELD name)
        const action = {
            type: 'DISPATCH_CHARACTER_ACTION',
            payload: {
                id: 'char-1',
                action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Новое имя' } } as CharacterAction,
            },
        };

        const result = charactersReducer(state, action);
        const entry = result['char-1']!;

        // 1. В present должна вернуться ПОЛНАЯ версия (картинки на месте для UI)
        expect(entry.history.present.name).toBe('Новое имя');
        expect(entry.history.present.portraitUrl).toBe('data:image/png;base64,portrait_data');
        expect(entry.history.present.inventory[0]?.imageUrl).toBe('data:image/png;base64,item_1_data');

        // 2. В past[] должна уйти ЛЁГКАЯ версия (с токенами, чтобы не забивать RAM)
        expect(entry.history.past).toHaveLength(1);
        const pastChar = entry.history.past[0]!;
        expect(pastChar.portraitUrl).toBe('img:ref:portrait');
        expect(pastChar.inventory[0]?.imageUrl).toBe('img:ref:i1');

        // 3. Карта изображений imageCache должна заполниться и лежать отдельно в entry
        expect(entry.imageCache).toBeDefined();
        expect(entry.imageCache?.get('img:ref:portrait')).toBe('data:image/png;base64,portrait_data');
        expect(entry.imageCache?.get('img:ref:i1')).toBe('data:image/png;base64,item_1_data');
    });

    it('UNDO/REDO корректно восстанавливает изображения из кэша', () => {
        const char = makeTestCharacter({
            portraitUrl: 'data:image/png;base64,portrait_data',
            inventory: [makeItemWithImage('i1', 'data:image/png;base64,item_1_data')],
        });
        let state = makeState(char);

        // Сделать изменение
        state = charactersReducer(state, {
            type: 'DISPATCH_CHARACTER_ACTION',
            payload: {
                id: 'char-1',
                action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Шаг 1' } } as CharacterAction,
            },
        });

        // Сделать второе изменение
        state = charactersReducer(state, {
            type: 'DISPATCH_CHARACTER_ACTION',
            payload: {
                id: 'char-1',
                action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Шаг 2' } } as CharacterAction,
            },
        });

        expect(state['char-1']?.history.present.name).toBe('Шаг 2');

        // Выполнить UNDO
        state = charactersReducer(state, { type: 'UNDO', payload: { id: 'char-1' } });
        let entry = state['char-1']!;
        expect(entry.history.present.name).toBe('Шаг 1');
        // Картинки должны восстановиться из кэша!
        expect(entry.history.present.portraitUrl).toBe('data:image/png;base64,portrait_data');
        expect(entry.history.present.inventory[0]?.imageUrl).toBe('data:image/png;base64,item_1_data');

        // Выполнить второй UNDO (на исходное)
        state = charactersReducer(state, { type: 'UNDO', payload: { id: 'char-1' } });
        entry = state['char-1']!;
        expect(entry.history.present.name).toBe('Эльдра'); // дефолт имя
        expect(entry.history.present.portraitUrl).toBe('data:image/png;base64,portrait_data');
        expect(entry.history.present.inventory[0]?.imageUrl).toBe('data:image/png;base64,item_1_data');

        // Выполнить REDO
        state = charactersReducer(state, { type: 'REDO', payload: { id: 'char-1' } });
        entry = state['char-1']!;
        expect(entry.history.present.name).toBe('Шаг 1');
        expect(entry.history.present.portraitUrl).toBe('data:image/png;base64,portrait_data');
        expect(entry.history.present.inventory[0]?.imageUrl).toBe('data:image/png;base64,item_1_data');
    });
});
