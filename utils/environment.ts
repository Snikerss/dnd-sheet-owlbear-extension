/**
 * Единая точка определения окружения выполнения.
 * Вынесено из utils/storage, чтобы избежать циклических импортов
 * (roleService/auth-модули не должны тянуть весь storage).
 */
import OBR from '@owlbear-rodeo/sdk';
import { OWLBEAR_ORIGIN } from '../constants';

export { OWLBEAR_ORIGIN };

export const isOwlbear = (): boolean => {
  return typeof window !== 'undefined' && window.parent !== window && typeof OBR !== 'undefined';
};

// --- Origin-политика для postMessage (аудит #4.1) ---

/** Origin самого приложения (расширение всегда живёт на одном origin). */
export const SAME_ORIGIN: string = typeof window !== 'undefined' ? window.location.origin : '';

/**
 * Origins Owlbear Rodeo: расширение исполняется в их iframe, поэтому сообщения
 * от родителя приходят с их origin. Список фиксированный — это публичные
 * домены платформы.
 */
export const OWLBEAR_ORIGINS: readonly string[] = [
  OWLBEAR_ORIGIN,
  'https://owlbear.rodeo',
];

/**
 * Определяет точный targetOrigin для безопасного postMessage в сторону window.parent.
 * Если document.referrer совпадает с одним из доверенных доменов OBR, используется он.
 * Иначе возвращается канонический OWLBEAR_ORIGIN.
 */
export const getOwlbearParentOrigin = (): string => {
  if (typeof document !== 'undefined' && document.referrer) {
    try {
      const refOrigin = new URL(document.referrer).origin;
      if (OWLBEAR_ORIGINS.includes(refOrigin)) {
        return refOrigin;
      }
    } catch {
      // Игнорируем невалидный referrer
    }
  }
  return OWLBEAR_ORIGIN;
};

/**
 * Строгий фильтр входящих window-message событий.
 *
 * - Пустой origin разрешён (sandboxed about:blank popup'ы и некоторые
 *   браузеры присылают '' даже для same-origin).
 * - Всё остальное чужое — отбрасывается ДО обработки, чтобы посторонний сайт
 *   не мог инъецировать команды в приложение через postMessage.
 */
export const isTrustedMessageOrigin = (origin: string): boolean => {
  if (!origin) return true;
  if (SAME_ORIGIN && origin === SAME_ORIGIN) return true;
  return OWLBEAR_ORIGINS.includes(origin);
};
