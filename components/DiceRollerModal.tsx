import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Character, Ability, RollType, RollResult, ProficiencyLevel } from '../types';
import { ABILITY_NAMES } from '../constants';
import { calculateModifier, calculateProficiencyBonus } from '../utils/characterCalculations';
import { getEquippedItemBonuses } from '../utils/inventory';
import { generateUUID } from '../utils/uuid';
import { parseAndRoll } from '../utils/dice';

interface DiceRollerModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character;
  onRoll: (rollResult: RollResult) => void;
  onRollingStatusChange: (isRolling: boolean) => void;
}

export const DiceRollerModal: React.FC<DiceRollerModalProps> = ({
  isOpen,
  onClose,
  character,
  onRoll,
  onRollingStatusChange,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // --- CUSTOM ROLLS STATE ---
  // Dice pool stores quantity of each die type
  const [dicePool, setDicePool] = useState<Record<string, number>>({
    d4: 0,
    d6: 0,
    d8: 0,
    d10: 0,
    d12: 0,
    d20: 0,
    d100: 0,
  });
  const [customModifier, setCustomModifier] = useState<number>(0);
  const [rollType, setRollType] = useState<RollType>(RollType.Normal);
  const [customRollName, setCustomRollName] = useState<string>('Пользовательский бросок');

  // --- SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const openTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now();
    }
  }, [isOpen]);

  // Click outside to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    // Ignore clicks on the overlay if they occur within 400ms of the modal opening (prevents touch bleed-through/ghost clicks)
    if (Date.now() - openTimeRef.current < 400) {
      return;
    }
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  // Modify dice pool
  const addDie = (die: string) => {
    setDicePool(prev => ({ ...prev, [die]: (prev[die] || 0) + 1 }));
  };

  const removeDie = (die: string) => {
    setDicePool(prev => ({ ...prev, [die]: Math.max(0, (prev[die] || 0) - 1) }));
  };

  const clearPool = () => {
    setDicePool({
      d4: 0,
      d6: 0,
      d8: 0,
      d10: 0,
      d12: 0,
      d20: 0,
      d100: 0,
    });
    setCustomModifier(0);
    setRollType(RollType.Normal);
    setCustomRollName('Пользовательский бросок');
  };

  // Check if dice pool is empty
  const isPoolEmpty = useMemo(() => {
    return Object.values(dicePool).every(qty => qty === 0);
  }, [dicePool]);

  // Build formula preview
  const formulaPreview = useMemo(() => {
    const parts: string[] = [];
    Object.entries(dicePool).forEach(([die, qty]) => {
      if (qty > 0) parts.push(`${qty}${die}`);
    });
    let formula = parts.join(' + ');
    if (!formula) formula = '0';
    
    if (customModifier !== 0) {
      formula += customModifier > 0 ? ` + ${customModifier}` : ` - ${Math.abs(customModifier)}`;
    }
    return formula;
  }, [dicePool, customModifier]);

  // Calculate Roll Pool (all character checks)
  const rollPool = useMemo(() => {
    const pool: {
      id: string;
      name: string;
      category: 'Характеристики' | 'Спасброски' | 'Навыки' | 'Атаки' | 'Заклинания';
      modifier?: number;
      formula?: string;
      details?: string;
    }[] = [];

    const equippedBonuses = getEquippedItemBonuses(character);
    const proficiencyBonus = calculateProficiencyBonus(character.level) + character.proficiencyBonusBonus;

    // Ability scores and modifiers
    const effectiveAbilityScores: Record<Ability, number> = {} as any;
    const abilityModifiers: Record<Ability, number> = {} as any;

    (Object.values(Ability) as Ability[]).forEach(ability => {
      effectiveAbilityScores[ability] = character.scores[ability] + (equippedBonuses.abilityScores[ability] || 0);
      abilityModifiers[ability] = calculateModifier(effectiveAbilityScores[ability]) + (character.abilityBonuses[ability] || 0);
    });

    // 1. Ability checks
    (Object.values(Ability) as Ability[]).forEach(ability => {
      pool.push({
        id: `check-${ability}`,
        name: `Проверка: ${ABILITY_NAMES[ability]}`,
        category: 'Характеристики',
        modifier: abilityModifiers[ability],
        details: abilityModifiers[ability] >= 0 ? `+${abilityModifiers[ability]}` : `${abilityModifiers[ability]}`
      });
    });

    // 2. Saving throws
    (Object.values(Ability) as Ability[]).forEach(ability => {
      const isProf = character.savingThrowProficiencies[ability];
      const saveBonus = character.savingThrowBonuses[ability] || 0;
      const itemSaveBonus = equippedBonuses.savingThrows?.[ability] || 0;
      const totalSave = abilityModifiers[ability] + (isProf ? proficiencyBonus : 0) + saveBonus + itemSaveBonus;
      pool.push({
        id: `save-${ability}`,
        name: `Спасбросок: ${ABILITY_NAMES[ability]}`,
        category: 'Спасброски',
        modifier: totalSave,
        details: totalSave >= 0 ? `+${totalSave}` : `${totalSave}`
      });
    });

    // 3. Skills
    Object.values(character.skills || {}).forEach((skill) => {
      if (!skill) return;
      const abilityMod = abilityModifiers[skill.ability];
      let profContribution = 0;
      if (skill.proficiency === ProficiencyLevel.Proficient) {
        profContribution = proficiencyBonus;
      } else if (skill.proficiency === ProficiencyLevel.Expert) {
        profContribution = proficiencyBonus * 2;
      }
      const skillBonus = character.skillBonuses[skill.name] || 0;
      const itemSkillBonus = equippedBonuses.skills[skill.name] || 0;
      const totalSkill = abilityMod + profContribution + skillBonus + itemSkillBonus;
      pool.push({
        id: `skill-${skill.name}`,
        name: `Навык: ${skill.name}`,
        category: 'Навыки',
        modifier: totalSkill,
        details: `${skill.name} (${totalSkill >= 0 ? `+${totalSkill}` : `${totalSkill}`})`
      });
    });

    // 4. Attacks
    (character.attacks || []).forEach(attack => {
      const totalAttackBonus = attack.hitBonus + (attack.isProficient ? proficiencyBonus : 0) + abilityModifiers[attack.hitAbility];
      // Hit roll
      pool.push({
        id: `attack-hit-${attack.id}`,
        name: `Атака: ${attack.name} (Попадание)`,
        category: 'Атаки',
        modifier: totalAttackBonus,
        details: `Бонус: ${totalAttackBonus >= 0 ? `+${totalAttackBonus}` : totalAttackBonus}`
      });
      // Damage roll
      const finalDmgBonus = attack.damageBonus + (attack.damageAbility !== 'None' ? abilityModifiers[attack.damageAbility] : 0);
      const finalDmgFormula = `${attack.damageDice}${finalDmgBonus !== 0 ? (finalDmgBonus > 0 ? ` + ${finalDmgBonus}` : ` - ${Math.abs(finalDmgBonus)}`) : ''}`;
      pool.push({
        id: `attack-dmg-${attack.id}`,
        name: `Урон: ${attack.name}`,
        category: 'Атаки',
        formula: finalDmgFormula,
        details: `Формула: ${finalDmgFormula}`
      });
    });

    // 5. Spells
    const spellcastingAbility = character.spellcastingAbility || Ability.INT;
    const spellcastingModifier = calculateModifier(effectiveAbilityScores[spellcastingAbility]) + (character.abilityBonuses[spellcastingAbility] || 0);
    const spellSaveDc = 8 + proficiencyBonus + spellcastingModifier + character.spellSaveDcBonus + (equippedBonuses.spellSaveDC || 0);
    const spellAttackBonus = proficiencyBonus + spellcastingModifier + character.spellAttackBonusBonus;

    pool.push({
      id: `spell-attack`,
      name: `Атака заклинанием`,
      category: 'Заклинания',
      modifier: spellAttackBonus,
      details: `Бонус: ${spellAttackBonus >= 0 ? `+${spellAttackBonus}` : spellAttackBonus}`
    });

    pool.push({
      id: `spell-dc`,
      name: `Спасбросок заклинаний (СЛ)`,
      category: 'Заклинания',
      modifier: spellSaveDc,
      details: `СЛ: ${spellSaveDc}`
    });

    return pool;
  }, [character]);

  // Filtered pool based on search query
  const filteredRollPool = useMemo(() => {
    if (!searchQuery.trim()) return rollPool;
    const query = searchQuery.toLowerCase();
    return rollPool.filter(
      item => item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query)
    );
  }, [rollPool, searchQuery]);

  // Pre-fill custom roller from a pool check
  const handlePreFill = (check: typeof rollPool[0]) => {
    clearPool();
    setCustomRollName(check.name);
    if (check.formula) {
      // It is a dice formula
      // Try to parse formula like "2d6 + 3"
      const normalized = check.formula.replace(/\s/g, '');
      const diceParts = normalized.match(/(\d+)d(\d+)/g) || [];
      const newPool = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
      
      diceParts.forEach(part => {
        const parts = part.split('d');
        const qtyStr = parts[0];
        const sidesStr = parts[1];
        if (qtyStr === undefined || sidesStr === undefined) return;
        const qty = parseInt(qtyStr, 10) || 1;
        const key = `d${sidesStr}`;
        if (key in newPool) {
          newPool[key as keyof typeof newPool] = qty;
        }
      });
      setDicePool(newPool);

      // Extract modifier
      let tempMod = 0;
      const modParts = normalized.replace(/(\d+)d(\d+)/g, '').match(/[+-]?\d+/g) || [];
      modParts.forEach(val => {
        tempMod += parseInt(val, 10);
      });
      setCustomModifier(tempMod);
    } else if (check.modifier !== undefined) {
      // It is a d20 roll check
      setDicePool(prev => ({ ...prev, d20: 1 }));
      setCustomModifier(check.modifier);
    }
  };

  // Perform roll animation and dispatch result
  const executeRoll = (name: string, formulaStr: string, mod: number, isD20Check: boolean) => {
    onRollingStatusChange(true);
    onClose();

    setTimeout(() => {
      if (isD20Check) {
        // Roll d20 (supports Advantage / Disadvantage)
        const roll1 = Math.floor(Math.random() * 20) + 1;
        let roll2: number | undefined = undefined;
        let chosenRoll = roll1;

        if (rollType !== RollType.Normal) {
          roll2 = Math.floor(Math.random() * 20) + 1;
          chosenRoll = rollType === RollType.Advantage ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
        }

        onRoll({
          id: generateUUID(),
          name,
          roll1,
          roll2,
          chosenRoll,
          modifier: mod,
          total: chosenRoll + mod,
          rollType,
          diceType: 'd20',
        });
      } else {
        // Roll general formula (supports d4, d6, d8, etc.)
        const { total, diceResult, modifier } = parseAndRoll(formulaStr);
        onRoll({
          id: generateUUID(),
          name,
          roll1: diceResult,
          chosenRoll: diceResult,
          modifier: modifier,
          total: total,
          rollType: RollType.Normal,
          diceType: formulaStr,
        });
      }
      onRollingStatusChange(false);
    }, 800);
  };

  // Roll from Custom Roller
  const handleCustomRollExecute = () => {
    if (isPoolEmpty) return;

    // Check if it is a pure d20 roll
    const totalDiceCount = Object.values(dicePool).reduce((sum, q) => sum + q, 0);
    const isPureD20 = dicePool.d20 === 1 && totalDiceCount === 1;

    executeRoll(customRollName, formulaPreview, customModifier, isPureD20);
  };

  // Fast direct roll from pool list
  const handleDirectRoll = (check: typeof rollPool[0]) => {
    if (check.formula) {
      executeRoll(check.name, check.formula, 0, false);
    } else if (check.modifier !== undefined) {
      executeRoll(check.name, '1d20', check.modifier, true);
    }
  };

  if (!isOpen) return null;

  // Grouped pool by category
  const groupedPool = filteredRollPool.reduce((acc, check) => {
    const category = check.category;
    let group = acc[category];
    if (!group) {
      group = [];
      acc[category] = group;
    }
    group.push(check);
    return acc;
  }, {} as Record<string, typeof rollPool>);

  return (
    <div
      className="dice-roller-modal fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 w-full max-w-4xl border border-[var(--color-border)] animate-fade-in flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[var(--color-border-subtle)] pb-4 mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-[var(--color-accent-primary)] flex items-center gap-2">
            🎲 Универсальный бросок кубиков
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors text-2xl font-bold line-height-none p-1"
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 overflow-y-auto grow pr-2">
          
          {/* Left Panel: Custom Dice Roller (Col span 2) */}
          <div className="md:col-span-2 space-y-4 border-r border-[var(--color-border-subtle)]/30 pr-0 md:pr-6 flex flex-col">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              Конструктор броска
            </h3>

            {/* Title / Name */}
            <div className="space-y-1">
              <label htmlFor="custom-roll-name" className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                Название броска
              </label>
              <input
                id="custom-roll-name"
                type="text"
                value={customRollName}
                onChange={e => setCustomRollName(e.target.value)}
                placeholder="Пользовательский бросок"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
              />
            </div>

            {/* Dice Buttons Grid */}
            <div className="grid grid-cols-4 gap-2">
              {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(die => {
                const qty = dicePool[die] || 0;
                return (
                  <button
                    key={die}
                    onClick={() => addDie(die)}
                    className="flex flex-col items-center justify-center p-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] hover:border-[var(--color-accent-primary)]/50 transition-all duration-150 active:scale-95 group relative"
                  >
                    <span className="text-xs font-black text-[var(--color-accent-primary)] group-hover:text-[var(--color-accent-primary-light)]">
                      {die.toUpperCase()}
                    </span>
                    {qty > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-teal-500 text-white shadow-sm border border-teal-600">
                        {qty}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={clearPool}
                className="flex items-center justify-center p-2 rounded-xl border border-dashed border-red-500/30 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-xs font-bold transition-all active:scale-95"
                data-tooltip="Очистить пул"
              >
                Сброс
              </button>
            </div>

            {/* Active Pool Visualizer */}
            {!isPoolEmpty && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-[var(--color-surface-well)] rounded-lg border border-[var(--color-border-subtle)] min-h-[44px]">
                {Object.entries(dicePool).map(([die, qty]) => {
                  if (qty === 0) return null;
                  return (
                    <div
                      key={die}
                      onClick={() => removeDie(die)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] text-xs font-bold cursor-pointer hover:border-red-500/50 hover:bg-red-500/5 hover:text-red-400 group transition-all"
                      data-tooltip="Кликните, чтобы убрать кубик"
                    >
                      <span>{qty}d{die.substring(1)}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] group-hover:text-red-400 font-bold">&times;</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom Modifier input */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="custom-mod" className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                  Модификатор
                </label>
                <div className="flex rounded-lg shadow-sm">
                  <button
                    onClick={() => setCustomModifier(prev => prev - 1)}
                    className="px-3 bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] border-r-0 rounded-l-lg hover:bg-[var(--color-surface-raised-hover)] text-sm font-bold"
                  >
                    -
                  </button>
                  <input
                    id="custom-mod"
                    type="number"
                    value={customModifier}
                    onChange={e => setCustomModifier(parseInt(e.target.value, 10) || 0)}
                    className="block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)] py-2"
                  />
                  <button
                    onClick={() => setCustomModifier(prev => prev + 1)}
                    className="px-3 bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] border-l-0 rounded-r-lg hover:bg-[var(--color-surface-raised-hover)] text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Advantage / Disadvantage toggle (For d20 rolls) */}
              <div>
                <label className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                  Тип броска (для D20)
                </label>
                <div className="flex rounded-lg border border-[var(--color-border-subtle)] overflow-hidden text-xs">
                  <button
                    onClick={() => setRollType(RollType.Disadvantage)}
                    className={`flex-1 py-2 font-bold transition-colors border-r border-[var(--color-border-subtle)] ${rollType === RollType.Disadvantage ? 'bg-red-500/20 text-red-400' : 'bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-muted)]'}`}
                    data-tooltip="Помеха"
                  >
                    Пом
                  </button>
                  <button
                    onClick={() => setRollType(RollType.Normal)}
                    className={`flex-1 py-2 font-bold transition-colors border-r border-[var(--color-border-subtle)] ${rollType === RollType.Normal ? 'bg-[var(--color-surface-well)] text-[var(--color-text-base)]' : 'bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-muted)]'}`}
                    data-tooltip="Обычный бросок"
                  >
                    Норм
                  </button>
                  <button
                    onClick={() => setRollType(RollType.Advantage)}
                    className={`flex-1 py-2 font-bold transition-colors ${rollType === RollType.Advantage ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-muted)]'}`}
                    data-tooltip="Преимущество"
                  >
                    Преим
                  </button>
                </div>
              </div>
            </div>

            {/* Formula display and execute roll */}
            <div className="pt-4 border-t border-[var(--color-border-subtle)]/30 grow flex flex-col justify-end">
              <div className="text-center p-3 bg-[var(--color-surface-inset)] rounded-xl border border-[var(--color-border-subtle)] mb-3">
                <div className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                  Итоговая формула
                </div>
                <div className="text-lg font-black text-[var(--color-text-base)] font-mono">
                  {formulaPreview}
                  {dicePool.d20 === 1 && Object.values(dicePool).reduce((a,b)=>a+b, 0) === 1 && rollType !== RollType.Normal && (
                    <span className={`text-xs ml-1.5 font-bold ${rollType === RollType.Advantage ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({rollType === RollType.Advantage ? 'Преимущество' : 'Помеха'})
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleCustomRollExecute}
                disabled={isPoolEmpty}
                className="w-full py-3 rounded-lg border border-transparent shadow-md bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-extrabold text-sm focus:outline-none transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98]"
              >
                🎲 Бросить кубы
              </button>
            </div>
          </div>

          {/* Right Panel: Predefined Pools list (Col span 3) */}
          <div className="md:col-span-3 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                Быстрый выбор из проверок персонажа
              </h3>
            </div>

            {/* Search Input */}
            <div className="mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск навыка, спасаброска, атаки..."
                className="w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
              />
            </div>

            {/* Categorized List */}
            <div className="overflow-y-auto grow pr-1 space-y-4">
              {Object.keys(groupedPool).length === 0 ? (
                <div className="text-center py-10 text-xs text-[var(--color-text-muted)]">
                  Ничего не найдено по вашему запросу
                </div>
              ) : (
                Object.entries(groupedPool).map(([category, checks]) => (
                  <div key={category} className="space-y-1.5">
                    <div className="text-[10px] font-bold text-[var(--color-accent-primary)] uppercase tracking-wider pl-1.5">
                      {category}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {checks.map(check => (
                        <div
                          key={check.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-well)] hover:bg-[var(--color-surface-well)]/80 border border-[var(--color-border-subtle)] transition-colors group"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-xs font-bold text-[var(--color-text-base)] truncate" data-tooltip={check.name}>
                              {check.name}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                              {check.details}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Pre-fill/Customize button */}
                            <button
                              onClick={() => handlePreFill(check)}
                              className="p-1.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary)]/40 hover:text-[var(--color-accent-primary-light)] text-[var(--color-text-muted)] transition-all active:scale-90"
                              data-tooltip="Настроить бросок (добавить кубы/модификаторы)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                              </svg>
                            </button>

                            {/* Direct Roll button */}
                            <button
                              onClick={() => handleDirectRoll(check)}
                              className="px-2.5 py-1 text-[11px] font-black rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 hover:border-teal-500/40 transition-all active:scale-90"
                              data-tooltip="Бросить сейчас"
                            >
                              Бросок
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
