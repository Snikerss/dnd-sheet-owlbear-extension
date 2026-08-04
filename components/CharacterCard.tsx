import React from 'react';
import type { Character } from '../types';
import { useNotifier } from '../context/NotificationContext';

interface CharacterCardProps {
  character: Character;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onOpenStandalone?: () => void;
  onSync?: () => void;
  onClearCache?: () => void;
  isBroadcastingToGM?: boolean;
  onSelectBroadcastGM?: () => void;
  isSyncing?: boolean;
  pendingImagesCount?: number;
  currentUserId?: string | null;
  isGM?: boolean;
}

export const CharacterCard: React.FC<CharacterCardProps> = React.memo(({
  character,
  onSelect,
  onDuplicate,
  onDelete,
  onExport,
  onOpenStandalone,
  onSync,
  onClearCache,
  isBroadcastingToGM = false,
  onSelectBroadcastGM,
  isSyncing = false,
  pendingImagesCount = 0,
  currentUserId,
  isGM = true
}) => {
  const { addNotification } = useNotifier();

  const canDelete = isGM || !character.ownerId || !currentUserId || character.ownerId === currentUserId;

  const handleOpenClick = () => {
    if (onOpenStandalone) {
      onOpenStandalone();
      // Show notice in Brave/Safari just in case popup blocker blocks it
      addNotification("Открываем лист персонажа в новой вкладке. Если окно заблокировано, разрешите всплывающие окна для сайта.", 'info');
    }
  };

  return (
    <div className="relative min-h-[380px] h-full bg-[var(--color-surface-opaque)] rounded-xl shadow-lg border border-[var(--color-border)] overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-[var(--color-border-hover)] flex flex-col justify-between">
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
      <div className="relative flex-1 cursor-pointer group overflow-hidden flex flex-col min-h-0" onClick={onSelect}>
        <div className="flex-1 w-full min-h-[160px] bg-[var(--color-surface-well)] flex items-center justify-center overflow-hidden relative">
          {character.portraitUrl ? (
            <img src={character.portraitUrl} alt={character.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <svg className="w-24 h-24 text-[var(--color-text-subtle)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
        {/* GM Broadcast Status Badge */}
        {isBroadcastingToGM ? (
          <div className="absolute top-2 left-2 z-10">
            <span className="bg-emerald-500/90 text-white text-[10px] px-2 py-0.5 rounded-md backdrop-blur-sm border border-emerald-400/50 font-bold shadow-md flex items-center gap-1">
              <span>📡</span> Транслируется ГМу
            </span>
          </div>
        ) : (
          <div className="absolute top-2 left-2 z-10">
            <span className="bg-slate-800/80 text-slate-300 text-[10px] px-2 py-0.5 rounded-md backdrop-blur-sm border border-slate-700/50 font-medium">
              <span>👤</span> Хранилище
            </span>
          </div>
        )}
        {(character.ownerName || character.ownerId) && (
          <div className="absolute top-2 right-2 z-10">
            <span className="bg-black/75 text-emerald-300 text-[11px] px-2 py-0.5 rounded-md backdrop-blur-sm border border-emerald-500/30 font-semibold shadow-md flex items-center gap-1">
              <span>👤</span> {character.ownerName || 'Игрок'}
            </span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 text-white">
          <h3 className="text-lg font-bold truncate drop-shadow-md" title={character.name}>
            {character.name}
          </h3>
          <p className="text-xs text-white/80 truncate drop-shadow-sm" title={`${character.characterClass}, Уровень ${character.level}`}>
            {`${character.characterClass}, Уровень ${character.level}`}
          </p>
        </div>
      </div>
      <div className="p-3 bg-[var(--color-surface-inset)] flex flex-col gap-2.5 mt-auto border-t border-[var(--color-border-subtle)]">
        {/* Row 1: Small utility buttons */}
        <div className="flex items-center justify-around w-full">
            <button
                onClick={onExport}
                data-tooltip="Экспортировать персонажа"
                className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>
            <button
              onClick={onDuplicate}
              data-tooltip="Дублировать персонажа"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" />
              </svg>
            </button>
            {onSync && (
              <button
                onClick={onSync}
                data-tooltip="Повторно синхронизировать"
                className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-teal-400 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            {onClearCache && (isGM || !canDelete) && (
              <button
                onClick={onClearCache}
                data-tooltip={isGM ? "Удалить локальную копию у ГМа" : "Удалить чужую локальную копию"}
                className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-amber-400 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {onOpenStandalone && (
              <button
                onClick={handleOpenClick}
                data-tooltip="Открыть в новой вкладке"
                className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-base)] transition-colors flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            )}
        </div>

        {/* Row 2: GM Broadcast Toggle Switch */}
        {onSelectBroadcastGM && (
          <div className="w-full bg-[var(--color-surface-well)] px-2.5 py-1.5 rounded-lg border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--color-text-medium)] flex items-center gap-1.5">
              <span>📡</span> Трансляция ГМу:
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectBroadcastGM();
              }}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isBroadcastingToGM ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
              role="switch"
              aria-checked={isBroadcastingToGM}
              title={isBroadcastingToGM ? 'Трансляция ГМу включена (нажмите для выключения)' : 'Трансляция ГМу выключена (нажмите для включения)'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isBroadcastingToGM ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}

        {/* Row 3: Select & Delete buttons */}
        <div className={`w-full pt-0.5 ${canDelete ? 'grid grid-cols-2 gap-2' : 'flex items-center'}`}>
          <button
            onClick={onSelect}
            className="w-full bg-[var(--color-accent-primary)] text-white font-bold py-2 px-2 rounded-lg hover:bg-[var(--color-accent-primary-hover)] transition-all shadow active:scale-95 text-xs sm:text-sm truncate flex items-center justify-center gap-1"
          >
            <span>Выбрать</span>
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              data-tooltip={isGM ? "Удалить локальную копию у ГМа" : "Удалить персонажа навсегда"}
              className="w-full bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-600 hover:text-white font-bold py-2 px-2 rounded-lg transition-all shadow active:scale-95 text-xs sm:text-sm truncate flex items-center justify-center gap-1"
              aria-label="Удалить персонажа"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Удалить</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
