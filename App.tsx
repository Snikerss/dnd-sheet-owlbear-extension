import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CharacterSelectionScreen } from './components/CharacterSelectionScreen';
import { CharacterSheet } from './components/CharacterSheet';
import { ConfirmationModal } from './components/ConfirmationModal';
import { HistoryLogModal } from './components/HistoryLogModal';
import { CharacterAction, Character, LogEntry } from './types';
import { useCharacterManager } from './state/useCharacterManager';
import { defaultCharacterState } from './state/defaultCharacterState';
import { NotificationProvider } from './context/NotificationContext';
import { CharacterProvider } from './context/CharacterContext';
import { generateUUID } from './utils/uuid';

const AppContent: React.FC = () => {
  const { characters, isLoading, addCharacter, deleteCharacter, updateCharacter, undo, redo } = useCharacterManager();
  
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [characterPendingDeletion, setCharacterPendingDeletion] = useState<{id: string, name: string} | null>(null);
  const [isHistoryLogOpen, setIsHistoryLogOpen] = useState(false);

  useEffect(() => {
    if (activeCharacterId && !characters[activeCharacterId]) {
      setActiveCharacterId(null);
    }
  }, [characters, activeCharacterId]);

  useEffect(() => {
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'global-tooltip';
    document.body.appendChild(tooltipEl);

    let activeEl: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tooltipTarget = target.closest('[data-tooltip]') as HTMLElement | null;

      if (!tooltipTarget) {
        if (activeEl) {
          tooltipEl.classList.remove('visible');
          activeEl = null;
        }
        return;
      }

      if (tooltipTarget === activeEl) return;
      activeEl = tooltipTarget;

      const text = tooltipTarget.getAttribute('data-tooltip');
      if (!text) {
        tooltipEl.classList.remove('visible');
        return;
      }

      const pos = tooltipTarget.getAttribute('data-tooltip-pos') || 'top';
      
      tooltipEl.textContent = text;
      tooltipEl.className = `global-tooltip global-tooltip-${pos}`;
      
      const rect = tooltipTarget.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      let top = 0;
      let left = 0;

      if (pos === 'top') {
        left = rect.left + rect.width / 2 + scrollX;
        top = rect.top + scrollY;
      } else if (pos === 'bottom') {
        left = rect.left + rect.width / 2 + scrollX;
        top = rect.bottom + scrollY;
      } else if (pos === 'left') {
        left = rect.left + scrollX;
        top = rect.top + rect.height / 2 + scrollY;
      } else if (pos === 'right') {
        left = rect.right + scrollX;
        top = rect.top + rect.height / 2 + scrollY;
      }

      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
      
      // Force reflow
      tooltipEl.offsetHeight;
      tooltipEl.classList.add('visible');
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (activeEl && (!relatedTarget || !activeEl.contains(relatedTarget))) {
        tooltipEl.classList.remove('visible');
        activeEl = null;
      }
    };

    const handleScrollOrResize = () => {
      if (activeEl) {
        const rect = activeEl.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const pos = activeEl.getAttribute('data-tooltip-pos') || 'top';

        let top = 0;
        let left = 0;

        if (pos === 'top') {
          left = rect.left + rect.width / 2 + scrollX;
          top = rect.top + scrollY;
        } else if (pos === 'bottom') {
          left = rect.left + rect.width / 2 + scrollX;
          top = rect.bottom + scrollY;
        } else if (pos === 'left') {
          left = rect.left + scrollX;
          top = rect.top + rect.height / 2 + scrollY;
        } else if (pos === 'right') {
          left = rect.right + scrollX;
          top = rect.top + rect.height / 2 + scrollY;
        }

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      if (document.body.contains(tooltipEl)) {
        document.body.removeChild(tooltipEl);
      }
    };
  }, []);

  const handleCreateCharacter = useCallback(() => {
    const newId = generateUUID();
    const newCharacter: Character = structuredClone(defaultCharacterState);
    newCharacter.name = 'Новый персонаж';
    addCharacter(newId, newCharacter);
    setActiveCharacterId(newId);
  }, [addCharacter]);

  const handleDeleteCharacter = useCallback((id: string) => {
    const characterToDelete = characters[id]?.history.present;
    if (characterToDelete) {
      setCharacterPendingDeletion({ id, name: characterToDelete.name });
    }
  }, [characters]);

  const handleDuplicateCharacter = useCallback((id: string) => {
    const characterToCopy = characters[id]?.history.present;
    if (!characterToCopy) return;

    const newId = generateUUID();
    const newCharacter: Character = structuredClone(characterToCopy);
    newCharacter.name = `${characterToCopy.name} (копия)`;

    addCharacter(newId, newCharacter);
    setActiveCharacterId(newId);
  }, [characters, addCharacter]);

  const handleUpdateCharacter = useCallback((action: CharacterAction) => {
    if (activeCharacterId) {
      updateCharacter(activeCharacterId, action);
    }
  }, [activeCharacterId, updateCharacter]);

  const handleUndo = useCallback(() => {
    if (activeCharacterId) {
      undo(activeCharacterId);
    }
  }, [activeCharacterId, undo]);

  const handleRedo = useCallback(() => {
    if (activeCharacterId) {
      redo(activeCharacterId);
    }
  }, [activeCharacterId, redo]);

  // Преобразуем полное состояние персонажей в упрощенный Record<string, Character> для экрана выбора.
  const characterList = useMemo(() => {
    return Object.fromEntries(
      Object.entries(characters).map(([id, data]) => [id, data.history.present])
    );
  }, [characters]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center text-[var(--color-text-base)]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-lg font-semibold tracking-wide">Загрузка персонажей...</p>
        </div>
      </div>
    );
  }

  const confirmDeletion = () => {
    if (characterPendingDeletion) {
      deleteCharacter(characterPendingDeletion.id);
      setCharacterPendingDeletion(null);
    }
  };

  const cancelDeletion = () => {
    setCharacterPendingDeletion(null);
  };

  const activeCharacterState = activeCharacterId ? characters[activeCharacterId] : null;
  const activeCharacter = activeCharacterState?.history.present;
  const activeLog: LogEntry[] = activeCharacterState?.log || [];
  const canUndo = (activeCharacterState?.history.past.length ?? 0) > 0;
  const canRedo = (activeCharacterState?.history.future.length ?? 0) > 0;
  
  return (
    <>
      <ConfirmationModal
        isOpen={!!characterPendingDeletion}
        title="Подтвердите удаление"
        message={`Вы уверены, что хотите удалить персонажа "${characterPendingDeletion?.name}"?\nЭто действие необратимо.`}
        onConfirm={confirmDeletion}
        onCancel={cancelDeletion}
        confirmText="Удалить навсегда"
        cancelText="Отмена"
      />

      <HistoryLogModal
        isOpen={isHistoryLogOpen}
        onClose={() => setIsHistoryLogOpen(false)}
        log={activeLog}
      />

      {activeCharacter && activeCharacterId ? (
        <CharacterProvider character={activeCharacter} dispatch={handleUpdateCharacter}>
            <CharacterSheet
              key={activeCharacterId}
              onOpenCharacterManager={() => setActiveCharacterId(null)}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onOpenHistoryLog={() => setIsHistoryLogOpen(true)}
            />
        </CharacterProvider>
      ) : (
        <CharacterSelectionScreen
          characters={characterList}
          onSelectCharacter={setActiveCharacterId}
          onCreateCharacter={handleCreateCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onDuplicateCharacter={handleDuplicateCharacter}
          onAddCharacter={addCharacter}
        />
      )}
    </>
  );
}

const App: React.FC = () => {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
};

export default App;