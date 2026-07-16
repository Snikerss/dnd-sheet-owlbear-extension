import { Character, Ability, InventoryItem, ProficiencyLevel, Rarity, Currency, CharacterSize, Feature, RecoveryType, Attack, AttackType, DamageType, Spell, MagicSchool, Note } from '../types';
import { SKILLS } from '../constants';

/**
 * Migrates a single item object to include new fields if they are missing.
 * This ensures backward compatibility with older saved data.
 * @param item The item object to migrate.
 * @returns The migrated item object.
 */
const migrateItem = (item: any): any => {
    if (typeof item !== 'object' || item === null) return item;

    const migrated = { ...item };

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
export const migrateCharacterData = (characterData: any): any => {
    if (typeof characterData !== 'object' || characterData === null) return characterData;

    const migrated = { ...characterData };

    if (Array.isArray(migrated.inventory)) {
        migrated.inventory = migrated.inventory.map(migrateItem);
    }
    
    // Migrate items equipped on doll from inventory to equippedItems
    if (!Array.isArray(migrated.equippedItems)) {
        migrated.equippedItems = [];
    }
    if (Array.isArray(migrated.inventory)) {
        migrated.inventory.forEach((item: any, idx: number) => {
            if (item && item.equippedX !== undefined && item.equippedY !== undefined) {
                migrated.equippedItems.push(item);
                migrated.inventory[idx] = null;
            }
        });
    }
    if (Array.isArray(migrated.attunementItems)) {
        migrated.attunementItems = migrated.attunementItems.map(migrateItem);
    }
    if (!Array.isArray(migrated.features)) {
        migrated.features = [];
    }
    if (Array.isArray(migrated.attacks)) {
        migrated.attacks = migrated.attacks.map((attack: any) => {
            if (typeof attack === 'object' && attack !== null && typeof attack.imageUrl !== 'string') {
                attack.imageUrl = '';
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
    if (migrated.hasOwnProperty('globalAttackBonus')) {
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
        migrated.spells = migrated.spells.map((spell: any) => {
            if (typeof spell === 'object' && spell !== null) {
                if (typeof spell.components !== 'object' || spell.components === null) {
                    spell.components = {
                        verbal: false,
                        somatic: false,
                        material: false,
                        materialDescription: '',
                    };
                }
                if (typeof spell.range !== 'string') {
                    spell.range = '60 футов';
                }
                if (typeof spell.duration !== 'string') {
                    spell.duration = 'Мгновенная';
                }
                if (typeof spell.isRitual !== 'boolean') {
                    spell.isRitual = false;
                }
                if (typeof spell.requiresConcentration !== 'boolean') {
                    spell.requiresConcentration = false;
                }
            }
            return spell;
        });
    } else {
        migrated.spells = [];
    }

    if (typeof migrated.spellcastingAbility !== 'string' || !Object.values(Ability).includes(migrated.spellcastingAbility)) {
        migrated.spellcastingAbility = Ability.INT;
    }
    if (typeof migrated.maxPreparedSpells !== 'number') {
        migrated.maxPreparedSpells = 0;
    }
    if (typeof migrated.spellSlots !== 'object' || migrated.spellSlots === null) {
        migrated.spellSlots = {};
    }
    for (let i = 1; i <= 9; i++) {
        if (typeof migrated.spellSlots[i] !== 'object' || migrated.spellSlots[i] === null) {
            migrated.spellSlots[i] = { total: 0, used: 0 };
        }
        if (typeof migrated.spellSlots[i].total !== 'number') migrated.spellSlots[i].total = 0;
        if (typeof migrated.spellSlots[i].used !== 'number') migrated.spellSlots[i].used = 0;
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
                featureIds: (migrated.features || []).map((f: any) => f.id)
            }
        ];
    }
    if (!Array.isArray(migrated.noteGroups) || migrated.noteGroups.length === 0) {
        migrated.noteGroups = [
            {
                id: 'default',
                name: 'Мои заметки',
                noteIds: (migrated.notes || []).map((n: any) => n.id)
            }
        ];
    }

    // Attunement System Migration
    if (typeof migrated.attunementMaxBonus !== 'number') {
        migrated.attunementMaxBonus = 0;
    }
    if (Array.isArray(migrated.attunementItems) && migrated.attunementItems.length > 0) {
        const itemsToMove = migrated.attunementItems.filter((i: any) => i !== null);
        if (itemsToMove.length > 0) {
            const processedItems = itemsToMove.map((item: any, index: number) => ({
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
            processedItems.forEach((item: any) => {
                while (targetIdx < migrated.inventory.length && migrated.inventory[targetIdx] !== null) {
                    targetIdx++;
                }
                if (targetIdx < migrated.inventory.length) {
                    migrated.inventory[targetIdx] = item;
                } else {
                    migrated.inventory.push(item);
                }
            });
        }
        migrated.attunementItems = [];
    }

    return migrated;
};

/**
 * Recursively validates if an object is a valid InventoryItem.
 * @param item The object to validate.
 * @returns True if the object is a valid InventoryItem, false otherwise.
 */
const isInventoryItem = (item: any): item is InventoryItem => {
    if (typeof item !== 'object' || item === null) return false;
    const hasBaseFields =
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.description === 'string' &&
        typeof item.imageUrl === 'string' &&
        typeof item.quantity === 'number' &&
        typeof item.weight === 'number' &&
        typeof item.cost === 'object' && item.cost !== null && typeof item.cost.amount === 'number' && Object.values(Currency).includes(item.cost.currency) &&
        typeof item.rarity === 'number' && Object.values(Rarity).includes(item.rarity);

    if (!hasBaseFields) return false;

    // Optional fields for charges
    if (item.hasCharges !== undefined && typeof item.hasCharges !== 'boolean') return false;
    if (item.totalCharges !== undefined && typeof item.totalCharges !== 'number') return false;
    if (item.currentCharges !== undefined && typeof item.currentCharges !== 'number') return false;
    if (item.chargeRecovery !== undefined && (typeof item.chargeRecovery !== 'number' || !Object.values(RecoveryType).includes(item.chargeRecovery))) return false;

    if (item.isChest === true) {
        if (!Array.isArray(item.chestInventory)) return false;
        // Recursively validate items inside the chest
        if (!item.chestInventory.every((subItem: any) => subItem === null || isInventoryItem(subItem))) {
            return false;
        }
    }
    return true;
};

/**
 * Validates if an object is a valid Feature.
 * @param feature The object to validate.
 * @returns True if the object is a valid Feature, false otherwise.
 */
const isFeature = (feature: any): feature is Feature => {
    if (typeof feature !== 'object' || feature === null) return false;
    return (
        typeof feature.id === 'string' &&
        typeof feature.name === 'string' &&
        typeof feature.description === 'string' &&
        typeof feature.totalUses === 'number' &&
        typeof feature.currentUses === 'number' &&
        typeof feature.recovery === 'number' && Object.values(RecoveryType).includes(feature.recovery)
    );
};

const isAttack = (attack: any): attack is Attack => {
    if (typeof attack !== 'object' || attack === null) return false;
    return (
        typeof attack.id === 'string' &&
        typeof attack.name === 'string' &&
        typeof attack.imageUrl === 'string' &&
        typeof attack.attackType === 'number' && Object.values(AttackType).includes(attack.attackType) &&
        typeof attack.rangeNormal === 'number' &&
        (typeof attack.rangeLong === 'number' || attack.rangeLong === null) &&
        typeof attack.hitAbility === 'string' && Object.values(Ability).includes(attack.hitAbility as Ability) &&
        (typeof attack.damageAbility === 'string' && (Object.values(Ability).includes(attack.damageAbility as Ability) || attack.damageAbility === 'None')) &&
        typeof attack.isProficient === 'boolean' &&
        typeof attack.hitBonus === 'number' &&
        typeof attack.damageDice === 'string' &&
        typeof attack.damageBonus === 'number' &&
        typeof attack.damageType === 'string' && Object.values(DamageType).includes(attack.damageType as DamageType) &&
        typeof attack.notes === 'string'
    );
};

const isSpell = (spell: any): spell is Spell => {
    if (typeof spell !== 'object' || spell === null) return false;
     const hasComponents = 
        typeof spell.components === 'object' && spell.components !== null &&
        typeof spell.components.verbal === 'boolean' &&
        typeof spell.components.somatic === 'boolean' &&
        typeof spell.components.material === 'boolean' &&
        typeof spell.components.materialDescription === 'string';

    return (
        typeof spell.id === 'string' &&
        typeof spell.name === 'string' &&
        typeof spell.description === 'string' &&
        typeof spell.level === 'number' && spell.level >= 0 && spell.level <= 9 &&
        typeof spell.school === 'number' && Object.values(MagicSchool).includes(spell.school) &&
        typeof spell.castingTime === 'string' &&
        typeof spell.range === 'string' &&
        typeof spell.duration === 'string' &&
        typeof spell.isPrepared === 'boolean' &&
        typeof spell.imageUrl === 'string' &&
        typeof spell.isRitual === 'boolean' &&
        typeof spell.requiresConcentration === 'boolean' &&
        hasComponents
    );
};

const isNote = (note: any): note is Note => {
    if (typeof note !== 'object' || note === null) return false;
    return (
        typeof note.id === 'string' &&
        typeof note.title === 'string' &&
        typeof note.content === 'string'
    );
};


/**
 * Performs a comprehensive validation to check if an object conforms to the Character interface.
 * This helps prevent app crashes from malformed or outdated data in localStorage.
 * @param data The object to validate.
 * @returns True if the object is a valid Character, false otherwise.
 */
export const isCharacter = (data: any): data is Character => {
    if (typeof data !== 'object' || data === null) return false;

    const hasCoreFields =
        typeof data.name === 'string' &&
        typeof data.race === 'string' &&
        typeof data.characterClass === 'string' &&
        typeof data.level === 'number' && data.level >= 1 && data.level <= 20 &&
        typeof data.experience === 'number' &&
        typeof data.portraitUrl === 'string' &&
        typeof data.maxHitPoints === 'number' &&
        typeof data.currentHitPoints === 'number' &&
        typeof data.temporaryHitPoints === 'number' &&
        typeof data.baseAC === 'number' &&
        typeof data.acBonus === 'number' &&
        typeof data.initiativeBonus === 'number' &&
        typeof data.proficiencyBonusBonus === 'number' &&
        typeof data.attunementSlots === 'number' &&
        typeof data.inventoryRows === 'number' &&
        typeof data.totalHitDice === 'number' &&
        typeof data.currentHitDice === 'number' &&
        typeof data.speed === 'number' &&
        typeof data.speedBonus === 'number' &&
        typeof data.longJumpBonus === 'number' &&
        typeof data.highJumpBonus === 'number' &&
        typeof data.size === 'number' && Object.values(CharacterSize).includes(data.size) &&
        typeof data.passivePerceptionBonus === 'number' &&
        typeof data.passiveInvestigationBonus === 'number' &&
        typeof data.passiveInsightBonus === 'number' &&
        typeof data.maxHpBonus === 'number' &&
        typeof data.globalAttackDiceBonusToHitDice === 'string' &&
        typeof data.globalAttackDiceBonusToDamageDice === 'string' &&
        typeof data.spellcastingAbility === 'string' && Object.values(Ability).includes(data.spellcastingAbility) &&
        typeof data.maxPreparedSpells === 'number' &&
        typeof data.spellSaveDcBonus === 'number' &&
        typeof data.spellAttackBonusBonus === 'number' &&
        typeof data.currency === 'object' && data.currency !== null &&
        (typeof data.activeNoteId === 'string' || data.activeNoteId === null);

    if (!hasCoreFields) return false;

    const hasValidObjects =
        typeof data.scores === 'object' && data.scores !== null &&
        typeof data.skills === 'object' && data.skills !== null &&
        typeof data.savingThrowProficiencies === 'object' && data.savingThrowProficiencies !== null &&
        typeof data.abilityBonuses === 'object' && data.abilityBonuses !== null &&
        typeof data.skillBonuses === 'object' && data.skillBonuses !== null &&
        typeof data.savingThrowBonuses === 'object' && data.savingThrowBonuses !== null &&
        typeof data.acAbilitySources === 'object' && data.acAbilitySources !== null &&
        typeof data.spellSlots === 'object' && data.spellSlots !== null;
        
    if (!hasValidObjects) return false;

    const validHitDies = [6, 8, 10, 12];
    if (!validHitDies.includes(data.hitDie)) return false;
    
    const abilities = Object.values(Ability);
    const scores = data.scores as Record<string, unknown>;
    const hasAllScores = abilities.every(ability => typeof scores[ability] === 'number');
    const savingThrowProfs = data.savingThrowProficiencies as Record<string, unknown>;
    const hasAllSavingThrowProfs = abilities.every(ability => typeof savingThrowProfs[ability] === 'boolean');
    const abilityBonuses = data.abilityBonuses as Record<string, unknown>;
    const hasAllAbilityBonuses = abilities.every(ability => typeof abilityBonuses[ability] === 'number');
    const savingThrowBonuses = data.savingThrowBonuses as Record<string, unknown>;
    const hasAllSavingThrowBonuses = abilities.every(ability => typeof savingThrowBonuses[ability] === 'number');
    const currencies = data.currency as Record<string, unknown>;
    const hasAllCurrencies = Object.values(Currency).every(c => typeof currencies[c] === 'number');
    const acSources = data.acAbilitySources as Record<string, unknown>;
    const hasAllAcSources = abilities.every(ability => typeof acSources[ability] === 'boolean');

    if (!hasAllScores || !hasAllSavingThrowProfs || !hasAllAbilityBonuses || !hasAllSavingThrowBonuses || !hasAllCurrencies || !hasAllAcSources) return false;

    const skillNames = Object.keys(SKILLS);
    const hasAllSkills = skillNames.every(skillName => {
        const skill = data.skills[skillName];
        return typeof skill === 'object' && skill !== null &&
               typeof skill.name === 'string' &&
               abilities.includes(skill.ability) &&
               Object.values(ProficiencyLevel).includes(skill.proficiency);
    });
    const hasAllSkillBonuses = skillNames.every(skillName => typeof data.skillBonuses[skillName] === 'number');

    if (!hasAllSkills || !hasAllSkillBonuses) return false;

    for (let i = 1; i <= 9; i++) {
        if (typeof data.spellSlots[i] !== 'object' || data.spellSlots[i] === null || typeof data.spellSlots[i].total !== 'number' || typeof data.spellSlots[i].used !== 'number') {
            return false;
        }
    }

    const hasValidArrays = 
        Array.isArray(data.inventory) &&
        Array.isArray(data.attunementItems) &&
        Array.isArray(data.features) &&
        Array.isArray(data.attacks) &&
        Array.isArray(data.spells) &&
        Array.isArray(data.notes);

    if (!hasValidArrays) return false;

    const isInventoryValid = data.inventory.every((item: any) => item === null || isInventoryItem(item));
    const isAttunementValid = data.attunementItems.every((item: any) => item === null || isInventoryItem(item));
    const areFeaturesValid = data.features.every(isFeature);
    const areAttacksValid = data.attacks.every(isAttack);
    const areSpellsValid = data.spells.every(isSpell);
    const areNotesValid = data.notes.every(isNote);

    return isInventoryValid && isAttunementValid && areFeaturesValid && areAttacksValid && areSpellsValid && areNotesValid;
};