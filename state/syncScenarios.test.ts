import { describe, expect, it, vi } from 'vitest';
import { createObrRoomMock, flushAsync } from '../test/mocks/obrMock';
import type { ObrMockClient } from '../test/mocks/obrMock';
import { ChunkAssembler } from '../protocol/chunkAssembler';
import { SYNC_CHANNEL, parseSyncMessage } from '../protocol/messages';
import { charactersReducer } from './appReducer';
import type { CharacterEntry, CharactersState } from './appReducer';
import { makeTestCharacter } from './testFixtures';

const obrHolder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('@owlbear-rodeo/sdk', () => ({ default: obrHolder.client }));

vi.mock('../utils/environment', () => ({
  isOwlbear: () => true,
  SAME_ORIGIN: 'https://test',
  OWLBEAR_ORIGINS: [] as string[],
  isTrustedMessageOrigin: () => true,
}));

vi.mock('../auth/roleService', () => ({
  getCachedRole: () => 'GM' as const,
  resolveRole: async () => 'GM' as const,
  subscribeRole: () => () => {},
}));

const rateLimitedRoom = createObrRoomMock({ failTimes: new Map([[0, 2]]) });
obrHolder.client = rateLimitedRoom[0];

describe('Sync-сценарий A (план 6.3): retry при rate-limit Owlbear broadcast', () => {
  it('два RateLimitHit подряд не рвут передачу: третья попытка доставляет чанк получателю', async () => {
    const sender = obrHolder.client as ObrMockClient;
    const receiver = rateLimitedRoom[1];
    expect(receiver).toBeDefined();

    const innerSend = sender.broadcast.sendMessage.bind(sender.broadcast);
    let attempts = 0;
    sender.broadcast.sendMessage = async (channel, payload) => {
      attempts += 1;
      await innerSend(channel, payload);
    };

    const received: Array<Record<string, unknown>> = [];
    receiver!.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      if ((event.data as { type?: string })?.type === 'CHARACTER_IMAGE_CHUNK_SYNC') {
        received.push(event.data as Record<string, unknown>);
      }
    });

    const storage = await import('../utils/storage');
    const startedAt = Date.now();
    await expect(storage.broadcastLargeString('c1', 'img:x', false, 'payload-string')).resolves.toBe(true);
    const elapsedMs = Date.now() - startedAt;

    expect(attempts).toBe(3);
    expect(elapsedMs).toBeGreaterThanOrEqual(700);
    expect(elapsedMs).toBeLessThan(3000);

    await flushAsync();
    expect(received).toHaveLength(1);

    const message = received[0]!;
    expect(message['type']).toBe('CHARACTER_IMAGE_CHUNK_SYNC');
    expect(message['id']).toBe('c1');
    expect(message['imgId']).toBe('img:x');
    expect(message['isPortrait']).toBe(false);
    expect(message['chunkIndex']).toBe(0);
    expect(message['totalChunks']).toBe(1);
    expect(typeof message['syncId']).toBe('string');
    expect(message['syncId']).not.toBe('');
    expect(message['chunkData']).toBe('payload-string');
  }, 5000);
});

describe('Sync-сценарий B (план 6.3): сборка листа из чанков двумя клиентами комнаты', () => {
  it('клиент A шлёт 3 чанка CHARACTER_CHUNK_SYNC в обратном порядке — клиент B собирает исходный JSON', async () => {
    const room = createObrRoomMock();
    const sender = room[0]!;
    const receiver = room[1]!;

    const originalJson = JSON.stringify({
      name: 'Торин Дубощит',
      className: 'Воин',
      level: 5,
      hitPoints: { current: 42, max: 148 },
      inventory: ['меч', 'щит', 'эликсир силы'],
      nested: { deep: { flag: true } },
    });

    const totalChunks = 3;
    const chunkSize = Math.ceil(originalJson.length / totalChunks);

    const assembler = new ChunkAssembler();
    const assembledRef: { value: string | null } = { value: null };

    receiver.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      const parsed = parseSyncMessage(event.data);
      if (!parsed || parsed.type !== 'CHARACTER_CHUNK_SYNC') return;
      const completed = assembler.push(`char-sheet/${parsed.id}`, parsed);
      if (completed !== null) assembledRef.value = completed;
    });

    for (let chunkIndex = totalChunks - 1; chunkIndex >= 0; chunkIndex--) {
      await sender.broadcast.sendMessage(SYNC_CHANNEL, {
        type: 'CHARACTER_CHUNK_SYNC',
        id: 'sheet-b',
        senderClientId: 'client-a',
        senderPlayerId: 'player-a',
        syncId: 'sync-b',
        chunkIndex,
        totalChunks,
        chunkData: originalJson.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize),
      });
    }

    await flushAsync();

    expect(assembledRef.value).not.toBeNull();
    expect(assembledRef.value).toBe(originalJson);
    expect(assembler.size).toBe(0);
  });
});

describe('Sync-сценарий C (план 6.3): DELETE_CHARACTER отсутствующего id — regression guard', () => {
  const makeEntry = (): CharacterEntry => ({
    history: { past: [], present: makeTestCharacter({ name: 'Герой' }), future: [] },
    log: [],
  });

  it('dispatch DELETE_CHARACTER с неизвестным id оставляет state эквивалентным и записи нетронутыми', () => {
    const entryA = makeEntry();
    const entryB = makeEntry();
    const state: CharactersState = { 'char-a': entryA, 'char-b': entryB };

    const result = charactersReducer(state, { type: 'DELETE_CHARACTER', payload: { id: 'ghost-id' } });

    expect(result).toEqual(state);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['char-a']).toBe(entryA);
    expect(result['char-b']).toBe(entryB);
  });

  it('существующий id по-прежнему удаляется, остальные записи сохраняются по ссылке', () => {
    const entryA = makeEntry();
    const entryB = makeEntry();
    const state: CharactersState = { 'char-a': entryA, 'char-b': entryB };

    const result = charactersReducer(state, { type: 'DELETE_CHARACTER', payload: { id: 'char-a' } });

    expect(result['char-a']).toBeUndefined();
    expect(result['char-b']).toBe(entryB);
  });
});
