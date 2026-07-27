import React from 'react';
import { Character, CharacterAction } from '../types';

interface SheetTabNavigationProps {
  character: Character;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isEditingTabs: boolean;
  setIsEditingTabs: (val: boolean) => void;
  tabNames: Record<string, string>;
  tabIcons?: Record<string, React.ReactNode>;
  draggedTab: string | null;
  handleTabDragStart: (e: React.DragEvent, tab: string) => void;
  handleTabDragOver: (e: React.DragEvent) => void;
  handleTabDrop: (e: React.DragEvent, targetTab: string) => void;
  handleTabDragEnd: () => void;
  dispatch: React.Dispatch<CharacterAction>;
}

export const SheetTabNavigation: React.FC<SheetTabNavigationProps> = ({
  character,
  activeTab,
  setActiveTab,
  isEditingTabs,
  setIsEditingTabs,
  tabNames,
  draggedTab,
  handleTabDragStart,
  handleTabDragOver,
  handleTabDrop,
  handleTabDragEnd,
  dispatch,
}) => {
  const currentViewMode = character.viewMode || 'tabs';
  const tabOrder = character.tabOrder || ['stats', 'combat', 'inventory', 'features', 'notes'];

  return (
    <div className={`flex items-center border-b border-[var(--color-border)] pb-2 overflow-x-auto scrollbar-none gap-2 select-none justify-between w-full mb-4 ${isEditingTabs ? 'border-dashed border-teal-500/50' : ''}`}>
      {currentViewMode === 'tabs' ? (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-grow">
          {tabOrder.map((tab) => {
            const isActive = activeTab === tab;
            const isBeingDragged = draggedTab === tab;
            const label = tabNames[tab] || tab;

            return (
              <div
                key={tab}
                draggable={isEditingTabs}
                onDragStart={(e) => handleTabDragStart(e, tab)}
                onDragOver={handleTabDragOver}
                onDrop={(e) => handleTabDrop(e, tab)}
                onDragEnd={handleTabDragEnd}
                className={`flex items-center gap-1.5 transition-all duration-200 rounded-lg ${
                  isEditingTabs 
                    ? 'border border-dashed border-[var(--color-border)] px-2 py-1 bg-[var(--color-surface-well)]/30 hover:bg-[var(--color-surface-well)]/65' 
                    : ''
                } ${isBeingDragged ? 'opacity-40' : ''}`}
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

                <button
                  onClick={() => {
                    if (!isEditingTabs) {
                      setActiveTab(tab);
                    }
                  }}
                  disabled={isEditingTabs}
                  className={`tab-button px-3 py-1.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                    isEditingTabs 
                      ? 'text-[var(--color-text-base)] cursor-default' 
                      : isActive
                        ? 'border-b-2 border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] drop-shadow-[0_0_8px_var(--color-accent-primary-light)]'
                        : 'border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)]'
                  }`}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-grow">
          <span className="text-sm font-bold uppercase tracking-wider text-[var(--color-accent-primary)]">Разделы листа персонажа</span>
          {isEditingTabs && (
            <span className="text-[10px] text-[var(--color-text-muted)] italic font-semibold ml-2">
              (Перетаскивайте заголовки для изменения порядка)
            </span>
          )}
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
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
    </div>
  );
};
