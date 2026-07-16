/**
 * Тестовый fixture: минимальный валидный Character для использования в тестах reducers.
 * Использует defaultCharacterState как базу, чтобы не дублировать большой объём полей.
 */
import { Character } from '../types';
import { defaultCharacterState } from './defaultCharacterState';

export const makeTestCharacter = (overrides: Partial<Character> = {}): Character => {
    // structuredClone нужен, чтобы тесты не мутировали общий defaultCharacterState
    const base = structuredClone(defaultCharacterState);
    return { ...base, ...overrides };
};

/**
 * Создаёт персонажа с конкретными HP/уровнем для боевых тестов.
 * Принимает Partial<Character>, чтобы можно было задать любое поле (включая temporaryHitPoints, features и т.д.),
 * с разумными дефолтами для боевых значений.
 */
export const makeCombatCharacter = (
    overrides: Partial<Character> = {},
): Character => {
    return makeTestCharacter({
        level: 5,
        maxHitPoints: 40,
        currentHitPoints: 40,
        totalHitDice: 5,
        currentHitDice: 5,
        ...overrides,
    });
};
