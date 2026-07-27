/**
 * Единый сервис управления межвкладочным мостом и P2P-вещанием (BroadcastChannel + window.message).
 * Инкапсулирует обработку ошибок песочницы, SESSION_CLIENT_ID и дедупликацию сообщений.
 */

export const SESSION_CLIENT_ID = typeof window !== 'undefined'
  ? ((window as any).__dndSessionId || ((window as any).__dndSessionId = Math.random().toString(36).substring(2)))
  : '';

type BridgeMessageHandler = (event: MessageEvent) => void;

class LocalBridgeService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<BridgeMessageHandler> = new Set();
  private processedMsgTimes: Map<string, number> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('com.antigravity.dnd-sheet/local-bridge');
        this.channel.onmessage = (event) => this.handleMessage(event);
      } catch (err) {
        console.warn('[DND Sheet Bridge] BroadcastChannel disabled or blocked by sandbox policies:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => this.handleMessage(event));
    }
  }

  /**
   * Проверяет и регистрирует дедупликацию сообщения по токену и отпечатку времени.
   */
  public isDuplicateMessage(msgKey: string, maxAgeMs = 5000): boolean {
    const now = Date.now();
    const lastTime = this.processedMsgTimes.get(msgKey);

    if (lastTime && (now - lastTime) < maxAgeMs) {
      return true;
    }

    this.processedMsgTimes.set(msgKey, now);

    // Очистка при разрастании Map
    if (this.processedMsgTimes.size > 100) {
      for (const [k, time] of this.processedMsgTimes.entries()) {
        if (now - time > maxAgeMs) {
          this.processedMsgTimes.delete(k);
        }
      }
    }

    return false;
  }

  /**
   * Отправляет сообщение во все открытые вкладки браузера.
   */
  public postMessage(data: any): void {
    const payload = {
      ...data,
      senderClientId: SESSION_CLIENT_ID,
    };

    if (this.channel) {
      try {
        this.channel.postMessage(payload);
      } catch (err) {
        console.warn('[DND Sheet Bridge] Failed to postMessage via BroadcastChannel:', err);
      }
    }

    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, '*');
      } catch (err) {
        // Safe fallback
      }
    }
  }

  /**
   * Подписывает компонент или хук на входящие события моста.
   */
  public subscribe(handler: BridgeMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private handleMessage(event: MessageEvent): void {
    if (!event.data || typeof event.data !== 'object') return;
    
    // Игнорируем собственные сообщения от той же вкладки
    if (event.data.senderClientId === SESSION_CLIENT_ID) return;

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[DND Sheet Bridge] Error in bridge message listener:', err);
      }
    });
  }
}

export const localBridge = new LocalBridgeService();
