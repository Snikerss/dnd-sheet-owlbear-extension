/**
 * Единый список базовых полей персонажа для сериализации, минификации и валидации.
 */
export const CHARACTER_BASIC_FIELDS = [
  'name', 'race', 'characterClass', 'level', 'experience', 'portraitUrl',
  'hitDie', 'maxHitPoints', 'currentHitPoints', 'temporaryHitPoints', 'speed',
  'baseAC', 'acBonus', 'initiativeBonus', 'proficiencyBonusBonus', 'speedBonus',
  'attunementSlots', 'inventoryRows', 'totalHitDice', 'currentHitDice',
  'longJumpBonus', 'highJumpBonus', 'size',
  'passivePerceptionBonus', 'passiveInvestigationBonus', 'passiveInsightBonus',
  'maxHpBonus', 'carryCapacityBonus',
  'globalAttackDiceBonusToHitDice', 'globalAttackDiceBonusToDamageDice',
  'spellcastingAbility', 'maxPreparedSpells', 'spellSaveDcBonus',
  'spellAttackBonusBonus', 'activeNoteId', 'attunementMaxBonus', 'ownerId', 'ownerName', 'viewMode'
] as const;

export type CharacterBasicField = typeof CHARACTER_BASIC_FIELDS[number];
