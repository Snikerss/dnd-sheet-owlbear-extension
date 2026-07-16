import { describe, it, expect } from 'vitest';
import { selectEquippedBonuses } from './selectors';
import { makeTestCharacter } from '../state/testFixtures';
import { InventoryItem, Currency, Rarity, Ability } from '../types';

const makeItem = (id: string, overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id,
    name: `Предмет ${id}`,
    description: '',
    quantity: 1,
    imageUrl: '',
    weight: 0,
    cost: { amount: 0, currency: Currency.GP },
    rarity: Rarity.Common,
    isEquipped: true,
    bonuses: {},
    ...overrides,
});

describe('selectEquippedBonuses — мемоизация (баг #9)', () => {
    it('возвращает тот же объект для повторного вызова с тем же персонажем', () => {
        const char = makeTestCharacter({
            equippedItems: [makeItem('i1', { bonuses: { ac: 3 } })],
        });
        const first = selectEquippedBonuses(char);
        const second = selectEquippedBonuses(char);
        // Ссылочное равенство — мемо работает
        expect(second).toBe(first);
    });

    it('возвращает новый объект для изменённого персонажа', () => {
        const char = makeTestCharacter({
            equippedItems: [makeItem('i1', { bonuses: { ac: 3 } })],
        });
        const first = selectEquippedBonuses(char);
        // Новый state (иммутабельный апдейт)
        const newChar = { ...char, equippedItems: [makeItem('i1', { bonuses: { ac: 5 } })] };
        const second = selectEquippedBonuses(newChar);
        expect(second).not.toBe(first);
        expect(second.ac).toBe(5);
    });

    it('корректно суммирует бонусы нескольких предметов', () => {
        const char = makeTestCharacter({
            equippedItems: [
                makeItem('i1', { bonuses: { ac: 2 } }),
                makeItem('i2', { bonuses: { ac: 3, speed: 10 } }),
            ],
        });
        const bonuses = selectEquippedBonuses(char);
        expect(bonuses.ac).toBe(5);
        expect(bonuses.speed).toBe(10);
    });

    it('возвращает нулевые бонусы для персонажа без экипировки', () => {
        const char = makeTestCharacter({ equippedItems: [], inventory: [] });
        const bonuses = selectEquippedBonuses(char);
        expect(bonuses.ac).toBe(0);
        expect(bonuses.speed).toBe(0);
        expect(bonuses.initiative).toBe(0);
    });

    it('обрабатывает abilityScores бонусы', () => {
        const char = makeTestCharacter({
            equippedItems: [
                makeItem('i1', { bonuses: { abilityScores: { STR: 2, DEX: 1 } as any } }),
            ],
        });
        const bonuses = selectEquippedBonuses(char);
        expect(bonuses.abilityScores.STR).toBe(2);
        expect(bonuses.abilityScores.DEX).toBe(1);
        // CON не задан в бонусах предмета → undefined (текущее поведение getEquippedItemBonuses)
        expect(bonuses.abilityScores.CON).toBeUndefined();
    });
});
