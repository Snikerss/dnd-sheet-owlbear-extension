import { SESSION_CLIENT_ID } from './bridgeService';

export interface RoomHandshakePayload {
  type: 'ROOM_ANNOUNCE' | 'ROOM_PAIR_REQUEST' | 'ROOM_PAIR_ACK' | 'SET_ACTIVE_BOARD_CHAR' | 'CHAR_SYNC';
  roomId: string;
  roomName?: string;
  activeCharacterId?: string;
  senderClientId: string;
  sentAt: number;
  data?: any;
}

/**
 * Production-Grade HTML5 Browser Window & Room Sync Bridge
 * Надежный локальный мост памяти, работающий по стандартам HTML5 (BroadcastChannel, postMessage, StorageBus).
 * Полностью независим от сторонних серверов и сетевых разрывов.
 */
class P2PRoomBridgeService {
  private currentRoomId: string | null = null;
  private currentRoomName: string = 'Owlbear Room';
  private listeners: Set<(data: any) => void> = new Set();
  private childWindows: Set<Window> = new Set();
  private activeBoardCharacterId: string | null = null;

  public connect(roomId: string, roomName?: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    if (roomName) this.currentRoomName = roomName;
    
    console.log(`[DND Sheet P2P Bridge] Connected to room: ${roomId} (${this.currentRoomName})`);

    // Broadcast room announcement to all listening tabs
    this.broadcast({
      type: 'ROOM_ANNOUNCE',
      roomId: this.currentRoomId,
      roomName: this.currentRoomName,
      activeCharacterId: this.activeBoardCharacterId || undefined
    });
  }

  public setActiveBoardCharacter(charId: string | null): void {
    this.activeBoardCharacterId = charId;
    if (this.currentRoomId) {
      this.broadcast({
        type: 'SET_ACTIVE_BOARD_CHAR',
        roomId: this.currentRoomId,
        activeCharacterId: charId || undefined
      });
    }
  }

  public getActiveBoardCharacterId(): string | null {
    return this.activeBoardCharacterId;
  }

  public getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  public getCurrentRoomName(): string {
    return this.currentRoomName;
  }

  public broadcast(data: any): void {
    const roomId = this.currentRoomId || 'global_vault_bridge';

    let cleanData = data;
    if (data && typeof data === 'object' && data.entry && data.entry.imageCache) {
      const { imageCache, ...restEntry } = data.entry;
      cleanData = { ...data, entry: restEntry };
    }

    const payload: RoomHandshakePayload = {
      ...cleanData,
      roomId,
      roomName: this.currentRoomName,
      sentAt: Date.now(),
      senderClientId: SESSION_CLIENT_ID
    };

    // 1. Direct window.opener (if launched as popup/tab)
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, '*');
      } catch (e) {}
    }

    // 2. Direct window.parent (if inside iframe)
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, '*');
      } catch (e) {}
    }

    // 3. Registered child windows
    this.childWindows.forEach((win) => {
      if (win && !win.closed) {
        try {
          win.postMessage(payload, '*');
        } catch (e) {}
      } else {
        this.childWindows.delete(win);
      }
    });
  }

  public registerWindow(win: Window): void {
    if (win && !win.closed && (typeof window === 'undefined' || win !== window)) {
      this.childWindows.add(win);
    }
  }

  public subscribe(callback: (data: any) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public notifyListeners(data: any): void {
    const senderId = data.senderClientId || data.senderId;
    if (senderId && senderId === SESSION_CLIENT_ID) {
      return;
    }

    if (data.type === 'ROOM_ANNOUNCE' && data.roomId) {
      this.currentRoomId = data.roomId;
      if (data.roomName) this.currentRoomName = data.roomName;
    }

    if (data.type === 'SET_ACTIVE_BOARD_CHAR' && data.activeCharacterId) {
      this.activeBoardCharacterId = data.activeCharacterId;
    }

    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {}
    });
  }

  public disconnect(): void {
    this.childWindows.clear();
    this.currentRoomId = null;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
