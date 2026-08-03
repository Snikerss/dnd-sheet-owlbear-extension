// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Character } from '../types';
import { defaultCharacterState } from './defaultCharacterState';

export const isBoundToActiveRoom = (character: Character, activeRoomId: string): boolean => {
  if (!character) return false;
  if (character.isGlobal) return true;
  if (!activeRoomId) return false;
  return (character.boundRooms || []).some(r => r.roomId === activeRoomId);
};

describe('Selective Room Sync Filter', () => {
  const roomA = 'room-alpha-123';
  const roomB = 'room-beta-456';

  it('allows sync if character is marked as isGlobal', () => {
    const char: Character = {
      ...defaultCharacterState,
      isGlobal: true,
      boundRooms: []
    };

    expect(isBoundToActiveRoom(char, roomA)).toBe(true);
    expect(isBoundToActiveRoom(char, roomB)).toBe(true);
    expect(isBoundToActiveRoom(char, '')).toBe(true);
  });

  it('allows sync only if character is explicitly bound to activeRoomId', () => {
    const char: Character = {
      ...defaultCharacterState,
      isGlobal: false,
      boundRooms: [
        { roomId: roomA, roomName: 'Кампания Альфа', lastVisited: Date.now() }
      ]
    };

    expect(isBoundToActiveRoom(char, roomA)).toBe(true);
    expect(isBoundToActiveRoom(char, roomB)).toBe(false);
  });

  it('suppresses sync for unbound characters', () => {
    const char: Character = {
      ...defaultCharacterState,
      isGlobal: false,
      boundRooms: []
    };

    expect(isBoundToActiveRoom(char, roomA)).toBe(false);
    expect(isBoundToActiveRoom(char, roomB)).toBe(false);
  });
});
