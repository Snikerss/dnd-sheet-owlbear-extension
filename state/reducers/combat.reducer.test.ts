import { describe, it, expect, vi, afterEach } from 'vitest';
import { combatReducer } from './combat.reducer';
import { makeCombatCharacter } from '../testFixtures';
import { Ability, CharacterAction, RecoveryType, HitDie } from '../../types';
import { Feature, InventoryItem } from '../../types';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('combatReducer — APPLY_HEALTH_CHANGE', () => {
    it('наносит урон', () => {
        const char = makeCombatCharacter({ currentHitPoints: 30, temporaryHitPoints: 0 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 10, type: 'damage' } };
        const result = combatReducer(char, action);
        expect(result.currentHitPoints).toBe(20);
    });

    it('не уходит в минус при большом уроне', () => {
        const char = makeCombatCharacter({ currentHitPoints: 5, temporaryHitPoints: 0 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 50, type: 'damage' } };
        const result = combatReducer(char, action);
        expect(result.currentHitPoints).toBe(0);
    });

    it('сначала снимает временные ОЗ при уроне', () => {
        const char = makeCombatCharacter({ maxHitPoints: 40, currentHitPoints: 30, temporaryHitPoints: 5 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 8, type: 'damage' } };
        const result = combatReducer(char, action);
        // 8 урона: 5 снимается с temp, 3 с current → 27
        expect(result.temporaryHitPoints).toBe(0);
        expect(result.currentHitPoints).toBe(27);
    });

    it('не снимает current HP, если урон полностью перекрыт temp HP', () => {
        const char = makeCombatCharacter({ maxHitPoints: 40, currentHitPoints: 30, temporaryHitPoints: 10 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 5, type: 'damage' } };
        const result = combatReducer(char, action);
        expect(result.temporaryHitPoints).toBe(5);
        expect(result.currentHitPoints).toBe(30);
    });

    it('лечит', () => {
        const char = makeCombatCharacter({ maxHitPoints: 40, currentHitPoints: 20 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 15, type: 'heal' } };
        const result = combatReducer(char, action);
        expect(result.currentHitPoints).toBe(35);
    });

    it('не лечит выше maxHP', () => {
        const char = makeCombatCharacter({ maxHitPoints: 40, currentHitPoints: 35 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 20, type: 'heal' } };
        const result = combatReducer(char, action);
        expect(result.currentHitPoints).toBe(40);
    });

    it('добавляет временные ОЗ (берёт максимум)', () => {
        const char = makeCombatCharacter({ temporaryHitPoints: 5 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 10, type: 'temp' } };
        const result = combatReducer(char, action);
        expect(result.temporaryHitPoints).toBe(10);
    });

    it('не уменьшает существующие temp HP при меньшем новом значении', () => {
        const char = makeCombatCharacter({ temporaryHitPoints: 10 });
        const action: CharacterAction = { type: 'APPLY_HEALTH_CHANGE', payload: { amount: 5, type: 'temp' } };
        const result = combatReducer(char, action);
        expect(result.temporaryHitPoints).toBe(10);
    });
});

describe('combatReducer — SET_HIT_DIE', () => {
    it('меняет кость здоровья и пересчитывает maxHP', () => {
        const char = makeCombatCharacter({
            level: 5,
            hitDie: HitDie.d8,
            scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            maxHitPoints: 28,
        });
        const action: CharacterAction = { type: 'SET_HIT_DIE', payload: HitDie.d10 };
        const result = combatReducer(char, action);
        expect(result.hitDie).toBe(HitDie.d10);
        // recalculateMaxHp(5, d10, 10) = 10 + 4*6 = 34
        expect(result.maxHitPoints).toBe(34);
    });

    it('возвращает то же состояние, если кость та же', () => {
        const char = makeCombatCharacter({ hitDie: HitDie.d8 });
        const action: CharacterAction = { type: 'SET_HIT_DIE', payload: HitDie.d8 };
        const result = combatReducer(char, action);
        expect(result).toBe(char);
    });
});

describe('combatReducer — SET_BONUS (maxHpBonus)', () => {
    it('пересчитывает maxHP при изменении maxHpBonus', () => {
        const char = makeCombatCharacter({
            level: 5,
            hitDie: HitDie.d8,
            scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            maxHitPoints: 28,
            maxHpBonus: 0,
        });
        const action: CharacterAction = { type: 'SET_BONUS', payload: { field: 'maxHpBonus', value: 10 } };
        const result = combatReducer(char, action);
        expect(result.maxHpBonus).toBe(10);
        // base 28 + bonus 10 = 38
        expect(result.maxHitPoints).toBe(38);
    });
});

describe('combatReducer — SHORT_REST', () => {
    it('тратит кости здоровья и восстанавливает ОЗ', () => {
        // Теперь reducer детерминирован: результаты бросков передаются в payload
        const char = makeCombatCharacter({
            level: 5,
            hitDie: HitDie.d8,
            maxHitPoints: 40,
            currentHitPoints: 10,
            totalHitDice: 5,
            currentHitDice: 5,
            scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }, // CON 0
        });
        // 2 кости по 5
        const action: CharacterAction = { type: 'SHORT_REST', payload: { diceResults: [5, 5], conModifier: 0 } };
        const result = combatReducer(char, action);
        expect(result.currentHitDice).toBe(3);
        // 2 кости по (5+0) = 10 исцеления
        expect(result.currentHitPoints).toBe(20);
    });

    it('восстанавливает способности с восстановлением ShortRest', () => {
        const feature: Feature = { id: 'f1', name: 'Действие', description: '', totalUses: 3, currentUses: 1, recovery: RecoveryType.ShortRest };
        const char = makeCombatCharacter({ currentHitPoints: 10, features: [feature] });
        const action: CharacterAction = { type: 'SHORT_REST', payload: { diceResults: [], conModifier: 0 } };
        const result = combatReducer(char, action);
        expect(result.features[0].currentUses).toBe(3);
    });

    it('не тратит больше костей, чем доступно', () => {
        const char = makeCombatCharacter({ currentHitDice: 2 });
        const action: CharacterAction = { type: 'SHORT_REST', payload: { diceResults: [1, 1, 1, 1, 1], conModifier: 0 } };
        const result = combatReducer(char, action);
        expect(result).toBe(char); // невалидный ввод — без изменений
    });

    it('гарантирует минимум 1 HP на кость даже с отрицательным CON', () => {
        const char = makeCombatCharacter({
            maxHitPoints: 40,
            currentHitPoints: 10,
            currentHitDice: 5,
        });
        // CON -3, бросок 2 → max(1, 2-3) = max(1, -1) = 1
        const action: CharacterAction = { type: 'SHORT_REST', payload: { diceResults: [2], conModifier: -3 } };
        const result = combatReducer(char, action);
        expect(result.currentHitPoints).toBe(11); // 10 + 1
    });
});

describe('combatReducer — LONG_REST', () => {
    it('восстанавливает ОЗ до максимума', () => {
        const char = makeCombatCharacter({ maxHitPoints: 40, currentHitPoints: 5, temporaryHitPoints: 10 });
        const action: CharacterAction = { type: 'LONG_REST' };
        const result = combatReducer(char, action);
        expect(result.currentHitPoints).toBe(40);
        expect(result.temporaryHitPoints).toBe(0);
    });

    it('восстанавливает половину костей здоровья (минимум 1)', () => {
        const char = makeCombatCharacter({ totalHitDice: 5, currentHitDice: 1 });
        const action: CharacterAction = { type: 'LONG_REST' };
        const result = combatReducer(char, action);
        // max(1, floor(5/2)) = 2 кости восстановлено; 1 + 2 = 3, не более totalHitDice
        expect(result.currentHitDice).toBe(3);
    });

    it('сбрасывает использованные ячейки заклинаний', () => {
        const char = makeCombatCharacter({
            spellSlots: {
                1: { total: 4, used: 4 },
                2: { total: 2, used: 1 },
            } as any,
        });
        const action: CharacterAction = { type: 'LONG_REST' };
        const result = combatReducer(char, action);
        expect(result.spellSlots[1].used).toBe(0);
        expect(result.spellSlots[2].used).toBe(0);
    });
});

describe('combatReducer — DAWN_RECOVERY (находится в inventoryReducer, но проверяем через combat нет — пропускаем)', () => {
    it('placeholder — Dawn обрабатывается в inventoryReducer', () => {
        expect(true).toBe(true);
    });
});

describe('combatReducer — SET_CURRENT_HIT_DICE', () => {
    it('устанавливает кости здоровья с ограничениями', () => {
        const char = makeCombatCharacter({ totalHitDice: 5, currentHitDice: 5 });
        const action: CharacterAction = { type: 'SET_CURRENT_HIT_DICE', payload: 3 };
        const result = combatReducer(char, action);
        expect(result.currentHitDice).toBe(3);
    });

    it('не уходит в минус', () => {
        const char = makeCombatCharacter({ currentHitDice: 5 });
        const action: CharacterAction = { type: 'SET_CURRENT_HIT_DICE', payload: -5 };
        const result = combatReducer(char, action);
        expect(result.currentHitDice).toBe(0);
    });

    it('не превышает totalHitDice', () => {
        const char = makeCombatCharacter({ totalHitDice: 5, currentHitDice: 5 });
        const action: CharacterAction = { type: 'SET_CURRENT_HIT_DICE', payload: 99 };
        const result = combatReducer(char, action);
        expect(result.currentHitDice).toBe(5);
    });
});

describe('combatReducer — AC', () => {
    it('SET_BASE_AC устанавливает базовый КД', () => {
        const char = makeCombatCharacter({ baseAC: 10 });
        const action: CharacterAction = { type: 'SET_BASE_AC', payload: 15 };
        const result = combatReducer(char, action);
        expect(result.baseAC).toBe(15);
    });

    it('SET_BASE_AC возвращает 10 для NaN', () => {
        const char = makeCombatCharacter({ baseAC: 10 });
        const action: CharacterAction = { type: 'SET_BASE_AC', payload: NaN };
        const result = combatReducer(char, action);
        expect(result.baseAC).toBe(10);
    });

    it('TOGGLE_AC_ABILITY_SOURCE переключает источник характеристики для КД', () => {
        const char = makeCombatCharacter({
            acAbilitySources: { STR: false, DEX: true, CON: false, INT: false, WIS: false, CHA: false },
        });
        const action: CharacterAction = { type: 'TOGGLE_AC_ABILITY_SOURCE', payload: Ability.WIS };
        const result = combatReducer(char, action);
        expect(result.acAbilitySources.WIS).toBe(true);
        expect(result.acAbilitySources.DEX).toBe(true); // не затронут
    });
});
