import { Character, Ability, InventoryItem, ProficiencyLevel, Rarity, Currency, CharacterSize, Feature, RecoveryType, Attack, AttackType, DamageType, Spell, MagicSchool, Note } from '../types';
import { logger } from '../utils/logger';
import { SKILLS } from '../constants';
import { defaultCharacterState } from './defaultCharacterState';

/**
 * Sanitizes rich text HTML strings from untrusted external JSON imports.
 * Retains safe formatting tags (b, i, u, s, mark, span style, h3, br) and strips script/iframe/event handlers.
 */
export const sanitizeRichTextString = (str: string): string => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
        .replace(/\son\w+=\w+/gi, '')
        .replace(/javascript:/gi, '');
};

/**
 * Migrates a single item object to include new fields if they are missing.
 * This ensures backward compatibility with older saved data.
 * @param item The item object to migrate.
 * @returns The migrated item object.
 */
const migrateItem = (item: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined => {
    if (typeof item !== 'object' || item === null) return item;

    const migrated = { ...item };
    if (typeof migrated.description === 'string') {
        migrated.description = sanitizeRichTextString(migrated.description);
    }

    if (typeof migrated.weight !== 'number') {
        migrated.weight = 0;
    }
    if (typeof migrated.cost !== 'object' || migrated.cost === null) {
        migrated.cost = { amount: 0, currency: Currency.GP };
    }
    if (typeof migrated.rarity !== 'number' || !Object.values(Rarity).includes(migrated.rarity)) {
        migrated.rarity = Rarity.Common;
    }
    
    // Charge system migration
    if (typeof migrated.hasCharges !== 'boolean') {
        migrated.hasCharges = false;
    }
    if (typeof migrated.totalCharges !== 'number') {
        migrated.totalCharges = 0;
    }
    if (typeof migrated.currentCharges !== 'number') {
        migrated.currentCharges = 0;
    }
    if (typeof migrated.chargeRecovery !== 'number' || !Object.values(RecoveryType).includes(migrated.chargeRecovery)) {
        migrated.chargeRecovery = RecoveryType.LongRest;
    }
    if (typeof migrated.isConsumable !== 'boolean') {
        migrated.isConsumable = false;
    }



    // Recursively migrate items inside a chest
    if (migrated.isChest && Array.isArray(migrated.chestInventory)) {
        migrated.chestInventory = migrated.chestInventory.map(migrateItem);
    }

    return migrated;
};

/**
 * Migrates an entire character data object to ensure all items have the new fields.
 * @param characterData The character data to migrate.
 * @returns The migrated character data.
 */
export const migrateCharacterData = (characterData: unknown): Character => {
    if (typeof characterData !== 'object' || characterData === null) return structuredClone(defaultCharacterState);
    const cd = characterData as Record<string, unknown>;

    // Shallow merge characterData with defaultCharacterState, and deep merge core nested maps
    const migrated: Record<string, unknown> = {
        ...defaultCharacterState,
        ...cd,
        scores: { ...defaultCharacterState.scores, ...(cd.scores as Record<string, unknown> || {}) },
        skills: { ...defaultCharacterState.skills, ...(cd.skills as Record<string, unknown> || {}) },
        savingThrowProficiencies: { ...defaultCharacterState.savingThrowProficiencies, ...(cd.savingThrowProficiencies as Record<string, unknown> || {}) },
        abilityBonuses: { ...defaultCharacterState.abilityBonuses, ...(cd.abilityBonuses as Record<string, unknown> || {}) },
        skillBonuses: { ...defaultCharacterState.skillBonuses, ...(cd.skillBonuses as Record<string, unknown> || {}) },
        savingThrowBonuses: { ...defaultCharacterState.savingThrowBonuses, ...(cd.savingThrowBonuses as Record<string, unknown> || {}) },
        acAbilitySources: { ...defaultCharacterState.acAbilitySources, ...(cd.acAbilitySources as Record<string, unknown> || {}) },
        currency: { ...defaultCharacterState.currency, ...(cd.currency as Record<string, unknown> || {}) },
    };

    if (Array.isArray(migrated.inventory)) {
        migrated.inventory = migrated.inventory.map((i) => migrateItem(i as Record<string, unknown>));
    }
    
    // Migrate items equipped on doll from inventory to equippedItems
    if (!Array.isArray(migrated.equippedItems)) {
        migrated.equippedItems = [];
    }
    if (Array.isArray(migrated.inventory)) {
        migrated.inventory.forEach((item: unknown, idx: number) => {
            const it = item as { equippedX?: unknown; equippedY?: unknown } | null;
            if (it && it.equippedX !== undefined && it.equippedY !== undefined) {
                (migrated.equippedItems as unknown[]).push(it);
                (migrated.inventory as unknown[])[idx] = null;
            }
        });
    }
    if (Array.isArray(migrated.attunementItems)) {
        migrated.attunementItems = migrated.attunementItems.map((i) => migrateItem(i as Record<string, unknown>));
    }
    if (Array.isArray(migrated.notes)) {
        migrated.notes = migrated.notes.map((n: { content?: unknown }) => ({
            ...n,
            content: typeof n?.content === 'string' ? sanitizeRichTextString(n.content) : ''
        }));
    }
    if (Array.isArray(migrated.features)) {
        migrated.features = migrated.features.map((f: { description?: unknown }) => ({
            ...f,
            description: typeof f?.description === 'string' ? sanitizeRichTextString(f.description) : ''
        }));
    } else {
        migrated.features = [];
    }
    if (Array.isArray(migrated.spells)) {
        migrated.spells = migrated.spells.map((s: { description?: unknown; components?: { materialDescription?: unknown } }) => ({
            ...s,
            description: typeof s?.description === 'string' ? sanitizeRichTextString(s.description) : '',
            components: s?.components ? {
                ...s.components,
                materialDescription: typeof s.components.materialDescription === 'string' ? sanitizeRichTextString(s.components.materialDescription) : ''
            } : s?.components
        }));
    }
    if (Array.isArray(migrated.attacks)) {
        migrated.attacks = migrated.attacks.map((attack: unknown) => {
            if (typeof attack === 'object' && attack !== null) {
                const atk = { ...(attack as Record<string, unknown>) };
                if (typeof atk.imageUrl !== 'string') atk.imageUrl = '';
                if (typeof atk.notes === 'string') atk.notes = sanitizeRichTextString(atk.notes);
                return atk;
            }
            return attack;
        });
    } else {
        migrated.attacks = [];
    }
    if (typeof migrated.passivePerceptionBonus !== 'number') {
        migrated.passivePerceptionBonus = 0;
    }
    if (typeof migrated.passiveInvestigationBonus !== 'number') {
        migrated.passiveInvestigationBonus = 0;
    }
    if (typeof migrated.passiveInsightBonus !== 'number') {
        migrated.passiveInsightBonus = 0;
    }
    if (typeof migrated.maxHpBonus !== 'number') {
        migrated.maxHpBonus = 0;
    }
    if (Object.prototype.hasOwnProperty.call(migrated, 'globalAttackBonus')) {
        delete migrated.globalAttackBonus;
    }
    
    // Migration from single dice bonus to separate hit/damage dice bonuses
    if (typeof migrated.globalAttackDiceBonus === 'string') {
        migrated.globalAttackDiceBonusToHitDice = '';
        migrated.globalAttackDiceBonusToDamageDice = '';
        if (migrated.globalAttackDiceBonusToHit) {
            migrated.globalAttackDiceBonusToHitDice = migrated.globalAttackDiceBonus;
        }
        if (migrated.globalAttackDiceBonusToDamage) {
            migrated.globalAttackDiceBonusToDamageDice = migrated.globalAttackDiceBonus;
        }
        delete migrated.globalAttackDiceBonus;
        delete migrated.globalAttackDiceBonusToHit;
        delete migrated.globalAttackDiceBonusToDamage;
    }

    if (typeof migrated.globalAttackDiceBonusToHitDice !== 'string') {
        migrated.globalAttackDiceBonusToHitDice = '';
    }
    if (typeof migrated.globalAttackDiceBonusToDamageDice !== 'string') {
        migrated.globalAttackDiceBonusToDamageDice = '';
    }
    // Spell migration
    if (Array.isArray(migrated.spells)) {
        migrated.spells = migrated.spells.map((spell: unknown) => {
            if (typeof spell === 'object' && spell !== null) {
                const s = { ...(spell as Record<string, unknown>) };
                if (typeof s.components !== 'object' || s.components === null) {
                    s.components = {
                        verbal: false,
                        somatic: false,
                        material: false,
                        materialDescription: '',
                    };
                }
                if (typeof s.range !== 'string') {
                    s.range = '60 футов';
                }
                if (typeof s.duration !== 'string') {
                    s.duration = 'Мгновенная';
                }
                if (typeof s.isRitual !== 'boolean') {
                    s.isRitual = false;
                }
                if (typeof s.requiresConcentration !== 'boolean') {
                    s.requiresConcentration = false;
                }
                return s;
            }
            return spell;
        });
    } else {
        migrated.spells = [];
    }

    if (typeof migrated.spellcastingAbility !== 'string' || !Object.values(Ability).includes(migrated.spellcastingAbility as Ability)) {
        migrated.spellcastingAbility = Ability.INT;
    }
    if (typeof migrated.maxPreparedSpells !== 'number') {
        migrated.maxPreparedSpells = 0;
    }
    const spellSlots = (migrated.spellSlots as Record<number, { total: number; used: number }>) || {};
    migrated.spellSlots = spellSlots;
    for (let i = 1; i <= 9; i++) {
        if (typeof spellSlots[i] !== 'object' || spellSlots[i] === null) {
            spellSlots[i] = { total: 0, used: 0 };
        }
        if (typeof spellSlots[i]!.total !== 'number') spellSlots[i]!.total = 0;
        if (typeof spellSlots[i]!.used !== 'number') spellSlots[i]!.used = 0;
    }
    if (typeof migrated.spellSaveDcBonus !== 'number') {
        migrated.spellSaveDcBonus = 0;
    }
    if (typeof migrated.spellAttackBonusBonus !== 'number') {
        migrated.spellAttackBonusBonus = 0;
    }
    if (typeof migrated.currency !== 'object' || migrated.currency === null) {
        migrated.currency = { CP: 0, SP: 0, EP: 0, GP: 0, PP: 0 };
    }
    
    // AC System Migration
    if (typeof migrated.baseAC !== 'number') {
        migrated.baseAC = 10;
    }
    if (typeof migrated.acAbilitySources !== 'object' || migrated.acAbilitySources === null) {
        migrated.acAbilitySources = {
            [Ability.STR]: false,
            [Ability.DEX]: true,
            [Ability.CON]: false,
            [Ability.INT]: false,
            [Ability.WIS]: false,
            [Ability.CHA]: false,
        };
    }
    if (typeof migrated.acBonus !== 'number') {
        migrated.acBonus = 0;
    }
    if (typeof migrated.carryCapacityBonus !== 'number') {
        migrated.carryCapacityBonus = 0;
    }
    
    // Notes System Migration
    if (!Array.isArray(migrated.notes)) {
        migrated.notes = [];
    }
    if (typeof migrated.activeNoteId === 'undefined') {
        migrated.activeNoteId = null;
    }
    if (!Array.isArray(migrated.featureGroups) || migrated.featureGroups.length === 0) {
        migrated.featureGroups = [
            {
                id: 'default',
                name: 'Особенности',
                featureIds: ((migrated.features as Array<{ id: string }>) || []).map((f) => f.id)
            }
        ];
    }
    if (!Array.isArray(migrated.noteGroups) || migrated.noteGroups.length === 0) {
        migrated.noteGroups = [
            {
                id: 'default',
                name: 'Мои заметки',
                noteIds: ((migrated.notes as Array<{ id: string }>) || []).map((n) => n.id)
            }
        ];
    }

    // Attunement System Migration
    if (typeof migrated.attunementMaxBonus !== 'number') {
        migrated.attunementMaxBonus = 0;
    }
    if (Array.isArray(migrated.attunementItems) && migrated.attunementItems.length > 0) {
        const itemsToMove = (migrated.attunementItems as Array<Record<string, unknown> | null>).filter((i): i is Record<string, unknown> => i !== null);
        if (itemsToMove.length > 0) {
            const processedItems = itemsToMove.map((item, index: number) => ({
                ...item,
                isEquipped: true,
                requiresAttunement: true,
                isAttuned: true,
                attunementTimestamp: Date.now() + index
            }));

            if (!Array.isArray(migrated.inventory)) {
                migrated.inventory = [];
            }

            let targetIdx = 0;
            const inv = migrated.inventory as Array<unknown>;
            processedItems.forEach((item) => {
                while (targetIdx < inv.length && inv[targetIdx] !== null) {
                    targetIdx++;
                }
                if (targetIdx < inv.length) {
                    inv[targetIdx] = item;
                } else {
                    inv.push(item);
                }
            });
        }
        delete migrated.attunementItems;
    }

    // Tab Order & View Mode Migration
    const DEFAULT_TAB_ORDER = ['stats', 'combat', 'inventory', 'features', 'notes'];
    if (!Array.isArray(migrated.tabOrder) || migrated.tabOrder.length === 0) {
        migrated.tabOrder = [...DEFAULT_TAB_ORDER];
    }
    if (typeof migrated.viewMode !== 'string' || (migrated.viewMode !== 'tabs' && migrated.viewMode !== 'scroll')) {
        migrated.viewMode = 'tabs';
    }
    if (typeof migrated.collapsedTabs !== 'object' || migrated.collapsedTabs === null) {
        migrated.collapsedTabs = {};
    }

    return migrated as unknown as Character;
};

/**
 * Recursively validates if an object is a valid InventoryItem.
 * @param item The object to validate.
 * @returns True if the object is a valid InventoryItem, false otherwise.
 */
const isInventoryItem = (item: unknown): item is InventoryItem => {
    if (typeof item !== 'object' || item === null) return false;
    const it = item as Partial<InventoryItem>;
    const hasBaseFields =
        typeof it.id === 'string' &&
        typeof it.name === 'string' &&
        typeof it.description === 'string' &&
        typeof it.imageUrl === 'string' &&
        typeof it.quantity === 'number' &&
        typeof it.weight === 'number' &&
        typeof it.cost === 'object' && it.cost !== null && typeof it.cost.amount === 'number' && Object.values(Currency).includes(it.cost.currency) &&
        typeof it.rarity === 'number' && Object.values(Rarity).includes(it.rarity);

    if (!hasBaseFields) return false;

    // Optional fields for charges
    if (it.hasCharges !== undefined && typeof it.hasCharges !== 'boolean') return false;
    if (it.totalCharges !== undefined && typeof it.totalCharges !== 'number') return false;
    if (it.currentCharges !== undefined && typeof it.currentCharges !== 'number') return false;
    if (it.chargeRecovery !== undefined && (typeof it.chargeRecovery !== 'number' || !Object.values(RecoveryType).includes(it.chargeRecovery))) return false;

    if (it.isChest === true) {
        if (!Array.isArray(it.chestInventory)) return false;
        // Recursively validate items inside the chest
        if (!it.chestInventory.every((subItem: unknown) => subItem === null || isInventoryItem(subItem))) {
            return false;
        }
    }
    return true;
};

const isFeature = (feature: unknown): feature is Feature => {
    if (typeof feature !== 'object' || feature === null) return false;
    const f = feature as Partial<Feature>;
    return (
        typeof f.id === 'string' &&
        typeof f.name === 'string' &&
        typeof f.description === 'string' &&
        typeof f.totalUses === 'number' &&
        typeof f.currentUses === 'number' &&
        typeof f.recovery === 'number' && Object.values(RecoveryType).includes(f.recovery)
    );
};

const isAttack = (attack: unknown): attack is Attack => {
    if (typeof attack !== 'object' || attack === null) return false;
    const atk = attack as Partial<Attack>;
    return (
        typeof atk.id === 'string' &&
        typeof atk.name === 'string' &&
        typeof atk.imageUrl === 'string' &&
        typeof atk.attackType === 'number' && Object.values(AttackType).includes(atk.attackType) &&
        typeof atk.rangeNormal === 'number' &&
        (typeof atk.rangeLong === 'number' || atk.rangeLong === null) &&
        typeof atk.hitAbility === 'string' && Object.values(Ability).includes(atk.hitAbility as Ability) &&
        (typeof atk.damageAbility === 'string' && (Object.values(Ability).includes(atk.damageAbility as Ability) || atk.damageAbility === 'None')) &&
        typeof atk.isProficient === 'boolean' &&
        typeof atk.hitBonus === 'number' &&
        typeof atk.damageDice === 'string' &&
        typeof atk.damageBonus === 'number' &&
        typeof atk.damageType === 'string' && Object.values(DamageType).includes(atk.damageType as DamageType) &&
        typeof atk.notes === 'string'
    );
};

const isSpell = (spell: unknown): spell is Spell => {
    if (typeof spell !== 'object' || spell === null) return false;
    const sp = spell as Partial<Spell>;
    const hasComponents = 
        typeof sp.components === 'object' && sp.components !== null &&
        typeof sp.components.verbal === 'boolean' &&
        typeof sp.components.somatic === 'boolean' &&
        typeof sp.components.material === 'boolean' &&
        typeof sp.components.materialDescription === 'string';

    return (
        typeof sp.id === 'string' &&
        typeof sp.name === 'string' &&
        typeof sp.description === 'string' &&
        typeof sp.level === 'number' && sp.level >= 0 && sp.level <= 9 &&
        typeof sp.school === 'number' && Object.values(MagicSchool).includes(sp.school) &&
        typeof sp.castingTime === 'string' &&
        typeof sp.range === 'string' &&
        typeof sp.duration === 'string' &&
        typeof sp.isPrepared === 'boolean' &&
        typeof sp.imageUrl === 'string' &&
        typeof sp.isRitual === 'boolean' &&
        typeof sp.requiresConcentration === 'boolean' &&
        hasComponents
    );
};

const isNote = (note: unknown): note is Note => {
    if (typeof note !== 'object' || note === null) return false;
    const n = note as Partial<Note>;
    return (
        typeof n.id === 'string' &&
        typeof n.title === 'string' &&
        typeof n.content === 'string'
    );
};

export const isCharacter = (data: unknown): data is Character => {
    if (typeof data !== 'object' || data === null) {
        logger.warn('[DND Sheet] isCharacter failed: data is null or not an object');
        return false;
    }
    const d = data as Partial<Character>;

    // Individual core field checks for detailed console logging
    const coreChecks: Record<string, boolean> = {
        name: typeof d.name === 'string',
        race: typeof d.race === 'string',
        characterClass: typeof d.characterClass === 'string',
        level: typeof d.level === 'number' && d.level >= 1 && d.level <= 20,
        experience: typeof d.experience === 'number',
        portraitUrl: typeof d.portraitUrl === 'string',
        maxHitPoints: typeof d.maxHitPoints === 'number',
        currentHitPoints: typeof d.currentHitPoints === 'number',
        temporaryHitPoints: typeof d.temporaryHitPoints === 'number',
        baseAC: typeof d.baseAC === 'number',
        acBonus: typeof d.acBonus === 'number',
        initiativeBonus: typeof d.initiativeBonus === 'number',
        proficiencyBonusBonus: typeof d.proficiencyBonusBonus === 'number',
        attunementSlots: typeof d.attunementSlots === 'number',
        inventoryRows: typeof d.inventoryRows === 'number',
        totalHitDice: typeof d.totalHitDice === 'number',
        currentHitDice: typeof d.currentHitDice === 'number',
        speed: typeof d.speed === 'number',
        speedBonus: typeof d.speedBonus === 'number',
        longJumpBonus: typeof d.longJumpBonus === 'number',
        highJumpBonus: typeof d.highJumpBonus === 'number',
        size: typeof d.size === 'number' && Object.values(CharacterSize).includes(d.size),
        passivePerceptionBonus: typeof d.passivePerceptionBonus === 'number',
        passiveInvestigationBonus: typeof d.passiveInvestigationBonus === 'number',
        passiveInsightBonus: typeof d.passiveInsightBonus === 'number',
        maxHpBonus: typeof d.maxHpBonus === 'number',
        globalAttackDiceBonusToHitDice: typeof d.globalAttackDiceBonusToHitDice === 'string',
        globalAttackDiceBonusToDamageDice: typeof d.globalAttackDiceBonusToDamageDice === 'string',
        spellcastingAbility: typeof d.spellcastingAbility === 'string' && Object.values(Ability).includes(d.spellcastingAbility as Ability),
        maxPreparedSpells: typeof d.maxPreparedSpells === 'number',
        spellSaveDcBonus: typeof d.spellSaveDcBonus === 'number',
        spellAttackBonusBonus: typeof d.spellAttackBonusBonus === 'number',
        currency: typeof d.currency === 'object' && d.currency !== null,
        activeNoteId: typeof d.activeNoteId === 'string' || d.activeNoteId === null
    };

    const failedCore = Object.entries(coreChecks).filter(([_, passed]) => !passed).map(([name]) => name);
    if (failedCore.length > 0) {
        logger.warn(`[DND Sheet] isCharacter failed core fields validation. Failed fields: ${failedCore.join(', ')}`, data);
        return false;
    }

    const objectChecks: Record<string, boolean> = {
        scores: typeof d.scores === 'object' && d.scores !== null,
        skills: typeof d.skills === 'object' && d.skills !== null,
        savingThrowProficiencies: typeof d.savingThrowProficiencies === 'object' && d.savingThrowProficiencies !== null,
        abilityBonuses: typeof d.abilityBonuses === 'object' && d.abilityBonuses !== null,
        skillBonuses: typeof d.skillBonuses === 'object' && d.skillBonuses !== null,
        savingThrowBonuses: typeof d.savingThrowBonuses === 'object' && d.savingThrowBonuses !== null,
        acAbilitySources: typeof d.acAbilitySources === 'object' && d.acAbilitySources !== null,
        spellSlots: typeof d.spellSlots === 'object' && d.spellSlots !== null
    };

    const failedObjects = Object.entries(objectChecks).filter(([_, passed]) => !passed).map(([name]) => name);
    if (failedObjects.length > 0) {
        logger.warn(`[DND Sheet] isCharacter failed nested objects validation. Failed: ${failedObjects.join(', ')}`, data);
        return false;
    }

    const validHitDies = [6, 8, 10, 12];
    if (typeof d.hitDie !== 'number' || !validHitDies.includes(d.hitDie)) {
        logger.warn(`[DND Sheet] isCharacter failed hitDie validation: ${d.hitDie}`, data);
        return false;
    }
    
    const abilities = Object.values(Ability);
    const scores = (d.scores || {}) as Record<string, unknown>;
    const hasAllScores = abilities.every(ability => typeof scores[ability] === 'number');
    const savingThrowProfs = (d.savingThrowProficiencies || {}) as Record<string, unknown>;
    const hasAllSavingThrowProfs = abilities.every(ability => typeof savingThrowProfs[ability] === 'boolean');
    const abilityBonuses = (d.abilityBonuses || {}) as Record<string, unknown>;
    const hasAllAbilityBonuses = abilities.every(ability => typeof abilityBonuses[ability] === 'number');
    const savingThrowBonuses = (d.savingThrowBonuses || {}) as Record<string, unknown>;
    const hasAllSavingThrowBonuses = abilities.every(ability => typeof savingThrowBonuses[ability] === 'number');
    const currencies = (d.currency || {}) as Record<string, unknown>;
    const hasAllCurrencies = Object.values(Currency).every(c => typeof currencies[c] === 'number');
    const acSources = (d.acAbilitySources || {}) as Record<string, unknown>;
    const hasAllAcSources = abilities.every(ability => typeof acSources[ability] === 'boolean');

    if (!hasAllScores || !hasAllSavingThrowProfs || !hasAllAbilityBonuses || !hasAllSavingThrowBonuses || !hasAllCurrencies || !hasAllAcSources) {
        logger.warn('[DND Sheet] isCharacter failed map keys type checks.', {
            hasAllScores, hasAllSavingThrowProfs, hasAllAbilityBonuses, hasAllSavingThrowBonuses, hasAllCurrencies, hasAllAcSources
        }, data);
        return false;
    }

    const skillNames = Object.keys(SKILLS);
    const skills = d.skills || {};
    const hasAllSkills = skillNames.every(skillName => {
        const skill = skills[skillName];
        return typeof skill === 'object' && skill !== null &&
               typeof skill.name === 'string' &&
               abilities.includes(skill.ability) &&
               Object.values(ProficiencyLevel).includes(skill.proficiency);
    });
    const skillBonuses = d.skillBonuses || {};
    const hasAllSkillBonuses = skillNames.every(skillName => typeof skillBonuses[skillName] === 'number');

    if (!hasAllSkills || !hasAllSkillBonuses) {
        logger.warn('[DND Sheet] isCharacter failed skills or skillBonuses checks.', { hasAllSkills, hasAllSkillBonuses }, data);
        return false;
    }

    const slots = d.spellSlots || {};
    for (let i = 1; i <= 9; i++) {
        const slot = slots[i];
        if (typeof slot !== 'object' || slot === null || typeof slot.total !== 'number' || typeof slot.used !== 'number') {
            logger.warn(`[DND Sheet] isCharacter failed spellSlots level ${i} checks.`, slot);
            return false;
        }
    }

    const hasValidArrays = 
        Array.isArray(d.inventory) &&
        Array.isArray(d.features) &&
        Array.isArray(d.attacks) &&
        Array.isArray(d.spells) &&
        Array.isArray(d.notes);

    if (!hasValidArrays) {
        logger.warn('[DND Sheet] isCharacter failed array type validations.');
        return false;
    }

    const isInventoryValid = (d.inventory as unknown[]).every((item: unknown) => item === null || isInventoryItem(item));
    const areFeaturesValid = (d.features as unknown[]).every(isFeature);
    const areAttacksValid = (d.attacks as unknown[]).every(isAttack);
    const areSpellsValid = (d.spells as unknown[]).every(isSpell);
    const areNotesValid = (d.notes as unknown[]).every(isNote);

    if (!isInventoryValid || !areFeaturesValid || !areAttacksValid || !areSpellsValid || !areNotesValid) {
        logger.warn('[DND Sheet] isCharacter failed arrays content validations.', {
            isInventoryValid, areFeaturesValid, areAttacksValid, areSpellsValid, areNotesValid
        });
        return false;
    }

    return true;
};