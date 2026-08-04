import { SESSION_CLIENT_ID } from './bridgeService';
import { cloudRealtimeBridge, CloudMessagePayload } from './cloudRealtimeBridge';
import { webrtcP2pEngine } from './webrtcP2pEngine';

export interface RoomHandshakePayload {
  type: 'ROOM_ANNOUNCE' | 'ROOM_PAIR_REQUEST' | 'ROOM_PAIR_ACK' | 'SET_ACTIVE_BOARD_CHAR' | 'CHAR_SYNC' | 'CHAR_UPDATE' | 'DICE_ROLL' | 'PRESENCE_QUERY' | 'STATE_RESPONSE';
  roomId: string;
  roomName?: string;
  activeCharacterId?: string;
  senderClientId: string;
  sentAt: number;
  data?: any;
}

/**
 * Production-Grade HTML5 Browser Window, WebRTC DataChannel & Cloud Realtime Bridge
 * Рукопожатие через облачный шлюз + моментальная прямая P2P-передача персонажей по каналу WebRTC.
 */
class P2PRoomBridgeService {
  private currentRoomId: string | null = null;
  private currentRoomName: string = 'Owlbear Room';
  private listeners: Set<(data: any) => void> = new Set();
  private childWindows: Set<Window> = new Set();
  private activeBoardCharacterId: string | null = null;

  constructor() {
    // 1. Subscribe to WebRTC Direct P2P messages (<5ms latency)
    webrtcP2pEngine.subscribe((payload) => {
      this.notifyListeners(payload);
    });

    // 2. Subscribe to Cloud Realtime messages
    cloudRealtimeBridge.subscribe((payload) => {
      this.notifyListeners(payload);
    });
  }

  public connect(roomId: string, roomName?: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    if (roomName) this.currentRoomName = roomName;
    
    console.log(`[DND Sheet P2P Bridge] Connecting to room: ${roomId} (${this.currentRoomName})`);

    // Connect cloud realtime bridge for 50ms signaling
    cloudRealtimeBridge.connect(roomId, this.currentRoomName);

    // Initialize WebRTC Direct Peer connection
    webrtcP2pEngine.initPeer(roomId, true);

    // Broadcast room announcement to local listening tabs
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

    // 1. Send via Direct WebRTC DataChannel (Sub-5ms direct P2P, 0% server load)
    const sentViaRtc = webrtcP2pEngine.send(payload);

    // 2. Relay via Cloud Realtime Bridge
    try {
      cloudRealtimeBridge.send(payload as CloudMessagePayload);
    } catch (e) {}

    // 3. Direct window.opener (if launched as popup/tab)
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, '*');
      } catch (e) {}
    }

    // 4. Direct window.parent (if inside iframe)
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, '*');
      } catch (e) {}
    }

    // 5. Registered child windows
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
    webrtcP2pEngine.cleanupPeer();
    cloudRealtimeBridge.disconnect();
    this.childWindows.clear();
    this.currentRoomId = null;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
