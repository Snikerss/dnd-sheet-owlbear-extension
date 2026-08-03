import { describe, it, expect, beforeEach } from 'vitest';
import { getKnownRooms, saveKnownRooms, registerCurrentRoom, updateRoomAlias } from './roomRegistry';

const mockStorage: Record<string, string> = {};

if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
  (global as any).window = global;
  (global as any).localStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => { mockStorage[key] = val; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
  };
}

describe('roomRegistry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no rooms saved', () => {
    expect(getKnownRooms()).toEqual([]);
  });

  it('registers new room and sorts by lastVisited', () => {
    const r1 = registerCurrentRoom('room-1', 'Подземелье');
    expect(r1.roomId).toBe('room-1');
    expect(r1.roomName).toBe('Подземелье');

    const rooms = getKnownRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomId).toBe('room-1');
  });

  it('updates existing room name on re-registration', () => {
    registerCurrentRoom('room-1', 'Старое Название');
    registerCurrentRoom('room-1', 'Новое Название');

    const rooms = getKnownRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe('Новое Название');
  });

  it('updates room alias explicitly', () => {
    registerCurrentRoom('room-1', 'Старое Название');
    const updated = updateRoomAlias('room-1', 'Моя Кампания');

    expect(updated[0].roomName).toBe('Моя Кампания');
    expect(getKnownRooms()[0].roomName).toBe('Моя Кампания');
  });
});
