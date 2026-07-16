import React, { useMemo } from 'react';
import type { DropLocation, InventoryItem } from '../types';
import { InventoryGrid } from './InventoryGrid';
import { calculateItemWeight } from '../utils/inventory';
import { useFocusTrap } from '../utils/useFocusTrap';

interface ChestViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  chestItem: InventoryItem;
  onSlotClick: (index: number, e: React.MouseEvent) => void;
  draggedItemInfo: DropLocation | null;
  onItemDragStart: (index: number) => void;
  onItemDrop: (destination: DropLocation) => void;
  onItemDragEnd: () => void;
}

export const ChestViewModal: React.FC<ChestViewModalProps> = ({
  isOpen,
  onClose,
  chestItem,
  onSlotClick,
  draggedItemInfo,
  onItemDragStart,
  onItemDrop,
  onItemDragEnd,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  const chestInventory = chestItem.chestInventory || [];

  const totalContentWeight = useMemo(() => {
    return chestInventory.reduce((sum, item) => sum + calculateItemWeight(item), 0);
  }, [chestInventory]);

  if (!isOpen || !chestItem.isChest) return null;

  return (
    <div
      // The backdrop is now always transparent to mouse events to allow interaction with the inventory behind it.
      // The onClick to close the modal is removed as a trade-off. Use the 'X' button instead.
      className="fixed inset-0 bg-[var(--color-surface-translucent)] flex items-center justify-center z-40 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chest-modal-title"
    >
      <div
        ref={modalRef}
        // The modal content itself remains interactive.
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-4 sm:p-6 m-4 w-full max-w-3xl border border-[var(--color-border)] animate-fade-in pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-baseline gap-3">
                <h2 id="chest-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)]">{chestItem.name}</h2>
                <span className="text-sm font-semibold text-[var(--color-text-muted)]">{totalContentWeight.toFixed(2)} фнт.</span>
            </div>
            <button 
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] hover:text-[var(--color-text-base)] transition-colors"
                aria-label="Закрыть"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto pr-2">
            <InventoryGrid
                items={chestInventory}
                filteredItems={chestInventory} // No filtering inside chest view
                onSlotClick={onSlotClick}
                draggedItemInfo={draggedItemInfo}
                onItemDragStart={onItemDragStart}
                onItemDrop={(index) => onItemDrop({ container: 'chest', index, chestId: chestItem.id })}
                onItemDragEnd={onItemDragEnd}
                container={{ type: 'chest', chestId: chestItem.id }}
                showDisabledSlots={false}
            />
        </div>

      </div>
    </div>
  );
};
