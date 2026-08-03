import { Peer, DataConnection } from 'peerjs';
import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (PeerJS WebRTC Engine)
 * Прямой браузер-браузер WebRTC канал связи с 0мс задержкой и БЕЗ HTTP-ограничений (без 413 и 429).
 */
class P2PRoomBridgeService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private isConnecting: boolean = false;
  private reconnectTimer: any = null;

  /**
   * Инициализирует P2P WebRTC соединение с комнатой.
   */
  public connect(roomId: string): void {
    if (!roomId) return;
    if (this.currentRoomId === roomId && this.peer && !this.peer.destroyed) {
      return;
    }
    this.currentRoomId = roomId;
    this.initPeer();
  }

  private initPeer(): void {
    if (!this.currentRoomId || this.isConnecting) return;
    this.isConnecting = true;

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
    }

    const cleanRoomId = this.currentRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    const hostPeerId = `dnd-room-v3-${cleanRoomId}`;

    try {
      // Инициализируем локальный пир
      this.peer = new Peer();

      this.peer.on('open', (id) => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P WebRTC] Peer initialized with local ID: ${id}`);
        
        // Пытаемся подключиться к комнатному хосту
        this.connectToRoomHost(hostPeerId);
      });

      // Принимаем входящие WebRTC-соединения от сограждан комнаты
      this.peer.on('connection', (conn) => {
        console.log(`[DND Sheet P2P WebRTC] Incoming connection from: ${conn.peer}`);
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        // Если хост-ID еще свободен, перерегистрируемся как комнатный хост
        if (err.type === 'unavailable-id') {
          console.log(`[DND Sheet P2P WebRTC] Registering as room host: ${hostPeerId}`);
          this.registerAsHost(hostPeerId);
        } else {
          console.warn('[DND Sheet P2P WebRTC] Peer error:', err.type);
          this.isConnecting = false;
        }
      });

      this.peer.on('disconnected', () => {
        this.isConnecting = false;
        if (this.peer && !this.peer.destroyed) {
          try { this.peer.reconnect(); } catch (e) {}
        }
      });
    } catch (err) {
      console.warn('[DND Sheet P2P WebRTC] Failed to initialize PeerJS:', err);
      this.isConnecting = false;
    }
  }

  private registerAsHost(hostPeerId: string): void {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    try {
      this.peer = new Peer(hostPeerId);
      this.peer.on('open', (id) => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P WebRTC] Successfully registered as Room Host: ${id}`);
      });
      this.peer.on('connection', (conn) => {
        console.log(`[DND Sheet P2P WebRTC] Host accepted connection from client: ${conn.peer}`);
        this.setupConnection(conn);
      });
    } catch (e) {
      this.isConnecting = false;
    }
  }

  private connectToRoomHost(targetPeerId: string): void {
    if (!this.peer || this.peer.destroyed) return;
    if (this.peer.id === targetPeerId) return;

    try {
      const conn = this.peer.connect(targetPeerId, {
        reliable: true
      });
      this.setupConnection(conn);
    } catch (e) {}
  }

  private setupConnection(conn: DataConnection): void {
    conn.on('open', () => {
      console.log(`[DND Sheet P2P WebRTC] DataChannel open with peer: ${conn.peer}`);
      this.connections.set(conn.peer, conn);

      // Анонс появления клиента
      const payload = {
        type: 'P2P_PEER_JOIN',
        roomId: this.currentRoomId,
        senderClientId: SESSION_CLIENT_ID,
        timestamp: Date.now()
      };

      try {
        conn.send(payload);
      } catch (e) {}
    });

    conn.on('data', (data: any) => {
      if (data && typeof data === 'object') {
        console.log('[DND Sheet P2P WebRTC] Received WebRTC packet:', data.type);
        this.notifyListeners(data);

        // Если это комнатный хост, ретранслируем входящие пакеты всем подключенным клиентам
        if (this.peer && this.peer.id && this.peer.id.startsWith('dnd-room-v3-')) {
          this.connections.forEach((otherConn, peerId) => {
            if (peerId !== conn.peer && otherConn.open) {
              try { otherConn.send(data); } catch (e) {}
            }
          });
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

  /**
   * Отправляет сообщение в P2P WebRTC канал текущей комнаты без HTTP-лимитов.
   */
  public broadcast(data: any): void {
    if (!this.currentRoomId) return;

    const payload = {
      ...data,
      roomId: this.currentRoomId,
      sentAt: Date.now(),
      senderClientId: SESSION_CLIENT_ID
    };

    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(payload);
        } catch (e) {}
      }
    });
  }

  /**
   * Подписывается на входящие P2P WebRTC сообщения.
   */
  public subscribe(callback: (data: any) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(data: any): void {
    const senderId = data.senderClientId || data.senderId;
    if (senderId && senderId === SESSION_CLIENT_ID) {
      return; // Игнорируем эхо-сообщения от самого себя
    }

    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('[DND Sheet P2P WebRTC] Error in listener:', err);
      }
    });
  }

  /**
   * Отключает P2P-мост.
   */
  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.currentRoomId = null;
    this.isConnecting = false;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
