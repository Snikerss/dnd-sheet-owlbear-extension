import { Character, CharacterAction, FeatureGroup, NoteGroup } from '../../types';
import { generateUUID } from '../../utils/uuid';

// Вспомогательные конструкторы групп по умолчанию. Делают литералы
// гарантированно совместимыми с FeatureGroup/NoteGroup (важно при strict-режиме).
const defaultFeatureGroup = (featureIds: string[]): FeatureGroup => ({
    id: 'default',
    name: 'Особенности',
    isCollapsed: false,
    featureIds,
});

const defaultNoteGroup = (noteIds: string[]): NoteGroup => ({
    id: 'default',
    name: 'Мои заметки',
    isCollapsed: false,
    noteIds,
});

export const actionsReducer = (state: Character, action: CharacterAction): Character => {
    switch (action.type) {
        case 'ADD_FEATURE': {
            const newFeature = action.payload;
            const newFeatures = [...state.features, newFeature];
            const currentGroups = state.featureGroups || [];
            const newGroups = currentGroups.length === 0
                ? [defaultFeatureGroup([newFeature.id])]
                : currentGroups.map((g, i) => i === 0
                    ? { ...g, featureIds: [...g.featureIds, newFeature.id] }
                    : g);
            return { ...state, features: newFeatures, featureGroups: newGroups };
        }

        case 'ADD_FEATURE_TO_GROUP': {
            const { feature, groupId } = action.payload;
            const newFeatures = [...state.features, feature];
            const currentGroups = state.featureGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id))]
                : currentGroups;
            const newGroups = groupsToUpdate.map(g => g.id === groupId ? { ...g, featureIds: [...g.featureIds, feature.id] } : g);
            return { ...state, features: newFeatures, featureGroups: newGroups };
        }

        case 'UPDATE_FEATURE':
            return { ...state, features: state.features.map(f => f.id === action.payload.id ? action.payload : f) };

        case 'DELETE_FEATURE': {
            const featureId = action.payload;
            const newFeatures = state.features.filter(f => f.id !== featureId);
            const newGroups = (state.featureGroups || []).map(group => ({
                ...group,
                featureIds: group.featureIds.filter(id => id !== featureId)
            }));
            return { ...state, features: newFeatures, featureGroups: newGroups };
        }

        case 'USE_FEATURE':
            return { ...state, features: state.features.map(f => f.id === action.payload.id ? { ...f, currentUses: action.payload.newUses } : f) };

        case 'REORDER_FEATURES': {
            const { sourceIndex, destinationIndex } = action.payload;
            if (sourceIndex === destinationIndex) return state;

            const newFeatures = [...state.features];
            if (sourceIndex < 0 || sourceIndex >= newFeatures.length) return state;
            const [removed] = newFeatures.splice(sourceIndex, 1);
            if (!removed) return state;
            newFeatures.splice(destinationIndex, 0, removed);

            return { ...state, features: newFeatures };
        }

        case 'CREATE_FEATURE_GROUP': {
            const newGroup: FeatureGroup = {
                id: generateUUID(),
                name: action.payload.name,
                isCollapsed: false,
                featureIds: []
            };
            const currentGroups = state.featureGroups || [];
            const newGroups = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id)), newGroup]
                : [...currentGroups, newGroup];
            return { ...state, featureGroups: newGroups };
        }

        case 'RENAME_FEATURE_GROUP': {
            const { groupId, name } = action.payload;
            const currentGroups = state.featureGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id))]
                : currentGroups;
            const newGroups = groupsToUpdate.map(g => g.id === groupId ? { ...g, name } : g);
            return { ...state, featureGroups: newGroups };
        }

        case 'DELETE_FEATURE_GROUP': {
            const groupId = action.payload;
            const currentGroups = state.featureGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id))]
                : currentGroups;
            
            const groupToDelete = groupsToUpdate.find(g => g.id === groupId);
            if (!groupToDelete) return state;

            const remainingGroups = groupsToUpdate.filter(g => g.id !== groupId);

            if (remainingGroups.length > 0) {
                const first = remainingGroups[0]!;
                remainingGroups[0] = {
                    ...first,
                    featureIds: [...first.featureIds, ...groupToDelete.featureIds]
                };
            } else {
                remainingGroups.push({
                    id: 'default',
                    name: 'Особенности',
                    featureIds: groupToDelete.featureIds
                });
            }

            return { ...state, featureGroups: remainingGroups };
        }

        case 'TOGGLE_FEATURE_GROUP_COLLAPSE': {
            const groupId = action.payload;
            const currentGroups = state.featureGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id))]
                : currentGroups;
            const newGroups = groupsToUpdate.map(g => g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g);
            return { ...state, featureGroups: newGroups };
        }

        case 'MOVE_FEATURE': {
            const { featureId, sourceGroupId, targetGroupId, targetIndex } = action.payload;
            const currentGroups = state.featureGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id))]
                : currentGroups;

            const newGroups = groupsToUpdate.map(group => {
                let ids = [...group.featureIds];
                
                if (group.id === sourceGroupId) {
                    ids = ids.filter(id => id !== featureId);
                }
                
                if (group.id === targetGroupId) {
                    if (sourceGroupId === targetGroupId) {
                        ids = ids.filter(id => id !== featureId);
                    }
                    ids.splice(targetIndex, 0, featureId);
                }
                
                return { ...group, featureIds: ids };
            });

            return { ...state, featureGroups: newGroups };
        }

        case 'REORDER_FEATURE_GROUPS': {
            const { sourceIndex, destinationIndex } = action.payload;
            const currentGroups = state.featureGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultFeatureGroup(state.features.map(f => f.id))]
                : [...currentGroups];

            if (sourceIndex === destinationIndex) return state;
            if (sourceIndex < 0 || sourceIndex >= groupsToUpdate.length) return state;

            const [removed] = groupsToUpdate.splice(sourceIndex, 1);
            if (!removed) return state;
            groupsToUpdate.splice(destinationIndex, 0, removed);

            return { ...state, featureGroups: groupsToUpdate };
        }

        case 'ADD_ATTACK':
            return { ...state, attacks: [...state.attacks, action.payload] };

        case 'UPDATE_ATTACK':
            return { ...state, attacks: state.attacks.map(a => a.id === action.payload.id ? action.payload : a) };

        case 'DELETE_ATTACK':
            return { ...state, attacks: state.attacks.filter(a => a.id !== action.payload) };

        case 'SET_GLOBAL_DICE_BONUS':
            return { ...state, globalAttackDiceBonusToHitDice: action.payload.toHitDice, globalAttackDiceBonusToDamageDice: action.payload.toDamageDice };

        case 'ADD_SPELL':
            return { ...state, spells: [...state.spells, action.payload] };

        case 'UPDATE_SPELL':
            return { ...state, spells: state.spells.map(s => s.id === action.payload.id ? action.payload : s) };

        case 'DELETE_SPELL':
            return { ...state, spells: state.spells.filter(s => s.id !== action.payload) };

        case 'TOGGLE_SPELL_PREPARED':
            return { ...state, spells: state.spells.map(s => s.id === action.payload ? { ...s, isPrepared: !s.isPrepared } : s) };

        case 'SET_SPELL_SLOTS': {
            const { level, total } = action.payload;
            return { ...state, spellSlots: { ...state.spellSlots, [level]: { ...state.spellSlots[level] ?? { total: 0, used: 0 }, total } } };
        }

        case 'USE_SPELL_SLOT': {
            const { level, used } = action.payload;
            return { ...state, spellSlots: { ...state.spellSlots, [level]: { ...state.spellSlots[level] ?? { total: 0, used: 0 }, used } } };
        }

        case 'SET_SPELLCASTING_ABILITY':
            return { ...state, spellcastingAbility: action.payload };

        case 'SET_MAX_PREPARED_SPELLS':
            return { ...state, maxPreparedSpells: Math.max(0, action.payload) };

        case 'MOVE_AND_REORDER_SPELL': {
            const { spellId, targetSpellId, targetLevel } = action.payload;
            if (spellId === targetSpellId) return state;

            const spellsCopy = [...state.spells];
            const sourceIndex = spellsCopy.findIndex(s => s.id === spellId);
            if (sourceIndex === -1) return state;

            const [draggedSpell] = spellsCopy.splice(sourceIndex, 1);
            if (!draggedSpell) return state;

            if (targetSpellId) {
                const targetIndex = spellsCopy.findIndex(s => s.id === targetSpellId);
                if (targetIndex !== -1) {
                    const targetSpell = spellsCopy[targetIndex];
                    if (targetSpell) draggedSpell.level = targetSpell.level;
                    spellsCopy.splice(targetIndex, 0, draggedSpell);
                } else {
                    spellsCopy.push(draggedSpell);
                }
            } else if (typeof targetLevel === 'number') {
                draggedSpell.level = targetLevel;
                let insertIndex = -1;
                for (let i = spellsCopy.length - 1; i >= 0; i--) {
                    const s = spellsCopy[i];
                    if (s && s.level === targetLevel) {
                        insertIndex = i + 1;
                        break;
                    }
                }
                if (insertIndex !== -1) {
                    spellsCopy.splice(insertIndex, 0, draggedSpell);
                } else {
                    spellsCopy.push(draggedSpell);
                }
            } else {
                spellsCopy.push(draggedSpell);
            }

            return { ...state, spells: spellsCopy };
        }

        // Примечание: SET_BONUS больше не обрабатывается здесь — единая логика
        // находится в abilitiesReducer, использующая BONUS_FIELDS из constants.ts.
        // Раньше spellSaveDcBonus и spellAttackBonusBonus обрабатывались отдельно здесь —
        // это было дублирование (баг #12). Теперь все 13 бонусных полей в одном месте.

        case 'ADD_NOTE': {
            const newNote = action.payload;
            const currentGroups = state.noteGroups || [];
            let newGroups = [...currentGroups];
            if (newGroups.length === 0) {
                newGroups = [defaultNoteGroup([newNote.id])];
            } else {
                newGroups = newGroups.map((g, i) => i === 0
                    ? { ...g, noteIds: [...g.noteIds, newNote.id] }
                    : g);
            }
            return {
                ...state,
                notes: [...state.notes, newNote],
                noteGroups: newGroups,
                activeNoteId: newNote.id,
            };
        }

        case 'ADD_NOTE_TO_GROUP': {
            const { note, groupId } = action.payload;
            const currentGroups = state.noteGroups || [];
            let newGroups = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : currentGroups;
            newGroups = newGroups.map(g => g.id === groupId ? { ...g, noteIds: [...g.noteIds, note.id] } : g);
            return {
                ...state,
                notes: [...state.notes, note],
                noteGroups: newGroups,
                activeNoteId: note.id,
            };
        }

        case 'UPDATE_NOTE': {
            const { id, updates } = action.payload;
            return { ...state, notes: state.notes.map(n => n.id === id ? { ...n, ...updates } : n) };
        }

        case 'DELETE_NOTE': {
            const idToDelete = action.payload;
            const currentIndex = state.notes.findIndex(n => n.id === idToDelete);
            const newNotes = state.notes.filter(n => n.id !== idToDelete);
            let newActiveId = state.activeNoteId;
            
            if (state.activeNoteId === idToDelete) {
                if (newNotes.length === 0) {
                    newActiveId = null;
                } else {
                    const newIndex = Math.max(0, currentIndex - 1);
                    newActiveId = newNotes[newIndex]?.id ?? newNotes[0]!.id;
                }
            }

            const currentGroups = state.noteGroups || [];
            const newGroups = (currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : currentGroups
            ).map(g => ({
                ...g,
                noteIds: g.noteIds.filter(id => id !== idToDelete)
            }));
            
            return { ...state, notes: newNotes, activeNoteId: newActiveId, noteGroups: newGroups };
        }

        case 'SET_ACTIVE_NOTE':
            return { ...state, activeNoteId: action.payload };

        case 'CREATE_NOTE_GROUP': {
            const newGroup: NoteGroup = {
                id: generateUUID(),
                name: action.payload.name,
                isCollapsed: false,
                noteIds: []
            };
            const currentGroups = state.noteGroups || [];
            const newGroups = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id)), newGroup]
                : [...currentGroups, newGroup];
            return { ...state, noteGroups: newGroups };
        }

        case 'RENAME_NOTE_GROUP': {
            const { groupId, name } = action.payload;
            const currentGroups = state.noteGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : currentGroups;
            const newGroups = groupsToUpdate.map(g => g.id === groupId ? { ...g, name } : g);
            return { ...state, noteGroups: newGroups };
        }

        case 'DELETE_NOTE_GROUP': {
            const groupId = action.payload;
            const currentGroups = state.noteGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : currentGroups;
            
            const groupToDelete = groupsToUpdate.find(g => g.id === groupId);
            if (!groupToDelete) return state;

            const remainingGroups = groupsToUpdate.filter(g => g.id !== groupId);

            if (remainingGroups.length > 0) {
                const first = remainingGroups[0]!;
                remainingGroups[0] = {
                    ...first,
                    noteIds: [...first.noteIds, ...groupToDelete.noteIds]
                };
            } else {
                remainingGroups.push({
                    id: 'default',
                    name: 'Мои заметки',
                    noteIds: groupToDelete.noteIds
                });
            }

            return { ...state, noteGroups: remainingGroups };
        }

        case 'TOGGLE_NOTE_GROUP_COLLAPSE': {
            const groupId = action.payload;
            const currentGroups = state.noteGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : currentGroups;
            const newGroups = groupsToUpdate.map(g => g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g);
            return { ...state, noteGroups: newGroups };
        }

        case 'MOVE_NOTE': {
            const { noteId, sourceGroupId, targetGroupId, targetIndex } = action.payload;
            const currentGroups = state.noteGroups || [];
            let groupsToUpdate = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : currentGroups;

            // Remove from source group
            groupsToUpdate = groupsToUpdate.map(g => {
                if (g.id === sourceGroupId) {
                    return { ...g, noteIds: g.noteIds.filter(id => id !== noteId) };
                }
                return g;
            });

            // Insert into target group
            groupsToUpdate = groupsToUpdate.map(g => {
                if (g.id === targetGroupId) {
                    const newIds = [...g.noteIds];
                    newIds.splice(targetIndex, 0, noteId);
                    return { ...g, noteIds: newIds };
                }
                return g;
            });

            return { ...state, noteGroups: groupsToUpdate };
        }

        case 'REORDER_NOTE_GROUPS': {
            const { sourceIndex, destinationIndex } = action.payload;
            const currentGroups = state.noteGroups || [];
            const groupsToUpdate = currentGroups.length === 0
                ? [defaultNoteGroup(state.notes.map(n => n.id))]
                : [...currentGroups];

            if (sourceIndex === destinationIndex) return state;
            if (sourceIndex < 0 || sourceIndex >= groupsToUpdate.length) return state;

            const [removed] = groupsToUpdate.splice(sourceIndex, 1);
            if (!removed) return state;
            groupsToUpdate.splice(destinationIndex, 0, removed);
            return { ...state, noteGroups: groupsToUpdate };
        }

        case 'UNATTUNE_ITEM': {
            const itemId = action.payload;
            return {
                ...state,
                inventory: state.inventory.map(item => 
                    item && item.id === itemId 
                        ? { ...item, isAttuned: false, attunementTimestamp: undefined } 
                        : item
                )
            };
        }

        default:
            return state;
    }
};