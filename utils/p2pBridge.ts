import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (PieSocket WebSocket Engine + Native PostMessage)
 * Очищенный гибридный мост реального времени между отдельной вкладкой и Owlbear Rodeo.
 * Работает поверх изолированного междоменного контекста Chrome (Partitioned Storage) и выдерживает F5.
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
    const endpoint = `wss://free.piesocket.com/v3/dnd_room_${shortRoomId}?api_key=VC32145`;

    try {
      this.socket = new WebSocket(endpoint);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P] Connected to room network channel: ${shortRoomId}`);

        // Анонсируем подключение нового пира
        this.broadcast({
          type: 'P2P_PEER_JOIN',
          roomId: this.currentRoomId,
          timestamp: Date.now()
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          // Вскрываем PieSocket оболочки, если они есть
          const payload = (rawData && rawData.data && typeof rawData.data === 'object') ? rawData.data : rawData;
          if (payload && typeof payload === 'object' && payload.type) {
            this.notifyListeners(payload);
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
   * Отправляет очищенное легкое сообщение (<1Кб) во все окна через WebSocket и postMessage.
   */
  public broadcast(data: any): void {
    if (!this.currentRoomId) return;

    // Глубокая очистка тяжелых base64 картинок для удержания размера пакета в пределах 200 байт
    let cleanData = data;
    if (data && typeof data === 'object' && data.entry && data.entry.imageCache) {
      const { imageCache, ...restEntry } = data.entry;
      cleanData = { ...data, entry: restEntry };
    }

    const payload = {
      ...cleanData,
      roomId: this.currentRoomId,
      sentAt: Date.now(),
      senderClientId: SESSION_CLIENT_ID
    };

    const body = JSON.stringify(payload);

    // 1. Прямая отправка в открытый WebSocket сокет
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(body);
      } catch (e) {}
    }

    // 2. Отправка в родительское окно через HTML5 postMessage
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, '*');
      } catch (e) {}
    }

    // 3. Отправка в локальную шину LocalStorage Bus
    if (typeof window !== 'undefined') {
      try {
        const busPayload = JSON.stringify({
          ...payload,
          msgId: Math.random().toString(36).substring(2),
          msgTimestamp: Date.now()
        });
        window.localStorage.setItem('com.antigravity.dnd-sheet/bridge_signal', busPayload);
      } catch (e) {}
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
