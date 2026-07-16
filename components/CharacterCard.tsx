import React from 'react';
import type { Character } from '../types';

interface CharacterCardProps {
  character: Character;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  isSyncing?: boolean;
  pendingImagesCount?: number;
  currentUserId?: string | null;
}

export const CharacterCard: React.FC<CharacterCardProps> = React.memo(({ character, onSelect, onDuplicate, onDelete, onExport, isSyncing = false, pendingImagesCount = 0, currentUserId }) => {
  return (
    <div className="relative bg-[var(--color-surface-opaque)] rounded-xl shadow-lg border border-[var(--color-border)] overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-[var(--color-border-hover)] flex flex-col">
      {isSyncing && (
        <div 
          className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 p-4 text-center select-none"
          onClick={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <span className="text-teal-400 font-bold text-sm">Синхронизация...</span>
          <span className="text-[var(--color-text-medium)] text-xs mt-1">
            Осталось картинок: {pendingImagesCount}
          </span>
        </div>
      )}
      <div className="relative cursor-pointer group" onClick={onSelect}>
        <div className="aspect-[4/3] bg-[var(--color-surface-well)] flex items-center justify-center overflow-hidden">
          {character.portraitUrl ? (
            <img src={character.portraitUrl} alt={character.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <svg className="w-24 h-24 text-[var(--color-text-subtle)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
        {character.ownerName && (
          <div className="absolute top-2 right-2">
            <span className="bg-black/60 text-white/90 text-xs px-2 py-1 rounded-md backdrop-blur-sm border border-white/10 font-medium">
              👤 {character.ownerName}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-4">
          <h3 className="text-xl font-bold text-white drop-shadow-lg">{character.name}</h3>
          <p className="text-sm text-white/80 drop-shadow">{`${character.characterClass}, Уровень ${character.level}`}</p>
        </div>
      </div>
      <div className="p-3 bg-[var(--color-surface-inset)] flex items-center justify-between mt-auto">
        <div className="flex items-center">
            <button
                onClick={onExport}
                data-tooltip="Экспортировать персонажа"
                className="p-2 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>
            <button
              onClick={onDuplicate}
              data-tooltip="Дублировать персонажа"
              className="p-2 ml-1 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" />
              </svg>
            </button>
        </div>
        <button
          onClick={onSelect}
          className="flex-1 mx-2 bg-[var(--color-accent-primary)] text-white font-bold py-2 px-4 rounded-lg hover:bg-[var(--color-accent-primary-hover)] transition-all shadow active:scale-95"
        >
          Выбрать
        </button>
        {(!character.ownerId || !currentUserId || character.ownerId === currentUserId) && (
          <button
            onClick={onDelete}
            data-tooltip="Удалить персонажа"
            className="p-2 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-health)] hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});
