// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { useLocalBridgeSync } from './localSync';
import { BridgeMessageType } from '../protocol/messages';
import { makeTestCharacter } from '../state/testFixtures';
import type { Character } from '../types';
import type { CharacterEntry, CharactersAction, CharactersState } from '../state/appReducer';
import type { SyncStatusType } from '../components/SyncStatusIndicator';
import { saveCharacterApi } from '../utils/storage';
import { SESSION_CLIENT_ID, __subs } from '../utils/bridgeService';

declare module '../utils/bridgeService' {
  export const __subs: Array<(e: { data: unknown; source?: unknown }) => void>;
}

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

vi.mock('../utils/bridgeService', () => {
  const subs: Array<(e: { data: unknown; source?: unknown }) => void> = [];
  return {
    localBridge: {
      subscribe: (cb: (e: { data: unknown; source?: unknown }) => void) => {
        subs.push(cb);
        return () => {
          const idx = subs.indexOf(cb);
          if (idx !== -1) subs.splice(idx, 1);
        };
      },
      postMessage: vi.fn(),
      isDuplicateMessage: () => false,
    },
    SESSION_CLIENT_ID: 'self-id',
    __subs: subs,
  };
});

vi.mock('../utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/storage')>();
  return {
    ...actual,
    isOwlbear: () => false,
    loadFromLocalStorage: () => ({}),
    saveCharacterApi: vi.fn(async () => {}),
    deleteCharacterApi: vi.fn(async () => {}),
  };
});

vi.mock('../utils/roomRegistry', () => ({
  registerCurrentRoom: vi.fn(),
  saveKnownRooms: vi.fn(),
  getKnownRooms: () => [],
  loadKnownRoomsFromIndexedDB: async () => [],
  updateRoomAlias: vi.fn(),
}));

vi.mock('../auth/roleService', () => ({
  resolveRole: async () => 'PLAYER',
  getCachedRole: () => 'PLAYER',
  subscribeRole: () => () => {},
}));

function createTestDeps() {
  const dispatch = vi.fn<(action: CharactersAction) => void>();
  const setSyncStatus = vi.fn<(status: SetStateAction<SyncStatusType>) => void>();
  const setIsLoading = vi.fn<(loading: SetStateAction<boolean>) => void>();
  const isLoadingRef = { current: false };
  const lastSerializedRef = { current: {} as Record<string, string> };
  const charactersStateRef = { current: {} as CharactersState };
  const lastHeartbeatRef = { current: 0 };
  const lastPresentRef = { current: {} as Record<string, Character> };

  return {
    dispatch: dispatch as Dispatch<CharactersAction>,
    setSyncStatus: setSyncStatus as Dispatch<SetStateAction<SyncStatusType>>,
    setIsLoading: setIsLoading as Dispatch<SetStateAction<boolean>>,
    isLoadingRef,
    lastSerializedRef,
    charactersStateRef,
    lastHeartbeatRef,
    lastPresentRef,
  };
}

describe('useLocalBridgeSync — CHARACTER_SYNC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveCharacterApi).mockImplementation(async () => {});
    __subs.length = 0;
  });

  it('entry character передаётся в dispatch и persistence', () => {
    const deps = createTestDeps();
    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) {
      expect.fail('subscriber not registered');
    }

    const char = makeTestCharacter({ name: 'Тест' });
    const rawChar = { ...char, lastModified: 50 };
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other',
      entry: {
        character: rawChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    expect(deps.dispatch).toHaveBeenCalledTimes(1);
    const action = vi.mocked(deps.dispatch).mock.calls[0]?.[0];
    expect(action).toBeDefined();
    expect(action?.type).toBe('SYNC_REMOTE_CHARACTER');

    if (action?.type === 'SYNC_REMOTE_CHARACTER') {
      expect(action.payload.id).toBe('c1');
      const entry = action.payload.entry as CharacterEntry & { character?: unknown };
      expect(entry.character).toBe(rawChar);
      expect(entry.history.present).toBe(rawChar);
      expect(entry.imageCache).toBeInstanceOf(Map);

      expect(saveCharacterApi).toHaveBeenCalledWith('c1', action.payload.entry);
      const savedEntry = vi.mocked(saveCharacterApi).mock.calls[0]?.[1] as { character?: unknown };
      expect(savedEntry?.character).toBe(rawChar);
    }

    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
  });

  it('локальная версия новее — update отклоняется', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Тест' });
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: { ...char, lastModified: 100 },
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) {
      expect.fail('subscriber not registered');
    }

    const rawChar = { ...char, lastModified: 50 };
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other',
      entry: {
        character: rawChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    const syncRemoteCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([callAction]) => callAction.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncRemoteCalls).toHaveLength(0);
    expect(saveCharacterApi).not.toHaveBeenCalled();
  });

  it('своё сообщение игнорируется', () => {
    const deps = createTestDeps();
    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) {
      expect.fail('subscriber not registered');
    }

    const char = makeTestCharacter({ name: 'Тест' });
    const rawChar = { ...char, lastModified: 50 };
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: SESSION_CLIENT_ID,
      entry: {
        character: rawChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    expect(deps.dispatch).not.toHaveBeenCalled();
    expect(saveCharacterApi).not.toHaveBeenCalled();
  });

  it('повторный идентичный sync не дублирует dispatch', () => {
    const deps = createTestDeps();
    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) {
      expect.fail('subscriber not registered');
    }

    const char = makeTestCharacter({ name: 'Тест' });
    const rawChar = { ...char, lastModified: 50 };
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other',
      entry: {
        character: rawChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    expect(deps.dispatch).toHaveBeenCalledTimes(1);
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);

    act(() => {
      sub({ data: payload });
    });

    const syncRemoteCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([callAction]) => callAction.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncRemoteCalls).toHaveLength(1);
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
  });

  it('локальная правка НОВЕЕ (lastModified больше) → локальное значение побеждает при incoming sync', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Локальный герой' });
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: { ...char, lastModified: 200 },
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) expect.fail('subscriber not registered');

    const remoteChar = makeTestCharacter({ name: 'Устаревший удалённый', lastModified: 100 });
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other-tab',
      entry: {
        character: remoteChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    const syncCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([a]) => a.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncCalls).toHaveLength(0);
    expect(saveCharacterApi).not.toHaveBeenCalled();
  });

  it('удалённая правка НОВЕЕ (lastModified больше) → удалённая побеждает', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Локальный герой' });
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: { ...char, lastModified: 100 },
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) expect.fail('subscriber not registered');

    const remoteChar = makeTestCharacter({ name: 'Свежий удалённый', lastModified: 200 });
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other-tab',
      entry: {
        character: remoteChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    const syncCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([a]) => a.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncCalls).toHaveLength(1);
    const syncAction = syncCalls[0]?.[0];
    if (syncAction?.type === 'SYNC_REMOTE_CHARACTER') {
      expect(syncAction.payload.entry.history.present.name).toBe('Свежий удалённый');
      expect(syncAction.payload.entry.history.present.lastModified).toBe(200);
    }
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
  });

  it('одинаковый lastModified — детерминированный исход: входящая версия применяется (0 > 0 / равенство = false)', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Локальный герой' });
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: { ...char, lastModified: 150 },
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) expect.fail('subscriber not registered');

    const remoteChar = makeTestCharacter({ name: 'Удалённая версия с тем же временем', lastModified: 150 });
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other-tab',
      entry: {
        character: remoteChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    // Детерминированный LWW: локальная НЕ строго новее (150 > 150 ложно), входящая правка применяется
    const syncCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([a]) => a.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncCalls).toHaveLength(1);
    const syncAction = syncCalls[0]?.[0];
    if (syncAction?.type === 'SYNC_REMOTE_CHARACTER') {
      expect(syncAction.payload.entry.history.present.name).toBe('Удалённая версия с тем же временем');
    }
  });

  it('отсутствие поля lastModified у обеих сторон (legacy) — удалённая версия побеждает (0 > 0 = false)', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Локальный legacy' });
    delete char.lastModified;
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: char,
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) expect.fail('subscriber not registered');

    const remoteChar = makeTestCharacter({ name: 'Удалённый legacy' });
    delete remoteChar.lastModified;
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other-tab',
      entry: {
        character: remoteChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    // 0 > 0 ложно → удалённая побеждает как безопасный дефолт
    const syncCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([a]) => a.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncCalls).toHaveLength(1);
    const syncAction = syncCalls[0]?.[0];
    if (syncAction?.type === 'SYNC_REMOTE_CHARACTER') {
      expect(syncAction.payload.entry.history.present.name).toBe('Удалённый legacy');
    }
  });

  it('локальная запись с lastModified побеждает удалённую legacy без поля', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Локальный новый' });
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: { ...char, lastModified: 100 },
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) expect.fail('subscriber not registered');

    const remoteChar = makeTestCharacter({ name: 'Удалённый legacy' });
    delete remoteChar.lastModified;
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other-tab',
      entry: {
        character: remoteChar,
        log: [],
        history: undefined,
        imageCache: [],
      },
    };

    act(() => {
      sub({ data: payload });
    });

    // 100 > 0 истинно → локальный побеждает
    const syncCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([a]) => a.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncCalls).toHaveLength(0);
    expect(saveCharacterApi).not.toHaveBeenCalled();
  });

  it('удалённая запись с lastModified на уровне entry (P0-3 формат) побеждает устаревшую локальную', () => {
    const deps = createTestDeps();
    const char = makeTestCharacter({ name: 'Локальный старый' });
    deps.charactersStateRef.current['c1'] = {
      history: {
        past: [],
        present: { ...char, lastModified: 50 },
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    renderHook(() => useLocalBridgeSync(deps));
    const sub = __subs[0];
    if (!sub) expect.fail('subscriber not registered');

    const remoteChar = makeTestCharacter({ name: 'Удалённый P0-3' });
    delete remoteChar.lastModified;
    const payload = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'c1',
      senderClientId: 'other-tab',
      entry: {
        character: remoteChar,
        log: [],
        history: undefined,
        imageCache: [],
        lastModified: 150,
      },
    };

    act(() => {
      sub({ data: payload });
    });

    const syncCalls = vi.mocked(deps.dispatch).mock.calls.filter(
      ([a]) => a.type === 'SYNC_REMOTE_CHARACTER',
    );
    expect(syncCalls).toHaveLength(1);
    const syncAction = syncCalls[0]?.[0];
    if (syncAction?.type === 'SYNC_REMOTE_CHARACTER') {
      expect(syncAction.payload.entry.history.present.name).toBe('Удалённый P0-3');
      expect(syncAction.payload.entry.history.present.lastModified).toBe(150);
    }
  });
});
