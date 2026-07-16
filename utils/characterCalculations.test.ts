import { describe, it, expect } from 'vitest';
import { calculateModifier, calculateProficiencyBonus, recalculateMaxHp } from './characterCalculations';
import { HitDie } from '../types';

describe('calculateModifier', () => {
    it.each([
        [1, -5],
        [8, -1],
        [10, 0],
        [11, 0],
        [12, 1],
        [14, 2],
        [20, 5],
        [30, 10],
    ])('возвращает правильный модификатор для значения %i', (score, expected) => {
        expect(calculateModifier(score)).toBe(expected);
    });
});

describe('calculateProficiencyBonus', () => {
    it.each([
        [1, 2],
        [4, 2],
        [5, 3],
        [8, 3],
        [9, 4],
        [12, 4],
        [13, 5],
        [16, 5],
        [17, 6],
        [20, 6],
    ])('возвращает бонус мастерства %i для уровня %i', (level, expected) => {
        expect(calculateProficiencyBonus(level)).toBe(expected);
    });
});

describe('recalculateMaxHp', () => {
    it('минимум 1 ОЗ на 1 уровне даже с отрицательным телосложением', () => {
        // CON 1 → модификатор -5; hitDie d6 → 6 + (-5) = 1
        expect(recalculateMaxHp(1, HitDie.d6, 1)).toBe(1);
    });

    it('корректно считает для d8 и CON 10 на 1 уровне (нет бонуса)', () => {
        // d8 + 0 = 8
        expect(recalculateMaxHp(1, HitDie.d8, 10)).toBe(8);
    });

    it('учитывает бонус телосложения на 1 уровне', () => {
        // d8 + 2 (CON 14) = 10
        expect(recalculateMaxHp(1, HitDie.d8, 14)).toBe(10);
    });

    it('усредняет прирост ОЗ для уровней выше 1', () => {
        // 1 уровень: d8 + 0 = 8
        // уровни 2+: (d8/2 + 1) + 0 = 5 за уровень
        // уровень 5: 8 + 4*5 = 28
        expect(recalculateMaxHp(5, HitDie.d8, 10)).toBe(28);
    });

    it('учитывает модификатор CON для всех уровней', () => {
        // CON 14 → +2
        // 1 уровень: 8 + 2 = 10
        // уровни 2+: max(1, 5 + 2) = 7 за уровень
        // уровень 3: 10 + 2*7 = 24
        expect(recalculateMaxHp(3, HitDie.d8, 14)).toBe(24);
    });

    it('не даёт уйти в минус на высоких уровнях с плохим телосложением', () => {
        // CON 1 → -5; но max(1, ...) гарантирует минимум 1 за уровень
        // 1 уровень: max(1, d12 - 5) = max(1, 7) = 7
        // уровни 2+: max(1, 7 - 5) = max(1, 2) = 2
        // уровень 10: 7 + 9*2 = 25
        expect(recalculateMaxHp(10, HitDie.d12, 1)).toBe(25);
    });

    it('работает для всех кости здоровья на 1 уровне', () => {
        expect(recalculateMaxHp(1, HitDie.d6, 10)).toBe(6);
        expect(recalculateMaxHp(1, HitDie.d8, 10)).toBe(8);
        expect(recalculateMaxHp(1, HitDie.d10, 10)).toBe(10);
        expect(recalculateMaxHp(1, HitDie.d12, 10)).toBe(12);
    });
});
