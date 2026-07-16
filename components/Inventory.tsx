import { CharacterDoll } from './CharacterDoll';
import React, { useState, useMemo, useCallback } from 'react';
// Fix: Changed a type-only import to a mixed value and type import. `CharacterSize`, `Rarity`, and `Currency` are enums used as values and must not be imported with `import type`.
import { type InventoryItem, type DropLocation, Rarity, Currency, CharacterSize, EquipSlot } from '../types';
import { InventoryGrid } from './InventoryGrid';
import { RARITY_NAMES, RARITY_COLORS } from '../constants';
import { calculateItemWeight, getEquippedItemBonuses } from '../utils/inventory';
import { CurrencyTracker } from './CurrencyTracker';
import { useCharacter } from '../context/CharacterContext';
import { useNotifier } from '../context/NotificationContext';
import { EditableBonus } from './EditableBonus';

interface InventoryProps {
  onItemDragStart: (index: number) => void;
  onDollItemDragStart: (index: number) => void;
  onItemDrop: (index: number) => void;
  onSlotClick: (index: number, e: React.MouseEvent, fromDoll?: boolean) => void;
  draggedItemInfo: DropLocation | null;
  onItemDragEnd: () => void;
}

export const Inventory: React.FC<InventoryProps> = React.memo(({ 
    onItemDragStart,
    onDollItemDragStart,
    onItemDrop,
    onSlotClick,
    draggedItemInfo,
    onItemDragEnd,
}) => {
  const { character, dispatch } = useCharacter();
  const { inventoryRows: rows, inventory, currency, scores, size } = character;
  const { addNotification } = useNotifier();

  const handleDollItemDrop = useCallback((x: number, y: number) => {
    if (!draggedItemInfo) return;

    if (draggedItemInfo.container === 'inventory') {
      const item = inventory[draggedItemInfo.index];
      if (item) {
        dispatch({
          type: 'PLACE_ITEM_ON_DOLL',
          payload: { itemIndex: draggedItemInfo.index, x, y }
        });
      }
    }
  }, [draggedItemInfo, inventory, dispatch]);

  const handleDollItemMove = useCallback((itemIndex: number, x: number, y: number) => {
    dispatch({
      type: 'MOVE_ITEM_ON_DOLL',
      payload: { itemIndex, x, y }
    });
  }, [dispatch]);

  const handleDollItemUnequip = useCallback((itemIndex: number) => {
    dispatch({
      type: 'UNEQUIP_ITEM_FROM_DOLL',
      payload: { itemIndex }
    });
  }, [dispatch]);

  const displayedInventory = useMemo(() => {
    return inventory;
  }, [inventory]);

  const [searchQuery, setSearchQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<Rarity[]>([]);

  const [dollWidth, setDollWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dnd-doll-width');
      return saved ? parseInt(saved, 10) : 420;
    } catch {
      return 420;
    }
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = dollWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      const cappedWidth = Math.max(320, Math.min(700, newWidth));
      setDollWidth(cappedWidth);
      try {
        localStorage.setItem('dnd-doll-width', cappedWidth.toString());
      } catch (err) {
        console.error(err);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [dollWidth]);

  const onRowsChange = useCallback((newRows: number) => {
    dispatch({ type: 'SET_INVENTORY_ROWS', payload: newRows });
  }, [dispatch]);

  const onCurrencyChange = useCallback((currency: Currency, amount: number) => {
    dispatch({ type: 'SET_CURRENCY', payload: { currency, amount }});
  }, [dispatch]);

  const sizeMultiplier = useMemo(() => {
    switch (size) {
        case CharacterSize.Tiny: return 0.5;
        case CharacterSize.Large: return 2;
        case CharacterSize.Huge: return 4;
        case CharacterSize.Gargantuan: return 8;
        case CharacterSize.Small:
        case CharacterSize.Medium:
        default: return 1;
    }
  }, [size]);

  const equippedBonuses = useMemo(() => getEquippedItemBonuses(character), [character]);
  const carryCapacityBonus = character.carryCapacityBonus || 0;
  const itemCarryCapacityBonus = equippedBonuses.carryCapacity || 0;

  const currentAttunedCount = useMemo(() => {
    const invCount = inventory.filter(item => item && item.isAttuned).length;
    const eqCount = (character.equippedItems || []).filter(item => item && item.isAttuned).length;
    return invCount + eqCount;
  }, [inventory, character.equippedItems]);
  const attunementMaxBonus = character.attunementMaxBonus || 0;
  const itemAttunementMaxBonus = equippedBonuses.attunementMax || 0;
  const maxAttuned = 3 + attunementMaxBonus + itemAttunementMaxBonus;

  const carryingCapacity = useMemo(() => {
    const baseCapacity = (scores.STR || 10) * 15;
    return baseCapacity * sizeMultiplier + carryCapacityBonus + itemCarryCapacityBonus;
  }, [scores.STR, sizeMultiplier, carryCapacityBonus, itemCarryCapacityBonus]);

  const toggleRarityFilter = (rarity: Rarity) => {
    setRarityFilter(prev => 
        prev.includes(rarity) 
        ? prev.filter(r => r !== rarity)
        : [...prev, rarity]
    );
  };

  const filteredInventory = useMemo(() => {
    const lowerCaseQuery = searchQuery.toLowerCase().trim();
    return displayedInventory.map(item => {
        if (!item) return null;
        const nameMatch = lowerCaseQuery ? item.name.toLowerCase().includes(lowerCaseQuery) : true;
        const rarityMatch = rarityFilter.length > 0 ? rarityFilter.includes(item.rarity) : true;
        return nameMatch && rarityMatch ? item : null;
    });
  }, [displayedInventory, searchQuery, rarityFilter]);

  const totalWeight = useMemo(() => {
    const invWeight = inventory.reduce((sum, item) => sum + calculateItemWeight(item), 0);
    const eqWeight = (character.equippedItems || []).reduce((sum, item) => sum + calculateItemWeight(item), 0);
    return invWeight + eqWeight;
  }, [inventory, character.equippedItems]);

  const attunementItems = useMemo(() => {
    const list: { item: InventoryItem; container: 'inventory' | 'doll'; index: number }[] = [];
    inventory.forEach((item, index) => {
      if (item && item.requiresAttunement) {
        list.push({ item, container: 'inventory', index });
      }
    });
    (character.equippedItems || []).forEach((item, index) => {
      if (item && item.requiresAttunement) {
        list.push({ item, container: 'doll', index });
      }
    });
    return list.sort((a, b) => (a.item.attunementOrder ?? a.index) - (b.item.attunementOrder ?? b.index));
  }, [inventory, character.equippedItems]);

  const chargedItems = useMemo(() => {
    const list: { item: InventoryItem; container: 'inventory' | 'doll'; index: number }[] = [];
    inventory.forEach((item, index) => {
      if (item && item.hasCharges) {
        list.push({ item, container: 'inventory', index });
      }
    });
    (character.equippedItems || []).forEach((item, index) => {
      if (item && item.hasCharges) {
        list.push({ item, container: 'doll', index });
      }
    });
    return list.sort((a, b) => (a.item.chargesOrder ?? a.index) - (b.item.chargesOrder ?? b.index));
  }, [inventory, character.equippedItems]);

  const consumableItems = useMemo(() => {
    const list: { item: InventoryItem; container: 'inventory' | 'doll' | 'chest'; index: number; chestId?: string; parentName?: string }[] = [];
    
    // 1. Scan main inventory
    inventory.forEach((item, index) => {
      if (!item) return;
      if (item.isConsumable) {
        list.push({ item, container: 'inventory', index });
      }
      if (item.isChest && Array.isArray(item.chestInventory)) {
        item.chestInventory.forEach((nestedItem, nestedIndex) => {
          if (nestedItem && nestedItem.isConsumable) {
            list.push({
              item: nestedItem,
              container: 'chest',
              index: nestedIndex,
              chestId: item.id,
              parentName: item.name
            });
          }
        });
      }
    });

    // 2. Scan equipped items
    (character.equippedItems || []).forEach((item, index) => {
      if (!item) return;
      if (item.isConsumable) {
        list.push({ item, container: 'doll', index });
      }
      if (item.isChest && Array.isArray(item.chestInventory)) {
        item.chestInventory.forEach((nestedItem, nestedIndex) => {
          if (nestedItem && nestedItem.isConsumable) {
            list.push({
              item: nestedItem,
              container: 'chest',
              index: nestedIndex,
              chestId: item.id,
              parentName: item.name
            });
          }
        });
      }
    });

    // Sort alphabetically by name
    return list.sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [inventory, character.equippedItems]);

  const handleUseConsumable = useCallback((entry: { item: InventoryItem; container: 'inventory' | 'doll' | 'chest'; index: number; chestId?: string; parentName?: string }) => {
    const newQty = entry.item.quantity - 1;
    
    dispatch({
      type: 'UPDATE_ITEM',
      payload: {
        location: {
          container: entry.container,
          index: entry.index,
          chestId: entry.chestId
        },
        itemData: newQty > 0 ? {
          ...entry.item,
          quantity: newQty
        } : null
      }
    });

    if (newQty > 0) {
      addNotification(`Использован предмет "${entry.item.name}" (осталось: ${newQty}).`, 'info');
    } else {
      addNotification(`Использован последний предмет "${entry.item.name}" и удален из инвентаря.`, 'warning');
    }
  }, [dispatch, addNotification]);

  const handleDeleteConsumable = useCallback((entry: { item: InventoryItem; container: 'inventory' | 'doll' | 'chest'; index: number; chestId?: string; parentName?: string }) => {
    dispatch({
      type: 'UPDATE_ITEM',
      payload: {
        location: {
          container: entry.container,
          index: entry.index,
          chestId: entry.chestId
        },
        itemData: null
      }
    });
    addNotification(`Предмет "${entry.item.name}" удален из инвентаря.`, 'warning');
  }, [dispatch, addNotification]);

  const handleUpdateCharges = useCallback((item: InventoryItem, container: 'inventory' | 'doll', index: number, newCharges: number) => {
    const minCharges = 0;
    const maxCharges = item.totalCharges || 0;
    const boundedCharges = Math.max(minCharges, Math.min(maxCharges, newCharges));
    
    dispatch({
      type: 'UPDATE_ITEM',
      payload: {
        location: { container, index },
        itemData: {
          ...item,
          currentCharges: boundedCharges
        }
      }
    });
  }, [dispatch]);

  const handleToggleAttunement = useCallback((item: InventoryItem, container: 'inventory' | 'doll', index: number) => {
    dispatch({
      type: 'UPDATE_ITEM',
      payload: {
        location: { container, index },
        itemData: {
          ...item,
          isAttuned: !item.isAttuned,
          attunementTimestamp: !item.isAttuned ? Date.now() : undefined
        }
      }
    });
  }, [dispatch]);

  const handleMoveItem = useCallback((list: { item: InventoryItem; container: 'inventory' | 'doll'; index: number }[], i: number, direction: 'up' | 'down', type: 'attunement' | 'charges') => {
    const targetIndex = direction === 'up' ? i - 1 : i + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const newList = [...list];
    const temp = newList[i]!;
    newList[i] = newList[targetIndex]!;
    newList[targetIndex] = temp;

    const itemsWithOrder = newList.map((entry, orderIndex) => ({
      container: entry.container,
      index: entry.index,
      [type === 'attunement' ? 'attunementOrder' : 'chargesOrder']: orderIndex
    }));

    dispatch({
      type: 'SET_ITEMS_ORDER',
      payload: { itemsWithOrder }
    });
  }, [dispatch]);

  const [draggedColItemIndex, setDraggedColItemIndex] = useState<number | null>(null);
  const [draggedColType, setDraggedColType] = useState<'attunement' | 'charges' | null>(null);

  const handleColDragStart = useCallback((e: React.DragEvent, i: number, type: 'attunement' | 'charges') => {
    setDraggedColItemIndex(i);
    setDraggedColType(type);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleColDragOver = useCallback((e: React.DragEvent, type: 'attunement' | 'charges') => {
    if (draggedColType === type) {
      e.preventDefault();
    }
  }, [draggedColType]);

  const handleColDrop = useCallback((e: React.DragEvent, i: number, type: 'attunement' | 'charges') => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedColType !== type || draggedColItemIndex === null || draggedColItemIndex === i) return;
    
    const list = type === 'attunement' ? attunementItems : chargedItems;
    const newList = [...list];
    const [removed] = newList.splice(draggedColItemIndex, 1);
    newList.splice(i, 0, removed!);

    const itemsWithOrder = newList.map((entry, orderIndex) => ({
      container: entry.container,
      index: entry.index,
      [type === 'attunement' ? 'attunementOrder' : 'chargesOrder']: orderIndex
    }));

    dispatch({
      type: 'SET_ITEMS_ORDER',
      payload: { itemsWithOrder }
    });

    setDraggedColItemIndex(null);
    setDraggedColType(null);
  }, [draggedColType, draggedColItemIndex, attunementItems, chargedItems, dispatch]);

  const handleColDragEnd = useCallback(() => {
    setDraggedColItemIndex(null);
    setDraggedColType(null);
  }, []);

  return (
    <div 
      className="flex flex-col lg:flex-row gap-4 items-stretch w-full"
      style={{ '--doll-width': `${dollWidth}px` } as React.CSSProperties}
    >
      {/* Left Column: Character Doll */}
      <div className="w-full lg:w-[var(--doll-width)] flex-shrink-0 lg:sticky lg:top-4 lg:self-start">
        <CharacterDoll
          onSlotClick={onSlotClick}
          onItemDragStart={onDollItemDragStart}
          onItemDrop={handleDollItemDrop}
          onItemMove={handleDollItemMove}
          onItemDragEnd={onItemDragEnd}
          onItemUnequip={handleDollItemUnequip}
        />
      </div>

      {/* Resizer Splitter Bar */}
      <div 
        onMouseDown={handleMouseDown}
        className="hidden lg:block w-1.5 self-stretch cursor-col-resize hover:bg-teal-500/25 hover:shadow-[0_0_8px_rgba(35,160,140,0.5)] active:bg-[var(--color-accent-primary)] transition-all duration-150 rounded"
        data-tooltip="Перетащите для изменения размера"
      />

      {/* Right Column: Inventory */}
      <div className="flex-grow bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] min-w-[320px] md:min-w-[600px] w-full lg:w-0">
      <div className="flex flex-col gap-4 mb-4">
        {/* Row 1: Header Line (Title, Dawn Button, Rows) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-700/40 w-full">
          {/* Title & Dawn Button */}
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-wide text-[var(--color-text-base)]">Инвентарь</h2>
            <button
                onClick={() => dispatch({ type: 'DAWN_RECOVERY' })}
                className="group bg-[var(--color-surface-well)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-hover)] font-bold py-1.5 px-3 rounded-lg transition-all duration-150 active:scale-95 text-xs flex items-center gap-1.5 shadow-sm"
                data-tooltip="Восстановить заряды предметов, которые перезаряжаются на рассвете"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-500/70 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
                <span>Рассвет</span>
            </button>
          </div>

          {/* Rows Selector */}
          <div className="flex items-center space-x-2 bg-[var(--color-surface-well)] px-2.5 py-1.5 rounded-lg border border-[var(--color-border-subtle)]">
            <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Ряды:</span>
            <div className="flex items-center space-x-1 bg-[var(--color-surface-raised)]/30 p-0.5 rounded-full border border-slate-700/40">
              <button
                onClick={() => onRowsChange(rows - 1)}
                disabled={rows <= 1}
                className="bg-[var(--color-surface-raised)] w-6 h-6 rounded-full text-sm flex items-center justify-center hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-base)] font-bold transition-all duration-150 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Уменьшить количество рядов"
              >
                -
              </button>
              <span className="w-6 text-center font-bold text-xs text-[var(--color-text-base)]">{rows}</span>
              <button
                onClick={() => onRowsChange(rows + 1)}
                disabled={rows >= 20}
                className="bg-[var(--color-surface-raised)] w-6 h-6 rounded-full text-sm flex items-center justify-center hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-base)] font-bold transition-all duration-150 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Увеличить количество рядов"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Status Cards (Weight, Attunement) & Currency Exchanger */}
        <div className="flex flex-wrap gap-4 items-start w-full">
          {/* Stats Cards (Weight & Attunement) */}
          <div className="flex-grow flex-shrink-0 basis-[300px] grid grid-cols-2 gap-3">
            {/* Weight Capacity Tracker */}
            <div className="bg-[var(--color-surface-inset)] p-3 rounded-xl border border-[var(--color-border-subtle)] flex flex-col justify-between min-h-[85px] relative">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold">Вес (фнт.)</span>
                {itemCarryCapacityBonus !== 0 && (
                  <span className="text-[10px] text-teal-400 font-semibold cursor-default" data-tooltip="Бонус от экипированных предметов">
                    {itemCarryCapacityBonus > 0 ? '+' : ''}{itemCarryCapacityBonus}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 my-1.5">
                <span className={`text-xl font-extrabold transition-colors ${totalWeight > carryingCapacity ? 'text-[var(--color-health)]' : 'text-[var(--color-text-base)]'}`}>
                  {totalWeight.toFixed(1)}
                </span>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  / {carryingCapacity}
                </span>
                <div className="ml-auto" data-tooltip="Модификатор переносимого веса">
                  <EditableBonus 
                    value={carryCapacityBonus} 
                    onChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'carryCapacityBonus', value: bonus } })} 
                  />
                </div>
              </div>
              <div className="text-[10px] text-[var(--color-text-subtle)] font-medium">
                Тяга/Толкание: <span className="text-[var(--color-text-medium)] font-bold">{carryingCapacity * 2} фнт.</span>
              </div>
            </div>

            {/* Attunement Slots Tracker */}
            <div className="bg-[var(--color-surface-inset)] p-3 rounded-xl border border-[var(--color-border-subtle)] flex flex-col justify-between min-h-[85px] relative">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold">Настройка</span>
                {itemAttunementMaxBonus !== 0 && (
                  <span className="text-[10px] text-teal-400 font-semibold cursor-default" data-tooltip="Бонус от экипированных предметов к лимиту настроек">
                    {itemAttunementMaxBonus > 0 ? '+' : ''}{itemAttunementMaxBonus}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 my-1.5">
                <span className={`text-xl font-extrabold transition-colors ${currentAttunedCount > maxAttuned ? 'text-[var(--color-health)]' : 'text-[var(--color-text-base)]'}`}>
                  {currentAttunedCount}
                </span>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  / {maxAttuned}
                </span>
                <div className="ml-auto" data-tooltip="Модификатор максимального количества настроек">
                  <EditableBonus 
                    value={attunementMaxBonus} 
                    onChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'attunementMaxBonus', value: bonus } })} 
                  />
                </div>
              </div>
              <div className="text-[10px] text-[var(--color-text-subtle)] font-medium">
                Настройки предметов
              </div>
            </div>
          </div>

          {/* Currency Exchanger */}
          <div className="flex-grow flex-shrink-0 basis-[300px] max-w-md w-full">
            <CurrencyTracker currency={currency} onCurrencyChange={onCurrencyChange} />
          </div>
        </div>
      </div>

       <div className="border-t border-slate-700/40 my-3"></div>
      
       <div className="flex flex-col md:flex-row gap-3 mb-4">
            <input
                type="text"
                placeholder="Поиск по названию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-1/3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-[var(--color-text-medium)] focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] placeholder:text-[var(--color-text-subtle)]"
            />
            <div className="flex flex-wrap gap-2 items-center">
                {Object.entries(RARITY_NAMES).map(([rarityKey, rarityName]) => {
                    const rarity = parseInt(rarityKey) as Rarity;
                    const isActive = rarityFilter.includes(rarity);
                    const colorClass = RARITY_COLORS[rarity].replace('border-', 'bg-') + '/20';
                    const hoverColorClass = RARITY_COLORS[rarity].replace('border-', 'bg-') + '/40';
                    const activeClass = isActive ? `${RARITY_COLORS[rarity]} text-white/90` : `border-transparent text-[var(--color-text-muted)]`;
                    return (
                        <button 
                            key={rarity}
                            onClick={() => toggleRarityFilter(rarity)}
                            className={`px-3 py-1 text-xs font-semibold rounded-full border-2 transition-colors ${activeClass} hover:${hoverColorClass}`}
                        >
                            {rarityName}
                        </button>
                    )
                })}
            </div>
       </div>

      <InventoryGrid
        items={displayedInventory}
        filteredItems={filteredInventory}
        onSlotClick={onSlotClick}
        draggedItemInfo={draggedItemInfo}
        onItemDragStart={onItemDragStart}
        onItemDrop={onItemDrop}
        onItemDragEnd={onItemDragEnd}
        container={{ type: 'inventory' }}
        showDisabledSlots={!!searchQuery || rarityFilter.length > 0}
      />

      {/* Attunement and Charges Tracking Columns */}
      {(attunementItems.length > 0 || chargedItems.length > 0 || consumableItems.length > 0) && (
        <div className="mt-8 border-t border-slate-700/40 pt-6">
          <h3 className="text-sm font-bold tracking-wider text-[var(--color-text-base)] mb-4 uppercase flex items-center gap-2 select-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--color-accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Отслеживание параметров предметов
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Column 1: Attunement */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-[var(--color-surface-well)] px-3.5 py-2 rounded-xl border border-[var(--color-border-subtle)] shadow-sm">
                <span className="text-[10px] font-extrabold text-[var(--color-text-medium)] tracking-wider uppercase">
                  Настройка предметов ({currentAttunedCount} / {maxAttuned})
                </span>
              </div>
              
              <div className="flex flex-col gap-2 bg-[var(--color-surface-inset)]/40 p-2.5 rounded-2xl border border-dashed border-[var(--color-border-subtle)] min-h-[140px]">
                {attunementItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center grow py-8 text-center text-xs text-[var(--color-text-muted)] select-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span>Нет предметов, требующих настройки</span>
                  </div>
                ) : (
                  attunementItems.map(({ item, container, index }, i) => {
                    const isDragging = draggedColType === 'attunement' && draggedColItemIndex === i;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleColDragStart(e, i, 'attunement')}
                        onDragOver={(e) => handleColDragOver(e, 'attunement')}
                        onDrop={(e) => handleColDrop(e, i, 'attunement')}
                        onDragEnd={handleColDragEnd}
                        className={`flex items-center justify-between p-2.5 bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] rounded-xl border border-[var(--color-border-subtle)] transition-all duration-150 group ${
                          isDragging ? 'opacity-40 scale-95 border-dashed border-[var(--color-accent-primary)]' : ''
                        } ${
                          draggedColItemIndex !== null ? 'drag-active' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Drag handle */}
                          <div className="text-[var(--color-text-subtle)] opacity-40 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          
                          {/* Image */}
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--color-border-subtle)] flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[10px] font-extrabold text-[var(--color-text-muted)] flex-shrink-0 select-none">
                              {item.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}

                          {/* Name */}
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-[var(--color-text-base)] truncate" data-tooltip={item.name}>
                              {item.name}
                            </span>
                            <span className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
                              {container === 'doll' ? 'Экипирован' : 'В инвентаре'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Attunement toggle button */}
                          <button
                            onClick={() => handleToggleAttunement(item, container, index)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all duration-150 flex items-center gap-1.5 shadow-sm active:scale-95 ${
                              item.isAttuned
                                ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : 'bg-[var(--color-surface-well)] hover:bg-[var(--color-surface-well)]/80 text-[var(--color-text-muted)] border-[var(--color-border-subtle)]'
                            }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                            </svg>
                            <span>{item.isAttuned ? 'Настроено' : 'Настроить'}</span>
                          </button>

                          {/* Up/Down buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              disabled={i === 0}
                              onClick={() => handleMoveItem(attunementItems, i, 'up', 'attunement')}
                              className="p-0.5 hover:bg-[var(--color-surface-well)] rounded text-[var(--color-text-muted)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              data-tooltip="Переместить выше"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              disabled={i === attunementItems.length - 1}
                              onClick={() => handleMoveItem(attunementItems, i, 'down', 'attunement')}
                              className="p-0.5 hover:bg-[var(--color-surface-well)] rounded text-[var(--color-text-muted)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              data-tooltip="Переместить ниже"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Column 2: Charges */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-[var(--color-surface-well)] px-3.5 py-2 rounded-xl border border-[var(--color-border-subtle)] shadow-sm">
                <span className="text-[10px] font-extrabold text-[var(--color-text-medium)] tracking-wider uppercase">
                  Заряды предметов
                </span>
              </div>
              
              <div className="flex flex-col gap-2 bg-[var(--color-surface-inset)]/40 p-2.5 rounded-2xl border border-dashed border-[var(--color-border-subtle)] min-h-[140px]">
                {chargedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center grow py-8 text-center text-xs text-[var(--color-text-muted)] select-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Нет предметов с зарядами</span>
                  </div>
                ) : (
                  chargedItems.map(({ item, container, index }, i) => {
                    const isDragging = draggedColType === 'charges' && draggedColItemIndex === i;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleColDragStart(e, i, 'charges')}
                        onDragOver={(e) => handleColDragOver(e, 'charges')}
                        onDrop={(e) => handleColDrop(e, i, 'charges')}
                        onDragEnd={handleColDragEnd}
                        className={`flex items-center justify-between p-2.5 bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] rounded-xl border border-[var(--color-border-subtle)] transition-all duration-150 group ${
                          isDragging ? 'opacity-40 scale-95 border-dashed border-[var(--color-accent-primary)]' : ''
                        } ${
                          draggedColItemIndex !== null ? 'drag-active' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Drag handle */}
                          <div className="text-[var(--color-text-subtle)] opacity-40 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          
                          {/* Image */}
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--color-border-subtle)] flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[10px] font-extrabold text-[var(--color-text-muted)] flex-shrink-0 select-none">
                              {item.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}

                          {/* Name */}
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-[var(--color-text-base)] truncate" data-tooltip={item.name}>
                              {item.name}
                            </span>
                            <span className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
                              Заряды: {item.currentCharges || 0} / {item.totalCharges || 0} {container === 'doll' ? '(Экипирован)' : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Charge adjustment buttons */}
                          <div className="flex items-center bg-[var(--color-surface-well)] rounded-lg border border-[var(--color-border-subtle)] p-0.5">
                            <button
                              onClick={() => handleUpdateCharges(item, container, index, (item.currentCharges || 0) - 1)}
                              disabled={(item.currentCharges || 0) <= 0}
                              className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] disabled:opacity-20 transition-all active:scale-90"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-[var(--color-text-base)] select-none">
                              {item.currentCharges || 0}
                            </span>
                            <button
                              onClick={() => handleUpdateCharges(item, container, index, (item.currentCharges || 0) + 1)}
                              disabled={(item.currentCharges || 0) >= (item.totalCharges || 0)}
                              className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] disabled:opacity-20 transition-all active:scale-90"
                            >
                              +
                            </button>
                          </div>

                          {/* Re-charge reset button */}
                          <button
                            onClick={() => handleUpdateCharges(item, container, index, item.totalCharges || 0)}
                            disabled={(item.currentCharges || 0) === (item.totalCharges || 0)}
                            className="p-1 hover:bg-[var(--color-surface-well)] rounded text-[var(--color-accent-secondary)] disabled:opacity-30 disabled:text-[var(--color-text-muted)] transition-colors"
                            data-tooltip="Восстановить до максимума"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6H16" />
                            </svg>
                          </button>

                          {/* Up/Down buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              disabled={i === 0}
                              onClick={() => handleMoveItem(chargedItems, i, 'up', 'charges')}
                              className="p-0.5 hover:bg-[var(--color-surface-well)] rounded text-[var(--color-text-muted)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              data-tooltip="Переместить выше"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              disabled={i === chargedItems.length - 1}
                              onClick={() => handleMoveItem(chargedItems, i, 'down', 'charges')}
                              className="p-0.5 hover:bg-[var(--color-surface-well)] rounded text-[var(--color-text-muted)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              data-tooltip="Переместить ниже"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Column 3: Consumables */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-[var(--color-surface-well)] px-3.5 py-2 rounded-xl border border-[var(--color-border-subtle)] shadow-sm">
                <span className="text-[10px] font-extrabold text-[var(--color-text-medium)] tracking-wider uppercase">
                  Расходники ({consumableItems.length})
                </span>
              </div>
              
              <div className="flex flex-col gap-2 bg-[var(--color-surface-inset)]/40 p-2.5 rounded-2xl border border-dashed border-[var(--color-border-subtle)] min-h-[140px]">
                {consumableItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center grow py-8 text-center text-xs text-[var(--color-text-muted)] select-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>Нет расходных предметов</span>
                  </div>
                ) : (
                  consumableItems.map((entry) => {
                    const { item, container, parentName } = entry;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] rounded-xl border border-[var(--color-border-subtle)] transition-all duration-150 group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Image */}
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--color-border-subtle)] flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[10px] font-extrabold text-[var(--color-text-muted)] flex-shrink-0 select-none">
                              {item.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}

                          {/* Name and Location */}
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-[var(--color-text-base)] truncate" data-tooltip={item.name}>
                              {item.name}
                            </span>
                            <span className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider truncate" data-tooltip={parentName ? `В контейнере: ${parentName}` : container === 'doll' ? 'Экипирован' : 'В инвентаре'}>
                              {parentName ? `В конт.: ${parentName}` : container === 'doll' ? 'Экипирован' : 'В инвентаре'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Quantity badge */}
                          <span className="text-xs font-extrabold px-1.5 py-0.5 rounded bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] text-[var(--color-text-base)]">
                            x{item.quantity}
                          </span>

                          {/* Use / Drink button */}
                          <button
                            onClick={() => handleUseConsumable(entry)}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg transition-all active:scale-90"
                            data-tooltip="Использовать (уменьшить кол-во на 1)"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteConsumable(entry)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all active:scale-90 opacity-40 group-hover:opacity-100 transition-opacity"
                            data-tooltip="Удалить полностью"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      )}
      </div>
    </div>
  );
});