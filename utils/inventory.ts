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

  const processItem = (item: InventoryItem | null) => {
    if (item && item.isEquipped && item.bonuses) {
      if (item.bonuses.ac) bonuses.ac += parseInt(item.bonuses.ac as any, 10) || 0;
      if (item.bonuses.initiative) bonuses.initiative += parseInt(item.bonuses.initiative as any, 10) || 0;
      if (item.bonuses.attackHit) bonuses.attackHit += parseInt(item.bonuses.attackHit as any, 10) || 0;
      if (item.bonuses.speed) bonuses.speed += parseInt(item.bonuses.speed as any, 10) || 0;
      if (item.bonuses.longJump) bonuses.longJump += parseInt(item.bonuses.longJump as any, 10) || 0;
      if (item.bonuses.highJump) bonuses.highJump += parseInt(item.bonuses.highJump as any, 10) || 0;
      if (item.bonuses.passivePerception) bonuses.passivePerception += parseInt(item.bonuses.passivePerception as any, 10) || 0;
      if (item.bonuses.passiveInvestigation) bonuses.passiveInvestigation += parseInt(item.bonuses.passiveInvestigation as any, 10) || 0;
      if (item.bonuses.passiveInsight) bonuses.passiveInsight += parseInt(item.bonuses.passiveInsight as any, 10) || 0;
      if (item.bonuses.spellSaveDC) bonuses.spellSaveDC += parseInt(item.bonuses.spellSaveDC as any, 10) || 0;
      if (item.bonuses.carryCapacity) bonuses.carryCapacity += parseInt(item.bonuses.carryCapacity as any, 10) || 0;
      if (item.bonuses.maxHp) bonuses.maxHp += parseInt(item.bonuses.maxHp as any, 10) || 0;
      if (item.bonuses.proficiencyBonus) bonuses.proficiencyBonus += parseInt(item.bonuses.proficiencyBonus as any, 10) || 0;
      if (item.bonuses.attunementMax) bonuses.attunementMax += parseInt(item.bonuses.attunementMax as any, 10) || 0;
      
      if (item.bonuses.abilityScores) {
        Object.entries(item.bonuses.abilityScores).forEach(([ability, value]) => {
          const ab = ability.toUpperCase() as Ability;
          bonuses.abilityScores[ab] = (bonuses.abilityScores[ab] || 0) + (parseInt(value as any, 10) || 0);
        });
      }
      if (item.bonuses.skills) {
        Object.entries(item.bonuses.skills).forEach(([skillName, value]) => {
          bonuses.skills[skillName] = (bonuses.skills[skillName] || 0) + (parseInt(value as any, 10) || 0);
        });
      }
      if (item.bonuses.savingThrows) {
        Object.entries(item.bonuses.savingThrows).forEach(([ability, value]) => {
          const ab = ability.toUpperCase() as Ability;
          bonuses.savingThrows[ab] = (bonuses.savingThrows[ab] || 0) + (parseInt(value as any, 10) || 0);
        });
      }
    }
  };

  if (character.inventory) {
    character.inventory.forEach(processItem);
  }

  if (character.equippedItems) {
    character.equippedItems.forEach(processItem);
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