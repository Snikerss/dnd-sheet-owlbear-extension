export interface OwlbearRoomBinding {
  roomId: string;
  roomName: string;
  lastVisited: number;
}

const KNOWN_ROOMS_KEY = 'com.antigravity.dnd-sheet/v2/known-rooms';

export const getKnownRooms = (): OwlbearRoomBinding[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KNOWN_ROOMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[DND Sheet] Failed to read known rooms:', e);
    return [];
  }
};

export const saveKnownRooms = (rooms: OwlbearRoomBinding[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KNOWN_ROOMS_KEY, JSON.stringify(rooms));
  } catch (e) {
    console.error('[DND Sheet] Failed to save known rooms:', e);
  }
};

export const registerCurrentRoom = (roomId: string, roomName: string): OwlbearRoomBinding => {
  if (!roomId) {
    return { roomId: '', roomName: '', lastVisited: Date.now() };
  }

  const rooms = getKnownRooms();
  const index = rooms.findIndex(r => r.roomId === roomId);
  const now = Date.now();

  let updatedEntry: OwlbearRoomBinding;

  if (index !== -1) {
    const existing = rooms[index]!;
    updatedEntry = {
      ...existing,
      roomName: roomName || existing.roomName || 'Без названия',
      lastVisited: now,
    };
    rooms[index] = updatedEntry;
  } else {
    updatedEntry = {
      roomId,
      roomName: roomName || 'Без названия',
      lastVisited: now,
    };
    rooms.unshift(updatedEntry);
  }

  // Sort by last visited descending
  rooms.sort((a, b) => b.lastVisited - a.lastVisited);
  saveKnownRooms(rooms);
  return updatedEntry;
};

export const updateRoomAlias = (roomId: string, newAlias: string): OwlbearRoomBinding[] => {
  const rooms = getKnownRooms();
  const updated = rooms.map(r => r.roomId === roomId ? { ...r, roomName: newAlias } : r);
  saveKnownRooms(updated);
  return updated;
};
