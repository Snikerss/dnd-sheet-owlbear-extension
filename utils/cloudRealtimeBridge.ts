import { SESSION_CLIENT_ID } from './bridgeService';

export interface CloudMessagePayload {
  type: 'CHAR_UPDATE' | 'DICE_ROLL' | 'PRESENCE_QUERY' | 'STATE_RESPONSE' | 'ROOM_ANNOUNCE' | 'DISCOVERY_BEACON_QUERY' | 'DISCOVERY_BEACON_RESPONSE';
  roomId?: string;
  roomName?: string;
  senderClientId: string;
  sentAt: number;
  data?: any;
}

type CloudMessageHandler = (payload: CloudMessagePayload) => void;

/**
 * Production-Grade Cloud Realtime P2P Bridge & Discovery Beacon
 * Мгновенный сокет-шлюз комнат + глобальный облачный маяк обнаружения (dnd-global-discovery-beacon).
 * Обеспечивает неразрывную связь между Owlbear Rodeo VTT и автономными вкладками при любых F5-перезагрузках.
 */
class CloudRealtimeBridgeService {
  private currentRoomId: string | null = null;
  private currentRoomName: string = 'Owlbear Room';
  private ws: WebSocket | null = null;
  private beaconWs: WebSocket | null = null;
  private listeners: Set<CloudMessageHandler> = new Set();
  private discoveryCallbacks: Set<(roomId: string, roomName: string) => void> = new Set();
  private reconnectTimer: any = null;

  public connect(roomId: string, roomName?: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    if (roomName) this.currentRoomName = roomName;

    this.initWebSocket(roomId);
    this.initDiscoveryBeacon();
  }

  public initDiscoveryBeacon(): void {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    if (this.beaconWs) {
      try {
        this.beaconWs.close();
      } catch (e) {}
      this.beaconWs = null;
    }

    try {
      const socket = new WebSocket('wss://socketsbay.com/wss/v2/1/dnd-global-discovery-beacon/');

      socket.onopen = () => {
        console.log('[Cloud Discovery Beacon] Connected to global discovery channel.');
      };

      socket.onmessage = (event) => {
        try {
          const payload: CloudMessagePayload = JSON.parse(event.data);
          if (!payload || typeof payload !== 'object' || payload.senderClientId === SESSION_CLIENT_ID) return;

          // Owlbear responds to discovery query from standalone tabs
          if (payload.type === 'DISCOVERY_BEACON_QUERY' && this.currentRoomId) {
            this.sendBeaconResponse(this.currentRoomId, this.currentRoomName);
          }

          // Standalone tab receives discovery response from Owlbear
          if (payload.type === 'DISCOVERY_BEACON_RESPONSE' && payload.roomId) {
            this.notifyRoomDiscovered(payload.roomId, payload.roomName || 'Owlbear Room');
          }
        } catch (e) {}
      };

      socket.onerror = () => {};

      this.beaconWs = socket;
    } catch (err) {}
  }

  public queryDiscoveryBeacon(): void {
    if (this.beaconWs && this.beaconWs.readyState === WebSocket.OPEN) {
      try {
        this.beaconWs.send(JSON.stringify({
          type: 'DISCOVERY_BEACON_QUERY',
          senderClientId: SESSION_CLIENT_ID,
          sentAt: Date.now()
        }));
      } catch (e) {}
    } else {
      this.initDiscoveryBeacon();
    }
  }

  public sendBeaconResponse(roomId: string, roomName: string): void {
    if (this.beaconWs && this.beaconWs.readyState === WebSocket.OPEN) {
      try {
        this.beaconWs.send(JSON.stringify({
          type: 'DISCOVERY_BEACON_RESPONSE',
          roomId,
          roomName,
          senderClientId: SESSION_CLIENT_ID,
          sentAt: Date.now()
        }));
      } catch (e) {}
    }
  }

  public onRoomDiscovered(callback: (roomId: string, roomName: string) => void): () => void {
    this.discoveryCallbacks.add(callback);
    return () => {
      this.discoveryCallbacks.delete(callback);
    };
  }

  private notifyRoomDiscovered(roomId: string, roomName: string): void {
    this.discoveryCallbacks.forEach((cb) => {
      try {
        cb(roomId, roomName);
      } catch (e) {}
    });
  }

  private initWebSocket(roomId: string): void {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    const sanitizedRoom = encodeURIComponent(roomId.replace(/[^a-zA-Z0-9_-]/g, ''));
    const wsUrl = `wss://socketsbay.com/wss/v2/1/dnd-room-${sanitizedRoom}/`;

    try {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log(`[Cloud Realtime Bridge] Connected to room channel: dnd-room-${sanitizedRoom}`);

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

      socket.onerror = () => {};

      socket.onclose = () => {
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
    } catch (err) {}
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
    if (this.beaconWs) {
      try {
        this.beaconWs.close();
      } catch (e) {}
      this.beaconWs = null;
    }
    this.currentRoomId = null;
  }
}

export const cloudRealtimeBridge = new CloudRealtimeBridgeService();
