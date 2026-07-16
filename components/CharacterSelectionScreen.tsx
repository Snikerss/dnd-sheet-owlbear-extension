import React, { useRef } from 'react';
import { CharacterCard } from './CharacterCard';
import type { Character } from '../types';
import { isCharacter, migrateCharacterData } from '../state/initialization';
import { useNotifier } from '../context/NotificationContext';
import { generateUUID } from '../utils/uuid';

interface CharacterSelectionScreenProps {
  characters: Record<string, Character>;
  onSelectCharacter: (id: string) => void;
  onCreateCharacter: () => void;
  onDeleteCharacter: (id: string) => void;
  onDuplicateCharacter: (id: string) => void;
  onAddCharacter: (id: string, character: Character) => void;
}

export const CharacterSelectionScreen: React.FC<CharacterSelectionScreenProps> = ({
  characters,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
  onDuplicateCharacter,
  onAddCharacter,
}) => {
  const characterEntries = Object.entries(characters);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addNotification } = useNotifier();

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
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.dndchar.json') && !file.name.endsWith('.json')) {
        addNotification("Неверный тип файла. Пожалуйста, выберите файл '.dndchar.json' или '.json'.", 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("Не удалось прочитать файл.");
        
        const importedCharacter = JSON.parse(text);
        const migratedCharacter = migrateCharacterData(importedCharacter);

        if (isCharacter(migratedCharacter)) {
          const newId = generateUUID();
          onAddCharacter(newId, migratedCharacter as Character);
          addNotification(`Персонаж "${migratedCharacter.name}" успешно импортирован!`, 'success');
        } else {
          throw new Error("Файл поврежден или имеет неверный формат.");
        }
      } catch (error) {
        console.error("Ошибка импорта персонажа:", error);
        addNotification(`Не удалось импортировать персонажа. ${error instanceof Error ? error.message : 'Неизвестная ошибка.'}`, 'error');
      } finally {
        if (event.target) {
            event.target.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-4 md:p-8 flex flex-col">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".json,application/json"
        onChange={handleFileImport}
      />
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-text-base)]">Лист персонажа D&D 5e</h1>
        <p className="text-lg text-[var(--color-text-medium)] mt-2">Выберите персонажа или создайте нового</p>
        <div className="mt-4">
             <button
              onClick={triggerImport}
              className="bg-[var(--color-surface-raised)] text-[var(--color-text-base)] font-bold py-2 px-6 rounded-lg hover:bg-[var(--color-surface-raised-hover)] transition-all shadow-md active:scale-95"
            >
              Импортировать персонажа
            </button>
        </div>
      </header>

      <main className="flex-grow">
        {characterEntries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-screen-2xl mx-auto">
            {characterEntries.map(([id, character]) => (
              <CharacterCard
                key={id}
                character={character}
                onSelect={() => onSelectCharacter(id)}
                onDuplicate={() => onDuplicateCharacter(id)}
                onDelete={() => onDeleteCharacter(id)}
                onExport={() => handleExportCharacter(id)}
              />
            ))}
             <button
              onClick={onCreateCharacter}
              className="group aspect-[4/5] bg-[var(--color-surface-opaque)] rounded-xl shadow-lg border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="mt-4 text-lg font-semibold">Создать персонажа</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-full max-w-md mx-auto">
            <svg className="w-24 h-24 text-[var(--color-text-subtle)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-2xl font-bold mt-4">Нет созданных персонажей</h2>
            <p className="text-[var(--color-text-medium)] mt-2">Нажмите кнопку ниже, чтобы начать свое приключение и создать первого персонажа.</p>
            <button
              onClick={onCreateCharacter}
              className="mt-6 bg-[var(--color-accent-primary-active)] text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-[var(--color-accent-primary-dark)] transition-all shadow-lg active:scale-95"
            >
              Создать первого персонажа
            </button>
          </div>
        )}
      </main>

       <footer className="text-center mt-8 text-sm text-[var(--color-text-muted)]">
            <p>&copy; {new Date().getFullYear()}. Все права защищены... или нет.</p>
        </footer>
    </div>
  );
};