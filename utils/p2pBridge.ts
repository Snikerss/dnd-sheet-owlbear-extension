/**
 * P2P Room Network Bridge Service.
 * Обеспечивает связь реального времени (<30 мс) между отдельной вкладкой на стороннем домене
 * и фреймом Owlbear Rodeo по уникальному ID комнаты (roomId) через публичные WebSocket/P2P сокеты.
 */

type P2PMessageHandler = (data: any) => void;

class P2PRoomBridgeService {
  private socket: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private listeners: Set<P2PMessageHandler> = new Set();
  private isConnecting = false;
  private reconnectTimer: any = null;

  /**
   * Подключается к P2P-сетевой комнате по ее уникальному ID в Owlbear Rodeo.
   */
  public connect(roomId: string): void {
    if (!roomId || (this.currentRoomId === roomId && this.socket && this.socket.readyState === WebSocket.OPEN)) {
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
        this.socket.close();
      } catch (e) {}
    }

    // Использование публичного высокодоступного WebSocket PubSub реле
    const endpoint = `wss://socketsbay.com/wss/v2/1/dnd-room-${encodeURIComponent(this.currentRoomId)}/`;

    try {
      this.socket = new WebSocket(endpoint);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P] Connected to room network channel: ${this.currentRoomId}`);
        // Анонс в комнату при выходе на связь
        this.broadcast({
          type: 'P2P_PEER_JOIN',
          roomId: this.currentRoomId,
          timestamp: Date.now()
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data === 'object') {
            this.notifyListeners(data);
          }
        } catch (e) {}
      };

      this.socket.onerror = (err) => {
        console.warn('[DND Sheet P2P] WebSocket network error:', err);
        this.isConnecting = false;
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        // Автоматическое переподключение через 4 секунды при разрыве сети
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.currentRoomId) {
            console.log('[DND Sheet P2P] Reconnecting to room network...');
            this.initWebSocket();
          }
        }, 4000);
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const payload = {
        ...data,
        roomId: this.currentRoomId,
        sentAt: Date.now()
      };
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[DND Sheet P2P] Failed to send broadcast packet:', err);
    }
  }

  /**
   * Подписывает обработчик на входящие P2P-пакеты.
   */
  public subscribe(handler: P2PMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private notifyListeners(data: any): void {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('[DND Sheet P2P] Error in P2P message handler:', err);
      }
    });
  }

  /**
   * Отключает сетевой мост.
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
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
