import React, { useMemo } from 'react';
import { Ability, RollType } from '../types';
import { EditableBonus } from './EditableBonus';
import { ABILITY_NAMES } from '../constants';
import { useCharacter } from '../context/CharacterContext';
import { calculateProficiencyBonus } from '../utils/characterCalculations';

interface SavingThrowCheckProps {
  ability: Ability;
  modifier: number;
  isProficient: boolean;
  onProficiencyToggle: (ability: Ability) => void;
  onRoll: (name: string, modifier: number, rollType: RollType) => void;
  onRequestRoll: (e: React.MouseEvent, name: string, modifier: number) => void;
  savingThrowBonus: number;
  itemSavingThrowBonus?: number;
  onSavingThrowBonusChange: (ability: Ability, bonus: number) => void;
  level: number;
  proficiencyBonusBonus: number;
}

export const SavingThrowCheck: React.FC<SavingThrowCheckProps> = React.memo(({
  ability,
  modifier,
  isProficient,
  onProficiencyToggle,
  onRoll,
  onRequestRoll,
  savingThrowBonus,
  itemSavingThrowBonus = 0,
  onSavingThrowBonusChange,
  level,
  proficiencyBonusBonus,
}) => {
  const proficiencyBonus = useMemo(() => calculateProficiencyBonus(level) + proficiencyBonusBonus, [level, proficiencyBonusBonus]);
  
  const totalBonus = modifier + (isProficient ? proficiencyBonus : 0) + savingThrowBonus + itemSavingThrowBonus;
  const bonusString = totalBonus >= 0 ? `+${totalBonus}` : `${totalBonus}`;
  const abilityName = ABILITY_NAMES[ability];
  const rollName = `Спасбросок: ${abilityName}`;

  return (
    <div className="flex items-center justify-between bg-[var(--color-surface-inset)] p-2 rounded-lg border border-transparent hover:border-[var(--color-border)] transition-colors group">
      <label 
        className="flex items-center cursor-pointer flex-grow min-w-0 pl-3"
        data-tooltip={isProficient ? "Есть владение спасброском (добавляет бонус мастерства)" : "Нет владения спасброском"}
      >
        <input
          type="checkbox"
          checked={isProficient}
          onChange={() => onProficiencyToggle(ability)}
          className="sr-only peer"
          aria-label={`Владение спасброском ${abilityName}`}
        />
        <span className="w-5 h-5 rounded-md border-2 border-[var(--color-border)] flex-shrink-0 flex items-center justify-center mr-3 transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--color-surface-inset)] peer-focus-visible:ring-[var(--color-focus-ring)] peer-checked:bg-[var(--color-accent-primary)] peer-checked:border-[var(--color-accent-primary-hover)]">
          <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <span 
          className="text-sm font-semibold text-[var(--color-text-medium)] group-hover:text-[var(--color-text-base)] transition-colors truncate"
          data-tooltip="Формула спасброска: Модификатор Характеристики + Мастерство (при владении) + Бонус"
        >
          Спасбросок
        </span>
      </label>
       <div className="flex items-center space-x-2">
        <EditableBonus
            value={savingThrowBonus}
            onChange={(bonus) => onSavingThrowBonusChange(ability, bonus)}
        />
        {itemSavingThrowBonus !== 0 && (
            <span className="text-[10px] text-teal-400 font-semibold" data-tooltip="Бонус от экипированных предметов">
                {itemSavingThrowBonus > 0 ? '+' : ''}{itemSavingThrowBonus}
            </span>
        )}
        <button
            onClick={() => onRoll(rollName, totalBonus, RollType.Normal)}
            onContextMenu={(e) => onRequestRoll(e, rollName, totalBonus)}
            className="roll-button bg-[var(--color-surface-raised)] text-[var(--color-text-base)] font-bold w-12 text-center py-1 rounded-lg hover:bg-[var(--color-surface-raised-hover)] transition-all duration-150 shadow hover:shadow-md active:scale-95 flex-shrink-0"
            data-tooltip="ЛКМ: обычный бросок, ПКМ: опции"
            aria-label={`Бросок спасброска ${abilityName} с модификатором ${bonusString}`}
        >
            {bonusString}
        </button>
      </div>
    </div>
  );
});
