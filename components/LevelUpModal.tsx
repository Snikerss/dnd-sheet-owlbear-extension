import React from 'react';
import type { HitDie } from '../types';
import { useFocusTrap } from '../utils/useFocusTrap';

interface LevelUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (method: 'roll' | 'average') => void;
  hitDie: HitDie;
  conModifier: number;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ isOpen, onClose, onConfirm, hitDie, conModifier }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  
  if (!isOpen) return null;

  const averageHpGain = Math.floor(hitDie / 2) + 1;
  const conBonusString = conModifier >= 0 ? `+ ${conModifier}` : `− ${Math.abs(conModifier)}`;

  return (
    <div 
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="levelup-modal-title"
    >
      <div 
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-md border border-[var(--color-accent-secondary-border)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <h2 id="levelup-modal-title" className="text-3xl font-bold text-[var(--color-accent-secondary)] mb-4">Новый уровень!</h2>
          <p className="text-[var(--color-text-medium)] mb-6">Выберите, как увеличить максимальные очки здоровья.</p>

          <div className="space-y-4">
            <button
              onClick={() => onConfirm('roll')}
              className="w-full bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-base)] font-bold py-3 px-4 rounded-lg transition-all duration-150 text-left shadow-md hover:shadow-lg border border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Бросок на здоровье</span>
                <span className="font-mono bg-[var(--color-surface-well)] px-2 py-1 rounded-md text-sm">{`1d${hitDie} ${conBonusString}`}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 font-normal">Бросьте кость здоровья и добавьте модификатор Телосложения.</p>
            </button>
            
            <button
              onClick={() => onConfirm('average')}
              className="w-full bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-base)] font-bold py-3 px-4 rounded-lg transition-all duration-150 text-left shadow-md hover:shadow-lg border border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Взять среднее</span>
                <span className="font-mono bg-[var(--color-surface-well)] px-2 py-1 rounded-md text-sm">{`${averageHpGain} ${conBonusString}`}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 font-normal">Возьмите фиксированное среднее значение для вашей кости здоровья.</p>
            </button>
          </div>

          <button
            onClick={onClose}
            className="mt-8 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};