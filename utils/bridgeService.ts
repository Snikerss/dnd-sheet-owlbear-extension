/**
 * Единый сервис управления межвкладочным мостом и P2P-вещанием (BroadcastChannel + window.message + localStorage Bus).
 * Инкапсулирует обработку ошибок песочницы, SESSION_CLIENT_ID, дедупликацию и непрерывную синхронизацию.
 */

import { logger } from './logger';
import { p2pRoomBridge } from './p2pBridge';
import { SESSION_CLIENT_ID } from './sessionId';
import { SAME_ORIGIN, isTrustedMessageOrigin, isOwlbear, getOwlbearParentOrigin } from './environment';
import { BridgeMessageType, P2pMessageType } from '../protocol/messages';

export { SESSION_CLIENT_ID };

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
        logger.warn('[DND Sheet Bridge] BroadcastChannel disabled or blocked by sandbox policies:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        // Origin-фильтр (аудит #4.1): посторонние сайты не могут инъецировать команды.
        if (!isTrustedMessageOrigin(event.origin)) return;
        this.handleMessage(event);
      });
      
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
                  type: BridgeMessageType.STORAGE_EVENT_SYNC,
                  senderClientId: 'storage-event'
                }
              }));
          } catch (e) {}
        }
      });

      // P2P Room Network listener (deferred to next tick so p2pRoomBridge instance is fully initialized)
      setTimeout(() => {
        if (typeof p2pRoomBridge !== 'undefined' && p2pRoomBridge?.subscribe) {
          p2pRoomBridge.subscribe((data) => {
            if (data && typeof data === 'object') {
              const msgKey = data.msgId ? `p2p-${data.msgId}` : `p2p-${data.type}-${data.sentAt}`;
              if (!this.isDuplicateMessage(msgKey, 5000)) {
                this.handleMessage(new MessageEvent('message', { data }));
              }
            }
          });
        }
      }, 0);
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

  /**
   * Находит и восстанавливает прямые связи с открытыми отдельными вкладками.
   * (Мёртвый реестр knownStandaloneCharIds удалён — план 2.7: единственным
   * потребителем был сам handleMessage; восстановление связи выполняет
   * heartbeat VTT_FRAME_READY.)
   */
  public reconnectStandaloneWindows(_charIds?: string[]): void {
    if (typeof window === 'undefined') return;
    this.postMessage({
      type: BridgeMessageType.VTT_FRAME_READY,
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
   * Высокочастотные типы сообщений (heartbeat/handshake), которые НЕ пишутся
   * в localStorage-шину: каждая запись bridge_signal триггерила у соседних
   * вкладок storage-event и полный перезагрузочный dispatch состояния
   * каждые 2–3 секунды (баг аудита #9). Эти сообщения доставляются через
   * BroadcastChannel / postMessage, шина для них избыточна.
   */
  private static readonly STORAGE_BUS_SKIP_TYPES: Set<string> = new Set<string>([
    BridgeMessageType.VTT_HEARTBEAT,
    BridgeMessageType.HEARTBEAT_PING,
    BridgeMessageType.VTT_FRAME_READY,
    P2pMessageType.PRESENCE_QUERY,
    P2pMessageType.STATE_RESPONSE,
  ]);

  /**
   * Отправляет сообщение во все открытые вкладки и дочерние/родительские окна браузера.
   */
  public postMessage(data: Record<string, unknown>, opts?: { skipStorageBus?: boolean }): void {
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
        logger.warn('[DND Sheet Bridge] Failed to postMessage via BroadcastChannel:', err);
      }
    }

    // 2. Parent window (только внутри OBR-фрейма)
    if (isOwlbear() && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, getOwlbearParentOrigin());
      } catch (err) {
        logger.debug('[DND Sheet Bridge] Failed to postMessage to window.parent:', err);
      }
    }

    // 3. Opener window (если открыты из другого окна/вкладки приложения).
    // Standalone-окна открываются приложением на SAME_ORIGIN, поэтому сообщения шлются строго на этот origin.
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, SAME_ORIGIN);
      } catch (err) {
        logger.debug('[DND Sheet Bridge] Failed to postMessage to window.opener:', err);
      }
    }

    // 4. Child windows — ВСЕГДА наш собственный origin: окна открываются
    // только через window.open из этого приложения.
    this.childWindows.forEach((win) => {
      if (win && !win.closed) {
        try {
          win.postMessage(payload, SAME_ORIGIN);
        } catch (err) {
          logger.debug('[DND Sheet Bridge] Failed to postMessage to child window:', err);
        }
      } else {
        this.childWindows.delete(win);
      }
    });

    // 5. P2P Room Network Broadcast
    try {
      p2pRoomBridge.broadcast(payload);
    } catch (e) {}

    // 6. LocalStorage Bus Signal for cross-tab sync on same domain
    const skipBus = opts?.skipStorageBus === true
      || (typeof data?.type === 'string' && LocalBridgeService.STORAGE_BUS_SKIP_TYPES.has(data.type));
    if (!skipBus && typeof window !== 'undefined' && window.localStorage) {
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

    // Универсальный дедуп по msgId: одно сообщение может прийти одновременно
    // через BroadcastChannel, postMessage и storage-шину (веер каналов аудита).
    if (event.data.msgId && this.isDuplicateMessage(`bridge-${event.data.msgId}`, 10000)) {
      return;
    }

    // (Реестр trackStandaloneCharacter удалён вместе с полем — план 2.7.)

    if (event.source && event.source !== window && 'postMessage' in event.source) {
      this.registerChildWindow(event.source as Window);
      if (typeof p2pRoomBridge !== 'undefined' && p2pRoomBridge?.registerWindow) {
        p2pRoomBridge.registerWindow(event.source as Window);
      }
    }

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        logger.error('[DND Sheet Bridge] Error in bridge message listener:', err);
      }
    });
  }
}

export const localBridge = new LocalBridgeService();
