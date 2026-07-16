import { describe, it, expect } from 'vitest';
import { charactersReducer, CharactersState } from './appReducer';
import { Character, CharacterAction } from '../types';
import { makeTestCharacter } from './testFixtures';

const makeState = (char: Character, id = 'char-1'): CharactersState => ({
    [id]: {
        history: { past: [], present: char, future: [] },
        log: [],
    },
});

describe('charactersReducer — DISPATCH_CHARACTER_ACTION', () => {
    it('применяет действие и пушит предыдущее состояние в past', () => {
        const char = makeTestCharacter({ name: 'Старое' });
        const state = makeState(char);
        const action = { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Новое' } } as CharacterAction } };
        const result = charactersReducer(state, action);
        expect(result['char-1'].history.present.name).toBe('Новое');
        expect(result['char-1'].history.past).toHaveLength(1);
        expect(result['char-1'].history.past[0].name).toBe('Старое');
    });

    it('не создаёт запись истории, если состояние не изменилось', () => {
        const char = makeTestCharacter({ level: 5 });
        const state = makeState(char);
        const action = { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_LEVEL', payload: 5 } as CharacterAction } };
        const result = charactersReducer(state, action);
        // reducer возвращает тот же state-объект (ссылочно)
        expect(result).toBe(state);
    });

    it('создаёт запись в логе при изменении', () => {
        const char = makeTestCharacter({ name: 'Старое' });
        const state = makeState(char);
        const action = { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Новое' } } as CharacterAction } };
        const result = charactersReducer(state, action);
        expect(result['char-1'].log).toHaveLength(1);
        expect(result['char-1'].log[0].description).toContain('Новое');
    });
});

describe('charactersReducer — UNDO/REDO', () => {
    it('UNDO восстанавливает предыдущее состояние', () => {
        const char = makeTestCharacter({ name: 'Старое' });
        const state = makeState(char);
        const newState = charactersReducer(state, { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Новое' } } as CharacterAction } });
        const undone = charactersReducer(newState, { type: 'UNDO', payload: { id: 'char-1' } });
        expect(undone['char-1'].history.present.name).toBe('Старое');
        expect(undone['char-1'].history.future).toHaveLength(1);
    });

    it('REDO повторяет отменённое действие', () => {
        const char = makeTestCharacter({ name: 'Старое' });
        let state = makeState(char);
        state = charactersReducer(state, { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_FIELD', payload: { field: 'name', value: 'Новое' } } as CharacterAction } });
        state = charactersReducer(state, { type: 'UNDO', payload: { id: 'char-1' } });
        state = charactersReducer(state, { type: 'REDO', payload: { id: 'char-1' } });
        expect(state['char-1'].history.present.name).toBe('Новое');
    });

    it('UNDO ничего не делает, если история пуста', () => {
        const char = makeTestCharacter();
        const state = makeState(char);
        const result = charactersReducer(state, { type: 'UNDO', payload: { id: 'char-1' } });
        expect(result).toBe(state);
    });

    it('REDO ничего не делает, если future пуст', () => {
        const char = makeTestCharacter();
        const state = makeState(char);
        const result = charactersReducer(state, { type: 'REDO', payload: { id: 'char-1' } });
        expect(result).toBe(state);
    });
});

describe('charactersReducer — MAX_HISTORY_LENGTH', () => {
    it('ограничивает историю до 20 записей', () => {
        const char = makeTestCharacter({ experience: 0 });
        let state = makeState(char);
        // Делаем 25 изменений
        for (let i = 1; i <= 25; i++) {
            state = charactersReducer(state, { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_FIELD', payload: { field: 'experience', value: i } } as CharacterAction } });
        }
        expect(state['char-1'].history.past).toHaveLength(20);
    });

    it('ограничивает лог до 20 записей', () => {
        const char = makeTestCharacter({ name: 'x' });
        let state = makeState(char);
        for (let i = 0; i < 25; i++) {
            state = charactersReducer(state, { type: 'DISPATCH_CHARACTER_ACTION', payload: { id: 'char-1', action: { type: 'SET_FIELD', payload: { field: 'name', value: `name${i}` } } as CharacterAction } });
        }
        expect(state['char-1'].log.length).toBeLessThanOrEqual(20);
    });
});

describe('charactersReducer — ADD/DELETE_CHARACTER', () => {
    it('ADD_CHARACTER добавляет нового персонажа с пустой историей', () => {
        const state: CharactersState = {};
        const newChar = makeTestCharacter({ name: 'Герой' });
        const result = charactersReducer(state, { type: 'ADD_CHARACTER', payload: { id: 'new-1', character: newChar } });
        expect(result['new-1']).toBeDefined();
        expect(result['new-1'].history.present.name).toBe('Герой');
        expect(result['new-1'].history.past).toEqual([]);
        expect(result['new-1'].log).toEqual([]);
    });

    it('DELETE_CHARACTER удаляет персонажа', () => {
        const state = {
            'char-1': { history: { past: [], present: makeTestCharacter(), future: [] }, log: [] },
            'char-2': { history: { past: [], present: makeTestCharacter(), future: [] }, log: [] },
        };
        const result = charactersReducer(state, { type: 'DELETE_CHARACTER', payload: { id: 'char-1' } });
        expect(result['char-1']).toBeUndefined();
        expect(result['char-2']).toBeDefined();
    });
});

describe('charactersReducer — SET_CHARACTERS', () => {
    it('заменяет всё состояние', () => {
        const state = makeState(makeTestCharacter());
        const newState: CharactersState = {
            'other': { history: { past: [], present: makeTestCharacter({ name: 'Другой' }), future: [] }, log: [] },
        };
        const result = charactersReducer(state, { type: 'SET_CHARACTERS', payload: newState });
        expect(result).toBe(newState);
    });
});

describe('charactersReducer — ДЕТЕРМИНИЗМ UNDO (баг #1)', () => {
    it('SHORT_REST с предвычисленными бросками: undo восстанавливает ТОТ ЖЕ результат', () => {
        // Это ключевой тест: после рефакторинга reducer детерминирован,
        // значит undo корректно откатывает изменения HP без "нового броска".
        const char = makeTestCharacter({
            maxHitPoints: 100,
            currentHitPoints: 50,
            totalHitDice: 5,
            currentHitDice: 5,
            scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        });
        let state = makeState(char);
        // Бросок: кости [4, 6] → восстановление (4+0) + (6+0) = 10
        state = charactersReducer(state, {
            type: 'DISPATCH_CHARACTER_ACTION',
            payload: { id: 'char-1', action: { type: 'SHORT_REST', payload: { diceResults: [4, 6], conModifier: 0 } } as CharacterAction },
        });
        const hpAfterShortRest = state['char-1'].history.present.currentHitPoints;
        expect(hpAfterShortRest).toBe(60); // 50 + 10

        // Undo
        state = charactersReducer(state, { type: 'UNDO', payload: { id: 'char-1' } });
        expect(state['char-1'].history.present.currentHitPoints).toBe(50);

        // Redo — должно восстановить РОВНО 60, а не "перебросить"
        state = charactersReducer(state, { type: 'REDO', payload: { id: 'char-1' } });
        expect(state['char-1'].history.present.currentHitPoints).toBe(60);
    });

    it('LEVEL_UP с предвычисленным hpRoll: undo/redo стабилен', () => {
        const char = makeTestCharacter({
            level: 1,
            hitDie: 8,
            maxHitPoints: 8,
            currentHitPoints: 8,
            scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        });
        let state = makeState(char);
        // LEVEL_UP с roll=6 → hpGain = max(1, 6+0) = 6; maxHP = 8 + 6 = 14
        state = charactersReducer(state, {
            type: 'DISPATCH_CHARACTER_ACTION',
            payload: { id: 'char-1', action: { type: 'LEVEL_UP', payload: { method: 'roll', hpRoll: 6 } } as CharacterAction },
        });
        expect(state['char-1'].history.present.maxHitPoints).toBe(14);

        state = charactersReducer(state, { type: 'UNDO', payload: { id: 'char-1' } });
        expect(state['char-1'].history.present.maxHitPoints).toBe(8);

        state = charactersReducer(state, { type: 'REDO', payload: { id: 'char-1' } });
        expect(state['char-1'].history.present.maxHitPoints).toBe(14); // детерминированно 14, не переброс
    });
});
