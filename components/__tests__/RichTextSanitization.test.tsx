// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RichTextDescriptionEditor, FormattedText } from '../RichTextFormatting';

afterEach(() => {
  cleanup();
});

describe('RichTextDescriptionEditor XSS-санитизация', () => {
  it('обезвреживает <img/onerror=alert(1)> при установке в contentEditable innerHTML', () => {
    const handleChange = vi.fn();
    const malicious = '<img/onerror=alert(1)>';

    const { container } = render(
      <RichTextDescriptionEditor value={malicious} onChange={handleChange} />
    );

    const editable = container.querySelector('[contenteditable="true"]');
    expect(editable).not.toBeNull();
    expect(editable?.innerHTML).not.toContain('onerror');
    expect(editable?.innerHTML).not.toContain('alert');
    expect(editable?.innerHTML).toBe('<img>');
  });

  it('вырезает теги <script> при установке в contentEditable', () => {
    const handleChange = vi.fn();
    const malicious = '<p>Текст</p><script>alert("xss")</script>';

    const { container } = render(
      <RichTextDescriptionEditor value={malicious} onChange={handleChange} />
    );

    const editable = container.querySelector('[contenteditable="true"]');
    expect(editable?.innerHTML).not.toContain('<script');
    expect(editable?.innerHTML).not.toContain('alert');
    expect(editable?.innerHTML).toContain('<p>Текст</p>');
  });

  it('сохраняет легитимное форматирование и data: base64 изображения', () => {
    const handleChange = vi.fn();
    const valid = '<b>Жирный текст</b><p>Параграф</p><img src="data:image/png;base64,AAA" alt="Тест">';

    const { container } = render(
      <RichTextDescriptionEditor value={valid} onChange={handleChange} />
    );

    const editable = container.querySelector('[contenteditable="true"]');
    expect(editable?.innerHTML).toContain('<b>Жирный текст</b>');
    expect(editable?.innerHTML).toContain('<p>Параграф</p>');
    expect(editable?.innerHTML).toContain('src="data:image/png;base64,AAA"');
  });
});

describe('FormattedText XSS-санитизация', () => {
  it('обезвреживает javascript: ссылки в FormattedText', () => {
    const malicious = '<a href="javascript:alert(1)">Нажми меня</a>';

    const { container } = render(<FormattedText content={malicious} />);

    expect(container.innerHTML).not.toContain('javascript');
    expect(container.innerHTML).not.toContain('alert');
    expect(container.textContent).toContain('Нажми меня');
  });

  it('сохраняет data: base64 изображения и списки в FormattedText', () => {
    const valid = '<ul><li>Пункт 1</li></ul><img src="data:image/png;base64,AAA" alt="Иконка">';

    const { container } = render(<FormattedText content={valid} />);

    expect(container.innerHTML).toContain('<ul><li>Пункт 1</li></ul>');
    expect(container.innerHTML).toContain('src="data:image/png;base64,AAA"');
    expect(container.innerHTML).toContain('alt="Иконка"');
  });
});
