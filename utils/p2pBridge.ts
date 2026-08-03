import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (ntfy.sh PubSub Engine)
 * Высокоскоростной мост реального времени между отдельной вкладкой и Owlbear Rodeo.
 * Использование легких пакетов (<200B) гарантирует моментальную рассылку обоим окнам.
 */
class P2PRoomBridgeService {
  private socket: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private childWindows: Set<Window> = new Set();
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

        // Анонс выходящего на связь пира
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
            if (rawData && typeof rawData === 'object' && rawData.roomId === this.currentRoomId && rawData.type) {
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
      this.isConnecting = false;
    }
  }

  public broadcast(data: any): void {
    if (!this.currentRoomId) return;

    // Глубокая очистка тяжелых base64 картинок для удержания размера пакета <200 байт
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

    // 1. Публикуем в ntfy через простой POST-запрос без кастомных заголовков (<200B обходит CORS, 413 и 429)
    const shortRoomId = this.currentRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    try {
      fetch(`https://ntfy.sh/dnd_sheet_room_${shortRoomId}`, {
        method: 'POST',
        body: body
      }).catch(() => {});
    } catch (e) {}

    // 2. Прямой HTML5 postMessage родительскому и дочерним окнам
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, '*');
      } catch (e) {}
    }

    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, '*');
      } catch (e) {}
    }

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
    if (win && !win.closed && win !== window) {
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

    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {}
    });
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
      this.socket = null;
    }
    this.childWindows.clear();
    this.currentRoomId = null;
    this.isConnecting = false;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
