import { HitDie } from '../types';

/**
 * Вычисляет модификатор характеристики на основе её значения.
 * @param score Значение характеристики (например, 10, 12, 18).
 * @returns Модификатор характеристики.
 */
export const calculateModifier = (score: number): number => Math.floor((score - 10) / 2);

/**
 * Вычисляет бонус мастерства на основе уровня персонажа.
 * @param level Уровень персонажа.
 * @returns Бонус мастерства.
 */
export const calculateProficiencyBonus = (level: number): number => Math.floor((level - 1) / 4) + 2;

/**
 * Пересчитывает максимальное количество очков здоровья на основе уровня, кости здоровья и телосложения.
 * @param level Уровень персонажа.
 * @param hitDie Кость здоровья класса (d6, d8, d10, d12).
 * @param conScore Значение характеристики Телосложение.
 * @returns Рассчитанное максимальное количество ОЗ.
 */
export const recalculateMaxHp = (level: number, hitDie: HitDie, conScore: number): number => {
    const conModifier = calculateModifier(conScore);
    const firstLevelHp = hitDie + conModifier;
    if (level === 1) {
        return Math.max(1, firstLevelHp);
    }
    const averageGain = Math.floor(hitDie / 2) + 1;
    const subsequentLevelsHp = (level - 1) * Math.max(1, averageGain + conModifier);
    return Math.max(1, firstLevelHp + subsequentLevelsHp);
};
