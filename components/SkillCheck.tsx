import React, { useMemo } from 'react';
import { Skill, ProficiencyLevel, RollType } from '../types';
import { EditableBonus } from './EditableBonus';
import { useCharacter } from '../context/CharacterContext';
import { calculateProficiencyBonus } from '../utils/characterCalculations';

interface SkillCheckProps {
  skill: Skill;
  abilityModifier: number;
  onProficiencyChange: (skillName: string) => void;
  onRoll: (name: string, modifier: number, rollType: RollType) => void;
  onRequestRoll: (e: React.MouseEvent, name: string, modifier: number) => void;
  skillBonus: number;
  itemSkillBonus?: number;
  onSkillBonusChange: (skillName: string, bonus: number) => void;
  level: number;
  proficiencyBonusBonus: number;
}

export const SkillCheck: React.FC<SkillCheckProps> = React.memo(({
  skill,
  abilityModifier,
  onProficiencyChange,
  onRoll,
  onRequestRoll,
  skillBonus,
  itemSkillBonus = 0,
  onSkillBonusChange,
  level,
  proficiencyBonusBonus,
}) => {
  const proficiencyBonus = useMemo(() => calculateProficiencyBonus(level) + proficiencyBonusBonus, [level, proficiencyBonusBonus]);

  let proficiencyContribution = 0;
  if (skill.proficiency === ProficiencyLevel.Proficient) {
    proficiencyContribution = proficiencyBonus;
  } else if (skill.proficiency === ProficiencyLevel.Expert) {
    proficiencyContribution = proficiencyBonus * 2;
  }

  const totalBonus = abilityModifier + proficiencyContribution + skillBonus + itemSkillBonus;
  const bonusString = totalBonus >= 0 ? `+${totalBonus}` : `${totalBonus}`;
  const rollName = `Проверка: ${skill.name}`;

  const getProficiencyIndicator = () => {
    switch (skill.proficiency) {
      case ProficiencyLevel.None:
        return <span className="w-5 h-5 rounded-full border-2 border-[var(--color-border)] flex-shrink-0 mr-3" data-tooltip="Нет владения" aria-hidden="true"></span>;
      case ProficiencyLevel.Proficient:
        return <span className="w-5 h-5 rounded-full bg-[var(--color-accent-primary)] border-2 border-[var(--color-accent-primary-hover)] flex-shrink-0 mr-3" data-tooltip="Владение" aria-hidden="true"></span>;
      case ProficiencyLevel.Expert:
        return (
          <div className="w-5 h-5 rounded-full border-2 border-[var(--color-accent-primary-hover)] flex-shrink-0 mr-3 relative flex items-center justify-center" data-tooltip="Экспертиза" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-[var(--color-accent-secondary)]"></span>
          </div>
        );
      default:
        return null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onProficiencyChange(skill.name);
      }
  };
  
  const proficiencyLabel = `Изменить владение навыком ${skill.name}. Текущий уровень: ${
    skill.proficiency === ProficiencyLevel.None ? 'Нет владения' : skill.proficiency === ProficiencyLevel.Proficient ? 'Владение' : 'Экспертиза'
  }`;

  return (
    <div className="flex items-center justify-between bg-[var(--color-surface-inset)] p-2 rounded-lg border border-transparent hover:border-[var(--color-border)] transition-colors group">
      <button 
        type="button"
        className="flex items-center cursor-pointer flex-grow min-w-0 text-left p-0 pl-3"
        onClick={() => onProficiencyChange(skill.name)}
        onKeyDown={handleKeyDown}
        aria-label={proficiencyLabel}
        data-tooltip={
          skill.proficiency === ProficiencyLevel.None 
            ? "Нет владения (нажмите для переключения)" 
            : skill.proficiency === ProficiencyLevel.Proficient 
              ? "Владение (нажмите для переключения)" 
              : "Экспертиза (нажмите для переключения)"
        }
      >
        {getProficiencyIndicator()}
        <span 
          className="text-sm font-semibold text-[var(--color-text-medium)] group-hover:text-[var(--color-text-base)] transition-colors truncate" 
          data-tooltip={`Формула проверки навыка: Модификатор Характеристики + Владение/Экспертиза + Бонус`} 
          aria-hidden="true"
        >
          {skill.name}
        </span>
      </button>
      <div className="flex items-center space-x-2">
        <EditableBonus
            value={skillBonus}
            onChange={(bonus) => onSkillBonusChange(skill.name, bonus)}
        />
        {itemSkillBonus !== 0 && (
            <span className="text-[10px] text-teal-400 font-semibold" data-tooltip="Бонус от экипированных предметов">
                {itemSkillBonus > 0 ? '+' : ''}{itemSkillBonus}
            </span>
        )}
        <button
            onClick={() => onRoll(rollName, totalBonus, RollType.Normal)}
            onContextMenu={(e) => onRequestRoll(e, rollName, totalBonus)}
            className="roll-button bg-[var(--color-surface-raised)] text-[var(--color-text-base)] font-bold w-12 text-center py-1 rounded-lg hover:bg-[var(--color-surface-raised-hover)] transition-all duration-150 shadow hover:shadow-md active:scale-95 flex-shrink-0"
            data-tooltip="ЛКМ: обычный бросок, ПКМ: опции"
            aria-label={`Бросок проверки навыка ${skill.name} с модификатором ${bonusString}`}
        >
            {bonusString}
        </button>
      </div>
    </div>
  );
});
