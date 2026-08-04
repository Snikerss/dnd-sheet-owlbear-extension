import Peer, { DataConnection } from 'peerjs';
import { SESSION_CLIENT_ID } from './bridgeService';

export interface CloudMessagePayload {
  type: 'CHAR_UPDATE' | 'DICE_ROLL' | 'PRESENCE_QUERY' | 'STATE_RESPONSE' | 'ROOM_ANNOUNCE' | 'PEER_ANNOUNCE';
  roomId?: string;
  roomName?: string;
  senderClientId: string;
  peerId?: string;
  sentAt: number;
  data?: any;
}

type CloudMessageHandler = (payload: CloudMessagePayload) => void;

/**
 * Production-Grade Client-Generated PeerJS WebRTC P2P Gateway
 * Генерирует клиентский уникальный 10-значный Peer ID (пропуская HTTP GET /id CORS-блокировки).
 * Мгновенно открывает WSS-подключение и соединяет WebRTC DataChannel без 403 CORS ошибок.
 */
class CloudRealtimeBridgeService {
  private peer: Peer | null = null;
  private myPeerId: string | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private listeners: Set<CloudMessageHandler> = new Set();
  private discoveryCallbacks: Set<(roomId: string, roomName: string) => void> = new Set();
  private currentRoomId: string | null = null;
  private currentRoomName: string = 'Owlbear Room';

  public connect(roomId: string, roomName?: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    if (roomName) this.currentRoomName = roomName;

    this.initPeerJs();
  }

  private initPeerJs(): void {
    if (typeof window === 'undefined') return;

    if (this.peer && !this.peer.destroyed) {
      return;
    }

    try {
      // Client-side generated 10-char Peer ID to bypass GET /peerjs/id CORS 403 restriction
      const clientPeerId = 'p' + Math.random().toString(36).substring(2, 12);

      const peer = new Peer(clientPeerId, {
        debug: 1,
        secure: true,
        host: '0.peerjs.com',
        port: 443,
        path: '/'
      });

      peer.on('open', (id) => {
        console.log(`[PeerJS Gateway] Connected directly via WSS. My Peer ID: ${id}`);
        this.myPeerId = id;
        this.broadcastPeerAnnounce();
      });

      // Handle incoming direct WebRTC DataConnections
      peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      peer.on('error', (err) => {
        console.warn('[PeerJS Gateway] Peer error:', err.type);
      });

      this.peer = peer;
    } catch (e) {
      console.warn('[PeerJS Gateway] Failed to create Peer instance:', e);
    }
  }

  public connectToPeer(remotePeerId: string): void {
    if (!this.peer || this.peer.destroyed || !remotePeerId || remotePeerId === this.myPeerId) return;
    if (this.connections.has(remotePeerId)) return;

    try {
      const conn = this.peer.connect(remotePeerId);
      this.setupConnection(conn);
    } catch (e) {}
  }

  private setupConnection(conn: DataConnection): void {
    conn.on('open', () => {
      console.log(`[PeerJS Gateway] Direct WebRTC DataChannel OPEN with peer: ${conn.peer}`);
      this.connections.set(conn.peer, conn);

      this.sendToConn(conn, {
        type: 'PRESENCE_QUERY',
        roomId: this.currentRoomId || '',
        roomName: this.currentRoomName,
        senderClientId: SESSION_CLIENT_ID,
        peerId: this.myPeerId || undefined,
        sentAt: Date.now()
      });
    });

    conn.on('data', (data: any) => {
      if (data && typeof data === 'object' && data.senderClientId !== SESSION_CLIENT_ID) {
        this.notifyListeners(data as CloudMessagePayload);

        if (data.type === 'PEER_ANNOUNCE' && data.peerId) {
          this.connectToPeer(data.peerId);
        }

        if (data.type === 'PRESENCE_QUERY' && this.currentRoomId) {
          this.sendToConn(conn, {
            type: 'STATE_RESPONSE',
            roomId: this.currentRoomId,
            roomName: this.currentRoomName,
            senderClientId: SESSION_CLIENT_ID,
            peerId: this.myPeerId || undefined,
            sentAt: Date.now()
          });
        }

        if (data.type === 'STATE_RESPONSE' && data.roomId) {
          this.notifyRoomDiscovered(data.roomId, data.roomName || 'Owlbear Room');
        }
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
    });
  }

  private sendToConn(conn: DataConnection, payload: CloudMessagePayload): void {
    if (conn && conn.open) {
      try {
        conn.send(payload);
      } catch (e) {}
    }
  }

  private broadcastPeerAnnounce(): void {
    if (!this.myPeerId) return;
    const payload: CloudMessagePayload = {
      type: 'PEER_ANNOUNCE',
      roomId: this.currentRoomId || '',
      roomName: this.currentRoomName,
      senderClientId: SESSION_CLIENT_ID,
      peerId: this.myPeerId,
      sentAt: Date.now()
    };
    this.send(payload);
  }

  public queryDiscoveryBeacon(): void {
    this.broadcastPeerAnnounce();
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

  public send(payload: CloudMessagePayload): void {
    const fullPayload = {
      ...payload,
      peerId: this.myPeerId || payload.peerId
    };
    this.connections.forEach((conn) => {
      this.sendToConn(conn, fullPayload);
    });
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
    if (payload.type === 'PEER_ANNOUNCE' && payload.peerId) {
      this.connectToPeer(payload.peerId);
    }
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {}
    });
  }

  public isConnected(): boolean {
    return this.connections.size > 0;
  }

  public disconnect(): void {
    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch (e) {}
    });
    this.connections.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.myPeerId = null;
  }
}

export const cloudRealtimeBridge = new CloudRealtimeBridgeService();
