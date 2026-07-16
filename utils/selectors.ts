import { Character } from '../types';
import { getEquippedItemBonuses } from './inventory';

/**
 * Тип производных бонусов экипировки (совпадает с возвращаемым типом getEquippedItemBonuses).
 */
export type EquippedBonuses = ReturnType<typeof getEquippedItemBonuses>;

/**
 * Кэш для memoизации расчёта бонусов экипировки.
 *
 * Бонусы экипировки — чисто производное состояние от inventory/equippedItems/attunementItems.
 * Если ссылка персонажа не изменилась, бонусы тоже не изменились. WeakMap автоматически
 * очищает записи при сборке мусора для старых версий state, поэтому не течёт.
 *
 * Раньше getEquippedItemBonuses вызывался в 6+ местах внутри reducer-ов на каждое действие,
 * пересчитывая всё с нуля. Теперь memo кэширует результат для неизменной ссылки.
 */
const bonusesCache = new WeakMap<Character, EquippedBonuses>();

/**
 * Возвращает бонусы экипировки персонажа с мемоизацией по ссылке state.
 * Повторные вызовы с тем же объектом Character возвращают кэшированный результат.
 *
 * @param character Текущее состояние персонажа ( immutable reference из reducer).
 * @returns Объект с просуммированными бонусами всей экипировки.
 */
export const selectEquippedBonuses = (character: Character): EquippedBonuses => {
    const cached = bonusesCache.get(character);
    if (cached) return cached;
    const result = getEquippedItemBonuses(character);
    bonusesCache.set(character, result);
    return result;
};
