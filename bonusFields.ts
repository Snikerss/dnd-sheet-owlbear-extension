/**
 * Домен бонусных полей персонажа (устранение цикла types ↔ constants,
 * найденного madge): таблица живёт в независимом модуле, из которого
 * импортируются и типы (types.ts), и константы (constants.ts, реэкспорт
 * для обратной совместимости потребителей).
 *
 * Единый источник истины для полей бонусов, обрабатываемых действием SET_BONUS.
 * Типизирован как массив ключей Character со значением number, чтобы компилятор
 * гарантировал, что все поля существуют и являются числовыми.
 */
export const BONUS_FIELDS = [
    'acBonus',
    'initiativeBonus',
    'proficiencyBonusBonus',
    'speedBonus',
    'longJumpBonus',
    'highJumpBonus',
    'passivePerceptionBonus',
    'passiveInvestigationBonus',
    'passiveInsightBonus',
    'carryCapacityBonus',
    'attunementMaxBonus',
    'spellSaveDcBonus',
    'spellAttackBonusBonus',
    'maxHpBonus',
] as const;

export type BonusField = (typeof BONUS_FIELDS)[number];
