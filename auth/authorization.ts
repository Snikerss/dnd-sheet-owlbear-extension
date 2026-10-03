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
  /** ID игрока-отправителя сообщения. */
  senderPlayerId: string;
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
 *  - ГМ может удалять что угодно (в т.ч. свои локальные копии чужих листов);
 *  - локально хранящийся владелец подтверждён → удалять может только он сам;
 *  - пустой senderPlayerId НЕ проходит проверку (дыра #7a аудита);
 *  - если персонаж нигде не имеет владельца — удаление разрешено (зачистка мусора).
 */
export function isAuthorizedDelete(ctx: AuthorizationContext): boolean {
  if (ctx.recipientIsGM) return true;

  const owner = ctx.targetOwnerId ?? ctx.incomingOwnerId;
  if (!owner) return true;

  if (!ctx.senderPlayerId) return false;
  if (ctx.senderPlayerId !== owner) return false;

  // Отправитель — владелец. Дополнительно получатель должен быть этим же
  // владельцем или ГМ-веткой выше: чужой лист игрок удалить не может.
  return isRecipientOwner(ctx, owner);
}

/**
 * Проверка права на применение входящего обновления персонажа.
 *
 * Правила:
 *  - ГМ принимает всё;
 *  - игрок принимает только СВОИ листы (или ничейные для усыновления);
 *  - если у персонажа есть владелец, отправитель обязан быть владельцем,
 *    а senderPlayerId обязан быть непустым (дыра #7a);
 *  - ничейные персонажи могут транслироваться любым клиентом (усыновление).
 */
export function isAuthorizedUpdate(ctx: AuthorizationContext): boolean {
  if (ctx.recipientIsGM) return true;

  const owner = ctx.targetOwnerId ?? ctx.incomingOwnerId;

  // Проверка получателя: игрок принимает только свои/ничейные листы.
  if (!isRecipientOwner(ctx, owner)) return false;

  // Проверка отправителя: только владелец может пушить свой лист.
  if (owner) {
    if (!ctx.senderPlayerId) return false;
    if (ctx.senderPlayerId !== owner) return false;
  }
  return true;
}
