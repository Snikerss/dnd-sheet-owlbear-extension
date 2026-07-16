import React, { useState, useEffect, useMemo } from 'react';
import { Ability, HitDie, BonusField } from '../types';
import { useCharacterDispatch } from '../context/CharacterContext';
import { calculateModifier, calculateProficiencyBonus, recalculateMaxHp } from '../utils/characterCalculations';
import { ABILITY_NAMES } from '../constants';
import { EditableBonus } from './EditableBonus';

interface StatDisplayProps { 
    label: string; 
    value: string | number; 
    baseValue?: string | number; 
    bonus?: number; 
    itemBonus?: number;
    isEditing: boolean; 
    editedBonus: number; 
    setIsEditing: (isEditing: boolean) => void; 
    setEditedBonus: (bonus: number) => void; 
    onSubmit: () => void; 
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const StatDisplay: React.FC<StatDisplayProps> = React.memo(({ label, value, baseValue, bonus = 0, itemBonus = 0, isEditing, editedBonus, setIsEditing, setEditedBonus, onSubmit, onKeyDown }) => (
  <div className="flex flex-col items-center justify-center bg-[var(--color-surface-inset)] p-2 rounded-lg text-center relative min-h-[85px]">
    <span className="text-[11px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold mt-1">{label}</span>
    <div className="relative group flex items-center justify-center mt-0.5">
        <div 
            className="text-2xl font-bold cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors"
            onClick={() => !isEditing && setIsEditing(true)}
            data-tooltip={`Изменить бонус для ${label}`}
        >
            {value}
        </div>
        {!isEditing && (
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-3 w-3 text-[var(--color-text-subtle)] group-hover:text-[var(--color-accent-primary)] transition-colors opacity-0 group-hover:opacity-100 absolute left-full ml-1 top-1/2 -translate-y-1/2 cursor-pointer" 
                viewBox="0 0 20 20" 
                fill="currentColor"
                onClick={() => setIsEditing(true)}
            >
                <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
            </svg>
        )}
    </div>
    <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center justify-center min-h-[20px] font-medium">
    {isEditing ? (
        <div className="flex items-center gap-1">
          {baseValue} + 
          <input 
            type="number" 
            value={editedBonus}
            onChange={(e) => setEditedBonus(parseInt(e.target.value, 10))}
            onBlur={onSubmit}
            onKeyDown={onKeyDown}
            className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          {itemBonus !== 0 && <span className="text-[10px] text-teal-400">+{itemBonus}</span>}
        </div>
    ) : (
        (bonus !== 0 || itemBonus !== 0) && (
            <span>
                ({baseValue}
                {bonus !== 0 && `${bonus > 0 ? '+' : '−'}${Math.abs(bonus)}`}
                {itemBonus !== 0 && <span className="text-teal-400 font-semibold">{itemBonus > 0 ? '+' : '−'}{Math.abs(itemBonus)}</span>}
                )
            </span>
        )
    )}
    </div>
  </div>
));

export const CombatStats: React.FC<{
  scores: Record<Ability, number>;
  abilityBonuses: Record<Ability, number>;
  level: number;
  currentHitPoints?: number;
  maxHitPoints?: number;
  temporaryHitPoints?: number;
  hitDie?: HitDie;
  acBonus: number;
  itemAcBonus?: number;
  initiativeBonus: number;
  itemInitiativeBonus?: number;
  proficiencyBonusBonus: number;
  itemProficiencyBonus?: number;
  maxHpBonus?: number;
  itemMaxHpBonus?: number;
  baseAC: number;
  acAbilitySources: Record<Ability, boolean>;
  onStatChange?: (field: string, value: any) => void;
  onBonusChange: (field: BonusField, value: number) => void;
  onBaseACChange: (value: number) => void;
  onToggleAbilitySource: (ability: Ability) => void;
  flat?: boolean;
}> = React.memo(({
  scores, abilityBonuses, level, currentHitPoints = 0, maxHitPoints = 0, temporaryHitPoints = 0,
  hitDie = HitDie.d8, acBonus, itemAcBonus = 0, initiativeBonus, itemInitiativeBonus = 0, proficiencyBonusBonus, itemProficiencyBonus = 0, maxHpBonus = 0, itemMaxHpBonus = 0,
  baseAC, acAbilitySources, onStatChange, onBonusChange, onBaseACChange, onToggleAbilitySource, flat = false
}) => {
  const dispatch = useCharacterDispatch();

  // --- LOCAL TACTICAL AC STATE ---
  const [isShieldActive, setIsShieldActive] = useState(() => {
    try {
        return localStorage.getItem('dnd_ac_shield_active') === 'true';
    } catch {
        return false;
    }
  });

  const [coverType, setCoverType] = useState<'none' | 'half' | 'three-quarters'>(() => {
    try {
        return (localStorage.getItem('dnd_ac_cover_type') as any) || 'none';
    } catch {
        return 'none';
    }
  });

  useEffect(() => {
    try {
        localStorage.setItem('dnd_ac_shield_active', isShieldActive.toString());
    } catch {}
  }, [isShieldActive]);

  useEffect(() => {
    try {
        localStorage.setItem('dnd_ac_cover_type', coverType);
    } catch {}
  }, [coverType]);

  // --- LOCAL EDITING STATE ---
  const [isEditingInitiative, setIsEditingInitiative] = useState(false);
  const [isEditingProficiency, setIsEditingProficiency] = useState(false);
  const [isEditingMaxHPBonus, setIsEditingMaxHPBonus] = useState(false);

  const [editedInitiativeBonus, setEditedInitiativeBonus] = useState(initiativeBonus);
  const [editedProficiencyBonus, setEditedProficiencyBonus] = useState(proficiencyBonusBonus);
  const [editedMaxHPBonus, setEditedMaxHPBonus] = useState(maxHpBonus);

  // Sync edits with props
  useEffect(() => {
    if (!isEditingInitiative) setEditedInitiativeBonus(initiativeBonus);
  }, [initiativeBonus, isEditingInitiative]);

  useEffect(() => {
    if (!isEditingProficiency) setEditedProficiencyBonus(proficiencyBonusBonus);
  }, [proficiencyBonusBonus, isEditingProficiency]);

  useEffect(() => {
    if (!isEditingMaxHPBonus) setEditedMaxHPBonus(maxHpBonus);
  }, [maxHpBonus, isEditingMaxHPBonus]);

  // --- DERIVED CALCULATIONS ---
  const dexModifier = useMemo(() => {
    return Math.floor((scores.DEX - 10) / 2) + (abilityBonuses.DEX || 0);
  }, [scores.DEX, abilityBonuses.DEX]);

  const abilityModifiers = useMemo(() => {
    const mods: Record<Ability, number> = {} as any;
    (Object.keys(Ability) as Ability[]).forEach(ability => {
        mods[ability] = Math.floor((scores[ability] - 10) / 2) + (abilityBonuses[ability] || 0);
    });
    return mods;
  }, [scores, abilityBonuses]);

  const baseProficiency = useMemo(() => calculateProficiencyBonus(level), [level]);
  const proficiencyBonus = useMemo(() => baseProficiency + proficiencyBonusBonus + itemProficiencyBonus, [baseProficiency, proficiencyBonusBonus, itemProficiencyBonus]);

  const effectiveInitiative = useMemo(() => {
    return dexModifier + initiativeBonus + itemInitiativeBonus;
  }, [dexModifier, initiativeBonus, itemInitiativeBonus]);

  const armorClass = useMemo(() => {
    let ac = baseAC + acBonus + itemAcBonus;
    (Object.keys(Ability) as Ability[]).forEach(ability => {
        if (acAbilitySources[ability]) {
            ac += abilityModifiers[ability];
        }
    });
    if (isShieldActive) ac += 2;
    if (coverType === 'half') ac += 2;
    if (coverType === 'three-quarters') ac += 5;
    return ac;
  }, [baseAC, acBonus, itemAcBonus, acAbilitySources, abilityModifiers, isShieldActive, coverType]);

  const baseMaxHitPoints = useMemo(() => {
    const conMod = Math.floor((scores.CON - 10) / 2) + (abilityBonuses.CON || 0);
    return recalculateMaxHp(level, hitDie, conMod);
  }, [scores.CON, abilityBonuses.CON, level, hitDie]);

  const [hpAmount, setHpAmount] = useState<number>(0);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setHpAmount(isNaN(val) ? 0 : Math.max(0, val));
  };

  const handleInitiativeBonusSubmit = () => {
    const newBonus = isNaN(editedInitiativeBonus) ? 0 : editedInitiativeBonus;
    if (newBonus !== initiativeBonus) onBonusChange('initiativeBonus', newBonus);
    setIsEditingInitiative(false);
  };
  
  const handleProficiencyBonusSubmit = () => {
    const newBonus = isNaN(editedProficiencyBonus) ? 0 : editedProficiencyBonus;
    if (newBonus !== proficiencyBonusBonus) onBonusChange('proficiencyBonusBonus', newBonus);
    setIsEditingProficiency(false);
  };

  const handleMaxHPBonusSubmit = () => {
    const newBonus = isNaN(editedMaxHPBonus) ? 0 : editedMaxHPBonus;
    if (newBonus !== maxHpBonus) onBonusChange('maxHpBonus', newBonus);
    setIsEditingMaxHPBonus(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, submitFn: () => void) => {
      if (e.key === 'Enter') submitFn();
      if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
  };
  
  const handleBaseACChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onBaseACChange(value);
  };
  
  const handleToggleAbilitySource = (ability: Ability) => {
    onToggleAbilitySource(ability);
  };

  const [showACSettings, setShowACSettings] = useState(false);

  // --- AC CARD RENDER ---
  const acSettings = showACSettings && (
    <div className="absolute top-[102%] left-0 w-[290px] sm:w-[320px] p-3 bg-[var(--color-surface-opaque)] rounded-lg border border-[var(--color-border)] shadow-2xl space-y-3 animate-fade-in text-left z-30 mt-1">
        <div className="flex justify-between items-center pb-1.5 border-b border-[var(--color-border)]/50">
            <span className="text-xs font-bold text-[var(--color-accent-primary)] uppercase tracking-wider">Параметры доспеха</span>
            <button onClick={() => setShowACSettings(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div className="flex justify-between items-center">
                <label htmlFor="baseACInput" className="text-xs text-[var(--color-text-medium)]">База:</label>
                <input 
                    id="baseACInput" 
                    type="number" 
                    value={baseAC}
                    onChange={handleBaseACChange}
                    className="w-14 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-0.5 px-1.5 text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                />
            </div>
            <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--color-text-medium)]">Bonus:</span>
                <EditableBonus 
                    value={acBonus} 
                    onChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'acBonus', value: bonus } })} 
                />
            </div>
        </div>
        <div className="space-y-1">
            <span className="text-[10px] text-[var(--color-text-muted)] block">Добавлять характеристики к КД:</span>
            <div className="grid grid-cols-3 gap-1">
                {(Object.keys(Ability) as Ability[]).map(ability => (
                    <label key={ability} data-tooltip={ABILITY_NAMES[ability]} className="cursor-pointer">
                        <input 
                            type="checkbox"
                            checked={!!acAbilitySources[ability]}
                            onChange={() => handleToggleAbilitySource(ability)}
                            className="sr-only peer"
                        />
                        <span className="w-full py-0.5 rounded-md border border-[var(--color-border)] peer-checked:border-[var(--color-accent-primary-hover)] peer-checked:bg-[var(--color-accent-primary)]/20 peer-checked:text-[var(--color-accent-primary-light)] flex items-center justify-center text-[10px] font-bold text-[var(--color-text-muted)] transition-colors">
                            {ABILITY_NAMES[ability].substring(0, 3)} ({abilityModifiers[ability] >= 0 ? '+' : ''}{abilityModifiers[ability]})
                        </span>
                    </label>
                ))}
            </div>
        </div>
    </div>
  );

  const acCard = (
    <div className="flex flex-col items-center justify-center bg-[var(--color-surface-inset)] p-2 rounded-lg text-center relative group min-h-[85px]">
        {/* Quick Tactical AC Toggles */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            {/* Shield Toggle */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsShieldActive(!isShieldActive);
                }}
                className={`p-1 rounded transition-all duration-150 ${
                    isShieldActive 
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-400/30 shadow' 
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] border border-transparent'
                }`}
                data-tooltip={isShieldActive ? "Убрать щит (+2 к КД)" : "Экипировать щит (+2 к КД)"}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.647 2 6.31 2 7c0 5.305 3.013 9.908 7.397 12.196a1 1 0 00.806 0C14.986 17.108 18 12.505 18 7c0-.69-.056-1.353-.166-2A11.954 11.954 0 0110 1.944z" clipRule="evenodd" />
                </svg>
            </button>
            {/* Cover Toggle */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setCoverType(prev => prev === 'none' ? 'half' : prev === 'half' ? 'three-quarters' : 'none');
                }}
                className={`p-1 rounded transition-all duration-150 flex items-center gap-0.5 ${
                    coverType !== 'none' 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30 shadow' 
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] border border-transparent'
                }`}
                data-tooltip={`Укрытие: ${coverType === 'none' ? 'нет' : coverType === 'half' ? 'половинное (+2 к КД)' : 'на три четверти (+5 к КД)'} (клик для смены)`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill={coverType !== 'none' ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {coverType !== 'none' && (
                    <span className="text-[9px] font-bold leading-none">
                        {coverType === 'half' ? '+2' : '+5'}
                    </span>
                )}
            </button>
        </div>

        {/* Settings Toggle */}
        <button
            onClick={(e) => {
                e.stopPropagation();
                setShowACSettings(!showACSettings);
            }}
            className={`absolute right-2 top-2 p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors ${showACSettings ? 'text-[var(--color-accent-primary)] bg-[var(--color-surface-raised)]' : ''}`}
            data-tooltip="Настройки класса доспеха"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.533 1.533 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
        </button>

        <span className="text-[11px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold mt-2">КД</span>
        <div 
            className="text-2xl font-bold cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors mt-0.5"
            onClick={() => setShowACSettings(!showACSettings)}
            data-tooltip="Настройки класса доспеха"
        >
            {armorClass}
        </div>
        <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 min-h-[20px] font-medium">
            База {baseAC}
            {(acBonus !== 0 || itemAcBonus !== 0 || isShieldActive || coverType !== 'none') && (
                <span>
                    {((acBonus + itemAcBonus + (isShieldActive ? 2 : 0) + (coverType === 'half' ? 2 : coverType === 'three-quarters' ? 5 : 0)) >= 0 ? '+' : '−')}
                    {Math.abs(acBonus + itemAcBonus + (isShieldActive ? 2 : 0) + (coverType === 'half' ? 2 : coverType === 'three-quarters' ? 5 : 0))}
                </span>
            )}
        </div>
        {acSettings}
    </div>
  );

  if (flat) {
    return (
      <>
        {acCard}
        <StatDisplay 
            label="Инициатива"
            value={(effectiveInitiative >= 0 ? '+' : '') + effectiveInitiative}
            baseValue={dexModifier}
            bonus={initiativeBonus}
            itemBonus={itemInitiativeBonus}
            isEditing={isEditingInitiative}
            editedBonus={editedInitiativeBonus}
            setIsEditing={setIsEditingInitiative}
            setEditedBonus={setEditedInitiativeBonus}
            onSubmit={handleInitiativeBonusSubmit}
            onKeyDown={(e) => handleKeyDown(e, handleInitiativeBonusSubmit)}
        />
        <StatDisplay 
            label="Мастерство"
            value={(proficiencyBonus >= 0 ? '+' : '') + proficiencyBonus}
            baseValue={baseProficiency}
            bonus={proficiencyBonusBonus}
            itemBonus={itemProficiencyBonus}
            isEditing={isEditingProficiency}
            editedBonus={editedProficiencyBonus}
            setIsEditing={setIsEditingProficiency}
            setEditedBonus={setEditedProficiencyBonus}
            onSubmit={handleProficiencyBonusSubmit}
            onKeyDown={(e) => handleKeyDown(e, handleProficiencyBonusSubmit)}
        />
      </>
    );
  }

  // Fallback to original UI if flat is false
  return (
    <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] h-full flex flex-col justify-between gap-4">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {acCard}
          <StatDisplay 
              label="Инициатива"
              value={(effectiveInitiative >= 0 ? '+' : '') + effectiveInitiative}
              baseValue={dexModifier}
              bonus={initiativeBonus}
              itemBonus={itemInitiativeBonus}
              isEditing={isEditingInitiative}
              editedBonus={editedInitiativeBonus}
              setIsEditing={setIsEditingInitiative}
              setEditedBonus={setEditedInitiativeBonus}
              onSubmit={handleInitiativeBonusSubmit}
              onKeyDown={(e) => handleKeyDown(e, handleInitiativeBonusSubmit)}
          />
          <StatDisplay 
              label="Мастерство"
              value={(proficiencyBonus >= 0 ? '+' : '') + proficiencyBonus}
              baseValue={baseProficiency}
              bonus={proficiencyBonusBonus}
              itemBonus={itemProficiencyBonus}
              isEditing={isEditingProficiency}
              editedBonus={editedProficiencyBonus}
              setIsEditing={setIsEditingProficiency}
              setEditedBonus={setEditedProficiencyBonus}
              onSubmit={handleProficiencyBonusSubmit}
              onKeyDown={(e) => handleKeyDown(e, handleProficiencyBonusSubmit)}
          />
          <div className="flex flex-col items-center justify-center bg-[var(--color-surface-inset)] p-2 rounded-lg text-center min-h-[85px] relative">
              <div className="absolute right-1 top-1 flex items-center">
                  <select
                      value={hitDie}
                      onChange={(e) => dispatch({ type: 'SET_HIT_DIE', payload: parseInt(e.target.value, 10) as HitDie })}
                      className="bg-[var(--color-surface-well)] hover:bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded py-1 pl-2.5 pr-6 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] appearance-none"
                      style={{ backgroundImage: 'none', paddingRight: '24px' }}
                      data-tooltip="Кость Хитов вашего класса"
                  >
                      <option value={HitDie.d6}>d6</option>
                      <option value={HitDie.d8}>d8</option>
                      <option value={HitDie.d10}>d10</option>
                      <option value={HitDie.d12}>d12</option>
                  </select>
                  <span className="absolute right-2 pointer-events-none text-[var(--color-text-muted)] text-[8px] leading-none">▼</span>
              </div>
              <div className="relative group flex items-center justify-center">
                  <div className="text-2xl font-bold cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors" onClick={() => !isEditingMaxHPBonus && setIsEditingMaxHPBonus(true)} data-tooltip="Изменить бонус ОЗ">
                      {maxHitPoints}
                  </div>
              </div>
              <span 
                className="text-[10px] text-[var(--color-text-muted)] tracking-wider uppercase font-semibold"
                data-tooltip="Максимальные Очки Здоровья (ОЗ). Формула: Базовое здоровье (от уровня и Кости Хитов) + Модификатор Выносливости * Уровень + Бонус"
              >
                Макс. ОЗ
              </span>
          </div>
        </div>
      </div>
      <div className="space-y-3 mt-auto">
          <div 
              className="w-full bg-[var(--color-surface-well)] rounded-full h-6 border border-[var(--color-border)] overflow-hidden shadow-inner relative flex items-center justify-center cursor-help"
              data-tooltip={`Текущее здоровье: ${currentHitPoints} / ${maxHitPoints}`}
          >
              <div className="bg-[var(--color-health)] h-full absolute left-0 top-0 transition-all duration-300" style={{ width: `${(currentHitPoints / maxHitPoints) * 100}%` }}></div>
              <span className="relative text-white font-bold text-sm z-10">{currentHitPoints} / {maxHitPoints}</span>
          </div>
      </div>
    </div>
  );
});