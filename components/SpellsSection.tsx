import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Spell, Ability, MagicSchool, RollType } from '../types';
import { MAGIC_SCHOOL_NAMES, MAGIC_SCHOOL_COLORS, ABILITY_NAMES } from '../constants';
import { EditableBonus } from './EditableBonus';
import { useCharacter } from '../context/CharacterContext';
import { useNotifier } from '../context/NotificationContext';
import { calculateModifier, calculateProficiencyBonus } from '../utils/characterCalculations';
import { getEquippedItemBonuses } from '../utils/inventory';

interface SpellsSectionProps {
    onAddSpell: () => void;
    onEditSpell: (spell: Spell) => void;
    onRollHit?: (name: string, modifier: number, rollType: RollType) => void;
    onRequestRollHit?: (e: React.MouseEvent, name: string, modifier: number) => void;
}

const SpellCard: React.FC<{ 
    spell: Spell, 
    onEdit: () => void, 
    onTogglePrepared: () => void,
    onCast: () => void,
    isCastDisabled: boolean,
    isExpanded: boolean,
    onToggleExpand: () => void,
    isPrepareDisabled: boolean,
    draggable: boolean,
    onDragStart: (e: React.DragEvent) => void,
    onDragEnd: (e: React.DragEvent) => void,
    onDragOver: (e: React.DragEvent) => void,
    onDragLeave: (e: React.DragEvent) => void,
    onDrop: (e: React.DragEvent) => void,
    isBeingDragged: boolean,
    isDropTarget: boolean,
    dragActive: boolean,
}> = ({ 
    spell, onEdit, onTogglePrepared, onCast, isCastDisabled, isExpanded, onToggleExpand, isPrepareDisabled,
    draggable, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, isBeingDragged, isDropTarget,
    dragActive
}) => {
    const componentsString = useMemo(() => {
        const parts = [];
        if (spell.components?.verbal) parts.push('V');
        if (spell.components?.somatic) parts.push('S');
        if (spell.components?.material) parts.push('M');
        return parts.join(', ');
    }, [spell.components]);

    const schoolColorClass = MAGIC_SCHOOL_COLORS[spell.school] || 'border-gray-500';

    const handleActionClick = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation();
        action();
    }

    const prepareLabel = spell.isPrepared 
        ? `Убрать заклинание ${spell.name} из подготовленных` 
        : isPrepareDisabled 
        ? `Невозможно подготовить заклинание ${spell.name}, достигнут лимит` 
        : `Подготовить заклинание ${spell.name}`;

    return (
        <div 
            onClick={onToggleExpand}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`p-3 rounded-lg flex gap-3 border-2 transition-all duration-200 cursor-pointer ${
                dragActive ? 'drag-active' : ''
            } ${
                isDropTarget ? 'border-[var(--color-accent-primary)] border-dashed scale-[1.02]' : schoolColorClass
            } ${isBeingDragged ? 'opacity-40' : ''} ${
                spell.level === 0 
                    ? 'bg-[#151c2c]' 
                    : spell.isPrepared 
                    ? 'bg-[#151c2c] border-l-[var(--color-accent-primary)]/50' 
                    : 'bg-[var(--color-surface-inset)] opacity-70 hover:opacity-100'
            }`}
        >
            {spell.imageUrl && (
                <div className="w-12 h-12 bg-black/20 rounded-md flex-shrink-0 overflow-hidden shadow-inner">
                    <img src={spell.imageUrl} alt={spell.name} className="w-full h-full object-cover"/>
                </div>
            )}
            <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-[var(--color-text-base)]">{spell.name}</h4>
                        {spell.requiresConcentration && (
                            <span data-tooltip="Концентрация" className="w-5 h-5 flex items-center justify-center bg-purple-500/20 text-purple-300 border border-purple-400/30 rounded-full text-xs font-bold">К</span>
                        )}
                        {spell.isRitual && (
                            <span data-tooltip="Ритуал" className="w-5 h-5 flex items-center justify-center bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-full text-xs font-bold">Р</span>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                    <button onClick={(e) => handleActionClick(e, onEdit)} className="p-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors flex-shrink-0" data-tooltip="Редактировать" aria-label={`Редактировать заклинание ${spell.name}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                    </button>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] flex items-center flex-wrap gap-x-2 mb-1">
                    {componentsString && (
                        <>
                            <span className="font-semibold">{componentsString}</span>
                            <span className="text-[var(--color-text-subtle)]">•</span>
                        </>
                    )}
                    <span>{MAGIC_SCHOOL_NAMES[spell.school]}</span>
                    <span className="text-[var(--color-text-subtle)]">•</span>
                    <span>{spell.castingTime}</span>
                    {spell.range && (
                        <>
                            <span className="text-[var(--color-text-subtle)]">•</span>
                            <span>{spell.range}</span>
                        </>
                    )}
                    {spell.duration && (
                        <>
                            <span className="text-[var(--color-text-subtle)]">•</span>
                            <span>{spell.duration}</span>
                        </>
                    )}
                </div>
                {spell.components?.material && spell.components.materialDescription && (
                    <div className="text-xs text-amber-300/80 mb-2 pl-2 border-l-2 border-amber-400/30 break-words">
                        <span className="font-semibold">Материалы:</span> {spell.components.materialDescription}
                    </div>
                )}
                <div className={`transition-all duration-300 ease-in-out grid ${isExpanded ? 'grid-rows-[1fr] opacity-100 pt-2' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                        <p className="text-sm text-[var(--color-text-medium)] whitespace-pre-wrap break-words">{spell.description}</p>
                    </div>
                </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
                 <button 
                    onClick={(e) => handleActionClick(e, onCast)}
                    disabled={isCastDisabled}
                    className={`p-1.5 rounded-lg transition-all ${
                        isCastDisabled 
                            ? 'bg-gray-700/20 text-gray-500 cursor-not-allowed opacity-50' 
                            : 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/20 active:scale-95'
                    }`}
                    data-tooltip={isCastDisabled ? 'Нет доступных ячеек для сотворения' : spell.level === 0 ? 'Сотворить заговор' : 'Сотворить заклинание (потратить ячейку)'}
                    aria-label={`Сотворить заклинание ${spell.name}`}
                 >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                         <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                     </svg>
                 </button>

                 {spell.level > 0 && (
                      <button 
                         onClick={(e) => handleActionClick(e, onTogglePrepared)}
                         className={`p-1 text-[var(--color-text-muted)] transition-colors ${!isPrepareDisabled ? 'hover:text-[var(--color-accent-primary)]' : 'cursor-not-allowed opacity-50'}`}
                         data-tooltip={spell.isPrepared ? 'Убрать из подготовленных' : isPrepareDisabled ? 'Достигнут лимит подготовленных заклинаний' : 'Подготовить'}
                         disabled={isPrepareDisabled}
                         aria-label={prepareLabel}
                     >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                             <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" 
                             className={`transition-colors duration-200 ${spell.isPrepared ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-border)]'}`}
                             />
                         </svg>
                     </button>
                 )}
            </div>
        </div>
    );
};

export const SpellsSection: React.FC<SpellsSectionProps> = React.memo(({ onAddSpell, onEditSpell, onRollHit, onRequestRollHit }) => {
    const { character, dispatch } = useCharacter();
    const { 
        spells, spellSlots, spellcastingAbility, maxPreparedSpells, 
        spellSaveDcBonus, spellAttackBonusBonus, scores, abilityBonuses, 
        level, proficiencyBonusBonus
    } = character;
    
    const { addNotification } = useNotifier();
    
    // --- LOCAL UI STATE ---
    const [expandedSpells, setExpandedSpells] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('dnd_expanded_spells');
            return saved ? new Set(JSON.parse(saved)) : new Set<string>();
        } catch {
            return new Set<string>();
        }
    });
    const [sortBy, setSortBy] = useState<'manual' | 'name' | 'school'>('manual');
    const [sortAsc, setSortAsc] = useState(true);
    const [schoolFilter, setSchoolFilter] = useState<MagicSchool[]>([]);
    const [nameFilter, setNameFilter] = useState('');
    
    const [isGloballyCollapsed, setIsGloballyCollapsed] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('dnd_spells_globally_collapsed');
            return saved ? JSON.parse(saved) : false;
        } catch {
            return false;
        }
    });
    const [collapsedLevels, setCollapsedLevels] = useState<Set<number>>(() => {
        try {
            const saved = localStorage.getItem('dnd_spells_collapsed_levels');
            return saved ? new Set(JSON.parse(saved)) : new Set<number>();
        } catch {
            return new Set<number>();
        }
    });

    // --- SYNC TO LOCAL STORAGE ---
    useEffect(() => {
        localStorage.setItem('dnd_expanded_spells', JSON.stringify(Array.from(expandedSpells)));
    }, [expandedSpells]);

    useEffect(() => {
        localStorage.setItem('dnd_spells_globally_collapsed', JSON.stringify(isGloballyCollapsed));
    }, [isGloballyCollapsed]);

    useEffect(() => {
        localStorage.setItem('dnd_spells_collapsed_levels', JSON.stringify(Array.from(collapsedLevels)));
    }, [collapsedLevels]);

    // Drag-and-drop states
    const [draggedSpellId, setDraggedSpellId] = useState<string | null>(null);
    const [dragOverSpellId, setDragOverSpellId] = useState<string | null>(null);
    const [dragOverLevel, setDragOverLevel] = useState<number | null>(null);

    // --- DERIVED VALUES (MEMOIZED) ---
    const equippedBonuses = useMemo(() => getEquippedItemBonuses(character), [character]);
    const proficiencyBonus = useMemo(() => calculateProficiencyBonus(level) + proficiencyBonusBonus, [level, proficiencyBonusBonus]);
    const spellcastingModifier = useMemo(() => {
        const baseScore = scores[spellcastingAbility] || 10;
        const itemBonus = equippedBonuses.abilityScores?.[spellcastingAbility] || 0;
        const effectiveScore = baseScore + itemBonus;
        return calculateModifier(effectiveScore) + (abilityBonuses[spellcastingAbility] || 0);
    }, [scores, equippedBonuses.abilityScores, spellcastingAbility, abilityBonuses]);
    const spellSaveDc = useMemo(() => 8 + proficiencyBonus + spellcastingModifier + spellSaveDcBonus + (equippedBonuses.spellSaveDC || 0), [proficiencyBonus, spellcastingModifier, spellSaveDcBonus, equippedBonuses.spellSaveDC]);
    const spellAttackBonus = useMemo(() => proficiencyBonus + spellcastingModifier + spellAttackBonusBonus, [proficiencyBonus, spellcastingModifier, spellAttackBonusBonus]);
    const preparedCount = useMemo(() => spells.filter(s => s.isPrepared && s.level > 0).length, [spells]);
    const canPrepareMore = useMemo(() => maxPreparedSpells > 0 && preparedCount < maxPreparedSpells, [preparedCount, maxPreparedSpells]);

    // --- CALLBACKS ---
    const onTogglePrepared = useCallback((spellId: string) => {
        const spell = spells.find(s => s.id === spellId);
        if (!spell) return;
        
        if (!spell.isPrepared && spell.level > 0 && maxPreparedSpells > 0 && preparedCount >= maxPreparedSpells) {
            addNotification('Достигнут лимит подготовленных заклинаний.', 'warning');
            return;
        }

        dispatch({ type: 'TOGGLE_SPELL_PREPARED', payload: spellId });
    }, [dispatch, spells, maxPreparedSpells, preparedCount, addNotification]);

    const handleToggleExpand = (spellId: string) => {
        setExpandedSpells(prev => {
            const newSet = new Set(prev);
            if (newSet.has(spellId)) newSet.delete(spellId); else newSet.add(spellId);
            return newSet;
        });
    };

    const toggleSchoolFilter = (school: MagicSchool) => {
        setSchoolFilter(prev => prev.includes(school) ? prev.filter(s => s !== school) : [...prev, school]);
    };

    const resetFilters = () => {
        setSchoolFilter([]);
        setNameFilter('');
    };

    // Drag-and-drop handlers
    const handleDragStart = (e: React.DragEvent, spellId: string) => {
        setDraggedSpellId(spellId);
    };

    const handleDragEnd = () => {
        setDraggedSpellId(null);
        setDragOverSpellId(null);
        setDragOverLevel(null);
    };

    const handleDragOver = (e: React.DragEvent, spellId: string) => {
        if (draggedSpellId && draggedSpellId !== spellId) {
            e.preventDefault();
            setDragOverSpellId(spellId);
        }
    };

    const handleDragLeave = () => {
        setDragOverSpellId(null);
    };

    const handleDropSpell = (e: React.DragEvent, targetSpellId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedSpellId && draggedSpellId !== targetSpellId) {
            dispatch({
                type: 'MOVE_AND_REORDER_SPELL',
                payload: { spellId: draggedSpellId, targetSpellId }
            });
        }
        handleDragEnd();
    };

    const handleDragOverLevel = (e: React.DragEvent, level: number) => {
        if (draggedSpellId) {
            e.preventDefault();
            setDragOverLevel(level);
        }
    };

    const handleDragLeaveLevel = () => {
        setDragOverLevel(null);
    };

    const handleDropLevel = (e: React.DragEvent, targetLevel: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedSpellId) {
            dispatch({
                type: 'MOVE_AND_REORDER_SPELL',
                payload: { spellId: draggedSpellId, targetLevel }
            });
        }
        handleDragEnd();
    };

    const toggleLevelCollapse = useCallback((lvl: number) => {
        setCollapsedLevels(prev => {
            const newSet = new Set(prev);
            if (newSet.has(lvl)) newSet.delete(lvl); else newSet.add(lvl);
            return newSet;
        });
    }, []);

    const handleCastSpell = useCallback((spell: Spell) => {
        if (spell.level === 0) {
            addNotification(`Сотворен заговор: "${spell.name}"!`, 'info');
            return;
        }

        const slots = spellSlots[spell.level];
        if (!slots || slots.total === 0) {
            addNotification(`Ошибка: у вас нет ячеек ${spell.level}-го уровня!`, 'warning');
            return;
        }

        if (slots.used >= slots.total) {
            addNotification(`Ошибка: все ячейки ${spell.level}-го уровня уже использованы!`, 'warning');
            return;
        }

        dispatch({
            type: 'USE_SPELL_SLOT',
            payload: { level: spell.level, used: slots.used + 1 }
        });

        addNotification(`Сотворено заклинание: "${spell.name}" (${spell.level} уровень). Ячейка использована!`, 'success');
    }, [dispatch, spellSlots, addNotification]);

    const spellsByLevel = useMemo(() => {
        const lowerCaseNameFilter = nameFilter.toLowerCase().trim();
        const filteredSpells = spells.filter(spell => 
            (lowerCaseNameFilter ? spell.name.toLowerCase().includes(lowerCaseNameFilter) : true) &&
            (schoolFilter.length > 0 ? schoolFilter.includes(spell.school) : true)
        );
        
        const grouped = filteredSpells.reduce((acc, spell) => {
            (acc[spell.level] = acc[spell.level] || []).push(spell);
            return acc;
        }, {} as Record<number, Spell[]>);

        if (sortBy !== 'manual') {
            for (const levelStr in grouped) {
                const level = Number(levelStr);
                const list = grouped[level];
                if (list) {
                    list.sort((a, b) => {
                        const compare = (sortBy === 'name')
                            ? a.name.localeCompare(b.name, 'ru')
                            : MAGIC_SCHOOL_NAMES[a.school].localeCompare(MAGIC_SCHOOL_NAMES[b.school], 'ru') || a.name.localeCompare(b.name, 'ru');
                        return sortAsc ? compare : -compare;
                    });
                }
            }
        }
        
        return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)));
    }, [spells, nameFilter, schoolFilter, sortBy, sortAsc]);
    
    const isFilterActive = nameFilter.length > 0 || schoolFilter.length > 0;

    return (
        <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/40 flex-wrap gap-4 select-none">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsGloballyCollapsed(!isGloballyCollapsed)}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-base)] transition-transform duration-200 ${isGloballyCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        <h2 className="text-xl font-semibold tracking-wide text-[var(--color-text-base)]">Заклинания</h2>
                    </div>
                    {!isGloballyCollapsed && (
                        <button
                            onClick={onAddSpell}
                            className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 border border-teal-500/30 text-white font-bold py-1.5 px-3.5 rounded-lg text-xs transition-all duration-150 shadow active:scale-[0.97] flex items-center gap-1"
                        >
                            <span>+ Добавить</span>
                        </button>
                    )}
                </div>
                {!isGloballyCollapsed && (
                    <div className="flex items-center gap-5 bg-[var(--color-surface-well)] border border-slate-700/40 p-3 rounded-2xl flex-wrap shadow-inner">
                        <div className="flex flex-col gap-1 text-left">
                            <label className="text-[10px] text-[var(--color-text-muted)] tracking-wider uppercase font-semibold pl-1">Базовая хар-ка</label>
                            <div className="relative flex items-center">
                                <select 
                                    value={spellcastingAbility} 
                                    onChange={e => dispatch({type: 'SET_SPELLCASTING_ABILITY', payload: e.target.value as Ability})} 
                                    className="bg-[var(--color-surface-inset)] hover:bg-[var(--color-surface-raised)] border border-slate-700/50 rounded-xl py-1 pl-2.5 pr-8 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] appearance-none h-8"
                                    style={{ backgroundImage: 'none', paddingRight: '28px' }}
                                    data-tooltip="Характеристика, используемая для сотворения заклинаний вашего класса"
                                >
                                    {Object.entries(ABILITY_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                                </select>
                                <span className="absolute right-2 pointer-events-none text-[var(--color-text-muted)] text-[8px] leading-none">▼</span>
                            </div>
                        </div>
                        <div 
                            className="flex flex-col items-center justify-between min-h-[48px]"
                            data-tooltip="Сложность спасброска от заклинаний. Формула: 8 + Бонус Мастерства + Модификатор Характеристики + Бонус"
                        >
                            <span className="text-2xl font-extrabold text-[var(--color-text-base)] tracking-tight leading-none">{spellSaveDc}</span>
                            <p className="text-[10px] text-[var(--color-text-muted)] tracking-wider uppercase font-bold mt-1">Сл. спасброска</p>
                            <div className="flex justify-center mt-1 items-center gap-1">
                                <EditableBonus value={spellSaveDcBonus} onChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'spellSaveDcBonus', value: bonus } })} />
                                {equippedBonuses.spellSaveDC !== 0 && (
                                    <span className="text-[10px] text-teal-400 font-semibold cursor-default" data-tooltip="Бонус от экипированных предметов">
                                        {equippedBonuses.spellSaveDC > 0 ? '+' : ''}{equippedBonuses.spellSaveDC}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-center justify-between min-h-[48px]">
                            <div 
                                className="text-center cursor-pointer group flex flex-col items-center"
                                onClick={() => onRollHit?.("Атака заклинанием", spellAttackBonus, RollType.Normal)}
                                onContextMenu={(e) => onRequestRollHit?.(e, "Атака заклинанием", spellAttackBonus)}
                                data-tooltip="Бонус к броску атаки заклинанием. Формула: Бонус Мастерства + Модификатор Характеристики + Бонус&#10;&#10;ЛКМ: сделать бросок атаки&#10;ПКМ: с преимуществом/помехой"
                            >
                                <span className="text-2xl font-extrabold text-[var(--color-text-base)] group-hover:text-[var(--color-accent-primary-light)] transition-colors tracking-tight leading-none">
                                    {spellAttackBonus >= 0 ? `+${spellAttackBonus}`: spellAttackBonus}
                                </span>
                                <p className="text-[10px] text-[var(--color-text-muted)] tracking-wider uppercase font-bold mt-1 group-hover:text-[var(--color-accent-primary-light)] transition-colors">Бонус атаки</p>
                            </div>
                            <div className="flex justify-center mt-1">
                               <EditableBonus value={spellAttackBonusBonus} onChange={(bonus) => dispatch({ type: 'SET_BONUS', payload: { field: 'spellAttackBonusBonus', value: bonus } })} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!isGloballyCollapsed && (
                <>
                    <div className={`bg-[var(--color-surface-inset)] p-3 rounded-lg flex items-center justify-between mb-4 transition-colors ${!canPrepareMore && maxPreparedSpells > 0 ? 'bg-[var(--color-accent-secondary)]/10' : ''}`}>
                        <span className="text-sm font-semibold text-[var(--color-text-medium)]">Подготовлено заклинаний</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold transition-colors ${!canPrepareMore && maxPreparedSpells > 0 ? 'text-[var(--color-accent-secondary)]' : 'text-[var(--color-text-base)]'}`}>{preparedCount} /</span>
                             <input
                                type="number"
                                value={maxPreparedSpells}
                                onChange={(e) => dispatch({ type: 'SET_MAX_PREPARED_SPELLS', payload: parseInt(e.target.value) || 0 })}
                                min={0}
                                className="w-14 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-1 text-center text-lg font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                                data-tooltip="Максимальное количество подготавливаемых заклинаний (0 для классов без подготовки)"
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="p-3 bg-[var(--color-surface-inset)] rounded-lg space-y-3">
                            <div className="flex flex-col md:flex-row gap-3">
                                <input type="text" placeholder="Поиск по названию..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} className="w-full md:w-1/3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-[var(--color-text-medium)] focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] placeholder:text-[var(--color-text-subtle)]" />
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-[var(--color-text-muted)]">Сортировать по:</label>
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                                        <option value="manual">Вручную</option>
                                        <option value="name">Названию</option>
                                        <option value="school">Школе</option>
                                    </select>
                                    {sortBy !== 'manual' && (
                                        <button onClick={() => setSortAsc(!sortAsc)} className="p-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-well)] transition-colors" data-tooltip={sortAsc ? 'По возрастанию' : 'По убыванию'}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${sortAsc ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                             <div className="flex flex-wrap gap-2 items-center">
                                {Object.entries(MAGIC_SCHOOL_NAMES).map(([key, name]) => {
                                    const school = parseInt(key) as MagicSchool;
                                    const isActive = schoolFilter.includes(school);
                                    const colorClass = MAGIC_SCHOOL_COLORS[school].replace('border-', 'bg-');
                                    const activeClass = isActive ? `${MAGIC_SCHOOL_COLORS[school]} text-white/90` : `border-transparent text-[var(--color-text-muted)]`;
                                    return <button key={school} onClick={() => toggleSchoolFilter(school)} className={`px-3 py-1 text-xs font-semibold rounded-full border-2 transition-colors ${activeClass} hover:${colorClass}/40`}>{name}</button>
                                })}
                                {isFilterActive && <button onClick={resetFilters} className="px-3 py-1 text-xs font-semibold rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-health)]/20 hover:text-[var(--color-health)] transition-colors">Сбросить</button>}
                            </div>
                        </div>

                        {Object.keys(spellsByLevel).length > 0 ? Object.entries(spellsByLevel).map(([levelStr, levelSpellsUnknown]) => {
                            const levelSpells = levelSpellsUnknown as Spell[];
                            const level = parseInt(levelStr);
                            const slots = spellSlots[level] || { total: 0, used: 0 };
                            
                            if(level > 0 && slots.total === 0 && levelSpells.length === 0 && !isFilterActive) return null;
                            
                            const levelName = level === 0 ? "Заговоры" : `${level} уровень`;
                            const isCollapsed = collapsedLevels.has(level);

                            return (
                                <div 
                                    key={level}
                                    className={`p-2 rounded-lg transition-all duration-200 ${
                                        dragOverLevel === level ? 'bg-[var(--color-accent-primary)]/10 border-2 border-dashed border-[var(--color-accent-primary)]/40' : ''
                                    }`}
                                    onDragOver={sortBy === 'manual' ? (e) => handleDragOverLevel(e, level) : undefined}
                                    onDragLeave={sortBy === 'manual' ? handleDragLeaveLevel : undefined}
                                    onDrop={sortBy === 'manual' ? (e) => handleDropLevel(e, level) : undefined}
                                >
                                    <div className="flex justify-between items-center mb-3 pb-1 border-b border-slate-700/20 flex-wrap gap-2 select-none">
                                        <div 
                                            className="flex items-center gap-2 cursor-pointer group py-1"
                                            onClick={() => toggleLevelCollapse(level)}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-base)] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                            </svg>
                                            <h3 className="text-base font-semibold text-[var(--color-text-base)] group-hover:text-white transition-colors">{levelName}</h3>
                                            <span className="text-xs text-[var(--color-text-subtle)] bg-[var(--color-surface-well)] px-1.5 py-0.5 rounded border border-slate-700/30">({levelSpells.length})</span>
                                        </div>
                                        {!isCollapsed && level > 0 && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-[var(--color-text-muted)]">Ячейки:</span>
                                                <input type="number" value={slots.total} onChange={e => dispatch({type: 'SET_SPELL_SLOTS', payload: {level, total: parseInt(e.target.value) || 0}})} min="0" className="w-12 bg-[var(--color-surface-inset)] border border-[var(--color-border)] rounded-md py-0.5 px-1 text-center font-semibold" data-tooltip="Максимальное количество ячеек заклинаний этого уровня" />
                                                <div className="flex flex-wrap gap-1.5 items-center">
                                                    {slots.total > 0 ? (
                                                        Array.from({ length: slots.total }).map((_, i) => (
                                                            <button key={i} onClick={() => dispatch({type: 'USE_SPELL_SLOT', payload: {level, used: (i < slots.used) ? i : i + 1}})}
                                                                className={`w-6 h-6 rounded-lg border-2 transition-all duration-200 transform hover:scale-110 active:scale-95 ${i < slots.used ? 'bg-transparent border-[var(--color-border)] opacity-50' : 'bg-[var(--color-accent-tertiary)] border-[var(--color-accent-tertiary-dark)] shadow-[0_0_8px_0px_var(--color-accent-tertiary-dark)]'}`}
                                                                aria-label={`Ячейка ${i + 1} ${i < slots.used ? 'использована' : 'доступна'}`}
                                                                data-tooltip={i < slots.used ? 'Ячейка использована. Нажмите, чтобы восстановить' : 'Ячейка доступна. Нажмите, чтобы использовать'}
                                                            />
                                                        ))
                                                    ) : ( <span className="text-xs text-[var(--color-text-subtle)]">Нет ячеек</span> )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {!isCollapsed && (
                                        <div className="space-y-2">
                                            {levelSpells.map(spell => (
                                                <SpellCard 
                                                    key={spell.id} 
                                                    spell={spell} 
                                                    onEdit={() => onEditSpell(spell)} 
                                                    onTogglePrepared={() => onTogglePrepared(spell.id)}
                                                    onCast={() => handleCastSpell(spell)}
                                                    isCastDisabled={spell.level > 0 && ((spellSlots[spell.level]?.total || 0) === 0 || (spellSlots[spell.level]?.used || 0) >= (spellSlots[spell.level]?.total || 0))}
                                                    isExpanded={expandedSpells.has(spell.id)}
                                                    onToggleExpand={() => handleToggleExpand(spell.id)}
                                                    isPrepareDisabled={(level > 0 && !spell.isPrepared && !canPrepareMore)}
                                                    draggable={sortBy === 'manual'}
                                                    onDragStart={(e) => handleDragStart(e, spell.id)}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={(e) => handleDragOver(e, spell.id)}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={(e) => handleDropSpell(e, spell.id)}
                                                    isBeingDragged={draggedSpellId === spell.id}
                                                    isDropTarget={dragOverSpellId === spell.id}
                                                    dragActive={draggedSpellId !== null}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }) : (
                             <div className="text-center py-8 text-[var(--color-text-subtle)] border-2 border-dashed border-[var(--color-border)] rounded-lg">
                                <p>Заклинания не найдены.</p>
                                <p className="text-sm">Попробуйте изменить фильтры или добавить новое заклинание.</p>
                            </div>
                        )}
                    </div>

                </>
            )}
        </div>
    );
});