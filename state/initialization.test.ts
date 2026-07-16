import { describe, it, expect } from 'vitest';
import { migrateCharacterData, isCharacter } from './initialization';
import { defaultCharacterState } from './defaultCharacterState';
import { Ability, Currency, Rarity } from '../types';

describe('isCharacter — валидация', () => {
    it('принимает валидного персонажа из defaultCharacterState', () => {
        expect(isCharacter(defaultCharacterState)).toBe(true);
    });

    it('отвергает null/undefined', () => {
        expect(isCharacter(null)).toBe(false);
        expect(isCharacter(undefined)).toBe(false);
    });

    it('отвергает строку', () => {
        expect(isCharacter('not a character')).toBe(false);
    });

    it('отвергает объект без обязательных полей', () => {
        expect(isCharacter({ name: 'Тест' })).toBe(false);
    });

    it('отвергает персонажа с невалидным level', () => {
        const char = { ...defaultCharacterState, level: 0 };
        expect(isCharacter(char)).toBe(false);
    });

    it('отвергает персонажа с level больше 20', () => {
        const char = { ...defaultCharacterState, level: 25 };
        expect(isCharacter(char)).toBe(false);
    });

    it('отвергает персонажа с невалидным hitDie', () => {
        const char = { ...defaultCharacterState, hitDie: 7 };
        expect(isCharacter(char)).toBe(false);
    });

    it('отвергает персонажа с неполным scores', () => {
        const char = { ...defaultCharacterState, scores: { STR: 10 } };
        expect(isCharacter(char)).toBe(false);
    });
});

describe('migrateCharacterData — миграции', () => {
    it('возвращает валидного персонажа после миграции defaultState', () => {
        const migrated = migrateCharacterData(defaultCharacterState);
        expect(isCharacter(migrated)).toBe(true);
    });

    it('мигрирует предметы без веса, добавляя weight: 0', () => {
        const char = {
            ...defaultCharacterState,
            inventory: [{ id: 'i1', name: 'Старый предмет', description: '', quantity: 1, imageUrl: '', cost: { amount: 0, currency: Currency.GP }, rarity: Rarity.Common }],
        };
        const migrated = migrateCharacterData(char);
        expect(migrated.inventory[0].weight).toBe(0);
    });

    it('мигрирует предметы без cost, добавляя дефолт', () => {
        const char = {
            ...defaultCharacterState,
            inventory: [{ id: 'i1', name: 'Без цены', description: '', quantity: 1, imageUrl: '', weight: 1, rarity: Rarity.Common }],
        };
        const migrated = migrateCharacterData(char);
        expect(migrated.inventory[0].cost).toEqual({ amount: 0, currency: Currency.GP });
    });

    it('мигрирует систему зарядов для старых предметов', () => {
        const char = {
            ...defaultCharacterState,
            inventory: [{ id: 'i1', name: 'Посох', description: '', quantity: 1, imageUrl: '', weight: 1, cost: { amount: 0, currency: Currency.GP }, rarity: Rarity.Rare }],
        };
        const migrated = migrateCharacterData(char);
        expect(migrated.inventory[0].hasCharges).toBe(false);
        expect(migrated.inventory[0].totalCharges).toBe(0);
        expect(migrated.inventory[0].currentCharges).toBe(0);
        expect(migrated.inventory[0].chargeRecovery).toBeDefined();
    });

    it('создаёт featureGroups, если их не было', () => {
        const char = { ...defaultCharacterState, featureGroups: undefined, features: [{ id: 'f1', name: 'Способность', description: '', totalUses: 1, currentUses: 1, recovery: 1 }] };
        const migrated = migrateCharacterData(char);
        expect(migrated.featureGroups).toBeDefined();
        expect(migrated.featureGroups).toHaveLength(1);
        expect(migrated.featureGroups[0].featureIds).toContain('f1');
    });

    it('создаёт noteGroups, если их не было', () => {
        const char = { ...defaultCharacterState, noteGroups: undefined, notes: [{ id: 'n1', title: 'Заметка', content: '' }] };
        const migrated = migrateCharacterData(char);
        expect(migrated.noteGroups).toBeDefined();
        expect(migrated.noteGroups[0].noteIds).toContain('n1');
    });

    it('нормализует spellSlots в полный объект 1-9 уровней', () => {
        const char = { ...defaultCharacterState, spellSlots: {} };
        const migrated = migrateCharacterData(char);
        for (let i = 1; i <= 9; i++) {
            expect(migrated.spellSlots[i]).toEqual({ total: 0, used: 0 });
        }
    });

    it('устанавливает spellcastingAbility по умолчанию, если невалидный', () => {
        const char = { ...defaultCharacterState, spellcastingAbility: 'INVALID' as any };
        const migrated = migrateCharacterData(char);
        expect(migrated.spellcastingAbility).toBe(Ability.INT);
    });

    it('не мутирует исходный объект (immutable)', () => {
        const original = { ...defaultCharacterState, inventory: [{ id: 'i1', name: 'Тест', description: '', quantity: 1, imageUrl: '', weight: 1, cost: { amount: 0, currency: Currency.GP }, rarity: Rarity.Common }] };
        const originalWeight = original.inventory[0].weight;
        migrateCharacterData(original);
        // Оригинал не должен измениться (миграция создаёт новые объекты)
        expect(original.inventory[0].weight).toBe(originalWeight);
    });
});
