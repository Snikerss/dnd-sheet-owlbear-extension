import { SESSION_CLIENT_ID } from './bridgeService';

/**
 * P2P Room Network Bridge Service (Direct Local & PostMessage Engine)
 * Высокоскоростной мост реального времени между вкладками без внешних сетевых серверов (0% CSP и 0% HTTP ошибок).
 */
class P2PRoomBridgeService {
  private currentRoomId: string | null = null;
  private listeners: Set<(data: any) => void> = new Set();

  /**
   * Подключает локальный мост к комнате Owlbear.
   */
  public connect(roomId: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    console.log('[DND Sheet P2P] Local & PostMessage Bridge connected for room:', roomId.slice(0, 12));
  }

  /**
   * Отправляет сообщение во все связанные окна и вкладки через native HTML5 PostMessage и LocalStorage Bus.
   */
  public broadcast(data: any): void {
    if (!this.currentRoomId) return;

    const payload = {
      ...data,
      roomId: this.currentRoomId,
      sentAt: Date.now(),
      senderClientId: SESSION_CLIENT_ID
    };

    // 1. Отправляем в родительское окно (Owlbear Rodeo фрейм), если мы открыты в отдельной вкладке
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, '*');
      } catch (e) {}
    }

    // 2. Рассылаем в шину сигналов LocalStorage Bus (без внешних сетевых запросов)
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

  /**
   * Подписывается на события моста.
   */
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
    this.currentRoomId = null;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
