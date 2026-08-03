import { describe, it, expect } from 'vitest';
import { metaReducer } from './reducers/meta.reducer';
import { makeTestCharacter } from './testFixtures';

describe('Selective Syncing & Room Binding', () => {
  it('adds a room binding on BIND_ROOM action', () => {
    const char = makeTestCharacter();
    const result = metaReducer(char, {
      type: 'BIND_ROOM',
      payload: { roomId: 'room-abc', roomName: 'Подземелье Дракона' }
    });

    expect(result.boundRooms).toHaveLength(1);
    expect(result.boundRooms![0].roomId).toBe('room-abc');
    expect(result.boundRooms![0].roomName).toBe('Подземелье Дракона');
  });

  it('does not duplicate existing room binding on BIND_ROOM action', () => {
    const char = makeTestCharacter();
    let state = metaReducer(char, {
      type: 'BIND_ROOM',
      payload: { roomId: 'room-abc', roomName: 'Подземелье Дракона' }
    });
    state = metaReducer(state, {
      type: 'BIND_ROOM',
      payload: { roomId: 'room-abc', roomName: 'Подземелье Дракона' }
    });

    expect(state.boundRooms).toHaveLength(1);
  });

  it('removes room binding on UNBIND_ROOM action', () => {
    const char = makeTestCharacter();
    let state = metaReducer(char, {
      type: 'BIND_ROOM',
      payload: { roomId: 'room-abc', roomName: 'Подземелье Дракона' }
    });
    state = metaReducer(state, {
      type: 'UNBIND_ROOM',
      payload: 'room-abc'
    });

    expect(state.boundRooms).toHaveLength(0);
  });

  it('toggles global flag on TOGGLE_GLOBAL_ROOM action', () => {
    const char = makeTestCharacter();
    const state = metaReducer(char, {
      type: 'TOGGLE_GLOBAL_ROOM',
      payload: true
    });

    expect(state.isGlobal).toBe(true);
  });
});
