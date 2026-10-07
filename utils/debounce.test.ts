import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('вызывает функцию по истечении указанного таймаута', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced('first');
    expect(fn).not.toHaveBeenCalled();
    expect(debounced.isPending()).toBe(true);

    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');
    expect(debounced.isPending()).toBe(false);
  });

  it('коалесцирует множественные вызовы и вызывает fn 1 раз с последним аргументом', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced(1);
    vi.advanceTimersByTime(100);
    debounced(2);
    vi.advanceTimersByTime(100);
    debounced(3);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel() отменяет запланированный вызов и сбрасывает pending', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);

    debounced('hello');
    expect(debounced.isPending()).toBe(true);

    debounced.cancel();
    expect(debounced.isPending()).toBe(false);

    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() синхронно вызывает fn с последним аргументом и сбрасывает pending', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);

    debounced('pending-value');
    expect(fn).not.toHaveBeenCalled();

    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('pending-value');
    expect(debounced.isPending()).toBe(false);

    // Таймер после flush не должен вызывать fn повторно
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() без pending вызова является no-op', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);

    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
    expect(debounced.isPending()).toBe(false);
  });

  it('повторный flush() после первого flush() является no-op', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);

    debounced('arg');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);

    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('корректно работает при новом вызове после flush()', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('round-1');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('round-1');

    debounced('round-2');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('round-2');
  });
});
