import React, { useState, useEffect } from 'react';
import type { HitDie } from '../types';
import { useFocusTrap } from '../utils/useFocusTrap';

interface ShortRestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (diceToSpend: number) => void;
  maxDice: number;
  hitDie: HitDie;
  conModifier: number;
}

export const ShortRestModal: React.FC<ShortRestModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    maxDice, 
    hitDie, 
    conModifier 
}) => {
  const [diceToSpend, setDiceToSpend] = useState(0);
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setDiceToSpend(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(diceToSpend);
  };

  const conBonusString = conModifier >= 0 ? `+ ${conModifier * diceToSpend}` : `− ${Math.abs(conModifier * diceToSpend)}`;
  
  const getDiceWord = (count: number): string => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
        return 'кость';
    }
    if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
        return 'кости';
    }
    return 'костей';
  };
  
  const buttonText = diceToSpend > 0 ? `Потратить ${diceToSpend} ${getDiceWord(diceToSpend)}` : 'Завершить отдых';

  return (
    <div 
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortrest-modal-title"
    >
      <div 
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-md border border-[var(--color-border)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <h2 id="shortrest-modal-title" className="text-3xl font-bold text-[var(--color-accent-primary)] mb-4">Короткий отдых</h2>
          <p className="text-[var(--color-text-medium)] mb-6">
            Потратьте Кости Здоровья, чтобы восстановить очки здоровья.
            Доступно: <span className="font-bold text-[var(--color-text-base)]">{maxDice}</span>.
          </p>
          
          {maxDice > 0 ? (
            <div className="space-y-4">
                <div>
                    <label htmlFor="dice-slider" className="block text-sm font-medium text-[var(--color-text-medium)] mb-2">
                        Костей здоровья для траты: <span className="font-bold text-lg text-[var(--color-text-base)]">{diceToSpend}</span>
                    </label>
                    <input
                        id="dice-slider"
                        type="range"
                        min="0"
                        max={maxDice}
                        value={diceToSpend}
                        onChange={(e) => setDiceToSpend(parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-[var(--color-surface-raised)] rounded-lg appearance-none cursor-pointer accent-[var(--color-accent-primary-hover)]"
                    />
                </div>
                <div className="text-center bg-[var(--color-surface-well)] p-3 rounded-lg">
                    <p className="text-[var(--color-text-medium)]">Восстановить здоровье на:</p>
                    <p className="font-mono text-xl font-bold text-[var(--color-text-base)]">{diceToSpend > 0 ? `${diceToSpend}d${hitDie} ${conBonusString}` : '0'}</p>
                </div>
            </div>
          ) : (
            <p className="text-[var(--color-accent-secondary)] font-semibold">У вас не осталось Костей Здоровья.</p>
          )}

          <div className="mt-8 flex flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={handleConfirm}
              className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary-active)] text-base font-medium text-white hover:bg-[var(--color-accent-primary-dark)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
            >
              {buttonText}
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0 sm:mr-auto transition-all duration-150 active:scale-95"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};