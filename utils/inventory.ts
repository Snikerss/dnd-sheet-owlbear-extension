import { InventoryItem, Character, Ability, RecoveryType } from '../types';

/**
 * Calculates the total weight of an inventory item.
 * If the item is a chest, it recursively calculates the weight of all items inside it.
 * @param item The inventory item to weigh.
 * @returns The total weight of the item and its contents (if any).
 */
export const calculateItemWeight = (item: InventoryItem | null): number => {
  if (!item) {
    return 0;
  }

  let totalWeight = item.weight * item.quantity;

  if (item.isChest && item.chestInventory) {
    const contentWeight = item.chestInventory.reduce(
      (sum, contentItem) => sum + calculateItemWeight(contentItem),
      0
    );
    totalWeight += contentWeight;
  }

  return totalWeight;
};

/**
 * Summarizes all active bonuses from equipped items in a character's inventory and attunement items.
 * @param character The character sheet state.
 */
export const getEquippedItemBonuses = (character: Character) => {
  const bonuses = {
    ac: 0,
    initiative: 0,
    abilityScores: {} as Record<Ability, number>,
    skills: {} as Record<string, number>,
    savingThrows: {} as Record<Ability, number>,
    spellSaveDC: 0,
    carryCapacity: 0,
    maxHp: 0,
    proficiencyBonus: 0,
    attackHit: 0,
    speed: 0,
    longJump: 0,
    highJump: 0,
    passivePerception: 0,
    passiveInvestigation: 0,
    passiveInsight: 0,
    attunementMax: 0,
  };

  const parseBonusNumber = (val: unknown): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const processItem = (item: InventoryItem | null, isImplicitlyEquipped = false) => {
    if (item && (item.isEquipped || isImplicitlyEquipped) && item.bonuses) {
      if (item.bonuses.ac) bonuses.ac += parseBonusNumber(item.bonuses.ac);
      if (item.bonuses.initiative) bonuses.initiative += parseBonusNumber(item.bonuses.initiative);
      if (item.bonuses.attackHit) {
        const val = parseBonusNumber(item.bonuses.attackHit);
        bonuses.attackHit += val;
      }
      if (item.bonuses.speed) bonuses.speed += parseBonusNumber(item.bonuses.speed);
      if (item.bonuses.longJump) bonuses.longJump += parseBonusNumber(item.bonuses.longJump);
      if (item.bonuses.highJump) bonuses.highJump += parseBonusNumber(item.bonuses.highJump);
      if (item.bonuses.passivePerception) bonuses.passivePerception += parseBonusNumber(item.bonuses.passivePerception);
      if (item.bonuses.passiveInvestigation) bonuses.passiveInvestigation += parseBonusNumber(item.bonuses.passiveInvestigation);
      if (item.bonuses.passiveInsight) bonuses.passiveInsight += parseBonusNumber(item.bonuses.passiveInsight);
      if (item.bonuses.spellSaveDC) bonuses.spellSaveDC += parseBonusNumber(item.bonuses.spellSaveDC);
      if (item.bonuses.carryCapacity) bonuses.carryCapacity += parseBonusNumber(item.bonuses.carryCapacity);
      if (item.bonuses.maxHp) bonuses.maxHp += parseBonusNumber(item.bonuses.maxHp);
      if (item.bonuses.proficiencyBonus) bonuses.proficiencyBonus += parseBonusNumber(item.bonuses.proficiencyBonus);
      if (item.bonuses.attunementMax) bonuses.attunementMax += parseBonusNumber(item.bonuses.attunementMax);
      
      if (item.bonuses.abilityScores) {
        Object.entries(item.bonuses.abilityScores).forEach(([ability, value]) => {
          const ab = ability.toUpperCase() as Ability;
          bonuses.abilityScores[ab] = (bonuses.abilityScores[ab] || 0) + parseBonusNumber(value);
        });
      }
      if (item.bonuses.skills) {
        Object.entries(item.bonuses.skills).forEach(([skillName, value]) => {
          bonuses.skills[skillName] = (bonuses.skills[skillName] || 0) + parseBonusNumber(value);
        });
      }
      if (item.bonuses.savingThrows) {
        Object.entries(item.bonuses.savingThrows).forEach(([ability, value]) => {
          const ab = ability.toUpperCase() as Ability;
          bonuses.savingThrows[ab] = (bonuses.savingThrows[ab] || 0) + parseBonusNumber(value);
        });
      }
    }
  };

  if (character.inventory) {
    character.inventory.forEach(item => processItem(item, false));
  }

  if (character.equippedItems) {
    character.equippedItems.forEach(item => processItem(item, true));
  }

  return bonuses;
};

/**
 * Рекурсивно восстанавливает заряды предметов (включая находящиеся внутри сундуков).
 * @param items Список предметов.
 * @param recoveryTypes Типы восстановления (например, ShortRest, LongRest, Dawn).
 */
export const recoverItemCharges = (
  items: (InventoryItem | null)[],
  recoveryTypes: RecoveryType[]
): (InventoryItem | null)[] => {
  return items.map(item => {
    if (!item) return null;
    
    const newItem = { ...item };
    
    if (
      newItem.hasCharges &&
      newItem.chargeRecovery !== undefined &&
      recoveryTypes.includes(newItem.chargeRecovery)
    ) {
      newItem.currentCharges = newItem.totalCharges;
    }
    
    if (newItem.isChest && newItem.chestInventory) {
      newItem.chestInventory = recoverItemCharges(newItem.chestInventory, recoveryTypes);
    }
    
    return newItem;
  });
};