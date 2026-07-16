import React, { useState, useEffect } from 'react';

interface EditableBonusProps {
  value: number;
  onChange: (newValue: number) => void;
}

export const EditableBonus: React.FC<EditableBonusProps> = React.memo(({ value, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    if (!isEditing) {
      setCurrentValue(value);
    }
  }, [value, isEditing]);

  const handleBlur = () => {
    const newBonus = Number.isNaN(currentValue) ? 0 : currentValue || 0;
    if (newBonus !== value) {
      onChange(newBonus);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
      e.currentTarget.blur();
    }
  };

  if (isEditing) {
    return (
      <input
        type="number"
        value={currentValue}
        onChange={(e) => setCurrentValue(parseInt(e.target.value, 10))}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-16 h-8 bg-[var(--color-background)] border border-[var(--color-focus-ring)] rounded-xl py-0 px-1 text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
        autoFocus
        onFocus={(e) => e.target.select()}
        aria-label="Редактировать бонус"
      />
    );
  }

  const displayValue = value > 0 ? `+${value}` : value < 0 ? `${value}` : null;
  
  if (displayValue === null) {
     return (
        <button
            type="button"
            className="w-16 h-8 flex items-center justify-center text-[var(--color-text-subtle)] hover:text-[var(--color-accent-primary-light)] bg-[var(--color-surface-well)] border border-slate-700/50 hover:border-teal-500/30 rounded-xl cursor-pointer hover:bg-[var(--color-surface-raised)] transition-all duration-200 text-xs font-medium" 
            onClick={() => setIsEditing(true)}
            data-tooltip="Добавить бонус/штраф"
            aria-label="Добавить бонус или штраф"
        >
            +/-
        </button>
      );
  }

  return (
    <button
      type="button"
      className="w-16 h-8 flex items-center justify-center bg-[var(--color-surface-well)] border border-slate-700/50 hover:border-teal-500/30 rounded-xl cursor-pointer hover:bg-[var(--color-surface-raised)] transition-all duration-200 text-xs font-extrabold text-[var(--color-text-base)]"
      onClick={() => setIsEditing(true)}
      data-tooltip="Изменить бонус/штраф"
      aria-label={`Изменить бонус или штраф. Текущее значение: ${displayValue}`}
    >
      <span>{displayValue}</span>
    </button>
  );
});
