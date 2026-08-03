import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (ntfy.sh PubSub Engine)
 * Обеспечивает сквозную 100% бесплатную передачу данных между отдельными вкладками
 * и фреймом Owlbear Rodeo VTT через глобальныйPubSub канал ntfy.sh.
 */
class P2PRoomBridgeService {
  private socket: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private isConnecting: boolean = false;
  private reconnectTimer: any = null;

  /**
   * Инициализирует P2P-соединение с комнатой.
   */
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
   * Отправляет сообщение в P2P-сетевой канал текущей комнаты.
   */
  public broadcast(data: any): void {
    if (!this.currentRoomId) return;
    const shortRoomId = this.currentRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    const payload = {
      ...data,
      roomId: this.currentRoomId,
      sentAt: Date.now()
    };

    const body = JSON.stringify(payload);

    // 1. Отправляем через WebSocket, если открыт
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(body);
      } catch (e) {}
    }

    // 2. Отправляем через HTTP POST для 100% гарантированной доставки вне зависимости от состояния сокета
    try {
      fetch(`https://ntfy.sh/dnd_sheet_room_${shortRoomId}`, {
        method: 'POST',
        body: body
      }).catch(() => {});
    } catch (e) {}
  }

  /**
   * Подписывается на входящие P2P-сообщения сети.
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
      return; // Игнорируем собственные эхо-сообщения
    }

    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('[DND Sheet P2P] Error in listener:', err);
      }
    });
  }

  /**
   * Отключает P2P-мост.
   */
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
