import DOMPurify from 'dompurify';

/**
 * Профиль санитизации HTML для rich-text редакторов (Notes, Items, Spells, Features).
 * Разрешает безопасные текстовые теги, ссылки, списки, таблицы и data: URI для изображений (base64).
 * Запрещает скрипты, iframe, svg, внешние небезопасные протоколы и любые on* обработчики событий.
 */
export const RICH_TEXT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    // Текстовое и типографическое форматирование
    'b',
    'i',
    'u',
    's',
    'strong',
    'em',
    'mark',
    'strike',
    'del',
    'sub',
    'sup',
    'code',
    'pre',
    'blockquote',
    // Заголовки
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    // Структурные теги
    'p',
    'div',
    'span',
    'br',
    'hr',
    // Списки
    'ul',
    'ol',
    'li',
    // Ссылки и изображения
    'a',
    'img',
    // Таблицы
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'colgroup',
    'col',
  ],
  ALLOWED_ATTR: [
    'class',
    'style',
    'href',
    'target',
    'rel',
    'src',
    'alt',
    'title',
    'width',
    'height',
    'loading',
    'colspan',
    'rowspan',
    'align',
    'valign',
  ],
  // Разрешаем data: URI только для изображений (в листах D&D используются base64-аватары и схемы)
  ADD_DATA_URI_TAGS: ['img'],
};

/**
 * Получает рабочий экземпляр DOMPurify независимо от окружения (браузер, jsdom или SSR).
 */
const getPurifier = () => {
  if (typeof DOMPurify.sanitize === 'function') {
    return DOMPurify;
  }
  if (typeof window !== 'undefined') {
    return DOMPurify(window);
  }
  return DOMPurify;
};

/**
 * Очищает HTML-содержимое перед вставкой в contentEditable или рендером.
 * Предотвращает XSS (включая хранимый XSS через sync и вставку), сохраняя легитимную разметку.
 *
 * @param input Исходная строка с HTML-разметкой или неизвестное значение
 * @returns Очищенная HTML-строка. Пустая строка возвращает пустую строку; null/undefined/не-строка возвращают ''.
 */
export function sanitizeEditorContent(input: unknown): string {
  if (typeof input !== 'string' || input === '') {
    return '';
  }

  const purifier = getPurifier();
  if (typeof purifier.sanitize === 'function') {
    return purifier.sanitize(input, RICH_TEXT_SANITIZE_CONFIG);
  }

  return '';
}
