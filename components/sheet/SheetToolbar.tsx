import React from 'react';
import { CharacterHeader } from '../CharacterHeader';
import { SyncStatusType } from '../SyncStatusIndicator';

interface SheetToolbarProps {
    onLevelChange: (newLevel: number) => void;
    onOpenCharacterManager: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onOpenHistoryLog: () => void;
    syncStatus?: SyncStatusType;
    onSyncCharacter?: () => void;
    onClearLocalCache?: () => void;
    onDeleteCharacter?: () => void;
    onOpenStandalone?: () => void;
    isGM?: boolean;
    isReadOnly?: boolean;
}

export const SheetToolbar: React.FC<SheetToolbarProps> = ({
    onLevelChange,
    onOpenCharacterManager,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onOpenHistoryLog,
    syncStatus,
    onSyncCharacter,
    onClearLocalCache,
    onDeleteCharacter,
    onOpenStandalone,
    isGM = true,
    isReadOnly = false,
}) => (
    <CharacterHeader
        onLevelChange={onLevelChange}
        onOpenCharacterManager={onOpenCharacterManager}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onOpenHistoryLog={onOpenHistoryLog}
        syncStatus={syncStatus}
        onSync={onSyncCharacter}
        onClearCache={onClearLocalCache}
        onDeleteCharacter={onDeleteCharacter}
        onOpenStandalone={onOpenStandalone}
        isGM={isGM}
        isReadOnly={isReadOnly}
    />
);
