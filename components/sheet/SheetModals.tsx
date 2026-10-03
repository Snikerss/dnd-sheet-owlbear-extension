import React from 'react';
import { Character, InventoryItem, Attack, Spell, DropLocation, Feature, FeatureGroup, RollResult, HitDie } from '../../types';
import { ErrorBoundary } from '../ErrorBoundary';

// Code-splitting (архитектурный аудит): все модалки грузятся по требованию.
// P2: рендер ТОЛЬКО при активном флаге — иначе React.lazy стартует import()
// при монтировании листа и выгода сплита аннулируется.
const DiceRollerModal = React.lazy(() => import('../DiceRollerModal').then(m => ({ default: m.DiceRollerModal })));
const LevelUpModal = React.lazy(() => import('../LevelUpModal').then(m => ({ default: m.LevelUpModal })));
const ShortRestModal = React.lazy(() => import('../ShortRestModal').then(m => ({ default: m.ShortRestModal })));
const FeatureDetailModal = React.lazy(() => import('../FeatureDetailModal').then(m => ({ default: m.FeatureDetailModal })));
const SheetModalManager = React.lazy(() => import('../SheetModalManager').then(m => ({ default: m.SheetModalManager })));

interface SheetModalsProps {
    character: Character;

    isDiceRollerOpen: boolean;
    onCloseDiceRoller: () => void;
    onDiceRollResult: (result: RollResult) => void;
    onDiceRollingStatusChange: (isRolling: boolean) => void;

    isLevelUpModalOpen: boolean;
    onCloseLevelUpModal: () => void;
    onConfirmLevelUp: (method: 'roll' | 'average') => void;
    hitDie: HitDie;
    conModifier: number;

    isShortRestModalOpen: boolean;
    onCloseShortRestModal: () => void;
    onConfirmShortRest: (diceToSpend: number) => void;
    maxShortRestDice: number;
    shortRestConModifier: number;

    editingItem: InventoryItem | null;
    editingSlot: DropLocation | null;
    setEditingSlot: (slot: DropLocation | null) => void;
    handleSaveItem: (item: InventoryItem | null) => void;
    handleDeleteItem: () => void;

    editingAttack: Attack | null;
    setEditingAttack: (attack: Attack | null) => void;
    isNewAttack: boolean;
    setIsNewAttack: (val: boolean) => void;
    handleSaveAttack: (attack: Attack) => void;
    handleDeleteAttack: (id: string) => void;

    editingSpell: Spell | null;
    setEditingSpell: (spell: Spell | null) => void;
    isNewSpell: boolean;
    setIsNewSpell: (val: boolean) => void;
    handleSaveSpell: (spell: Spell) => void;
    handleDeleteSpell: (id: string) => void;

    viewingChestItem: InventoryItem | null;
    setViewingChestId: (id: string | null) => void;
    draggedItemInfo: DropLocation | null;
    setDraggedItemInfo: (info: DropLocation | null) => void;
    handleItemDrop: (target: DropLocation) => void;
    handleDragEnd: () => void;

    overAttunedItem: InventoryItem | null;
    handleConfirmOverAttunementRemoval: () => void;

    customIcons: string[];
    handleAddCustomIcon: (dataUrl: string) => void;
    handleDeleteCustomIcon: (dataUrl: string) => void;

    isFeatureModalOpen: boolean;
    featureToEdit: Feature | null;
    onCloseFeatureModal: () => void;
    onSaveFeature: (feature: Feature, targetGroupId: string) => void;
    onDeleteFeature: (id: string) => void;
    featureGroups: FeatureGroup[];
    initialFeatureGroupId: string;
}

export const SheetModals: React.FC<SheetModalsProps> = ({
    character,
    isDiceRollerOpen,
    onCloseDiceRoller,
    onDiceRollResult,
    onDiceRollingStatusChange,
    isLevelUpModalOpen,
    onCloseLevelUpModal,
    onConfirmLevelUp,
    hitDie,
    conModifier,
    isShortRestModalOpen,
    onCloseShortRestModal,
    onConfirmShortRest,
    maxShortRestDice,
    shortRestConModifier,
    editingItem,
    editingSlot,
    setEditingSlot,
    handleSaveItem,
    handleDeleteItem,
    editingAttack,
    setEditingAttack,
    isNewAttack,
    setIsNewAttack,
    handleSaveAttack,
    handleDeleteAttack,
    editingSpell,
    setEditingSpell,
    isNewSpell,
    setIsNewSpell,
    handleSaveSpell,
    handleDeleteSpell,
    viewingChestItem,
    setViewingChestId,
    draggedItemInfo,
    setDraggedItemInfo,
    handleItemDrop,
    handleDragEnd,
    overAttunedItem,
    handleConfirmOverAttunementRemoval,
    customIcons,
    handleAddCustomIcon,
    handleDeleteCustomIcon,
    isFeatureModalOpen,
    featureToEdit,
    onCloseFeatureModal,
    onSaveFeature,
    onDeleteFeature,
    featureGroups,
    initialFeatureGroupId,
}) => {
    // P2: менеджер модалок предмета/атаки/заклинания/сундука монтируется только
    // при наличии хотя бы одного активного триггера — иначе его lazy-чанк
    // грузился на каждый монтирование листа.
    const isManagerActive = !!(
        editingSlot ||
        editingAttack || isNewAttack ||
        editingSpell || isNewSpell ||
        viewingChestItem ||
        overAttunedItem
    );

    return (
    <ErrorBoundary variant="inline">
    <React.Suspense fallback={null}>
        {/* Universal Dice Roller Modal */}
        {isDiceRollerOpen && (
            <DiceRollerModal
                isOpen={isDiceRollerOpen}
                onClose={onCloseDiceRoller}
                character={character}
                onRoll={onDiceRollResult}
                onRollingStatusChange={onDiceRollingStatusChange}
            />
        )}
        {isLevelUpModalOpen && (
            <LevelUpModal
                isOpen={isLevelUpModalOpen}
                onClose={onCloseLevelUpModal}
                onConfirm={onConfirmLevelUp}
                hitDie={hitDie}
                conModifier={conModifier}
            />
        )}
        {isShortRestModalOpen && (
            <ShortRestModal
                isOpen={isShortRestModalOpen}
                onClose={onCloseShortRestModal}
                onConfirm={onConfirmShortRest}
                maxDice={maxShortRestDice}
                hitDie={hitDie}
                conModifier={shortRestConModifier}
            />
        )}
        {isManagerActive && (
            <SheetModalManager
                character={character}
                editingItem={editingItem}
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
            />
        )}
        {isFeatureModalOpen && (
            <FeatureDetailModal
                isOpen={isFeatureModalOpen}
                onClose={onCloseFeatureModal}
                feature={featureToEdit}
                onSave={onSaveFeature}
                onDelete={onDeleteFeature}
                groups={featureGroups}
                initialGroupId={initialFeatureGroupId}
            />
        )}
    </React.Suspense>
    </ErrorBoundary>
    );
};
