// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { NotesSection } from '../NotesSection';
import { CharacterProvider } from '../../context/CharacterContext';
import { makeTestCharacter } from '../../state/testFixtures';
import type { Character, CharacterAction } from '../../types';

describe('NotesSection коалесцирование ввода', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('1. 20 keystrokes подряд: ровно 1 dispatch UPDATE_NOTE после 250ms с последним innerHTML', () => {
    const dispatch = vi.fn();
    const character = makeTestCharacter({
      notes: [{ id: 'n1', title: 'Заметка 1', content: '' }],
      activeNoteId: 'n1',
    });

    const { container } = render(
      <CharacterProvider character={character} characterId="char-1" dispatch={dispatch}>
        <NotesSection />
      </CharacterProvider>
    );

    const editor = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    expect(editor).not.toBeNull();

    // Симулируем 20 нажатий клавиш подряд с интервалом 10мс (суммарно 200мс < 250мс)
    for (let i = 1; i <= 20; i++) {
      editor.innerHTML = `<p>Текст ${i}</p>`;
      fireEvent.input(editor);
      vi.advanceTimersByTime(10);
    }

    // До истечения 250мс с момента последнего ввода dispatch не вызывается
    const updateDispatchesBefore = dispatch.mock.calls.filter(
      call => (call[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    expect(updateDispatchesBefore.length).toBe(0);

    // Дожидаемся полного таймаута debounce (250мс)
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const updateDispatchesAfter = dispatch.mock.calls.filter(
      call => (call[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    // Ровно 1 dispatch на 20 нажатий
    expect(updateDispatchesAfter.length).toBe(1);
    expect(updateDispatchesAfter[0]?.[0]).toEqual({
      type: 'UPDATE_NOTE',
      payload: {
        id: 'n1',
        updates: { content: '<p>Текст 20</p>' },
      },
    });
  });

  it('2. blur -> flush: синхронный dispatch с последним текстом, повторный blur — no-op', () => {
    const dispatch = vi.fn();
    const character = makeTestCharacter({
      notes: [{ id: 'n1', title: 'Заметка 1', content: '' }],
      activeNoteId: 'n1',
    });

    const { container } = render(
      <CharacterProvider character={character} characterId="char-1" dispatch={dispatch}>
        <NotesSection />
      </CharacterProvider>
    );

    const editor = container.querySelector('[contenteditable="true"]') as HTMLDivElement;

    // Вводим текст
    editor.innerHTML = '<p>Важная мысль</p>';
    fireEvent.input(editor);

    expect(
      dispatch.mock.calls.filter(c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE').length
    ).toBe(0);

    // Первый blur — немедленный flush
    act(() => {
      fireEvent.blur(editor);
    });

    const callsAfterBlur = dispatch.mock.calls.filter(
      c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    expect(callsAfterBlur.length).toBe(1);
    expect(callsAfterBlur[0]?.[0]).toEqual({
      type: 'UPDATE_NOTE',
      payload: {
        id: 'n1',
        updates: { content: '<p>Важная мысль</p>' },
      },
    });

    // Повторный blur — no-op
    act(() => {
      fireEvent.blur(editor);
    });

    const callsAfterSecondBlur = dispatch.mock.calls.filter(
      c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    expect(callsAfterSecondBlur.length).toBe(1);

    // Таймер не вызывает повторно
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      dispatch.mock.calls.filter(c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE').length
    ).toBe(1);
  });

  it('3. unmount с pending: flush случается, текст не потерян', () => {
    const dispatch = vi.fn();
    const character = makeTestCharacter({
      notes: [{ id: 'n1', title: 'Заметка 1', content: '' }],
      activeNoteId: 'n1',
    });

    const { container, unmount } = render(
      <CharacterProvider character={character} characterId="char-1" dispatch={dispatch}>
        <NotesSection />
      </CharacterProvider>
    );

    const editor = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    editor.innerHTML = '<p>Текст перед закрытием</p>';
    fireEvent.input(editor);

    expect(
      dispatch.mock.calls.filter(c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE').length
    ).toBe(0);

    // Размонтируем компонент (например, пользователь переключил вкладку)
    act(() => {
      unmount();
    });

    const callsAfterUnmount = dispatch.mock.calls.filter(
      c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    expect(callsAfterUnmount.length).toBe(1);
    expect(callsAfterUnmount[0]?.[0]).toEqual({
      type: 'UPDATE_NOTE',
      payload: {
        id: 'n1',
        updates: { content: '<p>Текст перед закрытием</p>' },
      },
    });
  });

  it('4. смена characterId с pending: pending flush-ится на СТАРОГО персонажа (через bound dispatch)', () => {
    const dispatchChar1 = vi.fn();
    const dispatchChar2 = vi.fn();

    const char1: Character = makeTestCharacter({
      notes: [{ id: 'n-char1', title: 'Заметка 1', content: '' }],
      activeNoteId: 'n-char1',
    });
    const char2: Character = makeTestCharacter({
      notes: [{ id: 'n-char2', title: 'Заметка 2', content: '' }],
      activeNoteId: 'n-char2',
    });

    // Компонент переключения персонажей
    const Harness: React.FC<{ activeId: string }> = ({ activeId }) => {
      const isChar1 = activeId === 'char-1';
      return (
        <CharacterProvider
          character={isChar1 ? char1 : char2}
          characterId={activeId}
          dispatch={isChar1 ? dispatchChar1 : dispatchChar2}
        >
          <NotesSection />
        </CharacterProvider>
      );
    };

    const { container, rerender } = render(<Harness activeId="char-1" />);

    const editor = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    editor.innerHTML = '<p>Секретные записи персонажа 1</p>';
    fireEvent.input(editor);

    // До таймаута переключаем персонажа на char-2
    act(() => {
      rerender(<Harness activeId="char-2" />);
    });

    // dispatch для char-1 ДОЛЖЕН получить UPDATE_NOTE старого персонажа
    const char1Calls = dispatchChar1.mock.calls.filter(
      c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    expect(char1Calls.length).toBe(1);
    expect(char1Calls[0]?.[0]).toEqual({
      type: 'UPDATE_NOTE',
      payload: {
        id: 'n-char1',
        updates: { content: '<p>Секретные записи персонажа 1</p>' },
      },
    });

    // dispatch для char-2 НЕ ДОЛЖЕН получить этот ввод
    const char2Calls = dispatchChar2.mock.calls.filter(
      c => (c[0] as CharacterAction)?.type === 'UPDATE_NOTE'
    );
    expect(char2Calls.length).toBe(0);
  });
});
