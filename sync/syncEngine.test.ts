// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { useObrSyncChannel } from './syncEngine';
import { ChunkAssembler } from '../protocol/chunkAssembler';
import { makeTestCharacter } from '../state/testFixtures';
import type { Character } from '../types';
import type { CharactersAction, CharactersState } from '../state/appReducer';
import type { NotificationType } from '../components/NotificationToast';
import { saveCharacterApi, purgeLocalCharacter } from '../utils/storage';
import { serializeForCache, RawCharacterStorageData } from '../state/persistence';
import { logger } from '../utils/logger';
import OBR from '@owlbear-rodeo/sdk';

let messageHandler: ((event: { data: unknown; connectionId?: string; senderId?: string }) => Promise<void>) | null = null;

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    player: {
      id: 'gm-user-id',
      getName: async () => 'GM Player',
      getRole: async () => 'GM',
      getConnectionId: async () => 'gm-conn-id',
    },
    party: {
      getPlayers: vi.fn(async () => []),
      onChange: vi.fn(() => () => {}),
    },
    isReady: true,
    onReady: (cb: () => void) => cb(),
    broadcast: {
      sendMessage: vi.fn(async () => {}),
      onMessage: vi.fn((_channel: string, cb: (e: { data: unknown; connectionId?: string; senderId?: string }) => Promise<void>) => {
        messageHandler = cb;
        return () => {
          messageHandler = null;
        };
      }),
    },
  },
}));

vi.mock('../auth/roleService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/roleService')>();
  return {
    ...actual,
    resolveRole: vi.fn(async () => 'GM'),
    getCachedRole: vi.fn(() => 'GM'),
    subscribeRole: () => () => {},
  };
});

vi.mock('../utils/environment', () => ({
  isOwlbear: () => true,
}));

vi.mock('../utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/storage')>();
  return {
    ...actual,
    isOwlbear: () => true,
    loadFromLocalStorage: vi.fn(() => ({})),
    saveToLocalStorage: vi.fn(),
    saveCharacterApi: vi.fn(async () => {}),
    purgeLocalCharacter: vi.fn(async () => {}),
    broadcastCharacterSync: vi.fn(async () => {}),
  };
});

vi.mock('../utils/bridgeService', () => ({
  localBridge: {
    postMessage: vi.fn(),
  },
  SESSION_CLIENT_ID: 'self-client-id',
}));

function createTestDeps(initialState: CharactersState = {}) {
  const dispatch = vi.fn<(action: CharactersAction) => void>();
  const addNotification = vi.fn<(message: string, type?: NotificationType) => void>();
  const chunkAssemblerRef = { current: new ChunkAssembler() };
  const charactersStateRef = { current: initialState };
  const lastSerializedRef = { current: {} as Record<string, string> };
  const lastPresentRef = { current: {} as Record<string, Character> };
  const setSyncingCharacters = vi.fn<Dispatch<SetStateAction<Record<string, { status: 'images'; pendingImages: string[]; startedAt?: number }>>>>();

  return {
    deps: {
      charactersStateRef,
      chunkAssemblerRef,
      dispatch: dispatch as Dispatch<CharactersAction>,
      addNotification,
      lastSerializedRef,
      lastPresentRef,
      setSyncingCharacters,
    },
    spies: {
      dispatch,
      addNotification,
      setSyncingCharacters,
    },
  };
}

describe('useObrSyncChannel — P2P sync persistence (регрессионный тест)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveCharacterApi).mockImplementation(async () => {});
    vi.mocked(purgeLocalCharacter).mockImplementation(async () => {});
    messageHandler = null;
  });

  it('при приёме P2P CHARACTER_CHUNK_SYNC для существующего персонажа вызывает saveCharacterApi и обновляет refs', async () => {
    const charId = 'hero-char-1';
    const oldChar = makeTestCharacter({
      name: 'Старая версия',
      currentHitPoints: 10,
      maxHitPoints: 30,
    });

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: oldChar, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastPresentRef.current[charId] = oldChar;
    deps.lastSerializedRef.current[charId] = 'stale-cache-string';

    renderHook(() => useObrSyncChannel(deps));
    expect(messageHandler).toBeDefined();

    const freshChar = makeTestCharacter({
      name: 'Свежая P2P версия',
      currentHitPoints: 30,
      maxHitPoints: 30,
    });

    const incomingJson = JSON.stringify({
      character: freshChar,
      senderPlayerId: 'remote-sender',
      lastModified: 1700000000000,
    });

    const event = {
      data: {
        type: 'CHARACTER_CHUNK_SYNC',
        id: charId,
        senderClientId: 'remote-client-123',
        senderPlayerId: 'remote-sender',
        syncId: 'sync-session-1',
        chunkIndex: 0,
        totalChunks: 1,
        chunkData: incomingJson,
      },
    };

    await act(async () => {
      await messageHandler!(event);
    });

    // 1. Персист в IndexedDB через saveCharacterApi вызван ровно 1 раз
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
    const [savedId, savedData] = vi.mocked(saveCharacterApi).mock.calls[0]!;
    expect(savedId).toBe(charId);

    // 2. В saveCharacterApi переданы свежие собранные данные
    const savedChar = (savedData as RawCharacterStorageData).character;
    expect(savedChar?.name).toBe('Свежая P2P версия');
    expect(savedChar?.currentHitPoints).toBe(30);

    // 3. React-состояние получило действие обновления
    expect(spies.dispatch).toHaveBeenCalledWith({
      type: 'SYNC_REMOTE_CHARACTER',
      payload: {
        id: charId,
        entry: expect.objectContaining({
          history: expect.objectContaining({
            present: expect.objectContaining({
              name: 'Свежая P2P версия',
              currentHitPoints: 30,
            }),
          }),
        }),
      },
    });

    // 4. lastSerializedRef обновлён правильным хэшем (подавление автосейв-петли)
    const expectedSerialized = serializeForCache(savedData as RawCharacterStorageData);
    expect(deps.lastSerializedRef.current[charId]).toBe(expectedSerialized);

    // 5. lastPresentRef указывает на свежий экземпляр персонажа
    expect(deps.lastPresentRef.current[charId]).toBe(savedChar);
  });

  it('сохраняет imageCache персонажа как Map/структуру и не затирает изображения', async () => {
    const charId = 'hero-char-with-images';
    const { deps } = createTestDeps();

    renderHook(() => useObrSyncChannel(deps));
    expect(messageHandler).toBeDefined();

    const freshChar = makeTestCharacter({
      name: 'Персонаж с иконками',
    });

    const incomingJson = JSON.stringify({
      character: freshChar,
      senderPlayerId: 'remote-sender',
      imageCache: [['img:item:sword', 'data:image/png;base64,abc123']],
    });

    const event = {
      data: {
        type: 'CHARACTER_CHUNK_SYNC',
        id: charId,
        senderClientId: 'remote-client-456',
        senderPlayerId: 'remote-sender',
        syncId: 'sync-session-2',
        chunkIndex: 0,
        totalChunks: 1,
        chunkData: incomingJson,
      },
    };

    await act(async () => {
      await messageHandler!(event);
    });

    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
    const [, savedData] = vi.mocked(saveCharacterApi).mock.calls[0]!;
    const rawData = savedData as RawCharacterStorageData;

    // imageCache присутствует и содержит переданную картинку (не пустой объект {})
    expect(rawData.imageCache).toBeDefined();
    const map = rawData.imageCache instanceof Map
      ? rawData.imageCache
      : new Map(Array.isArray(rawData.imageCache) ? rawData.imageCache : []);
    expect(map.get('img:item:sword')).toBe('data:image/png;base64,abc123');
  });

  it('ошибки сохранения в saveCharacterApi логируются через logger.error без падения', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(saveCharacterApi).mockRejectedValueOnce(new Error('IndexedDB quota error'));

    const charId = 'hero-char-fail';
    const { deps } = createTestDeps();

    renderHook(() => useObrSyncChannel(deps));

    const freshChar = makeTestCharacter({ name: 'Тестовый персонаж' });
    const event = {
      data: {
        type: 'CHARACTER_CHUNK_SYNC',
        id: charId,
        senderClientId: 'remote-client-789',
        senderPlayerId: 'remote-sender',
        syncId: 'sync-session-3',
        chunkIndex: 0,
        totalChunks: 1,
        chunkData: JSON.stringify({ character: freshChar, senderPlayerId: 'remote-sender' }),
      },
    };

    await act(async () => {
      await messageHandler!(event);
    });

    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to save remote character ${charId} to IndexedDB`),
      expect.any(Error),
    );

    loggerSpy.mockRestore();
  });

  it('при приёме DELETE_CHARACTER_SYNC вызывает purgeLocalCharacter и удаляет refs', async () => {
    const charId = 'hero-char-to-delete';
    const charToDelete = makeTestCharacter({ name: 'Удаляемый' });

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: charToDelete, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastSerializedRef.current[charId] = 'serialized-val';
    deps.lastPresentRef.current[charId] = charToDelete;

    renderHook(() => useObrSyncChannel(deps));

    const deleteEvent = {
      data: {
        type: 'DELETE_CHARACTER_SYNC',
        id: charId,
        senderClientId: 'remote-client-del',
        senderPlayerId: 'remote-sender-del',
      },
    };

    await act(async () => {
      await messageHandler!(deleteEvent);
    });

    expect(spies.dispatch).toHaveBeenCalledWith({
      type: 'DELETE_CHARACTER',
      payload: { id: charId },
    });
    expect(purgeLocalCharacter).toHaveBeenCalledWith(charId);
    expect(deps.lastSerializedRef.current[charId]).toBeUndefined();
    expect(deps.lastPresentRef.current[charId]).toBeUndefined();
  });
});

describe('useObrSyncChannel — авторизация P2P сообщений (регрессионные тесты P1-6 / P1-Sec-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveCharacterApi).mockImplementation(async () => {});
    vi.mocked(purgeLocalCharacter).mockImplementation(async () => {});
    vi.mocked(OBR.party.getPlayers).mockResolvedValue([]);
    messageHandler = null;
  });

  it('Невладелец-не-GM → DELETE_CHARACTER_SYNC НЕ удаляет (mock room state: отправитель — обычный игрок)', async () => {
    const charId = 'hero-char-owned';
    const ownedChar = makeTestCharacter({ name: 'Герой Алисы', ownerId: 'alice-id' });

    vi.mocked(OBR.party.getPlayers).mockResolvedValue([
      { id: 'stranger-id', connectionId: 'conn-stranger', role: 'PLAYER', name: 'Stranger', color: '', syncView: false, metadata: {} },
    ]);

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: ownedChar, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastPresentRef.current[charId] = ownedChar;

    renderHook(() => useObrSyncChannel(deps));

    const deleteEvent = {
      connectionId: 'conn-stranger',
      data: {
        type: 'DELETE_CHARACTER_SYNC',
        id: charId,
        senderClientId: 'client-stranger',
        senderPlayerId: 'stranger-id',
      },
    };

    await act(async () => {
      await messageHandler!(deleteEvent);
    });

    expect(spies.dispatch).not.toHaveBeenCalled();
    expect(purgeLocalCharacter).not.toHaveBeenCalled();
    expect(deps.lastPresentRef.current[charId]).toBe(ownedChar);
    expect(spies.addNotification).toHaveBeenCalledWith(
      expect.stringContaining('Отклонена неавторизованная команда удаления'),
      'warning',
    );
  });

  it('Владелец → DELETE разрешён', async () => {
    const charId = 'hero-char-owned';
    const ownedChar = makeTestCharacter({ name: 'Герой Алисы', ownerId: 'alice-id' });

    vi.mocked(OBR.party.getPlayers).mockResolvedValue([
      { id: 'alice-id', connectionId: 'conn-alice', role: 'PLAYER', name: 'Alice', color: '', syncView: false, metadata: {} },
    ]);

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: ownedChar, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastPresentRef.current[charId] = ownedChar;
    deps.lastSerializedRef.current[charId] = 'serialized-val';

    renderHook(() => useObrSyncChannel(deps));

    const deleteEvent = {
      connectionId: 'conn-alice',
      data: {
        type: 'DELETE_CHARACTER_SYNC',
        id: charId,
        senderClientId: 'client-alice',
        senderPlayerId: 'alice-id',
      },
    };

    await act(async () => {
      await messageHandler!(deleteEvent);
    });

    expect(spies.dispatch).toHaveBeenCalledWith({
      type: 'DELETE_CHARACTER',
      payload: { id: charId },
    });
    expect(purgeLocalCharacter).toHaveBeenCalledWith(charId);
    expect(deps.lastPresentRef.current[charId]).toBeUndefined();
  });

  it('GM-отправитель (роль из room state) → DELETE разрешён', async () => {
    const charId = 'hero-char-owned';
    const ownedChar = makeTestCharacter({ name: 'Герой Алисы', ownerId: 'alice-id' });

    vi.mocked(OBR.party.getPlayers).mockResolvedValue([
      { id: 'remote-gm-id', connectionId: 'conn-remote-gm', role: 'GM', name: 'Co-GM', color: '', syncView: false, metadata: {} },
    ]);

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: ownedChar, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastPresentRef.current[charId] = ownedChar;
    deps.lastSerializedRef.current[charId] = 'serialized-val';

    renderHook(() => useObrSyncChannel(deps));

    const deleteEvent = {
      connectionId: 'conn-remote-gm',
      data: {
        type: 'DELETE_CHARACTER_SYNC',
        id: charId,
        senderClientId: 'client-remote-gm',
        senderPlayerId: 'remote-gm-id',
      },
    };

    await act(async () => {
      await messageHandler!(deleteEvent);
    });

    expect(spies.dispatch).toHaveBeenCalledWith({
      type: 'DELETE_CHARACTER',
      payload: { id: charId },
    });
    expect(purgeLocalCharacter).toHaveBeenCalledWith(charId);
    expect(deps.lastPresentRef.current[charId]).toBeUndefined();
  });

  it('Невладелец-не-GM → CHARACTER_SYNC не применяется (персонаж не мутирует)', async () => {
    const charId = 'hero-char-owned';
    const originalChar = makeTestCharacter({
      name: 'Герой Алисы',
      ownerId: 'alice-id',
      currentHitPoints: 50,
      maxHitPoints: 50,
    });

    vi.mocked(OBR.party.getPlayers).mockResolvedValue([
      { id: 'stranger-id', connectionId: 'conn-stranger', role: 'PLAYER', name: 'Stranger', color: '', syncView: false, metadata: {} },
    ]);

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: originalChar, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastPresentRef.current[charId] = originalChar;

    renderHook(() => useObrSyncChannel(deps));

    const mutatedChar = makeTestCharacter({
      name: 'Испорченный герой',
      ownerId: 'alice-id',
      currentHitPoints: 1,
      maxHitPoints: 50,
    });

    const syncEvent = {
      connectionId: 'conn-stranger',
      data: {
        type: 'CHARACTER_SYNC',
        id: charId,
        character: mutatedChar,
        senderClientId: 'client-stranger',
        senderPlayerId: 'stranger-id',
      },
    };

    await act(async () => {
      await messageHandler!(syncEvent);
    });

    expect(spies.dispatch).not.toHaveBeenCalled();
    expect(saveCharacterApi).not.toHaveBeenCalled();
    expect(deps.lastPresentRef.current[charId].currentHitPoints).toBe(50);
    expect(spies.addNotification).toHaveBeenCalledWith(
      expect.stringContaining('Отклонено неавторизованное обновление'),
      'warning',
    );
  });

  it('Спуффинг: payload с чужим senderPlayerId, но доверенный OBR senderId = обычный игрок → НЕ проходит', async () => {
    const charId = 'hero-char-owned';
    const originalChar = makeTestCharacter({
      name: 'Герой Алисы',
      ownerId: 'alice-id',
      currentHitPoints: 50,
    });

    // В OBR room state этот connectionId принадлежит 'attacker-id' с ролью PLAYER
    vi.mocked(OBR.party.getPlayers).mockResolvedValue([
      { id: 'attacker-id', connectionId: 'conn-attacker', role: 'PLAYER', name: 'Attacker', color: '', syncView: false, metadata: {} },
    ]);

    const initialState: CharactersState = {
      [charId]: {
        history: { past: [], present: originalChar, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    const { deps, spies } = createTestDeps(initialState);
    deps.lastPresentRef.current[charId] = originalChar;

    renderHook(() => useObrSyncChannel(deps));

    // 1. Попытка спуффинга в DELETE_CHARACTER_SYNC (payload заявляет, что он alice-id)
    const spoofedDeleteEvent = {
      connectionId: 'conn-attacker',
      data: {
        type: 'DELETE_CHARACTER_SYNC',
        id: charId,
        senderClientId: 'client-attacker',
        senderPlayerId: 'alice-id', // СПУФФИНГ: выдаёт себя за владельца
      },
    };

    await act(async () => {
      await messageHandler!(spoofedDeleteEvent);
    });

    expect(spies.dispatch).not.toHaveBeenCalled();
    expect(purgeLocalCharacter).not.toHaveBeenCalled();
    expect(deps.lastPresentRef.current[charId]).toBe(originalChar);

    // 2. Попытка спуффинга в CHARACTER_CHUNK_SYNC (payload заявляет senderPlayerId: alice-id)
    const forgedChar = makeTestCharacter({
      name: 'Взломанный герой',
      ownerId: 'alice-id',
      currentHitPoints: 0,
    });
    const spoofedChunkEvent = {
      connectionId: 'conn-attacker',
      data: {
        type: 'CHARACTER_CHUNK_SYNC',
        id: charId,
        senderClientId: 'client-attacker',
        senderPlayerId: 'alice-id', // СПУФФИНГ в envelope
        syncId: 'spoof-sync',
        chunkIndex: 0,
        totalChunks: 1,
        chunkData: JSON.stringify({
          character: forgedChar,
          senderPlayerId: 'alice-id', // СПУФФИНГ в JSON
        }),
      },
    };

    await act(async () => {
      await messageHandler!(spoofedChunkEvent);
    });

    expect(spies.dispatch).not.toHaveBeenCalled();
    expect(saveCharacterApi).not.toHaveBeenCalled();
    expect(deps.lastPresentRef.current[charId].currentHitPoints).toBe(50);
  });
});
