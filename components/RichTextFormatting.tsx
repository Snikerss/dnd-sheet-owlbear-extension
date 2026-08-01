import React, { useState, useEffect, useRef, useCallback } from 'react';

// Preset Palette Colors
export const TEXT_COLORS = [
  { name: 'Красный (Урон / ОЗ)', value: '#ef4444', label: '🔴' },
  { name: 'Золотой (Свет / Редкое)', value: '#f59e0b', label: '🟡' },
  { name: 'Зеленый (Природа / Яд)', value: '#10b981', label: '🟢' },
  { name: 'Синий (Магия / Холод)', value: '#3b82f6', label: '🔵' },
  { name: 'Фиолетовый (Тайное)', value: '#8b5cf6', label: '🟣' },
  { name: 'Розовый (Очарование)', value: '#ec4899', label: '💗' },
  { name: 'Белый (Яркий)', value: '#ffffff', label: '⚪' },
  { name: 'Серый (Примечание)', value: '#9ca3af', label: '🩶' },
];

export const HIGHLIGHT_MARKERS = [
  { name: 'Желтый маркер', bg: '#fef08a', text: '#854d0e', label: '🟨' },
  { name: 'Зеленый маркер', bg: '#bbf7d0', text: '#166534', label: '🟩' },
  { name: 'Голубой маркер', bg: '#bfdbfe', text: '#1e40af', label: '🟦' },
  { name: 'Красный маркер', bg: '#fecaca', text: '#991b1b', label: '🟥' },
  { name: 'Фиолетовый маркер', bg: '#e9d5ff', text: '#6b21a8', label: '🟪' },
];

export interface TextFormattingContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  targetElement: HTMLElement | null;
  onApplyFormat: (formattedText: string) => void;
}

/**
 * Strips HTML tags from text selection to clear formatting.
 */
export function stripHtmlFormatting(str: string): string {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Applies formatting wrapper to target element (input, textarea, or contentEditable).
 */
export function applyFormattingToTarget(
  target: HTMLElement | null,
  formatType: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'color' | 'highlight' | 'heading' | 'clear',
  optionValue?: string | { bg: string; text: string }
): string | null {
  if (!target) return null;

  // Handle contentEditable elements (WYSIWYG Live Mode)
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true' || target.closest('[contenteditable="true"]')) {
    const editableTarget = target.isContentEditable ? target : (target.closest('[contenteditable="true"]') as HTMLElement) || target;
    editableTarget.focus();
    const selection = window.getSelection();

    switch (formatType) {
      case 'bold':
        document.execCommand('bold');
        break;
      case 'italic':
        document.execCommand('italic');
        break;
      case 'underline':
        document.execCommand('underline');
        break;
      case 'strikethrough':
        document.execCommand('strikeThrough');
        break;
      case 'heading':
        document.execCommand('formatBlock', false, 'h3');
        break;
      case 'color':
        if (typeof optionValue === 'string') {
          document.execCommand('foreColor', false, optionValue);
        }
        break;
      case 'highlight':
        if (optionValue && typeof optionValue === 'object') {
          if (selection && selection.toString()) {
            try {
              const range = selection.getRangeAt(0);
              const mark = document.createElement('mark');
              mark.style.backgroundColor = optionValue.bg;
              mark.style.color = optionValue.text;
              mark.style.padding = '0 4px';
              mark.style.borderRadius = '4px';
              mark.style.fontWeight = '600';
              range.surroundContents(mark);
            } catch (e) {
              document.execCommand('hiliteColor', false, optionValue.bg);
            }
          }
        }
        break;
      case 'clear':
        document.execCommand('removeFormat');
        break;
    }

    const event = new Event('input', { bubbles: true });
    editableTarget.dispatchEvent(event);
    return editableTarget.innerHTML;
  }

  // Handle standard HTMLTextAreaElement or HTMLInputElement
  const inputTarget = target as HTMLTextAreaElement | HTMLInputElement;
  const start = inputTarget.selectionStart ?? 0;
  const end = inputTarget.selectionEnd ?? 0;
  const fullText = inputTarget.value || '';
  const selectedText = fullText.substring(start, end);

  const fallbackText = selectedText || 'текст';
  let formatted = fallbackText;

  switch (formatType) {
    case 'bold':
      formatted = `<b>${fallbackText}</b>`;
      break;
    case 'italic':
      formatted = `<i>${fallbackText}</i>`;
      break;
    case 'underline':
      formatted = `<u>${fallbackText}</u>`;
      break;
    case 'strikethrough':
      formatted = `<s>${fallbackText}</s>`;
      break;
    case 'heading':
      formatted = `<h3>${fallbackText}</h3>`;
      break;
    case 'color':
      if (typeof optionValue === 'string') {
        formatted = `<span style="color:${optionValue}">${fallbackText}</span>`;
      }
      break;
    case 'highlight':
      if (optionValue && typeof optionValue === 'object') {
        formatted = `<mark style="background:${optionValue.bg};color:${optionValue.text};padding:0 4px;border-radius:4px">${fallbackText}</mark>`;
      }
      break;
    case 'clear':
      formatted = stripHtmlFormatting(selectedText);
      break;
    default:
      return null;
  }

  const newText = fullText.substring(0, start) + formatted + fullText.substring(end);
  
  inputTarget.value = newText;
  const event = new Event('input', { bubbles: true });
  inputTarget.dispatchEvent(event);

  setTimeout(() => {
    try {
      inputTarget.focus();
      inputTarget.setSelectionRange(start, start + formatted.length);
    } catch (e) {}
  }, 10);

  return newText;
}

/**
 * Context menu popping up on Right-Click (contextmenu) over text inputs.
 */
export const TextFormattingContextMenu: React.FC<TextFormattingContextMenuProps> = ({
  x,
  y,
  onClose,
  targetElement,
  onApplyFormat,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMarkerPicker, setShowMarkerPicker] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust menu position so it doesn't overflow screen boundaries
  const adjustedX = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 280);
  const adjustedY = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 260);

  const handleFormat = (
    type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'color' | 'highlight' | 'heading' | 'clear',
    val?: any
  ) => {
    if (targetElement) {
      const res = applyFormattingToTarget(targetElement, type, val);
      if (res !== null) {
        onApplyFormat(res);
      }
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-[99999] bg-[var(--color-surface-opaque)] border border-[var(--color-border)] rounded-xl shadow-2xl p-2.5 w-64 text-xs font-sans animate-fade-in select-none text-[var(--color-text-base)] backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 px-1 flex justify-between items-center border-b border-[var(--color-border-subtle)] pb-1">
        <span>🎨 Редактор форматирования</span>
        <button onClick={onClose} className="hover:text-red-400 font-bold text-sm leading-none">&times;</button>
      </div>

      {/* Main Formatting Row */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        <button
          onClick={() => handleFormat('bold')}
          className="p-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] font-bold text-center transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Жирный (<b>)"
        >
          <b>B</b>
        </button>
        <button
          onClick={() => handleFormat('italic')}
          className="p-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] italic text-center transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Курсив (<i>)"
        >
          <i>I</i>
        </button>
        <button
          onClick={() => handleFormat('underline')}
          className="p-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] underline text-center transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Подчеркивание (<u>)"
        >
          <u>U</u>
        </button>
        <button
          onClick={() => handleFormat('strikethrough')}
          className="p-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] line-through text-center transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Зачеркнутый (<s>)"
        >
          <s>S</s>
        </button>
      </div>

      {/* Action Pickers */}
      <div className="space-y-1">
        <button
          onClick={() => { setShowColorPicker(!showColorPicker); setShowMarkerPicker(false); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] transition-colors border border-[var(--color-border-subtle)]"
        >
          <span className="flex items-center gap-1.5 font-medium">🎨 Цвет текста</span>
          <span className="text-[10px] opacity-60">{showColorPicker ? '▲' : '▼'}</span>
        </button>

        {showColorPicker && (
          <div className="grid grid-cols-4 gap-1 p-1 bg-[var(--color-surface-well)] rounded-lg border border-[var(--color-border-subtle)] my-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => handleFormat('color', c.value)}
                className="p-1.5 rounded flex items-center justify-center hover:bg-black/30 transition-transform active:scale-95"
                title={c.name}
              >
                <span className="text-base leading-none">{c.label}</span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => { setShowMarkerPicker(!showMarkerPicker); setShowColorPicker(false); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] transition-colors border border-[var(--color-border-subtle)]"
        >
          <span className="flex items-center gap-1.5 font-medium">🖍️ Цвет маркер-выделения</span>
          <span className="text-[10px] opacity-60">{showMarkerPicker ? '▲' : '▼'}</span>
        </button>

        {showMarkerPicker && (
          <div className="grid grid-cols-5 gap-1 p-1 bg-[var(--color-surface-well)] rounded-lg border border-[var(--color-border-subtle)] my-1">
            {HIGHLIGHT_MARKERS.map((m) => (
              <button
                key={m.name}
                onClick={() => handleFormat('highlight', { bg: m.bg, text: m.text })}
                className="p-1.5 rounded flex items-center justify-center hover:bg-black/30 transition-transform active:scale-95"
                title={m.name}
              >
                <span className="text-base leading-none">{m.label}</span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => handleFormat('heading')}
          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] font-bold transition-colors border border-[var(--color-border-subtle)]"
        >
          <span>Заголовок (H3)</span>
        </button>

        <button
          onClick={() => handleFormat('clear')}
          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors border border-red-500/20 mt-1"
        >
          <span>🧹 Очистить форматирование</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Inline Toolbar for Textareas (Notes, Item details, Spell details, etc.)
 */
export interface RichTextToolbarProps {
  targetRef: React.RefObject<HTMLElement | null>;
  onFormatApplied?: (newText: string) => void;
  showPreviewToggle?: boolean;
  isPreviewMode?: boolean;
  onTogglePreview?: () => void;
}

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  targetRef,
  onFormatApplied,
  showPreviewToggle = false,
  isPreviewMode = false,
  onTogglePreview,
}) => {
  const handleBtnClick = (
    type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'color' | 'highlight' | 'heading' | 'clear',
    val?: any
  ) => {
    if (targetRef.current) {
      const res = applyFormattingToTarget(targetRef.current, type, val);
      if (res !== null && onFormatApplied) {
        onFormatApplied(res);
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5 bg-[var(--color-surface-well)] p-1.5 rounded-lg border border-[var(--color-border-subtle)] mb-2 select-none">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => handleBtnClick('bold')}
          className="px-2.5 py-1 rounded bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-xs font-bold transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Жирный (<b>)"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          onClick={() => handleBtnClick('italic')}
          className="px-2.5 py-1 rounded bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-xs italic transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Курсив (<i>)"
        >
          <i>I</i>
        </button>
        <button
          type="button"
          onClick={() => handleBtnClick('underline')}
          className="px-2.5 py-1 rounded bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-xs underline transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Подчеркивание (<u>)"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          onClick={() => handleBtnClick('strikethrough')}
          className="px-2.5 py-1 rounded bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised-hover)] text-xs line-through transition-colors border border-[var(--color-border-subtle)]"
          data-tooltip="Зачеркнутый (<s>)"
        >
          <s>S</s>
        </button>

        {/* Text colors palette */}
        <div className="flex items-center gap-0.5 border-l border-r border-[var(--color-border-subtle)] px-1">
          {TEXT_COLORS.slice(0, 5).map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => handleBtnClick('color', c.value)}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:scale-110 active:scale-95 transition-transform"
              data-tooltip={c.name}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Highlights */}
        <div className="flex items-center gap-0.5 border-r border-[var(--color-border-subtle)] pr-1">
          {HIGHLIGHT_MARKERS.slice(0, 3).map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => handleBtnClick('highlight', { bg: m.bg, text: m.text })}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:scale-110 active:scale-95 transition-transform"
              data-tooltip={m.name}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => handleBtnClick('clear')}
          className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] transition-colors border border-red-500/20"
          data-tooltip="Очистить теги форматирования"
        >
          🧹 Сброс
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-subtle)] hidden sm:inline font-medium">
          💡 Выделите текст и нажмите <b>ПКМ</b> для меню
        </span>

        {showPreviewToggle && onTogglePreview && (
          <button
            type="button"
            onClick={onTogglePreview}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              isPreviewMode
                ? 'bg-[var(--color-accent-primary)] text-white shadow'
                : 'bg-[var(--color-surface-raised)] text-[var(--color-text-medium)] hover:text-white border border-[var(--color-border-subtle)]'
            }`}
          >
            {isPreviewMode ? '✏️ Редактор' : '👁️ Просмотр'}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Safely renders HTML formatted strings (b, i, u, s, mark, span style, font, br).
 */
export const FormattedText: React.FC<{ content: string; className?: string; placeholder?: string }> = ({
  content,
  className = '',
  placeholder = '',
}) => {
  if (!content) {
    return placeholder ? <span className="opacity-50 italic">{placeholder}</span> : null;
  }

  // Convert newlines to <br/>
  const formattedHtml = content.replace(/\n/g, '<br/>');

  return (
    <div
      className={`formatted-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
};

export interface RichTextDescriptionEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export const RichTextDescriptionEditor: React.FC<RichTextDescriptionEditorProps> = ({
  value,
  onChange,
  placeholder = 'Введите описание...',
  minHeight = '140px',
  className = '',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      if (editorRef.current.innerHTML !== (value || '')) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html);
    }
  }, [onChange]);

  return (
    <div className={`flex flex-col rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-background)] overflow-hidden ${className}`}>
      <RichTextToolbar
        targetRef={editorRef}
        onFormatApplied={(newContent) => {
          onChange(newContent);
        }}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        style={{ minHeight }}
        className="w-full p-3 text-sm leading-relaxed text-[var(--color-text-base)] outline-none overflow-y-auto max-h-[300px] focus:bg-[var(--color-surface-well)]/20 transition-all font-sans"
        data-placeholder={placeholder}
      />
    </div>
  );
};
