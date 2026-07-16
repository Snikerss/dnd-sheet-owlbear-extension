import React, { useMemo, useCallback } from 'react';
import { Attack, Ability, AttackType, RollType, DamageType } from '../types';
import { ATTACK_TYPE_NAMES, DAMAGE_TYPE_COLORS, DAMAGE_TYPE_NAMES } from '../constants';
import { useCharacter } from '../context/CharacterContext';
import { calculateModifier, calculateProficiencyBonus } from '../utils/characterCalculations';
import { getEquippedItemBonuses } from '../utils/inventory';

interface AttacksSectionProps {
  onAddAttack: () => void;
  onEditAttack: (attack: Attack) => void;
  onRollHit: (name: string, modifier: number, rollType: RollType, bonusDiceFormula?: string) => void;
  onRequestRollHit: (e: React.MouseEvent, name: string, modifier: number, bonusDiceFormula?: string) => void;
  onRollDamage: (name: string, damageFormula: string) => void;
}

interface AttackCardProps { 
    attack: Attack;
    abilityModifiers: Record<Ability, number>;
    proficiencyBonus: number;
    equippedHitBonus?: number;
    onEdit: () => void; 
    onRollHit: (name: string, modifier: number, rollType: RollType, bonusDiceFormula?: string) => void;
    onRequestRollHit: (e: React.MouseEvent, name: string, modifier: number, bonusDiceFormula?: string) => void;
    onRollDamage: (name: string, damageString: string) => void;
    globalAttackDiceBonusToHitDice: string;
    globalAttackDiceBonusToDamageDice: string;
}

const AttackCard: React.FC<AttackCardProps> = ({ 
    attack, 
    abilityModifiers, 
    proficiencyBonus, 
    equippedHitBonus,
    onEdit, 
    onRollHit, 
    onRequestRollHit, 
    onRollDamage, 
    globalAttackDiceBonusToHitDice, 
    globalAttackDiceBonusToDamageDice 
}) => {
    
    const { toHitBonus, fullToHitString, fullDamageString } = useMemo(() => {
        const hitModifier = abilityModifiers[attack.hitAbility] || 0;
        const toHitBonusValue = hitModifier + (attack.isProficient ? proficiencyBonus : 0) + attack.hitBonus + (equippedHitBonus || 0);
        
        const damageModifier = attack.damageAbility === 'None' ? 0 : (abilityModifiers[attack.damageAbility] || 0);
        const totalDamageBonus = damageModifier + attack.damageBonus;
        
        const toHitBonusString = toHitBonusValue >= 0 ? `+${toHitBonusValue}` : `${toHitBonusValue}`;
        const finalFullToHitString = (globalAttackDiceBonusToHitDice)
            ? `${toHitBonusString} + ${globalAttackDiceBonusToHitDice}`
            : toHitBonusString;
        
        const damageBonusString = totalDamageBonus > 0 
            ? ` + ${totalDamageBonus}` 
            : totalDamageBonus < 0 
            ? ` - ${Math.abs(totalDamageBonus)}` 
            : '';
        let finalFullDamageString = `${attack.damageDice}${damageBonusString}`;
        if (globalAttackDiceBonusToDamageDice) {
            finalFullDamageString += ` + ${globalAttackDiceBonusToDamageDice}`;
        }
        
        return { 
            toHitBonus: toHitBonusValue, 
            fullToHitString: finalFullToHitString, 
            fullDamageString: finalFullDamageString, 
        };
    }, [attack, abilityModifiers, proficiencyBonus, equippedHitBonus, globalAttackDiceBonusToHitDice, globalAttackDiceBonusToDamageDice]);

    const rangeString = attack.attackType === AttackType.Ranged 
        ? `${attack.rangeNormal}/${attack.rangeLong} фт.`
        : `${attack.rangeNormal} фт.`;

    const attackTypeStyles: Record<AttackType, string> = {
        [AttackType.Melee]: 'border-l-[var(--color-accent-secondary)]',
        [AttackType.Ranged]: 'border-l-[var(--color-success)]',
        [AttackType.Spell]: 'border-l-[var(--color-accent-tertiary)]'
    };
    
    const damageTypeClasses = DAMAGE_TYPE_COLORS[attack.damageType] || DAMAGE_TYPE_COLORS[DamageType.Slashing];

    return (
        <div className={`bg-[var(--color-surface-inset)] p-4 rounded-lg flex flex-col h-full border-l-4 transition-shadow hover:shadow-lg ${attackTypeStyles[attack.attackType]}`}>
            <div className="flex justify-between items-start mb-2">
                 <div className="flex items-center gap-3">
                    {attack.imageUrl && (
                        <div className="w-10 h-10 bg-black/20 rounded-md flex-shrink-0 overflow-hidden shadow-inner">
                            <img src={attack.imageUrl} alt={attack.name} className="w-full h-full object-cover" />
                        </div>
                    )}
                    <h3 className="font-bold text-lg text-[var(--color-text-base)] break-words">{attack.name}</h3>
                </div>
                <button onClick={onEdit} className="p-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors flex-shrink-0" data-tooltip="Редактировать" aria-label={`Редактировать атаку ${attack.name}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                </button>
            </div>
            
            <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)] mb-3">
                <span className="font-semibold">{ATTACK_TYPE_NAMES[attack.attackType]}</span>
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${damageTypeClasses}`}>{DAMAGE_TYPE_NAMES[attack.damageType]}</span>
                    <span>{rangeString}</span>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 my-2">
                <button 
                    onClick={() => onRollHit(`Атака: ${attack.name}`, toHitBonus, RollType.Normal, globalAttackDiceBonusToHitDice)} 
                    onContextMenu={(e) => onRequestRollHit(e, `Атака: ${attack.name}`, toHitBonus, globalAttackDiceBonusToHitDice)}
                    className="roll-button flex-1 bg-[var(--color-accent-primary-darker-translucent)] hover:bg-[var(--color-accent-primary-darker)] border border-[var(--color-accent-primary-darker)] text-[var(--color-accent-primary-light)] font-bold py-2 px-3 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 text-center"
                    data-tooltip="ЛКМ: обычный бросок, ПКМ: опции"
                    aria-label={`Бросок на попадание для атаки ${attack.name}`}
                >
                    Попадание: <span className="text-lg">{fullToHitString}</span>
                </button>
                <button 
                    onClick={() => onRollDamage(attack.name, fullDamageString)} 
                    className="roll-button flex-1 bg-[var(--color-accent-tertiary-dark)]/40 hover:bg-[var(--color-accent-tertiary-dark)]/60 border border-[var(--color-accent-tertiary-dark)] text-[#e57dab] font-bold py-2 px-3 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 text-center"
                    aria-label={`Бросок урона для атаки ${attack.name}`}
                >
                    Урон: <span className="text-base">{fullDamageString}</span>
                </button>
            </div>

            {attack.notes && (
                <p className="text-xs text-[var(--color-text-muted)] mt-auto pt-2 border-t border-[var(--color-border)] whitespace-pre-wrap break-words">{attack.notes}</p>
            )}
        </div>
    );
};

export const AttacksSection: React.FC<AttacksSectionProps> = React.memo(({ 
    onAddAttack, 
    onEditAttack, 
    onRollHit,
    onRequestRollHit,
    onRollDamage,
}) => {
  const { character, dispatch } = useCharacter();
  const { attacks, scores, abilityBonuses, level, proficiencyBonusBonus, globalAttackDiceBonusToHitDice, globalAttackDiceBonusToDamageDice } = character;
  
  const equippedBonuses = useMemo(() => getEquippedItemBonuses(character), [character]);

  const effectiveAbilityScores = useMemo(() => {
    return (Object.values(Ability) as Ability[]).reduce((acc, ability) => {
        acc[ability] = scores[ability] + (equippedBonuses.abilityScores[ability] || 0);
        return acc;
    }, {} as Record<Ability, number>)
  }, [scores, equippedBonuses]);

  const abilityModifiers = useMemo(() => {
    return (Object.values(Ability) as Ability[]).reduce((acc, ability) => {
        acc[ability] = calculateModifier(effectiveAbilityScores[ability]) + (abilityBonuses[ability] || 0);
        return acc;
    }, {} as Record<Ability, number>)
  }, [effectiveAbilityScores, abilityBonuses]);

  const proficiencyBonus = useMemo(() => calculateProficiencyBonus(level) + proficiencyBonusBonus, [level, proficiencyBonusBonus]);

  const onGlobalDiceBonusChange = useCallback((toHitDice: string, toDamageDice: string) => {
    dispatch({ type: 'SET_GLOBAL_DICE_BONUS', payload: { toHitDice, toDamageDice } });
  }, [dispatch]);

  return (
    <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)]">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/40 flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-xl font-semibold tracking-wide text-[var(--color-text-base)]">Атаки</h2>
                 <div className="flex items-center gap-4 bg-[var(--color-surface-well)] px-3 py-1 rounded-lg flex-wrap">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-[var(--color-text-muted)] whitespace-nowrap">Бонус куб (попадание):</label>
                        <input
                            type="text"
                            value={globalAttackDiceBonusToHitDice}
                            onChange={(e) => onGlobalDiceBonusChange(e.target.value, globalAttackDiceBonusToDamageDice)}
                            placeholder="1d4"
                            className="w-24 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                        />
                    </div>
                     <div className="flex items-center gap-2">
                        <label className="text-sm text-[var(--color-text-muted)] whitespace-nowrap">Бонус куб (урон):</label>
                        <input
                            type="text"
                            value={globalAttackDiceBonusToDamageDice}
                            onChange={(e) => onGlobalDiceBonusChange(globalAttackDiceBonusToHitDice, e.target.value)}
                            placeholder="1d6"
                            className="w-24 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                        />
                    </div>
                </div>
            </div>
            <button
                onClick={onAddAttack}
                className="bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] text-white font-bold py-2 px-4 rounded-lg transition-all duration-150 shadow hover:shadow-md active:scale-95"
            >
                Добавить
            </button>
        </div>
        
        {attacks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {attacks.map(attack => (
                <AttackCard
                    key={attack.id}
                    attack={attack}
                    abilityModifiers={abilityModifiers}
                    proficiencyBonus={proficiencyBonus}
                    equippedHitBonus={equippedBonuses.attackHit}
                    onEdit={() => onEditAttack(attack)}
                    onRollHit={onRollHit}
                    onRequestRollHit={onRequestRollHit}
                    onRollDamage={onRollDamage}
                    globalAttackDiceBonusToHitDice={globalAttackDiceBonusToHitDice}
                    globalAttackDiceBonusToDamageDice={globalAttackDiceBonusToDamageDice}
                />
            ))}
            </div>
        ) : (
            <div className="text-center py-8 text-[var(--color-text-subtle)] border-2 border-dashed border-[var(--color-border)] rounded-lg">
                <p>Нет добавленных атак.</p>
                <p className="text-sm">Нажмите "Добавить", чтобы создать новую.</p>
            </div>
        )}
    </div>
  );
});