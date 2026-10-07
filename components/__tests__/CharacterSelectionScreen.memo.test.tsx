// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CharacterSelectionScreen } from '../CharacterSelectionScreen';
import { NotificationProvider } from '../../context/NotificationContext';
import { makeTestCharacter } from '../../state/testFixtures';
import type { Character } from '../../types';

const renderCounts: Record<string, number> = { c1: 0, c2: 0 };

vi.mock('../CharacterCard', () => {
  const MockCard = React.memo((props: {
    characterId?: string;
    character: Character;
    onSelect: (id: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onExport: (id: string) => void;
  }) => {
    const id = props.characterId ?? '';
    if (id in renderCounts) {
      renderCounts[id] = (renderCounts[id] ?? 0) + 1;
    }
    return (
      <div data-testid={`card-${id}`}>
        <span>{props.character.name}</span>
        <button onClick={() => props.onSelect(id)}>Выбрать {id}</button>
      </div>
    );
  });
  MockCard.displayName = 'MockCharacterCard';
  return {
    CharacterCard: MockCard,
  };
});

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    player: {
      id: 'p1',
      getName: async () => 'Тест',
      getRole: async () => 'PLAYER',
    },
    isReady: true,
    onReady: (cb: () => void) => cb(),
    broadcast: {
      sendMessage: async () => {},
      onMessage: (_channel: string, _cb?: unknown) => () => {},
    },
    popover: {
      open: async () => ({}),
      close: async () => {},
    },
    viewport: { getWidth: async () => 1024 },
    action: { setWidth: () => {}, setHeight: () => {} },
  },
}));

vi.mock('../../utils/p2pBridge', () => ({
  p2pRoomBridge: {
    getActiveBoardCharacterId: () => null,
    subscribe: () => () => {},
    broadcast: () => {},
    registerWindow: () => {},
    connect: () => {},
    disconnect: () => {},
  },
}));

vi.mock('../../utils/bridgeService', () => ({
  localBridge: {
    subscribe: () => () => {},
    postMessage: () => {},
    isDuplicateMessage: () => false,
  },
}));

describe('CharacterSelectionScreen memoization', () => {
  beforeEach(() => {
    renderCounts.c1 = 0;
    renderCounts.c2 = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('при перерендере CharacterSelectionScreen с теми же данными карточки memo-карточки не перерисовываются', () => {
    const char1 = makeTestCharacter({ name: 'Герой 1' });
    const char2 = makeTestCharacter({ name: 'Герой 2' });
    const characters: Record<string, Character> = { c1: char1, c2: char2 };

    const onSelectCharacter = vi.fn();
    const onDeleteCharacter = vi.fn();
    const onDuplicateCharacter = vi.fn();
    const onAddCharacter = vi.fn();
    const onOpenStandalone = vi.fn();
    const onCreateCharacter = vi.fn();

    const { rerender } = render(
      <NotificationProvider>
        <CharacterSelectionScreen
          characters={characters}
          onSelectCharacter={onSelectCharacter}
          onDeleteCharacter={onDeleteCharacter}
          onDuplicateCharacter={onDuplicateCharacter}
          onAddCharacter={onAddCharacter}
          onOpenStandalone={onOpenStandalone}
          onCreateCharacter={onCreateCharacter}
        />
      </NotificationProvider>
    );

    // Первоначальный рендер: каждая карточка отрисована 1 раз
    expect(renderCounts.c1).toBe(1);
    expect(renderCounts.c2).toBe(1);

    // Повторный рендер экрана с теми же пропсами
    rerender(
      <NotificationProvider>
        <CharacterSelectionScreen
          characters={characters}
          onSelectCharacter={onSelectCharacter}
          onDeleteCharacter={onDeleteCharacter}
          onDuplicateCharacter={onDuplicateCharacter}
          onAddCharacter={onAddCharacter}
          onOpenStandalone={onOpenStandalone}
          onCreateCharacter={onCreateCharacter}
        />
      </NotificationProvider>
    );

    // Счётчики рендеров не должны вырасти
    expect(renderCounts.c1).toBe(1);
    expect(renderCounts.c2).toBe(1);

    // Рендер с изменением данных ТОЛЬКО персонажа c1
    const updatedChar1 = makeTestCharacter({ name: 'Герой 1 (изменен)' });
    const newCharacters: Record<string, Character> = { c1: updatedChar1, c2: char2 };

    rerender(
      <NotificationProvider>
        <CharacterSelectionScreen
          characters={newCharacters}
          onSelectCharacter={onSelectCharacter}
          onDeleteCharacter={onDeleteCharacter}
          onDuplicateCharacter={onDuplicateCharacter}
          onAddCharacter={onAddCharacter}
          onOpenStandalone={onOpenStandalone}
          onCreateCharacter={onCreateCharacter}
        />
      </NotificationProvider>
    );

    // c1 должен перерисоваться (2), а c2 — НЕ должен перерисовываться (1)
    expect(renderCounts.c1).toBe(2);
    expect(renderCounts.c2).toBe(1);

    // Проверяем работу стабильного обработчика с передачей characterId
    fireEvent.click(screen.getByText('Выбрать c1'));
    expect(onSelectCharacter).toHaveBeenCalledWith('c1');
  });
});
