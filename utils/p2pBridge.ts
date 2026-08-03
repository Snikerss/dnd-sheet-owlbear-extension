import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * Native HTML5 Browser Window Bridge & WebSocket P2P Relay Service
 * Обеспечивает непрерывную P2P-синхронизацию между вкладкой Owlbear Rodeo (3rd-party iframe)
 * и любой отдельно открытой автономной вкладкой браузера вне зависимости от изоляции Chrome.
 */
class P2PRoomBridgeService {
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private childWindows: Set<Window> = new Set();
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;

  public connect(roomId: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    console.log(`[DND Sheet P2P] Connecting P2P network bridge for room: ${roomId.slice(0, 8)}`);

    this.connectWebSocketRelay(roomId);
  }

  private connectWebSocketRelay(roomId: string): void {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    try {
      // Free public WebSocket P2P room relay channel
      const sanitizedRoom = encodeURIComponent(roomId.replace(/[^a-zA-Z0-9_-]/g, ''));
      const wsUrl = `wss://free.piehost.com/v2/dnd-sheet-room-${sanitizedRoom}?api_key=o9B0R8xJz4p5q&notify_self=0`;
      
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log(`[DND Sheet P2P] WebSocket P2P Relay connected for room: ${sanitizedRoom}`);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data === 'object') {
            this.notifyListeners(data);
          }
        } catch (e) {}
      };

      socket.onerror = (err) => {
        console.warn('[DND Sheet P2P] WebSocket Relay error, using native window bridge:', err);
      };

      socket.onclose = () => {
        if (this.currentRoomId === roomId) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.currentRoomId === roomId) {
              this.connectWebSocketRelay(roomId);
            }
          }, 5000);
        }
      };

      this.ws = socket;
    } catch (err) {
      console.warn('[DND Sheet P2P] Failed to initialize WebSocket relay:', err);
    }
  }

  public broadcast(data: any): void {
    const roomId = this.currentRoomId || 'global_vault_bridge';

    let cleanData = data;
    if (data && typeof data === 'object' && data.entry && data.entry.imageCache) {
      const { imageCache, ...restEntry } = data.entry;
      cleanData = { ...data, entry: restEntry };
    }

    const payload = {
      ...cleanData,
      roomId,
      sentAt: Date.now(),
      senderClientId: SESSION_CLIENT_ID
    };

    // 1. WebSocket P2P Relay (cross-origin cross-partition)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {}
    }

    // 2. Прямой postMessage родительскому и дочерним окнам
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
    if (win && !win.closed && (typeof window === 'undefined' || win !== window)) {
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
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    clearTimeout(this.reconnectTimer);
    this.childWindows.clear();
    this.currentRoomId = null;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
