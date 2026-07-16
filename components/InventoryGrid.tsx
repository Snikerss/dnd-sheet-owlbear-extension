import React, { useState } from 'react';
import type { InventoryItem, DropLocation } from '../types';
import { InventorySlot } from './InventorySlot';

interface InventoryGridProps {
  items: (InventoryItem | null)[];
  filteredItems: (InventoryItem | null)[];
  draggedItemInfo: DropLocation | null;
  container: { type: 'inventory' } | { type: 'chest', chestId: string };
  onSlotClick: (index: number, e: React.MouseEvent) => void;
  onItemDragStart: (index: number) => void;
  onItemDrop: (index: number) => void;
  onItemDragEnd: () => void;
  showDisabledSlots: boolean;
}

export const InventoryGrid: React.FC<InventoryGridProps> = ({
  items,
  filteredItems,
  draggedItemInfo,
  container,
  onSlotClick,
  onItemDragStart,
  onItemDrop,
  onItemDragEnd,
  showDisabledSlots,
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (index !== dragOverIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, destinationIndex: number) => {
    e.preventDefault();
    onItemDrop(destinationIndex);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    onItemDragEnd();
    setDragOverIndex(null);
  };
  
  const containerId = container.type === 'chest' ? container.chestId : 'inventory';

  return (
    <div className="grid grid-cols-10 gap-2" onDragLeave={handleDragLeave}>
      {items.map((originalItem, index) => {
        const item = filteredItems[index];

        if (showDisabledSlots && originalItem && !item) {
          // Render a disabled/empty slot if it doesn't match search
          return <div key={`${containerId}-disabled-${index}`} className="aspect-square w-full rounded-lg bg-[var(--color-surface-well)]/50 border border-dashed border-[var(--color-border)]/50" />;
        }

        if (!originalItem) {
          // Render a normal empty slot
          return (
            <InventorySlot
              key={`${containerId}-empty-${index}`}
              item={null}
              isDragOver={index === dragOverIndex}
              isBeingDragged={false}
              onClick={(e) => onSlotClick(index, e)}
              onDragStart={() => {}}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              index={index}
            />
          );
        }
        
        const isBeingDragged = draggedItemInfo?.container === container.type &&
                               (container.type === 'inventory' ? true : draggedItemInfo?.chestId === container.chestId) &&
                               draggedItemInfo?.index === index;

        return (
          <InventorySlot
            key={originalItem?.id || `${containerId}-item-${index}`}
            item={originalItem}
            isDragOver={index === dragOverIndex}
            isBeingDragged={isBeingDragged}
            onClick={(e) => onSlotClick(index, e)}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              onItemDragStart(index);
            }}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            index={index}
          />
        );
      })}
    </div>
  );
};