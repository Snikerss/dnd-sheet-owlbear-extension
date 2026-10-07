/**
 * Строго типизированный интерфейс функции с debounce.
 */
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel: () => void;
  flush: () => void;
  isPending: () => boolean;
}

/**
 * Оборачивает функцию `fn` в debounced-обёртку с задержкой `ms`.
 * Предоставляет методы:
 * - `.cancel()`: отменяет запланированный вызов и очищает аргументы;
 * - `.flush()`: синхронно вызывает `fn` с последними аргументами, если вызов ожидается; сбрасывает pending;
 * - `.isPending()`: возвращает true, если есть запланированный вызов.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  ms: number
): DebouncedFunction<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const debounced = (...args: TArgs): void => {
    lastArgs = args;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      const callArgs = lastArgs;
      lastArgs = null;
      if (callArgs !== null) {
        fn(...callArgs);
      }
    }, ms);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  debounced.flush = (): void => {
    if (timer !== null || lastArgs !== null) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const callArgs = lastArgs;
      lastArgs = null;
      if (callArgs !== null) {
        fn(...callArgs);
      }
    }
  };

  debounced.isPending = (): boolean => {
    return timer !== null || lastArgs !== null;
  };

  return debounced;
}
