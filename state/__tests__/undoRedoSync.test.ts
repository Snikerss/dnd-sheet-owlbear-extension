// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCharacterManager } from '../useCharacterManager';
import { BridgeMessageType } from '../../protocol/messages';
import { makeTestCharacter } from '../testFixtures';
import { charactersReducer } from '../appReducer';
import type { CharacterEntry, CharactersState } from '../appReducer';
import { useLocalBridgeSync } from '../../sync/localSync';
import { serializeForCache } from '../persistence';

// Hoisted storage & bridge mocks
const { mockLocalBridge, mockStorageRepo, postedMessages } = vi.hoisted(() => {
  const posted: Array<Record<string, unknown>> = [];
  return {
    postedMessages: posted,
    mockLocalBridge: {
      postMessage: vi.fn((data: Record<string, unknown>) => {
        posted.push(data);
      }),
      subscribe: vi.fn((_cb?: (event: { data: unknown }) => void) => () => {}),
      isDuplicateMessage: () => false,
      reconnectStandaloneWindows: vi.fn(),
      registerChildWindow: vi.fn(),
    },
    mockStorageRepo: {
      loadCharacters: vi.fn(async () => ({})),
      saveCharacters: vi.fn(async () => {}),
    },
  };
});

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    player: { id: 'p1', getName: async () => 'Игрок', getRole: async () => 'PLAYER' },
    isReady: true,
    onReady: (cb: () => void) => cb(),
    broadcast: {
      sendMessage: async () => {},
      onMessage: () => () => {},
    },
  },
}));

vi.mock('../../utils/environment', () => ({
  isOwlbear: () => false,
  SAME_ORIGIN: 'http://localhost',
  OWLBEAR_ORIGINS: [],
  isTrustedMessageOrigin: () => true,
  getOwlbearParentOrigin: () => 'http://localhost',
}));

vi.mock('../../utils/storageRepository', () => ({
  storageRepository: mockStorageRepo,
}));

vi.mock('../../utils/bridgeService', () => ({
  localBridge: mockLocalBridge,
  SESSION_CLIENT_ID: 'tab-A-client',
}));

vi.mock('../../utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storage')>();
  return {
    ...actual,
    isOwlbear: () => false,
    SESSION_CLIENT_ID: 'tab-A-client',
    saveCharacterApi: vi.fn(async () => {}),
    deleteCharacterApi: vi.fn(async () => {}),
    broadcastCharacterSync: vi.fn(async () => {}),
    purgeLocalCharacter: vi.fn(),
    loadFromLocalStorage: () => ({}),
  };
});

vi.mock('../../context/NotificationContext', () => ({
  useNotifier: () => ({
    addNotification: vi.fn(),
    broadcastRoll: vi.fn(),
  }),
}));

vi.mock('../../utils/roomRegistry', () => ({
  registerCurrentRoom: vi.fn(),
  getKnownRooms: () => [],
  saveKnownRooms: vi.fn(),
}));

vi.mock('../../utils/p2pBridge', () => ({
  p2pRoomBridge: {
    subscribe: () => () => {},
    broadcast: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getActiveBoardCharacterId: () => null,
    setActiveBoardCharacter: vi.fn(),
  },
}));

describe('Phase 3: Cross-tab Undo/Redo & Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postedMessages.length = 0;
  });

  it('1. undo с непустым past → localBridge.postMessage вызван с CHARACTER_SYNC и полным payload', async () => {
    const charInitial = makeTestCharacter({ name: 'Версия 1', lastModified: 1000 });

    const { result, unmount } = renderHook(() => useCharacterManager());

    // Добавляем персонажа
    act(() => {
      result.current.addCharacter('c1', charInitial);
    });

    expect(result.current.characters['c1']?.history.present.name).toBe('Версия 1');

    // Делаем изменение, чтобы заполнить past[]
    act(() => {
      result.current.updateCharacter('c1', {
        type: 'SET_FIELD',
        payload: { field: 'name', value: 'Версия 2' },
      });
    });

    expect(result.current.characters['c1']?.history.present.name).toBe('Версия 2');
    expect(result.current.characters['c1']?.history.past).toHaveLength(1);

    mockLocalBridge.postMessage.mockClear();
    postedMessages.length = 0;

    // Вызываем undo
    act(() => {
      result.current.undo('c1');
    });

    // 1. Состояние откатилось к Версии 1
    const postUndoEntry = result.current.characters['c1']!;
    expect(postUndoEntry.history.present.name).toBe('Версия 1');
    expect(postUndoEntry.history.past).toHaveLength(0);
    expect(postUndoEntry.history.future).toHaveLength(1);
    expect(postUndoEntry.history.future[0]?.name).toBe('Версия 2');

    // 2. localBridge.postMessage вызван с CHARACTER_SYNC
    expect(mockLocalBridge.postMessage).toHaveBeenCalledTimes(1);
    const syncMsg = postedMessages[0] as {
      type: string;
      charId: string;
      entry: CharacterEntry & { character: { name: string; lastModified: number } };
      senderClientId: string;
    };

    expect(syncMsg).toBeDefined();
    expect(syncMsg.type).toBe(BridgeMessageType.CHARACTER_SYNC);
    expect(syncMsg.charId).toBe('c1');
    expect(syncMsg.senderClientId).toBe('tab-A-client');

    // 3. Payload содержит полный entry:
    expect(syncMsg.entry.character.name).toBe('Версия 1');
    expect(syncMsg.entry.history.present.name).toBe('Версия 1');
    expect(syncMsg.entry.history.past).toHaveLength(0);
    expect(syncMsg.entry.history.future).toHaveLength(1);
    expect(syncMsg.entry.history.future[0]?.name).toBe('Версия 2');
    expect(Array.isArray(syncMsg.entry.imageCache)).toBe(true);
    expect(syncMsg.entry.history.present.lastModified).toBeGreaterThan(1000);
    expect(syncMsg.entry.character.lastModified).toBe(syncMsg.entry.history.present.lastModified);

    unmount();
  });

  it('2. redo с непустым future → localBridge.postMessage вызван с CHARACTER_SYNC и вернутой версией', async () => {
    const charInitial = makeTestCharacter({ name: 'Версия 1', lastModified: 1000 });
    const { result, unmount } = renderHook(() => useCharacterManager());

    act(() => {
      result.current.addCharacter('c1', charInitial);
    });

    // Шаг 1 -> Шаг 2 -> Undo -> Redo
    act(() => {
      result.current.updateCharacter('c1', {
        type: 'SET_FIELD',
        payload: { field: 'name', value: 'Версия 2' },
      });
    });

    act(() => {
      result.current.undo('c1');
    });

    mockLocalBridge.postMessage.mockClear();
    postedMessages.length = 0;

    // Вызываем redo
    act(() => {
      result.current.redo('c1');
    });

    // 1. Состояние вернулось к Версии 2
    const postRedoEntry = result.current.characters['c1']!;
    expect(postRedoEntry.history.present.name).toBe('Версия 2');
    expect(postRedoEntry.history.past).toHaveLength(1);
    expect(postRedoEntry.history.past[0]?.name).toBe('Версия 1');
    expect(postRedoEntry.history.future).toHaveLength(0);

    // 2. localBridge.postMessage вызван с CHARACTER_SYNC
    expect(mockLocalBridge.postMessage).toHaveBeenCalledTimes(1);
    const syncMsg = postedMessages[0] as {
      type: string;
      charId: string;
      entry: CharacterEntry & { character: { name: string; lastModified: number } };
    };

    expect(syncMsg.type).toBe(BridgeMessageType.CHARACTER_SYNC);
    expect(syncMsg.charId).toBe('c1');
    expect(syncMsg.entry.character.name).toBe('Версия 2');
    expect(syncMsg.entry.history.present.name).toBe('Версия 2');
    expect(syncMsg.entry.history.past).toHaveLength(1);
    expect(syncMsg.entry.history.future).toHaveLength(0);
    expect(syncMsg.entry.history.present.lastModified).toBeGreaterThan(1000);

    unmount();
  });

  it('3. undo с пустым past → postMessage НЕ вызывается', async () => {
    const charInitial = makeTestCharacter({ name: 'Версия 1', lastModified: 1000 });
    const { result, unmount } = renderHook(() => useCharacterManager());

    act(() => {
      result.current.addCharacter('c1', charInitial);
    });

    mockLocalBridge.postMessage.mockClear();
    postedMessages.length = 0;

    // Past изначально пуст — undo это no-op
    act(() => {
      result.current.undo('c1');
    });

    expect(mockLocalBridge.postMessage).not.toHaveBeenCalled();
    expect(postedMessages).toHaveLength(0);

    unmount();
  });

  it('4. Кросstab-интеграция: Tab A undo → Tab B принимает SYNC_REMOTE_CHARACTER и конвергирует историю; LWW отбрасывает при более свежей правке в B', async () => {
    // Таб A
    const charV1 = makeTestCharacter({ name: 'Шаг 1', lastModified: 1000 });
    const { result: tabA, unmount: unmountA } = renderHook(() => useCharacterManager());

    act(() => {
      tabA.current.addCharacter('c1', charV1);
    });

    // Tab A делает правку -> Шаг 2
    act(() => {
      tabA.current.updateCharacter('c1', {
        type: 'SET_FIELD',
        payload: { field: 'name', value: 'Шаг 2' },
      });
    });

    mockLocalBridge.postMessage.mockClear();
    postedMessages.length = 0;

    // Tab A делает undo -> Шаг 1
    act(() => {
      tabA.current.undo('c1');
    });

    expect(postedMessages).toHaveLength(1);
    const syncPayloadFromA = postedMessages[0] as {
      type: string;
      charId: string;
      entry: CharacterEntry & { character: { name: string; lastModified: number } };
      senderClientId: string;
    };

    // Подготавливаем Таб B через useLocalBridgeSync
    const tabBDispatch = vi.fn();
    const tabBStateRef = {
      current: {
        c1: {
          history: {
            past: [charV1],
            present: makeTestCharacter({ name: 'Шаг 2', lastModified: 1500 }),
            future: [],
          },
          log: [],
          imageCache: new Map(),
        },
      } as CharactersState,
    };
    const tabBLastSerializedRef = {
      current: {
        c1: serializeForCache({
          character: tabBStateRef.current['c1']!.history.present,
          log: [],
          imageCache: [],
        }),
      },
    };

    // Имитируем подписку useLocalBridgeSync на Табе B
    let bridgeSubscriber: ((event: { data: unknown }) => void) | null = null;
    mockLocalBridge.subscribe.mockImplementationOnce((cb?: (event: { data: unknown }) => void) => {
      if (cb) bridgeSubscriber = cb;
      return () => {};
    });

    const tabBDeps = {
      dispatch: tabBDispatch,
      setSyncStatus: vi.fn(),
      isLoadingRef: { current: false },
      lastSerializedRef: tabBLastSerializedRef,
      charactersStateRef: tabBStateRef,
      setIsLoading: vi.fn(),
      lastHeartbeatRef: { current: 0 },
      lastPresentRef: { current: {} },
    };

    const { unmount: unmountB } = renderHook(() => useLocalBridgeSync(tabBDeps));
    expect(bridgeSubscriber).toBeDefined();

    // Сообщение из A приходит в B (от другого клиента 'remote-tab-A')
    act(() => {
      bridgeSubscriber!({
        data: {
          ...syncPayloadFromA,
          senderClientId: 'remote-tab-A',
        },
      });
    });

    // B применяет SYNC_REMOTE_CHARACTER:
    expect(tabBDispatch).toHaveBeenCalledTimes(1);
    const dispatchAction = tabBDispatch.mock.calls[0]?.[0] as {
      type: string;
      payload: { id: string; entry: CharacterEntry };
    };
    expect(dispatchAction.type).toBe('SYNC_REMOTE_CHARACTER');
    expect(dispatchAction.payload.id).toBe('c1');

    // present B = present A после undo
    expect(dispatchAction.payload.entry.history.present.name).toBe('Шаг 1');
    // undo-история B = история A (конвергенция: future содержит отменённый шаг)
    expect(dispatchAction.payload.entry.history.past).toHaveLength(0);
    expect(dispatchAction.payload.entry.history.future).toHaveLength(1);
    expect(dispatchAction.payload.entry.history.future[0]?.name).toBe('Шаг 2');

    // ТЕПЕРЬ СЦЕНАРИЙ LWW: более свежая локальная правка в B
    tabBDispatch.mockClear();
    // B имеет более свежую правку с lastModified больше, чем у undo A
    tabBStateRef.current['c1'] = {
      history: {
        past: [],
        present: makeTestCharacter({
          name: 'Свежая правка B',
          lastModified: syncPayloadFromA.entry.character.lastModified + 10000,
        }),
        future: [],
      },
      log: [],
      imageCache: new Map(),
    };

    act(() => {
      bridgeSubscriber!({
        data: {
          ...syncPayloadFromA,
          senderClientId: 'remote-tab-A',
        },
      });
    });

    // Устаревшее undo A отброшено (LWW)
    expect(tabBDispatch).not.toHaveBeenCalled();

    unmountB();
    unmountA();
  });

  it('5. Идемпотентность: после мостового CHARACTER_SYNC + MERGE от storage-event с той же lastModified → entry B не меняется повторно (ссылка стабильна)', () => {
    const undoTimestamp = 5000;
    const undoneChar = makeTestCharacter({ name: 'Отменённый шаг', lastModified: undoTimestamp });
    const futureChar = makeTestCharacter({ name: 'Будущий шаг', lastModified: 4000 });

    // Состояние Tab B после применения SYNC_REMOTE_CHARACTER из моста:
    // содержит восстановленную историю
    const tabBEntry: CharacterEntry = {
      history: {
        past: [],
        present: undoneChar,
        future: [futureChar],
      },
      log: [{ id: 'log-1', timestamp: undoTimestamp, description: 'undo' }],
      imageCache: new Map(),
    };

    const stateB: CharactersState = {
      c1: tabBEntry,
    };

    // Приходит storage-event (медленный путь через IDB/localStorage):
    // persistence.ts сохраняет history: { past: [], future: [] } и ту же lastModified
    const storageSnapshot: CharactersState = {
      c1: {
        history: {
          past: [],
          present: { ...undoneChar },
          future: [],
        },
        log: [{ id: 'log-1', timestamp: undoTimestamp, description: 'undo' }],
        imageCache: new Map(),
      },
    };

    const nextState = charactersReducer(stateB, {
      type: 'MERGE_REMOTE_CHARACTERS',
      payload: storageSnapshot,
    });

    // 1. Ссылочное равенство всего state: reducer вернул тот же state
    expect(nextState).toBe(stateB);
    // 2. Ссылочное равенство записи: запись не перезаписана
    expect(nextState['c1']).toBe(tabBEntry);
    // 3. История undo сохранена (future не стёрт пустым снимком из localStorage)
    expect(nextState['c1']?.history.future).toHaveLength(1);
    expect(nextState['c1']?.history.future[0]?.name).toBe('Будущий шаг');
  });
});
