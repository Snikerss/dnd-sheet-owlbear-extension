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
