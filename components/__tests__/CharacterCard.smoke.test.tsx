// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CharacterCard } from '../CharacterCard';
import { NotificationProvider } from '../../context/NotificationContext';
import { makeTestCharacter } from '../../state/testFixtures';

const renderCard = (ui: ReactElement) => render(<NotificationProvider>{ui}</NotificationProvider>);

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
    getActiveBoardCharacterId: () => 'x',
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

afterEach(() => {
  cleanup();
});

describe('CharacterCard (smoke)', () => {
  it('отображает имя персонажа', () => {
    const character = makeTestCharacter({ name: 'Барток' });
    renderCard(
      <CharacterCard
        character={character}
        onSelect={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />
    );
    expect(screen.getByText('Барток')).toBeTruthy();
  });

  it('кнопка удаления имеет aria-label', () => {
    const character = makeTestCharacter({ name: 'Барток' });
    renderCard(
      <CharacterCard
        character={character}
        onSelect={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Удалить персонажа')).toBeTruthy();
  });

  it('клик по карточке вызывает onSelect', () => {
    const character = makeTestCharacter({ name: 'Барток' });
    const onSelect = vi.fn();
    renderCard(
      <CharacterCard
        character={character}
        onSelect={onSelect}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Барток'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
