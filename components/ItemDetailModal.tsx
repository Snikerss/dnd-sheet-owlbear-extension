import React, { useState, useEffect } from 'react';
import { type Character, type InventoryItem } from '../types';
import { useNotifier } from '../context/NotificationContext';
import { useFocusTrap } from '../utils/useFocusTrap';
import {
  buildInitialFormData,
  createHandleInputChange
} from './item-detail/itemDetailShared';
import { GeminiPanel } from './item-detail/GeminiPanel';
import { ItemFormFields } from './item-detail/ItemFormFields';
import { ItemImageSection } from './item-detail/ItemImageSection';
import { ItemBonusesEditor } from './item-detail/ItemBonusesEditor';
import { ChargesEditor } from './item-detail/ChargesEditor';
import { ChestEditor } from './item-detail/ChestEditor';

interface ItemDetailModalProps {
  character: Character;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: InventoryItem | null) => void;
  onDelete: () => void;
  item: InventoryItem | null;
  customIcons: string[];
  onAddCustomIcon: (iconDataUrl: string) => void;
  onDeleteCustomIcon: (iconUrl: string) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
    character,
    isOpen,
    onClose,
    onSave,
    onDelete,
    item,
    customIcons,
    onAddCustomIcon,
    onDeleteCustomIcon
}) => {
  const [formData, setFormData] = useState(() => buildInitialFormData(item));
  const [customAlertMessage, setCustomAlertMessage] = useState<string | null>(null);
  const { addNotification } = useNotifier();
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialFormData(item));
      // Локальное состояние панелей (поиск/Gemini/изображения/иконок) сбрасывается
      // само: при закрытой модалке они размонтированы, а смена item даёт новый
      // React-key (см. resetKey ниже) — значения совпадают с прежними явными сбросами.
    }
  }, [item, isOpen]);

  const handleInputChange = createHandleInputChange({ item, addNotification, setFormData });

  if (!isOpen) return null;

  const handleSave = () => {
    if (!formData.name) {
        addNotification("Название предмета не может быть пустым.", 'error');
        return;
    }
    const finalItem: InventoryItem = {
        id: item?.id || '',
        ...formData
    };

    if (finalItem.isChest && (!finalItem.chestInventory || finalItem.chestInventory.length === 0)) {
        finalItem.chestInventory = Array(50).fill(null);
    } else if (!finalItem.isChest) {
        delete finalItem.chestInventory;
    }

    if (!finalItem.hasCharges) {
        delete finalItem.totalCharges;
        delete finalItem.currentCharges;
        delete finalItem.chargeRecovery;
    }


    onSave(finalItem);
  };

  const handleDeleteItem = () => {
      if (item?.isChest && item.chestInventory?.some(i => i !== null)) {
        addNotification("Нельзя удалить сундук, в котором есть предметы.", 'error');
        return;
      }
      onDelete();
  };

  // Смена редактируемого предмета пересоздаёт панели с локальным состоянием,
  // повторяя поведение прежнего useEffect-сброса.
  const resetKey = `${isOpen ? 'open' : 'closed'}-${item?.id ?? 'new'}`;

  return (
    <div
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-xs flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-4xl border border-[var(--color-border)] animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="item-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)] mb-4">{item ? 'Редактировать предмет' : 'Новый предмет'}</h2>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
          {/* D&D 5e API & AI Search Section */}
          <GeminiPanel
            key={`gemini-${resetKey}`}
            baseItem={item}
            updateFormData={setFormData}
          />
          <ItemFormFields
            name={formData.name}
            quantity={formData.quantity}
            weight={formData.weight}
            cost={formData.cost}
            rarity={formData.rarity}
            description={formData.description}
            isChest={formData.isChest}
            onInputChange={handleInputChange}
            onChange={setFormData}
          />
          <ItemImageSection
            key={`image-${resetKey}`}
            imageUrl={formData.imageUrl}
            itemName={formData.name}
            customIcons={customIcons}
            onAddCustomIcon={onAddCustomIcon}
            onDeleteCustomIcon={onDeleteCustomIcon}
            onChange={setFormData}
          />

          <ItemBonusesEditor
            character={character}
            itemId={item?.id}
            isEquipped={formData.isEquipped}
            requiresAttunement={formData.requiresAttunement}
            isAttuned={formData.isAttuned}
            bonuses={formData.bonuses}
            onChange={setFormData}
            onCustomAlert={setCustomAlertMessage}
          />
          <ChargesEditor
            hasCharges={formData.hasCharges}
            totalCharges={formData.totalCharges}
            currentCharges={formData.currentCharges}
            chargeRecovery={formData.chargeRecovery}
            onInputChange={handleInputChange}
            onChange={setFormData}
          />
          <ChestEditor
            isChest={formData.isChest}
            isConsumable={formData.isConsumable}
            onInputChange={handleInputChange}
          />
        </div>
        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary-active)] text-base font-medium text-white hover:bg-[var(--color-accent-primary-dark)] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
          >
            Сохранить
          </button>
          {item && (
            <button
                onClick={handleDeleteItem}
                className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-xs px-4 py-2 bg-[var(--color-surface-raised)] text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
            >
                Удалить предмет
            </button>
          )}
          <button
            onClick={onClose}
            className="close-button w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-xs px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0 sm:mr-auto transition-all duration-150 active:scale-95"
          >
            Отмена
          </button>
        </div>
      </div>
      {customAlertMessage && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200] animate-fade-in">
              <div className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-sm border border-[var(--color-border)] text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--color-text-base)] mb-2">Внимание</h3>
                  <p className="text-sm text-[var(--color-text-medium)] mb-5">
                      {customAlertMessage}
                  </p>
                  <button
                      onClick={() => setCustomAlertMessage(null)}
                      className="w-full justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary)] text-base font-semibold text-white hover:bg-[var(--color-accent-primary-hover)] focus:outline-hidden transition-all duration-150 active:scale-95"
                  >
                      Понятно
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};
