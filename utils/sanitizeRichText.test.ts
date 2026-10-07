// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeEditorContent } from './sanitizeRichText';

describe('sanitizeEditorContent', () => {
  describe('нейтрализация XSS-векторов', () => {
    it('обезвреживает <img/onerror=alert(1)> без пробела', () => {
      const malicious = '<img/onerror=alert(1)>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
      expect(result).toBe('<img>');
    });

    it('обезвреживает <img src=x onerror=alert(1)>', () => {
      const malicious = '<img src=x onerror=alert(1)>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
      expect(result).toContain('src="x"');
    });

    it('обезвреживает <a href="javascript:alert(1)">', () => {
      const malicious = '<a href="javascript:alert(1)">клик</a>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('javascript');
      expect(result).not.toContain('alert');
      expect(result).toBe('<a>клик</a>');
    });

    it('обезвреживает HTML-сущности в javascript URL: <a href="javascript&#58;alert(1)">', () => {
      const malicious = '<a href="javascript&#58;alert(1)">клик</a>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('javascript');
      expect(result).not.toContain('alert');
      expect(result).toBe('<a>клик</a>');
    });

    it('полностью удаляет теги <script>alert(1)</script>', () => {
      const malicious = '<script>alert(1)</script>';
      const result = sanitizeEditorContent(malicious);
      expect(result).toBe('');
    });

    it('удаляет теги SVG с onload: <svg onload=alert(1)>', () => {
      const malicious = '<svg onload=alert(1)>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('svg');
      expect(result).not.toContain('onload');
      expect(result).not.toContain('alert');
      expect(result).toBe('');
    });

    it('удаляет <iframe> элементы', () => {
      const malicious = '<iframe src="https://evil.example.com"></iframe>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('iframe');
      expect(result).toBe('');
    });

    it('вырезает любые on* атрибуты (onclick, onmouseover, onload, onfocus и т.д.)', () => {
      const malicious = '<span onclick="evil()" onmouseover="evil()" onfocus="evil()">Текст</span>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('onfocus');
      expect(result).not.toContain('evil');
      expect(result).toBe('<span>Текст</span>');
    });

    it('блокирует data: URIs в ссылках (разрешены только для img)', () => {
      const malicious = '<a href="data:text/html,<script>alert(1)</script>">Опасная ссылка</a>';
      const result = sanitizeEditorContent(malicious);
      expect(result).not.toContain('data:text/html');
      expect(result).not.toContain('script');
      expect(result).toBe('<a>Опасная ссылка</a>');
    });
  });

  describe('сохранение легитимной разметки D&D листов', () => {
    it('сохраняет базовое текстовое форматирование: b, i, u, strong, em, s', () => {
      const valid = '<b>Жирный</b> <i>Курсив</i> <u>Подчеркнутый</u> <strong>Strong</strong> <em>Em</em> <s>Зачеркнутый</s>';
      const result = sanitizeEditorContent(valid);
      expect(result).toBe(valid);
    });

    it('сохраняет параграфы, блоки div и переносы строк br', () => {
      const valid = '<div><p>Параграф 1</p><br><p>Параграф 2</p></div>';
      const result = sanitizeEditorContent(valid);
      expect(result).toBe(valid);
    });

    it('сохраняет span с class и style', () => {
      const valid = '<span class="text-red-500 font-bold" style="color: #ef4444;">Урон 2d6</span>';
      const result = sanitizeEditorContent(valid);
      expect(result).toContain('class="text-red-500 font-bold"');
      expect(result).toContain('style="color: #ef4444;"');
      expect(result).toContain('Урон 2d6');
    });

    it('сохраняет списки: ul, ol, li', () => {
      const valid = '<ul><li>Зелье лечения</li><li>Факел</li></ul><ol><li>Шаг 1</li><li>Шаг 2</li></ol>';
      const result = sanitizeEditorContent(valid);
      expect(result).toBe(valid);
    });

    it('сохраняет легитимные внешние ссылки a[href="https://..."]', () => {
      const valid = '<a href="https://dnd.su/spells/123" target="_blank" rel="noopener noreferrer">Заклинание</a>';
      const result = sanitizeEditorContent(valid);
      expect(result).toContain('href="https://dnd.su/spells/123"');
      expect(result).toContain('Заклинание');
    });

    it('ОБЯЗАТЕЛЬНО сохраняет img с data:image base64', () => {
      const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const valid = `<img src="${base64Data}" alt="Карта подземелья" width="100" height="100">`;
      const result = sanitizeEditorContent(valid);
      expect(result).toContain(`src="${base64Data}"`);
      expect(result).toContain('alt="Карта подземелья"');
      expect(result).toContain('width="100"');
      expect(result).toContain('height="100"');
    });

    it('сохраняет таблицы: table, thead, tbody, tr, th, td', () => {
      const tableHtml = '<table><thead><tr><th>Название</th><th>Урон</th></tr></thead><tbody><tr><td>Кинжал</td><td>1d4</td></tr></tbody></table>';
      const result = sanitizeEditorContent(tableHtml);
      expect(result).toBe(tableHtml);
    });
  });

  describe('граничные значения: пустой ввод, не-строки, null, undefined', () => {
    it('возвращает пустую строку при пустой строке', () => {
      expect(sanitizeEditorContent('')).toBe('');
    });

    it('возвращает пустую строку при null', () => {
      expect(sanitizeEditorContent(null)).toBe('');
    });

    it('возвращает пустую строку при undefined', () => {
      expect(sanitizeEditorContent(undefined)).toBe('');
    });

    it('возвращает пустую строку при не-строковых типах данных', () => {
      expect(sanitizeEditorContent(12345)).toBe('');
      expect(sanitizeEditorContent(true)).toBe('');
      expect(sanitizeEditorContent({ content: 'test' })).toBe('');
      expect(sanitizeEditorContent(['<b>arr</b>'])).toBe('');
    });
  });

  describe('Roundtrip-проверка реалистичной заметки персонажа', () => {
    it('сохраняет сложную заметку с описанием, списками, картинкой и форматированием', () => {
      const complexNote = [
        '<h3>Логово красного дракона</h3>',
        '<p>Найдено в горах <b>Меча</b>. Особые приметы:</p>',
        '<ul>',
        '<li>Чешуя светится <span style="color: #ef4444;">багровым</span> пламенем</li>',
        '<li>Спит на куче золота (<mark style="background: #fef08a;">10,000 gp</mark>)</li>',
        '</ul>',
        '<img src="data:image/png;base64,AAA" alt="Вход в пещеру">',
        '<p>Подробнее в <a href="https://example.com/lore">летописи</a>.</p>'
      ].join('');

      const sanitized = sanitizeEditorContent(complexNote);

      expect(sanitized).toContain('<h3>Логово красного дракона</h3>');
      expect(sanitized).toContain('<b>Меча</b>');
      expect(sanitized).toContain('<ul>');
      expect(sanitized).toContain('<li>Чешуя светится');
      expect(sanitized).toContain('src="data:image/png;base64,AAA"');
      expect(sanitized).toContain('href="https://example.com/lore"');
    });
  });
});
