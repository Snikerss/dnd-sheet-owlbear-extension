// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { EditableField } from '../CharacterHeader';

describe('EditableField коалесцирование ввода', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('5. 10 onChange -> 1 вызов onChange после 300ms; blur -> немедленный flush', () => {
    const onChange = vi.fn();

    const { container } = render(
      <EditableField
        value="Начальное"
        onChange={onChange}
        label="Имя персонажа"
        placeholder="Введите имя"
      />
    );

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Начальное');

    // Симулируем 10 быстрых изменений значения
    for (let i = 1; i <= 10; i++) {
      fireEvent.change(input, { target: { value: `Имя ${i}` } });
      // Значение в DOM input отображается немедленно
      expect(input.value).toBe(`Имя ${i}`);
      vi.advanceTimersByTime(20);
    }

    // До истечения 300ms с момента последнего ввода onChange не вызывается
    expect(onChange).not.toHaveBeenCalled();

    // Проматываем оставшееся время до 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Ровно 1 вызов onChange с последним значением
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Имя 10');

    // Следующий ввод + blur: немедленный flush
    fireEvent.change(input, { target: { value: 'Имя финальное' } });
    expect(onChange).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.blur(input);
    });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('Имя финальное');

    // Повторный blur — no-op
    act(() => {
      fireEvent.blur(input);
    });
    expect(onChange).toHaveBeenCalledTimes(2);

    // Таймер не вызывает повторно
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('unmount с pending значением: синхронно сохраняет значение', () => {
    const onChange = vi.fn();

    const { container, unmount } = render(
      <EditableField
        value="Старое"
        onChange={onChange}
        label="Класс"
        placeholder="Класс"
      />
    );

    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Паладин' } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Паладин');
  });
});
