import React, { useState, useEffect } from 'react';
import { Feature, RecoveryType, FeatureGroup } from '../types';
import { RECOVERY_TYPE_NAMES } from '../constants';
import { useFocusTrap } from '../utils/useFocusTrap';
import { generateUUID } from '../utils/uuid';

interface FeatureDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (feature: Feature, targetGroupId: string) => void;
  onDelete: (id: string) => void;
  feature: Feature | null;
  groups: FeatureGroup[];
  initialGroupId: string;
}

const DEFAULT_FEATURE: Omit<Feature, 'id'> = {
  name: 'Новое умение',
  description: '',
  totalUses: 1,
  currentUses: 1,
  recovery: RecoveryType.ShortRest,
};

export const FeatureDetailModal: React.FC<FeatureDetailModalProps> = ({ isOpen, onClose, onSave, onDelete, feature, groups, initialGroupId }) => {
  const [formData, setFormData] = useState<Omit<Feature, 'id'>>(() => feature || DEFAULT_FEATURE);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setFormData(feature || DEFAULT_FEATURE);
      setSelectedGroupId(initialGroupId);
    }
  }, [feature, isOpen, initialGroupId]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const parsedValue = name === 'totalUses' ? Math.max(0, parseInt(value, 10)) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: parsedValue }));
  };

  const handleSave = () => {
    if (!formData.name) return;
    const finalFeature: Feature = {
      id: feature?.id || generateUUID(),
      ...formData,
      currentUses: feature?.id ? Math.min(formData.totalUses, formData.currentUses) : formData.totalUses,
    };
    onSave(finalFeature, selectedGroupId);
  };

  const handleDelete = () => {
    if (feature) {
      onDelete(feature.id);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-modal-title"
    >
      <div 
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-3xl border border-[var(--color-border)] animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="feature-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)] mb-4">{feature ? 'Редактировать умение' : 'Новое умение'}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text-medium)]">Название</label>
              <input
                type="text"
                name="name"
                id="name"
                value={formData.name}
                onChange={handleInputChange}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                required
              />
            </div>
            <div>
              <label htmlFor="totalUses" className="block text-sm font-medium text-[var(--color-text-medium)]">Всего исп.</label>
              <input
                type="number"
                name="totalUses"
                id="totalUses"
                value={formData.totalUses}
                onChange={handleInputChange}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                min="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="recovery" className="block text-sm font-medium text-[var(--color-text-medium)]">Восстановление</label>
              <select
                name="recovery"
                id="recovery"
                value={formData.recovery}
                onChange={(e) => setFormData(prev => ({ ...prev, recovery: parseInt(e.target.value) as RecoveryType }))}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
              >
                {Object.entries(RECOVERY_TYPE_NAMES).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="group" className="block text-sm font-medium text-[var(--color-text-medium)]">Группа способностей</label>
              <select
                name="group"
                id="group"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text-medium)]">Описание</label>
            <textarea
              name="description"
              id="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={8}
              className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] resize-none"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary-active)] text-base font-medium text-white hover:bg-[var(--color-accent-primary-dark)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
          >
            Сохранить
          </button>
          {feature && (
            <button
              onClick={handleDelete}
              className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-[var(--color-surface-raised)] text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
            >
              Удалить
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0 sm:mr-auto transition-all duration-150 active:scale-95"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};