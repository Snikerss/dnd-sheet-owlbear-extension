import React, { useRef, useState, useMemo } from 'react';
import { CharacterCard } from './CharacterCard';
import { RoomBindingModal } from './RoomBindingModal';
import type { Character } from '../types';
import { isCharacter, migrateCharacterData } from '../state/initialization';
import { useNotifier } from '../context/NotificationContext';
import { generateUUID } from '../utils/uuid';
import { compressCharacterImages } from '../utils/imageCompress';
import { getKnownRooms, OwlbearRoomBinding } from '../utils/roomRegistry';
import { isOwlbear } from '../utils/storage';
import OBR from '@owlbear-rodeo/sdk';

interface CharacterSelectionScreenProps {
  characters: Record<string, Character>;
  syncingCharacters?: Record<string, { status: 'images', pendingImages: string[] }>;
  currentUserId?: string | null;
  activeBoardCharacterId?: string | null;
  onSelectActiveBoardCharacter?: (id: string) => void;
  onSelectCharacter: (id: string) => void;
  onCreateCharacter: () => void;
  onDeleteCharacter: (id: string) => void;
  onDuplicateCharacter: (id: string) => void;
  onAddCharacter: (id: string, character: Character) => void;
  onOpenStandalone: (id: string) => void;
  onSyncCharacter?: (id: string) => void;
  onClearLocalCache?: (id: string) => void;
  onExportVault?: () => void;
  onImportVault?: (fileContent: string) => void;
  isGM?: boolean;
}

export const CharacterSelectionScreen: React.FC<CharacterSelectionScreenProps> = ({
  characters,
  syncingCharacters,
  currentUserId,
  activeBoardCharacterId,
  onSelectActiveBoardCharacter,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
  onDuplicateCharacter,
  onAddCharacter,
  onOpenStandalone,
  onSyncCharacter,
  onClearLocalCache,
  onExportVault,
  onImportVault,
  isGM = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addNotification } = useNotifier();

  const characterEntries = useMemo(() => Object.entries(characters), [characters]);

  const handleExportCharacter = (id: string) => {
    const character = characters[id];
    if (!character) return;
    const fileName = `${character.name.replace(/\s+/g, '_')}.dndchar.json`;
    const data = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    addNotification(`Персонаж "${character.name}" успешно экспортирован.`, 'info');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const resetInput = () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) return;
        const parsed = JSON.parse(content);

        if (parsed.knownRooms || parsed.version === 2) {
          if (onImportVault) {
            onImportVault(content);
          }
          resetInput();
          return;
        }

        const rawCharData = parsed.character || parsed;
        const migrated = migrateCharacterData(rawCharData);

        if (isCharacter(migrated)) {
          const compressed = await compressCharacterImages(migrated);
          const newId = generateUUID();
          onAddCharacter(newId, compressed);
          addNotification(`Персонаж "${compressed.name}" успешно импортирован!`, 'info');
        } else {
          addNotification('Некорректная структура файла персонажа.', 'error');
        }
      } catch (err) {
        console.error('Failed to parse JSON file:', err);
        addNotification(' Ошибка при чтении файла. Убедитесь, что это валидный JSON файл.', 'error');
      } finally {
        resetInput();
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-4 md:p-8 flex flex-col">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".json,.dndchar.json,.dndvault.json,application/json"
        onChange={handleFileImport}
      />

      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-text-base)]">
          Мастер-Хранилище Персонажей
        </h1>
        <p className="text-lg text-[var(--color-text-medium)] mt-2">
          Управляйте персонажами и трансляцией ГМу на карту Owlbear Rodeo
        </p>

        {/* Action Buttons Toolbar */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-[var(--color-surface-raised)] text-[var(--color-text-base)] font-bold py-2 px-5 rounded-xl hover:bg-[var(--color-surface-raised-hover)] transition-all shadow-md active:scale-95 text-xs sm:text-sm flex items-center gap-2"
          >
            <span>📥</span> Импортировать (.json / .dndvault)
          </button>
          
          {onExportVault && (
            <button
              onClick={onExportVault}
              className="bg-gradient-to-r from-teal-700/60 to-cyan-700/60 text-teal-200 border border-teal-500/30 font-bold py-2 px-5 rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-md active:scale-95 text-xs sm:text-sm flex items-center gap-2"
            >
              <span>💾</span> Экспортировать Хранилище (.dndvault.json)
            </button>
          )}
        </div>
      </header>

      <main className="flex-grow">
        {characterEntries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-screen-2xl mx-auto">
            {characterEntries.map(([id, character]) => {
              const syncState = syncingCharacters?.[id];
              const isBroadcastingToGM = id === activeBoardCharacterId;
              return (
                <CharacterCard
                  key={id}
                  character={character}
                  onSelect={() => onSelectCharacter(id)}
                  onDuplicate={() => onDuplicateCharacter(id)}
                  onDelete={() => onDeleteCharacter(id)}
                  onExport={() => handleExportCharacter(id)}
                  onOpenStandalone={() => onOpenStandalone(id)}
                  onSync={onSyncCharacter ? () => onSyncCharacter(id) : undefined}
                  onClearCache={onClearLocalCache ? () => onClearLocalCache(id) : undefined}
                  isBroadcastingToGM={isBroadcastingToGM}
                  onSelectBroadcastGM={onSelectActiveBoardCharacter ? () => onSelectActiveBoardCharacter(id) : undefined}
                  isSyncing={!!syncState}
                  pendingImagesCount={syncState?.pendingImages.length || 0}
                  currentUserId={currentUserId}
                  isGM={isGM}
                />
              );
            })}
            <button
              onClick={onCreateCharacter}
              className="group min-h-[380px] h-full bg-[var(--color-surface-opaque)] rounded-xl shadow-lg border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="mt-4 text-lg font-semibold">Создать персонажа</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-full max-w-md mx-auto py-12">
            <svg className="w-24 h-24 text-[var(--color-text-subtle)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-2xl font-bold mt-4">Нет персонажей в выбранной категории</h2>
            <p className="text-[var(--color-text-medium)] mt-2">
              Измените фильтр досок или создайте нового персонажа.
            </p>
            <button
              onClick={onCreateCharacter}
              className="mt-6 bg-[var(--color-accent-primary-active)] text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-[var(--color-accent-primary-dark)] transition-all shadow-lg active:scale-95"
            >
              Создать персонажа
            </button>
          </div>
        )}
      </main>

      <footer className="text-center mt-8 text-sm text-[var(--color-text-muted)]">
        <p>&copy; {new Date().getFullYear()} D&D 5e Master Vault. Все изменения сохранены локально.</p>
      </footer>
    </div>
  );
};