/**
 * Единая точка прав доступа к персонажу (план аудита 3.4).
 *
 * Раньше формула «кто владелец / кто может удалить / кому можно править»
 * дублировалась в трёх местах с расхождениями в фолбэках: App.checkIsReadOnly,
 * handleDeleteCharacter (App) и CharacterCard.canDelete. Все три потребителя
 * теперь читают одну чистую функцию.
 *
 * ВАЖНО: политика по плану 3.4 (финальная):
 *  - ГМ открывает ЧУЖИЕ листы в read-only; СВОИ (ownerId === userId) — правит;
 *  - ничейные листы для ГМ тоже только просмотр;
 *  - пустой userId у игрока делает его «менеджером» любого листа
 *    (легаси-фолбэк старой карточки: !currentUserId → canDelete);
 *  - ничейные листы игроков редактируемы и управляемы всеми;
 *  - владение по имени — легаси-fallback после playerId.
 */
import type { Character } from '../types';

export interface PermissionActor {
  /** Роль текущего пользователя; null = ещё не определена (standalone без URL-роли). */
  role: 'GM' | 'PLAYER' | null;
  userId?: string | null;
  userName?: string | null;
}

export interface CharacterPermissions {
  /** true — лист открыт только для просмотра (формула App.checkIsReadOnly). */
  isReadOnly: boolean;
  /** true — можно применять действия (редактирование/undo/redo). */
  canEdit: boolean;
  /** true — формула canDelete/isOwner из CharacterCard и handleDeleteCharacter. */
  canManage: boolean;
}

const matchesOwnership = (
  character: Character,
  actor: PermissionActor,
): boolean =>
  (!!actor.userId && character.ownerId === actor.userId) ||
  (!!actor.userName && character.ownerName === actor.userName);

/** Чистое вычисление прав для пары «персонаж × пользователь». */
export const computePermissions = (
  character: Character | null | undefined,
  actor: PermissionActor,
): CharacterPermissions => {
  if (!character) {
    return { isReadOnly: false, canEdit: true, canManage: false };
  }

  // Формула App.checkIsReadOnly с изменением плана 3.4:
  // ГМ правит СВОИ листы, чужие и ничейные — только просмотр.
  const isReadOnly = actor.role === 'GM'
    ? !character.ownerId || !matchesOwnership(character, actor)
    : !character.ownerId
      ? false
      : !matchesOwnership(character, actor);

  // Формула CharacterCard.canDelete / delete-isOwner (бит-в-бит):
  const canManage =
    actor.role === 'GM' ||
    !character.ownerId ||
    !actor.userId ||
    character.ownerId === actor.userId ||
    (!!actor.userName && character.ownerName === actor.userName);

  return { isReadOnly, canEdit: !isReadOnly, canManage };
};

/**
 * Хук-обёртка для React-компонентов, у которых актёр приходит из состояния
 * приложения. Чистая функция остаётся единственным источником логики.
 */
export const usePermissions = (
  character: Character | null | undefined,
  actor: PermissionActor,
): CharacterPermissions => computePermissions(character, actor);
