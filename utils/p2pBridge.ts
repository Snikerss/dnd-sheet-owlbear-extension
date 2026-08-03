import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (ntfy.sh Engine)
 * Высокоскоростной мост реального времени между автономной вкладкой и Owlbear Rodeo.
 */
class P2PRoomBridgeService {
  private socket: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private isConnecting: boolean = false;
  private reconnectTimer: any = null;

  public connect(roomId: string): void {
    if (!roomId) return;
    if (this.currentRoomId === roomId && this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.currentRoomId = roomId;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    if (!this.currentRoomId || this.isConnecting) return;
    this.isConnecting = true;

    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.close();
      } catch (e) {}
    }

    const shortRoomId = this.currentRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    const endpoint = `wss://ntfy.sh/dnd_sheet_room_${shortRoomId}/ws`;

    try {
      this.socket = new WebSocket(endpoint);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P] Connected to ntfy room network channel: ${shortRoomId}`);

        // Анонс выходящего на связь клиента
        this.broadcast({
          type: 'P2P_PEER_JOIN',
          roomId: this.currentRoomId,
          timestamp: Date.now()
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const wrapper = JSON.parse(event.data);
          if (wrapper && wrapper.event === 'message' && wrapper.message) {
            const rawData = typeof wrapper.message === 'string' ? JSON.parse(wrapper.message) : wrapper.message;
            if (rawData && typeof rawData === 'object' && rawData.type && rawData.type !== 'PING') {
              console.log('[DND Sheet P2P] Received P2P message from room:', rawData.type);
              this.notifyListeners(rawData);
            }
          }
        } catch (e) {}
      };

      this.socket.onerror = () => {
        this.isConnecting = false;
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.currentRoomId) {
            this.initWebSocket();
          }
        }, 3000);
      };
    } catch (err) {
      console.warn('[DND Sheet P2P] Failed to initialize WebSocket client:', err);
      this.isConnecting = false;
    }
  }

  /**
   * Отправляет очищенное сообщение в P2P-сетевой канал ntfy.
   */
  public broadcast(data: any): void {
    if (!this.currentRoomId) return;
    const shortRoomId = this.currentRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

    // Удаляем тяжелые base64 изображения из сетевого пакета для удержания размера до 2 Кб
    let cleanData = data;
    if (data && typeof data === 'object' && data.entry && data.entry.imageCache) {
      const { imageCache, ...restEntry } = data.entry;
      cleanData = { ...data, entry: restEntry };
    }

    const payload = {
      ...cleanData,
      roomId: this.currentRoomId,
      sentAt: Date.now()
    };

    const body = JSON.stringify(payload);

    // 1. Отправляем через WebSocket если открыт
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(body);
      } catch (e) {}
    }

    // 2. Отправляем через простые POST-запросы без кастомных заголовков (для обхода CORS OPTIONS preflight)
    try {
      fetch(`https://ntfy.sh/dnd_sheet_room_${shortRoomId}`, {
        method: 'POST',
        body: body
      }).catch(() => {});
    } catch (e) {}
  }

  public subscribe(callback: (data: any) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(data: any): void {
    const senderId = data.senderClientId || data.senderId;
    if (senderId && senderId === SESSION_CLIENT_ID) {
      return;
    }

    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('[DND Sheet P2P] Error in listener:', err);
      }
    });
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
    this.currentRoomId = null;
    this.isConnecting = false;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
