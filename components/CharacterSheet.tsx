import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '../utils/logger';
import { RollToast } from './RollToast';
import { SheetTabNavigation } from './SheetTabNavigation';

import { Inventory } from './Inventory';
import { FeaturesSection } from './FeaturesSection';
import { AttacksSection } from './AttacksSection';
import { SpellsSection } from './SpellsSection';
import { RollContextMenu } from './RollContextMenu';
import { NotesSection } from './NotesSection';
import { Ability, InventoryItem, DropLocation, Feature, Attack, RollType, Spell } from '../types';
import { XP_THRESHOLDS } from '../constants';
import { useNotifier } from '../context/NotificationContext';
import { calculateModifier } from '../utils/characterCalculations';
import { useCharacter } from '../context/CharacterContext';
import { generateUUID } from '../utils/uuid';
import { getEquippedItemBonuses } from '../utils/inventory';

import { SyncStatusType } from './SyncStatusIndicator';
import { SheetToolbar } from './sheet/SheetToolbar';
import { SheetModals } from './sheet/SheetModals';
import { DiceFab } from './sheet/DiceFab';
import { StatusDashboard } from './sheet/StatusDashboard';
import { ScrollTabsSection } from './sheet/ScrollTabsSection';
import { StatsGrid } from './sheet/StatsGrid';
import { useRollToast } from './sheet/useRollToast';

interface CharacterSheetProps {
    onOpenCharacterManager: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onOpenHistoryLog: () => void;
    isReadOnly?: boolean;
    syncStatus?: SyncStatusType;
    onSyncCharacter?: () => void;
    onClearLocalCache?: () => void;
    onDeleteCharacter?: () => void;
    onOpenStandalone?: () => void;
    isGM?: boolean;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({
    onOpenCharacterManager,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onOpenHistoryLog,
    isReadOnly = false,
    syncStatus,
    onSyncCharacter,
    onClearLocalCache,
    onDeleteCharacter,
    onOpenStandalone,
    isGM = true,
}) => {
    // --- CONTEXT HOOKS ---
    const { character, dispatch } = useCharacter();

    // --- NOTIFICATION HOOK ---
    const { addNotification } = useNotifier();

    // --- ROLL / TOAST STATE (extracted hook) ---
    const { rollToastData, isRollingDice, setIsRollingDice, handleRoll, handleDamageRoll, showRollResult } = useRollToast({
        characterName: character.name,
        onRollStart: () => setContextMenu(null),
    });

    // --- LOCAL UI STATE ---
    const [isLevelUpModalOpen, setIsLevelUpModalOpen] = useState(false);
    const [isShortRestModalOpen, setIsShortRestModalOpen] = useState(false);
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

    // Гарантируем, что activeTab всегда существует в tabOrder
    useEffect(() => {
        if (!tabOrder.includes(activeTab) && tabOrder.length > 0) {
            setActiveTab(tabOrder[0] as any);
        }
    }, [tabOrder, activeTab]);

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
            logger.error("Не удалось загрузить пользовательские иконки:", error);
            return [];
        }
    });

    // --- CUSTOM ICONS PERSISTENCE ---
    useEffect(() => {
        try {
            localStorage.setItem('dnd-custom-icons', JSON.stringify(customIcons));
        } catch (error) {
            logger.error("Не удалось сохранить пользовательские иконки:", error);
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


    // --- HANDLERS (CALLBACKS) ---
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
                    <StatsGrid
                        effectiveAbilityScores={effectiveAbilityScores}
                        abilityModifiers={abilityModifiers}
                        equippedBonuses={equippedBonuses}
                        onRoll={handleRoll}
                        onRequestRoll={handleRollRequest}
                        isReadOnly={isReadOnly}
                    />
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
        isReadOnly,
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
    const initialFeatureGroupId = featureToEdit
        ? (character.featureGroups || []).find(g => g.featureIds.includes(featureToEdit.id))?.id || 'default'
        : targetGroupId || (character.featureGroups && character.featureGroups[0]?.id) || 'default';

    const currentViewMode = character.viewMode || 'tabs';

    return (
        <>
            <SheetModals
                character={character}
                isDiceRollerOpen={isDiceRollerOpen}
                onCloseDiceRoller={() => setIsDiceRollerOpen(false)}
                onDiceRollResult={showRollResult}
                onDiceRollingStatusChange={setIsRollingDice}
                isLevelUpModalOpen={isLevelUpModalOpen}
                onCloseLevelUpModal={() => setIsLevelUpModalOpen(false)}
                onConfirmLevelUp={(method) => {
                    // Бросок кости для HP вынесен из reducer: выполняется здесь (source of randomness).
                    // При method='average' бросок не нужен.
                    const hpRoll = method === 'roll' ? (Math.floor(Math.random() * character.hitDie) + 1) : undefined;
                    dispatch({ type: 'LEVEL_UP', payload: { method, hpRoll } });
                    setIsLevelUpModalOpen(false);
                }}
                hitDie={character.hitDie}
                conModifier={calculateModifier(character.scores[Ability.CON])}
                isShortRestModalOpen={isShortRestModalOpen}
                onCloseShortRestModal={() => setIsShortRestModalOpen(false)}
                onConfirmShortRest={(diceToSpend) => {
                    // Бросок костей выполняется в компоненте (source of randomness),
                    // reducer получает уже детерминированные результаты.
                    const diceResults: number[] = [];
                    for (let i = 0; i < diceToSpend; i++) {
                        diceResults.push(Math.floor(Math.random() * character.hitDie) + 1);
                    }
                    dispatch({ type: 'SHORT_REST', payload: { diceResults, conModifier: abilityModifiers[Ability.CON] } });
                    setIsShortRestModalOpen(false);
                }}
                maxShortRestDice={character.currentHitDice}
                shortRestConModifier={abilityModifiers[Ability.CON]}
                editingItem={itemToEdit}
                editingSlot={editingSlot}
                setEditingSlot={setEditingSlot}
                handleSaveItem={handleSaveItem}
                handleDeleteItem={handleDeleteItem}
                editingAttack={editingAttack}
                setEditingAttack={setEditingAttack}
                isNewAttack={isNewAttack}
                setIsNewAttack={setIsNewAttack}
                handleSaveAttack={handleSaveAttack}
                handleDeleteAttack={handleDeleteAttack}
                editingSpell={editingSpell}
                setEditingSpell={setEditingSpell}
                isNewSpell={isNewSpell}
                setIsNewSpell={setIsNewSpell}
                handleSaveSpell={handleSaveSpell}
                handleDeleteSpell={handleDeleteSpell}
                viewingChestItem={viewingChestItem}
                setViewingChestId={setViewingChestId}
                draggedItemInfo={draggedItemInfo}
                setDraggedItemInfo={setDraggedItemInfo}
                handleItemDrop={handleItemDrop}
                handleDragEnd={handleDragEnd}
                overAttunedItem={overAttunedItem}
                handleConfirmOverAttunementRemoval={handleConfirmOverAttunementRemoval}
                customIcons={customIcons}
                handleAddCustomIcon={handleAddCustomIcon}
                handleDeleteCustomIcon={handleDeleteCustomIcon}
                isFeatureModalOpen={isFeatureModalOpen}
                featureToEdit={featureToEdit}
                onCloseFeatureModal={() => { setEditingFeature(null); setIsNewFeature(false); setTargetGroupId(null); }}
                onSaveFeature={handleSaveFeature}
                onDeleteFeature={handleDeleteFeature}
                featureGroups={character.featureGroups || []}
                initialFeatureGroupId={initialFeatureGroupId}
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

            {/* Global Dice Roller FAB */}
            <DiceFab onOpen={() => setIsDiceRollerOpen(true)} />

            <div className="max-w-[1600px] mx-auto space-y-6 px-2 md:px-4">
                
                <SheetToolbar
                    onLevelChange={handleLevelChange}
                    onOpenCharacterManager={onOpenCharacterManager}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onOpenHistoryLog={onOpenHistoryLog}
                    syncStatus={syncStatus}
                    onSyncCharacter={onSyncCharacter}
                    onClearLocalCache={onClearLocalCache}
                    onDeleteCharacter={onDeleteCharacter}
                    onOpenStandalone={onOpenStandalone}
                    isGM={isGM}
                    isReadOnly={isReadOnly}
                />

                {/* Top Dashboard Grid (Horizontal Panel) */}
                <StatusDashboard
                    equippedBonuses={equippedBonuses}
                    effectiveAbilityScores={effectiveAbilityScores}
                    onOpenShortRest={() => setIsShortRestModalOpen(true)}
                />

                {/* Bottom Tabs Section (Full Width) */}
                <div className="space-y-6 min-w-0">
                    <SheetTabNavigation
                        character={character}
                        activeTab={activeTab}
                        setActiveTab={(t) => setActiveTab(t as any)}
                        isEditingTabs={isEditingTabs}
                        setIsEditingTabs={setIsEditingTabs}
                        tabNames={{
                            stats: 'Характеристики',
                            combat: 'Бой',
                            inventory: 'Инвентарь',
                            features: 'Умения',
                            notes: 'Заметки'
                        }}
                        tabOrder={tabOrder}
                        draggedTab={draggedTabIndex !== null && tabOrder[draggedTabIndex] ? tabOrder[draggedTabIndex]! : null}
                        handleTabDragStart={(e, tab) => {
                            const idx = tabOrder.indexOf(tab as any);
                            if (idx !== -1) setDraggedTabIndex(idx);
                        }}
                        handleTabDragOver={(e) => e.preventDefault()}
                        handleTabDrop={(e, targetTab) => {
                            const targetIdx = tabOrder.indexOf(targetTab as any);
                            if (draggedTabIndex !== null && targetIdx !== -1) {
                                handleTabReorder(draggedTabIndex, targetIdx);
                            }
                        }}
                        handleTabDragEnd={() => {
                            setDraggedTabIndex(null);
                            setDragOverTabIndex(null);
                        }}
                        dispatch={dispatch}
                    />

                        {/* Tabs Layout Rendering */}
                        {currentViewMode === 'tabs' && renderTabContent(activeTab)}

                        {/* Scroll Layout Rendering */}
                        {currentViewMode === 'scroll' && (
                            <ScrollTabsSection
                                tabOrder={tabOrder}
                                tabLabels={tabLabels}
                                isEditingTabs={isEditingTabs}
                                draggedTabIndex={draggedTabIndex}
                                dragOverTabIndex={dragOverTabIndex}
                                setDraggedTabIndex={setDraggedTabIndex}
                                setDragOverTabIndex={setDragOverTabIndex}
                                handleTabReorder={handleTabReorder}
                                moveTab={moveTab}
                                renderTabContent={renderTabContent}
                            />
                        )}
                    </div>
            </div>
        </main>
        </>
    );
};
