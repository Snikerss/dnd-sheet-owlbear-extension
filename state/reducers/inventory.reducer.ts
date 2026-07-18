import { Character, CharacterAction, DropLocation, InventoryItem, RecoveryType, EquipSlot } from '../../types';
import { recoverItemCharges } from '../../utils/inventory';

const findItemAndList = (state: Character, location: DropLocation): [ (InventoryItem|null)[] | null, InventoryItem | null, number ] => {
    const searchInventories = (inventories: (InventoryItem | null)[][]): [ (InventoryItem|null)[] | null, InventoryItem | null ] => {
        for (const inventory of inventories) {
            const chestItem = inventory.find(item => item?.id === location.chestId);
            if (chestItem && chestItem.isChest && chestItem.chestInventory) {
                return [chestItem.chestInventory, chestItem.chestInventory[location.index] ?? null];
            }
        }
        return [null, null];
    }

    if (location.container === 'inventory') return [state.inventory, state.inventory[location.index] ?? null, location.index];
    if (location.container === 'doll') {
        const equippedList = state.equippedItems || [];
        return [equippedList, equippedList[location.index] ?? null, location.index];
    }
    if (location.container === 'attunement') return [state.attunementItems, state.attunementItems[location.index] ?? null, location.index];
    if (location.container === 'chest' && location.chestId) {
       const [list, item] = searchInventories([state.inventory, state.attunementItems, state.equippedItems || []]);
       return [list, item, location.index];
    }
    return [null, null, -1];
};

/**
 * Иммутабельно применяет функцию-маппер к каждому элементу массива предметов.
 * Используется для точечных апдейтов вместо глубокого клонирования всего state.
 */
const updateItemInArray = (
    items: (InventoryItem | null)[],
    mapper: (item: InventoryItem | null, index: number) => InventoryItem | null,
): (InventoryItem | null)[] => {
    return items.map(mapper);
};

/**
 * Записывает результат MOVE_ITEM: source получает destItem, destination получает sourceItem.
 * Иммутабельно — копируются только затронутые массивы, без structuredClone всего state.
 *
 * Логика: сначала "обнуляем" source (кладём туда destItem), затем результат передаём
 * как базу для записи в destination. Это работает, т.к. source и destination
 * могут быть в разных контейнерах (inventory/attunement/equipped/chest).
 */
const writeMoveResult = (
    state: Character,
    source: DropLocation,
    sourceItem: InventoryItem | null,
    destination: DropLocation,
    destItem: InventoryItem | null,
): Character => {
    // Шаг 1: запись destItem в source
    const afterSource = writeItemAtLocation(state, source, destItem);
    // Шаг 2: запись sourceItem в destination (поверх результата шага 1)
    const afterDest = writeItemAtLocation(afterSource, destination, sourceItem);
    return afterDest;
};

/**
 * Иммутабельно записывает предмет в указанную локацию.
 * Возвращает новый state с обновлённым затронутым массивом.
 */
const writeItemAtLocation = (
    state: Character,
    location: DropLocation,
    value: InventoryItem | null,
): Character => {
    if (location.container === 'inventory') {
        const newInventory = [...state.inventory];
        newInventory[location.index] = value;
        return { ...state, inventory: newInventory };
    }
    if (location.container === 'doll') {
        const newEquipped = [...(state.equippedItems || [])];
        // Doll (equippedItems) не имеет null-слотов; при записи null удаляем элемент
        if (value === null) {
            newEquipped.splice(location.index, 1);
        } else {
            newEquipped[location.index] = value;
        }
        return { ...state, equippedItems: newEquipped };
    }
    if (location.container === 'attunement') {
        const newAttunement = [...state.attunementItems];
        newAttunement[location.index] = value;
        return { ...state, attunementItems: newAttunement };
    }
    if (location.container === 'chest' && location.chestId) {
        // Обновляем вложенный chestInventory у предмета-сундука.
        // Сундук может находиться в inventory, attunementItems или equippedItems.
        const updateChest = (item: InventoryItem | null): InventoryItem | null => {
            if (item && item.id === location.chestId && item.isChest && item.chestInventory) {
                const newChest = [...item.chestInventory];
                newChest[location.index] = value;
                return { ...item, chestInventory: newChest };
            }
            return item;
        };
        return {
            ...state,
            inventory: state.inventory.map(updateChest),
            attunementItems: state.attunementItems.map(updateChest),
            equippedItems: (state.equippedItems || []).map(updateChest).filter((x): x is InventoryItem => x !== null),
        };
    }
    return state;
};

export const inventoryReducer = (state: Character, action: CharacterAction): Character => {
    switch (action.type) {
        case 'SET_ATTUNEMENT_SLOTS': {
            const newCount = Math.max(0, Math.min(10, action.payload));
            const newItems = [...state.attunementItems];
            newItems.length = newCount;
            for (let i = state.attunementItems.length; i < newCount; i++) { newItems[i] = null; }
            return { ...state, attunementSlots: newCount, attunementItems: newItems };
        }

        case 'SET_INVENTORY_ROWS': {
            const newRows = Math.max(1, Math.min(20, action.payload));
            const newSize = newRows * 10;
            const newInventory = [...state.inventory];
            newInventory.length = newSize;
            for (let i = state.inventory.length; i < newSize; i++) { newInventory[i] = null; }
            return { ...state, inventoryRows: newRows, inventory: newInventory };
        }

        case 'UPDATE_ITEM': {
            const { location, itemData } = action.payload;

            // --- Doll (equipped) ветка ---
            if (location.container === 'doll') {
                const equipped = [...(state.equippedItems || [])];
                if (itemData === null) {
                    equipped.splice(location.index, 1);
                    return { ...state, equippedItems: equipped };
                }
                if (!itemData.isEquipped) {
                    // Снятие через модалку: убрать из equipped, положить в инвентарь
                    const newEquipped = equipped.filter((_, i) => i !== location.index);
                    const unequipped: InventoryItem = { ...itemData, equippedX: undefined, equippedY: undefined };
                    const newInventory = [...state.inventory];
                    let placed = false;
                    for (let i = 0; i < newInventory.length; i++) {
                        if (newInventory[i] === null) {
                            newInventory[i] = unequipped;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) newInventory.push(unequipped);
                    return { ...state, equippedItems: newEquipped, inventory: newInventory };
                }
                // Обычное обновление equipped-предмета
                equipped[location.index] = itemData;
                return { ...state, equippedItems: equipped };
            }

            // --- Inventory / attunement / chest ветки через точечный апдейт ---
            // Иммутабельный апдейт конкретного массива без клонирования всего state.

            // Обработка chest (вложенный массив внутри предмета) — нужна особая логика
            if (location.container === 'chest' && location.chestId) {
                let chestFound = false;
                const newInventory = updateItemInArray(state.inventory, (item) => {
                    if (item && item.id === location.chestId && item.isChest && item.chestInventory) {
                        chestFound = true;
                        const updatedChestItem = { ...item, chestInventory: [...item.chestInventory] };
                        updatedChestItem.chestInventory[location.index] = itemData;
                        return updatedChestItem;
                    }
                    return item;
                });

                if (chestFound) {
                    return { ...state, inventory: newInventory };
                }

                // Check attunement items
                let chestFoundInAttunement = false;
                const newAttunement = updateItemInArray(state.attunementItems, (item) => {
                    if (item && item.id === location.chestId && item.isChest && item.chestInventory) {
                        chestFoundInAttunement = true;
                        const updatedChestItem = { ...item, chestInventory: [...item.chestInventory] };
                        updatedChestItem.chestInventory[location.index] = itemData;
                        return updatedChestItem;
                    }
                    return item;
                });

                if (chestFoundInAttunement) {
                    return { ...state, attunementItems: newAttunement };
                }

                // Fallback to equipped items (doll)
                const newEquipped = updateItemInArray(state.equippedItems || [], (item) => {
                    if (item && item.id === location.chestId && item.isChest && item.chestInventory) {
                        const updatedChestItem = { ...item, chestInventory: [...item.chestInventory] };
                        updatedChestItem.chestInventory[location.index] = itemData;
                        return updatedChestItem;
                    }
                    return item;
                });

                return { ...state, equippedItems: newEquipped.filter((x): x is InventoryItem => x !== null) };
            }

            if (location.container === 'inventory') {
                const originalItem = state.inventory[location.index];
                let finalItemData = itemData;
                if (originalItem && itemData && originalItem.isAttuned && !itemData.isAttuned && itemData.isEquipped) {
                    finalItemData = { ...itemData, isEquipped: false };
                }
                const newInventory = [...state.inventory];
                newInventory[location.index] = finalItemData;
                return { ...state, inventory: newInventory };
            }

            if (location.container === 'attunement') {
                const originalItem = state.attunementItems[location.index];
                let finalItemData = itemData;
                if (originalItem && itemData && originalItem.isAttuned && !itemData.isAttuned && itemData.isEquipped) {
                    finalItemData = { ...itemData, isEquipped: false };
                }
                const newAttunement = [...state.attunementItems];
                newAttunement[location.index] = finalItemData;
                return { ...state, attunementItems: newAttunement };
            }

            return state;
        }

        case 'SET_ITEMS_ORDER': {
            const { itemsWithOrder } = action.payload;
            // Разделяем обновления по контейнерам, чтобы применить точечно.
            const inventoryUpdates = new Map<number, { attunementOrder?: number; chargesOrder?: number }>();
            const equippedUpdates = new Map<number, { attunementOrder?: number; chargesOrder?: number }>();
            for (const { container, index, attunementOrder, chargesOrder } of itemsWithOrder) {
                const entry = { attunementOrder, chargesOrder };
                if (container === 'doll') {
                    equippedUpdates.set(index, entry);
                } else {
                    inventoryUpdates.set(index, entry);
                }
            }

            let newInventory = state.inventory;
            if (inventoryUpdates.size > 0) {
                newInventory = state.inventory.map((item, i) => {
                    const upd = inventoryUpdates.get(i);
                    if (!item || !upd) return item;
                    return {
                        ...item,
                        ...(upd.attunementOrder !== undefined ? { attunementOrder: upd.attunementOrder } : {}),
                        ...(upd.chargesOrder !== undefined ? { chargesOrder: upd.chargesOrder } : {}),
                    };
                });
            }

            let newEquipped = state.equippedItems || [];
            if (equippedUpdates.size > 0) {
                newEquipped = (state.equippedItems || []).map((item, i) => {
                    const upd = equippedUpdates.get(i);
                    if (!item || !upd) return item;
                    return {
                        ...item,
                        ...(upd.attunementOrder !== undefined ? { attunementOrder: upd.attunementOrder } : {}),
                        ...(upd.chargesOrder !== undefined ? { chargesOrder: upd.chargesOrder } : {}),
                    };
                });
            }

            if (inventoryUpdates.size === 0 && equippedUpdates.size === 0) return state;
            return { ...state, inventory: newInventory, equippedItems: newEquipped };
        }

        case 'MOVE_ITEM': {
            const { source, destination } = action.payload;
            if (source.container === destination.container && source.index === destination.index && source.chestId === destination.chestId) return state;

            const [, sourceItemPre] = findItemAndList(state, source);

            // Validation: Prevent putting a chest inside another chest.
            // This is handled here in the reducer to keep the logic pure and centralized.
            if (sourceItemPre?.isChest && destination.container === 'chest') {
                console.warn("Attempted to move a chest into another chest. Operation cancelled.");
                return state; // Return original state without changes.
            }

            const [, sourceItem] = findItemAndList(state, source);
            const [, destItem] = findItemAndList(state, destination);
            if (!sourceItem) return state;

            // Точечный обмен значений в обоих локациях без глубокого клонирования.
            // writeItemAtLocation копирует только затронутые массивы.
            return writeMoveResult(state, source, sourceItem, destination, destItem);
        }

        case 'DELETE_CUSTOM_ICON_REFERENCES': {
            const iconUrlToDelete = action.payload;
            const clearIcon = (item: InventoryItem | null): InventoryItem | null => {
                if (!item) return null;
                const newItem = { ...item };
                if (newItem.imageUrl === iconUrlToDelete) {
                    newItem.imageUrl = '';
                }
                if (newItem.isChest && newItem.chestInventory) {
                    newItem.chestInventory = newItem.chestInventory.map(clearIcon);
                }
                return newItem;
            };
            return { 
                ...state, 
                inventory: state.inventory.map(clearIcon), 
                attunementItems: state.attunementItems.map(clearIcon),
                equippedItems: (state.equippedItems || []).map(clearIcon).filter((i): i is InventoryItem => i !== null),
                attacks: state.attacks.map(attack => {
                    if (attack.imageUrl === iconUrlToDelete) {
                        return { ...attack, imageUrl: '' };
                    }
                    return attack;
                }),
                spells: state.spells.map(spell => {
                    if (spell.imageUrl === iconUrlToDelete) {
                        return { ...spell, imageUrl: '' };
                    }
                    return spell;
                }),
            };
        }
        
        case 'SET_CURRENCY': {
            const { currency, amount } = action.payload;
            return {
                ...state,
                currency: {
                    ...state.currency,
                    [currency]: Math.max(0, amount || 0),
                }
            };
        }

        case 'DAWN_RECOVERY': {
            return {
                ...state,
                inventory: recoverItemCharges(state.inventory, [RecoveryType.Dawn]),
                attunementItems: recoverItemCharges(state.attunementItems, [RecoveryType.Dawn]),
                equippedItems: recoverItemCharges(state.equippedItems || [], [RecoveryType.Dawn]) as InventoryItem[],
            };
        }

        case 'PLACE_ITEM_ON_DOLL': {
            const { itemIndex, x, y } = action.payload;
            const targetItem = state.inventory[itemIndex];
            if (!targetItem) return state;

            const newInventory = [...state.inventory];
            newInventory[itemIndex] = null;

            const newEquippedItems = [...(state.equippedItems || [])];
            newEquippedItems.push({
                ...targetItem,
                equippedX: x,
                equippedY: y,
                isEquipped: true
            });

            return { ...state, inventory: newInventory, equippedItems: newEquippedItems };
        }

        case 'MOVE_ITEM_ON_DOLL': {
            const { itemIndex, x, y } = action.payload;
            const newEquippedItems = (state.equippedItems || []).map((item, idx) => {
                if (idx === itemIndex && item) {
                    return { ...item, equippedX: x, equippedY: y };
                }
                return item;
            });

            return { ...state, equippedItems: newEquippedItems };
        }

        case 'UNEQUIP_ITEM_FROM_DOLL': {
            const { itemIndex, targetInventoryIndex } = action.payload;
            const newEquippedItems = [...(state.equippedItems || [])];
            const [itemToUnequip] = newEquippedItems.splice(itemIndex, 1);
            if (!itemToUnequip) return state;

            const unequippedItem = {
                ...itemToUnequip,
                equippedX: undefined,
                equippedY: undefined,
                isEquipped: false
            };

            const newInventory = [...state.inventory];
            let placed = false;

            if (targetInventoryIndex !== undefined && targetInventoryIndex >= 0 && targetInventoryIndex < newInventory.length && newInventory[targetInventoryIndex] === null) {
                newInventory[targetInventoryIndex] = unequippedItem;
                placed = true;
            } else {
                for (let i = 0; i < newInventory.length; i++) {
                    if (newInventory[i] === null) {
                        newInventory[i] = unequippedItem;
                        placed = true;
                        break;
                    }
                }
            }

            if (!placed) {
                newInventory.push(unequippedItem);
            }

            return { ...state, inventory: newInventory, equippedItems: newEquippedItems };
        }

        default:
            return state;
    }
};