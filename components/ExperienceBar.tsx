import React, { useState } from 'react';
import { useCharacter } from '../context/CharacterContext';
import { XP_THRESHOLDS } from '../constants';

export const ExperienceBar: React.FC<{
  experience: number;
  level: number;
  onAddXp: (amount: number) => void;
  minimal?: boolean;
}> = React.memo(({ experience, level, onAddXp, minimal = false }) => {
  const [amount, setAmount] = useState(10);
  
  const xpToNextLevel = XP_THRESHOLDS[level] ?? XP_THRESHOLDS[XP_THRESHOLDS.length - 1] ?? 0;
  const percentage = xpToNextLevel > 0 && experience > 0 ? (experience / xpToNextLevel) * 100 : 0;

  const handleAddXp = () => {
    onAddXp(amount);
  };
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setAmount(isNaN(value) || value < 0 ? 0 : value);
  };

  const content = (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-baseline mb-0.5">
        <span className="text-xs text-[var(--color-text-medium)] tracking-wider uppercase font-semibold">Опыт</span>
        <span className="font-bold text-sm" data-tooltip="Текущий опыт / опыт для следующего уровня">{`${experience} / ${xpToNextLevel}`}</span>
      </div>
      <div className="w-full bg-[var(--color-surface-well)] rounded-full h-3 border border-[var(--color-border)] overflow-hidden shadow-inner cursor-help" data-tooltip="Прогресс уровня">
        <div 
          className="bg-[var(--color-xp)] h-full rounded-full transition-all duration-500" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
       <div className="flex items-center space-x-2">
        <input 
          type="number"
          value={amount}
          onChange={handleAmountChange}
          className="w-14 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-1.5 text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
          min="0"
          data-tooltip="Сумма получаемого опыта"
        />
        <button onClick={handleAddXp} className="flex-1 bg-[var(--color-accent-primary-active)] hover:bg-[var(--color-accent-primary-dark)] text-white font-bold py-1 px-3 rounded-lg transition-all duration-150 shadow hover:shadow-md active:scale-95 text-xs" data-tooltip="Добавить указанный опыт персонажу">Добавить опыт</button>
      </div>
    </div>
  );

  if (minimal) {
    return content;
  }

  return (
    <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] space-y-3">
      {content}
    </div>
  );
});
