// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CharacterSheet } from '../CharacterSheet';
import { NotificationProvider } from '../../context/NotificationContext';
import { CharacterProvider } from '../../context/CharacterContext';
import type { CharacterAction } from '../../types';
import { makeTestCharacter } from '../../state/testFixtures';

const noopDispatch = vi.fn() as unknown as React.Dispatch<CharacterAction>;

const renderSheet = (
  overrides: Partial<Parameters<typeof CharacterSheet>[0]> = {},
  character = makeTestCharacter({ name: 'Барток' }),
) => {
  const props = {
    onOpenCharacterManager: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: false,
    onOpenHistoryLog: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <NotificationProvider>
      <CharacterProvider character={character} dispatch={noopDispatch}>
        <CharacterSheet {...props} />
      </CharacterProvider>
    </NotificationProvider>
  );
  return { ...utils, props };
};

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
    getCurrentRoomId: () => 'room-1',
    getCurrentRoomName: () => 'Комната',
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

describe('CharacterSheet (smoke after split)', () => {
  it('рендерит имя персонажа и панель инструментов', () => {
    renderSheet();

    expect(screen.getByDisplayValue('Барток')).toBeTruthy();
    expect(screen.getByLabelText('Открыть историю изменений')).toBeTruthy();
    expect(screen.getByLabelText('Отменить последнее действие')).toBeTruthy();
    expect(screen.getByLabelText('Вернуть отменённое действие')).toBeTruthy();
    expect(screen.getByLabelText('Открыть универсальный бросок кубиков')).toBeTruthy();
  });

  it('клик по кнопке истории вызывает onOpenHistoryLog', () => {
    const { props } = renderSheet();

    fireEvent.click(screen.getByLabelText('Открыть историю изменений'));
    expect(props.onOpenHistoryLog).toHaveBeenCalledTimes(1);
  });

  it('FAB кубика открывает DiceRollerModal через SheetModals (ленивая загрузка)', async () => {
    renderSheet();

    expect(screen.queryByText(/Универсальный бросок кубиков/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Открыть универсальный бросок кубиков'));
    // DiceRollerModal теперь React.lazy — чанк грузится асинхронно под Suspense.
    expect(await screen.findByText(/Универсальный бросок кубиков/)).toBeTruthy();
  });

  it('рендерит все вкладки и позволяет переключаться между ними, даже если character.tabOrder пустой массив', () => {
    const charWithEmptyTabOrder = makeTestCharacter({ name: 'Барток', tabOrder: [] });
    renderSheet({}, charWithEmptyTabOrder);

    // Все вкладки должны присутствовать на экране
    expect(screen.getByText('Характеристики')).toBeTruthy();
    expect(screen.getByText('Бой')).toBeTruthy();
    expect(screen.getByText('Инвентарь')).toBeTruthy();
    expect(screen.getByText('Умения')).toBeTruthy();
    expect(screen.getByText('Заметки')).toBeTruthy();

    // По умолчанию открыта вкладка характеристик (StatsGrid)
    expect(screen.getByText('Сила')).toBeTruthy();

    // Кликаем по вкладке "Инвентарь"
    const inventoryTabs = screen.getAllByText('Инвентарь');
    fireEvent.click(inventoryTabs[0]!);

    // Контент инвентаря должен отрендериться (кнопка восстановления "Рассвет")
    expect(screen.getByText('Рассвет')).toBeTruthy();

    // Кликаем по вкладке "Заметки"
    fireEvent.click(screen.getByText('Заметки'));

    // Контент заметок должен отрендериться
    expect(screen.getByText('Папки и заметки')).toBeTruthy();
  });
});
