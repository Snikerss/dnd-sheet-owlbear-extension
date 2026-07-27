import React from 'react';
import { Character, CharacterAction } from '../types';

interface SheetTabNavigationProps {
  character: Character;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isEditingTabs: boolean;
  setIsEditingTabs: (val: boolean) => void;
  tabNames: Record<string, string>;
  tabIcons: Record<string, React.ReactNode>;
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
  tabIcons,
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
    <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2 mb-4 gap-2 overflow-x-auto">
      <nav className="flex space-x-1 sm:space-x-2 flex-grow overflow-x-auto py-1 px-1 custom-scrollbar">
        {tabOrder.map((tab) => {
          const isActive = activeTab === tab;
          const isBeingDragged = draggedTab === tab;

          return (
            <div
              key={tab}
              draggable={isEditingTabs}
              onDragStart={(e) => handleTabDragStart(e, tab)}
              onDragOver={handleTabDragOver}
              onDrop={(e) => handleTabDrop(e, tab)}
              onDragEnd={handleTabDragEnd}
              className={`relative flex items-center group transition-all duration-200 ${
                isEditingTabs ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              <button
                onClick={() => setActiveTab(tab)}
                disabled={isEditingTabs}
                className={`tab-btn flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shadow-sm ${
                  isActive && currentViewMode === 'tabs'
                    ? 'bg-[var(--color-accent-primary)] text-white shadow-teal-500/20 scale-[1.02]'
                    : 'bg-[var(--color-surface-well)] text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] hover:bg-[var(--color-surface-raised)] border border-slate-700/30'
                } ${isBeingDragged ? 'opacity-40 border-dashed border-teal-400' : ''} ${
                  isEditingTabs ? 'pointer-events-none ring-1 ring-teal-500/50 animate-pulse' : ''
                }`}
              >
                <span className="w-4 h-4 flex items-center justify-center">{tabIcons[tab]}</span>
                <span>{tabNames[tab]}</span>
              </button>

              {isEditingTabs && (
                <div className="absolute -top-1 -right-1 bg-teal-500 text-white rounded-full p-0.5 shadow-md">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </nav>

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
