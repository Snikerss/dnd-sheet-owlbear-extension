import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ProficiencyLevel } from '../types';
import { calculateProficiencyBonus } from '../utils/characterCalculations';

interface SenseDisplayProps {
    label: string;
    skillModifier: number;
    bonus: number;
    itemBonus?: number;
    onBonusChange: (newBonus: number) => void;
}

const SenseDisplay: React.FC<SenseDisplayProps> = ({ label, skillModifier, bonus, itemBonus = 0, onBonusChange }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedBonus, setEditedBonus] = useState(bonus);
    const totalValue = 10 + skillModifier + bonus + itemBonus;

    useEffect(() => {
        if (!isEditing) setEditedBonus(bonus);
    }, [bonus, isEditing]);

    const handleSubmit = () => {
        const newBonus = isNaN(editedBonus) ? 0 : editedBonus;
        if (newBonus !== bonus) onBonusChange(newBonus);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') {
            setEditedBonus(bonus);
            setIsEditing(false);
            (e.target as HTMLInputElement).blur();
        }
    };

    const shortLabel = label.replace("Пассивное ", "");

    return (
        <div className="flex flex-col items-center justify-center bg-[var(--color-surface-inset)] p-2 rounded-lg text-center relative group min-h-[80px] border border-transparent hover:border-teal-500/50 transition-all duration-200">
            <div className="flex flex-col items-center w-full">
                <span className="text-[11px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold mt-1">{shortLabel}</span>
                <div 
                    className="text-2xl font-extrabold text-[var(--color-text-base)] mt-0.5 cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors"
                    onClick={() => !isEditing && setIsEditing(true)}
                    data-tooltip="Изменить бонус"
                >
                    {totalValue}
                </div>
            </div>
            
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center justify-center min-h-[14px] max-w-full font-medium">
                {isEditing ? (
                    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                         <span>10+{skillModifier}+</span>
                        <input
                            type="number"
                            value={editedBonus}
                            onChange={(e) => setEditedBonus(parseInt(e.target.value, 10))}
                            onBlur={handleSubmit}
                            onKeyDown={handleKeyDown}
                            className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                        />
                        {itemBonus !== 0 && <span className="text-xs text-teal-400">+{itemBonus}</span>}
                    </div>
                ) : (
                    <span data-tooltip="Формула: 10 + Модификатор Навыка + Бонус">
                        10+{skillModifier}
                        {bonus !== 0 && `${bonus > 0 ? '+' : ''}${bonus}`}
                        {itemBonus !== 0 && <span className="text-teal-400 font-semibold">+{itemBonus}</span>}
                    </span>
                )}
            </div>
        </div>
    );
};

export const PassiveSenses: React.FC<{
    skills: Record<string, any>;
    abilityBonuses: Record<string, number>;
    skillBonuses: Record<string, number>;
    level: number;
    passivePerceptionBonus: number;
    itemPassivePerceptionBonus?: number;
    passiveInvestigationBonus: number;
    itemPassiveInvestigationBonus?: number;
    passiveInsightBonus: number;
    itemPassiveInsightBonus?: number;
    proficiencyBonusBonus: number;
    scores: Record<string, number>;
    onPerceptionBonusChange: (bonus: number) => void;
    onInvestigationBonusChange: (bonus: number) => void;
    onInsightBonusChange: (bonus: number) => void;
    minimal?: boolean;
    flat?: boolean;
}> = React.memo(({
    skills,
    abilityBonuses,
    skillBonuses,
    level,
    passivePerceptionBonus,
    itemPassivePerceptionBonus = 0,
    passiveInvestigationBonus,
    itemPassiveInvestigationBonus = 0,
    passiveInsightBonus,
    itemPassiveInsightBonus = 0,
    proficiencyBonusBonus,
    scores,
    onPerceptionBonusChange,
    onInvestigationBonusChange,
    onInsightBonusChange,
    minimal = false,
    flat = false
}) => {
    const baseProficiencyBonus = useMemo(() => calculateProficiencyBonus(level), [level]);
    const proficiencyBonus = useMemo(() => baseProficiencyBonus + proficiencyBonusBonus, [baseProficiencyBonus, proficiencyBonusBonus]);

    const calculateSkillModifier = useCallback((skillName: string): number => {
        const skill = skills[skillName];
        if (!skill) return 0;
        
        const abilityScore = scores[skill.ability] ?? 10;
        const abilityMod = Math.floor((abilityScore - 10) / 2) + (abilityBonuses[skill.ability] ?? 0);
        
        let profContribution = 0;
        if (skill.proficiency === ProficiencyLevel.Proficient) profContribution = proficiencyBonus;
        else if (skill.proficiency === ProficiencyLevel.Expert) profContribution = proficiencyBonus * 2;
        
        const skillBonus = skillBonuses[skillName] || 0;
        
        return abilityMod + profContribution + skillBonus;
    }, [skills, scores, abilityBonuses, skillBonuses, proficiencyBonus]);

    const perceptionModifier = useMemo(() => calculateSkillModifier('Внимательность'), [calculateSkillModifier]);
    const investigationModifier = useMemo(() => calculateSkillModifier('Расследование'), [calculateSkillModifier]);
    const insightModifier = useMemo(() => calculateSkillModifier('Проницательность'), [calculateSkillModifier]);

    const content = (
        <div className="w-full">
            <h3 className="text-xs font-bold tracking-wide text-[var(--color-text-medium)] uppercase mb-2">Пассивные чувства</h3>
            <div className="grid grid-cols-3 gap-2.5">
                <SenseDisplay 
                    label="Пассивное Восприятие"
                    skillModifier={perceptionModifier}
                    bonus={passivePerceptionBonus}
                    itemBonus={itemPassivePerceptionBonus}
                    onBonusChange={onPerceptionBonusChange}
                />
                <SenseDisplay 
                    label="Пассивное Расследование"
                    skillModifier={investigationModifier}
                    bonus={passiveInvestigationBonus}
                    itemBonus={itemPassiveInvestigationBonus}
                    onBonusChange={onInvestigationBonusChange}
                />
                <SenseDisplay 
                    label="Пассивное Проницательность"
                    skillModifier={insightModifier}
                    bonus={passiveInsightBonus}
                    itemBonus={itemPassiveInsightBonus}
                    onBonusChange={onInsightBonusChange}
                />
            </div>
        </div>
    );

    if (flat) {
        return (
            <>
                <SenseDisplay 
                    label="Пассивное Восприятие"
                    skillModifier={perceptionModifier}
                    bonus={passivePerceptionBonus}
                    itemBonus={itemPassivePerceptionBonus}
                    onBonusChange={onPerceptionBonusChange}
                />
                <SenseDisplay 
                    label="Пассивное Расследование"
                    skillModifier={investigationModifier}
                    bonus={passiveInvestigationBonus}
                    itemBonus={itemPassiveInvestigationBonus}
                    onBonusChange={onInvestigationBonusChange}
                />
                <SenseDisplay 
                    label="Пассивное Проницательность"
                    skillModifier={insightModifier}
                    bonus={passiveInsightBonus}
                    itemBonus={itemPassiveInsightBonus}
                    onBonusChange={onInsightBonusChange}
                />
            </>
        );
    }

    if (minimal) {
        return content;
    }

    return (
        <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)]">
            {content}
        </div>
    );
});
