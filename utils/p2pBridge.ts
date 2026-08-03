/**
 * P2P Room Network Bridge Service.
 * Обеспечивает связь реального времени (<30 мс) между отдельной вкладкой на стороннем домене
 * и фреймом Owlbear Rodeo по уникальному ID комнаты (roomId) через онлайн-канал вещания.
 */

type P2PMessageHandler = (data: any) => void;

class P2PRoomBridgeService {
  private socket: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private listeners: Set<P2PMessageHandler> = new Set();
  private isConnecting = false;
  private reconnectTimer: any = null;
  private pingInterval: any = null;

  /**
   * Подключается к P2P-сетевой комнате по ее уникальному ID в Owlbear Rodeo.
   */
  public connect(roomId: string): void {
    if (!roomId) return;
    const cleanRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (this.currentRoomId === cleanRoomId && this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.currentRoomId = cleanRoomId;
    this.initWebSocket();
  }

  private endpointIndex = 0;

  private initWebSocket(): void {
    if (!this.currentRoomId || this.isConnecting) return;

    this.isConnecting = true;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
    }
    if (this.pingInterval) clearInterval(this.pingInterval);

    const shortRoomId = this.currentRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
    const endpoint = `wss://demo.piesocket.com/v3/room_${shortRoomId}?api_key=VC32145&notify_self=1`;

    try {
      this.socket = new WebSocket(endpoint);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P] Connected to room network channel: ${this.currentRoomId}`);
        
        // Поддержание активности сокета (Keep-alive ping каждые 20 секунд)
        this.pingInterval = setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
              this.socket.send(JSON.stringify({ action: 'ping' }));
            } catch (e) {}
          }
        }, 20000);

        // Анонс выходящего на связь клиента
        this.broadcast({
          type: 'P2P_PEER_JOIN',
          roomId: this.currentRoomId,
          timestamp: Date.now()
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data === 'object' && data.type !== 'PING') {
            this.notifyListeners(data);
          }
        } catch (e) {}
      };

      this.socket.onerror = (err) => {
        console.warn('[DND Sheet P2P] WebSocket error:', err);
        this.isConnecting = false;
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.endpointIndex++;
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.currentRoomId) {
            console.log('[DND Sheet P2P] Reconnecting to room network (switching cluster)...');
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
    if (this.pingInterval) clearInterval(this.pingInterval);
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
