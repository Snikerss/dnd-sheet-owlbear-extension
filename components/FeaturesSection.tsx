import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Feature, RecoveryType, FeatureGroup } from '../types';
import { RECOVERY_TYPE_NAMES } from '../constants';
import { useCharacter } from '../context/CharacterContext';
import { ConfirmationModal } from './ConfirmationModal';

interface FeaturesSectionProps {
  onAddFeature: (groupId?: string) => void;
  onEditFeature: (feature: Feature) => void;
}

const FeatureCard: React.FC<{ feature: Feature; onEdit: () => void; onDelete: () => void; onUse: (newUses: number) => void; }> = ({ feature, onEdit, onDelete, onUse }) => {
    
    const handleUseToggle = (index: number) => {
        const isCurrentlyUsed = (index + 1) > feature.currentUses;
        if (isCurrentlyUsed) {
            onUse(index + 1);
        } else {
            onUse(index);
        }
    };
    
    const getRecoveryIcon = () => {
        switch(feature.recovery) {
            case RecoveryType.ShortRest:
                return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>;
            case RecoveryType.LongRest:
                return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>;
            default:
                return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>;
        }
    }

    return (
        <div className="bg-[var(--color-surface-inset)] p-4 rounded-lg flex flex-col h-full border border-transparent hover:border-[var(--color-border)] transition-colors">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-[var(--color-text-base)] break-words mr-2">{feature.name}</h3>
                <div className="flex items-center space-x-1 flex-shrink-0">
                    <button onClick={onEdit} className="p-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors" data-tooltip="Редактировать" aria-label={`Редактировать умение ${feature.name}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                    </button>
                    <button onClick={onDelete} className="p-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-health)] hover:text-white transition-colors" data-tooltip="Удалить" aria-label={`Удалить умение ${feature.name}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            </div>
            {feature.description && (
                <p className="text-sm text-[var(--color-text-medium)] mb-3 whitespace-pre-wrap break-words flex-grow">{feature.description}</p>
            )}
            <div className="mt-auto">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]" data-tooltip={`Восстанавливается после: ${RECOVERY_TYPE_NAMES[feature.recovery]}`}>
                        {getRecoveryIcon()}
                        <span>{RECOVERY_TYPE_NAMES[feature.recovery]}</span>
                    </div>
                    {feature.totalUses > 0 && <span className="text-sm font-semibold">{feature.currentUses} / {feature.totalUses}</span>}
                </div>
                {feature.totalUses > 0 && (
                    <div className="flex flex-wrap gap-1.5 bg-[var(--color-surface-well)] p-2 rounded-lg">
                        {Array.from({ length: feature.totalUses }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => handleUseToggle(i)}
                                className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                                    i < feature.currentUses
                                        ? 'bg-[var(--color-accent-primary)] border-[var(--color-accent-primary-hover)]'
                                        : 'bg-transparent border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
                                }`}
                                aria-label={`Использование ${i + 1} из ${feature.totalUses} для умения ${feature.name}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export const FeaturesSection: React.FC<FeaturesSectionProps> = React.memo(({ onAddFeature, onEditFeature }) => {
  const { character, dispatch } = useCharacter();
  
  const groups: FeatureGroup[] = React.useMemo(() => {
      if (!character.featureGroups || character.featureGroups.length === 0) {
          return [{
              id: 'default',
              name: 'Особенности',
              featureIds: character.features.map(f => f.id)
          }];
      }
      return character.featureGroups;
  }, [character.featureGroups, character.features]);

  const featuresMap = React.useMemo(() => {
      const map = new Map<string, Feature>();
      character.features.forEach(f => map.set(f.id, f));
      return map;
  }, [character.features]);

  // --- LOCAL EDIT STATE ---
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (editingGroupId && editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
      }
  }, [editingGroupId]);

  // --- DRAG AND DROP STATE ---
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [draggedFeatureInfo, setDraggedFeatureInfo] = useState<{ id: string; sourceGroupId: string } | null>(null);
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);
  const [dragOverFeatureIndex, setDragOverFeatureIndex] = useState<{ groupId: string; index: number } | null>(null);
  const [dragOverGroupForFeature, setDragOverGroupForFeature] = useState<string | null>(null);

  const onDeleteFeature = useCallback((id: string) => {
    dispatch({ type: 'DELETE_FEATURE', payload: id });
  }, [dispatch]);

  const onUseFeature = useCallback((id: string, newUses: number) => {
    dispatch({ type: 'USE_FEATURE', payload: { id, newUses } });
  }, [dispatch]);

  // --- GROUP ACTIONS ---
  const handleCreateGroup = () => {
      dispatch({ type: 'CREATE_FEATURE_GROUP', payload: { name: 'Новая группа' } });
  };

  const handleStartRename = (groupId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingGroupId(groupId);
      setEditingGroupName(currentName);
  };

  const handleSaveRename = (groupId: string) => {
      const trimmed = editingGroupName.trim();
      if (trimmed && trimmed.length > 0) {
          dispatch({ type: 'RENAME_FEATURE_GROUP', payload: { groupId, name: trimmed } });
      }
      setEditingGroupId(null);
  };

  const handleDeleteGroup = (groupId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeletingGroupId(groupId);
  };

  const handleConfirmDeleteGroup = () => {
      if (deletingGroupId) {
          dispatch({ type: 'DELETE_FEATURE_GROUP', payload: deletingGroupId });
          setDeletingGroupId(null);
      }
  };

  const toggleCollapse = (groupId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({ type: 'TOGGLE_FEATURE_GROUP_COLLAPSE', payload: groupId });
  };

  // --- DRAG AND DROP HANDLERS ---
  
  // Group Reordering
  const handleGroupDragStart = (e: React.DragEvent, index: number) => {
      setDraggedGroupIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `group:${index}`);
  };

  const handleGroupDragOver = (e: React.DragEvent, index: number) => {
      if (draggedGroupIndex !== null && draggedGroupIndex !== index) {
          e.preventDefault();
      }
  };

  const handleGroupDragEnter = (e: React.DragEvent, index: number) => {
      if (draggedGroupIndex !== null && draggedGroupIndex !== index) {
          setDragOverGroupIndex(index);
      }
  };

  const handleGroupDrop = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedGroupIndex !== null && draggedGroupIndex !== index) {
          dispatch({
              type: 'REORDER_FEATURE_GROUPS',
              payload: { sourceIndex: draggedGroupIndex, destinationIndex: index }
          });
      }
      setDraggedGroupIndex(null);
      setDragOverGroupIndex(null);
  };

  const handleGroupDragEnd = () => {
      setDraggedGroupIndex(null);
      setDragOverGroupIndex(null);
  };

  // Feature Reordering / Moving
  const handleFeatureDragStart = (e: React.DragEvent, featureId: string, sourceGroupId: string) => {
      setDraggedFeatureInfo({ id: featureId, sourceGroupId });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `feature:${featureId}`);
  };

  const handleFeatureDragOver = (e: React.DragEvent, groupId: string, index: number) => {
      if (draggedFeatureInfo) {
          e.preventDefault();
      }
  };

  const handleFeatureDragEnter = (e: React.DragEvent, groupId: string, index: number) => {
      if (draggedFeatureInfo) {
          setDragOverFeatureIndex({ groupId, index });
          setDragOverGroupForFeature(null);
      }
  };

  const handleFeatureDrop = (e: React.DragEvent, targetGroupId: string, targetIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedFeatureInfo) {
          dispatch({
              type: 'MOVE_FEATURE',
              payload: {
                  featureId: draggedFeatureInfo.id,
                  sourceGroupId: draggedFeatureInfo.sourceGroupId,
                  targetGroupId,
                  targetIndex
              }
          });
      }
      setDraggedFeatureInfo(null);
      setDragOverFeatureIndex(null);
      setDragOverGroupForFeature(null);
  };

  const handleGroupBodyDragOver = (e: React.DragEvent, groupId: string) => {
      if (draggedFeatureInfo) {
          e.preventDefault();
      }
  };

  const handleGroupBodyDragEnter = (e: React.DragEvent, groupId: string) => {
      if (draggedFeatureInfo) {
          setDragOverGroupForFeature(groupId);
          setDragOverFeatureIndex(null);
      }
  };

  const handleGroupBodyDrop = (e: React.DragEvent, groupId: string, totalCount: number) => {
      e.preventDefault();
      if (draggedFeatureInfo) {
          dispatch({
              type: 'MOVE_FEATURE',
              payload: {
                  featureId: draggedFeatureInfo.id,
                  sourceGroupId: draggedFeatureInfo.sourceGroupId,
                  targetGroupId: groupId,
                  targetIndex: totalCount
              }
          });
      }
      setDraggedFeatureInfo(null);
      setDragOverFeatureIndex(null);
      setDragOverGroupForFeature(null);
  };

  const handleFeatureDragEnd = () => {
      setDraggedFeatureInfo(null);
      setDragOverFeatureIndex(null);
      setDragOverGroupForFeature(null);
  };

  return (
    <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)]">
        {/* Section Header */}
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700/40">
            <h2 className="text-xl font-semibold tracking-wide text-[var(--color-text-base)]">Способности</h2>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleCreateGroup}
                    className="bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-[var(--color-text-base)] border border-[var(--color-border)] font-semibold py-1.5 px-3 rounded-lg transition-all duration-150 shadow hover:shadow-md active:scale-95 text-xs flex items-center gap-1.5"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--color-accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Создать группу
                </button>
                <button
                    disabled={groups.length === 0}
                    onClick={() => onAddFeature()}
                    className={`font-bold py-1.5 px-3 rounded-lg transition-all duration-150 shadow text-xs flex items-center gap-1.5 ${
                        groups.length === 0
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                            : 'bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] text-white hover:shadow-md active:scale-95'
                    }`}
                    data-tooltip={groups.length === 0 ? "Сначала создайте группу способностей" : "Добавить способность в группу"}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить способность
                </button>
            </div>
        </div>

        {/* Groups Container */}
        {groups.length > 0 ? (
            <div className="space-y-4">
                {groups.map((group, groupIndex) => {
                const isGroupCollapsed = !!group.isCollapsed;
                const isGroupDragged = draggedGroupIndex === groupIndex;
                const isGroupDragOver = dragOverGroupIndex === groupIndex;

                return (
                    <div
                        key={group.id}
                        onDragOver={(e) => handleGroupDragOver(e, groupIndex)}
                        onDragEnter={(e) => handleGroupDragEnter(e, groupIndex)}
                        onDrop={(e) => handleGroupDrop(e, groupIndex)}
                        className={`bg-[var(--color-surface-well)]/40 rounded-xl border-2 transition-all duration-150 overflow-hidden ${
                            isGroupDragged ? 'opacity-40' : 'opacity-100'
                        } ${
                            isGroupDragOver 
                                ? 'border-dashed border-[var(--color-accent-primary)] bg-[var(--color-surface-well)]' 
                                : 'border-[var(--color-border-subtle)]'
                        }`}
                    >
                        {/* Group Header */}
                        <div
                            draggable
                            onDragStart={(e) => handleGroupDragStart(e, groupIndex)}
                            onDragEnd={handleGroupDragEnd}
                            onClick={(e) => toggleCollapse(group.id, e)}
                            className="bg-[var(--color-surface-well)]/80 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--color-surface-raised)]/60 transition-colors group-header"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {/* Grip icon for reordering groups */}
                                <div className="text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing hover:text-[var(--color-accent-primary)] p-0.5" data-tooltip="Перетащить группу">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                </div>

                                {/* Expand/Collapse arrow */}
                                <div className="text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]">
                                    {isGroupCollapsed ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>

                                {/* Group Name Title (click-to-edit) */}
                                {editingGroupId === group.id ? (
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editingGroupName}
                                        onChange={(e) => setEditingGroupName(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveRename(group.id);
                                            if (e.key === 'Escape') setEditingGroupId(null);
                                        }}
                                        onBlur={() => handleSaveRename(group.id)}
                                        className="bg-[var(--color-background)] border border-[var(--color-accent-primary)] rounded px-1.5 py-0.5 text-sm font-bold text-[var(--color-text-base)] focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                                    />
                                ) : (
                                    <div className="flex items-center gap-1.5 group/title min-w-0">
                                        <span className="font-bold text-sm text-[var(--color-text-base)] truncate">{group.name}</span>
                                        <button
                                            onClick={(e) => handleStartRename(group.id, group.name, e)}
                                            className="opacity-0 group-hover/title:opacity-100 hover:text-[var(--color-accent-primary)] text-[var(--color-text-muted)] p-0.5 transition-opacity"
                                            data-tooltip="Переименовать группу"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                            </svg>
                                        </button>
                                    </div>
                                )}

                                {/* Count Badge */}
                                <span className="bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
                                    {group.featureIds.length}
                                </span>
                            </div>

                            {/* Header Buttons */}
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddFeature(group.id);
                                    }}
                                    className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors"
                                    data-tooltip="Добавить в эту группу"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                                {group.id !== 'default' && (
                                    <button
                                        onClick={(e) => handleDeleteGroup(group.id, e)}
                                        className="p-1 rounded hover:bg-[var(--color-health)]/20 text-[var(--color-text-muted)] hover:text-[var(--color-health)] transition-colors"
                                        data-tooltip="Удалить группу"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Group Content Box */}
                        {!isGroupCollapsed && (
                            <div
                                onDragOver={(e) => handleGroupBodyDragOver(e, group.id)}
                                onDragEnter={(e) => handleGroupBodyDragEnter(e, group.id)}
                                onDrop={(e) => handleGroupBodyDrop(e, group.id, group.featureIds.length)}
                                className={`p-4 transition-colors min-h-[50px] ${
                                    dragOverGroupForFeature === group.id 
                                        ? 'bg-[var(--color-surface-well)]/60' 
                                        : 'bg-transparent'
                                }`}
                            >
                                {group.featureIds.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {group.featureIds.map((featureId, index) => {
                                            const feature = featuresMap.get(featureId);
                                            if (!feature) return null;

                                            const isFeatureDragged = draggedFeatureInfo?.id === feature.id;
                                            const isFeatureDragOver = dragOverFeatureIndex?.groupId === group.id && dragOverFeatureIndex?.index === index;

                                            return (
                                                <div
                                                    key={feature.id}
                                                    draggable
                                                    onDragStart={(e) => handleFeatureDragStart(e, feature.id, group.id)}
                                                    onDragEnter={(e) => handleFeatureDragEnter(e, group.id, index)}
                                                    onDragEnd={handleFeatureDragEnd}
                                                    onDragOver={(e) => handleFeatureDragOver(e, group.id, index)}
                                                    onDrop={(e) => handleFeatureDrop(e, group.id, index)}
                                                    className={`cursor-move transition-all duration-150 rounded-lg ${
                                                        isFeatureDragged ? 'opacity-40' : 'opacity-100'
                                                    } ${
                                                        draggedFeatureInfo ? 'drag-active' : ''
                                                    } ${
                                                        isFeatureDragOver ? 'ring-2 ring-[var(--color-accent-primary)] ring-dashed scale-[1.03] shadow-lg z-10' : ''
                                                    }`}
                                                >
                                                    <FeatureCard
                                                        feature={feature}
                                                        onEdit={() => onEditFeature(feature)}
                                                        onDelete={() => onDeleteFeature(feature.id)}
                                                        onUse={(newUses) => onUseFeature(feature.id, newUses)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-[var(--color-text-subtle)] border border-dashed border-[var(--color-border-subtle)] rounded-lg text-xs">
                                        <p>Группа пуста.</p>
                                        <p className="text-[10px]">Перетащите способности сюда или нажмите [+], чтобы создать новую.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            </div>
        ) : (
            <div className="text-center py-8 text-[var(--color-text-subtle)] border-2 border-dashed border-[var(--color-border-subtle)] rounded-lg">
                <p>Нет доступных групп способностей.</p>
                <p className="text-sm">Нажмите "Создать группу", чтобы начать.</p>
            </div>
        )}

        <ConfirmationModal
            isOpen={!!deletingGroupId}
            title="Удаление группы"
            message={
                (() => {
                    if (!deletingGroupId) return '';
                    const group = groups.find(g => g.id === deletingGroupId);
                    if (!group) return '';
                    return group.featureIds.length > 0
                        ? `Удалить группу "${group.name}"? Все содержащиеся в ней способности будут перенесены в основную группу.`
                        : `Удалить пустую группу "${group.name}"?`;
                })()
            }
            onConfirm={handleConfirmDeleteGroup}
            onCancel={() => setDeletingGroupId(null)}
            confirmText="Удалить"
            cancelText="Отмена"
        />
    </div>
  );
});