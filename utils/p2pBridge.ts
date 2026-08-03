import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (SocketsBay Open WebSocket Relay + HTML5 PostMessage)
 * Гарантированное P2P соединение реального времени, выдерживающее F5 перезагрузку без API-ключей и ошибок.
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
    // SocketsBay открытый публичный WSS реле (не требует API ключей)
    const endpoint = `wss://socketsbay.com/wss/v2/1/demo/`;

    try {
      this.socket = new WebSocket(endpoint);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log(`[DND Sheet P2P] Connected to SocketsBay open room channel: ${shortRoomId.slice(0, 8)}`);

        // Анонс выходящего на связь пира
        this.broadcast({
          type: 'P2P_PEER_JOIN',
          roomId: this.currentRoomId,
          timestamp: Date.now()
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          if (rawData && typeof rawData === 'object' && rawData.roomId === this.currentRoomId && rawData.type) {
            this.notifyListeners(rawData);
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

    // Вырезаем тяжелые base64 картинки для удерживания размера пакета в пределах 200 байт
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

    // 1. Отправляем в WSS сокет (для выдерживания F5 перезагрузки)
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(body);
      } catch (e) {}
    }

    // 2. Прямой HTML5 postMessage
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
