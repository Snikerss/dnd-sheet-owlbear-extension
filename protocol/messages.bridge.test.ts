import { describe, it, expect } from 'vitest';
import {
  BridgeMessageType,
  P2pMessageType,
  BridgeMessageEnvelopeSchema,
  parseBridgeEnvelope,
} from './messages';

describe('BridgeMessageType — контракт типов локального моста', () => {
  it('значения стабильны (снапшот-объект)', () => {
    expect(BridgeMessageType).toEqual({
      CHARACTER_SYNC: 'CHARACTER_SYNC',
      CHARACTER_ACTION: 'CHARACTER_ACTION',
      VTT_HEARTBEAT: 'VTT_HEARTBEAT',
      HEARTBEAT_PING: 'HEARTBEAT_PING',
      VTT_DISCONNECTED: 'VTT_DISCONNECTED',
      VTT_FRAME_READY: 'VTT_FRAME_READY',
      HANDSHAKE_PING: 'HANDSHAKE_PING',
      REQUEST_CHARACTER_DATA: 'REQUEST_CHARACTER_DATA',
      STORAGE_EVENT_SYNC: 'STORAGE_EVENT_SYNC',
      SELECT_CHARACTER: 'SELECT_CHARACTER',
      SHOW_NOTIFICATION: 'SHOW_NOTIFICATION',
      ROLL_DICE: 'ROLL_DICE',
      DELETE_CHARACTER_SYNC_BRIDGE: 'DELETE_CHARACTER_SYNC',
    });
  });

  it('все значения уникальны', () => {
    const values = Object.values(BridgeMessageType);
    expect(new Set(values).size).toBe(values.length);
  });

  it('ключи и значения совпадают (кроме DELETE_CHARACTER_SYNC_BRIDGE → легаси-строка wire-формата)', () => {
    for (const [key, value] of Object.entries(BridgeMessageType)) {
      if (key !== 'DELETE_CHARACTER_SYNC_BRIDGE') {
        expect(value).toBe(key);
      }
    }
    expect(BridgeMessageType.DELETE_CHARACTER_SYNC_BRIDGE).toBe('DELETE_CHARACTER_SYNC');
  });
});

describe('P2pMessageType — контракт типов P2P-комнат', () => {
  it('значения стабильны (снапшот-объект)', () => {
    expect(P2pMessageType).toEqual({
      ROOM_ANNOUNCE: 'ROOM_ANNOUNCE',
      SET_ACTIVE_BOARD_CHAR: 'SET_ACTIVE_BOARD_CHAR',
      PRESENCE_QUERY: 'PRESENCE_QUERY',
      STATE_RESPONSE: 'STATE_RESPONSE',
    });
  });

  it('все значения уникальны', () => {
    const values = Object.values(P2pMessageType);
    expect(new Set(values).size).toBe(values.length);
  });

  it('не пересекается с BridgeMessageType по значениям', () => {
    const bridgeValues: ReadonlySet<string> = new Set(Object.values(BridgeMessageType));
    for (const value of Object.values(P2pMessageType)) {
      expect(bridgeValues.has(value)).toBe(false);
    }
  });
});

describe('parseBridgeEnvelope — мусор отбрасывается', () => {
  it('null на число', () => {
    expect(parseBridgeEnvelope(42)).toBeNull();
  });

  it('null на строку', () => {
    expect(parseBridgeEnvelope('CHARACTER_SYNC')).toBeNull();
  });

  it('null на null и undefined', () => {
    expect(parseBridgeEnvelope(null)).toBeNull();
    expect(parseBridgeEnvelope(undefined)).toBeNull();
  });

  it('null на массив', () => {
    expect(parseBridgeEnvelope([{ type: 'X' }])).toBeNull();
  });

  it('null на объект без type', () => {
    expect(parseBridgeEnvelope({ senderClientId: 'a' })).toBeNull();
  });

  it('null на нестроковый type', () => {
    expect(parseBridgeEnvelope({ type: 123 })).toBeNull();
    expect(parseBridgeEnvelope({ type: null })).toBeNull();
  });
});

describe('parseBridgeEnvelope — валидный конверт распознаётся', () => {
  it('полный конверт со всеми служебными полями', () => {
    expect(
      parseBridgeEnvelope({
        type: BridgeMessageType.CHARACTER_SYNC,
        senderClientId: 'tab-1',
        msgId: 'msg-42',
      }),
    ).toEqual({ type: 'CHARACTER_SYNC', senderClientId: 'tab-1', msgId: 'msg-42' });
  });

  it('конверт только с type', () => {
    expect(parseBridgeEnvelope({ type: BridgeMessageType.VTT_HEARTBEAT })).toEqual({
      type: 'VTT_HEARTBEAT',
    });
  });

  it('senderId (альтернативное поле) проходит валидацию схемы', () => {
    const parsed = parseBridgeEnvelope({ type: 'ROLL_DICE', senderId: 'player-7' });
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('ROLL_DICE');
    expect(BridgeMessageEnvelopeSchema.safeParse({ type: 'ROLL_DICE', senderId: 'player-7' }).success).toBe(true);
  });

  it('глубокие поля не валидируются схемой (остаются заботой потребителей)', () => {
    const raw = {
      type: BridgeMessageType.CHARACTER_SYNC,
      charId: 'char-1',
      entry: { character: { name: 'Гримм' } },
    };
    expect(parseBridgeEnvelope(raw)).toEqual({ type: 'CHARACTER_SYNC' });
  });
});
