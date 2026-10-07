/**
 * Чистые функции авторизации сетевых операций над персонажами.
 *
 * Закрывают дыры аудита (#7): пустой senderPlayerId проходил проверку отправителя,
 * «ничейные» персонажи изменялись/удалялись кем угодно, а путь удаления через
 * локальный мост вообще не проверял права (в отличие от P2P-пути).
 *
 * Все функции чистые и синхронные — покрываются юнит-тестами без React/OBR.
 */

export interface AuthorizationContext {
  /** ownerId персонажа, уже хранящегося у получателя (может отсутствовать). */
  targetOwnerId?: string;
  /** ownerId внутри входящих данных (fallback, если локальной копии нет). */
  incomingOwnerId?: string;
  /** ID игрока-отправителя сообщения (доверенный идентификатор). */
  senderPlayerId: string;
  /** Роль отправителя: ГМ имеет право административных действий над любыми листами. */
  senderIsGM?: boolean;
  /** Роль получателя. */
  recipientIsGM: boolean;
  /** ID получателя. */
  recipientPlayerId: string;
  /** Имя получателя (легаси-fallback сопоставления владельца). */
  recipientPlayerName?: string;
  /** Имя владельца из входящих данных (легаси-fallback). */
  incomingOwnerName?: string;
}

const isRecipientOwner = (ctx: AuthorizationContext, ownerId: string | undefined): boolean => {
  if (!ownerId) return true; // ничейный персонаж — может быть усыновлён любым клиентом
  if (!ctx.recipientPlayerId) return true;
  if (ownerId === ctx.recipientPlayerId) return true;
  return !!ctx.recipientPlayerName && ctx.incomingOwnerName === ctx.recipientPlayerName;
};

/**
 * Проверка права на удаление персонажа удалённой командой DELETE_CHARACTER_SYNC.
 *
 * Правила:
 *  - Доверенный ГМ-отправитель может удалять любой персонаж (административное право);
 *  - Если персонаж нигде не имеет владельца — удаление разрешено (зачистка мусора);
 *  - Пустой senderPlayerId НЕ проходит проверку (дыра #7a аудита);
 *  - Если отправитель не является владельцем и не ГМ — удаление запрещено (фикс P1-6).
 *    Роль получателя (recipientIsGM) НЕ даёт чужому игроку права удалять чужой лист!
 *  - Отправитель-владелец: получатель применяет удаление, если он ГМ (удаляет лист игрока со стола)
 *    или является этим же владельцем (удаление на соседних вкладках).
 */
export function isAuthorizedDelete(ctx: AuthorizationContext): boolean {
  // 1. Доверенный ГМ-отправитель: право на удаление любого персонажа
  if (ctx.senderIsGM) return true;

  const owner = ctx.targetOwnerId ?? ctx.incomingOwnerId;
  // 2. Ничейный персонаж — удаление разрешено любому (зачистка мусора)
  if (!owner) return true;

  // 3. Если отправитель явно не ГМ: проверяем совпадение с владельцем.
  // Защита от P1-6: чужой игрок не может удалять чужой лист, даже если получатель — ГМ!
  if (ctx.senderIsGM === false) {
    if (!ctx.senderPlayerId || ctx.senderPlayerId !== owner) return false;
    return ctx.recipientIsGM || isRecipientOwner(ctx, owner);
  }

  // Если senderPlayerId указан, но не совпадает с владельцем — запрещено
  if (ctx.senderPlayerId && ctx.senderPlayerId !== owner) {
    return false;
  }

  // Легаси / локальный вызов на стороне ГМ без указания senderIsGM
  if (ctx.recipientIsGM) return true;

  if (!ctx.senderPlayerId) return false;
  return isRecipientOwner(ctx, owner);
}

/**
 * Проверка права на применение входящего обновления персонажа.
 *
 * Правила:
 *  - Доверенный ГМ-отправитель может обновлять любые листы;
 *  - Если у персонажа есть владелец, отправитель обязан быть подтверждённым владельцем
 *    (а senderPlayerId обязан быть непустым).
 *    Роль получателя-ГМ НЕ даёт чужому игроку права перезаписать чужой лист (фикс P1-Sec-3);
 *  - Ничейные персонажи могут транслироваться любым клиентом (усыновление);
 *  - Получатель-ГМ принимает обновления всех легитимных персонажей;
 *  - Получатель-игрок принимает только СВОИ листы (или ничейные для усыновления).
 */
export function isAuthorizedUpdate(ctx: AuthorizationContext): boolean {
  // 1. Доверенный ГМ-отправитель: право обновлять любые листы
  if (ctx.senderIsGM) return true;

  const owner = ctx.targetOwnerId ?? ctx.incomingOwnerId;

  // 2. Проверка отправителя:
  // Если у персонажа есть владелец, посторонний игрок не может обновить его лист,
  // даже если получатель — ГМ (фикс P1-Sec-3)
  if (owner) {
    if (ctx.senderIsGM === false) {
      if (!ctx.senderPlayerId || ctx.senderPlayerId !== owner) return false;
    } else if (ctx.senderPlayerId && ctx.senderPlayerId !== owner) {
      return false;
    } else if (!ctx.senderPlayerId && !ctx.recipientIsGM) {
      return false;
    }
  }

  // 3. Проверка получателя:
  // ГМ принимает всё от легитимных отправителей; игрок — только свои листы
  if (ctx.recipientIsGM) return true;
  return isRecipientOwner(ctx, owner);
}
