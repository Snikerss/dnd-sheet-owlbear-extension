import React, { useState, useRef, useCallback, useMemo } from 'react';
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

// Стабильная пустая функция для пропсов пустых слотов (не создаёт новую
// ссылку на каждый рендер — иначе React.memo на InventorySlot бесполезен).
const noop = () => {};

interface SlotHandlers {
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
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

  // Родители отдают свежие замыкания (inline-стрелки) на каждый рендер.
  // Храним последние версии в ref и вызываем через него: пер-слотовые
  // бандлы ниже остаются ссылочно стабильными между рендерами.
  const callbacksRef = useRef({ onSlotClick, onItemDragStart, onItemDrop, onItemDragEnd });
  callbacksRef.current = { onSlotClick, onItemDragStart, onItemDrop, onItemDragEnd };

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleSlotDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    setDragOverIndex(prev => (prev === index ? prev : index));
  }, []);

  const handleSlotDrop = useCallback((e: React.DragEvent<HTMLDivElement>, destinationIndex: number) => {
    e.preventDefault();
    callbacksRef.current.onItemDrop(destinationIndex);
    setDragOverIndex(null);
  }, []);

  const handleSlotDragEnd = useCallback(() => {
    callbacksRef.current.onItemDragEnd();
    setDragOverIndex(null);
  }, []);

  // Один стабильный набор хендлеров на индекс: пересоздаётся только когда
  // реально меняется массив предметов (не при каждом рендере таблицы).
  const slotHandlers = useMemo<SlotHandlers[]>(() => (
    items.map((_, index) => ({
      onClick: (e: React.MouseEvent) => callbacksRef.current.onSlotClick(index, e),
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.effectAllowed = 'move';
        callbacksRef.current.onItemDragStart(index);
      },
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleSlotDragOver(e, index),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleSlotDrop(e, index),
      onDragEnd: () => handleSlotDragEnd(),
    }))
  ), [items, handleSlotDragOver, handleSlotDrop, handleSlotDragEnd]);

  const containerId = container.type === 'chest' ? container.chestId : 'inventory';

  return (
    <div className="grid grid-cols-10 gap-2" onDragLeave={handleDragLeave}>
      {items.map((originalItem, index) => {
        const item = filteredItems[index];
        const handlers = slotHandlers[index] as SlotHandlers | undefined;

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
              onClick={handlers?.onClick ?? noop}
              onDragStart={noop}
              onDragOver={handlers?.onDragOver ?? noop}
              onDrop={handlers?.onDrop ?? noop}
              onDragEnd={handlers?.onDragEnd ?? noop}
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
            onClick={handlers?.onClick ?? noop}
            onDragStart={handlers?.onDragStart ?? noop}
            onDragOver={handlers?.onDragOver ?? noop}
            onDrop={handlers?.onDrop ?? noop}
            onDragEnd={handlers?.onDragEnd ?? noop}
            index={index}
          />
        );
      })}
    </div>
  );
};
