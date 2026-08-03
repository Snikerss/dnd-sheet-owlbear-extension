import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localBridge, SESSION_CLIENT_ID } from './bridgeService';

describe('LocalBridgeService', () => {
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
});
