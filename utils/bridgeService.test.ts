// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localBridge, SESSION_CLIENT_ID } from './bridgeService';
import { p2pRoomBridge } from './p2pBridge';

describe('LocalBridgeService & Native Window Target Resolution', () => {
  let mockWin: any;

  beforeEach(() => {
    mockWin = {
      closed: false,
      postMessage: vi.fn(),
      location: { href: 'https://snikerss.github.io/dnd-sheet-owlbear-extension/?charId=test-1' }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has a valid SESSION_CLIENT_ID defined for window sessions', () => {
    expect(SESSION_CLIENT_ID).toBeDefined();
    expect(typeof SESSION_CLIENT_ID).toBe('string');
  });

  it('correctly identifies duplicate messages within the deduplication window', () => {
    const msgKey = 'test-action-123';
    expect(localBridge.isDuplicateMessage(msgKey, 1000)).toBe(false);
    expect(localBridge.isDuplicateMessage(msgKey, 1000)).toBe(true);
  });

  it('allows message processing after deduplication window expires', async () => {
    const msgKey = 'test-action-456';
    expect(localBridge.isDuplicateMessage(msgKey, 10)).toBe(false);
    await new Promise(r => setTimeout(r, 20));
    expect(localBridge.isDuplicateMessage(msgKey, 10)).toBe(false);
  });

  it('subscribes to and unsubscribes from bridge message events', () => {
    const handler = vi.fn();
    const unsubscribe = localBridge.subscribe(handler);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('registers child windows and broadcasts postMessage to registered targets', () => {
    localBridge.registerChildWindow(mockWin as unknown as Window);
    localBridge.postMessage({ type: 'HANDSHAKE_PING', charId: 'char-101' });

    expect(mockWin.postMessage).toHaveBeenCalled();
    const [payload] = mockWin.postMessage.mock.calls[0];
    expect(payload.type).toBe('HANDSHAKE_PING');
    expect(payload.charId).toBe('char-101');
    expect(payload.senderClientId).toBe(SESSION_CLIENT_ID);
  });

  it('reconnects standalone windows using targetName window.open lookups', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation((url, name) => {
      if (name === 'dnd_sheet_standalone_char-777') {
        return mockWin as unknown as Window;
      }
      return null;
    });

    localBridge.trackStandaloneCharacter('char-777');
    localBridge.reconnectStandaloneWindows(['char-777']);
    expect(openSpy).toHaveBeenCalledWith('', 'dnd_sheet_standalone_char-777');

    localBridge.postMessage({ type: 'VTT_FRAME_READY' });
    expect(mockWin.postMessage).toHaveBeenCalled();
  });

  it('ignores self-sent messages matching SESSION_CLIENT_ID in listener dispatch', () => {
    const handler = vi.fn();
    const unsubscribe = localBridge.subscribe(handler);

    // Trigger message event from same client session
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'CHARACTER_ACTION',
        senderClientId: SESSION_CLIENT_ID
      }
    }));

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('P2PRoomBridgeService (Native Browser Bridge)', () => {
  it('connects to room without throwing errors', () => {
    expect(() => p2pRoomBridge.connect('room-999')).not.toThrow();
  });

  it('broadcasts clean payloads stripped of heavy base64 imageCache maps', () => {
    const mockChild = {
      closed: false,
      postMessage: vi.fn()
    };

    p2pRoomBridge.registerWindow(mockChild as unknown as Window);
    p2pRoomBridge.broadcast({
      type: 'CHARACTER_SYNC',
      charId: 'char-1',
      entry: {
        name: 'Hero',
        imageCache: [['img:ref:portrait', 'data:image/png;base64,LARGE_DATA']]
      }
    });

    expect(mockChild.postMessage).toHaveBeenCalled();
    const [payload] = mockChild.postMessage.mock.calls[0];
    expect(payload.entry.imageCache).toBeUndefined();
  });
});
