// @vitest-environment jsdom
import React, { useState, useCallback, useRef } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { CharacterProvider, useCharacterDispatch, useCharacterState } from '../../context/CharacterContext';
import { makeTestCharacter } from '../../state/testFixtures';
import type { Character, CharacterAction } from '../../types';

describe('CharacterContext stability', () => {
  afterEach(() => {
    cleanup();
  });

  it('идентичность dispatch стабильна между рендерами провайдера, счётчик рендеров dispatch-only потребителя не растёт', () => {
    let dispatchConsumerRenderCount = 0;
    let stateConsumerRenderCount = 0;
    let lastReceivedDispatch: React.Dispatch<CharacterAction> | null = null;

    const DispatchOnlyConsumer = React.memo(() => {
      const dispatch = useCharacterDispatch();
      lastReceivedDispatch = dispatch;
      dispatchConsumerRenderCount++;
      return <div data-testid="dispatch-consumer">dispatch ready</div>;
    });

    const StateConsumer = () => {
      const character = useCharacterState();
      stateConsumerRenderCount++;
      return <div data-testid="state-consumer">{character.name}</div>;
    };

    let triggerParentUpdate: (newChar: Character) => void = () => {};

    const TestHarness = () => {
      const [char, setChar] = useState(() => makeTestCharacter({ name: 'Версия 1' }));
      const stableDispatch = useCallback((_action: CharacterAction) => {}, []);

      triggerParentUpdate = (newChar: Character) => setChar(newChar);

      return (
        <CharacterProvider character={char} characterId="char-1" dispatch={stableDispatch}>
          <DispatchOnlyConsumer />
          <StateConsumer />
        </CharacterProvider>
      );
    };

    render(<TestHarness />);

    expect(dispatchConsumerRenderCount).toBe(1);
    expect(stateConsumerRenderCount).toBe(1);
    expect(screen.getByTestId('state-consumer').textContent).toBe('Версия 1');
    const firstDispatchRef = lastReceivedDispatch;

    // Обновляем character: новый объект с новым именем
    act(() => {
      triggerParentUpdate(makeTestCharacter({ name: 'Версия 2' }));
    });

    // Потребитель состояния обновился
    expect(stateConsumerRenderCount).toBe(2);
    expect(screen.getByTestId('state-consumer').textContent).toBe('Версия 2');

    // Ссылка на dispatch осталась идентичной
    expect(lastReceivedDispatch).toBe(firstDispatchRef);

    // Счётчик рендеров dispatch-only потребителя НЕ вырос
    expect(dispatchConsumerRenderCount).toBe(1);
  });

  it('паттерн ref-mirror обеспечивает стабильность handleUpdateCharacter при изменении состояния characters', () => {
    let dispatchRenderCount = 0;
    const dispatchCalls: CharacterAction[] = [];

    const DispatchConsumer = React.memo(() => {
      const dispatch = useCharacterDispatch();
      dispatchRenderCount++;
      return (
        <button
          onClick={() => dispatch({ type: 'SET_FIELD', payload: { field: 'name', value: 'Новое имя' } })}
        >
          Dispatch
        </button>
      );
    });

    let mutateCharactersState: () => void = () => {};

    const AppLikeHarness = () => {
      const [characters, setCharacters] = useState<Record<string, { history: { present: Character } }>>({
        'char-1': { history: { present: makeTestCharacter({ name: 'Персонаж 1' }) } }
      });
      const charactersRef = useRef(characters);
      charactersRef.current = characters;

      const activeCharacterId = 'char-1';
      const activeCharacter = characters[activeCharacterId]?.history.present;

      const handleUpdateCharacter = useCallback((action: CharacterAction) => {
        const activeCharState = charactersRef.current[activeCharacterId];
        if (activeCharState) {
          dispatchCalls.push(action);
        }
      }, [activeCharacterId]);

      mutateCharactersState = () => {
        setCharacters({
          'char-1': { history: { present: makeTestCharacter({ name: 'Персонаж 1 (изменен)' }) } }
        });
      };

      if (!activeCharacter) return null;

      return (
        <CharacterProvider character={activeCharacter} characterId={activeCharacterId} dispatch={handleUpdateCharacter}>
          <DispatchConsumer />
        </CharacterProvider>
      );
    };

    render(<AppLikeHarness />);
    expect(dispatchRenderCount).toBe(1);

    // Моделируем мутацию состояния characters (как в useCharacterManager)
    act(() => {
      mutateCharactersState();
    });

    // DispatchConsumer не должен был перерисоваться
    expect(dispatchRenderCount).toBe(1);
  });
});
