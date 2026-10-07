import { SESSION_CLIENT_ID } from './sessionId';
import { logger } from './logger';
import { SAME_ORIGIN, isTrustedMessageOrigin, isOwlbear, getOwlbearParentOrigin } from './environment';
import { P2pMessageType } from '../protocol/messages';

export interface RoomHandshakePayload {
  type: 'ROOM_ANNOUNCE' | 'ROOM_PAIR_REQUEST' | 'ROOM_PAIR_ACK' | 'SET_ACTIVE_BOARD_CHAR' | 'CHAR_SYNC' | 'CHAR_UPDATE' | 'DICE_ROLL' | 'PRESENCE_QUERY' | 'STATE_RESPONSE';
  roomId: string;
  roomName?: string;
  activeCharacterId?: string;
  senderClientId: string;
  sentAt: number;
  data?: unknown;
}

// Native HTML5 BroadcastChannel for sub-1ms tab-to-tab memory sync
const p2pBroadcastChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('com.antigravity.dnd-sheet/p2p_memory_channel')
  : null;

/**
 * Pure HTML5 Bridge (BroadcastChannel + window.postMessage).
 *
 * Примечание аудита: прежний «WebRTC Direct DataChannel» слой удалён —
 * RTCPeerConnection создавался, но SDP/ICE-сигналинг никогда не выполнялся,
 * поэтому DataChannel не мог открыться в принципе (мёртвый код, дававший
 * ложное представление об архитектуре). Реальный обмен идёт через
 * OBR.broadcast + BroadcastChannel + window.postMessage.
 */
class P2PRoomBridgeService {
  private currentRoomId: string | null = null;
  private currentRoomName: string = 'Owlbear Room';
  private listeners: Set<(data: Record<string, unknown>) => void> = new Set();
  private childWindows: Set<Window> = new Set();
  private activeBoardCharacterId: string | null = null;
  /** Дедуп входящих сообщений по msgId (ключ → время последнего приёма). */
  private dedupTimes: Map<string, number> = new Map();

  constructor() {
    // 1. Subscribe to Native HTML5 BroadcastChannel (<1ms memory latency)
    if (p2pBroadcastChannel) {
      p2pBroadcastChannel.onmessage = (event) => {
        if (event.data && typeof event.data === 'object') {
          this.notifyListeners(event.data);
        }
      };
    }

    // 2. Subscribe to window.postMessage events
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        // Origin-фильтр (аудит #4.1): посторонние сайты не могут инъецировать команды.
        if (!isTrustedMessageOrigin(event.origin)) return;
        if (event.data && typeof event.data === 'object' && event.data.senderClientId) {
          this.notifyListeners(event.data);
        }
      });
    }
  }

  public connect(roomId: string, roomName?: string): void {
    if (!roomId) return;
    this.currentRoomId = roomId;
    if (roomName) this.currentRoomName = roomName;

    logger.debug(`[DND Sheet P2P Bridge] Connecting to room: ${roomId} (${this.currentRoomName})`);

    // Broadcast room announcement to local listening tabs
    this.broadcast({
      type: P2pMessageType.ROOM_ANNOUNCE,
      roomId: this.currentRoomId,
      roomName: this.currentRoomName,
      activeCharacterId: this.activeBoardCharacterId || undefined
    });
  }

  public setActiveBoardCharacter(charId: string | null): void {
    this.activeBoardCharacterId = charId;
    if (this.currentRoomId) {
      this.broadcast({
        type: P2pMessageType.SET_ACTIVE_BOARD_CHAR,
        roomId: this.currentRoomId,
        activeCharacterId: charId || undefined
      });
    }
  }

  public getActiveBoardCharacterId(): string | null {
    return this.activeBoardCharacterId;
  }

  public getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  public getCurrentRoomName(): string {
    return this.currentRoomName;
  }

  public broadcast(data: Record<string, unknown>): void {
    const roomId = this.currentRoomId || 'global_vault_bridge';

    let cleanData = data;
    if (data && typeof data === 'object' && 'entry' in data && (data.entry as { imageCache?: unknown })?.imageCache) {
      const restEntry = { ...(data.entry as Record<string, unknown>) };
      delete restEntry.imageCache;
      cleanData = { ...data, entry: restEntry };
    }

    const payload: RoomHandshakePayload = {
      ...cleanData,
      type: (cleanData.type as RoomHandshakePayload['type']) || 'ROOM_ANNOUNCE',
      roomId,
      roomName: this.currentRoomName,
      sentAt: Date.now(),
      senderClientId: SESSION_CLIENT_ID
    };

    // 1. Broadcast via Native HTML5 BroadcastChannel (Sub-1ms memory transmission)
    if (p2pBroadcastChannel) {
      try {
        p2pBroadcastChannel.postMessage(payload);
      } catch (e) {
        logger.debug('[DND Sheet P2P] BroadcastChannel postMessage failed:', e);
      }
    }

    // 3. Direct window.opener (окно приложения, открывшее эту вкладку)
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, SAME_ORIGIN);
      } catch (e) {
        logger.debug('[DND Sheet P2P] Failed to postMessage to opener:', e);
      }
    }

    // 4. Direct window.parent (только внутри OBR-фрейма)
    if (isOwlbear() && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, getOwlbearParentOrigin());
      } catch (e) {
        logger.debug('[DND Sheet P2P] Failed to postMessage to parent:', e);
      }
    }

    // 5. Registered child windows — всегда наш собственный origin
    this.childWindows.forEach((win) => {
      if (win && !win.closed) {
        try {
          win.postMessage(payload, SAME_ORIGIN);
        } catch (e) {
          logger.debug('[DND Sheet P2P] Failed to postMessage to child window:', e);
        }
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

  public subscribe(callback: (data: Record<string, unknown>) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public notifyListeners(data: Record<string, unknown>): void {
    const senderId = (data.senderClientId || data.senderId) as string | undefined;
    if (senderId && senderId === SESSION_CLIENT_ID) {
      return;
    }

    // Универсальный дедуп: BroadcastChannel + postMessage могут доставить
    // одно и то же сообщение дважды (веер каналов).
    if (data.msgId) {
      const key = `p2p-${data.msgId}`;
      const now = Date.now();
      if (this.dedupTimes.get(key) && now - this.dedupTimes.get(key)! < 10000) {
        return;
      }
      this.dedupTimes.set(key, now);
      if (this.dedupTimes.size > 200) {
        for (const [k, t] of this.dedupTimes.entries()) {
          if (now - t > 10000) this.dedupTimes.delete(k);
        }
      }
    }

    if (data.type === P2pMessageType.ROOM_ANNOUNCE && typeof data.roomId === 'string') {
      this.currentRoomId = data.roomId;
      if (typeof data.roomName === 'string') this.currentRoomName = data.roomName;
    }

    if (data.type === P2pMessageType.SET_ACTIVE_BOARD_CHAR && typeof data.activeCharacterId === 'string') {
      this.activeBoardCharacterId = data.activeCharacterId;
    }

    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {}
    });
  }

  public disconnect(): void {
    this.childWindows.clear();
    this.currentRoomId = null;
  }
}

export const p2pRoomBridge = new P2PRoomBridgeService();
