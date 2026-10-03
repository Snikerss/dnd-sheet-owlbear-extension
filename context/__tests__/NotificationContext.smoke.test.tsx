// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, screen, act, cleanup } from '@testing-library/react';
import { NotificationProvider, useNotifier } from '../NotificationContext';
import { RollType, type RollResult } from '../../types';

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

const wrapper = ({ children }: { children: ReactNode }) => (
  <NotificationProvider>{children}</NotificationProvider>
);

const rollResult: RollResult = {
  id: 'roll-1',
  name: 'Атака',
  roll1: 10,
  chosenRoll: 10,
  modifier: 7,
  total: 17,
  rollType: RollType.Normal,
  diceType: 'd20',
};

describe('NotificationContext (smoke)', () => {
  it('addNotification добавляет текст уведомления в DOM', () => {
    const { result } = renderHook(() => useNotifier(), { wrapper });
    act(() => {
      result.current.addNotification('Проверка тоста', 'info');
    });
    expect(screen.getByText('Проверка тоста')).toBeTruthy();
  });

  it('broadcastRoll в standalone-режиме не бросает исключений', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useNotifier(), { wrapper });
    await act(async () => {
      await expect(result.current.broadcastRoll('Маг', rollResult)).resolves.toBeUndefined();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
