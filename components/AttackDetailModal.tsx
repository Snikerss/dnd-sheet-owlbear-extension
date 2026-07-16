import React, { useState, useEffect } from 'react';
import { Attack, AttackType, DamageType, Ability } from '../types';
import { ATTACK_TYPE_NAMES, DAMAGE_TYPE_NAMES, ABILITY_NAMES } from '../constants';
import { CustomIconPicker } from './CustomIconPicker';
import { useFocusTrap } from '../utils/useFocusTrap';
import { generateUUID } from '../utils/uuid';

interface AttackDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (attack: Attack) => void;
  onDelete: (id: string) => void;
  attack: Attack | null;
  customIcons: string[];
  onAddCustomIcon: (iconDataUrl: string) => void;
  onDeleteCustomIcon: (iconDataUrl: string) => void;
}

const DEFAULT_ATTACK: Omit<Attack, 'id'> = {
  name: 'Новая атака',
  imageUrl: '',
  attackType: AttackType.Melee,
  rangeNormal: 5,
  rangeLong: null,
  hitAbility: Ability.STR,
  damageAbility: Ability.STR,
  isProficient: true,
  hitBonus: 0,
  damageDice: '1d8',
  damageBonus: 0,
  damageType: DamageType.Slashing,
  notes: '',
};

export const AttackDetailModal: React.FC<AttackDetailModalProps> = ({ 
    isOpen, 
    onClose, 
    onSave, 
    onDelete, 
    attack,
    customIcons,
    onAddCustomIcon,
    onDeleteCustomIcon
}) => {
  const [formData, setFormData] = useState<Omit<Attack, 'id'>>(() => attack || DEFAULT_ATTACK);
  const [showPicker, setShowPicker] = useState(false);
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setFormData(attack || DEFAULT_ATTACK);
      setShowPicker(false);
    }
  }, [attack, isOpen]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      const isNumeric = ['rangeNormal', 'rangeLong', 'hitBonus', 'damageBonus'].includes(name);
      let parsedValue: any = value;
      if (isNumeric) {
          parsedValue = value === '' ? null : parseInt(value, 10);
          if (Number.isNaN(parsedValue)) parsedValue = name === 'rangeLong' ? null : 0;
      }
      if (name === 'attackType') {
          const newType = parseInt(value) as AttackType;
          setFormData(prev => ({ 
              ...prev, 
              attackType: newType,
              rangeLong: (newType === AttackType.Melee || newType === AttackType.Spell) ? null : (prev.rangeLong ?? 60),
          }));
      } else {
          setFormData(prev => ({ ...prev, [name]: parsedValue }));
      }
    }
  };

  const handleSave = () => {
    if (!formData.name) return;
    const finalAttack: Attack = {
      id: attack?.id || generateUUID(),
      ...formData,
      rangeNormal: formData.rangeNormal || 0,
      hitBonus: formData.hitBonus || 0,
      damageBonus: formData.damageBonus || 0,
    };
    onSave(finalAttack);
  };

  const handleDelete = () => {
    if (attack) {
      onDelete(attack.id);
    }
  };
  
  const handleSelectIcon = (iconUrl: string) => {
    setFormData(prev => ({ ...prev, imageUrl: iconUrl }));
    setShowPicker(false);
  };

  const handleUploadIcon = (iconUrl: string) => {
    onAddCustomIcon(iconUrl);
    setFormData(prev => ({ ...prev, imageUrl: iconUrl }));
  };

  const handleDeleteIconFromLibrary = (iconUrl: string) => {
    onDeleteCustomIcon(iconUrl);
    if (formData.imageUrl === iconUrl) {
      setFormData(prev => ({ ...prev, imageUrl: '' }));
    }
  };
  
   const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attack-modal-title"
    >
      <div 
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-3xl border border-[var(--color-border)] animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="attack-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)] mb-4">{attack ? 'Редактировать атаку' : 'Новая атака'}</h2>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-3">
          {/* Name & Icon */}
          <div className="flex gap-4">
            <div className="flex-grow">
                <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text-medium)]">Название</label>
                <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" required />
            </div>
            <div className="flex-shrink-0">
                <label className="block text-sm font-medium text-[var(--color-text-medium)]">Иконка</label>
                <div className="mt-1 w-16 h-10 bg-[var(--color-surface-well)] rounded-lg flex items-center justify-center border border-[var(--color-border-subtle)] overflow-hidden shadow-inner">
                 {formData.imageUrl ? (
                  <img src={formData.imageUrl} alt="Иконка атаки" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-[var(--color-text-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                </div>
            </div>
          </div>

          {/* Type & Range */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="attackType" className="block text-sm font-medium text-[var(--color-text-medium)]">Тип атаки</label>
              <select name="attackType" id="attackType" value={formData.attackType} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                {Object.entries(ATTACK_TYPE_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rangeNormal" className="block text-sm font-medium text-[var(--color-text-medium)]">Дальность (фт.)</label>
              <input type="number" name="rangeNormal" id="rangeNormal" value={formData.rangeNormal ?? ''} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
            </div>
            <div>
              <label htmlFor="rangeLong" className="block text-sm font-medium text-[var(--color-text-medium)]">Дальняя (фт.)</label>
              <input type="number" name="rangeLong" id="rangeLong" value={formData.rangeLong ?? ''} onChange={handleInputChange} disabled={formData.attackType === AttackType.Melee || formData.attackType === AttackType.Spell} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] disabled:opacity-50" />
            </div>
          </div>

          {/* Hit Section */}
          <div className="border-t border-[var(--color-border)] pt-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-base)] mb-2">Попадание</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="hitAbility" className="block text-sm font-medium text-[var(--color-text-medium)]">Характеристика</label>
                <select name="hitAbility" id="hitAbility" value={formData.hitAbility} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                  {Object.entries(ABILITY_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center space-x-3 cursor-pointer h-[42px]">
                  <input type="checkbox" name="isProficient" checked={formData.isProficient} onChange={handleInputChange} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]" />
                  <span className="text-sm font-medium text-[var(--color-text-medium)]">Владение</span>
                </label>
              </div>
              <div>
                <label htmlFor="hitBonus" className="block text-sm font-medium text-[var(--color-text-medium)]">Бонус/Штраф</label>
                <input type="number" name="hitBonus" id="hitBonus" value={formData.hitBonus ?? ''} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
              </div>
            </div>
          </div>
          
          {/* Damage Section */}
          <div className="border-t border-[var(--color-border)] pt-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-base)] mb-2">Урон</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="damageDice" className="block text-sm font-medium text-[var(--color-text-medium)]">Кости урона</label>
                <input type="text" name="damageDice" id="damageDice" value={formData.damageDice} onChange={handleInputChange} placeholder="напр. 1d8 + 1d6" className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
              </div>
              <div>
                <label htmlFor="damageAbility" className="block text-sm font-medium text-[var(--color-text-medium)]">Характеристика</label>
                <select name="damageAbility" id="damageAbility" value={formData.damageAbility} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                  <option value="None">Нет</option>
                  {Object.entries(ABILITY_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </div>
               <div>
                <label htmlFor="damageBonus" className="block text-sm font-medium text-[var(--color-text-medium)]">Бонус/Штраф</label>
                <input type="number" name="damageBonus" id="damageBonus" value={formData.damageBonus ?? ''} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
              </div>
            </div>
            <div className="mt-4">
                <label htmlFor="damageType" className="block text-sm font-medium text-[var(--color-text-medium)]">Тип урона</label>
                <select name="damageType" id="damageType" value={formData.damageType} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                    {(Object.values(DamageType) as DamageType[]).map(type => <option key={type} value={type}>{DAMAGE_TYPE_NAMES[type]}</option>)}
                </select>
            </div>
          </div>

          {/* Icon Picker Section */}
           <div className="border-t border-[var(--color-border)] pt-4">
             <div className="flex flex-col gap-2">
                 <button
                    type="button"
                    onClick={() => setShowPicker(!showPicker)}
                    className="w-full sm:w-auto self-start rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-3 py-2 bg-[var(--color-surface-raised)] text-sm font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
                 >
                    {showPicker ? 'Скрыть библиотеку' : 'Выбрать иконку...'}
                 </button>
                 {formData.imageUrl && (
                    <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="w-full sm:w-auto self-start rounded-lg border border-transparent px-3 py-1 bg-transparent text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-health)] focus:outline-none"
                    >
                        Убрать иконку
                    </button>
                 )}
              </div>
             {showPicker && (
                <div className="mt-4">
                    <CustomIconPicker 
                        icons={customIcons}
                        onSelect={handleSelectIcon}
                        onUpload={handleUploadIcon}
                        onDelete={handleDeleteIconFromLibrary}
                    />
                </div>
            )}
           </div>

          {/* Notes */}
          <div className="border-t border-[var(--color-border)] pt-4">
            <label htmlFor="notes" className="block text-sm font-medium text-[var(--color-text-medium)]">Заметки</label>
            <textarea name="notes" id="notes" value={formData.notes} onChange={handleInputChange} rows={5} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] resize-none" />
          </div>
        </div>
        
        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">
          <button onClick={handleSave} className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary-active)] text-base font-medium text-white hover:bg-[var(--color-accent-primary-dark)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95">Сохранить</button>
          {attack && <button onClick={handleDelete} className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-[var(--color-surface-raised)] text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95">Удалить</button>}
          <button onClick={onClose} className="close-button w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0 sm:mr-auto transition-all duration-150 active:scale-95">Отмена</button>
        </div>
      </div>
    </div>
  );
};