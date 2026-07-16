import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CharacterHeader } from './CharacterHeader';
import { CombatStats } from './CombatStats';
import { SkillCheck } from './SkillCheck';
import { SavingThrowCheck } from './SavingThrowCheck';
import { ExperienceBar } from './ExperienceBar';
import { RollToast } from './RollToast';
import { LevelUpModal } from './LevelUpModal';
import { DiceRollerModal } from './DiceRollerModal';

import { Inventory } from './Inventory';
import { ItemDetailModal } from './ItemDetailModal';
import { HitDiceAndRest } from './HitDiceAndRest';
import { ShortRestModal } from './ShortRestModal';
import { Speed } from './Speed';
import { EditableBonus } from './EditableBonus';
import { ChestViewModal } from './ChestViewModal';
import { FeaturesSection } from './FeaturesSection';
import { FeatureDetailModal } from './FeatureDetailModal';
import { PassiveSenses } from './PassiveSenses';
import { AttacksSection } from './AttacksSection';
import { AttackDetailModal } from './AttackDetailModal';
import { SpellsSection } from './SpellsSection';
import { SpellDetailModal } from './SpellDetailModal';
import { RollContextMenu } from './RollContextMenu';
import { NotesSection } from './NotesSection';
import { Ability, RollResult, Skill, InventoryItem, DropLocation, CharacterSize, Feature, ProficiencyLevel, Attack, RollType, Spell, HitDie } from '../types';
import { XP_THRESHOLDS, CHARACTER_SIZE_NAMES, ABILITY_NAMES } from '../constants';
import { useNotifier } from '../context/NotificationContext';
import { calculateModifier } from '../utils/characterCalculations';
import { parseAndRoll } from '../utils/dice';
import { useCharacter } from '../context/CharacterContext';
import { generateUUID } from '../utils/uuid';
import { getEquippedItemBonuses } from '../utils/inventory';
import { isOwlbear } from '../utils/storage';
import OBR from '@owlbear-rodeo/sdk';

interface CharacterSheetProps {
    onOpenCharacterManager: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onOpenHistoryLog: () => void;
    isReadOnly?: boolean;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({
    onOpenCharacterManager,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onOpenHistoryLog,
    isReadOnly = false,
}) => {
    // --- CONTEXT HOOKS ---
    const { character, dispatch } = useCharacter();
    
    // --- NOTIFICATION HOOK ---
    const { addNotification, broadcastRoll } = useNotifier();
    
    // --- LOCAL UI STATE ---
    const [isLevelUpModalOpen, setIsLevelUpModalOpen] = useState(false);
    const [isShortRestModalOpen, setIsShortRestModalOpen] = useState(false);
    const [rollToastData, setRollToastData] = useState<RollResult | null>(null);
    const [isDiceRollerOpen, setIsDiceRollerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'stats' | 'combat' | 'inventory' | 'features' | 'notes'>('stats');
    const [isEditingTabs, setIsEditingTabs] = useState(false);
    const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
    const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);

    const defaultTabOrder = useMemo(() => ['stats', 'combat', 'inventory', 'features', 'notes'], []);
    const tabLabels: Record<string, string> = useMemo(() => ({
        stats: 'Характеристики и навыки',
        combat: 'Бой и заклинания',
        inventory: 'Снаряжение',
        features: 'Способности',
        notes: 'Заметки'
    }), []);

    const tabOrder = useMemo(() => {
        const savedOrder = character.tabOrder || [];
        const filteredSaved = savedOrder.filter(id => defaultTabOrder.includes(id));
        const missing = defaultTabOrder.filter(id => !filteredSaved.includes(id));
        return [...filteredSaved, ...missing];
    }, [character.tabOrder, defaultTabOrder]);

    const moveTab = useCallback((index: number, direction: 'left' | 'right') => {
        const targetIndex = direction === 'left' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= tabOrder.length) return;
        const newOrder = [...tabOrder];
        const temp = newOrder[index]!;
        newOrder[index] = newOrder[targetIndex]!;
        newOrder[targetIndex] = temp;
        dispatch({ type: 'REORDER_TABS', payload: newOrder });
    }, [tabOrder, dispatch]);

    const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;
        const newOrder = [...tabOrder];
        const [draggedTab] = newOrder.splice(fromIndex, 1);
        if (draggedTab !== undefined) {
            newOrder.splice(toIndex, 0, draggedTab);
        }
        dispatch({ type: 'REORDER_TABS', payload: newOrder });
    }, [tabOrder, dispatch]);
    const [isRollingDice, setIsRollingDice] = useState(false);
    const [editingSlot, setEditingSlot] = useState<DropLocation | null>(null);
    const [draggedItemInfo, setDraggedItemInfo] = useState<DropLocation | null>(null);
    const [viewingChestId, setViewingChestId] = useState<string | null>(null);
    const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
    const [isNewFeature, setIsNewFeature] = useState(false);
    const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
    const [editingAttack, setEditingAttack] = useState<Attack | null>(null);
    const [isNewAttack, setIsNewAttack] = useState(false);
    const [editingSpell, setEditingSpell] = useState<Spell | null>(null);
    const [overAttunedItem, setOverAttunedItem] = useState<InventoryItem | null>(null);
    const [isNewSpell, setIsNewSpell] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, name: string, modifier: number, bonusDiceFormula?: string } | null>(null);
    const [customIcons, setCustomIcons] = useState<string[]>(() => {
        try {
            const savedIcons = localStorage.getItem('dnd-custom-icons');
            return savedIcons ? JSON.parse(savedIcons) : [];
        } catch (error) {
            console.error("Не удалось загрузить пользовательские иконки:", error);
            return [];
        }
    });

    const rollToastTimerRef = useRef<number | null>(null);
    const rollDelayTimerRef = useRef<number | null>(null);

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

    // --- CUSTOM ICONS PERSISTENCE ---
    useEffect(() => {
        try {
            localStorage.setItem('dnd-custom-icons', JSON.stringify(customIcons));
        } catch (error) {
            console.error("Не удалось сохранить пользовательские иконки:", error);
            addNotification("Не удалось сохранить библиотеку иконок. Возможно, хранилище заполнено.", 'error');
        }
    }, [customIcons, addNotification]);

    // --- DERIVED VALUES (MEMOIZED) ---
    const equippedBonuses = useMemo(() => getEquippedItemBonuses(character), [character]);

    const effectiveAbilityScores = useMemo(() => {
        return (Object.values(Ability) as Ability[]).reduce((acc, ability) => {
            acc[ability] = character.scores[ability] + (equippedBonuses.abilityScores[ability] || 0);
            return acc;
        }, {} as Record<Ability, number>)
    }, [character.scores, equippedBonuses]);

    const abilityModifiers = useMemo(() => {
        return (Object.values(Ability) as Ability[]).reduce((acc, ability) => {
            acc[ability] = calculateModifier(effectiveAbilityScores[ability]) + (character.abilityBonuses[ability] || 0);
            return acc;
        }, {} as Record<Ability, number>)
    }, [effectiveAbilityScores, character.abilityBonuses]);

    const xpToNextLevel = XP_THRESHOLDS[character.level] ?? XP_THRESHOLDS[XP_THRESHOLDS.length - 1] ?? 0;
    
    const viewingChestItem = useMemo(() => {
        if (!viewingChestId) return null;
        const allItems = [...(character.inventory || []), ...(character.equippedItems || [])];
        return allItems.find(item => item?.id === viewingChestId && item.isChest) || null;
    }, [viewingChestId, character.inventory, character.equippedItems]);
    
    const itemToEdit = useMemo(() => {
        if (!editingSlot) return null;
        const { container, index, chestId } = editingSlot;
        if (container === 'inventory') return character.inventory[index] ?? null;
        if (container === 'doll' as any) return (character.equippedItems || [])[index] ?? null;
        if (container === 'chest' && chestId) {
            const allItems = [...(character.inventory || []), ...(character.equippedItems || [])];
            const chestItem = allItems.find(item => item?.id === chestId);
            return chestItem?.chestInventory ? (chestItem.chestInventory[index] ?? null) : null;
        }
        return null;
    }, [editingSlot, character.inventory, character.equippedItems]);
        
    // --- EFFECTS ---
    useEffect(() => {
        if (character.level < 20 && character.experience >= xpToNextLevel) {
            setIsLevelUpModalOpen(true);
        }
    }, [character.experience, character.level, xpToNextLevel]);

    const maxAttuned = useMemo(() => {
        return 3 + (character.attunementMaxBonus || 0) + (equippedBonuses.attunementMax || 0);
    }, [character.attunementMaxBonus, equippedBonuses.attunementMax]);

    const attunedItems = useMemo(() => {
        return (character.inventory || []).filter(item => item && item.isAttuned) as InventoryItem[];
    }, [character.inventory]);

    useEffect(() => {
        if (attunedItems.length > maxAttuned) {
            // Sort by attunementTimestamp descending (latest attuned is first)
            const sorted = [...attunedItems].sort((a, b) => {
                const timeA = a.attunementTimestamp || 0;
                const timeB = b.attunementTimestamp || 0;
                return timeB - timeA;
            });
            const latestAttuned = sorted[0];
            if (latestAttuned) {
                setOverAttunedItem(latestAttuned);
            }
        } else {
            setOverAttunedItem(null);
        }
    }, [attunedItems, maxAttuned]);
    
    useEffect(() => {
        setViewingChestId(null);
    }, [character.name]);

    useEffect(() => {
        return () => {
            if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
            if (rollDelayTimerRef.current) clearTimeout(rollDelayTimerRef.current);
        };
    }, []);


    // --- HANDLERS (CALLBACKS) ---
    const handleRoll = useCallback((name: string, modifier: number, rollType: RollType, bonusDiceFormula?: string) => {
        if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
        setRollToastData(null);
        setIsRollingDice(true);
        setContextMenu(null); // Close context menu immediately

        if (rollDelayTimerRef.current) clearTimeout(rollDelayTimerRef.current);
        rollDelayTimerRef.current = window.setTimeout(() => {
            rollDelayTimerRef.current = null;
            const roll1 = Math.floor(Math.random() * 20) + 1;
            let roll2: number | undefined = undefined;
            let chosenRoll: number;

            if (rollType === RollType.Normal) {
                chosenRoll = roll1;
            } else {
                roll2 = Math.floor(Math.random() * 20) + 1;
                chosenRoll = rollType === RollType.Advantage
                    ? Math.max(roll1, roll2)
                    : Math.min(roll1, roll2);
            }
            
            let bonusDiceResult = { total: 0 };
            if (bonusDiceFormula) {
                bonusDiceResult = parseAndRoll(bonusDiceFormula);
            }

            const rollResult = {
                id: generateUUID(),
                name,
                roll1,
                roll2,
                chosenRoll,
                modifier,
                total: chosenRoll + modifier + bonusDiceResult.total,
                rollType,
                diceType: 'd20',
                bonusDiceRoll: bonusDiceFormula ? bonusDiceResult.total : undefined,
                bonusDiceFormula: bonusDiceFormula || undefined,
            };
            setRollToastData(rollResult);
            broadcastRoll(character.name, rollResult);
            setIsRollingDice(false);
            rollToastTimerRef.current = window.setTimeout(() => setRollToastData(null), 3400);
        }, 800);
    }, []);
    
    const handleDamageRoll = useCallback((name: string, damageFormula: string) => {
        if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
        setRollToastData(null);
        setIsRollingDice(true);

        if (rollDelayTimerRef.current) clearTimeout(rollDelayTimerRef.current);
        rollDelayTimerRef.current = window.setTimeout(() => {
            rollDelayTimerRef.current = null;
            const { total, diceResult, modifier } = parseAndRoll(damageFormula);

            const rollResult = {
                id: generateUUID(),
                name: `Урон: ${name}`,
                roll1: diceResult, 
                chosenRoll: diceResult,
                modifier: modifier,
                total: total,
                rollType: RollType.Normal,
                diceType: damageFormula,
            };
            setRollToastData(rollResult);
            broadcastRoll(character.name, rollResult);
            setIsRollingDice(false);
            rollToastTimerRef.current = window.setTimeout(() => setRollToastData(null), 3400);
        }, 800);
    }, []);

    const handleRollRequest = (e: React.MouseEvent, name: string, modifier: number, bonusDiceFormula?: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, name, modifier, bonusDiceFormula });
    };

    const handleLevelChange = useCallback((newLevel: number) => {
        if (newLevel === character.level + 1 && newLevel <= 20) {
            setIsLevelUpModalOpen(true);
        } else {
            dispatch({ type: 'SET_LEVEL', payload: newLevel });
        }
    }, [character.level, dispatch]);
  
    const handleItemDrop = useCallback((destination: DropLocation) => {
        if (!draggedItemInfo) return;
    
        if (draggedItemInfo.container === 'doll' as any) {
            if (destination.container === 'inventory') {
                dispatch({ 
                    type: 'UNEQUIP_ITEM_FROM_DOLL', 
                    payload: { itemIndex: draggedItemInfo.index, targetInventoryIndex: destination.index } 
                });
            }
            setDraggedItemInfo(null);
            return;
        }

        dispatch({ type: 'MOVE_ITEM', payload: { source: draggedItemInfo, destination } });
        setDraggedItemInfo(null);
    }, [draggedItemInfo, dispatch]);

    const handleDragEnd = useCallback(() => {
        setDraggedItemInfo(null);
    }, []);

    const handleInventorySlotClick = useCallback((index: number, e?: React.MouseEvent, fromDoll?: boolean) => {
        if (fromDoll) {
            const item = (character.equippedItems || [])[index];
            if (item) {
                if (item.isChest && !e?.altKey) {
                    setViewingChestId(item.id);
                } else {
                    setEditingSlot({ container: 'doll' as any, index });
                }
            }
            return;
        }

        const item = character.inventory[index];
        if (item?.isChest && !e?.altKey) {
            setViewingChestId(item.id);
        } else {
            setEditingSlot({ container: 'inventory', index });
        }
    }, [character.inventory, character.equippedItems]);


  
    const handleAddCustomIcon = useCallback((iconDataUrl: string) => {
        setCustomIcons(prevIcons => prevIcons.includes(iconDataUrl) ? prevIcons : [...prevIcons, iconDataUrl]);
    }, []);

    const handleDeleteCustomIcon = useCallback((iconDataUrl: string) => {
        setCustomIcons(prevIcons => prevIcons.filter(icon => icon !== iconDataUrl));
        dispatch({ type: 'DELETE_CUSTOM_ICON_REFERENCES', payload: iconDataUrl });
    }, [dispatch]);
  
    const handleConfirmOverAttunementRemoval = useCallback(() => {
        if (overAttunedItem) {
            dispatch({ type: 'UNATTUNE_ITEM', payload: overAttunedItem.id });
            setOverAttunedItem(null);
            addNotification(`Снята настройка с предмета "${overAttunedItem.name}" в связи с лимитом`, 'warning');
        }
    }, [overAttunedItem, dispatch, addNotification]);

    const handleSaveItem = useCallback((itemData: InventoryItem | null) => {
        if (!editingSlot) return;
        dispatch({ type: 'UPDATE_ITEM', payload: { location: editingSlot, itemData: itemData ? { ...itemData, id: itemData.id || generateUUID() } : null } });
        setEditingSlot(null);
    }, [editingSlot, dispatch]);

    const handleDeleteItem = useCallback(() => {
        if(editingSlot) {
            handleSaveItem(null);
        }
    }, [editingSlot, handleSaveItem]);

    const handleAddNewFeature = useCallback((groupId?: string) => {
        setIsNewFeature(true);
        setEditingFeature(null);
        setTargetGroupId(groupId || null);
    }, []);

    const handleEditFeature = useCallback((feature: Feature) => {
        setIsNewFeature(false);
        setEditingFeature(feature);
    }, []);

    const handleSaveFeature = useCallback((feature: Feature, selectedGroupId: string) => {
        if (isNewFeature) {
            const newId = generateUUID();
            dispatch({ type: 'ADD_FEATURE_TO_GROUP', payload: { feature: { ...feature, id: newId }, groupId: selectedGroupId } });
        } else {
            dispatch({ type: 'UPDATE_FEATURE', payload: feature });
            const currentGroup = (character.featureGroups || []).find(g => g.featureIds.includes(feature.id));
            if (currentGroup && currentGroup.id !== selectedGroupId) {
                dispatch({
                    type: 'MOVE_FEATURE',
                    payload: {
                        featureId: feature.id,
                        sourceGroupId: currentGroup.id,
                        targetGroupId: selectedGroupId,
                        targetIndex: 0
                    }
                });
            }
        }
        setEditingFeature(null);
        setIsNewFeature(false);
        setTargetGroupId(null);
    }, [dispatch, isNewFeature, character.featureGroups]);

    const handleDeleteFeature = useCallback((id: string) => {
        dispatch({ type: 'DELETE_FEATURE', payload: id });
        setEditingFeature(null);
        setIsNewFeature(false);
    }, [dispatch]);

    const handleAddNewAttack = useCallback(() => {
        setIsNewAttack(true);
        setEditingAttack(null);
    }, []);

    const handleEditAttack = useCallback((attack: Attack) => {
        setIsNewAttack(false);
        setEditingAttack(attack);
    }, []);

    const handleSaveAttack = useCallback((attack: Attack) => {
        if (isNewAttack) {
            dispatch({ type: 'ADD_ATTACK', payload: { ...attack, id: generateUUID() } });
        } else {
            dispatch({ type: 'UPDATE_ATTACK', payload: attack });
        }
        setEditingAttack(null);
        setIsNewAttack(false);
    }, [dispatch, isNewAttack]);

    const handleDeleteAttack = useCallback((id: string) => {
        dispatch({ type: 'DELETE_ATTACK', payload: id });
        setEditingAttack(null);
        setIsNewAttack(false);
    }, [dispatch]);

    const handleAddNewSpell = useCallback(() => {
        setIsNewSpell(true);
        setEditingSpell(null);
    }, []);

    const handleEditSpell = useCallback((spell: Spell) => {
        setIsNewSpell(false);
        setEditingSpell(spell);
    }, []);

    const handleSaveSpell = useCallback((spell: Spell) => {
        if (isNewSpell) {
            dispatch({ type: 'ADD_SPELL', payload: { ...spell, id: generateUUID() } });
        } else {
            dispatch({ type: 'UPDATE_SPELL', payload: spell });
        }
        setEditingSpell(null);
        setIsNewSpell(false);
    }, [dispatch, isNewSpell]);

    const handleDeleteSpell = useCallback((id: string) => {
        dispatch({ type: 'DELETE_SPELL', payload: id });
        setEditingSpell(null);
        setIsNewSpell(false);
    }, [dispatch]);

    const renderTabContent = useCallback((tabId: string) => {
        switch (tabId) {
            case 'stats':
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
                                        onClick={() => handleRoll(`Проверка: ${abilityName}`, abilityModifiers[ability], RollType.Normal)}
                                        onContextMenu={(e) => handleRollRequest(e, `Проверка: ${abilityName}`, abilityModifiers[ability])}
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
                                                    onClick={() => dispatch({ type: 'SET_SCORE', payload: { ability, score: character.scores[ability] - 1 } })}
                                                    className="bg-[var(--color-surface-raised)] hover:bg-[var(--color-accent-primary)]/20 hover:text-[var(--color-accent-primary-light)] w-6 h-6 rounded-lg text-sm font-bold flex items-center justify-center transition-all duration-150 active:scale-90 border border-slate-700/30 hover:border-teal-500/30"
                                                    aria-label={`Уменьшить ${abilityName}`}
                                                    data-tooltip="Уменьшить характеристику"
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
                                                    onClick={() => dispatch({ type: 'SET_SCORE', payload: { ability, score: character.scores[ability] + 1 } })}
                                                    className="bg-[var(--color-surface-raised)] hover:bg-[var(--color-accent-primary)]/20 hover:text-[var(--color-accent-primary-light)] w-6 h-6 rounded-lg text-sm font-bold flex items-center justify-center transition-all duration-150 active:scale-90 border border-slate-700/30 hover:border-teal-500/30"
                                                    aria-label={`Увеличить ${abilityName}`}
                                                    data-tooltip="Увеличить характеристику"
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
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                                        <SavingThrowCheck
                                            ability={ability}
                                            modifier={abilityModifiers[ability]}
                                            isProficient={character.savingThrowProficiencies[ability]}
                                            onProficiencyToggle={() => dispatch({ type: 'SET_SAVING_THROW_PROF', payload: ability })}
                                            onRoll={handleRoll}
                                            onRequestRoll={handleRollRequest}
                                            savingThrowBonus={character.savingThrowBonuses[ability] || 0}
                                            itemSavingThrowBonus={equippedBonuses.savingThrows?.[ability] || 0}
                                            onSavingThrowBonusChange={(_, bonus) => dispatch({ type: 'SET_SAVING_THROW_BONUS', payload: { ability, bonus }})}
                                            level={character.level}
                                            proficiencyBonusBonus={character.proficiencyBonusBonus}
                                        />
                                        {skillsForAbility.map(skill => (
                                            <SkillCheck 
                                                key={skill.name}
                                                skill={skill}
                                                abilityModifier={abilityModifiers[skill.ability]}
                                                onProficiencyChange={(name) => dispatch({ type: 'SET_PROFICIENCY', payload: name })}
                                                onRoll={handleRoll}
                                                onRequestRoll={handleRollRequest}
                                                skillBonus={character.skillBonuses[skill.name] || 0}
                                                itemSkillBonus={equippedBonuses.skills[skill.name] || 0}
                                                onSkillBonusChange={(name, bonus) => dispatch({ type: 'SET_SKILL_BONUS', payload: { skillName: name, bonus }})}
                                                level={character.level}
                                                proficiencyBonusBonus={character.proficiencyBonusBonus}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            case 'combat':
                return (
                    <div className="space-y-6 animate-fade-in">
                        <AttacksSection
                            onAddAttack={handleAddNewAttack}
                            onEditAttack={handleEditAttack}
                            onRollHit={handleRoll}
                            onRequestRollHit={handleRollRequest}
                            onRollDamage={handleDamageRoll}
                        />
                        <SpellsSection
                            onAddSpell={handleAddNewSpell}
                            onEditSpell={handleEditSpell}
                            onRollHit={handleRoll}
                            onRequestRollHit={handleRollRequest}
                        />
                    </div>
                );
            case 'inventory':
                return (
                    <div className="space-y-6 animate-fade-in">
                        <Inventory
                            onItemDragStart={(index) => setDraggedItemInfo({ container: 'inventory', index })}
                            onDollItemDragStart={(index) => setDraggedItemInfo({ container: 'doll' as any, index })}
                            onItemDrop={(index) => handleItemDrop({ container: 'inventory', index })}
                            onSlotClick={handleInventorySlotClick}
                            draggedItemInfo={draggedItemInfo}
                            onItemDragEnd={handleDragEnd}
                        />
                    </div>
                );
            case 'features':
                return (
                    <div className="space-y-6 animate-fade-in">
                        <FeaturesSection
                            onAddFeature={handleAddNewFeature}
                            onEditFeature={handleEditFeature}
                        />
                    </div>
                );
            case 'notes':
                return (
                    <div className="space-y-6 animate-fade-in">
                        <NotesSection />
                    </div>
                );
            default:
                return null;
        }
    }, [
        character,
        effectiveAbilityScores,
        abilityModifiers,
        equippedBonuses,
        draggedItemInfo,
        handleRoll,
        handleRollRequest,
        handleDamageRoll,
        handleAddNewAttack,
        handleEditAttack,
        handleAddNewSpell,
        handleEditSpell,
        handleAddNewFeature,
        handleEditFeature,
        handleInventorySlotClick,
        handleItemDrop,
        handleDragEnd,
        dispatch
    ]);

    const isFeatureModalOpen = !!editingFeature || isNewFeature;
    const featureToEdit = isNewFeature ? null : editingFeature;

    const isAttackModalOpen = !!editingAttack || isNewAttack;
    const attackToEdit = isNewAttack ? null : editingAttack;

    const isSpellModalOpen = !!editingSpell || isNewSpell;
    const spellToEdit = isNewSpell ? null : editingSpell;

    const currentViewMode = character.viewMode || 'tabs';

    const renderControlsBarRight = () => (
        <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* View Mode Toggle Button Group */}
            <div className="flex items-center bg-[var(--color-surface-well)] border border-slate-700/50 rounded-lg p-0.5">
                <button
                    onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'tabs' })}
                    className={`view-mode-btn p-1 rounded transition-all duration-150 ${
                        currentViewMode === 'tabs'
                            ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary-light)]'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)]'
                    }`}
                    data-tooltip="Режим вкладок"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                </button>
                <button
                    onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'scroll' })}
                    className={`view-mode-btn p-1 rounded transition-all duration-150 ${
                        currentViewMode === 'scroll'
                            ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary-light)]'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)]'
                    }`}
                    data-tooltip="Режим ленты"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            {/* Customize Tabs Toggle Button */}
            <button
                onClick={() => setIsEditingTabs(!isEditingTabs)}
                className={`p-1.5 rounded-lg border transition-all duration-200 flex items-center justify-center ${
                    isEditingTabs
                        ? 'bg-[var(--color-accent-primary)]/20 border-[var(--color-accent-primary)] text-[var(--color-accent-primary-light)]'
                        : 'bg-[var(--color-surface-well)] border border-slate-700/30 text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)]'
                }`}
                data-tooltip={isEditingTabs ? "Закончить настройку" : "Настроить порядок"}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 transition-transform duration-300 ${isEditingTabs ? 'animate-spin-slow' : 'hover:rotate-45'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </button>
        </div>
    );

    return (
        <>
            {/* Universal Dice Roller Modal */}
            <DiceRollerModal
                isOpen={isDiceRollerOpen}
                onClose={() => setIsDiceRollerOpen(false)}
                character={character}
                onRoll={(result) => {
                    if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
                    setRollToastData(result);
                    broadcastRoll(character.name, result);
                    rollToastTimerRef.current = window.setTimeout(() => setRollToastData(null), 3400);
                }}
                onRollingStatusChange={setIsRollingDice}
            />

            <main className={`min-h-screen p-4 md:p-8${isReadOnly ? ' is-readonly' : ''}`}>
            {/* Low HP Danger Pulsing Vignette */}
            {character.currentHitPoints / character.maxHitPoints <= 0.2 && character.currentHitPoints > 0 && (
                <div className="fixed inset-0 pointer-events-none z-50 animate-pulse-danger ring-[12px] ring-red-600/30 md:ring-[20px]"></div>
            )}

            {/* d20 Dice Spinner overlay */}
            {isRollingDice && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-fade-in pointer-events-auto select-none">
                    <div className="relative w-28 h-28 animate-spin-dice">
                        <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--color-accent-primary)] drop-shadow-[0_0_15px_var(--color-accent-primary)]">
                            <polygon points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25" fill="none" stroke="currentColor" strokeWidth="2.5" />
                            <polygon points="50,30 93.3,25 50,0" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="50,30 6.7,25 50,0" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="50,30 50,70 93.3,75" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="50,30 50,70 6.7,75" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="50,70 93.3,75 50,100" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="50,70 6.7,75 50,100" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="6.7,25 50,30 6.7,75" fill="none" stroke="currentColor" strokeWidth="2" />
                            <polygon points="93.3,25 50,30 93.3,75" fill="none" stroke="currentColor" strokeWidth="2" />
                            <text x="50" y="58" textAnchor="middle" fill="currentColor" className="text-xl font-extrabold font-mono tracking-tighter">20</text>
                        </svg>
                    </div>
                    <span className="mt-4 text-[var(--color-text-base)] text-lg font-bold tracking-widest uppercase animate-pulse">Бросаем кубы...</span>
                </div>
            )}

            {rollToastData && <RollToast key={rollToastData.id} result={rollToastData} />}
            {contextMenu && (
                <RollContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    onRollAdvantage={() => handleRoll(contextMenu.name, contextMenu.modifier, RollType.Advantage, contextMenu.bonusDiceFormula)}
                    onRollDisadvantage={() => handleRoll(contextMenu.name, contextMenu.modifier, RollType.Disadvantage, contextMenu.bonusDiceFormula)}
                />
            )}
            
            <LevelUpModal 
                isOpen={isLevelUpModalOpen} 
                onClose={() => setIsLevelUpModalOpen(false)}
                onConfirm={(method) => {
                    // Бросок кости для HP вынесен из reducer: выполняется здесь (source of randomness).
                    // При method='average' бросок не нужен.
                    const hpRoll = method === 'roll' ? (Math.floor(Math.random() * character.hitDie) + 1) : undefined;
                    dispatch({ type: 'LEVEL_UP', payload: { method, hpRoll } });
                    setIsLevelUpModalOpen(false);
                }}
                hitDie={character.hitDie}
                conModifier={calculateModifier(character.scores[Ability.CON])}
            />
            <ShortRestModal
                isOpen={isShortRestModalOpen}
                onClose={() => setIsShortRestModalOpen(false)}
                onConfirm={(diceToSpend) => {
                    // Бросок костей выполняется в компоненте (source of randomness),
                    // reducer получает уже детерминированные результаты.
                    const diceResults: number[] = [];
                    for (let i = 0; i < diceToSpend; i++) {
                        diceResults.push(Math.floor(Math.random() * character.hitDie) + 1);
                    }
                    dispatch({ type: 'SHORT_REST', payload: { diceResults, conModifier: abilityModifiers[Ability.CON] } });
                    setIsShortRestModalOpen(false);
                }}
                maxDice={character.currentHitDice}
                hitDie={character.hitDie}
                conModifier={abilityModifiers[Ability.CON]}
            />
            <div className={isReadOnly ? 'is-readonly' : ''}>
                {editingSlot && (
                    <ItemDetailModal
                        character={character}
                        isOpen={!!editingSlot}
                        onClose={() => setEditingSlot(null)}
                        item={itemToEdit}
                        onSave={handleSaveItem}
                        onDelete={handleDeleteItem}
                        customIcons={customIcons}
                        onAddCustomIcon={handleAddCustomIcon}
                        onDeleteCustomIcon={handleDeleteCustomIcon}
                    />
                )}
                {isFeatureModalOpen && (
                    <FeatureDetailModal
                        isOpen={isFeatureModalOpen}
                        onClose={() => { setEditingFeature(null); setIsNewFeature(false); setTargetGroupId(null); }}
                        feature={featureToEdit}
                        onSave={handleSaveFeature}
                        onDelete={handleDeleteFeature}
                        groups={character.featureGroups || []}
                        initialGroupId={featureToEdit ? (character.featureGroups || []).find(g => g.featureIds.includes(featureToEdit.id))?.id || 'default' : targetGroupId || (character.featureGroups && character.featureGroups[0]?.id) || 'default'}
                    />
                )}
                {isAttackModalOpen && (
                    <AttackDetailModal
                        isOpen={isAttackModalOpen}
                        onClose={() => { setEditingAttack(null); setIsNewAttack(false); }}
                        attack={attackToEdit}
                        onSave={handleSaveAttack}
                        onDelete={handleDeleteAttack}
                        customIcons={customIcons}
                        onAddCustomIcon={handleAddCustomIcon}
                        onDeleteCustomIcon={handleDeleteCustomIcon}
                    />
                )}
                {isSpellModalOpen && (
                    <SpellDetailModal
                        isOpen={isSpellModalOpen}
                        onClose={() => { setEditingSpell(null); setIsNewSpell(false); }}
                        spell={spellToEdit}
                        onSave={handleSaveSpell}
                        onDelete={handleDeleteSpell}
                        customIcons={customIcons}
                        onAddCustomIcon={handleAddCustomIcon}
                        onDeleteCustomIcon={handleDeleteCustomIcon}
                    />
                )}
                {viewingChestItem && (
                    <ChestViewModal
                        isOpen={!!viewingChestItem}
                        onClose={() => setViewingChestId(null)}
                        chestItem={viewingChestItem}
                        onSlotClick={(index) => setEditingSlot({ container: 'chest', index, chestId: viewingChestItem.id })}
                        draggedItemInfo={draggedItemInfo}
                        onItemDragStart={(index) => setDraggedItemInfo({ container: 'chest', index, chestId: viewingChestItem.id })}
                        onItemDrop={handleItemDrop}
                        onItemDragEnd={handleDragEnd}
                    />
                )}
            </div>

            {overAttunedItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
                    <div className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-md border border-[var(--color-border)] text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-[var(--color-text-base)] mb-2">Превышен лимит настройки!</h3>
                        <p className="text-sm text-[var(--color-text-medium)] mb-4">
                            Максимальное количество настроенных предметов снизилось. Настройка с предмета <strong>{overAttunedItem.name}</strong> будет снята.
                        </p>
                        {overAttunedItem.imageUrl && (
                            <div className="w-20 h-20 mx-auto mb-4 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] shadow-inner">
                                <img src={overAttunedItem.imageUrl} alt={overAttunedItem.name} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <button
                            onClick={handleConfirmOverAttunementRemoval}
                            className="w-full justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-health)] text-base font-semibold text-white hover:bg-red-600 focus:outline-none transition-all duration-150 active:scale-95"
                        >
                            Хорошо (Снять настройку)
                        </button>
                    </div>
                </div>
            )}

            {/* Global Dice Roller FAB */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setIsDiceRollerOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsDiceRollerOpen(true);
                    }
                }}
                className="dice-fab fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.5)] hover:shadow-[0_0_25px_rgba(20,184,166,0.8)] hover:scale-110 active:scale-95 transition-all duration-150 border border-teal-400/30 group cursor-pointer"
                data-tooltip="Открыть универсальный бросок кубиков"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-7 h-7 transform group-hover:rotate-12 transition-transform duration-200"
                    viewBox="0 0 100 100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                >
                    <polygon points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25" fill="none" stroke="currentColor" strokeWidth="4" />
                    <polygon points="50,30 93.3,25 50,0" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="50,30 6.7,25 50,0" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="50,30 50,70 93.3,75" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="50,30 50,70 6.7,75" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="50,70 93.3,75 50,100" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="50,70 6.7,75 50,100" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="6.7,25 50,30 6.7,75" fill="none" stroke="currentColor" strokeWidth="3" />
                    <polygon points="93.3,25 50,30 93.3,75" fill="none" stroke="currentColor" strokeWidth="3" />
                    <text x="50" y="58" textAnchor="middle" fill="currentColor" className="text-xl font-extrabold font-mono tracking-tighter" strokeWidth="0">20</text>
                </svg>
            </div>



            <div className="max-w-[1600px] mx-auto space-y-6 px-2 md:px-4">
                
                <CharacterHeader 
                    onLevelChange={handleLevelChange}
                    onOpenCharacterManager={onOpenCharacterManager}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onOpenHistoryLog={onOpenHistoryLog}
                />

                {/* Top Dashboard Grid (Horizontal Panel) */}
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
                                                className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
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
                                        className="bg-[var(--color-surface-well)] hover:bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded py-1 pl-2.5 pr-6 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] appearance-none"
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
                                    <button onClick={() => dispatch({ type: 'SET_FIELD', payload: { field: 'temporaryHitPoints', value: 0 } })} className="absolute right-1 top-1/2 -translate-y-1/2 z-20 h-5 w-5 bg-black/20 rounded-full text-white/70 hover:bg-[var(--color-health)] hover:text-white transition-colors" data-tooltip="Сбросить временные ОЗ">
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
                                    className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                    min="0"
                                    placeholder="0"
                                />
                                <div className="grid grid-cols-3 gap-1.5 flex-grow">
                                    <button 
                                        onClick={() => dispatch({ type: 'APPLY_HEALTH_CHANGE', payload: { amount: hpAmount, type: 'damage' } })} 
                                        className="bg-gradient-to-r from-red-600/80 to-rose-600/80 hover:from-red-500 hover:to-rose-600 border border-red-500/30 text-white font-semibold py-1 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-[0.97] text-center whitespace-nowrap"
                                    >
                                        Урон
                                    </button>
                                    <button 
                                        onClick={() => dispatch({ type: 'APPLY_HEALTH_CHANGE', payload: { amount: hpAmount, type: 'heal' } })} 
                                        className="bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500 hover:to-teal-600 border border-emerald-500/30 text-white font-semibold py-1 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-[0.97] text-center whitespace-nowrap"
                                    >
                                        Лечение
                                    </button>
                                    <button 
                                        onClick={() => dispatch({ type: 'APPLY_HEALTH_CHANGE', payload: { amount: hpAmount, type: 'temp' } })} 
                                        className="bg-gradient-to-r from-blue-600/80 to-indigo-600/80 hover:from-blue-500 hover:to-indigo-600 border border-blue-500/30 text-white font-semibold py-1 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-[0.97] text-center whitespace-nowrap"
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
                                                className="w-10 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded py-0 px-1 text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
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
                                        className="w-full bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] rounded-lg py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-xs font-bold text-[var(--color-text-base)] cursor-pointer"
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
                                    onClick={() => setIsShortRestModalOpen(true)}
                                    className="bg-gradient-to-r from-teal-700/50 to-cyan-700/50 hover:from-teal-600/70 hover:to-cyan-600/70 border border-teal-500/20 text-teal-200 font-semibold py-1.5 px-3 rounded-lg text-xs transition-all duration-150 shadow active:scale-[0.97]"
                                >
                                    Короткий отдых
                                </button>
                                <button 
                                    onClick={() => dispatch({ type: 'LONG_REST' })}
                                    className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 border border-teal-500/30 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-all duration-150 shadow-md active:scale-[0.97]"
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

                {/* Bottom Tabs Section (Full Width) */}
                <div className="space-y-6 min-w-0">
                        {/* Tabs Selector / Header Toolbar */}
                        {currentViewMode === 'tabs' ? (
                            <div className={`flex items-center border-b border-[var(--color-border)] pb-2 overflow-x-auto scrollbar-none gap-2 select-none justify-between w-full ${isEditingTabs ? 'border-dashed border-teal-500/50' : ''}`}>
                                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-grow">
                                    {tabOrder.map((tabId, index) => {
                                        const label = tabLabels[tabId];
                                        const isDragOver = dragOverTabIndex === index;
                                        const isDragged = draggedTabIndex === index;
                                        
                                        return (
                                            <div
                                                key={tabId}
                                                draggable={isEditingTabs}
                                                onDragStart={(e) => {
                                                    if (!isEditingTabs) return;
                                                    setDraggedTabIndex(index);
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    e.dataTransfer.setData('text/plain', index.toString());
                                                }}
                                                onDragEnd={() => {
                                                    setDraggedTabIndex(null);
                                                    setDragOverTabIndex(null);
                                                }}
                                                onDragOver={(e) => {
                                                    if (!isEditingTabs) return;
                                                    e.preventDefault();
                                                }}
                                                onDragEnter={() => {
                                                    if (!isEditingTabs) return;
                                                    setDragOverTabIndex(index);
                                                }}
                                                onDrop={(e) => {
                                                    if (!isEditingTabs) return;
                                                    e.preventDefault();
                                                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                                    if (!isNaN(fromIndex)) {
                                                        handleTabReorder(fromIndex, index);
                                                    }
                                                }}
                                                className={`flex items-center gap-1.5 transition-all duration-200 rounded-lg ${
                                                    isEditingTabs 
                                                        ? 'border border-dashed border-[var(--color-border)] px-2 py-1 bg-[var(--color-surface-well)]/30 hover:bg-[var(--color-surface-well)]/65' 
                                                        : ''
                                                } ${isDragOver ? 'border-teal-500 bg-teal-500/10 scale-105' : ''} ${
                                                    isDragged ? 'opacity-40' : ''
                                                }`}
                                            >
                                                {isEditingTabs && (
                                                    <div 
                                                        className="cursor-grab active:cursor-grabbing p-0.5 text-[var(--color-text-muted)] hover:text-teal-400"
                                                        data-tooltip="Перетащите для изменения порядка"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M7 6a1 1 0 100-2 1 1 0 000 2zM7 11a1 1 0 100-2 1 1 0 000 2zM7 16a1 1 0 100-2 1 1 0 000 2zM13 6a1 1 0 100-2 1 1 0 000 2zM13 11a1 1 0 100-2 1 1 0 000 2zM13 16a1 1 0 100-2 1 1 0 000 2z" />
                                                        </svg>
                                                    </div>
                                                )}

                                                {isEditingTabs && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveTab(index, 'left'); }}
                                                        disabled={index === 0}
                                                        className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-teal-400 disabled:opacity-20 disabled:hover:text-[var(--color-text-muted)] transition-colors"
                                                        data-tooltip="Переместить влево"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                                        </svg>
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => {
                                                        if (!isEditingTabs) {
                                                            setActiveTab(tabId as any);
                                                        }
                                                    }}
                                                    disabled={isEditingTabs}
                                                    data-tooltip={
                                                        tabId === 'stats' ? "Раздел: Характеристики" :
                                                        tabId === 'combat' ? "Раздел: Бой и Здоровье" :
                                                        tabId === 'inventory' ? "Раздел: Инвентарь" :
                                                        tabId === 'features' ? "Раздел: Умения и Способности" :
                                                        tabId === 'notes' ? "Раздел: Заметки" : undefined
                                                    }
                                                    className={`tab-button px-3 py-1.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                                                        isEditingTabs 
                                                            ? 'text-[var(--color-text-base)] cursor-default' 
                                                            : activeTab === tabId
                                                                ? 'border-b-2 border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] drop-shadow-[0_0_8px_var(--color-accent-primary-light)]'
                                                                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)]'
                                                    }`}
                                                >
                                                    {label}
                                                </button>

                                                {isEditingTabs && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveTab(index, 'right'); }}
                                                        disabled={index === tabOrder.length - 1}
                                                        className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-teal-400 disabled:opacity-20 disabled:hover:text-[var(--color-text-muted)] transition-colors"
                                                        data-tooltip="Переместить вправо"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {renderControlsBarRight()}
                            </div>
                        ) : (
                            <div className={`flex items-center border-b border-[var(--color-border)] pb-2 select-none justify-between w-full ${isEditingTabs ? 'border-dashed border-teal-500/50' : ''}`}>
                                <div className="flex items-center gap-2 flex-grow">
                                    <span className="text-sm font-bold uppercase tracking-wider text-[var(--color-accent-primary)]">Разделы листа персонажа</span>
                                    {isEditingTabs && (
                                        <span className="text-[10px] text-[var(--color-text-muted)] italic font-semibold ml-2">
                                            (Перетаскивайте заголовки или используйте ▲ / ▼ для изменения порядка)
                                        </span>
                                    )}
                                </div>
                                {renderControlsBarRight()}
                            </div>
                        )}

                        {/* Tabs Layout Rendering */}
                        {currentViewMode === 'tabs' && renderTabContent(activeTab)}

                        {/* Scroll Layout Rendering */}
                        {currentViewMode === 'scroll' && (
                            <div className="space-y-6">
                                {tabOrder.map((tabId, index) => {
                                    const label = tabLabels[tabId];
                                    const isCollapsed = character.collapsedTabs?.[tabId] ?? false;
                                    const isDragOver = dragOverTabIndex === index;
                                    const isDragged = draggedTabIndex === index;
                                    
                                    return (
                                        <div
                                            key={tabId}
                                            draggable={isEditingTabs}
                                            onDragStart={(e) => {
                                                if (!isEditingTabs) return;
                                                setDraggedTabIndex(index);
                                                e.dataTransfer.effectAllowed = 'move';
                                                e.dataTransfer.setData('text/plain', index.toString());
                                            }}
                                            onDragEnd={() => {
                                                setDraggedTabIndex(null);
                                                setDragOverTabIndex(null);
                                            }}
                                            onDragOver={(e) => {
                                                if (!isEditingTabs) return;
                                                e.preventDefault();
                                            }}
                                            onDragEnter={() => {
                                                if (!isEditingTabs) return;
                                                setDragOverTabIndex(index);
                                            }}
                                            onDrop={(e) => {
                                                if (!isEditingTabs) return;
                                                e.preventDefault();
                                                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                                if (!isNaN(fromIndex)) {
                                                    handleTabReorder(fromIndex, index);
                                                }
                                            }}
                                            className={`bg-[var(--color-surface-translucent)] rounded-2xl border transition-all duration-300 overflow-hidden shadow-lg ${
                                                isEditingTabs ? 'border-dashed border-[var(--color-border)]' : 'border-[var(--color-border)]'
                                            } ${isDragOver ? 'border-teal-500 scale-[1.01]' : ''} ${isDragged ? 'opacity-40' : ''}`}
                                        >
                                            {/* Section Header */}
                                            <div 
                                                onClick={() => {
                                                    if (!isEditingTabs) {
                                                        dispatch({ type: 'TOGGLE_TAB_COLLAPSE', payload: tabId });
                                                    }
                                                }}
                                                className={`flex items-center justify-between p-4 bg-[var(--color-surface-well)]/85 select-none ${
                                                    isEditingTabs ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--color-surface-well)]'
                                                } transition-colors border-b border-[var(--color-border)]/50`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {!isEditingTabs && (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-[var(--color-text-medium)] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    )}
                                                    <h3 className="text-base font-bold text-[var(--color-text-base)]">{label}</h3>
                                                    {isCollapsed && !isEditingTabs && (
                                                        <span className="text-[10px] text-[var(--color-text-muted)] italic font-semibold">(свернуто)</span>
                                                    )}
                                                </div>

                                                {/* Customize Controls for Vertical Reordering */}
                                                {isEditingTabs && (
                                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                        <div 
                                                            className="cursor-grab active:cursor-grabbing p-1 text-[var(--color-text-muted)] hover:text-teal-400"
                                                            data-tooltip="Перетащите для изменения порядка"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M7 6a1 1 0 100-2 1 1 0 000 2zM7 11a1 1 0 100-2 1 1 0 000 2zM7 16a1 1 0 100-2 1 1 0 000 2zM13 6a1 1 0 100-2 1 1 0 000 2zM13 11a1 1 0 100-2 1 1 0 000 2zM13 16a1 1 0 100-2 1 1 0 000 2z" />
                                                            </svg>
                                                        </div>

                                                        <button
                                                            onClick={() => moveTab(index, 'left')} // moves up
                                                            disabled={index === 0}
                                                            className="p-1 rounded text-[var(--color-text-muted)] hover:text-teal-400 disabled:opacity-20 transition-colors"
                                                            data-tooltip="Переместить вверх"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                                            </svg>
                                                        </button>

                                                        <button
                                                            onClick={() => moveTab(index, 'right')} // moves down
                                                            disabled={index === tabOrder.length - 1}
                                                            className="p-1 rounded text-[var(--color-text-muted)] hover:text-teal-400 disabled:opacity-20 transition-colors"
                                                            data-tooltip="Переместить вниз"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content Block */}
                                            {(!isCollapsed || isEditingTabs) && (
                                                <div className="p-4 md:p-6 border-t border-[var(--color-border)]/30 bg-[var(--color-background)]/5">
                                                    {renderTabContent(tabId)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
            </div>
        </main>
        </>
    );
};