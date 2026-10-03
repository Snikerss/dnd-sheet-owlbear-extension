import React from 'react';
import { useCharacter } from '../../context/CharacterContext';

interface ScrollTabsSectionProps {
    tabOrder: string[];
    tabLabels: Record<string, string>;
    isEditingTabs: boolean;
    draggedTabIndex: number | null;
    dragOverTabIndex: number | null;
    setDraggedTabIndex: (index: number | null) => void;
    setDragOverTabIndex: (index: number | null) => void;
    handleTabReorder: (fromIndex: number, toIndex: number) => void;
    moveTab: (index: number, direction: 'left' | 'right') => void;
    renderTabContent: (tabId: string) => React.ReactNode;
}

export const ScrollTabsSection: React.FC<ScrollTabsSectionProps> = ({
    tabOrder,
    tabLabels,
    isEditingTabs,
    draggedTabIndex,
    dragOverTabIndex,
    setDraggedTabIndex,
    setDragOverTabIndex,
    handleTabReorder,
    moveTab,
    renderTabContent,
}) => {
    const { character, dispatch } = useCharacter();

    return (
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
    );
};
