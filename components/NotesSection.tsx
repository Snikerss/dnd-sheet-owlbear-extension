import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCharacter } from '../context/CharacterContext';
import type { Note, NoteGroup } from '../types';
import { generateUUID } from '../utils/uuid';

export const NotesSection: React.FC = React.memo(() => {
    const { character, dispatch } = useCharacter();
    const { notes, activeNoteId } = character;
    const groups = character.noteGroups || [];

    const activeNote = notes.find(n => n.id === activeNoteId);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const groupRenameInputRef = useRef<HTMLInputElement>(null);

    // Editing group title state
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState('');

    // Editing note title state (inline in sidebar)
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingNoteTitle, setEditingNoteTitle] = useState('');

    // Drag-and-drop state for groups
    const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);

    // Drag-and-drop state for notes
    const [draggedNoteInfo, setDraggedNoteInfo] = useState<{ id: string; sourceGroupId: string } | null>(null);
    const [dragOverNoteIndex, setDragOverNoteIndex] = useState<{ groupId: string; index: number } | null>(null);
    const [dragOverGroupForNote, setDragOverGroupForNote] = useState<string | null>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${scrollHeight}px`;
        }
    }, [activeNote?.content]);

    // Focus helpers
    useEffect(() => {
        if (editingGroupId && groupRenameInputRef.current) {
            groupRenameInputRef.current.focus();
            groupRenameInputRef.current.select();
        }
    }, [editingGroupId]);

    useEffect(() => {
        if (editingNoteId && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [editingNoteId]);

    // Dynamic initial state sync
    useEffect(() => {
        if (notes.length === 0) {
            const newNoteId = generateUUID();
            dispatch({ type: 'ADD_NOTE', payload: { id: newNoteId, title: 'Заметки', content: '' } });
        } else if (!activeNoteId && notes[0]) {
            dispatch({ type: 'SET_ACTIVE_NOTE', payload: notes[0].id });
        }
    }, [notes, activeNoteId, dispatch]);

    // Group handlers
    const handleCreateGroup = useCallback(() => {
        dispatch({ type: 'CREATE_NOTE_GROUP', payload: { name: 'Новая папка' } });
    }, [dispatch]);

    const handleStartRenameGroup = (e: React.MouseEvent, group: NoteGroup) => {
        e.stopPropagation();
        setEditingGroupId(group.id);
        setEditingGroupName(group.name);
    };

    const handleFinishRenameGroup = useCallback(() => {
        if (editingGroupId && editingGroupName.trim()) {
            dispatch({ type: 'RENAME_NOTE_GROUP', payload: { groupId: editingGroupId, name: editingGroupName.trim() } });
        }
        setEditingGroupId(null);
    }, [dispatch, editingGroupId, editingGroupName]);

    const handleGroupRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleFinishRenameGroup();
        } else if (e.key === 'Escape') {
            setEditingGroupId(null);
        }
    };

    const handleDeleteGroup = (e: React.MouseEvent, group: NoteGroup) => {
        e.stopPropagation();
        if (group.noteIds.length > 0) {
            const confirmMsg = `В папке "${group.name}" есть заметки (${group.noteIds.length}). Перенести их в другую папку перед удалением?`;
            if (window.confirm(confirmMsg)) {
                dispatch({ type: 'DELETE_NOTE_GROUP', payload: group.id });
            }
        } else {
            dispatch({ type: 'DELETE_NOTE_GROUP', payload: group.id });
        }
    };

    const toggleGroupCollapse = (groupId: string, e: React.MouseEvent) => {
        // Prevent collapsing when clicking on inputs/buttons
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) {
            return;
        }
        dispatch({ type: 'TOGGLE_NOTE_GROUP_COLLAPSE', payload: groupId });
    };

    // Note handlers
    const handleAddNoteToGroup = useCallback((groupId: string) => {
        const newNoteId = generateUUID();
        const newNote: Note = {
            id: newNoteId,
            title: `Заметка ${notes.length + 1}`,
            content: '',
        };
        dispatch({ type: 'ADD_NOTE_TO_GROUP', payload: { note: newNote, groupId } });
    }, [dispatch, notes.length]);

    const handleDeleteNote = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (notes.length > 1) {
            dispatch({ type: 'DELETE_NOTE', payload: id });
        }
    }, [dispatch, notes.length]);

    const handleSelectNote = (id: string) => {
        if (editingNoteId !== id) {
             dispatch({ type: 'SET_ACTIVE_NOTE', payload: id });
        }
    };

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (activeNoteId) {
            dispatch({ type: 'UPDATE_NOTE', payload: { id: activeNoteId, updates: { content: e.target.value } } });
        }
    };

    const handleStartEditingNoteTitle = (e: React.MouseEvent, note: Note) => {
        e.stopPropagation();
        setEditingNoteId(note.id);
        setEditingNoteTitle(note.title);
    };

    const handleFinishEditingNoteTitle = useCallback(() => {
        if (editingNoteId && editingNoteTitle.trim()) {
            dispatch({ type: 'UPDATE_NOTE', payload: { id: editingNoteId, updates: { title: editingNoteTitle.trim() } } });
        }
        setEditingNoteId(null);
    }, [dispatch, editingNoteId, editingNoteTitle]);

    const handleNoteTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleFinishEditingNoteTitle();
        } else if (e.key === 'Escape') {
            setEditingNoteId(null);
        }
    };

    // Note Group Drag and Drop
    const handleGroupDragStart = (e: React.DragEvent, index: number) => {
        setDraggedGroupIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `group:${index}`);
    };

    const handleGroupDragOver = (e: React.DragEvent, index: number) => {
        if (draggedGroupIndex !== null) {
            e.preventDefault();
            if (dragOverGroupIndex !== index) {
                setDragOverGroupIndex(index);
            }
        }
    };

    const handleGroupDragEnd = () => {
        setDraggedGroupIndex(null);
        setDragOverGroupIndex(null);
    };

    const handleGroupDrop = (e: React.DragEvent, destinationIndex: number) => {
        e.preventDefault();
        if (draggedGroupIndex !== null && draggedGroupIndex !== destinationIndex) {
            dispatch({
                type: 'REORDER_NOTE_GROUPS',
                payload: { sourceIndex: draggedGroupIndex, destinationIndex }
            });
        }
        handleGroupDragEnd();
    };

    // Note Drag and Drop
    const handleNoteDragStart = (e: React.DragEvent, noteId: string, sourceGroupId: string) => {
        setDraggedNoteInfo({ id: noteId, sourceGroupId });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `note:${noteId}`);
    };

    const handleNoteDragOver = (e: React.DragEvent, groupId: string, index: number) => {
        if (draggedNoteInfo) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const handleNoteDragEnter = (e: React.DragEvent, groupId: string, index: number) => {
        if (draggedNoteInfo) {
            e.stopPropagation();
            setDragOverNoteIndex({ groupId, index });
            setDragOverGroupForNote(null);
        }
    };

    const handleNoteDragEnd = () => {
        setDraggedNoteInfo(null);
        setDragOverNoteIndex(null);
        setDragOverGroupForNote(null);
    };

    const handleNoteDrop = (e: React.DragEvent, targetGroupId: string, targetIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedNoteInfo) {
            const { id: noteId, sourceGroupId } = draggedNoteInfo;
            dispatch({
                type: 'MOVE_NOTE',
                payload: {
                    noteId,
                    sourceGroupId,
                    targetGroupId,
                    targetIndex
                }
            });
        }
        handleNoteDragEnd();
    };

    const handleGroupBodyDragOver = (e: React.DragEvent, groupId: string) => {
        if (draggedNoteInfo) {
            e.preventDefault();
        }
    };

    const handleGroupBodyDragEnter = (e: React.DragEvent, groupId: string) => {
        if (draggedNoteInfo) {
            if (dragOverGroupForNote !== groupId) {
                setDragOverGroupForNote(groupId);
                setDragOverNoteIndex(null);
            }
        }
    };

    const handleDropOnGroup = (e: React.DragEvent, targetGroupId: string) => {
        e.preventDefault();
        if (draggedNoteInfo) {
            const { id: noteId, sourceGroupId } = draggedNoteInfo;
            const group = groups.find(g => g.id === targetGroupId);
            const targetIndex = group ? group.noteIds.length : 0;
            dispatch({
                type: 'MOVE_NOTE',
                payload: {
                    noteId,
                    sourceGroupId,
                    targetGroupId,
                    targetIndex
                }
            });
        }
        handleNoteDragEnd();
    };

    return (
        <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)]">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch min-h-[450px]">
                
                {/* Left Column: Groups and Notes Sidebar */}
                <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-[var(--color-border)] pb-4 md:pb-0 pr-0 md:pr-4 flex flex-col justify-between">
                    <div className="space-y-3 flex flex-col flex-1 min-h-0">
                        <div className="flex items-center justify-between px-1 flex-shrink-0">
                            <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Папки и заметки</span>
                            <button
                                onClick={handleCreateGroup}
                                className="text-xs text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-semibold flex items-center gap-1 transition-colors"
                                data-tooltip="Создать новую папку"
                                data-tooltip-pos="left"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                                </svg>
                                Папка
                            </button>
                        </div>

                        {/* List of note groups */}
                        {groups.length > 0 ? (
                            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 max-h-[300px] md:max-h-none scrollbar-none pr-1">
                                {groups.map((group, groupIndex) => {
                                    const isGroupCollapsed = !!group.isCollapsed;
                                    const isGroupDragged = draggedGroupIndex === groupIndex;
                                    const isGroupDragOver = dragOverGroupIndex === groupIndex;

                                    return (
                                        <div
                                            key={group.id}
                                            onDragOver={(e) => handleGroupDragOver(e, groupIndex)}
                                            onDrop={(e) => handleGroupDrop(e, groupIndex)}
                                            className={`rounded-lg border transition-all duration-150 ${
                                                isGroupDragged ? 'opacity-40' : 'opacity-100'
                                            } ${
                                                isGroupDragOver
                                                    ? 'border-2 border-dashed border-[var(--color-accent-primary)] bg-[var(--color-surface-well)]/40 scale-[0.98]'
                                                    : 'border-transparent'
                                            }`}
                                        >
                                            {/* Group Header */}
                                            <div
                                                draggable
                                                onDragStart={(e) => handleGroupDragStart(e, groupIndex)}
                                                onDragEnd={handleGroupDragEnd}
                                                onClick={(e) => toggleGroupCollapse(group.id, e)}
                                                className="bg-[var(--color-surface-well)]/80 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[var(--color-surface-raised)]/60 transition-colors group-header rounded-lg"
                                            >
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    {/* Grip Icon */}
                                                    <span className="cursor-grab text-[var(--color-text-subtle)] hover:text-[var(--color-text-medium)] flex-shrink-0">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h16M4 16h16" />
                                                        </svg>
                                                    </span>

                                                    {/* Collapse chevron */}
                                                    <span className="text-[var(--color-text-subtle)] flex-shrink-0">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            className={`h-3 w-3 transition-transform duration-200 ${isGroupCollapsed ? '-rotate-90' : ''}`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </span>

                                                    {/* Group title input / span */}
                                                    {editingGroupId === group.id ? (
                                                        <input
                                                            ref={groupRenameInputRef}
                                                            type="text"
                                                            value={editingGroupName}
                                                            onChange={(e) => setEditingGroupName(e.target.value)}
                                                            onBlur={handleFinishRenameGroup}
                                                            onKeyDown={handleGroupRenameKeyDown}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="bg-[var(--color-background)] text-xs border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] w-full font-bold text-[var(--color-text-base)]"
                                                        />
                                                    ) : (
                                                        <span className="text-xs font-bold text-[var(--color-text-base)] truncate select-none">
                                                            {group.name}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 flex-shrink-0 ml-1.5">
                                                    {/* Rename Group */}
                                                    {editingGroupId !== group.id && (
                                                        <button
                                                            onClick={(e) => handleStartRenameGroup(e, group)}
                                                            className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent-primary)] p-0.5 rounded transition-colors"
                                                            data-tooltip="Переименовать папку"
                                                            data-tooltip-pos="left"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                            </svg>
                                                        </button>
                                                    )}

                                                    {/* Add Note directly to group */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleAddNoteToGroup(group.id); }}
                                                        className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent-primary)] p-0.5 rounded transition-colors"
                                                        data-tooltip="Создать заметку в этой папке"
                                                        data-tooltip-pos="left"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                                        </svg>
                                                    </button>

                                                    {/* Delete Group */}
                                                    {groups.length > 1 && (
                                                        <button
                                                            onClick={(e) => handleDeleteGroup(e, group)}
                                                            className="text-[var(--color-text-subtle)] hover:text-[var(--color-health)] p-0.5 rounded transition-colors"
                                                            data-tooltip="Удалить папку"
                                                            data-tooltip-pos="left"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Group items (collapsible) */}
                                            {!isGroupCollapsed && (
                                                <div
                                                    onDragOver={(e) => handleGroupBodyDragOver(e, group.id)}
                                                    onDragEnter={(e) => handleGroupBodyDragEnter(e, group.id)}
                                                    onDrop={(e) => handleDropOnGroup(e, group.id)}
                                                    className={`mt-1 pl-2 pr-1 py-1 space-y-1 min-h-[30px] rounded-lg transition-colors duration-150 ${
                                                        dragOverGroupForNote === group.id && group.noteIds.length > 0
                                                            ? 'bg-[var(--color-surface-well)]/20'
                                                            : ''
                                                    }`}
                                                >
                                                    {group.noteIds.length > 0 ? (
                                                        group.noteIds.map((noteId, index) => {
                                                            const note = notes.find(n => n.id === noteId);
                                                            if (!note) return null;

                                                            const isNoteDragged = draggedNoteInfo?.id === note.id;
                                                            const isNoteDragOver = dragOverNoteIndex?.groupId === group.id && dragOverNoteIndex?.index === index;

                                                            return (
                                                                <React.Fragment key={note.id}>
                                                                    <div
                                                                        draggable
                                                                        onDragStart={(e) => handleNoteDragStart(e, note.id, group.id)}
                                                                        onDragEnter={(e) => handleNoteDragEnter(e, group.id, index)}
                                                                        onDragEnd={handleNoteDragEnd}
                                                                        onDragOver={(e) => handleNoteDragOver(e, group.id, index)}
                                                                        onDrop={(e) => handleNoteDrop(e, group.id, index)}
                                                                        onClick={() => handleSelectNote(note.id)}
                                                                        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-all duration-150 border-l-4 ${
                                                                            activeNoteId === note.id
                                                                                ? 'bg-[var(--color-surface-well)] border-[var(--color-accent-primary)] text-[var(--color-text-base)] shadow-sm'
                                                                                : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-well)]/40 hover:text-[var(--color-text-medium)]'
                                                                        } ${isNoteDragged ? 'opacity-40' : 'opacity-100'} ${
                                                                            isNoteDragOver ? 'ring-2 ring-[var(--color-accent-primary)] ring-dashed bg-[var(--color-surface-well)]' : ''
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                            {editingNoteId === note.id ? (
                                                                                <input
                                                                                    ref={titleInputRef}
                                                                                    type="text"
                                                                                    value={editingNoteTitle}
                                                                                    onChange={(e) => setEditingNoteTitle(e.target.value)}
                                                                                    onBlur={handleFinishEditingNoteTitle}
                                                                                    onKeyDown={handleNoteTitleKeyDown}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="bg-[var(--color-background)] text-xs border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] w-full font-semibold text-[var(--color-text-base)]"
                                                                                />
                                                                            ) : (
                                                                                <span className="text-xs font-semibold truncate select-none">{note.title}</span>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1.5">
                                                                            {editingNoteId !== note.id && (
                                                                                <button
                                                                                    onClick={(e) => handleStartEditingNoteTitle(e, note)}
                                                                                    className="opacity-0 group-hover:opacity-100 hover:text-[var(--color-accent-primary)] text-[var(--color-text-muted)] p-0.5 transition-opacity"
                                                                                    data-tooltip="Переименовать заметку"
                                                                                    data-tooltip-pos="left"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                                                    </svg>
                                                                                </button>
                                                                            )}

                                                                            {notes.length > 1 && (
                                                                                <button
                                                                                    onClick={(e) => handleDeleteNote(e, note.id)}
                                                                                    className="opacity-0 group-hover:opacity-100 hover:text-[var(--color-health)] text-[var(--color-text-muted)] px-1 rounded hover:bg-[var(--color-health)]/10 transition-all font-bold text-xs"
                                                                                    data-tooltip="Удалить заметку"
                                                                                    data-tooltip-pos="left"
                                                                                >
                                                                                    &times;
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </React.Fragment>
                                                            );
                                                        })
                                                    ) : (
                                                        <div
                                                            className={`text-center py-2 text-[var(--color-text-subtle)] border border-dashed rounded-md text-[10px] select-none ${
                                                                dragOverGroupForNote === group.id
                                                                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-surface-well)]/40 text-[var(--color-accent-primary)]'
                                                                    : 'border-[var(--color-border-subtle)]'
                                                            }`}
                                                        >
                                                            Папка пуста.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-[var(--color-text-subtle)] border-2 border-dashed border-[var(--color-border-subtle)] rounded-lg flex-1 flex flex-col items-center justify-center">
                                <p className="text-xs">Нет доступных папок.</p>
                                <p className="text-[10px] mt-1">Нажмите "Папка" сверху, чтобы начать.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Active Note Editor */}
                <div className="md:col-span-3 pl-0 md:pl-4 pt-4 md:pt-0 flex flex-col h-full min-h-[400px]">
                    {activeNote ? (
                        <textarea
                            ref={textareaRef}
                            value={activeNote.content}
                            onChange={handleContentChange}
                            className="w-full h-full bg-transparent text-[var(--color-text-base)] placeholder:text-[var(--color-text-subtle)] resize-none focus:outline-none min-h-[350px] text-sm leading-relaxed"
                            placeholder="Начните писать вашу заметку здесь..."
                        />
                    ) : (
                        <div className="text-center py-12 text-[var(--color-text-subtle)] my-auto select-none">
                            <p>Нет выбранной заметки.</p>
                            <p className="text-sm">Выберите заметку слева или создайте новую.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});