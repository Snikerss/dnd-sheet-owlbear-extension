import React from 'react';
import { Character, InventoryItem, Attack, Spell, DropLocation } from '../types';
import { ItemDetailModal } from './ItemDetailModal';
import { AttackDetailModal } from './AttackDetailModal';
import { SpellDetailModal } from './SpellDetailModal';
import { ChestViewModal } from './ChestViewModal';

interface SheetModalManagerProps {
  character: Character;
  editingItem: InventoryItem | null;
  editingSlot: DropLocation | null;
  setEditingSlot: (slot: DropLocation | null) => void;
  handleSaveItem: (item: InventoryItem | null) => void;
  handleDeleteItem: () => void;

  editingAttack: Attack | null;
  setEditingAttack: (attack: Attack | null) => void;
  isNewAttack: boolean;
  setIsNewAttack: (val: boolean) => void;
  handleSaveAttack: (attack: Attack) => void;
  handleDeleteAttack: (id: string) => void;

  editingSpell: Spell | null;
  setEditingSpell: (spell: Spell | null) => void;
  isNewSpell: boolean;
  setIsNewSpell: (val: boolean) => void;
  handleSaveSpell: (spell: Spell) => void;
  handleDeleteSpell: (id: string) => void;

  viewingChestItem: InventoryItem | null;
  setViewingChestId: (id: string | null) => void;
  draggedItemInfo: DropLocation | null;
  setDraggedItemInfo: (info: DropLocation | null) => void;
  handleItemDrop: (target: DropLocation) => void;
  handleDragEnd: () => void;

  overAttunedItem: InventoryItem | null;
  handleConfirmOverAttunementRemoval: () => void;

  customIcons: string[];
  handleAddCustomIcon: (dataUrl: string) => void;
  handleDeleteCustomIcon: (dataUrl: string) => void;
}

export const SheetModalManager: React.FC<SheetModalManagerProps> = ({
  character,
  editingItem,
  editingSlot,
  setEditingSlot,
  handleSaveItem,
  handleDeleteItem,
  editingAttack,
  setEditingAttack,
  isNewAttack,
  setIsNewAttack,
  handleSaveAttack,
  handleDeleteAttack,
  editingSpell,
  setEditingSpell,
  isNewSpell,
  setIsNewSpell,
  handleSaveSpell,
  handleDeleteSpell,
  viewingChestItem,
  setViewingChestId,
  draggedItemInfo,
  setDraggedItemInfo,
  handleItemDrop,
  handleDragEnd,
  overAttunedItem,
  handleConfirmOverAttunementRemoval,
  customIcons,
  handleAddCustomIcon,
  handleDeleteCustomIcon,
}) => {
  const isAttackModalOpen = !!editingAttack || isNewAttack;
  const attackToEdit = isNewAttack ? null : editingAttack;

  const isSpellModalOpen = !!editingSpell || isNewSpell;
  const spellToEdit = isNewSpell ? null : editingSpell;

  return (
    <>
      {editingSlot && (
        <ItemDetailModal
          character={character}
          isOpen={!!editingSlot}
          onClose={() => setEditingSlot(null)}
          item={editingItem}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
          customIcons={customIcons}
          onAddCustomIcon={handleAddCustomIcon}
          onDeleteCustomIcon={handleDeleteCustomIcon}
        />
      )}

      {isAttackModalOpen && (
        <AttackDetailModal
          isOpen={isAttackModalOpen}
          onClose={() => { setEditingAttack(null); setIsNewAttack(false); }}
          attack={attackToEdit}
          onSave={handleSaveAttack}
          onDelete={handleDeleteAttack}
          customIcons={customIcons}
          onAddCustomIcon={handleAddCustomIcon}
          onDeleteCustomIcon={handleDeleteCustomIcon}
        />
      )}

      {isSpellModalOpen && (
        <SpellDetailModal
          isOpen={isSpellModalOpen}
          onClose={() => { setEditingSpell(null); setIsNewSpell(false); }}
          spell={spellToEdit}
          onSave={handleSaveSpell}
          onDelete={handleDeleteSpell}
          customIcons={customIcons}
          onAddCustomIcon={handleAddCustomIcon}
          onDeleteCustomIcon={handleDeleteCustomIcon}
        />
      )}

      {viewingChestItem && (
        <ChestViewModal
          isOpen={!!viewingChestItem}
          onClose={() => setViewingChestId(null)}
          chestItem={viewingChestItem}
          onSlotClick={(index) => setEditingSlot({ container: 'chest', index, chestId: viewingChestItem.id })}
          draggedItemInfo={draggedItemInfo}
          onItemDragStart={(index) => setDraggedItemInfo({ container: 'chest', index, chestId: viewingChestItem.id })}
          onItemDrop={handleItemDrop}
          onItemDragEnd={handleDragEnd}
        />
      )}

      {overAttunedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
          <div className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-md border border-[var(--color-border)] text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--color-text-base)] mb-2">Превышен лимит настройки!</h3>
            <p className="text-sm text-[var(--color-text-medium)] mb-4">
              Максимальное количество настроенных предметов снизилось. Настройка с предмета <strong>{overAttunedItem.name}</strong> будет снята.
            </p>
            {overAttunedItem.imageUrl && (
              <div className="w-20 h-20 mx-auto mb-4 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] shadow-inner">
                <img src={overAttunedItem.imageUrl} alt={overAttunedItem.name} className="w-full h-full object-cover" />
              </div>
            )}
            <button
              onClick={handleConfirmOverAttunementRemoval}
              className="w-full justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-health)] text-base font-semibold text-white hover:bg-red-600 focus:outline-none transition-all duration-150 active:scale-95"
            >
              Хорошо (Снять настройку)
            </button>
          </div>
        </div>
      )}
    </>
  );
};
