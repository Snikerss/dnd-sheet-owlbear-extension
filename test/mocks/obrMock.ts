export interface ObrBroadcastMessageEvent {
  data: unknown;
}

export type ObrMessageListener = (event: ObrBroadcastMessageEvent) => void;

export interface ObrMockClient {
  broadcast: {
    sendMessage(channel: string, payload: unknown): Promise<void>;
    onMessage(channel: string, listener: ObrMessageListener): () => void;
  };
  player: {
    id: string;
    getRole(): Promise<'GM' | 'PLAYER'>;
    getName(): Promise<string>;
  };
  room: {
    id: string;
    getMetadata(): Promise<Record<string, unknown>>;
    setMetadata(metadata: Record<string, unknown>): Promise<void>;
  };
  isReady: true;
  onReady(callback: () => void): void;
}

export interface CreateObrRoomMockOptions {
  failTimes?: Map<number, number>;
}

const CLIENT_COUNT = 2;
const CLIENT_ROLES: ReadonlyArray<'GM' | 'PLAYER'> = ['GM', 'PLAYER'];

export function createObrRoomMock(opts?: CreateObrRoomMockOptions): ObrMockClient[] {
  const failTimes = opts?.failTimes ?? new Map<number, number>();
  const registries: Array<Map<string, Set<ObrMessageListener>>> = [];

  const registryOf = (clientIndex: number): Map<string, Set<ObrMessageListener>> => {
    const existing = registries[clientIndex];
    if (existing) return existing;
    const created = new Map<string, Set<ObrMessageListener>>();
    registries[clientIndex] = created;
    return created;
  };

  const deliverToOthers = (fromIndex: number, channel: string, payload: unknown): void => {
    for (let targetIndex = 0; targetIndex < CLIENT_COUNT; targetIndex++) {
      if (targetIndex === fromIndex) continue;
      setTimeout(() => {
        const listeners = registryOf(targetIndex).get(channel);
        if (!listeners) return;
        for (const listener of Array.from(listeners)) {
          try {
            listener({ data: payload });
          } catch {}
        }
      }, 0);
    }
  };

  const makeSendMessage =
    (clientIndex: number) =>
    async (channel: string, payload: unknown): Promise<void> => {
      const remaining = failTimes.get(clientIndex) ?? 0;
      if (remaining > 0) {
        failTimes.set(clientIndex, remaining - 1);
        throw new Error('RateLimitHit');
      }
      deliverToOthers(clientIndex, channel, payload);
    };

  const makeOnMessage =
    (clientIndex: number) =>
    (channel: string, listener: ObrMessageListener): (() => void) => {
      const registry = registryOf(clientIndex);
      const listeners = registry.get(channel) ?? new Set<ObrMessageListener>();
      registry.set(channel, listeners);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

  const clients: ObrMockClient[] = [];
  for (let index = 0; index < CLIENT_COUNT; index++) {
    clients.push({
      broadcast: {
        sendMessage: makeSendMessage(index),
        onMessage: makeOnMessage(index),
      },
      player: {
        id: `player-${index}`,
        getRole: async () => CLIENT_ROLES[index] ?? 'PLAYER',
        getName: async () => `Player ${index}`,
      },
      room: {
        id: 'room-mock',
        getMetadata: async () => ({}),
        setMetadata: async () => {},
      },
      isReady: true,
      onReady: (callback: () => void): void => {
        callback();
      },
    });
  }
  return clients;
}

export function flushAsync(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
