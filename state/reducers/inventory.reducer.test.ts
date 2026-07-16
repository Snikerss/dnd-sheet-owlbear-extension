import { describe, it, expect } from 'vitest';
import { inventoryReducer } from './inventory.reducer';
import { makeTestCharacter } from '../testFixtures';
import { CharacterAction, Currency, InventoryItem, RecoveryType, CharacterSize } from '../../types';

const makeItem = (id: string, overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id,
    name: `Предмет ${id}`,
    description: '',
    quantity: 1,
    imageUrl: '',
    weight: 1,
    cost: { amount: 0, currency: Currency.GP },
    rarity: 0,
    isEquipped: false,
    requiresAttunement: false,
    isAttuned: false,
    ...overrides,
});

describe('inventoryReducer — SET_ATTUNEMENT_SLOTS', () => {
    it('уменьшает количество слотов настроек', () => {
        const char = makeTestCharacter({ attunementSlots: 3, attunementItems: [null, null, null] });
        const action: CharacterAction = { type: 'SET_ATTUNEMENT_SLOTS', payload: 1 };
        const result = inventoryReducer(char, action);
        expect(result.attunementSlots).toBe(1);
        expect(result.attunementItems).toHaveLength(1);
    });

    it('не уходит в минус', () => {
        const char = makeTestCharacter({ attunementSlots: 3, attunementItems: [null, null, null] });
        const action: CharacterAction = { type: 'SET_ATTUNEMENT_SLOTS', payload: -5 };
        const result = inventoryReducer(char, action);
        expect(result.attunementSlots).toBe(0);
    });

    it('не превышает 10', () => {
        const char = makeTestCharacter({ attunementSlots: 3, attunementItems: [null, null, null] });
        const action: CharacterAction = { type: 'SET_ATTUNEMENT_SLOTS', payload: 100 };
        const result = inventoryReducer(char, action);
        expect(result.attunementSlots).toBe(10);
    });
});

describe('inventoryReducer — SET_INVENTORY_ROWS', () => {
    it('изменяет количество рядов и пересчитывает размер инвентаря', () => {
        const char = makeTestCharacter({ inventoryRows: 5, inventory: Array(50).fill(null) });
        const action: CharacterAction = { type: 'SET_INVENTORY_ROWS', payload: 8 };
        const result = inventoryReducer(char, action);
        expect(result.inventoryRows).toBe(8);
        expect(result.inventory).toHaveLength(80);
    });

    it('не даёт меньше 1 ряда', () => {
        const char = makeTestCharacter({ inventoryRows: 5 });
        const action: CharacterAction = { type: 'SET_INVENTORY_ROWS', payload: 0 };
        const result = inventoryReducer(char, action);
        expect(result.inventoryRows).toBe(1);
    });

    it('не даёт больше 20 рядов', () => {
        const char = makeTestCharacter({ inventoryRows: 5 });
        const action: CharacterAction = { type: 'SET_INVENTORY_ROWS', payload: 99 };
        const result = inventoryReducer(char, action);
        expect(result.inventoryRows).toBe(20);
    });

    it('сохраняет существующие предметы при увеличении размера', () => {
        const item = makeItem('i1');
        const char = makeTestCharacter({ inventoryRows: 1, inventory: [item, null, null, null, null, null, null, null, null, null] });
        const action: CharacterAction = { type: 'SET_INVENTORY_ROWS', payload: 2 };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]).toEqual(item);
        expect(result.inventory).toHaveLength(20);
    });
});

describe('inventoryReducer — UPDATE_ITEM', () => {
    it('обновляет предмет в инвентаре', () => {
        const oldItem = makeItem('i1', { name: 'Старый' });
        const newItem = makeItem('i1', { name: 'Новый' });
        const char = makeTestCharacter({ inventory: [oldItem, null] });
        const action: CharacterAction = { type: 'UPDATE_ITEM', payload: { location: { container: 'inventory', index: 0 }, itemData: newItem } };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]?.name).toBe('Новый');
    });
});

describe('inventoryReducer — MOVE_ITEM', () => {
    it('меняет местами два предмета в инвентаре', () => {
        const item1 = makeItem('i1');
        const item2 = makeItem('i2');
        const char = makeTestCharacter({ inventory: [item1, item2] });
        const action: CharacterAction = {
            type: 'MOVE_ITEM',
            payload: { source: { container: 'inventory', index: 0 }, destination: { container: 'inventory', index: 1 } },
        };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]?.id).toBe('i2');
        expect(result.inventory[1]?.id).toBe('i1');
    });

    it('не делает ничего, если source === destination', () => {
        const item1 = makeItem('i1');
        const char = makeTestCharacter({ inventory: [item1] });
        const action: CharacterAction = {
            type: 'MOVE_ITEM',
            payload: { source: { container: 'inventory', index: 0 }, destination: { container: 'inventory', index: 0 } },
        };
        const result = inventoryReducer(char, action);
        expect(result).toBe(char);
    });

    it('запрещает класть сундук в другой сундук', () => {
        const chest = makeItem('chest1', { isChest: true, chestInventory: [null] });
        const innerChest = makeItem('chest2', { isChest: true, chestInventory: [null] });
        const char = makeTestCharacter({ inventory: [chest, innerChest] });
        const action: CharacterAction = {
            type: 'MOVE_ITEM',
            payload: { source: { container: 'inventory', index: 1 }, destination: { container: 'chest', index: 0, chestId: 'chest1' } },
        };
        const result = inventoryReducer(char, action);
        expect(result).toBe(char); // операция отменена
    });
});

describe('inventoryReducer — CURRENCY', () => {
    it('SET_CURRENCY устанавливает количество монет', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_CURRENCY', payload: { currency: Currency.GP, amount: 100 } };
        const result = inventoryReducer(char, action);
        expect(result.currency.GP).toBe(100);
    });

    it('SET_CURRENCY не уходит в минус', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_CURRENCY', payload: { currency: Currency.SP, amount: -50 } };
        const result = inventoryReducer(char, action);
        expect(result.currency.SP).toBe(0);
    });
});

describe('inventoryReducer — DELETE_CUSTOM_ICON_REFERENCES', () => {
    it('очищает ссылки на удалённую иконку во всём инвентаре', () => {
        const item1 = makeItem('i1', { imageUrl: 'data:icon-to-delete' });
        const item2 = makeItem('i2', { imageUrl: 'data:other-icon' });
        const char = makeTestCharacter({ inventory: [item1, item2] });
        const action: CharacterAction = { type: 'DELETE_CUSTOM_ICON_REFERENCES', payload: 'data:icon-to-delete' };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]?.imageUrl).toBe('');
        expect(result.inventory[1]?.imageUrl).toBe('data:other-icon');
    });
});

describe('inventoryReducer — DAWN_RECOVERY', () => {
    it('восстанавливает заряды предметов с восстановлением Dawn', () => {
        const item = makeItem('i1', { hasCharges: true, totalCharges: 5, currentCharges: 2, chargeRecovery: RecoveryType.Dawn });
        const char = makeTestCharacter({ inventory: [item] });
        const action: CharacterAction = { type: 'DAWN_RECOVERY' };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]?.currentCharges).toBe(5);
    });

    it('не восстанавливает заряды предметов с другим типом восстановления', () => {
        const item = makeItem('i1', { hasCharges: true, totalCharges: 5, currentCharges: 2, chargeRecovery: RecoveryType.LongRest });
        const char = makeTestCharacter({ inventory: [item] });
        const action: CharacterAction = { type: 'DAWN_RECOVERY' };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]?.currentCharges).toBe(2); // без изменений
    });
});

describe('inventoryReducer — PLACE/MOVE/UNEQUIP on doll', () => {
    it('PLACE_ITEM_ON_DOLL переносит предмет из инвентаря в equipped', () => {
        const item = makeItem('i1');
        const char = makeTestCharacter({ inventory: [item], equippedItems: [] });
        const action: CharacterAction = { type: 'PLACE_ITEM_ON_DOLL', payload: { itemIndex: 0, x: 10, y: 20 } };
        const result = inventoryReducer(char, action);
        expect(result.inventory[0]).toBeNull();
        expect(result.equippedItems).toHaveLength(1);
        expect(result.equippedItems[0].equippedX).toBe(10);
        expect(result.equippedItems[0].isEquipped).toBe(true);
    });

    it('MOVE_ITEM_ON_DOLL обновляет координаты экипированного предмета', () => {
        const item = makeItem('i1', { equippedX: 0, equippedY: 0, isEquipped: true });
        const char = makeTestCharacter({ equippedItems: [item] });
        const action: CharacterAction = { type: 'MOVE_ITEM_ON_DOLL', payload: { itemIndex: 0, x: 50, y: 60 } };
        const result = inventoryReducer(char, action);
        expect(result.equippedItems[0].equippedX).toBe(50);
        expect(result.equippedItems[0].equippedY).toBe(60);
    });

    it('UNEQUIP_ITEM_FROM_DOLL возвращает предмет в инвентарь', () => {
        const item = makeItem('i1', { equippedX: 10, equippedY: 20, isEquipped: true });
        const char = makeTestCharacter({ equippedItems: [item], inventory: [null, null] });
        const action: CharacterAction = { type: 'UNEQUIP_ITEM_FROM_DOLL', payload: { itemIndex: 0 } };
        const result = inventoryReducer(char, action);
        expect(result.equippedItems).toHaveLength(0);
        expect(result.inventory[0]?.id).toBe('i1');
        expect(result.inventory[0]?.isEquipped).toBe(false);
        expect(result.inventory[0]?.equippedX).toBeUndefined();
    });
});

describe('inventoryReducer — иммутабельность (баг #2: structuredClone)', () => {
    it('UPDATE_ITEM не использует structuredClone: неизменённые поля сохраняют ссылки', () => {
        const oldItem = makeItem('i1', { name: 'Старый' });
        const char = makeTestCharacter({
            inventory: [oldItem, null],
            attacks: [{ id: 'a1', name: 'Атака', imageUrl: '', attackType: 0, rangeNormal: 5, rangeLong: null, hitAbility: 'STR', damageAbility: 'STR', isProficient: true, hitBonus: 5, damageDice: '1d8', damageBonus: 3, damageType: 'Slashing', notes: '' }],
            spells: [],
        });
        const action: CharacterAction = { type: 'UPDATE_ITEM', payload: { location: { container: 'inventory', index: 0 }, itemData: makeItem('i1', { name: 'Новый' }) } };
        const result = inventoryReducer(char, action);

        // Ссылочное равенство: массивы/объекты вне затронутой области НЕ должны клонироваться
        expect(result.attacks).toBe(char.attacks); // attacks не изменились — та же ссылка
        expect(result.spells).toBe(char.spells);
        expect(result.features).toBe(char.features);
        // А inventory — новый массив (изменился)
        expect(result.inventory).not.toBe(char.inventory);
    });

    it('MOVE_ITEM: items вне обмена сохраняют ссылки', () => {
        const item1 = makeItem('i1');
        const item2 = makeItem('i2');
        const char = makeTestCharacter({
            inventory: [item1, item2],
            spells: [],
            features: [],
        });
        const action: CharacterAction = {
            type: 'MOVE_ITEM',
            payload: { source: { container: 'inventory', index: 0 }, destination: { container: 'inventory', index: 1 } },
        };
        const result = inventoryReducer(char, action);
        // Затронутые поля — новые ссылки
        expect(result.inventory).not.toBe(char.inventory);
        // Незатронутые — те же ссылки
        expect(result.spells).toBe(char.spells);
        expect(result.features).toBe(char.features);
        expect(result.notes).toBe(char.notes);
    });
});
