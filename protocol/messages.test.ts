import { describe, it, expect } from 'vitest';
import {
  SYNC_CHANNEL,
  ROLLS_CHANNEL,
  parseSyncMessage,
} from './messages';

describe('каналы', () => {
  it('имена каналов стабильны (контракт между клиентами)', () => {
    expect(SYNC_CHANNEL).toBe('com.antigravity.dnd-sheet/sync');
    expect(ROLLS_CHANNEL).toBe('com.antigravity.dnd-sheet/rolls');
  });
});

describe('parseSyncMessage — CHARACTER_CHUNK_SYNC', () => {
  it('валидирует корректный чанк и заполняет дефолты конверта', () => {
    const msg = parseSyncMessage({
      type: 'CHARACTER_CHUNK_SYNC',
      id: 'char-1',
      chunkIndex: 0,
      totalChunks: 2,
      chunkData: 'abc',
    });
    expect(msg).not.toBeNull();
    if (msg?.type !== 'CHARACTER_CHUNK_SYNC') throw new Error('wrong branch');
    expect(msg.senderClientId).toBe('');
    expect(msg.senderPlayerId).toBe('');
    expect(msg.syncId).toBe('');
    expect(msg.chunkData).toBe('abc');
  });

  it('отбрасывает пакет без id', () => {
    expect(parseSyncMessage({
      type: 'CHARACTER_CHUNK_SYNC',
      chunkIndex: 0,
      totalChunks: 1,
      chunkData: 'x',
    })).toBeNull();
  });

  it('отбрасывает пакет с некорректным totalChunks', () => {
    expect(parseSyncMessage({
      type: 'CHARACTER_CHUNK_SYNC',
      id: 'c',
      chunkIndex: 0,
      totalChunks: 0,
      chunkData: 'x',
    })).toBeNull();
  });
});

describe('parseSyncMessage — CHARACTER_IMAGE_CHUNK_SYNC (регрессия бага #1)', () => {
  it('принимает РОВНО тот тип, который шлёт отправитель', () => {
    const msg = parseSyncMessage({
      type: 'CHARACTER_IMAGE_CHUNK_SYNC',
      id: 'char-1',
      imgId: 'img:ref:portrait',
      isPortrait: true,
      syncId: 's-1',
      chunkIndex: 3,
      totalChunks: 10,
      chunkData: 'base64part',
      senderClientId: 'cli',
      senderPlayerId: 'pl',
    });
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe('CHARACTER_IMAGE_CHUNK_SYNC');
  });

  it('регрессия #1: легаси-тип IMAGE_CHUNK_SYNC отбрасывается парсером', () => {
    // Если где-то снова появится отправитель со старым литералом —
    // сообщение не пройдёт валидацию вместо тихой потери.
    expect(parseSyncMessage({
      type: 'IMAGE_CHUNK_SYNC',
      id: 'char-1',
      imgId: 'img',
      isPortrait: true,
      chunkIndex: 0,
      totalChunks: 1,
      chunkData: 'x',
    })).toBeNull();
  });
});

describe('parseSyncMessage — DELETE_CHARACTER_SYNC / REQUEST_FULL_CHARACTERS', () => {
  it('валидует команду удаления', () => {
    const msg = parseSyncMessage({ type: 'DELETE_CHARACTER_SYNC', id: 'c9' });
    expect(msg?.type).toBe('DELETE_CHARACTER_SYNC');
  });

  it('валидует запрос полных листов с пустым кэшем версий', () => {
    const msg = parseSyncMessage({ type: 'REQUEST_FULL_CHARACTERS' });
    expect(msg?.type).toBe('REQUEST_FULL_CHARACTERS');
    if (msg?.type !== 'REQUEST_FULL_CHARACTERS') throw new Error('wrong branch');
    expect(msg.cachedVersions).toEqual({});
  });

  it('отбрасывает неизвестные типы сообщений', () => {
    expect(parseSyncMessage({ type: 'TOTALLY_UNKNOWN', foo: 1 })).toBeNull();
    expect(parseSyncMessage(null)).toBeNull();
    expect(parseSyncMessage('string')).toBeNull();
    expect(parseSyncMessage(42)).toBeNull();
  });
});
