/**
 * Единый сервис управления межвкладочным мостом и P2P-вещанием (BroadcastChannel + window.message + localStorage Bus).
 * Инкапсулирует обработку ошибок песочницы, SESSION_CLIENT_ID, дедупликацию и непрерывную синхронизацию.
 */

import { p2pRoomBridge } from './p2pBridge';

export const SESSION_CLIENT_ID = typeof window !== 'undefined'
  ? ((window as any).__dndSessionId || ((window as any).__dndSessionId = Math.random().toString(36).substring(2)))
  : '';

type BridgeMessageHandler = (event: MessageEvent) => void;

class LocalBridgeService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<BridgeMessageHandler> = new Set();
  private processedMsgTimes: Map<string, number> = new Map();
  private childWindows: Set<Window> = new Set();

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
      
      // Fallback listener for browser storage events across tabs on the same origin
      window.addEventListener('storage', (event) => {
        if (!event.key) return;

        if (event.key === 'com.antigravity.dnd-sheet/bridge_signal' && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue);
            this.handleMessage(new MessageEvent('message', { data: parsed }));
          } catch (e) {}
        } else if (event.key.startsWith('com.antigravity.dnd-sheet/v2/character/') || event.key === 'com.antigravity.dnd-sheet/characters') {
          try {
            this.handleMessage(new MessageEvent('message', {
              data: {
                type: 'STORAGE_EVENT_SYNC',
                senderClientId: 'storage-event'
              }
            }));
          } catch (e) {}
        }
      });

      // P2P Room Network listener
      p2pRoomBridge.subscribe((data) => {
        if (data && typeof data === 'object') {
          const msgKey = data.msgId ? `p2p-${data.msgId}` : `p2p-${data.type}-${data.sentAt}`;
          if (!this.isDuplicateMessage(msgKey, 5000)) {
            this.handleMessage(new MessageEvent('message', { data }));
          }
        }
      });
    }
  }

  /**
   * Регистрирует дочернее окно (открытое через window.open) для прямого обмена сообщениями.
   */
  public registerChildWindow(win: Window): void {
    if (win && !win.closed) {
      this.childWindows.add(win);
    }
  }

  private knownStandaloneCharIds: Set<string> = new Set();

  /**
   * Отмечает ID персонажа как открытого в отдельной вкладке
   */
  public trackStandaloneCharacter(charId: string): void {
    if (charId) {
      this.knownStandaloneCharIds.add(charId);
    }
  }

  /**
   * Находит и восстанавливает прямые связи с открытыми отдельными вкладками.
   * Проверяет targetName окон в браузерном реестре. Если окно не было открыто и браузер создал blank-окно, мгновенно закрывает его.
   */
  public reconnectStandaloneWindows(_charIds?: string[]): void {
    if (typeof window === 'undefined') return;
    this.postMessage({
      type: 'VTT_FRAME_READY',
      senderClientId: SESSION_CLIENT_ID
    });
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
   * Отправляет сообщение во все открытые вкладки и дочерние/родительские окна браузера.
   */
  public postMessage(data: any): void {
    const msgId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const payload = {
      ...data,
      senderClientId: SESSION_CLIENT_ID,
      senderId: SESSION_CLIENT_ID,
      msgId,
      msgTimestamp: Date.now()
    };

    // 1. BroadcastChannel (все вкладки на том же домене)
    if (this.channel) {
      try {
        this.channel.postMessage(payload);
      } catch (err) {
        console.warn('[DND Sheet Bridge] Failed to postMessage via BroadcastChannel:', err);
      }
    }

    // 2. Parent window (если находимся в iframe)
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, '*');
      } catch (err) {}
    }

    // 3. Opener window (если открыты из другого окна/вкладки)
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, '*');
      } catch (err) {}
    }

    // 4. Child windows (окна, открытые из текущего)
    this.childWindows.forEach((win) => {
      if (win && !win.closed) {
        try {
          win.postMessage(payload, '*');
        } catch (err) {}
      } else {
        this.childWindows.delete(win);
      }
    });

    // 5. P2P Room Network Broadcast
    try {
      p2pRoomBridge.broadcast(payload);
    } catch (e) {}

    // 6. LocalStorage Bus Signal for cross-tab sync on same domain
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('com.antigravity.dnd-sheet/bridge_signal', JSON.stringify({ ...payload, _seq: Date.now() + Math.random() }));
      } catch (e) {}
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
    const senderId = event.data.senderClientId || event.data.senderId;
    if (senderId && senderId === SESSION_CLIENT_ID) return;

    if (event.data.charId) {
      this.trackStandaloneCharacter(event.data.charId);
    }

    // Автоматическая регистрация отправителя, если это дочернее окно
    if (event.source && event.source !== window && 'postMessage' in event.source) {
      this.registerChildWindow(event.source as Window);
      p2pRoomBridge.registerWindow(event.source as Window);
    }

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
