// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSaveEffect, serializeForCache, RawCharacterStorageData } from '../persistence';
import { charactersReducer } from '../appReducer';
import { makeTestCharacter } from '../testFixtures';
import { saveCharacterApi } from '../../utils/storage';
import type { CharactersState, CharacterEntry } from '../appReducer';

// Мокаем saveCharacterApi
vi.mock('../../utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storage')>();
  return {
    ...actual,
    saveCharacterApi: vi.fn(async () => {}),
  };
});

describe('useSaveEffect debounce & LWW безопасность', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('6. 2 изменения characters за 500ms -> 1 save-цикл; beforeunload -> flush; visibilitychange hidden -> flush', () => {
    const charV0 = makeTestCharacter({ name: 'Версия 0' });
    const rawV0: RawCharacterStorageData = {
      character: charV0,
      log: [],
      history: { past: [], future: [] },
      imageCache: [],
      lastModified: 1000,
    };

    // Предварительно заполненные кэши (персонаж уже был сохранён ранее)
    const lastSerializedRef = { current: { c1: serializeForCache(rawV0) } };
    const lastPresentRef = { current: { c1: charV0 } };
    const addNotification = vi.fn();

    const charV1 = makeTestCharacter({ name: 'Версия 1' });
    const entryV1: CharacterEntry = {
      history: { past: [charV0], present: charV1, future: [] },
      log: [],
      imageCache: new Map(),
    };

    const charV2 = makeTestCharacter({ name: 'Версия 2' });
    const entryV2: CharacterEntry = {
      history: { past: [charV0, charV1], present: charV2, future: [] },
      log: [],
      imageCache: new Map(),
    };

    const initialCharacters: CharactersState = {
      c1: {
        history: { past: [], present: charV0, future: [] },
        log: [],
        imageCache: new Map(),
      },
    };

    // Монтируем хук с начальным состоянием
    const { rerender } = renderHook(
      ({ characters }: { characters: CharactersState }) =>
        useSaveEffect({
          characters,
          isLoading: false,
          addNotification,
          lastSerializedRef,
          lastPresentRef,
        }),
      { initialProps: { characters: initialCharacters } }
    );

    // Первое изменение (t = 0)
    act(() => {
      rerender({ characters: { c1: entryV1 } });
    });

    // Прошло 200мс (< 500мс) — сохранения ещё нет
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(saveCharacterApi).not.toHaveBeenCalled();

    // Второе изменение (t = 200мс)
    act(() => {
      rerender({ characters: { c1: entryV2 } });
    });

    // Прошло ещё 200мс (t = 400мс) — сохранения всё ещё нет
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(saveCharacterApi).not.toHaveBeenCalled();

    // Прошло ещё 300мс (t = 700мс, т.е. 500мс после второго изменения)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Ровно 1 вызов saveCharacterApi с последней версией V2!
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);
    const firstCallArgs = vi.mocked(saveCharacterApi).mock.calls[0];
    expect(firstCallArgs?.[0]).toBe('c1');
    expect((firstCallArgs?.[1] as RawCharacterStorageData)?.character?.name).toBe('Версия 2');

    // --- Проверка триггера: beforeunload -> немедленный flush ---
    const charV3 = makeTestCharacter({ name: 'Версия 3' });
    const entryV3: CharacterEntry = {
      history: { past: [], present: charV3, future: [] },
      log: [],
      imageCache: new Map(),
    };

    act(() => {
      rerender({ characters: { c1: entryV3 } });
    });
    // Таймер не истёк
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);

    // Триггерим beforeunload
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    // Синхронный flush выполнил второй сейв
    expect(saveCharacterApi).toHaveBeenCalledTimes(2);
    const secondCallArgs = vi.mocked(saveCharacterApi).mock.calls[1];
    expect(secondCallArgs?.[0]).toBe('c1');
    expect((secondCallArgs?.[1] as RawCharacterStorageData)?.character?.name).toBe('Версия 3');

    // Таймер после beforeunload не должен повторно вызывать сохранение
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(saveCharacterApi).toHaveBeenCalledTimes(2);

    // --- Проверка триггера: visibilitychange hidden -> немедленный flush ---
    const charV4 = makeTestCharacter({ name: 'Версия 4' });
    const entryV4: CharacterEntry = {
      history: { past: [], present: charV4, future: [] },
      log: [],
      imageCache: new Map(),
    };

    act(() => {
      rerender({ characters: { c1: entryV4 } });
    });
    expect(saveCharacterApi).toHaveBeenCalledTimes(2);

    // Эмулируем переключение вкладки (hidden)
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Синхронный flush выполнил третий сейв
    expect(saveCharacterApi).toHaveBeenCalledTimes(3);
    const thirdCallArgs = vi.mocked(saveCharacterApi).mock.calls[2];
    expect(thirdCallArgs?.[0]).toBe('c1');
    expect((thirdCallArgs?.[1] as RawCharacterStorageData)?.character?.name).toBe('Версия 4');

    // Восстанавливаем visibilityState
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  it('7. LWW: lastModified ставится в момент dispatch и НЕ меняется из-за задержки save', () => {
    // Устанавливаем базовое время
    const DISPATCH_TIMESTAMP = 1_700_000_000_000;
    vi.setSystemTime(DISPATCH_TIMESTAMP);

    // 1. Создаем начальное состояние через charactersReducer
    const initialChar = makeTestCharacter({ name: 'Воин', lastModified: DISPATCH_TIMESTAMP });
    let state: CharactersState = charactersReducer({}, {
      type: 'ADD_CHARACTER',
      payload: { id: 'c1', character: initialChar }
    });

    // 2. Сдвигаем время вперед на 10 секунд и выполняем мутацию персонажа
    const MUTATION_TIMESTAMP = DISPATCH_TIMESTAMP + 10_000;
    vi.setSystemTime(MUTATION_TIMESTAMP);

    state = charactersReducer(state, {
      type: 'DISPATCH_CHARACTER_ACTION',
      payload: {
        id: 'c1',
        action: {
          type: 'SET_FIELD',
          payload: { field: 'name', value: 'Архимаг' }
        }
      }
    });

    // В момент dispatch в редьюсере зафиксирован точный MUTATION_TIMESTAMP
    const updatedPresent = state.c1?.history.present;
    expect(updatedPresent?.lastModified).toBe(MUTATION_TIMESTAMP);

    // 3. Подготавливаем useSaveEffect
    const lastSerializedRef = { current: {} };
    const lastPresentRef = { current: { c1: initialChar } };
    const addNotification = vi.fn();

    renderHook(() =>
      useSaveEffect({
        characters: state,
        isLoading: false,
        addNotification,
        lastSerializedRef,
        lastPresentRef,
      })
    );

    // 4. Сдвигаем время на время задержки debounce (500мс)
    const SAVE_EXECUTION_TIME = MUTATION_TIMESTAMP + 500;
    vi.setSystemTime(SAVE_EXECUTION_TIME);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Сохранение выполнилось
    expect(saveCharacterApi).toHaveBeenCalledTimes(1);

    const callData = vi.mocked(saveCharacterApi).mock.calls[0]?.[1] as RawCharacterStorageData;
    expect(callData).toBeDefined();

    // КРИТИЧЕСКИЙ LWW ASSERTION:
    // lastModified, переданный в saveCharacterApi, равен MUTATION_TIMESTAMP (времени dispatch),
    // а НЕ SAVE_EXECUTION_TIME (времени выполнения debounce таймера)!
    expect(callData.lastModified).toBe(MUTATION_TIMESTAMP);
    expect(callData.character?.lastModified).toBe(MUTATION_TIMESTAMP);
    expect(callData.lastModified).not.toBe(SAVE_EXECUTION_TIME);
  });
});
