import { SESSION_CLIENT_ID } from './bridgeService';

type WebRtcMessageHandler = (data: any) => void;

/**
 * Production-Grade WebRTC Direct DataChannel Engine
 * Служит дополнительным скоростным каналом передачи при прямом согласовании окон.
 */
class WebRtcP2pEngineService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private listeners: Set<WebRtcMessageHandler> = new Set();
  private currentRoomId: string | null = null;

  // Standard public Google STUN servers for zero-cost NAT traversal
  private readonly rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  public initPeer(roomId: string, isInitiator: boolean): void {
    if (!roomId || typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') return;
    this.currentRoomId = roomId;

    this.cleanupPeer();

    try {
      const pc = new RTCPeerConnection(this.rtcConfig);

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC P2P Engine] Connection state changed: ${pc.connectionState}`);
      };

      if (isInitiator) {
        const dc = pc.createDataChannel('dnd-sheet-p2p-channel', {
          ordered: true
        });
        this.setupDataChannel(dc);
      } else {
        pc.ondatachannel = (event) => {
          this.setupDataChannel(event.channel);
        };
      }

      this.peerConnection = pc;
    } catch (err) {
      console.warn('[WebRTC P2P Engine] Failed to initialize RTCPeerConnection:', err);
    }
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;

    dc.onopen = () => {
      console.log('[WebRTC P2P Engine] Direct WebRTC DataChannel OPEN!');
    };

    dc.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && typeof parsed === 'object' && parsed.senderClientId !== SESSION_CLIENT_ID) {
          this.notifyListeners(parsed);
        }
      } catch (e) {}
    };

    dc.onclose = () => {
      this.dataChannel = null;
    };
  }

  public send(payload: any): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify({
          ...payload,
          senderClientId: SESSION_CLIENT_ID,
          sentAt: Date.now()
        }));
        return true;
      } catch (e) {}
    }
    return false;
  }

  public subscribe(handler: WebRtcMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private notifyListeners(data: any): void {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (e) {}
    });
  }

  public isConnected(): boolean {
    return !!(this.dataChannel && this.dataChannel.readyState === 'open');
  }

  public cleanupPeer(): void {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (e) {}
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }
  }
}

export const webrtcP2pEngine = new WebRtcP2pEngineService();
