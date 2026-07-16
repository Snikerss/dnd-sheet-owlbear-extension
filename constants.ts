import { Ability, ProficiencyLevel, Skill, Rarity, Currency, CharacterSize, RecoveryType, AttackType, DamageType, MagicSchool } from './types';

/**
 * Единый источник истины для полей бонусов, обрабатываемых действием SET_BONUS.
 * Раньше эти списки дублировались в abilities.reducer (боевые бонусы) и actions.reducer
 * (бонусы заклинаний) с разными наборами полей — это приводило к рассинхрону.
 * Теперь оба reducer-а импортируют этот массив.
 *
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

export const ABILITY_NAMES: Record<Ability, string> = {
    [Ability.STR]: 'Сила',
    [Ability.DEX]: 'Ловкость',
    [Ability.CON]: 'Телосложение',
    [Ability.INT]: 'Интеллект',
    [Ability.WIS]: 'Мудрость',
    [Ability.CHA]: 'Харизма',
};

export const PROFICIENCY_LEVEL_NAMES: Record<ProficiencyLevel, string> = {
    [ProficiencyLevel.None]: 'Нет владения',
    [ProficiencyLevel.Proficient]: 'Владение',
    [ProficiencyLevel.Expert]: 'Экспертиза',
};

export const SKILLS: Record<string, Omit<Skill, 'proficiency'>> = {
  'Атлетика': { name: 'Атлетика', ability: Ability.STR },

  'Акробатика': { name: 'Акробатика', ability: Ability.DEX },
  'Ловкость рук': { name: 'Ловкость рук', ability: Ability.DEX },
  'Скрытность': { name: 'Скрытность', ability: Ability.DEX },

  'Магия': { name: 'Магия', ability: Ability.INT },
  'История': { name: 'История', ability: Ability.INT },
  'Расследование': { name: 'Расследование', ability: Ability.INT },
  'Природа': { name: 'Природа', ability: Ability.INT },
  'Религия': { name: 'Религия', ability: Ability.INT },

  'Уход за животными': { name: 'Уход за животными', ability: Ability.WIS },
  'Проницательность': { name: 'Проницательность', ability: Ability.WIS },
  'Медицина': { name: 'Медицина', ability: Ability.WIS },
  'Внимательность': { name: 'Внимательность', ability: Ability.WIS },
  'Выживание': { name: 'Выживание', ability: Ability.WIS },
  
  'Обман': { name: 'Обман', ability: Ability.CHA },
  'Запугивание': { name: 'Запугивание', ability: Ability.CHA },
  'Выступление': { name: 'Выступление', ability: Ability.CHA },
  'Убеждение': { name: 'Убеждение', ability: Ability.CHA },
};

export const INITIAL_SKILLS: Record<string, Skill> = Object.values(SKILLS).reduce((acc, skill) => {
    acc[skill.name] = { ...skill, proficiency: ProficiencyLevel.None };
    return acc;
}, {} as Record<string, Skill>);

export const INITIAL_SKILL_BONUSES: Record<string, number> = Object.keys(SKILLS).reduce((acc, skillName) => {
    acc[skillName] = 0;
    return acc;
}, {} as Record<string, number>);


export const XP_THRESHOLDS = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

export const RARITY_NAMES: Record<Rarity, string> = {
    [Rarity.Common]: 'Обычный',
    [Rarity.Uncommon]: 'Необычный',
    [Rarity.Rare]: 'Редкий',
    [Rarity.VeryRare]: 'Очень редкий',
    [Rarity.Legendary]: 'Легендарный',
    [Rarity.Artifact]: 'Артефакт',
};

export const RARITY_COLORS: Record<Rarity, string> = {
    [Rarity.Common]: 'border-transparent',
    [Rarity.Uncommon]: 'border-[#61fa79]',
    [Rarity.Rare]: 'border-[#0095ff]',
    [Rarity.VeryRare]: 'border-[#a335ee]',
    [Rarity.Legendary]: 'border-[#ff8000]',
    [Rarity.Artifact]: 'border-[#e5cc80]',
};

export const CURRENCY_NAMES: Record<Currency, string> = {
    [Currency.CP]: 'Медные монеты',
    [Currency.SP]: 'Серебряные монеты',
    [Currency.EP]: 'Электрумовые монеты',
    [Currency.GP]: 'Золотые монеты',
    [Currency.PP]: 'Платиновые монеты',
};

export const CURRENCY_ABBREVIATIONS_RU: Record<Currency, string> = {
    [Currency.CP]: 'ММ',
    [Currency.SP]: 'СМ',
    [Currency.EP]: 'ЭМ',
    [Currency.GP]: 'ЗМ',
    [Currency.PP]: 'ПМ',
};

export const CHARACTER_SIZE_NAMES: Record<CharacterSize, string> = {
    [CharacterSize.Tiny]: 'Крошечный',
    [CharacterSize.Small]: 'Маленький',
    [CharacterSize.Medium]: 'Средний',
    [CharacterSize.Large]: 'Большой',
    [CharacterSize.Huge]: 'Огромный',
    [CharacterSize.Gargantuan]: 'Громадный',
};

export const RECOVERY_TYPE_NAMES: Record<RecoveryType, string> = {
    [RecoveryType.ShortRest]: 'Короткий отдых',
    [RecoveryType.LongRest]: 'Длинный отдых',
    [RecoveryType.ShortOrLongRest]: 'Короткий или длинный отдых',
    [RecoveryType.Other]: 'Другое',
    [RecoveryType.Dawn]: 'Рассвет',
};

export const ATTACK_TYPE_NAMES: Record<AttackType, string> = {
    [AttackType.Melee]: 'Ближняя',
    [AttackType.Ranged]: 'Дальнобойная',
    [AttackType.Spell]: 'Заклинание',
};

export const DAMAGE_TYPE_NAMES: Record<DamageType, string> = {
    [DamageType.Slashing]: 'Рубящий',
    [DamageType.Piercing]: 'Колющий',
    [DamageType.Bludgeoning]: 'Дробящий',
    [DamageType.Poison]: 'Яд',
    [DamageType.Acid]: 'Кислота',
    [DamageType.Fire]: 'Огонь',
    [DamageType.Cold]: 'Холод',
    [DamageType.Radiant]: 'Излучение',
    [DamageType.Necrotic]: 'Некротический',
    [DamageType.Lightning]: 'Электричество',
    [DamageType.Thunder]: 'Звук',
    [DamageType.Force]: 'Силовое поле',
    [DamageType.Psychic]: 'Психический',
};

export const DAMAGE_TYPE_COLORS: Record<DamageType, string> = {
    [DamageType.Slashing]: 'bg-gray-400/10 text-gray-300 border-gray-400/20',
    [DamageType.Piercing]: 'bg-gray-400/10 text-gray-300 border-gray-400/20',
    [DamageType.Bludgeoning]: 'bg-gray-400/10 text-gray-300 border-gray-400/20',
    [DamageType.Poison]: 'bg-[var(--color-success)]/10 text-green-300 border-green-500/20',
    [DamageType.Acid]: 'bg-lime-500/10 text-lime-300 border-lime-500/20',
    [DamageType.Fire]: 'bg-[var(--color-health)]/10 text-red-300 border-red-500/20',
    [DamageType.Cold]: 'bg-[var(--color-info)]/10 text-blue-300 border-blue-500/20',
    [DamageType.Radiant]: 'bg-[var(--color-accent-secondary)]/10 text-yellow-300 border-yellow-500/20',
    [DamageType.Necrotic]: 'bg-gray-800/20 text-gray-400 border-gray-600/30',
    [DamageType.Lightning]: 'bg-yellow-500/10 text-yellow-300 border-yellow-400/20',
    [DamageType.Thunder]: 'bg-sky-500/10 text-sky-300 border-sky-400/20',
    [DamageType.Force]: 'bg-[var(--color-accent-tertiary)]/10 text-pink-300 border-pink-400/20',
    [DamageType.Psychic]: 'bg-purple-500/10 text-purple-300 border-purple-400/20',
};

export const MAGIC_SCHOOL_NAMES: Record<MagicSchool, string> = {
    [MagicSchool.Abjuration]: 'Ограждение',
    [MagicSchool.Conjuration]: 'Вызов',
    [MagicSchool.Divination]: 'Прорицание',
    [MagicSchool.Enchantment]: 'Очарование',
    [MagicSchool.Evocation]: 'Воплощение',
    [MagicSchool.Illusion]: 'Иллюзия',
    [MagicSchool.Necromancy]: 'Некромантия',
    [MagicSchool.Transmutation]: 'Преобразование',
};

export const MAGIC_SCHOOL_COLORS: Record<MagicSchool, string> = {
    [MagicSchool.Abjuration]: 'border-[var(--color-info)]',
    [MagicSchool.Conjuration]: 'border-purple-400',
    [MagicSchool.Divination]: 'border-indigo-400',
    [MagicSchool.Enchantment]: 'border-[var(--color-accent-tertiary)]',
    [MagicSchool.Evocation]: 'border-[var(--color-accent-secondary)]',
    [MagicSchool.Illusion]: 'border-[var(--color-success)]',
    [MagicSchool.Necromancy]: 'border-gray-500',
    [MagicSchool.Transmutation]: 'border-[var(--color-accent-primary)]',
};