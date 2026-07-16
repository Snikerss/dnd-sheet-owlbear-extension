import { describe, it, expect, vi, afterEach } from 'vitest';
import { metaReducer } from './meta.reducer';
import { makeTestCharacter } from '../testFixtures';
import { Ability, CharacterSize, HitDie, CharacterAction } from '../../types';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('metaReducer — SET_FIELD', () => {
    it('обновляет строковые поля', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_FIELD', payload: { field: 'name', value: 'Горимир' } };
        const result = metaReducer(char, action);
        expect(result.name).toBe('Горимир');
    });

    it('обновляет числовые поля', () => {
        const char = makeTestCharacter({ experience: 100 });
        const action: CharacterAction = { type: 'SET_FIELD', payload: { field: 'experience', value: 500 } };
        const result = metaReducer(char, action);
        expect(result.experience).toBe(500);
    });

    it('обновляет portraitUrl', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_FIELD', payload: { field: 'portraitUrl', value: 'data:image/png;base64,abc' } };
        const result = metaReducer(char, action);
        expect(result.portraitUrl).toBe('data:image/png;base64,abc');
    });

    it('игнорирует поля не из белого списка', () => {
        const char = makeTestCharacter({ maxHitPoints: 50 });
        // @ts-expect-error — поле maxHitPoints не входит в coreFields
        const action: CharacterAction = { type: 'SET_FIELD', payload: { field: 'maxHitPoints', value: 99 } };
        const result = metaReducer(char, action);
        expect(result.maxHitPoints).toBe(50);
    });
});

describe('metaReducer — SET_LEVEL', () => {
    it('увеличивает уровень и пересчитывает HP/HitDice', () => {
        const char = makeTestCharacter({ level: 1, hitDie: HitDie.d8, scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
        const action: CharacterAction = { type: 'SET_LEVEL', payload: 5 };
        const result = metaReducer(char, action);
        expect(result.level).toBe(5);
        expect(result.totalHitDice).toBe(5);
        expect(result.currentHitDice).toBe(5);
        // ОЗ пересчитывается: recalculateMaxHp(5, d8, 10) = 8 + 4*5 = 28
        expect(result.maxHitPoints).toBe(28);
    });

    it('ограничивает уровень в диапазоне 1-20', () => {
        const char = makeTestCharacter({ level: 10 });
        const action: CharacterAction = { type: 'SET_LEVEL', payload: 99 };
        const result = metaReducer(char, action);
        expect(result.level).toBe(20);
    });

    it('не изменяет состояние, если уровень тот же', () => {
        const char = makeTestCharacter({ level: 5 });
        const action: CharacterAction = { type: 'SET_LEVEL', payload: 5 };
        const result = metaReducer(char, action);
        expect(result).toBe(char);
    });

    it('устанавливает experience из XP_THRESHOLDS при понижении уровня', () => {
        const char = makeTestCharacter({ level: 10, experience: 64000 });
        const action: CharacterAction = { type: 'SET_LEVEL', payload: 5 };
        const result = metaReducer(char, action);
        expect(result.experience).toBe(6500); // XP_THRESHOLDS[4]
    });
});

describe('metaReducer — LEVEL_UP', () => {
    it('увеличивает уровень на 1 (метод average)', () => {
        const char = makeTestCharacter({ level: 1, hitDie: HitDie.d8, scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
        const action: CharacterAction = { type: 'LEVEL_UP', payload: { method: 'average' } };
        const result = metaReducer(char, action);
        expect(result.level).toBe(2);
        expect(result.totalHitDice).toBe(2);
        // average для d8: floor(8/2)+1 = 5; +CON(0) = 5; max(1, 5) = 5
        // maxHP = 8 + 5 = 13
        expect(result.maxHitPoints).toBe(13);
    });

    it('увеличивает уровень на 1 (метод roll с предвычисленным броском)', () => {
        // Теперь reducer детерминирован: бросок передаётся в payload
        const char = makeTestCharacter({ level: 1, hitDie: HitDie.d8, scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
        const action: CharacterAction = { type: 'LEVEL_UP', payload: { method: 'roll', hpRoll: 8 } };
        const result = metaReducer(char, action);
        expect(result.level).toBe(2);
        // roll=8; +CON(0) = 8; max(1, 8) = 8
        // maxHP = 8 + 8 = 16
        expect(result.maxHitPoints).toBe(16);
    });

    it('не повышает уровень выше 20', () => {
        const char = makeTestCharacter({ level: 20 });
        const action: CharacterAction = { type: 'LEVEL_UP', payload: { method: 'average' } };
        const result = metaReducer(char, action);
        expect(result).toBe(char);
    });
});

describe('metaReducer — SET_SIZE', () => {
    it('меняет размер', () => {
        const char = makeTestCharacter({ size: CharacterSize.Medium });
        const action: CharacterAction = { type: 'SET_SIZE', payload: CharacterSize.Large };
        const result = metaReducer(char, action);
        expect(result.size).toBe(CharacterSize.Large);
    });
});

describe('metaReducer — TOGGLE_TAB_COLLAPSE', () => {
    it('переключает свёрнутость вкладки', () => {
        const char = makeTestCharacter({ collapsedTabs: { combat: false } });
        const action: CharacterAction = { type: 'TOGGLE_TAB_COLLAPSE', payload: 'combat' };
        const result = metaReducer(char, action);
        expect(result.collapsedTabs?.combat).toBe(true);
    });

    it('создаёт collapsedTabs, если его не было', () => {
        const char = makeTestCharacter({ collapsedTabs: {} });
        const action: CharacterAction = { type: 'TOGGLE_TAB_COLLAPSE', payload: 'stats' };
        const result = metaReducer(char, action);
        expect(result.collapsedTabs?.stats).toBe(true);
    });
});

describe('metaReducer — REORDER_TABS / SET_VIEW_MODE', () => {
    it('REORDER_TABS устанавливает новый порядок', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'REORDER_TABS', payload: ['combat', 'stats', 'inventory', 'features', 'notes'] };
        const result = metaReducer(char, action);
        expect(result.tabOrder).toEqual(['combat', 'stats', 'inventory', 'features', 'notes']);
    });

    it('SET_VIEW_MODE переключает режим', () => {
        const char = makeTestCharacter({ viewMode: 'tabs' });
        const action: CharacterAction = { type: 'SET_VIEW_MODE', payload: 'scroll' };
        const result = metaReducer(char, action);
        expect(result.viewMode).toBe('scroll');
    });
});
