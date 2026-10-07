import { Ability, Currency, Rarity, RecoveryType, type InventoryItem } from '../../types';
import type { NotificationType } from '../NotificationToast';
import type React from 'react';

export type ItemFormData = Omit<InventoryItem, 'id'>;

export type FormDataUpdater = React.Dispatch<React.SetStateAction<ItemFormData>>;

export type ItemInputChangeEvent = React.ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

export const DEFAULT_ITEM: ItemFormData = {
  name: '',
  description: '',
  quantity: 1,
  imageUrl: '',
  weight: 0,
  cost: { amount: 0, currency: Currency.GP },
  rarity: Rarity.Common,
  isChest: false,
  chestInventory: [],
  isConsumable: false,
  hasCharges: false,
  totalCharges: 0,
  currentCharges: 0,
  chargeRecovery: RecoveryType.LongRest,
  isEquipped: false,
  requiresAttunement: false,
  isAttuned: false,
  bonuses: {
    ac: 0,
    initiative: 0,
    abilityScores: {},
    skills: {},
    attackHit: 0,
    speed: 0,
    longJump: 0,
    highJump: 0,
    passivePerception: 0,
    passiveInvestigation: 0,
    passiveInsight: 0,
    savingThrows: {},
    spellSaveDC: 0,
    carryCapacity: 0,
    maxHp: 0,
    proficiencyBonus: 0,
    attunementMax: 0,
  }
};

export const normalizeSavingThrows = (savingThrows: Record<string, unknown> | null | undefined): Partial<Record<Ability, number>> => {
  if (!savingThrows) return {};
  const normalized: Partial<Record<Ability, number>> = {};
  Object.entries(savingThrows).forEach(([key, val]) => {
    const uppercaseKey = key.toUpperCase() as Ability;
    if (Object.values(Ability).includes(uppercaseKey)) {
      normalized[uppercaseKey] = parseInt(String(val), 10) || 0;
    }
  });
  return normalized;
};

export const normalizeAbilityScores = (abilityScores: Record<string, unknown> | null | undefined): Partial<Record<Ability, number>> => {
  if (!abilityScores) return {};
  const normalized: Partial<Record<Ability, number>> = {};
  Object.entries(abilityScores).forEach(([key, val]) => {
    const uppercaseKey = key.toUpperCase() as Ability;
    if (Object.values(Ability).includes(uppercaseKey)) {
      normalized[uppercaseKey] = parseInt(String(val), 10) || 0;
    }
  });
  return normalized;
};

export const buildInitialFormData = (item: InventoryItem | null): ItemFormData => {
  const base = item || DEFAULT_ITEM;
  return {
    ...DEFAULT_ITEM,
    ...base,
    bonuses: {
      ac: base.bonuses?.ac || 0,
      initiative: base.bonuses?.initiative || 0,
      abilityScores: normalizeAbilityScores(base.bonuses?.abilityScores),
      skills: base.bonuses?.skills || {},
      attackHit: base.bonuses?.attackHit || 0,
      speed: base.bonuses?.speed || 0,
      longJump: base.bonuses?.longJump || 0,
      highJump: base.bonuses?.highJump || 0,
      passivePerception: base.bonuses?.passivePerception || 0,
      passiveInvestigation: base.bonuses?.passiveInvestigation || 0,
      passiveInsight: base.bonuses?.passiveInsight || 0,
      spellSaveDC: base.bonuses?.spellSaveDC || 0,
      savingThrows: normalizeSavingThrows(base.bonuses?.savingThrows),
      carryCapacity: base.bonuses?.carryCapacity || 0,
      maxHp: base.bonuses?.maxHp || 0,
      proficiencyBonus: base.bonuses?.proficiencyBonus || 0,
      attunementMax: base.bonuses?.attunementMax || 0,
    }
  };
};

export interface InputChangeHandlerDeps {
  item: InventoryItem | null;
  addNotification: (message: string, type?: NotificationType) => void;
  setFormData: FormDataUpdater;
}

export const createHandleInputChange = ({ item, addNotification, setFormData }: InputChangeHandlerDeps) =>
  (e: ItemInputChangeEvent): void => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        if (name === 'isChest' && !checked && item?.isChest && item.chestInventory?.some(i => i !== null)) {
            addNotification("Сначала опустошите сундук, чтобы превратить его в обычный предмет.", 'error');
            return;
        }
        if (name === 'hasCharges') {
            setFormData(prev => ({
                ...prev,
                hasCharges: checked,
                totalCharges: checked ? (prev.totalCharges || 1) : 0,
                currentCharges: checked ? (prev.totalCharges || 1) : 0,
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: checked }));
        }
    } else {
        const parsedValue = ['quantity', 'weight', 'totalCharges', 'currentCharges'].includes(name) ? parseInt(value, 10) || 0 : value;

        if (name === 'totalCharges') {
             setFormData(prev => ({
                ...prev,
                totalCharges: parsedValue as number,
                currentCharges: Math.min(parsedValue as number, prev.currentCharges || 0)
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: parsedValue }));
        }
    }
  };
