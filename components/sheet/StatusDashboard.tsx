import React, { useState, useEffect } from 'react';
import { Ability, CharacterSize, HitDie } from '../../types';
import { CHARACTER_SIZE_NAMES } from '../../constants';
import { useCharacter } from '../../context/CharacterContext';
import { getEquippedItemBonuses } from '../../utils/inventory';
import { CombatStats } from '../CombatStats';
import { Speed } from '../Speed';
import { PassiveSenses } from '../PassiveSenses';
import { ExperienceBar } from '../ExperienceBar';

type EquippedBonuses = ReturnType<typeof getEquippedItemBonuses>;

interface StatusDashboardProps {
    equippedBonuses: EquippedBonuses;
    effectiveAbilityScores: Record<Ability, number>;
    onOpenShortRest: () => void;
}

export const StatusDashboard: React.FC<StatusDashboardProps> = React.memo(({
    equippedBonuses,
    effectiveAbilityScores,
    onOpenShortRest,
}) => {
    const { character, dispatch } = useCharacter();

    // --- HEALTH ACTION & BONUS STATE ---
    const [hpAmount, setHpAmount] = useState<number>(0);
    const [isEditingMaxHPBonus, setIsEditingMaxHPBonus] = useState(false);
    const [editedMaxHPBonus, setEditedMaxHPBonus] = useState(character.maxHpBonus);

    useEffect(() => {
        setEditedMaxHPBonus(character.maxHpBonus);
    }, [character.maxHpBonus]);

    const handleMaxHPBonusSubmit = () => {
        const newBonus = isNaN(editedMaxHPBonus) ? 0 : editedMaxHPBonus;
        dispatch({ type: 'SET_BONUS', payload: { field: 'maxHpBonus', value: newBonus } });
        setIsEditingMaxHPBonus(false);
    };

    // --- HIT DICE EDIT STATE ---
    const [isEditingHitDice, setIsEditingHitDice] = useState(false);
    const [editedHitDice, setEditedHitDice] = useState(character.currentHitDice);

    useEffect(() => {
        setEditedHitDice(character.currentHitDice);
    }, [character.currentHitDice]);

    const handleHitDiceSubmit = () => {
        const newValue = isNaN(editedHitDice) ? 0 : Math.max(0, Math.min(character.totalHitDice, editedHitDice));
        dispatch({ type: 'SET_CURRENT_HIT_DICE', payload: newValue });
        setIsEditingHitDice(false);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left column: Unified Status Panel */}
            <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] flex flex-col justify-between gap-4 col-span-1 lg:col-span-4 h-full">
                {/* Section 1: Health (HP) */}
                <div className="space-y-3">
                    {/* Max HP and Hit Die Selector Header */}
                    <div className="flex justify-between items-center bg-[var(--color-surface-inset)] p-3 rounded-lg relative">
                        <div className="flex flex-col text-left">
                            <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider uppercase font-semibold">Максимальные ОЗ</span>
                            <div className="relative group flex items-center mt-1">
                                <div
                                    className="text-2xl font-bold cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors"
                                    onClick={() => !isEditingMaxHPBonus && setIsEditingMaxHPBonus(true)}
                                    data-tooltip="Изменить бонус ОЗ"
                                >
                                    {character.maxHitPoints + (equippedBonuses.maxHp || 0)}
                                </div>
                                {!isEditingMaxHPBonus && (
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-3.5 w-3.5 text-[var(--color-text-subtle)] group-hover:text-[var(--color-accent-primary)] transition-colors opacity-0 group-hover:opacity-100 absolute left-full ml-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        onClick={() => setIsEditingMaxHPBonus(true)}
                                    >
                                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            {/* Bonus Formula */}
                            <div className="text-[11px] text-[var(--color-text-muted)] mt-1 min-h-[12px] font-medium">
                                {isEditingMaxHPBonus ? (
                                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                      <span>{character.maxHitPoints - character.maxHpBonus} +</span>
                                      <input
                                        type="number"
                                        value={editedMaxHPBonus}
                                        onChange={(e) => setEditedMaxHPBonus(parseInt(e.target.value, 10))}
                                        onBlur={handleMaxHPBonusSubmit}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleMaxHPBonusSubmit(); }}
                                        className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-hidden focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                        autoFocus
                                        onFocus={(e) => e.target.select()}
                                      />
                                      {equippedBonuses.maxHp !== 0 && (
                                          <span className="text-teal-400 font-semibold">
                                              {equippedBonuses.maxHp > 0 ? '+' : ''}{equippedBonuses.maxHp}
                                          </span>
                                      )}
                                    </div>
                                ) : (
                                    <>
                                      {character.maxHpBonus !== 0 && (
                                        <span>
                                          ({character.maxHitPoints - character.maxHpBonus}{character.maxHpBonus > 0 ? '+' : ''}{character.maxHpBonus})
                                        </span>
                                      )}
                                      {equippedBonuses.maxHp !== 0 && (
                                          <span className="text-teal-400 font-semibold" data-tooltip="Бонус от экипированных предметов">
                                              {equippedBonuses.maxHp > 0 ? '+' : ''}{equippedBonuses.maxHp}
                                          </span>
                                      )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Hit Die Selector Badge - Absolutely positioned to the top-right */}
                        <div className="absolute right-3 top-3 flex items-center">
                            <select
                                value={character.hitDie}
                                onChange={(e) => dispatch({ type: 'SET_HIT_DIE', payload: parseInt(e.target.value, 10) as HitDie })}
                                className="bg-[var(--color-surface-well)] hover:bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded py-1 pl-2.5 pr-6 text-xs font-bold focus:outline-hidden focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] appearance-none"
                                style={{ backgroundImage: 'none', paddingRight: '24px' }}
                            >
                                <option value={HitDie.d6}>d6</option>
                                <option value={HitDie.d8}>d8</option>
                                <option value={HitDie.d10}>d10</option>
                                <option value={HitDie.d12}>d12</option>
                            </select>
                            <span className="absolute right-2 pointer-events-none text-[var(--color-text-muted)] text-[8px] leading-none">▼</span>
                        </div>
                    </div>

                    {/* Current/Temp HP Bar */}
                    <div className="w-full bg-[var(--color-surface-well)] rounded-full h-6 border border-[var(--color-border)] overflow-hidden shadow-inner relative flex items-center justify-center">
                        <div
                          className="bg-[var(--color-health)] h-full absolute left-0 top-0 transition-all duration-300"
                          style={{ width: `${(Math.min(character.currentHitPoints, character.maxHitPoints + (equippedBonuses.maxHp || 0)) / (character.maxHitPoints + (equippedBonuses.maxHp || 0))) * 100}%` }}
                        ></div>
                        {character.temporaryHitPoints > 0 &&
                            <div
                              className="bg-[var(--color-temp-hp)] h-full absolute left-0 top-0 transition-all duration-300 opacity-70"
                              style={{ width: `${((Math.min(character.currentHitPoints, character.maxHitPoints + (equippedBonuses.maxHp || 0)) + character.temporaryHitPoints) / (character.maxHitPoints + (equippedBonuses.maxHp || 0))) * 100}%` }}
                            ></div>
                        }
                        <span className="relative text-white font-bold text-sm z-10 drop-shadow-md">
                            {`${character.currentHitPoints} ${character.temporaryHitPoints > 0 ? `(+${character.temporaryHitPoints})` : ''} / ${character.maxHitPoints + (equippedBonuses.maxHp || 0)}`}
                        </span>
                        {character.temporaryHitPoints > 0 &&
                            <button onClick={() => dispatch({ type: 'SET_FIELD', payload: { field: 'temporaryHitPoints', value: 0 } })} className="absolute right-1 top-1/2 -translate-y-1/2 z-20 h-5 w-5 bg-black/20 rounded-full text-white/70 hover:bg-[var(--color-health)] hover:text-white transition-colors" data-tooltip="Сбросить временные ОЗ" aria-label="Сбросить временные ОЗ">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        }
                    </div>

                    {/* Health Controls - Compact row */}
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={hpAmount}
                            onChange={(e) => setHpAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-hidden focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                            min="0"
                            placeholder="0"
                        />
                        <div className="grid grid-cols-3 gap-1.5 flex-grow">
                            <button
                                onClick={() => dispatch({ type: 'APPLY_HEALTH_CHANGE', payload: { amount: hpAmount, type: 'damage' } })}
                                className="bg-linear-to-r from-red-600/80 to-rose-600/80 hover:from-red-500 hover:to-rose-600 border border-red-500/30 text-white font-semibold py-1 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-[0.97] text-center whitespace-nowrap"
                            >
                                Урон
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'APPLY_HEALTH_CHANGE', payload: { amount: hpAmount, type: 'heal' } })}
                                className="bg-linear-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500 hover:to-teal-600 border border-emerald-500/30 text-white font-semibold py-1 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-[0.97] text-center whitespace-nowrap"
                            >
                                Лечение
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'APPLY_HEALTH_CHANGE', payload: { amount: hpAmount, type: 'temp' } })}
                                className="bg-linear-to-r from-blue-600/80 to-indigo-600/80 hover:from-blue-500 hover:to-indigo-600 border border-blue-500/30 text-white font-semibold py-1 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-[0.97] text-center whitespace-nowrap"
                            >
                                Врем. ОЗ
                            </button>
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--color-border)] opacity-20 my-0.5"></div>

                {/* Section 2: Hit Dice, Rests and Size */}
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 items-start">
                        {/* Hit Dice Display */}
                        <div className="flex flex-col gap-1 text-left">
                            <span className="text-xs font-semibold text-[var(--color-text-medium)] tracking-wider uppercase">Кости здоровья:</span>
                            <div className="flex items-center gap-1 mt-1 min-h-[24px]">
                                {isEditingHitDice ? (
                                    <input
                                        type="number"
                                        value={editedHitDice}
                                        onChange={(e) => setEditedHitDice(parseInt(e.target.value, 10))}
                                        onBlur={handleHitDiceSubmit}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleHitDiceSubmit();
                                            if (e.key === 'Escape') {
                                                setEditedHitDice(character.currentHitDice);
                                                setIsEditingHitDice(false);
                                            }
                                        }}
                                        className="w-10 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded py-0 px-1 text-center text-xs font-bold focus:outline-hidden focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                                        autoFocus
                                        onFocus={(e) => e.target.select()}
                                        min="0"
                                        max={character.totalHitDice}
                                    />
                                ) : (
                                    <span
                                        className="text-sm font-bold text-[var(--color-text-base)] cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors"
                                        onClick={() => setIsEditingHitDice(true)}
                                        data-tooltip="Изменить текущее количество костей здоровья"
                                    >
                                        {character.currentHitDice}
                                    </span>
                                )}
                                <span className="text-[var(--color-text-subtle)] text-xs">/</span>
                                <span className="text-sm font-bold text-[var(--color-text-base)]">{character.totalHitDice}</span>
                                <span className="text-[var(--color-text-muted)] text-xs ml-1">(d{character.hitDie})</span>
                            </div>
                        </div>

                        {/* Size selector */}
                        <div className="flex flex-col gap-1 text-left">
                            <span className="text-xs font-semibold text-[var(--color-text-medium)] tracking-wider uppercase">Размер:</span>
                            <select
                                id="character-size"
                                value={character.size}
                                onChange={(e) => dispatch({ type: 'SET_SIZE', payload: parseInt(e.target.value, 10) as CharacterSize })}
                                className="w-full bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] rounded-lg py-1.5 px-3 focus:outline-hidden focus:ring-1 focus:ring-[var(--color-focus-ring)] text-xs font-bold text-[var(--color-text-base)] cursor-pointer"
                            >
                                {Object.entries(CHARACTER_SIZE_NAMES).map(([sizeKey, sizeName]) => (
                                    <option key={sizeKey} value={sizeKey}>{sizeName}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Rest Buttons Row */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={onOpenShortRest}
                            className="bg-linear-to-r from-teal-700/50 to-cyan-700/50 hover:from-teal-600/70 hover:to-cyan-600/70 border border-teal-500/20 text-teal-200 font-semibold py-1.5 px-3 rounded-lg text-xs transition-all duration-150 shadow active:scale-[0.97]"
                        >
                            Короткий отдых
                        </button>
                        <button
                            onClick={() => dispatch({ type: 'LONG_REST' })}
                            className="bg-linear-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 border border-teal-500/30 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-all duration-150 shadow-md active:scale-[0.97]"
                        >
                            Длинный отдых
                        </button>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--color-border)] opacity-20 my-0.5"></div>

                {/* Section 3: Experience (XP) */}
                <ExperienceBar
                    experience={character.experience}
                    level={character.level}
                    onAddXp={(amount) => dispatch({ type: 'SET_FIELD', payload: { field: 'experience', value: character.experience + amount }})}
                    minimal={true}
                />
            </div>

            {/* Right Area: Grid of all 9 characteristics cards */}
            <div className="col-span-1 lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-rows-3 lg:grid-cols-3 gap-3">
                <CombatStats
                    scores={effectiveAbilityScores}
                    abilityBonuses={character.abilityBonuses}
                    level={character.level}
                    currentHitPoints={character.currentHitPoints}
                    maxHitPoints={character.maxHitPoints}
                    temporaryHitPoints={character.temporaryHitPoints}
                    hitDie={character.hitDie}
                    maxHpBonus={character.maxHpBonus}
                    itemMaxHpBonus={equippedBonuses.maxHp}
                    acBonus={character.acBonus}
                    itemAcBonus={equippedBonuses.ac}
                    initiativeBonus={character.initiativeBonus}
                    itemInitiativeBonus={equippedBonuses.initiative}
                    proficiencyBonusBonus={character.proficiencyBonusBonus}
                    itemProficiencyBonus={equippedBonuses.proficiencyBonus}
                    baseAC={character.baseAC}
                    acAbilitySources={character.acAbilitySources}
                    onBonusChange={(field, value) => dispatch({ type: 'SET_BONUS', payload: { field, value } })}
                    onBaseACChange={(value) => dispatch({ type: 'SET_BASE_AC', payload: value })}
                    onToggleAbilitySource={(ability) => dispatch({ type: 'TOGGLE_AC_ABILITY_SOURCE', payload: ability })}
                    flat={true}
                />

                <Speed
                    speed={character.speed}
                    speedBonus={character.speedBonus}
                    itemSpeedBonus={equippedBonuses.speed}
                    longJumpBonus={character.longJumpBonus}
                    itemLongJumpBonus={equippedBonuses.longJump}
                    highJumpBonus={character.highJumpBonus}
                    itemHighJumpBonus={equippedBonuses.highJump}
                    scores={effectiveAbilityScores}
                    onSpeedChange={(newSpeed) => dispatch({ type: 'SET_FIELD', payload: { field: 'speed', value: newSpeed } })}
                    onSpeedBonusChange={(newBonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'speedBonus', value: newBonus } })}
                    onLongJumpBonusChange={(newBonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'longJumpBonus', value: newBonus } })}
                    onHighJumpBonusChange={(newBonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'highJumpBonus', value: newBonus } })}
                    flat={true}
                />

                <PassiveSenses
                    skills={character.skills}
                    abilityBonuses={character.abilityBonuses}
                    skillBonuses={character.skillBonuses}
                    level={character.level}
                    passivePerceptionBonus={character.passivePerceptionBonus}
                    itemPassivePerceptionBonus={(equippedBonuses.skills['Внимательность'] || 0) + equippedBonuses.passivePerception}
                    passiveInvestigationBonus={character.passiveInvestigationBonus}
                    itemPassiveInvestigationBonus={(equippedBonuses.skills['Расследование'] || 0) + equippedBonuses.passiveInvestigation}
                    passiveInsightBonus={character.passiveInsightBonus}
                    itemPassiveInsightBonus={(equippedBonuses.skills['Проницательность'] || 0) + equippedBonuses.passiveInsight}
                    proficiencyBonusBonus={character.proficiencyBonusBonus}
                    scores={effectiveAbilityScores}
                    onPerceptionBonusChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'passivePerceptionBonus', value: bonus } })}
                    onInvestigationBonusChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'passiveInvestigationBonus', value: bonus } })}
                    onInsightBonusChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'passiveInsightBonus', value: bonus } })}
                    flat={true}
                />
            </div>
        </div>
    );
});

StatusDashboard.displayName = 'StatusDashboard';
