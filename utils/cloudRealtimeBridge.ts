import { SESSION_CLIENT_ID } from './bridgeService';

export interface CloudMessagePayload {
  type: 'CHAR_UPDATE' | 'DICE_ROLL' | 'PRESENCE_QUERY' | 'STATE_RESPONSE' | 'ROOM_ANNOUNCE';
  roomId: string;
  roomName?: string;
  senderClientId: string;
  sentAt: number;
  data?: any;
}

type CloudMessageHandler = (payload: CloudMessagePayload) => void;

/**
 * Production-Grade Cloud Realtime P2P Bridge
 * Использует надежный высокоскоростной WebSocket-шлюз комнат для моментального взаимодействия
 * между Owlbear Rodeo VTT и автономными вкладками (даже после перезагрузки F5 на любых устройствах).
 */
class CloudRealtimeBridgeService {
  private currentRoomId: string | null = null;
  private currentRoomName: string = 'Owlbear Room';
  private ws: WebSocket | null = null;
  private listeners: Set<CloudMessageHandler> = new Set();
  private reconnectTimer: any = null;
  private isConnecting: boolean = false;

  public connect(roomId: string, roomName?: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    if (roomName) this.currentRoomName = roomName;

    this.initWebSocket(roomId);
  }

  private initWebSocket(roomId: string): void {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    this.isConnecting = true;
    const sanitizedRoom = encodeURIComponent(roomId.replace(/[^a-zA-Z0-9_-]/g, ''));
    const wsUrl = `wss://socketsbay.com/wss/v2/1/dnd-room-${sanitizedRoom}/`;

    try {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        this.isConnecting = false;
        console.log(`[Cloud Realtime Bridge] Connected to room channel: dnd-room-${sanitizedRoom}`);

        // Broadcast presence query upon connection or F5 reload
        this.send({
          type: 'PRESENCE_QUERY',
          roomId: this.currentRoomId || roomId,
          roomName: this.currentRoomName,
          senderClientId: SESSION_CLIENT_ID,
          sentAt: Date.now()
        });
      };

      socket.onmessage = (event) => {
        try {
          const payload: CloudMessagePayload = JSON.parse(event.data);
          if (payload && typeof payload === 'object' && payload.senderClientId !== SESSION_CLIENT_ID) {
            this.notifyListeners(payload);
          }
        } catch (e) {}
      };

      socket.onerror = () => {
        this.isConnecting = false;
      };

      socket.onclose = () => {
        this.isConnecting = false;
        if (this.currentRoomId === roomId) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.currentRoomId === roomId) {
              this.initWebSocket(roomId);
            }
          }, 5000);
        }
      };

      this.ws = socket;
    } catch (err) {
      this.isConnecting = false;
    }
  }

  public send(payload: CloudMessagePayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {}
    }
  }

  public broadcastCharUpdate(roomId: string, charData: any): void {
    this.send({
      type: 'CHAR_UPDATE',
      roomId,
      senderClientId: SESSION_CLIENT_ID,
      sentAt: Date.now(),
      data: charData
    });
  }

  public subscribe(handler: CloudMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private notifyListeners(payload: CloudMessagePayload): void {
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {}
    });
  }

  public isConnected(): boolean {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  public disconnect(): void {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.currentRoomId = null;
  }
}

export const cloudRealtimeBridge = new CloudRealtimeBridgeService();
