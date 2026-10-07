/**
 * Резолвер роли пользователя в комнате.
 *
 * Заменяет легаси-механизм `(window as any).__userRole`, который НИКОГДА нигде
 * не записывался (баг #2 аудита): из-за этого ГМ всегда считался игроком в
 * broadcastCharacterSync и обработчике REQUEST_FULL_CHARACTERS, и его собственные
 * листы не синхронизировались в комнату без ручного toggle.
 */
import { logger } from '../utils/logger';
import OBR from '@owlbear-rodeo/sdk';
import { isOwlbear } from '../utils/environment';

export type UserRole = 'GM' | 'PLAYER';

let cachedRole: UserRole = 'PLAYER';
let listenerAttached = false;
const listeners = new Set<(role: UserRole) => void>();

const applyRole = (role: UserRole): boolean => {
  if (cachedRole === role) return false;
  cachedRole = role;
  listeners.forEach((cb) => {
    try {
      cb(role);
    } catch (err) {
      logger.warn('[RoleService] Listener failed:', err);
    }
  });
  return true;
};

/** Асинхронно определяет и кэширует текущую роль. Дешёвая операция после первого вызова. */
export async function resolveRole(): Promise<UserRole> {
  if (!isOwlbear() || typeof OBR === 'undefined') {
    // Standalone-режим: роль приходит в URL при открытии окна из Owlbear.
    try {
      const urlRole = new URLSearchParams(window.location.search).get('userRole');
      applyRole(urlRole === 'GM' ? 'GM' : 'PLAYER');
    } catch {
      /* остаётся предыдущее значение */
    }
    attachPlayerListener();
    return cachedRole;
  }

  try {
    const role = await OBR.player.getRole();
    applyRole(role === 'GM' ? 'GM' : 'PLAYER');
  } catch (err) {
    logger.warn('[RoleService] Не удалось получить роль OBR.player:', err);
  }
  attachPlayerListener();
  return cachedRole;
}

/** Синхронное чтение последнего закэшированного значения (для горячих путей). */
export function getCachedRole(): UserRole {
  return cachedRole;
}

export function subscribeRole(cb: (role: UserRole) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export interface TrustedSenderIdentity {
  /** Доверенный ID игрока из состояния комнаты OBR */
  playerId: string;
  /** Доверенная роль игрока (GM или PLAYER) из OBR room/party */
  role: UserRole;
  /** Имя игрока из OBR (если доступно) */
  name?: string;
  /** Идентификатор соединения OBR */
  connectionId?: string;
  /** Признак доверенности (true если идентичность подтверждена OBR party/player) */
  isTrusted: boolean;
}

/**
 * Определяет доверенную идентичность отправителя сетевого сообщения через OBR room state.
 *
 * OBR при доставке broadcast-сообщения заполняет event.connectionId на уровне сетевого слоя.
 * Содержимое payload (включая senderPlayerId) самоаттестовано отправителем и не защищено от спуффинга.
 * Эта функция сопоставляет connectionId со списком игроков комнаты OBR.party.getPlayers()
 * для получения реального playerId и роли (GM vs PLAYER).
 */
export async function resolveSenderIdentity(
  connectionId?: string,
  fallbackSenderPlayerId?: string,
): Promise<TrustedSenderIdentity> {
  if (!isOwlbear() || typeof OBR === 'undefined') {
    return {
      playerId: fallbackSenderPlayerId || '',
      role: 'PLAYER',
      isTrusted: false,
    };
  }

  // 1. Если connectionId предоставлен OBR — ищем в party
  if (connectionId) {
    try {
      if (typeof OBR.party?.getPlayers === 'function') {
        const players = await OBR.party.getPlayers();
        if (Array.isArray(players)) {
          const found = players.find(
            (p) => p && (p.connectionId === connectionId || p.id === connectionId),
          );
          if (found) {
            return {
              playerId: found.id,
              role: found.role === 'GM' ? 'GM' : 'PLAYER',
              name: found.name,
              connectionId,
              isTrusted: true,
            };
          }
        }
      }
    } catch (err) {
      logger.warn('[RoleService] Ошибка вызова OBR.party.getPlayers:', err);
    }

    // Проверяем локального игрока (если сообщение от себя/локальный echo)
    try {
      const myConnId =
        typeof OBR.player?.getConnectionId === 'function'
          ? await OBR.player.getConnectionId()
          : undefined;
      if (myConnId === connectionId || OBR.player?.id === connectionId) {
        const myRole =
          typeof OBR.player?.getRole === 'function'
            ? await OBR.player.getRole()
            : getCachedRole();
        const myName =
          typeof OBR.player?.getName === 'function'
            ? await OBR.player.getName()
            : undefined;
        return {
          playerId: OBR.player?.id || '',
          role: myRole === 'GM' ? 'GM' : 'PLAYER',
          name: myName,
          connectionId,
          isTrusted: true,
        };
      }
    } catch {}

    // connectionId был передан, но участник не найден в комнате — недоверенный источник
    return {
      playerId: fallbackSenderPlayerId || '',
      role: 'PLAYER',
      connectionId,
      isTrusted: false,
    };
  }

  // 2. connectionId не передан (fallback для моков/локальных тестов)
  return {
    playerId: fallbackSenderPlayerId || '',
    role: 'PLAYER',
    isTrusted: false,
  };
}

function attachPlayerListener(): void {
  if (listenerAttached || !isOwlbear() || typeof OBR === 'undefined') return;
  try {
    if (!OBR.isReady) {
      OBR.onReady(() => attachPlayerListener());
      return;
    }
    listenerAttached = true;
    OBR.player.onChange((player) => {
      if (player && (player.role === 'GM' || player.role === 'PLAYER')) {
        applyRole(player.role);
      }
    });
  } catch {
    /* onChange недоступен — роль обновляется через resolveRole() */
  }
}
