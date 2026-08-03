import { SESSION_CLIENT_ID } from './bridgeService';
import { imageDb } from './indexedDbStore';

/**
 * Native HTML5 Browser Window Bridge & Hybrid P2P Relay Service
 * Сочетает локальную шину IndexedDB (100% оффлайн без серверов) и мгновенный WebSocket P2P-шлюз.
 */
class P2PRoomBridgeService {
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private childWindows: Set<Window> = new Set();
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private lastIndexedDbTime = 0;

  constructor() {
    // 1. Local IndexedDB Bus Polling (100% offline cross-tab sync)
    if (typeof window !== 'undefined') {
      setInterval(async () => {
        if (!imageDb) return;
        try {
          const signal = await imageDb.get('p2p_bus_signal');
          if (signal && typeof signal === 'object' && signal.sentAt && signal.sentAt > this.lastIndexedDbTime) {
            this.lastIndexedDbTime = signal.sentAt;
            this.notifyListeners(signal);
          }
        } catch (e) {}
      }, 1000);
    }
  }

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
      const sanitizedRoom = encodeURIComponent(roomId.replace(/[^a-zA-Z0-9_-]/g, ''));
      const wsUrl = `wss://socketsbay.com/wss/v2/1/dnd-sheet-${sanitizedRoom}/`;
      
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log(`[DND Sheet P2P] WebSocket P2P Relay active for room: ${sanitizedRoom}`);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data === 'object') {
            this.notifyListeners(data);
          }
        } catch (e) {}
      };

      socket.onerror = () => {
        // Silent fallback to IndexedDB and Window postMessage
      };

      socket.onclose = () => {
        if (this.currentRoomId === roomId) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.currentRoomId === roomId) {
              this.connectWebSocketRelay(roomId);
            }
          }, 10000);
        }
      };

      this.ws = socket;
    } catch (err) {}
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

    // 1. WebSocket P2P Relay (real-time instant)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {}
    }

    // 2. IndexedDB Local Bus (100% offline cross-tab)
    if (imageDb) {
      try {
        imageDb.set('p2p_bus_signal', payload).catch(() => {});
      } catch (e) {}
    }

    // 3. Native postMessage
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
