import React from 'react';
import { Ability, RollType, Skill } from '../../types';
import { ABILITY_NAMES } from '../../constants';
import { useCharacter } from '../../context/CharacterContext';
import { getEquippedItemBonuses } from '../../utils/inventory';
import { SkillCheck } from '../SkillCheck';
import { SavingThrowCheck } from '../SavingThrowCheck';
import { EditableBonus } from '../EditableBonus';

type EquippedBonuses = ReturnType<typeof getEquippedItemBonuses>;

interface StatsGridProps {
    effectiveAbilityScores: Record<Ability, number>;
    abilityModifiers: Record<Ability, number>;
    equippedBonuses: EquippedBonuses;
    onRoll: (name: string, modifier: number, rollType: RollType, bonusDiceFormula?: string) => void;
    onRequestRoll: (e: React.MouseEvent, name: string, modifier: number, bonusDiceFormula?: string) => void;
    isReadOnly: boolean;
}

export const StatsGrid: React.FC<StatsGridProps> = React.memo(({
    effectiveAbilityScores,
    abilityModifiers,
    equippedBonuses,
    onRoll,
    onRequestRoll,
    isReadOnly,
}) => {
    const { character, dispatch } = useCharacter();

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 animate-fade-in">
            {(Object.values(Ability) as Ability[]).map(ability => {
                const skillsForAbility = (Object.values(character.skills || {}) as Skill[])
                    .filter(skill => skill && skill.ability === ability)
                    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

                const abilityName = ABILITY_NAMES[ability];
                const baseScore = character.scores[ability];
                const effectiveScore = effectiveAbilityScores[ability];

                return (
                    <div key={ability} className="bg-[var(--color-surface-opaque)] p-4 rounded-2xl shadow-md border border-transparent transition-all duration-200 hover:shadow-xl hover:border-teal-500/50">
                        {/* Ability roll header */}
                        <div 
                            className="flex items-center justify-between cursor-pointer group w-full mb-2"
                            onClick={() => onRoll(`Проверка: ${abilityName}`, abilityModifiers[ability], RollType.Normal)}
                            onContextMenu={(e) => onRequestRoll(e, `Проверка: ${abilityName}`, abilityModifiers[ability])}
                            data-tooltip={`ЛКМ: обычный бросок\nПКМ: с преимуществом/помехой`}
                        >
                            <span className="text-sm font-bold uppercase tracking-wider text-[var(--color-accent-primary)] group-hover:text-[var(--color-accent-primary-light)] transition-colors">{abilityName}</span>
                            <span className="text-lg font-extrabold text-[var(--color-text-base)] bg-[var(--color-surface-well)] px-2 py-0.5 rounded-lg border border-slate-700/50 group-hover:border-teal-500/50 transition-colors">{abilityModifiers[ability] >= 0 ? `+${abilityModifiers[ability]}` : `${abilityModifiers[ability]}`}</span>
                        </div>
                        
                        {/* Ability score and bonus editors */}
                        <div className="flex items-center justify-between bg-[var(--color-surface-well)]/40 p-2 rounded-2xl border border-slate-700/30 mb-3 text-xs w-full">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Знач:</span>
                                <div className="flex items-center bg-[var(--color-surface-well)] p-1 rounded-xl border border-slate-700/50 gap-1.5 h-8">
                                    <button 
                                        onClick={() => !isReadOnly && dispatch({ type: 'SET_SCORE', payload: { ability, score: character.scores[ability] - 1 } })}
                                        disabled={isReadOnly}
                                        className="bg-[var(--color-surface-raised)] hover:bg-[var(--color-accent-primary)]/20 hover:text-[var(--color-accent-primary-light)] w-6 h-6 rounded-lg text-sm font-bold flex items-center justify-center transition-all duration-150 active:scale-90 border border-slate-700/30 hover:border-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                        aria-label={`Уменьшить ${abilityName}`}
                                        data-tooltip={isReadOnly ? "Только чтение" : "Уменьшить характеристику"}
                                    >
                                        -
                                    </button>
                                    <span 
                                        className={`text-sm w-7 text-center font-extrabold ${effectiveScore !== baseScore ? 'text-teal-300' : 'text-[var(--color-text-base)]'}`} 
                                        data-tooltip={effectiveScore !== baseScore ? `Базовое значение: ${baseScore}\nС бонусами от экипированных предметов: ${effectiveScore}` : "Значение характеристики"}
                                    >
                                        {effectiveScore}
                                    </span>
                                    <button 
                                        onClick={() => !isReadOnly && dispatch({ type: 'SET_SCORE', payload: { ability, score: character.scores[ability] + 1 } })}
                                        disabled={isReadOnly}
                                        className="bg-[var(--color-surface-raised)] hover:bg-[var(--color-accent-primary)]/20 hover:text-[var(--color-accent-primary-light)] w-6 h-6 rounded-lg text-sm font-bold flex items-center justify-center transition-all duration-150 active:scale-90 border border-slate-700/30 hover:border-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                        aria-label={`Увеличить ${abilityName}`}
                                        data-tooltip={isReadOnly ? "Только чтение" : "Увеличить характеристику"}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Бонус:</span>
                                <EditableBonus
                                    value={character.abilityBonuses[ability] || 0}
                                    onChange={(bonus) => dispatch({ type: 'SET_ABILITY_BONUS', payload: { ability, bonus }})}
                                    isReadOnly={isReadOnly}
                                />
                            </div>
                        </div>

                        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                            <SavingThrowCheck
                                ability={ability}
                                modifier={abilityModifiers[ability]}
                                isProficient={character.savingThrowProficiencies[ability]}
                                onProficiencyToggle={() => dispatch({ type: 'SET_SAVING_THROW_PROF', payload: ability })}
                                onRoll={onRoll}
                                onRequestRoll={onRequestRoll}
                                savingThrowBonus={character.savingThrowBonuses[ability] || 0}
                                itemSavingThrowBonus={equippedBonuses.savingThrows?.[ability] || 0}
                                onSavingThrowBonusChange={(_, bonus) => dispatch({ type: 'SET_SAVING_THROW_BONUS', payload: { ability, bonus }})}
                                level={character.level}
                                proficiencyBonusBonus={character.proficiencyBonusBonus}
                                isReadOnly={isReadOnly}
                            />
                            {skillsForAbility.map(skill => (
                                <SkillCheck 
                                    key={skill.name}
                                    skill={skill}
                                    abilityModifier={abilityModifiers[skill.ability]}
                                    onProficiencyChange={(name) => dispatch({ type: 'SET_PROFICIENCY', payload: name })}
                                    onRoll={onRoll}
                                    onRequestRoll={onRequestRoll}
                                    skillBonus={character.skillBonuses[skill.name] || 0}
                                    itemSkillBonus={equippedBonuses.skills[skill.name] || 0}
                                    onSkillBonusChange={(name, bonus) => dispatch({ type: 'SET_SKILL_BONUS', payload: { skillName: name, bonus }})}
                                    level={character.level}
                                    proficiencyBonusBonus={character.proficiencyBonusBonus}
                                    isReadOnly={isReadOnly}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

StatsGrid.displayName = 'StatsGrid';
