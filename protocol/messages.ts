/**
 * Единый протокол сообщений sync-канала Owlbear Rodeo.
 *
 * Все типы сообщений определяются ЗДЕСЬ — строковые литералы типов в коде
 * отправителей/приёмников запрещены (источник бага #1 аудита: рассинхрон
 * 'IMAGE_CHUNK_SYNC' на отправителе и 'CHARACTER_IMAGE_CHUNK_SYNC' на приёмнике,
 * из-за которого картинки никогда не доходили до получателей).
 *
 * Входящие сообщения валидируются zod-схемами: битые пакеты отбрасываются
 * с логом вместо тихого проникновения мусора в состояние приложения.
 */
import { logger } from '../utils/logger';
import { z } from 'zod';

// --- Типы сообщений локального моста (единственный источник истины) ---
//
// План 1.1: в коде-потребителях запрещены строковые литералы этих типов —
// только обращения через константы. Рассинхрон литералов на отправителе и
// приёмнике был источником бага #1 аудита.

/** Типы сообщений локального моста вкладок (BroadcastChannel / postMessage / storage-шина). */
export const BridgeMessageType = {
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
} as const;

export type BridgeMessageTypeName = typeof BridgeMessageType[keyof typeof BridgeMessageType];

/** Типы P2P-сообщений комнат (p2pRoomBridge). */
export const P2pMessageType = {
  ROOM_ANNOUNCE: 'ROOM_ANNOUNCE',
  SET_ACTIVE_BOARD_CHAR: 'SET_ACTIVE_BOARD_CHAR',
  PRESENCE_QUERY: 'PRESENCE_QUERY',
  STATE_RESPONSE: 'STATE_RESPONSE',
} as const;

export type P2pMessageTypeName = typeof P2pMessageType[keyof typeof P2pMessageType];

/**
 * Лёгкая zod-схема конверта локального моста: проверяет ТОЛЬКО служебные поля.
 * Глубокие полезные поля (entry/action/result) остаются unknown — их валидируют
 * потребители по месту, как раньше.
 */
export const BridgeMessageEnvelopeSchema = z.object({
  type: z.string(),
  senderClientId: z.string().optional(),
  senderId: z.string().optional(),
  msgId: z.string().optional(),
});

export interface BridgeEnvelope {
  type: string;
  senderClientId?: string;
  msgId?: string;
}

/**
 * Безопасно разбирает сырое сообщение локального моста на уровне конверта.
 * Возвращает null для мусора (не-объектов, пакетов без строкового type).
 */
export function parseBridgeEnvelope(raw: unknown): BridgeEnvelope | null {
  const result = BridgeMessageEnvelopeSchema.safeParse(raw);
  if (!result.success) return null;
  const { type, senderClientId, msgId } = result.data;
  return {
    type,
    ...(senderClientId !== undefined ? { senderClientId } : {}),
    ...(msgId !== undefined ? { msgId } : {}),
  };
}

// --- Имена каналов (единственный источник истины) ---

/** Основной канал синхронизации персонажей через OBR.broadcast. */
export const SYNC_CHANNEL = 'com.antigravity.dnd-sheet/sync';
/** Канал трансляции бросков кубов через OBR.broadcast. */
export const ROLLS_CHANNEL = 'com.antigravity.dnd-sheet/rolls';

/**
 * Типы сообщений sync-канала как константы: отправители обязаны ссылаться
 * сюда, а не на строковые литералы (критерий плана 1.1 — источник бага #1).
 */
export const SyncMessageType = {
  CHARACTER_CHUNK_SYNC: 'CHARACTER_CHUNK_SYNC',
  CHARACTER_IMAGE_CHUNK_SYNC: 'CHARACTER_IMAGE_CHUNK_SYNC',
  DELETE_CHARACTER_SYNC: 'DELETE_CHARACTER_SYNC',
  REQUEST_FULL_CHARACTERS: 'REQUEST_FULL_CHARACTERS',
} as const;
export type SyncMessageTypeName = typeof SyncMessageType[keyof typeof SyncMessageType];

// --- Общие поля конверта ---

const envelope = {
  senderClientId: z.string().default(''),
  senderPlayerId: z.string().default(''),
};

const chunkEnvelope = {
  ...envelope,
  /** Идентификатор конкретной передачи: чанки одной передачи собираются вместе. */
  syncId: z.string().default(''),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().positive(),
  chunkData: z.string(),
};

// --- Сообщения sync-канала ---

/** Часть полезной нагрузки листа персонажа (лист разбивается на чанки ≤20KB). */
export const CharacterChunkSyncSchema = z.object({
  type: z.literal('CHARACTER_CHUNK_SYNC'),
  id: z.string().min(1),
  ...envelope,
  syncId: z.string().default(''),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().positive(),
  chunkData: z.string(),
});

/**
 * Часть base64-изображения (портрет или картинка предмета).
 * ВНИМАНИЕ: раньше отправитель слал 'IMAGE_CHUNK_SYNC', а приёмник слушал
 * 'CHARACTER_IMAGE_CHUNK_SYNC' — картинки терялись всегда.
 */
export const CharacterImageChunkSyncSchema = z.object({
  type: z.literal('CHARACTER_IMAGE_CHUNK_SYNC'),
  id: z.string().min(1),
  imgId: z.string().min(1),
  isPortrait: z.boolean(),
  ...chunkEnvelope,
});

/** Команда удаления персонажа (игрок выключает трансляцию / удаляет листа). */
export const DeleteCharacterSyncSchema = z.object({
  type: z.literal('DELETE_CHARACTER_SYNC'),
  id: z.string().min(1),
  ...envelope,
});

/** Запрос полных листов (handshake при входе в комнату) с checksum-дельтой. */
export const RequestFullCharactersSchema = z.object({
  type: z.literal('REQUEST_FULL_CHARACTERS'),
  senderClientId: z.string().default(''),
  cachedVersions: z.record(z.string(), z.unknown()).default({}),
  requestedCharId: z.string().optional(),
});

export const SyncMessageSchema = z.discriminatedUnion('type', [
  CharacterChunkSyncSchema,
  CharacterImageChunkSyncSchema,
  DeleteCharacterSyncSchema,
  RequestFullCharactersSchema,
]);

export type SyncMessage = z.infer<typeof SyncMessageSchema>;
export type CharacterChunkSyncMessage = z.infer<typeof CharacterChunkSyncSchema>;
export type CharacterImageChunkSyncMessage = z.infer<typeof CharacterImageChunkSyncSchema>;
export type DeleteCharacterSyncMessage = z.infer<typeof DeleteCharacterSyncSchema>;
export type RequestFullCharactersMessage = z.infer<typeof RequestFullCharactersSchema>;

/**
 * Параметры поповера броска куба, передаваемые через query-параметры URL.
 * Все поля имеют дефолты: битые/отсутствующие параметры не роняют рендер.
 */
export const RollPopupParamsSchema = z.object({
  playerName: z.string().max(80).default('Игрок'),
  characterName: z.string().max(80).default(''),
  rollName: z.string().max(120).default('Бросок'),
  total: z.coerce.number().default(0),
  rollDetails: z.string().max(300).default(''),
});

export type RollPopupParams = z.infer<typeof RollPopupParamsSchema>;

/**
 * Безопасно разбирает сырое сообщение sync-канала.
 * Возвращает null для битых/чужих пакетов (с предупреждением в консоль).
 */
export function parseSyncMessage(raw: unknown): SyncMessage | null {
  const result = SyncMessageSchema.safeParse(raw);
  if (!result.success) {
    const type =
      raw && typeof raw === 'object' && 'type' in raw ? String((raw as { type: unknown }).type) : '<no-type>';
    logger.warn(`[Protocol] Отброшено некорректное сообщение sync-канала (type=${type}):`, result.error.message);
    return null;
  }
  return result.data;
}
